# Daily Rundown — Family Hub

Vanilla JS family task manager evolving into a Skylight-style family hub. No framework, no bundler, no npm in the frontend.

## Tech Stack
- **Frontend:** Vanilla JS (ES modules), HTML, CSS — no framework, no bundler
- **Database:** Firebase Realtime Database — compat SDK via CDN (`firebase.` global, not modular imports)
- **Hosting:** Cloudflare Pages — auto-deploys on `git push origin main`
- **Auth:** Cloudflare Zero Trust — Google Sign-In at `dashboard.jansky.app`
- **Worker:** `workers/kitchen-import.js` — Cloudflare Worker for AI features (Claude Haiku)
- **Styling:** 13 modular CSS files by responsibility, themed via JS at runtime

## Commands
**Prerequisites:** Node.js (any recent version) — no `.env` needed, Firebase config is embedded in `shared/firebase.js`

```bash
# Deploy frontend (auto on push)
git push origin main

# Deploy Worker — NOT auto-deployed, must run separately
# wrangler.toml lives in workers/ (kept out of repo root so Cloudflare Pages
# doesn't auto-detect it via its BETA wrangler-config scan).
npx wrangler deploy --config workers/wrangler.toml
# PowerShell may block npx — use cmd.exe or Cloudflare dashboard editor instead

# Local dev server
node serve.js  # → http://localhost:8080
```

**Worker secrets** (set in Cloudflare dashboard, not in code):
- `CLAUDE_API_KEY` — required for all AI handlers
- `FIREBASE_DB_SECRET` — required for email handler only

## Working Together
- **Non-technical user:** No coding background — code explanations and snippets are optional; use judgment on whether they help
- **Always have an opinion:** State a clear recommendation in every response where a judgment call is involved — not just when listing options
- **Push back:** Challenge requests that seem wrong, unclear, or suboptimal before executing; ask clarifying questions for non-trivial work
- **Surface observations:** After completing a task, flag anything noticed — bugs, UX issues, improvement ideas, even if off-topic

## Viewing the App (Playwright)
Production (`dashboard.jansky.app`) is behind Cloudflare Zero Trust — no automated tool can access it.

- **Always** start `node serve.js` then use Playwright against `http://localhost:8080`
- **Visual / read-only checks:** `http://localhost:8080/` — reads real Firebase data, no write risk
- **Write testing:** `http://localhost:8080/?env=dev` — isolated `rundown-dev/` path, clearable via orange banner
- Check port 8080 isn't already bound before starting a second instance
- **Mobile viewport required:** always set Playwright to 412×915 (Samsung S26 Ultra) before taking any screenshot — `browser_resize` first, then screenshot. The app is phone-first; desktop screenshots miss layout issues. Use Playwright (not chrome-devtools-mcp) for screenshots — chrome-devtools clamps width at ~500px and won't honor narrower viewports.
- **Viewport vs full-page screenshots:** use `fullPage: false` (viewport-only) when checking layout that involves fixed-position elements — bottom nav, FAB, bottom sheets, sticky headers. Full-page screenshots place those elements at their initial position only, which is misleading. Use `fullPage: true` only for "how does the whole scrollable list look" checks.
- **Screenshot cleanup:** delete all `.png` / `.jpg` screenshot files immediately after analyzing them — do not leave them in the repo

## When to Read Which File

Do not skip these based on familiarity. Design drift happens when DESIGN.md is not consulted.

| Situation | Read before starting |
|---|---|
| Any UI work — component, CSS, sheet, form, card, banner, nav change | [docs/DESIGN.md](docs/DESIGN.md) |
| Building any form sheet or bottom sheet | [docs/DESIGN.md](docs/DESIGN.md) §5.23 + §13.13 |
| Adding a feature or deciding where it lives in the UI | [docs/DESIGN.md](docs/DESIGN.md) §2 + [docs/ROADMAP.md](docs/ROADMAP.md) |
| Any Firebase schema change or new data path | [shared/firebase.js](shared/firebase.js) |
| About to call any UI work complete | [docs/DESIGN.md](docs/DESIGN.md) — verify against spec before signing off |
| Any question about a specific page's behavior or features | Read that page's `.js` file, or its HTML file if no separate `.js` exists (see Note below); if no screenshot this session for that page, take one at 412×915 before responding |

**DESIGN.md is the single source of truth for all visual and UX decisions.** If a situation isn't covered, stop — add it to DESIGN.md first, then build.

## File Structure
```
/
├── index.html / dashboard.js     ← Dashboard (home page)
├── kitchen.html / kitchen.js     ← Kitchen hub — lists, recipes, staples, meal plan
├── calendar.html                 ← Three-view calendar (month/week/day)
├── kid.html                      ← Kid mode (?kid=Name) — restricted, no admin
├── person.html                   ← Per-person PWA shortcut (?person=Name)
├── admin.html                    ← PIN-gated admin panel
├── scoreboard.html               ← Leaderboard, grades, sparklines
├── tracker.html                  ← Weekly/monthly task status grid
├── rewards.html / rewards.js     ← Rewards store
├── setup.html                    ← First-run wizard
├── sw.js / manifest.json         ← PWA service worker + manifest
├── serve.js / dev.bat            ← Local dev server (Playwright testing only)
├── workers/kitchen-import.js     ← Cloudflare Worker — AI categorize, recipe import, future handlers
├── shared/
│   ├── firebase.js               ← ONLY module that touches DB (~25 exports)
│   ├── components.js             ← All reusable HTML + form-system primitives (~4,000 lines)
│   ├── scheduler.js              ← Schedule generation — rotation, cooldown, load balancing (~1,000 lines)
│   ├── scoring.js                ← Points formula, grades, streaks, snapshots (~600 lines)
│   ├── calendar-views.js         ← Month/week/day renderers (~450 lines)
│   ├── state.js                  ← Completion queries, entry filtering/sorting
│   ├── theme.js                  ← 5 theme presets, CSS variable generation
│   ├── utils.js                  ← Date math, timezone handling, formatting
│   ├── dom-helpers.js            ← Owner chip binding, getSelectedOwners
│   ├── weather.js                ← Weather widget, 5-day forecast
│   ├── ai-helpers.js             ← Image resize, confirm rows, month clarification sheet
│   └── dev-banner.js             ← Dev mode banner (local only, not production)
└── styles/                       ← 13 CSS files — load order: base → layout → components → page → responsive
```
**Note:** Only `dashboard.js`, `kitchen.js`, and `rewards.js` are separate JS files. All other pages (`calendar.html`, `tracker.html`, `scoreboard.html`, `kid.html`, `person.html`, `admin.html`, `setup.html`) use inline module scripts inside the HTML file.

## Architecture — Non-Obvious Rules
- **Firebase root:** `rundown/` only. Never touch `cleaning/*` (separate legacy app). Dev mode uses `rundown-dev/`.
- **Module rules:** Shared modules are pure functions — no DOM. Exceptions: `theme.js` (CSS vars), `dev-banner.js` (dev only).
- **Rendering:** Full re-render on data/filter changes — not incremental. Bottom sheets mount/unmount on each open/close.
- **Imports:** Always relative paths with `.js` extension — bare imports break without a bundler.
- **After any write:** `loadData(); render()` — never `location.reload()`.
- **SW cache:** Bump `CACHE_NAME` in `sw.js` when files are added or renamed.
- **Worker deploy:** Not auto-deployed with `git push` — must run `wrangler deploy` separately.
- **Form pattern:** Compose from `fs-*` primitives in `shared/components.js` — `renderFormFooter`, `renderFormSheetHeader`, `renderDateInput`+`bindDateInput`, `renderTimeInput`, `renderChipPicker`+`bindChipPicker`, `renderEmojiPicker`+`bindEmojiPicker`, `renderColorButton`+`initColorButton`, `renderSwitchToggle`, `renderHelperText`. Sub-sheets: `openIcalUrlSubsheet`, `openEventPhotoSourceSheet`, `openRepeatSubsheet`. Read DESIGN.md §5.23 v2 + §13.13 before building any form.

## Critical Behavior Rules
These cannot be derived from reading the code:

- **Task order differs by page:** Dashboard/kid = Events → Daily → Weekly → Monthly → One-Time. Calendar day sheet = Events → Monthly → Weekly → One-Time → Daily.
- **Long-press timing:** 500ms on tracker · 800ms on calendar/kid/dashboard.
- **Scheduler scope:** 90 days forward. New tasks also get a same-day entry (except one-time tasks with a future `dedicatedDate`).
- **All past-date completions** get `isLate: true` + `pointsOverride: pastDueCreditPct` regardless of rotation type.
- **Overdue banner:** Only non-daily past tasks. Daily tasks excluded — they repeat naturally.
- **Timezone:** Always `settings.timezone` for date math — never local device time.
- **Schedule keys:** `sched_{timestamp}_{counter}` — counter is required; `Date.now()` returns the same ms in tight loops.

## Critical Gotchas
- Firebase is the **compat SDK** — always `firebase.database()`, never modular `getDatabase()` imports
- ES module imports MUST include `.js` extension — bare imports break without a bundler
- `rundown/settings` is a flat object — not nested under a push ID
- Streak day comparison: use `Math.abs(diff - 1) < 0.01` — DST can make the diff slightly off from 1.0
- Task deletion must also remove orphaned schedule entries and completions
- Rotation change handlers that modify label `innerHTML` must save/restore child elements and re-bind listeners
- Admin PIN: 4-digit, 30-min sessionStorage cache · Recovery PIN: `2522`
- `Date.now()` returns the same value in tight loops — always use counter-based schedule keys

## Non-Negotiable Rules
The most commonly violated. Full list is in [docs/DESIGN.md](docs/DESIGN.md).

- ❌ No `window.confirm` / `window.alert` — use `showConfirm()`
- ❌ No new form sheet without reading DESIGN.md §5.23 + §13.13 first
- ❌ No inline styles in HTML
- ❌ No hardcoded colors in CSS — design tokens only (`var(--...)`)
- ❌ No horizontal padding on `.section` inner groups — page wrapper owns the gutter
- ❌ No `var(--header-height)` in a page wrapper's `padding-top` — sticky header reserves its own space in flow
- ❌ No new nav tab without retiring one — tab bar is capped at 5 slots
- ❌ No emoji in nav, tabs, buttons, banners, chips, headers, or form labels — only in user-authored content
