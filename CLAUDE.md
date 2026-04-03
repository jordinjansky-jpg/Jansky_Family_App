# Daily Rundown — Family Task Manager

A family chore/task management app with scheduling, scoring, and gamification. Each family member gets assigned daily, weekly, monthly, and one-time tasks with point-based scoring, letter grades, and streak tracking.

## Tech Stack
- **Frontend:** Vanilla JS (ES modules), HTML, CSS — no framework, no bundler, no npm
- **Database:** Firebase Realtime Database (compat SDK via CDN — `firebase.` global, not modular imports)
- **Hosting:** Cloudflare Pages — static files served as-is via `git push` to `main`
- **Styling:** Single CSS file with CSS variables, themed via JS at runtime

## Commands
```bash
# Deploy (auto-deploys on push to main via Cloudflare Pages)
git push origin main

# No build step, no test suite, no package.json
# Open any .html file directly in browser for local dev (needs Firebase connection)
```

## File Structure
```
/                         ← Served as-is by Cloudflare Pages
├── index.html            ← Dashboard — daily task list, completion toggling, progress, overdue banner
├── calendar.html         ← 3-month grid, day detail bottom sheet, event color bars
├── scoreboard.html       ← Leaderboard, grades table, trend sparklines, category breakdown
├── tracker.html          ← Weekly/monthly task status rows, filters, skipped task detection
├── admin.html            ← PIN-gated admin (tasks, people, categories, settings, theme, schedule, data, debug)
├── kid.html              ← Kid-friendly view (?kid=Name), emoji hints, celebrations, simplified UI
├── setup.html            ← First-run wizard (6 steps: info, people, categories, theme, PIN, finish)
├── manifest.json         ← PWA manifest for home screen installability
├── shared/
│   ├── firebase.js       ← Firebase init + CRUD helpers (~25 exports). Only module that touches DB.
│   ├── scheduler.js      ← Schedule generation: rotation, cooldown, load balancing, duplicate mode (~850 lines)
│   ├── scoring.js        ← Points formula, letter grades, snapshots, streaks, weighted categories (~400 lines)
│   ├── state.js          ← Completion queries, entry filtering/sorting/grouping (~115 lines)
│   ├── components.js     ← All reusable HTML rendering: cards, sheets, forms, filters (~600 lines)
│   ├── theme.js          ← 5 theme presets, CSS variable generation, localStorage cache (~260 lines)
│   └── utils.js          ← Date math, timezone handling, formatting (Intl-based, no libraries) (~240 lines)
└── styles/
    └── common.css        ← All styles + CSS variables (~2,720 lines). Breakpoints: 400px, 768px, 1024px
```

## Architecture Decisions
- **Firebase root:** `rundown/` — NEVER touch `cleaning/*` (separate legacy app)
- **Module rules:** Shared modules are pure functions (no DOM). Exception: `theme.js` touches `document` for CSS vars. Pages own all DOM manipulation.
- **Data flow:** Firebase is single source of truth. Theme cached in localStorage (`dr-theme`) for instant load before Firebase responds.
- **Rendering:** Full re-render on data/filter changes (not incremental). Bottom sheets mount/unmount rather than persist.
- **Imports:** All ES module imports use relative paths with `.js` extensions — bare imports break without bundler.
- **Schema:** Changes require a migration plan since data is live in production Firebase.

## Firebase Schema (`rundown/`)
```
rundown/
├── settings          ← flat object { appName, familyName, timezone, weekendWeight, theme: {...} }
├── people/
│   └── {pushId}      ← { name, color }
├── categories/
│   └── {pushId}      ← { name, icon, isEvent?, eventColor?, weightPercent?, showIcon?, isDefault?, pinProtected? }
├── tasks/
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, dedicatedDate?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt?, eventTime? }
│                       rotation: 'daily' | 'weekly' | 'monthly' | 'once'
│                       ownerAssignmentMode: 'rotate' | 'duplicate' | 'fixed'
│                       timeOfDay: 'am' | 'pm' | 'anytime' | 'both'
│                       eventTime: 'HH:MM' (24h) | null — appointment time for event tasks
├── schedule/
│   └── {YYYY-MM-DD}/
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay }
│                       entryKey format: sched_{timestamp}_{counter}
├── completions/
│   └── {entryKey}     ← { completedAt: ServerValue.TIMESTAMP, completedBy: 'dashboard'|'calendar'|'kid-mode',
│                          pointsOverride?: number (percentage 0-150, null = use base) }
├── snapshots/
│   └── {YYYY-MM-DD}/{personId}  ← { earned, possible, percentage, grade, missedKeys[] }
├── streaks/
│   └── {personId}               ← { current, best, lastCompleteDate }
└── debug/eventLog/    ← { ...data, timestamp }
```

## Scoring System
- **Points formula:** `difficultyMultiplier × (1 + estMin / 30)`, rounded to nearest integer
  - Difficulty multipliers: Easy = 1, Medium = 2, Hard = 3
- **Grade bands:** A+ (97-100), A (93-96), A- (90-92), B+ (87-89), B (83-86), B- (80-82), C+ (77-79), C (73-76), C- (70-72), D+ (67-69), D (63-66), D- (60-62), F (0-59)
- **Daily score:** `(earnedPoints / possiblePoints) × 100` — per person
- **Weighted categories:** `ownerRegularPts × (W / (100 - W))` — uses per-person regular task totals
- **Past-due credit:** `basePoints × (pastDueCreditPct / 100)` — default 75%
- **Streaks:** consecutive all-complete days per person (current + best). DST-safe: `Math.abs(diff - 1) < 0.01`
- **Snapshots:** immutable daily records created at rollover (fire-and-forget on dashboard load)
- **Aggregation:** weekly/monthly/12-month grades computed from snapshots at render time (not stored)
- **Exclusions:** Event categories and exempt tasks are excluded from all scoring

## Key Behavior Rules
These are non-obvious rules that can't be derived from reading the code in isolation:

- **Scheduler scope:** Generates 90 days of future entries (tomorrow onward). New tasks also get a today entry at creation time (except one-time tasks with a future dedicatedDate).
- **Schedule reset:** Ignores prior completions and cooldowns — wipes and re-places all future entries.
- **Overdue logic:** Only non-daily tasks from past dates count as overdue. Daily tasks are excluded (they repeat naturally).
- **One-time tasks:** With `dedicatedDate`, placed on that exact date. Without it, load-balanced to lightest day.
- **Completion:** Allowed on any date (no future-date blocking). Completed tasks render at the bottom of all task lists.
- **Task grouping order:** Events → Daily → Weekly → Monthly → One-Time, then by owner within each group.
- **Long-press:** 500ms timer opens detail sheet. Tap toggles completion. Swipe navigates days (dashboard/calendar).
- **Duplicate mode:** Creates one schedule entry per owner. Fixed mode always uses first owner (used for events).
- **Daily cooldown:** Tasks with `cooldownDays` are spaced at fixed intervals (`cooldownDays + 1` days apart).
- **Scoreboard blending:** Weekly grades blend snapshots (past days) + live daily score (today) for accuracy.
- **Kid mode:** Isolated view at `kid.html?kid=Name`. No nav bar, no admin access, no task editing. Per-child settings control features.
- **Admin PIN:** 4-digit PIN with 30-min session cache in sessionStorage. Recovery PIN is always `9999`.
- **Calendar sheet height:** Locks on open so person filter changes don't cause resize jitter.

## Gotchas (Critical)
- Firebase RTDB compat SDK (not modular) — all access via `firebase.` global after CDN load
- Timezone: always use `settings.timezone` for date calculations, never local device time
- ES module imports MUST have `.js` extension — bare imports break without bundler
- `rundown/settings` is a flat object, not nested under a push ID
- Schedule key collisions: `Date.now()` returns same value in tight loops — always use counter-based keys (`sched_{timestamp}_{counter}`)
- Streak float comparison: DST can make day diff != exactly 1 — use `Math.abs(diff - 1) < 0.01`
- Rotation change handlers that modify label innerHTML must save/restore child elements (e.g., 📅 button) and re-bind listeners
- Task deletion must clean up orphaned schedule entries AND completions
- Weekend weight uses global load balancing across all owners (not per-owner)
- Category key auto-slugified from label (lowercase, hyphens, trim trailing)
- Editing an existing task in admin now auto-rebuilds the future schedule (no manual "Rebuild" click needed)
- All pages use `loadData(); render()` pattern for in-place refresh after mutations (NOT `location.reload()`)
- CSS has `--font-size-md: 1rem` between `sm` (0.8125rem) and `base` (0.9375rem) — used by scoreboard cards

## Changelog (last 5)
- Add meta tags, manifest.json, favicon, PWA support, event time field, auto-rebuild on task edit
- `17df628` Pre-release audit: remove dead code, fix bugs, harden XSS, clean CSS
- `8fc247b` Reset schedule ignores prior completions and cooldowns, re-places all tasks
- `b9fe3b4` Fix reset schedule using includeToday to match rebuild entry count
- `8c433f8` Fix weighted categories to use per-person regular totals instead of family-wide

## Backlog
- **Push notifications** — Daily reminders, task delegation alerts. Requires FCM + server-side trigger (Cloud Function or Cloudflare Worker). High effort (~2-3 sessions). See notifications uplift assessment from 2026-04-03.
