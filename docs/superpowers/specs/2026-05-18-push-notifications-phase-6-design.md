# Push Notifications — Phase 6 Design

**Status:** Spec · awaiting review
**Date:** 2026-05-18
**Builds on:** [Phase 1 spec](2026-05-15-push-notifications-design.md) (which Phases 2-5 fully implemented)

---

## Goal

Close the visible gaps left after Phase 5 by adding seven targeted improvements: recurring-event reminders (the biggest hole — Phase 2 silently skipped recurring events), one-tap Approve/Deny/Snooze actions on notifications, per-type Send test, daily overdue-task push, dinner-tonight push, and an admin notification activity log for debugging silent failures.

## Why now

- Recurring events make up the majority of real family events (every Thursday soccer, every Saturday cleanup). Without reminders for them, "replaces Google Calendar" is hollow.
- The recent dailyDigest opt-in bug surfaced because the user happened to notice the missing notification. An admin activity log would catch silent failures faster.
- Approve/Deny actions remove the "open the app, find the bell, tap approve" friction for reward requests — the most-tapped notification type in practice.
- Snooze and overdue/meal pushes are small features that round out the daily rhythm.

## Out of scope (explicit cuts)

- iOS notification actions (Apple ignores `actions` arrays; iOS users tap to open app and act there — acceptable per Phase 1).
- Per-event reminder overrides (still deferred).
- Mark-task-complete from notification (interesting but bigger scope).
- Notification analytics dashboards beyond the simple activity log.
- Per-recipient muting / quiet hours per type (overkill at family scale).
- Breakfast / lunch / school-lunch meal reminders (dinner is the one that needs a nudge).
- Snooze across other types (only event reminders get a Snooze button; bell messages and reward approvals are act-now).

---

## Architecture

### New Worker additions

1. **`nextOccurrenceInWindow(event, windowStart, windowEnd, tz)` helper** — for recurring events. Walks `event.repeat` rule (daily / weekly with `days[]` / monthly / yearly / custom with `every`+`unit`), respecting `end.type === 'date' | 'count' | 'never'`. Returns the first occurrence whose computed UTC start falls inside the window, or `null`. Ported from `shared/state.js:377` `expandEventOccurrences` but trimmed to just-this-window semantics. ~40 lines.

2. **`runEventReminders` extended** — for every recurring event, ask `nextOccurrenceInWindow` for an instance in this person's `[now+leadMin-2.5, now+leadMin+2.5]` window. If hit, treat as a real event (same dedup key shape `evt_{eventId}_{personId}_{instanceDate}` — the instance date prevents the dedup index from collapsing weekly repeats into one entry).

3. **`runOverdueReminders` new branch** — at user's `overdueTime` (default 21:00 / 9pm, opt-in), read past-week schedule entries + completions + tasks. Count entries where `entry.ownerId === personId` AND `dateKey < todayKey` AND `entryKey ∉ completions` AND `task.frequency !== 'daily'`. If > 0, push "You have N overdue tasks from earlier this week." Dedup `overdue_{personId}` per day.

4. **`runMealReminders` new branch** — at user's `mealReminderTime` (default 16:00 / 4pm, opt-in), read `kitchenPlan/{todayKey}/dinner`. The slot may be (a) `null`/missing → "No dinner planned for tonight." (b) a single recipe object → "Tonight's dinner: {recipeName}". (c) an array of vote candidates (post-v234 multi-option voting) → if a winner is selected use it; otherwise "Tonight's dinner: {N} options waiting to be voted on" with deep-link to the meal vote sheet. Dedup `meal_{personId}` per day. Family-wide content (every opted-in person gets the same body).

5. **`runPendingPushes` new branch** — drains `notifications/pending/*` for entries whose `snoozeUntilTs <= now`. Fires the stored payload via `fanoutPush`, deletes the entry. Runs every cron tick (cheap — usually empty).

6. **`POST /action` endpoint** — accepts `{ type: 'approve' | 'deny' | 'snooze', personId, messageId?, eventId?, payload? }`, HMAC-authed (same pattern as `/push`). Dispatches:
   - `approve` for reward request → reads message, writes bank token (calls existing reward-grant flow's persistence), marks message seen, posts FYI back to kid.
   - `deny` for reward request → marks message seen, posts a "denied" message to kid.
   - `snooze` for event reminder → writes `notifications/pending/{snoozeUntilTs}/{key}` with snoozeCount incremented.

7. **Activity logging** — every `fanoutPush` call writes one entry to `notifications/log/{pushId}: { ts, personId, type, sent, removed, errors, skipped?, action? }`. Capped at 200 entries; daily cleanup drops oldest beyond cap.

### Service Worker additions

- `notificationclick` handler grows to handle `event.action`:
  - `'approve'` / `'deny'` → POST to `/action` with `type` and `messageId` from `data.messageId`.
  - `'snooze'` → POST to `/action` with `type: 'snooze'` and `payload` from `data` (Worker re-fires this payload after delay).
  - No action (fall-through) → existing deep-link behavior.

### push-ui.js additions

- **Per-type Send test** — small "Test" button to the right of each enabled type toggle. Sends the appropriate type's sample payload via `/push`.
- **Overdue prefs** — new toggle + time picker (default 21:00).
- **Meal reminder prefs** — new toggle + time picker (default 16:00). Only renders when person is in the family roster (kitchen plan applies family-wide).
- **DEFAULT_PREFS** grows with `types.overdue: false`, `types.mealReminder: false`, `overdueTime: '21:00'`, `mealReminderTime: '16:00'`.

### admin.html additions

- New "Notifications" subsection in the Tools tab — table view of last 50 entries from `notifications/log/*`, newest first. Columns: time, person name, type, result (sent/removed/errors counts, or skipped reason).
- Read-only. No resend or delete buttons in Phase 6.

---

## Schema additions

### `notifications/pending/{key}`
```
{
  snoozeUntilTs: 1747867200000,   // epoch ms; cron sweeps when now >= this
  personId:      "...",
  payload:       { title, body, icon, tag, data, actions? },
  snoozedAt:     ServerValue.TIMESTAMP,
  snoozeCount:   1 | 2 | 3        // how many times the user has snoozed THIS notification
}
```
`key` is the original notification's `tag` (e.g., `evt-{eventId}-{instanceDate}`). Path keyed by `tag` (not by `snoozeUntilTs`) so the Worker can look up "have I seen a prior snooze for this notification" with a direct read on each Snooze action — needed to increment the snoozeCount correctly. `runPendingPushes` scans the whole `notifications/pending` node each tick (usually empty) and fires entries where `snoozeUntilTs <= now`.

### `notifications/log/{pushId}`
```
{
  ts:        ServerValue.TIMESTAMP,
  personId:  "...",
  personName: "Lexi",      // denormalized for admin display speed
  type:      "bellMessages" | "rewardApprovals" | ... | "overdue" | "mealReminder",
  sent:      1,
  removed:   0,
  errors:    0,
  skipped?:  "pref-disabled" | "type-disabled" | "quiet" | "no-devices",
  action?:   "approve" | "deny" | "snooze"   // present when this log entry is for an action
}
```

### `people/{id}/prefs/notifications` adds
```
types: {
  ...existing,
  overdue:       false,    // opt-in
  mealReminder:  false     // opt-in
},
overdueTime:      "21:00",
mealReminderTime: "16:00"
```

---

## Snooze cycle

User tap on Snooze button progressively lengthens the delay:

| Previous snoozeCount | Tap action | New delay | New snoozeCount |
|---|---|---|---|
| 0 (initial fire) | "Snooze 5m" | 5 min | 1 |
| 1 | "Snooze 15m" | 15 min | 2 |
| 2 | "Snooze 1h" | 60 min | 3 |
| 3+ | no Snooze button shown | — | — |

The button label on each re-fire reflects what the next tap will do. After 3 snoozes the notification fires with only `Dismiss` as an action — protects against infinite snooze loops on a forgotten event.

Snooze applies ONLY to event reminders. Bell messages, reward approvals, reward FYI, task reminders, daily digest, overdue, and meal reminders do not get a Snooze action (they're either time-sensitive or already a daily summary).

---

## Pref UI sketch (Customize → Notifications additions)

```
What to send (additions in italics)
  [✓] Bell messages
  [✓] Reward approval requests
  [✓] Reward FYI (kid spent points)
  [✓] Event reminders
      Remind me  ( 15 · 30 · 60 )  min before
  [ ] Task reminders
      Remind me at  17:00  if I have unfinished tasks
  [ ] Daily morning summary
      Send at  07:00
  [ ] Overdue task nudge                                ← new
      Send at  21:00  if I have overdue tasks            ← new
  [ ] Tonight's dinner reminder                          ← new
      Send at  16:00  with what's planned (or empty)     ← new

Each type also gets a "Test" link/button next to it. (Existing single Send-test
button on the device row is removed — per-type tests replace it.)
```

---

## Trigger pathway additions (extending Phase 1's table)

| Trigger | How it fires | Latency |
|---|---|---|
| Recurring event reminder | Same cron as event reminders; `nextOccurrenceInWindow` per recurring event | ±2.5 min |
| Approve / Deny action | User taps action on notification → SW posts to `/action` → Worker updates Firebase | ~1 sec |
| Snooze action | User taps Snooze → SW posts to `/action` → Worker writes pending entry → Cron fires on/after `snoozeUntilTs` | ±2.5 min from snooze-target time |
| Overdue task | Cron at each person's `overdueTime` | ±2.5 min |
| Meal dinner reminder | Cron at each person's `mealReminderTime` | ±2.5 min |
| Activity log write | Every push (fanoutPush) writes one log entry inline | n/a |

---

## Activity log

Worker writes one entry per push attempt. Includes the result, so silent failures (`skipped: 'pref-disabled'`, `errors > 0`, etc.) are recoverable from the log.

Admin view:
```
─ Notification activity ──────────────────────────────────
2026-05-18 17:00:02   Jordin    eventReminders   sent 1
2026-05-18 17:00:02   Lexi      eventReminders   skipped: pref-disabled
2026-05-18 16:00:01   Jordin    mealReminder     sent 1
2026-05-18 09:00:00   Jordin    dailyDigest      sent 1
2026-05-17 21:00:00   Jordin    overdue          sent 1
2026-05-17 20:14:53   Lexi      bellMessages     sent 1
...
```

Lazy cleanup: when the count exceeds 200, drop oldest 50 in batches.

---

## Phasing

One consolidated plan (similar shape to Phases 2-5). Phase boundaries within the plan:
- **6a** — recurring event reminders + per-type test (closes the biggest visible gap, ships quickly)
- **6b** — Approve/Deny/Snooze actions (SW + /action endpoint)
- **6c** — Overdue + meal reminders (new scheduled-handler branches + UI)
- **6d** — Admin activity log
- **6e** — Docs wrap-up: ROADMAP entry updated, spec status flipped to "shipped", final commit + push

Each sub-phase ends with a deployable commit so you can pause between them if needed.

---

## Risks / non-obvious gotchas

- **Recurring event dedup key needs the instance date** (`evt_{eventId}_{personId}_{instanceDate}`), not just `{eventId}_{personId}`. Otherwise the first occurrence's dedup mark blocks every future occurrence forever.
- **Snooze count must be in the pending entry**, NOT in the notification payload — the SW can't securely tell the Worker "this is my Nth snooze" without it being spoofable. Worker reads its own pending entry's count, increments, writes back.
- **Approve/Deny must validate the message exists and isn't already resolved** — race condition if user taps Approve in two places at once. Worker should treat the action as idempotent: if message is already `seen: true`, no-op gracefully.
- **iOS users see no action buttons** — Approve/Deny/Snooze are invisible. The notification body should still be informative enough that tapping → opens the app → user finds the message in the bell. Phase 6 doesn't try to solve this differently for iOS.
- **Activity log writes amplify Firebase writes** — every push now adds a log write. For a 6-person family at ~10 pushes/day each, that's ~60 extra writes/day. Free-tier headroom is fine; flag if usage grows.
- **`runPendingPushes` runs every cron tick** but most ticks find an empty pending list. Cost: one Firebase read per tick (returns null). Acceptable.
- **The previous Send test button location moves** — removed from the device row, replaced with per-type buttons. Users who learned the old position need to find the new ones. Acceptable churn (this is week-old UI).

---

## Open questions

None. All three design call-outs (snooze cycle, dinner-only, admin Tools tab) resolved with user.
