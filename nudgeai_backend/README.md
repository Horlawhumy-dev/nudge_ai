# NudgeAI Backend

FastAPI backend for **NudgeAI** — a voice-first habit and task companion.

See `../BACKEND_PLAN.md` for the full three-phase plan and
`../NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.docx` for the product spec.

## Status

Phase 1 (foundation) and Phase 2 (model router + tool calling) are implemented
and green: `ruff check`, `ruff format --check`, and strict `mypy` all pass, and
the live suite reports **109 passed, 1 skipped** against a real PostgreSQL 16 +
pgvector database.

- Migrations `0001_phase1` and `0002_phase2` are applied; `alembic check` reports
  no model/migration drift. 17 application tables.
- The 1 skip is the real-embedder paraphrased recall test, which needs
  `META_API_KEY` and an embedding model. Everything else runs offline via a deterministic fake.
- Phase 3 (the Nudge Decision Engine) has not started.

### Running without an API key

The model client falls back to a clearly-logged `FakeClient` when
`META_API_KEY` is empty, so the whole app boots and the test suite runs with no
network calls and no spend. Set the key in `.env` to use the real Meta
endpoints; set `FORCE_FAKE_MODELS=true` to override a key that is present.

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

### 3. Install, migrate, run

```bash
uv pip install -e ".[dev]"
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000/docs>.

## Tests

Tests are integration tests against a real PostgreSQL + pgvector database —
HNSW, the generated `tsvector` column, and cosine distance are all part of what
is being verified, so mocking them would test nothing.

```bash
sudo -u postgres createdb -O haroffcode nudgeai_test
sudo -u postgres psql -d nudgeai_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
export TEST_DATABASE_URL="postgresql+psycopg://haroffcode@/nudgeai_test?host=/var/run/postgresql"
uv run pytest
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
  services/  domain logic, no HTTP types
  api/v1/    HTTP routers
  infra/     redis, embeddings
  models/    phase 2: registry, router, budgets, Meta and Baseten clients
  tools/     tool protocol, memory + calendar tools, dispatch loop
  ai/        prompts, proposal confirmation gate
alembic/     migrations
tests/       pytest
```

## Phase 2: routing and tool calling

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

`memory_remember` and `memory_forget` are marked `mutating`, so the executor
never calls their `run()`. It writes a `tool_proposals` row instead and the
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
- **Live Meta validation (Gate 2b)**: pending. The Meta Model API and Baseten clients are hackathon work; this section will record the live probe results once they run.
