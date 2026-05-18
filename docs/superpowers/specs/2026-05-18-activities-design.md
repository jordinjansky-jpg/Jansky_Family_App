# Activities — Design Spec

**Created:** 2026-05-18
**Status:** Design approved; ready for implementation plan
**Replaces:** ROADMAP.md "Activities (Phase 1)" + "Activities (Phase 2)" — collapsed into single shipped feature

---

## 1. Overview & Scope

A new top-level page (`activities.html`) and admin section that lets any family member track time spent on habits — reading, exercise, piano, etc. — via a synced timer or manual entry. Time earns points based on a daily-or-weekly goal with a loss-aversion scoring formula that rewards exceeding the goal and penalizes missing it (penalty floored at zero per period).

ROADMAP.md previously split this into Phase 1 (tracking) + Phase 2 (rewards). Both phases collapse into this single design — Phase 1-only ships nothing usable on day 1, and the reward mechanic is fundamental to the user behavior we want.

### Surfaces

- **Phone:** More menu → Activities (via `initNavMore` overflow menu in `shared/components.js`)
- **Tablet:** Future left-rail entry per DESIGN.md §2 — out of scope for this build
- **Dashboard:** Out of scope. No widget, no banner.

### Audience

Anyone in `rundown/people/*`. Kids and adults equally. No special kid-mode gating. Activities are assigned to people via a chip-picker (same pattern as task assignment). All assigned people share one goal. Different goals → separate activity entries (e.g., "Exercise — Lexi" with 45 min/day vs "Exercise — Elijah" with 30 min/day).

### Deliverables

1. Activity admin (CRUD via `admin.html` — new "Activities" section)
2. Activities page (family-overview, by-person, with timer + manual entry + history)
3. `shared/timer.js` — reusable timer component (future Task Timer consumes the same module)
4. Scoring integration — activity earnings count toward total points (same balance kids spend in `rewards.html`)
5. Settlement worker — Cloudflare Worker handler that finalizes daily/weekly earnings at period end

### Explicitly out of scope

- Tablet left-rail layout
- Dedicated kid-mode activities page (the page in this design is for everyone)
- Dashboard widget / pace banner
- Activity categories / grouping
- Streaks / longest-day records / "perfect days" for activities
- Photos attached to sessions
- Leaderboard tab in the Activities page (eventually folds into the Scoreboard sheet)

---

## 2. Data Model

### Activity (catalog item)

```
rundown/activities/{activityId}: {
  name: "Reading",
  emoji: "📖",
  color: "#4A90E2",
  goalPeriod: "daily" | "weekly",
  goalMinutes: 45,
  pointsAtGoal: 100,
  assignedTo: { "lexi": true, "elijah": true },  // person IDs as keys
  active: true,
  createdAt: 1747500000000,
  createdBy: "admin"
}
```

### Session (raw event log — one per logged time block)

```
rundown/activitySessions/{sessionId}: {
  activityId, personId,
  startedAt, endedAt,
  durationMin,                     // computed, stored for cheap queries
  source: "timer" | "manual",
  notes,                           // optional
  createdAt, createdBy
}
```

### ActiveTimer (live state — at most one per person)

```
rundown/activeTimers/{personId}: {
  activityId,
  startedAt,
  pausedAt: null | timestamp,
  accumulatedMs                    // banked time before current resume
}
```

On Stop → write a Session record from accumulated time + clear this record. One timer per person; starting a different activity prompts "Stop Reading and start Piano?"

### Earning (settled period payout — immutable)

```
rundown/activityEarnings/{personId}/{activityId}/{periodKey}: {
  periodKey,                       // "2026-05-18" (daily) or "2026-W20" (weekly)
  goalPeriod, goalMinutes,
  actualMinutes,
  goalPercent,                     // actualMinutes / goalMinutes
  pointsAtGoal,
  earned,                          // result of the formula, floored at 0
  settledAt,
  formulaVersion: 1
}
```

Earnings are written **only by the Worker** at period boundaries. Real-time "pace points" in the UI are computed live on the client from sessions and never persisted. Only the settled Earning record is authoritative.

### Why separate from `rundown/completions/`

Activities are continuous time-based events with a goal percentage; tasks are binary done/not-done with `isLate` and `pointsOverride`. Cramming activities into completions would require fake fields (`isLate: false` always, invented `entryKey`), a magic `source: "activity"` marker to filter on, and migrations on the existing completions tree whenever the activity formula changes. Separate storage keeps the schema honest, isolates re-derivation, and makes debugging trivial — you can tell from the path whether points came from a task or an activity.

### Period boundaries

- Daily: midnight in `settings.timezone`
- Weekly: Monday 00:00 → Sunday 23:59:59 in `settings.timezone` (matches existing tracker/scoreboard convention)
- Session attribution: by `startedAt`. A session that spans midnight counts entirely toward the start-day's period. Edge case is rare and not worth special-casing.

---

## 3. Scoring Formula

### Rules

- Each activity has `pointsAtGoal` (e.g., 100) and `goalMinutes` (e.g., 45)
- Daily activities settle per day. Weekly activities settle per week.
- Floor at zero per period. No negative net within a period.
- Hit goal exactly → full points. Exceed → linear bonus. Miss → 2× penalty floored at zero.

### Pseudocode

```js
function calculateEarning({ actualMinutes, goalMinutes, pointsAtGoal }) {
  const goalPercent = actualMinutes / goalMinutes;

  if (goalPercent >= 1.0) {
    // hit or exceed — linear scaling
    return Math.round(pointsAtGoal * goalPercent);
  }

  // missed — 2× penalty against pointsAtGoal, floored at zero
  const missPercent = 1.0 - goalPercent;          // 0.05 at 95%
  const penalty = pointsAtGoal * missPercent * 2; // 10 pts at 95%
  return Math.max(0, Math.round(pointsAtGoal - penalty));
}
```

### Worked examples (45 min/day goal, 100 pts at goal)

For misses, penalty = `100 × missPercent × 2`. Earned = `max(0, 100 − penalty)`. For hits, earned = `100 × goalPercent`.

| Actual | Goal % | Calculation                | Earned |
|--------|--------|----------------------------|--------|
| 90 min | 200%   | 100 × 2.0                  | 200    |
| 60 min | 133%   | 100 × 1.333                | 133    |
| 47 min | 104%   | 100 × 1.044                | 104    |
| 45 min | 100%   | 100 × 1.0                  | 100    |
| 43 min | 96%    | 100 − (0.044 × 200) = 91.1 | 91     |
| 30 min | 67%    | 100 − (0.333 × 200) = 33.3 | 33     |
| 23 min | 51%    | 100 − (0.489 × 200) = 2.2  | 2      |
| 22 min | 49%    | max(0, 100 − 102.2)        | 0      |
| 0 min  | 0%     | max(0, 100 − 200) → floor  | 0      |

The break-even point where earnings hit zero is 50% of goal (22.5 min for a 45 min goal). Below that, the floor kicks in.

### Daily pace for weekly goals (UI guidance, not part of scoring)

```js
function paceMinutesToday(actualMinutesThisWeek, goalMinutes, daysRemainingInWeek) {
  // daysRemainingInWeek includes today
  return Math.max(0, Math.ceil(
    (goalMinutes - actualMinutesThisWeek) / daysRemainingInWeek
  ));
}
```

At 0 min done on Monday → pace 26 min/day. Miss Monday → Tuesday morning pace becomes 30 min/day (the target rises to keep the weekly goal reachable). Once `actualMinutesThisWeek >= goalMinutes` → pace returns 0 and the UI shows "Goal hit! Bonus territory."

### Formula version

The Earning record stores `formulaVersion: 1`. If we change the math later, increment the version and write a one-shot migration that recomputes existing earnings from sessions. Historical Earning records remain readable with their original formula version.

---

## 4. Activities Page UI

File: `activities.html` with inline `<script type="module">`. Same shape as `scoreboard.html` (sticky header, content shell, sheet mount, bottom nav). Theme and dev banner standard.

### Layout

```
┌─────────────────────────────────────────┐
│ Activities                  [+ Manage]  │  ← sticky header, [+ Manage] admin-only
├─────────────────────────────────────────┤
│  [ Today ]  [ This Week ]  [ History ]  │  ← chip tabs
├─────────────────────────────────────────┤
│                                          │
│  ── ACTIVE TIMERS ──   (only if any)    │
│  ┌─────────────────────────────────────┐│
│  │ Lexi · Reading          ⏱ 04:32    ││
│  │                 [ PAUSE ]  [ STOP ] ││
│  └─────────────────────────────────────┘│
│                                          │
│  ── LEXI ──                              │
│  ┌─────────────────────────────────────┐│
│  │ 📖 Reading       Weekly 180 min     ││
│  │ ███████░░░  18 / 22 min today       ││
│  │                       wk: 45 / 180  ││
│  │              [ ▶ Start ]  [ + Log ] ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ 🏃 Exercise      Daily 45 min       ││
│  │ ██████░░░░  28 / 45 min             ││
│  │              [ ▶ Start ]  [ + Log ] ││
│  └─────────────────────────────────────┘│
│                                          │
│  ── ELIJAH ──                            │
│  ┌─────────────────────────────────────┐│
│  │ 🏃 Exercise      Daily 30 min       ││
│  │ ██████████  30/30 min ✓ Goal hit    ││
│  │              [ ▶ Start ]  [ + Log ] ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
[ bottom nav: Home  Kitchen  Scores  Rewards  More ]
```

### Tabs

Three chip-style tabs (not full tab bar):

- **Today** (default): each card shows today's progress. Daily activities show progress against today's goal. Weekly activities show today's pace progress as the primary bar + week-to-date as a small secondary line ("wk: 45 / 180").
- **This Week**: each card shows week-to-date progress. Weekly activities show full weekly bar. Daily activities show "X/Y days hit" with mini per-day dots.
- **History**: chronological session list, most recent first, grouped by day. Row format: `📖 Lexi · Reading · 32 min · 9:15am`. Tap a row → opens session edit sheet (Section 5).

### Per-person grouping rules

- Order: `kid: true` people first (alphabetical), then adults (alphabetical) — matches scoreboard convention
- People with zero assigned activities are hidden — no "Mom — no activities assigned" empty sections
- Each person section header is the person's name in their assigned color

### Active timer card

- Big timer readout (`mm:ss` under 1hr, `hh:mm:ss` over)
- `[ PAUSE ]` ↔ `[ RESUME ]` toggle
- `[ STOP ]` writes the session and clears the active timer
- Shown above all person sections (full-width). Multiple stacked if multiple people have running timers.

### Card actions

- `[ ▶ Start ]` — starts a timer for this person on this activity. If a timer is already running for this person on a different activity, opens a confirm: "Stop Reading and start Exercise?" If on the same activity, no-ops.
- `[ + Log ]` — opens manual entry sheet (Section 5), pre-filled with this activity + this person.
- Tap on the card body — no-op in Phase 1.

### Sub-states on cards

- `✓ Goal hit` chip when `actualMinutes >= goalMinutes`
- Inactive activities (toggle off) hidden entirely from non-admin views
- For weekly cards on the Today tab: primary bar is today's pace progress; secondary line shows week-to-date

### Empty states

- No activities exist at all: "No activities yet. Admin can add some from More → Admin → Activities." Admin sees a `[+ Manage]` button at top right.
- Person has no activities assigned: their section is hidden.
- No active timers: the "ACTIVE TIMERS" section is hidden entirely.

### [+ Manage] button

Top-right, admin only. Navigates to `admin.html#activities`. No inline create from the Activities page in Phase 1.

---

## 5. Timer & Manual Entry

### Timer state machine

```
   ┌──────────┐  Start    ┌─────────┐  Pause   ┌────────┐
   │ no timer │ ────────► │ running │ ───────► │ paused │
   └──────────┘           └─────────┘ ◄─────── └────────┘
        ▲                      │       Resume     │
        │ Stop (writes Session)│                  │
        └──────────────────────┴──────────────────┘
```

### Start

1. Check `rundown/activeTimers/{personId}`. If exists for different activity → confirm-and-replace. Same activity → no-op.
2. Write `rundown/activeTimers/{personId}: { activityId, startedAt: now, pausedAt: null, accumulatedMs: 0 }`.
3. Client starts a 250ms `setInterval` for the cosmetic readout. Firebase is the canonical source.

### Pause / Resume

- **On Pause:** `accumulatedMs += (now - startedAt)`; set `pausedAt: now`.
- **On Resume:** `startedAt = now`; clear `pausedAt`.
- **Readout:** always `accumulatedMs + (pausedAt ? 0 : now - startedAt)`.

### Stop

1. Compute `durationMs = accumulatedMs + (running ? now - startedAt : 0)`.
2. `durationMin = Math.max(1, Math.round(durationMs / 60000))` — minimum 1 min logged (avoids zero-minute sessions from accidental Start+Stop).
3. Write `rundown/activitySessions/{sessionId}: { activityId, personId, startedAt, endedAt: now, durationMin, source: "timer", createdAt, createdBy }`.
4. Delete `rundown/activeTimers/{personId}`.
5. Toast: `"Session saved · 32 min · Reading"`.

### Cross-device sync

- Each device viewing the Activities page subscribes to `rundown/activeTimers/*`.
- Any change → UI re-renders the active timer section.
- A device that's not running the timer locally still shows the live readout, computed from Firebase `startedAt` + `accumulatedMs`. Any device can tap STOP.
- Pause/Resume from one device updates Firebase → all other devices reflect immediately.

### Abandonment

- Timer state lives in Firebase; closing the browser doesn't stop it.
- No auto-stop. A forgotten timer accrues until someone explicitly stops it.
- **Sanity guard:** when displaying an active timer, if `(now - startedAt) > 6 hours`, show a `⚠ Forgotten?` chip next to the readout. Doesn't auto-cancel — just hints.

### Manual entry sheet

Opens from `[+ Log]` on an activity card or from a History-tab session row (in edit mode). Built from `fs-*` primitives per DESIGN.md §5.23.

Fields:
- **Person** — chip picker, pre-filled with the card's person (limited to people the activity is assigned to)
- **Date** — `fs-date-btn` pill, defaults to today, picker for past dates
- **Duration** — number input, minutes, required, ≥1
- **Notes** — text input, optional, single line

Sticky `fs-footer` with `Cancel` / `Save`. Save writes a Session record with `source: "manual"`. Toast: `"Manual entry saved · Reading · 30 min · Lexi"`.

### Editing / deleting sessions

- History tab: tap a session row → opens the manual entry sheet in edit mode, with a 🗑️ button in the header.
- Edit a session: rewrites the existing record.
- Delete a session: removes the record.
- If the session falls in a previously-settled period, the client deletes the matching Earning record after the session edit/delete. The worker re-creates the Earning record on the next cron tick. Idempotent.

### Edit permissions (Phase 1 reality)

The app has no per-user authentication today — only admin PIN gating. There is no enforceable concept of "your own" session vs someone else's in Phase 1.

- **Anyone with device access** can edit/delete any session via the History tab. The "anyone can edit/delete their own; admin can edit anyone's" rule is the intended permission model, but it cannot be enforced without auth.
- **Admin PIN required** for: hard-deleting an activity (the "Delete with History" destructive option in admin), and the `[+ Manage]` button on the Activities page (which navigates to admin).
- When per-user auth is added later, the History tab will gate edit/delete by `createdBy === currentUserId` (with admin override). The schema already stores `createdBy` on every Session for this future check.

---

## 6. Admin Form

Location: new "Activities" section in `admin.html`. Same shape as Tasks/Rewards admin. Reachable via More → Admin → Activities, or via the `[+ Manage]` button on the Activities page (deep-links to `admin.html#activities`).

### List view

```
ADMIN  ›  Activities                           [+ Add Activity]

  📖  Reading                                       [ ON ]
      Weekly 180 min · 100 pts · Lexi, Elijah

  🏃  Exercise — Lexi                               [ ON ]
      Daily 45 min · 100 pts · Lexi

  🏃  Exercise — Elijah                             [ ON ]
      Daily 30 min · 100 pts · Elijah

  🎹  Piano                                         [ ON ]
      Weekly 90 min · 100 pts · Lexi

  📺  Screen time                                   [ OFF ]
      Daily 60 min · 0 pts · Lexi, Elijah
```

Tap row → edit sheet. Right-side toggle is the `active` switch (soft enable/disable without opening the form). Inactive activities show greyed in this list and are hidden from the Activities page entirely.

### Add / Edit form

Composed from `fs-*` primitives per DESIGN.md §5.23:

```
┌─────────────────────────────────────┐
│ ✕     Edit Activity         ✓  🗑️   │  ← renderFormSheetHeader
├─────────────────────────────────────┤
│ Name           [Reading___________]  │
│ Emoji          📖    [tap to pick]   │  ← renderEmojiPicker
│ Color          ●     [tap to pick]   │  ← renderColorButton
│ Goal period    [ Daily ] [ Weekly ]  │  ← renderChipPicker (single)
│ Goal minutes   [ 180 ] min           │
│ Points at goal [ 100 ] pts           │
│ Assigned to    [Lexi] [Elijah]       │  ← renderChipPicker (multi)
│                [Mom]  [Dad]          │
│ Active         [   ●  ON  ]          │  ← renderSwitchToggle
├─────────────────────────────────────┤
│         [ Cancel ]  [ Save ]         │  ← renderFormFooter (sticky)
└─────────────────────────────────────┘
```

### Validation

- **Name:** required, ≤50 chars, trimmed
- **Emoji:** required (one)
- **Color:** required
- **Goal period:** required (daily or weekly)
- **Goal minutes:** required, integer 1–1440 if daily, 1–10080 if weekly
- **Points at goal:** required, integer 0–1000 (zero allowed for tracking-only activities like "Screen time")
- **Assigned to:** ≥1 person required
- Save button stays disabled until all required fields are valid. Footer Save and header ✓ stay in sync per §5.23 v2.

### Delete (🗑️ in header on edit mode)

- If activity has zero sessions: hard delete after confirm.
- If activity has sessions: confirm shows `"This activity has 47 logged sessions. Mark inactive instead?"` with two options:
  - **Mark Inactive** (default) — sets `active: false`, keeps activity + sessions + earnings
  - **Delete with History** — typed-confirmation prompt for the activity name; hard delete activity + all its sessions + all its earnings. Destructive option requires extra friction.

### Edit semantics

- Changing `goalMinutes`, `pointsAtGoal`, or `goalPeriod` on an active activity triggers re-settlement of the current period (next cron tick). Past periods stay as-settled — historical Earning records record `formulaVersion` and the goal values in effect at settlement time.
- Removing a person from `assignedTo` hides the activity from their Activities page going forward; their past sessions and earnings remain visible in History.

---

## 7. Settlement Worker + Scoring Integration

### Worker branches

`workers/kitchen-import.js` `runScheduled` gains two new branches. Both fire every 5 min via existing cron. Both idempotent.

**`runDailySettlement`** — fires on every tick. For each person:
1. Compute "yesterday" relative to `settings.timezone` (the worker already does this for overdue reminders).
2. `periodKey = YYYY-MM-DD` for yesterday.
3. Read all active activities where `goalPeriod === "daily"` and the person is in `assignedTo`.
4. For each (person, activity, yesterday):
   - Read all sessions where `personId === <person>` and `activityId === <activity>` and `startedAt` is within yesterday's local midnight-to-midnight window.
   - Sum `durationMin` → `actualMinutes`.
   - Apply the scoring formula → `earned`.
   - Write `rundown/activityEarnings/{personId}/{activityId}/{periodKey}` (idempotent — overwrites any existing record for that key).

**`runWeeklySettlement`** — same shape, but uses last week's Mon–Sun window and `periodKey = YYYY-W##` (ISO week). Only fires when "now" is past Monday 00:00 in `settings.timezone` AND that week hasn't been settled yet (cheap read guard).

### Re-settlement for edited/deleted sessions

When a client edits or deletes a session whose date falls in a previously-settled period, the client itself deletes the matching Earning record. The worker re-creates it on the next cron tick along the same idempotent path. No separate re-settle flag is needed.

### Scoring integration — `shared/scoring.js`

Existing (pseudocode):
```js
function getTotalPoints(personId, dateRange) {
  return sumCompletionsInRange(personId, dateRange);
}
```

Becomes:
```js
function getTotalPoints(personId, dateRange) {
  return (
    sumCompletionsInRange(personId, dateRange) +
    sumActivityEarningsInRange(personId, dateRange)
  );
}

function sumActivityEarningsInRange(personId, dateRange) {
  // Read rundown/activityEarnings/{personId}/*/*
  // Filter by periodKey falling in dateRange (parse YYYY-MM-DD or YYYY-W##)
  // Sum `earned` field
}
```

Anywhere that currently calls "total points for person" switches to `getTotalPoints`. Activity earnings naturally flow through to scoreboard, grade calculation, and rewards point balance.

### Streaks

Phase 1 keeps streaks as a task-only concept. Activities don't feed into the existing streak counter. A future enhancement could add an activity-specific streak (days in a row hitting all daily goals) but that's not in this build.

### Display on existing screens

- **Scoreboard:** per-person totals automatically include activity earnings. No separate "Activities" line in Phase 1 — points are just included in totals.
- **Rewards:** balance shown to kids automatically reflects new totals. No `rewards.js` changes — it reads from scoring.
- **Tracker:** task status only. Activities don't appear on Tracker in Phase 1.
- **Dashboard:** no Activities widget in Phase 1.

---

## 8. File Map & Build Order

### New files

| File | Purpose |
|---|---|
| `activities.html` | Top-level page. Sticky header, content shell, sheet mount, bottom nav, inline `<script type="module">` for page logic. Mirrors `scoreboard.html` shape. |
| `shared/timer.js` | Reusable timer component. Exports: `createTimer({personId, activityId, onTick, onStop})`, helpers for computing elapsed from a Firebase active-timer record. Future Task Timer consumes the same module. |

### Modified files

| File | Change |
|---|---|
| `shared/firebase.js` | ~10 new helpers: `readActivities`, `writeActivity`, `deleteActivity`, `readActivitySessions`, `writeActivitySession`, `editActivitySession`, `deleteActivitySession`, `readActiveTimer`, `writeActiveTimer`, `clearActiveTimer`, `readActivityEarnings`. |
| `shared/scoring.js` | Add `sumActivityEarningsInRange`. Update `getTotalPoints` (or the existing wrapper) to include it. Update internal callers of "task total points" to use the new aggregate. |
| `shared/components.js` | `initNavMore` — add `{ page: 'activities', label: 'Activities' }` to overflow menu items. Add card renderers (`renderActivityCardForPerson`, `renderActiveTimerCard`) and manual entry sheet builder. |
| `admin.html` | New "Activities" admin section with list view + form sheet, mirroring Tasks/Rewards patterns. |
| `workers/kitchen-import.js` | Add `runDailySettlement` and `runWeeklySettlement` branches in `runScheduled`. Helpers: `settlePersonActivityForPeriod`, `computeActualMinutes`, `applyScoringFormula`. |
| `sw.js` | Bump `CACHE_NAME` to `family-hub-v329`. Add `activities.html` and `shared/timer.js` to precache list. |
| `docs/DESIGN.md` | Add new section documenting Activities page layout + scoring formula. Update §2 feature-home map row 1.6 from "future" to "shipped". |
| `docs/ROADMAP.md` | Collapse Phase 1 + Phase 2 entries into single "Activities — shipped 2026-XX-XX" entry on deploy. |

### Build order

Each step is independently testable.

1. **Schema + Firebase helpers** — `shared/firebase.js` first. Manually seed a few activities in `rundown-dev/` to verify reads/writes.
2. **Admin section** — `admin.html` Activities CRUD. Real activities now creatable through the UI.
3. **`shared/timer.js`** — timer module, no UI consumer yet. Testable via a small harness.
4. **Activities page** — `activities.html`. Render cards, wire up Start/Stop using the timer module + Firebase active-timer records. Manual entry sheet.
5. **Scoring integration** — `shared/scoring.js`. Once sessions exist, totals start including activity earnings on next render.
6. **Settlement worker** — `workers/kitchen-import.js`. Until shipped, `rundown/activityEarnings/` stays empty and `sumActivityEarningsInRange` returns 0. First end-of-day cycle after deploy writes real earnings.
7. **SW cache bump** — `sw.js` precache + version bump. Last step before shipping.
8. **DESIGN.md + ROADMAP.md updates** — final commit, marks shipped.

### Risk callouts

- **Worker settlement is the highest-bug-risk step.** Batch logic with timezone math has historically tripped this app (per the worker commits in the push-notifications work). Ship it last. Verify against one known-good test family member before relying on it for the whole family.
- **Service worker cache bump.** The new files must be in the precache list or the page 404s on first load post-deploy. Verify against `sw.js` before deploying.
- **Firebase write fan-out at midnight is fine.** ~5 people × ~3 daily activities = 15 writes per night. Well under any rate limit.

---

## 9. Open questions deferred to implementation

None blocking the plan. The following are decided-but-low-stakes details that will surface during build:

- Exact color tokens / spacing for the Activities page cards — follow existing tokens; no new tokens needed
- Specific copy strings for confirms and toasts — write during build to match the app's voice
- Where the History tab gets its session sort key when two sessions have identical `startedAt` — use `createdAt` as tiebreaker
