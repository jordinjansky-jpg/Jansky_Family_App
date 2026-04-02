


# Daily Rundown — Full Rebuild Specification

## Project Overview

Daily Rundown is a family task management and accountability app. It schedules chores and responsibilities across family members, tracks completion with a grading system, and gamifies the experience for kids. The app runs on phones primarily, syncs in real time across devices, and deploys to Cloudflare Pages via GitHub push with zero build step.

This is a ground-up rebuild. The previous version was a single 5,500-line HTML file that grew through 21 iterative sessions. The result worked but felt cobbled together. This rebuild should feel purpose-built, modular, and easy to maintain.

### Architecture

**Multi-Page Application (MPA)** with shared ES modules. No framework. No build step. Plain HTML files with `<script type="module">` imports. Each major feature gets its own page. Shared logic lives in reusable `.js` modules.

**Why MPA:** Future changes should only require touching the relevant page file and possibly one shared module. A bug on the scoreboard page should never require opening the admin page's code. Token efficiency for iterative development is a primary design goal.

**Module imports:** All ES module imports must use relative paths with explicit `.js` extensions (e.g., `import { fn } from './shared/firebase.js'`). Bare imports break without a bundler and this project has no build step.

### Deployment

- **Hosting:** Cloudflare Pages
- **Repo:** GitHub — push to `main` branch triggers auto-deploy (~30s)
- **Domain:** `daily.jansky.app` (Cloudflare Registrar)
- **Requirements:** No build step, no bundler, no compilation. The repo contains the final files exactly as served.

### Firebase

- **Service:** Firebase Realtime Database
- **Project:** `jansky-home`
- **Config:**
```javascript
{
  apiKey: "AIzaSyDNQxQ0UB1muam2yNrUr8fBIYzUjGIxHuM",
  authDomain: "jansky-home.firebaseapp.com",
  projectId: "jansky-home",
  storageBucket: "jansky-home.firebasestorage.app",
  messagingSenderId: "876304971688",
  appId: "1:876304971688:web:74e78ecbad586b2f2d4f9d",
  databaseURL: "https://jansky-home-default-rtdb.firebaseio.com"
}
```
- **CRITICAL:** Existing data lives under `cleaning/*` paths. DO NOT read from or write to these paths. Use `rundown/` as the root path for all new data. The old app runs in parallel until the new one is ready.

---

## Non-Negotiables

These requirements cannot be compromised:

1. **Real-time sync** across all devices. Changes on one phone appear on another within seconds.
2. **Mobile-first.** The primary use case is phones. Every interaction must feel native on a small screen.
3. **Modular isolation.** A change to one page must never require changes to unrelated pages. Shared modules have clear, single responsibilities.
4. **Schedule immutability.** Once a day starts (midnight in the configured timezone), that day's schedule is locked. Only future days can be modified by the scheduler.
5. **Kid mode is a separate, safe, fun experience.** Kids cannot access admin functions, cannot see adult-only features, and get age-appropriate celebrations and interactions.
6. **Admin debug tools are comprehensive enough to troubleshoot without touching code.** Copy-paste debug output replaces guesswork.
7. **No build step.** The repository contents are the deployed files. `git push` is the deploy command.
8. **Graceful degradation.** Poor network = loading state, not broken state. Never show a blank screen.
9. **Future-proof navigation.** The nav structure must accommodate additional pages without redesign.
10. **Phased build.** Claude must build one phase at a time, validate each phase against its checkpoint criteria, then proceed. Never implement future phases early.

---

## Simplicity Rule

When multiple valid implementations exist, choose the simplest, most deterministic one. Readable beats clever. Avoid optimization unless the spec requires it. If two approaches produce the same result, pick the one a competent developer can understand at a glance without comments.

---

## Output Rules

These rules apply to every file Claude produces during this build:

- **Short explanations:** No more than 5 lines of commentary per file before delivering the code.
- **Minimal output:** Only output new or changed files. Reference unchanged files by name.
- **Diffs for small changes:** When editing an existing file and fewer than 30 lines change, prefer a diff or targeted edit over a full rewrite.
- **Readability over cleverness:** Function names over one-liners. Named constants over magic numbers. Comments explain WHY, not WHAT.

---

## State & Module Discipline

These rules apply to every shared module and page file.

### Shared Modules — Pure Functions Only
- No DOM access. No `document.querySelector`. No event listeners. Ever.
- No side effects. Pass data in, get results out.
- No global state mutations. State is held in pages, not modules.
- Modules may import from other modules but never from page files.

### Pages — Own the DOM
- DOM manipulation lives in page files only.
- Event binding lives in page files only.
- Pages import functions from shared modules and call them with data.
- Pages are responsible for rendering the results.

### State Flow
All state flows through explicit function calls. No implicit shared state. No module-level variables that accumulate across calls. If two pages need the same data, both request it from Firebase — they do not share a module-level cache.

---

## Firebase Schema

The schema is defined here and locked after Phase 1. No path, key format, or data shape changes after Phase 1 without a documented migration plan approved before touching data.

All data lives under `rundown/` root.

```
rundown/
├── settings/                        ← App config (single object)
│   ├── appName                      string
│   ├── familyName                   string
│   ├── timezone                     string (IANA, e.g. "America/Chicago")
│   ├── adminPin                     string
│   ├── recoveryPin                  string (hardcoded fallback, set at setup)
│   ├── weekendWeight                number (default 1.5)
│   ├── pastDueCreditPct             number (default 75)
│   ├── sliderMin                    number (default 0)
│   ├── sliderMax                    number (default 150)
│   └── theme/
│       ├── mode                     "light" | "dark"
│       ├── preset                   string
│       └── accentColor              string (hex)
│
├── categories/
│   └── {categoryKey}/               ← key is slug (e.g. "chores", "wellness")
│       ├── label                    string
│       ├── icon                     string (emoji)
│       ├── pinProtected             boolean
│       └── weightPercent            number | null
│
├── people/
│   └── {personId}/                  ← key is Firebase push ID
│       ├── name                     string
│       ├── color                    string (hex)
│       ├── role                     "adult" | "child"
│       └── kidSettings/
│           ├── showWeekView         boolean
│           ├── showCalendar         boolean
│           ├── canDelegate          boolean
│           ├── canMoveTasks         boolean
│           ├── showSlider           boolean
│           ├── celebrationsEnabled  boolean
│           └── celebrationStyle     "full" | "subtle" | "off"
│
├── tasks/
│   └── {taskId}/                    ← key is Firebase push ID
│       ├── name                     string
│       ├── rotation                 "daily" | "weekly" | "monthly" | "once"
│       ├── owners                   array of personIds
│       ├── ownerAssignmentMode      "rotate" | "duplicate"
│       ├── estMin                   number
│       ├── difficulty               "easy" | "medium" | "hard"
│       ├── category                 string (categoryKey)
│       ├── exempt                   boolean
│       ├── dedicatedDay             number | null (0=Sun through 6=Sat)
│       ├── timeOfDay                "anytime" | "am" | "pm" | "both"
│       ├── cooldownDays             number | null
│       ├── status                   "active" | "paused"
│       └── createdDate              string (YYYY-MM-DD)
│
├── schedule/
│   └── {YYYY-MM-DD}/
│       └── {entryKey}/              ← key is Firebase push ID
│           ├── taskId               string
│           ├── ownerId              string (personId)
│           ├── rotationType         "daily" | "weekly" | "monthly" | "once"
│           ├── timeOfDay            "anytime" | "am" | "pm"
│           └── ownerAssignmentMode  "rotate" | "duplicate"
│
├── completions/
│   └── {entryKey}/                  ← matches schedule entryKey exactly
│       ├── completedAt              number (Unix timestamp ms)
│       ├── completedBy              string (personId)
│       └── pointsOverride           number | null (null = use base points)
│
├── snapshots/
│   └── {YYYY-MM-DD}/
│       └── {personId}/
│           ├── earned               number
│           ├── possible             number
│           ├── percentage           number
│           ├── grade                string (e.g. "A-")
│           └── missedKeys           array of entryKeys
│
├── streaks/
│   └── {personId}/
│       ├── current                  number
│       ├── best                     number
│       └── lastCompleteDate         string (YYYY-MM-DD)
│
└── debug/
    └── eventLog/
        └── {pushId}/
            ├── type                 string (e.g. "task_completed", "schedule_rebuilt")
            ├── payload              object
            └── timestamp            number (Unix timestamp ms)
```

**Key format rules:**
- Schedule entry keys: Firebase push IDs (`-N...`)
- Completion keys: same push ID as the schedule entry they reference
- Date keys: always `YYYY-MM-DD` in the app's configured timezone
- Category keys: lowercase slug, no spaces (e.g. `chores`, `wellness`)

**Indexes:** Firebase RTDB does not support cross-path queries. All queries are path-based. Design reads to walk known paths. The schedule is keyed by date first — querying a date range means fetching `schedule/YYYY-MM-DD` for each date.

---

## File Structure

```
/
├── index.html              ← Dashboard (today view, home screen)
├── calendar.html           ← Calendar (day/week/month views)
├── scoreboard.html         ← Grades, leaderboard, trends, drill-downs
├── tracker.html            ← Recurring task status by period
├── admin.html              ← Full management panel
├── kid.html                ← Kid mode experience
├── setup.html              ← First-run setup wizard
├── shared/
│   ├── firebase.js         ← Firebase init, connection, read/write helpers
│   ├── scheduler.js        ← Schedule generation, owner rotation, load balancing, cooldown
│   ├── scoring.js          ← Points formula, grade calculation, snapshot creation, aggregation
│   ├── state.js            ← State management (done, overdue, delegation, task movement)
│   ├── components.js       ← Reusable UI (task cards, bottom sheet, undo toast, nav bar, modals)
│   ├── theme.js            ← Theme application, dark mode, admin-configured styles
│   └── utils.js            ← Date/time helpers, formatting, escaping, timezone handling
└── styles/
    └── common.css          ← Shared base styles, CSS variables, responsive foundations
```

### Shared Module Responsibilities

Each module exports clean functions. No module depends on DOM state from a specific page.

**firebase.js** — Initialize the Firebase app. Provide typed read/write functions for each data path. Handle connection status. Manage listener lifecycle. Provide offline detection.

**scheduler.js** — Generate and update the 90-day rolling schedule. Assign owners using rotation logic. Balance workload across people and days. Enforce cooldown periods. Handle duplicate-to-all-owners mode. Regenerate future schedule on task/people changes. Never modify past or current day.

**scoring.js** — Calculate points for a task using the formula. Calculate daily grades (earned/possible). Create daily snapshots. Aggregate snapshots into weekly, monthly, and rolling 12-month views. Handle weighted categories. Handle past-due credit percentages.

**state.js** — Manage completion state (marking tasks done/undone). Track overdue items. Handle delegation (reassigning a task instance to a different person). Handle task movement (moving a task to a different day). Provide undo capability for destructive actions.

**components.js** — Render task cards with owner color, status, and metadata. Render the bottom sheet with task actions. Render undo toast notifications. Render the bottom navigation bar. Render confirmation modals. Render loading states.

**theme.js** — Apply the active theme (light/dark/custom). Read theme settings from Firebase. Provide toggle functionality. Manage CSS custom properties.

**utils.js** — Date math (today, day keys, week boundaries, month boundaries). Timezone-aware date handling using the configured timezone. Format minutes as `Xh:Ym`. Format dates. HTML escaping. Generate unique IDs.

---

## Setup Wizard (setup.html)

On first load (empty database), the app redirects to a setup wizard. The wizard collects:

1. **App name** and **family/group name** (subtitle)
2. **Timezone** — dropdown with common options, auto-detect as default
3. **People** — add family members with name, color (from palette), and role (adult or child)
4. **Categories** — starts with defaults (Chores, Wellness, Fitness, Education, Behavior), can add/edit/remove. Each category has: emoji icon, label, optional PIN protection, optional weight percentage
5. **Theme** — pick from preset themes (light warm, dark, etc.) and accent color
6. **Admin PIN** — set the PIN for admin access
7. **First tasks** — optional, can skip and add later

On completion, writes all settings to Firebase and redirects to the dashboard.

### Factory Reset

Available in admin. Deletes ALL data under `rundown/`. Clears local storage. Redirects to setup wizard. Requires PIN + typing a confirmation word (e.g., "RESET") to execute. This is the nuclear option.

---

## Data Model

### Task
- **id** — unique identifier (Firebase push ID)
- **name** — display name
- **rotation** — `daily` | `weekly` | `monthly` | `once`
- **owners** — array of person IDs eligible to be assigned this task
- **ownerAssignmentMode** — `rotate` (default) | `duplicate`
  - `rotate`: one owner per rotation period, selected by rotation index and load balancing
  - `duplicate`: create a separate schedule entry for every person in `owners[]` — every owner gets their own instance every rotation period
  - Works with `timeOfDay: both` — in duplicate mode, each owner gets both AM and PM instances
  - Example: Brush Teeth with `owners=[all 4 family members]`, `duplicate`, `timeOfDay=both` → 8 entries/day. Dishes with `owners=[Jordin, Sam]`, `rotate` → 1 entry/day alternating.
- **estMin** — estimated minutes to complete
- **difficulty** — `easy` | `medium` | `hard`
- **category** — references a category key
- **exempt** — boolean, if true skips workload balancing (uses pure rotation)
- **dedicatedDay** — optional, forces placement on a specific day of week (0=Sun through 6=Sat; not applicable to daily tasks)
- **timeOfDay** — `anytime` | `am` | `pm` | `both` (both splits into two virtual task instances with independent completion tracking)
- **cooldownDays** — optional number. After completion, this task cannot be scheduled again for N days. Cooldown is per-task (not per-person). Does not apply to daily tasks
- **status** — `active` | `paused`. Paused tasks are excluded from scheduling but retain their configuration
- **createdDate** — auto-set on creation. Task cannot appear on days before this date

### Person
- **id** — unique identifier (Firebase push ID)
- **name** — display name
- **color** — hex color code
- **role** — `adult` | `child`
- **kidSettings** — (for children only) feature flags controlling what they can see and do:
  - `showWeekView` — can see beyond today
  - `showCalendar` — can access calendar page
  - `canDelegate` — can reassign tasks
  - `canMoveTasks` — can move tasks between days
  - `showSlider` — can see/use the points slider
  - `celebrationsEnabled` — show completion celebrations
  - `celebrationStyle` — `full` | `subtle` | `off`

### Category
- **key** — unique string identifier (slug)
- **label** — display name
- **icon** — emoji
- **pinProtected** — boolean, requires admin PIN to mark tasks complete in kid mode
- **weightPercent** — optional number (0-80). If set, this category's tasks are always worth this percentage of the daily score regardless of task count. Weighted base points calculated dynamically: `regularTaskPts × (W / (100 - W))`

### Schedule Entry
A schedule entry represents one task instance on one specific day.
- **taskId** — references a task
- **ownerId** — the assigned person
- **rotationType** — which rotation generated this entry
- **timeOfDay** — inherited from task (or `am`/`pm` for split tasks)
- **ownerAssignmentMode** — inherited from task (`rotate` | `duplicate`)
- **key** — Firebase push ID (used as the completion record key)

### Completion Record
- **key** — matches the schedule entry's push ID
- **completedAt** — Unix timestamp (ms)
- **completedBy** — person ID (may differ from assigned owner if delegated)
- **pointsOverride** — number | null (null = use calculated base points)

### Daily Snapshot
The atomic unit of historical scoring. Created at end-of-day rollover. Immutable once created.
- **date** — YYYY-MM-DD
- **personId** — keyed per person
- **earned** — total earned points
- **possible** — total possible points
- **percentage** — earned / possible × 100
- **grade** — letter grade string
- **missedKeys** — array of entry keys for tasks not completed

Weekly, monthly, and rolling 12-month grades are derived by aggregating daily snapshots at render time. Do not store separate weekly/monthly snapshots.

### App Settings
- **appName**, **familyName**, **timezone**, **adminPin**, **recoveryPin**
- **weekendWeight** — default 1.5
- **pastDueCreditPct** — default 75
- **sliderMin** / **sliderMax** — default 0 / 150
- **theme** — mode, preset, accentColor
- **categories** — map of category definitions

---

## Scheduling Engine

### Overview

The scheduler generates a 90-day rolling schedule stored in Firebase. It runs automatically when tasks or people change and during daily rollover. It only modifies future dates — past and current days are immutable.

### MANDATORY Implementation Order

`scheduler.js` must be built in this exact sequence. Validate each step before writing the next:

1. **Basic schedule generation** — daily rotation only, single owner (first in array), no load balancing, no cooldown
2. **Owner rotation** — deterministic rotation for multi-owner tasks (weekly rotates by ISO week mod owner count, monthly by month number mod owner count)
3. **Cooldown checks** — skip placement if task was completed within `cooldownDays` calendar days
4. **Load balancing** — distribute workload across people and days based on `estMin` (LAST, after all other logic works)
5. **Duplicate-to-all-owners mode** — for `ownerAssignmentMode: 'duplicate'`, generate one entry per owner instead of rotating

Do not proceed to the next step until the current step is validated against real data in Firebase.

### Schedule Generation

When triggered (task added/edited/deleted, person added/removed, daily rollover, manual rebuild):

1. Determine today's date in the configured timezone
2. For each day from tomorrow through day 90:
   - For each active task, determine if it should appear on this day based on rotation
   - Check completion state: if a weekly task was already completed this week, skip; same for monthly within the month
   - Check cooldown: if task was completed within the last N days (by any person), skip
   - If `ownerAssignmentMode === 'duplicate'`: create one schedule entry per owner
   - If `ownerAssignmentMode === 'rotate'`: assign one owner via rotation index and load balancing
   - If `timeOfDay === 'both'`: for each assigned owner slot, create one `am` entry and one `pm` entry with separate push IDs
3. Write updated future schedule to Firebase. Do not touch today or past entries.
4. On task/people changes, look back to start of current month to verify no duplicate placements for already-completed weekly/monthly tasks

### Rotation Rules

**Daily:** Appears every day. Rotate mode rotates the assigned person by day. Duplicate mode creates an entry for every owner. Non-exempt tasks use load balancing. Exempt tasks use strict rotation.

**Weekly:** Appears once per week. Rotate mode: owner assigned by ISO week number mod owner count. Placed on the assigned person's lightest day unless a dedicated day is set. Cooldown checked against last completion.

**Monthly:** Appears once per month. Rotate mode: owner assigned by month number mod owner count. Distributed across weeks within the month to avoid clustering. Placed on the assigned person's lightest day within the assigned week. If not completed in its assigned week, pushes forward to a future day within the month.

**Once:** Appears once. Placed on the best available future day. After completion, status changes to `paused` on the next weekly boundary.

### Owner Rotation

Rotation must be deterministic — same inputs always produce the same assignment. Rotation index is derived from the period (ISO week number for weekly, month number for monthly), not from completion history. This means the schedule is reproducible from task and people data alone.

### Load Balancing

For non-exempt tasks in rotate mode:
- Track estimated minutes per person per day
- Weekend days have configurable higher capacity (default 1.5× weekday)
- Prefer placing tasks on the assigned person's lightest day
- After initial placement, check if overall weekly load is skewed and rebalance if the gap exceeds a reasonable threshold

Load balancing does not apply to duplicate mode — all owners always get an entry.

### Cooldown

When a task has `cooldownDays` set:
- After completion (by any person), do not place this task again for N calendar days
- Check against actual completion date, not scheduled date
- Does not apply to daily tasks
- Scheduler reads `completions/` records to determine cooldown status

### Virtual Tasks (AM/PM Split)

When `timeOfDay === 'both'`:
- Create 2 schedule entries per owner slot: one `timeOfDay: 'am'`, one `timeOfDay: 'pm'`
- Each gets its own unique push ID and independent completion record
- Combined with duplicate mode: 2 entries × N owners per occurrence

---

## Scoring & Grading

### Points Formula

```
points = difficultyMultiplier × (1 + estMin / 30)
```

Difficulty multipliers: Easy = 1, Medium = 2, Hard = 3. Round to nearest integer.

Example: Medium, 15 min = `2 × (1 + 0.5)` = 3 points.

### Daily Score

```
percentage = (earnedPoints / possiblePoints) × 100
```

- **Possible:** Sum of base points for all tasks assigned to that person on that day
- **Earned:** Sum of points for completed tasks
- Per-person — each person grades independently regardless of workload size

### Letter Grades

| Range | Grade |
|-------|-------|
| 97-100 | A+ |
| 93-96 | A |
| 90-92 | A- |
| 87-89 | B+ |
| 83-86 | B |
| 80-82 | B- |
| 77-79 | C+ |
| 73-76 | C |
| 70-72 | C- |
| 67-69 | D+ |
| 63-66 | D |
| 60-62 | D- |
| 0-59 | F |

Each grade tier must have a distinct color applied consistently across all pages.

### Weighted Categories

If a category has `weightPercent` set (e.g., Behavior at 35%):
- Tasks in that category always represent exactly that percentage of the person's daily score
- Weighted base points calculated dynamically: `regularTaskPoints × (W / (100 - W))`
- `regularTaskPoints` = sum of base points for all non-weighted tasks for that person that day
- Weighted tasks default to 100% credit on the current day until adjusted via slider or day ends

### Per-Instance Points Slider

Available in the task bottom sheet:
- Range is configurable in settings (default 0–150%)
- Shows live preview of person's daily grade at the selected value
- Setting to 100% clears the override (`pointsOverride: null`)
- For weighted category tasks: slider represents % of weighted base
- For regular tasks: slider adjusts raw points proportionally

### Past-Due Completion Credit

When an overdue task is completed late: `basePoints × (pastDueCreditPct / 100)`. Default 75%. Configurable in admin.

### Snapshots & Aggregation

**Daily snapshots** created at end-of-day rollover. Immutable once created. Capture earned, possible, percentage, grade, and missed task keys per person.

**Aggregated views** derived at render time:
- Weekly = sum(earned Mon-Sun) / sum(possible Mon-Sun)
- Monthly = same across all days in the month
- Rolling 12-month = same across last 365 days of snapshots

### Streaks

Consecutive days where a person completes all assigned tasks. Track current length, best length, and last complete date. Update at daily rollover.

---

## Pages

### Dashboard (index.html)

The home screen. Shows today's tasks and the current week at a glance.

**Primary view:** Today's tasks grouped by rotation type (Daily, Weekly, Monthly, One-Time). Each task shows owner initial/color, task name, time estimate, and points value. Tap to toggle completion. Long-press for bottom sheet.

**Week strip:** Compact 7-day view. Each day shows completion progress and grade. Today is highlighted and expanded. Past days muted. Future days show scheduled task count.

**Person filter:** Horizontal bar with color-coded person pills. Tap to filter all content to that person. "All" shows everyone.

**Overdue card:** Distinct card for overdue tasks. Includes "mark all complete" with undo. Each task is individually actionable.

**Quick Add:** No PIN required. Streamlined task creation form.

**Header:** App name, subtitle, current date, filtered person's weekly grade and time total.

**Day completion:** When all tasks are done, trigger visual celebration (confetti, card animation). Sink completed days below active ones.

**Mark-all-complete per day:** Button on day card header. Marks all tasks done with undo support.

### Calendar (calendar.html)

Browse and manage the schedule across time.

**Three views:**
- **Day view:** Full detail for a single day. All tasks with complete metadata.
- **Week view:** 7-day layout with task cards per day. Swipe or arrow to navigate weeks.
- **Month view:** Calendar grid. Each day shows colored density/completion indicators. Tap to drill into day view. Swipe between months.

All views support person filter.

**Task interaction:** Tap to complete. Long-press for bottom sheet (delegate, move, slider, edit). Moving a task shows a date picker constrained by rotation rules:
- Weekly: same week only
- Monthly: same month only
- "Skip" marks the task as intentionally missed for its current period

**Schedule visibility:** Full 90-day window. Past days show completion status. Future days show the generated schedule.

### Scoreboard (scoreboard.html)

Grades, competition, and progress tracking.

**Grade summary cards:** Each person's grade for today, this week, this month, and rolling 12-month. Tappable for drill-down.

**Leaderboard:** Ranked by current week's grade. Shows per-category breakdown, total time contributed, and streak. Long-press a person for task-level detail.

**Trends:** Grade movement over time. Show improving or declining direction week over week. Visualization type (line chart, sparklines, etc.) is engineer's choice.

**Category breakdown:** Per-person performance per category for the selected period.

**Streaks:** Current and best streak per person.

**Drill-down pattern:** Long-press a time period → per-person breakdown. Long-press a person → task-level detail with status (Done, Late, Overdue, Missed, Moved, Pending).

### Task Tracker (tracker.html)

Status of recurring tasks across their rotation periods.

**Purpose:** Answer "which weekly/monthly tasks are done, upcoming, or overdue?" at a glance. Not a scoring view — a completion checklist.

**Views:**
- **Weekly tasks:** Status of each weekly task in the current week (Done, Upcoming, Overdue, Skipped)
- **Monthly tasks:** Status per task in current month, grouped by assigned week
- **Filterable** by person, category, status

Each task shows name, assigned owner, assigned day/week, and current status. Done tasks show completion date. Overdue tasks are visually distinct.

### Admin (admin.html)

Full management panel. PIN-protected.

**Task Management:**
- Filterable list (by rotation, owner, category, difficulty, status)
- Edit any task property
- Pause/unpause tasks
- Delete tasks (with confirmation)
- Bulk actions where practical

**Task create/edit includes `ownerAssignmentMode`:** Toggle near the owners selector — "Rotate between owners" (default) vs "Assign to all selected owners." When duplicate mode is active, display a note: "Each selected owner gets their own task instance every period."

**People Management:**
- Add, edit, remove people
- Name, color, role (adult/child)
- For children: configure kid mode feature flags

**Category Management:**
- Add, edit, remove categories
- Icon, label, PIN protection, weight percentage
- Deleting a category reassigns its tasks to Chores

**App Settings:**
- App name, family name, timezone
- Weekend weight multiplier, past-due credit percentage
- Points slider range (min/max)
- Admin PIN change

**Theme Settings:**
- Preset theme selection, accent color, dark/light mode default
- Preferences sync across devices via Firebase

**Schedule Management:**
- View 90-day schedule summary (task counts per day, load per person)
- Manual "rebuild future schedule" button — escape hatch when schedule looks wrong

**Data Management:**
- Manual snapshot trigger
- Factory reset (PIN + confirmation word "RESET", clears all `rundown/` data, redirects to setup wizard)
- Export data (JSON dump of Firebase state)

**Debug Console:**
- Toggle on/off from admin
- When active, shows contextual debug data on all pages (small bug icon in header)
- Debug mode persists in localStorage across page navigation

---

## Debug System

### Purpose

Enable troubleshooting without touching code. Debug output must be copy-pasteable into a conversation with an AI assistant for diagnosis.

### Activation

Toggle in Admin → Debug Console. Persistent indicator on all pages when active. State stored in localStorage.

### Contextual Overlays

When debug is active:

**Dashboard / Calendar:**
- Per task: base points, earned points, daily denominator, percentage contribution, cooldown status, owner assignment reason
- Per day: total possible, total earned, grade calculation breakdown, snapshot status

**Scoreboard:**
- Per grade card: which daily snapshots contribute, earned/possible sums, aggregation math
- Per person in leaderboard: full scoring breakdown

**Admin:**
- Schedule inspector: for any task, show full placement chain (rotation rule → eligible owners → load per owner per day → selected owner → selected day → cooldown check)
- Event log: last 50+ state changes with timestamps (task completed, delegated, moved, schedule regenerated, rollover executed, etc.)

### Copy to Clipboard

Every debug panel has a "Copy" button. Produces a formatted plain-text block containing:
- Current page and view state
- All visible debug data
- Timestamp
- Active filters
- Relevant Firebase path keys

---

## Shared Interactions

These behaviors are consistent across all pages.

### Bottom Sheet

Long-press any task (on any page) to open a bottom sheet with contextual actions:

- **Task info:** Name, rotation type, assigned owner, category, difficulty, time estimate, points value
- **Placement reasoning:** Human-readable explanation of why this task is on this day and assigned to this person (e.g., "Load-balanced: Jordin had the lightest load on Wednesday" or "Assigned to all owners: duplicate mode")
- **Complete / Uncomplete:** Toggle completion state
- **Points slider:** Adjust earned points for this specific instance. Shows live grade preview. 100% clears the override.
- **Delegate:** Reassign to a different person. Shows person chips. Selecting a person requires picking a day (today or future). Moves the task off the current person's view. Includes revert option.
- **Move:** Move to a different day. Date picker constrained by rotation rules. Includes "Skip" to mark intentionally missed.
- **Edit:** Opens task in admin edit form (requires PIN)

After delegation or move, state reflects immediately across all devices.

### Undo System

Any destructive or bulk action provides an undo toast:
- Appears at bottom of screen for ~4 seconds
- Shows what happened with an Undo button
- Tapping reverts the action
- Applies to: marking tasks done, marking all done for a day, marking all overdue done, delegation, task movement, skip

### Daily Rollover

At configured timezone midnight (or on first load after midnight):

1. Create daily snapshot for the day that just ended — earned, possible, percentage, grade, missed task keys — BEFORE any force-marking
2. For uncompleted past tasks:
   - Daily tasks: count as missed (score penalty, no carry-forward)
   - Weekly/monthly/once tasks: move to overdue card
3. Visually mark past days as dimmed/complete
4. Extend the 90-day schedule window forward by one day
5. Update streaks

### Multi-Device Conflict Handling

Last-write-wins on individual completion records is acceptable. The schedule is generated and stored in Firebase — all clients read the same data. UI must not show stale state for more than a few seconds. Firebase RTDB listeners handle this natively.

### Offline Behavior

If Firebase connection drops:
- Show visual indicator (sync status dot)
- Allow read-only browsing of last loaded state
- Queue writes and sync on reconnect (Firebase RTDB handles this natively for web)
- Never show a blank screen or crash

---

## Navigation

### Bottom Navigation Bar

Present on all pages except Kid View and Setup Wizard. Four items:

| Icon | Label | Page |
|------|-------|------|
| Home | Dashboard | index.html |
| Calendar | Calendar | calendar.html |
| Trophy | Scoreboard | scoreboard.html |
| Checklist | Tracker | tracker.html |

Active page is visually highlighted. Navigation uses standard `<a>` links (MPA, no client-side routing).

### Header

Present on all pages. Contains:
- App name (left)
- Current context info: filtered person's grade, date, etc. (center/right)
- Gear icon → Admin (right, present on all pages except Kid View)

### Extensibility

The nav bar component must accommodate 5-6 items without redesign. Adding a future page requires: creating the HTML file, adding one entry to the nav configuration, and linking the shared modules. No other files should need changes.

---

## Design Direction

### Broad Aesthetic

Clean, warm, family-friendly. Not clinical or corporate. Should feel like a well-made household tool, not enterprise software. Personality without being childish — kid mode is the exception and should be playful and fun.

### Admin-Configurable

- Light / dark mode (toggle accessible from any page)
- Preset themes (at minimum: light warm, dark, and 1-2 others)
- Accent color selection
- Preferences sync across devices via Firebase

### Mobile-First

- Touch targets minimum 44px
- Bottom sheet pattern for contextual actions (not modals or dropdowns)
- Swipe gestures where natural (calendar navigation)
- No hover-dependent interactions
- Responsive: functional on tablets and desktop, optimized for phones

### Typography & Spacing

Use clean, readable fonts. Ensure sufficient contrast, generous touch targets, and comfortable information density on small screens. Font choices are the engineer's call.

---

## Kid View (kid.html)

A separate, child-friendly experience. Activated via URL parameter (e.g., `?kid=Lexi`).

**No shared navigation bar.** Standalone view. The child sees only their own tasks.

**Default experience:**
- Today's tasks only (with overdue if any)
- Color-coded banner with the child's name and color
- Stats bar: tasks done, today's grade, week grade, month grade, current streak
- Tap a task to mark complete (fun per-task reaction: emoji shower, bounce animation, etc.)
- All tasks complete: full-screen celebration with random theme, confetti, emoji rain

**PIN-protected categories:** Tasks in PIN-protected categories show a lock icon. Tapping requires admin PIN before marking complete.

**Graduated permissions:** Each child's `kidSettings` controls visibility and actions. As kids grow, the admin enables more:
- `showWeekView`: see tasks beyond today
- `showCalendar`: access a simplified calendar
- `canDelegate`: reassign tasks
- `canMoveTasks`: move tasks between days
- `showSlider`: see the points adjustment slider
- `celebrationsEnabled` / `celebrationStyle`: control celebration intensity

The bottom sheet in kid mode is read-only by default. Permissions expand it as flags are enabled.

**Access control:** Kid mode is only accessible via the `?kid=` URL parameter. There is no link from kid mode back to the main app. Kids cannot navigate to admin, the main dashboard, or any adult features unless explicitly enabled.

---

## Build Phases

Build the app in this sequence. **Each phase is mandatory and must be validated before proceeding.** Phases are not optional, not reorderable, and not combinable. Never implement features from a future phase during an earlier one.

---

### Phase 1: Foundation

**Build:** Firebase connection (`firebase.js`), utility functions (`utils.js`), theme system (`theme.js`), common CSS (`common.css`), navigation bar shell (`components.js`), setup wizard (`setup.html`).

**Firebase schema is finalized in this phase.** All paths, key formats, and data shapes are locked after Phase 1 validation. Schema changes after this point require a documented migration plan.

**Result:** Running the app for the first time shows the setup wizard. Completing it writes settings, people, and categories to Firebase. Navigating to the dashboard shows an empty page with working navigation, theme toggle, and header displaying configured app name and family name.

**Validate before proceeding:**
- [ ] Setup wizard completes and all data appears correctly under `rundown/` in Firebase console
- [ ] Navigation between all pages works (pages may be empty shells)
- [ ] Theme toggle works and persists via localStorage
- [ ] Dark/light mode applies correctly across pages
- [ ] App deploys to Cloudflare Pages successfully via `git push`
- [ ] No data written to `cleaning/*` paths

### 8. **Project Governance File (MANDATORY)**
PROJECT GOVERNANCE FILE (MANDATORY)
Phase 1 Task: Create CLAUDE.md alongside the code saved at the root level of this project.

Purpose: Single source of truth for project state, rules, gotchas, progress. Claude MUST:

Review this file before every session ("Reviewing CLAUDE.md...")

Update it after every phase

Reference it in all responses

Required sections (update after each session):

text
# Daily Rundown Rebuild - Governance
**Current Phase:** [1-9] | **Status:** [In Progress | Validated | Complete]  
**Next Milestone:** [Clear description]

## Architecture Decisions
- Firebase root: `rundown/`
- Module rules: [Pure shared / Page DOM]
- Schema: [Locked after Phase 1]

## Gotchas (Critical)
- [Scheduler edge cases, Firebase races, etc.]
- [Add as discovered]

## Changelog  
YYYY-MM-DD Phase X: [2-line summary]
YYYY-MM-DD Phase Y: [2-line summary]

text

## Backlog
- [Postponed features]
- [Known issues]
- [Next phase blockers]
File stays ~200 lines max. Even if chat history is lost, this file + spec + code = full restart.

Make a Git Repository for this project. Make clean commit messages, save them locally and then push them to GitHub so that we always have a saved version of the project. So it is easy to revert back incase we ever need to make changes. So setup a git repository, configure everything, and use Git and GitHub for the rest of the project.  

---

### Phase 2: Data & Scheduling

**Build:** Task data model and Firebase CRUD (`firebase.js`), scheduling engine (`scheduler.js` — in the mandatory order: basic → rotation → cooldown → load balancing → duplicate mode), schedule storage in Firebase.

**Result:** Tasks can be created (via a temporary simple form or Firebase console). The scheduler generates a 90-day schedule and writes it to Firebase. Schedule entries are viewable in Firebase console. Changing a task triggers automatic schedule regeneration for future dates.

**Validate before proceeding:**
- [ ] Create tasks with different rotations and verify schedule entries appear correctly in Firebase
- [ ] Owner rotation distributes correctly across people (verify determinism: same task + same people = same rotation order)
- [ ] Load balancing prefers lighter days (verify by checking estMin distribution per person per day)
- [ ] Cooldown prevents placement within the specified window
- [ ] Past and current days are never modified when schedule regenerates
- [ ] Weekly/monthly tasks are not duplicated when already completed in the current period
- [ ] Duplicate mode creates N entries (one per owner) for each rotation occurrence
- [ ] `timeOfDay: both` creates separate AM and PM entries with distinct push IDs
- [ ] Duplicate mode + `timeOfDay: both` creates 2× N entries (verified manually for a 2-person task)

---

### Phase 3: Dashboard

**Build:** Dashboard page (`index.html`), task card component, completion toggling, person filter, overdue card, quick add form, undo toast, day-complete celebration, state management for done/undone (`state.js`), bottom sheet shell (`components.js`).

**Result:** The core daily experience works. Open the app, see today's tasks, tap to complete, filter by person, see overdue items, add new tasks via quick add.

**Validate before proceeding:**
- [ ] Tasks appear for today with correct owners
- [ ] Tapping a task marks it done and syncs across 2 devices within a few seconds
- [ ] Person filter shows/hides tasks correctly
- [ ] Overdue card shows missed tasks from past days
- [ ] Quick add creates a task and schedule updates
- [ ] Undo works on single task completion and bulk day completion
- [ ] Celebration fires when all tasks for a day are complete
- [ ] Completion state persists across page reloads

---

### Phase 4: Calendar

**Build:** Calendar page (`calendar.html`), day/week/month views, task movement with date picker and rotation-period constraints, skip functionality, schedule browsing.

**Result:** Full calendar navigation. View any day/week/month. Move tasks between days. Skip tasks. See the full 90-day schedule.

**Validate before proceeding:**
- [ ] Day, week, and month views render correctly
- [ ] Swiping navigates between weeks/months
- [ ] Person filter applies across all views
- [ ] Moving a weekly task constrains to same week only
- [ ] Moving a monthly task constrains to same month only
- [ ] Skip marks task as intentionally missed and removes from view
- [ ] Tapping a day in month view drills into day view
- [ ] Task movement syncs across devices

---

### Phase 5: Scoring

**Build:** Points calculation, grade system, weighted category math, per-instance slider, past-due credit, daily snapshots, snapshot aggregation for weekly/monthly/12-month, streak tracking (`scoring.js`). Wire grades into dashboard and calendar displays. Implement daily rollover logic.

**Result:** Grades appear on task cards, day headers, and person filter. Slider adjusts per-instance points. Daily rollover creates snapshots and handles overdue transition. Streaks update.

**Validate before proceeding:**
- [ ] Points formula produces correct values for each difficulty/time combination (manually verify 3+ examples)
- [ ] Daily percentage calculates correctly (manually verify earned/possible for a known day)
- [ ] Weighted category tasks show correct weighted base points
- [ ] Slider adjusts points and shows live grade preview
- [ ] Past-due tasks earn reduced credit when completed
- [ ] Daily rollover creates snapshot with correct data before midnight processing
- [ ] Weekly/monthly/12-month grades aggregate correctly from daily snapshots
- [ ] Streaks increment on all-complete days and reset on missed days
- [ ] Letter grade boundaries are correct (spot-check A+, B, C-, F)

---

### Phase 6: Scoreboard

**Build:** Scoreboard page (`scoreboard.html`), grade summary cards (today/week/month/12-month), leaderboard, trends visualization, category breakdowns, streak display, drill-down interactions.

**Result:** Full scoring visibility. Grades at every time horizon. Family comparison. Drill into any grade for task-level detail.

**Validate before proceeding:**
- [ ] Grade cards show correct values matching dashboard
- [ ] Leaderboard ranks correctly by weekly grade
- [ ] Drill-down shows per-person task detail with accurate status labels
- [ ] Category breakdown matches actual task completion
- [ ] Trends show grade direction across multiple weeks
- [ ] Streaks display correctly per person
- [ ] All data matches what's in Firebase snapshots (spot-check 2+ people)

---

### Phase 7: Task Tracker

**Build:** Task tracker page (`tracker.html`), weekly and monthly task status views, filtering by person/category/status, period-based completion tracking.

**Result:** At-a-glance view of recurring task status. Which weekly tasks are done? Which monthly tasks are overdue?

**Validate before proceeding:**
- [ ] Weekly view shows all weekly tasks with correct status
- [ ] Monthly view groups tasks by assigned week correctly
- [ ] Status labels are accurate: Done, Done Late, Upcoming, Overdue, Skipped
- [ ] Filters narrow the view correctly (person, category, status)
- [ ] Completion dates show for done tasks
- [ ] Overdue tasks are visually distinct from upcoming tasks

---

### Phase 8: Admin

**Build:** Admin page (`admin.html`), PIN gate, task CRUD with filters, people management with kid settings, category management, app settings, theme configuration, schedule management (view + rebuild), data management (factory reset, export), debug console (toggle, event log, schedule inspector, copy-to-clipboard).

**Result:** Full app management without touching code. Debug tools provide comprehensive troubleshooting capability.

**Validate before proceeding:**
- [ ] PIN gate works (correct PIN grants access, wrong PIN does not)
- [ ] Recovery PIN works as fallback
- [ ] Task create/edit/delete/pause works and triggers schedule regeneration
- [ ] `ownerAssignmentMode` toggle works in task create/edit form
- [ ] People add/edit/remove works
- [ ] Category CRUD works; deleting a category reassigns tasks to Chores
- [ ] App settings save and apply (timezone, weekend weight, past-due credit, etc.)
- [ ] Theme changes apply across all pages and sync to other devices
- [ ] Factory reset clears all `rundown/` data and shows setup wizard; does not touch `cleaning/*`
- [ ] Debug toggle enables overlays on all pages
- [ ] Copy-to-clipboard produces a plain-text block with all debug data
- [ ] Schedule inspector shows placement reasoning for a specific task
- [ ] Event log shows last 50+ state changes with timestamps

---

### Phase 9: Kid Mode

**Build:** Kid view page (`kid.html`), URL param activation (`?kid=Name`), simplified task display, stats banner, per-task celebrations, all-done celebration, PIN-protected category completion, graduated permissions based on `kidSettings`.

**Result:** Kids have their own dedicated experience. Fun, safe, and configurable as they grow.

**Validate before proceeding:**
- [ ] `?kid=Lexi` shows only Lexi's tasks for today
- [ ] Stats banner shows correct grades and streak
- [ ] Tapping a task triggers a fun visual reaction
- [ ] All-done celebration fires with random theme on full completion
- [ ] PIN-protected tasks show a lock icon and require PIN entry before marking complete
- [ ] Feature flags control visibility (toggle in admin, verify change appears in kid view)
- [ ] No navigation bar is visible
- [ ] No path from kid mode leads to admin, main dashboard, or any adult page
- [ ] Kid mode only activates via `?kid=` URL param — navigating to `kid.html` without the param shows an error or redirects

---

## Constraints & Guidelines

### What NOT to Do

- Do not read from or write to `cleaning/*` Firebase paths. Those belong to the legacy app.
- Do not require a build step, bundler, or compilation.
- Do not use a framework (React, Vue, Svelte, etc.). Plain HTML + ES modules.
- Do not use localStorage for anything that needs to sync across devices. Firebase is the source of truth. localStorage is only for local preferences (theme, debug toggle).
- Do not compute the schedule on every page load. The schedule is stored in Firebase and read by all clients.
- Do not modify past or current day schedules from the scheduler. Only future dates are mutable.
- Do not make kid mode accessible without the URL parameter.
- Do not hardcode the Jansky family data. The app must work for any family through the setup wizard.
- Do not implement features from a future phase in an earlier phase.

### Performance

- The app should feel instant on mobile.
- Schedule generation may take a moment — show a loading indicator, don't block the UI.
- Firebase listeners should be scoped to what the current page needs. Don't load scoreboard data on the dashboard.
- Minimize Firebase reads/writes. Batch where practical.

### Data Integrity

- Completion records are the most critical data. A task marked done must stay done across page reloads, device switches, and schedule regeneration.
- Daily snapshots are immutable once created. They are the historical record.
- The 90-day schedule can be regenerated at any time without data loss — completions are stored separately from the schedule.

### Code Quality

- Each shared module must be independently understandable. Reading `scoring.js` should not require understanding `scheduler.js`.
- Functions should be small and named for what they do.
- No global state mutations from within shared modules. Pass data in, get results out.
- Comments explain WHY, not WHAT. The code explains what.
