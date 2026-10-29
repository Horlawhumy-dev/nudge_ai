# NudgeAI Backend

FastAPI backend for **NudgeAI** — a voice-first habit and task companion.

See `../docs/BACKEND_PLAN.md` for the design, `../docs/MOBILE_INTEGRATION.md` for how the mobile app
uses the API, and `../docs/NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.docx` for the product spec.

## Status

All three planned phases are implemented. `make check` runs `ruff`, `ruff format --check`, strict `mypy`
and the full suite against a real PostgreSQL 16 + pgvector database (**341 passed, 1 skipped**).

- **API:** 68 paths under `/api/v1` (interactive docs at `/docs`): auth with emailed codes and rotating
  refresh tokens, profile and avatar, habits, tasks (recurring, soft delete and restore), preferences,
  plans and limits, notifications and push devices, chat (server-sent events), conversations, proposals,
  speech, photo extraction, traces, analytics and the weekly report, feedback, and a data export.
- **Nudge engine:** deterministic rules (quiet hours, cooldowns, snoozes, stacking, streak protection,
  digest) decide first; the model only writes the sentence. `make worker` runs it, plus recurring-task
  rolling and the Monday weekly report.
- **Assistant:** a tiered model router with budgets and a semantic cache, and tool calls that only ever
  become proposals until the user confirms (`task_create`, `task_update`, `task_complete`,
  `habit_create`, `habit_complete`, memory tools; reads such as `tasks_list` run directly).
- **Database:** migrations `0001` to `0011`, 21 tables, `alembic check` reports no drift.
- **Skipped in the suite:** one real-embedder recall test that needs `META_API_KEY` and an embedding model.

### Running without an API key

The model client falls back to a clearly-logged `FakeClient` when `META_API_KEY` is empty, so the whole app
boots and the test suite runs with no network calls and no spend. Set the keys in `.env` to use the real
endpoints; set `FORCE_FAKE_MODELS=true` to override a key that is present.

### Not done or not verified

- Chat streaming: the fast model (Baseten) streams word by word, but waiting for the first word dominates (1.3 to 2.3 s, with the occasional multi-second stall), so streaming moves the first sentence only ~0.05 to 0.3 s earlier. The Meta Model API sends its reply in one or two large chunks.
- Voice with a real Meta key: the route (`POST /v1/asr/transcribe`) and WAV format follow Meta's docs, but the
  multipart field names and reply field haven't been checked against a live key (`app/ai/speech.py`).
- Billing is a stub (`BILLING_STUB_ENABLED`); turn it off in production.
- No embedding model from Meta yet, so memory search uses an offline stand-in.
- No model-eval suite; `scripts/probe_meta.py` is the manual live probe.

## Setup

### 1. Bootstrap the local database (once, needs your sudo password)

```bash
sudo -u postgres psql -c "CREATE ROLE haroffcode LOGIN CREATEDB;"
sudo -u postgres createdb -O haroffcode nudgeai
sudo -u postgres psql -d nudgeai -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Only **PostgreSQL 16** is running on this machine and only PG16 has pgvector.
Do not create a PG18 cluster.

> The `CREATE EXTENSION` must run as the `postgres` superuser. pgvector is not a
> *trusted* extension, so owning the database is not enough — you will get
> `permission denied to create extension "vector"` if you run it as `haroffcode`.
> `alembic upgrade head` also issues `CREATE EXTENSION IF NOT EXISTS vector`, which
> is a harmless no-op once a superuser has installed it.

### 2. Environment

```bash
cp .env.example .env
# add META_API_KEY and BASETEN_API_KEY to .env
# set JWT_SECRET to a real random value
```

Without an embedding model configured the app falls back to `StaticEmbedder`, which is a
token hash. It keeps the plumbing exercised but has no semantic recall.

Other keys (all optional): `RESEND_API_KEY` and an `EMAIL_FROM` on a domain verified in Resend (the shared
`onboarding@resend.dev` sender only reaches the Resend account owner), `CLOUDINARY_CLOUD_NAME` /
`CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` (avatars; local disk when empty), `EXPO_ACCESS_TOKEN` (push),
and the model ids `MODEL_FAST` / `MODEL_SMART` / `MODEL_DEEP` / `MUSE_VOICE_MODEL`. See `.env.example`.

### 3. Install, migrate, run

```bash
make install            # virtualenv + dependencies
make db-migrate         # apply migrations 0001 to 0011
make run                # API on http://127.0.0.1:8079 (docs at /docs)
make worker             # the nudge worker, in a second terminal
```

`make run HOST=0.0.0.0` makes the API reachable from a phone on your network. `make help` lists every target.

## Tests

Tests are integration tests against a real PostgreSQL + pgvector database —
HNSW, the generated `tsvector` column, and cosine distance are all part of what
is being verified, so mocking them would test nothing.

```bash
sudo -u postgres createdb -O haroffcode nudgeai_test
sudo -u postgres psql -d nudgeai_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
make test               # uses the nudgeai_test database above
make check              # lint + format check + mypy + tests (changes nothing)
```

Without `TEST_DATABASE_URL` the database tests skip and the pure-logic tests
(streak algebra, embedder invariants) still run.

Paraphrased-recall is skipped unless `META_API_KEY` is set, because
`StaticEmbedder` cannot match a paraphrase by construction.

## Layout

```
app/
  core/      config, security (argon2id + JWT), Prometheus collectors
  db/        SQLAlchemy models, async session
  schemas/   Pydantic v2 request/response
  services/  domain logic, no HTTP types (core, auth, plans, insights, reports, traces, media, ...)
  api/v1/    HTTP routers
  infra/     redis, embeddings, mailer (Resend), push (Expo), cloudinary
  models/    registry, router, budgets, Meta and Baseten clients
  tools/     tool protocol, memory/calendar/planner tools, the dispatch loop
  ai/        prompts, proposal confirmation gate, speech, tone
  engine/    nudge rules (pure), candidate loading, scheduler, worker
alembic/     migrations
scripts/     probe_meta.py (manual live check)
tests/       pytest, against real PostgreSQL
```

## Routing and tool calling

### The router never spends a model call to decide

`app/models/router.py:classify` is a pure function over signals the caller
already has — no I/O, no model, no clock. Every decision carries the `reason`
that produced it, and `GET /api/v1/routing/preview` returns that reason without
spending anything, so the routing policy is inspectable.

| Signal | Tier | Model |
|---|---|---|
| multimodal input, context > 200k, or planning across ≥2 tools | `deep` | Muse Spark (higher reasoning effort) |
| a single tool call, or multi-step reasoning | `smart` | Muse Spark |
| everything else | `fast` | `meta-models/muse-spark-open-1026` (Baseten) |

Escalation re-runs a turn one tier up on a `[[low_confidence]]` marker or two
consecutive tool errors (one is usually the tool's fault). The budget guard pins
a turn to `fast` and sets `degraded: true` at the daily ceiling rather than
erroring. The response cache sits in front for turns that cannot want a tool
call.

### The confirmation gate

Every tool that changes data (`memory_remember`, `memory_forget`, `task_create`, `task_update`,
`task_complete`, `habit_create`, `habit_complete`) is marked `mutating`, so the executor never calls its
`run()`. It writes a `tool_proposals` row instead and the
response carries `proposals[]`; the write happens only at
`POST /api/v1/proposals/{id}/confirm`. Confirmation is owner-checked and
single-use (a second confirm is a 409), and pending proposals older than 24h are
swept to `expired` at startup.

`calendar_free_busy` is read-only by construction and fails closed unless
`CALENDAR_ENABLED=true`.

### Metrics

`/metrics` adds per-model calls, tokens, cost, and latency, plus route decisions,
escalations, budget rejections, response-cache hit rate, tool calls, proposal
outcomes, and chat message counts. Cost is computed from the published
per-million-token rates in `app/models/registry.py`.

## Notes

- Vectors live in **pgvector** (`memories.embedding vector(1024)`), not RedisVL.
  The local Redis is 7.0.15 with no modules loaded, so `FT.CREATE` and HNSW via
  Redis are unavailable. 1024 is both Matryoshka-native and under pgvector's
  2000-dimension ANN index cap.
- Every vector query must filter on `user_id`. The index is not tenant-aware.
- The semantic cache is `cache_responses` + a cosine threshold, not RedisVL's
  `SemanticCache`.
- Chat history is capped at `CHAT_HISTORY_MESSAGES` (20) plus three retrieved
  memories. A 1M context window is not a licence to fill it.
- The test suite forces the offline fake via an autouse fixture, so a stray
  `META_API_KEY` in your shell cannot make the suite spend money.
-
- **Live Meta validation:** not recorded yet. Probe with your keys in `.env` (never in the suite):

```bash
.venv/bin/python scripts/probe_meta.py
```

## Voice, photos and media

- **Live voice** (`WS /speech/live`): the phone streams its microphone, we relay it to Meta's realtime model and pass back the words as they are spoken and the finished sentence about 0.5 s after the person stops (measured against the real service). Protocol and limits: `app/ai/live_speech.py` and `docs/MOBILE_INTEGRATION.md`. Transcripts are never logged.
- **Voice upload** (`POST /speech/transcribe`, the fallback): the app sends a mono 16-bit WAV; the server forwards it to Meta's
  speech model and returns text. Audio is held in memory only, never written to disk or the database.
- **Spoken replies** (`POST /speech/synthesize`): ElevenLabs text to speech, the one non-Meta AI service, because Meta has no speech-output model. Returns MP3. 503 when `ELEVENLABS_API_KEY` is unset (the app then uses the phone's voice), 502 when the service fails. Billed per character, so requests are capped (`TTS_MAX_CHARS`), rate limited and recent results cached. Free ElevenLabs plans can only use *premade* voices through the API (library voices return 402); the default is "Sarah".
- **Photos** (`POST /vision/extract`): a to-do list or whiteboard becomes task and habit *proposals*.
  The model gets only the two "create" tools, and text inside the image is treated as data, so an image
  cannot trigger other actions. Nothing is saved until the user confirms.
- **Avatars:** Cloudinary when configured (cropped square around the face, small `avatar_thumb_url` for
  lists, signed direct upload from the app via `POST /profile/avatar/intent`), otherwise local disk.
- **Traces** (`GET /traces`, `GET /traces/{id}`): each chat turn stores its route, hops, tool steps (no tool
  output), proposals, tokens, cost and latency. The `meta` stream event carries the `trace_id`.
