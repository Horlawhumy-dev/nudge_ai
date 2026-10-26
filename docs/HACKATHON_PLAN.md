# Plan: Win the Startups Track — Meta Global AI Developer Hackathon with NudgeAI

## Context
- Startups track prizes: 1st $250K, 2nd $150K, 3rd $75K. Bonus prizes that can stack on top: Best Build on Open Weights ($10K), Best Agentic Use-Case ($5K), Most Viral ($20K), Community Vote ($10K).
- Today is Oct 26 (kickoff). Building window is Oct 27 – Nov 4. **Submission is due Wed Nov 4, 9:00 PM ET**. Judging runs Nov 5–8. The top 5 per track are announced Nov 9.
- Judging rubric: Impact 30%, Use of Meta AI tooling 25%, Technical depth 25%→20%, Demo 25%. Stage 1 is a pass/fail check that Meta models are really used. The 3-minute demo video is the main artifact judges see.
- Existing state (explored):
  - Backend `nudgeai_bend`: FastAPI, Postgres/pgvector and Redis. Auth, habits, tasks, memory and chat with confirm-gated proposals are done. The previous LLM provider is being replaced by Meta (`app/models/client.py, `registry.py`, `router.py`, `config.py`).
  - Mobile `nudgeai_mobile`: Expo. Only onboarding exists, running on a mock adapter.
  - `Nudge/`: about 100 Figma PNG screens.
  - Missing: Nudge Engine, Insights, voice, push delivery, and nearly all mobile screens. No Meta integration anywhere.

## Risks to neutralise first
1. **"New work only" rule.** The code was started Sept 27, so Phases 1–2 pre-date the event. Startups may build on an existing codebase, but what was built in the window must be clearly identified. Create a **fresh public repo on Oct 27** (git history was just removed) and commit the pre-event baseline as one tagged commit `pre-hackathon-baseline`. Everything after that is the hackathon work. Add a `HACKATHON.md` that lists what is new, and show the git diff in the demo.
2. **Repos must be public: scrub secrets.** Make sure `nudgeai_bend/.env` is gitignored. Rotate any old provider keys. Add the Figma PNGs and the spec only if wanted.
3. **Anti-projects.** Habit apps risk being judged "generic", and health or wellness advice is banned. Position NudgeAI as an agentic personal workflow agent, not a wellness coach. Avoid medical, nutrition and mental-health framing in the copy and the demo. Keep habits to productivity and work.
4. **Impact (30%).** A habit tracker looks like a toy. Reframe the pitch as an agent that does real multi-step work: it reads your calendar and tasks, decides what to nudge and when, and proposes and executes reschedules after a confirmation. Add startup evidence: a landing page, a waitlist count and 3–5 real users or testimonials gathered during the week.

## Product angle (recommended)
"NudgeAI: a voice-first personal workflow agent. It decides when you need a nudge, so you get fewer, better interruptions, and it takes actions for you with verifiable, confirm-gated tool calls." This maps to Problem Statement 1 (Build for Your World) and targets Best Agentic Use-Case.

## Meta tooling integration (25% — go beyond a basic integration)
- Replace the previous provider with a **Meta Model API client** in `nudgeai_bend/app/models/client.py`, keeping the `FakeClient` for tests. Keep the tier routing in `router.py`, mapping the tiers to Muse Spark models.
- **Muse Voice Transcribe** for voice input. Add a speech endpoint and a mobile mic button. This replaces the missing STT.
- **Muse Spark Open 1026** (`meta-models/muse-spark-open-1026`, served on Baseten) for the Nudge Composer and insight phrasing. It also runs as a switchable backend provider. This qualifies for the $10K open-weights bonus and demonstrates the router choosing between the API and open weights.
- **Muse Spark multimodal:** take a photo or screenshot of a whiteboard, a schedule or an email and turn it into tasks and habits. This surfaces a capability that goes beyond chat.
- Structured outputs and tool use for the agent loop (the existing proposals gate). Follow the "Agents 102: verifiable agents" session: log every tool call, show a trace in the app, and add an eval script with pass/fail scenarios. This is the technical-depth story.
- Use Muse Code as the coding agent to build faster.

## Day-by-day schedule (Oct 27 – Nov 4)
| Day | Goal |
|---|---|
| Oct 26 (today) | Claim the $150 Meta API credits (needs a card), request Baseten, Modal and Fireworks credits, join Discord, and decide solo or team (max 4). Read the Meta docs. |
| Oct 27 | Fresh public repo plus baseline tag. Meta client swapped in and working end to end. Watch Agents 101 (12 PM ET). |
| Oct 28 | Nudge Engine: quiet hours, cooldowns, high-priority exception, morning digest, nudges API. Watch Agents 102 (12 PM ET). |
| Oct 29 | Composer using Muse Spark Open on Baseten. Habit stacking and Insights (numbers computed deterministically, LLM only phrases them). |
| Oct 30 | Voice: Muse Voice Transcribe endpoint plus the mobile mic. Watch the Fireworks/open-models session. |
| Oct 31 | Mobile: login/signup/OTP, Home, Habits, Tasks tabs wired to the real backend (`EXPO_PUBLIC_USE_MOCK=0`; fix the 8000 vs 8079 port mismatch). |
| Nov 1 | Mobile: Chat with the proposals/confirm UI, Progress and Profile. Multimodal photo-to-tasks. |
| Nov 2 | Agent trace view and eval suite. Expo push notifications. Deploy the backend to a public host (Railway, Fly or Modal) and build an installable Expo build or web build. |
| Nov 3 | Feature freeze. Polish, bug bash, seed demo data, landing page, user quotes. Last full day for technical help from the organisers. |
| Nov 4 | Record and edit the 3-minute video, write the README, verify the public repo and video links, **submit well before 9 PM ET**. |

## Demo video (3 min, 25% of the score)
- 0:00–0:20: The problem (alarms startle, notification fatigue) and the startup pitch with evidence.
- 0:20–2:20: Live product only: a voice command, then a personalised nudge, then quiet hours suppressing a late nudge, then "push my 10am deep work to 11" producing a proposal and a confirmation. Then the photo-to-tasks wow moment, then the agent trace.
- 2:20–2:50: Which Meta models are used and where. Show the git diff of what was built during the hackathon.
- 2:50–3:00: Close on the vision and the business ($4.99/mo Pro).
- Post the clip on X for the Most Viral prize, and submit the link.

## Scope cuts (protect the demo)
Skip Google/Apple sign-in, real billing, and real Google Calendar writes. Use a stubbed Pro flag. Drop Free/Pro gating polish. Keep one polished flow rather than many shallow ones.

## Critical files
- `nudgeai_bend/app/models/client.py`, `registry.py`, `router.py`, `app/core/config.py`, `.env.example`: Meta and Baseten providers.
- `nudgeai_bend/app/ai/proposals.py`: confirm-gated agent actions (reuse).
- `nudgeai_bend/app/api/` (chat, core): new nudges, progress and speech endpoints. The Nudge Engine is new, per `BACKEND_PLAN.md` Phase 3.
- `nudgeai_mobile/src/app/`: new tabs and screens. Reuse the theme, the API client modules and the auth store. Designs are in `Nudge/`.

## Verification
- Backend: `make check` and `make test` (needs the `nudgeai_test` DB). Add Meta client tests using `FakeClient`, plus the agent eval suite.
- Manual run of the full demo script on a real phone against the deployed backend, twice, with no mock adapter.
- Submission checklist: repo public with no secrets, the HACKATHON.md new-work list, the video link opens logged out, all teammates listed, and credits claimed by every member.

## Open question for you (not blocking)
Are you entering as a registered startup or as an individual or team? The Startups track needs a startup entry, so confirm that on the submission page before building the landing page and pitch.
