# Daily Rundown — Design Review

## Session Notes

| Session | Date | Status | Coverage |
|---------|------|--------|----------|
| 1–2 | 2026-05-02–04 | Complete | All CSS (12 files), all HTML shells, kid.html (2269 lines inline), setup.html (860 lines), scoreboard.html/tracker.html inline JS, rewards.js, admin.js, shared/components.js (~3400 lines), shared/theme.js, dashboard.js, manifest.json, sw.js |

**Reviewer:** Claude Sonnet 4.6
**Standard:** Best-in-class iOS app quality — a polished mobile web PWA a user would happily pay for monthly.
**Scope:** Findings only. No code changes.

---

## App Architecture Summary

Daily Rundown is a vanilla-JS PWA (no framework, no bundler) using Firebase Realtime Database and hand-written modular CSS across 12 files. A "Phase 1" design system migration is 60–70% complete: a new `.card` component and `.app-header`/`.bottom-nav__item` layout system coexist with their legacy counterparts (`.task-card`, `.header__*`, `.nav-item`) — both systems are loaded on every page simultaneously. The CSS token system in `base.css` is mostly well-structured but has seven undefined tokens, two undefined type-scale entries, and grade colors that fail in dark mode.

---

## Severity Legend

| Tag | Meaning |
|-----|---------|
| **[C]** | Critical — broken on real devices, DESIGN.md violation, accessibility failure, or zero-effort fix for a visible problem |
| **[M]** | Major — meaningfully below quality bar; wrong enough to notice on a premium app |
| **[m]** | Minor — small visible polish issue |
| **[P]** | Polish — subtle; a discerning user would notice |

---

## Design System Audit

### Token Gaps

| Token | Used In | Fallback | Impact |
|-------|---------|----------|--------|
| `--radius` (bare) | `dashboard.css:105`, `components.css:502,1435`, `admin.css:785,801,819`, `kid.css:527,544,581`, store-card | `8px` when present; **no fallback at `dashboard.css:105`** | **[C]** Complete/skip buttons in task detail sheet resolve to `border-radius: 0` — visually broken on every theme |
| `--font-base` | `dashboard.css:107`, `components.css` (~8 occurrences in ef2/form sections) | None — resolves to inherited value | **[M]** Complete button font-size is luck-based from ancestor |
| `--accent-success` | `kid.css:489,495,507` | `#38a169` (hardcoded light-mode green) | **[M]** Kid mode positive amounts always use a fixed green; looks wrong on dark themes where `--success: #7fc49a` |
| `--accent-danger` | `kid.css:481,496,508` | `#e53e3e` (hardcoded light-mode red) | **[M]** Same issue — dark theme `--danger: #e28a5c` ignored entirely |
| `--radius-pill` | `admin.css:494` | `9999px` | **[P]** Should alias `--radius-full` |
| `--surface-alt` | `components.css:1025,1184,1519`, `admin.css:750` | `var(--surface)` or `var(--surface-2)` inconsistently | **[m]** Two fallbacks give different backgrounds depending on caller |
| `--surface-highlight` | `components.css:1393`, `admin.css:826` | `rgba(var(--accent-rgb, 108, 99, 255), …)` | **[m]** `--accent-rgb` also undefined; emoji selected state is always purple regardless of accent |
| `--border-subtle` | `admin.css:182,224,234,984,1051` | `var(--border)` | **[P]** Falls back correctly but semantic tier is never honored |

### Grade Colors in Dark Mode

**[M]** `--grade-a` through `--grade-f` are defined once in `:root` with fixed light-mode values and **not overridden** in `[data-theme="dark"]`. Result: `--grade-b: #1565c0` (dark navy) is near-invisible on `--bg: #141413`; `--grade-a: #2e7d32` (forest green) fails WCAG AA. These colors appear in grade badges, sparkline bars, and drilldown status rows — all major surfaces.

### Dual Card System

**[C]** Two competing task-card implementations coexist:

- **`.task-card`** (`components.css:803`): `min-height: 68px`, `border-left: 3px solid var(--owner-color)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-sm)`. Used in kid mode and legacy surfaces.
- **Phase 1 `.card`** (`components.css:1660`): `min-height: 60px`, 4px left stripe via `::before` pseudo, `border-radius: var(--radius-lg)`, no shadow by default. Used on dashboard and tracker.

Additionally, the generic `.card` selector is **defined twice** in components.css (lines 3–11 and 1660–1731). The second definition silently overrides the first; any code expecting the simple panel card instead gets the task-card structure.

### Dual Header / Nav System

**[M]** `layout.css` contains two complete layout systems. Legacy `.header__title` (line 73) uses `background: linear-gradient(…); -webkit-background-clip: text` — an explicit DESIGN.md hard rule violation. Every page that hasn't been migrated to `.app-header` renders a gradient title. Both systems are loaded on every page.

### Typography

**[M]** `--font-family` is the OS system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`). The app has zero brand character in typography. For a subscription-quality product, this is the single highest-leverage visual improvement available — a distinctive type pairing (e.g., a geometric display face for headers + a readable variable body face) would immediately elevate perceived quality.

### Reduced Motion Duplication

**[m]** The `@media (prefers-reduced-motion: reduce)` block is declared in five files: `layout.css` (global `*` block), `calendar.css`, `components.css`, `admin.css`, `kid.css`. The global block in `layout.css` is correct. The four file-specific duplications create maintenance noise and partial override risks.

---

## Cross-Cutting Design Consistency Audit

This section documents inconsistencies that span multiple pages and components — patterns that do the same job but look or behave differently depending on where you are in the app.

---

### A · Completion Indicators (5 different treatments)

The single most-used interactive element in the app — marking a task done — has five visually distinct implementations:

| Context | Size | Shape | Symbol | Completion Color |
|---------|------|-------|--------|-----------------|
| Dashboard / Tracker (Phase 1 `.card`) | no explicit element | — | full card tap | `--accent` (via `--completing` animation) |
| Dashboard / Kid (`.task-card__check`) | 22×22px | rounded square (6px) | CSS border trick checkmark | `--accent` |
| Kid mode (`.task-card__check`) | 26×26px | rounded square (6px) | CSS border trick checkmark | `--accent` |
| Calendar day view (`.cal-day__task-check`) | 22×22px | circle (50%) | Unicode `✓` character | `--success` |
| Calendar week view (`.cal-week__task-check`) | 14×14px | native checkbox | browser default | `accent-color: --success` |

**[M]** Four problems compound here:
1. **Shape inconsistency** — rounded square vs circle vs native checkbox in the same app. Native iOS uses circles. The rounded-square check has a distinctly web-app feel.
2. **Color inconsistency** — task-card completes to `--accent` (blue/teal depending on theme); calendar check completes to `--success` (green). The same completed state reads as two different colors.
3. **Symbol inconsistency** — CSS border trick (looks like a handwritten tick) vs Unicode `✓` (font-rendered, varies by OS) vs native checkbox (OS chrome). The calendar day view Unicode ✓ rendering varies between iOS (SF Pro) and Android (Roboto) — on some Android fonts it renders as a heavy block.
4. **Target size inconsistency** — 14px (calendar week) to 26px (kid mode). The week view's 14px checkbox is below any reasonable minimum for a touch target on the most-tapped element in the app.

---

### B · Person/Owner Color Stripes (3 widths, 2 methods)

Every task card shows a color stripe to indicate the assigned person. Three implementations exist simultaneously:

| Component | Width | Method | Notes |
|-----------|-------|--------|-------|
| `.task-card` (old) | 3px | `border-left: 3px solid var(--owner-color)` | Kid mode, legacy surfaces |
| Phase 1 `.card` (new) | 4px | `::before { width: 4px; background: var(--owner-color) }` | Dashboard, tracker |
| `.event-bubble` | 4px | `border-left: 4px solid var(--event-color)` | Calendar day view |

**[M]** A parent viewing the dashboard sees Phase 1 cards with 4px `::before` stripes. Looking at the kid's screen they see 3px border-left stripes. The visual identity of "colored stripe = this person's task" is the same concept but the stripe is a different width implemented differently. After a full Phase 1 migration, the 3px variant should disappear — until then it's an active inconsistency.

**[m]** The Phase 1 `::before` pseudo stripe has `border-radius: 0` — it's flush against the card's left edge with no rounding at the corners. The old `border-left` on `.task-card` also has no rounding (the `border-radius-lg` applies to the outer corners only, not the border). Both are sharp-ended stripes. A subtle `border-radius: 0 2px 2px 0` on the Phase 1 pseudo would match the card's outer corner rounding.

---

### C · Person Selection Chips (4 different components, same job)

The app has four distinct chip/pill patterns for selecting or displaying people, all used in different contexts:

| Component | Padding | Border | Active Background | Active Text | Active Border |
|-----------|---------|--------|-------------------|-------------|---------------|
| `.owner-chip` (task owner select) | 6px 14px | `1.5px solid --border` | `--accent` | white | `--accent` |
| `.person-pill` (page-level person filter) | 6px 14px | `2px solid transparent` | `--accent-soft` | `--accent` | `--accent` |
| `.person-pill[data-person-id]` active | 6px 14px | `2px solid transparent` | `--person-color` | `--on-accent` | `--person-color` |
| `.chip--selectable` (bell, message forms) | 4px 10px | `2px solid transparent` | `--accent` | `--on-accent` | `--accent` |
| `.template-chip` (message templates) | 6px 12px | `1px solid --border` | `--accent` | `--on-accent` | `--accent` |

**[M]** The active states are visually incompatible. A `.person-pill` selected state uses a soft tint (`--accent-soft` background + `--accent` text) while a `.owner-chip` selected state is fully filled (`--accent` background + white text). These represent the same "this person is selected" concept but look completely different. A user who has learned the tinted pattern on the dashboard filter will be surprised by the filled pattern in a task form.

**[M]** The inactive chip border weight varies (1px, 1.5px, 2px). Combined with the `transparent` vs actual color differences, each context has a subtly different visual weight. At small type sizes this reads as visual noise rather than intentional differentiation.

---

### D · Section Heading Labels (6 different styles, same semantic purpose)

The concept "here's a section heading" is implemented at least 6 ways:

| Class | Font size | Weight | Color | Transform | Spacing |
|-------|-----------|--------|-------|-----------|---------|
| `.section__title` | `--font-xs` (12px) | 600 | `--text-muted` | uppercase | `letter-spacing: 0.08em` |
| `.form-label` | `--font-sm` (14px) | 600 | `--text-faint` | none | none |
| `.ef2-section-label` | `--font-xs` | 700 | `--text-muted` | uppercase | `letter-spacing: 0.06em` |
| `.rewards-section-heading` | `--font-sm` | 600 | `--text-muted` | uppercase | `letter-spacing: 0.05em` |
| `.bell-dropdown__section-head` | `--font-xs` | 600 | `--text-faint` | uppercase | (implicit from font-xs) |
| `.admin-section-header` | inline | 600 | `--text` | none | none |

**[M]** The two most visible — `.section__title` (task list groups: "EVENTS", "DAILY") and `.ef2-section-label` (event form: "WHEN", "WHO") — differ in font weight (600 vs 700) and letter-spacing (0.08em vs 0.06em). These look slightly different despite representing the same "section label" concept.

**[m]** `.form-label` is 14px non-uppercase — a full step larger than the uppercase label tokens. In a form with both `.form-label` and `.ef2-section-label` visible (e.g., event form sub-sheets), labels for individual fields are bigger than section headings, which inverts the hierarchy.

---

### E · Tap vs Long-Press — Interaction Inconsistency

The core gesture model (`tap = primary action`, `long-press = detail`) is applied inconsistently:

| Surface | Tap does | Long-press does | Long-press timing |
|---------|---------|-----------------|-------------------|
| Dashboard | Complete task (full card) | Open detail sheet | 800ms |
| Calendar week | Toggle native checkbox | No long-press behavior | — |
| Calendar day | Complete task (circle button) | No long-press behavior | — |
| Tracker | Complete task (full card) | Open detail sheet | **500ms** |
| Kid mode | Open detail sheet (full card) | Complete task? | 800ms |

**[C]** The dashboard and kid mode have **inverted tap behaviors** for the same task card. On the dashboard, tapping the card completes the task. In kid mode, tapping the card opens the detail sheet. A parent checking off tasks on the dashboard, then switching to kid mode to see their child's view, will open detail sheets when they expect completions — confusing in either direction.

**[M]** Calendar week view uses a 14×14px native HTML checkbox. This is a completely different interaction model from every other task surface in the app. The native checkbox has no long-press, no press animation, no detail sheet access. To open task detail from the week calendar, the user must tap the task name text — not documented or visually indicated anywhere.

**[m]** Long-press timing: 500ms on tracker vs 800ms on everything else. This is documented in CLAUDE.md as intentional, but from a user's perspective the same gesture fires 37% faster on the tracker. Muscle memory built on the dashboard will produce accidental long-presses on the tracker.

---

### F · Form Structure & Action Placement

Four different patterns for "here's a form with save/cancel actions":

| Form | Header | Actions location | Cancel style | Primary style |
|------|--------|-----------------|-------------|---------------|
| Task detail sheet | No header | Sticky footer (negative margin breakout) | `btn--muted` (full width) | `btn--success` (full width) |
| Event form (ef2-*) | Large title input | Sticky footer | Icon button (×) in header | FAB-style send icon in header |
| Confirm modal | Text title | Right-aligned in modal body | `btn--secondary` | `btn--primary` or `btn--danger` |
| Admin person/task forms | Title + close X | Bottom of scrollable form | `btn--secondary` | `btn--primary` |
| Scoreboard drilldown | Avatar + name | X button in header only | No cancel button | — |
| Reward form | No explicit header | Sheet handle + content scroll | No explicit cancel | Bottom buttons |

**[M]** Cancel affordance varies: header X icon (event form, admin modal), footer "Cancel" button (task detail), right-aligned button (confirm modal), or absent (some sheets dismiss on backdrop tap only). A user conditioned to the header X on the event form will look for an X on every sheet — but the task detail sheet and scoreboard drilldown have different dismiss patterns.

**[M]** Primary action placement: sticky footer buttons on task detail and event form vs right-aligned modal footer vs bottom of scroll on admin forms. On a long admin form, the primary "Save" button is below the fold. The sticky footer pattern (used on task detail and event form) should be applied consistently to all forms.

---

### G · Loading States (3 patterns, no consistency rule)

| Page | Loading treatment |
|------|------------------|
| Dashboard | Full skeleton (card-shaped placeholders) |
| Scoreboard | Inline spinner + "Loading…" text |
| Tracker | Inline spinner + "Loading…" text |
| Rewards | Inline spinner + "Loading…" text |
| Kitchen | Inline spinner + "Loading…" text |
| Admin | Inline spinner (per section) |
| Kid mode | Loading state in HTML (`loading-spinner--small` + "Loading…") |

**[M]** Dashboard has a premium skeleton loader. Every other page uses a bare spinner. The contrast is sharp: the dashboard feels instant and polished while navigating to any other page shows the same generic spinner. Scoreboard and rewards in particular would benefit from skeleton treatment since their card-based layouts are easy to skeleton.

---

### H · Spacing System Violations (raw values in a token-based system)

The codebase uses `var(--spacing-*)` tokens consistently throughout — except in several places where raw pixel or rem values appear instead:

| Location | Raw values used |
|----------|----------------|
| `task-detail__notes-*` (`components.css:~1180`) | `gap: 0.375rem`, `padding: 0.5rem 0.75rem`, `gap: 0.5rem`, `margin-top: 0.25rem` |
| `confirm-modal__card` | `padding: 24px`, `margin-bottom: 16px`, `margin-top: 16px`, `gap: 8px` |
| `bell-dropdown__header` | `padding: 10px 12px`, `gap: 8px` |
| `bell-dropdown__title` | hardcoded `font-size: var(--font-sm)` with `padding: 10px 12px` |
| Various `admin.css` badge/row paddings | `padding: 8px 12px`, `padding: 10px 12px` |

**[m]** These raw values won't cause visual bugs in isolation but they undermine the spacing system. If `--spacing-sm` is ever changed from `8px` to `6px` (e.g., for a more compact theme), the hardcoded `8px` values won't update. The notes section in particular (`0.375rem = 6px`, `0.5rem = 8px`, `0.75rem = 12px`) should be `var(--spacing-xs)`, `var(--spacing-sm)`, `var(--spacing-sm) var(--spacing-md)`.

---

### I · "Completed" Visual State (opacity and treatment differ by card system)

| Component | Completed opacity | Text treatment | Background |
|-----------|-----------------|----------------|------------|
| `.task-card--done` | `0.65` | `text-decoration: line-through` + `color: --text-faint` | `color-mix(success 4%, surface-2)` |
| `.card--done` (Phase 1) | `0.75` | `color: --text-muted`, `font-weight: 400` | `--surface-2` |
| `.cal-day__task--done` | `0.45` | `text-decoration: line-through` | none |
| `.cal-week__task--done` | `0.4` | `text-decoration: line-through` | none |

**[M]** Four opacity levels (0.40, 0.45, 0.65, 0.75) for the exact same semantic state: "this task was completed." A parent who completes a task on the dashboard sees it at 75% opacity. The same task on the week calendar fades to 40% opacity — over-dimmed and harder to verify at a glance. The calendar surfaces (40%, 45%) are notably darker than the card surfaces (65%, 75%) — no clear reason for this divergence.

**[m]** Dashboard Phase 1 cards remove strikethrough on completion (`font-weight: 400`, color change only). Calendar and kid mode use strikethrough. The strikethrough is a stronger and more universally understood "done" signal.

---

### J · Destructive Action Confirmation (4 inconsistent safety levels)

| Action | Confirmation required | Type |
|--------|----------------------|------|
| Delete task (admin) | `showConfirm()` modal | Standard confirm |
| Delete person (admin) | `showConfirm()` modal | Standard confirm |
| Rebuild schedule | None | Silent execute |
| Clear past & rebuild | None | Silent execute |
| Bulk edit 20 tasks | None (no undo either) | Silent execute |
| AI import (events/lunches) | Preview list (deselectable) | Pre-action review |
| Scoreboard reset | Type "RESET" | Typed confirmation |
| Factory reset | Type "RESET" (same string) | Typed confirmation |

**[M]** "Rebuild Schedule" silently wipes and replaces future schedule entries — a high-impact operation with no confirmation. "Delete task" shows a confirmation dialog. The rebuild is at least as destructive as deletion; it should use `showConfirm()`.

**[M]** Factory reset and Scoreboard reset both require typing "RESET." A parent who typed "RESET" to confirm a scoreboard reset has conditioned their muscle memory — if they accidentally open factory reset the same confirmation text will feel familiar and may be entered without reading the label. Factory reset should require a different, longer string (e.g., "DELETE EVERYTHING") to break the pattern.

**[m]** Bulk edit has no undo. Changing 15 tasks' rotation type from Daily to Weekly is a 30-second operation with irreversible effect. A toast with "Undo bulk edit (5s)" would catch accidental bulk operations.

---

### K · Empty State Copy Tone

Empty states appear correctly across all surfaces but the copy doesn't match the app's family tone:

| Surface | Current copy | Problem |
|---------|-------------|---------|
| Rewards shop | "No rewards available for you yet" | No next action; kids can't act on this |
| Rewards bank | "No saved rewards yet" | No hint rewards can be saved |
| Kitchen lists | (no empty state CSS found) | May be absent |
| Tracker | "No weekly tasks — Nothing scheduled for this period" | Repetitive; no action path |
| Admin tasks | "No tasks yet — Create your first task" | Best example; has an action hint |

**[m]** The best empty states in the app ("No tasks yet — Create your first task") follow the correct pattern: tell the user what's missing and what to do. Most others omit the action part. For kid-facing empty states especially ("No rewards available for you yet") the copy should explain who controls this and what to do ("Ask a parent to add rewards in Settings").

---

### L · Icon System (SVG vs Emoji vs Unicode)

The app uses three different icon systems without a clear rule for which to use:

| Context | Type | Examples |
|---------|------|---------|
| Navigation icons | SVG (Heroicons-style, stroke) | Home, Calendar, Scores, Rewards |
| Header action buttons | SVG | Bell, overflow menu |
| Task category icons | Emoji | 🧹 Chores, 💪 Fitness |
| Task emoji hints (kid mode) | Emoji | 🪥🦷 Brush Teeth |
| Grade badges | SVG (inline) | Grade letter in badge |
| Celebration confetti | Programmatic DOM | `div` elements with colors |
| Check indicator (calendar day) | Unicode `✓` | Completion mark |
| Check indicator (task card) | CSS border trick | Completion mark |
| Bell badge count | Text | Number |
| Step indicator dots | CSS circles | Progress dots |

**[m]** The mixture is mostly appropriate (SVG for chrome, emoji for user content) but the check indicator is the problematic case: Unicode `✓` in the calendar day view vs CSS border trick in task cards. These are both "chrome" checkmarks (not user content) and should use the same approach. SVG checkmarks in both contexts would give consistent, controllable rendering.

**[P]** Trend indicators on the scoreboard use inline text characters (`↑`, `↓`, `—`). These are Unicode arrows that render from the system font. Small SVG arrows would give consistent rendering and allow the color/weight of the arrow to be precisely controlled.

---

### M · Bell Dropdown vs Notification Toast vs Banner (3 surfaces, 1 notification system)

The app has three surfaces for surfacing information to users:
- **Bell dropdown** — parent-facing, approval requests + activity
- **Toast** — transient, success/error feedback
- **Banner** — persistent, overdue/offline/multiplier/vacation

**[m]** The offline banner uses `position: fixed; top: calc(var(--header-height) + env(safe-area-inset-top))` — it positions relative to `--header-height`. But `--header-height: 64px` is the spec value, not the rendered height of `.app-header` (which includes `padding-top: calc(--spacing-md + env(safe-area-inset-top))`). On a device with a 44px safe area, the banner will overlap the header. The banner positioning should track the sticky header's rendered bottom, not a hardcoded height.

**[m]** The banner queue (vacation > freeze > overdue > multiplier > info) means at most one banner shows at once — correct. But when the active banner changes (e.g., offline → back online → overdue), there's no documented transition between banners. The `bannerSlideIn` animation fires on mount but there's no slide-out for dismiss. Banners disappear abruptly.

---

## Navigation Model

**[M]** Nav items are rendered with both `bottom-nav__item` AND `nav-item` class names simultaneously. The two class sets have conflicting style properties: `nav-item` adds `border-radius: var(--radius-sm)` and uses `color: var(--text-faint)` while `bottom-nav__item` uses `color: var(--text-muted)`. The active state uses `.is-active` (Phase 1) but `.nav-item--active` is also defined in CSS and unused. Both are loaded on every page.

**[m]** `bottom-nav` is `grid-template-columns: repeat(5, 1fr)` but only 4 items render. The fifth slot is intentionally reserved for Activities, but currently leaves visible whitespace on the right side of the nav bar on any screen wider than ~280px.

**[P]** The active tab indicator is a 2px top bar at the nav item — correct Phase 1 spec. The inactive icon stroke width drops from `2` to `1.75` — a subtle but nice differentiator.

---

## Master Surface Checklist

| # | Surface | Reviewed | Sub-Checklist Complete |
|---|---------|----------|------------------------|
| 1 | Dashboard — task list | ✓ | ✓ |
| 2 | Dashboard — header & ambient strip | ✓ | ✓ |
| 3 | Dashboard — task detail sheet | ✓ | ✓ |
| 4 | Dashboard — celebration overlay | ✓ | ✓ |
| 5 | Dashboard — event form (ef2-*) | ✓ | ✓ |
| 6 | Dashboard — coming up rail | ✓ | ✓ |
| 7 | Calendar — page shell & nav | ✓ | ✓ |
| 8 | Calendar — month view | ✓ | ✓ |
| 9 | Calendar — week view | ✓ | ✓ |
| 10 | Calendar — day view | ✓ | ✓ |
| 11 | Calendar — event detail sheet | ✓ | ✓ |
| 12 | Scoreboard — leaderboard cards | ✓ | ✓ |
| 13 | Scoreboard — grades table | ✓ | ✓ |
| 14 | Scoreboard — drilldown sheet | ✓ | ✓ |
| 15 | Scoreboard — highlights & category leaders | ✓ | ✓ |
| 16 | Tracker — weekly view | ✓ | ✓ |
| 17 | Tracker — monthly view | ✓ | ✓ |
| 18 | Tracker — task detail sheet | ✓ | ✓ |
| 19 | Tracker — task form | ✓ | ✓ |
| 20 | Rewards — balance header & tabs | ✓ | ✓ |
| 21 | Rewards — shop tab | ✓ | ✓ |
| 22 | Rewards — bank tab | ✓ | ✓ |
| 23 | Rewards — history tab | ✓ | ✓ |
| 24 | Rewards — approvals tab | ✓ | ✓ |
| 25 | Rewards — reward form sheet | ✓ | ✓ |
| 26 | Rewards — intent sheet | ✓ | ✓ |
| 27 | Kitchen — lists tab | ✓ | ✓ |
| 28 | Kitchen — recipes tab | ✓ | ✓ |
| 29 | Kitchen — staples tab | ✓ | ✓ |
| 30 | Kitchen — meal plan tab | ✓ | ✓ |
| 31 | Admin — PIN gate | ✓ | ✓ |
| 32 | Admin — tasks tab | ✓ | ✓ |
| 33 | Admin — events tab | ✓ | ✓ |
| 34 | Admin — people tab | ✓ | ✓ |
| 35 | Admin — categories tab | ✓ | ✓ |
| 36 | Admin — settings tab | ✓ | ✓ |
| 37 | Admin — tools tab | ✓ | ✓ |
| 38 | Kid mode — task list | ✓ | ✓ |
| 39 | Kid mode — header & stats bar | ✓ | ✓ |
| 40 | Kid mode — celebrations | ✓ | ✓ |
| 41 | Kid mode — reward bank & store | ✓ | ✓ |
| 42 | Kid mode — history & trophies | ✓ | ✓ |
| 43 | Kid mode — settings panel | ✓ | ✓ |
| 44 | Setup wizard (6 steps) | ✓ | ✓ |
| 45 | Global — bottom sheet | ✓ | ✓ |
| 46 | Global — confirm modal | ✓ | ✓ |
| 47 | Global — toast & undo toast | ✓ | ✓ |
| 48 | Global — bell dropdown | ✓ | ✓ |
| 49 | Global — theme sheet | ✓ | ✓ |
| 50 | Global — more sheet | ✓ | ✓ |
| 51 | Global — empty & loading states | ✓ | ✓ |
| 52 | Global — nav bar | ✓ | ✓ |
| 53 | PWA manifest | ✓ | ✓ |
| 54 | Service worker | ✓ | ✓ |

---

## Page & Surface Reviews

---

### 1–6 · Dashboard

The primary daily-use surface. Phase 1 migration is furthest along here — uses `.app-header`, `.card`, real-time listeners, loading skeleton, and the ambient strip.

#### 1 · Task List

Sub-checklist:
- [x] Visual hierarchy: section headers distinguish groupings
- [x] Task card anatomy: owner stripe, name, meta, check button
- [ ] Card interaction feedback — needs review
- [ ] Section empty states
- [x] Phase 1 `.card` system confirmed
- [ ] Touch target audit

**Findings:**

**[M]** `.card:active` has `transform: scale(0.997)` — that's a 0.3% scale reduction, essentially imperceptible. Native iOS row presses typically respond with ~2% scale or a visible background flash. The press feedback is nearly invisible; a family tapping tasks quickly won't feel the response and may double-tap. Recommend `scale(0.97)` or a background color transition.

**[m]** The check button (`.task-card__check`) is `22×22px` with `border-radius: 6px`. This is a square-cornered checkbox. The `.card` system uses a check target via the card tap itself — no explicit check element visible. On the dashboard, the "check" affordance appears to be the entire card tap area, which is correct for the Phase 1 system, but there's no visible checkmark zone. The user's mental model for "tap to complete" versus "tap to open detail" is ambiguous — nothing on the card signals which gesture does which. Long-press isn't self-evident.

**[m]** Section headers (`renderTimeHeader`) render the section label in uppercase small caps. These headers are functional but use no visual hierarchy differentiation between sections — "EVENTS", "DAILY", "WEEKLY", "MONTHLY" look identical. On a busy day with 10+ tasks, the user has to read every header to find what they want. A slight left-colored stripe or icon alongside each section type would allow faster scanning.

**[m]** Completed tasks render `opacity: 0.65` on `.card--done` vs `opacity: 0.75` on `.task-card--done`. The same physical completion state reads differently depending on which card system renders it. Kid mode uses `.task-card`, parents use `.card`. Cross-page visual inconsistency.

**[P]** `.card--done .card__title` renders `font-weight: 400` (normal), while `.task-card--done .task-card__name` renders `text-decoration: line-through`. Two different visual treatments for "completed" — strikethrough (kid) vs muted (parent). Could unify to one semantic signal, or make the distinction intentional and document it.

**[P]** Task cards for events (`card--event`) show a time label in the leading area. The leading area is `min-width: 56px` for time labels but blank for non-event tasks. This left-aligns all card content differently for events vs tasks on a mixed day — event time label pushes the task name 56px right while daily tasks start at the left stripe. The result is ragged left alignment when events and tasks are adjacent.

#### 2 · Header & Ambient Strip

**[m]** `app-header__title` is `font-size: var(--font-2xl)` (24px) at `font-weight: 700`. This is the same size as the largest type in most cards — the date header and the task names compete visually. Premium apps (Things 3, Fantastical) typically use `font-weight: 800–900` for headers and lighter weight for content, creating clear hierarchy. Currently everything is `700`.

**[m]** The `app-header__subtitle-short` / `app-header__subtitle-long` toggle pattern: both variants are in the DOM simultaneously; JS shows/hides based on width. If the JS runs late (slow Firebase response), both may briefly render, causing a subtitle flash.

**[P]** The weather chip in the ambient strip uses `--ambient-weather-bg: #e0f0fa` (light blue) on light themes. This blends well. On the `dark-warm` preset where `--bg` is warm dark, the cool blue weather chip may feel tonally off. The chip color should shift warmer on warm presets.

**[P]** The ambient strip renders via `renderAmbientStrip({ weather, dinner })`. If only one chip is available (e.g., weather but no dinner planned), the strip renders a single chip left-aligned. This looks slightly lonely — a "No dinner planned" ghost chip would give the strip a more consistent layout.

#### 3 · Task Detail Sheet

**[C]** `task-detail__complete-btn` uses `border-radius: var(--radius)` at `dashboard.css:105` — `--radius` is undefined with no fallback. The complete and skip buttons render with **sharp corners** on every theme. This is the most-used action in the app, visible on every task detail open.

**[C]** Same button: `font-size: var(--font-base)` at `dashboard.css:107` — `--font-base` is undefined with no fallback. Font size inherits from the sheet container, which is a `var(--font-md)` body — accidentally acceptable today but will break if the sheet container's font size changes.

**[m]** The sticky footer uses `padding-bottom: var(--spacing-lg)` (24px) but doesn't add `env(safe-area-inset-bottom)`. On an iPhone with home bar, 24px is insufficient — the buttons sit too close to the home indicator. The undo toast and nav bar both correctly add `env(safe-area-inset-bottom)`.

**[m]** The slider section shows `task-detail__grade-preview` — "e.g. Completing at 75% is a C grade" — as right-aligned muted text. This hint is valuable but small (`var(--font-sm)`) and easy to miss. Users adjusting the points slider may not see the grade implication until after saving.

**[m]** `task-detail__slider` input has no visible ARIA label connecting the `<input type="range">` to its label text. VoiceOver users navigating to the slider will hear "adjustable" with no context.

**[m]** The `task-detail__delegate-header` shows a "Move" pill button — `task-detail__move-pill`. This pill style (transparent background, `border: 1.5px solid var(--border)`, pill shape) doesn't appear in the DESIGN.md component catalog. It's a one-off pattern used nowhere else.

**[P]** `task-detail__complete-btn--muted` (the skip/dismiss action) uses `color: var(--text-muted)` with a `var(--border)` border — it reads as a ghost/secondary button. The primary complete action (`--success`) and secondary skip action (`--muted`) are stacked vertically at the bottom. On initial load, the eye lands on both equally. The success button should be visually louder — larger padding, stronger border.

#### 4 · Celebration Overlay

**[C]** `celebration__title` uses `color: var(--bg)` — the page background color. On light themes this is off-white, which works against the dark overlay backdrop. On dark themes (`--bg: #141413`) this is near-black text on the overlay — completely invisible. The celebration title is unreadable in dark mode.

**[m]** `celebration__subtitle` uses `color: var(--surface-2)` — a surface color applied to text. Surface colors are for backgrounds. This works on light themes by accident (`--surface-2` is slightly off-white, readable against the dark overlay) but breaks on dark themes where `--surface-2: #262523` is a very dark charcoal — also near-invisible.

**[P]** The confetti uses `@keyframes confettiFall` with `transform: translateY(0) rotate(0deg)` to `translateY(120vh) rotate(720deg)`. The `120vh` ensures confetti exits below the viewport. This is correct. No finding.

**[P]** The kid mode victory scenes (15 themes with ASCII art titles and personalized subtitles) are genuinely charming — this is differentiated, delightful work. Ensure these scenes are tested at all theme variants since `celebration__title` color bug affects them directly.

#### 5 · Event Form (ef2-*)

The event form is the canonical form pattern reference. It's the most complex form in the app.

**[m]** `ef2-title-input` has `font-size: var(--font-2xl)` (24px) — a large, prominent title input matching the design pattern. The `:focus` rule correctly suppresses outline and box-shadow. However, on iOS Safari, tapping this large input immediately summons the keyboard and scrolls the sheet upward, potentially hiding the date/time fields below. No autofocus mitigation is needed (autofocus is prohibited), but the sheet scroll position should be tested on a real device.

**[m]** The 6-select time picker (`ef2-time-inputs` with hour/min/AM-PM for start and end) is visually custom but the individual `<select>` elements still render with the OS-native picker on mobile — a bottom drum roll on iOS. This is intentional (the selects are real `<select>` elements not a custom wheel). The result is that tapping "hour" triggers an iOS drum-roll picker, while the rest of the form is custom. Consider whether this native/custom mix feels coherent or jarring on device.

**[m]** `ef2-date-btn` and `ef2-time-btn` display the current value as a styled button. These buttons reveal a hidden `<input type="date">` or `<input type="time">` picker below. On iOS, `<input type="date">` renders a native date wheel. The `ef2-picker-wrap { max-height: 0; overflow: hidden }` → `is-open { max-height: 80px }` reveal animation for the native picker may look odd — the native picker has its own animation and the CSS transition clashes with it.

**[m]** The photo import button (camera icon) opens a source picker (Camera / Gallery / Files) with an optional context note. This flow is correct per spec. However, there's no visual confirmation state on the photo button after a photo has been attached — no thumbnail, no "1 photo" badge, no filled-icon state. The user can't tell at a glance whether a photo is already attached.

**[P]** The repeat sub-sheet opens via `.ef2-subsheet-overlay` — a second overlay stacked on the first. The transition (`translateY(100%)` → `none`) creates a standard bottom-sheet entrance. This works, but there's no "stack" visual cue — the user can't see the parent form behind the sub-sheet. On native iOS you'd typically see a card stack or a partial reveal of the card below.

**[P]** `ef2-allday` chip (`chip--active` state) uses `background: var(--accent-soft)` with `color: var(--accent)`. The "All Day" chip when active looks identical to any other active chip in the form. The visual distinction between "this toggles a major section" (all-day removes the time pickers) and "this is a selection chip" (people, category) is not communicated by the chip style alone.

#### 6 · Coming Up Rail

**[P]** The coming-up rail (`renderComingUp`) is a 7-day forward event summary, collapsible. The collapsed state shows a summary count; expanded shows day-blocks. Per DESIGN.md 3.3 this is a backlog feature (not yet shipped) — no finding, documented for when it ships.

---

### 7–11 · Calendar

#### 7 · Page Shell & Navigation

**[C]** `.cal-page { overflow: hidden; height: 100dvh }` — explicit DESIGN.md violation ("No `overflow:hidden; height:100dvh` page-locking outside kiosk"). The comment in calendar.css acknowledges it as necessary for the column scroll layout. If this deviation is intentional, it requires a named exception in the implementation docs per DESIGN.md: "Deviation from the spec requires a named exception in the PR description."

**[M]** The page lock eliminates all native iOS scroll behaviors on this page: no rubber-band overscroll, no pull-to-refresh affordance, no momentum. The calendar is the most heavily scrolled page in the app; the loss of native scroll feels notably un-native.

**[m]** The period label in `cal-nav__label` is `font-size: var(--font-lg)` at `font-weight: 800` — bold and prominent. The view toggle buttons (stacked view switcher in `cal-nav__controls`) are `34×26px` — acceptably tappable but noticeably small. The density toggle (`cal-controls__toggle`) is the same size. These small controls are the primary navigation affordances on a page users visit constantly.

**[m]** `cal-today-link` ("Today" button) uses `font-size: 10px` — the smallest text in the app. This pill-shaped link is the escape hatch when the calendar is navigated away from today; its tiny text reduces discoverability.

**[P]** Person filter pills on mobile (`@media max-width: 600px`) use `padding: 3px 8px` — smaller than the standard `6px 14px`. The reduced padding is intentional for density, but the `min-height: 0` override removes the 36px minimum, making these pills as short as the content requires (~24px on compact text). Touch target should be at least 32px; add `min-height: 32px` to the mobile override.

#### 8 · Month View

**[C]** `.cal-grid__cell .event-pill { font-size: 8px }` — 8px event text inside month cells is unreadable on every common phone. WCAG 1.4.4 requires text be resizable; 8px text defeats this. The minimum for any meaningful text is 11px; recommended is 12px.

**[C]** `.cal-grid__cell .event-pill__time { font-size: 7px }` — event time sub-labels at 7px are completely illegible.

**[C]** `.cal-grid__overflow { font-size: 7px }` — the "+N more" overflow indicator is 7px. This is the key overflow signal on busy days; it should be at minimum 11px.

**[M]** `.cal-grid__event-name { font-size: 8px }` — event names at 8px. Same issue as pills.

**[m]** `cal-grid__day { font-size: 11px }` — day numbers are marginal but just acceptable. The current-day number uses `color: var(--accent)` and `font-weight: 800` — good differentiation.

**[m]** Month cells at `minmax(48px, 1fr)` mean on a 6-row month in a 600px content area, each row is ~100px. There's room to increase event text to 11px within that space. The design over-compressed the text to fit — consider a "dots only" mode for very small cells with text only for larger cells.

**[m]** `cal-grid__cell--alldone::after` adds a small 8×8px filled circle with a white checkmark SVG in the top-right corner. The `background-image` URL-encoded SVG approach is correct. However, the circle is 8px and the SVG path stroke is `1.5` — at 8px physical size on a 3x display this renders at 24 CSS pixels equivalent and looks fine. No finding, just noted.

**[P]** `cal-grid__cell--past { opacity: 0.5 }` — past month cells at 50% opacity. The jump between past (50%), past-incomplete (75%), and current (100%) is abrupt. A continuous gradient from 50% (oldest) to 95% (yesterday) would look more polished.

#### 9 · Week View

**[M]** On desktop (>600px), week columns stack in a 7-column grid, each column independently scrollable. The `cal-week__timed .event-pill__time { font-size: 0.5625rem }` (9px) applies to timed event time labels in this view — marginally readable on desktop, unreadable on a 96dpi display.

**[m]** On mobile (<600px), the week view converts to a stacked vertical list (one card per day). This is a thoughtful adaptation. However `cal-week__col--past { opacity: 0.55 }` dims past days heavily — on Sunday evening, Monday through Saturday are all dimmed. The current active day should pop; past days should fade but not disappear.

**[m]** The `cal-week__tasks--daily` section inside each mobile day card has `max-height: 180px; overflow-y: auto` to contain long daily task lists. This inner scroll creates a scroll-within-scroll UX — the user is scrolling the page and then hits the 180px daily task section and has to scroll a different element. On touch devices this is disorienting.

**[P]** The "Today" pill tag (`cal-week__today-tag`) is a small white-on-accent pill. Good visual cue. The pill is positioned as a flex child in the column header, not absolutely positioned, so it participates in layout and can cause the header to reflow on the today column. This is fine but worth testing when task names overflow the column header.

#### 10 · Day View

**[m]** `cal-day__section-header--sticky { position: sticky; top: 0; z-index: var(--z-header) }` — section headers stick to the top of the day view scroll area. The sticking header has `background: var(--bg)` which is correct. However, when the sticky header engages, it creates an abrupt horizontal line across the content without a shadow or blur — it visually "cuts" tasks below it. A `box-shadow: 0 2px 6px var(--bg)` on `.sticky` engagement would soften this.

**[m]** `cal-day__task-tod { font-size: 9px }` — the "AM/PM" time-of-day label on task rows is 9px. Same readability concern as the month view. Should be `var(--font-xs)` (12px) minimum.

**[m]** `cal-day__task-check--done::after { content: '✓' }` — Unicode checkmark character. Rendering varies by OS font stack. The dashboard uses a proper CSS border trick for the checkmark. Inconsistency between day view checks and dashboard checks.

**[P]** Person sections in the day view (`cal-day__person-header`) use a `border-bottom: 2px solid var(--person-color)` color line under the person's name. This is a good use of color as a semantic separator. Works well.

#### 11 · Event Detail Sheet

**[P]** `.event-detail__name { font-size: var(--font-lg); font-weight: 800 }` — large bold name at top of sheet. Good hierarchy. The `.event-detail__time` below it is `var(--font-md)` at `font-weight: 600` — slightly lighter. Clean and readable.

**[P]** `event-detail__color-bar` — 4px color strip at the top of the sheet, matching the event color. A nice polished detail that reinforces the event's identity.

---

### 12–15 · Scoreboard

#### 12 · Leaderboard Cards

**[M]** Grade colors `--grade-a` through `--grade-f` are not overridden in dark mode (see Design System section). The grade badge on each leaderboard card uses `renderGradeBadge` which applies these colors. On dark themes, navy B badges and dark green A badges become near-invisible. The score cards are the primary visual content of this page.

**[m]** The leaderboard sorts by the active period's grade. On the "Today" tab, a person with no tasks that day has no grade and sorts last. There's no empty state or explanation for why a person is missing from the top positions — the user has to infer.

**[m]** Achievement badge icons render on scoreboard cards (up to 5 latest). The badges use `--achievement-badge: 1.25rem font, opacity 0.2 grayscale` for locked states but the scoreboard only shows unlocked badges. On a new family with no achievements earned, the trophy slots show nothing — the space where badges would appear is invisible, leaving no hint that achievements exist.

**[P]** The trend indicator (↑ green / ↓ red / — neutral) is rendered as inline text characters. Small up/down arrows would read better than text characters at the small size these appear.

#### 13 · Grades Table

**[M]** Grade badge colors — same dark mode issue. The grades table uses `renderGradeBadge` which applies the same unthemed color set.

**[m]** Column widths: `grid: 1.5fr repeat(4, 1fr)` — the name column gets 1.5x width. On a phone with 4 family members, the table is 5 columns. At 390px viewport width: name column = 390 × (1.5/5.5) ≈ 106px, each grade column ≈ 71px. Grade badges at 71px wide are fine. At 320px (older phones) the name column = 87px which clips longer names. The name cell uses `text-overflow: ellipsis` — verify it works at this size.

**[P]** The table header row repeats the column labels (Today/Week/Month/Year). These column headers are the same as the period tabs above the table. The duplication is deliberate for cross-referencing but the header row could use slightly bolder weight to distinguish it more from data rows.

#### 14 · Drilldown Sheet

**[m]** The drilldown sheet opens when a person card is tapped on the scoreboard. The sheet contains: header, summary (grade + pts), category breakdown bars, 4-week sparkline, streak, balance, and "Needs Attention" task list. This is a lot of content for a `max-height: 80vh` sheet on a phone. On an iPhone SE (375px wide, ~667px tall), 80vh = 534px. The header + summary alone takes ~80px; full content likely exceeds the sheet height on any phone, making the sheet scrollable internally. This is expected behavior but the user doesn't get a cue that there's more content below the fold.

**[m]** `.sb-drilldown__balance-big { font-size: 1.75rem }` — 28px. This is larger than the grade percentage display above it. Points balance may not warrant more visual weight than the grade/percentage. Consider 24px to match the rewards balance zone.

**[P]** `.sb-streak-icon { color: var(--warning) }` — the streak fire icon uses the warning color (amber/yellow). On dark themes `--warning: #d4aa60`, a muted gold. This is thematically appropriate (fire = golden) but could be a warmer orange for more visual excitement on a streak display.

#### 15 · Highlights & Category Leaders

**[m]** Highlights show person-specific callouts ("X is on a 5-day streak", "X is up 12% this week"). These render as text rows with icons. On a new family or after a scoreboard reset, there are no highlights — the section disappears entirely. The transition between "no highlights" (section absent) and "has highlights" (section present) shifts all content below downward. A skeleton or empty state would prevent this layout shift.

**[P]** Category leaders show one row per category with the leader's name + color dot + percentage. On a single-person family, there's only one possible leader for every category — showing category leaders is meaningless. The section could be hidden for single-person families.

---

### 16–19 · Tracker

#### 16 · Weekly View

**[m]** Weekly view groups tasks into sections: Overdue → Upcoming → Done → Skipped/Cooldown. The "Overdue" section header text renders in `var(--danger)` color (`.tracker-section--overdue .section__title`) — a semantic color cue. Good. But the task cards within the overdue section use the Phase 1 `.card` component with `card--overdue` modifier — the danger styling on the section header and the card are two different visual systems signaling the same thing. Redundant and slightly inconsistent.

**[m]** Person filter on tracker uses smaller pills (`padding: 4px 10px`, `font-size: var(--font-xs)`, `min-height: 32px`). The 32px minimum is acceptable but tighter than the standard 36px person pill. Small touch target on a page you might use while multi-tasking.

**[P]** `tracker-week-group--current { border-left: 3px solid var(--accent) }` — the current week gets an accent left border and padding. This is a good "you are here" visual anchor.

#### 17 · Monthly View

**[m]** Monthly view shows weeks sorted: current first, then future ascending, past descending. The week group for the current week has a "This Week" tag (`tracker-week-current-tag`). Past weeks show date ranges. Future weeks show date ranges. A user reviewing last month has to scroll backward through all future weeks before reaching past weeks. Consider pinning "This Week" and immediately following it with past weeks in descending order, with future weeks collapsed or below.

**[m]** The `tracker-content--slide-next/prev` CSS animation (opacity + translateX over 220ms) gives tactile feedback when swiping between periods. This is thoughtful. However the animation is triggered on swipe release, not on swipe move — there's no in-progress visual while the user's finger is in motion. The content only transitions after release.

**[P]** The "Back to Today" button (visible when viewing non-current period) is a standard ghost button. Good. No finding.

#### 18 · Task Detail Sheet (Tracker Context)

The tracker task detail sheet is the same base component as dashboard but with tracker-specific controls (mark complete from any date, delegate, move, skip, notes, edit).

**[m]** The detail sheet on tracker has a "Skip" action that removes the entry from the schedule. Skip is not clearly differentiated from "Mark as Skipped" — these may be functionally equivalent but the label should clarify whether the task is removed entirely or just marked.

**[m]** When a task is long-pressed from the tracker (500ms), the detail sheet opens. The 500ms threshold is intentional (CLAUDE.md: 500ms on tracker vs 800ms on dashboard/kid/calendar). A user moving between the tracker and dashboard will find that long-press feels notably faster on tracker — this could cause accidental sheet opens on a heavy-touch scroll.

#### 19 · Task Form

The task form is accessible from the tracker detail sheet's "Edit Task" button and from the admin Tasks tab.

**[m]** The task form uses reveals to show/hide sections (Daily shows no extra options; Weekly shows day selector; Monthly shows day-of-month; Once shows date picker). The reveals use `display: none` toggled by chip selection. Good. However, when a rotation type is changed (e.g., Daily → Weekly), the newly revealed "Day of week" selector has no default selection — it renders empty. If the user saves without selecting a day, the behavior is undefined or uses a fallback. Empty selects should show a "Choose a day" placeholder.

**[m]** The bounty toggle reveals a "Bounty type" section (Points | Reward). Selecting "Reward" then requires selecting which reward — but the reward selector isn't visible from the task form context. The user has to know rewards exist in the rewards section. A hint linking to rewards would help discoverability.

**[P]** The task form has a "Notes" section behind a toggle reveal. The reveal adds the section below existing fields with a smooth expand. This pattern is consistent with the event form. Good.

---

### 20–26 · Rewards

#### 20 · Balance Header & Tabs

**[m]** The balance zone shows avatar + name + balance amount + trend sparkline. The balance amount uses `--font-2xl` (24px, 700 weight) — the same visual weight as the app header title. On the rewards page, the balance should be the hero element, which this achieves. However, the `.rewards-balance__unit` ("pts") uses `--font-sm` and `--text-muted` — this is correct for secondary info.

**[m]** The view-as selector (`rewards-view-as__select`) renders a native `<select>` in the header actions area. On iOS this renders a native dropdown, which feels out of place in the top-right action zone. Parent switching their view to see a child's balance should use a person-pill or person-chip pattern, not a native select. The `text-align: center` on the select is inconsistently supported across browsers.

**[m]** Tab bar spacing: `rewards-tabs { margin-top: --spacing-sm; margin-bottom: --spacing-sm }` — the tabs have balanced top and bottom margins. This is clean. The tab labels are: Shop, Bank, History, and Approvals (adults only). "Bank" is not universally understood as "saved rewards" — some users may expect "Bank" = the bank of points. Consider "Saved" or "Vault" as an alternative label.

**[P]** The 30-day trend sparkline in the balance header is a polyline SVG. This is a nice data element but it has no axis, no legend, no tooltip, and no scale labels. A user looking at an upward-sloping sparkline cannot tell whether it represents "earned 100 points last week vs 80 this week" or "went from 500 to 501 points." The sparkline communicates trend direction but not magnitude.

#### 21 · Shop Tab

**[m]** Reward cards use `.reward-card` (from components.css) — a horizontal card with icon, name, cost, type, and a "Get" button. The card layout puts the "Get" button on the right edge. On a small phone, if a reward name is long, it wraps and the card height increases — but the "Get" button stays right-aligned at the top, creating awkward vertical misalignment. The button should be bottom-aligned or the card should be constrained to a fixed height.

**[m]** The filter bar has a search input and a "Filter & Sort" chip that opens a bottom sheet. The filter sheet has type chips and sort chips. After applying a filter, the filter bar chip should show a visual "active" state (e.g., filled chip, badge count) to indicate active filters. Currently there's no indication that filters are active vs cleared.

**[m]** The empty state "No rewards available for you yet" uses the standard `empty-state` component. Good. However, from a kid's perspective, this empty state provides no path forward — they can't create rewards. The empty state should say something like "Ask a parent to add rewards for you here."

**[P]** The reward card "Get" button maps to `handleGetReward()`. If a reward requires parent approval, the button should say "Request" not "Get" to set correct expectations. Post-tap, the button should show "Requested" state to prevent duplicate requests.

#### 22 · Bank Tab

**[m]** The bank shows unused tokens (approved rewards) and a "Show X used" toggle for past tokens. The separation between "active" and "used" rewards is good — the toggle prevents the bank from growing infinitely long. However, the "used" section label ("Show 4 used") doesn't clarify the timeframe — are these all-time used rewards, or last 30 days?

**[m]** Bank tokens show the reward icon, name, acquired date, and a "Use" button. Custom rewards show "Pending Parent Approval" state. The distinction between "Use Now" (functional rewards: Task Skip, Penalty Removal) and "Send Use Request" (custom rewards) is important but not visually prominent in the bank. A user holding a custom reward may tap "Use" expecting immediate use and instead trigger an approval flow without warning.

**[P]** The per-kid bank sections (visible to parents in parent view) show each child's tokens grouped separately. Each group shows the child's avatar and name as a section header. This is clear. The visual language matches the rest of the rewards page.

#### 23 · History Tab

**[m]** History rows are paginated at 50 per page with a "Show +N more" button. The button uses the `rewards-show-more` class — centered, muted text. This pattern matches the standard pagination used elsewhere. Good. However, the first 50 items render on page load without virtualization — if a family has 200+ transactions, the initial render is a large DOM. Consider lazy loading or a virtual list.

**[m]** History filter chips (All | Purchases | Uses | Bonuses | Deductions) are correct categorizations. However, "Purchases" for a family app where kids earn things rather than buy them may feel tonally wrong. "Redeemed" or "Earned" aligns better with the positive reinforcement theme.

**[P]** History items show icon, type, title, date, and amount. Positive amounts are in `--success` color, negative in `--danger`. The color coding is intuitive. No finding.

#### 24 · Approvals Tab

**[m]** The approvals tab is only visible to adults. The tab label "Approvals" doesn't carry a badge count — if there are 3 pending approvals, the parent has to open the tab to see the count. The bell icon (global notification) handles unseen count, but the tab itself doesn't show urgency. A red badge on the Approvals tab would surface pending work without requiring the parent to remember to check.

**[m]** The "Deny" button opens a confirm modal with an optional reason input. The "Approve" button has no confirmation — it's immediate. This asymmetry is intentional (denials are more consequential) but the deny reason field isn't surfaced to the kid — there's no indication in the kid's message history that a reason was given. The reason is presumably in the `body` field of the `redemption-denied` message, but verify this surfaces in the kid's history.

**[P]** The "Recent" section (resolved in last 30 days) is behind a "Show X recent" toggle. On initial view, if there are pending approvals + recently resolved items, the parent sees pending items cleanly before deciding whether to look at resolved. Good UX structure.

#### 25 · Reward Form Sheet

**[m]** The reward form has 6 main sections: icon picker, type pills, cost input + pricing helper, visibility chips, approval toggle, and an "Advanced" reveal (max uses, streak requirement, expiration). The advanced section contains time-sensitive controls (expiration date) that parents may want to set on creation. Hiding expiration behind "Advanced" means parents may miss it on creation and have to re-edit.

**[m]** The icon picker shows an emoji grid + custom input. The grid of pre-defined emojis has no labels — a parent creating a "Movie Night" reward has to recognize which trophy/star/film emoji means what. Labels or categories (Activities, Food, Objects, etc.) would help.

**[m]** The pricing helper ("days × grade → suggested cost") is a valuable UX feature for setting calibrated reward costs. However, the helper is presented as an inline UI element; it's not clear whether it's interactive or read-only. If it's interactive (parents can adjust days/grade to see suggested costs), make it more obviously interactive.

**[P]** The "Archive" vs "Delete" distinction for rewards is important — archived rewards are hidden but preserve redemption history, deleted rewards lose history. The form buttons should label this difference more explicitly.

#### 26 · Intent Sheet

**[m]** The intent sheet shows "Save to Bank" vs "Use Now" for custom rewards that have been approved. These two options are presented as chips. The stakes of each choice are high: "Use Now" sends a use-request to the parent; "Save to Bank" stores for later. The chip pattern underplays the weight of this decision. A full-button layout with clear consequence labels would reduce regret.

---

### 27–30 · Kitchen

#### 27 · Lists Tab

**[m]** The list switcher (`list-switcher__tabs`) is a horizontal scrollable tab row for switching between shopping lists. Each tab is the list name. Creating a new list adds a new tab. On a family with many lists, the tab row scrolls but has no scroll shadow/fade to indicate overflow — a horizontal overflow fade would improve discoverability of hidden tabs.

**[m]** The `item-add-field` (single-item inline add) uses `border: 1.5px solid var(--accent)` when focused — the accent border indicates active input. The `.is-confirmed::placeholder { color: var(--accent) }` state changes the placeholder color to accent after a successful add — a nice "item was added" feedback. However this feedback is placeholder-only; a brief green flash on the item row in the list would be more visible.

**[m]** The AI wand button (`list-wand-btn`) triggers a "deep clean" of the list — deduplication, renaming, re-categorization via the Worker. There's no preview before applying; the clean is applied immediately. For a feature that can rename items, this should show a confirmation step: "Reorganized: 3 items renamed, 1 duplicate removed — Apply?" This follows the same confirmation pattern as AI recipe import.

**[P]** The `list-wand-btn` shows a loading pulse animation (`opacity: 0.4 → 1, 1s infinite`) while the Worker processes. The pulse communicates "working" but doesn't communicate progress or estimated wait time. A "Cleaning list…" toast would add context.

**[P]** List items have a category displayed inline (e.g., "🥛 Dairy"). The category rendering looks good. Uncategorized items show no category label — they appear at the end of the list with no visual separator between categorized and uncategorized sections. A subtle "Uncategorized" section header would complete the list structure.

#### 28 · Recipes Tab

**[m]** Recipe cards (`rl-recipe-card`) show name, URL icon (if URL exists), and action buttons. The card title truncates with `text-overflow: ellipsis`. On a phone with many recipes, all cards look similar — no visual hierarchy distinguishes favorites, recently used, or high-use recipes. A star or "recently used" indicator would help navigation.

**[m]** Recipe creation includes name, URL, ingredients (name + qty), and notes. The ingredient list uses an "Add ingredient" button that appends a row. In a form with 10+ ingredients, the "Add ingredient" button scrolls off screen and the user has to scroll down to reach it. Pinning the button at the bottom of the ingredient list (like the sticky footer pattern) would help.

**[P]** URLs in recipe cards render a link icon button. Tapping opens the URL. Good. There's no "Open" label — just an icon. For users unfamiliar with the icon convention, a short label would improve discoverability.

#### 29 · Staples Tab

**[m]** Staples are items that should always be in the house. They render as a list with a star toggle. Long-press reveals an edit form. There's no visible empty state described in the CSS/JS — if a family has zero staples, the tab shows nothing, with no hint that items can be added. A "Long-press any item to edit, tap to add to shopping list" hint on first load would orient new users.

**[P]** The star toggle on staples items is a bookmark/save idiom. On the staples tab this means "prioritize" or "flag." The meaning is contextually clear but the star icon has two meanings in this app (favorite recipe = star, priority staple = star). Consistent iconography is desirable.

#### 30 · Meal Plan Tab

**[m]** The week strip (`week-strip`) uses touch drag (`touch-action: pan-y`) to allow horizontal swiping between weeks. The track position transition (`transition: transform`) handles the scroll. However, there's no visible pagination indicator — the user can't tell how many weeks are navigable or where they are in the calendar. A week-position indicator ("Week of May 4") in the strip header would orient the user.

**[m]** `day-block__slot { min-height: 32px }` — each meal slot (Breakfast, Lunch, Dinner, etc.) is 32px. This is a tight touch target for a frequently tapped element. The iOS HIG minimum is 44px. The school-lunch slot renders a distinct `day-block__slot-school` badge — good semantic differentiation.

**[m]** Empty meal slots render italic placeholder text (implied by `day-block__slot-name--empty` italic styling). An unplanned dinner slot doesn't give any hint that tapping assigns a meal. The italic text should say "Tap to plan" explicitly rather than relying on an empty italic text label.

---

### 31–37 · Admin

#### 31 · PIN Gate

**[m]** The PIN gate uses `.admin-pin-digit` inputs — `48×56px` number fields laid out in a row of 4. Auto-tab between fields on input is implemented in JS. This is good for UX. However, on iOS, numeric keyboard `inputmode="numeric"` should be confirmed — if the keyboard doesn't auto-show as a number pad, PIN entry requires the user to switch keyboards.

**[P]** The gate shows a title ("Admin Panel"), description, 4 PIN digits, and a submit button. There's no "forgot PIN" flow shown (the recovery PIN 2522 is documented in CLAUDE.md but not surfaced in the UI). If a parent forgets their PIN, the only recourse is knowing `2522` — no in-app prompt mentions this. Consider a subtle "Forgot PIN?" link that shows the recovery hint.

#### 32 · Tasks Tab

**[M]** The admin tab component (`.admin-tab` with icon+label vertical layout, `background: var(--accent)` active state) diverges from the standard `.tabs` / `.tabs--pill` / `.tabs--segmented` patterns in the design system. Admin tabs have a custom look that doesn't match any other tab in the app. Future improvements to the standard tabs won't flow through to admin tabs.

**[m]** The tasks list uses `.admin-list-item` rows with checkbox for multi-select mode. The multi-select mode is activated by... what? Long press? A toggle button? The interaction trigger for multi-select isn't clear from the CSS/structure — it needs discovery through use.

**[m]** The bulk edit modal appears when multiple tasks are selected. The modal includes dropdowns for bulk-changing properties. Each dropdown defaults to "No change" — this is correct. After applying, the tasks update and the multi-select mode clears. There's no undo for bulk edits. This is a potentially high-impact operation (changing 20 tasks' rotation type) with no safety net.

**[m]** Task list rows show name, owner count, rotation badge. The rotation badge is text-only ("daily", "weekly"). A color-coded dot would allow faster scanning. The category icon is shown in the row — useful for distinguishing similar task names in different categories.

**[P]** The search input for tasks uses a standard text input. On mobile, tapping this input scrolls the page to show the keyboard — if the task list is long, the user loses their scroll position. The search should filter client-side from Firebase data already in memory, not trigger a scroll on focus.

#### 33 · Events Tab

**[m]** Events are listed in the same `.admin-list-item` pattern as tasks. Events show name, date+time, and color dot. This is clean. However, events don't show which person/people the event belongs to — a parent managing 10 family events can't tell at a glance which events are for which child. An avatar row or person dot(s) alongside each event row would help.

**[P]** The event form opened from admin uses the same `ef2-*` form component as the calendar "New Event" flow. Good reuse.

#### 34 · People Tab

**[m]** The person detail view has a lot of controls: name, color, role, admin toggle, kid settings (8 toggles), theme selector, balance display, "Save anchor," bonus/deduction buttons, and delete. This is a dense admin form. The kid settings section (celebrations, swipe days, store, achievements, etc.) is 8 toggles that all live in one scrollable form with no visual grouping. Grouping them into "Display," "Permissions," and "Privacy" subsections would reduce the scanning load.

**[m]** The "Save anchor" button sets the balance baseline but has no explanation of what an "anchor" means in the rewards economy context. This is a power-user concept (reset the balance reference point for calculating earned points). The label "Set Balance Baseline" with a helper text would be more transparent.

**[m]** The bonus/deduction buttons open a message modal. This flow requires: admin opens person detail → taps bonus → fills message modal → sends. For a parent giving a quick bonus, this is 3 actions deep. The bell dropdown also has this flow — good that it's accessible from the bell, but the admin path is longer.

**[P]** The person color picker uses `cpick-btn` (circle button) that opens `cpick-pop` (8-column color grid popover). The popover appears at a fixed position. On small screens the popover may overflow off-screen. The popover uses `position: fixed` and `z-index: 600` — it escapes the form's overflow context. Verify the popover positions correctly in the admin form context.

#### 35 · Categories Tab

**[m]** The category form has an "Is Event" toggle that transforms the form — when toggled, it swaps the weight/limits section for an event color picker. This conditional reveal is a good pattern. However, the toggle label is "Is Event" — "Event category" would be clearer for non-technical users who may not know what an "event" means in this app's context.

**[m]** The "Weight percent" field for task categories has a hint about how weighted scoring works. This is valuable context, but the hint text is small and muted — easy to miss. The weighting system is complex enough that a one-line explanation inline with the field label would help parents calibrate correctly.

**[P]** The "Is Default" checkbox sets one category as the default for new tasks. Only one default is allowed — checking one unchecks others (JS behavior). The visual interaction for this mutual exclusion is unclear from the checkbox UI alone. Radio buttons would communicate mutual exclusion natively.

#### 36 · Settings Tab

**[m]** The settings tab has 7 sections: App, Difficulty Multipliers, Scoring & Display, Interaction, Calendar, Other, Security. This is a long vertical scroll on mobile. The sections have no visual separation — they're separated only by `border-top: 1px solid` lines. Strong section headers with background tint (like `admin.css`'s `admin-settings-section`) would help break this up visually.

**[m]** Difficulty multipliers have an inline validation warning ("not monotonic increasing") — shown if easy ≥ medium or medium ≥ hard. This warning appears as a colored text warning but it's non-blocking — the parent can save invalid multipliers. Either block save with these invalid values, or make the warning more prominent.

**[m]** Weather settings (location + API key + test button) are buried at the bottom of the "Other" section. These affect the ambient strip, one of the most visible dashboard features. Promote these to their own section or the top of "Other."

**[P]** The settings save button is at the bottom of the page after all sections. On mobile, the user scrolls through all sections to reach save. A sticky save button (like the task detail footer pattern) would prevent the scroll-to-save pattern.

#### 37 · Tools Tab

**[m]** The AI imports section (School Lunch, Task Scanner, Email Imports) uses photo capture flows with a source picker (Camera / Gallery / Files). After photo capture, items render as a confirmation list. The confirmation pattern (show extracted items, let user deselect bad ones, then import) is correct. However, there's no indication of how the AI processed the photo — if the result looks wrong, the user has no path to "try again with a better photo" other than re-triggering the whole flow. A "Rescan" or "Try again" button in the confirmation state would help.

**[m]** The schedule rebuild buttons ("Rebuild Schedule" and "Clear Past & Rebuild") are buttons without confirmation. Rebuilding the schedule is a high-impact operation — it wipes and replaces future schedule entries. These should use `showConfirm()` before executing, consistent with the scoreboard reset flow.

**[m]** The scoreboard reset requires typing "RESET" — good friction for a destructive operation. The factory reset also requires "RESET." Both destructive operations use the same confirm pattern. Consider escalating the factory reset to require "FACTORY RESET" to prevent accidental confusion between the two.

**[P]** The debug section (event log) uses `debug-panel` with hardcoded `background: #1a1a2e`, `color: #e0e0e0`, `title color: #ffd93d`. These are not themeable. On a light theme, the dark navy panel is a jarring visual intrusion. Should use `var(--surface)` and `var(--text)` with a monospace font for the log display.

---

### 38–43 · Kid Mode

Kid mode is the highest-stakes surface — it's what children see every day and what determines whether the app is delightful or tedious.

#### 38 · Task List

**[m]** Kid mode uses `.task-card` (old system) at `min-height: 56px` with `padding: 12px` — larger cards than the parent view's `.card` at 60px. The emoji hint system (140+ patterns) appends emoji to task names, e.g., "🪥🦷 Brush Teeth." This is charming and a genuine differentiator. However, emojis are appended with a leading space but no consistent separator — the result is "Brush Teeth 🪥🦷" which reads as emoji-tagged rather than visually distinct. Consider a subtle pill or badge pattern for the emoji hint instead of inline appending.

**[m]** The check button on kid task cards is `26×26px` — larger than the parent's `22×22px`. Good for child touch targets. However the tap zone for completing a task is the check button, not the full card — the card tap opens the detail sheet. On a rushed morning, children pressing randomly on the task card rather than the specific check button will open the detail sheet instead of completing the task. Consider making the full card area the tap zone for completion, with long-press for detail.

**[m]** PIN-protected tasks show a lock icon but no hint that a PIN is needed — the task card looks the same as any other. A child encountering a PIN gate for the first time may be confused. A subtle "🔒 Ask parent" hint on the card meta line would set expectations.

**[P]** The emoji hint system uses `taskNameWithEmoji(name)` with 140+ regex patterns. Pattern matching is case-insensitive and handles common family task names. This is solid. However the patterns use simple string matching — "clean room" matches "cleaning rooms" but "fold laundry" and "laundry folding" both need separate patterns. The system works but can produce missed matches for unusual phrasing.

#### 39 · Header & Stats Bar

**[m]** `.kid-header__wave` uses `animation: wave 2.5s ease-in-out infinite` on the wave emoji — a gentle rocking animation. This is delightful and appropriate for kid mode. The animation is guarded by `@media (prefers-reduced-motion)` in kid.css. Good.

**[m]** `.kid-header__name { color: var(--kid-color); font-weight: 800 }` — the child's name displays in their personal color. This is a lovely personal touch. However, `--kid-color` is applied via an inline style (`style="color: var(--kid-color)"`) — not via a CSS token propagated from the root. Verify that `--kid-color` is set correctly when a child's personal color overrides the family default.

**[m]** Stats bar shows grade / tasks done / streak in a 3-column row. The grade uses `renderGradeBadge` — grade colors are not dark-mode-aware (see Design System section). This is the first thing a child sees about their performance — an invisible grade badge in dark mode is a significant miss.

**[P]** The stats bar values are tappable in the full app (grade taps to scoreboard, streak taps to history). Verify these tap targets have sufficient hitbox in kid mode — the stats bar layout uses flexible column widths and small font sizes.

#### 40 · Celebrations

**[m]** `kid-victory` uses a gradient title — `background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white))` as background-clip text. This is on the celebration overlay (dark backdrop), not the chrome — it's contextually appropriate, not a DESIGN.md violation (the rule is "no gradient text in chrome"). However, the gradient text approach has the same `-webkit-background-clip: text` cross-browser concern as the legacy header title.

**[m]** `celebrationStyle: 'full'` triggers emoji rain + confetti. The emoji rain uses 15 emoji drops with random start positions, fall distances, and durations — creates a joyful shower effect. `celebrationStyle: 'subtle'` uses sparkle rain + toast. `celebrationStyle: 'off'` disables all animation. This is a well-thought-out preference system. The default style for a new child isn't explicitly clear from the CSS/JS summary — confirm the default is 'full' for children who haven't set a preference.

**[P]** Victory scenes are 15 themed ASCII art displays with personalized subtitles. These are genuinely fun and differentiated. The randomization is done via `Math.random()` — verify the same scene doesn't repeat twice in a session (a uniqueness filter on recent scenes would prevent repetition fatigue).

#### 41 · Reward Bank & Store

**[M]** (See Design System section) `kid-balance__amount--negative { color: var(--accent-danger, #e53e3e) }` — always uses hardcoded red on dark themes. The balance display is the first number a child sees on the store/bank view. In dark mode this reads as a wrong bright red against a dark background.

**[m]** The bank (`<details>` element) uses the native disclosure triangle for expand/collapse. This is a `<details>/<summary>` HTML element. On iOS Safari, the triangle render is OS-native and looks dated compared to the rest of the custom UI. Using a custom chevron animation (like the rewards page "Show X used" toggle) would match the app's design language.

**[m]** "Use Now" vs "Save for Later" in the kid approval overlay — these are high-stakes buttons for a child. "Save for Later" (bank token) should be clearly secondary to "Use Now" to match child psychology; most kids want to use rewards immediately. Button hierarchy (primary "Use Now" + secondary/ghost "Save for Later") would encourage the more common action.

**[P]** The wishlist tracker shows the child's progress toward their most expensive wishlisted reward. The progress bar uses `--accent` fill with a transition on width. Good. If no reward is wishlisted, this section is absent — no hint to the child that they can wishlist items. A "Wishlist a goal from the shop" prompt would introduce the feature.

#### 42 · History & Trophies

**[m]** History items are grouped by date and show icon, title, and amount. Positive amounts use `--accent-success` (hardcoded green) and negative use `--accent-danger` (hardcoded red). Same dark mode token issue as the balance display.

**[m]** The trophy case (`kid-trophy`) uses a grid layout with locked achievements at `opacity: 0.35; filter: grayscale(1)`. Locked trophies show a faint silhouette of the badge but no hint about how to earn it. Children naturally want to know "what do I have to do to get this?" — showing the achievement criteria on locked badges (e.g., "Complete 7 days in a row") would drive engagement.

**[P]** Unlocked achievements have a brief full-screen unlock overlay on kid mode load. The overlay is shown for unseen achievements. This is a high-impact moment — the first time a child earns a badge should feel major. The current implementation shows the overlay as a full-screen timed display. Ensure the overlay has sufficient visible time (3+ seconds, not auto-dismissed in <2s) for the achievement to register.

#### 43 · Kid Settings Panel

**[m]** The settings panel slides up from the bottom. It contains theme selection (preset buttons) and color selection (color circles). These are destructive-ish — changing your theme/color is permanent until changed back. No confirmation is shown. For a child who accidentally taps a different color, the change is immediate. A brief "3 seconds to undo" toast would prevent frustration.

**[P]** The settings panel is accessible from a gear icon in the header. The gear icon is positioned absolutely in the top-right corner — `position: absolute; top: 0; right: 0`. If the child's name is long, it may overlap the gear icon. Verify with a 12-character name.

---

### 44 · Setup Wizard

#### All 6 Steps

**[m]** `setup.html` contains an inline `<style>` block for wizard-specific styles — a DESIGN.md hard rule violation ("No inline styles in HTML"). The styles should be in `admin.css` or a dedicated `setup.css`.

**[m]** The step indicator uses `step-dot` circles (10×10px) with active/done states. This is a standard wizard pattern. However, clicking a previous step dot is not explicitly handled — should clicking "Step 2 dot" when on Step 4 navigate backward? If navigation is sequential-only (only forward/back buttons), the dots shouldn't look interactive.

**[m]** Step 2 (People) includes 8 kid setting toggles per child. For a first-time user setting up the family, 8 toggles per child is overwhelming before the child has even used the app. Consider showing only 2–3 essential settings in setup (e.g., Celebrations: yes/no, Store: yes/no) and deferring the rest to admin.

**[m]** Step 4 (Theme) shows a 2×2 theme grid plus 8 accent color swatches. The live preview updates as themes are selected — this is a good immediate feedback mechanism. However, the preview is small (just the theme swatch button) — the user can't see how their chosen theme affects actual task cards and headers without finishing setup. A larger live preview (showing a sample task card or header) would help decision-making.

**[m]** Step 5 (PIN) accepts any 4 digits including `0000`. There's no strength indication or restriction. The recovery PIN `2522` should probably not be a valid setup PIN — a family that accidentally sets their PIN to the recovery PIN has no security. Client-side validation should block `2522` as a setup PIN choice.

**[P]** Step 6 (Finish) shows a summary and a "Launch" button. The launch writes data to Firebase and redirects. There's no "Back" button on step 6 — if the user wants to change a setting, they can't. A "Back" button on step 6 would round out the navigation.

---

### 45–54 · Global Components

#### 45 · Bottom Sheet

**[m]** `max-height: 80vh` — on landscape phone (iPhone SE landscape: ~375px viewport height), 80vh = 300px. A sheet with more than 3 fields will require internal scrolling. The event form (ef2-*) has 8+ fields and will be cramped in landscape. Sheets should at minimum add `min(80vh, 600px)` as a `max-height` fallback, and test the event form on landscape iPhone.

**[m]** No `max-width` on `.bottom-sheet` — on a 1440px desktop the sheet spans the full width. The `.app-shell` is constrained to 560px at `min-width: 768px` but the sheet is `position: fixed` and escapes this. On desktop, sheets go wall-to-wall.

**[P]** `.bottom-sheet__handle` is `36×4px`. WHCAG touch target recommendation is 24×24px minimum for interactive elements. The drag handle isn't interactive in the current implementation (no drag-to-dismiss) — it's decorative. If drag-to-dismiss is ever added, the handle needs to be larger.

#### 46 · Confirm Modal

**[m]** `.confirm-modal__actions { justify-content: flex-end }` — right-aligned Cancel/Confirm. Native iOS dialogs center or full-width their actions. The current layout looks more web-like than native. Full-width actions (`display: flex; flex-direction: column-reverse`) with the primary action first (bottom, closest to thumb) would feel more native.

**[m]** The modal animates via `opacity` + `transform: scale(0.9 → 1)`. Good. The overlay animates via `opacity`. The two animations are independent — the card appears to "pop up" before the overlay fully darkens, which can look layered-wrong. Synchronize the animation durations and timing functions.

**[P]** `padding: 24px` is hardcoded. Should use `var(--spacing-lg)`.

#### 47 · Toast & Undo Toast

**[C]** `.toast { bottom: 24px }` — the standard toast is positioned 24px from the bottom. The nav bar is 68px tall. The toast overlaps the nav bar by 44px. The undo toast correctly uses `calc(var(--nav-height) + var(--spacing-md))`. The two toasts use different positioning — standard toast is broken.

**[m]** Undo toast uses `background: var(--text); color: var(--bg)` — inverted colors. Good high-contrast pattern for temporary overlays. The undo button is `color: var(--accent)` — accent color on the inverted background. Verify the accent color has sufficient contrast against `var(--text)` backgrounds on all 5 themes.

#### 48 · Bell Dropdown

**[m]** The bell dropdown renders pending approval requests prominently, then recent activity. On a family with many activity items, the dropdown becomes long and requires scrolling. The dropdown has a `max-height` constraint (likely in components.css). Verify the pending approvals section stays visible at the top without scrolling on any non-trivial activity log.

**[m]** The bell dropdown is closed by clicking outside. On touch devices, "clicking outside" requires deliberately tapping elsewhere — users navigating via tap may struggle to close the dropdown without accidentally triggering another element.

**[P]** Bell badge count shows unseen messages. After the bell is opened, the count clears. If the user opens the bell and closes it without reading all messages, the count should persist until messages are actually seen (scrolled into view or individually dismissed). Current behavior (clear on open) may give parents false confidence that all messages were reviewed.

#### 49 · Theme Sheet

**[m]** The device theme sheet (`dt-*`) uses `grid-template-columns: repeat(auto-fill, minmax(100px, 1fr))` for theme buttons — fills available width with 100px minimum columns. On a 375px phone, this gives 3 columns of ~125px. On a 320px phone, this gives 3 columns of ~107px. The theme buttons have labels and a small preview color — sufficient at 100px+ but may clip at 107px. Verify on 320px.

**[P]** `dt-color-btn--active { border-color: var(--text); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--text) }` — double-ring active indicator on color buttons. This is a polished selection pattern that matches native iOS color picker conventions.

#### 50 · More Sheet

**[P]** The More sheet (overflow navigation) opens from the More nav item and shows Kitchen + any additional navigation items. The sheet content isn't fully described in the CSS/JS available — verify the More sheet follows the same `bottom-sheet` structure and doesn't use any custom full-height layout.

#### 51 · Empty & Loading States

**[m]** Empty states use the `.empty-state` component consistently: icon + title + subtitle. Good. However, empty state copy is generic in several places: "No rewards available for you yet," "No history yet," "No tasks yet." Premium apps write empty state copy that teaches the user what to do next. Each empty state should have a clear next-action hint or CTA.

**[m]** Loading states use `.loading-spinner` (36×36px spinning ring). The dashboard has a full skeleton loader — excellent. Other pages (scoreboard, rewards, tracker) use the generic inline spinner. The step down from skeleton (dashboard) to spinner (everything else) is noticeable. A skeleton treatment for scoreboard leaderboard cards and rewards card list would raise the perception of polish.

**[m]** Error states: admin tools tab has inline error messages ("Something went wrong," "File does not appear to be a Daily Rundown export"). These error messages appear inline as styled text. There's no consistent error state component — some errors are red text, some are toasts, some are inline messages. Consolidate to a shared error state pattern.

#### 52 · Nav Bar

**[m]** (See Navigation Model section) Dual class names, 5-slot grid with 4 items, active state issues.

**[P]** `bottom-nav__item svg { stroke-width: 1.75 }` inactive, `2` active. The 0.25px stroke width change is subtle but visible — a good micro-detail for indicating active state without relying solely on color.

#### 53 · PWA Manifest

**[M]** Single icon: `512×512`, `purpose: "any"`. No `192×192` maskable variant. On Android, adaptive icons (maskable) are required to look correct inside the circular/squircle icon shape. Without a maskable icon, the app icon appears in a white circle on the home screen.

**[M]** `background_color: "#1a1a2e"` — hardcoded dark navy, used for the PWA splash screen. On light-warm theme users (most common default), the dark navy splash before the app loads is jarring.

**[M]** `theme_color: "#6c63ff"` — hardcoded purple matching no theme preset. The Android status bar and browser chrome will show this purple regardless of which theme the user has selected. On dark themes where `--accent: #64b7a8` (teal), the purple status bar looks wrong.

**[m]** `name: "Family Hub"` and `short_name: "Family Hub"` — the app's name in the database is user-configurable (`settings.appName`) but the manifest is static. A family named "The Smiths" with `appName: "Smith Family App"` will see "Family Hub" on their home screen. The manifest could be dynamically served (e.g., via a Cloudflare Worker) to reflect the family's app name.

#### 54 · Service Worker

**[m]** Cache version is `v130` (manually bumped with each deploy). SW cache list requires manual maintenance — any new file must be added or the SW will serve a stale version. This is documented in CLAUDE.md but remains an operational risk. A missed cache update after adding a CSS file would serve the old CSS to all installed PWA users.

**[P]** `CACHE_NAME: 'rundown-v130'` — cache names are generic. A descriptive name (e.g., `rundown-v130-phase1-events`) would improve debugging when a user reports a stale-cache issue.

---

## Summary: Priority Findings by Surface

| Priority | Finding | Surface | Severity |
|----------|---------|---------|----------|
| 1 | Complete button has sharp corners (`--radius` undefined, no fallback) | Task detail sheet | **[C]** |
| 2 | Toast overlaps nav bar (`bottom: 24px` should be `calc(nav-height + spacing)`) | Global toast | **[C]** |
| 3 | Celebration title invisible in dark mode (`color: var(--bg)`) | Dashboard/Kid celebration | **[C]** |
| 4 | Month view event text at 7–8px — unreadable on any phone | Calendar month | **[C]** |
| 5 | Kid mode balance/message colors ignore dark theme — hardcoded #38a169/#e53e3e | Kid mode | **[M]** |
| 6 | Grade colors not overridden for dark mode — navy grade-B near-invisible | Scoreboard, grades table | **[M]** |
| 7 | Gradient text in legacy `.header__title` (DESIGN.md violation) | All legacy-header pages | **[M]** |
| 8 | No brand typeface — system font stack | Global | **[M]** |
| 9 | PWA manifest: hardcoded dark `background_color` clashes with light themes | PWA | **[M]** |
| 10 | PWA manifest: hardcoded `theme_color: #6c63ff` matches no theme preset | PWA | **[M]** |
| 11 | Admin debug panel uses hardcoded `#1a1a2e`/`#e0e0e0`/`#ffd93d` colors | Admin tools | **[M]** |
| 12 | Card press feedback `scale(0.997)` is imperceptible — feels unresponsive | Dashboard, tracker | **[M]** |
| 13 | `<details>` element in kid bank uses OS-native triangle — looks dated | Kid mode bank | **[m]** |
| 14 | Empty state copy is generic across all pages — no next-action guidance | Global | **[m]** |
| 15 | Confirm modal actions are right-aligned — looks web, not native | Global confirm | **[m]** |
| 16 | Define `--radius: var(--radius-md)` in base.css | Design system | Quick fix |
| 17 | Define `--font-base: var(--font-md)` in base.css | Design system | Quick fix |
| 18 | Replace `var(--accent-success/danger, #…)` in kid.css with `var(--success/danger)` | Kid mode | Quick fix |
| 19 | Add grade color overrides to `[data-theme="dark"]` block in base.css | Design system | Quick fix |
| 20 | Fix toast position: `bottom: calc(var(--nav-height) + var(--spacing-md) + env(safe-area-inset-bottom, 0px))` | Global toast | Quick fix |
