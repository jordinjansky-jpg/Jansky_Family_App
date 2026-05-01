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
- Phone tab bar never exceeds 5 slots: Home, Calendar, Scores, Tracker, More.
- Weather, Kiosk, Vacation, Recurrence, Timer, PDF import, Delegation never become tabs.
- Kitchen (1.3+1.7), Activities (1.6) are the only backlog features that earn nav placement (inside More on phone); Kitchen's tab promotion is subject to usage review.

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
- **Header:** 56–64px. Title left, max 2 icon slots right (Bell + overflow). One title line + optional one meta line. Never 3 lines. No gradient text.
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
- 5 slots max: Home, Calendar, Scores, Tracker, More.
- Height 68px + safe-area-inset-bottom.
- Frosted glass (`backdrop-filter: blur(14px)`).
- Active item: `--accent` color + slightly heavier stroke.

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

### 5.23 Form sheet pattern (the Event Form is the canonical reference)
**Reference implementation:** `renderEventForm()` in [shared/components.js](../shared/components.js) + `openEventForm()` in [dashboard.js](../dashboard.js). Spec at [docs/superpowers/specs/2026-05-01-event-form-redesign.md](../superpowers/specs/2026-05-01-event-form-redesign.md). All other form sheets in the app (task creation/edit, recipe form, reward form, person form, list form, settings forms, etc.) must adopt this pattern — match it intentionally and document why if you deviate.

**Architecture split:**
- **HTML generator** lives in `shared/components.js` (e.g. `renderEventForm`). Pure function — no DOM access, no side effects. Returns a string. Takes `{ existing?, mode: 'create'|'edit', ...context }`.
- **DOM wiring** lives in the page-level JS (e.g. `openEventForm` in `dashboard.js`). Mounts via `taskSheetMount.innerHTML = renderBottomSheet(html)`, attaches listeners, manages state, calls Firebase writes.
- **CSS classes use a per-form prefix** (`ef2-*` for event form). New forms get a new prefix (e.g. `tf-*` for task form, `rf-*` for recipe form). Never reuse another form's prefix — keeps CSS isolated and scopeable.

**Vertical structure (top-to-bottom):**
```
sheet__header             ← title + ✕ close
ef2-title-row             ← large input + import icons (create mode only)
ef2-import-feedback       ← AI loading/error inline (reserves space; min-height)
ef2-divider               ← 1px hairline
ef2-datetime-section      ← (or whatever primary fields)
  ef2-date-row            ← date button + All-day pill on one row
  ef2-picker-wrap         ← inline collapsible date picker
  ef2-time-section        ← time button + collapsible time picker
ef2-divider
ef2-for-section           ← "For" header line + person chips below
  ef2-for-header          ← section label + Family chip inline
  ef2-person-chips        ← horizontal-scrolling row, fade gradient on right edge
ef2-divider
ef2-secondary-row         ← + Notes / + Location / + Repeat dashed chips
ef2-field-reveal × N      ← progressive disclosure (notes textarea, location input)
ef2-footer                ← STICKY: Cancel + primary action
ef2-delete-zone           ← edit-mode only, below sticky footer
```

**Padding rules (critical):**
- **Form sections have NO horizontal padding.** `.bottom-sheet__content` already supplies the single layer of `var(--spacing-md)`. Adding more on each section double-indents content and the title sits flush-left while everything else is squeezed inward. Use vertical padding only on sections.
- Title row uses `padding: var(--spacing-xs) 0` (tight vertical, no horizontal).
- Datetime/For/secondary sections use `padding: var(--spacing-sm) 0`.
- Padding above and below each section should match (no asymmetric gaps between visual blocks).

**Sticky footer pattern (the ef2-footer rule):**
The footer needs to break out of `.bottom-sheet__content`'s padding so it spans edge-to-edge AND stick to the bottom of the scrollable container.
```css
.ef2-footer {
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
.ef2-footer .btn { flex: 1; }
```
- Negative side+bottom margin breaks out of `.bottom-sheet__content` padding.
- Footer's own padding brings content back to the right indent.
- `bottom: 0` (NOT a negative value) — sticks to the visible bottom of the scrollable container.
- `safe-area-inset-bottom` for notched devices.

**Sub-sheet stacking (when a form opens another sheet):**
Use a SECOND overlay (`.ef2-subsheet-overlay`) on top of the existing bottom-sheet, NOT a navigation push. The Repeat sub-sheet, Photo source picker, and iCal URL prompt all use this pattern. Animate up from bottom; close removes from DOM after the transition. Returning to the parent form re-mounts via `openEventForm(existingId, savedFormState)` — see "Form state preservation" below.

**Form state preservation across sub-sheets:**
Inner function `captureFormState()` serializes the live form to a plain object before navigating to a sub-sheet. On return, the parent form re-renders with `existingId` and `savedState` so the user's in-progress edits don't vanish. Capture EVERY field including transient UI state (`notesOpen`, `isFamilyMode`) — fields that only exist in DOM state will be lost on round-trip otherwise. The `event` object passed to the renderer accepts these transient flags as overrides (`event.notesOpen ? ' is-open' : ''`).

**Inline pickers (date / time / repeat day selector):**
Use `<div class="ef2-picker-wrap">` with `max-height: 0; transition: max-height 0.2s ease;` collapsed; `is-open` class sets `max-height: <enough-for-content>`. Tapping the trigger button toggles `is-open`. Tapping the inline input or selecting a value collapses it. Multiple pickers in the same section are mutually exclusive (opening one closes the others).

**Time picker (replace `<input type="time">` everywhere):**
Native `<input type="time">` on Android = the awful number wheel. Use the 6-select pattern from `renderEventForm`: hour (1-12, 42px) + colon + minute (5-min increments, 46px) + AM/PM (50px), then arrow → repeat for end time. Helpers `ef2ParseTime`, `ef2HourOpts`, `ef2MinOpts`, `ef2AmPmOpts` already exist in `shared/components.js` — reuse them.

**Person chip state machine:**
- **Unselected**: gray chip, color dot before name (uses `--chip-color` per-chip CSS var set via JS).
- **Primary** (`data-state="primary"`): solid fill in person's color, white text.
- **Attending** (`data-state="attending"`): outlined in person's color, person color text.
- **Family** chip (`.ef2-person-chip--family`) uses `--accent` not a person color; lives next to the section label, not in the scrollable row.
- Click rules: unselected → primary if no primary set, else attending. Attending → primary (demote old). Primary → deselect (promote first attending).
- Set `--chip-color` after mount: `chip.style.setProperty('--chip-color', chip.dataset.personColor)`.
- Container is `flex-wrap: nowrap; overflow-x: auto` with a `mask-image` fade gradient on the right edge for scroll affordance. Hide scrollbar.

**Add chips (Notes / Location / Repeat / etc.):**
- Dashed border when off, solid border when active. Same color either way (no big visual weight change).
- Toggle the reveal: tap once to open and focus, tap again to close. The ✕ button inside the reveal is a secondary close path.
- `min-height: 32px`, `padding: 4px 10px`, `font-size: var(--font-sm)`. Compact — these are not primary actions.

**Title input focus:**
`outline: none; box-shadow: none; border-color: transparent;` on `:focus`. The input is large enough that browser focus chrome reads as visual noise. Validation failure uses a shake animation + bottom-border in `--danger`.

**Icon button focus:**
`outline: none; background: var(--surface-2); color: var(--text);` on `:focus-visible`. NOT an outline ring — that lingers visibly when the icon's sub-sheet opens on top of the form and looks broken.

**Validation:**
- Required fields: pulse-shake animation + red bottom-border. Don't show inline error text; the shake is enough.
- No `window.confirm` or `window.alert`. Use inline confirm patterns (e.g. delete zone with "Delete this? [Delete] [Keep]" buttons that toggle visibility) or the shared `showConfirm()` helper.

**AI integration in forms:**
- Inline NL parse (magic wand): single tap → fills fields. Show error inline below the title for ~3s then fade. Use a stored `errDismissTimer` so a second tap clears the first timer (don't clobber a fresh error with a stale timeout).
- Photo / URL / file imports: open a picker sheet. Optional context input above the source buttons — pre-fill from the title field if non-empty. The context goes to the AI as `input.context` and the prompt must be designed to honor it.
- Heuristic-only on auto-runs (free, instant). AI on explicit user action (wand button, import tap). See §13.13 "Form authoring recipe" for the full pattern.

**Edit-mode delete zone:**
Below the sticky footer, separated by a visible gap. Destructive red text style. Tap reveals inline confirm (`Delete this event? [Delete] [Keep]`) — never a separate sheet, never `window.confirm`. On error, route message through the same `ef2_importError` slot the save errors use.

**Don'ts:**
- ❌ Don't use `<input type="time">` (the wheel).
- ❌ Don't add horizontal padding to form sections — `.bottom-sheet__content` provides it.
- ❌ Don't use outline rings on focus inside the form — use background tint.
- ❌ Don't push a new bottom-sheet for sub-flows; stack with `.ef2-subsheet-overlay`.
- ❌ Don't lose form state when navigating to a sub-sheet — `captureFormState` + `savedState` pass-through is required.
- ❌ Don't put inline `style=""` in HTML — set CSS vars via JS (`element.style.setProperty('--var', value)`) instead.
- ❌ Don't reuse another form's CSS prefix. Pick a new one (`tf-*`, `rf-*`, etc.).

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
8. **FAB** + **Bottom nav** — FAB pre-fills `viewDate` and `activePerson`. Phone tab bar = 4 slots (Home · Scores · Tracker · More); 5th slot reserved for Kitchen or Activities, whichever earns promotion first.

**Tablet:** two-pane. **Left pane** (~520px) = action surface (Header + Banner are full-width above; left pane has Today section + filter chip). **Right pane** (~380px) = day's context (Ambient strip 1-up vertical → Coming up always-expanded → Events). FAB lives bottom-right of the right pane.

**Kiosk:** dashboard doesn't exist; kiosk uses its own `display.html` week-grid layout. Dashboard sections reflect onto kiosk per the reflection table in the final-form spec §2.4.

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
- **More tab (phone) / left rail entry (tablet)** — *primary.* Direct navigation. Discoverable for both adults and kids regardless of scoreboard-checking habits. This is the one that makes the Store feel like a real destination rather than a scoreboard sub-feature.
- **Scoreboard balance card → "Open Store" CTA** — *contextual.* You're already looking at points; tapping through is natural. Demoted from primary in favor of the More-tab entry.
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

**Audience parity rule:** The adult experience and kid experience must use the same card patterns, same tab order, same balance display. Audience-specific differences are **flow-level only** (approval gates), not **layout-level** (no separate adult-only Store page or kid-only tabs). This is what the Phase 6 rework (see plan `2026-04-19-ui-rework.md`) establishes — today's adult-in-Scoreboard experience is out of compliance with this rule.

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

**Purpose:** Combined home for meal planning and shared shopping lists — supersedes the standalone 1.3 Meals and 1.7 Shopping backlog items.

**Layout:**
- Header: `Kitchen` + top-level Tabs: `Meals | Shopping`.
- **Meals tab:** week-at-a-glance meal planner. Rows = days; columns = slots (Breakfast / Lunch / Dinner / Snack). Tap a slot → meal picker sheet with library autocomplete. `.card.card--meal` for library rows. FAB: add/plan a meal.
- **Shopping tab:** shared grocery lists. Sub-Tabs: Grocery | Costco | Target | +. List rows: `.card.card--shopping`, checkbox in leading slot, strikethrough + sink on check. FAB: add item. Autocomplete from past items. Category grouping optional.
- Meal library management (add/edit/archive saved meals) lives in the Meals tab overflow menu, not in Admin.

**Kid view:** read-only Tonight's Dinner tile; optional shopping peek for lists marked kid-visible.
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

### 10.4 User customization
- Theme: preset picker in Settings → Appearance.
- Density: Settings → Appearance → `Comfortable` (default) / `Compact`. Compact reduces card min-height by 8px and padding by 4px; nothing else.
- Owner colors: set per person in People detail → Profile → Color (swatch picker, 10 options).

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
- ❌ Do not build a new form sheet without following §5.23 (Form sheet pattern). The Event Form is the canonical reference. Don't use `<input type="time">`, don't add horizontal padding to form sections (the bottom-sheet provides it), don't use outline focus rings inside a form, don't push a separate bottom-sheet for sub-flows (use `.&lt;prefix&gt;-subsheet-overlay`), don't lose form state across sub-sheets (`captureFormState` + `savedState` pattern).
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

### 13.13 Form authoring recipe (build a new form to match Event Form)

When porting an existing form (task, recipe, person, reward, list, etc.) to the new pattern, follow these steps in order. The Event Form is the reference — read §5.23 alongside this recipe.

**Step 1 — Pick a CSS prefix.** New prefix per form. Examples: `tf-` task form, `rf-` recipe form, `pf-` person form. Append your CSS block to `styles/components.css` after the existing form sections; bracket it with `/* ── <Form name> ─────── */` and `/* ── End <Form name> ── */` comments.

**Step 2 — Add the renderer to `shared/components.js`.** Pure HTML generator, exported. Signature: `renderXForm({ existing?, mode: 'create'|'edit', ...context })` returning a string. Mirror the section order from §5.23. Use `esc()` on every interpolated value. Do not call `document.*` from this function.

**Step 3 — Add the wiring function to the page-level JS.** Signature: `openXForm(existingId = null, savedState = null)`. Pattern matches `openEventForm`:
1. Resolve `event = savedState || (existingId ? collection[existingId] : {})`.
2. Set `mode` from `existingId`.
3. `taskSheetMount.innerHTML = renderBottomSheet(renderXForm({ event, eventId: existingId, ...context, mode }))`.
4. Apply per-element CSS vars via JS (e.g. `chip.style.setProperty('--chip-color', chip.dataset.personColor)`).
5. `requestAnimationFrame` to add `.active` and focus the first input in create mode.
6. Wire all listeners.
7. Define `captureFormState()` inner function — must serialize EVERY field including transient UI state.
8. Save handler: validate, build object, call Firebase write, `closeTaskSheet()`, `render()`. On error: re-enable button, show error in the import-feedback slot.

**Step 4 — Reuse helpers, don't recreate.** From `shared/components.js`: `ef2ParseTime`, `ef2HourOpts`, `ef2MinOpts`, `ef2AmPmOpts` for time pickers. From `shared/ai-helpers.js`: `resizeImageForUpload`, `renderConfirmRow`, `openMonthClarificationSheet`. From `shared/components.js`: `renderBottomSheet`, `showConfirm`, `showToast`. Don't import per-form variants.

**Step 5 — Sticky footer.** Copy the `ef2-footer` CSS block, rename the prefix. Don't try to use the global `.sheet__footer` — it doesn't break out of the bottom-sheet padding the same way. The sticky-footer rule from §5.23 is non-negotiable.

**Step 6 — Form sections get NO horizontal padding.** Vertical only. The bottom-sheet content provides the single layer of horizontal padding. Verify on a 360px-wide viewport — title and section content should sit at the same left edge.

**Step 7 — Focus styling.** Title input: `outline: none; box-shadow: none; border-color: transparent` on `:focus`. Icon buttons: `outline: none; background: var(--surface-2)` on `:focus-visible`. NEVER an outline ring inside a form sheet.

**Step 8 — Validation.** Required field empty on save? Pulse-shake the field with a red bottom border. No inline error text — the shake is enough. Use the same `<form-prefix>-shake` keyframe pattern as `ef2-shake`.

**Step 9 — Sub-sheets.** If the form has any "secondary picker" flow (recurrence, source picker, list picker), use a second `<div class="<prefix>-subsheet-overlay">` appended to `document.body`. Capture form state before opening; on cancel/return, re-call `openXForm(existingId, savedState)`.

**Step 10 — Edit mode delete.** Below the sticky footer in a `<form-prefix>-delete-zone`. Inline confirm with two buttons. Never `window.confirm`. Hide the trigger button when the confirm is open; restore on "Keep".

**Step 11 — AI features (if applicable).** Wand for NL parse fills directly. Photo/file import opens a source picker sheet with an "Optional note for AI" input pre-filled from the title field. Worker calls always have a fallback (heuristic for dedup, no-op for autofill). Errors show in the import-feedback slot, auto-dismiss after 3s using a stored timer (clear before setting a new one).

**Step 12 — Bump the SW cache** (`sw.js` `CACHE_NAME`) when you ship. New version number, add a one-line comment in the changelog block.

**Step 13 — Update this doc.** If your new form deviates from §5.23 in any way, document the deviation here in §13 with a named example. Drift compounds — a one-off "this form is special" becomes the next person's reference if it isn't called out.

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
| 2026-04-19 | v1.0 initial spec | Design audit + rework planning |
| 2026-04-24 | §6.9 person-mode parity rule + mount-point shell parity; §12 added three non-negotiables (no `!linkedPerson` core-control gates, no `header-height` on wrapper padding, single-gutter rule) | Phase 1 + 1.5 shipped with `!linkedPerson` hiding bell/overflow/filter chip and a missing `#fabMount` in `person.html`; also surfaced double-counted header-height and double horizontal gutter after the card density pass. Codifying so future work doesn't regress. |
| 2026-04-25 | §6.1 dashboard rewritten as 8-section final form (adds Coming up rail, codifies ambient strip default, defines tablet two-pane split, declares kiosk reflection); §6.9 retired the `Viewing as {Name}` pill; §7.3 expanded banner-mount list to scoreboard + tracker and documented overdue body-tappable + `--info` sub-uses; §5.9 documented `--info` sub-uses. | Final-form dashboard design spec ([2026-04-25-dashboard-final-design.md](../superpowers/specs/2026-04-25-dashboard-final-design.md)) approved after Phase 2 calendar shelving made the dashboard the only phone-side surface for forward-look. Doc edits ride in the same PR that ships the spec so docs stay coherent ahead of implementation. |
| 2026-05-01 | §5.23 Form sheet pattern (Event Form as canonical reference) + §13.13 form authoring recipe + §12 non-negotiable for new forms. | Event Form Redesign ([2026-05-01-event-form-redesign.md](../superpowers/specs/2026-05-01-event-form-redesign.md)) shipped. Pattern cascades to all other forms (task, recipe, person, reward, list, settings). Codifying so the next form session matches without reinventing — sticky-footer breakout, no horizontal padding on sections, custom time picker (no native wheel), inline pickers, person chip state machine, sub-sheet stacking via second overlay, captureFormState round-trip. |

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

