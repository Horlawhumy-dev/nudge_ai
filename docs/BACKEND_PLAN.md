# NudgeAI — Backend Development Plan

Reference for the backend build, updated for the **Meta Global AI Developer
Hackathon (Startups track)**. Companion to
`NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.docx` / `.pdf` and
[`HACKATHON_PLAN.md`](HACKATHON_PLAN.md).

- **Code location:** `nudgeai_backend/` (renamed from the old `nudgeai_bend`)
- **Status:** Phases 1–2 built before the event (pre-hackathon baseline, Sept 27 –
  Oct 3). Phases 3–6 are hackathon work.
- **Updated:** 2026-10-26
- **Build window:** Oct 27 – Nov 4. **Submission due Nov 4, 9:00 PM ET.**

---

## 0. What changed from the first draft

| Area | Before | Now |
|---|---|---|
| Model provider | NVIDIA `build.nvidia.com` (Nemotron / GLM / DeepSeek) | **Meta Model API** (Muse Spark series) plus **Muse Spark Open** on Baseten |
| Voice | Generic STT/TTS, not built | **Muse Voice Transcribe** for input; TTS stays pre-generated per nudge |
| Multimodal | Not planned | **Muse Spark** reads a photo/screenshot and proposes tasks and habits |
| Agent verifiability | Metrics only | Tool-call **trace**, per-step logs and an **eval suite** |
| Deployment | Local only, no Docker | Public host plus an installable client, required for the demo |
| Repo | Local, no history | Public repo, with a tagged `pre-hackathon-baseline` |

Everything else (Postgres 16 + pgvector, Redis 7, FastAPI, deterministic
engine, confirm-gated proposals) is unchanged.

---

## 1. Decisions locked

| Question | Decision |
|---|---|
| Model hosting | **Meta Model API** (hosted) and **Muse Spark Open** via Baseten (`meta-models/muse-spark-open-1026`, not the docs' `muse-spark-open`) |
| Database | Local **PostgreSQL 16**, pgvector 0.8.6 |
| Cache / queue | Local **Redis 7.0.15**; managed Redis on deploy |
| GitHub tool | **Dropped.** Tools are Calendar (read-only stub) and Memory only |
| Auth | Real JWT access/refresh + argon2id |
| Router | Own `ModelRouter` behind a protocol; tiers map to Meta models |
| Python | 3.12.3, managed with `uv` |
| New-work rule | Baseline commit tagged `pre-hackathon-baseline`; everything after is hackathon work, listed in `HACKATHON.md` |

---

## 2. Models

Exact Meta Model API IDs come from the **Model list** in the Meta docs, which
must be read on Oct 27 and filled into `registry.py`. IDs are loaded from env,
so this is a one-file change.

| Role | Model | Workload |
|---|---|---|
| `fast` | **Muse Spark Open 1026** (Baseten) | Nudge sentences, digest, quiet-hours rewrite, insight phrasing. Also qualifies for the **Best Build on Open Weights** bonus ($10K) |
| `smart` | **Muse Spark** (Meta Model API) | Tool-call planning, multi-step reasoning, weekly insight, structured outputs |
| `deep` | **Muse Spark** with higher reasoning effort, or the strongest model in the list | Advisor gate: reviews the plan and the claimed result |
| `vision` | **Muse Spark** multimodal | Photo / screenshot → proposed tasks and habits |
| `speech` | **Muse Voice Transcribe** | Voice input for chat |
| embeddings | *Open item.* Meta's list shows no embedding model | See §11 |

Constraints that affect the build:

- **Stage 1 judging is pass/fail on real Meta model use.** Generation, speech and
  vision must all go through Meta models. NVIDIA is removed from the generation path.
- **Credits:** $150 Meta API credits (claim by Nov 4, card required) plus Baseten
  ($100), Modal ($100) and Fireworks ($25) on request. The budget guard and the
  semantic cache are still needed to stay inside them.
- Rate limits for the Meta API are unknown until read from the docs. Keep recorded
  fixtures for the demo regardless.

---

## 3. Environment

Unchanged from the baseline: PostgreSQL 16 on `127.0.0.1:5432`, Redis 7.0.15 on
`127.0.0.1:6379`, Python 3.12.3 + `uv`. There is **no PG18 cluster**; do not create
one.

One-time bootstrap (needs sudo):

```bash
sudo -u postgres psql -c "CREATE ROLE haroffcode LOGIN CREATEDB;"
sudo -u postgres createdb -O haroffcode nudgeai
psql -d nudgeai -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Socket URL: `postgresql+psycopg://haroffcode@/nudgeai?host=/var/run/postgresql`

New env vars: `META_API_KEY`, `META_API_BASE_URL`, `BASETEN_API_KEY`,
`BASETEN_BASE_URL`, `MUSE_VOICE_MODEL`. `.env` is gitignored; the repo is public,
so only `.env.example` is committed.

---

## 4. Architecture

```
  Mobile client (Expo)  ── voice / photo / text
       │
       ▼
  ┌──────────── FastAPI (app/api/v1) ─────────────────┐
  │ auth · users · habits · tasks · chat · speech     │
  │ nudges · memory · analytics · traces · /metrics   │
  └───────────────────┬──────────────────────────────┘
                      │
       ┌──────────────┴───────────────┐
       ▼                              ▼
  Nudge Decision Engine         Nudge Agent (chat)
  (deterministic, 0 LLM)        (streaming, tool loop, traced)
       │                              │
       │ needs words                  ▼
       │                        Tool Calling → ToolProposal → user confirms
       ▼                              │
  ┌──────────── Model Router (tiered + escalate) ─────────────┐
  │ fast → Muse Spark Open 1026 (Baseten)                      │
  │ smart/deep/vision → Muse Spark (Meta Model API)            │
  │ speech → Muse Voice Transcribe                             │
  └──────────────────────────┬─────────────────────────────────┘
                             ▼
              [ semantic cache (pgvector) ] ──► Meta / Baseten

  PostgreSQL 16: users … nudges · memories + vector · cache_responses · agent_traces
  Redis 7: rl:* · sess:* · nudge:due / :inflight (ZSET) · nudge:events / :dlq (Streams)
```

**The Decision Engine is deterministic and runs before any model call.** The LLM
only writes the sentence a human reads. This is unchanged and is the core of the
"fewer, better nudges" story.

---

## 5. Stack

| Layer | Choice |
|---|---|
| API | FastAPI + Pydantic v2, async, SSE for chat |
| ORM | SQLAlchemy 2.0 async + Alembic |
| Vectors | pgvector, `vector(2048)` for the existing embeddings; HNSW past ~10k rows |
| Cache / queue | Redis 7: strings, hashes, ZSETs, streams |
| Models | `openai`-compatible SDK for Baseten; Meta Model API client in `app/models/client.py`; `FakeClient` kept for tests |
| Auth | `argon2-cffi` + `pyjwt` |
| Obs | `prometheus-client` + `agent_traces` table |
| Packaging | `uv` |

Excluded: LangChain / LangGraph, Celery, Docker for local dev. A container is
fine for the deploy target only.

---

## 6. Phase 1 — Foundation: Identity, Data, Memory  ✅ baseline

Done before the event: users, 9 auth endpoints, onboarding profile, habits, tasks,
streaks, preferences, memories with hybrid search, `cache_responses`. Tenant
isolation holds: every vector query filters on `user_id`.

Schema and gate checklist are unchanged from the first draft and are part of the
`pre-hackathon-baseline` tag.

## 7. Phase 2 — Model Router + Tool Calling  ✅ baseline (provider swap is hackathon work)

Done: router, budgets, tool registry, memory tools, calendar stub, SSE `/chat`,
confirm-gated `ToolProposal`s, `/metrics`.

### Phase 2b — Meta provider swap  *(Oct 27, hackathon)*

- `app/models/client.py`: add `MetaClient` and `BasetenClient`; keep `FakeClient`
  as the default when keys are empty. Remove `NvidiaClient` from the generation path.
- `app/models/registry.py`: new `ModelSpec` entries for the tiers in §2.
- `app/models/router.py`: same deterministic hard rules → escalation → budget
  guard → semantic cache. Route `fast` to Baseten and `smart`/`deep`/`vision` to Meta.
- `app/core/config.py`, `.env.example`: new variables from §3.
- Tests: client unit tests using `FakeClient`; the **20-prompt router suite**
  re-run against the new tiers.

**Gate 2b:** `POST /chat` streams from a real Meta model; the router suite passes;
a `fast` request is served by Muse Spark Open on Baseten.

---

## 8. Phase 3 — Nudge Decision Engine  *(Oct 28–29)*

Unchanged in design. Pure, ordered, individually testable rules in
`app/engine/rules.py`:

1. `respects_plan_tier` — stubbed Pro flag
2. `avoids_nag` — per-day cap, snoozes respected
3. `respects_quiet_hours` — hard gate, shifts to the quiet end
4. `respects_digest_window` — collapses a burst into one digest
5. `habit_is_due`
6. `respects_habit_stack` — never nudge a stacked habit before its cue
7. `protects_streak` — fire earlier if a streak is at risk

Every rejection logs the rule that fired; that log is a demo artifact.

Scheduling: `nudge:due` ZSET with atomic claim via `ZREM`, `nudge:inflight` lease
ZSET, `nudge:events` and `nudge:dlq` streams. Worker loop: claim → evaluate →
compose via router `fast` (Muse Spark Open) → write the `nudges` row recording the
`model_id` actually used.

Files: `engine/{rules,scheduler,composer,policy,worker}.py`,
`api/v1/nudges.py`, `api/v1/analytics.py`.

Insights: numbers are computed deterministically; the model only phrases them.

**Gate 3:** 3 habits → plausible nudges, none in quiet hours; an at-risk streak
fires earlier; snooze twice stops it; completing increments the streak; kill the
worker mid-flight and nothing is lost or double-sent; full trace for one nudge
(rule log → model → tokens → text).

---

## 9. Phase 4 — Voice and multimodal  *(Oct 30 and Nov 1)*

- `POST /speech/transcribe`: audio upload → **Muse Voice Transcribe** → text,
  which then goes into the normal chat path. The mobile mic button calls this.
- `POST /chat/vision` (or an image part on `/chat`): photo or screenshot of a
  whiteboard, schedule or email → **Muse Spark** returns structured tasks/habits
  → they become `ToolProposal`s the user confirms. Nothing is written without
  confirmation.
- Validate image type and size server-side; treat extracted text as data, never
  as instructions.
- TTS stays a pre-generated `audio_url` per nudge for Pro. No duplex streaming.

**Gate 4:** a spoken "push my 10am deep work to 11" produces a proposal; a photo
of a handwritten to-do list produces a correct task proposal.

## 10. Phase 5 — Verifiable agent: traces and evals  *(Nov 2)*

Follows the "Agents 102: verifiable agents" session.

- `agent_traces` table: per turn, the route decision, each tool call with args and
  result, proposal ids, tokens, cost and latency.
- `GET /traces/{turn_id}` and a mobile trace view for the demo.
- `evals/` script with labelled scenarios (route choice, proposal-not-write,
  quiet-hours respected, injection attempt via memory/calendar text refused).
  Prints pass/fail and exits non-zero on regression, so it can run in CI.

**Gate 5:** the eval suite is green and its output is shown in the demo.

## 11. Phase 6 — Deploy and submit  *(Nov 2–4)*

- Deploy the API to a public host (Railway, Fly or Modal) with managed Postgres
  (pgvector enabled) and Redis. Run `alembic upgrade head` from empty.
- Seed demo data. Keep recorded model responses as a fallback for the video.
- Health check and `/metrics` reachable. CORS set for the client.
- Public repo hygiene: no secrets, `HACKATHON.md` listing what is new since
  `pre-hackathon-baseline`, README with run instructions.

---

## 12. Scope cuts

Google/Apple sign-in, real billing, real Google Calendar writes, push via
APNs/FCM (use Expo push), Free/Pro polish. Keep one polished flow rather than
many shallow ones.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Stage 1 requires real Meta use | Generation, speech and vision all go through Meta models; show the model ids in the trace and the video |
| New-work rule | Tagged baseline; `HACKATHON.md`; show the diff in the demo |
| Rate limits / credits | Budget guard, semantic cache, recorded fixtures, request Baseten and Modal credits on day one |
| Tenant isolation on vectors | `user_id` in every vector WHERE, plus the two-user test |
| Prompt injection via image, memory or calendar | Extracted text is data; tool args are Pydantic-validated; mutating calls only become proposals |
| Model IDs drift | All IDs in `registry.py`, loaded from env |
| Redis dies mid-run | Degrade to Postgres, drop the cache, never fail a user request |
| Banned project categories | Keep the framing to productivity and work; no medical, nutrition or mental-health advice |

## 14. Open items

- [ ] Read the Meta **Model list** and fill the real model IDs into `registry.py`.
- [ ] Claim the $150 Meta credits and request Baseten, Modal and Fireworks credits.
- [ ] **Embeddings:** Meta's list shows no embedding model. Either keep the existing
      embedder for retrieval only (generation stays on Meta) or ask in
      `#questions` / `#office-hours` whether one is available. Decide on Oct 27.
- [ ] Decide the deploy host.
- [ ] Rotate any old provider keys before making the repo public.
- [ ] Rename `nudgeai_bend` to `nudgeai_backend` when copying into this repo, and
      update paths in the READMEs.
