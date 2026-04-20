# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the app's token layer with DESIGN.md §3, sweep stable-surface inline styles, purge raw hex in `components.css`, add `prefers-reduced-motion` guards everywhere, and update DESIGN/plan docs — without redesigning any page.

**Architecture:** Pure plumbing change. Seven logical commits (see spec §7), ordered so `git bisect` narrows to one boundary cleanly. Verification via grep recipes + manual smoke + visual-baseline comparison. No new framework, no build step, no tests — this project is vanilla JS served by Cloudflare Pages.

**Tech Stack:** Vanilla ES modules, Firebase compat CDN, hand-written CSS, service-worker caching. No npm. No tests — verification is grep + manual smoke.

**Spec:** [docs/superpowers/specs/2026-04-19-phase-0-foundation-design.md](../specs/2026-04-19-phase-0-foundation-design.md)
**Plan context:** [docs/superpowers/plans/2026-04-19-ui-rework.md](2026-04-19-ui-rework.md)
**Design source of truth:** [docs/DESIGN.md](../../DESIGN.md)

---

## Verification model

This project has no test suite. "Verification" in each task means one of:

- **Grep recipe** — an exact shell command with expected output (usually "0 matches").
- **Manual smoke** — a short browser-level check (e.g. "load dashboard, tap a task, confirm completion toggles").
- **Visual baseline diff** — compare `docs/superpowers/baselines/phase-0/*.png` before vs. after.

Each task ends with a commit. Commit messages follow the spec's §7 recipe.

---

## Task 1: Capture pre-Phase-0 visual baselines

**Files:**
- Create: `docs/superpowers/baselines/phase-0/` directory
- Create: 32 PNG files in that directory

- [ ] **Step 1: Create the baseline directory**

```bash
mkdir -p docs/superpowers/baselines/phase-0
```

- [ ] **Step 2: Capture baselines via Chrome DevTools MCP**

For each of these 8 pages: `index.html`, `calendar.html`, `scoreboard.html`, `tracker.html`, `admin.html`, `kid.html?kid=<first-kid-name>`, `setup.html`, `person.html?person=<first-person-name>`.

For each page, capture at 4 variants:
- 375px width, light mode
- 375px width, dark mode
- 768px width, light mode
- 768px width, dark mode

Filename convention: `<page-basename>-<width>-<mode>.png`
Example: `dashboard-375-light.png`, `calendar-768-dark.png`.

Use `chrome-devtools-mcp:resize_page` to set the width and `chrome-devtools-mcp:emulate` (or theme toggle in admin) for dark mode. Use `chrome-devtools-mcp:take_screenshot` to capture.

Total: 32 PNGs.

- [ ] **Step 3: Lighthouse accessibility baseline**

Run `chrome-devtools-mcp:lighthouse_audit` on `index.html`. Record the accessibility score in `docs/superpowers/baselines/phase-0/lighthouse.txt`:

```
Pre-Phase-0 Lighthouse accessibility: <score>
Date: 2026-04-19
```

- [ ] **Step 4: Commit baselines**

```bash
git add docs/superpowers/baselines/phase-0/
git commit -m "chore(baselines): capture pre-Phase-0 visual baselines

Screenshots for 8 pages × {375px, 768px} × {light, dark} plus
Lighthouse accessibility baseline. Reference for Phase 0 diff
verification and baseline for Phase 1."
```

---

## Task 2: Add new tokens + dark-mode block to base.css

**Files:**
- Modify: `styles/base.css`

This task is **purely additive**. Old tokens stay in place; new tokens added alongside. The app continues to work against the old names.

- [ ] **Step 1: Add new tokens into the existing `:root` block**

Inside `:root` in `styles/base.css` (after the existing tokens, before the closing brace), add:

```css
/* ============ Spec-aligned tokens (DESIGN.md §3) ============ */

/* Surfaces */
--bg: #f7f6f2;
--surface-2: #f2f1ec;
--text: #171717;
--text-faint: #9a9a9a;

/* Border (aliased to existing --border) */
/* --border already exists, no new addition needed */

/* Accent-ink and accent-soft emitted per-preset by theme.js; default to fallback */
--accent-ink: #0f3d36;
--accent-soft: #e4f1ee;

/* Semantic — soft + solid pairs */
--success: #166534;
--success-soft: #dcfce7;
--warning: #9a6b0c;
--warning-soft: #faecd0;
--danger: #b4491c;
--danger-soft: #fae5d6;
--info: #1d4f7a;
--info-soft: #dfecf7;

/* Owner palette (static defaults; per-person color still comes via --owner-color) */
--owner-a: #3e6b9f;
--owner-b: #b8577d;
--owner-c: #7d6bb8;
--owner-d: #5a9466;

/* Spacing */
--spacing-2xl: 48px;

/* Type */
--font-xs: 0.75rem;
--font-sm: 0.875rem;
--font-md: 1rem;
--font-lg: 1.125rem;
--font-xl: 1.375rem;
--font-2xl: 1.75rem;
--font-3xl: 2.25rem;

/* Motion */
--t-fast: 120ms ease-out;
--t-base: 200ms ease-out;
--t-slow: 320ms ease-out;

/* Z-index */
--z-header: 10;
--z-fab: 15;
--z-nav: 20;
--z-sheet-backdrop: 30;
--z-sheet: 31;
--z-modal-backdrop: 40;
--z-modal: 41;
--z-toast: 50;
--z-celebration: 60;

/* Structural — updated values per DESIGN.md and mockup */
/* NOTE: --nav-height and --header-height will get their new values
   in Task 6 (the retirement commit). For now, old values stay. */
--max-content: 600px;
```

- [ ] **Step 2: Add dark-mode root block**

After the closing brace of `:root`, add a new `@media` block:

```css
/* ============ Dark mode defaults (theme-independent surfaces) ============ */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141413;
    --surface: #1d1d1b;
    --surface-2: #262523;
    --text: #ececeb;
    --text-muted-dark: #a6a6a3;  /* bridge; renamed in Task 6 */
    --text-faint: #6e6d6a;
    --border: #2f2e2b;
    --accent: #64b7a8;
    --accent-ink: #c7ebe3;
    --accent-soft: #1f3734;
    --danger: #e28a5c;
    --danger-soft: #3a2418;
    --success: #7fc49a;
    --success-soft: #1f3527;
    --warning: #d4aa60;
    --warning-soft: #3a2e18;
    --info: #86b8e0;
    --info-soft: #1a2a3a;
  }
}
```

> **Note:** `--text-muted-dark` is a temporary bridge because the dark-mode `--text-muted` value differs from the light-mode value and the light-mode name is being renamed in Task 6. The bridge is removed in Task 6.

- [ ] **Step 3: Smoke test — load the app, confirm no visual regression**

Open `http://localhost:<port>/index.html` (or the deployed URL). Confirm the app loads identically to the pre-baseline screenshot `dashboard-375-light.png`. There should be **zero** visual change yet.

- [ ] **Step 4: Commit**

```bash
git add styles/base.css
git commit -m "chore(styles): add new tokens and dark-mode block to base.css

Purely additive. Adds DESIGN.md §3-aligned tokens (--bg, --surface-2,
--text, --text-faint, --accent-ink, --accent-soft, --success/--danger/
--warning/--info plus -soft variants, --owner-a..d, --spacing-2xl,
--font-xs..3xl, --t-fast/base/slow, --z-* band, --max-content) and
a @media (prefers-color-scheme: dark) root block. Old tokens remain
in place; downstream files unchanged."
```

---

## Task 3: Update theme.js to emit new token names per preset

**Files:**
- Modify: `shared/theme.js`

- [ ] **Step 1: Read theme.js to understand current structure**

```bash
# Sanity check before editing
grep -n '\-\-' shared/theme.js | head -40
```

Expected: list of CSS custom-property assignments per preset.

- [ ] **Step 2: For each preset, add emissions for new spec tokens**

For every preset function (or data object) in `theme.js`, extend the emitted CSS variables to include the spec-aligned names **in addition to** the current ones. Do not remove existing emissions yet.

Template for a preset (example: Sage):

```js
// existing emissions stay:
root.style.setProperty('--accent', sageAccent);
root.style.setProperty('--accent-light', sageAccentLight);
root.style.setProperty('--accent-hover', sageAccentHover);

// ADD new spec-aligned emissions:
root.style.setProperty('--accent-ink', darken(sageAccent, 40));
root.style.setProperty('--accent-soft', lighten(sageAccent, 90));
```

Apply the same pattern to Ocean, Rose, Amber, Iris.

For each preset, `--accent-ink` should be the accent color darkened ~40% for contrast on `--accent-soft` backgrounds. `--accent-soft` should be the accent color lightened ~90% for backgrounds. If `theme.js` does not already have lighten/darken helpers, use `color-mix(in srgb, <accent> 85%, #000)` and `color-mix(in srgb, <accent> 12%, #fff)` inline.

- [ ] **Step 3: For each preset, also emit dark-mode `--accent` override**

The `@media (prefers-color-scheme: dark)` block in `base.css` set generic dark defaults. Theme.js is responsible for per-preset accent overrides in dark mode. For each preset, add a conditional emit:

```js
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  || document.documentElement.getAttribute('data-mode') === 'dark';

if (isDark) {
  // slightly brighter accent in dark mode
  root.style.setProperty('--accent', lighten(sageAccent, 25));
  root.style.setProperty('--accent-ink', lighten(sageAccent, 60));
  root.style.setProperty('--accent-soft', darken(sageAccent, 70));
}
```

- [ ] **Step 4: Smoke test — toggle through themes**

Load the app. Open Admin → Appearance → Theme. Switch between each of the 5 presets. Confirm no console errors. Confirm the accent color changes visibly. Confirm dark mode (OS setting or Admin toggle) renders a dark background on every preset.

- [ ] **Step 5: Commit**

```bash
git add shared/theme.js
git commit -m "refactor(theme): emit new token names from theme.js

Each preset now emits --accent-ink and --accent-soft alongside the
existing --accent / --accent-light / --accent-hover. Dark-mode
override paths added per preset. Old emissions retained; sweep
and cleanup happen in later commits."
```

---

## Task 4: Token rename sweep in components.css + shared/ + z-index tokenization

**Files:**
- Modify: `styles/components.css`
- Modify: `shared/components.js` (CSS-var strings only — inline styles swept in Task 8)
- Modify: `shared/calendar-views.js` (CSS-var strings only)

The complete rename table is in **spec §3.1**. Apply it mechanically across these files.

- [ ] **Step 1: Apply the rename map to components.css**

Open `styles/components.css`. Run find-and-replace for each entry in spec §3.1:

| Find | Replace |
|---|---|
| `var(--bg-card)` | `var(--surface)` |
| `var(--bg-primary)` | `var(--bg)` |
| `var(--bg-secondary)` | `var(--surface-2)` |
| `var(--bg-nav)` | `var(--surface)` |
| `var(--border-color)` | `var(--border)` |
| `var(--border-light)` | `var(--border)` |
| `var(--border-subtle)` | `var(--border)` |
| `var(--text-primary)` | `var(--text)` |
| `var(--text-secondary)` | `var(--text-muted)` |
| `var(--text-muted)` | `var(--text-faint)` **(do LAST — see note)** |
| `var(--accent-light)` | `var(--accent-soft)` |
| `var(--success-bg)` | `var(--success-soft)` |
| `var(--success-text)` | `var(--success)` |
| `var(--warning-bg)` | `var(--warning-soft)` |
| `var(--warning-text)` | `var(--warning)` |
| `var(--danger-bg)` | `var(--danger-soft)` |
| `var(--danger-text)` | `var(--danger)` |
| `var(--info-bg)` | `var(--info-soft)` |
| `var(--info-text)` | `var(--info)` |
| `var(--max-width)` | `var(--max-content)` |
| `var(--font-size-xs)` | `var(--font-xs)` |
| `var(--font-size-sm)` | `var(--font-sm)` |
| `var(--font-size-md)` | `var(--font-md)` |
| `var(--font-size-lg)` | `var(--font-lg)` |
| `var(--font-size-xl)` | `var(--font-xl)` |
| `var(--font-size-2xl)` | `var(--font-2xl)` |
| `var(--font-size-base)` | `var(--font-md)` |
| `var(--transition-fast)` | `var(--t-fast)` |
| `var(--transition-normal)` | `var(--t-base)` |

> **IMPORTANT:** Do `--text-secondary` → `--text-muted` **before** `--text-muted` → `--text-faint`. Otherwise the shift applies twice and turns `--text-secondary` references into `--text-faint`. If your editor does them simultaneously, pause between: do the `--text-secondary` → `--text-muted` pass and save; *then* do `--text-muted` → `--text-faint` on the newly-landed state. This is the one non-mechanical rename.

- [ ] **Step 2: Tokenize z-index in components.css**

In the same file, find every `z-index: <number>` declaration and replace with the matching token per DESIGN §3.7. Mapping:

| Value | Token |
|---|---|
| 10 (sticky headers) | `var(--z-header)` |
| 15 (FABs) | `var(--z-fab)` |
| 20 (bottom nav) | `var(--z-nav)` |
| 30 (sheet backdrop) | `var(--z-sheet-backdrop)` |
| 31 (sheet) | `var(--z-sheet)` |
| 40 (modal backdrop) | `var(--z-modal-backdrop)` |
| 41 (modal) | `var(--z-modal)` |
| 50 (toast) | `var(--z-toast)` |
| 60 (celebration overlay) | `var(--z-celebration)` |
| 0-9 (in-page content) | leave as raw number |

For any z-index value that doesn't map cleanly (e.g., `z-index: 100`), pick the closest band and add a `/* z-index audit: was 100 → mapped to toast */` comment so the author can review.

- [ ] **Step 3: Apply the same rename map to `shared/components.js`**

In `shared/components.js`, search for any `--<old-name>` strings (e.g. template literals emitting CSS variables). Apply the same mapping as Step 1. Skip the inline `style="--owner-color:..."` patterns — those are cleaned in Task 8.

Grep to find them first:
```bash
grep -Pn '\-\-(bg-card|bg-primary|bg-secondary|bg-nav|text-primary|text-secondary|border-color|border-light|border-subtle|accent-light|font-size-(xs|sm|base|md|lg|xl|2xl)|transition-(fast|normal)|max-width|(success|warning|danger|info)-(bg|text))\b' shared/components.js
```

Apply replacements for each match.

- [ ] **Step 4: Apply the same rename map to `shared/calendar-views.js`**

Repeat Step 3 for `shared/calendar-views.js`.

- [ ] **Step 5: Smoke test**

Load the app. Confirm dashboard, calendar, and kid mode still render. No console errors. Visual check against `docs/superpowers/baselines/phase-0/dashboard-375-light.png` — should be near-identical (body text +1px is the largest expected delta).

- [ ] **Step 6: Commit**

```bash
git add styles/components.css shared/components.js shared/calendar-views.js
git commit -m "refactor(styles): rename token usages + tokenize z-index in components.css + shared/

Sweep 1: component CSS and shared JS modules now reference
spec-aligned token names per DESIGN §3.1. Z-index values
replaced with --z-* tokens per DESIGN §3.7. Old tokens still
defined in base.css (removed in later commit). Inline style
strings in shared modules unchanged here — Task 8."
```

---

## Task 5: Token rename sweep in remaining CSS files + z-index tokenization

**Files:**
- Modify: `styles/dashboard.css`
- Modify: `styles/calendar.css`
- Modify: `styles/admin.css`
- Modify: `styles/kid.css`
- Modify: `styles/scoreboard.css`
- Modify: `styles/tracker.css`
- Modify: `styles/layout.css`
- Modify: `styles/responsive.css`

Same sweep as Task 4, applied to the eight remaining CSS files.

- [ ] **Step 1: For each file, apply the Task 4 rename map**

For each of the 8 files listed above, apply the rename table from Task 4 Step 1. Mind the `--text-secondary` → `--text-muted` → `--text-faint` ordering caveat.

- [ ] **Step 2: For each file, apply the Task 4 z-index tokenization**

Same z-index mapping as Task 4 Step 2.

- [ ] **Step 3: Run the verification grep across styles/**

```bash
grep -rPn '\-\-(bg-card|bg-primary|bg-secondary|bg-nav|text-primary|text-secondary|border-color|border-light|border-subtle|accent-light|font-size-(xs|sm|base|md|lg|xl|2xl)|transition-(fast|normal)|max-width|(success|warning|danger|info)-(bg|text))\b' styles/
```

Expected: **0 matches**. If any remain, they're ones you missed — fix and re-run.

- [ ] **Step 4: Run z-index verification**

```bash
grep -rPn 'z-index:\s*(?!var\()(?!0)(?!1\b)(?!2\b)(?!3\b)(?!4\b)(?!5\b)(?!6\b)(?!7\b)(?!8\b)(?!9\b)' styles/
```

Expected: 0 matches. Any hardcoded z-index above single digits should now be a token.

- [ ] **Step 5: Smoke test**

Load each of the 8 pages. Confirm no visual regressions beyond the expected body-text +1px and header/nav height bumps (which land in Task 6, not here — but being ready for them).

- [ ] **Step 6: Commit**

```bash
git add styles/dashboard.css styles/calendar.css styles/admin.css styles/kid.css styles/scoreboard.css styles/tracker.css styles/layout.css styles/responsive.css
git commit -m "refactor(styles): rename token usages + tokenize z-index in remaining CSS files

Sweep 2: dashboard, calendar, admin, kid, scoreboard, tracker,
layout, responsive CSS now reference spec-aligned token names
and --z-* tokens. Old tokens still defined in base.css — removed
in next commit."
```

---

## Task 6: Remove retired tokens + adopt new structural values in base.css and theme.js

**Files:**
- Modify: `styles/base.css`
- Modify: `shared/theme.js`

This is the **breaking commit** — old token names go away. Do it after every downstream reference is renamed.

- [ ] **Step 1: Remove retired token declarations from base.css `:root` block**

In `styles/base.css`, delete these lines:

```css
--bg-primary: #faf8f5;
--bg-secondary: #f0ece6;
--bg-card: #ffffff;
--bg-nav: #ffffff;
--text-primary: #2c2c2c;
--text-secondary: #6b6b6b;
/* --text-muted stays — it was RENAMED in Task 4 sweep to point at the new --text-faint semantic;
   the old --text-muted value (#999) is now --text-faint's value.
   Re-point --text-muted to the spec's new "secondary" value: */
/* EDIT: change --text-muted's value from #999999 to #6b6b6b (old --text-secondary value) */

--border-color: #e8e4de;
--border-light: #f0ece6;
--border-subtle: #f3f0eb;
--accent-light: #5b7fd620;
--success-bg: #e8f5e9;
--success-text: #2e7d32;
--warning-bg: #fff3e0;
--warning-text: #e65100;
--danger-bg: #ffebee;
--danger-text: #c62828;
--info-bg: #e3f2fd;
--info-text: #1565c0;
--font-size-xs: 0.75rem;
--font-size-sm: 0.8125rem;
--font-size-base: 0.9375rem;
--font-size-lg: 1.125rem;
--font-size-xl: 1.5rem;
--font-size-md: 1rem;
--font-size-2xl: 2rem;
--transition-fast: 150ms ease;
--transition-normal: 250ms ease;
```

Also change:
- `--max-width: 600px;` → delete (replaced by `--max-content` added in Task 2)
- `--text-muted: #999999;` → change value to `#6b6b6b` (value of old `--text-secondary`) — this keeps the name but shifts the value per the spec §3.4 semantic shift.

Note: the spec-aligned `--text-faint: #9a9a9a` (added in Task 2) fills the "faintest tier" role.

- [ ] **Step 2: Adopt new structural values in base.css**

In `styles/base.css`, change these values (the names stay):

```css
--nav-height: 60px;      /* → change to 68px */
--header-height: 56px;   /* → change to 64px */
```

Also update the body font-size declaration if it references the removed token:

```css
body {
  /* old: font-size: var(--font-size-base); */
  font-size: var(--font-md);
  /* ... rest unchanged */
}
```

And update any input/select/textarea font-size:

```css
input, select, textarea {
  /* old: font-size: var(--font-size-base); */
  font-size: var(--font-md);
  /* ... rest unchanged */
}
```

- [ ] **Step 3: Remove the dark-mode bridge token**

In the `@media (prefers-color-scheme: dark)` block added in Task 2, remove the bridge:

```css
--text-muted-dark: #a6a6a3;   /* delete this line */
--text-muted: #a6a6a3;        /* add this: the dark value under the spec name */
```

- [ ] **Step 4: Remove old emissions from theme.js**

In `shared/theme.js`, for each preset, delete the old-name emissions:

```js
// DELETE lines emitting these:
// --accent-light
// (keep --accent-hover; it's a utility for button states, not a design-system token)

// Also DELETE any emissions of the retired tokens if theme.js was setting them:
// --bg-primary, --bg-secondary, --bg-card, --bg-nav
// --text-primary, --text-secondary
// --border-color, --border-light, --border-subtle
// --success-bg/-text, --warning-bg/-text, --danger-bg/-text, --info-bg/-text
// --font-size-*, --transition-*, --max-width
```

- [ ] **Step 5: Run the "retired token is gone" grep**

```bash
grep -rPn '\-\-(bg-card|bg-primary|bg-secondary|bg-nav|text-primary|text-secondary|border-color|border-light|border-subtle|accent-light|font-size-(xs|sm|base|md|lg|xl|2xl)|transition-(fast|normal)|max-width|(success|warning|danger|info)-(bg|text))\b' styles/ shared/
```

Expected: **0 matches anywhere.**

- [ ] **Step 6: Smoke test — this is the commit where visible deltas land**

Load each of the 8 pages. Expected visible changes:
- Body text ~1px larger (15→16px).
- Page titles slightly smaller (24→22px).
- Header and bottom nav each +8px taller.
- Sheet animations ~20% faster.

Confirm no layout breakage. Confirm dark mode still renders correctly across all 5 presets.

- [ ] **Step 7: Commit**

```bash
git add styles/base.css shared/theme.js
git commit -m "refactor(styles): remove retired tokens from base.css and theme.js

Deletes old-name token declarations. Adopts spec-aligned structural
values (--nav-height 60→68, --header-height 56→64, body font-size
15→16px, page title 24→22px). --text-muted semantic shifted from
tertiary (#999) to secondary (#6b6b6b); --text-faint fills the
tertiary slot. Dark-mode bridge token removed.

Grep for retired tokens across styles/ and shared/ returns 0."
```

---

## Task 7: Hex purge in components.css

**Files:**
- Modify: `styles/components.css`

Replace every raw hex literal with a token reference. Spec §3.4 forbids raw hex in component CSS.

- [ ] **Step 1: Find all hex literals in components.css**

```bash
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css
```

Expected: 22 matches (approximate).

- [ ] **Step 2: For each match, replace with the closest token**

Map by semantic intent:

| Hex pattern | Likely token |
|---|---|
| `#fff`, `#ffffff` (surface) | `var(--surface)` |
| `#000`, `#000000` (rare — usually a shadow component) | `color-mix(in srgb, var(--text) 90%, #000)` or token-based shadow |
| Warm neutrals (e.g. `#e8e4de`, `#f0ece6`) | `var(--border)` or `var(--surface-2)` |
| Accent-like hex | `var(--accent)` |
| Red/destructive hex | `var(--danger)` or `var(--danger-soft)` |
| Gray text hex | `var(--text-muted)` or `var(--text-faint)` |

For any hex that doesn't fit a token, pause and ask: is this an icon-tile color that needs a `--icon-*` token? Per the spec, icon-tile tokens are deferred to Phase 3. If this hex is blocking something, add a TODO comment `/* TODO(phase-3): tokenize as --icon-<role> */` and replace with the closest existing token. Note this in the spec's deferred tech-debt register.

- [ ] **Step 3: Verify with grep**

```bash
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css
```

Expected: 0 matches. Any exceptions (e.g. hex inside a `color-mix()` utility) must be documented inline with a comment.

- [ ] **Step 4: Smoke test**

Load each of the 8 pages. Spot-check that card borders, background tints, and danger-state colors render identically to the baseline.

- [ ] **Step 5: Commit**

```bash
git add styles/components.css
git commit -m "refactor(styles): purge raw hex in components.css

All 22 raw hex literals replaced with token references. Grep for
'#[0-9a-fA-F]{3,6}' in components.css returns 0. Other CSS files
(dashboard, calendar, admin, kid, scoreboard, tracker) remain
pending their respective rework phases per spec §2.4 deferred register."
```

---

## Task 8: Inline-style sweep in stable surfaces

**Files:**
- Modify: `shared/components.js` (59 occurrences → class-based)
- Modify: `shared/calendar-views.js` (7 occurrences)
- Modify: `dashboard.js` (5 occurrences)
- Modify: `setup.html` (6 occurrences)
- Modify: `person.html` (1 occurrence)
- Modify: `styles/components.css` (new helper classes + the applyDataColors helper in JS)

- [ ] **Step 1: Inventory the inline styles per file**

```bash
grep -Pn 'style="' shared/components.js shared/calendar-views.js dashboard.js setup.html person.html
```

Record the patterns. Group by type:
- **CSS-variable injection** (e.g. `style="--owner-color:${color}"`) — convert to `data-*` + post-render `setProperty`.
- **Static visual styling** (e.g. `style="margin-top:16px"`) — move to a new class in `styles/components.css`.
- **Dynamic positional styling** (e.g. `style="transform: translateY(100%)"`) — move to state-based classes (`.sheet--opening`, `.sheet--open`, `.sheet--closing`).

- [ ] **Step 2: Add helper function to shared/components.js**

At the top of `shared/components.js` (below imports), add:

```js
/**
 * After innerHTML is set on a container, propagate data-*-color attributes
 * onto their elements as CSS custom properties. Lets us avoid inline
 * style="..." strings for per-record runtime colors.
 */
export function applyDataColors(root) {
  if (!root) return;
  root.querySelectorAll('[data-owner-color]').forEach(el => {
    el.style.setProperty('--owner-color', el.dataset.ownerColor);
  });
  root.querySelectorAll('[data-person-color]').forEach(el => {
    el.style.setProperty('--person-color', el.dataset.personColor);
  });
  root.querySelectorAll('[data-event-color]').forEach(el => {
    el.style.setProperty('--event-color', el.dataset.eventColor);
  });
}
```

- [ ] **Step 3: Convert CSS-variable inline styles in shared/components.js**

For each occurrence like:
```js
style="--owner-color:${ownerColor}"
```

Replace with:
```js
data-owner-color="${ownerColor}"
```

Similarly for `--person-color` and `--event-color`. After every `innerHTML =` / `insertAdjacentHTML` call in the same function, add:
```js
applyDataColors(container);
```

If a function returns an HTML string that's inserted by the caller, export a convention: the caller is responsible for calling `applyDataColors` after inserting. Document this at the top of the affected function with a JSDoc `@caller` note.

- [ ] **Step 4: Convert static styling to classes**

For any occurrence like `style="margin-top: 16px"` in `shared/components.js`:
1. Identify the element (what component is it part of?).
2. Add a class to `styles/components.css` scoped to that component (e.g. `.sheet__content--padded { margin-top: var(--spacing-md); }`).
3. Replace the inline style with the class.

For generic spacing needs that don't fit a component, add a small utility class set to `styles/components.css`:
```css
/* Utility spacing (narrow use — prefer component-scoped classes) */
.u-mt-md { margin-top: var(--spacing-md); }
.u-mb-md { margin-bottom: var(--spacing-md); }
```
Keep these to a minimum — only when a dedicated component class is overkill.

- [ ] **Step 5: Convert sheet transform styles to state classes**

Find any `style="transform: translateY(..)"` or `style="opacity: 0"` on `.sheet` or `.sheet-backdrop` elements. Replace with state classes:

In `styles/components.css`:
```css
.sheet { transform: translateY(100%); transition: transform var(--t-base); }
.sheet.is-open { transform: translateY(0); }
.sheet.is-closing { transform: translateY(100%); }

@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity var(--t-fast); transform: none; opacity: 0; }
  .sheet.is-open { opacity: 1; }
  .sheet.is-closing { opacity: 0; }
}
```

Then in `shared/components.js`, toggle `.is-open` / `.is-closing` instead of setting `style.transform`.

- [ ] **Step 6: Apply the same conversion pattern to shared/calendar-views.js**

Same approach as Step 3 + Step 4.

- [ ] **Step 7: Apply to dashboard.js**

5 occurrences. Usually tiny positional styling — use the utility classes or component classes added in Step 4.

- [ ] **Step 8: Apply to setup.html**

6 occurrences. These are static HTML inline styles — move each to a setup-specific class in `styles/admin.css` (setup shares admin CSS) prefixed with `.setup-` (e.g. `.setup-step__body { padding-top: var(--spacing-lg); }`).

- [ ] **Step 9: Apply to person.html**

1 occurrence. Likely a simple positional style — follow Step 8 pattern.

- [ ] **Step 10: Verify with grep**

```bash
grep -Pn 'style="' setup.html person.html shared/components.js shared/calendar-views.js dashboard.js
```

Expected: **0 matches.**

- [ ] **Step 11: Smoke test**

Load every page. Interact with:
- Task card (owner color stripe renders)
- Calendar day cell (person dot renders with correct color)
- Event in calendar (event color tint renders)
- Sheet open/close animation (transform-based; reduced-motion honored)
- Setup wizard (advance through all 6 steps; layout intact)
- Person PWA view (loads without regression)

- [ ] **Step 12: Commit**

```bash
git add shared/components.js shared/calendar-views.js dashboard.js setup.html person.html styles/components.css
git commit -m "refactor(components): move inline styles to classes in stable modules

Introduces applyDataColors helper for CSS-variable propagation from
data-*-color attributes. Sheet transforms moved to .is-open /
.is-closing state classes. Static styling replaced with
component-scoped classes (+ narrow utility classes where
appropriate). Grep for 'style=' in these files returns 0.

Stable surfaces only (setup.html, person.html, shared JS modules,
dashboard.js). Page HTML files with pending redesign phases
(index, calendar, admin, kid, scoreboard, tracker) keep their
inline styles until their respective rework phase."
```

---

## Task 9: Add `prefers-reduced-motion` guards to 5 stylesheets

**Files:**
- Modify: `styles/layout.css`
- Modify: `styles/responsive.css`
- Modify: `styles/admin.css`
- Modify: `styles/kid.css`
- Modify: `styles/tracker.css`

- [ ] **Step 1: Inspect each file for animations/transitions**

```bash
grep -Pn 'animation|transition|@keyframes' styles/layout.css styles/responsive.css styles/admin.css styles/kid.css styles/tracker.css
```

Note which elements animate. Common: nav bar transitions, admin form slides, kid celebration elements, tracker row reveals.

- [ ] **Step 2: Append the guard block to each file**

At the bottom of each of the 5 CSS files, append:

```css
/* ============ Reduced motion ============ */
@media (prefers-reduced-motion: reduce) {
  /* Replace slides/scales with 120ms opacity fades per DESIGN §3.6, §9 */
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: var(--t-fast) !important;
    transition-property: opacity !important;
    scroll-behavior: auto !important;
  }
}
```

Adjust the selector scope: for files covering many components (layout, responsive), the wildcard `*` is appropriate. For files with named components (kid, admin, tracker), scope to the file's namespace (e.g. `.kid *` for kid.css) so the guard doesn't bleed into unrelated CSS by accident.

- [ ] **Step 3: Verify with grep**

```bash
for f in styles/layout.css styles/responsive.css styles/components.css styles/dashboard.css styles/calendar.css styles/scoreboard.css styles/tracker.css styles/admin.css styles/kid.css; do
  grep -q 'prefers-reduced-motion' "$f" || echo "MISSING: $f"
done
```

Expected: no MISSING output.

- [ ] **Step 4: Smoke test**

Open DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → reduce. Confirm:
- Sheet slide becomes a fade.
- Kid celebration collapses (or doesn't fire).
- No transforms on navigation.

- [ ] **Step 5: Commit**

```bash
git add styles/layout.css styles/responsive.css styles/admin.css styles/kid.css styles/tracker.css
git commit -m "chore(styles): add reduced-motion guards to layout/responsive/admin/kid/tracker

Completes prefers-reduced-motion coverage across all animating
stylesheets per DESIGN §3.6, §9. Guard collapses animations to
120ms opacity fades."
```

---

## Task 10: Manual `--text-muted` semantic review pass

**Files:**
- Review (read-only): all files changed in Tasks 4 and 5

This task is a manual review pass. No code changes are required unless the review reveals misreads.

- [ ] **Step 1: List every file referencing --text-muted**

```bash
grep -rln '\-\-text-muted' styles/ shared/
```

- [ ] **Step 2: For each match, evaluate intent**

Open each file. For every `var(--text-muted)` call site, read the surrounding CSS rule. Ask:

1. **What element is this coloring?** (dot, chevron, subtitle, meta line, etc.)
2. **Is this the "faintest tier" in this visual hierarchy?** If yes → change to `var(--text-faint)`. If it's a middle-tier subtitle → leave as `var(--text-muted)`.

Typical corrections:
- Card meta dot separator → `--text-faint`
- Chevron icon → `--text-faint`
- Meta row dotted divider → `--text-faint`
- Card subtitle → leave `--text-muted`
- Form help text → leave `--text-muted`
- Empty state body text → leave `--text-muted`

- [ ] **Step 3: Visual-diff against baseline**

Reload dashboard and calendar. Compare to baseline PNGs. If any previously "faint" element looks bolder than before, that's a miscategorization from Task 4 — change that element's CSS rule to `--text-faint`.

- [ ] **Step 4: If any corrections made, commit**

```bash
git add styles/
git commit -m "refactor(styles): reconcile --text-muted vs --text-faint semantic tiers

Manual review pass per spec §3.4. Elements in the faintest visual
tier (meta dots, chevrons, dividers) now use --text-faint;
subtitles and secondary meta stay on --text-muted."
```

If no corrections were needed, skip the commit.

---

## Task 11: Bump SW cache and add CACHE_BUMPS block

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Find CACHE_NAME in sw.js**

```bash
grep -n 'CACHE_NAME' sw.js
```

Note current version (likely `v42` per recent changelog).

- [ ] **Step 2: Bump to v43**

In `sw.js`, change:
```js
const CACHE_NAME = 'daily-rundown-v42';
```
to:
```js
const CACHE_NAME = 'daily-rundown-v43';
```

- [ ] **Step 3: Add CACHE_BUMPS block**

At the top of `sw.js` (below any existing header comments), add:

```js
/*
 * CACHE_BUMPS
 * -----------
 * Record every CACHE_NAME bump here so future readers can correlate cache
 * versions to phases/PRs.
 *
 * v43 (2026-04-19) — Phase 0 foundation: token layer rewrite, hex purge
 *                    in components.css, inline-style sweep in stable modules,
 *                    reduced-motion guards on all animating CSS.
 * v42 (2026-04-17) — Kid mode CSS fix for status-bar layering.
 * (older bumps not recorded retroactively)
 */
```

- [ ] **Step 4: Smoke test — SW updates**

Load the app in a fresh browser tab. Open DevTools → Application → Service Workers. Confirm the new SW activates and the cache name is `daily-rundown-v43`. Old caches should be purged (SW `activate` event typically handles this).

- [ ] **Step 5: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump CACHE_NAME to v43, add CACHE_BUMPS block

Phase 0 ships changed CSS and JS; cache bump ensures clients pull
the new shell. CACHE_BUMPS comment block records phase-to-version
mapping for future readers."
```

---

## Task 12: Add DESIGN.md §A Grep Recipes appendix

**Files:**
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Append §A to DESIGN.md**

At the bottom of `docs/DESIGN.md` (after §15 Change log), append:

```markdown
---

## Appendix A — Grep verification recipes

These commands verify the non-negotiable rules in §12. Run them as part of every PR's pre-merge checklist. They require no build tooling — standard grep only.

### A.1 No inline styles in Phase-0-scoped files

    grep -Pn 'style="' setup.html person.html shared/components.js \
      shared/calendar-views.js dashboard.js

Expected: 0 matches. (Other HTML files have deferred sweeps; see the
owning phase's spec.)

### A.2 No retired token names in styles/ or shared/

    grep -rPn '\-\-(bg-card|bg-primary|bg-secondary|bg-nav|text-primary|text-secondary|border-color|border-light|border-subtle|accent-light|font-size-(xs|sm|base|md|lg|xl|2xl)|transition-(fast|normal)|max-width|(success|warning|danger|info)-(bg|text))\b' styles/ shared/

Expected: 0 matches.

### A.3 No raw hex in components.css

    grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css

Expected: 0 matches.

### A.4 No window.confirm / window.alert / bare confirm/alert

    grep -rPn '\bwindow\.(confirm|alert)\s*\(' --include='*.js' --include='*.html' .
    grep -rPn '(^|[^a-zA-Z0-9_\.])(confirm|alert)\s*\(' --include='*.js' --include='*.html' . \
      | grep -v 'showConfirm' \
      | grep -v 'shared/components\.js'

Expected: 0 matches (showConfirm defined in `shared/components.js` is the only allowlisted use).

### A.5 prefers-reduced-motion present in every animating stylesheet

    for f in styles/layout.css styles/responsive.css styles/components.css \
             styles/dashboard.css styles/calendar.css styles/scoreboard.css \
             styles/tracker.css styles/admin.css styles/kid.css; do
      grep -q 'prefers-reduced-motion' "$f" || echo "MISSING: $f"
    done

Expected: no MISSING output.

### A.6 No hardcoded z-index outside the token band

    grep -rPn 'z-index:\s*(?!var\()(?!0)(?!1\b)(?!2\b)(?!3\b)(?!4\b)(?!5\b)(?!6\b)(?!7\b)(?!8\b)(?!9\b)' styles/

Expected: 0 matches (single-digit in-page layering allowed; everything else tokenized).

### A.7 CSS-variable runtime data uses element.style.setProperty

Runtime per-record colors (owner, person, event) propagate via `data-*-color` attributes + JS `setProperty`, not inline `style="--var:..."` strings. This rule is enforced by A.1; there is no standalone grep for it.
```

- [ ] **Step 2: Update DESIGN.md §12 (Do-not rules) to cross-reference §A**

In DESIGN.md §12, at the top of the do-not rules list, add:

```markdown
> Each rule below has a corresponding grep recipe in §A for mechanical verification.
```

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs: add DESIGN.md Appendix A — grep verification recipes

Seven shell-only recipes that mechanically verify DESIGN §12
non-negotiable rules. Phase 0 PR checklist references §A;
all future phase PRs inherit the recipes as pre-merge gates."
```

---

## Task 13: Update plan file with phase amendments

**Files:**
- Modify: `docs/superpowers/plans/2026-04-19-ui-rework.md`

- [ ] **Step 1: Soften Phase 0 inline-style exit criterion**

Find the line in Phase 0 exit criteria:
```markdown
- Grep for `style="` across `*.html` and `*.js` returns 0 non-trivial matches. (Test-harness inline styles are fine.)
```

Replace with:
```markdown
- Grep for `style="` returns 0 matches in files listed in the Phase 0 spec's §2.1 scope (`setup.html`, `person.html`, `shared/components.js`, `shared/calendar-views.js`, `dashboard.js`). HTML files slated for later-phase rework keep their inline styles until that phase; see the Phase 0 spec's §2.4 deferred tech-debt register for the full deferral map.
```

- [ ] **Step 2: Add inline-style + hex-purge exit criteria to phases 1–5**

For each of Phase 1, 2, 3, 4, 5, add these two lines to the phase's **Exit criteria** section:

```markdown
- Inline styles in the phase's primary HTML file cleared — this page's row in the Phase 0 spec §2.4 deferred register is satisfied.
- Raw hex in the phase's primary page CSS file replaced with tokens — this file's row in the Phase 0 spec §2.4 deferred register is satisfied.
```

Specifically:
- Phase 1 → applies to `index.html` + `styles/dashboard.css`
- Phase 2 → applies to `calendar.html` + `styles/calendar.css`
- Phase 3 → applies to `admin.html` + `styles/admin.css` (+ icon-tile tokens ship here per spec §2.3)
- Phase 4 → applies to `kid.html` + `styles/kid.css`
- Phase 5 → applies to `scoreboard.html`, `tracker.html` + `styles/scoreboard.css`, `styles/tracker.css`

For Phase 3, also append:
```markdown
- Icon-tile tokens (`--icon-blue/teal/amber/purple/rose/green/gray/red`) added to `styles/base.css` and emitted per-preset in `shared/theme.js`. List group (§5.15) component consumes them.
```

- [ ] **Step 3: Add plan-as-memory discipline note at the top of the plan**

Just below the "Purpose" section (after line ~14), add a new section:

```markdown
## Workflow discipline

**Plan-as-memory.** When any phase spec is written (or any phase's build reveals a scope change), update this plan file in the **same PR** so future-you reading the specs fresh in 6 months sees a coherent picture. The plan is the running look-ahead; specs are per-phase contracts; never let them drift apart.

**Cadence:** plan (done) → spec phase N → build phase N → update plan if scope deviated → spec phase N+1 (review phase N first) → build phase N+1 → …

**Pre-phase-N+1 review:** before writing spec N+1, run the review gate at the bottom of spec N (all exit criteria met, grep recipes pass, deferred register updated, baselines refreshed, this plan file current).
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-19-ui-rework.md
git commit -m "docs: amend UI-rework plan with Phase 0 deferrals and workflow discipline

Softens Phase 0 inline-style exit criterion to reflect hybrid-C
scope. Adds per-phase inline-style + hex-purge exit criteria to
phases 1-5. Adds plan-as-memory cadence note so specs and plan
stay in sync."
```

---

## Task 14: Capture post-Phase-0 baselines + run final verification

**Files:**
- Create: `docs/superpowers/baselines/phase-0/*-after.png` (32 PNGs)
- Modify: `docs/superpowers/baselines/phase-0/lighthouse.txt`

- [ ] **Step 1: Capture post-Phase-0 baselines**

Same 8 pages × {375, 768} × {light, dark} matrix as Task 1, but save with the `-after.png` suffix.

Example filenames: `dashboard-375-light-after.png`, `calendar-768-dark-after.png`.

- [ ] **Step 2: Visual diff each page**

For each of the 32 pairs (`<page>-<width>-<mode>.png` vs `<page>-<width>-<mode>-after.png`), spot-check:

- Body text is ~1px larger (expected per spec §3.2).
- Header and bottom nav are 8px taller each (expected).
- Page titles are slightly smaller (expected).
- Nothing else should differ visibly.

If any page has a visible regression beyond these three deltas, diagnose and fix before proceeding.

- [ ] **Step 3: Re-run Lighthouse on index.html**

```bash
# Via chrome-devtools-mcp:lighthouse_audit on index.html
```

Append to `docs/superpowers/baselines/phase-0/lighthouse.txt`:
```
Post-Phase-0 Lighthouse accessibility: <score>
Date: <completion date>
```

Expected: post-score ≥ pre-score. If lower, diagnose before merging.

- [ ] **Step 4: Run the complete grep recipe suite (DESIGN.md §A)**

Run A.1 through A.6 from Task 12. Every recipe must return expected (0 matches / no MISSING).

- [ ] **Step 5: Manual smoke test — full pass**

Go through the smoke test checklist in spec §6.2:
- [ ] Dashboard loads; task tap completes; long-press opens detail sheet.
- [ ] Calendar opens; day sheet opens; swipe navigates days.
- [ ] Kid mode renders; celebration fires on completion.
- [ ] Admin PIN entry works; admin tabs render; CRUD intact.
- [ ] Scoreboard leaderboard + grades render; period tabs switch.
- [ ] Setup wizard 6 steps advance.
- [ ] Service worker offline: app shell serves from cache.
- [ ] Reduced motion: animations collapse to fades.
- [ ] All 5 themes × light + dark render without contrast regressions.

- [ ] **Step 6: Commit baselines + Lighthouse note**

```bash
git add docs/superpowers/baselines/phase-0/
git commit -m "chore(baselines): capture post-Phase-0 visual baselines

32 -after.png screenshots and Lighthouse post-score. These files
are the baseline for Phase 1 verification."
```

---

## Task 15: Fill in deferred tech-debt register + open PR

**Files:**
- Modify: `docs/superpowers/specs/2026-04-19-phase-0-foundation-design.md`

- [ ] **Step 1: Count hex literals in each deferred CSS file**

```bash
for f in styles/dashboard.css styles/calendar.css styles/admin.css styles/kid.css styles/scoreboard.css styles/tracker.css; do
  count=$(grep -cP '#[0-9a-fA-F]{3,6}\b' "$f")
  echo "$f: $count"
done
```

Record each count.

- [ ] **Step 2: Fill in the "TBC" slots in the spec**

In `docs/superpowers/specs/2026-04-19-phase-0-foundation-design.md`, in the §2.4 deferred tech-debt register, replace every `TBC (fill during PR)` with the actual count from Step 1.

- [ ] **Step 3: Commit register update**

```bash
git add docs/superpowers/specs/2026-04-19-phase-0-foundation-design.md
git commit -m "docs: fill deferred tech-debt hex counts in Phase 0 spec §2.4

Register now shows exact hex-literal counts per deferred CSS file
so future phases can verify their sweep is complete."
```

- [ ] **Step 4: Open PR**

```bash
git push -u origin HEAD
gh pr create --title "Phase 0: Foundation (tokens, base, housekeeping)" --body "$(cat <<'EOF'
## Summary

Aligns the token layer with DESIGN.md §3, sweeps stable-surface inline styles, purges raw hex in `components.css`, completes `prefers-reduced-motion` coverage, and adds DESIGN.md §A grep recipes for future phases to inherit.

App looks ~95% the same. Visible deltas (all spec-aligned):
- Body text 15→16px
- Header 56→64px, bottom nav 60→68px
- Page titles 24→22px
- Sheet animations ~20% faster

**Spec:** `docs/superpowers/specs/2026-04-19-phase-0-foundation-design.md`
**Plan:** `docs/superpowers/plans/2026-04-19-phase-0-foundation.md`

## Test plan

- [ ] Grep recipes A.1–A.6 in DESIGN.md §A pass
- [ ] Visual diff against `docs/superpowers/baselines/phase-0/` within expected deltas
- [ ] Lighthouse accessibility score ≥ pre-Phase-0
- [ ] Smoke: dashboard, calendar, kid mode, admin, scoreboard, setup wizard, service-worker offline, reduced-motion
- [ ] All 5 themes × light + dark render clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Record the PR URL**

The PR URL is the handoff artifact. Share it for review.

---

## Spec coverage check (self-review)

Mapping Phase 0 spec requirements → tasks:

| Spec §  | Requirement | Task |
|---|---|---|
| §1 goal 1 | Token catalog in base.css | Task 2, 6 |
| §1 goal 2 | Rename retired tokens globally | Tasks 4, 5, 6 |
| §1 goal 3 | Purge raw hex from components.css | Task 7 |
| §1 goal 4 | Inline-style sweep stable surfaces | Task 8 |
| §1 goal 5 | prefers-reduced-motion guards | Task 9 |
| §1 goal 6 | theme.js emits new token names | Tasks 3, 6 |
| §1 goal 7 | DESIGN.md §A grep recipes | Task 12 |
| §1 goal 8 | SW cache bump + CACHE_BUMPS | Task 11 |
| §1 goal 9 | Plan updates | Task 13 |
| §1 goal 10 | Visual baselines | Tasks 1, 14 |
| §2.4 | Deferred tech-debt register | Task 15 |
| §3 | Token specifics (all subsections) | Tasks 2, 3, 4, 5, 6 |
| §3.4 | --text-muted semantic shift pass | Task 10 |
| §4 | Inline-style sweep class replacements | Task 8 |
| §5 | Accessibility & motion | Tasks 8 (reduced motion in sheet), 9 |
| §6.1 | Grep recipes | Tasks 4 step 4, 5 step 3/4, 7 step 3, 8 step 10, 9 step 3, 12, 14 step 4 |
| §6.2 | Manual smoke test | Task 14 step 5 |
| §6.3 | Visual baseline | Tasks 1, 14 |
| §7 | Seven-commit strategy | Maps to Tasks 1, 2, 3, 4, 5, 6, 7+8+9+11+12+13+14+15 (the "final commit(s)" are split across Tasks 7–15 for granularity — still within spec's §7 spirit since each is a coherent revert unit) |
| §8 | Rollback plan | Followed implicitly; each commit is atomic and revertible |
| §9 | Known risks & mitigations | Addressed via smoke tests after each visible-delta commit (Task 6, 14) |
| §10 | Review gate before Phase 1 | Task 15 + post-merge review per the plan-as-memory note |
| §11 | Plan updates | Task 13 |
| §12 | Open questions | None |

All goals have an owning task. Proceed.
