# NudgeAI

**A voice-first personal workflow agent. It decides when you need a nudge, so you get fewer, better interruptions, and it takes actions for you with verifiable, confirm-gated tool calls.**

Built for the **Meta Global AI Developer Hackathon** — **Startups track**, problem statement **"Build for Your World"**.

> **Status (Oct 28, 2026): built and running end to end in development.** The backend (auth, habits, tasks, the nudge engine and worker, chat with confirm-gated tool calls, voice, photo-to-tasks, traces, analytics, Cloudinary avatars) and the mobile app wired to it are done and tested. What is still open is listed under [Status and open items](#status-and-open-items).

---

## The problem

Reminder apps either stay silent or nag. Alarms startle, notifications get muted, and people stop trusting the app that was supposed to help them. Most "AI planners" make it worse by letting a language model decide *whether* to interrupt you, which makes them unpredictable and impossible to audit.

## What NudgeAI does

- **Decides when to nudge, deterministically.** A rules engine (quiet hours, cooldowns, snooze history, habit stacking, streak protection, a morning digest) runs *before* any model call. The model only writes the sentence you read, in your name and chosen tone. Every suppressed nudge logs the rule that stopped it, so "why didn't it nudge me?" always has an answer.
- **Takes actions, with your consent.** Ask "push my 10am deep work to 11" by voice. The agent plans the change with tool calls and returns a *proposal*. Nothing is written until you confirm.
- **Understands more than text.** Speak to it, or photograph a whiteboard, schedule or email and get proposed tasks and habits back.
- **Is verifiable.** Every agent turn stores a trace (route chosen, each hop and tool step, proposals, tokens, cost, latency) that the app can read back, and 341 backend tests plus 169 mobile tests check the behaviours we claim. There is no separate model-eval suite yet.

## How we use Meta's models

| Capability | Meta model | Where |
|---|---|---|
| Nudge writing, digests, insight phrasing | **Muse Spark Open 1026**, served on Baseten (open weights) | Nudge composer, `fast` tier |
| Tool planning, multi-step reasoning, structured outputs | **Muse Spark 1.2** (`muse-spark-1.2`) via Meta Model API | Chat agent, `smart` tier |
| Hard planning and photo / screenshot → tasks and habits | **Muse Spark 1.3** (`muse-spark-1.3`), multimodal | `deep` tier, `POST /vision/extract` |
| Voice input | **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) | `POST /speech/transcribe`, voice mode |
| Spoken replies (text to speech) | **ElevenLabs** (not Meta: Meta has no speech-output model) | `POST /speech/synthesize`, voice mode and the tone preview |
| Coding | **Muse Code** | Used to build this project |

A tiered router picks the model per request with deterministic rules first, escalates when confidence is low, enforces a per-user budget, and fronts everything with a semantic cache. Model IDs are set in `nudgeai_backend/.env` (`MODEL_FAST`, `MODEL_SMART`, `MODEL_DEEP`, `MUSE_VOICE_MODEL`). We avoid the `-contributor` Muse Spark variants because they let Meta train on user content. Voice audio you speak is processed in memory and never stored. The one non-Meta AI service is ElevenLabs, for speech output only.

We are targeting the main track prizes plus **Best Build on Open Weights** and **Best Agentic Use-Case**.

## Architecture

```
  Mobile client (Expo) ── voice / photo / text
          │
          ▼
  FastAPI ── auth · habits · tasks · chat · speech · vision · nudges · traces · /metrics
          │
   ┌──────┴────────────────────┐
   ▼                           ▼
 Nudge Decision Engine      Nudge Agent (streaming tool loop)
 deterministic, no LLM          │
   │ needs words                ▼
   │                      Tool calls → proposal → user confirms
   ▼                           │
 Model Router (tiered + escalate + budget guard + semantic cache)
   ├─ fast   → Muse Spark Open 1026 (Baseten)
   ├─ smart / deep / vision → Muse Spark (Meta Model API)
   └─ speech → Muse Voice Transcribe

 PostgreSQL 16 + pgvector   ·   Redis 7 (queues, rate limits)
```

Full design: [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md). Product spec: [`docs/`](docs) (`.docx` / `.pdf`). Build schedule and demo script: [`docs/HACKATHON_PLAN.md`](docs/HACKATHON_PLAN.md).

## What was built during the hackathon

The hackathon rules require new work to be clearly identified. This repo uses a tag to separate it:

- **Before the event (Sept 27 – Oct 3), tag `pre-hackathon-baseline` *(not created yet: the tag still has to be added to the commit that is the baseline)*:** FastAPI backend with auth, habits, tasks, memory with pgvector search, a model router with a confirm-gated tool loop, and an Expo app with onboarding on a mock API. This used a different model provider.
- **During the hackathon (Oct 27 – Nov 4):** everything after that tag.
  - Meta Model API and Baseten integration, replacing the previous provider
  - The Nudge Decision Engine, scheduler and worker
  - Insights and habit stacking
  - Voice input with Muse Voice Transcribe
  - Photo-to-tasks with Muse Spark vision
  - Agent traces (stored per chat turn and readable through the API)
  - Mobile Home, Habits, Tasks, Chat, Progress and Profile screens wired to the real backend
  - Not yet: deployment and a model-eval suite

`git diff pre-hackathon-baseline..main` is the exact list of hackathon changes. A running list in `HACKATHON.md` is still to be written.

## Repository layout

```
docs/               product spec, backend plan, hackathon plan, mobile integration guide
Nudge/              Figma design export (~100 screens)
nudgeai_backend/    FastAPI service     (see its README; has its own Makefile)
nudgeai_mobile/     Expo / React Native app  (see its README; has its own Makefile)
```

How the app talks to the API, screen by screen: [`docs/MOBILE_INTEGRATION.md`](docs/MOBILE_INTEGRATION.md).

## Run it

You need Python 3.12, PostgreSQL 16 with the `pgvector` extension, Redis 7 and Node 20+. Each project has its own Makefile (`make help` lists targets).

```bash
# Backend (terminal 1)
cd nudgeai_backend
cp .env.example .env         # set META_API_KEY, BASETEN_API_KEY, RESEND_API_KEY, JWT_SECRET, DATABASE_URL
make install
make db-migrate
make run HOST=0.0.0.0        # API on :8079 (HOST=0.0.0.0 lets a phone reach it)

# Nudge worker (terminal 2): decides and sends nudges, rolls recurring tasks, sends weekly reports
cd nudgeai_backend && make worker

# Mobile (terminal 3)
cd nudgeai_mobile
cp .env.example .env         # set EXPO_PUBLIC_API_URL=http://<your computer's LAN address>:8079/api/v1
make install
make start
```

Without API keys the backend uses a deterministic fake model client, so tests and local runs work offline. Without `EXPO_PUBLIC_API_URL` the app runs in an offline demo mode with sample data. Optional keys: `CLOUDINARY_*` (profile photos; local disk otherwise), `ELEVENLABS_API_KEY` (spoken replies; the phone's own voice otherwise), `EXPO_ACCESS_TOKEN` (push).

Quality gates: `make check` in each project (read-only: lint, types, tests).

## Status and open items

Built and tested: auth with emailed codes, habits and tasks (recurring, undo, plan limits), the nudge engine and worker, chat with proposals the user must confirm, voice input, photo-to-tasks, agent traces, analytics and weekly report, notification inbox and push, Cloudinary avatars, and the mobile app wired to all of it.

Not done, or not verified:

- **No end-to-end run on a device yet.** The mobile tests mock the network; push, the microphone and photo upload need a real-device pass.
- **Voice with a real Meta key is unconfirmed.** The transcription route and WAV format follow Meta's docs, but the request fields and reply shape haven't been checked against a live key.
- **Push needs an EAS project id** (`npx eas-cli init`) and a development build.
- **Email change** isn't available in the app (backend supports it); **billing is a stub**; no model-eval suite; avatars on local disk unless Cloudinary is configured.
- **Production settings** still to set: `ENVIRONMENT`, `BILLING_STUB_ENABLED=false`, `CORS_ORIGINS`, a verified Resend domain.

## Demo (3 minutes)

1. The problem: alarms startle, notifications get muted.
2. A spoken request becomes a personalised nudge.
3. Quiet hours suppress a late nudge and the rule log shows why.
4. "Push my 10am deep work to 11" produces a proposal, and the user confirms.
5. A photo of a handwritten to-do list becomes proposed tasks.
6. The agent trace for a turn, and the test results.
7. Which Meta models are used where, and the diff of what was built this week.

## Scope and non-goals

Not building: teams or sharing, project management, replacing your calendar, autonomous email or calendar writes, social features, wearables. The product is for productivity and work routines; it does not give medical, nutrition or mental-health advice.

## Team and contact

Entering the **Startups track**. Team details to be added before submission.
