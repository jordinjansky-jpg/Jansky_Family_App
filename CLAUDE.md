# Daily Rundown Rebuild - Governance
**Current Phase:** 9 | **Status:** Complete  
**All phases complete**

## Architecture Decisions
- Firebase root: `rundown/` — NEVER touch `cleaning/*`
- Module rules: Shared modules are pure functions (no DOM). Pages own the DOM.
- Schema: Locked after Phase 1 validation. Changes require migration plan.
- Deployment: Cloudflare Pages via `git push` to `main`. No build step.
- Imports: All ES module imports use relative paths with `.js` extensions.
- Firebase SDK: Loaded via CDN (compat mode) — no npm, no bundler.

## File Structure
```
/                         ← Served as-is by Cloudflare Pages
├── index.html            ← Dashboard (Phase 3)
├── calendar.html         ← Calendar (Phase 4)
├── scoreboard.html       ← Scoreboard (Phase 6)
├── tracker.html          ← Task Tracker (Phase 7)
├── admin.html            ← Admin panel (Phase 8)
├── kid.html              ← Kid mode (Phase 9)
├── setup.html            ← Setup wizard (Phase 1)
├── shared/
│   ├── firebase.js       ← Firebase init + read/write helpers
│   ├── scheduler.js      ← Schedule generation (Phase 2)
│   ├── scoring.js        ← Points & grades (Phase 5)
│   ├── state.js          ← Completion state mgmt (Phase 3)
│   ├── components.js     ← Reusable UI components
│   ├── theme.js          ← Theme application
│   └── utils.js          ← Date/time helpers
└── styles/
    └── common.css        ← Shared styles & CSS variables
```

## Firebase Schema (`rundown/`)
```
rundown/
├── settings          ← flat object { appName, familyName, timezone, weekendWeight, theme: {...} }
├── people/
│   └── {pushId}      ← { name, color }
├── categories/
│   └── {pushId}      ← { name, icon, isEvent?, eventColor?, weightPercent?, ... }
├── tasks/
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, dedicatedDate?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt? }
│                       rotation: 'daily' | 'weekly' | 'monthly' | 'once'
│                       ownerAssignmentMode: 'rotate' | 'duplicate' | 'fixed'
│                       timeOfDay: 'am' | 'pm' | 'anytime' | 'both'
├── schedule/
│   └── {YYYY-MM-DD}/
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay }
│                       entryKey format: sched_{timestamp}_{counter}
├── completions/
│   └── {entryKey}     ← { completedAt: ServerValue.TIMESTAMP, completedBy: 'dashboard'|'calendar',
│                          pointsOverride?: number (percentage, null = use base) }
├── snapshots/
│   └── {YYYY-MM-DD}/{personId}  ← { earned, possible, percentage, grade, missedKeys[] }
├── streaks/
│   └── {personId}               ← { current, best, lastCompleteDate }
└── debug/eventLog/    ← { ...data, timestamp }
```

## Scoring System (Phase 5)
- **Points formula:** `difficultyMultiplier × (1 + estMin / 30)`, rounded to nearest integer
  - Difficulty multipliers: Easy = 1, Medium = 2, Hard = 3
- **Grade bands:** A+ (97-100), A (93-96), A- (90-92), B+ (87-89), B (83-86), B- (80-82), C+ (77-79), C (73-76), C- (70-72), D+ (67-69), D (63-66), D- (60-62), F (0-59)
- **Daily score:** `(earnedPoints / possiblePoints) × 100` — per person
- **Weighted categories:** `regularTaskPts × (W / (100 - W))` when category has `weightPercent`
- **Past-due credit:** `basePoints × (pastDueCreditPct / 100)` — default 75%
- **Streaks:** consecutive all-complete days per person (current + best)
- **Snapshots:** immutable daily records (earned, possible, percentage, grade, missedKeys) — created at rollover
- **Aggregation:** weekly/monthly/12-month grades derived from daily snapshots at render time (not stored)
- **Admin-configurable:** pastDueCreditPct, weekendWeight, sliderMin/Max, category weightPercent — all Phase 8

## Key Behavior Decisions
- Scheduler generates 90 days of future entries (tomorrow onward); new tasks also get today's entry at creation time (skipped for one-time tasks with future dedicatedDate)
- Task form: weekly/monthly show day-of-week chips (Mon-Sun); one-time shows date picker; daily hides dedicated day section
- One-time tasks with `dedicatedDate` (YYYY-MM-DD) are placed on that exact date; without it, load-balanced to lightest day
- Completion allowed on any date (no future-date blocking)
- Overdue: only non-daily tasks from past dates; daily tasks are excluded
- Completed tasks render at the very bottom of any task list (below all frequency groups)
- Task grouping order: Events → Daily → Weekly → Monthly → One-Time, then owner within group
- Task cards show point values (e.g., "3pt") alongside time estimates
- Long-press task card opens detail sheet with points slider, delegate, move (opens native date picker), skip, and edit buttons
- Points slider stores `pointsOverride` as percentage (0–150) on completion record; 100% = null (no override)
- Daily rollover creates snapshots for past days on dashboard load (fire-and-forget)
- Calendar bottom sheet locks height on open so person filter changes don't resize it
- Category emoji on cards will be a per-category toggle (Phase 8 admin setting)
- Scoreboard period tabs: Today/Week/Month/12Mo — leaderboard sorts by selected period
- Scoreboard weekly grades blend snapshots (past days) + live daily score (today) for accuracy
- Scoreboard drill-down: tap person card → bottom sheet with task-level detail (Done/Late/Missed/Pending)
- Scoreboard trends: 4-week bar sparklines per person with grade-colored fills
- Event categories: isEvent toggle enables eventColor picker, hides weight%. Events excluded from scoring (dailyPossible, dailyScore, buildSnapshot). Scheduler uses 'fixed' mode (first owner, no rotation). Cards show 📅 prefix and event-colored border. Calendar cells show stacked color bars for days with events. Admin task form shows event date picker when event category selected (auto-sets rotation to 'once'). Events sort to top of task lists.
- Theme coloredCells: Light Vivid and Dark Vivid presets set data-colored-cells attribute; CSS applies person-colored task card backgrounds (light/dark tints).
- Dashboard stats: grade badge + score % + tasks done/total + total time; updates in both date-header section and fixed header, filters by active person.
- Header: full date shown on all pages (formatDateLong), subtitle shows page name/family name, add-task button uses 📝 emoji.
- Quick-add form matches admin: includes assignment mode (rotate/duplicate), dedicated day chips (Mon-Sun + Any), scheduled date picker for one-time tasks, event date picker (📅 icon with hidden date input + showPicker()), cooldown days, exempt checkbox.
- Kid mode celebrations: 15 random victory scenes (cats, dogs, dinos, space, etc.) replace task area when all done. Confetti rain animation. 6 themed emoji burst sets for per-task celebrations. Varied all-done messages.
- Admin people: child accounts show "Link" button to their kid.html page.
- Admin tabs: responsive — scroll horizontally on mobile (min-width 56px per tab), flex-fill equally on desktop (768px+).
- Color palettes: expanded to 24 colors (people, accent, event) with smaller swatches, includes yellow and pink.
- Task deletion: cleans up all orphaned schedule entries and completions.
- Schedule key generation: counter-based (`sched_{timestamp}_qa_{counter}`) to avoid collisions in duplicate+both loops.

## Gotchas (Critical)
- Firebase RTDB compat SDK used (not modular) — all imports via `firebase.` global after CDN load
- Timezone handling: always use `settings.timezone` for date calculations, never local device time
- ES module imports MUST have `.js` extension — bare imports break without bundler
- `rundown/settings` is a flat object, not nested under a push ID
- Schedule key collisions: `Date.now()` returns same value in tight loops — always use a counter for unique keys
- Streak float comparison: DST can make day diff != exactly 1 — use `Math.abs(diff - 1) < 0.01`
- Rotation change handlers that modify label innerHTML must save/restore child elements (e.g., 📅 button) and re-bind listeners

## Changelog
2026-04-02 Bug fixes + mobile polish: Fixed duplicate+both AM/PM key collisions (counter-based keys). Task deletion now cleans up orphaned schedule entries and completions. Fixed streak float comparison for DST. Expanded color palettes to 24 colors (people, accent, event) with smaller swatches. Admin tabs responsive: scroll on mobile, flex-fill on desktop. Quick-add form parity: cooldown days, exempt checkbox, event date as 📅 icon (hidden input + showPicker). People names truncate on overflow. Gear/debug icons styled with accent background. Kid stats alignment fix.
2026-04-02 Kid celebrations + quick-add parity + header date: Kid mode victory scenes (15 random fun scenes — cats partying, dogs dancing, dinos, space aliens, etc.) replace task area when all tasks done. Confetti rain on all-done. 6 themed emoji burst sets for per-task celebrations (animals, food, space, etc.), 36 celebration emoji. Quick-add form now matches admin form: assignment mode toggle, dedicated day chips (Mon-Sun + Any), scheduled date picker. Admin task form gets event date picker (📅 icon, auto-sets rotation to once). Header shows full date on all pages. Add-task button changed to 📝 emoji. Admin category overflow fix. Kid page "Link" button in admin people.
2026-04-02 UI polish: event sorting + header redesign + mobile fixes: Event-toggled categories sort to top of task lists (new 'events' group in groupByFrequency). Header redesign with gradient background, gradient title text, rounded icon buttons. Mobile responsive fixes (flex-wrap, tighter admin padding). Admin category/badge overflow fixes. Quick-add event date picker for event categories.
2026-04-02 Phase 9: Kid Mode — Personalized child dashboard at kid.html?kid=Name. Kid-friendly header with greeting and color. Stats bar (grade badge, score %, tasks done/total, streak). Tap-to-complete task cards (reuses renderTaskCard). Celebration system: per-task emoji burst (full) or star sparkle (subtle), all-done overlay (full) or toast banner (subtle), controlled by kidSettings.celebrationsEnabled and celebrationStyle. Optional week view tabs (Mon-Sun) when showWeekView enabled. Long-press bottom sheet with conditional features: points slider (showSlider), delegate (canDelegate), move (canMoveTasks) — no edit/skip. Overdue banner on today view. Undo toast on completion toggle. Real-time completions sync. Fully isolated — no nav bar, no admin access, no task editing. completedBy: 'kid-mode' distinguishes source.
2026-04-02 Dedicated day/date + move UX: Fixed one-time tasks appearing on multiple days (isOnceTaskHandled now checks all existing schedule entries, not just completed ones). Task form: weekly/monthly show day-of-week chip buttons (Mon-Sun + Any); one-time shows date picker (dedicatedDate field). One-time tasks with future dedicatedDate skip today entry creation. Move button in long-press sheet now directly opens native date picker (no toggle panel). Skip button promoted to main action bar alongside Move.
2026-04-02 New themes + events + stats: Added Light Vivid and Dark Vivid theme presets with person-colored task card backgrounds (coloredCells flag). Event categories: isEvent toggle in admin categories with eventColor picker, events excluded from scoring, use 'fixed' ownerAssignmentMode (no rotate/dup), show with 📅 prefix and colored border style on task cards. Calendar day cells show colored event bars (multiple events = stacked thin bars). Dashboard stats: replaced points with score %, tasks done/total, total task time in date-header and fixed header — all filter by person. Theme per-device (localStorage source of truth).
2026-04-02 Phase 8 polish round 2: Fixed admin blank screen on PIN session return (render called before main defined). Fixed edit sheet closing immediately (closeTaskSheet timeout racing with openEditTaskSheet). Added delegation/move indicators on task cards (↪ name / 📅 moved tags from entry key suffix). Redesigned + button as pill-shaped "Task" button. Categories: removed duplicate key display, added isDefault flag (pre-selects in quick-add), badges for weight/pin/icon-off. New tasks now create schedule entries for today (not just future). Debug tab: past-due test entry creator (pick task/date/owner to create overdue entry for testing).
2026-04-02 Phase 8 polish: Category showIcon toggle (controls icon display on task cards). Reworked admin task list UI (two-row layout with name/badges top row, owners/actions bottom row). Reworked admin people list UI (horizontal with color dot, info column). PIN session caching (30min TTL in sessionStorage). Quick-add task button (+) in header on all main pages. Long-press detail sheet now has Delegate (person chips), Move (date picker), Skip, and Edit Task buttons on dashboard/calendar/tracker — no PIN required. Edit task opens inline bottom sheet. Debug mode shows scoring breakdown panel on dashboard with copy-to-clipboard.
2026-04-02 Phase 8: Admin Panel — PIN-gated admin page with 8 tab sections. Tasks: filterable list (rotation/owner/category/status), full CRUD with ownerAssignmentMode toggle, pause/unpause, delete with confirmation. People: add/edit/remove with color picker, role toggle (adult/child), kid mode settings (showWeekView, showCalendar, canDelegate, canMoveTasks, showSlider, celebrations). Categories: CRUD with icon/label/pinProtected/weightPercent, delete reassigns tasks to fallback category. Settings: appName, familyName, timezone, weekendWeight, pastDueCreditPct, sliderMin/Max, PIN change. Theme: preset grid + accent color picker, live preview, syncs to Firebase. Schedule: 90-day summary stats (days/entries/per-person load), rebuild future schedule button. Data: JSON export, factory reset (PIN + type RESET confirmation). Debug: toggle debug mode, event log viewer (last 50), schedule inspector per task, copy-to-clipboard. Tracker also got long-press detail sheet support.
2026-04-02 Phase 7: Task Tracker — weekly and monthly recurring task status views with completion checklist. Tab toggle between weekly/monthly. Person pills, category dropdown, and status dropdown filters. Status badges (Done/Done Late/Overdue/Upcoming/Skipped). Summary progress bar with status counts. Monthly view groups tasks by ISO week. Overdue rows highlighted with red left border. Skipped task detection for active tasks missing schedule entries.
2026-04-02 Phase 6: Scoreboard — period-selectable leaderboard (today/week/month/12-month), all-grades table, 4-week trend sparklines, per-category breakdown bars, streak display. Tap person card for drill-down bottom sheet with task-level detail (Done/Late/Missed/Pending status, earned/possible points). No new shared modules needed — uses existing scoring.js aggregation helpers.
2026-04-02 Phase 5: Scoring — points formula (difficulty × (1 + estMin/30)), letter grades (A+ through F), weighted category math, past-due credit, daily snapshots, streak tracking. Points shown on task cards. Grade badge in dashboard header and calendar sheet. Long-press detail sheet with points slider (0–150%, live grade preview). Daily rollover creates snapshots + updates streaks on load. Aggregate helpers for weekly/monthly/12-month.
2026-04-02 Phase 4: Calendar — 3-month grid view with frequency breakdown labels (D/W/M), animated bottom sheet for day detail, completion toggling, person filter in sheet with locked height, smooth in-place updates. Reuses compact task cards from Phase 3.
2026-04-02 Phase 3: Dashboard — task cards, completion toggling (write/remove to rundown/completions), person filter pills, progress bar, overdue banner (collapsible), time-of-day grouping, undo toast, day-complete celebration. state.js built with pure query helpers. Temp Phase 2 testing UI removed.
2026-04-02 Phase 2: Scheduling engine — all 5 steps (basic, rotation, cooldown, load balancing, duplicate). Validated: schedule generates correctly, deterministic rebuilds, no past/today entries.
2026-04-02 Phase 1: Foundation — Firebase connection, utils, theme, common CSS, nav bar, setup wizard, empty page shells. Validated: setup writes to rundown/, nav works, theme persists, no cleaning/* writes.

## Backlog
(empty — all phases complete)
