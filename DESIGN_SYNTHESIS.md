# Design Synthesis — Jansky Family App
*Generated 2026-05-04 from DESIGN_REVIEW.md + full codebase read*

---

## Session Notes

| Session | Date | Status | Sections complete |
|---------|------|--------|-------------------|
| 1 | 2026-05-04 | Complete | All — Part 1 (1.1–1.14) + Part 2 (2.1–2.18) |

If context is lost mid-implementation, resume from the Priority Order table in §2.18. Every section in Part 2 is tagged with a Priority tier (P0 = fix now, P1 = next sprint, P2 = planned improvement) to guide sequencing.

---

## Part 1 — Inconsistency Audit

### 1.1 Undefined CSS Tokens

Several tokens are referenced throughout the codebase but never defined. CSS silently ignores undefined custom properties, causing invisible fallback failures.

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| `--radius` (bare) used without fallback | `dashboard.css` line 105, `components.css` lines 1660+, multiple other files | `--radius-sm/md/lg/xl/full` all exist; bare `--radius` does not | Complete buttons render with `border-radius: 0` — sharp corners on the app's most-used action button |
| `--font-base` used without fallback | `dashboard.css` line 107 (`font-size: var(--font-base)`) | `--font-md` (1rem) exists but `--font-base` does not | Complete button text may render at inherited size, not the intended 1rem |
| `--accent-success` referenced in `kid.css` | `kid.css` — balance positive amount, message overlay positive amount (6+ places) | Falls back to hardcoded `#38a169` (light-mode green) | Dark-mode kids see a washed-out green that ignores the theme's `--success: #7fc49a` |
| `--accent-danger` referenced in `kid.css` | `kid.css` — balance negative amount, message overlay negative amount (6+ places) | Falls back to hardcoded `#e53e3e` (light-mode red) | Dark-mode kids see oversaturated red that ignores the theme's `--danger: #e28a5c` |
| `--border-subtle`, `--surface-alt`, `--radius-pill`, `--surface-highlight` | `admin.css` various | Used with no fallback in admin card borders and toggle surfaces | Admin UI may silently inherit wrong colors on theme change |

---

### 1.2 Dark Mode Token Gaps

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Grade colors defined in `:root` but NOT overridden in `[data-theme="dark"]` | `base.css` lines 19–24 (`:root`), dark block lines 126–150 (no grade tokens) | Light: `--grade-b: #1565c0` (navy blue). Dark background is `#141413`. Navy on near-black = near-invisible | Grade-B badges and sparkline bars are unreadable on all dark themes |
| `[data-theme="dark"]` block missing `--shadow-sm/md/lg` overrides | `base.css` dark block | Light shadows use `rgba(0,0,0,0.06/0.08/0.10)` — still renders on dark but creates muddy lifted look instead of clean separation | Cards float awkwardly on dark surfaces; dark surface + dark shadow = no perceived depth |
| `@media (prefers-color-scheme: dark)` block duplicated verbatim from `[data-theme="dark"]` | `base.css` lines 152–178 | First-paint fallback is correct, but both blocks must be kept in sync manually; there is no single source | When a grade-color dark override is eventually added to `[data-theme="dark"]`, the OS-pref block will remain stale unless remembered |

---

### 1.3 Card / Surface System Fragmentation

Three card implementations coexist with incompatible structures, spacing, and border treatments.

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| `.card` defined twice | `components.css` line 3 (simple panel: `background/border-radius/border`) and line 1660 (Phase 1 task card: `min-height:60px`, `::before` stripe pseudo-element, `border-radius: var(--radius-lg)`) | Second definition overrides first — any element using `.card` for a simple panel may silently inherit task-card min-height and stripe | Panel cards (grades card, scoreboard balance card) pick up task-card rules they shouldn't |
| `.task-card` (legacy) vs `.card` (Phase 1) | `components.css` line 803 (`.task-card`) vs line 1660 (`.card`) | Legacy: `min-height:68px`, `border-left: 3px solid var(--owner-color)`, `box-shadow: var(--shadow-sm)`. Phase 1: `min-height:60px`, `::before` pseudo stripe (4px), no shadow | Two task card styles differ in height, shadow, and stripe technique — both render on different pages |
| Left-stripe approach | Legacy `.task-card` uses `border-left: 3px`. Phase 1 `.card::before` uses 4px pseudo-element. Calendar event pills use `border-left: 3px` directly | Three implementations for the same visual concept | Stripe width and approach inconsistent across dashboard (4px pseudo), tracker (legacy 3px border), calendar event pills (3px border) |

---

### 1.4 Typography Fragmentation

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Six different section heading styles | `.section__title` (components.css), `.form-label` (components.css), `.ef2-section-label` (components.css), `.rewards-section-heading` (rewards.css), `.bell-dropdown__section-head` (components.css), `.admin-section-header` (admin.css) | Font size, weight, color, transform, and spacing all differ per class | Sub-headings look like six different apps. No visual hierarchy consistency across pages |
| Hardcoded px font sizes in calendar | `calendar.css`: `.event-pill { font-size: 8px }`, `.event-pill__time { font-size: 7px }`, `.cal-grid__overflow { font-size: 7px }` | Rest of app uses `var(--font-*)` tokens | 7–8px text is unreadable on any phone. Text is below WCAG minimum. Not scalable if font scale tokens change |
| Hardcoded `1.75rem` for streak numbers | `scoreboard.css` lines 178, 199 | App type scale has `--font-xl: 1.375rem`, `--font-2xl: 1.5rem`, `--font-3xl: 2.25rem` — 1.75rem sits between tokens | Streak numbers are not part of the token scale; if the scale changes, streak numbers won't track |
| `10px` spark label in scoreboard | `scoreboard.css` line 279: `font-size: 10px` | `--font-xs: 0.75rem` (12px) is the token floor | Spark labels are below token floor; will not scale with user accessibility settings |

---

### 1.5 Color Hardcoding

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Admin debug panel | `admin.css`: `.debug-panel { background: #1a1a2e; color: #e0e0e0 }`, `.debug-panel__title { color: #ffd93d }` | All other components use `var(--*)` tokens | Debug panel is always dark navy regardless of theme. On dark-warm theme (also dark), it blends; on light themes it's a jarring dark rectangle |
| PWA `theme_color` | `manifest.json`: `"theme_color": "#6c63ff"` | No theme preset uses `#6c63ff` (old purple accent). Dark theme accent is `#64b7a8` (teal), light theme is `#5b7fd6` (blue) | Android status bar shows purple regardless of which theme is active |
| PWA `background_color` | `manifest.json`: `"background_color": "#1a1a2e"` | Most users use light-warm theme with `--bg: #f7f6f2` | Splash screen shows dark navy before app loads on light-theme devices |
| `index.html` meta theme-color | `<meta name="theme-color" content="#6c63ff">` | Same purple mismatch as manifest | Browser chrome shows purple on all non-light themes |

---

### 1.6 Person / Owner Selection Chip Fragmentation

Four chip patterns do the same job (select a person) with incompatible active states and sizing.

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| `.owner-chip` | Admin task form, components.js | Circular avatar dot + name. Active: filled accent background | Used only in admin |
| `.person-pill` | Dashboard filter, tracker filter, calendar filter | Rounded pill, person color dot. Active: `background: var(--accent-soft); color: var(--accent)` | Used in main filter bars |
| `.chip--selectable` | Event form (ef2-*) | Border + fill pattern. Active: `background: var(--accent-soft); border-color: var(--accent)` | Used only in event form |
| `.template-chip` | Admin people chips in some sections | Different padding, no color dot | Inconsistent with all others |
| **Impact** | Switching between pages | Active state appearance changes: color dot vs border ring vs background fill | Users cannot build a mental model of "selected person" |

---

### 1.7 Interactive State Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Press feedback on task cards | Phase 1 `.card:active { transform: scale(0.997) }` | 0.3% scale change is physically imperceptible — less than 1px on a 300px card | Cards feel unresponsive; users re-tap and trigger double-actions |
| Press feedback on detail action rows | `.task-detail__action-row:active { background: var(--bg-hover) }` | Background tint — much more visible than 0.997 scale | Press feedback is inconsistent: cards feel broken, rows feel responsive |
| Press feedback on list rows (scoreboard, kitchen) | `sb-balance-row:hover { background: var(--surface-2) }` | Hover only — no `:active` rule | On touch devices with no hover, these rows give zero feedback |
| Focus ring | `input:focus { box-shadow: 0 0 0 3px var(--accent-soft) }` (base.css) vs `.ef2-title-input:focus { outline: none; box-shadow: none }` vs no explicit focus on many interactive elements | Three different approaches to focus | Keyboard navigation (for accessibility) unpredictable |

---

### 1.8 Navigation System Fragmentation

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Dual nav class names | `renderNavBar()` in components.js emits each item with BOTH `.bottom-nav__item` AND `.nav-item` CSS classes simultaneously | `layout.css` has rules for `.nav-item` (legacy). `components.css` has rules for `.bottom-nav__item` (Phase 1). Both sets of rules apply | Nav items inherit from two conflicting rule sets; any styling change must be made in two places or the result is unpredictable |
| 5-column bottom nav grid | `layout.css`: `grid-template-columns: repeat(5, 1fr)` | Only 4 items render (Home, Scores, Tracker, More) | Empty 5th column creates visible right-edge whitespace in the nav bar |
| Active state — color only | Nav active state uses `color: var(--accent)` and `stroke-width: 2` | No background indicator, no underline, no dot | Icon color change alone is subtle, especially on dark themes where accent (teal) is close to muted text |
| Legacy header | `layout.css` `.header__title` uses `background: linear-gradient(135deg, var(--text), var(--accent)); -webkit-background-clip: text` | DESIGN.md explicitly prohibits gradient text in chrome | Gradient text in admin, setup, scoreboard headers when legacy header is active |

---

### 1.9 Bottom Sheet Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Sheet content scroll wrapper | Some sheets use `.bottom-sheet__content` (components.css class); others use bare `div` children | Sheet scrolling behavior depends on which wrapper is used | Inconsistent scroll behavior; some sheets don't scroll properly on short screens |
| Sheet footer pattern | Event form uses sticky footer with negative-margin breakout (§5.23). Admin forms use plain `div` at bottom of scroll area | Admin form save/cancel buttons can scroll off-screen on small phones | Admin users may lose access to save button on long forms |
| Sub-sheet stacking | Event form uses `.ef2-subsheet-overlay` stacked on top of parent sheet. Other multi-step flows (task delegation, rewards filter) push new bottom sheets | Stacking vs replacement creates different back-navigation UX | Visual disruption when some sub-flows slide the parent away vs overlay on top |

---

### 1.10 Empty, Loading, and Error State Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| No shared loading skeleton | Dashboard shows text "Loading…" during Firebase fetch. Scoreboard shows nothing. Calendar renders empty grid. Tracker renders empty list | No consistent loading pattern across any page | First paint is jarring: layout shifts when data arrives; users unsure if page is working |
| Empty state copy varies | Dashboard "No tasks for today" vs Calendar "No events" vs Kitchen "No items in this list" vs Rewards "No rewards set up yet" | Copy style varies from functional to warm | Missed opportunity to provide next-action guidance. Functional copy vs dead-end copy on same app |
| Error states mostly absent | Most pages have no rendered error state if Firebase read fails | One-shot Firebase reads (scoreboard, tracker) silently show empty | Silent failure — users don't know if zero items is correct or if the app is broken |

---

### 1.11 Spacing Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Double horizontal indent | Some pages add `padding: 0 var(--spacing-md)` to inner `.section` elements. `.page-content` / `.app-shell` already provides the horizontal gutter | Produces double indentation — cards appear narrow, with 32px margins instead of 16px | Most visually obvious bug on tracker and admin pages where sections have their own horizontal padding |
| Section heading `margin-top` | `.rewards-section-heading:first-child { margin-top: 0 }` — only rewards removes top margin on first heading. Other pages retain margin on every heading | Inconsistent gap between page top and first section heading | Dashboard and tracker have visible top gap after tabs; rewards does not |
| Hardcoded spacing in scoreboard | `scoreboard.css`: `margin-left: 4px`, `margin-top: 3px`, `margin-top: 4px` — at least 5 instances of hardcoded pixel spacing | Spacing tokens (`--spacing-xs: 4px`) exist but aren't used consistently | Minor visual rhythm inconsistency; will drift if spacing tokens ever change |

---

### 1.12 Motion and Animation Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Tracker has slide transition; dashboard does not | `tracker.css`: `trkSlideNext / trkSlidePrev` animations on period change | Dashboard day navigation has no transition animation | Navigating days on dashboard feels abrupt; tracker feels polished |
| Card press scale imperceptible | `.card:active { transform: scale(0.997) }` | Buttons use `opacity: 0.75` on `:active` — clearly visible | Inconsistent feedback intensity; cards feel dead |
| Celebration animation present; no other page entry animations | `dashboard.css` `celebrationPop` | Tracker slides. Nothing else animates | Motion vocabulary is incomplete — celebration feels like an isolated flourish |
| `prefers-reduced-motion` handled in two places | `responsive.css` applies to `*` globally (all animations). Individual files (`tracker.css`, `dashboard.css`) also have their own `@media (prefers-reduced-motion)` blocks | Redundant, potentially conflicting | Reduced-motion may suppress animation twice or redundant `!important` overrides interfere |

---

### 1.13 Tap Target and Touch Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| Tap vs long-press timing varies by page | CLAUDE.md: 500ms on tracker, 800ms on calendar/kid/dashboard | Different pages have different long-press windows | Users who learn the timing on dashboard (800ms) will struggle on tracker (500ms) |
| Tracker `.day-block__slot` min-height 32px | `kitchen.css` `.day-block__slot { min-height: 32px }` | Recommended minimum touch target: 44px (Apple HIG) / 48dp (Material) | Meal slot rows in Kitchen are below minimum touch target |
| Shopping list item rows | No explicit min-height on list item rows in kitchen.css | Task cards have explicit `min-height: 60px` | Shopping items are denser than task cards with no tap-size compensation |

---

### 1.14 Other Inconsistencies

| Inconsistency | Where | Conflict | Impact |
|---|---|---|---|
| `<details>` element in kid bank | `kid.html` uses OS-native `<details><summary>` for the reward bank section | All other collapsible sections use custom JS toggle with animated chevron | Kid bank section renders browser-native disclosure triangle — looks like a form control, not a family app |
| Confirm modal button alignment | `showConfirm()` in components.js aligns buttons to the right (standard web/desktop) | iOS native dialogs and all other sheets use full-width bottom-anchored buttons | Confirm dialogs look web-native, not app-native |
| PWA manifest name | `manifest.json`: `"name": "Family Hub"` | `settings.appName` is user-configurable from admin | Home screen icon always shows "Family Hub" regardless of family's custom app name |
| Admin `<input type="checkbox">` usage | Some admin settings use bare `<input type="checkbox">` | CLAUDE.md: "Never use checkboxes in admin UI — always use `.form-toggle` component" | Admin settings inconsistent: some sections toggle, others checkbox |
| Bell dropdown section heading class | `components.js` bell renders `.bell-dropdown__section-head` | Page content uses `.section__title`, `.ef2-section-label`, etc. | One more variant in the section-heading proliferation (covered in 1.4 but also a bell-specific inconsistency) |

---

## Part 2 — Design Improvement Plan

### 2.1 Token System — Fix Undefined Tokens

*These are quick fixes that unblock every other improvement. Priority P0.*

1. **Define `--radius: var(--radius-md)`** in `base.css` `:root`. This is the most urgent single-line fix — it immediately gives the complete button proper rounded corners.

2. **Define `--font-base: var(--font-md)`** in `base.css` `:root`. Aliases the missing token to the existing 1rem token.

3. **Add grade color overrides to `[data-theme="dark"]`** in `base.css`. Exact values:

   ```css
   --grade-a: #4caf76;   /* softer green visible on dark */
   --grade-b: #5b9bd5;   /* softer blue visible on dark */
   --grade-c: #e8c55a;   /* warm yellow on dark */
   --grade-d: #e88a4a;   /* orange on dark */
   --grade-f: #e06060;   /* softer red on dark */
   ```
   Update the OS-pref dark block to match.

4. **Replace `var(--accent-success, #38a169)` with `var(--success)`** everywhere in `kid.css` (6+ instances). Replace `var(--accent-danger, #e53e3e)` with `var(--danger)`.

5. **Define and add the missing admin tokens** to `base.css`: `--border-subtle: color-mix(in srgb, var(--border) 60%, transparent)`, `--surface-alt: var(--surface-2)`, `--radius-pill: var(--radius-full)`, `--surface-highlight: color-mix(in srgb, var(--accent) 8%, transparent)`.

6. **Add `--shadow-sm/md/lg` dark overrides** in `[data-theme="dark"]`: use `rgba(0,0,0,0.25/0.35/0.45)` so cards have visible depth separation on dark surfaces.

---

### 2.2 Typography — Font System

**Current state:** Pure system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`). No brand typeface. Type scale uses tokens consistently except for 4 hardcoded sizes.

**Decision needed:** What should the app's typographic personality be?

**Option A — Stay on system fonts (keep current)**
Pros: Zero latency, no font loading FOUT, perfectly native feel, matches iOS/Android UI conventions. Cons: No visual differentiation from native OS apps; "Daily Rundown" and "iOS Calendar" feel the same. No brand identity.

**Option B — Single brand font via Google Fonts**
Load one variable font (e.g., *Plus Jakarta Sans* or *Nunito*) for all text. Pros: Consistent character across all devices/OSes; distinctive but readable. Cons: 50–100ms additional first-render latency (mitigated by `font-display: swap` + service worker precaching); one more dependency. Risk: FOUT on first load before SW caches it.

**Option C — Two-font pairing: display + body**
Load a distinctive display face (e.g., *Syne* or *Fraunces*) for headings only, keep system stack for body. Pros: Maximum visual character with minimal body-text latency. Cons: Two font loads; more CSS complexity; matching contrast between display and body needs care.

**Recommended: Option B — Plus Jakarta Sans.** A rounded, humanist sans-serif. Friendly without being childish. Strong numeric forms (important for grades/points display). Available as variable font (one request covers all weights). Precache in SW. This is the right investment for a "Skylight competitor" — system fonts feel utilitarian, not designed.

**Implementation notes regardless of font choice:**
- Fix hardcoded 7–8px calendar event pill font sizes → minimum `var(--font-xs)` (12px) with text truncation
- Fix hardcoded `1.75rem` streak numbers → add `--font-display: 1.75rem` token if this is a deliberate size
- Fix hardcoded `10px` spark labels → use `var(--font-xs)` (12px) with optional `transform: scale(0.9)`

---

### 2.3 Card System Consolidation

**Current state:** Three card implementations (`.card` panel, `.card` task, `.task-card` legacy) with two definitions of `.card` in the same file.

**Directive:** Consolidate to a single `.card` base class with variants:

- `.card` — base surface: `background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg)`
- `.card--task` — adds left stripe via `::before` pseudo-element (4px, `background: var(--owner-color)`)
- `.card--task.is-complete` — reduced opacity (0.6) + faded stripe
- `.card--flat` — no shadow, no border (for items inside an already-bordered container)
- `.card--interactive` — adds `:active` press state (see §2.6)

Remove the duplicate `.card` definition at line 1660. Remove `.task-card` from `components.css` once all pages are migrated to `.card--task`. The left stripe should use 4px (Phase 1 spec), not 3px (legacy). Eliminate the `box-shadow` on task cards — border + stripe is sufficient; shadow creates visual noise in lists.

---

### 2.4 Section Heading Normalization

**Current state:** Six different section heading classes with inconsistent font size, weight, color, transform, and spacing.

**Directive:** Define one canonical section heading component class in `components.css`:

- `.section-label` — body: `font-size: var(--font-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: var(--spacing-xs)`
- `.section-label--inline` — for row-level labels (like inside a detail sheet header): `margin-bottom: 0; font-size: var(--font-xs)`
- `.section-label--first` — removes top margin when it's the first element in a scroll container

Migrate all six existing variants to use `.section-label` with appropriate modifiers. Retire `.section__title`, `.form-label` (where used as a section label — not field label), `.ef2-section-label`, `.rewards-section-heading`, `.bell-dropdown__section-head`, and `.admin-section-header`. Update DESIGN.md §5 component catalog.

---

### 2.5 Person Selection Chip Normalization

**Current state:** Four chip patterns (`.owner-chip`, `.person-pill`, `.chip--selectable`, `.template-chip`) doing the same job with incompatible active states.

**Directive:** Standardize on the `.chip` base + modifier pattern already used by the event form:

- `.chip` — base: `border: 1.5px solid var(--border); border-radius: var(--radius-full); padding: 6px 12px; font-size: var(--font-sm); background: transparent; color: var(--text-muted)`
- `.chip--person` — adds person color dot (8px circle, `background: var(--person-color)`) to left of label
- `.chip.is-active` — `background: var(--accent-soft); border-color: var(--accent); color: var(--accent)`
- `.chip--sm` — smaller padding (4px 10px) for filter bars

Retire `.owner-chip`, `.person-pill`, `.template-chip`. The `.chip--selectable` variant in the event form is already correct — generalize it. Update every page's filter bar, task form owner chips, and event form to use this system. The visual language for "selected person" will then be identical everywhere.

---

### 2.6 Interactive States — Press, Hover, Focus

**Current state:** Three incompatible press feedback approaches. Card press scale of `0.997` is physically imperceptible.

**Option A — Scale feedback everywhere**
`.card--interactive:active { transform: scale(0.98); }`, buttons `.btn:active { transform: scale(0.96); opacity: 0.9 }`. Pros: Native iOS-like feel, clear spatial feedback. Cons: Scale on list rows can cause layout jitter on long lists.

**Option B — Background tint feedback everywhere**
`:active { background: var(--bg-hover) }` for all interactive surfaces. No scale. Pros: Zero layout impact, works in any container. Cons: Less satisfying than scale; no tactile analog.

**Option C — Scale for cards, tint for rows (hybrid)**
Cards and FABs: `scale(0.98)`. List rows and action rows: background tint `var(--bg-hover)`. Buttons: `opacity: 0.85`. Pros: Context-appropriate feedback, best of both. Cons: Slightly more CSS to maintain.

**Recommended: Option C — hybrid.** Cards feel satisfying with a 2% scale (perceptible, not jarring). List rows are too tightly packed for scale — tint is safer. This is the iOS-native convention for these two interaction patterns.

**Implementation notes:**
- Replace `scale(0.997)` with `scale(0.98)` on `.card--interactive`
- Ensure transition: `transform 120ms ease-out` on cards so release snaps back
- Add `touch-action: manipulation` to all interactive cards and rows (prevents 300ms delay)
- Focus states: use `0 0 0 3px var(--accent-soft)` box-shadow on inputs (already correct in base.css); use `outline: 2px solid var(--accent); outline-offset: 2px` on focusable non-input elements (buttons, chips)

---

### 2.7 Navigation Bar Fixes

*These are quick structural fixes. Priority P0.*

1. **Fix 5-column grid:** Change `grid-template-columns: repeat(5, 1fr)` to `repeat(4, 1fr)` in `layout.css`. If/when Activities (1.6) ships and earns a 5th tab, change back to 5.

2. **Remove dual class names from `renderNavBar()`:** In `components.js`, emit only `.bottom-nav__item` (Phase 1). Remove the parallel `.nav-item` emission. Delete the `.nav-item` CSS rules from `layout.css` once confirmed nothing else uses them.

3. **Active state enhancement:** The current color-only active indicator is too subtle. Add a small dot indicator: `.bottom-nav__item.is-active::after { content: ''; display: block; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); margin: 2px auto 0 }`. This is the native iOS tab bar pattern.

---

### 2.8 Header System Consolidation

**Current state:** Phase 1 `.app-header` and legacy `.header__*` coexist. Legacy header has gradient text (rule violation). Both systems are loaded on every page.

**Option A — Immediate full migration to Phase 1 header**
Delete legacy `.header__*` CSS rules from `layout.css`. Update every page's JS to use `renderAppHeader()` exclusively. Pros: Cleans the CSS immediately. Cons: Some pages (admin, setup, scoreboard) have subtly different header needs; migration requires per-page testing.

**Option B — Keep legacy for admin/setup, migrate dashboard/calendar/kitchen/rewards**
Migrate the 5 main-app pages to Phase 1 header. Leave admin, setup, scoreboard on legacy until admin redesign (which is lower priority). Pros: Surgical, lower risk. Cons: Leaves the gradient text violation alive on admin pages; two systems persist for 6+ months.

**Option C — New unified header with `data-variant` attribute**
Build a single `renderAppHeader(opts)` in components.js with a `variant` option: `default` (Phase 1 with subtitle + avatar), `minimal` (no subtitle, back button), `admin` (no avatar, admin menu). All pages call this one function. CSS uses `[data-header-variant="admin"]` selectors. Pros: Single implementation, all pages consistent. Cons: More design work upfront; requires all page headers to be re-implemented.

**Recommended: Option A.** The legacy header is a rule violation (gradient text) and creates real visual inconsistency — admin and scoreboard header titles have gradient text that no other page has. The migration is mechanical: replace `renderHeader()` calls with `renderAppHeader()` on the remaining pages. Do this before the next shipped feature so the violation doesn't persist.

**Immediate action regardless:** Remove the gradient text from `.header__title` in `layout.css` now — this is a one-line fix that eliminates the DESIGN.md violation without a full migration.

---

### 2.9 Dark Mode Completeness

*See §2.1 for token fixes. This section covers structural dark-mode improvements.*

1. **Grade color tokens (see §2.1 item 3)** — the most urgent dark-mode fix. Grade-B navy on dark background is nearly invisible.

2. **Admin debug panel:** Replace `background: #1a1a2e; color: #e0e0e0` with `background: var(--surface-2); color: var(--text)`. Replace `color: #ffd93d` title with `color: var(--warning)`. The debug panel is admin-only and intentionally utilitarian — using tokens still produces a readable debug UI without hardcoded colors.

3. **Celebration title color:** `dashboard.css` `.celebration__title { color: var(--bg) }`. On dark themes, `--bg` is `#141413` (near-black) — the celebration title is invisible. Fix: use `color: var(--on-accent)` (always white in both themes) or `color: #ffffff` directly as this is always rendered over a semi-opaque overlay where white is universally readable.

4. **PWA meta theme-color:** Replace the hardcoded `#6c63ff` in `<meta name="theme-color">` across all HTML files. The correct approach is to emit the current theme's accent color dynamically: in `shared/theme.js`'s `applyTheme()`, also update the meta tag via `document.querySelector('meta[name="theme-color"]').content = resolvedAccent`.

5. **Sync the OS-pref dark block:** After adding grade color overrides to `[data-theme="dark"]`, update the `@media (prefers-color-scheme: dark)` block to match. Consider extracting the shared values into a CSS `@layer` or comment-marked sync section to prevent future drift.

---

### 2.10 Form Pattern Standardization

**Three documented form patterns exist. The rules for when to use each are unclear in practice.**

**Directive — Define the three patterns and their application:**

| Pattern | CSS prefix | When to use |
|---|---|---|
| **Event Form** (§5.23) | `ef2-*` | Any structured-data entry with multiple fields, time pickers, person selection, repeat rules. The canonical reference is `renderEventForm()` |
| **Picker-list** (§5.24) | `kp-*` | Choose from an existing library (meals, recipes, people). No field entry; browse + select flow |
| **Admin form** | `admin-*` | Settings-style key/value forms. Tab-organized, dense layout, no bottom-sheet footer |

**Admin form issues to fix:**
- Replace remaining `<input type="checkbox">` with `.form-toggle` (DESIGN.md hard rule)
- Admin form save/cancel buttons: migrate to `.sheet__footer` pattern with full-width stacked `.btn` elements so they don't scroll off-screen
- Admin field labels: migrate from `.admin-field-label` to `.field__label` (components.css canonical class)

**All new form sheets:** follow §5.23 + §13.13 checklist exactly. Specifically:
- 6-select time picker pattern (no `<input type="time">`)
- No horizontal padding on form sections
- Sticky footer with negative-margin breakout
- `captureFormState()` before any sub-sheet opens

---

### 2.11 Toast and Notification Positioning

1. **Fix toast bottom position:** `components.css` `.toast { bottom: 24px }` overlaps the 68px nav bar by 44px. Fix: `bottom: calc(var(--nav-height) + var(--spacing-md) + env(safe-area-inset-bottom, 0px))`. The undo toast already uses `calc(var(--nav-height) + var(--spacing-md))` — unify both to this formula with the `env()` addition.

2. **Audit all pages for safe-area:** Any sticky element pinned to the bottom must use `env(safe-area-inset-bottom, 0px)` in its padding/bottom value to avoid overlap with iPhone home indicator. Current gaps: `task-detail__complete-footer` (dashboard.css), potential sheet footers.

3. **Toast z-index:** `--z-toast: 50` is correct. Confirm it renders above sheets (`--z-sheet: 31`) and modals (`--z-modal: 41`) consistently by using the token rather than hardcoded values in any toast override.

---

### 2.12 Calendar Readability

**Current state:** Month view event text renders at 7–8px. Time labels render at 7–9px. All are below WCAG minimum and physically unreadable on phones.

**Option A — Raise minimum font to 11–12px, truncate aggressively**
Set `font-size: 11px` minimum on all event pills and time labels. Truncate event names with `text-overflow: ellipsis`. Show "+N" overflow badge sooner (after 2 events instead of 3). Pros: Readable, minimal visual change. Cons: More truncation means less content visible per cell; month view feels denser.

**Option B — Reduce events-per-cell, larger text, cleaner overflow**
Show max 2 events per cell in month view. Third+ events collapse to "+N more" badge immediately. Increase event pill height to 18px minimum. Font: 12px. Pros: Clean, readable. Cons: Month view shows less information; power users who want dense data are underserved.

**Option C — Month view "dot mode" toggle**
Add a compact toggle: "List mode" (current, text-heavy, broken) vs "Dot mode" (colored dot per event, no text). Dot mode is always readable regardless of density. List mode gets proper 12px minimum text. Pros: Serves both use cases. Cons: Toggle adds UI complexity.

**Recommended: Option B.** The goal is to replace Skylight Calendar — Skylight is notably clean and readable, not data-dense. Two events per cell with legible text is the right call for a family-facing display. Power users can tap a cell to open the day sheet for full detail. Fix the unreadable font sizes as P0; the "max 2 events" behavior as P1.

---

### 2.13 Empty, Loading, and Error States

**Current state:** No consistent loading, empty, or error state pattern.

**Directive — Define three standard states in `components.css`:**

**Loading skeleton:**
```css
.skeleton { background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%); background-size: 200% 100%; animation: skeleton-shimmer 1.5s infinite; border-radius: var(--radius-md); }
@keyframes skeleton-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
.skeleton--card { height: 72px; width: 100%; margin-bottom: var(--spacing-sm); }
.skeleton--text-line { height: 14px; width: 70%; margin-bottom: var(--spacing-xs); }
```
Add `@media (prefers-reduced-motion)` to replace shimmer with static `background: var(--surface-2)`.

**Empty state:**
```css
.empty-state { display: flex; flex-direction: column; align-items: center; text-align: center; padding: var(--spacing-2xl) var(--spacing-lg); gap: var(--spacing-sm); }
.empty-state__icon { font-size: 2.5rem; opacity: 0.4; }
.empty-state__title { font-size: var(--font-md); font-weight: 600; color: var(--text-muted); }
.empty-state__body { font-size: var(--font-sm); color: var(--text-faint); max-width: 240px; }
```
Each page defines its own `title` and `body` copy with a clear next action.

**Error state:** Same structure as empty state, but uses `--danger` accent color and includes a "Try again" button.

---

### 2.14 PWA Manifest and Install Experience

**Current state:** Hardcoded dark navy splash, hardcoded purple theme color, static "Family Hub" name.

**Immediate fixes (no infrastructure change needed):**

1. Change `background_color` to `"#f7f6f2"` (light-warm `--bg` default). This matches the most common default theme and is neutral enough to not jar dark-theme users (light splash → dark app is less jarring than dark splash → light app).

2. Change `theme_color` to `"#5b7fd6"` (light theme accent default). This is the most common first-run state.

3. Update `<meta name="theme-color">` in all HTML files to the same value.

4. Add a maskable icon: Create a `512×512` version with safe-zone padding (20% inset on all sides) for Android adaptive icons. Add `{ "src": "App Icon Maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }` to `icons` array in manifest.

**Medium-term (requires Worker or dynamic manifest):**
- Serve `manifest.json` from a Cloudflare Worker that reads `settings.appName` from Firebase and returns the correct manifest with dynamic name. This removes the "Family Hub" static name from all installed PWAs.

---

### 2.15 Kid Mode Design Polish

**Current state:** Kid mode is functionally rich but has visual inconsistencies vs the rest of the app.

1. **Fix token references (see §2.1):** Replace hardcoded success/danger colors with `var(--success)` and `var(--danger)` — highest priority kid-mode fix.

2. **Replace `<details>` bank section** with a custom collapsible built on the same pattern used elsewhere: `<button class="collapsible-toggle">Bank <svg class="chevron">…</svg></button>` + hidden `<div id="bankContent">`. Apply `transform: rotate(90deg)` to chevron when open. This removes the only native-browser-chrome element in the app.

3. **Victory scene background:** Kid mode has 15 themed victory scene backgrounds applied as inline styles. Audit these for dark-mode compatibility — some backgrounds may be near-invisible on `--bg: #141413`. Consider constraining victory scenes to light surfaces or use `forced-colors: none` guard.

4. **Confirm modal buttons in kid mode:** Kid mode uses `showConfirm()` from components.js. The right-aligned web-style buttons are particularly jarring in kid mode. Applying the §2.6 fix (full-width stacked buttons) will improve kid experience disproportionately.

---

### 2.16 Motion and Animation System

**Directive — Define the app's motion vocabulary consistently:**

| Context | Property | Value |
|---|---|---|
| Instant state changes (toggle, check) | `transition: none` | No animation — state should feel immediate |
| Fast micro-interactions (button press, chip select) | `transition: all var(--t-fast)` | 120ms ease-out |
| UI component transitions (sheet open, tab switch) | `transition: all var(--t-base)` | 200ms ease-out |
| Page-level transitions (sheet enter/exit, slide nav) | `animation-duration: var(--t-slow)` | 320ms ease-out |
| Celebration / reward | Keyframe animations, 400–500ms | One-off flourishes |

**Apply consistently:**
- Add day-navigation slide animation to dashboard (matches tracker's `trkSlideNext/trkSlidePrev`). Currently dashboard has no transition on day change.
- Remove duplicate `@media (prefers-reduced-motion)` blocks from individual CSS files. The global block in `responsive.css` already covers all. Keep only page-specific reduced-motion overrides if a page needs to preserve opacity transitions.
- Card press: add `transition: transform var(--t-fast)` to `.card--interactive` so the scale releases smoothly.

---

### 2.17 Safe Area and Edge-to-Edge Completeness

**Current state:** `body` has `padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))` — correct globally. But specific sticky elements miss the `env()` addition.

**Directive — Audit and fix all sticky bottom elements:**

1. `task-detail__complete-footer` (dashboard.css line 90): Add `padding-bottom: calc(var(--spacing-lg) + env(safe-area-inset-bottom, 0px))`. Currently `padding-bottom: var(--spacing-lg)` — misses home indicator on iPhone.

2. All `.sheet__footer` elements: Add `padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom, 0px))` to the bottom sheet footer definition in `components.css`.

3. All `.kp-footer` elements (kitchen picker): Same `env()` addition.

4. Any future sticky footer must include `env(safe-area-inset-bottom, 0px)` — add to §5.23 and §13.13 in DESIGN.md as a non-negotiable checklist item.

---

### 2.18 Priority Order

| Tier | Item | Section | Effort | Dependency |
|---|---|---|---|---|
| **P0 — Fix immediately (bugs/violations)** | | | | |
| P0.1 | Define `--radius: var(--radius-md)` + `--font-base: var(--font-md)` | §2.1 | 2 lines | None |
| P0.2 | Fix grade colors for dark mode | §2.1, §2.9 | ~10 lines | None |
| P0.3 | Fix kid.css `--accent-success/danger` → `var(--success/danger)` | §2.1 | ~12 lines | None |
| P0.4 | Fix toast bottom position (overlap with nav bar) | §2.11 | 1 line | None |
| P0.5 | Fix celebration title color (invisible on dark) | §2.9 | 1 line | None |
| P0.6 | Remove gradient text from `.header__title` in layout.css | §2.8 | 1 line | None |
| P0.7 | Fix nav bar 5-column grid → 4 columns | §2.7 | 1 line | None |
| P0.8 | Fix calendar event font sizes (7–8px → 12px minimum) | §2.12 | ~5 lines | None |
| P0.9 | Fix `complete-footer` missing `env(safe-area-inset-bottom)` | §2.17 | 1 line | None |
| **P1 — Next sprint (systematic improvements)** | | | | |
| P1.1 | Fix dual `.card` definition — consolidate card system | §2.3 | Medium | None |
| P1.2 | Section heading normalization → `.section-label` | §2.4 | Medium | None |
| P1.3 | Person chip normalization → `.chip--person` | §2.5 | Medium | None |
| P1.4 | Card press feedback: `scale(0.997)` → `scale(0.98)` | §2.6 | 1 line | None |
| P1.5 | Remove dual nav class names from `renderNavBar()` | §2.7 | Small | None |
| P1.6 | Add missing admin tokens to base.css | §2.1 | ~5 lines | None |
| P1.7 | Define shadow dark-mode overrides | §2.1 | ~6 lines | None |
| P1.8 | Sync OS-pref dark block with explicit dark block | §2.9 | Copy+paste | P0.2 done |
| P1.9 | Add debug panel token-based colors | §2.9 | ~3 lines | None |
| P1.10 | Replace `<details>` bank in kid mode | §2.15 | Small JS + CSS | None |
| P1.11 | Fix admin checkbox → form-toggle | §2.10 | Small per instance | None |
| P1.12 | Add day-navigation slide animation to dashboard | §2.16 | Small | None |
| P1.13 | Add active dot indicator to nav bar active state | §2.7 | ~5 lines | P1.5 done |
| P1.14 | Fix all sticky footer `env(safe-area-inset-bottom)` gaps | §2.17 | Small per footer | None |
| **P2 — Planned improvements (design evolution)** | | | | |
| P2.1 | Typography: evaluate Plus Jakarta Sans font | §2.2 | Medium | None |
| P2.2 | Full Phase 1 header migration (remove legacy) | §2.8 | Medium | None |
| P2.3 | Calendar month view: max 2 events per cell | §2.12 | Medium | None |
| P2.4 | Define loading skeleton component + apply to all pages | §2.13 | Medium | None |
| P2.5 | Standardize empty state component across all pages | §2.13 | Medium | None |
| P2.6 | Add error state component | §2.13 | Small | None |
| P2.7 | PWA manifest: fix background_color + maskable icon | §2.14 | Small | None |
| P2.8 | PWA manifest: dynamic theme_color via theme.js applyTheme() | §2.9 | Small JS | None |
| P2.9 | Admin form footer: migrate to sheet__footer pattern | §2.10 | Medium | None |
| P2.10 | Kid mode victory scenes: dark mode audit | §2.15 | Medium | None |
| P2.11 | PWA manifest: dynamic name via Worker (medium-term) | §2.14 | Large | Worker infra |

---

*End of DESIGN_SYNTHESIS.md — all sections complete.*
