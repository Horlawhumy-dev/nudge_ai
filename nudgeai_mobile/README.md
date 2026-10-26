# Nudge AI — mobile

Expo/React Native client for Nudge AI. Scope is **P0** of
`../NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.pdf` only — the habit/task planner, the home
nudge dashboard, progress, chat, and account/settings.

The FastAPI backend in `../nudgeai_backend/` exists but does not yet cover the whole P0
surface, so the app ships a **mock transport**: an axios adapter that answers with the same
routes, status codes and error bodies the real API uses. Every screen talks to
`src/services/api/client.ts` either way — flipping to live HTTP is
`EXPO_PUBLIC_USE_MOCK=0` (plus `EXPO_PUBLIC_API_URL` if it is not on this machine's
`localhost:8000`).

## Stack

Expo SDK 57 · expo-router · TypeScript (strict) · TanStack Query · zustand ·
axios + refresh interceptor · expo-secure-store · Jest + React Native Testing Library ·
ESLint + Prettier.

Conventions follow `../passika_mobile`, with one deliberate difference — see below.

## Layout

```
assets/images/            app icons, splash, notification icon (generated from the design set)
assets/images/design/     board crops used as visual QA references while building screens
src/app/                  expo-router routes (_layout.tsx, index.tsx, …)
src/constants/env.ts      API base URL, mock/live switch, mock latency
src/services/api/         client (axios + refresh), errors, wire types, endpoint modules
src/services/api/mock/    in-memory fixture store + the axios adapter behind `useMock`
src/services/secureStorage/  token pair in SecureStore (localStorage on web)
src/store/                zustand stores — auth session
src/theme/                design tokens: palette → colors/gradients, typography, radius, …
```

> **Deviation from `passika_mobile`:** the Expo template scaffolded routes into
> `src/app/` instead of a root-level `app/`. Because `tsconfig.json` maps `@/*` →
> `./src/*`, keeping them there means routes and everything else share one import root.
> Route files are still ordinary expo-router files; only their path changed.

## Scripts

```bash
npm start          # expo dev server
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
npm test           # jest
npm run format     # prettier --write .
```

## Mock API

`EXPO_PUBLIC_USE_MOCK` (default on) swaps the axios adapter for an in-memory transport that
mirrors `../nudgeai_backend/` route for route: flat Pydantic bodies (no envelope), FastAPI
`{ detail }` / 422 `{ detail: [{ loc, msg, type }] }` errors, and rotating refresh tokens.

- Seeded account: **demo@nudge.ai / Password1** (verified, 3 habits, 3 tasks).
- New sign-ups start unverified; the mock always issues code **123456**
  (`verify-email` / `resend-code` / `forgot-password`).
- `EXPO_PUBLIC_MOCK_LATENCY_MS` adds artificial delay (0 in tests).

Set `EXPO_PUBLIC_USE_MOCK=0` once the matching backend routes are live.

## Design references

The design set lives in `../Nudge/` (41 exported screens plus `Nudge.pdf`, the master
board). Seven screens — the five onboarding steps plus their filled/ready variants — are
**only** on the master board, so they were cropped into `assets/images/design/` for
side-by-side QA. Every other screen stays in `../Nudge/` and is referenced by path.

Design tokens in `src/theme/` are transcribed from that set: light theme only
(`#F3F3F5` background, white surfaces, `#A855F7` primary), Playfair Display for display
type and Inter for body, 20/28/999 radii, and emoji-as-icon for habits and categories.

## Build order

1. Scaffold, config, theme tokens, design-asset extraction ✅
2. API layer: wire types, `ApiError`, axios client + refresh interceptor, mock transport, auth store ✅
3. Core components (Button, Input, Card, Chip, Sheet, EmptyState, …)
4. Onboarding + auth stack
5. Tab shell (Home, Habits, Tasks, Progress, Profile)
6. Habits and Tasks (P0 limits: 3 habits, 5 tasks/day, mock)
7. Home dashboard + nudge cards + notifications
8. Progress + chat
9. Settings, Profile, subscription (UI only, no billing SDK)
10. Polish: dark pass, a11y, empty/error states, release config
