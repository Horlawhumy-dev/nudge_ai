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
4. Onboarding: read it with `GET /onboarding` (`completed` decides setup vs. Home after login), save with `PATCH /onboarding {name, wake_time, sleep_time, goals, nudge_style, completed}`. Send `nudge_style` as the tone id (`gentle` | `firm` | `mix`); it also becomes the live tone setting. Map the quiz buckets to times, e.g. wake `7-8` → `07:30`, sleep `1030-12` → `23:15`.
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
| Tasks tab | `GET /tasks?status=all|upcoming|overdue|completed&from&to`, `POST /tasks`, `PATCH /tasks/{id}`, `POST /tasks/{id}/complete|uncomplete|restore`, `DELETE /tasks/{id}[?series=true]` (the flag removes a repeating task's later occurrences too) |
| Progress → Habits | `GET /analytics/habits?period=weekly|monthly[&phrase=true]` |
| Progress → Tasks | `GET /analytics/tasks?period=weekly|monthly[&phrase=true]` |
| Weekly report | `GET /analytics/report/weekly` |
| Notifications (bell) | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `DELETE /notifications/{id}`, `POST /notifications/{id}/restore` |
| Chat | `POST /chat` (SSE, below), `GET /conversations`, `GET /conversations/{id}`, `DELETE /conversations/{id}` (+ `/restore`) |
| Photo → tasks | pick a photo → `POST /vision/extract` (raw PNG/JPEG/WebP body, ≤5 MB) → `{message, proposals[]}`; show each proposal with Add/Skip, then `POST /proposals/{id}/confirm` or `/reject` |
| "How did the AI decide?" | `meta.trace_id` arrives on every chat stream; `GET /traces/{id}`, or `GET /traces?conversation_id=` for a thread |
| Voice mode | stream the microphone over `WS /speech/live` (words appear as you speak, the finished sentence arrives ~0.5 s after you stop) → send it to `POST /chat` with `via: "voice"` → speak the reply with `POST /speech/synthesize`. Fallback if live is unavailable: `POST /speech/transcribe` (a mono 16-bit WAV body) |
| Settings → Notification | `GET/PATCH /preferences` (`push_enabled`, `voice_enabled`, `morning_summary_enabled`, `weekly_report_enabled`, `streak_alerts_enabled`) |
| Settings → Quiet hours | `PATCH /preferences` (`quiet_enabled`, `quiet_start`, `quiet_end`, `quiet_repeat_days` Monday=0, `quiet_allow_priority`). "Weekend quiet hours" = add 5 and 6 to `quiet_repeat_days`. |
| Settings → AI voice & tone | `PATCH /preferences` (`reminder_tone`, `use_name_in_reminders`, `include_streak_in_reminders`, `use_emojis_in_reminders`) |
| Settings → Wake/Sleep, stacking | `PATCH /onboarding {wake_time}` / `{sleep_time}`; `PATCH /preferences {habit_stacking_enabled}` |
| Profile / Edit profile | `GET /profile`, `PATCH /profile {name, timezone}`, profile photo: see *Profile photos* below, `DELETE /profile/avatar` |
| Change email | `POST /auth/change-email {new_email, password}` → code sent to the new address → `POST /auth/confirm-email-change {code}` |
| Change password | `POST /auth/change-password {current_password, new_password}` → **new tokens** (other sessions are signed out; replace the stored pair) |
| Subscription | `GET /subscription` (plan, limits, usage), `PUT /subscription {plan, period}` (stub, see below) |
| Privacy → Download my data | `GET /account/export` (JSON file) |
| Privacy → Clear chat history | `DELETE /conversations` |
| Send feedback / Rate | `POST /feedback {category, message, app_version?, platform?}` / `{category: "rating", stars}` |
| Delete account | `POST /auth/delete-account {password}` |

## Field mapping

**Habit** (mobile → API): `name`→`name`, `emoji`→`emoji`, `category`→`category`, `timeOfDay` `Morning|Afternoon|Evening` → `time_of_day` lower-case, `frequency` `Daily|Weekdays|Weekly` → `frequency` lower-case, `goalDays`→`goal_days` (defaults 7/5/1), `stackedAfter`→`stacked_after_id`. Today's tick = `done_today`; the week count = `done_last_7d`; per-habit streak = `streak.current`. Dated history comes from the completions endpoints (replace the client's `completions[]` with those).

**Task**: `title`, `repeat_rule` (`daily|weekdays|weekly|null`; completing a repeating task creates the next occurrence), `notes`, `priority` `High|Medium|Low` → lower-case, `date` (local day), `startTime`/`endTime` → `start_time`/`end_time` (`null` = all day; end defaults to start + 1 h), `repeat`. The server returns `status` (`upcoming|overdue|completed`), `done`, `all_day` and `due_at`, so the client no longer needs to compute overdue.

**Notification**: `kind` (`nudge|summary|streak|insight|system|reminder`), `title`, `body`, `read`, `created_at`, `habit_id`, `task_id`. The client chooses the destination screen from `kind`. A `reminder` is sent once, about 10 minutes before a task with a start time (none for all-day tasks); moving the task re-arms it. It respects quiet hours, tone and name settings, and is not counted toward habit nudge limits.

## Profile photos

Users carry `avatar_url` (full size, 512×512, cropped square around the face) and `avatar_thumb_url` (96 px, auto format/quality: use it in lists, headers and the home greeting). Both are `null` without a photo. Show the picked photo immediately and swap in the URL once saved.

1. `POST /profile/avatar/intent` → `{method, max_bytes, …}`. Check `max_bytes` on the device before uploading (resize with expo-image-manipulator if needed).
2. `method: "cloudinary"` (production): upload **straight to Cloudinary** so the app gets real progress: multipart `POST` to `upload_url` with every entry of `fields` plus the file under `file_field`. Take `secure_url` from the reply and call `PUT /profile/avatar {url}`. The server only accepts URLs that were signed for that user (400 otherwise) and deletes the previous photo.
3. `method: "api"` (no Cloudinary configured, e.g. local dev): send the raw bytes to `POST /profile/avatar`, as before. This route also works when Cloudinary is on (the server uploads for you), so it is a fine fallback if the direct upload fails.
4. A 503 from `POST /profile/avatar` means the image service hiccupped; the old photo is untouched, so offer "Try again".

Old `/media/avatars/...` URLs keep working. The signed fields expire after about an hour, so request a fresh intent per attempt.

## Live voice (`WS /api/v1/speech/live`)

Streams speech to Meta's realtime model through our server (the Meta key never reaches the phone). All messages are JSON text frames except audio, which is raw 16 kHz mono 16-bit PCM in binary frames of about 80 ms, sent in real time.

```
phone → server  {"type":"start","token":"<access token>","mode":"ENDPOINTING"}   first frame, nothing before it
                <binary audio frames>
                {"type":"stop"}                       the person ended it (tapped the mic)
server → phone  {"type":"ready"}                      connected to Meta; hold audio until you see this
                {"type":"speech","active":true|false}
                {"type":"partial","text":"…"}         the words so far; each replaces the last
                {"type":"turn","text":"…"}            the finished sentence
                {"type":"error","code":"unauthorized|busy|limit|bad_request|unavailable","message":"…"}
```

- Connecting to Meta takes about 1.5 s, so open the socket when the voice screen opens and buffer audio until `ready` (a burst of buffered audio is accepted).
- `ENDPOINTING` (the default) finishes the sentence itself about 0.4 to 0.6 s after the person stops; `PUSH_TO_TALK` finishes when you send `stop`.
- One live session per person at a time (`busy`), a rate limit, and a time limit (`LIVE_SPEECH_MAX_SECONDS`, default 120). An expired token answers `unauthorized`: refresh and reconnect once.
- Always keep the audio in memory too, and fall back to `POST /speech/transcribe` if the socket fails or doesn't answer. Neither path stores audio on the server.

## Chat stream (`POST /chat`)

Body: `{ message, conversation_id?, via: "text"|"voice" }`. Response is `text/event-stream`; events in order:
`conversation {id, title}` → `delta {content}`\* → `message {content}` → optional `tool_results`, `proposal {id, tool, summary, …}`, `budget` → `meta` → `done`. Errors arrive as an `error` event.

\* `delta` events carry the reply as it is written, so the app can show (and speak) the first words before the model has finished. `reset {}` means a later model round is replacing the words so far (a lead-in like "Let me check." before a tool ran): clear what you showed. `message` always carries the complete final text and wins over anything streamed, so a client may ignore `delta` entirely. The fast model streams word by word; the larger Meta models send their reply in one or two big chunks, so for those the text arrives all at once.

- React Native has no `EventSource`; read the response body as a stream (`expo/fetch` supports it) and parse `event:`/`data:` frames.
- The model only sees messages of the given `conversation_id`. Omit it to start a new thread and keep the returned id.
- **Proposals** (e.g. "push my 10am deep work to 11"): nothing is written until the user confirms with `POST /proposals/{id}/confirm` (or `/reject`). The mobile app has no confirm UI yet. The assistant can list, add, reschedule and complete tasks and habits this way (`task_create`, `task_update`, `task_complete`, `habit_create`, `habit_complete`); each proposal's `summary` is ready to show on the confirm button, e.g. `Change “Deep work”: start time 11:00`. Reads (`tasks_list`, `habits_list`) run immediately.

## Push notifications

Register the Expo push token with `POST /devices`. The worker (`make worker`) decides what to send, stores it in the inbox and then pushes it. The device shows it using the channel `habit-reminders`. Remote push does not work in Expo Go on Android; use a development build. The app's local-reminder scheduling should be switched off once server push is on, or users will get both.

## Plans

Free: 3 habits, 5 tasks per day. Exceeding a limit returns **402** with a readable `detail`. `PUT /subscription` is a **stub** (`BILLING_STUB_ENABLED=true`) that flips the plan without taking payment; replace it with the store/webhook flow before launch (returns 501 when disabled).

## Backend setup needed for a real run

```
cd nudgeai_backend
make db-migrate        # alembic upgrade head (migrations 0003–0011 are new)
make run               # API on :8079
make worker            # the nudge worker (separate process)
```

`.env` additions (see `.env.example`): `RESEND_API_KEY` and an `EMAIL_FROM` on a domain verified in Resend (the default sender only reaches the Resend account owner), `CORS_ORIGINS`, `MEDIA_DIR` (local fallback only), `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` (avatars; all three enable it), `EXPO_ACCESS_TOKEN` (optional), `META_API_KEY`/`BASETEN_API_KEY`, `MUSE_VOICE_MODEL`, `JWT_SECRET` (32+ bytes outside dev).

## Known gaps and things to verify

- **Voice with a real key:** both Meta routes (`/v1/asr/transcribe` and the realtime socket) are verified against the live service. Without a key a deterministic fake answers the upload route, and the live socket reports `unavailable` so the app falls back to uploading.
- **`quiet_allow_priority`** lets a high-priority task's reminder through quiet hours; habit nudges ignore it.
- Push delivery needs an EAS project id and a development build; the inbox works without them.
- Weekly reports arrive as an inbox message (title "Your weekly report") and a Monday-morning push, once the worker runs.
- Photo extraction uses the multimodal Meta model; with no key the fake client answers, so test it against a real key before demoing.
- Avatars use Cloudinary once its three keys are set; until then they sit on local disk (single host only). A direct upload the app never attaches is left behind in the `nudge/avatars` folder; clean it with a Cloudinary lifecycle rule if that matters.
