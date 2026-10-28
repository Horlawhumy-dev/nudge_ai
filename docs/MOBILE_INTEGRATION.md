# Mobile ⇄ backend integration guide

What the mobile app should call, in what shape, and what changed on the backend to make that possible.
Base URL: `http://<host>:8079/api/v1` (set `EXPO_PUBLIC_API_URL`). Interactive docs: `/docs`.

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <access_token>`. Access tokens last 30 min; rotate with `POST /auth/refresh` (the old refresh token dies on use). |
| Errors | `{ "detail": "message" }`. Validation errors (422) are `{ "detail": [{ "loc": [...], "msg": "..." }] }`. |
| Status codes | 401 not signed in or token expired · 402 plan limit reached (show the upgrade prompt) · 403 wrong password / unverified · 404 not found **or not yours** · 409 conflict (email taken) · 422 invalid · 429 rate limited (`Retry-After` header) |
| Dates | Habit check-ins and tasks use the **user's local calendar day** (`YYYY-MM-DD`). Times of day are 24 h `HH:MM`. Timestamps are ISO-8601 with offset. |
| Time zone | Set once with `PATCH /profile { timezone }` (also updates the engine's copy). "Today" everywhere on the server is the user's local today. |
| Undo | Deletes of habits, tasks, notifications and conversations are soft; each has `POST …/{id}/restore` for the Undo toast. |
| IDs | UUIDs. |

## Sign-up to Home

1. `POST /auth/signup {email, password, name, timezone}` → 201 user. A **4-digit code** is emailed.
2. `POST /auth/verify-email {email, code}` → **tokens** (no separate login needed). Wrong code → 400, five wrong → 429.
3. `POST /devices {token, platform}` with the Expo push token (idempotent; call on every launch).
4. Onboarding: `PATCH /onboarding {name, wake_time, sleep_time, goals, nudge_style, completed}`. Send `nudge_style` as the tone id (`gentle` | `firm` | `mix`); it also becomes the live tone setting. Map the quiz buckets to times, e.g. wake `7-8` → `07:30`, sleep `1030-12` → `23:15`.
5. Starter habits: `POST /habits` for each (mobile picks them; Free allows 3).

Password rule (same on both sides): 8+ chars, a capital, a number, a special character.
Forgot password: `POST /auth/forgot-password` → `POST /auth/verify-reset {email, code}` → `POST /auth/reset-password {email, code, new_password}`. Keep the code in memory between the screens.
Sign out: `DELETE /devices?token=…` then `POST /auth/logout {refresh_token}`.

## Screen → endpoint map

| Mobile screen | Calls |
|---|---|
| Home | `GET /habits` (has `done_today`, `done_last_7d`, `streak`), `GET /tasks?status=all&from=<today>` , `GET /streak`, `GET /notifications?unread=true&limit=1` (badge = `unread_count`) |
| Habits tab | `GET /habits`, `POST /habits`, `PATCH /habits/{id}`, `DELETE /habits/{id}`, `POST /habits/{id}/restore` |
| Check a habit in/out | `POST /habits/{id}/complete` / `…/uncomplete` with optional `{on: "YYYY-MM-DD"}` (default today, last 60 days only; idempotent) |
| Habit detail (week strip, history) | `GET /habits/{id}/completions?from&to` or all habits at once `GET /habits/completions` |
| Streak screen | `GET /streak` (`current`, `best`, `active_today`), milestones are computed on the client |
| Tasks tab | `GET /tasks?status=all|upcoming|overdue|completed&from&to`, `POST /tasks`, `PATCH /tasks/{id}`, `POST /tasks/{id}/complete|uncomplete|restore`, `DELETE /tasks/{id}` |
| Progress → Habits | `GET /analytics/habits?period=weekly|monthly[&phrase=true]` |
| Progress → Tasks | `GET /analytics/tasks?period=weekly|monthly[&phrase=true]` |
| Weekly report | `GET /analytics/report/weekly` |
| Notifications (bell) | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `DELETE /notifications/{id}`, `POST /notifications/{id}/restore` |
| Chat | `POST /chat` (SSE, below), `GET /conversations`, `GET /conversations/{id}`, `DELETE /conversations/{id}` (+ `/restore`) |
| Voice mode | record → `POST /speech/transcribe` (raw audio body, `audio/*`) → send the text to `POST /chat` with `via: "voice"` |
| Settings → Notification | `GET/PATCH /preferences` (`push_enabled`, `voice_enabled`, `morning_summary_enabled`, `weekly_report_enabled`, `streak_alerts_enabled`) |
| Settings → Quiet hours | `PATCH /preferences` (`quiet_enabled`, `quiet_start`, `quiet_end`, `quiet_repeat_days` Monday=0, `quiet_allow_priority`). "Weekend quiet hours" = add 5 and 6 to `quiet_repeat_days`. |
| Settings → AI voice & tone | `PATCH /preferences` (`reminder_tone`, `use_name_in_reminders`, `include_streak_in_reminders`, `use_emojis_in_reminders`) |
| Settings → Wake/Sleep, stacking | `PATCH /onboarding {wake_time}` / `{sleep_time}`; `PATCH /preferences {habit_stacking_enabled}` |
| Profile / Edit profile | `GET /profile`, `PATCH /profile {name, timezone}`, `POST /profile/avatar` (raw PNG/JPEG/WebP body), `DELETE /profile/avatar` |
| Change email | `POST /auth/change-email {new_email, password}` → code sent to the new address → `POST /auth/confirm-email-change {code}` |
| Change password | `POST /auth/change-password {current_password, new_password}` → **new tokens** (other sessions are signed out; replace the stored pair) |
| Subscription | `GET /subscription` (plan, limits, usage), `PUT /subscription {plan, period}` (stub, see below) |
| Privacy → Download my data | `GET /account/export` (JSON file) |
| Privacy → Clear chat history | `DELETE /conversations` |
| Send feedback / Rate | `POST /feedback {category, message, app_version?, platform?}` / `{category: "rating", stars}` |
| Delete account | `POST /auth/delete-account {password}` |

## Field mapping

**Habit** (mobile → API): `name`→`name`, `emoji`→`emoji`, `category`→`category`, `timeOfDay` `Morning|Afternoon|Evening` → `time_of_day` lower-case, `frequency` `Daily|Weekdays|Weekly` → `frequency` lower-case, `goalDays`→`goal_days` (defaults 7/5/1), `stackedAfter`→`stacked_after_id`. Today's tick = `done_today`; the week count = `done_last_7d`; per-habit streak = `streak.current`. Dated history comes from the completions endpoints (replace the client's `completions[]` with those).

**Task**: `title`, `notes`, `priority` `High|Medium|Low` → lower-case, `date` (local day), `startTime`/`endTime` → `start_time`/`end_time` (`null` = all day; end defaults to start + 1 h), `repeat`. The server returns `status` (`upcoming|overdue|completed`), `done`, `all_day` and `due_at`, so the client no longer needs to compute overdue.

**Notification**: `kind` (`nudge|summary|streak|insight|system`), `title`, `body`, `read`, `created_at`, `habit_id`. The client chooses the destination screen from `kind`.

## Chat stream (`POST /chat`)

Body: `{ message, conversation_id?, via: "text"|"voice" }`. Response is `text/event-stream`; events in order:
`conversation {id, title}` → `message {content}` → optional `tool_results`, `proposal {id, tool, summary, …}`, `budget` → `meta` → `done`. Errors arrive as an `error` event.

- React Native has no `EventSource`; read the response body as a stream (`expo/fetch` supports it) and parse `event:`/`data:` frames.
- The model only sees messages of the given `conversation_id`. Omit it to start a new thread and keep the returned id.
- **Proposals** (e.g. "push my 10am deep work to 11"): nothing is written until the user confirms with `POST /proposals/{id}/confirm` (or `/reject`). The mobile app has no confirm UI yet.

## Push notifications

Register the Expo push token with `POST /devices`. The worker (`make worker`) decides what to send, stores it in the inbox and then pushes it. The device shows it using the channel `habit-reminders`. Remote push does not work in Expo Go on Android; use a development build. The app's local-reminder scheduling should be switched off once server push is on, or users will get both.

## Plans

Free: 3 habits, 5 tasks per day. Exceeding a limit returns **402** with a readable `detail`. `PUT /subscription` is a **stub** (`BILLING_STUB_ENABLED=true`) that flips the plan without taking payment; replace it with the store/webhook flow before launch (returns 501 when disabled).

## Backend setup needed for a real run

```
cd nudgeai_backend
make db-migrate        # alembic upgrade head (migrations 0003–0009 are new)
make run               # API on :8079
make worker            # the nudge worker (separate process)
```

`.env` additions (see `.env.example`): `RESEND_API_KEY` and an `EMAIL_FROM` on a domain verified in Resend (the default sender only reaches the Resend account owner), `CORS_ORIGINS`, `MEDIA_DIR` (persistent volume), `EXPO_ACCESS_TOKEN` (optional), `META_API_KEY`/`BASETEN_API_KEY`, `MUSE_VOICE_MODEL`, `JWT_SECRET` (32+ bytes outside dev).

## Known gaps and things to verify

- **Meta voice transcription URL is unverified.** Meta documents a realtime WebSocket (`wss://api.meta.ai/v1/asr/realtime`); the HTTP upload route used by `POST /speech/transcribe` follows the `/audio/transcriptions` convention and may need changing (`MUSE_VOICE_URL`). Confirm against Meta's docs before demoing voice with a real key. Without a key a deterministic fake answers.
- **Recurring tasks**: `repeat` is stored but instances are not generated yet.
- **Weekly report as a push/inbox item** (`weekly_report_enabled`) is a setting only; nothing generates it on a schedule yet.
- **`quiet_allow_priority`** is stored for future task nudges; the engine only nudges habits today.
- **Photo → tasks (multimodal)** and the **agent trace view** from the plan are not built.
- Avatars are stored on local disk; use object storage if the API runs on more than one host.
