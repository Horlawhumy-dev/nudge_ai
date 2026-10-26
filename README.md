# NudgeAI

**A voice-first personal workflow agent. It decides when you need a nudge, so you get fewer, better interruptions, and it takes actions for you with verifiable, confirm-gated tool calls.**

Built for the **Meta Global AI Developer Hackathon** — **Startups track**, problem statement **"Build for Your World"**.

> **Status (Oct 26, 2026):** planning is done and the build starts Oct 27. This README describes what we are building and how to tell hackathon work from pre-existing work. Sections marked *(planned)* are not built yet and will be updated as they land.

---

## The problem

Reminder apps either stay silent or nag. Alarms startle, notifications get muted, and people stop trusting the app that was supposed to help them. Most "AI planners" make it worse by letting a language model decide *whether* to interrupt you, which makes them unpredictable and impossible to audit.

## What NudgeAI does

- **Decides when to nudge, deterministically.** A rules engine (quiet hours, cooldowns, snooze history, habit stacking, streak protection, a morning digest) runs *before* any model call. The model only writes the sentence you read, in your name and chosen tone. Every suppressed nudge logs the rule that stopped it, so "why didn't it nudge me?" always has an answer.
- **Takes actions, with your consent.** Ask "push my 10am deep work to 11" by voice. The agent plans the change with tool calls and returns a *proposal*. Nothing is written until you confirm.
- **Understands more than text.** Speak to it, or photograph a whiteboard, schedule or email and get proposed tasks and habits back.
- **Is verifiable.** Every agent turn has a trace (route chosen, each tool call and result, tokens, cost) and an automated eval suite checks the behaviours we claim.

## How we use Meta's models *(planned)*

| Capability | Meta model | Where |
|---|---|---|
| Nudge writing, digests, insight phrasing | **Muse Spark Open 1026**, served on Baseten (open weights) | Nudge composer, `fast` tier |
| Tool planning, multi-step reasoning, structured outputs | **Muse Spark** via Meta Model API | Chat agent, `smart` / `deep` tiers |
| Photo / screenshot → tasks and habits | **Muse Spark** multimodal | Vision endpoint |
| Voice input | **Muse Voice Transcribe** | Speech endpoint, mic button |
| Coding | **Muse Code** | Used to build this project |

A tiered router picks the model per request with deterministic rules first, escalates when confidence is low, enforces a per-user budget, and fronts everything with a semantic cache. Exact Meta model IDs are filled in from the Model list on Oct 27.

We are targeting the main track prizes plus **Best Build on Open Weights** and **Best Agentic Use-Case**.

## Architecture

```
  Mobile client (Expo) ── voice / photo / text
          │
          ▼
  FastAPI ── auth · habits · tasks · chat · speech · nudges · traces · /metrics
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

- **Before the event (Sept 27 – Oct 3), tag `pre-hackathon-baseline` *(to be created when the code is imported)*:** FastAPI backend with auth, habits, tasks, memory with pgvector search, a model router with a confirm-gated tool loop, and an Expo app with onboarding on a mock API. This used a different model provider.
- **During the hackathon (Oct 27 – Nov 4):** everything after that tag.
  - Meta Model API and Baseten integration, replacing the previous provider
  - The Nudge Decision Engine, scheduler and worker
  - Insights and habit stacking
  - Voice input with Muse Voice Transcribe
  - Photo-to-tasks with Muse Spark vision
  - Agent traces and the eval suite
  - Mobile Home, Habits, Tasks, Chat, Progress and Profile screens wired to the real backend
  - Deployment

`git diff pre-hackathon-baseline..main` is the exact list of hackathon changes. A running list is kept in `HACKATHON.md` *(planned)*.

## Repository layout

```
docs/               product spec, backend plan, hackathon plan
Nudge/              Figma design export (~100 screens)
nudgeai_backend/    FastAPI service            (planned: import on Oct 27)
nudgeai_mobile/     Expo / React Native app    (planned: import on Oct 27)
```

## Run it *(planned — will be finalised before submission)*

```bash
# Backend (Python 3.12, uv, PostgreSQL 16 with pgvector, Redis 7)
cd nudgeai_backend
cp .env.example .env        # set META_API_KEY, BASETEN_API_KEY, JWT_SECRET
uv pip install -e ".[dev]"
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Mobile
cd nudgeai_mobile
npm install
EXPO_PUBLIC_USE_MOCK=0 npm start
```

Without API keys the backend falls back to a deterministic fake model client, so tests and local runs work offline.

## Demo (3 minutes) *(planned)*

1. The problem: alarms startle, notifications get muted.
2. A spoken request becomes a personalised nudge.
3. Quiet hours suppress a late nudge and the rule log shows why.
4. "Push my 10am deep work to 11" produces a proposal, and the user confirms.
5. A photo of a handwritten to-do list becomes proposed tasks.
6. The agent trace and eval results.
7. Which Meta models are used where, and the diff of what was built this week.

## Scope and non-goals

Not building: teams or sharing, project management, replacing your calendar, autonomous email or calendar writes, social features, wearables. The product is for productivity and work routines; it does not give medical, nutrition or mental-health advice.

## Team and contact

Entering the **Startups track**. Team details to be added before submission.
