# Nudge AI — mobile

Expo/React Native client for Nudge AI. Scope is **P0** of
`../docs/NudgeAI_Meta_AI_Developer_7Day_Hackathon_MVP_Product_Spec.pdf` — onboarding and auth, the
home nudge dashboard, habits, tasks, progress, Nudge AI chat (text + voice), and account/settings.

**Current state: wired to the backend, with an offline demo mode.** Every screen in the design set
(`../Nudge/`) is implemented and navigable, plus the screens the design didn't cover (notification inbox,
habit detail, privacy, help, feedback, …). With `EXPO_PUBLIC_API_URL` set, the app uses real accounts and
data from `../nudgeai_backend`; without it, it runs fully offline on sample data (see
[Connect to the backend](#connect-to-the-backend) and [Try it (demo mode)](#try-it-demo-mode)). The API
calls are covered by unit tests with the network mocked; push, the microphone and photo upload still need a
pass on a real device.

## Stack

Expo SDK 57 · expo-router (typed routes) · TypeScript (strict) · zustand · axios · expo-secure-store ·
expo-audio · expo-notifications · expo-image-picker · react-native-svg · expo-linear-gradient · expo-image ·
Jest + ESLint (React Compiler rules) + Prettier.

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

## Connect to the backend

Set `EXPO_PUBLIC_API_URL` to the API's address, including `/api/v1`, and restart Expo:

```bash
cp .env.example .env       # then edit EXPO_PUBLIC_API_URL
make start
```

- **Easiest and most reliable: an ngrok tunnel.** It gives the API a fixed HTTPS address that survives switching networks, needs no firewall rule, and works from any network. Once: `ngrok config add-authtoken <token>` and claim your free static domain in the ngrok dashboard. Then, in `nudgeai_backend`: `make run` and, in a second terminal, `make tunnel NGROK_DOMAIN=<your-name>.ngrok-free.app`. Set `EXPO_PUBLIC_API_URL=https://<your-name>.ngrok-free.app/api/v1` here and run `make start`. The API stays on `127.0.0.1`, so it isn't exposed on your local network, but it is public on the internet: keep `CORS_ORIGINS` specific and don't leave it running unattended.
- Without a tunnel, on a **phone** use your computer's LAN address (e.g. `http://192.168.1.20:8079/api/v1`), not `localhost`; start the API so the phone can reach it: `make run HOST=0.0.0.0` in `nudgeai_backend`.
- The Android **emulator** reaches your computer at `http://10.0.2.2:8079/api/v1`; the iOS simulator can use `localhost`.
- With the URL set the app uses real accounts: sign-up emails a 4-digit code, habits/tasks/settings/chat/notifications live on the server, voice mode transcribes live as you speak and sends the sentence on its own when you pause, and the chat button can read tasks from a photo. Tokens are kept in the device keychain and refreshed silently.
- **Push notifications** need a development build and an EAS project id (`npx eas-cli init`); until then the app works without them. With a server account the backend decides when to nudge, so the app's own scheduled reminders are off.
- Without the URL the app runs in the offline **demo mode** described below.

### Troubleshooting: "failed to download remote update" in Expo Go

That message means the phone couldn't fetch the JavaScript bundle from your computer. In order of likelihood:

1. **A firewall on your computer is blocking the phone.** On Linux with `ufw`: `sudo ufw allow 8081/tcp` (Expo's dev server) and `sudo ufw allow 8079/tcp` (the API).
2. **Different networks.** The phone and the computer must be on the same Wi-Fi (not a guest network or one with client isolation), with any VPN off. If you can't get that, use `npx expo start --tunnel`.
3. **The API address changed.** Your computer's address changes when you switch Wi-Fi networks, so a saved `EXPO_PUBLIC_API_URL` goes stale. `make lan` starts Expo with the current address filled in (and `make run HOST=0.0.0.0` must be running in `nudgeai_backend`).
4. **Wrong address in the QR code.** On a machine with Docker, Expo can advertise a `172.x` address. Force the right one: `REACT_NATIVE_PACKAGER_HOSTNAME=<your LAN address> make start`.
5. **Expo Go out of date.** This project is on SDK 57; update Expo Go from the store.

Quick check from the computer: `curl http://<your LAN address>:8081/status` should print `packager-status:running`.

## Try it (demo mode)

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
src/services/api/           axios client (token attach + silent refresh), error normalising, endpoint modules
src/services/sync.ts        pull habits/tasks/settings/history/inbox after sign-in; push settings changes
src/services/push.ts        register this phone's push token with the server
src/services/notifications.ts  permission, local reminders (demo mode), push token
src/hooks/                  useAppFonts, useCountdown, useAnimatedValue, useNow
src/theme/                  tokens: palette → colors/gradients, typography, radius, spacing, shadows
assets/images/              app icons plus art cut from the design set (AI orb, intro art, avatar, confetti)
assets/images/design/       board crops used as visual QA references
```

Conventions:

- Routes stay thin. Anything reusable lives in `components/` or `features/`.
- Screens read colours, type and spacing from `@/theme`; no raw hex values in components.
- Stores expose actions, not setters. With a server account an action updates the screen first, then
  calls the API in the background, and rolls back with the server's message if it fails
  (`store/remote.ts` keeps each item's calls in order). In demo mode the same actions stay local, and
  auth actions take a beat so loading states are real.
- Seed data and scripted chat replies (demo mode only) live in `features/*/data.ts` and
  `features/chat/replies.ts`.
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

With an account, Nudge AI talks to the backend: replies stream in, changes it
proposes appear as Confirm / Not now cards, the mic button records and transcribes speech (audio is never
saved), and the photo button reads tasks off a picture. In demo mode it gives scripted replies. It is
reachable from every tab: every tab has a round Nudge button on the right (tap to chat, press and hold to talk; on Habits and Tasks it sits above the "+"), the Home banner and Progress insight cards open it (insights pre-send a
question), and Settings → Nudge AI lists chat, voice, tone, history and the weekly report.

**Voice mode** streams the microphone to the backend (`WS /speech/live`) so the words appear while you speak and the finished sentence goes to Nudge about half a second after you stop, with no tap and no upload. The audio is also kept in memory, so if the live connection fails the recording is uploaded instead. Replies stream in too: the text appears with its first word, and each sentence is spoken as soon as it is complete.

**One non-Meta piece:** spoken output. Meta offers speech-to-text but no speech-output model, so replies read aloud in voice mode, and Settings → AI voice & tone → "Preview your Nudge", use ElevenLabs through the backend (`POST /speech/synthesize`). If the backend has no `ELEVENLABS_API_KEY`, or the call fails, the app quietly speaks with the phone's built-in voice instead (`expo-speech`). Replies are trimmed to about 280 characters when read aloud, and the "Voice" switch in notification settings turns spoken replies off. The audio is played from a temporary cache file that is deleted when it finishes.

## Native-only behaviour to check on a device

Haptics, swipe-to-delete rows, OS notification permission, the photo picker and the microphone can't be
exercised in the web build. In demo mode, reminders are local notifications (they work in Expo Go). With a
server account the backend sends the nudges as push notifications, which need a development build and an EAS
project id (`npx eas-cli init`); the app's own scheduled reminders are switched off so nothing arrives twice.

## Build order

1. Scaffold, config, theme tokens, design-asset extraction ✅
2. Core components (Button, TextField, Chip, Sheet, EmptyState, …) ✅
3. Onboarding + auth flow ✅
4. Tab shell (Home, Habits, Tasks, Progress, Profile) ✅
5. Habits and tasks with create sheets ✅
6. Home dashboard, nudge banner, empty state ✅
7. Progress (habits + tasks) ✅
8. Nudge AI chat: text, history, voice ✅
9. Settings, profile, subscription (UI only, no billing SDK) ✅
10. UX pass: persistence, editing, undo, haptics, inbox, reminders, missing screens ✅
11. Backend wiring: API client, auth tokens, real data, remote push, speech ✅ (needs a real-device pass: push, microphone, photo upload)
12. Polish: dark pass, a11y audit, error states, release config
