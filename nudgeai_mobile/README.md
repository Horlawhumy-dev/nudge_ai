# Nudge AI — mobile

Expo/React Native client for Nudge AI. Scope is **P0** of
`../docs/NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.pdf` — onboarding and auth, the
home nudge dashboard, habits, tasks, progress, Nudge AI chat (text + voice), and account/settings.

**Current state: a static build.** Every screen in the design set (`../Nudge/`) is implemented and
navigable, plus the screens the design didn't cover (notification inbox, habit detail, privacy, help,
feedback, …). Data lives in zustand stores persisted to AsyncStorage, so the app resumes where you left
off. There is no network code yet; `src/services/api/` holds empty placeholders for the backend work.
`src/services/notifications.ts` schedules real local habit reminders.

## Stack

Expo SDK 57 · expo-router (typed routes) · TypeScript (strict) · zustand · react-native-svg ·
expo-linear-gradient · expo-image · Jest + ESLint (React Compiler rules) + Prettier.

## Scripts

A `Makefile` wraps the common commands (`make help` lists them):

```bash
make install   # npm install
make start     # expo dev server (press w for web, or scan with Expo Go)
make check     # typecheck + lint + format-check + tests: run before committing
make test      # jest
make format    # prettier --write src README.md
```

The same commands are available as `npm run start | typecheck | lint | test | format`.

## Try it

- **Log in** with any valid email and password → seeded demo account (4 habits, 5 tasks, notifications, chat history). Exception: `demo@nudge.ai` needs `Password1!`; a wrong password shows the "Incorrect email or password" error. The login screen has a tap-to-fill hint.
- **Sign up** → the verification code is `1234` (a wrong code shows an error; the screen has a tap-to-fill hint) → 5-step setup → an empty Home. Signing up with `demo@nudge.ai` shows the "email already exists" error.
- Forgot password → code `1234` → new password (8+ chars, capital, number, special character).

## Forms and validation

- Validators live in `src/lib/validation.ts` (pure, tested): they return a friendly message or `null`.
- `useField` (`src/hooks/useField.ts`) holds one field's value, shows its error only after the user leaves
  the field (or after a failed submit), and surfaces "server" errors until the value is edited.
- `TextField` renders errors with an icon, a green tick for valid fields, and optional counters. Form-level
  errors use `FormError`. Primary buttons stay inactive until the form is valid.
- Mock auth errors come from `AuthError` in `useAuthStore`; the fixed demo values are in `src/constants/env.ts`
  (`DEMO_MODE`), to be removed when the real API is wired in.
- `useDiscardGuard` asks before leaving an edit screen with unsaved changes (back button, swipe, hardware back).

## Layout

```
src/app/                    expo-router routes only — thin screens that compose features
  index.tsx                   splash, then routes by session status
  intro.tsx                   3-slide intro
  (auth)/                     login, signup, verify, verified, forgot/new password, reset success
  onboarding/                 step-1 … step-5, notifications (permission), starter-habits, ready
  legal/                      terms, privacy
  (main)/                     guarded by session status (redirects to / when signed out)
    (tabs)/                     home, habits, tasks, progress, profile (floating tab bar)
    habit/[id].tsx              habit detail (streak, week strip, edit, delete)
    streak.tsx                  overall streak, best, milestones
    report.tsx                  weekly report derived from habits and tasks
    notifications.tsx           inbox behind the bell
    chat/                       index, history (open / new / delete), voice
    settings/                   index, notifications, ai-voice, quiet-hours, wake/sleep time,
                                edit-profile, subscription, privacy, change-password, help, feedback, about
src/components/ui/          design-system primitives (Button, TextField, Chip, BottomSheet, …)
src/components/layout/      floating tab bar + clearance hook
src/features/<name>/        per-feature types, seed data, pure utils and feature components
src/store/                  zustand stores: auth session, habits, tasks, chat, preferences, onboarding
src/lib/                    validation + formatting helpers
src/services/               notifications.ts: permission + local reminder scheduling
src/hooks/                  useAppFonts, useCountdown, useAnimatedValue, useNow
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
- State that depends on the date (habit done-today, streaks, task overdue) is derived from stored dates,
  never from flags, so it stays correct after midnight and across restarts (`lib/date.ts`, `features/*/utils.ts`).
- Destructive actions (delete habit/task/notification/chat) show an undo toast (`store/useToastStore.ts`).
- `@/*` maps to `src/*`, `@/assets/*` to `assets/*`.

## Design references

The design set lives in `../Nudge/` (exported screens plus `Nudge.pdf`, the master board). Tokens in
`src/theme/` are sampled from it: light theme only, primary `#C15EFF`, Playfair Display for titles
and numerals, Inter for body, pill-shaped controls, emoji as habit/category icons.

Notes on deviations from the design set:

- The password-reset CTA reads "Reset password" (the design file says "Send email", which looks like a copy slip).
- Quiet hours and Wake/Sleep time have no dedicated board for every state; they reuse the onboarding
  option lists and the quiet-hours design.
- Feedback, rating, "download my data" and password change have no backend yet; they confirm with a toast.
- A picked profile photo is stored as a local URI; it falls back to the default avatar if the file is gone.
- Free-plan limits (3 habits, 5 tasks) are shown on the subscription screen but not enforced; the demo
  data itself exceeds them.

## Where the AI lives

Nudge AI is reachable from every tab: Home has a docked "Ask Nudge anything" bar with a mic button (voice mode),
the other tabs have a round Nudge button, the Home banner and Progress insight cards open it (insights pre-send a
question), and Settings → Nudge AI lists chat, voice, tone, history and the weekly report.

## Native-only behaviour to check on a device

Haptics, swipe-to-delete rows, OS notification permission and scheduled reminders, and the photo picker
can't be exercised in the web build. Reminders use local notifications (work in Expo Go); remote push will
need a development build.

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
10. UX pass: persistence, editing, undo, haptics, inbox, reminders, missing screens ✅
11. Backend wiring: API client, auth tokens, real data, remote push, speech
12. Polish: dark pass, a11y audit, error states, release config
