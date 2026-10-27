# Nudge AI — mobile

Expo/React Native client for Nudge AI. Scope is **P0** of
`../docs/NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.pdf` — onboarding and auth, the
home nudge dashboard, habits, tasks, progress, Nudge AI chat (text + voice), and account/settings.

**Current state: a static build.** Every screen in the design set (`../Nudge/`) is implemented and
navigable, running on local seed data held in zustand stores. There is no network code yet; the
`src/services/api/` files are empty placeholders for the backend work.

## Stack

Expo SDK 57 · expo-router (typed routes) · TypeScript (strict) · zustand · react-native-svg ·
expo-linear-gradient · expo-image · Jest + ESLint (React Compiler rules) + Prettier.

## Scripts

```bash
npm start          # expo dev server (press w for web, or scan with Expo Go)
npm run typecheck  # tsc --noEmit
npm run lint       # expo lint
npm test           # jest
npm run format     # prettier --write .
```

## Try it

- **Log in** with any valid email and any password → seeded demo account (4 habits, 5 tasks, 7-day streak).
- **Sign up** → any 4-digit verification code works → 5-step setup → an empty Home (the "Your day starts here" state).
- Forgot password → any 4-digit code → new password (8+ chars, capital, number, special).

## Layout

```
src/app/                    expo-router routes only — thin screens that compose features
  index.tsx                   splash, then routes by session status
  intro.tsx                   3-slide intro
  (auth)/                     login, signup, verify, verified, forgot/new password, reset success
  onboarding/                 step-1 … step-5, ready
  (main)/                     guarded by session status (redirects to / when signed out)
    (tabs)/                     home, habits, tasks, progress, profile (floating tab bar)
    chat/                       index, history, voice
    settings/                   index, notifications, ai-voice, quiet-hours, wake/sleep time,
                                edit-profile, subscription
src/components/ui/          design-system primitives (Button, TextField, Chip, BottomSheet, …)
src/components/layout/      floating tab bar + clearance hook
src/features/<name>/        per-feature types, seed data, pure utils and feature components
src/store/                  zustand stores: auth session, habits, tasks, chat, preferences, onboarding
src/lib/                    validation + formatting helpers
src/hooks/                  useAppFonts, useCountdown, useAnimatedValue
src/theme/                  tokens: palette → colors/gradients, typography, radius, spacing, shadows
assets/images/              app icons plus art cut from the design set (AI orb, intro art, avatar, confetti)
assets/images/design/       board crops used as visual QA references
```

Conventions:

- Routes stay thin. Anything reusable lives in `components/` or `features/`.
- Screens read colours, type and spacing from `@/theme`; no raw hex values in components.
- Stores expose actions, not setters, and mocked-async actions (auth) take a beat so loading states
  are real. Replace their bodies with API calls when the backend is wired in.
- Seed data and scripted chat replies live in `features/*/data.ts` and `features/chat/replies.ts`.
- `@/*` maps to `src/*`, `@/assets/*` to `assets/*`.

## Design references

The design set lives in `../Nudge/` (exported screens plus `Nudge.pdf`, the master board). Tokens in
`src/theme/` are sampled from it: light theme only, primary `#C15EFF`, Playfair Display for titles
and numerals, Inter for body, pill-shaped controls, emoji as habit/category icons.

Notes on deviations from the design set:

- The password-reset CTA reads "Reset password" (the design file says "Send email", which looks like a copy slip).
- Quiet hours and Wake/Sleep time have no dedicated board for every state; they reuse the onboarding
  option lists and the quiet-hours design.
- Privacy & Security, Help, Feedback, Rate and "change photo" show a "coming soon" dialog until their
  backends or native modules exist (e.g. `expo-image-picker`).
- Free-plan limits (3 habits, 5 tasks) are shown on the subscription screen but not enforced; the demo
  data itself exceeds them.

## Build order

1. Scaffold, config, theme tokens, design-asset extraction ✅
2. Core components (Button, TextField, Chip, Sheet, EmptyState, …) ✅
3. Onboarding + auth flow ✅
4. Tab shell (Home, Habits, Tasks, Progress, Profile) ✅
5. Habits and tasks with create sheets ✅
6. Home dashboard, nudge banner, empty state ✅
7. Progress (habits + tasks) ✅
8. Nudge AI chat: text, history, voice (simulated) ✅
9. Settings, profile, subscription (UI only, no billing SDK) ✅
10. Backend wiring: API client, auth tokens, real data, notifications, speech
11. Polish: dark pass, a11y audit, error states, release config
