# Daily Rundown Rebuild - Governance
**Current Phase:** 2 | **Status:** In Progress  
**Next Milestone:** Phase 2 — Task data model, scheduling engine (basic → rotation → cooldown → load balancing → duplicate)

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

## Gotchas (Critical)
- Firebase RTDB compat SDK used (not modular) — all imports via `firebase.` global after CDN load
- Timezone handling: always use `settings.timezone` for date calculations, never local device time
- ES module imports MUST have `.js` extension — bare imports break without bundler
- `rundown/settings` is a flat object, not nested under a push ID

## Changelog
2026-04-02 Phase 2: Scheduling engine — all 5 steps (basic, rotation, cooldown, load balancing, duplicate). Validated: schedule generates correctly, deterministic rebuilds, no past/today entries.
2026-04-02 Phase 1: Foundation — Firebase connection, utils, theme, common CSS, nav bar, setup wizard, empty page shells. Validated: setup writes to rundown/, nav works, theme persists, no cleaning/* writes.

## Backlog
- **CLEANUP: Remove temp testing UI from index.html** — task creation form, rebuild button, schedule diagnostic, reset button. Remove when Phase 3 dashboard replaces them (reset moves to Phase 8 admin).
- Phase 8 (Admin → Categories): Add a "default category" setting so new tasks don't default to an arbitrary category
- Phase 3: Dashboard with task cards and completion
- Phase 4: Calendar views
- Phase 5: Scoring & grading system
- Phase 6: Scoreboard page
- Phase 7: Task tracker page
- Phase 8: Admin panel
- Phase 9: Kid mode
