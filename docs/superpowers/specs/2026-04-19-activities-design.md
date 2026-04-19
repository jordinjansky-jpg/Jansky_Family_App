# Activities — Design Spec

**Date:** 2026-04-19
**Status:** Backlog (Phase 1 → Phase 2)
**Dependencies:** Shares categories with task system; timer component also serves backlog item 3.1 (Task Timer/Stopwatch)

---

## Overview

A family activity tracker where anyone can browse a shared library of optional activities (walk, read, jog, etc.), time themselves with a persistent stopwatch, set weekly goals, and earn rewards store points. Activities are completely separate from the task system — own schema, own scoring, own scoreboard — but share task categories and a common timer/stopwatch component.

**Two-phase build:**
- **Phase 1:** Activity library + stopwatch + session logging + activity scoreboard (time view)
- **Phase 2:** Weekly goals + tiered point payouts + goal achievement scoreboard view + kid mode activities page + admin management

---

## Pages & Navigation

### `activities.html` — Main Activities Page (nav bar entry)

Browse the activity library, start/stop timers, view personal goals and progress. Contains a header link to the activity scoreboard.

- **Nav bar:** Added as a new entry alongside Dashboard, Calendar, Scoreboard, Tracker, Admin.
- **Kid mode variant:** `activities.html?kid=Name` — simplified kid-friendly version, same pattern as `kid.html?kid=Name`. Access controlled by a per-kid toggle in people settings (`allowActivities`). When enabled, a link appears on the kid's `kid.html` page.

### `activity-scores.html` — Activity Scoreboard (linked from activities page, NOT in nav)

Leaderboard for activity time and goal achievement. Accessed via a link in the activities page header — does not get its own nav bar entry to keep nav clean.

---

## Activity Library

### Creating Activities
- **Anyone can create activities** — no PIN required. Family members add activities they want to track.
- **Admin can manage all activities** — edit, archive, remove from the admin panel.

### Activity Schema
```
rundown/activities/{pushId} ← {
  name: string,           // "Go for a Walk", "Read a Book"
  category: string,       // category key — shared with task categories
  icon: string,           // emoji
  description?: string,   // optional details/notes
  createdBy: string,      // person ID
  createdAt: number,      // timestamp
  status: 'active' | 'archived'
}
```

### Display
- Grouped by category
- Each activity shows: icon, name, category, and a "Start" button
- Active timer (if running) pinned to the top of the page with elapsed time

---

## Stopwatch & Session Logging

### Timer Behavior
- Tap "Start" on any activity to begin timing.
- Only one active timer per person at a time.
- Timer state persisted to Firebase — survives page refresh, app close, device switch.
- Tap "Stop" to end the session and log it.
- Elapsed time displayed prominently while running.

### Active Timer Schema
```
rundown/activeTimers/{personId} ← {
  activityId: string,     // which activity
  startedAt: number,      // ServerValue.TIMESTAMP
  timeoutMinutes: number  // from settings, default 60
}
```

### Smart Timeout
- **Default:** 1 hour (configurable in settings as `activityTimeoutMinutes`).
- If a timer has been running past the timeout when the user next opens the app, show a prompt: "You started [Activity] [X hours] ago — still going or did you forget?"
- Options: **"Still going"** (timer continues, timeout resets) or **"I forgot — log [timeout] minutes"** (logs a session capped at the timeout duration).
- No background process needed — timeout is checked client-side on page load by comparing `startedAt` + `timeoutMinutes` against current time.

### Completed Session Schema
```
rundown/activitySessions/{pushId} ← {
  activityId: string,
  personId: string,
  date: string,           // YYYY-MM-DD (timezone-aware, using settings.timezone)
  startedAt: number,      // timestamp
  endedAt: number,        // timestamp
  durationMinutes: number // computed and stored for fast queries
}
```

### Multiple Sessions
- Multiple sessions per activity per day allowed.
- Each session is an independent record.
- All sessions count toward goals.

---

## Weekly Goals

### Goal Model
- Goals are **weekly only**.
- Daily averages shown as a helpful reference ("that's ~25 min/day") but not a separate goal type.
- Two levels:
  - **Category-level:** "60 min of Fitness per week" — any activity in that category counts.
  - **Activity-level:** "30 min of Reading per week" — only that specific activity counts.

### Who Sets Goals
- **Parents** set goals for kids via admin.
- **Kids** can set their own goals — controlled by a per-kid toggle in people settings (`allowActivityGoals`).
- **Adults** set their own goals freely.
- **Admin** can view and manage all goals (add, edit, remove).

### Goal Schema
```
rundown/activityGoals/{pushId} ← {
  personId: string,
  targetType: 'category' | 'activity',
  targetId: string,       // category key or activity push ID
  targetName: string,     // denormalized for display
  minutesPerWeek: number, // target minutes
  basePoints: number,     // points awarded at 100% completion
  createdBy: string,      // person ID (parent or self)
  createdAt: number,
  status: 'active' | 'archived'
}
```

### Week Boundaries
- Weeks run Monday–Sunday, aligned with `settings.timezone`.
- Progress resets at the start of each new week.

---

## Points & Rewards Store Integration

### Payout Rules
- **Instant on goal hit:** The moment cumulative weekly time reaches 100% of goal, base points are awarded.
- **Bonus accrual:** Time beyond 100% keeps counting. Bonus points settled at week end (Sunday rollover).
- **Miss = nothing:** Below 100% at week end pays zero.

### Tiered Payouts
| Progress | Payout |
|----------|--------|
| < 100%   | 0 pts  |
| 100%     | base points (instant) |
| 110%     | 1.25x base (settled at week end) |
| 125%     | 1.5x base (settled at week end) |
| 150%+    | 2x base (settled at week end) |

Parent sets `basePoints` when creating each goal. Tiers are fixed (not configurable).

### Integration
- Points are added as bonus messages to the existing `rundown/messages/{personId}/` node, same as current bonus/deduction flow.
- Points feed into the existing rewards store balance — same economy as task scoring.
- Message type: `'activity-goal'` with fields for goal name, progress %, and points awarded.

---

## Activity Scoreboard (`activity-scores.html`)

### Two Views (Toggle)

**Time Leaderboard:**
- Ranked by total time spent in the current week.
- Per-person cards showing category breakdowns (bar chart or stacked display).
- Historical view: dropdown to select past weeks.

**Goal Achievement:**
- Ranked by overall goal completion percentage.
- Per-person cards showing each goal's progress (progress bar per goal).
- Rewards consistency over time — streak of weeks with all goals hit.

### Visual Style
- Follows existing scoreboard patterns: person-colored cards, theme-aware, responsive.
- Sparklines or simple trend indicators for week-over-week progress.

---

## Kid Mode Integration

### Access
- Link on `kid.html` page: "My Activities" (or similar, with an activity-appropriate emoji).
- Visibility controlled by per-kid toggle in people settings (`allowActivities`).
- Opens `activities.html?kid=Name` — kid-friendly variant.

### Kid Activities Page
- Simplified UI matching kid mode aesthetic (larger touch targets, emoji-heavy, celebration animations).
- Browse activities, start/stop timer, see current goals and progress.
- Goal-setting available if `allowActivityGoals` is enabled for that kid.
- Link to activity scoreboard from within the page.

---

## Admin Management

### Activities Tab (in admin.html)
- List all activities with edit/archive/delete.
- Create new activities.
- Manage activity categories (shared with tasks — no separate UI needed).

### Goals Management (in admin.html)
- View all goals across all family members.
- Create goals for any person.
- Edit/archive/remove goals.
- Per-kid settings: `allowActivities` (show/hide link in kid mode), `allowActivityGoals` (can kid set own goals).

### Settings
- `activityTimeoutMinutes`: Smart timeout duration (default 60).

---

## Shared Timer Component

The stopwatch UI and logic should be built as a shared module (`shared/timer.js`) so it can also be used by:
- **Task timer (backlog 3.1):** Countdown timer on task cards using `estMin`.
- **Timer-based bounties (future):** Countdown to expiration, countdown to completion.

The component handles: start/stop/pause, elapsed time display, Firebase persistence of timer state, and timeout detection. Each consumer (activities, tasks, bounties) provides its own schema and UI wrapper.

---

## Firebase Schema Summary (new nodes)

```
rundown/
├── activities/{pushId}           ← activity definitions
├── activeTimers/{personId}       ← currently running timer (one per person)
├── activitySessions/{pushId}     ← completed time sessions
├── activityGoals/{pushId}        ← weekly goals per person
└── settings
    └── activityTimeoutMinutes    ← smart timeout (default 60)
```

People settings additions:
```
rundown/people/{pushId}
├── allowActivities               ← show activities link in kid mode (default false)
└── allowActivityGoals            ← kid can set own goals (default false)
```

---

## Phase Breakdown

### Phase 1: Core Loop (~1.5-2 sessions)
- Activity library (schema, CRUD, browse UI)
- Shared timer component (`shared/timer.js`)
- Stopwatch on activities page (start/stop, Firebase-persisted)
- Smart timeout prompt UI (needed as soon as timers persist)
- Session logging
- Activity scoreboard — time leaderboard view only
- Admin: activity management
- Nav bar entry

### Phase 2: Goals & Gamification (~1.5-2 sessions)
- Weekly goals (schema, CRUD, progress tracking)
- Tiered point payouts + rewards store integration
- Activity scoreboard — goal achievement view
- Kid mode activities page (`activities.html?kid=Name`)
- Kid mode link on `kid.html` + per-kid toggles
- Admin: goal management, per-kid settings

---

## Out of Scope
- Daily/monthly goal periods (weekly only)
- Activity assignment to specific people (activities are always shared/optional)
- Integration with task scoring (separate scoreboard, separate economy input)
- Social features (comments, likes on sessions)
- GPS/location tracking for outdoor activities
