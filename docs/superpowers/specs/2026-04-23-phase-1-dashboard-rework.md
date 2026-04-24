# Phase 1 — Dashboard Rework

**Date:** 2026-04-23
**Status:** Landed (2026-04-23)
**Plan:** [docs/superpowers/plans/2026-04-19-ui-rework.md](../plans/2026-04-19-ui-rework.md)
**Implementation plan:** [docs/superpowers/plans/2026-04-23-phase-1-dashboard.md](../plans/2026-04-23-phase-1-dashboard.md)
**Design source of truth:** [docs/DESIGN.md](../../DESIGN.md) §5 (Component catalog), §6.1 (Dashboard), §7.3 (Banner queue)
**Mockup reference:** [mockups/01-dashboard.html](../../../mockups/01-dashboard.html)

---

## 0. Summary

Phase 1 restructures the dashboard page — markup, rendering, and CSS — to match the mockup. It standardizes the `.card` slot-based DOM, replaces the stacked date-nav block with a calm header (title + subtitle), wires a single-slot banner with a priority queue, moves the primary "Add" action from the header to a FAB, and delivers the 5-tab bottom nav with a "More" overflow sheet (Rewards · Admin · Theme · Debug). Data flow and Firebase schema are unchanged.

**What this phase does NOT do:** no change to Calendar/Scoreboard/Tracker/Admin/Kid markup (those are their own phases). No tablet two-pane layout (Phase 7). No ambient strip HTML (deferred to 1.3/1.4 when Meals/Weather ship). No Settings UI changes (Phase 3).

---

## 1. Goals

1. Dashboard visually matches [mockups/01-dashboard.html](../../../mockups/01-dashboard.html) at 375px.
2. Replace bespoke dashboard DOM (`task-card`, `date-header`, `date-nav`, `overdue-banner`) with the spec component catalog (`.card` + slots, `.banner` variants, `.section`).
3. Header collapses from ~5 right-side icons to **Bell + overflow (3-dot)** only; primary add moves to FAB.
4. Bottom nav grows from 4 → 5 tabs (adds **More**). More opens a sheet with Rewards · Admin · Theme · Debug (and re-routable Rewards entry for Phase 6 to swap without moving the entry point).
5. Single `.banner` slot with priority queue: `vacation > freeze > overdue > multiplier > info`. Overdue and multiplier are live; vacation/freeze stub (render nothing until 2.4).
6. Person filter moves from inline pill bar to a chip-triggered bottom sheet when `people.length > 1`. No filter chrome visible when only one person exists.
7. Date navigation: keep swipe gesture unchanged; remove the `prevDay/nextDay` arrow row; when `viewDate !== today`, show a single "Back to Today" pill below the banner.
8. Task cards adopt `.card` with `__leading / __body / __trailing` slots. Rotation is surfaced via a `.tag` in the meta row (`Weekly`, `Monthly`, `One-Time`; `Daily` → no tag).
9. Completed cards render flat at the bottom with `.card--done`; no "Completed (N)" header.
10. Page sections reduce to **Events → Today**. Daily/Weekly/Monthly/One-Time sub-grouping is removed (rotation tag carries the context).
11. Satisfies the inline-style sweep and hex-purge rows for `index.html` and `styles/dashboard.css` in the Phase 0 §2.4 deferred register.
12. Capture new visual baselines under `docs/superpowers/baselines/phase-1/` as reference for Phase 2.
13. Task cards render a 3px owner-color left-stripe via `--owner-color`, matching the Skylight/Cozi scannable-ownership pattern on shared screens.
14. Today section renders a calm empty state when `sortedToday.length === 0` after filter, per DESIGN.md principle #5 (every feature ships empty/loading/error states).

---

## 2. Scope

### 2.1 In scope — modified files

| File | Change |
|---|---|
| `index.html` | Restructure markup; retire inline `style="display:none;"` on `#mainContent`; add `#bannerMount`, `#fabMount`. Drop `dashboard`-specific CSS link only if the file is renamed (it isn't — kept). |
| `dashboard.js` | Replace `date-header` render block with mockup-aligned header text (done via `renderHeader`). Remove inline sub-group rendering (Daily/Weekly/Monthly/One-Time). Remove inline Add-Task binding; wire FAB instead. Add banner-queue resolver. Read `rundown/multipliers/{today}`. Remove Person-filter inline bar; replace with chip-triggered sheet. |
| `shared/components.js` | **Card variants:** add DOM-level `.card` / `.card__leading` / `.card__body` / `.card__trailing` markup to `renderTaskCard`, keep backward-compat `.task-card` class alias on the root only during Phase 1, retire alias at top of Phase 2. Add `renderBanner(variant, { title, message, action })`. Add `renderFab(options)`. Add `renderSectionHead(title, meta)`. Add `renderOverflowMenu(items)` (for header 3-dot). Add `renderFilterChip(label, count)` + `renderPersonFilterSheet(people, activePerson)`. Update `renderHeader` signature to support `subtitle` + `overflowItems` (drop `showAdmin/showDebug/showAddTask/showThemePicker` booleans — those move into overflow items passed by the caller). Update `renderNavBar` to accept 5 items including `more`. |
| `styles/dashboard.css` | Delete: `.date-header*`, `.date-nav*`, `.time-header`. Add: `.section`, `.section__head`, `.section__title`, `.section__meta`. Keep: celebration CSS. Purge raw hex (Phase 0 §2.4 row: 0 literals — this is a stub confirmation). Re-base all values to tokens. |
| `styles/components.css` | Add mockup `.card` + slot rules, `.card--event`, `.card--done`, `.card--task`, `.tag` + `--late/--bounty/--rotation`, `.banner` + variants, `.fab`, `.avatar` + owner variants (color-mix tint), `.check` + `--done`, `.btn-icon` + `__dot`. Retire the old `.task-card*` rule block at the end of Phase 1 commit 6 (once callsites have migrated). |
| `styles/layout.css` | Rewrite `.app-header` to mockup: no gradient title, no shadow, no fixed-bg, no `-webkit-background-clip: text`. `position: sticky`, `background: var(--bg)`. Rewrite `.bottom-nav` to 5 items with frosted glass (`backdrop-filter: blur(14px)`); drop bespoke per-icon `.nav-item` class name — use mockup's `.bottom-nav__item` to match DESIGN.md §5.14 (keep `.nav-item` as class alias for one release; retire in Phase 2). Update `--header-height` usage for sticky, not fixed (no top-padding compensation needed). |
| `sw.js` | Bump `CACHE_NAME` to `v46`. Append CACHE_BUMPS comment row for Phase 1. |
| `docs/superpowers/plans/2026-04-19-ui-rework.md` | Under Phase 1.3 (Meals) add: "Wiring: adds the second ambient chip to `index.html`'s ambient row and toggles rendering when `settings.ambientStrip === true`." Under Phase 1.4 (Weather) add: "Wiring: adds the first ambient chip to `index.html`'s ambient row and the Calendar header weather chip per DESIGN.md §6.2." Under Phase 3 (Settings): add exit criterion: "Expose `settings.ambientStrip` as a toggle in Admin → Settings → Display." |

### 2.2 In scope — added files

| File | Purpose |
|---|---|
| `docs/superpowers/baselines/phase-1/` (directory) | Post-Phase-1 dashboard screenshots: 375px × {light, dark} + 768px × {light, dark} = 4 PNGs. Becomes the reference for Phase 2. |
| This spec | `docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md` |
| Implementation plan | `docs/superpowers/plans/2026-04-23-phase-1-dashboard.md` |

### 2.3 Out of scope — explicitly deferred

| Item | Reason | Owning phase |
|---|---|---|
| Calendar, Scoreboard, Tracker, Admin, Kid, Setup page markup | Each owns its own rework phase. | Phases 2–5 |
| Tablet two-pane layout | Phase 7 redesigns all pages' tablet layouts in one pass. | Phase 7 |
| Ambient strip (Weather + Dinner chips) | Needs 1.4 (Weather) + 1.3 (Meals) data; the strip has no real data today and would render empty placeholders. | 1.3 / 1.4 (wire-in on each) |
| `settings.ambientStrip` toggle UI in Admin | Admin is getting restructured in Phase 3; easier to add then. | Phase 3 |
| Vacation / freeze banner variants | Vacation depends on `people.{id}.away[]` schema (Phase 2.4). Freeze is a future feature with no current source of truth. | 2.4 / TBD |
| Task detail sheet redesign | Sheet lives in `shared/components.js`; sheet component will be re-skinned as part of Phase 2 when Calendar also rebuilds its day-sheet. Phase 1 keeps existing sheet rendering; only the trigger path changes. | Phase 2 |
| Replacing `.task-card` classname everywhere | Kept as alias on the new `.card` root through Phase 1; retired in Phase 2 once Calendar stops depending on it (see Calendar's current `renderTaskCard` reuse in day sheet). | Phase 2 |
| Tablet two-pane layout (≥768px) | Phase 1 keeps single column (max-width 560px centered). True two-pane redesign lives in Phase 7 alongside Calendar/Scoreboard/Tracker. | Phase 7 |
| Multiplier remaining-time countdown | Static message in Phase 1. Live countdown ("4h 12m left") deferred with Admin Settings UI. | Phase 3 |

### 2.4 Decisions locked from 2026-04-23 alignment

| # | Question | Decision |
|---|---|---|
| 1 | Keep date-nav arrows? | **No.** Swipe remains; arrows removed. "Back to Today" pill shows when `viewDate !== today`. |
| 2 | Banner priority | **`vacation > freeze > overdue > multiplier > info`** — one slot, queue ordered; Phase 1 wires overdue + multiplier. |
| 3 | Ambient strip in Phase 1? | **No.** Deferred to 1.3/1.4. `2026-04-19-ui-rework.md` amended to name the owning phases. |
| 4 | Header right-side icons | **Bell + overflow (3-dot) only.** Overflow items: Rewards · Admin · Theme · Debug. Add moves to FAB. |
| 5 | "Rewards" destination | **Today's existing Store sheet.** Phase 6 swaps destination without moving the entry point (More menu + overflow both keep their "Rewards" row). |
| 6 | Score/grade surface on dashboard | **Removed.** Section meta shows `{done} of {total} done` only. Grade lives on Scoreboard. |
| 7 | Section sub-groups (Daily/Weekly/Monthly/One-Time) | **Collapsed to one "Today" section.** Rotation is surfaced per-card via a `.tag` in the meta row. |
| 8 | Completed tasks | **Flat list of `.card--done` at bottom, no section header.** |
| 9 | Task sort order in "Today" | **Flat list, no visible subheaders. Sort: owner (by family order) → late-today-first within owner → time-of-day (AM < Anytime < PM) → name.** Late-today bump applies to **INCOMPLETE entries only**; completed entries sort owner → TOD → name (no late bump — late-completed cards in the "done" block shouldn't read as problem children). `sortEntries` already handles owner + TOD; Phase 1 adds (a) the late-today bump within each owner's incomplete block and (b) a name tiebreaker. Rationale: keeps the mockup quiet (no subheader chrome), matches shared-screen usage pattern ("what does each person still owe?"), and surfaces the one priority signal that matters (late-today) without introducing a separate section. Alternative groupings (visible person subheaders, TOD subheaders) were considered and rejected for chrome cost. |
| 10 | Streak glyph on header subtitle? | **Not in Phase 1.** Subtitle stays `formatDateLong(viewDate)` only. Streak surfaces remain on Scoreboard (and kid mode where they already render). Revisit if the header subtitle feels empty after Phase 1 ships; adding it later is a one-line change. |
| 11 | Duplicate overflow entry (header 3-dot + bottom-nav More) | **Yes — both surfaces open the same sheet, intentionally.** Rationale: header is reachable mid-scroll without scrolling to bottom; nav is reachable with thumb from any scroll position. Duplication costs one button; the alternative (forcing one or the other) costs a reach. |
| 12 | Person filter in `?person=` / kid-link mode | **Chip is hidden.** `activePerson` is locked to the URL person; no filter UI renders. Matches kid-mode philosophy and the rule in §3.2 that the header title becomes the person's first name. |
| 13 | Owner color treatment on task cards | **Add a 3px left-stripe** via `.card` `::before` driven by `--owner-color` (same CSS var `applyDataColors` already writes). Avatar keeps its tinted chip (existing). Matches Skylight/Cozi pattern for scannable ownership at arm's length; free visual affordance, zero runtime cost. |
| 14 | Ambient-row spacing during deferral | **Preserve the gap.** Even with the ambient row not rendered in Phase 1, the `--spacing-lg` gap between banner and Events stays (not collapsed). Prevents Phase 1.3/1.4 from having to re-open spacing rules when ambient chips land. |
| 15 | Dashboard tablet behavior (≥768px) | **Single column, no two-pane.** Main content max-width `560px`, centered. Bottom nav + FAB unchanged. True tablet redesign (two-pane) is Phase 7. |
| 16 | Tap on `.card--event` | **Opens the calendar day sheet scrolled to that event.** Long-press opens the event detail sheet (edit). Matches tap-opens-view / long-press-opens-edit pattern used on task cards. |
| 17 | Multiplier banner countdown / remaining-time | **Not in Phase 1.** Message is the authored `note` field when present, otherwise a static `All tasks count {N}× until midnight.`. A live "4h 12m left" countdown is deferred to Phase 3. |
| 18 | Bell sheet contents | **Unchanged in Phase 1.** `initBell` continues to own approvals, activity feed, and bonus/deduction/multiplier creators. Only the trigger glyph markup and badge class change (`.bell__badge` → `.btn-icon__dot`). |
| 19 | `Back to Today` pill position at all widths | **Left-aligned with `--spacing-md` indent, max-width 320px.** Same at 375px and 768px; no center-on-tablet variant. |

Questions not raised above are resolved as the plan file's current preferences.

### 2.5 Deferred tech-debt register (inherited from Phase 0 §2.4)

Rows this phase must clear:

| Item | Count | File | Status at phase end |
|---|---:|---|---|
| Inline styles | 1 | `index.html` | 0 |
| Hex literals | 0 | `styles/dashboard.css` | 0 (baseline still 0; no regression) |

New rows this phase hands off to Phase 2:

| Item | Approx count | File | Owning phase |
|---|---:|---|---|
| `.task-card` class alias | 1 callsite (root className) | `shared/components.js` | Phase 2 (Calendar stops reusing `.task-card` in its day sheet) |
| `.nav-item` class alias | 5 callsites | `shared/components.js`, `styles/layout.css`, `styles/responsive.css` | Phase 2 |

---

## 3. Markup contract

### 3.1 Page skeleton (`index.html`)

```html
<body>
  <div id="headerMount"></div>
  <main class="app-shell" id="app">
    <div class="loading-inline" id="loadingState">
      <div class="loading-spinner loading-spinner--small"></div>
      <span>Loading...</span>
    </div>
    <div id="mainContent" class="is-hidden">
      <!-- rendered by dashboard.js: renderBanner | back-to-today pill | events section | today section -->
    </div>
  </main>
  <div id="fabMount"></div>
  <div id="navMount"></div>
  <div id="toastMount"></div>
  <div id="celebrationMount"></div>
  <div id="taskSheetMount"></div>
  <!-- Firebase + SW + module script unchanged -->
</body>
```

**Rules:**
- `<main class="app-shell">` replaces `<div class="page-content">`. `.page-content` selector retired in Phase 1 commit 5.
- No inline `style="display:none"` anywhere. Use `.is-hidden` class (already defined in `styles/components.css`).
- Mount order in DOM: header → main → fab → nav → toast → celebration → taskSheet. Matches z-index order top-down when stacked.
- **Tablet behavior (≥768px):** `.app-shell` max-width `560px`, centered via auto margins. Bottom nav + FAB unchanged. No two-pane layout in Phase 1 — that's Phase 7.

### 3.2 Header (`renderHeader`, called from `dashboard.js`)

```html
<header class="app-header">
  <div class="app-header__text">
    <div class="app-header__title">Home</div>
    <div class="app-header__subtitle">Sunday, April 19</div>
  </div>
  <div class="app-header__actions">
    <button class="btn-icon" id="headerBell" aria-label="Notifications">
      <svg>…bell…</svg>
      <span class="btn-icon__dot is-hidden" id="headerBellDot" aria-hidden="true"></span>
    </button>
    <button class="btn-icon" id="headerOverflow" aria-label="More">
      <svg>…3 dots…</svg>
    </button>
  </div>
</header>
```

- Title text: `"Home"` on dashboard (not `appName`). In person-link mode (`?person=Name`), title is the person's first name (`Noah`, `Kai`, …); subtitle stays as the date line.
- Subtitle: `formatDateLong(today)` — e.g., `"Sunday, April 19"`.
- Bell dot: unseen-messages badge; `.is-hidden` when count is 0.
- Overflow button opens a Sheet (not a dropdown), contents rendered by `renderOverflowMenu(items)`. Items passed by `dashboard.js`:
  1. Rewards (opens today's Store sheet — Phase 6 swap target)
  2. Admin (links to `admin.html`)
  3. Theme (opens `openDeviceThemeSheet`)
  4. Debug (only when `localStorage.getItem('dr-debug') === 'true'`)

### 3.3 Banner slot (single, priority-queued)

```html
<div id="bannerMount">
  <div class="banner banner--multiplier" role="status">
    <div class="banner__icon">✦</div>
    <div class="banner__body">
      <div class="banner__title">Double-points day</div>
      <div class="banner__message">All tasks count 2× until midnight.</div>
    </div>
  </div>
</div>
```

Banner resolver in `dashboard.js`:

```js
function resolveBanner() {
  // Priority: vacation > freeze > overdue > multiplier > info
  // Phase 1 wires overdue + multiplier only.
  const overdueCount = overdueFiltered.length;
  const multi = multipliers?.[today]?.[activePerson || 'all'] ?? multipliers?.[today]?.all;
  if (overdueCount > 0) return { variant: 'overdue', title: `${overdueCount} overdue ${overdueCount === 1 ? 'task' : 'tasks'}`, message: 'Tap to view.', action: { label: 'View', onClick: expandOverdue } };
  if (multi && multi.multiplier !== 1) {
    const label = multi.multiplier === 2 ? 'Double-points day' : `${multi.multiplier}× points today`;
    return { variant: 'multiplier', title: label, message: multi.note || `All tasks count ${multi.multiplier}× until midnight.` };
  }
  return null;
}
```

**Rules:**
- At most one `.banner` in `#bannerMount` at a time.
- Tapping banner `--overdue` opens the overdue list (existing behavior, just moved from inline to a sheet rendered by `renderBottomSheet`).
- Banner icon character matches DESIGN.md §5.9 conventions: `overdue` = `⚠`, `multiplier` = `✦`, `vacation` = `✈` (stubbed), `freeze` = `❄` (stubbed), `info` = `i`.
- No emoji-variant selectors (U+FE0F) in the icon — they colorize on some platforms; keep as monochrome glyph. (See DESIGN.md §7.6 Iconography.)
- **Multiplier message text:** authored `note` field when present, otherwise a static `All tasks count {N}× until midnight.`. Live remaining-time countdown (`4h 12m left`) is deferred to Phase 3.

### 3.4 Back-to-Today pill

```html
<!-- rendered only when viewDate !== today -->
<div class="back-to-today">
  <button class="btn btn--secondary btn--sm" id="goToday" type="button">Back to Today</button>
</div>
```

Placed directly after `#bannerMount`. Removed entirely when viewing today. **Positioning at all widths:** left-aligned with `--spacing-md` indent, button max-width 320px (no center-on-tablet variant).

### 3.5 Section: Events

```html
<section class="section">
  <div class="section__head">
    <div class="section__title">Events</div>
  </div>
  <!-- repeated .card.card--event, one per event -->
  <article class="card card--event" data-event-id="{id}">
    <div class="card__leading">10:30</div>
    <div class="card__body">
      <div class="card__title">Swim lessons</div>
      <div class="card__meta">
        <span>Noah</span><span class="card__meta-dot"></span><span>Community pool</span>
      </div>
    </div>
  </article>
</section>
```

Section only renders when `sortedEvents.length > 0`. No empty-state for the Events section; absence of events = absence of section.

**Tap behavior on `.card--event`:** tap opens the calendar day sheet scrolled to that event (`location.href = 'calendar.html#event-<id>'` or equivalent — existing calendar scroll-to-event helper). Long-press opens the event detail sheet (edit flow). Matches tap-opens-view / long-press-opens-edit pattern already used on task cards.

### 3.6 Section: Today

```html
<section class="section">
  <div class="section__head">
    <div class="section__title">Today</div>
    <div class="section__meta">4 of 7 done</div>
  </div>

  <!-- incomplete cards, sorted by owner → tod → name -->
  <article class="card" data-entry-key="…" data-date-key="…" data-owner-color="…">
    <div class="card__leading">
      <span class="avatar avatar--a" data-person-color="…">JJ</span>
    </div>
    <div class="card__body">
      <div class="card__title">Take out the trash</div>
      <div class="card__meta">
        <span>Household</span>
        <span class="card__meta-dot"></span>
        <span>10 min</span>
        <span class="tag tag--rotation">Weekly</span> <!-- only when rotation !== 'daily' -->
      </div>
    </div>
    <div class="card__trailing">
      <button class="check" aria-label="Mark complete" type="button"></button>
    </div>
  </article>

  <!-- …more incomplete… -->

  <!-- completed cards, sorted same way, rendered FLAT with card--done -->
  <article class="card card--done" data-entry-key="…" data-date-key="…" data-owner-color="…">
    <div class="card__leading">
      <span class="avatar avatar--b">EL</span>
    </div>
    <div class="card__body">
      <div class="card__title">Make bed</div>
      <div class="card__meta"><span>Household</span></div>
    </div>
    <div class="card__trailing">
      <button class="check check--done" aria-label="Undo"><svg>…check…</svg></button>
    </div>
  </article>
</section>
```

**Rules:**
- `data-entry-key`, `data-date-key`, `data-owner-color` attributes carry through; existing `applyDataColors` sets `--owner-color` via `setProperty`.
- Tap target is the whole `<article>` (cursor: pointer). Existing pointerdown/up long-press logic moves onto `.card`. The `.check` inside `__trailing` is decorative within `.card`'s click region — tap on it bubbles to the card. **Exception:** In Phase 1 we preserve today's behavior where tapping the check is equivalent to tapping the card (same toggle). No separate click handler on `.check` yet.
- Rotation tag (`.tag.tag--rotation`) renders only for `rotation !== 'daily'`. Text is capitalized: `Weekly`, `Monthly`, `One-Time`.
- Late/Bounty/Skipped tags (existing) continue to render inside `.card__meta` to the right of the rotation tag. Visually separated by the dot separator.
- Event-category tasks (legacy tasks with `cat.isEvent`) still render as `.card--event` (left-stripe); the Events section contains both real events and event-category tasks, matching today's grouping.

### 3.6b Today empty state

When `sortedToday.length === 0` (no incomplete OR complete entries — typically early morning on a rest day or when the active person filter produces no matches):

```html
<section class="section">
  <div class="section__head">
    <div class="section__title">Today</div>
  </div>
  <div class="empty empty--calm">
    <div class="empty__title">Nothing on the list</div>
    <div class="empty__message">Enjoy your day.</div>
  </div>
</section>
```

When `sortedToday.length > 0` but all entries are complete (everything checked off):

```html
<section class="section">
  <div class="section__head">
    <div class="section__title">Today</div>
    <div class="section__meta">All done</div>
  </div>
  <!-- completed cards render below (existing flow) -->
</section>
```

CSS: reuse `.empty` from DESIGN.md §5.17 (Empty state). Phase 1 introduces the `--calm` variant (neutral color, no illustration, no CTA). No confetti — celebration is handled by the existing full-complete path.

```html
<!-- rendered into #fabMount -->
<button class="fab" id="fabAdd" aria-label="Add" type="button">
  <svg>…plus…</svg>
</button>
```

Clicking opens the existing `renderAddMenu` sheet (New Event · New Task). No behavior change — only the trigger moves from header icon to FAB.

### 3.8 Bottom nav (5 tabs)

```html
<nav class="bottom-nav" role="navigation" aria-label="Main navigation">
  <a class="bottom-nav__item is-active" href="index.html" data-page="home">
    <svg>…home…</svg>Home
  </a>
  <a class="bottom-nav__item" href="calendar.html" data-page="calendar">
    <svg>…calendar…</svg>Calendar
  </a>
  <a class="bottom-nav__item" href="scoreboard.html" data-page="scoreboard">
    <svg>…scores…</svg>Scores
  </a>
  <a class="bottom-nav__item" href="tracker.html" data-page="tracker">
    <svg>…tracker…</svg>Tracker
  </a>
  <button class="bottom-nav__item" id="navMore" type="button">
    <svg>…3 dots horizontal…</svg>More
  </button>
</nav>
```

- `More` is a `<button>`, not a link (opens a sheet in-place).
- More-sheet items (rendered by `renderOverflowMenu`):
  1. **Rewards** — opens today's Store sheet.
  2. **Admin** — `admin.html`.
  3. **Theme** — `openDeviceThemeSheet`.
  4. **Debug** — only when `dr-debug=true`.
- Person-link mode: href rewriting for Home/Calendar/Scores/Tracker preserved (same as today).

### 3.9 Retired markup

The following selectors are **removed** from `dashboard.js` and `styles/dashboard.css` in Phase 1:

```
.date-header
.date-header__day
.date-header__full
.date-header__grade
.date-header__stats
.date-header__sep
.date-nav
.date-nav__btn
.date-nav__center
.time-header
.time-header::after
.overdue-banner   (retired in favor of .banner.banner--overdue)
.overdue-banner__icon/__text/__arrow
.overdue-list     (replaced by a bottom sheet)
.progress-section (removed — section__meta carries "N of M done")
.progress-label/.progress-pct/.progress-bar/.progress-bar__fill  (dashboard callsites only; scoreboard keeps its own progress bar)
.person-filter    (removed from dashboard; Calendar keeps its own instance for Phase 2)
.person-pill / .person-pill__dot  (kept in `components.css` — used by Calendar, Kid, Scoreboard)
.header__left/__right/__title/__subtitle/__date/__stats/__admin/__debug/__theme/__add-task/__bell
  (all replaced by mockup's .app-header / .app-header__text / .app-header__actions / .btn-icon)
.nav-item / .nav-item__icon / .nav-item__label / .nav-item--active
  (aliased to .bottom-nav__item for one release; retired in Phase 2)
```

Delete these rules in the Phase 1 PR (commit 6). If any non-dashboard page still imports them, keep the rule and move it to its owning page's CSS — verified by the grep in §6.1 #3.

---

## 4. Component additions / changes

All reside in `shared/components.js`. Style definitions live in `styles/components.css` unless noted.

### 4.1 `renderHeader(options)` — signature change

**Before:**
```js
renderHeader({
  appName, subtitle, dateLine,
  showAdmin, showDebug, showAddTask, showThemePicker, showBell,
  bellCount, rightContent
})
```

**After:**
```js
renderHeader({
  title,          // string — "Home", "Noah", "Calendar", …
  subtitle,       // string — typically formatDateLong(today)
  showBell,       // boolean — reserves the bell slot; initBell binds itself
  overflowItems   // Array<{ id, label, icon?, onClick? }> | null — renders 3-dot overflow if non-empty
})
```

Pages migrated in this PR:
- `index.html` → new signature.
- All other pages: **no change in Phase 1**. The old signature continues to work because `renderHeader` internally detects the old shape (`appName` present) and falls back to the legacy markup. The old shape is deleted at the top of Phase 2 once Calendar migrates.

### 4.2 `renderTaskCard(options)` — DOM change

Add a new root class `.card` alongside existing `.task-card`. Produce slot-based children:

```html
<article class="card task-card" data-entry-key="…" data-date-key="…" data-owner-color="…">
  <div class="card__leading">…avatar…</div>
  <div class="card__body">
    <div class="card__title">…task name…</div>
    <div class="card__meta">…category · time · rotation tag · late tag · bounty tag…</div>
  </div>
  <div class="card__trailing">
    <button class="check {{completed ? 'check--done' : ''}}" aria-label="…">
      {{completed ? '<svg>…check…</svg>' : ''}}
    </button>
  </div>
</article>
```

- `.task-card` class retained for CSS selectors Calendar still uses (`.task-card` → its day-sheet); Phase 2 removes the alias.
- Existing tag classes (`task-card__tag`, `--late`, `--bounty`, `--skipped`, `--moved`, `--delegated`) keep their names but render inside `.card__meta` as siblings to the category/time spans (same visual row).
- Points label (`task-card__pts--up`/`--down`) continues to render inline in `.card__meta`; visible only when `showPoints === true` or `override != null`.
- Event-category tasks: `renderTaskCard` returns `.card.card--event.task-card.task-card--event`. Leading slot shows `eventTimeLabel` (if any) instead of the avatar.
- **Owner color left-stripe:** `.card::before` renders a 3px full-height bar using `var(--owner-color, transparent)`. The `--owner-color` CSS var is already set by `applyDataColors()` from the `data-owner-color` attribute. For `.card--event`, the stripe uses the event color instead (existing `--event-color` var). For `.card--done`, the stripe fades to `color-mix(in srgb, var(--owner-color) 40%, transparent)`. No stripe on empty-state or banner cards.

### 4.3 `renderBanner(variant, { title, message, action })` — NEW

```js
export function renderBanner(variant, { title, message, action }) {
  const iconMap = { overdue: '⚠', multiplier: '✦', vacation: '✈', freeze: '❄', info: 'i' };
  const icon = iconMap[variant] ?? 'i';
  const actionHtml = action
    ? `<button class="banner__action" data-banner-action="1" type="button">${esc(action.label)}</button>`
    : '';
  return `<div class="banner banner--${variant}" role="status">
    <div class="banner__icon" aria-hidden="true">${icon}</div>
    <div class="banner__body">
      <div class="banner__title">${esc(title)}</div>
      ${message ? `<div class="banner__message">${esc(message)}</div>` : ''}
    </div>
    ${actionHtml}
  </div>`;
}
```

CSS in `styles/components.css`: mirror mockup's `.banner`, `.banner__icon/__body/__title/__message/__action`, and the five `--overdue/--vacation/--multiplier/--freeze/--info` variants. All colors via `--{variant}-soft/--{variant}` tokens. No raw hex.

### 4.4 `renderFab(options)` — NEW

```js
export function renderFab({ id = 'fabAdd', label = 'Add', icon }) {
  const plus = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  return `<button class="fab" id="${esc(id)}" aria-label="${esc(label)}" type="button">${icon ?? plus}</button>`;
}
```

CSS: identical to mockup `.fab` (56×56 circular, `--accent` bg, fixed at `bottom: calc(--nav-height + --spacing-md); right: --spacing-md`, z-index `var(--z-fab)`). `prefers-reduced-motion` collapses the press-scale transition to none.

### 4.5 `renderSectionHead(title, meta)` — NEW

```js
export function renderSectionHead(title, meta) {
  return `<div class="section__head">
    <div class="section__title">${esc(title)}</div>
    ${meta ? `<div class="section__meta">${esc(meta)}</div>` : ''}
  </div>`;
}
```

Exposed so Calendar, Scoreboard, Tracker can adopt the same pattern in later phases without re-implementing.

### 4.6 `renderOverflowMenu(items)` — NEW

Items: `Array<{ id, label, icon?: string, href?: string, variant?: 'default'|'danger' }>`.

```html
<div class="overflow-menu">
  <button class="overflow-menu__item" data-item-id="{id}" type="button">
    <span class="overflow-menu__icon">{icon}</span>
    <span class="overflow-menu__label">{label}</span>
  </button>
  …
</div>
```

Used by:
- Header overflow (Bell neighbor): Rewards · Admin · Theme · Debug.
- Bottom-nav **More** tab: same items.

Both call `renderBottomSheet(renderOverflowMenu(items))` into `#taskSheetMount`.

### 4.7 `renderFilterChip(label, count)` + `renderPersonFilterSheet(people, activePerson)` — NEW

The old inline pill bar is replaced by a single chip with active-filter label. Tapping opens a sheet with the All / per-person options.

```html
<!-- chip: placed inline above the Today section, ONLY when people.length > 1 -->
<button class="filter-chip" id="openFilterSheet" type="button">
  <span class="filter-chip__label">All</span>   <!-- or person.name -->
  <span class="filter-chip__caret">▾</span>
</button>
```

Sheet body: a list-group of rows (All + one per person, with the active row showing a check). Selection closes the sheet and triggers the existing `setActivePerson` logic.

**Phase 1 placement rule:** When `people.length === 1`, the chip is not rendered. When `people.length >= 2`, chip is rendered once at the top of the `Today` section, inside `.section__head` to the right of `section__meta` (stacking vertically if cramped at 320px).

### 4.8 `renderNavBar(activePage, options)` — signature change

```js
renderNavBar(activePage, { onMoreClick })
```

- Adds 5th item `More` as a button (not a link).
- Legacy call sites (`renderNavBar('home')`) continue to work — when `onMoreClick` is undefined, the More item renders with `data-more-unbound="1"` and does nothing (safe no-op). Dashboard passes `onMoreClick` in Phase 1; Calendar/Scoreboard/Tracker pick it up in their respective phases.

---

## 5. Behavior changes

### 5.1 Date navigation

| Action | Before | After |
|---|---|---|
| Prev/next-day arrows | visible buttons | **removed** |
| Swipe left/right on page | Navigates ±1 day | **unchanged** (touchstart/touchend logic preserved) |
| "Today" jump when off-today | `Back to Today` ghost button below date-header | `Back to Today` secondary-sm button below banner |
| Future-date indicator | Day name + full date header | Header subtitle = `formatDateLong(viewDate)`; update the subtitle when `viewDate` changes |

`celebrationShown` reset behavior: unchanged. `subscribeSchedule(viewDate)` on change: unchanged.

### 5.2 Banner queue

New resolver (§3.3) runs on every `render()`. Source of truth per variant:

| Variant | Data source |
|---|---|
| overdue | `overdueItems.filter(e => !isComplete(e.entryKey, completions))` already computed in `render()` |
| multiplier | New read: `rundown/multipliers/{today}`; listener added so multiplier changes re-render |
| vacation | **stub** — always `null` (Phase 2.4 fills in) |
| freeze | **stub** — always `null` |
| info | Not used in Phase 1 |

Overdue banner action (`View`) opens a Bottom Sheet listing overdue cards (using `renderTaskCard`). Replaces the inline expand/collapse pattern. Dismiss by sheet close; no state persistence.

### 5.3 FAB replaces header Add

`openAddMenu()` (existing) is bound to `#fabAdd`. `#headerAddTask` click handler (line 1617 in current `dashboard.js`) is deleted along with the header Add-Task button.

### 5.4 Rotation tag

Rendered inside `.card__meta` after the category/time pair. Logic:

```js
const rotationLabel = { weekly: 'Weekly', monthly: 'Monthly', once: 'One-Time' }[task.rotation];
const rotationTag = rotationLabel
  ? `<span class="tag tag--rotation">${rotationLabel}</span>`
  : '';
```

CSS: `.tag--rotation { background: var(--surface-2); color: var(--text-muted); }`.

### 5.5 Today sort logic

Flat list — no visible subheaders. `sortEntries(entries, completions, tasks, people)` is extended in `shared/state.js` to sort by:

1. **Incomplete before complete** (existing).
2. **Owner** — by the order they appear in `rundown/people` (existing behavior preserved).
3. **Late-today first within owner (incomplete entries only)** — a new bump: within each owner's **incomplete** entries, those whose `task.rotation !== 'daily'` AND whose `dedicatedDate < today` (i.e., surfaced-onto-today from a past date) float to the top of that owner's incomplete block. **Not applied to completed entries** — late-completed cards in the `.card--done` block shouldn't read as problem children. This is the refinement from decision #9: surface the one priority signal that matters without introducing a separate section or subheader.
4. **Time-of-day** — `am (0) < anytime (1) < pm (2)` (existing).
5. **Name** (alphabetical, case-insensitive) — **new tiebreaker** to stabilize sort across renders.

Completed entries follow the same rule but are segregated to the end of the list by rule 1. No "Completed (N)" header; `.card--done` styling is the only affordance.

```js
// shared/state.js — sortEntries pseudo-diff
function lateTodayRank(entry, tasks, today, isComplete) {
  if (isComplete) return 1; // don't bump completed entries
  const t = tasks.find(x => x.id === entry.taskId);
  if (!t || t.rotation === 'daily') return 1;
  if (entry.dedicatedDate && entry.dedicatedDate < today) return 0;
  return 1;
}
// sort key: [completeRank, ownerRank, lateTodayRank, todRank, nameLower]
```

### 5.6 Completed sink

`render()` no longer builds separate "completed by frequency" groups. Completed entries are sorted using the same `sortEntries` rule and appended to the Today section after all incomplete cards. `.card--done` class drives the muted visual (opacity 0.58, strikethrough title).

### 5.7 Person filter

- `people.length < 2`: no filter chrome at all. `activePerson` forced to `null` (or the single person's id when in `?person=` mode).
- `?person=` / kid-link mode: **chip hidden** regardless of `people.length`. `activePerson` is locked to the URL person. Matches kid-mode philosophy and the header title already collapses to the person's first name (§3.2).
- `people.length >= 2` AND not in `?person=` mode: `.filter-chip` visible in `.section__head` of the Today section. Tapping opens the filter sheet. Selection persists to `linkedPerson.prefs.dashboard.personFilter` (existing logic — no change).
- Filtered state re-runs the entire `render()` (full re-render is the current pattern — preserved).

### 5.8 Header subtitle updates on date change

`renderHeader` output is computed once on page load. When `viewDate` changes via swipe, the subtitle must update. Add a small DOM-patching step in `changeDay()`:

```js
function updateHeaderSubtitle() {
  const el = document.querySelector('.app-header__subtitle');
  if (el) el.textContent = formatDateLong(viewDate);
}
```

Called after each `changeDay` / "Back to Today" click, immediately before `render()`.

### 5.9 Bell integration

`initBell()` signature unchanged. It currently locates `#headerBell` and wires. Target stays `#headerBell`; the unseen-count badge is the `.btn-icon__dot` (toggled `.is-hidden`). Updating `initBell` to toggle `.btn-icon__dot` instead of the current `.bell__badge` is in scope; the legacy `.bell__badge` DOM goes away with `.header__bell`.

**Bell sheet contents are unchanged in Phase 1.** `initBell` continues to own approvals, activity feed, and bonus/deduction/multiplier creators. Only the trigger glyph markup and badge class change — sheet rendering, contents, and open/close behavior are untouched. Redesigning the sheet itself is out of scope for Phase 1 and will be evaluated during the Rewards unification phase (6).

---

## 6. Verification

### 6.1 Grep recipes (Phase 0 §A appendix + Phase-1-specific)

```bash
# 1. Zero inline styles in index.html (clears Phase 0 §2.4 register row)
grep -Pn 'style="' index.html
# Expected: 0 matches

# 2. Zero raw hex in styles/dashboard.css (confirms no regression from Phase 0 baseline of 0)
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/dashboard.css
# Expected: 0 matches

# 3. No retired dashboard classes in index.html or dashboard.js
grep -nE '\.(date-header|date-nav|time-header|overdue-banner|overdue-list|progress-section|progress-bar__fill|header__title|header__left|header__right|header__subtitle|header__date|header__stats|header__admin|header__debug|header__theme|header__add-task|header__bell|nav-item)\b' index.html dashboard.js
# Expected: 0 matches

# 4. No retired dashboard rules in styles/dashboard.css (some may survive if Scoreboard/Tracker still use them — verify with grep below, then decide per-selector)
grep -nE '^\.(date-header|date-nav|time-header|overdue-banner|overdue-list|progress-section)' styles/dashboard.css
# Expected: 0 matches

# 5. No additional window.confirm / window.alert introduced
grep -rPn '\bwindow\.(confirm|alert)\s*\(' --include='*.js' --include='*.html' .
# Expected: 0 matches

# 6. One-and-only-one banner mount per page (sanity)
grep -Pn 'id="bannerMount"' index.html
# Expected: exactly 1 match

# 7. FAB present, single instance
grep -Pn 'id="fabMount"' index.html
# Expected: exactly 1 match

# 8. Bottom nav has exactly 5 items (render path)
grep -nE 'NAV_ITEMS' shared/components.js
# Expected: NAV_ITEMS array has 5 entries (4 links + 1 'more' button). Manually inspect.
```

### 6.2 Manual smoke (Phase 1 exit)

- [ ] Dashboard loads at 375px; header shows `Home` / `Sunday, …`; Bell + 3-dot only on right.
- [ ] Multiplier banner renders when a multiplier exists for `today`; overdue banner renders otherwise; no banner when neither.
- [ ] Tap card → toggle works. Long-press → detail sheet opens (unchanged).
- [ ] Completed cards drop to the bottom with `.card--done` (opacity + strikethrough). No "Completed" header.
- [ ] Rotation tag shows on weekly/monthly/one-time tasks; absent on daily.
- [ ] Section meta shows `N of M done`; no grade/% on page.
- [ ] Events section appears above Today when events exist; absent otherwise.
- [ ] Tap FAB → Add menu sheet (Event / Task). Both flows complete successfully.
- [ ] Tap More → overflow sheet with Rewards, Admin, Theme, Debug (Debug only when `dr-debug=true`).
- [ ] Tap overflow (header 3-dot) → same menu as More.
- [ ] Swipe left/right → changes day; subtitle updates; "Back to Today" pill appears on non-today; tapping it returns.
- [ ] Person filter chip appears only when `people.length >= 2` AND NOT in `?person=` mode; selecting a person re-renders; `prefs.dashboard.personFilter` persists.
- [ ] `?person=Noah` (kid-link mode): no filter chip visible; `activePerson` locked to Noah.
- [ ] Owner left-stripe visible on all task cards using the owner's color; event stripe uses event color; completed stripe is 40% mix.
- [ ] Empty state renders when `sortedToday.length === 0` ("Nothing on the list · Enjoy your day."). Works both for an unfiltered day with no entries and for a filter that returns nothing.
- [ ] All-done state: section meta shows `All done`, completed cards below, no empty block.
- [ ] Tap `.card--event` opens the calendar day view scrolled to the event; long-press opens the event detail sheet.
- [ ] At 768px: main content centered at max-width 560px; layout is single column (no two-pane).
- [ ] Celebration still fires on all-done; confetti respects `prefers-reduced-motion`.
- [ ] Offline banner still shows when offline; queued completion syncs on reconnect.
- [ ] Dark mode: header, cards, banner, FAB, nav all switch cleanly.
- [ ] Lighthouse accessibility score ≥ Phase 0 post-merge baseline.
- [ ] Tap targets ≥ 44×44 on all interactive elements (Bell, Overflow, FAB, card body, check, filter chip, "Back to Today", nav items).

### 6.3 Visual baseline

1. Capture Phase 1 post-baselines for `index.html` at 375px and 768px × {light, dark} = 4 PNGs, saved to `docs/superpowers/baselines/phase-1/dashboard-<width>-<mode>.png`.
2. Compare side-by-side with `docs/superpowers/baselines/phase-0/dashboard-*.png` (pre-Phase-0 snapshots, which are Phase 1's reference per Phase 0 spec §6.3 amendment).
3. Spot-check: header restructured, card pattern visible, FAB visible, 5-tab nav.

Phase 1 baselines become the reference for Phase 2.

---

## 7. Commit strategy

Seven logical commits. Each leaves the app in a coherent state so `git bisect` narrows cleanly.

1. **`feat(components): add banner/fab/section/overflow helpers in shared/components.js`** — additive only. New exports, no callsites yet.
2. **`feat(styles): add mockup card/banner/fab/section rules to components.css + layout.css header & nav`** — CSS is additive; old `.task-card`, `.header__*`, `.nav-item`, `.bottom-nav` rules remain in place during transition.
3. **`refactor(dashboard): restructure index.html + dashboard.js to mockup DOM`** — adopts new header, banner mount, FAB mount, section markup, removes inline styles. New signatures for `renderHeader`, `renderNavBar` used here. Calendar/Scoreboard/Tracker still use legacy signatures (old path kept).
4. **`feat(dashboard): banner priority queue + multiplier read + overdue sheet`** — wires `resolveBanner`, `onValue` for multipliers, overdue sheet.
5. **`feat(dashboard): FAB + More menu + overflow header menu`** — deletes header Add-Task; wires FAB click to `openAddMenu`; adds 5th nav tab and More sheet; Overflow and More share `renderOverflowMenu`.
6. **`refactor(styles): retire dead dashboard/header/nav CSS rules`** — deletes `.date-*`, `.overdue-banner`, `.time-header`, `.progress-section`, old `.header__*`, old `.nav-item` (scoped to dashboard use only — rules still used by other pages move to those pages' CSS or stay until their rework phase).
7. **`chore(sw): bump CACHE_NAME to v46 + capture phase-1 baselines + docs`** — SW bump, `docs/superpowers/baselines/phase-1/` PNGs, updates to `2026-04-19-ui-rework.md` (§2.1 row), this spec marked Status: Landed with dated notes for any deviation.

Commit 3 is the largest. If it exceeds ~600 lines of diff, split into 3a (header + main structure), 3b (section/card render in `dashboard.js`), 3c (retired inline-style removal).

---

## 8. Rollback plan

| Scenario | Action |
|---|---|
| Single commit breaks mid-PR | `git revert <sha>` — chain is linear and each commit leaves the app runnable. |
| Merged PR regresses production | `git revert <merge-sha>`; Cloudflare redeploys in ~1 min; SW bump in the revert commit forces clients to pull the revert. |
| Multiplier banner data misread | Feature-flag by falling back to `null` from `resolveBanner` — one-line fix, no rollback. |
| FAB z-index collision on kid/calendar | FAB mount lives in `#fabMount` — remove mount tag on problem page; no code rollback needed. |

**Data safety:** Zero Firebase schema changes. Zero destructive writes. The only new read is `rundown/multipliers/{today}`, which already exists and is written from the Bell dropdown.

---

## 9. Known risks & mitigations

| Risk | Mitigation |
|---|---|
| `.task-card` alias leaks into Phase 2+ unchanged | Explicit Phase 2 exit criterion: "remove `.task-card` class from `renderTaskCard` root"; Calendar day sheet migrates to `.card` in the same phase. |
| Overdue sheet feels worse than the inline expand/collapse | Sheet is the spec pattern (DESIGN §5.3); inline is non-standard. If UX complains, we tune the sheet header, not re-introduce the inline pattern. |
| Multiplier listener churn on every day-change | `onValue` stays subscribed to `rundown/multipliers` for the page lifetime; we read-filter by date in JS. One listener, cheap reads. |
| Person filter sheet adds a tap that wasn't there before | Only when `people.length >= 2`. Single-person families see no extra chrome. |
| Header subtitle doesn't update on swipe | `updateHeaderSubtitle()` explicitly called in `changeDay` — manual-smoke item #4. |
| FAB overlaps card tap region on very short pages | FAB is fixed-position with `--z-fab`; card tap region is below. Smoke test at shortest case: one task card only. |
| Bell badge migration (`.bell__badge` → `.btn-icon__dot`) misses a callsite | `initBell` is the only writer; verify with grep for `bell__badge` (should drop to 0 in `shared/`). |

---

## 10. Review gate before starting Phase 2

Before writing the Phase 2 spec, the following must be true:

- [ ] All grep recipes (§6.1) return the expected counts.
- [ ] Phase 0 §2.4 deferred register: rows for `index.html` inline styles and `styles/dashboard.css` hex are both 0.
- [ ] `docs/superpowers/plans/2026-04-19-ui-rework.md` reflects any scope deviations; Phase 1.3/1.4 ambient-strip wiring notes landed; Phase 3 ambient-strip toggle exit criterion landed.
- [ ] This spec is the accurate record of what shipped; deviations amended inline with dated notes.
- [ ] `docs/superpowers/baselines/phase-1/dashboard-*.png` committed.
- [ ] §6.2 manual smoke test completed on Cloudflare deploy; PR #2 body lists each item as a test-plan checkbox.

---

## 11. Appendix — Plan updates landing with this spec

The following amendments to `docs/superpowers/plans/2026-04-19-ui-rework.md` ship in the same PR:

1. **Phase 1.3 (Meals)** gains a wiring note: "Adds the second ambient chip to `index.html`'s ambient row and begins rendering the row when `settings.ambientStrip === true`."
2. **Phase 1.4 (Weather)** gains a wiring note: "Adds the first ambient chip to `index.html`'s ambient row and the Calendar header weather chip per DESIGN.md §6.2."
3. **Phase 3 (Admin)** gains an exit criterion: "Expose `settings.ambientStrip` as a toggle in Admin → Settings → Display."

These ensure the ambient strip deferral from Phase 1 is load-bearing and can't silently drift.

---

## 12. Open questions

None. All clarifying decisions are recorded in §2.4. If the Phase 1 build surfaces a question this spec doesn't answer, amend this spec inline (dated note) and/or update DESIGN.md in the same PR.

---

## 13. Deviations from spec (landed 2026-04-23)

Phase 1 landed on branch `phase-1-dashboard` across Tasks 1–9. Three deviations from the spec-as-written were made during execution and are recorded here so later phases can retire the remaining legacy surface:

1. **Legacy `.header__*` rules kept in `styles/layout.css`.** The spec implied these would retire alongside the new `.header-v2` DOM. They were kept because `_renderHeaderLegacy` is still the entry point for Calendar, Scoreboard, Tracker, Admin, and Setup; dashboard + person + kid are the only pages on the v2 header so far. Retirement rolls forward to whichever phase migrates the last legacy header consumer (latest: Phase 3 Admin).
2. **`.overdue-banner*` rules kept in `styles/components.css`.** Dashboard now uses the generic `.banner--overdue` via `renderBanner`, but `kid.html` still calls `renderOverdueBanner` which emits the legacy markup. Retire these rules in Phase 5 (Kid).
3. **`.progress-section` / `.progress-bar__fill` rules kept in `styles/components.css`.** Dashboard no longer renders a progress bar, but `scoreboard.html`, `tracker.html`, and `kid.html` still call `renderProgressBar`. Retire in whichever phase last migrates those consumers.
4. **`bannerMount` is injected by `dashboard.js` rather than inlined in `index.html`.** Spec §6.1 grep #6 expected one match for `id="bannerMount"` in `index.html`; actual implementation inserts the mount div from within the page's render path. Functional behavior is identical; the grep is a coverage deviation only.

These deviations do not affect Phase 1's exit criteria (dashboard visuals + DOM + banner + FAB + nav are all spec-aligned). They are structural leftovers from page-at-a-time migration and are tracked against later phases rather than patched into Phase 1.
