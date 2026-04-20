# Phase 0 — Foundation (Tokens, Base, Housekeeping)

**Date:** 2026-04-19
**Status:** Proposed
**Plan:** [docs/superpowers/plans/2026-04-19-ui-rework.md](../plans/2026-04-19-ui-rework.md)
**Design source of truth:** [docs/DESIGN.md](../../DESIGN.md) §3 (Tokens), §8 (Accessibility), §10 (Theming)
**Mockup reference:** [mockups/design-system.css](../../../mockups/design-system.css)

---

## 0. Summary

Phase 0 makes the app's token layer and base cleanup **spec-compliant** without redesigning any page. After this phase, the app looks ~95% the same as today, but every downstream phase operates on a clean foundation: spec-aligned tokens, no inline styles in shared modules, no raw hex in `components.css`, no `window.confirm`/`alert` anywhere, and grep-verifiable policies for future phases to inherit.

**What this phase does NOT do:** no page redesigns, no component restructuring, no markup rewrites on pages slated for later-phase rework (`index`, `calendar`, `admin`, `kid`, `scoreboard`, `tracker`).

---

## 1. Goals

1. Establish the token catalog defined in DESIGN.md §3 as the single source of truth in `styles/base.css`.
2. Rename retired tokens globally across `styles/` and `shared/` — no alias shims left behind.
3. Purge raw hex from `styles/components.css` (the one shared-component file).
4. Sweep inline styles from *stable* surfaces (`setup.html`, `person.html`, `shared/components.js`, `shared/calendar-views.js`, `dashboard.js`). Defer per-page sweeps to each page's rework phase.
5. Add `prefers-reduced-motion` guards to every animating stylesheet.
6. Update `shared/theme.js` so each preset emits the new token names for both light and dark modes.
7. Codify verification as grep recipes in DESIGN.md §A (new appendix) so future phases inherit mechanical checks.
8. Bump service-worker cache and record the bump in a `CACHE_BUMPS` comment block inside `sw.js`.
9. Update the plan (`2026-04-19-ui-rework.md`) to reflect deferred work as explicit Phase 1–5 exit criteria.
10. Capture visual baselines (`docs/superpowers/baselines/phase-0/`) so later phases can verify regressions against a known-good snapshot.

---

## 2. Scope

### 2.1 In scope — modified files

| File | Change |
|---|---|
| `styles/base.css` | Full token rewrite: add missing tokens, adopt mockup structural values (`--nav-height: 68`, `--header-height: 64`, `--max-content: 600`), add dark-mode root, remove retired names. |
| `styles/components.css` | Token rename sweep **+ hex purge** (all raw hex → token refs). Only CSS file getting hex purge in Phase 0. |
| `styles/dashboard.css` | Token rename sweep. Hex purge deferred to Phase 1. |
| `styles/calendar.css` | Token rename sweep. Hex purge deferred to Phase 2. |
| `styles/admin.css` | Token rename sweep + reduced-motion guard. Hex purge deferred to Phase 3. |
| `styles/kid.css` | Token rename sweep + reduced-motion guard. Hex purge deferred to Phase 4. |
| `styles/scoreboard.css` | Token rename sweep. Hex purge deferred to Phase 5. |
| `styles/tracker.css` | Token rename sweep + reduced-motion guard. Hex purge deferred to Phase 5. |
| `styles/layout.css` | Token rename sweep + reduced-motion guard. |
| `styles/responsive.css` | Token rename sweep + reduced-motion guard. |

**Additional sweep step applied to every CSS file above:** replace hardcoded `z-index: <number>` declarations with `z-index: var(--z-<role>)` per DESIGN §3.7. Grep recipe §6.1 #6 enforces.
| `shared/theme.js` | Emit new token names per preset. Generate `-soft`/`-ink`/`-faint`/`surface-2` derivatives. Dark parity verified per preset. |
| `shared/components.js` | Token rename in CSS-var strings. **Inline-style sweep** (all 59 occurrences → class-based). |
| `shared/calendar-views.js` | Inline-style sweep (all 7 occurrences). New helper classes for per-person color dots. |
| `dashboard.js` | Inline-style sweep (all 5 occurrences). |
| `setup.html` | Inline-style sweep (6). |
| `person.html` | Inline-style sweep (1). |
| `sw.js` | Bump `CACHE_NAME` → `v43`. Add inline `CACHE_BUMPS` comment block. |
| `docs/DESIGN.md` | Add **§A — Grep Recipes** appendix (verification commands). |
| `docs/superpowers/plans/2026-04-19-ui-rework.md` | Soften Phase 0 inline-style exit criterion. Add inline-style and hex-purge sweep criteria to phases 1–5. Add "plan-as-memory" discipline note. |

### 2.2 In scope — added files

| File | Purpose |
|---|---|
| `docs/superpowers/baselines/phase-0/` (directory) | Screenshot baselines: 8 pages × {375px, 768px} × {light, dark} ≈ 32 PNGs. |
| This spec | `docs/superpowers/specs/2026-04-19-phase-0-foundation-design.md` |

### 2.3 Out of scope — explicitly deferred

| File | Reason | Owning phase |
|---|---|---|
| `index.html` | Dashboard rework will restructure markup. | Phase 1 |
| `calendar.html` | Calendar rework will restructure sub-bars and views. | Phase 2 |
| `admin.html` | Admin restructure (11 → 5 tabs) will rewrite most markup. | Phase 3 |
| `kid.html` | Kid consolidation will restructure. | Phase 4 |
| `scoreboard.html` | Scoreboard tab standardization. | Phase 5 |
| `tracker.html` | Tracker tab standardization. | Phase 5 |
| `manifest.json` | `theme_color` is a browser hint, not component CSS. Leave alone. |
| `shared/firebase.js`, `scheduler.js`, `scoring.js`, `state.js`, `dom-helpers.js`, `utils.js` | No CSS or inline-style concerns. |
| Icon-tile tokens (`--icon-blue/teal/amber/purple/rose/green/gray/red`) | Only used by List group (§5.15, Phase 3). Add with Phase 3 so tokens aren't defined before their first consumer. | Phase 3 |
| Avatar positional classes (`.avatar--a/b/c/d`) using `--owner-*` tokens | Owner color today is free-form per-person (Firebase). Positional-class binding is a future-swatch-picker concern. | Deferred (no current owning phase) |

### 2.4 Deferred tech-debt register

This register is the hand-off from Phase 0 to every later phase. Each row becomes an exit criterion on its owning phase's spec.

| Item | Approx count | File | Owning phase |
|---|---:|---|---|
| Inline styles | 1 | `index.html` | Phase 1 |
| Inline styles | 1 | `calendar.html` | Phase 2 |
| Inline styles | 126 | `admin.html` | Phase 3 |
| Inline styles | 33 | `kid.html` | Phase 4 |
| Inline styles | 32 | `scoreboard.html` | Phase 5 |
| Inline styles | 3 | `tracker.html` | Phase 5 |
| Hex literals | TBC (fill during PR) | `styles/dashboard.css` | Phase 1 |
| Hex literals | TBC | `styles/calendar.css` | Phase 2 |
| Hex literals | TBC | `styles/admin.css` | Phase 3 |
| Hex literals | TBC | `styles/kid.css` | Phase 4 |
| Hex literals | TBC | `styles/scoreboard.css` | Phase 5 |
| Hex literals | TBC | `styles/tracker.css` | Phase 5 |
| Icon-tile tokens | 8 tokens | `styles/base.css`, `shared/theme.js` | Phase 3 |

"TBC" counts get filled in during the Phase 0 PR using the grep recipe in §6.1.

---

## 3. Token specifics

### 3.1 Pure renames (value unchanged)

| Old | New |
|---|---|
| `--bg-card` | `--surface` |
| `--bg-primary` | `--bg` |
| `--bg-secondary` | `--surface-2` |
| `--bg-nav` | `--surface` (nav bg via `backdrop-filter` in component) |
| `--border-color` | `--border` |
| `--border-light` | `--border` (collapse — spec has one border token) |
| `--border-subtle` | `--border` |
| `--text-primary` | `--text` |
| `--text-secondary` | `--text-muted` |
| `--text-muted` | `--text-faint` *(semantic shift — see §3.4)* |
| `--accent-light` | `--accent-soft` |
| `--success-bg` | `--success-soft` |
| `--success-text` | `--success` |
| `--warning-bg` | `--warning-soft` |
| `--warning-text` | `--warning` |
| `--danger-bg` | `--danger-soft` |
| `--danger-text` | `--danger` |
| `--info-bg` | `--info-soft` |
| `--info-text` | `--info` |
| `--max-width` | `--max-content` |
| `--font-size-xs` | `--font-xs` |
| `--font-size-sm` | `--font-sm` |
| `--font-size-md` | `--font-md` |
| `--font-size-lg` | `--font-lg` |
| `--font-size-xl` | `--font-xl` |
| `--font-size-2xl` | `--font-2xl` |
| `--transition-fast` | `--t-fast` |
| `--transition-normal` | `--t-base` |

### 3.2 Value changes (same name, new value — visible deltas flagged)

| Token | Old value | New value | User-visible effect |
|---|---|---|---|
| `--nav-height` | 60px | 68px | +8px bottom chrome. |
| `--header-height` | 56px | 64px | +8px top chrome on pages that size against this var. |
| `--font-xl` *(was `--font-size-xl`)* | 1.5rem (24px) | 1.375rem (22px) | Page titles slightly smaller. |
| `--font-2xl` *(was `--font-size-2xl`)* | 2rem (32px) | 1.75rem (28px) | Hero numbers slightly smaller. |
| `--t-fast` | 150ms | 120ms | Hover/tap animations ~20% faster. Imperceptible. |
| `--t-base` | 250ms | 200ms | Sheet slides ~20% faster. Barely perceptible. |
| Body `font-size` | `var(--font-size-base)` = 0.9375rem (15px) | `var(--font-md)` = 1rem (16px) | **Most visible change in the phase.** Body text +1px everywhere. |

Phase 0 accepts these as aligned-with-spec visible deltas. The ~5% visual shift is the trade for getting onto the spec baseline before downstream phases build on it.

### 3.3 New tokens added

*Color (light-mode values; dark values per [mockups/design-system.css](../../../mockups/design-system.css)):*
```
--bg                #f7f6f2
--surface           #ffffff   (exists, preserved)
--surface-2         #f2f1ec
--text              #171717
--text-muted        #6b6b6b
--text-faint        #9a9a9a
--border            #e7e5de
--accent            (theme-driven)
--accent-ink        (theme-driven, darker accent for text-on-soft)
--accent-soft       (theme-driven, tinted bg)
--danger            #b4491c
--danger-soft       #fae5d6
--success           #166534
--success-soft      #dcfce7
--warning           #9a6b0c
--warning-soft      #faecd0
--info              #1d4f7a
--info-soft         #dfecf7
```

*Owner palette (static defaults — swatch-picker basis, not bound to specific people):*
```
--owner-a: #3e6b9f
--owner-b: #b8577d
--owner-c: #7d6bb8
--owner-d: #5a9466
```

*Spacing:* `--spacing-2xl: 48px`

*Type:* `--font-3xl: 2.25rem` (36px — kid hero, kiosk)

*Motion:* `--t-slow: 320ms ease-out`

*Z-index (new `--z-*` tokens per DESIGN §3.7):*
```
--z-header:         10
--z-fab:            15
--z-nav:            20
--z-sheet-backdrop: 30
--z-sheet:          31
--z-modal-backdrop: 40
--z-modal:          41
--z-toast:          50
--z-celebration:    60
```

### 3.4 The `--text-muted` semantic-shift hazard

This is the one rename that is **not** purely mechanical.

Before Phase 0:
- `--text-primary` (#2c2c2c) — primary body text
- `--text-secondary` (#6b6b6b) — subtitles, meta rows
- `--text-muted` (#999999) — the faintest tier (chevrons, meta dots)

After Phase 0:
- `--text` (#171717) — primary
- `--text-muted` (#6b6b6b) — secondary
- `--text-faint` (#9a9a9a) — tertiary

The name `--text-muted` is preserved but its meaning shifts from "tertiary" to "secondary". Every existing call site reading `var(--text-muted)` must be manually reviewed:

- If it was labeling a **meta dot, chevron, divider, or the quietest text** → rewrite to `var(--text-faint)`.
- If it was labeling a **card subtitle, card meta line, form helper** → leave as `var(--text-muted)`.

This manual pass happens during commit 4 (the per-file CSS rename). The visual baseline screenshots will surface any misreads.

### 3.5 Retired tokens (removed after rename sweep)

```
--bg-primary, --bg-secondary, --bg-card, --bg-nav
--text-primary, --text-secondary
--border-color, --border-light, --border-subtle
--accent-light
--success-bg, --success-text
--warning-bg, --warning-text
--danger-bg, --danger-text
--info-bg, --info-text
--font-size-xs, --font-size-sm, --font-size-base,
--font-size-md, --font-size-lg, --font-size-xl, --font-size-2xl
--transition-fast, --transition-normal
--max-width
```

### 3.6 Preserved tokens (no change)

- `--spacing-xs/sm/md/lg/xl`
- `--radius-sm/md/lg/xl/full`
- `--shadow-sm/md/lg` *(values updated to mockup values, names preserved)*
- `--grade-a/b/c/d/f`
- `--accent-hover`, `--accent-pressed` (button-state utility)
- `--bg-hover`, `--overlay-bg` (utility)
- `--font-family`

### 3.7 theme.js per-preset contract (post-Phase 0)

Each theme preset emits at `:root[data-theme="<name>"]`:
```
--accent, --accent-ink, --accent-soft
```

Dark-mode overrides emit at `:root[data-theme="<name>"][data-mode="dark"]`:
```
--bg, --surface, --surface-2, --text, --text-muted, --text-faint, --border,
--accent, --accent-ink, --accent-soft,
--danger/-soft, --success/-soft, --warning/-soft, --info/-soft
```

**Theme-invariant tokens (defined only in `base.css`, never themed):**
- Owner tokens (`--owner-a..d`)
- Grade colors (`--grade-*`)
- Motion (`--t-*`)
- Spacing (`--spacing-*`)
- Type (`--font-*`)
- Radii (`--radius-*`)
- Z-index (`--z-*`)
- `--font-family`

---

## 4. Inline-style sweep — class replacements

The inline-style sweep on `shared/components.js` (59), `shared/calendar-views.js` (7), and `dashboard.js` (5) needs a small set of new helper classes. These live in `styles/components.css`.

*Per-person color propagation (currently inline `style="--owner-color:..."`):*
- Pattern to replace: `<element style="--owner-color:${color}">`
- Replacement: `<element class="owner-bound" data-owner-color="${color}">` + small script in the render function that reads `data-owner-color` and sets the CSS custom property via `element.style.setProperty('--owner-color', color)`.
- Rationale: keeps the CSS custom-property mechanism (every CSS rule already uses `var(--owner-color)`), but removes raw inline `style` strings from HTML. The `style.setProperty` call is a targeted JS exception — allowed because the value is per-record runtime data, not visual styling.

*Per-person dot elements (currently `style="background:${person.color}"`):*
- Replace with `<span class="person-dot" data-person-color="${color}"></span>` + `.person-dot { background: var(--person-color, var(--text-faint)); }` + the same `setProperty` pattern.

*Event background tints (currently `style="background:${event.color}"`):*
- Same pattern: `class="event-tint"` + `data-event-color` + `style.setProperty`.

*Sheet-open transform inline styles (currently `style="transform: translateY(100%)"` etc.):*
- Move to CSS class `.sheet--opening` / `.sheet--open` / `.sheet--closing`. Toggle via JS.

The sweep produces **one new rule**: "CSS variables set from runtime data go through `element.style.setProperty('--var', value)`, never as `style="..."` attribute strings." This rule enters DESIGN.md §A appendix alongside the grep recipes.

---

## 5. Accessibility & motion

### 5.1 `prefers-reduced-motion` coverage

After Phase 0, every `styles/*.css` with animations contains a `@media (prefers-reduced-motion: reduce)` block that collapses slides/scales to 120ms opacity fades.

Files gaining the guard in Phase 0: `layout.css`, `responsive.css`, `admin.css`, `kid.css`, `tracker.css`.

Files already carrying the guard (unchanged): `components.css`, `dashboard.css`, `calendar.css`, `scoreboard.css`.

### 5.2 Contrast verification

No new palette colors are introduced beyond what's already in the mockup's `design-system.css`. Each theme preset is contrast-verified light + dark per the smoke test in §6.2.

### 5.3 Tap targets

Phase 0 does not resize any interactive element. The `44×44` / `56×56` minimums stay as they are; enforcement moves to later phases as markup is restructured.

---

## 6. Verification

### 6.1 Grep recipes (runnable without build tooling)

These recipes become **DESIGN.md §A (new appendix)**. Phase 0 adds the appendix; every later phase's PR checklist says "run §A recipes — all should pass."

```bash
# 1. Zero inline styles in Phase-0-scoped files
grep -Pn 'style="' setup.html person.html shared/components.js \
  shared/calendar-views.js dashboard.js
# Expected: 0 matches

# 2. Zero retired token names anywhere in styles/ or shared/
grep -rPn '\-\-(bg-card|bg-primary|bg-secondary|bg-nav|text-primary|text-secondary|border-color|border-light|border-subtle|accent-light|font-size-(xs|sm|base|md|lg|xl|2xl)|transition-(fast|normal)|max-width|(success|warning|danger|info)-(bg|text))\b' styles/ shared/
# Expected: 0 matches

# 3. Zero raw hex in components.css
grep -Pn '#[0-9a-fA-F]{3,6}\b' styles/components.css
# Expected: 0 matches (exceptions must be documented inline)

# 4. Zero window.confirm / window.alert / bare confirm/alert in app code
grep -rPn '\bwindow\.(confirm|alert)\s*\(' --include='*.js' --include='*.html' .
grep -rPn '(^|[^a-zA-Z0-9_\.])(confirm|alert)\s*\(' --include='*.js' --include='*.html' . \
  | grep -v 'showConfirm' \
  | grep -v 'shared/components\.js'
# Expected: 0 matches (showConfirm defined in shared/components.js is the only allowlisted use)

# 5. prefers-reduced-motion present in every animating stylesheet
for f in styles/layout.css styles/responsive.css styles/components.css \
         styles/dashboard.css styles/calendar.css styles/scoreboard.css \
         styles/tracker.css styles/admin.css styles/kid.css; do
  grep -q 'prefers-reduced-motion' "$f" || echo "MISSING: $f"
done
# Expected: no MISSING output

# 6. Zero hardcoded z-index outside the token band (any z-index: without var())
grep -rPn 'z-index:\s*(?!var\()' styles/
# Expected: 0 matches (comments and scroll-locked-body exemptions documented)
```

### 6.2 Manual smoke test (Phase 0 exit)

- [ ] Dashboard: loads; today's tasks render; tap completes; long-press opens detail sheet.
- [ ] Calendar: opens to current view; day sheet opens; swipe navigates days.
- [ ] Kid mode (`kid.html?kid=<name>`): renders; celebration fires on completion.
- [ ] Admin: PIN entry works; admin tabs render; CRUD operations intact.
- [ ] Scoreboard: leaderboard + grades table render; period tabs switch.
- [ ] Setup wizard (`setup.html`): 6 steps advance.
- [ ] Lighthouse accessibility score ≥ pre-Phase-0 baseline (captured in pre-Phase-0 commit).
- [ ] Service worker serves app shell offline (DevTools → Network → Offline).
- [ ] `prefers-reduced-motion: reduce` collapses animations to fades (DevTools → Rendering → Emulate).
- [ ] All 5 theme presets render in both light and dark modes without contrast regressions.

### 6.3 Visual baseline

Before the first code commit in the Phase 0 PR branch:
1. Capture screenshots via Chrome DevTools MCP for each of the 8 pages at:
   - Widths: 375px, 768px
   - Modes: light, dark
   - → 32 PNGs total, saved to `docs/superpowers/baselines/phase-0/<page>-<width>-<mode>.png`
2. Commit as the first commit in the PR.

After all code commits, before opening the PR:
1. Re-capture with the suffix `-after.png`.
2. Spot-check for regressions. The ~5% visible delta from §3.2 is expected; anything beyond that is a bug.

The `-after.png` screenshots become the **baseline for Phase 1**. Every subsequent phase's spec includes a "baseline refresh" step.

---

## 7. Commit strategy

Seven-commit recipe. Ordered so any single revert leaves the app in a coherent state and `git bisect` narrows to one boundary cleanly.

1. **`chore(baselines): capture pre-Phase-0 visual baselines`** — just the PNGs. No code changes.
2. **`chore(styles): add new tokens and dark-mode block to base.css`** — purely additive; old tokens still present.
3. **`refactor(theme): emit new token names from theme.js`** — theme.js now emits both old and new during transition.
4. **`refactor(styles): rename token usages + tokenize z-index in components.css + shared/`** — sweep 1 (includes z-index tokenization).
5. **`refactor(styles): rename token usages + tokenize z-index in remaining CSS files`** — sweep 2 (dashboard, calendar, admin, kid, scoreboard, tracker, layout, responsive).
6. **`refactor(styles): remove retired tokens from base.css and theme.js`** — the delete commit. Grep recipe #2 must return 0 after this.
7. **`refactor(components): move inline styles to classes in stable modules`** + **`chore(styles): add reduced-motion guards`** + **`refactor(styles): purge raw hex in components.css`** + **`chore(sw): bump CACHE_NAME to v43`** + **`docs: update DESIGN.md §A, plan, spec + after-baselines`** — final shape. All grep recipes must pass.

Commit 7 is the largest; if it becomes unwieldy it may be split into 7a/7b/7c following the same ordering.

---

## 8. Rollback plan

| Scenario | Action |
|---|---|
| Single commit breaks something mid-PR | `git revert <sha>` — the chain is linear and each commit compiles. |
| Merged PR regresses production | `git revert <merge-sha>` and push — Cloudflare auto-redeploys in ~1 min. SW cache bump on the revert commit ensures clients pull the revert. |
| User-reported theme inconsistency | Check theme.js dark-mode parity per preset; no rollback needed — fix forward. |

**Data safety:** Zero Firebase schema changes. Zero destructive writes. `dr-theme` localStorage key preserved (same name, same shape). No user-visible theme reset.

---

## 9. Known risks & mitigations

| Risk | Mitigation |
|---|---|
| `--text-muted` semantic shift miscategorizes text across files | Manual review pass during commit 5; visual baseline screenshots surface misreads. |
| Body font-size jump (15 → 16px) creates subtle overflow on narrow phones | Smoke test at 360px width (one below 375 baseline). |
| Nav/header height bumps (+8px each) squeeze content area | Pages calculate against these vars already; spot-check kid mode (tightest layout). |
| Rename sweep misses a callsite in a template string | Grep recipe #2 catches mechanically. |
| Theme.js dark-mode parity regresses | Test 5 presets × 2 modes before merge. |
| Inline-style sweep in `components.js` breaks per-person color propagation | The `style.setProperty('--owner-color', ...)` JS pattern is covered by unit-style smoke test (open dashboard, verify colored stripes render). |

---

## 10. Review gate before starting Phase 1

Before writing the Phase 1 spec, the following must be true:

- [ ] All Phase 0 exit criteria met (§6.2 smoke test passes).
- [ ] All grep recipes (§6.1) return 0 matches.
- [ ] Deferred tech-debt register (§2.4) updated — TBC counts filled in, no new items added.
- [ ] Visual baselines refreshed (`docs/superpowers/baselines/phase-0/*-after.png` committed).
- [ ] Plan file (`2026-04-19-ui-rework.md`) updated to reflect any scope deviations discovered during the build.
- [ ] This spec file is the accurate record of what shipped — any deviations amended inline with a dated note.

This template copies forward to every subsequent phase's spec.

---

## 11. Appendix — Plan updates landed with this spec

The following amendments to `docs/superpowers/plans/2026-04-19-ui-rework.md` ship in the same PR:

1. **Phase 0 exit criterion softened** — the "grep for `style="` returns 0 non-trivial matches" criterion now reads: "grep for `style="` returns 0 matches in files listed in Phase 0 scope; later-phase files tracked in this spec's §2.4 deferred register."
2. **Phases 1–5 gain explicit exit criteria** — each phase adds:
   - "Inline styles in the phase's primary HTML file cleared (§2.4 register row satisfied)."
   - "Raw hex in the phase's primary CSS file replaced with tokens (§2.4 register row satisfied)."
3. **"Plan-as-memory" discipline note** — a new section at the top of the plan: "When any phase spec is written, update this plan file in the same PR to reflect scope changes, deferred items moved, or decisions that affect downstream phases."
4. **Icon-tile tokens noted as Phase 3 inclusion** — Phase 3's file list gains `styles/base.css` (icon tokens) and `shared/theme.js` (icon token per-preset emit).

---

## 12. Open questions

None. All clarifying decisions made during brainstorming are recorded above. If the Phase 0 build surfaces a question this spec doesn't answer, update DESIGN.md or this spec in the same PR that adds the pattern.
