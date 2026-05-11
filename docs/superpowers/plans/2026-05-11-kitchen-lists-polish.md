# Kitchen Lists Tab Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Testing note:** This codebase has no test runner. Manual Playwright verification at 412×915 mobile viewport per [CLAUDE.md](../../../CLAUDE.md).

**Goal:** Polish the Kitchen Lists tab — resolve the two `+` icon ambiguity, consolidate AI buttons into the existing AI Tools sheet, give "Add from staples" a permanent home, self-heal stuck categorization, hide noisy single-category headers, surface item count on the list-switcher row.

**Architecture:** All changes inside `kitchen.js` (`renderListsTab`, `renderItemsArea`, the AI Tools sheet from SP1, the existing `openManageListSheet`, a new `openListActionsMenu`) and `styles/kitchen.css` rule cleanups. No new Firebase schema; existing `categorizeItem` Worker handler used as-is by the new self-heal pass.

**Tech Stack:** Vanilla JS ES modules, Firebase compat SDK, no bundler.

**Spec:** [docs/superpowers/specs/2026-05-11-kitchen-lists-polish.md](../specs/2026-05-11-kitchen-lists-polish.md)

---

## File structure overview

| File | Responsibility | Touch |
|---|---|---|
| [kitchen.js](../../../kitchen.js) | Lists tab UI + overflow menu + AI Tools LISTS section + self-heal orchestrator + category visibility | Heavy edits |
| [styles/kitchen.css](../../../styles/kitchen.css) | New chip styles + remove dead `.list-toolbar` / `.list-wand-btn` / `.list-camera-btn` | Replacements + deletions |
| [sw.js](../../../sw.js) | Cache version bump | Single line |

Scope: ~250-350 lines of new code, ~100 lines of deletions / replacements.

---

## Task 0: Pre-flight

- [ ] **Create branch off main**

```bash
git checkout main
git pull origin main
git checkout -b feat/kitchen-lists-polish
```

No commit. Dev server should already be running on port 8080.

---

## Task 1: List-switcher header — drop `+`, add "N left" chip

Per spec §1: remove the header `+` button (its job moves to the overflow menu in Task 2) and add an inline `· N left` chip that shows the active (unchecked) item count for the current list.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderListsTab` switcher row markup

### Step 1: Locate the list-switcher row HTML

In `kitchen.js`, find `renderListsTab` (around `kitchen.js:2496+`). The switcher row currently renders the list icon + name, then a `+` icon-button (for "+ New list"), then a `⋮` overflow button. Identify the `+` button — likely has an id like `newListBtn` or similar.

### Step 2: Remove the `+` icon-button

DELETE the `<button>` element for the `+` icon and its associated event binding. Keep the `⋮` overflow button.

### Step 3: Add the `· N left` chip next to the list name

Compute the count from `currentItems` state (the items snapshot the listener provides). Active count = items whose `checked` is falsy.

```js
const activeCount = Object.values(currentItems || {}).filter(it => !it.checked).length;
const completedCount = Object.values(currentItems || {}).filter(it => it.checked).length;
const totalCount = activeCount + completedCount;
const countChip = (() => {
  if (totalCount === 0) return '';                              // truly empty list → no chip
  if (activeCount === 0) return '<span class="list-switcher__count list-switcher__count--clear">· clear ✓</span>';
  return `<span class="list-switcher__count">· ${activeCount} left</span>`;
})();
```

Insert `${countChip}` right after the list name span inside the switcher row HTML.

### Step 4: Re-render the chip on item changes

The chip count depends on `currentItems`. The existing `subscribeListItems` calls `renderItemsArea(items)` on Firebase updates. Update the subscription handler to also refresh the switcher chip — or simpler, call `renderListsTab()` from the subscription callback so the whole list re-renders consistently.

Inspect the existing pattern in `subscribeListItems` and choose whichever fits the codebase rhythm (likely just call `renderListsTab()` since that's how every other change reflects). If `renderListsTab()` is too heavy because it tears down the items area you want stable, isolate the chip update with a small `updateListSwitcherCount(activeCount, totalCount)` helper that surgically updates the chip DOM.

### Step 5: Add CSS

Append to `styles/kitchen.css`:
```css
.list-switcher__count {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
  margin-left: 4px;
  white-space: nowrap;
}
.list-switcher__count--clear {
  color: var(--accent-ink);
}
```

### Step 6: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(lists): drop header + button, add '· N left' count chip

Header + (which created lists) moves to the overflow menu in the next
commit, eliminating the two-+-icon ambiguity. The switcher row gains an
inline '· N left' count chip showing the active (unchecked) item count.
When everything is checked the chip flips to '· clear ✓' in accent-ink.
"
```

---

## Task 2: Overflow menu rebuild — `openListActionsMenu`

Per spec §2: the `⋮` button now opens a bottom sheet with 6 actions in order: `+ New list`, `Add from staples`, `Rename / change icon`, `Copy as text`, `Clear checked items`, `Delete list` (visually separated as a danger action).

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderListsTab` `⋮` click handler + new function `openListActionsMenu`

### Step 1: Add the `openListActionsMenu` function

Insert near other sheet-opener functions (e.g., after `openManageListSheet` or `openCreateListSheet`):
```js
function openListActionsMenu() {
  if (!activeListId || !lists[activeListId]) return;
  const list = lists[activeListId];
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: `${list.name} actions`, closeId: 'lam_close' })}
    <div class="lam-actions">
      <button class="lam-action" id="lam_newList" type="button">+ New list</button>
      <button class="lam-action" id="lam_staples" type="button">Add from staples</button>
      <button class="lam-action" id="lam_rename" type="button">Rename / change icon</button>
      <button class="lam-action" id="lam_copy" type="button">Copy as text</button>
      <button class="lam-action" id="lam_clear" type="button">Clear checked items</button>
      <div class="lam-divider"></div>
      <button class="lam-action lam-action--danger" id="lam_delete" type="button">Delete list</button>
    </div>
  `);
  activateSheet(mount);

  document.getElementById('lam_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  document.getElementById('lam_newList')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openCreateListSheet();
  });
  document.getElementById('lam_staples')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openStaplesSheet();
  });
  document.getElementById('lam_rename')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openManageListSheet();
  });
  document.getElementById('lam_copy')?.addEventListener('click', () => {
    mount.innerHTML = '';
    copyListAsText();
  });
  document.getElementById('lam_clear')?.addEventListener('click', async () => {
    mount.innerHTML = '';
    const confirmed = await showConfirm({ title: 'Remove all checked items?', confirmLabel: 'Clear' });
    if (!confirmed) return;
    const checkedCards = document.querySelectorAll('.card--shopping.is-checked');
    for (const card of checkedCards) {
      await removeKitchenItem(activeListId, card.dataset.itemId);
    }
  });
  document.getElementById('lam_delete')?.addEventListener('click', async () => {
    mount.innerHTML = '';
    const itemCount = Object.keys(currentItems || {}).length;
    const msg = itemCount > 0
      ? `Delete "${list.name}"? It has ${itemCount} item${itemCount !== 1 ? 's' : ''}.`
      : `Delete "${list.name}"?`;
    const confirmed = await showConfirm({ title: msg, confirmLabel: 'Delete', danger: true });
    if (!confirmed) return;
    await removeKitchenList(activeListId);
    delete lists[activeListId];
    activeListId = Object.keys(lists)[0] || null;
    if (activeListId) localStorage.setItem('dr-kitchen-active-list', activeListId);
    else localStorage.removeItem('dr-kitchen-active-list');
    renderListsTab();
  });
}
```

### Step 2: Wire `⋮` to `openListActionsMenu`

Find the existing `⋮` event binding in `renderListsTab` (around `kitchen.js:2515-2560`). Change its handler from `openManageListSheet` to `openListActionsMenu`.

### Step 3: Simplify the Edit-list sheet (now reachable only via `Rename / change icon`)

Find `openManageListSheet` (around `kitchen.js:1858+`). It currently includes a chip row at the bottom with `Copy list` and `Clear checked` buttons. **Delete that chip row** — those actions live in the new overflow menu now. The Edit-list sheet stays focused on name + icon + color editing.

Specifically, delete the block that looks like:
```js
<div class="me-detail__chips">
  <button class="chip" id="km_copyBtn" type="button">Copy list</button>
  <button class="chip" id="km_clearBtn" type="button">Clear checked</button>
</div>
```

And the associated event bindings for `km_copyBtn` and `km_clearBtn`.

### Step 4: Add CSS for the action menu

Append to `styles/kitchen.css`:
```css
.lam-actions {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-sm) 0;
}
.lam-action {
  display: block;
  width: 100%;
  text-align: left;
  padding: 14px var(--spacing-md);
  background: transparent;
  border: none;
  color: var(--text);
  font-size: var(--font-md);
  cursor: pointer;
}
.lam-action:hover,
.lam-action:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.lam-action--danger {
  color: var(--danger);
}
.lam-divider {
  height: 1px;
  background: var(--border);
  margin: var(--spacing-sm) 0;
}
```

### Step 5: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(lists): overflow menu replaces edit-sheet shortcuts

The list-switcher ⋮ button now opens a bottom-sheet action menu with
six actions: + New list, Add from staples, Rename / change icon, Copy
as text, Clear checked items, and Delete list (visually separated as
the danger action). The Edit-list sheet drops its Copy/Clear chip row —
those actions moved to the overflow.
"
```

### Step 6: Verify

Reload Kitchen → Lists. Tap `⋮` → action menu opens with all six items. Tap each:
- `+ New list` → Create-list sheet
- `Add from staples` → Staples sheet
- `Rename / change icon` → Edit-list sheet (now without Copy/Clear chips at the bottom)
- `Copy as text` → text copied (toast)
- `Clear checked items` → confirm prompt → clears (or cancels)
- `Delete list` → confirm prompt → deletes (or cancels)

---

## Task 3: AI Tools sheet — wire LISTS section

Per spec §4: the AI Tools sheet (built in SP1, extended with RECIPES in SP2) gains a LISTS section with two buttons: `Auto-categorize current list` and `Photo → list`.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `openKitchenAiToolsSheet`

### Step 1: Add the LISTS section markup

In `openKitchenAiToolsSheet` (added in SP1 Task 8, extended SP2 Task 4), find the RECIPES section block. Insert a new `kait-section` for LISTS AFTER the RECIPES section:
```js
<div class="kait-section">
  <div class="kait-section__label">LISTS</div>
  <div class="kait-grid">
    <button class="btn btn--secondary" id="kait_listClean" type="button"${!activeListId ? ' disabled' : ''}>🪄 Auto-categorize</button>
    <button class="btn btn--secondary" id="kait_listPhoto" type="button"${!activeListId ? ' disabled' : ''}>📷 Photo → list</button>
  </div>
  ${!activeListId ? `<div class="kait-hint">Create a list first.</div>` : ''}
</div>
```

### Step 2: Wire the buttons

After the existing school-lunch and recipes button bindings in `openKitchenAiToolsSheet`, add:
```js
document.getElementById('kait_listClean')?.addEventListener('click', () => {
  if (!activeListId) return;
  mount.innerHTML = '';
  runListCleanup(currentItems);
});
document.getElementById('kait_listPhoto')?.addEventListener('click', () => {
  if (!activeListId) return;
  mount.innerHTML = '';
  openListPhotoSourceSheet();
});
```

### Step 3: Add CSS for the disabled-state hint

Append to `styles/kitchen.css`:
```css
.kait-hint {
  font-size: var(--font-xs);
  color: var(--text-faint);
  font-style: italic;
  margin-top: var(--spacing-xs);
}
```

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(lists): AI Tools sheet LISTS section wired

LISTS section added to the AI Tools sheet (SP1) with two buttons:
Auto-categorize current list → runListCleanup, and Photo → list →
openListPhotoSourceSheet. Both buttons disable when no list is active,
showing a 'Create a list first' hint.
"
```

### Step 5: Verify

Reload Kitchen → tap wand → AI Tools sheet. Scroll to LISTS section. Two buttons. Tap `Auto-categorize` → runs the existing wand cleanup. Tap `Photo → list` → opens the existing photo-source picker.

---

## Task 4: Drop inline wand + camera icons from items area

Per spec §4: the two inline icon-buttons (`list-wand-btn`, `list-camera-btn`) and their wrapping `.list-toolbar` row are removed. The AI Tools sheet from Task 3 is now the only entry point.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderItemsArea` or wherever the toolbar is rendered
- Modify: [styles/kitchen.css](../../../styles/kitchen.css) — remove `.list-toolbar`, `.list-wand-btn`, `.list-camera-btn`, `.list-icon-group` rules

### Step 1: Find and delete the toolbar row HTML

Grep for `list-wand-btn` and `list-camera-btn` in `kitchen.js`. Find the toolbar block — likely in `renderItemsArea` or a similar render path. Delete the entire `<div class="list-toolbar">...</div>` block including its contained `<button class="list-wand-btn">` and `<button class="list-camera-btn">` elements.

Also delete the event listeners for `listCleanupBtn` and the camera-button id (if any).

### Step 2: Delete the related CSS

In `styles/kitchen.css`, delete:
```css
.list-toolbar { ... }
.list-icon-group { ... }
.list-wand-btn,
.list-camera-btn { ... }
.list-wand-btn:hover,
.list-camera-btn:hover { ... }
.list-wand-btn:focus-visible,
.list-camera-btn:focus-visible { ... }
.list-wand-btn:disabled,
.list-camera-btn:disabled { ... }
.list-wand-btn.is-loading { ... }
@keyframes list-wand-pulse { ... }
```

(All visible in [styles/kitchen.css:238-281](../../../styles/kitchen.css#L238-L281).)

### Step 3: Verify functions are still reachable

After deletion, confirm:
- `runListCleanup` is still defined and called from `kait_listClean` handler in Task 3 — yes.
- `openListPhotoSourceSheet` is still defined and called from `kait_listPhoto` handler in Task 3 — yes.

Nothing is unreferenced or orphaned.

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "refactor(lists): remove inline wand + camera AI icons

The wand-cleanup and photo-import icons that floated above each list
are gone — replaced by the AI Tools sheet LISTS section (previous
commit). The .list-toolbar / .list-wand-btn / .list-camera-btn CSS
rules are deleted entirely. runListCleanup and openListPhotoSourceSheet
functions stay; only their inline entry points are removed.
"
```

### Step 5: Verify

Reload Kitchen → Lists. The toolbar row above the items area is gone. The list shows directly under the switcher row. AI features still work via the wand on the tabs row.

---

## Task 5: Empty-state CTA — "Add from staples"

Per spec §3: when the active list has zero items (active + completed), the items area renders a directive empty state: `Your list is empty.` + `+ Add from staples` chip + `Or tap the + to add an item.` helper.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderItemsArea`

### Step 1: Update the empty-state render

In `renderItemsArea`, find the existing empty-state path (likely uses `renderEmptyState` with a generic message). Replace with:
```js
if (totalItems === 0) {
  const staplesCount = Object.keys(staples || {}).length;
  const cta = staplesCount > 0
    ? `<button class="btn btn--primary btn--sm" id="emptyAddFromStaples" type="button">+ Add from staples</button>`
    : `<a class="lam-empty-link" id="emptyOpenStaples" href="#" role="button">Save your basics as staples first</a>`;
  itemsContainer.innerHTML = `
    <div class="list-empty">
      <div class="list-empty__title">Your list is empty.</div>
      <div class="list-empty__cta">${cta}</div>
      <div class="list-empty__hint">Or tap the <strong>+</strong> to add an item.</div>
    </div>`;
  // Bind whichever CTA rendered
  document.getElementById('emptyAddFromStaples')?.addEventListener('click', () => openStaplesSheet());
  document.getElementById('emptyOpenStaples')?.addEventListener('click', (e) => { e.preventDefault(); openStaplesSheet(); });
  return;
}
```

(The variable `totalItems` may need computing — `Object.keys(items || {}).length` works if `items` is the function parameter. Adapt to the actual local variable names.)

### Step 2: Add CSS

Append to `styles/kitchen.css`:
```css
.list-empty {
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-md);
}
.list-empty__title {
  font-size: var(--font-md);
  color: var(--text-muted);
  margin-bottom: var(--spacing-md);
}
.list-empty__cta {
  margin-bottom: var(--spacing-sm);
}
.list-empty__hint {
  font-size: var(--font-sm);
  color: var(--text-faint);
}
.lam-empty-link {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
}
```

### Step 3: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(lists): directive empty state with 'Add from staples' CTA

When the active list has zero items, render 'Your list is empty.' plus
a prominent '+ Add from staples' button and a 'Or tap the + to add an
item.' helper. When no staples are saved, swap the chip for a 'Save
your basics as staples first' link that opens the staples sheet
directly.
"
```

### Step 4: Verify

Open a list, clear all items (via overflow → Clear checked, plus delete the lone active one). Items area shows the new empty state with the CTA button. Tap it → Staples sheet opens.

---

## Task 6: Self-healing categorization on list load

Per spec §5: on every `renderItemsArea` call, identify items whose `category` is null/empty/`'OTHER'` and queue them through `categorizeItem`. Debounced one pass per 60s per `activeListId`, capped at 10 items per pass, silent.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — new `healUncategorizedItems` function + call from `renderItemsArea`

### Step 1: Add `healUncategorizedItems` function

Insert near the existing AI helper functions (`categorizeItem`, `cleanListAi`, `runListCleanup`):
```js
const _healPassLog = new Map(); // listId → lastPassTimestamp

async function healUncategorizedItems(listId, items) {
  if (!listId || !items) return;
  const now = Date.now();
  const last = _healPassLog.get(listId) || 0;
  if (now - last < 60_000) return; // debounce: max one pass per minute per list
  _healPassLog.set(listId, now);

  // Find items that need re-categorization. Skip checked items (don't waste
  // Worker calls on completed groceries).
  const candidates = Object.entries(items)
    .filter(([, it]) => it && it.name && !it.checked)
    .filter(([, it]) => !it.category || it.category === '' || it.category === 'OTHER' || it.category === 'Other')
    .slice(0, 10);

  if (candidates.length === 0) return;

  for (const [itemId, item] of candidates) {
    // categorizeItem already silently writes to Firebase; no toast/UI noise.
    await categorizeItem(listId, itemId, item.name).catch(() => { /* keep current category */ });
  }
}
```

### Step 2: Call from `renderItemsArea`

In `renderItemsArea`, after the existing render logic and before returning, add a fire-and-forget call:
```js
// Fire-and-forget. Categorize uncategorized items in the background; render
// updates naturally when Firebase pushes the new category values.
healUncategorizedItems(activeListId, items).catch(err => console.warn('heal pass failed', err));
```

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "feat(lists): self-heal uncategorized items on list load

renderItemsArea queues items with null/empty/'OTHER' category through
categorizeItem in the background. Debounced to one pass per 60s per
listId; capped at 10 items per pass; checked items skipped. Quiet — no
spinner or toast. Items naturally update on subsequent Firebase pushes.
"
```

### Step 4: Verify

1. Add an item with a category-AI failure mode (the actual heal trigger). Hard to force manually, but can verify by:
2. In dev mode (`?env=dev`), manually edit a Firebase item to clear its category field.
3. Reload Kitchen → wait ~2 seconds → the item's category updates.
4. Check Worker logs / browser network panel: a `categorizeItem` call fired in background.

---

## Task 7: Category-header visibility rule

Per spec §6: a category header renders only when the category has ≥ 1 visible item AND either there are 2+ distinct visible categories OR the single category is not `'OTHER'`.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderItemsArea` category grouping

### Step 1: Find the category-header render loop

In `renderItemsArea`, the items are grouped by category and each group renders a header. Find the grouping code (likely uses `Object.entries(groups)` or a `for (const cat of categories)` loop). Identify where the header HTML is emitted.

### Step 2: Apply the visibility rule

Before the category-header loop, compute the set of distinct visible categories:
```js
const distinctCats = new Set(
  Object.values(items)
    .filter(it => it && it.name && !it.checked)
    .map(it => it.category || 'OTHER')
);
const multipleCategories = distinctCats.size >= 2;
```

When rendering each category's group, only emit the header if:
```js
const shouldShowHeader = multipleCategories || cat !== 'OTHER';
const headerHtml = shouldShowHeader
  ? `<div class="list-category-header">${esc(cat.toUpperCase())}</div>`
  : '';
```

(Replace `.list-category-header` with whatever class the existing code uses.)

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "feat(lists): hide noise category headers

A category header renders only when (a) the category has visible items
AND (b) either there are multiple distinct visible categories or the
single category is not 'OTHER'. Single 'milk' under 'OTHER' no longer
shows the uppercase OTHER label dominating the empty list look; lists
with two categories still show both headers.
"
```

### Step 4: Verify

Open a list with one uncategorized item (or temporarily edit one to category=null). The OTHER header is hidden — just the item shows. Add a second item with a real category — both headers reappear.

---

## Task 8: SW cache bump + smoke test

**Files:**
- Modify: [sw.js](../../../sw.js) — bump CACHE_NAME

### Step 1: Bump cache version

In `sw.js`, find `CACHE_NAME` and increment to the next value. Add a one-line comment in the CACHE_BUMPS section describing the SP3 work.

### Step 2: Visual smoke test at 412×915 (controller does Playwright)

Subagents skip this step. Controller verifies:
- List-switcher row: no `+` icon next to list name; `· N left` chip visible.
- `⋮` opens action menu with 6 items in correct order; danger button visually separated.
- Wand + camera icons gone from items area.
- AI Tools sheet LISTS section shows two buttons (Auto-categorize, Photo → list).
- Empty list state shows `Your list is empty.` + `+ Add from staples` chip + helper.
- Category headers hidden for single-OTHER-category lists; visible when 2+ categories.
- No regressions on Meals or Recipes tabs.

### Step 3: Commit

```bash
git add sw.js
git commit -m "chore(sw): bump cache for kitchen Lists tab polish"
```

### Step 4: Hand off to finishing-a-development-branch

Controller invokes `superpowers:finishing-a-development-branch` and chooses Option 1 (merge to main locally + push).

---

## Acceptance criteria mapping

Spec §8:

| Spec criterion | Task |
|---|---|
| 1. List-switcher: icon + name + `· N left` + `⋮`; no `+` button | Task 1 |
| 2. `· N left` chip reflects active count; `· clear ✓` when 0 active + items present; hidden when empty | Task 1 |
| 3. Overflow `⋮` opens sheet with six options in order | Task 2 |
| 4. Empty-list state: `Your list is empty.` + `+ Add from staples` + helper | Task 5 |
| 5. Empty state swaps to `Save your basics as staples first` when no staples exist | Task 5 |
| 6. AI Tools sheet LISTS section with two wired buttons | Task 3 |
| 7. LISTS buttons disabled when no list exists; hint renders | Task 3 |
| 8. Inline `.list-toolbar` row removed | Task 4 |
| 9. Self-heal on `renderItemsArea`: 60s debounce, 10-item cap, silent | Task 6 |
| 10. Category headers render per the visibility rule | Task 7 |
| 11. Edit-list sheet bottom chip row emptied | Task 2 (within rename refactor) |
| 12. SW cache bumped | Task 8 |
| 13. No regressions on Meals / Recipes at 412×915 | Task 8 |

All 13 covered.

---

## Self-review notes

- **Placeholder scan:** every step has code or commands.
- **Type/name consistency:** `openListActionsMenu`, `healUncategorizedItems`, `_healPassLog` referenced consistently; `currentItems` / `items` / `activeListId` / `staples` / `lists` are pre-existing globals.
- **Spec coverage:** all 13 ACs mapped above.
- **Test gate adaptation:** no test runner; manual Playwright check at 412×915 per task.
