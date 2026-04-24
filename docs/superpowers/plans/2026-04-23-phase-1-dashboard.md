# Phase 1 — Dashboard Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the dashboard (index.html + dashboard.js + CSS) to match `mockups/01-dashboard.html` — calm header, single-slot priority banner, owner-striped task cards, flat completed sink, FAB, 5-tab bottom nav — with zero Firebase schema changes.

**Architecture:** Vanilla ES modules (no bundler, no npm, no test suite). All data access stays in `shared/firebase.js`. All DOM in the page (`dashboard.js`) or in `shared/components.js` renderers. New components are added to `shared/components.js` as additional exports; existing signatures are extended with backward-compat fallbacks so Calendar / Scoreboard / Tracker keep working until their own phases. Verification is grep recipes + manual smoke per `docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md` §6 (there is no automated test runner to wire into).

**Tech Stack:** Vanilla JS ES modules, Firebase RTDB compat SDK via CDN, service worker with `CACHE_NAME` versioning, CSS custom properties token system from Phase 0 (`--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--accent`, `--owner-a..d`, `--danger/-soft`, `--success/-soft`, `--warning/-soft`, `--info/-soft`, `--spacing-*`, `--radius-*`, `--z-*`).

**Spec:** [docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md](../specs/2026-04-23-phase-1-dashboard-rework.md)
**Mockup:** [mockups/01-dashboard.html](../../../mockups/01-dashboard.html)
**Mockup CSS:** [mockups/design-system.css](../../../mockups/design-system.css)
**Design source of truth:** [docs/DESIGN.md](../../DESIGN.md)

---

## Prerequisites

- [ ] On branch `phase-1-dashboard` (already the case).
- [ ] Phase 0 has shipped (commit `360197a`).
- [ ] Working tree clean, or only holds documentation edits from the spec session.
- [ ] `sw.js` `CACHE_NAME` currently reads `family-hub-v45`.

If any of those are false, stop and reconcile before starting.

---

## Task 1: Add new component helpers in `shared/components.js` (additive only)

**Files:**
- Modify: `shared/components.js` (append new exports; no callsite changes)

**Why this task:** Lays down the renderer surface Phase 1 uses (banner, FAB, section head, overflow menu, filter chip). Additive-only means the old dashboard still works while we stage the new components. No callsite changes in this task.

- [ ] **Step 1: Open `shared/components.js` and locate the existing `escapeHtml` import and `esc` helper (top of file, ~lines 1–8).** New exports will go in logical groups: banner + FAB near `renderOverdueBanner`, section head after `renderTaskCard`, overflow menu + filter chip near `renderHeader`. Read the file once end-to-end before adding — existing export order matters for later Edit diffs.

- [ ] **Step 2: Add `renderBanner` export.** Insert the following block directly after the existing `renderOverdueBanner` function (locate via grep: `export function renderOverdueBanner`). Do not modify `renderOverdueBanner` itself — that happens in Task 8.

```js
/**
 * Single-slot banner. Variants: overdue | multiplier | vacation | freeze | info.
 * Called by dashboard.js resolveBanner(); caller is responsible for mounting the
 * returned HTML into #bannerMount and wiring any action button via click delegation.
 */
export function renderBanner(variant, { title, message, action } = {}) {
  const iconMap = { overdue: '!', multiplier: '*', vacation: 'V', freeze: '-', info: 'i' };
  const icon = iconMap[variant] ?? 'i';
  const actionHtml = action
    ? `<button class="banner__action" data-banner-action="1" type="button">${esc(action.label)}</button>`
    : '';
  const msgHtml = message ? `<div class="banner__message">${esc(message)}</div>` : '';
  return `<div class="banner banner--${esc(variant)}" role="status">
    <div class="banner__icon" aria-hidden="true">${icon}</div>
    <div class="banner__body">
      <div class="banner__title">${esc(title)}</div>
      ${msgHtml}
    </div>
    ${actionHtml}
  </div>`;
}
```

**Note on icons:** Spec §3.3 calls for `⚠ / ✦ / ✈ / ❄ / i` glyphs but warns against emoji-variant selectors (U+FE0F). These Unicode characters are monochrome-safe on target browsers, but to be extra safe in Phase 1 we use ASCII placeholders (`! * V - i`) and replace them with proper SVGs in Phase 2 when we redesign the icon system. If the user prefers the Unicode glyphs now, swap the map; behavior is otherwise identical.

- [ ] **Step 3: Add `renderFab` export.** Immediately after `renderBanner`:

```js
/**
 * Floating Action Button. Default icon is a plus (24x24 SVG, strokeWidth via CSS).
 * Caller provides id + aria-label; click is bound by the page (dashboard.js) via
 * addEventListener on the returned element after it is mounted.
 */
export function renderFab({ id = 'fabAdd', label = 'Add', icon } = {}) {
  const plus = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  return `<button class="fab" id="${esc(id)}" aria-label="${esc(label)}" type="button">${icon ?? plus}</button>`;
}
```

- [ ] **Step 4: Add `renderSectionHead` export.** After `renderFab`:

```js
/**
 * Section head used by dashboard Events + Today sections. Exposed so Calendar,
 * Scoreboard, Tracker can reuse in their own phases.
 */
export function renderSectionHead(title, meta) {
  const metaHtml = meta ? `<div class="section__meta">${esc(meta)}</div>` : '';
  return `<div class="section__head">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
  </div>`;
}
```

- [ ] **Step 5: Add `renderOverflowMenu` export.** After `renderSectionHead`:

```js
/**
 * Items: Array<{ id, label, icon?: string (HTML/SVG), variant?: 'default'|'danger' }>.
 * Rendered inside a bottom sheet (the page calls renderBottomSheet(renderOverflowMenu(items))).
 * The page binds clicks via delegation: data-item-id attribute identifies the chosen row.
 */
export function renderOverflowMenu(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map(it => {
    const iconHtml = it.icon ? `<span class="overflow-menu__icon" aria-hidden="true">${it.icon}</span>` : '';
    const variantCls = it.variant === 'danger' ? ' overflow-menu__item--danger' : '';
    return `<button class="overflow-menu__item${variantCls}" data-item-id="${esc(it.id)}" type="button">
      ${iconHtml}
      <span class="overflow-menu__label">${esc(it.label)}</span>
    </button>`;
  }).join('');
  return `<div class="overflow-menu" role="menu">${rows}</div>`;
}
```

- [ ] **Step 6: Add `renderFilterChip` + `renderPersonFilterSheet` exports.** After `renderOverflowMenu`:

```js
/**
 * A single chip that opens the person filter sheet. Rendered only when
 * people.length >= 2 AND not in ?person= link mode. See spec §3.6 / §5.7.
 */
export function renderFilterChip({ id = 'openFilterSheet', label = 'All' } = {}) {
  const caret = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  return `<button class="filter-chip" id="${esc(id)}" type="button" aria-haspopup="dialog">
    <span class="filter-chip__label">${esc(label)}</span>
    <span class="filter-chip__caret" aria-hidden="true">${caret}</span>
  </button>`;
}

/**
 * List-group sheet body: All row + one per person, with the active row checked.
 * Rendered inside renderBottomSheet by the page. Rows carry data-person-id
 * (empty string = All). Page binds click delegation.
 */
export function renderPersonFilterSheet(people, activePersonId) {
  const rows = [
    { id: '', name: 'All', active: !activePersonId },
    ...people.map(p => ({ id: p.id, name: p.name, active: p.id === activePersonId }))
  ];
  const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const body = rows.map(r => `
    <button class="list-row${r.active ? ' is-active' : ''}" data-person-id="${esc(r.id)}" type="button">
      <span class="list-row__label">${esc(r.name)}</span>
      <span class="list-row__trailing" aria-hidden="true">${r.active ? check : ''}</span>
    </button>
  `).join('');
  return `<div class="list-group" role="menu">${body}</div>`;
}
```

- [ ] **Step 7: Verify additive change — grep for new exports to confirm presence.**

```bash
grep -nE "^export function (renderBanner|renderFab|renderSectionHead|renderOverflowMenu|renderFilterChip|renderPersonFilterSheet)\b" shared/components.js
```

Expected: exactly 6 matches (one per new export).

- [ ] **Step 8: Open `index.html` in a browser (or Cloudflare preview).** Confirm the current dashboard still loads and functions exactly as before (new exports are not called yet).

- [ ] **Step 9: Commit.**

```bash
git add shared/components.js
git commit -m "$(cat <<'EOF'
feat(components): add banner/fab/section/overflow helpers in shared/components.js

Phase 1 preparation: adds renderBanner, renderFab, renderSectionHead,
renderOverflowMenu, renderFilterChip, renderPersonFilterSheet. No
callsites yet — purely additive so the current dashboard continues to
render while the new DOM contract is staged.

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §4

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `renderHeader` and `renderNavBar` signatures (backward-compat)

**Files:**
- Modify: `shared/components.js` — `renderHeader` (around line 144) and `renderNavBar` (around line 102)

**Why this task:** Dashboard needs the new header shape (title + subtitle + bell + 3-dot overflow) and the 5-tab bottom nav (adds `More`). All other pages still use the legacy signature in Phase 1; we detect the old shape and fall back to today's markup.

- [ ] **Step 1: Read current `renderHeader` body to capture the legacy template exactly.**

```bash
grep -n "export function renderHeader" shared/components.js
```

Then Read lines around the match (usually 40-80 lines for the full function). Save the full legacy template verbatim — you'll embed it inside a conditional branch.

- [ ] **Step 2: Rewrite `renderHeader` with shape-detection.** Replace the existing function body with:

```js
/**
 * Header renderer. Supports TWO call shapes during Phase 1:
 *
 *  NEW (dashboard):
 *    renderHeader({ title, subtitle, showBell, overflowItems })
 *
 *  LEGACY (all other pages, until their own phase):
 *    renderHeader({ appName, subtitle, dateLine, showAdmin, showDebug,
 *                   showAddTask, showThemePicker, showBell, bellCount, rightContent })
 *
 * Detection: new shape has `title`; legacy has `appName`.
 */
export function renderHeader(options = {}) {
  if (options.title !== undefined) {
    return _renderHeaderV2(options);
  }
  return _renderHeaderLegacy(options);
}

function _renderHeaderV2({ title, subtitle, showBell, overflowItems }) {
  const bellHtml = showBell
    ? `<button class="btn-icon" id="headerBell" aria-label="Notifications" type="button">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
           <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
         </svg>
         <span class="btn-icon__dot is-hidden" id="headerBellDot" aria-hidden="true"></span>
       </button>`
    : '';
  const overflowHtml = (Array.isArray(overflowItems) && overflowItems.length)
    ? `<button class="btn-icon" id="headerOverflow" aria-label="More" type="button">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <circle cx="12" cy="5" r="1.4"></circle>
           <circle cx="12" cy="12" r="1.4"></circle>
           <circle cx="12" cy="19" r="1.4"></circle>
         </svg>
       </button>`
    : '';
  return `<header class="app-header">
    <div class="app-header__text">
      <div class="app-header__title">${esc(title)}</div>
      ${subtitle ? `<div class="app-header__subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="app-header__actions">
      ${bellHtml}
      ${overflowHtml}
    </div>
  </header>`;
}

function _renderHeaderLegacy(options) {
  // Paste the current legacy body here verbatim — captured in Step 1.
  // … existing implementation …
}
```

**Important:** replace the `// … existing implementation …` placeholder with the real legacy body captured in Step 1. Do not delete any legacy behavior — Calendar / Scoreboard / Tracker / Admin still depend on it.

- [ ] **Step 3: Rewrite `renderNavBar` to accept 5 items.** Locate `renderNavBar`:

```bash
grep -n "export function renderNavBar" shared/components.js
```

Replace its body with:

```js
/**
 * Bottom navigation. 5 items: Home, Calendar, Scores, Tracker, More.
 * More is a button (opens a sheet in-page); the first four are anchors.
 *
 * Signatures:
 *   renderNavBar(activePage)                       // legacy — More is rendered
 *                                                  //   but unbound (no-op)
 *   renderNavBar(activePage, { onMoreClick })      // Phase 1+ — dashboard binds More
 *
 * Person-link mode: the page rewrites href values after render (existing behavior).
 */
export function renderNavBar(activePage, options = {}) {
  const items = [
    { page: 'home', href: 'index.html', label: 'Home', svg: `<path d="M3 12l9-9 9 9"></path><path d="M5 10v10h14V10"></path>` },
    { page: 'calendar', href: 'calendar.html', label: 'Calendar', svg: `<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>` },
    { page: 'scoreboard', href: 'scoreboard.html', label: 'Scores', svg: `<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M17 4h3v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V4h3"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path>` },
    { page: 'tracker', href: 'tracker.html', label: 'Tracker', svg: `<polyline points="3 12 8 7 13 12 17 8 21 12"></polyline><polyline points="3 18 8 13 13 18 17 14 21 18"></polyline>` }
  ];
  const linkItems = items.map(it => {
    const isActive = it.page === activePage;
    return `<a class="bottom-nav__item nav-item${isActive ? ' is-active nav-item--active' : ''}" href="${it.href}" data-page="${it.page}">
      <svg class="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${it.svg}</svg>
      <span class="nav-item__label">${it.label}</span>
    </a>`;
  }).join('');
  const moreItem = `<button class="bottom-nav__item nav-item" id="navMore" type="button"${options.onMoreClick ? '' : ' data-more-unbound="1"'}>
    <svg class="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5"></circle>
      <circle cx="12" cy="12" r="1.5"></circle>
      <circle cx="19" cy="12" r="1.5"></circle>
    </svg>
    <span class="nav-item__label">More</span>
  </button>`;
  return `<nav class="bottom-nav" role="navigation" aria-label="Main navigation">${linkItems}${moreItem}</nav>`;
}
```

Both `.bottom-nav__item` (spec class) and `.nav-item` (legacy alias) are emitted together so current CSS continues to style them while the new CSS is added in Task 4.

- [ ] **Step 4: Verify legacy callers still work.** Open `calendar.html`, `scoreboard.html`, `tracker.html`, `admin.html` in the browser. Each page's header + nav should look identical to before. If any page breaks, the legacy header branch was not captured verbatim — revisit Step 1.

- [ ] **Step 5: Commit.**

```bash
git add shared/components.js
git commit -m "$(cat <<'EOF'
refactor(components): dual-shape renderHeader + 5-tab renderNavBar

renderHeader now accepts { title, subtitle, showBell, overflowItems }
(new dashboard shape) OR the legacy { appName, showAdmin, showDebug, … }
shape used by Calendar/Scoreboard/Tracker/Admin. Shape detected by
presence of `title`; legacy path is byte-for-byte unchanged.

renderNavBar grows a 5th item (More) as a button. When options.onMoreClick
is omitted, More renders with data-more-unbound=1 (safe no-op) so other
pages are unaffected until their own phases.

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §4.1 §4.8

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend `renderTaskCard` DOM to slot-based `.card`

**Files:**
- Modify: `shared/components.js` — `renderTaskCard` (around line 295)

**Why this task:** The Today/Events sections need `.card` + `.card__leading/__body/__trailing` DOM to match the mockup. We keep `.task-card` as a root-class alias so Calendar's day sheet (which still queries `.task-card`) continues to work through Phase 1; alias is retired at the top of Phase 2.

- [ ] **Step 1: Read the current `renderTaskCard` end-to-end.** Note the current DOM structure (uses `.task-card` + `.task-card__row` / `.task-card__main` / `.task-card__meta` / `.task-card__tag` etc.). Identify:
  - Where the avatar is emitted
  - Where the category + time + tags are emitted
  - Where the complete/undo button is emitted
  - All `data-*` attributes on the root

Do not edit yet — map the transformation mentally before touching the code.

- [ ] **Step 2: Rewrite `renderTaskCard` to produce slot DOM.** The output must be:

```html
<article class="card task-card{{--event}}{{--done}}"
         data-entry-key="…" data-date-key="…" data-owner-color="…"
         data-person-color="…" data-event-color="…">
  <div class="card__leading">
    <!-- For event-category tasks: eventTimeLabel string -->
    <!-- For normal tasks: <span class="avatar avatar--{a|b|c|d}" data-person-color="…">INITIALS</span> -->
  </div>
  <div class="card__body">
    <div class="card__title">{taskName}{{inline bounty/late tags}}</div>
    <div class="card__meta">
      <span>{categoryLabel}</span>
      <span class="card__meta-dot" aria-hidden="true"></span>
      <span>{timeLabel}</span>
      {{ tag--rotation if rotation !== 'daily' }}
      {{ existing late/bounty/skipped/moved/delegated spans, unchanged classnames }}
      {{ points label if showPoints }}
    </div>
  </div>
  <div class="card__trailing">
    <button class="check{{--done}}" aria-label="{completed ? 'Undo' : 'Mark complete'}" type="button">
      {{ completed ? <svg check> : '' }}
    </button>
  </div>
</article>
```

Keep all existing `data-*` attributes on the root. Keep all existing tag class names (`.task-card__tag`, `--late`, `--bounty`, `--skipped`, `--moved`, `--delegated`) — they are re-skinned in Task 4 CSS but the class names persist for one phase. Add the new `.tag.tag--rotation` span INSIDE `.card__meta` when `task.rotation` is `weekly | monthly | once`:

```js
const rotationLabel = task.rotation === 'weekly' ? 'Weekly'
  : task.rotation === 'monthly' ? 'Monthly'
  : task.rotation === 'once' ? 'One-Time'
  : null;
const rotationTag = rotationLabel
  ? `<span class="tag tag--rotation">${esc(rotationLabel)}</span>`
  : '';
```

For event-category tasks (`cat.isEvent === true`):
- Root classes: `card card--event task-card task-card--event`
- `.card__leading` contains the event time label (e.g., `10:30`) in plain text — no avatar span
- `data-event-color` remains on the root

For completed entries (`completed === true`):
- Root classes include `card--done task-card--done`
- `.check` button adds `--done` modifier and renders the check SVG

- [ ] **Step 3: Verify no inline styles, no raw hex in the new template.** `esc()` everything that's user-provided. `data-*-color` attributes carry colors — `applyDataColors` converts them to CSS custom properties at insertion time. No `style="background: …"` inline.

- [ ] **Step 4: Open `index.html` in the browser.** Task cards should render — they'll be *partially* styled (old `.task-card` rules still apply), but the new slot classes won't have CSS yet. That's expected — cards should still be functional (tap, long-press, complete). If anything is broken (missing avatar, missing check button, missing tags), the transformation was lossy; revisit Step 2.

- [ ] **Step 5: Commit.**

```bash
git add shared/components.js
git commit -m "$(cat <<'EOF'
refactor(components): renderTaskCard adopts .card + slot DOM

Adds .card / .card__leading / .card__body / .card__trailing / .card__title /
.card__meta DOM wrapper while retaining .task-card / .task-card__* classnames
on the root + children. Dual classes let Phase 1 CSS (new .card rules) and
Phase 0 CSS (existing .task-card rules) coexist until Task 4.

New: .tag.tag--rotation span inside .card__meta for weekly/monthly/once tasks.

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §4.2 §5.4

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add mockup CSS — `.card`, `.banner`, `.fab`, `.section`, header, 5-tab nav

**Files:**
- Modify: `styles/components.css` (add new rule blocks)
- Modify: `styles/layout.css` (rewrite `.app-header` + `.bottom-nav`)

**Why this task:** Ships the visual identity from `mockups/design-system.css` using Phase 0 tokens. Existing `.task-card`, old `.app-header`, old `.bottom-nav` rules stay in place during this task — they are retired in Task 8 once all callsites have migrated.

- [ ] **Step 1: Read `mockups/design-system.css` end-to-end.** The target rules live there. Note which selectors you'll mirror: `.app-header`, `.app-header__text`, `.app-header__title`, `.app-header__subtitle`, `.app-header__actions`, `.btn-icon`, `.btn-icon__dot`, `.section`, `.section__head`, `.section__title`, `.section__meta`, `.card`, `.card__leading/__body/__trailing/__title/__meta/__meta-dot`, `.card--event`, `.card--done`, `.avatar`, `.avatar--a/--b/--c/--d`, `.check`, `.check--done`, `.tag`, `.tag--rotation/--bounty/--late/--school`, `.banner`, `.banner--overdue/--vacation/--multiplier/--freeze/--info`, `.banner__icon/__body/__title/__message/__action`, `.fab`, `.bottom-nav`, `.bottom-nav__item`, `.overflow-menu`, `.overflow-menu__item/__icon/__label`, `.filter-chip`, `.filter-chip__label/__caret`, `.list-group`, `.list-row`, `.list-row__label/__trailing`, `.ambient-row` (deferred but spacing reserved), `.back-to-today`, `.empty`, `.empty__title`, `.empty__message`.

- [ ] **Step 2: Port `.section*`, `.card*`, `.tag*`, `.avatar*`, `.check*`, `.banner*`, `.overflow-menu*`, `.filter-chip*`, `.list-group`, `.list-row*`, `.empty*`, `.back-to-today`, `.fab` to `styles/components.css`.** Append a new commented block at the end of the file:

```css
/* ============================================================
   Phase 1 — Dashboard rework (mockup-aligned components)
   Source: mockups/design-system.css
   ============================================================ */

/* Section */
.section { margin: var(--spacing-lg) 0; padding: 0 var(--spacing-md); }
.section__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--spacing-xs) 0 var(--spacing-sm);
}
.section__title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.section__meta  { font-size: var(--font-size-sm); color: var(--text-faint); }

/* Card (slot-based) */
.card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--spacing-md);
  align-items: center;
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition: background var(--t-fast), transform var(--t-fast);
}
.card::before {
  content: "";
  position: absolute; inset: 0 auto 0 0;
  width: 3px; border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  background: var(--owner-color, transparent);
}
.card__leading { display: flex; align-items: center; justify-content: center; min-width: 44px; font-variant-numeric: tabular-nums; color: var(--text-muted); font-size: var(--font-size-sm); }
.card__body { min-width: 0; }
.card__title { font-size: var(--font-size-base); font-weight: 500; color: var(--text); line-height: 1.3; }
.card__meta  { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 2px; font-size: var(--font-size-xs); color: var(--text-muted); }
.card__meta-dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: 0.5; }
.card__trailing { display: flex; align-items: center; }

.card--event::before { background: var(--event-color, var(--accent)); }
.card--done { opacity: 0.58; }
.card--done .card__title { text-decoration: line-through; }
.card--done::before { background: color-mix(in srgb, var(--owner-color) 40%, transparent); }

/* Tag */
.tag {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  font-size: var(--font-size-xs); font-weight: 500;
  border-radius: 999px;
  background: var(--surface-2); color: var(--text-muted);
}
.tag--rotation { /* default styling above */ }
.tag--bounty   { background: var(--accent-soft);   color: var(--accent-ink); }
.tag--late     { background: var(--warning-soft);  color: var(--warning); }
.tag--school   { background: var(--info-soft);     color: var(--info); }

/* Avatar */
.avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 50%;
  font-size: var(--font-size-xs); font-weight: 600; color: var(--text);
  background: color-mix(in srgb, var(--person-color, var(--accent)) 18%, var(--surface-2));
}

/* Check button */
.check {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1.5px solid var(--border); background: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast);
}
.check:hover { border-color: var(--accent); }
.check--done { background: var(--success); border-color: var(--success); color: var(--accent-ink); }
.check--done svg { width: 16px; height: 16px; }

/* Banner (single slot) */
.banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--spacing-md); align-items: center;
  padding: var(--spacing-md); margin: var(--spacing-md);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  color: var(--text);
}
.banner__icon {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface); color: var(--accent);
  font-weight: 700;
}
.banner__title   { font-size: var(--font-size-base); font-weight: 600; }
.banner__message { font-size: var(--font-size-xs); color: var(--text-muted); margin-top: 2px; }
.banner__action {
  background: var(--accent); color: var(--accent-ink);
  border: 0; border-radius: var(--radius-md);
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-xs); font-weight: 600;
  cursor: pointer;
}
.banner--overdue    { background: var(--danger-soft);    color: var(--text); }
.banner--overdue    .banner__icon { background: var(--danger);    color: var(--accent-ink); }
.banner--multiplier { background: var(--accent-soft);   color: var(--text); }
.banner--multiplier .banner__icon { background: var(--accent);   color: var(--accent-ink); }
.banner--vacation   { background: var(--info-soft);     color: var(--text); }
.banner--vacation   .banner__icon { background: var(--info);     color: var(--accent-ink); }
.banner--freeze     { background: var(--info-soft);     color: var(--text); }
.banner--freeze     .banner__icon { background: var(--info);     color: var(--accent-ink); }
.banner--info       { background: var(--surface-2);     color: var(--text); }

/* Back-to-Today pill */
.back-to-today { padding: 0 var(--spacing-md); margin-top: calc(var(--spacing-sm) * -1); margin-bottom: var(--spacing-sm); }
.back-to-today .btn { max-width: 320px; }

/* FAB */
.fab {
  position: fixed;
  right: var(--spacing-md);
  bottom: calc(var(--nav-height, 64px) + var(--spacing-md));
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent); color: var(--accent-ink);
  border: 0; box-shadow: var(--shadow-lg);
  display: flex; align-items: center; justify-content: center;
  z-index: var(--z-fab, 60);
  cursor: pointer;
  transition: transform var(--t-fast);
}
.fab svg { width: 22px; height: 22px; }
.fab:active { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) { .fab { transition: none; } .fab:active { transform: none; } }

/* Overflow menu (shared by header 3-dot + bottom-nav More) */
.overflow-menu { padding: var(--spacing-sm); }
.overflow-menu__item {
  display: flex; align-items: center; gap: var(--spacing-md);
  width: 100%; padding: var(--spacing-md);
  background: transparent; border: 0; color: var(--text);
  font-size: var(--font-size-base); text-align: left;
  border-radius: var(--radius-md); cursor: pointer;
}
.overflow-menu__item:hover { background: var(--surface-2); }
.overflow-menu__item--danger { color: var(--danger); }
.overflow-menu__icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-muted); }

/* Filter chip */
.filter-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px 4px 12px;
  border-radius: 999px;
  background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border);
  font-size: var(--font-size-xs); font-weight: 500;
  cursor: pointer;
}
.filter-chip__caret svg { width: 14px; height: 14px; }

/* List group (person filter sheet body, etc.) */
.list-group { padding: var(--spacing-sm); }
.list-row {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: var(--spacing-md);
  background: transparent; border: 0; color: var(--text);
  font-size: var(--font-size-base); text-align: left;
  border-radius: var(--radius-md); cursor: pointer;
}
.list-row:hover { background: var(--surface-2); }
.list-row.is-active { background: var(--accent-soft); color: var(--accent-ink); }
.list-row__trailing svg { width: 18px; height: 18px; }

/* Empty state */
.empty { padding: var(--spacing-lg) var(--spacing-md); text-align: center; color: var(--text-muted); }
.empty--calm { padding-block: calc(var(--spacing-lg) * 1.5); }
.empty__title { font-size: var(--font-size-base); font-weight: 500; color: var(--text); }
.empty__message { font-size: var(--font-size-sm); margin-top: var(--spacing-xs); }

/* Btn icon (header action slot) */
.btn-icon {
  position: relative;
  width: 40px; height: 40px; border-radius: 50%;
  background: transparent; border: 0; color: var(--text);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background var(--t-fast);
}
.btn-icon:hover { background: var(--surface-2); }
.btn-icon svg { width: 22px; height: 22px; }
.btn-icon__dot {
  position: absolute; top: 8px; right: 8px;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--danger);
  border: 2px solid var(--bg);
}
.btn-icon__dot.is-hidden { display: none; }
```

- [ ] **Step 3: Rewrite `.app-header` and `.bottom-nav` in `styles/layout.css`.** Locate the existing rules:

```bash
grep -n "^\.app-header\|^\.bottom-nav" styles/layout.css
```

Replace the `.app-header` block with:

```css
.app-header {
  position: sticky; top: 0; z-index: var(--z-header, 40);
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--spacing-md);
  background: var(--bg);
  /* no gradient title, no shadow, no fixed positioning */
}
.app-header__text { min-width: 0; }
.app-header__title {
  font-size: var(--font-size-xl); font-weight: 600; color: var(--text);
  line-height: 1.2;
  /* no -webkit-background-clip: text */
}
.app-header__subtitle {
  font-size: var(--font-size-sm); color: var(--text-muted);
  margin-top: 2px;
}
.app-header__actions { display: flex; gap: 4px; }
```

Replace the `.bottom-nav` block with:

```css
.bottom-nav {
  position: fixed; left: 0; right: 0; bottom: 0;
  z-index: var(--z-nav, 50);
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 6px 4px calc(env(safe-area-inset-bottom, 0px) + 6px);
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid var(--border);
}
.bottom-nav__item,
.nav-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  background: transparent; border: 0; text-decoration: none;
  color: var(--text-muted); font-size: 10px; font-weight: 500;
  cursor: pointer;
  min-height: 44px; min-width: 44px;
}
.bottom-nav__item svg,
.nav-item svg { width: 22px; height: 22px; }
.bottom-nav__item.is-active,
.nav-item--active,
.nav-item.is-active { color: var(--accent); }

/* Tablet: center single column, no two-pane (see spec §3.1) */
@media (min-width: 768px) {
  .app-shell { max-width: 560px; margin: 0 auto; }
}
```

Keep `--header-height`, `--nav-height` custom property values consistent with Phase 0 (don't change the numeric values — just update usage where `position: fixed` no longer needs top-padding compensation on `.page-content` / `.app-shell`).

- [ ] **Step 4: Hex purge confirmation.** Run:

```bash
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css styles/layout.css styles/dashboard.css
```

Expected: 0 matches (or all matches are inside CSS comments — review each). If any new rule you added contains a hex literal, replace it with a token.

- [ ] **Step 5: Visual check.** Open `index.html`. Task cards should now appear with owner color left-stripe, the new `.card` chrome, the `.banner` (if overdue items exist) should look mockup-aligned. Old `.task-card` rules are still present so some styling may double up; that's expected and cleaned up in Task 8.

- [ ] **Step 6: Commit.**

```bash
git add styles/components.css styles/layout.css
git commit -m "$(cat <<'EOF'
feat(styles): add mockup card/banner/fab/section/overflow/empty rules

Adds the Phase 1 visual layer from mockups/design-system.css using Phase 0
tokens only. Covers .card (slot-based with owner left-stripe), .banner +
variants, .fab, .section head/meta, .tag + rotation/late/bounty/school,
.avatar + color-mix tinting, .check (+--done), .overflow-menu, .filter-chip,
.list-group/.list-row, .empty, .btn-icon + dot, plus a rewrite of .app-header
(sticky, no gradient title) and .bottom-nav (5-column, frosted).

Legacy .task-card/.nav-item rules remain in place; they are retired in Task 8
once all callsites have migrated.

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §3–4

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extend `sortEntries` with late-today-first + name tiebreaker

**Files:**
- Modify: `shared/state.js` (`sortEntries` — around line 132)

**Why this task:** Implements decision #9 from spec §2.4: within each owner's incomplete block, surface-onto-today late entries float to top; and name is a stable tiebreaker. Completed entries are NOT bumped by late-today (spec §5.5).

- [ ] **Step 1: Read `shared/state.js` `sortEntries` function.**

```bash
grep -n "export function sortEntries" shared/state.js
```

Read the function in full. Note its current comparator chain: `incomplete before complete → owner order → TOD rank`.

- [ ] **Step 2: Extend the signature and comparator.** Replace the current function with:

```js
/**
 * Sort entries for dashboard/kid display.
 *
 * Order:
 *   1. Incomplete before complete
 *   2. Owner (by people array order)
 *   3. Late-today-first WITHIN OWNER, INCOMPLETE ONLY
 *      (task.rotation !== 'daily' AND entry.dedicatedDate < today)
 *   4. Time of day (am=0, anytime=1, pm=2)
 *   5. Task name (case-insensitive, tiebreaker)
 *
 * @param entries     Array of schedule entries
 * @param completions Completion map { [entryKey]: completion }
 * @param tasks       Array of tasks (for rotation + name lookup)
 * @param people      Array of people (order defines owner rank)
 * @param today       YYYY-MM-DD string — used for late-today calculation
 */
export function sortEntries(entries, completions, tasks = [], people = [], today = null) {
  const tasksById = new Map(tasks.map(t => [t.id, t]));
  const ownerRank = new Map(people.map((p, i) => [p.id, i]));
  return entries.slice().sort((a, b) => {
    // 1. incomplete before complete
    const aComplete = Boolean(completions?.[a.entryKey]);
    const bComplete = Boolean(completions?.[b.entryKey]);
    if (aComplete !== bComplete) return aComplete ? 1 : -1;

    // 2. owner
    const aOwner = ownerRank.has(a.ownerId) ? ownerRank.get(a.ownerId) : 999;
    const bOwner = ownerRank.has(b.ownerId) ? ownerRank.get(b.ownerId) : 999;
    if (aOwner !== bOwner) return aOwner - bOwner;

    // 3. late-today-first (incomplete only)
    const aLate = (!aComplete) && lateTodayRank(a, tasksById, today);
    const bLate = (!bComplete) && lateTodayRank(b, tasksById, today);
    if (aLate !== bLate) return aLate ? -1 : 1;

    // 4. time of day
    const todMap = { am: 0, anytime: 1, pm: 2 };
    const aTask = tasksById.get(a.taskId);
    const bTask = tasksById.get(b.taskId);
    const aTod = todMap[(aTask?.timeOfDay) || 'anytime'] ?? 1;
    const bTod = todMap[(bTask?.timeOfDay) || 'anytime'] ?? 1;
    if (aTod !== bTod) return aTod - bTod;

    // 5. name tiebreaker
    const aName = (aTask?.name || '').toLowerCase();
    const bName = (bTask?.name || '').toLowerCase();
    return aName.localeCompare(bName);
  });
}

function lateTodayRank(entry, tasksById, today) {
  if (!today) return false;
  const t = tasksById.get(entry.taskId);
  if (!t || t.rotation === 'daily') return false;
  if (entry.dedicatedDate && entry.dedicatedDate < today) return true;
  return false;
}
```

Note: `lateTodayRank` returns a boolean; the `aLate` / `bLate` variables are booleans; comparison uses `!==` + ternary.

- [ ] **Step 3: Audit callers of `sortEntries`.**

```bash
grep -rn "sortEntries(" --include='*.js' .
```

Current callers pass `(entries, completions)` — 2 args. Extra args (`tasks, people, today`) default safely: `tasks=[]` and `people=[]` mean owner rank falls back to 999 for everyone (so owner ordering becomes a no-op — same as before for callers that don't pass people), and `today=null` disables late-today bump. Update the dashboard caller (in `dashboard.js`) to pass the 5 args; leave other callers on the 2-arg form until their own phases.

- [ ] **Step 4: Update `dashboard.js` to call with all 5 args.** Locate the `sortEntries` call:

```bash
grep -n "sortEntries(" dashboard.js
```

Replace each call with:

```js
sortEntries(entries, completions, tasks, people, todayIso())
```

Where `todayIso()` is the existing helper that returns the current YYYY-MM-DD in `settings.timezone` (use the same helper the current overdue logic uses — grep for its name). If the dashboard already has a local `today` variable in scope for the render, use that.

- [ ] **Step 5: Manual smoke.** Refresh dashboard. Confirm:
  - A weekly task whose `dedicatedDate` is a past date appears at the TOP of its owner's incomplete block.
  - Two incomplete tasks for the same owner + same TOD appear in alphabetical order.
  - Completed cards remain grouped at the bottom; a late-completed card does NOT float to the top of the done block.

- [ ] **Step 6: Commit.**

```bash
git add shared/state.js dashboard.js
git commit -m "$(cat <<'EOF'
feat(state): sortEntries adds late-today bump + name tiebreaker

Signature grows to (entries, completions, tasks, people, today).
Within each owner's incomplete block, past-dated non-daily entries
(dedicatedDate < today) float to the top. Alphabetical name tiebreak
stabilizes order for same-owner-same-TOD entries.

Late-today bump is incomplete-only — completed entries sort strictly
owner → TOD → name so late-completed cards don't read as problem
children in the .card--done block.

Other callers continue to pass 2 args (tasks/people default to []).

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §5.5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Restructure `index.html` + dashboard header render

**Files:**
- Modify: `index.html`
- Modify: `dashboard.js` (header render block + loading-state visibility)

**Why this task:** Switches the page skeleton to the mockup layout and clears the inline `style="display:none"` on `#mainContent` (Phase 0 §2.4 register row). Add `#bannerMount` and `#fabMount` placeholders. Header now calls the new `renderHeader` shape.

- [ ] **Step 1: Rewrite the body skeleton of `index.html`.** Current shape (per spec §3.1):

```html
<body>
  <div id="headerMount"></div>
  <main class="app-shell" id="app">
    <div class="loading-inline" id="loadingState">
      <div class="loading-spinner loading-spinner--small"></div>
      <span>Loading...</span>
    </div>
    <div id="mainContent" class="is-hidden">
      <!-- rendered by dashboard.js -->
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

**Required changes from the current `index.html`:**
- Replace `<div class="page-content">` with `<main class="app-shell" id="app">`.
- Remove `style="display:none;"` on `#mainContent`; replace with `class="is-hidden"`.
- Add `<div id="fabMount"></div>` before `<div id="navMount"></div>`.
- Leave all script tags + Firebase init + SW registration untouched.

- [ ] **Step 2: Confirm `.is-hidden` rule exists in `styles/components.css`.**

```bash
grep -n "\.is-hidden" styles/components.css
```

Expected: at least one match (`.is-hidden { display: none !important; }` or equivalent from Phase 0). If absent, add it to `components.css` as part of this commit.

- [ ] **Step 3: Update the loading-to-ready transition in `dashboard.js`.** Grep:

```bash
grep -n "mainContent\|loadingState" dashboard.js
```

Replace any `document.getElementById('mainContent').style.display = ''` with `document.getElementById('mainContent').classList.remove('is-hidden')`. Similarly for the loading state hide.

- [ ] **Step 4: Update the header render call in `dashboard.js`.** Grep:

```bash
grep -n "renderHeader(" dashboard.js
```

Replace the current call (legacy shape with `showAdmin/showDebug/showAddTask/showThemePicker/showBell/rightContent`) with:

```js
const title = linkedPerson ? linkedPerson.name : 'Home';
const subtitle = formatDateLong(viewDate); // existing helper; if named differently, use the existing one
const overflowItems = buildHeaderOverflow(); // defined in Task 7
document.getElementById('headerMount').innerHTML = renderHeader({
  title,
  subtitle,
  showBell: !linkedPerson,       // Bell is parent-only; kid-link mode hides it (matches existing behavior)
  overflowItems
});
applyDataColors(document.getElementById('headerMount'));
// Re-bind the bell + overflow buttons after re-mounting the header:
wireHeaderActions();             // defined in Task 7
```

**Note:** `buildHeaderOverflow()` and `wireHeaderActions()` are defined in Task 7. For this task, stub them as empty functions at the top of `dashboard.js` so the page still runs:

```js
function buildHeaderOverflow() { return []; }
function wireHeaderActions() { /* filled in Task 7 */ }
```

- [ ] **Step 5: Remove the date-header + date-nav arrow render block from `dashboard.js`.** Grep:

```bash
grep -n "date-header\|date-nav\|prevDay\|nextDay" dashboard.js
```

Remove the inline HTML template for the date-header row and the two arrow buttons. Keep `changeDay(offset)` and the swipe listeners — those are still the nav mechanism. Keep `celebrationShown` reset behavior.

Replace the date-header render block with nothing — the subtitle in the header now carries that info.

- [ ] **Step 6: Add the "Back to Today" pill render.** Directly before the banner mount in the render pipeline:

```js
const backToTodayHtml = (viewDate !== todayIso())
  ? `<div class="back-to-today">
       <button class="btn btn--secondary btn--sm" id="goToday" type="button">Back to Today</button>
     </div>`
  : '';
```

And include `${backToTodayHtml}` in the `#mainContent` innerHTML at the position directly after `#bannerMount` and before the Events section. Bind the button after mount:

```js
document.getElementById('goToday')?.addEventListener('click', () => {
  viewDate = todayIso();
  celebrationShown = false;
  updateHeaderSubtitle();
  render();
  subscribeSchedule(viewDate);
});
```

- [ ] **Step 7: Add `updateHeaderSubtitle` helper.**

```js
function updateHeaderSubtitle() {
  const el = document.querySelector('.app-header__subtitle');
  if (el) el.textContent = formatDateLong(viewDate);
}
```

Call it at the start of `changeDay(offset)` (or wherever `viewDate` is reassigned) so swipe navigation updates the subtitle without a full header re-render.

- [ ] **Step 8: Render the Events + Today sections into `#mainContent` innerHTML.** The dashboard currently builds per-frequency sections (daily/weekly/monthly/once). Replace with two sections only:

```js
function renderSections() {
  const sections = [];
  if (sortedEvents.length) {
    sections.push(`<section class="section">
      ${renderSectionHead('Events')}
      ${sortedEvents.map(e => renderTaskCard(…existing args for event cards…)).join('')}
    </section>`);
  }
  const incomplete = sortedToday.filter(e => !isComplete(e.entryKey, completions));
  const complete = sortedToday.filter(e => isComplete(e.entryKey, completions));
  const total = incomplete.length + complete.length;
  if (total === 0) {
    sections.push(`<section class="section">
      ${renderSectionHead('Today')}
      <div class="empty empty--calm">
        <div class="empty__title">Nothing on the list</div>
        <div class="empty__message">Enjoy your day.</div>
      </div>
    </section>`);
  } else {
    const meta = complete.length === total ? 'All done' : `${complete.length} of ${total} done`;
    sections.push(`<section class="section">
      ${renderSectionHead('Today', meta)}
      ${incomplete.map(e => renderTaskCard(…)).join('')}
      ${complete.map(e => renderTaskCard(…)).join('')}
    </section>`);
  }
  return sections.join('');
}
```

Pass the same arguments to `renderTaskCard` as the current dashboard does (owner, task, category, completion, showPoints, etc.) — the arg shape is unchanged in Task 3; only the DOM output changed.

- [ ] **Step 9: Remove `renderPersonFilter` inline pill bar.** Grep:

```bash
grep -n "renderPersonFilter\|person-filter__pill" dashboard.js
```

Delete the inline render + its DOM insertion. The replacement (`.filter-chip` + sheet) is added in Task 7.

- [ ] **Step 10: Remove the inline overdue expand/collapse render.** Grep:

```bash
grep -n "overdue-banner\|overdue-list" dashboard.js
```

Delete the inline overdue DOM block. The replacement (`renderBanner('overdue', ...)` + bottom sheet) is added in Task 7.

Keep the computation of `overdueItems` — it's reused.

- [ ] **Step 11: Mount the FAB.**

```js
import { renderFab } from './shared/components.js';
// …
document.getElementById('fabMount').innerHTML = renderFab({ id: 'fabAdd', label: 'Add' });
document.getElementById('fabAdd').addEventListener('click', openAddMenu);
```

Remove the old `#headerAddTask` click handler binding (its button is no longer in the DOM).

- [ ] **Step 12: Mount the nav bar with the `onMoreClick` option.**

```js
document.getElementById('navMount').innerHTML = renderNavBar('home', { onMoreClick: openMoreSheet });
// openMoreSheet defined in Task 7
document.getElementById('navMore').addEventListener('click', () => openMoreSheet?.());
```

For Task 6, stub `openMoreSheet` as `function openMoreSheet() {}`; filled in Task 7.

- [ ] **Step 13: Manual smoke.** Open `index.html`:
  - Header shows `Home` + date subtitle, Bell + 3-dot icons on right. The 3-dot opens nothing yet (Task 7 wires it).
  - No date-nav arrows. Swipe left/right changes day; subtitle updates.
  - "Back to Today" pill appears on non-today; click returns to today.
  - Events section renders when events exist.
  - Today section renders with `{N} of {M} done` (or `All done`, or the empty state).
  - FAB opens the Add menu.
  - Nav has 5 items; `More` does nothing yet.

Expected regressions (fixed in Task 7): overflow menu unwired, More sheet unwired, banner not rendering yet, person filter missing.

- [ ] **Step 14: Verify the Phase 0 §2.4 register row for `index.html` clears:**

```bash
grep -Pn 'style="' index.html
```

Expected: 0 matches.

- [ ] **Step 15: Commit.**

```bash
git add index.html dashboard.js
git commit -m "$(cat <<'EOF'
refactor(dashboard): restructure index.html + dashboard.js to mockup DOM

- <main class="app-shell"> replaces <div class="page-content">
- #mainContent uses .is-hidden instead of inline style="display:none"
- #fabMount added; FAB renders + wires to openAddMenu
- Header uses renderHeader v2 (title + subtitle + bell + overflow stub)
- date-nav arrows removed; swipe preserved; "Back to Today" pill added
- Daily/Weekly/Monthly/One-Time sub-groups collapsed to Events + Today
- updateHeaderSubtitle() called on swipe/back-to-today to refresh date line
- Today section renders calm empty state when list is empty
- renderPersonFilter inline pill bar removed (chip replacement in Task 7)
- inline overdue expand/collapse removed (banner + sheet in Task 7)

Clears Phase 0 §2.4 register row: 0 inline styles in index.html.

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §3 §5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Banner queue + FAB + More / overflow menus + person filter sheet

**Files:**
- Modify: `dashboard.js` (wire up banner resolver, multiplier listener, overdue sheet, overflow menu, More sheet, person filter sheet)
- Modify: `shared/firebase.js` if a multiplier listener helper is missing (check first)

**Why this task:** Wires all the interactive surfaces the previous tasks mounted. Banner queue reads overdue + multiplier. More and header overflow share the same item list. Person filter uses the chip + sheet.

- [ ] **Step 1: Add the multiplier listener.** Grep for existing multiplier code:

```bash
grep -rn "multipliers/" shared/firebase.js dashboard.js
```

If a helper like `onMultipliers(callback)` exists in `shared/firebase.js`, use it. Otherwise, add one:

```js
// shared/firebase.js
export function onMultipliers(callback) {
  const ref = firebase.database().ref('rundown/multipliers');
  const handler = snapshot => callback(snapshot.val() || {});
  ref.on('value', handler);
  return () => ref.off('value', handler);
}
```

In `dashboard.js`, add the subscription near the other `onValue` subscriptions:

```js
import { onMultipliers } from './shared/firebase.js';
let multipliers = {};
onMultipliers(data => {
  multipliers = data;
  debouncedRender();
});
```

- [ ] **Step 2: Implement `resolveBanner()`.**

```js
function resolveBanner() {
  // Priority: vacation > freeze > overdue > multiplier > info
  // Phase 1 wires overdue + multiplier only.
  const overdueIncomplete = overdueItems.filter(e => !isComplete(e.entryKey, completions));
  if (overdueIncomplete.length > 0) {
    const n = overdueIncomplete.length;
    return {
      variant: 'overdue',
      title: `${n} overdue ${n === 1 ? 'task' : 'tasks'}`,
      message: 'Tap to view.',
      action: { label: 'View', onClick: () => openOverdueSheet(overdueIncomplete) }
    };
  }
  const today = todayIso();
  const todayMultipliers = multipliers?.[today] || {};
  const scope = activePerson || 'all';
  const m = todayMultipliers[scope] || todayMultipliers.all;
  if (m && Number(m.multiplier) !== 1) {
    const n = Number(m.multiplier);
    const label = n === 2 ? 'Double-points day' : `${n}× points today`;
    const msg = m.note || `All tasks count ${n}× until midnight.`;
    return { variant: 'multiplier', title: label, message: msg };
  }
  return null;
}
```

- [ ] **Step 3: Mount the banner and wire its action.**

```js
import { renderBanner } from './shared/components.js';

function renderBannerMount() {
  const b = resolveBanner();
  const mount = document.getElementById('bannerMount');
  if (!b) { mount.innerHTML = ''; return; }
  mount.innerHTML = renderBanner(b.variant, { title: b.title, message: b.message, action: b.action ? { label: b.action.label } : undefined });
  if (b.action) {
    mount.querySelector('[data-banner-action]')?.addEventListener('click', b.action.onClick);
  }
}
```

Call `renderBannerMount()` inside the main `render()` after computing `overdueItems` and after `multipliers` is populated.

**Add `#bannerMount` inside `#mainContent`** (not in `index.html`) so `render()` owns its lifetime:

```html
<div id="bannerMount"></div>
${backToTodayHtml}
${sectionsHtml}
```

- [ ] **Step 4: Implement `openOverdueSheet(items)`.**

```js
import { renderBottomSheet, renderTaskCard } from './shared/components.js';

function openOverdueSheet(items) {
  const body = `<div class="overdue-sheet">
    ${items.map(e => {
      const task = tasks.find(t => t.id === e.taskId);
      const category = categories.find(c => c.id === task?.category);
      const owner = people.find(p => p.id === e.ownerId);
      return renderTaskCard({
        entry: e, task, category, owner,
        completed: false,
        // …match current renderTaskCard call site arg shape…
      });
    }).join('')}
  </div>`;
  openSheet({ title: 'Overdue tasks', body });
  // openSheet is the existing helper; use the same one the detail sheet uses.
}
```

Use the existing bottom-sheet helper the codebase already has for task detail. If the name differs, grep for it and adapt.

- [ ] **Step 5: Implement `buildHeaderOverflow()` and `openMoreSheet()`.**

```js
function buildHeaderOverflow() {
  const items = [
    { id: 'rewards', label: 'Rewards' },
    { id: 'admin',   label: 'Admin' },
    { id: 'theme',   label: 'Theme' }
  ];
  if (localStorage.getItem('dr-debug') === 'true') {
    items.push({ id: 'debug', label: 'Debug' });
  }
  return items;
}

import { renderOverflowMenu } from './shared/components.js';

function openOverflowOrMoreSheet() {
  const items = buildHeaderOverflow();
  openSheet({
    title: 'More',
    body: renderOverflowMenu(items),
    onItemClick: (itemId) => {
      if (itemId === 'rewards') openRewardsSheet();      // existing function
      else if (itemId === 'admin') location.href = 'admin.html';
      else if (itemId === 'theme') openDeviceThemeSheet();
      else if (itemId === 'debug') openDebugSheet();
    }
  });
}

function openMoreSheet() { openOverflowOrMoreSheet(); }

function wireHeaderActions() {
  document.getElementById('headerOverflow')?.addEventListener('click', openOverflowOrMoreSheet);
  // Bell wiring is owned by initBell(); no change.
}
```

**Delegate click inside the sheet:** whichever `openSheet`/`renderBottomSheet` helper is used, ensure it supports a click delegation pattern on `[data-item-id]` — if not, bind manually after mounting:

```js
document.querySelector('.overflow-menu')?.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-item-id]');
  if (btn) {
    onItemClick(btn.dataset.itemId);
    closeSheet();
  }
});
```

- [ ] **Step 6: Person filter chip + sheet.** Add the chip to the Today section head when applicable:

```js
function renderTodaySectionHead(meta) {
  const showChip = (!linkedPerson) && people.length >= 2;
  const chip = showChip
    ? renderFilterChip({ id: 'openFilterSheet', label: activePerson ? (people.find(p => p.id === activePerson)?.name || 'All') : 'All' })
    : '';
  return `<div class="section__head">
    <div class="section__title">Today</div>
    <div class="section__head-trailing">
      ${meta ? `<div class="section__meta">${esc(meta)}</div>` : ''}
      ${chip}
    </div>
  </div>`;
}
```

Replace the earlier `renderSectionHead('Today', meta)` call inside `renderSections()` with `renderTodaySectionHead(meta)` for the Today section only (Events still uses `renderSectionHead('Events')`).

Add minimal CSS for the head-trailing wrapper to `styles/components.css`:

```css
.section__head-trailing { display: flex; align-items: center; gap: var(--spacing-sm); }
```

Wire the chip tap:

```js
import { renderPersonFilterSheet } from './shared/components.js';

function openPersonFilterSheet() {
  openSheet({
    title: 'Show tasks for',
    body: renderPersonFilterSheet(people, activePerson),
    onItemClick: (personId) => {
      activePerson = personId || null;
      if (linkedPerson && linkedPerson.prefs) {
        linkedPerson.prefs.dashboard = linkedPerson.prefs.dashboard || {};
        linkedPerson.prefs.dashboard.personFilter = activePerson;
      }
      render();
    }
  });
}
document.body.addEventListener('click', ev => {
  if (ev.target.closest('#openFilterSheet')) openPersonFilterSheet();
});
```

Use event delegation on `document.body` because the chip is re-rendered on every `render()`.

- [ ] **Step 7: Update `initBell` to use `.btn-icon__dot`.**

```bash
grep -rn "bell__badge\|initBell" shared/
```

Inside `initBell`, replace every reference to `.bell__badge` with `#headerBellDot` (the new dot element) and toggle `.is-hidden` based on unseen count:

```js
function updateBellBadge(unseen) {
  const dot = document.getElementById('headerBellDot');
  if (!dot) return;
  dot.classList.toggle('is-hidden', unseen === 0);
}
```

The sheet contents (approvals, activity, bonus/deduction/multiplier creators) stay untouched — per spec §5.9.

- [ ] **Step 8: Manual smoke.**
  - Multiplier banner renders when a multiplier exists for today; overdue banner renders when incomplete overdue items exist; neither = no banner.
  - Tap "View" on overdue banner → opens sheet listing overdue cards.
  - Tap header 3-dot → opens sheet with Rewards · Admin · Theme (and Debug if flag set).
  - Tap `More` in bottom nav → opens the same sheet.
  - Each item in the sheet works (Rewards opens store, Admin navigates, Theme opens theme picker, Debug opens debug panel).
  - Person filter chip appears when `people.length >= 2` AND not in `?person=` mode; tapping opens the sheet; selecting re-renders.
  - In `?person=Noah` URL: no chip rendered; Bell hidden (parent-only); overflow still shows (but with relevant items).
  - Bell dot shows red when unseen > 0; hidden otherwise.

- [ ] **Step 9: Commit.**

```bash
git add shared/firebase.js shared/components.js dashboard.js styles/components.css
git commit -m "$(cat <<'EOF'
feat(dashboard): banner priority queue + FAB + More/overflow + filter sheet

- Adds onMultipliers() firebase listener; reads rundown/multipliers.
- resolveBanner() returns one of {overdue, multiplier, null} per priority
  rule (vacation/freeze stubbed for Phase 2.4). Overdue banner action
  opens a bottom sheet with the overdue cards via renderTaskCard.
- Header 3-dot and bottom-nav More both open the shared overflow sheet
  (Rewards, Admin, Theme, Debug*). *Debug only when dr-debug=true.
- Person filter chip replaces the inline pill bar. Chip hidden in
  ?person= mode and when people.length < 2. Selection persists to
  prefs.dashboard.personFilter (unchanged).
- initBell bound dot migrated from .bell__badge to .btn-icon__dot.
- Bell sheet contents unchanged in Phase 1 (per spec §5.9).

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §5

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Retire dead dashboard/header/nav CSS rules

**Files:**
- Modify: `styles/dashboard.css` (delete retired rules)
- Modify: `styles/layout.css` (verify old `.app-header` / `.bottom-nav` fully replaced)
- Modify: `styles/components.css` (retire old `.task-card*` rules if they duplicate new `.card*` rules)
- Modify: `styles/responsive.css` (drop retired breakpoint overrides for deleted selectors)

**Why this task:** Cleans up the CSS graveyard now that all callsites use the new classes. Care: other pages (Calendar, Scoreboard, Tracker, Admin) may still reference some of these classes — verify before deleting and move the rule to that page's CSS if so.

- [ ] **Step 1: Run the retired-class grep list from spec §6.1.**

```bash
grep -nE '\.(date-header|date-nav|time-header|overdue-banner|overdue-list|progress-section|progress-bar__fill|header__title|header__left|header__right|header__subtitle|header__date|header__stats|header__admin|header__debug|header__theme|header__add-task|header__bell|nav-item)\b' index.html dashboard.js
```

Expected: 0 matches. If any survive, fix the callsite before deleting the CSS.

- [ ] **Step 2: Delete `.date-header*`, `.date-nav*`, `.time-header`, `.overdue-banner*`, `.overdue-list*`, `.progress-section` from `styles/dashboard.css`.**

```bash
grep -nE '^\.(date-header|date-nav|time-header|overdue-banner|overdue-list|progress-section)' styles/dashboard.css
```

Delete each matching rule block (including its children). Keep `.celebration*` rules.

- [ ] **Step 3: Check for cross-page use of `.progress-bar__fill` / `.progress-section`.**

```bash
grep -rn "progress-section\|progress-bar__fill" styles/ *.html *.js
```

If Scoreboard or Tracker use them, move those rule blocks to `styles/scoreboard.css` or `styles/tracker.css` respectively. If only dashboard used them, delete.

- [ ] **Step 4: Audit `.task-card*` CSS rules.**

```bash
grep -nE '^\.task-card' styles/components.css
```

For each rule, decide:
- If it's visual chrome now supplied by `.card*` rules (padding, background, border, radius) → DELETE.
- If it's a tag modifier (`.task-card__tag--late`, `.task-card__tag--bounty`, `.task-card__tag--skipped`, etc.) still used by the Calendar day sheet → KEEP (retired in Phase 2).
- If it's the old root `.task-card` layout (`display: flex`, etc.) → DELETE (superseded by `.card` grid layout).

When in doubt, KEEP and document a "retire in Phase 2" note.

- [ ] **Step 5: Delete old `.app-header` / `.header__*` rules in `styles/layout.css`.**

```bash
grep -nE '^\.(app-header|header__)' styles/layout.css
```

The new `.app-header` rule from Task 4 replaces them. Verify the old `.header__title` / `.header__subtitle` / `.header__left` / `.header__right` blocks are gone.

- [ ] **Step 6: Delete `.nav-item` style rules only if no callers remain.**

```bash
grep -rn "\.nav-item" *.html *.js shared/ styles/
```

Because `renderNavBar` still emits the alias class, DO NOT delete the `.nav-item` rule entirely. Instead, verify it's already consolidated into the combined `.bottom-nav__item, .nav-item` block from Task 4. Remove any duplicate `.nav-item` rule elsewhere.

- [ ] **Step 7: Check `styles/responsive.css` for retired selectors.**

```bash
grep -nE '\.(date-header|date-nav|time-header|overdue-banner|progress-section|header__)' styles/responsive.css
```

Delete each match.

- [ ] **Step 8: Grep for `window.confirm` / `window.alert` regressions (Phase 0 invariant).**

```bash
grep -rPn '\bwindow\.(confirm|alert)\s*\(' --include='*.js' --include='*.html' .
```

Expected: 0 matches. If any appeared, replace with `showConfirm()` (existing helper).

- [ ] **Step 9: Hex purge confirmation for `styles/dashboard.css`.**

```bash
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/dashboard.css
```

Expected: 0 matches (Phase 0 baseline was 0; Phase 1 must not regress).

- [ ] **Step 10: Manual smoke.** Open every page that uses the shared header or nav:
  - `index.html` (dashboard) — looks like the mockup.
  - `calendar.html` — header + nav legacy path; should look identical to before.
  - `scoreboard.html` — same.
  - `tracker.html` — same.
  - `admin.html` — same.
  - `kid.html?kid=Noah` — Kid mode has its own chrome; verify no regression.
  - `person.html?person=Noah` — person-link dashboard; verify header title is the person's first name.

- [ ] **Step 11: Commit.**

```bash
git add styles/dashboard.css styles/layout.css styles/components.css styles/responsive.css
git commit -m "$(cat <<'EOF'
refactor(styles): retire dead dashboard/header/nav CSS rules

Deletes selectors now unused:
- .date-header*, .date-nav*, .time-header (dashboard only)
- .overdue-banner*, .overdue-list* (replaced by .banner--overdue + sheet)
- .progress-section, .progress-bar__fill (dashboard callsites only —
  Scoreboard-specific rules preserved in scoreboard.css)
- .app-header / .header__* legacy block in layout.css
- responsive.css overrides for the above

.task-card* rules kept for Calendar day-sheet reuse (retired Phase 2).
.nav-item kept as alias class on .bottom-nav__item (retired Phase 2).

Confirms:
- 0 inline styles in index.html
- 0 hex literals in styles/dashboard.css (Phase 0 baseline preserved)
- 0 window.confirm / window.alert in the repo

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §3.9 §6.1

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Bump service worker cache, capture baselines, update plan doc

**Files:**
- Modify: `sw.js` (`CACHE_NAME` + `CACHE_BUMPS` comment)
- Create: `docs/superpowers/baselines/phase-1/` (4 PNGs)
- Modify: `docs/superpowers/plans/2026-04-19-ui-rework.md` (ambient-strip wiring notes + Phase 3 exit criterion)
- Modify: `docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md` (Status → Landed, dated notes for any deviation)

**Why this task:** Closes Phase 1. Forces clients to pull the new shell (SW bump), captures the new visual baseline Phase 2 will compare against, and ensures ambient-strip deferral notes land before the spec becomes stale.

- [ ] **Step 1: Bump `CACHE_NAME` in `sw.js`.**

```bash
grep -n "CACHE_NAME" sw.js
```

Change `'family-hub-v45'` to `'family-hub-v46'`. Add a new entry at the top of `CACHE_BUMPS` comment:

```
// v46 (2026-04-23) — Phase 1 dashboard rework: mockup-aligned header,
//                    card slot DOM, priority banner queue, FAB + 5-tab
//                    nav with More sheet, person filter chip, owner
//                    left-stripe, empty state.
```

Verify `APP_SHELL` list still includes all current files (no deletions happened in Phase 1; all edits were in-place).

- [ ] **Step 2: Capture Phase 1 baselines.** Create the directory:

```bash
mkdir -p docs/superpowers/baselines/phase-1
```

Capture 4 screenshots of the deployed (or local preview) dashboard:
- `dashboard-375-light.png` — 375px viewport, light theme, today with at least 2 events + 5 tasks + 1 multiplier/overdue banner.
- `dashboard-375-dark.png` — same, dark theme.
- `dashboard-768-light.png` — 768px viewport (tablet), centered column.
- `dashboard-768-dark.png` — same, dark theme.

Save to `docs/superpowers/baselines/phase-1/<filename>.png`.

- [ ] **Step 3: Update `docs/superpowers/plans/2026-04-19-ui-rework.md`.** Open the file and locate:
  - **Phase 1.3 (Meals)** — add: "Wiring: adds the second ambient chip to `index.html`'s ambient row and toggles rendering when `settings.ambientStrip === true`."
  - **Phase 1.4 (Weather)** — add: "Wiring: adds the first ambient chip to `index.html`'s ambient row and the Calendar header weather chip per DESIGN.md §6.2."
  - **Phase 3 (Admin)** — add exit criterion: "Expose `settings.ambientStrip` as a toggle in Admin → Settings → Display."

These three amendments come from spec §11.

- [ ] **Step 4: Mark the Phase 1 spec `Status: Landed`.** Edit `docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md`:

```
**Status:** Landed (2026-04-23 — commit <sha>)
```

Below the `Status` line, append a dated Deviations section if anything in this plan diverged from the spec:

```
## Deviations from spec

- [YYYY-MM-DD] Task N, Step M: described deviation and why.
```

If no deviations, write:

```
## Deviations from spec

None.
```

- [ ] **Step 5: Run final grep recipe suite from spec §6.1.**

```bash
grep -Pn 'style="' index.html                                              # expect 0
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/dashboard.css                        # expect 0
grep -nE '\.(date-header|date-nav|time-header|overdue-banner|overdue-list|progress-section|header__|nav-item)\b' index.html dashboard.js  # expect 0
grep -nE '^\.(date-header|date-nav|time-header|overdue-banner|overdue-list|progress-section)' styles/dashboard.css  # expect 0
grep -rPn '\bwindow\.(confirm|alert)\s*\(' --include='*.js' --include='*.html' .  # expect 0
grep -Pn 'id="bannerMount"' index.html                                     # expect 1
grep -Pn 'id="fabMount"' index.html                                        # expect 1
```

If any fail, fix before committing.

- [ ] **Step 6: Run the manual smoke checklist from spec §6.2.** Work through every checkbox. Record any failure as a deviation in Step 4.

- [ ] **Step 7: Commit.**

```bash
git add sw.js docs/superpowers/baselines/phase-1/ docs/superpowers/plans/2026-04-19-ui-rework.md docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md
git commit -m "$(cat <<'EOF'
chore(sw): bump CACHE_NAME to v46; Phase 1 baselines + docs

- sw.js CACHE_NAME v45 → v46 with CACHE_BUMPS entry.
- docs/superpowers/baselines/phase-1/ — 4 PNG baselines (375/768 × light/dark).
- Plan updates land ambient-strip wiring notes on Phases 1.3/1.4/3.
- Phase 1 spec marked Status: Landed with dated deviation log.

See: docs/superpowers/specs/2026-04-23-phase-1-dashboard-rework.md §7 commit 7

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push to open PR.**

```bash
git push -u origin phase-1-dashboard
```

Then open PR #2 against `main` titled `Phase 1: Dashboard rework (mockup-aligned)`. The PR body should use spec §6.2 manual smoke items as the test plan checklist.

---

## Review gate before Phase 2

Before starting the Phase 2 spec, verify:

- [ ] All §6.1 grep recipes return the expected counts.
- [ ] Phase 0 §2.4 deferred register: rows for `index.html` inline styles and `styles/dashboard.css` hex are both 0.
- [ ] Ambient-strip wiring notes landed in `2026-04-19-ui-rework.md` on Phases 1.3, 1.4, and 3.
- [ ] `docs/superpowers/baselines/phase-1/dashboard-*.png` committed (4 files).
- [ ] §6.2 manual smoke checklist completed on Cloudflare deploy.
- [ ] PR #2 merged to `main`; Cloudflare auto-deployment verified.
- [ ] Spec marked `Status: Landed`.

Once all true, Phase 2 (Calendar) brainstorming can begin.

---

## File responsibility map (reference)

| File | Phase 1 role |
|---|---|
| `index.html` | Page skeleton only — mounts. Zero inline styles. |
| `dashboard.js` | Owns all DOM manipulation for dashboard. Reads Firebase via shared helpers. Composes rendered HTML from `shared/components.js`. |
| `shared/components.js` | Pure renderer functions. Returns HTML strings. No direct DOM writes beyond `applyDataColors`. |
| `shared/state.js` | Pure functions over entries + completions + tasks + people. No Firebase access. |
| `shared/firebase.js` | Only module that touches Firebase. Listeners return unsubscribe functions. |
| `styles/components.css` | Reusable components: `.card`, `.banner`, `.fab`, `.section`, `.tag`, `.avatar`, `.check`, `.btn-icon`, `.overflow-menu`, `.filter-chip`, `.list-group`, `.empty`. |
| `styles/layout.css` | `.app-shell`, `.app-header`, `.bottom-nav`. Cross-page chrome. |
| `styles/dashboard.css` | Dashboard-specific: celebrations, dashboard-only overrides (nothing else). |
| `sw.js` | Bumped per phase. APP_SHELL kept current. |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-phase-1-dashboard.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
