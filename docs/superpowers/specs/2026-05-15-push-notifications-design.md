# Push Notifications — Design

**Status:** Phase 1 shipped 2026-05-15 · Phases 2–5 pending
**Date:** 2026-05-15
**Roadmap entry:** MEDIUM · "Push Notifications" · `docs/ROADMAP.md`

---

## Goal

Replace Google Calendar's reminder utility with a per-person, fully customizable web-push system. Each device subscribes once; each person decides exactly what they want pushed and when. Bell messages, reward approvals, event reminders, task nudges, and daily digests all share the same delivery path.

## Why now

- Roadmap calls this "the feature that lets people stop using Google Calendar."
- All prerequisites already shipped: PWA + service worker live, Firebase Realtime DB in place, Cloudflare Worker pattern established (`workers/kitchen-import.js`), per-person prefs pattern established (`person.prefs.customize.*`).

## Out of scope (explicit cuts)

- Native iOS / Android apps — PWA only. iOS requires Safari 16.4+ and install-to-home-screen.
- Push analytics dashboards.
- Topic-based subscriptions (FCM feature; not needed at family scale).
- Audio / vibration customization beyond browser defaults.
- Per-event reminder overrides (defer to a later phase if requested).
- Two-way actionable notifications beyond Approve/Deny on reward requests.
- Cross-family sharing.

---

## Architecture

### Components

1. **Service Worker push handler** — added to `sw.js`. Receives `push` events from the OS-level push service, shows the notification, deep-links on click.
2. **Worker `POST /push` endpoint** — added to `workers/kitchen-import.js`. Accepts a signed request from a client, looks up the recipient's subscriptions, sends a VAPID-signed push to each, filters against the recipient's prefs.
3. **Worker `scheduled` handler** — new export in `workers/kitchen-import.js`. Cloudflare Cron Trigger fires every 5 minutes. Reads Firebase, computes events/tasks/digests due in the window, fans out via the same push helper.
4. **Subscribe UI** — new section in **Customize → Notifications** (per DESIGN.md §10.4 — Customize is the home for personal settings; notifications affect how a user receives data, not what the data is). Per-device enable + per-person type/timing controls.
5. **Firebase schema additions** — `pushSubscriptions/*`, `people/*/prefs/notifications`, `notifications/sent/*` (dedup index).

### Protocol: Web Push (VAPID)

One VAPID key pair generated once. Public key embedded in client. Private key + subject stored as Worker secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). The Worker signs each push request; Apple/Google/Mozilla push services verify and deliver. No FCM, no extra Firebase product.

### Trigger pathways

| Trigger | How it fires | Latency |
|---|---|---|
| Bell message (text) | Sender's client calls `/push` after writing the message | ~1 sec |
| Reward approval request | Same as bell — kid's client calls `/push` after the request write | ~1 sec |
| Reward FYI (kid spent points) | Kid's client calls `/push` after the bank write | ~1 sec |
| Event reminder | Cron sweep matches events whose start time falls in the lead window | ±2.5 min |
| Task reminder | Cron sweep at each person's `taskReminderTime` | ±2.5 min |
| Daily digest | Cron sweep at each person's `digestTime` | ±2.5 min |

The 2.5-min slack is acceptable: a 15-min event reminder fires somewhere between 17.5 and 12.5 min before the event. Avoids per-minute polling.

---

## Schema

### `pushSubscriptions/{personId}/{endpointHash}`

```
{
  endpoint: "https://fcm.googleapis.com/fcm/send/...",  // URL the OS push service exposes
  p256dh:   "BFn..._base64url",                          // device public encryption key
  auth:     "..._base64url",                             // device auth secret
  ua:       "Pixel 8 · Chrome 132",                      // human label for device-management UI
  addedAt:  ServerValue.TIMESTAMP,
  lastSeen: ServerValue.TIMESTAMP                        // touched on each successful push
}
```

`endpointHash` = first 16 chars of sha-256(endpoint). Stable, lets us upsert on re-subscribe without duplicates.

### `people/{id}/prefs/notifications`

```
{
  enabled: true,                       // master switch for this person
  types: {
    bellMessages:    true,             // parent ↔ kid texts
    rewardApprovals: true,             // kid → parent: "I want this reward"
    rewardFyi:       true,             // kid → parent: "I spent points on X"
    eventReminders:  true,
    taskReminders:   true,
    dailyDigest:     false
  },
  eventLeadMin:      15,               // 15 | 30 | 60 — minutes before event
  taskReminderTime:  "17:00",          // local time; ping if unfinished tasks remain
  digestTime:        "07:00",          // local time; morning summary
  quietHours:        { start: "21:00", end: "07:00" }    // null disables
}
```

Default for new persons: `enabled: false` (must opt in per device). All type toggles default `true` once enabled; user can prune.

### `notifications/sent/{YYYY-MM-DD}/{key}`

Dedup index so a Cron rerun doesn't double-fire.
- Event reminder key: `evt_{eventId}_{personId}`
- Task reminder key: `task_{personId}`
- Digest key: `dgst_{personId}`

Daily cleanup sweep keeps 7 days.

---

## Subscription flow

1. User opens **Customize → Notifications**. The "person being subscribed" resolves in this order: (a) `linkedPerson` if the page is `person.html?person=X` or `kid.html?kid=Y`, otherwise (b) the active dashboard person filter, otherwise (c) the UI prompts the user to pick a person before enabling. Call this Person X.
2. Status row reads: **"Off on this device · Tap to enable"**.
3. Tap → `Notification.requestPermission()` → if granted, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC })`.
4. Result `{ endpoint, keys: { p256dh, auth } }` written to `pushSubscriptions/{personX_id}/{endpointHash}`.
5. UI flips to **"On for this device · [Send test]"**.
6. **Send test** calls `/push` with a sample payload. User gets a real notification within ~1 sec — end-to-end validation.
7. **iOS fallback:** if the Notification API is unavailable, show inline help: *"On iPhone, install this app to your home screen first, then return here."*

On app open, the client checks its current subscription is still in Firebase. If not (e.g., browser rotated it or user cleared site data), it silently re-subscribes.

---

## Push payload shape

```
{
  title: "Lexi sent a message",
  body:  "I finished my chores!",
  icon:  "/app-icon.png",
  tag:   "msg-{senderPersonId}",   // collapses repeats on screen
  data: {
    url:  "/index.html?openBell=1",
    type: "bellMessages" | "rewardApprovals" | "rewardFyi" | "eventReminders" | "taskReminders" | "dailyDigest"
  },
  actions?: [                       // Android/desktop honor these; iOS ignores
    { action: "approve", title: "Approve" },
    { action: "deny",    title: "Deny" }
  ]
}
```

SW `notificationclick` handler:
- If `action === 'approve'` on a reward request → POST to Worker, update Firebase, close.
- If `action === 'deny'` → POST decline.
- Otherwise → open `data.url`, focus existing window if one is already open.

---

## Pref UI sketch (Customize → Notifications)

```
─ Notifications ──────────────────────────────────
This device: On    [Send test]    [Disable]

What to send me
  [✓] Bell messages
  [✓] Reward approval requests
  [✓] Reward FYI (when a kid spends points)
  [✓] Event reminders
      Remind me  ( 15 · 30 · 60 )  min before
  [✓] Task reminders
      Remind me at  17:00  if I have unfinished tasks
  [ ] Daily morning summary
      Send at  07:00

Quiet hours
  [✓] Don't disturb me  21:00 → 07:00
  (Bell messages and reward approvals always come through.)

─ Devices on this account ───────────────────────
  Pixel 8 · added May 12          [Remove]
  iPad · added May 14             [Remove]
─────────────────────────────────────────────────
```

All controls bind to `person.prefs.notifications`. **"Disable"** unsubscribes *this device only* — other devices keep working. **"Remove"** on a specific device deletes that subscription remotely.

---

## Worker endpoint contract

### `POST /push`

**Auth:** `Authorization: HMAC v1 <timestamp>.<hex-sha256>` where the HMAC covers `timestamp + body` with a shared secret (Worker secret `PUSH_HMAC_SECRET`, also embedded in client builds). Rejected if timestamp > 60 sec old.

**Body:**
```
{
  personId: "...",
  type:     "bellMessages" | "rewardApprovals" | "rewardFyi" | "eventReminders" | "taskReminders" | "dailyDigest",
  payload:  { title, body, data, actions? }
}
```

**Behavior:**
1. Verify HMAC + timestamp.
2. Read `people/{personId}/prefs/notifications`. If `enabled === false` or `types[type] === false`, drop with 200 + `{ skipped: "pref" }`.
3. If `type` is time-triggered (`eventReminders`, `taskReminders`, `dailyDigest`) and `quietHours` is active, drop with `{ skipped: "quiet" }`. Event-triggered types (`bellMessages`, `rewardApprovals`, `rewardFyi`) bypass quiet hours — they represent someone actively reaching out.
4. Read `pushSubscriptions/{personId}`. For each subscription:
   - Build VAPID-signed Web Push request.
   - On 201/202 → update `lastSeen`.
   - On 404/410 (Gone) → delete that subscription (device uninstalled or unsubscribed at OS level).
   - On other errors → log, continue.
5. If the trigger is from cron, write to `notifications/sent/{date}/{key}` to dedup.

Why HMAC and not full auth: the alternative is verifying Firebase ID tokens in the Worker, which requires fetching+caching Google's public keys per request. For a family-scale app the worst-case attack is "someone with the secret sends a fake notification" — and the secret is embedded in client code anyway, so it's equivalent to client-side trust. HMAC is the lightweight middle ground that prevents internet-random unauthenticated abuse.

### `scheduled` handler

Cloudflare Cron Trigger: `*/5 * * * *` (every 5 min).

Each invocation:
1. Compute current time in family timezone (`settings.timezone`).
2. Load `people`, `events`, `schedule`, `completions` (or relevant slices).
3. For each person with `prefs.notifications.enabled`:
   - **Event reminders:** if `types.eventReminders`, find events whose start ∈ `[now + eventLeadMin - 2.5min, now + eventLeadMin + 2.5min]` for which the person is an owner AND no `notifications/sent/{date}/evt_{eventId}_{personId}` exists. Push.
   - **Task reminders:** if `types.taskReminders` AND `taskReminderTime` ∈ `[now-2.5min, now+2.5min]`, count incomplete tasks for today. If > 0 and no `task_{personId}` sent today, push.
   - **Digest:** if `types.dailyDigest` AND `digestTime` ∈ window, compose summary, push, mark sent.

Same prefs/quiet-hours filtering as `/push`. Same fan-out via the shared push helper.

---

## Phasing

Each phase ships independently and adds user-visible value. The pref UI grows phase by phase so every new feature lands with its toggle.

### Phase 1 — Foundation + Messages (delivers value day 1)

- Generate VAPID keys; add `VAPID_*` and `PUSH_HMAC_SECRET` Worker secrets.
- SW push handler + notificationclick deep linking + Approve/Deny action handling.
- Worker `POST /push` endpoint with HMAC auth + per-person pref filtering.
- Subscribe / unsubscribe UI in **Customize → Notifications** with **Send test** button.
- Schema: `pushSubscriptions/*`, minimal `people/*/prefs/notifications` (enabled + 3 type toggles).
- Wire pushes to existing flows: bell-message write, reward-approval-request write, reward-FYI write.
- Pref UI surface for Phase 1: master on/off + 3 type toggles + device list (this device + remove).

**Ship value:** subscribe in 30 seconds, immediately start getting parent↔kid messages and reward approval requests as real notifications. The bell becomes useful even when the app isn't open.

### Phase 2 — Event reminders

- Add Cloudflare Cron Trigger (`*/5 * * * *`) and `scheduled` handler.
- Event reminder logic + `notifications/sent/*` dedup index.
- Pref UI grows: event reminders toggle + lead time (15/30/60).

**Ship value:** the actual Google-Calendar-killer feature.

### Phase 3 — Task reminders

- Scheduled handler also evaluates `taskReminderTime` per person.
- Counts incomplete tasks for today; pushes if > 0.
- Pref UI grows: task reminders toggle + reminder time.

### Phase 4 — Daily digest

- Scheduled handler at each person's `digestTime`.
- Summary body: *"Today: 2 events, 5 tasks. First up: Dentist at 10am."*
- Pref UI grows: digest toggle + digest time.

### Phase 5 — Quiet hours + polish

- Quiet hours enforced for time-triggered types in both `/push` (when triggered by cron) and `scheduled` handler.
- `quietHoursExempt` UI surface.
- Multi-device management (list + remove other devices, not just this one).
- `pushsubscriptionchange` SW listener for automatic re-registration when the browser rotates a subscription.

---

## Risks / non-obvious gotchas

- **iOS install requirement.** iOS Safari 16.4+ only, and only when installed to home screen. A regular Safari tab cannot subscribe. The UI must clearly surface this — not just silently fail.
- **Subscription expiry.** Browsers occasionally invalidate subscriptions. SW listens for `pushsubscriptionchange`; client also verifies on each app open and silently re-subscribes if needed.
- **Quiet hours wraparound.** `start=21:00 end=07:00` spans midnight. Check must handle wrap correctly (compare against two ranges, or use a single comparison after normalizing).
- **Cron drift.** Cloudflare Cron is "approximately every 5 min" — do not depend on exact second. The ±2.5 min slack window covers this.
- **`tag` collapsing.** Two bell messages from the same sender with the same `tag` will replace each other on screen. Use sender ID in tag, not message ID, so a stream of texts collapses (desirable). Use unique tags for event reminders so multiple events on the same day don't overwrite each other.
- **Test deliverability per browser.** Apple's push service throttles aggressively. Each phase must be tested on iOS PWA + Android Chrome + desktop Chrome before declaring done.
- **HMAC secret in client code.** Acceptable for a family app (worst case: someone reading the source sends a fake notification — they could already write directly to Firebase). Not acceptable for a multi-tenant SaaS — revisit if this app ever opens to other families.

---

## Open questions

None. Full scope and phasing locked.
