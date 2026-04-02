# Daily Rundown Rebuild - Governance
**Current Phase:** 4 | **Status:** Complete  
**Next Milestone:** Phase 5 — Scoring & grading system

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
│   └── {pushId}      ← { name, icon }
├── tasks/
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt? }
│                       rotation: 'daily' | 'weekly' | 'monthly' | 'once'
│                       ownerAssignmentMode: 'rotate' | 'duplicate'
│                       timeOfDay: 'am' | 'pm' | 'anytime' | 'both'
├── schedule/
│   └── {YYYY-MM-DD}/
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay }
│                       entryKey format: sched_{timestamp}_{counter}
├── completions/
│   └── {entryKey}     ← { completedAt: ServerValue.TIMESTAMP, completedBy: 'dashboard'|'calendar' }
├── snapshots/
│   └── {YYYY-MM-DD}/{personId}  ← (Phase 5+)
├── streaks/
│   └── {personId}               ← (Phase 5+)
└── debug/eventLog/    ← { ...data, timestamp }
```

## Key Behavior Decisions
- Scheduler generates 90 days of future entries (tomorrow onward, never today/past)
- Completion allowed on any date (no future-date blocking)
- Overdue: only non-daily tasks from past dates; daily tasks are excluded
- Completed tasks render at the very bottom of any task list (below all frequency groups)
- Task grouping order: Daily → Weekly → Monthly → One-Time, then owner within group
- Scoring/points are Phase 5 — no point values on task cards until then
- Calendar bottom sheet locks height on open so person filter changes don't resize it
- Category emoji on cards will be a per-category toggle (Phase 8 admin setting)

## Gotchas (Critical)
- Firebase RTDB compat SDK used (not modular) — all imports via `firebase.` global after CDN load
- Timezone handling: always use `settings.timezone` for date calculations, never local device time
- ES module imports MUST have `.js` extension — bare imports break without bundler
- `rundown/settings` is a flat object, not nested under a push ID

## Changelog
2026-04-02 Phase 4: Calendar — 3-month grid view with frequency breakdown labels (D/W/M), animated bottom sheet for day detail, completion toggling, person filter in sheet with locked height, smooth in-place updates. Reuses compact task cards from Phase 3.
2026-04-02 Phase 3: Dashboard — task cards, completion toggling (write/remove to rundown/completions), person filter pills, progress bar, overdue banner (collapsible), time-of-day grouping, undo toast, day-complete celebration. state.js built with pure query helpers. Temp Phase 2 testing UI removed.
2026-04-02 Phase 2: Scheduling engine — all 5 steps (basic, rotation, cooldown, load balancing, duplicate). Validated: schedule generates correctly, deterministic rebuilds, no past/today entries.
2026-04-02 Phase 1: Foundation — Firebase connection, utils, theme, common CSS, nav bar, setup wizard, empty page shells. Validated: setup writes to rundown/, nav works, theme persists, no cleaning/* writes.

## Backlog
- Phase 8 (Admin → Categories): Add a "default category" setting so new tasks don't default to an arbitrary category
- Phase 8 (Admin → Categories): Add toggle to show/hide category emoji on task cards (per category)
- Phase 8 (Admin): Move factory reset button here (removed from dashboard temp UI)
- Phase 5: Scoring & grading system
- Phase 6: Scoreboard page
- Phase 7: Task tracker page
- Phase 8: Admin panel
- Phase 9: Kid mode
