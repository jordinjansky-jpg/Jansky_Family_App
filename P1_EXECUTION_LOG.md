# P1 Execution Log

## Status: COMPLETE

---

## P1.0 Cleanup Block

### P1.0a — Revert nav grid misdiagnosis
**File:** `styles/layout.css`
**Change:** `.bottom-nav { grid-template-columns: repeat(4, 1fr) }` → `repeat(5, 1fr)`
**Why:** P0.9 incorrectly diagnosed 4 items; renderNavBar() renders 4 linkItems + 1 moreItem = 5 total always. The More button had dropped out of the layout after P0.9.
**Status:** DONE

### P1.0b — Fix celebration subtitle dark mode
**File:** `styles/dashboard.css`
**Change:** `.celebration__subtitle { color: var(--surface-2) }` → `color: var(--on-accent)`
**Why:** `--surface-2` on a celebration overlay renders near-black on dark themes.
**Status:** DONE

### P1.0c — Strip var(--radius, 8px) fallbacks
**Files:** `styles/admin.css`, `styles/components.css`, `styles/kid.css`
**Change:** All 9 instances of `var(--radius, 8px)` → `var(--radius)` (P0 added `--radius: var(--radius-md)` to base.css so the token is now defined)
**Status:** DONE — confirmed 0 remaining instances

### P1.0d — Fix --font-size-* typo instances
**File:** `styles/components.css`
**Changes (6 instances):**
| Line | Before | After |
|------|--------|-------|
| 2996 | `var(--font-size-sm)` | `var(--font-sm)` |
| 3020 | `var(--font-size-lg, 1.125rem)` | `var(--font-lg)` |
| 3569 | `var(--font-size-xs, 0.75rem)` | `var(--font-xs)` |
| 4170 | `var(--font-size-base)` | `var(--font-base)` |
| 4183 | `var(--font-size-sm)` | `var(--font-sm)` |
| 4226 | `var(--font-size-sm)` | `var(--font-sm)` |

Lines 4170, 4183, 4226 had no fallback — were silently rendering at browser default. Lines 3020, 3569 had fallbacks covering the bug; removed fallbacks in same fix.
**Status:** DONE — confirmed 0 remaining instances

---

## P1.1 — Card System Border-Radius Tokenization

**Files:** `styles/components.css`, `styles/dashboard.css`

**Changes:**

| Old value | Token | Instances | Context |
|-----------|-------|-----------|---------|
| `8px` | `var(--radius)` | ×9 in components.css | Form inputs (tf-*, rf-*), small badges (task-card__tag, bell__badge) |
| `999px` | `var(--radius-full)` | ×1 in components.css | `.owner-chip` pill |
| `20px` | `var(--radius-full)` | ×3 in components.css | `.template-chip`, `.ef2-person-chip`, `.ef2-add-chip` |
| `16px` | `var(--radius-full)` | ×1 in components.css + ×1 in dashboard.css | `.tf-detail-chip` (height 32px), `.task-detail__move-pill` |
| `14px` | `var(--radius-full)` | ×1 in components.css | `.tf-exempt-chip` (height 28px — height/2, was already visually a pill) |

**Token mapping:**
- `--radius` = `var(--radius-md)` = 10px — interactive element default (cards, inputs, panels)
- `--radius-full` = 9999px — pill/circle shapes; all 20px/16px/14px pill values cap at height/2 in CSS anyway

**Left intentionally hardcoded:** `50%` circles, `2px/3px/4px` progress-bar decorations, `0 0 2px 2px` nav-dot, `3px 3px 0 0` sparkline bar, `4px` admin reward badge.

**Net:** 16 hardcoded values tokenized.
**Status:** DONE

---

## P1.2 — Section Heading Normalization

**Two canonical classes preserved:**
- `.section__title` (components.css) — page-level divider: font-xs, 600, uppercase, 0.08em letter-spacing, text-muted
- `.ef2-section-label` (components.css) — form inline label: font-sm, 500, no uppercase, text-muted

**7 orphans normalized:**

| Class | File | Change |
|-------|------|--------|
| `.me-detail__section-label` | components.css | letter-spacing 0.07em → 0.08em |
| `.shopping-category-label` | components.css | font-weight 700 → 600 |
| `.rewards-section-heading` | rewards.css | letter-spacing 0.05em → 0.08em |
| `.filter-section__label` | rewards.css | letter-spacing 0.05em → 0.08em |
| `.fs-section__label` | admin.css | font-weight 600 → 500 (ef2-section-label pattern) |
| `.admin-detail-section__title` | admin.css | font-weight 700 → 600 |
| `.admin-settings-section__title` | admin.css | font-weight 700 → 600, letter-spacing 0.06em → 0.08em |

**Left alone:** `.cal-day__section-header` (structural sticky with border-bottom), `.admin-section-header` (flex container), `.sheet-section-title` (spacing-only wrapper, no font rules).

**Status:** DONE

---

## P1.3 — Person Chip Normalization

**Action (Option C):** Added color dot `::before` to `.person-pill`.
**Documented stance (Option B):** 4-context model — person-pill = filter bars; owner-chip = task assignment forms; ef2-person-chip = event form state machine; template-chip = generic pick chip. No consolidation.

**CSS change (components.css):**
- Added `display: inline-flex; align-items: center; gap: 6px;` to `.person-pill`
- Added `::before` color dot: 8px circle, `background: var(--person-color, var(--text-faint))`, opacity 0.65 when inactive
- Active state override: `.person-pill[data-person-id]:not([data-person-id=""]).person-pill--active::before { background: var(--on-accent); opacity: 1; }` — dot turns white when chip fills with person color

**Dot mechanism:** Uses `var(--person-color)` already set as an inline CSS custom property by JS. Zero JS changes needed. "All" pill (no data-person-id attribute) gets no dot.

**Status:** DONE

---

## P1.4 — Card Press Feedback

**Files:** `styles/components.css`

**Changes:**
- `.card:active { transform: scale(0.997) }` → `scale(0.98)` — matches `.card--score:active` which was already 0.98
- `.btn--secondary:active { opacity: 0.75 }` — was missing entirely
- `.btn--ghost:active { opacity: 0.75 }` — was missing entirely
- `.task-detail__action-row:active { background: var(--surface-2) }` — row tint feedback

**Phone test required:** P1.4 is the primary item where you'll feel the scale change. The 0.997→0.98 jump is significant.

**Status:** DONE — PHONE TEST REQUIRED

---

## P1.5 — Admin Token Audit

**File:** `styles/admin.css`

**Changes:**

| Before | After | Context |
|--------|-------|---------|
| `font-size: 0.85rem` (×2) | `var(--font-sm)` | `.task-detail__move-toggle`, `.task-detail__source-info` |
| `border-radius: var(--radius-pill, 9999px)` | `var(--radius-full)` | `.admin-badge` |
| `font-size: 10px` | `var(--font-xs)` | `.admin-badge` |
| `font-size: 0.7rem` | `var(--font-xs)` | `.redemption-row__label` |

**Left alone:** `0.65rem`/`0.6rem` achievement badge detail labels (intentionally tiny), emoji icon sizes (1.1–1.5rem, not text), `11px` debug panel pre (P1.7 territory).

**Status:** DONE

---

## P1.6 — Dark Mode Block Synchronization

**File:** `styles/base.css`

**Gaps found and filled:**
1. `--surface-3` missing from root + dark blocks. Added to root as `#eae9e3` (light), to both dark blocks as `#2e2d2a`.
2. `--bg-hover: rgba(0,0,0,0.04)` not overridden for dark. Added to both dark blocks as `rgba(255,255,255,0.06)` — black tint flips to white tint on dark surfaces.
3. `--accent-hover: #5b7fd6dd` not overridden for dark. Added to both dark blocks as `#64b7a8dd` — matches the dark accent token with alpha.

**Both blocks kept in sync:** `[data-theme="dark"]` (explicit theme selection) and `@media (prefers-color-scheme: dark)` `:root:not([data-theme])` (OS fallback) now have identical additions.

**Status:** DONE

---

## P1.7 — Debug Panel Theming

**File:** `styles/admin.css`

**Changes:** Replaced 3 hardcoded colors in `.debug-panel` and `.debug-panel__title`:

| Before | After |
|--------|-------|
| `background: #1a1a2e` | `background: var(--surface-2)` |
| `color: #e0e0e0` | `color: var(--text)` |
| `border: 1px solid #333` | `border: 1px solid var(--border)` |
| `color: #ffd93d` (title) | `color: var(--warning)` |

Note: The terminal/dark aesthetic is replaced by standard surface theming. The debug panel now adapts to both light and dark themes. The panel's purpose (raw debug output) is communicated by context (admin Debug tab) and structure (monospace pre).

`font-size: 11px` on `.debug-panel__pre` left as-is — functional monospace display, intentionally compact.

**Status:** DONE

---

## P1.8 — Dashboard Day-Nav Animation

**Files:** `styles/dashboard.css`, `dashboard.js`

**CSS added to `dashboard.css`:**
- `@keyframes dashSlideNext` — from opacity:0, translateX(20px) → opacity:1, translateX(0)
- `@keyframes dashSlidePrev` — from opacity:0, translateX(-20px) → opacity:1, translateX(0)
- `#mainContent.dash-slide-next` and `#mainContent.dash-slide-prev` trigger classes (220ms ease-out both)
- `@media (prefers-reduced-motion: reduce)` override — `animation: none`

Pattern matches `tracker.css` trkSlideNext/trkSlidePrev exactly.

**JS change in `dashboard.js` `changeDay(delta)`:**
- Picks `dash-slide-next` or `dash-slide-prev` based on delta sign
- Removes both classes at start of navigation (cleans up any previous animation)
- Adds the class after `loadData()` completes (content is fresh when animation fires)
- Registers `animationend` listener with `{ once: true }` for automatic class cleanup

**Phone test required:** P1.8 with P1.4 are the two items to validate on device.

**Status:** DONE — PHONE TEST REQUIRED

---

## P1.9 — Nav Active State Dot Indicator

**Verified:** The `::before` top-edge bar indicator is already implemented in `styles/layout.css`:
```css
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
This was wired in P0 when `renderNavBar()` was migrated to emit `is-active` class. No changes needed.

**Status:** CSS VERIFIED — PHONE TEST REQUIRED

---

## P1.10 — Sticky Footer Safe Area Audit

**All bottom-pinned elements verified:**

| Element | File | Coverage |
|---------|------|----------|
| `.bottom-nav` | layout.css | `height: calc(--nav-height + env(...))` + `padding-bottom: env(...)` ✓ |
| `.bottom-sheet` | components.css | `padding-bottom: env(safe-area-inset-bottom, 0px)` ✓ |
| `.task-detail__complete-footer` | dashboard.css | `padding-bottom: calc(--spacing-lg + env(...))` ✓ |
| `.ef2-footer` | components.css | `padding-bottom: calc(--spacing-sm + env(...))` ✓ |
| `.kl-footer` / `.kp-footer` etc. | components.css | `padding-bottom: calc(--spacing-sm + env(...))` ✓ |
| `.kid-settings-panel` | kid.css | `padding-bottom: calc(--spacing-lg + env(...))` ✓ |

**No changes needed.**

**Status:** VERIFIED — CLEAN

---

## Deferred Observations

**D1:** `.cal-day__section-header` (calendar.css) has font-sm, font-weight 700, sticky with border-bottom. Does not map cleanly to either canonical section heading pattern — it's a hybrid structural/label element. Leave as-is for now; revisit in P2 calendar design pass.

**D2:** `rewards.css` uses `var(--nav-height, 68px)` with a hardcoded fallback on line 87. The `68px` fallback should be removed now that `--nav-height` is always defined in base.css. Low risk, deferred.

**D3:** `components.css` `.store-card__badge` uses `var(--surface-alt, var(--surface))`. The `--surface-alt` token doesn't exist — the fallback silently covers. Either define the token in base.css or remove the alias. Low risk, deferred.

**D4:** Achievement badge labels at 0.65rem and 0.6rem remain intentionally below the token floor. These are the smallest text in the app and serve a specific density purpose on the achievement grid. Flag for accessibility review in P2.

**D5:** `var(--font-xs, 0.75rem)` fallbacks still present in `kid.css` (lines 524–525, 533) and `admin.css` (line 783). These have correct fallbacks that match the defined token value — low priority cleanup in P2.
