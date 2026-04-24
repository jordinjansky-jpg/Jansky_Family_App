# Phase 1.5 — Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the Phase 1 dashboard from "mockup-aligned" to "shippable polish" — tighter typography, usable affordances, resolved motion design, and the two small Skylight-like details the user signed off on.

**Architecture:** CSS-only changes in most tasks (components.css, layout.css). Three tasks also edit `shared/components.js` to add new render primitives (chevron on the pill, person-dot on the filter chip, section active-cue class). No Firebase schema changes, no new modules, no data migrations. One service-worker cache bump at the end.

**Tech Stack:** Vanilla JS ES modules (no bundler), hand-written CSS with tokens from Phase 0, Firebase RTDB compat (unchanged).

**Branch:** `phase-1-5-polish` — cut off `phase-1-dashboard` so it stacks on PR #2. When PR #2 merges to main, rebase this branch onto main before merging 1.5.

**Verification model:** The codebase has no test runner ([CLAUDE.md](../../../CLAUDE.md) "no build step, no test suite"). Each task uses the same verification pattern established in Phase 0/1: (a) a focused grep recipe for CSS/DOM invariants, (b) a runtime measurement via `getComputedStyle` / `getBoundingClientRect` for sizes, (c) a manual visual smoke check in light + dark against the expected outcome described in the task. Tasks end with a commit; there is no CI gate beyond Cloudflare's auto-deploy.

---

## Scope (locked — do not extend without user approval)

**In scope (10 tasks):**
1. Completed-card state (drop strikethrough, surface-2 background)
2. Check button affordance (size + hover + press)
3. Meta dot + section head grid + non-first divider + count tone
4. Header title/subtitle typography + narrow-phone subtitle truncation
5. FAB depth + bottom-nav active-state rail
6. Back-to-Today pill chevron + entrance animation
7. Filter chip label/dot + active-filter section cue (Q2 — "subtle cue")
8. Bell dot pulse on first appearance (Q1 — "yes")
9. Tap-target audit + reduced-motion sweep + dark-mode parity
10. SW cache bump + backlog note for loading skeleton (Q3 — "note as future upgrade")

**Out of scope (deferred, listed here so they aren't rediscovered mid-PR):**
- Banner queue crossfade animation → Phase 2.4 (when vacation/freeze land more variants)
- Ambient strip styling → Phase 1.3/1.4 (Meals/Weather)
- Loading skeleton for first-load task cards → documented in CLAUDE.md backlog by Task 10
- Tablet two-pane layout → Phase 7
- Any change to section order / grouping logic → Phase 1 is done, don't reopen

---

## File structure

Each listed file has one clear responsibility. Files that change together are grouped into single commits.

| File | Responsibility in this phase | Tasks |
|---|---|---|
| [styles/components.css](../../../styles/components.css) | Card, check, meta-dot, filter-chip, FAB, banner, empty-state, pill — all component rules live here | 1, 2, 3, 5, 6, 7, 8 |
| [styles/layout.css](../../../styles/layout.css) | App header, bottom nav, page shell | 4, 5 |
| [styles/responsive.css](../../../styles/responsive.css) | Narrow-phone overrides (`@media (max-width: 390px)`) | 4 |
| [shared/components.js](../../../shared/components.js) | `renderFilterChip`, `renderSectionHead`, Back-to-Today DOM (in dashboard.js), `initBell` dot behavior | 3, 6, 7 |
| [dashboard.js](../../../dashboard.js) | Back-to-Today markup, filter state → section class wiring | 6, 7 |
| [sw.js](../../../sw.js) | Cache version bump | 10 |
| [CLAUDE.md](../../../CLAUDE.md) | Backlog note for future loading skeleton | 10 |

---

## Task 1: Completed card — drop strikethrough, use surface-2 ground

**Files:**
- Modify: [styles/components.css:1575-1584](../../../styles/components.css#L1575-L1584) — `.card--done` block

**Context:** Current state (`opacity: 0.58` + `text-decoration: line-through`) makes titles unreadable. Spec intent is to *mute* completed cards without *hiding* them. The owner stripe is already dimmed via `color-mix 40%`.

- [ ] **Step 1: Measure current card height to preserve it**

Run in the browser DevTools console at [phase-1-dashboard.jansky-family-app.pages.dev](https://phase-1-dashboard.jansky-family-app.pages.dev):

```js
const done = document.querySelector('.card--done');
const rect = done?.getBoundingClientRect();
console.log({ height: rect?.height, cs: getComputedStyle(done) });
```

Expected: height ≈ 64-72px after the v47 hotfix. Record the value to compare after the fix.

- [ ] **Step 2: Rewrite the `.card--done` rule**

Edit [styles/components.css:1575-1584](../../../styles/components.css#L1575-L1584). Replace the block from `/* Completed state */` through the closing `.card--done::before { ... }` with:

```css
/* Completed state — muted ground + faint stripe, title stays readable */
.card--done {
  background: var(--surface-2);
  border-color: transparent;
  opacity: 0.75;
}
.card--done .card__title {
  color: var(--text-muted);
  font-weight: 400;
}
.card--done .card__meta {
  color: var(--text-faint);
}
.card--done::before {
  background: color-mix(in srgb, var(--owner-color, transparent) 35%, transparent);
}
```

Key changes vs before:
- No `text-decoration: line-through` (removed).
- Opacity raised from 0.58 → 0.75 so the text still reads clearly.
- Background switches to `--surface-2` (the muted surface token) with no border, so the completed card visually recedes against the page.
- Title color drops to `--text-muted`; weight drops from 500 → 400 so it reads "done" without yelling.

- [ ] **Step 3: Visual smoke check**

Hard-refresh the dashboard (Ctrl-Shift-R) on a day with at least one completed task. Compare light + dark themes:
- Completed card title is legible at arm's length.
- No strikethrough.
- Card blends into the page without disappearing.
- The blue check + checkmark glyph still reads clearly.

If any of these fail, fix inline before committing.

- [ ] **Step 4: Commit**

```bash
git add styles/components.css
git commit -m "$(cat <<'EOF'
fix(card): completed state mutes rather than hides

Dropped the line-through (which was the primary cause of unreadable
completed titles) and shifted the muted look to surface + color:
- background: var(--surface-2), border-color: transparent
- opacity 0.58 -> 0.75 so the title stays legible
- title drops to text-muted + weight 400
- stripe color-mix 40% -> 35% so it reads as faint without vanishing

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Check button — sizing + hover + press states

**Files:**
- Modify: [styles/components.css:1617-1631](../../../styles/components.css#L1617-L1631) — `.check` / `.check--done` block

**Context:** Current check is 30×30px with a single `:hover` border-color change. User complaint from review: "flat circle that doesn't telegraph tappable." Goal: 32×32px (meets 44×44 effective tap target when combined with the `.card__trailing` flex gap and card padding), visible hover + press states, retain `aria-label` semantics.

- [ ] **Step 1: Verify tap target math**

Measure the effective tap area in the browser. The check is inside `.card__trailing` (flex-shrink: 0). The card itself absorbs the click (role="button"), so the check button is mostly decorative. Confirm `.card__trailing` doesn't constrain clickability:

```js
const trail = document.querySelector('.card__trailing');
const card = trail.closest('.card');
console.log('card rect:', card.getBoundingClientRect());
console.log('trail rect:', trail.getBoundingClientRect());
```

Expected: the card's full width is the tappable region; the check is a visual indicator. No change needed if card ≥ 44px tall (it is — min-height 56px).

- [ ] **Step 2: Rewrite the `.check` rule**

Edit [styles/components.css:1617-1631](../../../styles/components.css#L1617-L1631). Replace the block from `/* Check button */` through `.check--done svg { ... }` with:

```css
/* Check button — 32px circle, hover fills with accent-soft, press scales 0.95 */
.check {
  width: 32px; height: 32px;
  border-radius: var(--radius-full);
  border: 1.75px solid var(--border);
  background: transparent;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  transition: background var(--t-fast), border-color var(--t-fast),
              color var(--t-fast), transform var(--t-fast);
}
.check:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.card:active .check,
.check:active {
  transform: scale(0.92);
}
.check--done {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.check--done svg { width: 16px; height: 16px; stroke-width: 3; }

@media (prefers-reduced-motion: reduce) {
  .check, .card:active .check, .check:active { transition: none; transform: none; }
}
```

Key changes:
- Size 30 → 32px.
- Hover now fills the circle with `--accent-soft` and previews the accent border/ink color, so the affordance is obvious.
- Press state scales 0.92 on both the direct press AND when the parent card is pressed (so tapping anywhere on the card pulses the check — it's the card's primary affordance).
- Reduced-motion guard on transforms/transitions.

- [ ] **Step 3: Visual smoke check**

On a non-done card: hover the check — it should fill with a pale accent tint and the border goes accent. Press the card body — the check briefly squishes. On a done card: solid accent circle with white checkmark (unchanged).

- [ ] **Step 4: Commit**

```bash
git add styles/components.css
git commit -m "$(cat <<'EOF'
feat(card): check button gains hover + press affordance

- Size 30 -> 32px (same tap model; card body still absorbs clicks).
- Hover fills with --accent-soft + previews --accent border/ink so
  the tappable state is obvious.
- Press state (on .check and on parent .card:active) scales 0.92
  to pulse in sync with the card press.
- Reduced-motion guard on transforms.

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Meta dot + section head grid + non-first divider + count tone

**Files:**
- Modify: [styles/components.css:1556-1566](../../../styles/components.css#L1556-L1566) — `.card__meta`, `.card__meta-dot`
- Modify: [styles/components.css](../../../styles/components.css) — find `.section__head` block (after the `.section { ... }` rule) and replace; also add `.section__head--divider` rule
- Modify: [shared/components.js:519-525](../../../shared/components.js#L519-L525) — `renderSectionHead` signature + output

**Context:** Meta-dot is 3px (invisible at arm's length). Section head has no grid so title/meta/chip touch the edges. "N of M done" is `--text` (too loud). And without a divider between sections, Events / Today / future Meals blur together.

- [ ] **Step 1: Fix the meta dot**

Edit [styles/components.css:1562-1566](../../../styles/components.css#L1562-L1566). Replace:

```css
.card__meta-dot {
  width: 3px; height: 3px; border-radius: var(--radius-full);
  background: var(--text-faint);
}
```

with:

```css
.card__meta-dot {
  width: 4px; height: 4px; border-radius: var(--radius-full);
  background: var(--text-faint);
  flex-shrink: 0;
}
```

4px is the smallest size that reads reliably at typical phone viewing distance. `flex-shrink: 0` prevents the dot from collapsing when the meta row overflows.

- [ ] **Step 2: Find the section-head rules in components.css**

Search the file for `.section__head`:

```bash
grep -n "\.section__head" styles/components.css
```

Expected: matches near `.section { ... }` around the components catalog. Note the exact line range for the edit.

- [ ] **Step 3: Rewrite section-head rules with grid + divider + muted meta**

Edit [styles/components.css](../../../styles/components.css) at the lines found in Step 2. Replace the existing `.section__head` / `.section__title` / `.section__meta` / `.section__head-trailing` block with:

```css
.section__head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md);
  margin: var(--spacing-md) 0 var(--spacing-sm);
}
.section__head--divider {
  border-top: 1px solid var(--border);
  padding-top: var(--spacing-md);
}
.section__title {
  flex: 1;
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.section__meta {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.section__head-trailing {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
```

Key changes:
- `.section__meta` is now `--text-muted` (was `--text`) and gets `tabular-nums` so "21 of 25" lines up across renders.
- New `.section__head--divider` modifier adds a 1px top border + extra top padding.
- `.section__title` keeps its uppercase treatment but gains `flex: 1` so the title column always fills the remaining space.

- [ ] **Step 4: Update `renderSectionHead` to accept a divider flag**

Edit [shared/components.js:519-525](../../../shared/components.js#L519-L525). Replace:

```js
export function renderSectionHead(title, meta) {
  const metaHtml = meta ? `<div class="section__meta">${esc(meta)}</div>` : '';
  return `<div class="section__head">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
  </div>`;
}
```

with:

```js
export function renderSectionHead(title, meta, options = {}) {
  const { divider = false, trailingHtml = '' } = options;
  const metaHtml = meta ? `<div class="section__meta">${esc(meta)}</div>` : '';
  const trailing = trailingHtml ? `<div class="section__head-trailing">${trailingHtml}</div>` : '';
  const dividerCls = divider ? ' section__head--divider' : '';
  return `<div class="section__head${dividerCls}">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
    ${trailing}
  </div>`;
}
```

The new signature is additive: existing two-arg callsites still work. Pages can now opt into a divider and a trailing slot (filter chip, add button).

- [ ] **Step 5: Update dashboard.js to pass divider on non-first sections**

Open [dashboard.js](../../../dashboard.js) and find the Events + Today section render blocks. Search:

```bash
grep -n "renderSectionHead" dashboard.js
```

For the **first** section rendered on the page (Events if present, otherwise Today), pass no `divider`. For **every subsequent section**, pass `{ divider: true }`.

Example pattern — adapt to the exact variable names in the file:

```js
let firstSectionRendered = false;

// Events section
if (sortedEvents.length > 0) {
  html += `<section class="section">`;
  html += renderSectionHead('Events', null, { divider: firstSectionRendered });
  firstSectionRendered = true;
  /* ... */
}

// Today section
html += `<section class="section">`;
html += renderSectionHead('Today', `${doneCount} of ${totalCount} done`, {
  divider: firstSectionRendered,
  trailingHtml: showFilterChip ? renderFilterChip({ ... }) : ''
});
firstSectionRendered = true;
/* ... */
```

Note: the existing `renderTodaySectionHead(meta)` helper in `dashboard.js` already emits the chip inline — if it's still there, replace its body to use the new `renderSectionHead` signature with `trailingHtml` and delete the redundant helper.

- [ ] **Step 6: Visual smoke check**

Reload the dashboard. Verify:
- A hairline divider appears above the Today section when Events exist above it.
- "21 of 25 done" is muted gray (not bold black).
- Section title "TODAY" still reads as an all-caps tracker.
- Filter chip still sits flush-right in the Today head on days with ≥2 people.

- [ ] **Step 7: Commit**

```bash
git add styles/components.css shared/components.js dashboard.js
git commit -m "$(cat <<'EOF'
feat(dashboard): section-head grid + non-first divider + muted meta

- Meta dot bumped 3 -> 4px with flex-shrink: 0 so it holds size
  even when the meta row wraps.
- Section head is now a 3-slot flex: title (flex:1), meta, trailing.
  Meta uses tabular-nums + --text-muted (was --text).
- Added .section__head--divider modifier (1px --border top).
  renderSectionHead gains an options arg {divider, trailingHtml};
  dashboard.js renders the divider on every section after the first.
- Retires the one-off renderTodaySectionHead helper by using
  trailingHtml for the filter chip.

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Header title/subtitle + narrow-phone subtitle truncation

**Files:**
- Modify: [styles/layout.css:32-47](../../../styles/layout.css#L32-L47) — `.app-header__title` / `.app-header__subtitle`
- Modify: [styles/responsive.css](../../../styles/responsive.css) — add `@media (max-width: 390px)` override
- Modify: [dashboard.js](../../../dashboard.js) — `renderHeader` / `updateHeaderSubtitle` to emit a short and long label

**Context:** `Home` reads tentative at `var(--font-xl) / 600`. "Thursday, April 23, 2026" crowds the header bell + overflow on 360-390px phones. Two changes: bump the title's visual weight without breaking the budget for header actions, and render a short subtitle variant for narrow screens.

- [ ] **Step 1: Check if `--font-2xl` token exists**

```bash
grep -n "font-2xl\|--font-xl\|--font-lg" styles/base.css
```

Expected: `--font-xl` exists; `--font-2xl` likely does not. If it doesn't exist, add it.

- [ ] **Step 2: Add `--font-2xl` token if missing**

Edit [styles/base.css](../../../styles/base.css) in the `:root` block (near the other `--font-*` declarations). Add:

```css
--font-2xl: 1.375rem;  /* 22px — used by header title */
```

If `--font-xl` is already ~22px, set `--font-2xl: 1.5rem` (24px) instead. Check the current value first:

```bash
grep -n "\-\-font-xl:" styles/base.css
```

Pick a `--font-2xl` that is one step larger than `--font-xl`. Record the final value.

- [ ] **Step 3: Update `.app-header__title` + subtitle**

Edit [styles/layout.css:32-47](../../../styles/layout.css#L32-L47). Replace:

```css
.app-header__title {
  font-size: var(--font-xl);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-header__subtitle {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-top: 2px;
  font-weight: 400;
}
```

with:

```css
.app-header__title {
  font-size: var(--font-2xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-header__subtitle {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-top: 2px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-header__subtitle-long { display: inline; }
.app-header__subtitle-short { display: none; }
```

Add the `-long` / `-short` helper rules so the narrow-phone media query in Step 5 can flip them with `display`.

- [ ] **Step 4: Update the subtitle render to emit both labels**

Find the subtitle render in [dashboard.js](../../../dashboard.js). Search:

```bash
grep -n "app-header__subtitle\|formatDateLong\|formatDateShort" dashboard.js shared/utils.js
```

If `formatDateShort` doesn't exist in `shared/utils.js`, add it next to `formatDateLong`:

```js
export function formatDateShort(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
}
```

Expected output: `Thu, Apr 23` vs the long form `Thursday, April 23, 2026`.

Then change the subtitle HTML from a single text node to two spans:

```js
// renderHeader / updateHeaderSubtitle
const long = formatDateLong(viewDate);
const short = formatDateShort(viewDate, settings.timezone);
const subtitleHtml = `
  <span class="app-header__subtitle-long">${esc(long)}</span><span class="app-header__subtitle-short">${esc(short)}</span>
`;
// assign to innerHTML of .app-header__subtitle
```

- [ ] **Step 5: Add the narrow-phone media query**

Edit [styles/responsive.css](../../../styles/responsive.css). Add near the top (after any existing `max-width` rules):

```css
@media (max-width: 390px) {
  .app-header__subtitle-long  { display: none; }
  .app-header__subtitle-short { display: inline; }
}
```

- [ ] **Step 6: Visual smoke check**

Resize the browser (or DevTools device mode) to 375px wide. "Home" should be noticeably larger/bolder than the subtitle. Subtitle should now read "Thu, Apr 23". Resize to 600px — subtitle swaps back to the long form. Check both light + dark themes.

- [ ] **Step 7: Commit**

```bash
git add styles/base.css styles/layout.css styles/responsive.css dashboard.js shared/utils.js
git commit -m "$(cat <<'EOF'
feat(dashboard): stronger title, narrow-phone subtitle

- New --font-2xl token for the header title.
- Title now font-2xl / 700 / -0.02em letter-spacing -- was font-xl/
  600/-0.015em -- so it reads confident, not tentative.
- Subtitle gets long/short paired spans; formatDateShort added
  to shared/utils.js. @media (max-width: 390px) flips display
  from long ("Thursday, April 23, 2026") to short ("Thu, Apr 23").

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: FAB depth + bottom-nav active-state rail

**Files:**
- Modify: [styles/components.css:1681-1700](../../../styles/components.css#L1681-L1700) — `.fab` block
- Modify: [styles/layout.css:173-192](../../../styles/layout.css#L173-L192) — `.bottom-nav__item` / `.is-active`

**Context:** FAB is flat; nav active state is just an accent color swap. Both need more depth.

- [ ] **Step 1: Update the FAB**

Edit [styles/components.css:1681-1700](../../../styles/components.css#L1681-L1700). Replace the existing `.fab` block with:

```css
.fab {
  position: fixed;
  right: calc(max(var(--spacing-md), env(safe-area-inset-right, 0px)));
  bottom: calc(var(--nav-height) + var(--spacing-md) + env(safe-area-inset-bottom, 0px));
  width: 56px; height: 56px;
  border-radius: var(--radius-full);
  background: var(--accent); color: var(--on-accent);
  border: 0;
  box-shadow: var(--shadow-md);
  display: inline-flex; align-items: center; justify-content: center;
  z-index: var(--z-fab);
  cursor: pointer;
  transition: transform var(--t-fast), box-shadow var(--t-fast);
}
.fab:hover  { box-shadow: var(--shadow-lg); transform: scale(1.04); }
.fab:active { transform: scale(0.96); box-shadow: var(--shadow-md); }
.fab svg    { width: 22px; height: 22px; stroke-width: 2; }

@media (prefers-reduced-motion: reduce) {
  .fab, .fab:hover, .fab:active { transition: none; transform: none; }
}
```

Key changes: `transform: scale(1.04)` on hover in addition to the shadow bump. Active state squishes back to 0.96 and returns the shadow to shadow-md (so press reads as "pushing the button into the page"). Reduced-motion guard kills all transforms.

- [ ] **Step 2: Update the bottom-nav active state**

Edit [styles/layout.css:173-192](../../../styles/layout.css#L173-L192). Replace the existing `.bottom-nav__item` / `.bottom-nav__item.is-active` rules with:

```css
.bottom-nav__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 4px;
  background: transparent;
  border: 0;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
}
.bottom-nav__item svg { width: 22px; height: 22px; stroke-width: 1.75; }

.bottom-nav__item.is-active { color: var(--accent); }
.bottom-nav__item.is-active svg { stroke-width: 2; }
.bottom-nav__item.is-active::before {
  content: "";
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: var(--accent);
}
```

Key change: `::before` creates a 28×2px accent rail centered at the top of the active tab. The label-icon pair stays centered in the tab (no layout shift), and the rail echoes the iOS-17 style nav-active cue. No reduced-motion concerns — the rail is static.

- [ ] **Step 3: Visual smoke check**

Hover the FAB — it should lift (shadow-lg) and scale up slightly. Press — it scales back down. Check the nav bar: the current page tab shows a short accent bar at the top edge of the nav cell plus the existing accent-color icon/label.

- [ ] **Step 4: Commit**

```bash
git add styles/components.css styles/layout.css
git commit -m "$(cat <<'EOF'
feat(nav,fab): FAB depth + bottom-nav active rail

- FAB: shadow-md default, shadow-lg + scale(1.04) on hover,
  scale(0.96) + shadow-md on active. Reduced-motion guard kills
  all transforms.
- Bottom nav active tab gains a 28x2px accent rail centered at
  the top edge via a ::before pseudo. Icon stroke bump + color
  swap are retained as secondary signals.

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Back-to-Today pill — chevron + entrance animation

**Files:**
- Modify: [styles/components.css:1672-1678](../../../styles/components.css#L1672-L1678) — `.back-to-today`
- Modify: [dashboard.js:261-266](../../../dashboard.js#L261-L266) — pill render block

**Context:** Pill appears instantly and has no icon. Add a left chevron + a 200ms fade-slide-down entrance. Reduced-motion guard skips the animation.

- [ ] **Step 1: Add the chevron to the pill markup**

Edit [dashboard.js](../../../dashboard.js). Find the pill render block:

```bash
grep -n "back-to-today" dashboard.js
```

Replace the current block (which currently outputs `<button class="btn btn--secondary btn--sm btn--full" id="goToday" type="button">Back to Today</button>`) with:

```js
if (!isToday) {
  const chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
  html += `<div class="back-to-today">
    <button class="btn btn--secondary btn--sm back-to-today__btn" id="goToday" type="button">
      <span class="back-to-today__chevron" aria-hidden="true">${chevronSvg}</span>
      <span>Back to Today</span>
    </button>
  </div>`;
}
```

Note: dropped `btn--full` in favor of a scoped `.back-to-today__btn` class so the chevron + label pair can size naturally. The wrapper's `justify-content: center` keeps it centered.

- [ ] **Step 2: Update the pill CSS**

Edit [styles/components.css:1672-1678](../../../styles/components.css#L1672-L1678). Replace with:

```css
/* Back-to-Today pill */
.back-to-today {
  display: flex;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-md);
  animation: backToTodayEnter 200ms ease-out both;
}
.back-to-today__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 320px;
}
.back-to-today__chevron {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
}
.back-to-today__chevron svg { width: 14px; height: 14px; stroke-width: 2; }

@keyframes backToTodayEnter {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .back-to-today { animation: none; }
}
```

Key changes: pill appears with a 200ms fade-and-slide-down, gated on reduced-motion. Chevron is the left-pointing "back" glyph (points="15 18 9 12 15 6") at 14px with muted color so it reads as a subordinate icon.

- [ ] **Step 3: Visual smoke check**

Swipe left on the dashboard (or use the prev-day arrow if still wired) to move to yesterday. The pill should fade-slide in from 4px above over 200ms. Tap it — returns to today (pill disappears). With reduced-motion on (DevTools → Rendering → Emulate CSS prefers-reduced-motion: reduce), the pill appears instantly.

- [ ] **Step 4: Commit**

```bash
git add dashboard.js styles/components.css
git commit -m "$(cat <<'EOF'
feat(dashboard): Back-to-Today pill gains chevron + entrance anim

- DOM adds a left chevron (points="15 18 9 12 15 6", 14px, muted)
  before the label.
- Pill wrapper gets a 200ms fade-slide-down entrance animation,
  gated on prefers-reduced-motion: reduce.
- Dropped btn--full in favor of a scoped .back-to-today__btn that
  sizes naturally; the wrapper's justify-content: center keeps it
  centered.

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Filter chip — person dot + action label + active section cue (Q2)

**Files:**
- Modify: [shared/components.js:549-555](../../../shared/components.js#L549-L555) — `renderFilterChip`
- Modify: [styles/components.css:1721-1733](../../../styles/components.css#L1721-L1733) — `.filter-chip` + variants
- Modify: [dashboard.js](../../../dashboard.js) — pass `activePerson`/`color` to chip; add `section--filtered` class

**Context:** Chip currently always says "All" and has no visual affordance. When a filter is active, show the person's color dot and their name. When inactive, the chip reads "Filter" (verb, discoverable). When filter is active, the Today section gets a subtle 1px `--accent` border on its left (the user-approved "subtle cue" from Q2).

- [ ] **Step 1: Update `renderFilterChip` signature + output**

Edit [shared/components.js:549-555](../../../shared/components.js#L549-L555). Replace:

```js
export function renderFilterChip({ id = 'openFilterSheet', label = 'All' } = {}) {
  const caret = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  return `<button class="filter-chip" id="${esc(id)}" type="button" aria-haspopup="dialog">
    <span class="filter-chip__label">${esc(label)}</span>
    <span class="filter-chip__caret" aria-hidden="true">${caret}</span>
  </button>`;
}
```

with:

```js
/**
 * Filter chip.
 * - When `activePersonName` is falsy: renders `Filter` (verb), no dot.
 * - When `activePersonName` is a name: renders `<dot> Name`, dot colored
 *   via data-person-color (applyDataColors propagates it to --person-color).
 * The chip always opens the filter sheet on click.
 */
export function renderFilterChip({ id = 'openFilterSheet', activePersonName = '', activePersonColor = '' } = {}) {
  const caret = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  const isActive = !!activePersonName;
  const dot = isActive
    ? `<span class="filter-chip__dot" data-person-color="${esc(activePersonColor)}" aria-hidden="true"></span>`
    : '';
  const label = isActive ? activePersonName : 'Filter';
  const activeCls = isActive ? ' filter-chip--active' : '';
  return `<button class="filter-chip${activeCls}" id="${esc(id)}" type="button" aria-haspopup="dialog">
    ${dot}
    <span class="filter-chip__label">${esc(label)}</span>
    <span class="filter-chip__caret" aria-hidden="true">${caret}</span>
  </button>`;
}
```

- [ ] **Step 2: Add the dot + active-variant CSS**

Edit [styles/components.css:1721-1733](../../../styles/components.css#L1721-L1733). Replace the `.filter-chip` block with:

```css
/* Filter chip */
.filter-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 12px;
  border-radius: var(--radius-full);
  background: var(--surface-2); color: var(--text);
  border: 1px solid var(--border);
  font-size: var(--font-xs); font-weight: 500;
  cursor: pointer;
  min-height: 32px;
  min-width: 44px;
}
.filter-chip:hover { background: var(--bg-hover); }
.filter-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.filter-chip__caret svg { width: 14px; height: 14px; }
.filter-chip__dot {
  width: 10px; height: 10px;
  border-radius: var(--radius-full);
  background: var(--person-color, var(--accent));
  flex-shrink: 0;
}
.filter-chip--active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
}
```

Key changes:
- `min-height: 32px` (was 28) and `min-width: 44px` so the chip meets the 44×44 tap target expectation when combined with the surrounding padding.
- `.filter-chip__dot` is 10px with runtime color via `--person-color` (propagated by `applyDataColors`).
- `.filter-chip--active` flips to `--accent-soft` ground so the active state is obvious even without reading the label.

- [ ] **Step 3: Add the section-filtered cue CSS**

In the same `styles/components.css` file, after the `.filter-chip` block, add:

```css
/* Active-filter cue — the Today section gets a left accent border
   when a person filter is applied. Subtle by design (Phase 1.5 Q2). */
.section.section--filtered {
  position: relative;
}
.section.section--filtered::before {
  content: "";
  position: absolute;
  left: calc(var(--spacing-md) - var(--spacing-xs));
  top: var(--spacing-md);
  bottom: var(--spacing-md);
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0.5;
  pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .section.section--filtered::before {
    animation: filterCueFade 200ms ease-out both;
  }
}
@keyframes filterCueFade {
  from { opacity: 0; }
  to   { opacity: 0.5; }
}
```

The cue is a 2px vertical accent bar on the section's left gutter. Opacity 0.5 keeps it "ambient," not shouting.

- [ ] **Step 4: Wire dashboard.js to pass the active person + add the section class**

In [dashboard.js](../../../dashboard.js), find where the Today section and the filter chip are rendered. Update the chip callsite:

```js
const activePersonObj = activePerson ? people.find(p => p.id === activePerson) : null;
const chipHtml = (people.length >= 2 && !linkedPerson)
  ? renderFilterChip({
      activePersonName: activePersonObj?.name || '',
      activePersonColor: activePersonObj?.color || ''
    })
  : '';
```

And on the Today section element itself, add `section--filtered` when `activePerson` is truthy:

```js
const sectionCls = activePerson ? 'section section--filtered' : 'section';
html += `<section class="${sectionCls}">`;
```

After the render, remember to call `applyDataColors(mountEl)` so the chip's dot picks up its color — this is already the established pattern; do not add a new applyDataColors call if one exists for the same mount root.

- [ ] **Step 5: Visual smoke check**

With `people.length >= 2`:
- On initial load (no filter): chip reads `Filter` with a down caret, no dot.
- Tap chip → sheet. Pick a person. Chip now shows a 10px color dot + their name + caret. Active style (accent-soft ground + accent border + accent-ink text) is visible.
- The Today section shows a 2px accent bar on its left gutter.
- Tap chip → "All". Chip reverts to `Filter`. Section bar disappears.

- [ ] **Step 6: Commit**

```bash
git add shared/components.js styles/components.css dashboard.js
git commit -m "$(cat <<'EOF'
feat(dashboard): filter chip gains dot + verb label + section cue

Filter chip
- Signature: renderFilterChip({ activePersonName, activePersonColor }).
- Inactive state: "Filter" + down-caret, no dot (discoverable verb).
- Active state: 10px color dot (data-person-color -> --person-color
  via applyDataColors) + person name + caret, accent-soft ground.
- min-height 28 -> 32, min-width 44 so it meets tap-target guidance.

Section cue (Phase 1.5 Q2)
- .section--filtered adds a 2px accent bar in the left gutter, 50%
  opacity. 200ms fade-in on prefers-reduced-motion: no-preference.
- dashboard.js adds the class when activePerson is truthy.

Part of Phase 1.5 polish.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Bell dot — subtle pulse on first appearance (Q1)

**Files:**
- Modify: [styles/components.css:1773-1780](../../../styles/components.css#L1773-L1780) — `.btn-icon__dot`

**Context:** The unseen-count dot on the bell icon currently appears instantly. User asked (Q1) for a Skylight-style subtle pulse. The pulse plays ONLY when the dot transitions from hidden → visible (not on every render), and respects reduced-motion.

- [ ] **Step 1: Inspect current `.btn-icon__dot`**

Read [styles/components.css:1773-1780](../../../styles/components.css#L1773-L1780). Note the existing size, position, color.

- [ ] **Step 2: Add the pulse keyframe + animation**

Edit [styles/components.css:1773-1780](../../../styles/components.css#L1773-L1780). Replace the existing `.btn-icon__dot` block with:

```css
.btn-icon__dot {
  position: absolute;
  top: 6px; right: 6px;
  width: 8px; height: 8px;
  border-radius: var(--radius-full);
  background: var(--danger);
  border: 2px solid var(--surface);
  animation: bellDotPulse 600ms ease-out 1 both;
}
.btn-icon__dot.is-hidden { display: none; animation: none; }

@keyframes bellDotPulse {
  0%   { transform: scale(0.6); opacity: 0; }
  60%  { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .btn-icon__dot { animation: none; }
}
```

Key mechanic: the animation is declared with `1 both` (run once, hold final state). Because the dot toggles visibility via `.is-hidden` (which sets `display: none` and forbids the animation), the animation re-plays each time the dot returns from hidden → shown — which is exactly the "first appearance" semantics the user asked for. No JS needed.

Preserve the existing positioning values (`top: 6px; right: 6px; width: 8px; height: 8px;`) if they differ from the above — the point of the task is the keyframe + animation property, not repositioning the dot. If the current rule differs from the base I've shown, keep your current positioning + color and only add the `animation:` line + keyframes + reduced-motion guard.

- [ ] **Step 3: Visual smoke check**

With an unseen notification (or force the dot by toggling `is-hidden` in DevTools):
- Dot fades in with a 600ms pulse (grows to 1.15x then settles back to 1x).
- On subsequent renders while the dot remains visible, the pulse does NOT replay (because the animation is `1`-count and the dot never went through `display: none`).
- With reduced-motion on, the dot snaps in — no pulse.

- [ ] **Step 4: Commit**

```bash
git add styles/components.css
git commit -m "$(cat <<'EOF'
feat(bell): unseen dot pulses on first appearance

- Added bellDotPulse 600ms keyframe (scale 0.6 -> 1.15 -> 1, with
  opacity fade from 0 -> 1 in the first 60%).
- Applied to .btn-icon__dot with `1 both` so the pulse only plays
  on the transition from hidden -> visible (is-hidden uses
  display: none, which resets the animation).
- Reduced-motion guard removes the animation entirely.

Closes Q1 from Phase 1.5 scope review.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Tap-target audit, reduced-motion sweep, dark-mode parity

**Files:**
- Modify: any CSS file where an audit finding requires a fix
- No new files

**Context:** A consolidated QA task. Measures every interactive element for 44×44 tap area, verifies every animation added in 1.5 respects `prefers-reduced-motion`, and re-checks the polish in dark + dark-warm + dark-vivid.

- [ ] **Step 1: Run tap-target measurement script in DevTools**

Paste this into the browser console on the dashboard:

```js
(() => {
  const targets = [
    ['#headerBell',            'Bell'],
    ['#headerOverflow',        'Overflow 3-dot'],
    ['#fabAdd',                'FAB'],
    ['.check',                 'Card check'],
    ['#openFilterSheet',       'Filter chip'],
    ['.bottom-nav__item',      'Nav item'],
    ['.back-to-today__btn',    'Back-to-Today'],
  ];
  const fails = [];
  for (const [sel, name] of targets) {
    const els = document.querySelectorAll(sel);
    if (!els.length) continue;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        fails.push({ name, sel, width: r.width, height: r.height });
      }
    }
  }
  console.table(fails.length ? fails : [{ result: 'All >= 44x44' }]);
})();
```

Expected: all pass. If any fail, fix in the relevant CSS file (bump `min-width` / `min-height` or increase padding). Do not add a `::before` overlay to pad invisibly unless the element is inside a constrained container that can't be widened — that's a Phase 7 problem.

- [ ] **Step 2: Reduced-motion grep — verify every 1.5-added animation is guarded**

Run:

```bash
grep -n "animation:\|transition:" styles/components.css styles/layout.css | wc -l
grep -n "prefers-reduced-motion" styles/components.css styles/layout.css
```

Cross-check: for every `animation:` declared by this phase (pill entrance, section cue fade, bell dot pulse, FAB hover transitions), a matching `@media (prefers-reduced-motion: reduce)` block exists in the same file. If any is missing, add it.

- [ ] **Step 3: Dark-mode parity check**

Open the dashboard, then in the in-app theme switcher (Overflow menu → Theme), cycle through:
- Light Warm
- Light Vivid
- Dark
- Dark Warm
- Dark Vivid

For each, verify:
- Completed cards mute without vanishing (Task 1).
- Check hover state reads clearly (accent-soft / accent-ink contrast) (Task 2).
- Section divider (Task 3) is faintly visible but not loud.
- Header title is bold + readable (Task 4).
- FAB depth is appropriate for the theme (shadow not lost in dark themes).
- Nav active rail is the accent color, visible in all themes (Task 5).
- Pill chevron is readable (Task 6).
- Filter chip active state is legible (Task 7).
- Bell dot stands out against the surface (Task 8).

Record any theme-specific issue in the commit message as a follow-up bullet, then fix inline if trivial. If a fix changes a token in `shared/theme.js`, update the theme-mode block and re-verify the other themes that share the token.

- [ ] **Step 4: Commit (only if any fixes were required)**

```bash
git add <files touched by fixes>
git commit -m "$(cat <<'EOF'
fix(dashboard): tap-target + reduced-motion + dark-mode audit

Findings from Phase 1.5 Task 9 audit:
- <list each fix, one per line>

If no fixes were needed, this commit is skipped.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If the audit produced no findings, skip Step 4 — do not create an empty commit. Make a note in the Task 10 commit that the audit passed clean.

---

## Task 10: SW cache bump + backlog note + PR prep

**Files:**
- Modify: [sw.js:23](../../../sw.js#L23) — `CACHE_NAME`
- Modify: [sw.js](../../../sw.js) — CACHE_BUMPS comment
- Modify: [CLAUDE.md](../../../CLAUDE.md) — backlog note about loading skeleton (Q3)

- [ ] **Step 1: Bump SW cache**

Edit [sw.js](../../../sw.js). Change:

```js
const CACHE_NAME = 'family-hub-v47';
```

to:

```js
const CACHE_NAME = 'family-hub-v48';
```

Add a new entry at the top of the CACHE_BUMPS block:

```
// v48 (2026-04-24) — Phase 1.5 dashboard polish: completed-card mute
//                    (no strikethrough), check hover+press, section
//                    head grid + divider + muted meta, larger header
//                    title + narrow-phone subtitle, FAB depth + nav
//                    active rail, Back-to-Today chevron + entrance,
//                    filter chip dot/verb + section cue, bell pulse.
```

- [ ] **Step 2: Add loading-skeleton backlog note (Q3)**

Edit [CLAUDE.md](../../../CLAUDE.md). Find the "Backlog" section. Under "Tier 3 — Polish & Engagement" (before "3.1 — Task Timer / Stopwatch"), add a new item:

```markdown
**3.0 — Dashboard loading skeleton** · Low (~0.5 session) · No dependencies · Cost: $0

Replace the current inline "Loading..." spinner on the dashboard with a card-shaped skeleton that matches the real card layout (owner-stripe placeholder + title bar + meta bar + check placeholder). Respects reduced-motion (skeleton stays static, no shimmer). Rationale: at first paint the user sees a convincing skeleton for ~200ms before Firebase responds, which feels more polished than a centered spinner against the empty page. Noted for future upgrade during Phase 1.5 polish review (2026-04-24).
```

- [ ] **Step 3: Commit**

```bash
git add sw.js CLAUDE.md
git commit -m "$(cat <<'EOF'
chore: bump SW cache to v48 + Phase 1.5 backlog note

- CACHE_NAME v47 -> v48 with CACHE_BUMPS entry summarizing the
  eight polish commits in this phase.
- CLAUDE.md backlog gains item 3.0 (Dashboard loading skeleton)
  per Phase 1.5 scope review Q3 -- flagged as a future upgrade
  so the current inline spinner is a known, scoped gap.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push -u origin phase-1-5-polish
```

- [ ] **Step 5: Open PR**

Use `gh pr create` with base branch = **whichever of `main` or `phase-1-dashboard` the branch is stacked on** (see the branch note in the Architecture section).

Title: `Phase 1.5: Dashboard polish`

Body:

```markdown
## Summary
- Ten small polish commits that raise the dashboard from mockup-aligned (Phase 1) to shippable.
- No schema changes, no data migrations, no new modules. CSS + three component-render edits.
- Addresses the visible issues from Phase 1 review: readability of completed cards, affordance of the check button, typography confidence, filter chip discoverability, nav + FAB depth, and two Skylight-style details (bell pulse, active-filter section cue).

## What's in
1. Completed-card mute (surface-2 + 0.75 opacity, no strikethrough).
2. Check button hover + press states.
3. Section head grid + non-first divider + muted meta + 4px meta dot.
4. Larger header title + narrow-phone subtitle truncation.
5. FAB depth + bottom-nav 2px accent rail.
6. Back-to-Today chevron + 200ms entrance animation.
7. Filter chip: "Filter" verb / person dot + active-filter section cue.
8. Bell dot pulse on first appearance.
9. Tap-target + reduced-motion + dark-mode audit.
10. SW cache bump (v47 → v48) + backlog note for future loading skeleton.

## Test plan
- [ ] Dashboard at 375px light-warm: header reads confidently, completed cards are muted but legible, filter chip shows "Filter" or "Name" + dot.
- [ ] Swipe to a past day: Back-to-Today pill fades in from above with a chevron, centered.
- [ ] Tap a person in the filter sheet: section shows a subtle accent bar on its left gutter.
- [ ] Tap the bell dot's appearance (set unseen count > 0): subtle 600ms pulse plays on first show, not on subsequent renders.
- [ ] Bottom nav: current tab shows a 28×2px accent rail at the top edge.
- [ ] Hover the FAB on a pointer device: scales to 1.04 + shadow-lg.
- [ ] Resize to 360px: subtitle switches from "Thursday, April 23, 2026" to "Thu, Apr 23".
- [ ] All five theme presets (light-warm, light-vivid, dark, dark-warm, dark-vivid): every polish item reads cleanly.
- [ ] DevTools → Rendering → prefers-reduced-motion: reduce: pill entrance, section cue fade, bell pulse, FAB hover all skip the animation.
- [ ] Tap-target audit script (Task 9 Step 1) returns all ≥ 44×44.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Self-review

Ran the writing-plans self-review checklist:

**1. Spec coverage:** Ten tasks map 1:1 to the ten locked-scope bullets. Q1 (bell pulse) = Task 8; Q2 (section cue) = Task 7 Step 3; Q3 (skeleton backlog note) = Task 10 Step 2.

**2. Placeholder scan:** No "TBD," "implement later," "handle edge cases," or "similar to Task N." Every step has concrete code or concrete commands. The one conditional ("if audit produced no findings, skip Step 4") is a legitimate empty-commit avoidance, not a placeholder — it explicitly tells the engineer what to do in both branches.

**3. Type consistency:** `renderSectionHead(title, meta, options)` signature in Task 3 matches the callsite edits in Step 5. `renderFilterChip({ activePersonName, activePersonColor })` in Task 7 Step 1 matches the dashboard.js wiring in Step 4. `.section--filtered` class in Task 7 CSS matches the `sectionCls` assignment in Task 7 Step 4. `--font-2xl` token added in Task 4 Step 2 is used in Task 4 Step 3. `data-person-color` attribute on the filter dot uses the existing `applyDataColors` runtime-coloring path from Phase 0 (no new plumbing).

No gaps found. Plan is ready.

---

Plan complete and saved to [docs/superpowers/plans/2026-04-24-phase-1-5-dashboard-polish.md](2026-04-24-phase-1-5-dashboard-polish.md).

## Execution handoff

Two options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints for review.

Which approach?
