# Form Footer + Header Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first two `fs-*` shared form primitives — `renderFormFooter()` and `renderFormSheetHeader()` — and prove the API by migrating one in-app form (Meal Plan picker via `openPlanMealSheet` in kitchen.js) to use them.

**Architecture:** Two new pure-HTML-generator functions added to `shared/components.js` (no DOM access, no side effects, just return strings). One new CSS block in `styles/components.css` under the `fs-` prefix. Existing per-form footer classes (`kp-footer`, `ef2-footer`, etc.) remain valid — the new primitive is additive, not a forced migration. The smoke-test migration replaces the inline `kp-footer` HTML with a `renderFormFooter()` call so the same DOM shape is produced and we know the helper API matches reality.

**Tech Stack:** Vanilla JS ES modules · CDN-loaded Firebase compat SDK · CSS design tokens · Playwright at 412×915 for visual verification (no unit-test framework — verification is manual + visual). Reference: DESIGN.md §5.23 v2 + §13.13 v2.

**Out of scope (later PRs):**
- Saving spinner JS helper (PR A.5 or B)
- DateInput / TimeInput primitives (PR B)
- ChipPicker / InlineRevealField (PR C)
- EmojiPicker / ColorPicker (PR D)
- PersonChips / SwitchToggle / HelperText (PR E)
- Migrating the other 9 forms (Phase 3, one PR per form)

---

## File Structure

- **Modify:** `styles/components.css` — add `fs-` prefix block (sticky footer + disabled state) near the existing kitchen-form footer rule
- **Modify:** `shared/components.js` — add `renderFormFooter()` and `renderFormSheetHeader()` exports
- **Modify:** `kitchen.js` — migrate `openPlanMealSheet` (around line 470–512) from inline `kp-footer` HTML to `renderFormFooter()` call; same for the header
- **Modify:** `sw.js` — bump `CACHE_NAME` from `family-hub-v183` to `family-hub-v184`
- **Modify:** `docs/DESIGN.md` — flip the two primitives in §5.23's "Shared primitives target" table from "TODO Phase 1" to "Shipped 2026-05-10"

No new files.

---

## Task 1: Add `fs-footer` CSS primitive

**Files:**
- Modify: `styles/components.css` — append after the existing kitchen-forms block (around line 4848)

**Why this first:** The CSS exists independently of any JS helper. Adding it lets us visually verify the rule renders before writing any HTML to use it.

- [ ] **Step 1.1: Read the existing kitchen footer rule to confirm shape**

Run (in PowerShell or via Grep tool):
```
Grep pattern: "\.kl-footer, \.kb-footer" in styles/components.css
```
Expected: returns line ~4835 with the multi-class selector for kitchen forms.

- [ ] **Step 1.2: Append the `fs-` block to `styles/components.css`**

After the kitchen-forms footer block (right after the `.kl-footer .btn, ...` rule around line 4848), append this new block:

```css

/* ── Form-system shared primitives (fs-*) ─────────────────────────────────
   Canonical sticky footer + disabled state. New forms use these classes;
   existing forms (kl-, kb-, ki-, ks-, km-, kp-, ef2-) keep their per-form
   classes which map to the same visual via the rules above. See DESIGN.md
   §5.23 v2 "Sticky footer (the fs-footer rule — universal)".
   ────────────────────────────────────────────────────────────────────── */
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
.fs-footer .btn[disabled],
.fs-footer .btn[aria-disabled="true"] {
  opacity: 0.5;
  pointer-events: none;
}
/* ── End form-system shared primitives ─────────────────────────────────── */
```

- [ ] **Step 1.3: Verify the CSS parses (no syntax errors break the cascade)**

Run:
```
node serve.js
```
(in a separate terminal — leave it running)

Then open `http://localhost:8080/?env=dev` in a browser. Confirm the dashboard loads with no console errors and the existing forms (open Plan a meal from dinner tile) still render their footer correctly. The new `.fs-footer` rule shouldn't affect anything yet — no element uses the class.

Expected: dashboard renders normally, Plan a meal footer still has Cancel + Save sticky at bottom, no console CSS errors.

- [ ] **Step 1.4: Commit**

```
git add styles/components.css
git commit -m "feat(forms): add fs-footer CSS primitive (DESIGN.md §5.23 v2)"
```

---

## Task 2: Add `renderFormFooter()` helper

**Files:**
- Modify: `shared/components.js` — add new exported function

**Why now:** The CSS is ready, so the HTML generator can be tested by inserting a hand-rolled `<div class="fs-footer">` somewhere temporarily to confirm visual parity. We won't actually insert anything into the app yet — just add the helper and prove it returns the expected string.

- [ ] **Step 2.1: Find a good insertion point in `shared/components.js`**

Run:
```
Grep pattern: "^export function renderBottomSheet" in shared/components.js
```
Expected: returns line 436 — `export function renderBottomSheet(content) {`. Place the new helpers immediately after `renderBottomSheet`'s closing brace (around line 452) since they're conceptually related (both render sheet shells).

- [ ] **Step 2.2: Read lines 436–460 of shared/components.js to confirm where to insert**

Run:
```
Read shared/components.js offset 436 limit 25
```
Find the `}` that closes `renderBottomSheet` (likely around line 451 or 452). The next function (`renderPersonFilter` at line 454) is the one to insert AFTER, OR we insert immediately after `renderBottomSheet` — pick the cleaner spot. Use the line right before `export function renderPersonFilter`.

- [ ] **Step 2.3: Insert the `renderFormFooter()` helper**

Use the Edit tool. Old string is the line right before `export function renderPersonFilter` (capture enough surrounding context to make it unique). New string adds the helper before that line.

```js
/**
 * Render the canonical sticky footer for a form sheet (Cancel + primary action).
 * See DESIGN.md §5.23 "Sticky footer (the fs-footer rule — universal)".
 *
 * @param {object}  opts
 * @param {string}  opts.saveLabel   - Visible text on the primary button (e.g. "Save", "Add Event").
 * @param {string}  opts.cancelId    - DOM id for the Cancel button (caller wires the listener).
 * @param {string}  opts.saveId      - DOM id for the primary button.
 * @param {boolean} [opts.disabled]  - If true, primary button is rendered with the disabled attribute.
 * @param {string}  [opts.cancelLabel='Cancel'] - Override the Cancel text if needed.
 * @returns {string} HTML string — drop into the bottom-sheet content directly (no wrapper).
 */
export function renderFormFooter({ saveLabel, cancelId, saveId, disabled = false, cancelLabel = 'Cancel' }) {
  const disabledAttr = disabled ? ' disabled' : '';
  return `<div class="fs-footer">
    <button class="btn btn--ghost" id="${esc(cancelId)}" type="button">${esc(cancelLabel)}</button>
    <button class="btn btn--primary" id="${esc(saveId)}" type="button"${disabledAttr}>${esc(saveLabel)}</button>
  </div>`;
}
```

- [ ] **Step 2.4: Verify the module still parses (no JS syntax errors)**

Reload `http://localhost:8080/?env=dev` in the browser. Open DevTools console.

Expected: dashboard loads, no `SyntaxError` in console, existing forms still work. The helper isn't used yet so behavior is unchanged.

If you see a syntax error: re-check the Edit — common culprits are missing backticks, missing `}`, or breaking the `esc` const declaration above.

- [ ] **Step 2.5: Spot-check the function output (optional, in DevTools)**

In the browser console, run:
```js
import('/shared/components.js').then(m => console.log(m.renderFormFooter({ saveLabel: 'Save', cancelId: 'foo_cancel', saveId: 'foo_save', disabled: true })));
```

Expected output (string):
```html
<div class="fs-footer">
    <button class="btn btn--ghost" id="foo_cancel" type="button">Cancel</button>
    <button class="btn btn--primary" id="foo_save" type="button" disabled>Save</button>
  </div>
```

If `disabled: false`, the `disabled` attribute is absent. If `cancelLabel: 'Discard'`, the ghost button reads "Discard".

- [ ] **Step 2.6: Commit**

```
git add shared/components.js
git commit -m "feat(forms): add renderFormFooter helper (fs-footer)"
```

---

## Task 3: Add `renderFormSheetHeader()` helper

**Files:**
- Modify: `shared/components.js` — add second exported function immediately below `renderFormFooter`

- [ ] **Step 3.1: Insert the `renderFormSheetHeader()` helper**

Add immediately after `renderFormFooter` (use the closing `}` of `renderFormFooter` as the anchor in your Edit's `old_string`):

```js
/**
 * Render the canonical form-sheet header (title + ✕, optional ✓ + 🗑️ icons).
 * See DESIGN.md §5.23 "Vertical structure (top-to-bottom)" + §13.13.
 *
 * @param {object}  opts
 * @param {string}  opts.title       - Sheet title (e.g. "New Event", "Edit Recipe").
 * @param {string}  opts.closeId     - DOM id for the ✕ close button (always present).
 * @param {string}  [opts.saveId]    - DOM id for the header ✓ save button. Omit if the form
 *                                     uses a footer-only save (most forms include both).
 * @param {string}  [opts.deleteId]  - DOM id for the header 🗑️ delete button. Omit unless
 *                                     edit mode AND the form supports inline delete.
 * @param {string}  [opts.saveLabel='Save'] - aria-label for the ✓ button.
 * @param {string}  [opts.deleteLabel='Delete'] - aria-label for the 🗑️ button.
 * @returns {string} HTML string for the `<div class="sheet__header">` block.
 */
export function renderFormSheetHeader({ title, closeId, saveId = null, deleteId = null, saveLabel = 'Save', deleteLabel = 'Delete' }) {
  const CLOSE_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const SAVE_SVG   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const DELETE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  const deleteBtn = deleteId ? `<button class="ef2-icon-btn rf-delete-btn" id="${esc(deleteId)}" type="button" aria-label="${esc(deleteLabel)}" title="${esc(deleteLabel)}">${DELETE_SVG}</button>` : '';
  const saveBtn   = saveId   ? `<button class="ef2-icon-btn rf-save-btn" id="${esc(saveId)}" type="button" aria-label="${esc(saveLabel)}" title="${esc(saveLabel)}">${SAVE_SVG}</button>` : '';
  const actionsHtml = (deleteBtn || saveBtn)
    ? `<div class="rf-header-actions">${deleteBtn}${saveBtn}<button class="ef2-icon-btn" id="${esc(closeId)}" type="button" aria-label="Close">${CLOSE_SVG}</button></div>`
    : `<button class="ef2-icon-btn" id="${esc(closeId)}" type="button" aria-label="Close">${CLOSE_SVG}</button>`;
  return `<div class="sheet__header">
    <h2 class="sheet__title">${esc(title)}</h2>
    ${actionsHtml}
  </div>`;
}
```

**Note on class names:** The helper reuses existing classes (`.ef2-icon-btn`, `.rf-header-actions`, `.rf-save-btn`, `.rf-delete-btn`) rather than coining `fs-*` equivalents. Reasoning: those classes already have the right styling in `styles/components.css`. Renaming them would force a parallel CSS migration in the same PR. Phase 3 (per-form propagation) is the right time to consider renaming.

- [ ] **Step 3.2: Reload and verify no JS errors**

Reload `http://localhost:8080/?env=dev`. Open DevTools.

Expected: no `SyntaxError`, dashboard loads.

- [ ] **Step 3.3: Spot-check output**

In console:
```js
import('/shared/components.js').then(m => console.log(m.renderFormSheetHeader({ title: 'New Recipe', closeId: 'rf_close', saveId: 'rf_save' })));
```

Expected: a string starting with `<div class="sheet__header">` containing the title "New Recipe", a `rf-header-actions` wrapper, two icon buttons (`rf_save` ✓ and `rf_close` ✕), no delete button.

Also try with `deleteId: 'rf_delete'` and confirm the trash icon button appears between save and close.

Also try with NO `saveId` — confirm only the close ✕ renders, with no `rf-header-actions` wrapper.

- [ ] **Step 3.4: Commit**

```
git add shared/components.js
git commit -m "feat(forms): add renderFormSheetHeader helper"
```

---

## Task 4: Migrate `openPlanMealSheet` in kitchen.js to use the new primitives

**Files:**
- Modify: `kitchen.js` around lines 470–512 (the `openPlanMealSheet` HTML template)

**Why this is the smoke test:** Plan a meal already has a working sticky footer (`kp-footer`) and the simplest possible header (title + ✕ only, no save icon, no delete icon). Migrating it should produce visually-identical output; if anything looks different in Playwright we know the primitive is wrong.

- [ ] **Step 4.1: Read the existing `openPlanMealSheet` template to find the exact lines**

Run:
```
Read kitchen.js offset 470 limit 50
```

Locate the two HTML chunks to replace:
- Header: `<div class="sheet__header">` … `<button class="ef2-icon-btn" id="kp_close" type="button" aria-label="Close">…</button>` … `</div>` (likely around line 480–485)
- Footer: `<div class="kp-footer">` … `<button class="btn btn--primary" id="kp_save" …>Save</button> </div>` (lines 507–511)

- [ ] **Step 4.2: Add the import**

`kitchen.js` already imports from `./shared/components.js` at lines 13–16. Use Edit to extend that import list. The current block:

```js
import { renderHeader, renderNavBar, initNavMore, initBell,
  initOfflineBanner, showConfirm, showToast, renderFab,
  renderBottomSheet, renderEmptyState, renderAddMenu, renderSkeleton, renderErrorState
} from './shared/components.js';
```

Change to:

```js
import { renderHeader, renderNavBar, initNavMore, initBell,
  initOfflineBanner, showConfirm, showToast, renderFab,
  renderBottomSheet, renderEmptyState, renderAddMenu, renderSkeleton, renderErrorState,
  renderFormFooter, renderFormSheetHeader
} from './shared/components.js';
```

- [ ] **Step 4.3: Replace the inline header HTML with `renderFormSheetHeader()` call**

Use Edit. The `old_string` is the existing `<div class="sheet__header">…</div>` block in `openPlanMealSheet` (capture full block including title and close button). The `new_string` is `${renderFormSheetHeader({ title: 'Plan a meal', closeId: 'kp_close' })}`.

Important: the existing header probably has no `saveId` (Plan a meal uses the footer save only), so omit that arg. Confirm by reading the original — if there's a save icon in the header, add `saveId: 'kp_save_header'` and wire it accordingly. Most likely the header is title + ✕ only.

- [ ] **Step 4.4: Replace the inline footer HTML with `renderFormFooter()` call**

Use Edit. The `old_string` is:
```js
    <div class="kp-footer">
      <button class="btn btn--ghost" id="kp_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="kp_save" type="button"
        ${preRecipeName || selectedRecipeId ? '' : 'disabled'}>Save</button>
    </div>
```

The `new_string` is:
```js
    ${renderFormFooter({ saveLabel: 'Save', cancelId: 'kp_cancel', saveId: 'kp_save', disabled: !(preRecipeName || selectedRecipeId) })}
```

**Note:** the existing template has `class="kp-footer"`. After this change the class becomes `fs-footer`. CSS is already in place from Task 1.

- [ ] **Step 4.5: Verify the wiring still works (kp_cancel + kp_save IDs are unchanged)**

The `id`s are passed through the helper unchanged, so existing listeners (e.g. `document.getElementById('kp_save').addEventListener(...)` later in `openPlanMealSheet`) keep working with no further changes.

Read the lines AFTER 512 to confirm the listeners reference `kp_cancel`, `kp_save`, and `kp_close` and these IDs are still present in the rendered HTML.

- [ ] **Step 4.6: Reload and verify visually**

Reload `http://localhost:8080/?env=dev`. From the dashboard, tap the dinner tile or "Plan dinner" link to open the Meal Plan sheet.

Expected:
- Sheet opens with title "Plan a meal" + ✕ in the header (unchanged).
- Day pill, Slot segmented, Meal section unchanged.
- Footer at the bottom shows Cancel (ghost) + Save (primary, disabled if no recipe selected and no search text typed).
- Tapping ✕ closes the sheet (unchanged behavior).
- Tapping Cancel closes the sheet (unchanged behavior).
- Typing in search OR selecting a recipe enables Save.
- Tapping Save writes to Firebase + closes the sheet (unchanged behavior).

If any of these break, the migration is wrong — most likely the helper output doesn't match the original DOM shape exactly. Compare `renderFormFooter()`'s output with the original HTML byte-for-byte.

- [ ] **Step 4.7: Commit**

```
git add kitchen.js
git commit -m "refactor(kitchen): migrate Plan a meal footer + header to fs-* primitives"
```

---

## Task 5: Visual verification with Playwright at 412×915

**Files:** none modified — this is a verification step only.

**Why:** CLAUDE.md mandates Playwright at 412×915 (Samsung S26 Ultra) for any UI work. We need a screenshot to confirm the migrated form is visually identical to before.

- [ ] **Step 5.1: Confirm `node serve.js` is still running**

If it isn't, start it in a terminal: `node serve.js`. Wait for `Listening on http://localhost:8080`.

- [ ] **Step 5.2: Use Playwright to navigate, resize, and screenshot**

Run via the playwright MCP tool (or whatever Playwright tooling is available):

1. Navigate to `http://localhost:8080/?env=dev`.
2. **Resize to 412×915 first** — this is non-negotiable per CLAUDE.md.
3. Tap the "Plan dinner" tile on the dashboard (or the appropriate selector).
4. Wait for the sheet to open.
5. Take a viewport-only screenshot (`fullPage: false`) — important because the footer is a fixed/sticky element.

Expected screenshot:
- Header at top with "Plan a meal" + ✕ close icon
- Day + Slot rows
- Meal section
- **Sticky footer at the bottom** with Cancel (ghost) + Save (filled, may be disabled)
- Footer is at the bottom of the visible viewport, not the bottom of the (longer) scroll content

- [ ] **Step 5.3: Compare against pre-migration**

Optionally: check out `HEAD~3` (the commit before this migration), take the same screenshot, then check back out to `main`. The two screenshots should be visually identical. If they differ, the migration introduced a regression — diagnose before proceeding.

- [ ] **Step 5.4: Delete the screenshot files**

Per the user's saved feedback rule: "Delete all screenshot/image files immediately after analyzing them, never leave in repo." Run:
```
git status --porcelain | grep -E '\.(png|jpg|jpeg)$'
```
For each file listed, delete it. Then verify:
```
git status
```
Expected: no PNG/JPG files in working tree.

---

## Task 6: Bump SW cache

**Files:**
- Modify: `sw.js` — change `CACHE_NAME` constant

- [ ] **Step 6.1: Read current value**

Run:
```
Grep pattern: "CACHE_NAME = " in sw.js
```
Expected: `const CACHE_NAME = 'family-hub-v183';` at line 281.

- [ ] **Step 6.2: Bump to v184**

Edit `sw.js` line 281:
```
old: const CACHE_NAME = 'family-hub-v183';
new: const CACHE_NAME = 'family-hub-v184';
```

- [ ] **Step 6.3: Add a one-line note in the changelog block**

Read the changelog comment block near the top of `sw.js` (it explains why bumps happen). Add a one-liner at the appropriate place:
```
// v184 — feat(forms): introduce fs-footer + fs- shared primitives (DESIGN.md §5.23 v2)
```

If the file uses a different format for changelog entries, follow the existing format.

- [ ] **Step 6.4: Commit**

```
git add sw.js
git commit -m "chore(sw): bump cache to v184 for fs-* form primitives"
```

---

## Task 7: Update DESIGN.md primitives table

**Files:**
- Modify: `docs/DESIGN.md` — flip the two primitives in §5.23's "Shared primitives target" table from "TODO Phase 1" to "Shipped"

- [ ] **Step 7.1: Find the table**

Run:
```
Grep pattern: "renderFormFooter" in docs/DESIGN.md
```
Expected: returns a line in the §5.23 primitives table around line 781.

- [ ] **Step 7.2: Update the two rows**

Edit the table rows. Old:
```
| `renderFormFooter({ saveLabel, isEdit, disabled })` | Meal Plan `kp-footer` | TODO Phase 1 |
| `renderFormSheetHeader({ title, isEdit, hasSaveIcon, hasDeleteIcon })` | Event Form `sheet__header` | TODO Phase 1 |
```

New:
```
| `renderFormFooter({ saveLabel, cancelId, saveId, disabled })` | Meal Plan `kp-footer` | Shipped 2026-05-10 |
| `renderFormSheetHeader({ title, closeId, saveId?, deleteId? })` | Event Form `sheet__header` | Shipped 2026-05-10 |
```

(Note the signature update — the actual `renderFormFooter` signature in Task 2 uses `cancelId`/`saveId`, not `isEdit`. Bringing the table in line with the shipped function.)

- [ ] **Step 7.3: Add a §15 changelog row**

Find the §15 changelog table (search for `^| 2026-05-10`). The existing row is the §5.23 v2 reframe from earlier today. Append a new row immediately after:

```
| 2026-05-10 | §5.23 primitives table updated — `renderFormFooter` and `renderFormSheetHeader` shipped (Phase 1 PR A); first migration: Plan a meal sheet (kitchen.js `openPlanMealSheet`). | Phase 1 PR A of the form-system initiative. Validates the primitive API by replacing `kp-footer` with `fs-footer` on a form that already had a working sticky footer — visually identical output proves the helper is correct. Phase 1 PR B (DateInput + TimeInput) follows next. |
```

- [ ] **Step 7.4: Commit**

```
git add docs/DESIGN.md
git commit -m "docs: mark FormFooter+FormSheetHeader shipped in §5.23 primitives table"
```

---

## Task 8: Final verification

- [ ] **Step 8.1: Confirm git log shows all the expected commits**

Run:
```
git log --oneline -8
```

Expected (top to bottom, newest to oldest):
1. `docs: mark FormFooter+FormSheetHeader shipped in §5.23 primitives table`
2. `chore(sw): bump cache to v184 for fs-* form primitives`
3. `refactor(kitchen): migrate Plan a meal footer + header to fs-* primitives`
4. `feat(forms): add renderFormSheetHeader helper`
5. `feat(forms): add renderFormFooter helper (fs-footer)`
6. `feat(forms): add fs-footer CSS primitive (DESIGN.md §5.23 v2)`
7. … prior commits

If any commit is missing or out of order, that's a process failure — stop and reassess.

- [ ] **Step 8.2: Working tree is clean**

Run:
```
git status
```
Expected: `nothing to commit, working tree clean`. If not, untracked screenshots or stray edits — clean them up before reporting done.

- [ ] **Step 8.3: Smoke test the dev server one more time**

Reload `http://localhost:8080/?env=dev`. Open Plan a meal. Confirm:
- No console errors
- Header + footer render correctly
- Save / Cancel / ✕ all work
- Selecting a recipe enables Save

If anything is broken, the migration regressed something. Roll back the migration commit (`git revert HEAD~5..HEAD~3` — verify range carefully) and diagnose.

- [ ] **Step 8.4: Report done**

Surface to the user:
- All tasks completed
- 6 commits landed (5 feature/refactor/docs + 1 chore for SW bump)
- One smoke-test form migrated, visually identical
- Two new exported primitives ready for the next migrations
- Recommend Phase 1 PR B next: `renderDateInput()` (Meal Plan `kp-date-btn` anchor) — biggest UX lift for the next batch of forms (Task one-time date, Reward Expires, Event date)

---

## Out-of-scope reminder

Do NOT in this PR:
- Migrate any other form (Phase 3 is per-form, separate PRs)
- Add saving spinner JS helper (PR A.5 or B)
- Build any other primitive (PR B onwards)
- Rename `ef2-icon-btn` / `rf-header-actions` / `rf-save-btn` / `rf-delete-btn` to `fs-*` (Phase 3 if at all — DESIGN.md §5.23 v2 says existing per-form prefixes stay)
- Change DESIGN.md §5.23's actual rules (this is a Phase 1 PR; the spec is fixed)
- Touch `.kp-footer` / `.ef2-footer` etc. CSS rules (they remain valid for forms that haven't migrated yet)

If during execution the smoke-test migration looks like it *needs* one of these changes to work, stop and ask — there's likely a misunderstanding to fix in the plan rather than a scope expansion to make.
