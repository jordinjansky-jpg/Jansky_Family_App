# Daily Rundown — Design System & UI Spec

> Single source of truth for how the app looks, feels, and grows. Every UI decision in this repo must align with this document. If something is not covered here, extend the spec *before* writing the code.

**Status:** Active (v1.0, 2026-04-19)
**Scope:** All pages, all features (current + backlog), all form factors (phone, tablet, kiosk).
**Mockups for reference:** [mockups/](../mockups/)
**Rules digest:** see `CLAUDE.md` → *Design Rules*.

---

## 0. How to use this document

- **Before designing anything new**, read §1 (Principles), §2 (Feature-home map), §3 (Tokens), §4 (Layout rules), and the §6 per-area section that applies.
- **Before building a new component**, search §5 (Component Catalog). If a component with the right shape exists, use it — add a variant if needed, don't fork.
- **Before reviewing a PR**, use the checklist in §11.
- **When the spec doesn't cover a situation**, bring it to the repo owner; update this doc in the same PR that adds the new pattern.

This is a hard guide, not a suggestion. Deviation requires a named exception in the PR description and a spec update.

---

## 1. Core principles

1. **Calm, confident, quiet.** The app is a family hub, not a dashboard demo. Restraint beats novelty. No gradient text in chrome, no competing colors, no "designed for a design reel" moments.
2. **One component per shape.** If two things look almost the same, they are the same — extract a component, add a variant. There is one Card, one Tabs, one Sheet, one Modal, one Banner, one Timer.
3. **Mobile is the default. Tablet is the expansion. Desktop is not a target.** Phone layouts lead. Tablet is a deliberate redesign (two-pane, left rail). Kiosk is a separate layout file.
4. **Every area budgets for growth.** When designing a screen, reserve room for the backlog features that map to it (§2). Never ship a screen that visibly has no room for what is already planned.
5. **Design for the whole flow, not the happy path.** Every feature ships with empty, loading, error, and success states.
6. **Consistency beats cleverness.** The entire product should feel like one designer made it in one sitting.
7. **Accessibility is not optional.** 44×44 tap targets. Keyboard-navigable. Reduced-motion respected. Contrast verified.
8. **No dev-tool vibes.** No inline styles, no raw hex in component CSS, no console-flavored debug chrome, no `window.confirm`/`window.alert`.

---

## 2. Feature-home map

Every current and backlog feature has a named home. If a proposal doesn't fit here, update this table *before* writing code.

| Feature | Primary home | Secondary surfaces | Nav slot |
|---|---|---|---|
| Tasks (current) | Dashboard | Calendar day, Kid mode, Tracker | Home |
| Events (current) | Calendar | Dashboard Events section, Kiosk | Calendar |
| Scoring / Grades (current) | Scoreboard | Dashboard progress bar | Scores |
| Rewards Store (current) | Rewards page/sheet (own destination) | Scoreboard balance CTA, Bell deep-link, Kid home tile, Admin Rewards | More tab (phone), left rail (tablet) |
| Messages / Bell (current) | Header bell dropdown | Admin activity log | header, all pages |
| Achievements (current) | Kid trophy case | Scoreboard badge strip, Admin Badges | inside Scores & Kid |
| Setup wizard (current) | `setup.html` | — | first-run only |
| Admin (current) | Admin page | — | header overflow |
| **Kitchen (1.3+1.7)** | `kitchen.html` | Dashboard ambient strip (dinner chip), Calendar day view (read-only), More sheet | More tab (phone) → future: promoted to tab after usage review |
| **1.4 Weather** | Calendar header chip, Kiosk header | Dashboard ambient strip (optional), Kid tile | NO nav tab |
| **1.5 Kiosk** | `display.html` (own layout, own CSS) | — | NO nav tab (own entry) |
| **1.6 Activities** | Activities page | Scoreboard Tabs variant, Kid tile, shared timer | More tab (phone), left rail (tablet) |
| **2.1 Push Notifications** | Bell dropdown + OS-level | Admin → People → Notifications, Settings global prefs | existing bell |
| **2.2 Flexible Recurrence** | Task/Event form (progressive disclosure) | Calendar preview of next occurrences | inside existing forms |
| **2.3 School lunch PDF** | Admin → Advanced → Import | Calendar day meals with `source: school` tag | inside Admin |
| **2.4 Vacation mode** | Admin → People → [person] → Availability | Dashboard banner, Calendar shading | inside Admin |
| **3.1 Task Timer** | Task detail sheet → Timer sheet | — | inside task detail |
| **3.2 Task Delegation** | Task detail sheet → Propose trade | Bell proposals, Admin history | inside bell + detail sheet |

**Hard rules enforced by this table:**
- Phone tab bar never exceeds 5 slots. See [ROADMAP.md](../ROADMAP.md) Nav Bar section for current assignment.
- Weather, Kiosk, Vacation, Recurrence, Timer, PDF import, Delegation never become tabs.
- Activities (1.6) is the only backlog feature that earns a future nav slot.

---

## 3. Design tokens

Tokens are defined in `styles/base.css` and themed via `shared/theme.js`. **Never hardcode a value that a token covers.** Never use raw hex in component CSS.

### 3.1 Spacing scale
```
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--spacing-xl: 32px
--spacing-2xl: 48px
```
- `xs` for dense internal gaps (chip padding, meta-line dot).
- `sm` for intra-card gaps (avatar→body, body→action).
- `md` for card padding, section gutter (standard).
- `lg` for section-to-section gaps.
- `xl` / `2xl` for page-level breathing room (hero, empty state).

Never use values between these. If you need 12px padding, pick 8 or 16.

### 3.2 Type scale
```
--font-xs: 0.75rem    (12px) — labels, tags, meta
--font-sm: 0.875rem   (14px) — meta text, secondary body
--font-md: 1rem       (16px) — default body, card titles
--font-lg: 1.125rem   (18px) — section titles, emphasis
--font-xl: 1.375rem   (22px) — page titles, stat values
--font-2xl: 1.5rem    (24px) — header title (rescaled 2026-04-24, was 1.75rem hero/kid-name)
--font-3xl: 2.25rem   (36px) — splash, kiosk hero
```

Rules:
- Body default: `md` (never below).
- Interactive text never below `sm`.
- Line-height 1.5 for body, 1.2 for titles.
- Letter-spacing `-0.015em` to `-0.02em` for titles ≥ `xl`. Letter-spacing `0.07em–0.09em` + UPPERCASE for `xs` section labels.
- Font family: system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`). Never import a webfont.

### 3.3 Radii
```
--radius-sm: 6px       (small elements, late-tag pills)
--radius-md: 10px      (inputs, icon buttons, list-row icons)
--radius-lg: 16px      (cards, banners, ambient chips)
--radius-xl: 20px      (kid cards, sheet top corners)
--radius-full: 9999px  (avatars, chips, pills, FAB)
```

### 3.4 Color tokens

All component CSS references tokens, never raw hex. Canonical set (light theme values are examples; themes redefine them):

```
/* Surfaces */
--bg              page background
--surface         card/panel background
--surface-2       subtle nested background (striped rows, muted cards)

/* Text */
--text            primary
--text-muted      secondary
--text-faint      tertiary (meta dots, chevrons)

/* Structure */
--border          default border + divider

/* Brand accent (themed) */
--accent          primary action color
--accent-ink      darker accent for hover / on-soft
--accent-soft     tinted background for chips/banners/kid accents

/* Semantic */
--danger / --danger-soft
--success / --success-soft
--warning / --warning-soft
--info / --info-soft

/* Owner (per-person identity) */
--owner-a / --owner-b / --owner-c / --owner-d / ...

/* List-row icon tiles (admin grouped lists; fill, not text) */
--icon-blue    Profile / Name / Notifications
--icon-teal    System / Time / Location / Availability
--icon-amber   Points / Stars / Rewards / Weather-warm
--icon-purple  Color / Identity / Appearance
--icon-rose    Security / PIN / Alerts (non-destructive)
--icon-green   Success / Active / Activity
--icon-gray    Neutral / Settings / History
--icon-red     Destructive (maps to --danger)
```

**Icon-tile tokens** are semantic for admin **List row** icon chips (see §5.15). Each tile is `color: white` on the named background. They are the **only** place raw-looking palette colors enter component CSS; downstream, every theme preset redefines them so a Rose theme doesn't clash with an `--icon-rose` badge.

**Retired tokens (do not use):**
- `--border-color` → use `--border`
- `--bg-card` → use `--surface`
- `--danger-text` → use `--danger`
- `--accent-success` → use `--success`
- `--font-size-base` (0.9375rem) — removed from scale
- `--font-size-md` old (1rem) — now `--font-md` (same value; just one canonical name)

**Owner colors** are assigned in order to family members and are *identity tokens*, not decoration. The same person is always the same color.

### 3.5 Elevation
```
--shadow-sm: subtle card lift on hover
--shadow-md: sheets, FAB
--shadow-lg: modals, kiosk elements
```
Three values only. No ad-hoc box-shadows anywhere in component CSS.

### 3.6 Motion
```
--t-fast: 120ms ease-out   (hover, taps, checks)
--t-base: 200ms ease-out   (sheet slides, banner in/out)
--t-slow: 320ms ease-out   (celebrations, confetti entry)
```
Always `ease` / `ease-out`, never `linear`. `ease-in` only for exits.
All animations respect `prefers-reduced-motion`: replace slides/scales with a 120ms opacity fade.

### 3.7 Z-index bands
```
0–9      in-page content
10       sticky header
15       FAB
20       bottom nav
30       sheet backdrop
31       sheet
40       modal backdrop
41       modal
50       toast
60       celebration overlay
```
Do not use z-index values outside this table.

---

## 4. Layout rules

### 4.1 Mobile (≤ 600px — default)

- **Content width:** max 600px, centered; page gutter `--spacing-md`.
- **Header:** 56–64px. Title left, max 2 icon slots right (Bell + overflow). Title is `--font-2xl`, bold. Optional subtitle below title: `--font-sm`, `--text-muted` (used for date on dashboard, month range on calendar). Never 3 lines. No gradient text. Connectivity dot (8px `--success` circle) may appear as a passive indicator — it does not count against the 2-icon slot cap.
- **Bottom nav:** 68px including safe-area-inset; 5 items max, labels + icon. Frosted glass (`backdrop-filter: blur(14px)`).
- **Primary page action:** single FAB (56px) bottom-right, 16px margin, above nav. Never in header.
- **Tap targets:** ≥ 44×44 (56×56 in kid mode).
- **Lists:** one column. No multi-column except month grid, badge case, kiosk.
- **Forms:** bottom sheets, never centered modals.
- **Confirms:** centered modals (≤340px), two buttons, inline item name.
- **Scroll model:** page scrolls; header sticky; no `overflow:hidden + height:100dvh` lock (kiosk is the only exception).
- **Safe area:** use `env(safe-area-inset-bottom)` on nav/FAB; `env(safe-area-inset-top)` respected on header only if full-bleed.

### 4.2 Tablet (≥ 768px)

- **Bottom nav becomes a left rail** (240px). Rail items 80px tall, icon + label.
- **Two-pane layouts** where content supports it:
  - Dashboard: today tasks | week agenda
  - Calendar: month/week grid | selected day detail
  - Admin: section nav | content
  - Activities: library | session detail
  - Kitchen: meal plan | shopping list
- **Content width scales:** 900px @ 768, 1200px @ 1024, 1600px @ 1400. Never stretch phone content to fill a widescreen.
- **Type +12.5%** at ≥1024px (via `html { font-size: 18px }`).
- **Sheet width clamped to 520px** centered on tablet; it becomes a floating card rather than a full-width drawer.

### 4.3 Kiosk (`display.html`, ≥ 1400px, typically 27" wall-mounted)

- **Own layout file** (`styles/display.css`), own HTML shell (`display.html`). Does not inherit dashboard CSS.
- **Week grid default.** Tap day → drilldown. No modals; inline editors only.
- **Type +25%.** Minimum tap target 56×56.
- **No admin, no PIN entry.** Kiosk is read/write for tasks/events/meals/shopping (via Kitchen), but never authentication.
- **Ambient idle:** 30s of inactivity returns to the default week view. Optional night mode after configured hour.
- **Every new feature ships its kiosk appearance on the same PR as its phone appearance.** "Kiosk later" is prohibited.

---

## 5. Component catalog

Each component section includes: purpose, variants, DOM structure, sizing, behavior notes. Reference implementations live in `shared/components.js`.

### 5.1 Card
**Purpose:** Primary content surface for any single "thing" (task, event, reward, person, meal, shopping item, trade, activity session).

**Variants:**
- `--task` (default)
- `--event` — left accent stripe, time in leading slot
- `--reward` — price in trailing slot
- `--score` — grade badge in trailing slot
- `--meal` — muted background, emoji-in-leading
- `--shopping` — checkbox in leading slot
- `--activity` — duration in trailing slot
- `--trade` — two-avatar leading, status in trailing
- `--done` — opacity 0.58, strikethrough title
- `.card.kid` — modifier: larger padding, larger radius, bigger type

**DOM slots:**
```html
<article class="card card--task">
  <div class="card__leading"><!-- avatar | icon | time --></div>
  <div class="card__body">
    <div class="card__title">...</div>
    <div class="card__meta">...</div>
  </div>
  <div class="card__trailing"><!-- check | button | chevron --></div>
</article>
```

**Rules:**
- Min height 64px (tasks), 72px (people), 84px (kid tasks).
- Padding `--spacing-md`. Radius `--radius-lg`.
- Whole card is tappable; long-press opens detail sheet (see timing rules).
- Meta row uses dot separators (`.card__meta-dot`), not pipes or bullets.
- Completed cards render at bottom of list and get `--done` modifier.
- **Never** invent a new card class per page. Add a variant here.

**Task card flat list pattern (dashboard Today section):**
Task cards in the Today section are rendered as a stacked flat list — zero gap between cards, no `--shadow-sm`, no elevation. Cards share the same `--surface` background. Only the first card's top corners and the last card's bottom corners show the `--radius-lg` rounding; middle cards appear square. Hairline `--border` dividers separate rows. This is the iOS grouped-list aesthetic: calm, space-efficient, scannable.

**Owner color stripe (task + event cards):**
Every `--task` and `--event` card has a 3–4px solid left-edge stripe colored with the owner's `--owner-*` token. Applied via a `border-left` or pseudo-element on `card__leading`. This is the primary at-a-glance identity signal — it lets you scan a long list and see who owns what without reading names. Never omit it, never animate it, never use it for any purpose other than owner identity.

### 5.1a Section head
**Purpose:** Titled divider between content groups on a page (Today, Events, Coming up, etc.).

```html
<div class="section-head">
  <span class="section-head__label">TODAY</span>
  <span class="section-head__meta">0 of 30 done</span>
  <button class="section-head__action">Filter ˅</button>
</div>
```

**Rules:**
- Label: `--font-xs`, `letter-spacing: 0.08em`, `UPPERCASE`, `--text-muted`. Never mix case.
- Meta text: `--font-sm`, `--text-muted`. Right of label, separated by a gap.
- Action (optional): right-aligned pill or text button. Filter chip, period switcher, "See all".
- No border beneath — the flat card list that follows acts as its own visual anchor.
- One section head per content group. Never nest section heads.

### 5.2 Tabs
**Purpose:** One component for every tabbed navigation.

**Variants:** `--pill` (default), `--underline`, `--segmented`.
**Sizes:** `--sm` (32px), `--md` (36px), `--lg` (44px).

**DOM:**
```html
<nav class="tabs tabs--pill tabs--md">
  <button class="tab is-active">Week</button>
  <button class="tab">Month</button>
  <button class="tab">Day</button>
</nav>
```

**Rules:**
- Minimum touch height 36px (sm), 44px otherwise.
- Active tab: surface background, `--shadow-sm`, `font-weight: 600`.
- Use `<button>`, never `<div>`. Keyboard arrows move between tabs.
- Replaces: `.admin-tabs`, `.sb-period-tabs`, `.tracker-tabs`, `.kid-week-tabs`, calendar view switcher.

### 5.3 Sheet (bottom sheet)
**Purpose:** All detail views and forms open in a sheet.

**DOM:**
```html
<div class="sheet-backdrop"></div>
<aside class="sheet" role="dialog">
  <div class="sheet__grab"></div>
  <header class="sheet__header">
    <h2 class="sheet__title">...</h2>
    <button class="btn-icon" aria-label="Close">...</button>
  </header>
  <div class="sheet__content">...</div>
  <footer class="sheet__footer">
    <button class="btn btn--secondary">Cancel</button>
    <button class="btn btn--primary btn--full">Save</button>
  </footer>
</aside>
```

**Rules:**
- Max height 92dvh. Content area scrolls; footer sticky.
- Drag handle (40×4 `--border`) at top.
- Dismiss: swipe-down, backdrop tap, close button. All three always work.
- Tablet: clamped to 520px wide, centered, animates up.
- Reduced motion: no slide, fade only.

**Footer button sizing:** `.sheet__footer .btn` uses `flex: 1 1 0; min-width: 0; padding-left: 12px; padding-right: 12px`. The `min-width: 0` is load-bearing — without it, flex children won't shrink below their content width, so 3-button footers (e.g. recipe detail's Start cooking · Add to list · Plan this meal) overflow the sheet's right edge past the content margin where every other element on the sheet stops. The tighter horizontal padding (vs the .btn default of 20px) keeps labels readable inside the equal-width cells. Form sheets use `.fs-footer` (§5.23), which is unaffected.

### 5.4 Modal (centered dialog)
**Purpose:** Confirms and tiny inline edits only (≤ 2 fields).

**Rules:**
- Max-width 340px.
- Two buttons: Cancel (secondary), Confirm (primary or danger).
- Confirm-type modals must include the item name inline ("Delete task *Take out trash*?").
- **Never** use for forms with >2 fields — use a Sheet.
- `showConfirm()` is the only way to invoke. `window.confirm`/`window.alert` are banned.

### 5.5 Button
```
.btn --primary | --secondary | --ghost | --danger
.btn --sm (36px) | --md (44px default) | --lg (56px)
.btn--full   (flex:1, used in sheet footers)
```
- Primary: `--accent` bg, white text.
- Secondary: `--surface` bg, `--border`, `--text`.
- Ghost: transparent bg, `--text`.
- Danger: `--danger` bg, white text — reserved for destructive confirms.
- Min-height 44px for md and up.
- Always include a clear label; icon-only buttons use `btn-icon` instead.

### 5.6 Icon button
- 44×44 circular.
- Transparent bg, hover → `--surface-2`.
- SVG 22×22, stroke-width 1.75–2.
- Optional `.btn-icon__dot` (8×8) for unseen indicator on Bell.

### 5.7 Chip / Pill
**Purpose:** Filter pills, owner pills, identity/status pills.

```
.chip (default)
.chip--selected    .chip--muted    .chip--owner-a ...
```
- Height 32px (md), 24px (sm).
- Padding `--spacing-sm --spacing-md`.
- Radius `--radius-full`.
- One variant for "selected" (accent-soft bg, accent-ink text, no border).

### 5.8 Field (form input wrapper)
```html
<label class="field">
  <span class="field__label">Task name</span>
  <input class="field__input" />
  <span class="field__help">Shown to the person doing it</span>
  <span class="field__error" role="alert">Required</span>
</label>
```
- Input min-height 44px, padding `--spacing-md`, radius `--radius-md`.
- Label always above input. Never placeholder-as-label.
- Required marker: single `*` in `--danger`.
- Error state reserves space so layout doesn't jump when it appears.

### 5.9 Banner (single slot)
**Purpose:** One persistent contextual notice at the top of a page.

**Variants:** `--overdue`, `--vacation`, `--multiplier`, `--freeze`, `--info`.

**`--info` sub-uses** (same variant, two distinct triggers):
- **Running activity session** (1.6) — `Reading session · 12:34 · [Stop]`. Persists across pages that mount the queue (see §7.3).
- **Offline** — `Offline — changes will sync`. Driven by `onConnectionChange`.

**Rule:** Only **one** banner visible at a time per page. Multiple active banners enter a queue with priority:
```
vacation > freeze > overdue > multiplier > info
```
The overdue banner body is tappable (same effect as its `Review` action button).

### 5.10 Timer
**Purpose:** Shared circular-progress overlay used by Activities (1.6) and Task Timer (3.1). Lives in `shared/timer.js`.

**API:**
```js
import { openTimer } from './shared/timer.js';
openTimer({
  durationMin: 20,
  label: 'Read 20 minutes',
  onDone: () => completeTask(id),
  onCancel: () => {},
});
```
- Implemented as a Sheet.
- Big circular progress (240px), start / pause / reset / done controls.
- Reduced motion: no spin animation; use text countdown only.
- Emits a single chime at completion (Web Audio); respects per-user mute.

### 5.11 Avatar
```
.avatar (36px default)
.avatar--sm (28)  .avatar--md (36)  .avatar--lg (52)  .avatar--xl (72)
.avatar--a / --b / --c / --d (owner color variants, use color-mix for tint)
```
Initials only, 2 letters max. Always assigned by family order; identity is stable.

### 5.12 Check
```
.check (30px default)
.check--lg (44px, kid mode)
.check--done (accent fill, white check SVG)
```
Tap toggles completion. Long-press elsewhere on card opens detail sheet.

### 5.13 FAB (Floating Action Button)
- One per page at most.
- 56px circular, `--accent` bg, white icon.
- Position: `bottom: calc(--nav-height + --spacing-md); right: --spacing-md` (respects safe-area-inset-right).
- Used for: Dashboard (add task), Calendar (add event), Kitchen (add meal / add item), Activities (start activity).
- Never used for: navigation, secondary actions, kid mode.

### 5.14 Bottom nav
- 5 slots max — never exceeded. Adding a slot requires retiring one.
- **Slot 1 (Home) and slot 5 (More) are locked**. Slots 2, 3, 4 are user-pickable from Kitchen / Calendar / Scoreboard / Rewards / Tracker via the Customize sheet (see §10.4 Nav buttons editor). Default order: `kitchen / scoreboard / rewards`. The two pages not picked into nav automatically populate the More menu.
- Height 68px + safe-area-inset-bottom.
- Frosted glass (`backdrop-filter: blur(14px)`).
- Active item: `--accent` color + slightly heavier stroke.
- Pages wire the nav via `initBottomNav({ navMount, activePage, sheetMount, getTheme, personOpts, currentPage, onPageRender })` — single helper that renders the bar + the More handler in one call and listens for `dr-nav-tabs-changed` events so the bar re-paints when the user reorders. Replaces the older two-step `renderNavBar` + `initNavMore` pattern (both functions still exist but should not be called separately by new code).

### 5.15 List group (iOS-style grouped list)
**Purpose:** Settings, person detail, category lists, any "many small options" surface.

```html
<div class="list-group">
  <div class="list-group__label">PROFILE</div>
  <div class="list-card">
    <div class="list-row">
      <div class="list-row__icon ic-blue">[svg]</div>
      <div class="list-row__body">
        <div class="list-row__title">Name</div>
        <div class="list-row__sub">Optional helper line</div>
      </div>
      <span class="list-row__value">Noah</span>
      <div class="list-row__chev">[chev svg]</div>
    </div>
    <!-- more rows -->
  </div>
  <div class="list-group__help">Optional footer helper text.</div>
</div>
```
- Row min-height 56px.
- Row icon tile: 30×30, `--radius-md`, `color: white` on one of the `--icon-*` tokens from §3.4. Semantic: `--icon-blue` identity/notifications, `--icon-teal` brand/system, `--icon-amber` points/stars, `--icon-purple` appearance/cosmetic, `--icon-rose` security/PIN, `--icon-green` active/availability, `--icon-gray` structural/history, `--icon-red` destructive.
- Rows inside `.list-card` share borders and rounded corners.
- Right side holds either a value string, a switch, or a chevron (never two at once except value+chevron).

**Chevron utility (`.chev`).** Used anywhere a row is tappable and leads to a detail page: List rows (`list-row__chev`), Card trailing slot when the whole card is a link (admin People list, admin task list, category rows). Always `color: var(--text-faint)`, always 20×20, always the same chevron-right SVG. Do not replace with a different glyph, do not tint with accent, do not animate. A chevron is the *only* trailing indicator allowed on a list-item row — it replaces "Edit" / "Delete" / "…" button clusters.

### 5.16 Switch
- 44×26, track `--border` (off) / `--accent` (on). Thumb white with shadow-sm.
- Label always to the left (in `list-row`). Never standalone.

### 5.17 Empty state
```html
<div class="empty">
  <div class="empty__icon">[svg]</div>
  <h3 class="empty__title">All caught up</h3>
  <p class="empty__body">Nothing left for today. Enjoy your evening.</p>
  <!-- optional CTA -->
</div>
```
Variants built into `renderEmptyState`: `all-done`, `free-day`, `future-empty`, `no-match`, `kid-done`, `kid-free`, `no-meal-planned`, `school-lunch-only`, `list-empty`, `all-checked-off`, `no-activities-yet`, `no-sessions-today`, `no-proposals`, `nobody-away`.

### 5.18 Loading skeleton
Predefined shapes: `skeleton-card-row` (avatar + 2 bars), `skeleton-card-grid` (3×2 grid), `skeleton-sparkline`, `skeleton-timer-ring`, `skeleton-calendar-cell`. Shimmer uses a single accent-soft gradient; never a custom animation.

### 5.19 Error state
```js
renderErrorState(root, {
  title: 'Couldn\'t load tasks',
  message: 'Check your connection and try again.',
  retry: () => location.reload(),
});
```
Never dumps raw error objects. Debug details available only in Admin → Advanced → Debug.

### 5.20 Toast
- 48px tall. Bottom-center on phone (`bottom: calc(--nav-height + 16px)`), top-right on tablet.
- Variants: success, info, error.
- Max 2.5s; non-blocking. Max 1 visible at a time; subsequent toasts queue.

### 5.21 Celebration
- Two approved celebrations: `sparkle` (ambient, 2s) and `confetti` (climactic, 4s with toast).
- Retired: victory overlay, emoji-rain, separate kid-celebration-toast.
- Reduced motion: both collapse to a single success toast.

### 5.22 Progress bar
- Height 8px (md), 4px (sm). Radius `--radius-full`.
- Fill uses `--accent`. Background `--surface-2`.
- Single component; Score card progress, store card progress, calendar density all share.

### 5.23 Form sheet pattern

**Status:** v2 (2026-05-10) — reframed from a single canonical anchor (Event Form) to a best-of-app composite. The form review on 2026-05-09 found that the Event Form's implementation diverged from §5.23 v1 (no sticky footer, raw `<input type="date">`, magenta default focus rings on text inputs). Anchoring blindly on the Event Form would have copied those flaws into every other form. v2 anchors each pattern on its best in-app implementation today, codifies new mandates the v1 spec lacked (date input convention, disabled save state, active-state palette, CSS prefix policy), and lists the spec drift items explicitly. See §15 changelog for the full rationale.

**Scope:** Every form sheet in the app — task, event, recipe, reward, badge, person, category, list, item/staple/bulk, meal plan picker, theme picker, message form, bonus-day grant, and any future ones. Setup wizard is out of scope (separate flow, will be re-specced when redesigned).

**Companion section:** §5.24 Picker-list form pattern (form's primary interaction is picking from a library — meal plan, contacts). The §5.24 pattern shares the footer + sub-sheet conventions defined here but skips the structured-data fields.

#### Canonical anchor map

The pattern is composite — different in-app implementations are the reference for different concerns. When building or fixing a form, anchor each piece on the named reference.

| Concern | Anchor (in-app reference) | Notes |
|---|---|---|
| Sticky footer (Cancel + primary) | Meal Plan `kp-footer` | The only form with the working pattern today; generalize to shared `fs-footer` |
| Date input | Meal Plan `kp-date-btn` + hidden `<input type="date">` + `.showPicker()` | Replaces every raw `<input type="date">` in the app |
| Time input | Event Form 6-element AM/PM picker | Already correct; promote to shared `renderTimeInput()` |
| Inline reveal (Notes / Location / Options) | Event Form `ef2-field-reveal` | Solid-border active state (NOT solid-black-fill) |
| Sub-sheet stacking | Event Form Repeat / Photo / iCal sub-sheets | Single shell; ✕ OR Cancel button — not both |
| Switch toggle (always-on/off binary) | Category form `.form-toggle` (§5.16) | Replaces every chip-toggle that pretends to be a switch |
| Helper text | Category form `form-hint` | Promote to shared `fs-helper`; CSS only, no inline `style=""` |
| Title row + AI affordances | Event Form `ef2-title-row` | Wand + photo + iCal icons (where applicable) |
| Person chips | Event Form `ef2-person-chip` | State machine: unselected / primary / attending |
| Form state preservation | Event Form `captureFormState()` | Inner function serializes live form before sub-sheet open |
| Inline child-form | Meal Plan + Event Form close-delay-open | Used for `+ New recipe` and similar create-from-picker flows |
| Edit-mode delete zone | Event Form `ef2-delete-zone` | Below sticky footer, inline confirm |

#### Architecture split

- **HTML generator** in `shared/components.js`. Pure function, returns a string. Signature: `renderXForm({ existing?, mode: 'create'|'edit', ...context })`. No DOM access.
- **DOM wiring** in page-level JS. Mounts via `taskSheetMount.innerHTML = renderBottomSheet(html)`, attaches listeners, manages state, calls Firebase writes.
- **CSS prefixes:** shared primitives use `fs-` (form-sheet). Per-form prefixes (`ef2-`, `tf-`, `kr-`, `kp-`, `cf-`, `ki-`, `ks-`, `kb-`, `kl-`, `ps-`, `cpick-`) stay where they are — don't churn working CSS — but new code uses `fs-` for shared and per-form prefix only for genuinely unique classes.

#### Vertical structure (top-to-bottom)

```
sheet__header             ← title + ✕ + (✓ + 🗑️ in edit mode)
<prefix>-title-row        ← large input + AI icons (create mode only)
<prefix>-import-feedback  ← AI loading/error inline (reserves space; min-height)
<prefix>-divider          ← 1px hairline
<primary fields section>  ← date/time, condition+threshold, ingredients, etc.
<prefix>-divider
<prefix>-for-section      ← "For" label + person chips (where applicable)
<prefix>-divider
<prefix>-secondary-row    ← + Notes / + Location / + Options chips
<prefix>-field-reveal × N ← progressive disclosure
fs-footer                 ← STICKY: Cancel + labeled primary action (universal)
<prefix>-delete-zone      ← edit-mode only, below sticky footer
```

#### Padding rules

- **Form sections have NO horizontal padding.** `.bottom-sheet__content` already supplies the single layer of `var(--spacing-md)`. Adding more on each section double-indents content and the title sits flush-left while everything else is squeezed inward. Use vertical padding only.
- Title row: `padding: var(--spacing-xs) 0`.
- Other sections: `padding: var(--spacing-sm) 0`.
- Padding above and below each section should match (no asymmetric gaps between visual blocks).

#### Sticky footer (the `fs-footer` rule — universal)

**Every form sheet must have a sticky footer with Cancel (ghost) + labeled primary action (filled).** No exceptions. The header save-icon (✓) and delete-icon (🗑️) stay where they are; the footer button complements, not replaces, them. The footer breaks out of `.bottom-sheet__content`'s padding to span edge-to-edge AND sticks to the bottom of the scrollable container.

```css
.fs-footer {
  position: sticky;
  bottom: 0;
  margin: var(--spacing-sm) calc(-1 * var(--spacing-md)) calc(-1 * var(--spacing-lg));
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  gap: var(--spacing-sm);
  z-index: 1;
}
.fs-footer .btn { flex: 1; }
```

- Negative side+bottom margin breaks out of `.bottom-sheet__content` padding.
- Footer's own padding restores the right indent.
- `bottom: 0` (NOT a negative value) — sticks to the visible bottom of the scrollable container.
- `safe-area-inset-bottom` for notched devices.

Existing per-form footer classes (`ef2-footer`, `kp-footer`) remain valid where present; they all map to the same CSS via shared rules. New forms use `fs-footer` directly.

#### Disabled save state (universal)

The primary save action reflects the `disabled` attribute on every field-input event:

- Required fields empty → `disabled="true"`, `opacity: 0.5`, `pointer-events: none`.
- Required fields filled → `disabled="false"`, `opacity: 1`.

Apply to BOTH the header ✓ icon AND the footer primary button so they stay in sync. The shake-on-required-empty pattern (defined under "Validation" below) stays as a backstop for users who tap a disabled control anyway, but the visible disabled state is the primary signal.

#### Saving spinner

Show a spinner inside the primary button when the save involves async work that may take time:

- AI worker calls (wand parse, photo import, URL import) — always.
- Image uploads — always.
- Network writes that may take >150ms — always.
- Pure local Firebase writes (`firebase.database().ref(...).update(...)`) — NOT required (typically <50ms; spinner flickers).

Spinner pattern: replace button text with `<span class="spinner spinner--sm"></span> Saving…` for the duration. Re-enable on completion or error.

#### Active states (TWO total — never invent a third)

1. **Purple-filled** — segmented controls (rotation pills, Slot picker, type segments, Auto/Either/Manual). Background = `--accent`, text = white. Used when the control is "pick exactly one of these" AND the choices are shown as adjacent equal-weight options.
2. **Solid-border** — chip-toggles and inline-reveal triggers (`+ Notes`, `+ Location`, `+ Repeat`, `All day`, `+ Options`, `+ Advanced`, `+ Pricing help`). Dashed border off → solid border (same color) on. Background unchanged. **No solid-black-fill.** The current Reward/Task implementations using solid-black-fill on these chips violate this rule and are scheduled for fix.

If a binary control's semantic is "always on / always off" (a toggle, not a reveal), use the `.form-toggle` switch (§5.16), not a chip-toggle. Reward "Approval required" and Task "Exempt from scoring" are currently chip-toggles but should be switches.

#### Selection states (TWO total — never invent a third)

1. **Card border + ✓ check** — grid pickers (emoji grid, color swatch grid). Selected cell gets a 2px border in `--accent` plus a small ✓ overlay. No competing "preview tile + grid" double pattern.
2. **Bold underline / inline check** — list pickers (recipe rows, condition lists). Selected row gets a left ✓ check and slightly-bolder text.

#### Date input convention (replace every raw `<input type="date">`)

Always use the Meal Plan pattern. The visible control is a styled pill button; the native input is hidden and triggered programmatically.

```html
<button type="button" class="fs-date-btn" id="myDateBtn">
  <span id="myDateLabel">Sun, May 10</span>
</button>
<input type="date" class="fs-date-hidden" id="myDateInput" value="2026-05-10">
```

```js
btn.addEventListener('click', () => {
  if (typeof input.showPicker === 'function') input.showPicker();
  else input.focus();
});
input.addEventListener('change', () => {
  label.textContent = formatDateShort(input.value);
});
```

Same rule applies to Reward "Expires", One-Time task date, Event date, Badge date conditions, recipe cook-date, etc. **Never expose `<input type="date">` as the visible control.**

#### Time input

Use the existing 6-element AM/PM pattern from `renderEventForm` — hour input + AM/PM button + arrow → repeat for end time. Helpers `ef2ParseTime`, `ef2HourOpts`, `ef2MinOpts`, `ef2AmPmOpts` exist in `shared/components.js` — reuse them. **Never use `<input type="time">`.**

#### Inline pickers

For any "tap to reveal a small selector inline" interaction (date pill expanding to a calendar, time pill expanding to AM/PM controls, day-of-week pill expanding):

```css
.fs-picker-wrap { max-height: 0; overflow: hidden; transition: max-height 0.2s ease; }
.fs-picker-wrap.is-open { max-height: <enough-for-content>; }
```

Multiple pickers in the same section are mutually exclusive (opening one closes the others).

#### Person chip state machine

- **Unselected:** gray chip, color dot before name (uses `--chip-color` per-chip CSS var set via JS).
- **Primary** (`data-state="primary"`): solid fill in person's color, white text.
- **Attending** (`data-state="attending"`): outlined in person's color, person color text.
- **Family chip** (`.<prefix>-person-chip--family`) uses `--accent`, lives next to the section label. **Optional per form** — Task and Badge don't need primary/attending distinction so a Family chip is a quick "all family" shortcut. Adding a Family chip to a form that lacks one is a feature decision tracked in ROADMAP, not a polish blocker.
- Click rules: unselected → primary if no primary set, else attending. Attending → primary (demote old). Primary → deselect (promote first attending).
- Set `--chip-color` after mount: `chip.style.setProperty('--chip-color', chip.dataset.personColor)`.
- Container is `flex-wrap: nowrap; overflow-x: auto` with a `mask-image` fade gradient on the right edge for scroll affordance. Hide scrollbar.

For forms with multi-select but no primary/attending semantics (Task assignees, Badge "Visible to"), the chip primitive accepts a `mode: 'multi'` flag that disables the primary/attending state machine and uses simple selected/unselected.

#### Add chips (Notes / Location / Repeat / Options / etc.)

- Dashed border when off, solid border when active. **Same color either way (no big visual weight change).** Solid-black-fill is forbidden.
- Toggle the reveal: tap once to open and focus, tap again to close. The ✕ button inside the reveal is a secondary close path.
- `min-height: 32px`, `padding: 4px 10px`, `font-size: var(--font-sm)`. Compact — these are not primary actions.

#### Title input focus

`outline: none; box-shadow: none; border-color: transparent;` on `:focus`. The input is large enough that browser focus chrome reads as visual noise. Validation failure uses a shake animation + bottom-border in `--danger`.

#### Icon button focus

`outline: none; background: var(--surface-2); color: var(--text);` on `:focus-visible`. **Not** an outline ring — that lingers visibly when the icon's sub-sheet opens on top of the form and looks broken.

#### Text input focus (no browser default ring)

`.bottom-sheet input:focus, .bottom-sheet textarea:focus { outline: none; box-shadow: none; }` (or scoped equivalent in form CSS). Per-input focus is signaled by background tint or no chrome at all. **Browser default focus rings (the magenta default on Android Chrome, the blue ring on iOS Safari) are explicitly forbidden inside form sheets.** Audit at PR time.

#### Validation

- Required fields: pulse-shake animation + red bottom-border. Don't show inline error text; the shake plus the visible disabled-save state is enough.
- No `window.confirm` or `window.alert`. Use inline confirm patterns (e.g. delete zone with "Delete this? [Delete] [Keep]" buttons that toggle visibility) or the shared `showConfirm()` helper.

#### Sub-sheet stacking (when a form opens another sheet)

Use a SECOND overlay (`<form-prefix>-subsheet-overlay` appended to `document.body`) on top of the existing bottom-sheet, NOT a navigation push. The Repeat sub-sheet, Photo source picker, and iCal URL prompt all use this pattern. Animate up from bottom; close removes from DOM after the transition. Returning to the parent form re-mounts via `openXForm(existingId, savedFormState)` — see "Form state preservation" below.

**Sub-sheet shell rules:**
- ✕ in the header is the dismissal control. **Don't add a `← Back` link AND a Cancel button** — pick one (Cancel button in footer if the sheet has a confirmation step; ✕ alone if dismissal commits nothing).
- Footer follows the same `fs-footer` pattern as the parent — Cancel + primary action where confirmation is needed.

#### Form state preservation across sub-sheets

Inner function `captureFormState()` serializes the live form to a plain object before navigating to a sub-sheet. On return, the parent form re-renders with `existingId` and `savedState` so the user's in-progress edits don't vanish. Capture EVERY field including transient UI state (`notesOpen`, `isFamilyMode`) — fields that only exist in DOM state will be lost on round-trip otherwise. The renderer's input object accepts these transient flags as overrides (`event.notesOpen ? ' is-open' : ''`).

#### AI integration in forms

- Inline NL parse (magic wand): single tap → fills fields. Show error inline below the title for ~3s then fade. Use a stored `errDismissTimer` so a second tap clears the first timer (don't clobber a fresh error with a stale timeout).
- Photo / URL / file imports: open a picker sheet. Optional context input above the source buttons — pre-fill from the title field if non-empty. The context goes to the AI as `input.context` and the prompt must be designed to honor it.
- Heuristic-only on auto-runs (free, instant). AI on explicit user action (wand button, import tap). See §13.13 "Form authoring recipe" for the full pattern.

#### Edit-mode delete zone

Below the sticky footer, separated by a visible gap. Destructive red text style. Tap reveals inline confirm (`Delete this event? [Delete] [Keep]`) — never a separate sheet, never `window.confirm`. On error, route message through the same `import-feedback` slot the save errors use.

#### Inline child-form (when a form has a "+ Create new" shortcut)

When a picker or form contains a `+ New X` action that needs to create a new item from scratch, open the child form in the same `taskSheetMount` — do NOT navigate away to another page. Pattern:

```js
document.getElementById('createRecipeBtn')?.addEventListener('click', () => {
  const day = document.getElementById('day')?.value;
  const slot = document.getElementById('slot')?.value;
  closeTaskSheet();
  setTimeout(() => openChildForm((newId) => {
    setTimeout(() => openParentForm(slot, day, newId), 320);
  }), 320);
});
```

- The 320ms gap is the sheet animation budget — don't skip it.
- The child `onSave` callback receives the new ID; pass it back to the parent as a pre-selection argument.
- If the child form already exists in another page's JS (e.g. `openRecipeForm` in `kitchen.js`), copy it as a page-local function rather than navigating. The copy uses `taskSheetMount` and `closeTaskSheet()` instead of the source page's mount/close pattern.
- The child form does NOT need a `savedState` round-trip because the parent form re-opens fresh — no state to preserve.

#### Shared primitives target (Phase 1 of form-system initiative)

Target architecture: every form composes from these primitives. They live in `shared/components.js` (renderers) and `styles/components.css` (CSS, `fs-*` prefix). Until built, the list documents the target. Existing per-form copies stay in place during migration — replace incrementally (Phase 3).

| Primitive | Anchor today | Status |
|---|---|---|
| `renderFormFooter({ saveLabel, cancelId, saveId, disabled })` | Meal Plan `kp-footer` | Shipped 2026-05-10 |
| `renderFormSheetHeader({ title, closeId, saveId?, deleteId? })` | Event Form `sheet__header` | Shipped 2026-05-10 |
| `renderDateInput({ btnId, inputId, labelId, value, label })` + `bindDateInput({ btnId, inputId, labelId, format })` | Meal Plan `kp-date-btn` | Shipped 2026-05-10 |
| `renderTimeInput({ idPrefix, startTime, endTime })` | Event Form 6-element picker | Shipped 2026-05-10 |
| `renderChipPicker({ pickerId, hiddenId, options, value, allowClear })` + `bindChipPicker({ pickerId, hiddenId, onChange })` | Meal Plan slot segmented + `.tabs.tabs--pill` | Shipped 2026-05-10 |
| `renderEmojiPicker({ pickerId, hiddenId, value, emojis, allowCustom })` + `bindEmojiPicker({ pickerId, hiddenId, onChange })` | New (no consistent in-app reference) — selection = card border + ✓ overlay per §5.23 v2 | Shipped 2026-05-10 |
| `renderColorButton(selected, inputId)` + `initColorButton(container, onChange)` | `cpick-` (Person/Category/Event forms) | Already shipped (pre-existing) — documented as canonical 2026-05-10 |
| `renderPersonChips({ people, mode: 'multi'\|'primary-attending', value })` | Event Form `ef2-person-chip` | Deferred — extraction requires also moving the unselected/primary/attending click-rules state machine, which is bigger scope than the primitives initiative. Existing `ef2-person-chip` usage continues to work; promote to shared helper when a new form needs the state machine. |
| `renderSwitchToggle({ id, checked })` | Category `.form-toggle` (§5.16) | Shipped 2026-05-10 |
| `renderHelperText(text, { error?, id? })` | Category `form-hint` | Shipped 2026-05-10 |
| `renderInlineReveal({ id, isOpen, children, closeLabel })` | Event Form `ef2-field-reveal` | Deferred — YAGNI. `ef2-field-reveal` works inline today; no consumer outside Event Form / Task Form needs the shared helper. Promote when a new form needs the same reveal pattern. |
| `renderFormSubSheet({ title, children, onCancel, onConfirm, confirmLabel })` | Event Form Repeat sub-sheet | Replaced by per-flavor sub-sheet helpers — `openIcalUrlSubsheet`, `openEventPhotoSourceSheet`, `openRepeatSubsheet`. A fully generic primitive isn't needed; each flavor has different button labels / confirmation needs. |

#### Spec drift acknowledgements (v1 → v2)

The previous version of §5.23 described the Event Form as "the canonical reference." The implementation diverged. This revision corrects:

- **Sticky footer** — v1 required it on Event Form; implementation lacks it. v2 mandates `fs-footer` on every form. Event Form must add one (Phase 2 of initiative).
- **Family chip** — v1 described `.ef2-person-chip--family` as part of the canonical Event Form; implementation has none. v2 marks Family chip as **optional per form**, with its style still documented above for forms that choose to include one. Adoption per form is tracked in ROADMAP, not as a polish blocker.
- **Magenta focus outline** — v1 ruled out outline rings inside forms; implementation showed a magenta default-browser ring on the Location input. v2 adds an explicit text-input focus rule + grep audit at PR time.
- **Native `<input type="date">`** — v1 implied an inline date picker; implementation exposed the OS native input through `ef2-picker-wrap`. v2 adopts Meal Plan's pill + `.showPicker()` pattern as the universal date convention.
- **Active chip state** — v1 said "no big visual weight change" for active chips; implementation went solid-black-fill on `+ Notes` / `+ Location` / `+ Options` / `Approval required`. v2 forbids solid-black-fill explicitly and lists the two allowed treatments.

#### Don'ts (consolidated)

- ❌ Don't ship a form sheet without a sticky `fs-footer` (Cancel + labeled primary action).
- ❌ Don't ship a primary save action without a visible `disabled` state when required fields are empty.
- ❌ Don't expose raw `<input type="date">` as the visible control — use the `fs-date-btn` pattern.
- ❌ Don't use `<input type="time">` (the wheel) — use the 6-element AM/PM picker.
- ❌ Don't use solid-black-fill for chip-toggle active state — solid border, same color.
- ❌ Don't invent a third "active" or "selected" treatment beyond the two allowed.
- ❌ Don't use a chip-toggle when the semantic is a switch (always-on/always-off binary) — use `.form-toggle` per §5.16.
- ❌ Don't add horizontal padding to form sections — `.bottom-sheet__content` provides it.
- ❌ Don't use outline rings on focus inside the form — use background tint or no chrome.
- ❌ Don't show the browser default focus ring on text inputs — explicit reset required.
- ❌ Don't push a new bottom-sheet for sub-flows; stack with `<prefix>-subsheet-overlay`.
- ❌ Don't add a `← Back` link AND a Cancel button to a sub-sheet — pick one.
- ❌ Don't lose form state when navigating to a sub-sheet — `captureFormState` + `savedState` round-trip is required.
- ❌ Don't put inline `style=""` in HTML — set CSS vars via JS or use a class.
- ❌ Don't reuse another form's prefix for unrelated styles — `fs-` for shared, per-form prefix only for genuinely unique classes.
- ❌ Don't navigate to another page to open a child form — use the inline close-delay-open callback pattern.

---

### 5.24 Picker-list form pattern

Use this pattern when the form's primary interaction is **picking from an existing library** (recipes, contacts, locations) rather than filling structured data fields. Simpler than the Event Form — no sub-sheets, no captureFormState, no time picker.

**Reference implementation:** `openPlanMealSheet()` in `kitchen.js` + `openMealPlanSheet()` in `dashboard.js`. CSS classes (`kp-*`) live in `styles/components.css` — available on all pages.

**Vertical structure:**
```
sheet__header             ← title + ✕ close (ef2-icon-btn)
kp-day-slot-row           ← optional context selectors (date, slot, category)
  kp-date-wrap            ← kp-date-btn (visible label) + hidden <input type="date">
kp-meal-section           ← search area
  kp-meal-header          ← field label + secondary ghost action ("+ New recipe")
  <input id="kp_search">  ← search/type-any-name input
recipe-pick-list          ← scrolling item list  (id="recipePick")
  recipe-pick__item       ← row wrapper
    recipe-pick__row      ← tappable name row, .is-selected when chosen
    recipe-pick__fav-btn  ← star icon, .is-fav when active
kp-footer                 ← Cancel (ghost) + Save (primary, disabled until selection)
```

**Date button:** `kp-date-btn` shows a formatted label. Tap triggers the hidden `<input type="date">` via `.showPicker()` (fallback `.focus()`). `change` event updates the button label.

**Selection state:** Clicking an item sets `is-selected` + shows a ✓ checkmark. Re-tapping a selected item deselects it and clears the search field. Only one item selected at a time.

**Default list (no search filter):** Favorites pinned at top, then the 3 most-recent non-favorites. `getRecipeEntries()` sorts by `lastUsed` only — do NOT sort favorites-first inside `getRecipeEntries` or you lose recency ordering for search results.

**Search behavior:** When a filter string is active, show all matches sorted by `lastUsed`. If nothing matches, show `recipe-pick__none` with "No match — will save as '{typed}'" and enable Save — this lets the user create an ad-hoc entry without a library ID.

**Save logic:**
1. If `selectedRecipeId` is set → write `{ recipeId, source: 'manual' }` and update `lastUsed` on the recipe.
2. If typed text matches an existing recipe name (case-insensitive) → treat as pick (set `recipeId`).
3. Otherwise → write `{ customName: typed, source: 'manual' }`.

**`+ New X` action:** Ghost button in `kp-meal-header`. Opens a child form inline using the close-delay-open pattern from §5.23. On save the child callback re-opens this picker with the new item pre-selected via `preRecipeId` arg.

**Don'ts for this pattern:**
- ❌ No `sheet__content` wrapper — `kp-*` sections sit directly in the rendered bottom-sheet.
- ❌ No slot tabs — use a `<select>` for slot/category selection.
- ❌ Don't sort favorites-first in `getRecipeEntries` — sort by `lastUsed` only; favorites pinning belongs in `buildRecipeRows`.

---

## 6. Per-area specs

Each area lists: current contents, expansion plan, layout rules, component usage. Cross-form-factor notes are included; every area must work on phone, tablet, and kiosk unless explicitly excluded.

### 6.1 Dashboard (`index.html`)

**Purpose:** The family's "what do I do right now" screen. Final-form spec: [docs/superpowers/specs/2026-04-25-dashboard-final-design.md](../superpowers/specs/2026-04-25-dashboard-final-design.md).

**Layout (top to bottom, phone) — 8 sections:**
1. **Header** — title `Home` (or `{PersonName}` in person-link mode) + subtitle `Sunday, April 19`. Right: Bell + overflow (max 2 icons).
2. **Banner slot** — single `.banner`, priority queue (vacation > freeze > overdue > multiplier > info). At most one visible. Renders zero pixels when empty.
3. **Back-to-Today pill** — only when `viewDate !== today`. Sits between Banner and Ambient strip (stable position regardless of ambient state).
4. **Ambient strip** *(user-toggleable via `settings.ambientStrip`; default `false` until 1.3+1.4 ship, default `true` thereafter)* — 2-up chip row: Weather + Tonight's Dinner. `viewDate`-aware (swipe-to-tomorrow shows tomorrow's forecast and meal). SVG glyphs in chip leading icons (no emoji in chrome).
5. **Coming up rail** *(3.3)* — collapsed by default: `Coming up · N events this week` / `Coming up · clear week`. Expands inline to day-blocks (today excluded; events-only count, no task summaries). Tapping a day-block head jumps `viewDate`. Persists state in `localStorage['dr-coming-up-state']`.
6. **Events section** — `.card.card--event` list (events before tasks). Tap = detail sheet; long-press 800ms = same.
7. **Today section** — `.card` task list. Flat sort: incomplete (owner → late-today → TOD → name), completed (owner → TOD → name). Section meta carries score chips when filter set to one person: `X of Y done · NN pt · GRADE`. `pt` = store-economy points (today's percentage × multiplier). When filter = All, meta = `X of Y done` only. `settings.showPoints` and per-card scoring-point chips removed.
8. **FAB** + **Bottom nav** — FAB pre-fills `viewDate` and `activePerson`. See [ROADMAP.md](../ROADMAP.md) Nav Bar section for current slot assignments.

**Tablet:** two-pane. **Left pane** (~520px) = action surface (Header + Banner are full-width above; left pane has Today section + filter chip). **Right pane** (~380px) = day's context (Ambient strip 1-up vertical → Coming up always-expanded → Events). FAB lives bottom-right of the right pane.

**Kiosk:** dashboard doesn't exist; kiosk uses its own `display.html` week-grid layout. Dashboard sections reflect onto kiosk per the reflection table in the final-form spec §2.4.

**Dinner widget tap:** opens the shared meal detail sheet (`renderMealDetailSheet` from `shared/components.js` — the same `rd-*` component used by the Recipes tab, the Calendar day sheet, and Kid mode). Full visual parity with the Recipes tab: hero image, Prep/Cook/Total times block, servings stepper that scales ingredients, Chef's notes + Family notes blocks, footer with `Start cooking` (launches the shared `openCookMode`) · `Add to list` · `Change meal`. Edit pencil + remove-from-plan trash live in the header icon row. The full spec for this sheet lives in §6.10 Kitchen → Recipe detail sheet — the dashboard widget is just a different entry point.

**Backlog integration:**
- **Kitchen (1.3+1.7):** dinner chip lands in the ambient strip; "Plan a meal" item joins the FAB add-menu. Never a full meal section here; full meals and shopping live in `kitchen.html`.
- **Weather (1.4):** weather chip lands in the ambient strip; chip is `viewDate`-aware via 7-day forecast.
- **Vacation (2.4):** `--vacation` banner variant in the priority queue while any person is away.
- **Push notifications (2.1):** bell badge updates.
- **Activities (1.6):** running session surfaces as `--info` banner sub-variant in the priority queue. Banner persists across Scoreboard + Tracker (see §7.3).
- **Task Timer (3.1):** start button inside task detail sheet, not dashboard directly.
- **Delegation (3.2):** bell shows pending proposals; detail sheet has "Propose trade".
- **Loading skeleton (3.0):** card-shaped skeletons replace the inline spinner on first paint.

**Banned on dashboard:**
- Weather forecast cards ≥ 2 rows (that's a weather app, not a hub).
- Meal cards beyond a 1-chip strip.
- Activities summaries (go to Activities page).
- Shopping preview (goes to Kitchen).
- Gradient text, raw colors, theme/debug icons in header.
- Rotation subheaders (Daily/Weekly/Monthly) in Today section — flat list rule.
- Score chips when filter = All (the "whose number" problem).
- Emoji in ambient chip leading icons (SVG only — chrome rule).

### 6.2 Calendar (`calendar.html`)

**Views (Tabs):** Month, Week, Day.

**Phone defaults:**
- **Default view:** Week (vertical agenda).
- **Week view:** scrollable vertical list of day blocks. Each block: day-head (num + day-of-week + optional Today pill + weather) → compact event/task/meal cards → empty state if nothing.
- **Day view:** single-day detail as shown in `mockups/02-calendar-day.html`. Events → Tasks → Meals sections. Person filter chips above.
- **Month view:** hidden on phone (<600px). Available as Tabs option but renders a simple "Use Week or Day on phone" empty state on mobile. Month becomes the default on tablet/kiosk.

**Day cell content order (consistent across views):**
1. Events (time-sorted)
2. Tasks (grouped: Events → Monthly → Weekly → One-Time → Daily — note: different from dashboard order, intentional; calendar emphasizes uncommon recurrences first)
3. Meals (Breakfast → Lunch → Dinner, school-imported tagged)
4. Activities log (read-only summary, if any)
5. Vacation shading stripe (if any person away)

**Header:** title `Calendar` + subtitle month range. Right: search + bell (max 2 icons, same cap as dashboard — overflow lives inside the FAB's add-menu sheet or admin, not the header).
**Sub-bar:** View Tabs (centered).
**Day/Week nav:** prev/next chevrons + date label (centered). Swipe left/right also navigates.
**Filters:** person chips below nav. On phone, collapse into a "Filter" sheet trigger when > 4 people.

**FAB:** add event (sheet with type selector first). Meal planning lives in `kitchen.html`.

**Forms:**
- Event form: shorter than task form. Title, When, Who, Notes, Recurrence. Progressive disclosure.

**Backlog integration:**
- **Kitchen (1.3+1.7):** Meals section in day view (read-only). School-imported: `--accent-muted` tag. Full meal management and shopping lists live in `kitchen.html`.
- **Weather (1.4):** chip in header + per-day chip in week view, full strip in month header on tablet.
- **Recurrence (2.2):** extends Event/Task form. Preview of next 5 occurrences inline.
- **Vacation (2.4):** shaded stripe per person per day.
- **School lunch (2.3):** meals tagged `source: school`, read-only, `tag--school`.

**Banned on calendar:**
- Two density modes. Pick cozy; remove snug.
- `overflow:hidden; height:100dvh` on the page.
- Separate density controls per view.

### 6.3 Scoreboard (`scoreboard.html`)

**Top-level Tabs:** Tasks | Activities. (Activities ships with 1.6; until then, single-view.)
**Period Tabs (second level):** Week | Month | Year.

**Sections (within Tasks tab):**
1. Leaderboard (`.card.card--score` list, grade badge in trailing slot).
2. Grades: phone = one row per person, tap for drilldown sheet. Tablet = grid.
3. Trend sparklines (one per person; generous whitespace; single accent color).
4. Category breakdown (stacked bar, color swatches + text; emoji only on task level).
5. Streaks list (same `.card` component).
6. Rewards Store entry (CTA to Store sheet).
7. Achievements badge strip.

**Activities tab (1.6):** reuses Leaderboard, trend, category components — computed from activity sessions instead of tasks.

**Rewards Store sheet:** opens from Scoreboard. Categories tabs (Custom | Functional | Bounties) → `.card.card--reward` list → detail sheet. Approval flow uses showConfirm modals.

**Banned on scoreboard:**
- `sb-period-tabs` and any other bespoke tab styles — use `.tabs`.
- Separate "activities leaderboard" page.
- Emoji in leaderboard slot; emoji in category legend.

### 6.4 Tracker (`tracker.html`)

**Top-level Tabs:** Tasks | Activities (when 1.6 ships).
**Period tabs:** Week | Month.

**Content:** status rows grouped by rotation. Each row uses `.card` with `--task` (or `--activity`) variant, 56px min-height. Whole row tappable; long-press (500ms) opens detail sheet.

**Filters:** single "Filter" chip → sheet expands with person / category / status / rotation / completed. Defaults collapsed.

**Backlog integration:**
- **Activities (1.6):** second top-level tab for goal tracking.
- **Vacation (2.4):** rows within vacation ranges tagged "On vacation — excluded".
- **Recurrence (2.2):** small recurrence-type tag in meta row.

### 6.5 Admin (`admin.html`)

**Top-level sections (5, not 11):**
1. **Library** — Tasks | Events | Categories *(| Activities when 1.6 ships — Meals/Shopping moved to `kitchen.html`)*
2. **People** — People | Schedule
3. **Rewards** — Rewards | Badges
4. **Settings** — Family | Scoring | Appearance
5. **Advanced** — Data | Debug *(| Imports when 2.3 ships)*

Header: back chevron + `Admin` title + search. Section switcher: horizontal pill Tabs (one row, scrolls if needed, but 5 fits comfortably). Sub-tabs within each section.

**People list:** `.card` per person (`mockups/04-admin-people.html`). Avatar + name + identity pills + ONE chevron. No action-button soup. Tap opens Person detail (`mockups/05-admin-person.html`) as a full page.

**Person detail:** hero (avatar + name + 3 stat tiles) + iOS-style grouped list: Profile, Points & rewards, Notifications, Availability, Danger zone.

> **Token note:** hero text (person name, kid-mode greeting) should NOT default to `--font-2xl` — that token was rescaled to 24px for the dashboard header title on 2026-04-24. Future mockup ports should either define their own hero-text token or use `--font-3xl` (36px) scaled down contextually.

**Tasks / Events / Categories / Rewards / Badges / Activities library:** same pattern — row list with one chevron per row. Tap for detail page. Inline "Add X" row at bottom of list. (Meal library managed from `kitchen.html`, not Admin.)

**Settings:**
- **Family:** family name, timezone, week start, admin PIN, session timeout, location, temperature unit.
- **Scoring:** difficulty multipliers (sliders, 1–10), weekend weight, past-due credit %, weighted-category percentages.
- **Appearance:** theme swatch row, dark mode follow-system / force-light / force-dark, dashboard ambient toggles (weather chip, dinner strip, confetti), density preference.

**Advanced:**
- **Data:** export JSON, import JSON, clear snapshots, reset (PIN-gated).
- **Debug:** event log viewer, Firebase connection status, SW version, cache flush. Themed (no hardcoded colors).
- **Imports (2.3):** school lunch PDF upload with preview sheet before writing.

**Backlog integration:**
- **Kitchen (1.3+1.7):** Meal library and shopping list management live in `kitchen.html`, not Admin. Admin has no Meals tab.
- **Activities library (1.6):** Library → Activities.
- **Vacation (2.4):** per-person in People detail → Availability.
- **Notifications (2.1):** per-person in People detail → Notifications + global in Settings.
- **PDF import (2.3):** Advanced → Imports.
- **Kiosk pairing (1.5):** Settings → Family → Kiosk.

**Banned in admin:**
- Inline styles in HTML.
- Hardcoded colors in debug panel.
- `window.confirm` / `window.alert`.
- > 5 top-level sections.
- Multiple action buttons shown next to an item's name in a list — always one chevron, actions live inside detail.

### 6.6 Kid mode (`kid.html?kid=Name`)

**Purpose:** Immersive, playful, single-child view with no admin access.

**Layout:**
1. **Kid header** — large avatar + "Good morning, {Name}". Fixed `⚙ gear` top-right (parent escape, always visible).
2. **Stats row** — 3 tiles: Points, Streak, Badges.
3. **Multiplier banner** (if active).
4. **Your tasks** — `.card.kid` rows.
5. **Today tiles** — 2-up grid: Dinner, Weather. Activity goal spans 2 cols with big Start button.
6. **Trophies** — horizontal scroll carousel.
7. **Bank** — unused saved rewards (when 3+).
8. **Messages** — unseen messages from parents (rewards, bonus, deductions).

**Parent escape:** `⚙` top-right opens PIN overlay. Long-press fallback on any non-interactive area. Triple-tap on avatar is an additional escape.

**Backlog integration (each has a reserved tile):**
- **Kitchen (1.3+1.7):** Dinner tile (Tonight's Dinner). Optional read-only shopping peek if a parent marks the list kid-visible.
- **Weather (1.4):** Weather tile, playful copy ("☀️ Sunny, 72°").
- **Activities (1.6):** Activity goal tile with Start button → opens shared timer.
- **Task Timer (3.1):** Start button inside task cards → shared timer.
- **Vacation (2.4):** Friendly "Vacation mode 🌴" tile when family is away.

**Kid component rules:**
- Kid components are modifiers, not parallel. Use `.card.kid`, `.tabs.kid`, not `kid-card`, `kid-week-tabs`.
- Single celebration system: sparkle (ambient) + confetti (climactic).
- Emoji allowed in user-authored content (task names, meal names, reward names) and celebrations. Never in kid UI chrome (nav, buttons, tabs, banners).
- Tap targets ≥ 56×56.
- Reduced motion: celebrations collapse to success toast.

**Banned in kid mode:**
- Four celebration systems; keep two.
- Parallel CSS ecosystem (600+ kid-specific classes). Use modifiers.
- Admin access, task editing, schedule editing, PIN change.

### 6.7 Rewards Store

The Store is a **first-class destination**, not an annex of the Scoreboard. Adults and kids see the same component, same tabs, same cards — only the post-Redeem flow differs (immediate vs approval-gated).

**Opens from (four routes, all into the same component):**
- **Rewards nav tab (phone) / left rail entry (tablet)** — *primary.* Direct navigation via the dedicated tab. Rewards earned its own tab slot; it is no longer in the More sheet.
- **Scoreboard balance card → "Open Store" CTA** — *contextual.* You're already looking at points; tapping through is natural.
- **Bell notification → deep-link** — *intent-specific.* Approval requests open the Approvals view, redemption outcomes open the relevant reward, bank arrivals open Bank. Bell is the notification surface; it steers into Store, doesn't duplicate it.
- **Kid mode → Store tile** — *kid home entry.* Unchanged.

**Layout (Sheet on phone, page on tablet):**
- Top: balance display (animated count-up).
- Tabs: Custom | Functional | Bounties | Wishlist | Bank.
- Each tab: `.card.card--reward` list. Tap opens detail sheet.
- Detail sheet: reward icon/name/price/description + "Redeem" button (primary).

**Flow:**
- Kid taps Redeem → parent approval via bell (custom rewards) OR immediate (functional rewards).
- Adult taps Redeem → immediate (no self-approval).
- Approved custom rewards go to Bank.
- Using from Bank: adults immediate, kids request via `use-request` message → parent approves.

**Audience parity rule:** The adult experience and kid experience must use the same card patterns, same tab order, same balance display. Audience-specific differences are **flow-level only** (approval gates), not **layout-level** (no separate adult-only Store page or kid-only tabs).

**Backlog integration:**
- New reward types plug into existing `rewardType` enum. No new UI patterns.
- Activities goal payouts (1.6) appear as regular reward cards once earned.

### 6.8 Setup wizard (`setup.html`)

**Purpose:** First-run only. 6 steps.

**Layout:**
- Fullscreen, no nav.
- Step indicator: 6 dots at top (1 active, others muted). Uses `.progress` dots, not a custom component.
- Content area centered, max-width 480px, vertical rhythm `--spacing-lg`.
- Footer: Back (ghost) | Next/Done (primary).
- Each step validates inline before Next enables.

**Steps:**
1. Family info (name, timezone).
2. People (add 1+ with name/color/role).
3. Categories (select defaults or customize).
4. Theme (swatch picker, preview).
5. Admin PIN (4-digit entry + confirm).
6. Finish (summary + "Take me home").

**Empty-state handling:** The first empty dashboard after setup greets the user with a friendly "Add your first task" CTA via `.empty` variant `first-run`.

### 6.9 Person-link mode (`person.html?person=X`)

**Purpose:** Home-screen shortcut PWA for one specific person. This is the **adult** per-person shortcut — kid mode (`kid.html`) is the restricted variant, not this one.

**Rule:** Visually identical to dashboard. The header title becomes the linked person's first name (`Noah`, `Kai`, …); the subtitle stays as the date line. **No second identity indicator** — title-becomes-name is the single cue. (The legacy `Viewing as {Name}` pill is retired as of 2026-04-25; title alone carries identity.)

**Parity with Home (non-negotiable):** the person shortcut must expose the same header/nav controls as `index.html`:
- Notification bell (with unseen-count badge and approval dropdown).
- Overflow menu with **Rewards**, **Admin**, **Theme** (plus Debug when enabled).
- Person filter chip (when the family has ≥ 2 people), so the adult can switch to another person's view.
- 5-slot bottom nav + FAB.

Person-specific behavior is limited to: title = person's name, saved filter persisted to `people/{id}/prefs/dashboard/personFilter`, and an optional per-person theme override. Anything else is a regression — do not add `!linkedPerson` guards around core controls.

**Shell parity:** `person.html` must include the same mount points as `index.html` (`#headerMount`, `#app`/`.app-shell`, `#fabMount`, `#navMount`, `#toastMount`, `#celebrationMount`, `#taskSheetMount`). Missing mount points cause `dashboard.js` to throw on `document.getElementById(...).innerHTML` and halt init.

### 6.10 Kitchen (`kitchen.html`, 1.3+1.7)

**Purpose:** Combined home for meal planning, recipe library, and shared shopping lists — supersedes the standalone 1.3 Meals and 1.7 Shopping backlog items.

**Identity:** Kitchen reads `?person=Name` like Dashboard does and resolves a `linkedPerson` from `people`. Used for rating attribution and (future) other per-person concerns.

**Layout:**
- Header: standard `Kitchen` header + bell + settings.
- Tabs row: `Meals | Recipes | Lists` (left-aligned, pill style) + a right-aligned **AI Tools wand button** (magic-wand icon, vertically centered with the tab text — the `.tabs` default `margin-bottom` is overridden to `0` inside `.kitchen-tabs-row` so flex centering aligns correctly). Wand opens the global `openKitchenAiToolsSheet` — a single sheet that owns every AI-driven action grouped into SCHOOL LUNCH / RECIPES / LISTS sections.
- **Tab visibility is user-customizable** via Customize → Kitchen → Kitchen tabs (toggles per tab; always keeps at least one visible; hidden active tab falls back to the first visible one).

**Meals tab:**
- Rolling N-day window starting today, where **N is user-configurable** via Customize → Kitchen → Meals tab → Days shown (3 / 7 / 14; default 7). No swipe pagination, no arrows, no week label — the day rows carry the dates.
- Each day-block: header row (`Mon May 11` + today pill when applicable + right-aligned `+` icon-button to add any slot via the picker) + slot rows for that day.
- **Slot row visibility is user-customizable** via Customize → Kitchen → Meals tab → Show empty slots as nudges (per-slot toggles for Breakfast / Lunch / School / Dinner / Snack; default: Dinner only). An *active* slot renders a `Plan ___ ›` empty-state CTA row even when nothing is planned; *inactive* slots only appear when a meal is actually planned. Dinner always renders last regardless of activation.
- Today's day-header has `--accent-soft` background.
- Slot row: 32×32 thumbnail (recipe `imageUrl` or 🍴 placeholder) + slot label + meal name. School-lunch slot labels are dynamic — `SCHOOL` when only one is planned, `SCHOOL 1` / `SCHOOL 2` when both. School nudge rows render once even when both `school-lunch` and `school-lunch-2` slots are empty (no double-rendering).
- `History ›` chip above the week strip opens `openMealHistorySheet` — last 30 days of dinners grouped by Monday-anchored week; tap a row with `recipeId` opens recipe detail.
- FAB: opens Plan-a-meal for today/dinner. Per-day `+` opens Plan-a-meal with no slot pre-selected. Plan-a-meal picker includes a single `School` option that auto-allocates to `school-lunch` or `school-lunch-2`. When School slot is chosen, a `+ Plan a second School option` chip stacks an inline second meal-select.
- **Multi-option meal voting:** `kitchenPlan/{date}/{slot}` is stored as an array of options. Lazy-migrate via `normalizePlanSlot` on read. See sub-sections below for the Plan-a-meal Single/Vote modes, the unified voting display rule, and the shared vote sheet.

### Plan-a-meal: Single / Vote modes

The Plan-a-meal sheet has two modes selected via a segmented control at
the top:

- **Single meal** (default): the existing one-meal flow.
- **Set up a vote**: a stack of 2-3 candidate rows. Each row is an
  independent meal picker (search + recipe list + custom-name fallback).
  `+ Add option 3` chip appears when both initial rows are filled; `×`
  per row removes (min 2). Save commits the array of filled candidates.

The segmented control is hidden when **School** is the selected slot —
school keeps its own dual-pick flow because the two school slots are
distinct slot keys, not vote options.

When opened on a slot that already has 2-3 voting options, Plan-a-meal
redirects to the vote sheet with a toast (`This slot has a vote in
progress — opening vote sheet.`). When opened with explicit
`initialMode: 'vote'` + `initialCandidates: [...]` from the vote sheet's
`+ Add another option` flow, Plan-a-meal pre-fills the candidate rows.

### Voting display rule

Wherever a slot's content is summarized (dashboard tile, Meals tab row,
calendar day sheet), voting state shows a single consistent indicator:

- 1 option (or no voting): meal name, unchanged.
- 2-3 options: `👍 Vote · N options`.

Per-option names are not shown in summaries — recipe names are routinely
too long to fit two side-by-side on a phone tile. The vote sheet itself
is the only surface that lists candidates with their tallies.

### Vote sheet

A shared `openVoteSheet({ ... })` opener in `shared/components.js` is
called from every entry point: kitchen Meals tab, dashboard dinner tile,
calendar day sheet. No more navigating to `kitchen.html` to vote.

The sheet self-labels as `Vote — {Slot} · {Day}` in its header. The
`+ Add another option` chip is promoted to a full-width primary button
when only 2 options are visible (to encourage adding a 3rd before voting
begins). Lock-in is gated by `showConfirm` to prevent accidental
single-tap commits.

**Recipes tab:**
- Sticky search input at top filters the library on every keystroke.
- Library cards: leading thumbnail + recipe name + chip line: rating (filled `★` icon + numeric avg, or empty `☆` when unrated) · **total time** (`recipeTotalTime` = prep + cook minutes, formatted by `formatRecipeTime` — falls back to whichever side is set when only one populated; chip omitted entirely when neither parses) · last-cooked (`formatLastCooked`). Tap a card → recipe detail. Tap the rating chip → opens the rating sheet (see Rating sheet below).
- **Card density is user-customizable** via Customize → Kitchen → Recipes tab → Card density (Roomy default, Compact tightens padding + shrinks thumb to 40×40 + hides the chip line).
- **Filter & Sort sheet (4 dimensions):** Show (All / Top rated / Never cooked), **Total Time** bucket (< 30 min / 30–60 min / > 60 min — applies to total minutes, not prep alone), Tags (multi-select with AND across), Sort by (A–Z / Recent / Quickest / Last cooked / Top rated). Tag chips render from tags actually present in the library. **Default sort is user-customizable** via Customize → Kitchen → Recipes tab → Default sort (seeded into `recipeFilter.sort` at page init). The chip labels in Customize use shorter wording than the filter sheet (e.g. "Recent" / "Quickest" / "Top rated") because the chip layout is 3-column and longer labels wrap. Difficulty filter retired — no import sites expose it via JSON-LD, no one filled it manually, schema field removed from the save path.
- **Ratings model:** `recipe.ratings: { [personId]: number }` — per-person half-star scores (0.5–5.0 in 0.5 increments); display is the average. Legacy `recipe.rating` (single number) is read as a fallback. Individual scores are never surfaced; only the average is shown.
- **Rating sheet (`openRecipeRatingSheet`):** stars row is a single `<div role="slider">` with `aria-valuemin/max/now`. Tap-or-drag along the row to scrub a pending value (snaps to nearest half-star — 10 buckets across 5 stars). Pointer events handle the drag; `touch-action: none` on the row so swipe drives the rating instead of page-scroll. Helper text live-updates as `Your rating: X`. Submit/Update button at the footer commits to Firebase; disabled until pending differs from saved. `Remove rating` button alongside Submit when a saved rating already exists. **No tap-to-commit shortcut** — the user always sees what they're submitting before it persists.
- **Detail-sheet star display:** 5 individual `.rd-star` glyphs (full / half / empty variants). Half uses a left-to-right `linear-gradient(accent 50%, border 50%)` clipped to the `★` glyph — no literal "½" character. Numeric value sits to the right of the star row.
- **Recipe detail sheet:** **shared `rd-*` component** rendered by `renderMealDetailSheet` in `shared/components.js` and used here, on the Dashboard dinner widget, on the Calendar day sheet (readonly), and in Kid mode (readonly). Vertical structure: hero image (`recipe.imageUrl`) → header (title + icon row: video link, recipe URL link, edit pencil, delete trash, close ✕) → **times-and-servings block** (PREP / COOK / TOTAL cells in a tinted card — Total only shown when both prep + cook parse, rendered in accent color — plus a servings stepper that scales the ingredient quantities in place via `scaleQty`) → source row + stars → Chef's notes (collapsible `<details>`, `recipe.notes`) → Family notes (collapsible, accent-tinted variant `.rd-chef-notes--family`, `recipe.familyNotes`) → ingredients grid (qty-left / name-right two columns) → footer (`Start cooking` when steps or notes present, `Add to list` when ingredients present, `Plan this meal`). Readonly callers (calendar / kid) skip the footer, hide edit/delete header icons, and replace the servings stepper with a static "Serves N" label. **`recipe.familyNotes`** is a new field stored alongside `recipe.notes` — typed user reactions / tweaks the family adds after cooking (Family notes block only renders when populated). Image `<img>` `onerror` fires `window.__krImgError(recipeId)` which triggers the self-heal pipeline (see "Self-healing recipe images" below).
- **Servings calculator continuity:** the stepper on the detail sheet scales ingredients live, AND its current value carries into both the **Add to list** flow (existing) and the **Plan this meal** flow (new — passed through `openPlanMealSheet(date, slot, recipeId, { servings })`, persisted on the plan-slot entry as `entry.servings`, restored as the starting stepper value next time the meal opens from that plan-slot context).
- **Cook mode (shared):** the immersive step-by-step UI extracted from kitchen.js into `shared/components.js` as `openCookMode(recipe, { mount, onComplete, onExit, showToast })`. Same UI as before — wake-lock, large step text, progress dots, Prev/Next, slide-down ingredients panel — but now also reachable from the Dashboard dinner widget's Start cooking action. Caller supplies the mount element and the `onComplete` callback (typically bumps `recipe.lastUsed`). Steps come from `recipe.steps[]` first, fall back to `parseSteps(recipe.notes)`.
- **Recipe form structure:** the meta row (`.kr-meta-row`) shows **Prep / Cook / Serves all inline** as three fields — Cook time is no longer hidden behind a `+ Cook time` disclosure chip. Three disclosure chips below the Notes field reveal optional fields: `+ Tags`, `+ Family notes`, `+ Step-by-step`. The URL field shows a helper line `"This link is no longer reachable. Upload a new photo above, or clear the link to keep the recipe without it."` when `recipe.imageRefreshFails >= 2` (see Self-healing). Difficulty field removed entirely (chip picker, save handler, filter sheet dimension, Worker prompt all dropped).
- **AI Tools sheet — RECIPES section:** `Import from URL` (opens recipe form with URL field focused), `Import from photo` (opens recipe form and clicks photo picker), `Find ideas online` (8-site bookmark drawer), `What can I make?` (textarea-driven AI suggestions via `recipeSuggest` Worker handler; saved suggestions become stub recipes).
- **Recipe URL dedup:** on blur of the URL field in the recipe form, normalize the URL (lowercase scheme + host, strip trailing slash + query + hash) and check against existing recipes. Match → confirm-prompt to open existing or save anyway.
- **Recipe URL import metadata extraction:** the Worker (`handleUrl`) preserves JSON-LD `application/ld+json` blocks before HTML cleanup and asks Claude for `prepTime` / `cookTime` / `totalTime` / `servings` / `tags` (from `recipeCategory` / `recipeCuisine` / `keywords`) / `videoUrl` (from VideoObject) / **`steps[]`** (from `recipeInstructions` HowToStep / HowToSection items, falling back to visible numbered lists; capped at 30 entries, leading "1." / "Step 1:" stripped). Client auto-opens the `+ Step-by-step` and `+ Tags` disclosures when imported. The Worker also fetches the og:image server-side and returns it as `imageData` (base64) + `imageMediaType`; the client resizes via `base64ToDataUrl` (800px max, jpeg 85%) and stores the result as a permanent **data URL**. Falls back to a client-side `urlToDataUrl(remoteUrl)` fetch when only `imageUrl` is returned (older Worker versions). The `Refresh image` icon button on the edit form re-runs the same Worker pipeline to recover expired CDN URLs.
- **Self-healing recipe images:** legacy recipes (imported before the Worker image proxy landed) may still store time-signed CDN URLs (TikTok, etc.) that expire ~24h after import. When such a thumbnail or hero image fires `onerror`, `selfHealRecipeImage(recipeId)` (kitchen.js module scope, exposed via `window.__krImgError` for inline handlers) attempts one Worker re-fetch per recipe per page-load (max 5 self-heals per page-load globally). Success: image replaced with a permanent data URL + `imageRefreshFails` cleared. Failure: `imageRefreshFails` increments on the recipe. Hard skips: no source URL, image is already a data URL, recipe is in the per-session attempted set, global cap hit.
- **Flagged-recipes banner:** when any recipe has `imageRefreshFails >= 2`, the Recipes tab renders an accent-tinted attention banner above the search row — `Image for "X" can't be loaded — tap to fix` (single recipe) or `N recipes need attention — tap to view` (multiple). Tap → `openBrokenRecipesSheet` lists the flagged recipes with name + fail count; tap a row → opens the recipe edit form so the user can upload a new image or clear the dead URL. Counter resets on any recipe save (the implicit "I dealt with it" — if the underlying problem persists, self-heal starts ticking it back up next page-load).
- **`renderMealDetailSheet` + `openCookMode` shared component note:** the `rd-*` CSS that powers the recipe detail rendering moved from `styles/kitchen.css` into `styles/components.css` because the same layout is now used by pages that don't load `kitchen.css` (Dashboard, Calendar, Kid mode). Only `.kr-meta-row` (recipe edit form) remains kitchen-only.

**Lists tab:**
- List-switcher row: list icon + name + `· N left` count chip (active items; `· clear ✓` when all checked; hidden when empty) + `⋮` overflow.
- `⋮` opens `openListActionsMenu` with six actions: `+ New list`, `Add from staples`, `Rename / change icon`, `Copy as text`, `Clear checked items`, `Delete list` (visually separated as the danger action).
- Items area: `.card.card--shopping` rows, checkbox in leading slot, strikethrough + sink on check. Category headers hide when the only visible category is `OTHER` (single category) — multi-category lists show all headers.
- Empty state: `Your list is empty.` + `+ Add from staples` primary CTA (when staples exist) or `Save your basics as staples first` link (when none) + `Or tap the + to add an item.` helper.
- **Self-healing categorization:** on every `renderItemsArea` call, items with null/empty/`OTHER` category are silently re-categorized via the `categorizeItem` Worker handler. Debounced to one pass per 60s per `activeListId`; capped at 10 items per pass; checked items skipped.
- FAB: opens inline `Add items…` field (focused). Bulk-add via `openBulkAddSheet`.
- **AI Tools sheet — LISTS section:** `Auto-categorize` (runs `runListCleanup` — dedup, rename, re-categorize via `cleanList` Worker handler), `Photo → list` (opens photo source picker, runs `photoToList` Worker handler).

**AI Tools sheet — SCHOOL LUNCH section:**
- `Take photo` / `From gallery` / `Upload file` — feed the existing `schoolLunch` Worker handler; surface a confirm sheet with date + name fields per row; writes to `kitchenPlan/{date}/school-lunch[-2]` via auto-allocation (slot 1 first, slot 2 if taken).
- `iCal feed` — per-person school-lunch feed setup (URL + sync-now + edit + remove). Schema: `rundown/kitchen/schoolLunchFeeds/{personId}: { url, lastSync, lastError, conflicts? }`. Client-side fetcher in `shared/kitchen-ical.js` (parseIcs + mapEventsToPlan); conflicts surface as a count chip. Also manageable from Admin → AI Imports → "School Lunch Feeds" section, sibling to the existing Calendar Feeds.

**Worker handlers consumed:**
- `categorize` / `cleanList` / `mergeQty` / `dedupIngredients` — list cleanup primitives
- `url` / `screenshot` — recipe import (URL or photo) — `handleUrl` additionally downloads the og:image server-side and returns `imageData` (base64) + `imageMediaType` so the client can store permanent data URLs instead of time-signed CDN URLs
- `schoolLunch` — school-lunch menu OCR
- `photoToList` — list-from-photo OCR
- `recipeSuggest` — AI 'What can I make?' suggestions

**Recipe data model additions (vs. v1 spec):**
- `recipe.cookTime` — separate from `prepTime`; both feed the times block + total-time chip + filter buckets
- `recipe.steps[]` — populated from JSON-LD `recipeInstructions` on import; consumed by Cook mode
- `recipe.familyNotes` — user-typed reactions / tweaks after cooking; renders as a second collapsible block on the detail sheet
- `recipe.videoUrl` — populated from JSON-LD VideoObject; renders as a play-icon link in the detail sheet header
- `recipe.ratings: { [personId]: number }` — half-star scores from each linked person; display is the average
- `recipe.imageRefreshFails` — counter for the self-heal system; resets on save, hits banner threshold at 2
- `recipe.difficulty` — **removed**; field no longer written by the save handler, no longer extracted by the Worker, no longer surfaced as a filter dimension

**Kitchen Customize prefs (per-person OR device-local, see §10.4):**
- `slotNudge: { breakfast, lunch, school, dinner, snack }` — per-slot booleans driving Meals tab empty-state rendering
- `daysShown: 3 | 7 | 14` — Meals tab window length
- `recipesSort: 'alpha' | 'recent' | 'quickest' | 'last-cooked' | 'highest-rated'` — initial Recipes tab sort
- `cardDensity: 'roomy' | 'compact'` — Recipes tab card style
- `tabs: ['meals', 'recipes', 'lists']` (subset) — which Kitchen sub-tabs render; always ≥ 1

**Kid view:** read-only Tonight's Dinner tile (Dashboard ambient row); optional shopping peek for lists marked kid-visible (future).
**Kiosk:** prominent tile in kiosk More menu; meals section in day-column view.

### 6.11 Activities (new page, 1.6)

**Purpose:** On-demand activity tracking with shared timer.

**Layout:**
- Header: `Activities` + filter.
- Top: stat hero (today's time + weekly goal progress).
- Library: `.card.card--activity` rows.
- FAB: start an activity → opens shared timer.
- Session log (recent): compact rows at bottom.

**Activity detail sheet:** edit name/category/default duration, start button.
**Timer:** `shared/timer.js` (same as Task Timer).
**Scoreboard integration:** activities tab.
**Kid:** tile on kid home; Start button opens timer.

### 6.12 Kiosk / Wall display (`display.html`, 1.5)

**Separate layout. Separate CSS file.**

**Default view:** current week grid (7 columns, landscape).
- Each day column: day head (num + weather) → events → tasks → meals → activities log.
- Persistent family balance row at bottom (all people).
- Persistent bottom bar: Menu (opens tile grid: Calendar, Scores, Kitchen, Admin-lite, Display settings).

**Day drilldown:** tap a day → slides up detail view.
**Inline editing:** tap an item → inline edit in-place (no modals).
**Ambient mode:** after 30s idle, non-essential chrome fades; clock + tomorrow's first event + weather only.
**Night mode:** dims to 10% brightness between 22:00–06:00 (configurable).

**No authentication.** No PIN entry. Kiosk is a trusted device.
**No admin.** Adults use phone for admin.

**Type:** +25% vs phone baseline. Tap targets ≥ 56×56.
**Every new feature ships kiosk on day one.**

---

## 7. Cross-cutting patterns

### 7.1 Forms & progressive disclosure
- Forms > 4 fields must use progressive disclosure: reveal fields conditionally.
- **Task form:** Rotation → reveals cooldown (daily) or dedicated-day (weekly/monthly/once). Bounty toggle → reveals bounty-point / bounty-reward fields. Exempt toggle → reveals scoring note.
- **Event form:** simpler — Title, When, Who, Notes. Recurrence field reveals rule builder.
- **Meal form:** Slot, Name, URL, Notes — URL/Notes reveal on expand tap.
- **Vacation form:** Person, Start, End, Redistribute (only shown in rotate mode).
- **Trade form:** Target person → reveals their task list → pick task → reveals your task list.
- Submit button sticky at sheet bottom. Cancel reachable without scroll.
- Validation: inline per field. `role="alert"` for errors. Never a blocking modal of errors.

### 7.2 Notifications & Bell
- **All notifications converge on the Bell.** OS-level push only for foreground-absent app.
- Bell dropdown: Tabs (All | Requests | Activity). Rows use `.card` pattern.
- Per-event routing table:

| Event | Bell entry | Toast (foreground) | OS push (background) |
|---|---|---|---|
| Reward redemption request | ✓ | ✓ | ✓ |
| Redemption approved/denied | ✓ | ✓ | ✓ |
| Bonus / deduction | ✓ | ✓ | ✓ |
| Achievement unlocked | ✓ | ✓ (kid mode only) | — |
| Task reminder | — | — | ✓ |
| Event reminder (15/30/60 min) | — | — | ✓ |
| Bounty granted | ✓ | ✓ | — |
| Trade proposal (3.2) | ✓ | ✓ | ✓ |
| Multiplier day started | ✓ | ✓ | — |
| Vacation started/ended | ✓ | — | — |

- Never route the same event to both toast AND modal. Pick one channel per foreground/background context.
- Bell badge: dot (no count) for simple "new", count number for 5+ items.

### 7.3 Banner queue
- One banner visible per page. Priority: `vacation > freeze > overdue > multiplier > info`.
- Banner dismissal is per-session (reappears next load if still active).
- Pages that render the banner mount: **dashboard, calendar, scoreboard, tracker, kiosk**. Other pages omit the slot. (Scoreboard + tracker added 2026-04-25 so the running-activity `--info` banner from 1.6 stays visible across the app while a session is in progress; without those mounts the timer would vanish on page change.)
- The `--info` variant has two well-known sub-uses: (a) running activity session (`Reading session · 12:34 · [Stop]`), (b) offline (`Offline — changes will sync`). Both are lowest-priority; either yields to a higher-priority banner and returns when that banner clears.
- The overdue banner body is tappable (same effect as the `Review` action button).

### 7.4 Vacation mode (cross-cutting)
- Active vacation marks: dashboard banner, calendar day shading, tracker row tag, kid vacation tile, scoreboard exclusion.
- Family-wide vacation: pauses all non-daily scheduling.
- Visual language: `--accent-soft` background, palm-tree emoji in title only (user-authored feel), never in chrome.

### 7.5 Recurrence (cross-cutting)
- Form extension only. New fields revealed based on rule type.
- Supported types: daily, every-N-days, weekly-by-day (mon/wed/fri), biweekly, monthly-by-date (1st + 15th), monthly-by-day (2nd Tue), once.
- Preview: next 5 occurrences inline in the form.
- Schedule sub-screen in Admin → People → Schedule previews next 10 for each recurring task.

### 7.6 Iconography
- **Primary system:** SVG, Lucide-style, 24px default (20px dense, 22px in headers).
- **Stroke-width:** 1.75 default, 2 when active.
- **Fill:** `currentColor` or `none`; never hardcoded.
- **Emoji allowed only in user-authored content:** category icons, reward icons, task notes, achievement display, meal names, shopping items. And in kid mode celebrations.
- **Never emoji in:** nav, tabs, buttons, banners, status chips, headers, form labels, settings rows (except kid mode celebrations/tiles and the kid-only surfaces below).
- **Kid mode explicit exceptions:** emoji is permitted in (a) kid stat tiles (Points/Streak/Badges and future tiles — tiles only, not pills), (b) kid Today tiles (Dinner/Weather/Activity — meal and weather icons are naturally emoji), (c) kid trophy case badges. Emoji is still banned in kid task card meta chips, kid streak pills (if streak surfaces as a pill in non-kid contexts), and any parent-facing status chip including streak pills in admin People rows.
- **Max one emoji per card.**

### 7.7 States (empty, loading, error, success)
- **Every feature** ships all four states.
- **Empty:** icon + title + body + optional CTA. Use `renderEmptyState(root, {variant, ...})`.
- **Loading:** skeleton matching shape of content. Never a blank screen. Never a spinner ≥ 300ms without skeleton.
- **Error:** `renderErrorState(root, {title, message, retry})`. Never dumps raw error.
- **Success:** toast (non-blocking) or celebration (climactic actions only). Parent completing a task = toast. Kid completing a task = toast + optional celebration.

### 7.8 Long-press and gestures
- Long-press opens detail sheet.
  - Tracker: **500ms**
  - Calendar / Kid / Dashboard: **800ms** (touch-scroll-heavy surfaces)
- Swipe left/right: day navigation (dashboard, kid, calendar day) or month (calendar month).
- Every gesture has a visible non-gesture fallback (arrows, buttons).

### 7.9 Real-time and offline
- Firebase `onValue` listeners for live updates. 100ms debounce before re-render.
- Full re-render on change (not incremental).
- Offline: service worker serves app shell; Firebase writes queue; banner appears "Offline — changes will sync" (info variant).

---

## 8. Accessibility

- Contrast: WCAG AA minimum (4.5:1 body, 3:1 large text). Every theme preset verified light + dark.
- Focus rings: 2px outline `--accent`, offset 2px. Visible on all interactive elements when keyboard-focused.
- Semantic HTML: `<button>` for actions, `<a>` for navigation, `<nav>` for nav zones, `role="dialog"` + `aria-modal` for sheets/modals.
- Labels: every input has a `<label>`. Every icon button has `aria-label`.
- Live regions: `role="alert"` for form errors, `role="status"` for toasts.
- `prefers-reduced-motion`: replace slides/scales/celebrations with fades.
- Keyboard: tab order natural, arrow keys on Tabs, Escape closes sheets/modals.

---

## 9. Motion & animation

- **Defaults to quiet.** Slides 200ms, hovers 120ms, celebrations 320–800ms.
- **Entry:** fade + 8px slide-up for cards, drawers, toasts.
- **Exit:** fade only (no slide-out for toasts/modals — users can re-open).
- **Checkbox toggle:** scale 0.9 → 1.0 over 120ms.
- **Celebration:** sparkle (ambient, 2s) or confetti (climactic, 4s). No other celebration systems.
- **Reduced motion overrides:** all slides/scales → 120ms opacity fade. No confetti. Celebrations collapse to toast.

---

## 10. Theming

### 10.1 Presets
Minimum 5: **Sage** (default, warm teal), **Ocean** (blue), **Rose** (pink), **Amber** (warm gold), **Iris** (purple).
Each preset defines light + dark variants. Dark parity verified.

### 10.2 Token override
Themes redefine color tokens at `:root[data-theme="sage"]` etc. Never redefine structural tokens (spacing, radii, motion). Type scale is fixed across themes.

### 10.3 Dark mode
- Strategy: `@media (prefers-color-scheme: dark)` default + manual override in Settings (follow system / force light / force dark).
- Dark surfaces: `#141413` bg, `#1d1d1b` surface. Warm neutrals, not pure grayscale.
- Accent remains the same hue; lightens slightly in dark (`color-mix(in srgb, accent 75%, white 25%)`).

### 10.4 The Customize menu

Every page surfaces user-level preferences through a single shared sheet titled **"Customize"**, opened from the bottom nav's **More → Customize**. This is the one place a user changes how the app looks and behaves *for themselves* — separate from Admin, which edits **family-wide app defaults** (members, tasks, rewards, feeds, PIN, etc.).

The rule of thumb: **if changing the setting would affect what data IS or affect AI / automation behavior, it's Admin. If it only affects how the user sees or organizes the data, it's Customize.**

#### Audience and storage

Customize is **personal**:

- **Linked person** (`?person=Name` URL param resolved against the people roster) → writes to `rundown/people/{id}/prefs/customize/...`. Settings follow the person across devices.
- **No linked person** (wall tablet, shared kiosk, anonymous visitor) → writes to device `localStorage` under `dr-customize-*` keys. Settings stick to that physical device.

The Customize UI is identical in both modes — the storage destination switches automatically. Admin defaults remain the fallback for unconfigured settings.

#### Structure

The sheet is a vertical list of two layers:

1. **Universal section** (always rendered) — preferences that apply everywhere.
2. **`{Current page}` section** (rendered only when the user is on a page that has one) — preferences that only apply to this page.

There is no "switch pages from inside Customize" affordance. Customize follows the user's current page; to customize Calendar, navigate to Calendar first.

#### What lives in Universal

Top-to-bottom order:

- **Theme presets** — flat, always visible. Per-person.
- **Text Size** — flat, always visible. Per-person.
- **Task cards / Grouping / Display toggles** — *only when on Home*. Each is its own collapsible (closed by default). Stays in Universal context visually, but functionally a Home-page section nested under the universal area.
- **Navigation buttons** — collapsible, closed by default. The editor lets the user pick which 3 pages occupy nav slots 2, 3, and 4. Slot 1 (Home) and slot 5 (More) are locked.

Avatar editing is the top-right action of the sheet header in person mode: tapping the avatar opens the full editor (color + initials + photo). In device mode (no linked person), the header instead shows a flat accent-color picker.

#### Nav buttons editor

- Available pages: Kitchen, Calendar, Scoreboard, Rewards, Tracker (5 candidates for 3 slots).
- Drag handle on each row (left-aligned grip icon). Drag to reorder.
- Top 3 rows are tagged "Slot 2", "Slot 3", "Slot 4". The remaining rows are tagged "In More" and automatically populate the More menu.
- Reordering broadcasts a `dr-nav-tabs-changed` DOM event; each page's `initBottomNav` listener re-paints the nav bar + More handler in place.
- Pointer events: `pointerdown` on the grip starts the drag; `pointermove` + `pointerup` listen on `document` so the drag survives the user's finger drifting off the small handle.
- Storage default: `['kitchen', 'scoreboard', 'rewards']` (matches the historical nav order).

#### Page sections

Currently populated:

- **Home** — Task cards picker, Grouping (Minimal / Grouped / Focus), Show on task cards toggles (AM-PM icons, Estimated duration, Point value).
- **Kitchen** — Kitchen tabs (which sub-tabs are visible), Meals tab (Days shown 3/7/14 + Show empty slots as nudges per-slot), Recipes tab (Default sort + Card density).

Reserved (no settings yet, section omitted):
- Calendar, Scoreboard, Rewards, Tracker.

#### Collapsibility

Inside a page section, **each setting (or closely-related group) is its own `<details>` collapsible**, closed by default. Rationale: page-specific settings are "set once, forget" — the sheet should read as a tidy list of headings on open, not a wall of toggles. The user expands what they want to change.

Closely-related settings group under one collapsible:

- Kitchen "Meals tab" contains both **Days shown** and **Show empty slots as nudges** (both affect Meals tab presentation).
- Kitchen "Recipes tab" contains **Default sort** and **Card density** (both affect Recipes tab).
- Home "Show on task cards" contains the AM-PM / Duration / Points toggles (all three are "what shows on a task card" knobs).

Standalone settings (no related siblings) get their own collapsible — e.g., Kitchen "Kitchen tabs", Home "Task cards", Home "Grouping".

**What stays flat (uncollapsed):** Theme presets and Text Size. Both are 1-row controls, both are high-frequency. Wrapping them in collapsibles would cost ~30px of chrome per row for no payoff. Anything taller than 2 rows or in the "set once" category gets a collapsible.

#### Visual pattern

The shared component is `.dt-collapsible`:

- Summary row: section label (left) + chevron icon (right).
- Chevron rotates 180° when open.
- Custom `list-style: none` to suppress the default disclosure marker.
- Nested variant (`.dt-collapsible--nested`) adds a 1px top border so a stack of collapsibles inside a page section reads as discrete tappable rows.

#### Avatar bug (resolved 2026-05-11)

Pre-2026-05-11, Kitchen and Rewards called the More menu helper with `personOpts: undefined` regardless of whether a linked person was present, so their Customize sheet showed the flat color picker instead of the rich avatar UI everywhere else. The fix was mechanical — all pages now mirror Dashboard's call shape (`personOpts: linkedPerson ? { person, writePerson, displayDefaults } : undefined`). Going forward: every new page that adds Customize support must pass `personOpts` when a person is linked, falling through to `undefined` (which triggers device-local mode) otherwise. `familyOpts` is intentionally **not** wired through the More menu — that path is reserved for Admin's internal app-defaults editor (which currently doesn't exist as a separate UI but the contract is preserved for future use).

---

## 11. Review checklists

### Before opening a PR
- [ ] Feature-home map updated if feature is new or moved.
- [ ] Tested at 375px (phone), 768px (tablet portrait), 1024px (tablet landscape), and 1920×1080 (kiosk if touching kiosk).
- [ ] Every new interactive element ≥ 44×44 (56×56 in kid mode).
- [ ] No inline styles, no raw hex in component CSS, no `window.confirm`/`window.alert`.
- [ ] Any new visual pattern is a variant of an existing component (or spec updated).
- [ ] Empty, loading, error, success states designed.
- [ ] Tested in at least 2 themes, light + dark.
- [ ] `prefers-reduced-motion` respected.
- [ ] Focus rings visible.
- [ ] No new CSS token introduced unless justified in PR.
- [ ] Header not gaining icons. Bottom nav not exceeding 5 tabs.
- [ ] Kid mode appearance considered.
- [ ] Kiosk appearance considered (if feature is user-facing and not admin-only).
- [ ] Notifications routed through Bell, not ad-hoc surfaces.
- [ ] Banner budget respected (one banner at a time).
- [ ] Gestures have non-gesture fallbacks.

### When reviewing
- [ ] Does the Feature-home map still hold?
- [ ] Could this be a variant of an existing component?
- [ ] Does it match type scale and spacing rhythm?
- [ ] Does phone lead tablet, not the other way?
- [ ] Is every pixel of chrome themed?
- [ ] Would a new family understand the screen in 3 seconds?
- [ ] Where does this feature live in 6 months when all backlog is shipped?

---

## 12. Do-not rules (non-negotiable)

> Each rule below has a corresponding grep recipe in §A for mechanical verification.

- ❌ Do not add a fifth tab style; use `.tabs` with variants.
- ❌ Do not add a seventh card pattern; add a `.card--variant`.
- ❌ Do not build a new form sheet without following §5.23 v2 (Form sheet pattern). Every form sheet must have a sticky `fs-footer` (Cancel + labeled primary action), a visible `disabled` state on the primary save when required fields are empty, no raw `<input type="date">` exposed (use the `fs-date-btn` pill + `.showPicker()` pattern), no `<input type="time">` (use the 6-element AM/PM picker), no horizontal padding on sections (the bottom-sheet provides it), no outline focus rings inside the form (text inputs included — explicit reset required to suppress the browser default), no solid-black-fill for chip-toggle active states (solid border, same color, only), no third "active" or "selected" treatment beyond the two allowed in §5.23, no chip-toggle when the semantic is a switch (use `.form-toggle` per §5.16), no separate bottom-sheet for sub-flows (use `.<prefix>-subsheet-overlay`), no `← Back` link AND a Cancel button on the same sub-sheet (pick one), no lost form state across sub-sheets (`captureFormState` + `savedState` pattern).
- ❌ Do not auto-focus any input when a form or sheet opens. No `.focus()` in the `requestAnimationFrame` that activates the sheet, and no `autofocus` attribute. Auto-focus pops the phone keyboard before the user is ready. Permitted: focus triggered by a user tap inside an already-open form (chip toggle, "Add ingredient" button, validation failure). Inline item-add fields (shopping list, bulk add) are exempt — their sole purpose is typing.
- ❌ Do not use emoji in nav, tabs, buttons, banners, status chips, headers, form labels.
- ❌ Do not lock the page with `overflow:hidden; height:100dvh` outside kiosk.
- ❌ Do not put Theme/Debug/Add icons in the header — they live in overflow, admin, or a FAB.
- ❌ Do not use gradient text in chrome.
- ❌ Do not use `window.confirm` / `window.alert`.
- ❌ Do not hardcode colors in component CSS — tokens only.
- ❌ Do not add a new top-level nav tab without retiring capacity elsewhere.
- ❌ Do not ship a feature without empty, loading, and error states.
- ❌ Do not invent kid-only components when a modifier will do.
- ❌ Do not treat tablet as stretched phone.
- ❌ Do not write inline styles in HTML.
- ❌ Do not place primary actions in the top bar on phone — use a FAB.
- ❌ Do not ship a feature that doesn't declare its Kiosk appearance.
- ❌ Do not ship a second timer/stopwatch — use `shared/timer.js`.
- ❌ Do not ship a new notification surface — route through the Bell.
- ❌ Do not ship two banners at once — use the queue.
- ❌ Do not render multiple action buttons inline next to an item's name in a list — one chevron, detail page owns the actions.
- ❌ Do not break the `rundown/` Firebase root into subapp paths.
- ❌ Do not introduce a CSS framework or bundler — vanilla ES modules + hand-written CSS only.
- ❌ Do not gate core controls (bell, overflow Rewards/Admin, person filter chip, FAB) behind `!linkedPerson` — person mode is the adult PWA shortcut and has parity with Home. Kid mode is the restricted variant.
- ❌ Do not add `var(--header-height)` to a page wrapper's `padding-top`. `.app-header` is `position: sticky` and reserves its own height in flow; wrappers that also add header-height produce a large blank gap below the header. Safe-area-inset-top belongs on the header's `padding-top`, not the wrapper's.
- ❌ Do not add horizontal margin or padding to inner groups (`.section`, section heads, list groups) when a page wrapper (`.page-content` / `.app-shell`) already supplies it. One element owns the horizontal gutter — stacking produces a doubled side gap that detaches content from the card edge.
- ❌ Do not navigate to a separate page to open a child form from within a bottom sheet. Use the inline close-delay-open callback pattern (§5.23 "Inline child-form"). SessionStorage round-trips for form handoffs are banned — they are fragile, untestable, and feel broken.
- ❌ Do not use `sheet__content` wrapper or slot-tab `<nav>` inside a picker-list form — use the `kp-*` structure from §5.24. `sheet__content` is a legacy pattern used by early forms before the picker structure was codified.

---

## 13. Correct vs incorrect examples

### 13.1 Card
**Correct:**
```html
<article class="card card--task">
  <div class="card__leading">
    <span class="avatar avatar--a">JJ</span>
  </div>
  <div class="card__body">
    <div class="card__title">Take out the trash</div>
    <div class="card__meta">
      <span>Household</span>
      <span class="card__meta-dot"></span>
      <span>10 min</span>
    </div>
  </div>
  <div class="card__trailing">
    <button class="check" aria-label="Mark complete"></button>
  </div>
</article>
```
**Incorrect:**
```html
<div class="task-row" style="display:flex; padding:12px; background:#fff;">
  <img src="avatar.png" width="32" />
  <span>🚮 Take out trash</span>
  <input type="checkbox" />
</div>
```
Violations: inline styles, raw color, bespoke class, emoji in status slot, tiny tap target, no semantic button.

### 13.2 Tabs
**Correct:**
```html
<nav class="tabs tabs--pill tabs--md">
  <button class="tab is-active">Week</button>
  <button class="tab">Month</button>
  <button class="tab">Day</button>
</nav>
```
**Incorrect:**
```html
<div class="sb-period-tabs">
  <div class="sb-tab-active">Week</div>
  <div class="sb-tab">Month</div>
</div>
```
Violations: bespoke tab class, divs not buttons, no keyboard semantics.

### 13.3 Confirm
**Correct:**
```js
const ok = await showConfirm({
  title: 'Delete task?',
  body: `"${task.name}" will be removed from the schedule.`,
  confirmLabel: 'Delete',
  confirmVariant: 'danger',
});
if (ok) await deleteTask(task.id);
```
**Incorrect:**
```js
if (confirm('Are you sure?')) deleteTask(id);
```
Violations: native dialog, no context, no destructive styling, unthemeable.

### 13.4 People list
**Correct:** one row per person, identity pills, one chevron.
```html
<article class="card person-row">
  <div class="card__leading"><span class="avatar avatar--lg avatar--c">NK</span></div>
  <div class="card__body">
    <div class="card__title">Noah</div>
    <div class="person-row__badges">
      <span class="pill pill--kid">Kid</span>
      <span class="pill">240 pts</span>
    </div>
  </div>
  <div class="card__trailing chev">[chev svg]</div>
</article>
```
**Incorrect:** action-button soup.
```html
<div class="person-item">
  <img src="avatar.png" />
  <span>Noah</span>
  <button>Edit</button>
  <button>Pts +</button>
  <button>Pts -</button>
  <button>Msgs</button>
  <button>Achievements</button>
  <button>🗑</button>
</div>
```
Violations: multiple inline actions, no detail drilldown, emoji button, no pill identity, no chevron affordance.

### 13.5 Adding Weather
**Correct (calendar header + optional dashboard ambient chip):**
```html
<!-- calendar.html -->
<div class="app-header"><span class="weather-chip">☀ 72°</span></div>
<!-- index.html ambient-row (user setting = on) -->
<div class="ambient-chip"><div class="ambient-chip__icon">☀</div>...</div>
```
**Incorrect:**
```html
<!-- full weather hero on dashboard -->
<section class="weather-hero">
  <div class="forecast-7day">...</div>
</section>
```
Violations: weather is not dashboard's job, feature creep beyond spec, competes with tasks.

### 13.6 Adding Meals / Shopping (Kitchen, 1.3+1.7)
**Correct:** meals and shopping live in `kitchen.html` (Meals tab + Shopping tab). Calendar day view shows meals read-only using `.card.card--meal`. Dinner chip surfaces in dashboard ambient strip.
**Incorrect:** Meals or Shopping as a 6th nav tab; meal library managed from Admin; shopping as a bottom sheet.

### 13.7 Adding Activities
**Correct:** scoreboard gains a top-level Tabs variant "Tasks | Activities" using existing `.tabs` and `.card`.
**Incorrect:** new bespoke `.activity-leaderboard` class with hardcoded colors.

### 13.8 Adding Task Timer
**Correct:** import shared timer; open it from task detail sheet.
```js
import { openTimer } from './shared/timer.js';
openTimer({ durationMin: task.estMin, onDone: () => completeTask(task.id) });
```
**Incorrect:** a new circular-progress modal bespoke for task timing.

### 13.9 Adding Vacation
**Correct:**
```js
renderBanner(root, {
  variant: 'vacation',
  title: 'Jordan is away until Apr 25',
  action: { label: 'End early', onClick: endVacation },
});
```
**Incorrect:** dedicated `.vacation-banner` CSS + overdue banner shown simultaneously.

### 13.10 Adding Push
**Correct:** route to Bell; OS push only when backgrounded; toast only when foregrounded.
**Incorrect:** custom in-app notification tray + red dot on header + blocking modal per push.

### 13.12 Responsive
**Correct:**
```css
.shell { padding: var(--spacing-md); }
@media (min-width: 768px) {
  .shell { display: grid; grid-template-columns: 240px 1fr; }
}
```
**Incorrect:**
```css
@media (min-width: 768px) { :root { --max-width: 700px; } }
```
Violations: tablet-as-wider-phone, no layout change, no density change, no left rail.

---

### 13.13 Form authoring recipe (build a new form against §5.23 v2)

When porting an existing form (task, recipe, person, reward, list, etc.) to the new pattern, follow these steps in order. Read §5.23 alongside this recipe — the canonical anchor map and primitives table there are the authoritative reference.

**Step 1 — Pick CSS prefixes.** Use `fs-` for shared primitives (footer, helper, date button, picker reveal, sub-sheet shell). Use a per-form prefix (`tf-` task, `rf-` recipe, `pf-` person, `bf-` badge, etc.) only for genuinely unique classes. Append your CSS block to `styles/components.css` after the existing form sections; bracket it with `/* ── <Form name> ─────── */` and `/* ── End <Form name> ── */` comments.

**Step 2 — Add the renderer to `shared/components.js`.** Pure HTML generator, exported. Signature: `renderXForm({ existing?, mode: 'create'|'edit', ...context })` returning a string. Mirror the section order from §5.23. Use `esc()` on every interpolated value. Compose from the §5.23 shared primitives where they exist (`renderFormFooter`, `renderDateInput`, `renderSwitchToggle`, etc.). Do not call `document.*` from this function.

**Step 3 — Add the wiring function to the page-level JS.** Signature: `openXForm(existingId = null, savedState = null)`. Pattern matches `openEventForm`:
1. Resolve `existing = savedState || (existingId ? collection[existingId] : {})`.
2. Set `mode` from `existingId`.
3. `taskSheetMount.innerHTML = renderBottomSheet(renderXForm({ existing, existingId, ...context, mode }))`.
4. Apply per-element CSS vars via JS (e.g. `chip.style.setProperty('--chip-color', chip.dataset.personColor)`).
5. `requestAnimationFrame` to add `.active` only — **do not focus any input on open**. Auto-focus pops the phone keyboard before the user is ready. Focus is only permitted in response to an explicit user action inside the already-open form (e.g. tapping a chip/button, validation failure shake).
6. Wire all listeners.
7. Define `captureFormState()` inner function — must serialize EVERY field including transient UI state.
8. Wire the disabled-save state: on every required-field input event, set `saveBtn.disabled = !isFormValid()`. Apply to BOTH the header ✓ icon AND the footer primary button so they stay in sync.
9. Save handler: validate, build object, swap primary button to spinner state if the save involves async work (>150ms or AI/upload), call Firebase write, `closeTaskSheet()`, `render()`. On error: re-enable button, show error in the import-feedback slot.

**Step 4 — Reuse helpers, don't recreate.** From `shared/components.js`: `ef2ParseTime`, `ef2HourOpts`, `ef2MinOpts`, `ef2AmPmOpts` for time pickers; the Phase-1 `fs-*` primitives once shipped. From `shared/ai-helpers.js`: `resizeImageForUpload`, `renderConfirmRow`, `openMonthClarificationSheet`. From `shared/components.js`: `renderBottomSheet`, `showConfirm`, `showToast`. Don't import per-form variants.

**Step 5 — Sticky footer is mandatory.** Use `renderFormFooter()` (when shipped) or the shared `.fs-footer` CSS. Don't inline a copy of the footer block — that guarantees drift over time. The previous "copy `ef2-footer`, rename the prefix" guidance is retired in v2.

**Step 6 — Disabled save state on empty required fields.** Both header ✓ and footer primary button reflect `disabled` on input. Visible disabled style: `opacity: 0.5; pointer-events: none;`. Required fields: title (always), plus per-form (e.g. recipe needs ingredients > 0, badge needs condition + threshold, reward needs name + points).

**Step 7 — Saving spinner where async work matters.** AI calls, image uploads, network writes >150ms — show spinner inside primary button (`<span class="spinner spinner--sm"></span> Saving…`). Local Firebase writes — skip, too fast to be useful.

**Step 8 — Active state treatments.** Two only: purple-filled (segmented controls) or solid-border (chip-toggles + reveal triggers). No solid-black-fill. No third treatment. See §5.23 "Active states".

**Step 9 — Form sections get NO horizontal padding.** Vertical only. The bottom-sheet content provides the single layer of horizontal padding. Verify on a 360px viewport — title and section content sit at the same left edge.

**Step 10 — Focus styling.** Title input: `outline: none; box-shadow: none; border-color: transparent` on `:focus`. Icon buttons: `outline: none; background: var(--surface-2)` on `:focus-visible`. Text inputs inside the form: explicit `outline: none; box-shadow: none` to suppress the browser default focus ring. NEVER an outline ring inside a form sheet.

**Step 11 — Validation.** Required field empty on save? Pulse-shake the field with a red bottom border. No inline error text — the shake plus the visible disabled-save state is enough. Use the same shake-keyframe pattern as `ef2-shake`.

**Step 12 — Date inputs use the `fs-date-btn` pattern.** Visible pill button + hidden `<input type="date">` triggered via `.showPicker()`. Never expose the raw native input. Same rule for One-Time task date, Reward Expires, Badge date conditions.

**Step 13 — Sub-sheets.** If the form has any "secondary picker" flow (recurrence, source picker, list picker), use a second `<div class="<prefix>-subsheet-overlay">` appended to `document.body`. Single back-out path — ✕ in the header OR Cancel button in the footer, not both. Capture form state before opening; on cancel/return, re-call `openXForm(existingId, savedState)`.

**Step 14 — Edit mode delete.** Below the sticky footer in a `<form-prefix>-delete-zone`. Inline confirm with two buttons. Never `window.confirm`. Hide the trigger button when the confirm is open; restore on "Keep".

**Step 15 — AI features (if applicable).** Wand for NL parse fills directly. Photo/file import opens a source picker sheet with an "Optional note for AI" input pre-filled from the title field. Worker calls always have a fallback (heuristic for dedup, no-op for autofill). Errors show in the import-feedback slot, auto-dismiss after 3s using a stored timer (clear before setting a new one).

**Step 16 — Bump the SW cache** (`sw.js` `CACHE_NAME`) when you ship. New version number, add a one-line comment in the changelog block.

**Step 17 — Update this doc.** If your new form deviates from §5.23 in any way, document the deviation here in §13 with a named example. Drift compounds — a one-off "this form is special" becomes the next person's reference if it isn't called out.

---

## 14. Terminology glossary

- **Chrome:** the app's own UI (header, nav, banners, page structure). Distinct from *content* (user-authored data).
- **Surface:** a distinct background plane (card, panel, sheet). Stacking order matters.
- **Slot:** a named position within a component (card has leading/body/trailing; header has title/actions).
- **Ambient:** quiet contextual info (weather chip, dinner strip) that's off by default, user-toggleable.
- **Climactic:** emphasizing moment (task complete in kid mode, achievement unlock) that gets an animation.
- **Kiosk:** the wall-mounted shared family display (`display.html`).
- **Hub:** the conceptual role of the app — a single place for the family's day.

---

## 15. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-05-11 | **§6.10 Kitchen — Stage 2 rewrite.** Updates every Recipes-tab / recipe-form / recipe-detail bullet to match what shipped over the last day of work: (1) Library card chip line uses **total time** not prep alone (`recipeTotalTime` + `formatRecipeTime`, falls back to whichever side is set, omits chip when neither parses); (2) Filter & Sort sheet collapses from 5 dimensions to **4** — Difficulty filter retired, Prep-time bucket relabelled **Total Time** and applies to total minutes; (3) Default Recipes sort + card density + sub-tab visibility + Meals tab days-shown + per-slot Meals nudge visibility all customizable per-person (see §10.4 Kitchen Customize prefs subsection); (4) Recipe form's meta row shows Prep + Cook + Serves **inline** as three fields — Cook is no longer behind a `+ Cook time` disclosure; (5) Three disclosure chips on the recipe form: `+ Tags`, `+ Family notes`, `+ Step-by-step`; (6) Difficulty field removed end-to-end (chip picker, save handler, filter sheet, Worker prompt); (7) Recipe detail sheet is the **shared `rd-*` component** (`renderMealDetailSheet`) used by Recipes tab + Dashboard dinner widget + Calendar day sheet (readonly) + Kid mode (readonly) — vertical structure: hero → header icon row → times-and-servings block (Prep/Cook/Total + servings stepper that scales ingredients via `scaleQty`) → source + stars → Chef's notes + Family notes (collapsible) → ingredients → footer (Start cooking / Add to list / Plan this meal); (8) Star display uses 5 `.rd-star` glyphs with full/half/empty variants — half uses a left-to-right gradient clipped to the `★` glyph (no literal "½" character); (9) Rating sheet (`openRecipeRatingSheet`) uses drag-preview + Submit button — `pointerdown/move/up` on a `role="slider"` row, half-star snapping, no tap-to-commit; (10) Cook mode extracted from kitchen.js to `openCookMode` in `shared/components.js`, callable from Dashboard too; (11) Servings calculator carries into Plan-this-meal flow (`{ servings }` opt passed through `openPlanMealSheet` and persisted on the plan-slot entry); (12) Worker `handleUrl` server-side-fetches the og:image and returns `imageData` + `imageMediaType` so the client stores permanent data URLs by default — no client-side CORS fetch needed on import; (13) Self-heal pipeline: broken thumbnails fire `__krImgError` → `selfHealRecipeImage` re-fetches via Worker (1 per recipe per page-load, 5 global cap) → fails increment `imageRefreshFails` → counter ≥ 2 raises a banner on the Recipes tab → tap opens `openBrokenRecipesSheet` listing flagged recipes → tap a row opens the edit form; counter resets on any save; recipe form shows a "link no longer reachable" helper line under the URL field when the counter is hit. Recipe data model additions documented (`cookTime`, `steps[]`, `familyNotes`, `videoUrl`, `ratings: {[personId]: number}`, `imageRefreshFails`; `difficulty` removed). Plus: §5.3 Sheet gains a footer-button-sizing rule (`min-width: 0` + 12px padding) explaining the 3-button-overflow fix; §5.14 Bottom nav now reflects locked/user-pickable slots + the `initBottomNav` helper; §6.1 Dashboard gains a "Dinner widget tap" note pointing at the shared `rd-*` component. | All shipped in the same multi-feature session; without the spec catching up the conventions (total-time math, shared detail component scope, self-heal counter rules, customize pref keys) would drift on the next page or recipe-form change. Stage 1 (§10.4 Customize menu) shipped 2026-05-11; this Stage 2 closes out the corresponding §6.10 + cross-cutting updates. |
| 2026-05-11 | §10.4 rewritten from scratch as **"The Customize menu"** — documents the unified personal-preferences sheet shipped across every page. Sections cover: entry point (More → Customize), audience + dual storage (linkedPerson → Firebase person record; no linkedPerson → device localStorage), Universal vs Page-specific layer split, the Nav buttons editor (slots 2/3/4 user-pickable from Kitchen/Calendar/Scoreboard/Rewards/Tracker; Home + More locked; drag-drop with document-level pointer listeners), the per-setting/per-group `<details>` collapsibility rule ("set once, forget" prefs collapsed by default; small high-frequency controls like Theme + Text Size stay flat), and the Customize-vs-Admin boundary rule of thumb (changes-what-data-IS → Admin; changes-how-user-sees-it → Customize). Records the Kitchen + Rewards avatar bug (pre-fix they didn't pass `personOpts`) and the contract going forward (every page wires the same `personOpts` shape; `familyOpts` is not wired through More). The pre-existing single-paragraph §10.4 mentioning a "Settings → Appearance" path was outdated — that route never existed in the shipped product. | The Customize sheet replaces an ad-hoc "Theme" entry in More that diverged across pages (Dashboard showed avatar editor; Kitchen + Rewards showed a flat color picker; etc.). Unifying it under one shared component (`openDeviceThemeSheet` + the new `initBottomNav` wrapper) gave every page the same avatar UI, same theme presets, same text-size, same nav-buttons editor, plus a place to hang page-specific settings (currently populated for Home and Kitchen). Per-person storage means a parent's customizations don't leak to a spouse's view; per-device fallback covers the wall tablet + shared kiosk case. Without docs the new conventions (auto-expand-current-page-only, drag-drop survives finger-drift via document listeners, the collapsibility rule for tall vs short settings) would drift on the next page that wires a section. |
| 2026-05-10 | **Form-system initiative complete** — Phase 0 (§5.23 v2 spec) → Phase 5 (a11y polish) all shipped. Primitives table now reads ✅ shipped for `renderFormFooter`, `renderFormSheetHeader`, `renderDateInput`+`bindDateInput`, `renderTimeInput`, `renderChipPicker`+`bindChipPicker`, `renderEmojiPicker`+`bindEmojiPicker`, `renderColorButton`+`initColorButton` (pre-existing), `renderSwitchToggle`, `renderHelperText`. Sub-sheet helpers: `openIcalUrlSubsheet`, `openEventPhotoSourceSheet`, `openRepeatSubsheet`. Three rows still mark deferred items: `renderPersonChips` (needs state-machine extraction), `renderInlineReveal` (YAGNI — `ef2-field-reveal` works inline), `renderFormSubSheet` (replaced by per-flavor sub-sheet helpers). | All forms now compose from `fs-*` primitives where applicable: sticky `fs-footer` on every form sheet, `fs-date-btn` pill replaces every primary raw `<input type="date">` exposure, chip-active is solid border + accent color (no solid-black-fill), focus rings suppressed on text inputs inside form sheets, disabled-save state synced between header ✓ and footer Save when title empty, emoji picker has ARIA radio semantics + 36px color swatches + `inputmode` attributes for proper mobile keyboard. Ran in one session, ~30+ commits, SW v183 → v206. The form review's `2026-05-09-form-review.md` items with clear UX impact are all addressed; remaining feature-shaped items (Family chip, avatar upload, badge wizard, etc.) are parked in ROADMAP. |
| 2026-04-19 | v1.0 initial spec | Design audit + rework planning |
| 2026-04-24 | §6.9 person-mode parity rule + mount-point shell parity; §12 added three non-negotiables (no `!linkedPerson` core-control gates, no `header-height` on wrapper padding, single-gutter rule) | Phase 1 + 1.5 shipped with `!linkedPerson` hiding bell/overflow/filter chip and a missing `#fabMount` in `person.html`; also surfaced double-counted header-height and double horizontal gutter after the card density pass. Codifying so future work doesn't regress. |
| 2026-04-25 | §6.1 dashboard rewritten as 8-section final form (adds Coming up rail, codifies ambient strip default, defines tablet two-pane split, declares kiosk reflection); §6.9 retired the `Viewing as {Name}` pill; §7.3 expanded banner-mount list to scoreboard + tracker and documented overdue body-tappable + `--info` sub-uses; §5.9 documented `--info` sub-uses. | Final-form dashboard design spec ([2026-04-25-dashboard-final-design.md](../superpowers/specs/2026-04-25-dashboard-final-design.md)) approved after Phase 2 calendar shelving made the dashboard the only phone-side surface for forward-look. Doc edits ride in the same PR that ships the spec so docs stay coherent ahead of implementation. |
| 2026-05-09 | §5.1 task card flat-list pattern + owner color stripe documented; §5.1a section head component added; §4.1 header subtitle + connectivity dot documented; §2 + §5.14 nav slot specifics moved to ROADMAP.md. | Dashboard used as design reference — these patterns were implemented but not specced, causing drift risk in future sessions. |
| 2026-05-09 | §5.14 nav slots updated (Home · Kitchen · Scores · Rewards · More; More sheet: Admin, Calendar, Tracker, Theme); §6.1 dashboard tab count corrected; §6.7 Rewards primary entry updated (tab, not More sheet); §6.10 Kitchen tabs updated (Meals | Recipes | Lists) + Meals tab layout corrected to 7-day single-slot-per-day; stale plan reference removed from §6.7. | Drift audit — spec was still describing old nav (Home/Calendar/Scores/Tracker/More) and old Kitchen layout (Meals/Shopping with multi-column slots). App shipped Kitchen as tab #2, Rewards as tab #4, and split Shopping into Recipes + Lists tabs. |
| 2026-05-02 | §5.24 Picker-list form pattern (`kp-*`); §5.23 inline child-form section; §12 two new non-negotiables (no page navigation for child forms, no `sheet__content` in picker forms). | Dashboard meal picker rewritten to match kitchen's `openPlanMealSheet`. Codifying the `kp-*` structure so every "pick from library" form uses the same layout. Inline child-form pattern (`+ New recipe` opens form in same sheet via close-delay-open callback, no navigation) extracted as a named rule so future forms don't reach for sessionStorage. |
| 2026-05-01 | §5.23 Form sheet pattern (Event Form as canonical reference) + §13.13 form authoring recipe + §12 non-negotiable for new forms. | Event Form Redesign ([2026-05-01-event-form-redesign.md](../superpowers/specs/2026-05-01-event-form-redesign.md)) shipped. Pattern cascades to all other forms (task, recipe, person, reward, list, settings). Codifying so the next form session matches without reinventing — sticky-footer breakout, no horizontal padding on sections, custom time picker (no native wheel), inline pickers, person chip state machine, sub-sheet stacking via second overlay, captureFormState round-trip. |
| 2026-05-10 | Phase 3 (1/N — Task Form) — `renderTaskForm` brought up to §5.23 v2: (1) sticky `fs-footer` with Cancel + Save Changes/Add Task; (2) One-Time date input migrated from raw `<input type="date">` (form review's most-cited 🔴 critical) to the `fs-date-btn` pill pattern via `.showPicker()`; (3) header `tf_save` + footer `tf_footerSave` share visible disabled state when `task.name` is empty. | Wired identically in all 4 openers — `dashboard.js openTaskForm`, `calendar.html openTaskForm`, `admin.html openAdminTaskSheet`, `tracker.html openTaskForm`. Hidden `<input type="date" id="tf_onceDate">` retained at the same id so all 4 save handlers continue reading `.value` unchanged. Playwright-verified e2e on dashboard.js: form opens with both saves disabled, typing title enables both, switching to One-Time shows the new pill, programmatic date change updates label via `formatDateShort`. The Task form's `tf-picker-overlay` (Difficulty/Duration/TOD/Category floating popup with positioning + custom-duration input) intentionally stays Task-form-specific — different control class than the Phase 1 ChipPicker. Solid-black-fill chip-active state (form review P11 spec violation on `+ Notes` / `+ Options` etc.) deferred to a follow-up CSS-only PR. |
| 2026-05-10 | Phase 2 — Event Form brought up to §5.23 v2. Resolves four spec-drift items listed in the v1→v2 acknowledgements section: (1) sticky `fs-footer` (Cancel + Save Changes/Add Event) added to `renderEventForm`; (2) date pill replaced inline `<input type="date">` reveal with the `fs-date-btn` pattern (button + hidden input + `.showPicker()`); (3) browser-default focus rings on text inputs/textareas inside `.bottom-sheet` suppressed via shared CSS; (4) visible disabled state on BOTH header ✓ and footer Save when title is empty, with title-input listener toggling both. | Touched `renderEventForm` (HTML), `dashboard.js openEventForm`, `calendar.html openEventForm`, `admin.html openEventFormAdmin` (matching wiring in all 3 openers). Playwright-verified end-to-end: form opens with both saves disabled, typing into title enables both, clearing disables both. Family chip remained out of scope (ROADMAP). The `is-active` mutual-exclusion between date and time pickers is no longer needed (date picker is now an OS modal); the time picker still uses inline `ef2-picker-wrap` reveal. Phase 3 (per-form propagation to Task / Recipe in admin / Reward in admin / Badge / Person / Category dedupe / etc.) is the remaining big chunk. |
| 2026-05-10 | §5.23 primitives table: `renderSwitchToggle` + `renderHelperText` flipped from "TODO Phase 1" to "Shipped 2026-05-10" (Phase 1 PR E, partial). | Two small wrapper helpers that produce existing `.form-toggle` (§5.16) and `.form-hint` markup as canonical primitives. `renderSwitchToggle` keeps the underlying `<input type="checkbox">` id so save handlers read `.checked` exactly like a raw checkbox. Smoke test: Reward form's "Approval required" migrated from a chip-toggle (visual `is-active` class + closure variable) to a real switch toggle in its own `.tf-options-row` (label-left, switch-right). The chip click handler + closure var were deleted; save now reads `mount.querySelector('#rcf_approvalRequired').checked` directly. Resolves form review P11 + the user's saved no-checkbox/use-form-toggle preference for Reward. PersonChips (the third primitive in the original PR E grouping) deferred to a separate PR — proper extraction needs to also move the unselected/primary/attending click-rules state machine, which is bigger than belongs here. |
| 2026-05-10 | §5.23 primitives table: ColorPicker row acknowledged as already-shipped — points at the pre-existing `renderColorButton(selected, inputId)` + `initColorButton(container, onChange)` exported pair in shared/components.js (Phase 1 PR D, second half). | No new code — these helpers were extracted into `shared/components.js` long before the form-system initiative (see SW v72 changelog, 2026-04-26). The table previously listed `renderColorPicker` as TODO; the rename was unnecessary and the existing names are kept (don't churn working code). Used by Person form, Category form (event-color row), Admin event/accent pickers, calendar event form, and the device theme sheet. Same hidden-input pattern as ChipPicker/EmojiPicker so save handlers read `.value` directly. PR D fully closed out (EmojiPicker shipped + ColorPicker documented). Phase 1 PR E (PersonChips + SwitchToggle + HelperText) follows next. |
| 2026-05-10 | §5.23 primitives table: `renderEmojiPicker` + `bindEmojiPicker` flipped from "TODO Phase 1" to "Shipped 2026-05-10" (Phase 1 PR D, first half). | New `fs-emoji-grid` CSS primitive: 8-column grid, cell borders, selected = 2px accent border + ✓ overlay (matches §5.23 v2 "Selection states" #1). Optional `+` custom-entry cell that reveals a text input for OS emoji keyboard (the `+` cell is the answer to the form review's "purpose unclear" complaint about the Reward form's empty cell). Smoke test: Category form's `cf-icon-input` text input migrated to a 20-emoji curated grid + custom entry (admin.html). Hidden input keeps id `cf_icon` so save handler reads `.value` unchanged. End-to-end Playwright verified by injecting helper into a live page and clicking through default/select/custom paths. ColorPicker (other half of original PR D plan) deferred to a separate small PR — `cpick-` already exists and just needs to be promoted to a documented helper. |
| 2026-05-10 | §5.23 primitives table: `renderChipPicker` + `bindChipPicker` flipped from "TODO Phase 1" to "Shipped 2026-05-10" (Phase 1 PR C). | First short-list picker primitive shipped on `feat/fs-chip-picker` branch. Anchors on existing `.tabs.tabs--pill` (no new CSS — reuses the slot picker's visual). Helper produces a row of pills + a hidden input keyed under `hiddenId` so `document.getElementById(hiddenId).value` works exactly like a native `<select>` for save handlers. `bindChipPicker()` wires click-to-select with `allowClear` toggle (clicking active chip clears). Smoke test: Recipe form's Difficulty migrated from native `<select>` to a 3-pill chip picker (Easy/Medium/Hard) — Playwright verified single-select, allow-clear, and switch-selection behaviors. AI auto-fill code in `kitchen.js` updated to sync the visual chip state when programmatically setting the hidden value. The Task form's `tf-picker-overlay` (Difficulty/Duration/TOD/Category as a positioned floating popup with state closures) is intentionally NOT covered by this primitive — it's a different control class (popup, not inline chip row) and stays Task-form-specific until a separate `renderPopupPicker` primitive is built. `<InlineRevealField>` deferred per YAGNI — `ef2-field-reveal` works inline; will extract when Phase 3 needs it. |
| 2026-05-10 | §5.23 primitives table: `renderTimeInput` flipped from "TODO Phase 1 (extract existing)" to "Shipped 2026-05-10" (Phase 1 PR B closeout). | Pure refactor — extracted the existing 6-element AM/PM picker from `renderEventForm` into a shared helper. Event Form's time-picker DOM is byte-identical to before (still uses `.ef2-time-*` CSS classes — class rename deferred to Phase 3 sweep). End-to-end Playwright verified: same IDs, same values, same AM/PM toggle behavior. With this PR B is fully closed out (renderDateInput + bindDateInput + renderTimeInput all shipped). Phase 1 PR C (ChipPicker + InlineRevealField) follows next. |
| 2026-05-10 | §5.23 primitives table: `renderDateInput` + `bindDateInput` flipped from "TODO Phase 1" to "Shipped 2026-05-10" (Phase 1 PR B). | Second pair of `fs-*` primitives shipped on `feat/fs-date-input` branch. CSS: `fs-date-wrap` / `fs-date-btn` / `fs-date-hidden`. Smoke test: `rewards.js openRewardForm` Expires field migrated from raw `<input type="date">` to the pill + `.showPicker()` pattern. End-to-end DOM verification confirmed: button renders with `fs-date-btn` class, hidden input keeps `rcf_expiresAt` id (preserves save-handler wiring), label updates via `formatDateShort` on change. The split into render + bind helpers (vs one auto-wiring helper) keeps `shared/components.js` DOM-pure while letting each opener supply its own format function. Phase 1 PR C (TimeInput extraction) and Phase 3 propagation (Task one-time date, Event date, Badge date conditions) follow next. |
| 2026-05-10 | §5.23 primitives table: `renderFormFooter` and `renderFormSheetHeader` flipped from "TODO Phase 1" to "Shipped 2026-05-10" with final signatures (Phase 1 PR A). | First two `fs-*` primitives shipped on `feat/fs-form-primitives` branch. Smoke test: `kitchen.js openPlanMealSheet` migrated from inline `kp-footer`/`sheet__header` HTML to helper calls — visually identical output (Playwright verified at 412×915), all wiring (`kp_close`, `kp_cancel`, `kp_save`) intact. Disabled-save state CSS (`opacity 0.5; pointer-events: none`) lives in the new `.fs-footer` block. Existing per-form footer classes (`kp-footer`, `ef2-footer`, etc.) remain valid for forms that haven't migrated yet. Phase 1 PR B (DateInput + TimeInput) is next. |
| 2026-05-10 | §5.23 reframed v1→v2 (best-of-app composite anchor map; new mandates for sticky `fs-footer`, disabled-save state, saving-spinner rules, `fs-date-btn` date convention, two-only active-state palette, two-only selection-state palette, `fs-` shared CSS prefix, primitives-target table); §13.13 rewritten to compose from primitives instead of "match Event Form"; §12 form-sheet non-negotiable updated to enumerate the new requirements. ROADMAP appended with "Tier — Form Polish Initiative" parked feature items. | Form review ([2026-05-09-form-review.md](../superpowers/specs/2026-05-09-form-review.md)) showed the Event Form implementation diverged from the v1 §5.23 spec (no sticky footer, raw `<input type="date">`, magenta default focus rings on text inputs, solid-black-fill chip-toggles, missing Family chip). Reframing anchors each pattern on its best in-app implementation today (sticky footer = Meal Plan; date input = Meal Plan pill+showPicker; switch = Category `.form-toggle`; helper text = Category `form-hint`; inline reveal + sub-sheets + person chips = Event Form). Phase 0 of the form-polish initiative — Phase 1 builds the `fs-*` primitives, Phase 2 brings Event Form up to spec, Phase 3 propagates to every other form, Phase 4 dedupes the 3× Repeat / 3× Photo source / 2× iCal sub-sheet copies, Phase 5 is the a11y + tap-target + transition sweep. Feature-shaped findings (Family chip, avatar upload, color picker on Reward, recipe ingredient autocomplete, badge wizard, etc.) moved to ROADMAP as separate product decisions. |

Updates to this doc require the PR description to cite the section changed and the reason.

---

## Appendix A — Grep verification recipes

These commands verify the non-negotiable rules in §12. Run them as part of every PR's pre-merge checklist. They require no build tooling — standard grep only.

### A.1 No inline styles in Phase-0-scoped files

    grep -Pn 'style="' setup.html person.html shared/components.js \
      shared/calendar-views.js dashboard.js

Expected: 0 matches. (Other HTML files have deferred sweeps; see the
owning phase's spec.)

### A.2 No retired token names in styles/ or shared/ or HTML/JS source

    grep -rPn '\-\-(bg-card|bg-primary|bg-secondary|bg-nav|text-primary|text-secondary|border-color|border-light|border-subtle|accent-light|font-size-(xs|sm|base|md|lg|xl|2xl)|transition-(fast|normal)|max-width|(success|warning|danger|info)-(bg|text))\b' styles/ shared/ *.html *.js

Expected: 0 matches.

### A.3 No raw hex in components.css

    grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css

Expected: 0 matches (exceptions: `color-mix()` mathematical anchors `#fff` /
`#000` documented inline).

### A.4 No window.confirm / window.alert / bare confirm/alert

    grep -rPn '\bwindow\.(confirm|alert)\s*\(' --include='*.js' --include='*.html' .
    grep -rPn '(^|[^a-zA-Z0-9_\.])(confirm|alert)\s*\(' --include='*.js' --include='*.html' . \
      | grep -v 'showConfirm' \
      | grep -v 'shared/components\.js'

Expected: 0 matches (`showConfirm` defined in `shared/components.js` is the only
allowlisted use).

### A.5 prefers-reduced-motion present in every animating stylesheet

    for f in styles/layout.css styles/responsive.css styles/components.css \
             styles/dashboard.css styles/calendar.css styles/scoreboard.css \
             styles/tracker.css styles/admin.css styles/kid.css; do
      grep -q 'prefers-reduced-motion' "$f" || echo "MISSING: $f"
    done

Expected: no MISSING output.

### A.6 No hardcoded z-index outside the token band

    grep -rPn 'z-index:\s*\d' styles/

Expected: 0 matches for values ≥ 10 that aren't tokenized. (Single-digit
in-page layering allowed; everything else must use a `--z-*` token.) Audit
any remaining matches — each should be a pre-existing exception with an
inline `/* z-index audit: ... */` comment.

### A.7 CSS-variable runtime data uses element.style.setProperty

Runtime per-record colors (owner, person, event) propagate via `data-*-color`
attributes + JS `setProperty`, not inline `style="--var:..."` strings. This
rule is enforced by A.1; there is no standalone grep for it.

