# 1.3 Meal Planning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement meal planning — a library of reusable family meals assigned to day/slot pairs — wired into the dashboard ambient strip, calendar day view, admin, and kid mode.

**Architecture:** Two concepts kept separate: `mealLibrary` (meal definitions with ingredients, recipe URL, tags, prep time) and `meals/{date}/{slot}` (day assignments that reference library entries by ID). Three bottom sheet flows — Plan, Detail, Editor — all built as pure HTML render functions in `shared/components.js` with event-binding logic in the calling page. Dashboard reads meals via one-shot `readOnce` per viewDate change; calendar reads the full `meals/` tree once at load.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database (compat SDK, `firebase.` global), hand-written CSS with design tokens, no bundler.

---

## File Map

| File | Change |
|---|---|
| `shared/firebase.js` | Add 8 meal CRUD helpers |
| `shared/components.js` | Add `renderMealEditorSheet`, `renderMealPlanSheet`, `renderMealDetailSheet`; add `renderMealCard` helper |
| `styles/components.css` | Add `.card--meal` and `.card--meal--school` styles |
| `dashboard.js` | Load meal library + viewDate meals; wire dinner chip handlers; add FAB menu item |
| `shared/calendar-views.js` | Add meals section to `renderDayView`; accept new `dayMeals`/`mealLibrary` params |
| `calendar.html` | Import new Firebase helpers; load `allMeals` + `mealLibrary`; pass to `renderDayView`; bind meal sheet events |
| `admin.html` | Add `meals` tab to TABS array; add meals library panel; add `ambientStrip` setting; add per-kid `showMeals` toggle |
| `kid.html` | Import meal helpers; load dinner for today; render Tonight tile; gate on `prefs.showMeals` |
| `sw.js` | Bump CACHE_NAME from v63 → v64 |

---

## Task 1: Firebase helpers

**Files:**
- Modify: `shared/firebase.js` (after the existing typed helpers, around line 200)

- [ ] **Step 1: Add the 8 meal helpers**

Open `shared/firebase.js`. At the end of the file, add:

```js
// ── Meal helpers ──

/** Read all meal slot assignments for one date (e.g. { dinner: { mealId, source } }). */
export async function readMeals(dateKey) {
  return readOnce(`meals/${dateKey}`);
}

/** Read the entire meals/ tree (all dates). Used by calendar for one-shot load. */
export async function readAllMeals() {
  return readOnce('meals');
}

/** Assign a meal to a day/slot. slot: 'breakfast'|'lunch'|'dinner'|'snack' */
export async function writeMeal(dateKey, slot, data) {
  return writeData(`meals/${dateKey}/${slot}`, data);
}

/** Remove a meal assignment from a day/slot. */
export async function removeMeal(dateKey, slot) {
  return removeData(`meals/${dateKey}/${slot}`);
}

/** Read the full meal library. Returns null when empty. */
export async function readMealLibrary() {
  return readOnce('mealLibrary');
}

/**
 * Add a new meal to the library. Returns the generated push key.
 * data: { name, ingredients, url?, notes?, prepTime?, isFavorite, tags, createdAt, lastUsed }
 */
export async function pushMealLibrary(data) {
  return pushData('mealLibrary', data);
}

/** Full-replace update for an existing meal library entry. */
export async function writeMealLibrary(mealId, data) {
  return writeData(`mealLibrary/${mealId}`, data);
}

/** Remove a meal library entry. Caller is responsible for cascade-removing plan references. */
export async function removeMealLibrary(mealId) {
  return removeData(`mealLibrary/${mealId}`);
}
```

- [ ] **Step 2: Verify imports compile**

Open `index.html` in a browser. Open DevTools console. No import errors should appear. The app should load normally.

- [ ] **Step 3: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(meals): add Firebase CRUD helpers for mealLibrary and meals schedule"
```

---

## Task 2: CSS — card--meal styles

**Files:**
- Modify: `styles/components.css` (add at the end)

- [ ] **Step 1: Add card--meal and card--meal--school styles**

Open `styles/components.css`. At the end of the file, add:

```css
/* ── Meal cards (calendar day view) ── */
.card--meal {
  background: var(--surface-2);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 48px;
  cursor: pointer;
  transition: background var(--t-fast);
  border: none;
  width: 100%;
  text-align: left;
}
.card--meal:hover,
.card--meal:focus-visible {
  background: var(--surface);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.card--meal__name {
  flex: 1;
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--text);
}
.card--meal__slot {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  flex-shrink: 0;
}
.card--meal__school-icon {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
  flex-shrink: 0;
}
.card--meal__school-icon svg {
  width: 16px;
  height: 16px;
}

/* School-sourced entries: read-only, muted */
.card--meal--school {
  opacity: 0.65;
  pointer-events: none;
  cursor: default;
}

/* Meal chip in the plan sheet picker */
.meal-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-full);
  padding: 6px var(--spacing-md);
  font-size: var(--font-sm);
  color: var(--text);
  cursor: pointer;
  transition: background var(--t-fast), border-color var(--t-fast);
  white-space: nowrap;
}
.meal-chip:hover,
.meal-chip:focus-visible {
  background: var(--accent-soft);
  border-color: var(--accent);
  outline: none;
}
.meal-chip--selected {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.meal-chip__star {
  color: var(--warning);
  font-size: 12px;
}

/* Ingredient rows in meal editor */
.me-ingredient-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}
.me-ingredient-row input {
  flex: 1;
  min-height: 40px;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  background: var(--surface);
  color: var(--text);
}
.me-ingredient-row input:focus {
  outline: none;
  border-color: var(--accent);
}
.me-ingredient-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  font-size: 18px;
  line-height: 1;
  border-radius: var(--radius-sm);
  min-width: 28px;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.me-ingredient-remove:hover { color: var(--danger); }

/* Tag chips in editor */
.me-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}
.me-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  border-radius: var(--radius-full);
  padding: 4px var(--spacing-sm);
  font-size: var(--font-xs);
  font-weight: 500;
}
.me-tag__remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent-ink);
  padding: 0;
  font-size: 14px;
  line-height: 1;
  opacity: 0.7;
}
.me-tag__remove:hover { opacity: 1; }

/* Meal detail sheet */
.me-detail__header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}
.me-detail__name {
  font-size: var(--font-xl);
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.me-detail__prep {
  font-size: var(--font-sm);
  color: var(--text-muted);
  white-space: nowrap;
}
.me-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}
.me-detail__tag {
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: var(--surface-2);
  border-radius: var(--radius-full);
  padding: 4px var(--spacing-sm);
}
.me-detail__ingredients {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--spacing-md) 0;
}
.me-detail__ingredients li {
  padding: var(--spacing-xs) 0;
  font-size: var(--font-sm);
  color: var(--text);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.me-detail__ingredients li::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
.me-detail__actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border);
}
.me-detail__school-note {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-style: italic;
}

/* Tonight tile in kid mode */
.kid-tonight {
  background: var(--surface);
  border-radius: var(--radius-xl);
  padding: var(--spacing-md);
  margin: var(--spacing-md) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  cursor: pointer;
  border: 1.5px solid var(--border);
  width: 100%;
  text-align: left;
  min-height: 56px;
}
.kid-tonight__label {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  display: block;
}
.kid-tonight__name {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text);
}
.kid-tonight__icon {
  font-size: 28px;
  flex-shrink: 0;
}

/* Plan sheet results area */
.mp-results {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
  min-height: 44px;
}
.mp-results-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  width: 100%;
  margin-bottom: 4px;
}
.mp-create-btn {
  width: 100%;
  margin-top: var(--spacing-sm);
  text-align: left;
  color: var(--accent);
  font-size: var(--font-sm);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}
.mp-remove-link {
  font-size: var(--font-sm);
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--spacing-xs) 0;
  text-decoration: underline;
  display: block;
  margin-top: var(--spacing-sm);
}
.mp-inline-editor {
  border-top: 1px solid var(--border);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
}
```

- [ ] **Step 2: Verify no CSS syntax errors**

Open `index.html` in a browser. Check DevTools for CSS parse errors in the console. Page should load normally.

- [ ] **Step 3: Commit**

```bash
git add styles/components.css
git commit -m "feat(meals): add CSS for meal cards, plan sheet, editor, detail, kid tonight tile"
```

---

## Task 3: Meal Editor Sheet component

**Files:**
- Modify: `shared/components.js` (add after the existing sheet render functions, near end of file)

- [ ] **Step 1: Add `renderMealEditorSheet` to shared/components.js**

Add the following export function. It returns an HTML string for use inside `renderBottomSheet(...)`. The `meal` param is `null` for create mode, or an existing library entry object for edit mode. `mealId` is `null` for create.

```js
/**
 * Render the meal editor sheet body (create or edit a meal library entry).
 * meal: null (create) or { name, ingredients, url, notes, prepTime, isFavorite, tags }
 * mealId: null (create) or existing library key
 * Returns HTML string; mount inside renderBottomSheet() then bind #meForm events in the page.
 *
 * Events the page must bind after mounting:
 *   #meForm submit           → save
 *   #me_addIngredient click  → add ingredient row
 *   .me-ingredient-remove    → remove ingredient row (delegate on #me_ingredients)
 *   #me_tagInput keydown     → Enter/comma adds a tag
 *   .me-tag__remove          → remove tag (delegate on #me_tags)
 *   #meDelete click          → delete (edit mode only)
 */
export function renderMealEditorSheet(meal = null, mealId = null) {
  const isEdit = meal !== null;
  const name      = isEdit ? esc(meal.name || '') : '';
  const prepTime  = isEdit ? esc(meal.prepTime || '') : '';
  const url       = isEdit ? esc(meal.url || '') : '';
  const notes     = isEdit ? esc(meal.notes || '') : '';
  const isFav     = isEdit && meal.isFavorite;
  const tags      = isEdit ? (meal.tags || []) : [];
  const ingr      = isEdit ? (meal.ingredients || []) : [];

  const tagChips = tags.map((t, i) =>
    `<span class="me-tag" data-tag-index="${i}">
      ${esc(t)}
      <button class="me-tag__remove" data-tag-index="${i}" type="button" aria-label="Remove tag ${esc(t)}">&times;</button>
    </span>`
  ).join('');

  const ingrRows = ingr.map((item, i) =>
    `<div class="me-ingredient-row" data-ingr-index="${i}">
      <input type="text" value="${esc(item)}" placeholder="e.g. 2 lbs ground beef"
             data-ingr-index="${i}" aria-label="Ingredient ${i + 1}">
      <button class="me-ingredient-remove" data-ingr-index="${i}" type="button" aria-label="Remove ingredient">&times;</button>
    </div>`
  ).join('');

  const deleteBtn = isEdit
    ? `<button class="btn btn--ghost" id="meDelete" type="button"
               style="color:var(--danger);margin-top:var(--spacing-sm)">Delete meal</button>`
    : '';

  return `<form class="task-detail-sheet" id="meForm" novalidate>
    <h3 class="admin-form__title">${isEdit ? 'Edit meal' : 'New meal'}</h3>

    <label class="field">
      <span class="field__label">Name <span aria-hidden="true" style="color:var(--danger)">*</span></span>
      <input class="field__input" id="me_name" type="text" value="${name}"
             placeholder="e.g. Taco Tuesday" autocomplete="off" required>
      <span class="field__error" id="me_nameError" role="alert"></span>
    </label>

    <div style="display:flex;align-items:center;gap:var(--spacing-md);margin-bottom:var(--spacing-md)">
      <label class="form-label" for="me_fav" style="margin:0;cursor:pointer">Favorite</label>
      <input type="checkbox" id="me_fav" ${isFav ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)">
    </div>

    <label class="field">
      <span class="field__label">Prep time</span>
      <input class="field__input" id="me_prepTime" type="text" value="${prepTime}"
             placeholder="e.g. 30 min">
    </label>

    <div class="field">
      <span class="field__label">Tags</span>
      <div class="me-tag-row" id="me_tags">${tagChips}</div>
      <input class="field__input" id="me_tagInput" type="text"
             placeholder="Type a tag and press Enter" autocomplete="off">
    </div>

    <div class="field">
      <span class="field__label">Ingredients</span>
      <div id="me_ingredients">${ingrRows}</div>
      <button class="btn btn--ghost btn--sm" id="me_addIngredient" type="button"
              style="margin-top:var(--spacing-xs)">+ Add ingredient</button>
    </div>

    <label class="field">
      <span class="field__label">Recipe link</span>
      <input class="field__input" id="me_url" type="url" value="${url}"
             placeholder="https://…">
    </label>

    <label class="field">
      <span class="field__label">Notes</span>
      <textarea class="field__input" id="me_notes"
                placeholder="Any notes…" rows="3">${notes}</textarea>
    </label>

    ${deleteBtn}
    <input type="hidden" id="me_mealId" value="${mealId || ''}">
  </form>`;
}
```

- [ ] **Step 2: Verify the component exports without error**

In browser DevTools console (with index.html open), run:
```js
import('./shared/components.js').then(m => console.log(typeof m.renderMealEditorSheet));
```
Expected output: `"function"`

- [ ] **Step 3: Commit**

```bash
git add shared/components.js
git commit -m "feat(meals): add renderMealEditorSheet component"
```

---

## Task 4: Meal Plan Sheet component

**Files:**
- Modify: `shared/components.js`

- [ ] **Step 1: Add `renderMealPlanSheet` to shared/components.js**

Add after `renderMealEditorSheet`:

```js
/**
 * Render the meal plan sheet body (assign a meal to a day/slot).
 *
 * opts:
 *   date: string 'YYYY-MM-DD' — pre-selected date
 *   slot: 'breakfast'|'lunch'|'dinner'|'snack' — pre-selected slot
 *   library: object { [mealId]: mealObj } — full meal library
 *   currentMealId: string|null — currently assigned meal for this slot (for remove link)
 *
 * Events the page must bind after mounting:
 *   #mpForm submit                    → save selected meal
 *   .mp-slot-tab click                → switch active slot (delegate on #mp_slotTabs)
 *   #mp_search input                  → filter library chips
 *   .meal-chip[data-meal-id] click    → select a meal
 *   #mp_createNew click               → open inline editor (hide results, show #mp_inlineEditor)
 *   #mp_removeLink click              → remove existing assignment
 *   #mp_inlineBack click              → back to picker from inline editor
 */
export function renderMealPlanSheet({ date, slot = 'dinner', library = {}, currentMealId = null } = {}) {
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const slotTabs = SLOTS.map(s =>
    `<button class="tab${s === slot ? ' is-active' : ''} mp-slot-tab"
             data-slot="${s}" type="button" role="tab"
             aria-selected="${s === slot}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`
  ).join('');

  // Sort library: favorites first, then by lastUsed desc
  const entries = Object.entries(library).sort(([, a], [, b]) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    const ta = a.lastUsed || 0;
    const tb = b.lastUsed || 0;
    return tb - ta;
  });

  const chips = entries.map(([id, m]) =>
    `<button class="meal-chip${id === currentMealId ? ' meal-chip--selected' : ''}"
             data-meal-id="${id}" type="button">
      ${m.isFavorite ? '<span class="meal-chip__star" aria-hidden="true">★</span>' : ''}
      ${esc(m.name)}
    </button>`
  ).join('');

  const removeLinkHtml = currentMealId && library[currentMealId]
    ? `<button class="mp-remove-link" id="mp_removeLink" type="button">
         Remove "${esc(library[currentMealId].name)}" from this slot
       </button>`
    : '';

  return `<form class="task-detail-sheet" id="mpForm" novalidate>
    <h3 class="admin-form__title">Plan a meal</h3>

    <label class="field">
      <span class="field__label">Date</span>
      <input class="field__input" id="mp_date" type="date" value="${esc(date)}">
    </label>

    <div class="field">
      <span class="field__label">Slot</span>
      <nav class="tabs tabs--pill tabs--sm" id="mp_slotTabs" role="tablist"
           aria-label="Meal slot">
        ${slotTabs}
      </nav>
    </div>

    <div class="field">
      <span class="field__label">Meal</span>
      <input class="field__input" id="mp_search" type="search"
             placeholder="Search meals…" autocomplete="off">
      <div class="mp-results" id="mp_results">
        <span class="mp-results-label" id="mp_resultsLabel">
          ${entries.length > 0 ? (entries.some(([,m]) => m.isFavorite) ? 'Favorites & Recent' : 'Recent') : ''}
        </span>
        ${chips}
      </div>
      <button class="mp-create-btn" id="mp_createNew" type="button">
        ＋ Create new meal
      </button>
      ${removeLinkHtml}
    </div>

    <div class="mp-inline-editor" id="mp_inlineEditor" hidden>
      <div style="display:flex;align-items:center;gap:var(--spacing-sm);margin-bottom:var(--spacing-md)">
        <button class="btn btn--ghost btn--sm" id="mp_inlineBack" type="button">← Back</button>
        <span style="font-size:var(--font-sm);color:var(--text-muted)">New meal</span>
      </div>
      <label class="field">
        <span class="field__label">Name <span aria-hidden="true" style="color:var(--danger)">*</span></span>
        <input class="field__input" id="mp_inlineName" type="text"
               placeholder="e.g. Taco Tuesday" autocomplete="off">
        <span class="field__error" id="mp_inlineNameError" role="alert"></span>
      </label>
      <label class="field">
        <span class="field__label">Recipe link</span>
        <input class="field__input" id="mp_inlineUrl" type="url" placeholder="https://…">
      </label>
    </div>

    <input type="hidden" id="mp_selectedMealId" value="${esc(currentMealId || '')}">
  </form>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/components.js
git commit -m "feat(meals): add renderMealPlanSheet component"
```

---

## Task 5: Meal Detail Sheet component

**Files:**
- Modify: `shared/components.js`

- [ ] **Step 1: Add `renderMealDetailSheet` to shared/components.js**

Add after `renderMealPlanSheet`:

```js
/**
 * Render the meal detail sheet body (view a planned meal's library entry).
 *
 * meal: meal library object { name, ingredients, url, notes, prepTime, isFavorite, tags }
 * planEntry: { mealId, source } from meals/{date}/{slot}
 * readonly: boolean — when true, hides Change/Edit/Remove actions (kid mode)
 *
 * Events the page must bind after mounting:
 *   #mdChange click   → open plan sheet for this slot (change meal)
 *   #mdEdit click     → open meal editor for this library entry
 *   #mdRemove click   → remove this slot assignment
 */
export function renderMealDetailSheet(meal, planEntry, readonly = false) {
  if (!meal) return `<div class="task-detail-sheet"><p style="color:var(--text-muted)">Meal not found.</p></div>`;

  const isSchool = planEntry?.source === 'school';

  const prepHtml = meal.prepTime
    ? `<span class="me-detail__prep">${esc(meal.prepTime)}</span>`
    : '';

  const tagsHtml = (meal.tags || []).length > 0
    ? `<div class="me-detail__tags">
        ${meal.tags.map(t => `<span class="me-detail__tag">${esc(t)}</span>`).join('')}
       </div>`
    : '';

  const ingrHtml = (meal.ingredients || []).length > 0
    ? `<ul class="me-detail__ingredients">
        ${meal.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}
       </ul>`
    : '';

  const recipeBtn = meal.url
    ? `<a class="btn btn--primary" href="${esc(meal.url)}" target="_blank" rel="noopener noreferrer"
          style="display:block;text-align:center;margin-bottom:var(--spacing-md)">Open recipe</a>`
    : '';

  let actionsHtml = '';
  if (isSchool) {
    actionsHtml = `<p class="me-detail__school-note">Added from school lunch import</p>`;
  } else if (!readonly) {
    actionsHtml = `<div class="me-detail__actions">
      <button class="btn btn--secondary" id="mdChange" type="button">Change meal</button>
      <button class="btn btn--secondary" id="mdEdit" type="button">Edit meal</button>
      <button class="btn btn--ghost" id="mdRemove" type="button"
              style="color:var(--danger)">Remove from plan</button>
    </div>`;
  }

  return `<div class="task-detail-sheet">
    <div class="me-detail__header">
      <h3 class="me-detail__name">${esc(meal.name)}</h3>
      ${prepHtml}
    </div>
    ${tagsHtml}
    ${ingrHtml}
    ${recipeBtn}
    ${actionsHtml}
  </div>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/components.js
git commit -m "feat(meals): add renderMealDetailSheet component"
```

---

## Task 6: Dashboard — data loading

**Files:**
- Modify: `dashboard.js`

The dashboard needs to load the meal library once at startup, and reload the current day's meal plan whenever `viewDate` changes.

- [ ] **Step 1: Add Firebase imports**

In `dashboard.js`, find the existing import line for `firebase.js` (line 1). Add `readMeals`, `readMealLibrary`, `writeMeal`, `removeMeal`, `pushMealLibrary`, `writeMealLibrary`, `removeMealLibrary` to the import:

```js
import { initFirebase, isFirstRun, readSettings, readPeople, readTasks, readCategories, readAllSchedule, readEvents, writeCompletion, removeCompletion, writeTask, pushTask, pushEvent, writeEvent, removeEvent, writePerson, onConnectionChange, onValue, onCompletions, onEvents, onScheduleDay, onMultipliers, readOnce, multiUpdate, onAllMessages, writeMessage, markMessageSeen, removeMessage, writeBankToken, markBankTokenUsed, readBank, readRewards, removeData, writeMultiplier, removeMessagesByEntryKey, removeLatestBankToken, readMeals, readMealLibrary, writeMeal, removeMeal, pushMealLibrary, writeMealLibrary, removeMealLibrary } from './shared/firebase.js';
```

- [ ] **Step 2: Add component imports**

Find the existing import from `./shared/components.js` (line 2). Add `renderMealPlanSheet`, `renderMealDetailSheet`, `renderMealEditorSheet` to the import list.

- [ ] **Step 3: Add module-level meal state**

Find the block of `let` state variables (around line 44, after `let activePressTimer`). Add:

```js
let mealLibrary = {};  // full library — loaded once at startup, refreshed after edits
let viewMeals = null;  // meal slots for viewDate — reloaded on viewDate change
```

- [ ] **Step 4: Load meal data at startup**

Find the existing startup data load (around line 28):
```js
const [settings, peopleObj, tasksObj, catsObj, eventsObj] = await Promise.all([
  readSettings(), readPeople(), readTasks(), readCategories(), readEvents()
]);
```

After the `const rewardsData = await readRewards()` line (around line 43), add:

```js
mealLibrary = (await readMealLibrary()) || {};
viewMeals = (await readMeals(today)) || {};
```

- [ ] **Step 5: Reload viewMeals when viewDate changes**

Search `dashboard.js` for the function or code that changes `viewDate` (look for `viewDate =`). There are typically two places: swipe navigation and Back-to-Today. In each place where `viewDate` is reassigned and `render()` is called, add a meal reload before render():

Find all occurrences of the pattern `viewDate = ` and, in each case, add the reload. The pattern to add after each `viewDate = newDate` assignment:

```js
viewMeals = (await readMeals(viewDate)) || {};
```

Note: these assignment sites are likely inside async arrow functions (swipe handlers, button click handlers) so `await` is safe.

- [ ] **Step 6: Wire dinnerData in render()**

In `render()`, find:
```js
const dinnerData  = null; // Wired by 1.3.
```

Replace with:
```js
const dinnerPlan = viewMeals?.dinner;
const dinnerEntry = (dinnerPlan?.mealId && mealLibrary[dinnerPlan.mealId]) || null;
const dinnerData = dinnerEntry ? { name: dinnerEntry.name, source: dinnerPlan.source } : null;
```

- [ ] **Step 7: Verify dinner chip shows real data**

In Firebase, manually write a test entry:
```
rundown/mealLibrary/test1 = { name: "Test Dinner", ingredients: [], tags: [], isFavorite: false, createdAt: 0, lastUsed: 0 }
rundown/meals/2026-04-25/dinner = { mealId: "test1", source: "manual" }
```

Open `index.html`. With `settings.ambientStrip: true` set in Firebase, the dinner chip should show "Test Dinner". Remove the test data after verifying.

- [ ] **Step 8: Commit**

```bash
git add dashboard.js
git commit -m "feat(meals): load meal library + viewDate meals; wire dinnerData in render()"
```

---

## Task 7: Dashboard — ambient chip tap handlers + FAB menu

**Files:**
- Modify: `dashboard.js`

- [ ] **Step 1: Wire chip tap handlers**

Find in `dashboard.js`:
```js
// Ambient chips (Task 7 — strip is gated on settings.ambientStrip).
// Tap handlers are inert until 1.3 (dinner) and 1.4 (weather) wire real targets.
main.querySelectorAll('.ambient-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    // No-op for now; data wires + sheet opens land in the owning PRs (1.3 / 1.4).
```

Replace the entire `.ambient-chip` forEach block with:

```js
main.querySelectorAll('.ambient-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const which = chip.dataset.chip;
    if (which === 'dinner') {
      const dinnerPlan = viewMeals?.dinner;
      if (dinnerPlan?.mealId && mealLibrary[dinnerPlan.mealId]) {
        openMealDetailSheet(dinnerPlan, 'dinner');
      } else {
        openMealPlanSheet('dinner');
      }
    }
    // weather chip: wired by 1.4
  });
});
```

- [ ] **Step 2: Add `openMealPlanSheet` function**

Add the following function to `dashboard.js` (near the other `open*Sheet` functions, e.g. after `openEventForm`):

```js
function openMealPlanSheet(preSlot = 'dinner', preDate = null) {
  const date = preDate || viewDate;
  const slot = preSlot;
  const currentMealId = viewMeals?.[slot]?.mealId || null;
  const html = renderMealPlanSheet({ date, slot, library: mealLibrary, currentMealId });
  taskSheetMount.innerHTML = renderBottomSheet(html);

  const overlay = document.getElementById('bottomSheet');
  const form = document.getElementById('mpForm');
  const searchInput = document.getElementById('mp_search');
  const resultsDiv = document.getElementById('mp_results');
  const resultsLabel = document.getElementById('mp_resultsLabel');
  const inlineEditor = document.getElementById('mp_inlineEditor');
  let selectedSlot = slot;
  let selectedMealId = currentMealId;

  // Close on backdrop tap
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  // Slot tab switching
  document.getElementById('mp_slotTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.mp-slot-tab');
    if (!btn) return;
    selectedSlot = btn.dataset.slot;
    selectedMealId = viewMeals?.[selectedSlot]?.mealId || null;
    document.getElementById('mp_selectedMealId').value = selectedMealId || '';
    document.querySelectorAll('.mp-slot-tab').forEach(b => {
      b.classList.toggle('is-active', b.dataset.slot === selectedSlot);
      b.setAttribute('aria-selected', b.dataset.slot === selectedSlot);
    });
    // Update remove link visibility
    const removeLink = document.getElementById('mp_removeLink');
    if (removeLink) {
      const cur = viewMeals?.[selectedSlot];
      removeLink.style.display = (cur?.mealId && mealLibrary[cur.mealId]) ? '' : 'none';
      if (cur?.mealId && mealLibrary[cur.mealId]) {
        removeLink.textContent = `Remove "${mealLibrary[cur.mealId].name}" from this slot`;
      }
    }
    filterChips('');
    searchInput.value = '';
  });

  // Search filter
  function filterChips(query) {
    const q = query.toLowerCase().trim();
    const entries = Object.entries(mealLibrary).sort(([, a], [, b]) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (b.lastUsed || 0) - (a.lastUsed || 0);
    });
    const filtered = q ? entries.filter(([, m]) => m.name.toLowerCase().includes(q)) : entries;
    resultsLabel.textContent = q ? '' : (filtered.some(([, m]) => m.isFavorite) ? 'Favorites & Recent' : 'Recent');
    resultsDiv.innerHTML = `<span class="mp-results-label" id="mp_resultsLabel">${resultsLabel.textContent}</span>` +
      filtered.map(([id, m]) =>
        `<button class="meal-chip${id === selectedMealId ? ' meal-chip--selected' : ''}"
                 data-meal-id="${id}" type="button">
          ${m.isFavorite ? '<span class="meal-chip__star" aria-hidden="true">★</span>' : ''}
          ${escapeHtml(String(m.name))}
        </button>`
      ).join('');
    bindChipClicks();
  }

  function bindChipClicks() {
    resultsDiv.querySelectorAll('.meal-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMealId = btn.dataset.mealId;
        document.getElementById('mp_selectedMealId').value = selectedMealId;
        resultsDiv.querySelectorAll('.meal-chip').forEach(b => b.classList.toggle('meal-chip--selected', b.dataset.mealId === selectedMealId));
      });
    });
  }

  searchInput?.addEventListener('input', () => filterChips(searchInput.value));
  bindChipClicks();

  // Create new (inline)
  document.getElementById('mp_createNew')?.addEventListener('click', () => {
    inlineEditor.hidden = false;
    document.getElementById('mp_createNew').hidden = true;
    resultsDiv.style.display = 'none';
    searchInput.style.display = 'none';
    document.getElementById('mp_inlineName')?.focus();
  });

  document.getElementById('mp_inlineBack')?.addEventListener('click', () => {
    inlineEditor.hidden = true;
    document.getElementById('mp_createNew').hidden = false;
    resultsDiv.style.display = '';
    searchInput.style.display = '';
  });

  // Remove existing assignment
  document.getElementById('mp_removeLink')?.addEventListener('click', async () => {
    await removeMeal(date, selectedSlot);
    viewMeals = (await readMeals(viewDate)) || {};
    closeTaskSheet();
    render();
  });

  // Save
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const planDate = document.getElementById('mp_date').value;
    if (!planDate) return;

    // Inline create path
    if (!inlineEditor.hidden) {
      const inlineName = document.getElementById('mp_inlineName').value.trim();
      if (!inlineName) {
        document.getElementById('mp_inlineNameError').textContent = 'Name is required';
        return;
      }
      const inlineUrl = document.getElementById('mp_inlineUrl').value.trim() || null;
      const newId = await pushMealLibrary({
        name: inlineName,
        url: inlineUrl,
        ingredients: [],
        tags: [],
        isFavorite: false,
        notes: null,
        prepTime: null,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastUsed: firebase.database.ServerValue.TIMESTAMP,
      });
      mealLibrary[newId] = { name: inlineName, url: inlineUrl, ingredients: [], tags: [], isFavorite: false };
      await writeMeal(planDate, selectedSlot, { mealId: newId, source: 'manual' });
    } else {
      if (!selectedMealId) return; // no meal selected, do nothing
      await writeMeal(planDate, selectedSlot, { mealId: selectedMealId, source: 'manual' });
      // Update lastUsed on library entry
      const entry = mealLibrary[selectedMealId];
      if (entry) {
        entry.lastUsed = Date.now();
        await writeMealLibrary(selectedMealId, { ...entry, lastUsed: firebase.database.ServerValue.TIMESTAMP });
      }
    }

    viewMeals = (await readMeals(viewDate)) || {};
    mealLibrary = (await readMealLibrary()) || {};
    closeTaskSheet();
    render();
  });
}
```

- [ ] **Step 3: Add `openMealDetailSheet` function**

Add after `openMealPlanSheet`:

```js
function openMealDetailSheet(planEntry, slot) {
  const meal = planEntry?.mealId ? mealLibrary[planEntry.mealId] : null;
  const html = renderMealDetailSheet(meal, planEntry, false);
  taskSheetMount.innerHTML = renderBottomSheet(html);

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('mdChange')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealPlanSheet(slot), 320);
  });

  document.getElementById('mdEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(planEntry.mealId, slot), 320);
  });

  document.getElementById('mdRemove')?.addEventListener('click', async () => {
    await removeMeal(viewDate, slot);
    viewMeals = (await readMeals(viewDate)) || {};
    closeTaskSheet();
    render();
  });
}
```

- [ ] **Step 4: Add `openMealEditorSheet` function**

Add after `openMealDetailSheet`:

```js
function openMealEditorSheet(mealId = null, returnSlot = null) {
  const meal = mealId ? mealLibrary[mealId] : null;
  const html = renderMealEditorSheet(meal, mealId);
  taskSheetMount.innerHTML = renderBottomSheet(html);

  const overlay = document.getElementById('bottomSheet');
  const form = document.getElementById('meForm');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  // Ingredient add/remove
  let ingredients = meal ? [...(meal.ingredients || [])] : [];
  let tags = meal ? [...(meal.tags || [])] : [];

  function refreshIngredients() {
    const container = document.getElementById('me_ingredients');
    if (!container) return;
    container.innerHTML = ingredients.map((item, i) =>
      `<div class="me-ingredient-row" data-ingr-index="${i}">
        <input type="text" value="${escapeHtml(String(item))}" placeholder="e.g. 2 lbs ground beef"
               data-ingr-index="${i}" aria-label="Ingredient ${i + 1}">
        <button class="me-ingredient-remove" data-ingr-index="${i}" type="button" aria-label="Remove">&times;</button>
      </div>`
    ).join('');
    bindIngredientEvents();
  }

  function bindIngredientEvents() {
    document.getElementById('me_ingredients')?.addEventListener('input', e => {
      const input = e.target.closest('input[data-ingr-index]');
      if (input) ingredients[parseInt(input.dataset.ingrIndex)] = input.value;
    }, { once: false });
    document.getElementById('me_ingredients')?.addEventListener('click', e => {
      const btn = e.target.closest('.me-ingredient-remove');
      if (!btn) return;
      ingredients.splice(parseInt(btn.dataset.ingrIndex), 1);
      refreshIngredients();
    });
  }
  bindIngredientEvents();

  document.getElementById('me_addIngredient')?.addEventListener('click', () => {
    ingredients.push('');
    refreshIngredients();
    const inputs = document.querySelectorAll('#me_ingredients input');
    inputs[inputs.length - 1]?.focus();
  });

  // Tag add/remove
  function refreshTags() {
    const container = document.getElementById('me_tags');
    if (!container) return;
    container.innerHTML = tags.map((t, i) =>
      `<span class="me-tag" data-tag-index="${i}">
        ${escapeHtml(String(t))}
        <button class="me-tag__remove" data-tag-index="${i}" type="button" aria-label="Remove tag">&times;</button>
      </span>`
    ).join('');
    container.querySelectorAll('.me-tag__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        tags.splice(parseInt(btn.dataset.tagIndex), 1);
        refreshTags();
      });
    });
  }

  document.getElementById('me_tagInput')?.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
      e.preventDefault();
      tags.push(e.target.value.trim().replace(/,$/, ''));
      e.target.value = '';
      refreshTags();
    }
  });

  // Delete (edit mode only)
  document.getElementById('meDelete')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({
      title: 'Delete meal?',
      message: `"${meal?.name}" will be removed from any planned days.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    // Cascade: remove all plan references
    const allMealsSnap = await readOnce('meals');
    const cascadeUpdates = {};
    if (allMealsSnap) {
      for (const [dateKey, slots] of Object.entries(allMealsSnap)) {
        for (const [s, entry] of Object.entries(slots || {})) {
          if (entry?.mealId === mealId) cascadeUpdates[`meals/${dateKey}/${s}`] = null;
        }
      }
    }
    cascadeUpdates[`mealLibrary/${mealId}`] = null;
    await multiUpdate(cascadeUpdates);
    delete mealLibrary[mealId];
    viewMeals = (await readMeals(viewDate)) || {};
    closeTaskSheet();
    render();
  });

  // Save
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('me_name').value.trim();
    if (!name) {
      document.getElementById('me_nameError').textContent = 'Name is required';
      return;
    }
    // Collect current ingredient values from DOM (user may have typed without triggering input)
    document.querySelectorAll('#me_ingredients input[data-ingr-index]').forEach((inp, i) => {
      ingredients[i] = inp.value;
    });

    const data = {
      name,
      isFavorite: document.getElementById('me_fav').checked,
      prepTime: document.getElementById('me_prepTime').value.trim() || null,
      tags: tags.filter(Boolean),
      ingredients: ingredients.filter(Boolean),
      url: document.getElementById('me_url').value.trim() || null,
      notes: document.getElementById('me_notes').value.trim() || null,
      lastUsed: (meal?.lastUsed) || null,
      createdAt: (meal?.createdAt) || firebase.database.ServerValue.TIMESTAMP,
    };

    if (mealId) {
      await writeMealLibrary(mealId, data);
      mealLibrary[mealId] = data;
    } else {
      const newId = await pushMealLibrary({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      mealLibrary[newId] = data;
    }

    closeTaskSheet();
    // If opened from a slot context, re-open plan sheet
    if (returnSlot) {
      setTimeout(() => openMealPlanSheet(returnSlot), 320);
    }
    render();
  });
}
```

- [ ] **Step 5: Add "Plan a meal" to FAB add menu**

Find `openAddMenuFromFab` and the section where `openAddMenu` is defined or the add menu options are built. Search for `renderAddMenu` call or where the add menu options array is defined. It will look like:

```js
function openAddMenu() {
  const options = [
    { key: 'task',  label: 'Add task',  icon: '...' },
    { key: 'event', label: 'Add event', icon: '...' },
  ];
  ...
}
```

Add a meal option to the options array:

```js
{ key: 'meal', label: 'Plan a meal',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>' },
```

And in the add menu click handler (where `action === 'event'` and `action === 'task'` are handled), add:

```js
} else if (action === 'meal') {
  setTimeout(() => openMealPlanSheet('dinner'), 320);
}
```

- [ ] **Step 6: Manual end-to-end test**

Open `index.html`. Enable `settings.ambientStrip: true` in Firebase. Verify:
1. FAB → "Plan a meal" opens the plan sheet
2. Selecting a meal and saving updates the dinner chip immediately
3. Tapping the dinner chip opens the detail sheet
4. "Remove from plan" clears the chip back to "Not planned"
5. "Edit meal" opens the editor with pre-filled data
6. Creating a new meal inline from the plan sheet works

- [ ] **Step 7: Commit**

```bash
git add dashboard.js
git commit -m "feat(meals): wire plan/detail/editor sheets into dashboard; add FAB menu item"
```

---

## Task 8: Calendar day view — Meals section

**Files:**
- Modify: `shared/calendar-views.js`
- Modify: `calendar.html`

- [ ] **Step 1: Update `renderDayView` signature**

In `shared/calendar-views.js`, find `export function renderDayView(opts)`. Add `dayMeals` and `mealLibrary` to the destructured opts:

```js
export function renderDayView(opts) {
  const { dateKey, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings, dayMeals = {}, mealLibrary = {} } = opts;
```

- [ ] **Step 2: Add meals section rendering in `renderDayView`**

After the `eventsHtml` block (events section) and before the `tasksHtml` block, add:

```js
  // Meals section — only slots with an assigned meal render
  const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  let mealsHtml = '';
  for (const slot of SLOTS) {
    const plan = dayMeals?.[slot];
    if (!plan?.mealId) continue;
    const meal = mealLibrary[plan.mealId];
    if (!meal) continue;
    const isSchool = plan.source === 'school';
    const schoolIcon = isSchool
      ? `<span class="card--meal__school-icon" aria-hidden="true">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
             <path d="M2 22h20M3 22V8l9-6 9 6v14M10 22v-6h4v6"/>
           </svg>
         </span>`
      : '';
    mealsHtml += `<button class="card--meal${isSchool ? ' card--meal--school' : ''}"
                          data-meal-id="${esc(plan.mealId)}" data-slot="${esc(slot)}"
                          type="button" ${isSchool ? 'aria-disabled="true"' : ''}>
      ${schoolIcon}
      <span class="card--meal__name">${esc(meal.name)}</span>
      <span class="card--meal__slot">${esc(SLOT_LABELS[slot])}</span>
    </button>`;
  }

  if (mealsHtml) {
    mealsHtml = `<div class="cal-day__section">
      <div class="cal-day__section-header">Meals</div>
      ${mealsHtml}
    </div>`;
  }
```

Then in the final return string, insert `mealsHtml` between `eventsHtml` and `tasksHtml`:

Find the existing return (it will look like):
```js
  return `<div class="cal-day">
    ${eventsHtml}
    ${tasksHtml}
  </div>`;
```

Change to:
```js
  return `<div class="cal-day">
    ${eventsHtml}
    ${mealsHtml}
    ${tasksHtml}
  </div>`;
```

- [ ] **Step 3: Load meal data in calendar.html**

In `calendar.html`, find the existing Firebase import line. Add `readMealLibrary`, `readAllMeals`, `writeMeal`, `removeMeal`, `pushMealLibrary`, `writeMealLibrary`, `removeMealLibrary` to the import.

Find where the initial data is loaded (the `await Promise.all(...)` block or similar). After loading existing data, add:

```js
let allMeals = (await readAllMeals()) || {};
let mealLibrary = (await readMealLibrary()) || {};
```

- [ ] **Step 4: Pass meal data to renderDayView**

In `calendar.html`, find the `renderDayView` call:

```js
html += renderDayView({
  dateKey: viewDay, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings
});
```

Change to:

```js
html += renderDayView({
  dateKey: viewDay, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings,
  dayMeals: allMeals[viewDay] || {},
  mealLibrary
});
```

- [ ] **Step 5: Bind meal card click events in calendar.html**

In `calendar.html`, find `function bindDayViewEvents()`. Add meal card binding:

```js
// Meal cards in day view
main.querySelectorAll('.card--meal:not(.card--meal--school)').forEach(card => {
  card.addEventListener('click', () => {
    const mealId = card.dataset.mealId;
    const slot = card.dataset.slot;
    const plan = allMeals[viewDay]?.[slot];
    const meal = mealLibrary[mealId];
    if (!plan || !meal) return;
    openCalMealDetailSheet(plan, slot);
  });
});
```

- [ ] **Step 6: Add `openCalMealDetailSheet` to calendar.html**

Add a function that opens a read-only meal detail sheet (calendar doesn't need edit capability in this PR — full meal management is in admin and dashboard):

```js
function openCalMealDetailSheet(planEntry, slot) {
  const meal = planEntry?.mealId ? mealLibrary[planEntry.mealId] : null;
  const html = renderMealDetailSheet(meal, planEntry, true); // readonly=true
  // Use existing sheet mount pattern in calendar.html (check what mount element is used)
  const mount = document.getElementById('taskSheetMount') || document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(html);
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) mount.innerHTML = ''; });
}
```

Import `renderMealDetailSheet` and `renderBottomSheet` from `shared/components.js` in calendar.html (add to existing components import line).

- [ ] **Step 7: Verify**

Open `calendar.html`, navigate to the day view for a date that has a planned meal (set one via dashboard). Verify the Meals section appears above Tasks, and tapping a meal card opens the detail sheet.

- [ ] **Step 8: Commit**

```bash
git add shared/calendar-views.js calendar.html
git commit -m "feat(meals): add meals section to calendar day view"
```

---

## Task 9: Admin — Meals library tab

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add Firebase imports**

In the `admin.html` module script import for `firebase.js`, add: `readMealLibrary`, `pushMealLibrary`, `writeMealLibrary`, `removeMealLibrary`, `readAllMeals`, `removeMeal`.

Add `renderMealEditorSheet`, `renderBottomSheet`, `renderMealPlanSheet` to the components import.

- [ ] **Step 2: Add `meals` module state**

In the admin script, after existing state variables (like `let editingRewardId`), add:

```js
let mealLibrary = {};
let editingMealId = null; // null = not editing, 'new' = create mode, pushId = editing
```

- [ ] **Step 3: Load meal library at startup**

After existing data loads (`settings = await readSettings()`, etc.), add:

```js
mealLibrary = (await readMealLibrary()) || {};
```

- [ ] **Step 4: Add meals tab to TABS array**

Find the `const TABS = [` declaration. Add the meals tab entry (insert after the Events tab for logical grouping):

```js
{ id: 'meals',
  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>',
  label: 'Meals' },
```

- [ ] **Step 5: Add meals panel in the render function**

In the admin `render()` function, find the large `if/else if` chain that renders each tab's panel content. Add a meals panel:

```js
} else if (activeTab === 'meals') {
  const entries = Object.entries(mealLibrary).sort(([, a], [, b]) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return (b.lastUsed || 0) - (a.lastUsed || 0);
  });

  html += `<div id="admin-panel-meals" role="tabpanel">
    <div class="admin-section-header">
      <h2 class="admin-section-title">Meal Library</h2>
      <button class="btn btn--primary btn--sm" id="addMeal" type="button">Add meal</button>
    </div>`;

  if (entries.length === 0) {
    html += `<div class="empty-state">
      <div class="empty-state__icon">🍽️</div>
      <div class="empty-state__title">No meals yet</div>
      <div class="empty-state__body">Add your first meal to get started planning dinners.</div>
    </div>`;
  } else {
    html += `<div class="admin-list">`;
    for (const [id, meal] of entries) {
      const lastUsedStr = meal.lastUsed
        ? new Date(meal.lastUsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'Never used';
      const ingrCount = (meal.ingredients || []).filter(Boolean).length;
      const prepStr = meal.prepTime ? ` · ${esc(meal.prepTime)}` : '';
      const ingrStr = ingrCount > 0 ? ` · ${ingrCount} ingredient${ingrCount !== 1 ? 's' : ''}` : '';
      html += `<div class="admin-list-row" data-meal-id="${id}">
        <div class="admin-list-row__body">
          <div class="admin-list-row__title">
            ${meal.isFavorite ? '<span style="color:var(--warning)" aria-label="Favorite">★</span> ' : ''}
            ${esc(meal.name)}
          </div>
          <div class="admin-list-row__meta">${lastUsedStr}${prepStr}${ingrStr}</div>
        </div>
        <div class="admin-list-row__actions">
          <button class="btn-icon edit-meal-btn" data-meal-id="${id}" type="button" aria-label="Edit ${esc(meal.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon delete-meal-btn" data-meal-id="${id}" type="button" aria-label="Delete ${esc(meal.name)}" style="color:var(--danger)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
```

- [ ] **Step 6: Bind meals tab events**

In the admin event-binding section (usually a `bindEvents()` function or inline after render), add:

```js
if (activeTab === 'meals') {
  document.getElementById('addMeal')?.addEventListener('click', () => openAdminMealEditor(null));
  document.querySelectorAll('.edit-meal-btn').forEach(btn => {
    btn.addEventListener('click', () => openAdminMealEditor(btn.dataset.mealId));
  });
  document.querySelectorAll('.delete-meal-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAdminMeal(btn.dataset.mealId));
  });
}
```

- [ ] **Step 7: Add `openAdminMealEditor` and `deleteAdminMeal` functions**

Add to the admin script:

```js
function openAdminMealEditor(mealId) {
  const meal = mealId ? mealLibrary[mealId] : null;
  const html = renderMealEditorSheet(meal, mealId);
  const mount = document.getElementById('taskSheetMount') || document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(html);

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) mount.innerHTML = ''; });

  let ingredients = meal ? [...(meal.ingredients || [])] : [];
  let tags = meal ? [...(meal.tags || [])] : [];

  function refreshIngredients() {
    const container = document.getElementById('me_ingredients');
    if (!container) return;
    container.innerHTML = ingredients.map((item, i) =>
      `<div class="me-ingredient-row">
        <input type="text" value="${escapeHtml(String(item))}" placeholder="e.g. 2 cups flour"
               data-ingr-index="${i}" aria-label="Ingredient ${i + 1}">
        <button class="me-ingredient-remove" data-ingr-index="${i}" type="button">&times;</button>
      </div>`
    ).join('');
    bindIngrEvents();
  }

  function bindIngrEvents() {
    const container = document.getElementById('me_ingredients');
    container?.querySelectorAll('input').forEach((inp, i) => {
      inp.addEventListener('input', () => { ingredients[i] = inp.value; });
    });
    container?.querySelectorAll('.me-ingredient-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        ingredients.splice(parseInt(btn.dataset.ingrIndex), 1);
        refreshIngredients();
      });
    });
  }
  bindIngrEvents();

  document.getElementById('me_addIngredient')?.addEventListener('click', () => {
    ingredients.push('');
    refreshIngredients();
    const inputs = document.querySelectorAll('#me_ingredients input');
    inputs[inputs.length - 1]?.focus();
  });

  function refreshTags() {
    const container = document.getElementById('me_tags');
    if (!container) return;
    container.innerHTML = tags.map((t, i) =>
      `<span class="me-tag"><span>${escapeHtml(String(t))}</span>
        <button class="me-tag__remove" data-tag-index="${i}" type="button">&times;</button>
      </span>`
    ).join('');
    container.querySelectorAll('.me-tag__remove').forEach(btn => {
      btn.addEventListener('click', () => { tags.splice(parseInt(btn.dataset.tagIndex), 1); refreshTags(); });
    });
  }

  document.getElementById('me_tagInput')?.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
      e.preventDefault();
      tags.push(e.target.value.trim().replace(/,$/, ''));
      e.target.value = '';
      refreshTags();
    }
  });

  document.getElementById('meDelete')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({
      title: 'Delete meal?',
      message: `"${meal?.name}" will be removed from any planned days.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const allMealsSnap = await readOnce('meals');
    const cascadeUpdates = {};
    if (allMealsSnap) {
      for (const [dateKey, slots] of Object.entries(allMealsSnap)) {
        for (const [s, entry] of Object.entries(slots || {})) {
          if (entry?.mealId === mealId) cascadeUpdates[`meals/${dateKey}/${s}`] = null;
        }
      }
    }
    cascadeUpdates[`mealLibrary/${mealId}`] = null;
    await multiUpdate(cascadeUpdates);
    delete mealLibrary[mealId];
    mount.innerHTML = '';
    render();
  });

  document.getElementById('meForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('me_name').value.trim();
    if (!name) { document.getElementById('me_nameError').textContent = 'Name is required'; return; }
    document.querySelectorAll('#me_ingredients input').forEach((inp, i) => { ingredients[i] = inp.value; });
    const data = {
      name,
      isFavorite: document.getElementById('me_fav').checked,
      prepTime: document.getElementById('me_prepTime').value.trim() || null,
      tags: tags.filter(Boolean),
      ingredients: ingredients.filter(Boolean),
      url: document.getElementById('me_url').value.trim() || null,
      notes: document.getElementById('me_notes').value.trim() || null,
      lastUsed: meal?.lastUsed || null,
      createdAt: meal?.createdAt || firebase.database.ServerValue.TIMESTAMP,
    };
    if (mealId) {
      await writeMealLibrary(mealId, data);
      mealLibrary[mealId] = data;
    } else {
      const newId = await pushMealLibrary({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      mealLibrary[newId] = data;
    }
    mount.innerHTML = '';
    render();
  });
}

async function deleteAdminMeal(mealId) {
  const meal = mealLibrary[mealId];
  if (!meal) return;
  const confirmed = await showConfirm({
    title: 'Delete meal?',
    message: `"${meal.name}" will be removed from any planned days.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  const allMealsSnap = await readOnce('meals');
  const cascadeUpdates = {};
  if (allMealsSnap) {
    for (const [dateKey, slots] of Object.entries(allMealsSnap)) {
      for (const [s, entry] of Object.entries(slots || {})) {
        if (entry?.mealId === mealId) cascadeUpdates[`meals/${dateKey}/${s}`] = null;
      }
    }
  }
  cascadeUpdates[`mealLibrary/${mealId}`] = null;
  await multiUpdate(cascadeUpdates);
  delete mealLibrary[mealId];
  render();
}
```

- [ ] **Step 8: Verify admin meals tab**

Open `admin.html`. Navigate to the Meals tab. Verify:
1. Empty state renders correctly when library is empty
2. "Add meal" opens the editor sheet
3. Save creates a new library entry and re-renders the list
4. Edit pre-fills the form
5. Delete shows confirm modal and removes the entry

- [ ] **Step 9: Commit**

```bash
git add admin.html
git commit -m "feat(meals): add Meals library tab to admin with full CRUD"
```

---

## Task 10: Admin — Settings toggle + per-kid showMeals

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add ambientStrip toggle in Settings tab**

In the admin render function, find the Settings tab panel (where calendar defaults, theme, etc. are managed). Find the "Appearance" or "Display" section. Add:

```html
<div class="admin-form__group admin-form__group--row">
  <div>
    <label class="form-label" for="set_ambientStrip">Ambient strip</label>
    <div class="form-help">Show weather and tonight's dinner on the dashboard.</div>
  </div>
  <label class="toggle">
    <input type="checkbox" id="set_ambientStrip"
           ${settings?.ambientStrip ? 'checked' : ''}>
    <span class="toggle__track"></span>
  </label>
</div>
```

In the Settings save handler (where settings are written to Firebase), read and include:

```js
const ambientStrip = document.getElementById('set_ambientStrip')?.checked ?? false;
// Add ambientStrip to the settings object being saved:
const updatedSettings = {
  ...currentSettings,
  ambientStrip,
  // ... other fields already being saved
};
await writeSettings(updatedSettings);
settings = updatedSettings;
```

- [ ] **Step 2: Add showMeals toggle to People tab (kid profiles)**

In the admin render function, find where each person is rendered in the People tab. Find the section that renders kid-specific settings (look for kid mode toggles). Add a `showMeals` toggle:

```html
<div class="admin-form__group admin-form__group--row">
  <div>
    <label class="form-label" for="kidShowMeals_${person.id}">Show tonight's dinner in kid mode</label>
  </div>
  <label class="toggle">
    <input type="checkbox" id="kidShowMeals_${person.id}"
           ${person.prefs?.showMeals !== false ? 'checked' : ''}>
    <span class="toggle__track"></span>
  </label>
</div>
```

In the People save handler, read and write it:

```js
const showMeals = document.getElementById(`kidShowMeals_${person.id}`)?.checked ?? true;
// Include in person prefs when saving:
await writePerson(person.id, {
  ...personData,
  prefs: { ...(person.prefs || {}), showMeals },
});
```

- [ ] **Step 3: Verify**

Open `admin.html`. Settings tab: toggle Ambient strip on, save, reload — verify `settings.ambientStrip` is written to Firebase. People tab: toggle "Show tonight's dinner" for a kid, save — verify `people/{id}/prefs/showMeals` is written.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(meals): add ambientStrip setting and per-kid showMeals toggle in admin"
```

---

## Task 11: Kid mode — Tonight tile

**Files:**
- Modify: `kid.html`

- [ ] **Step 1: Add Firebase imports to kid.html**

Find the existing Firebase import in `kid.html` (line 53). Add `readMeals`, `readMealLibrary` to the import.

Add `renderMealDetailSheet`, `renderBottomSheet` to the components import.

- [ ] **Step 2: Add meal state variables**

After existing `let` declarations in kid.html, add:

```js
let tonightDinner = null;  // { mealId, source } | null
let mealLibrary = {};
```

- [ ] **Step 3: Load meal data alongside other kid data**

Find where kid.html loads its initial data. Add:

```js
mealLibrary = (await readMealLibrary()) || {};
const todayMeals = (await readMeals(today)) || {};
tonightDinner = todayMeals.dinner || null;
```

- [ ] **Step 4: Add the Tonight tile to kid render function**

Find the kid `render()` function where the HTML is built. Find the section after the task list and before the empty state or footer. Add:

```js
// Tonight's dinner tile (gated on prefs.showMeals !== false)
const showMeals = kid.prefs?.showMeals !== false;
if (showMeals) {
  const dinner = tonightDinner?.mealId ? mealLibrary[tonightDinner.mealId] : null;
  if (dinner) {
    html += `<button class="kid-tonight" id="kidTonightTile" type="button">
      <span class="kid-tonight__icon" aria-hidden="true">🍽️</span>
      <span>
        <span class="kid-tonight__label">Tonight</span>
        <span class="kid-tonight__name">${esc(dinner.name)}</span>
      </span>
    </button>`;
  }
}
```

- [ ] **Step 5: Bind the Tonight tile tap**

In the kid page's event-binding section (after innerHTML is set), add:

```js
document.getElementById('kidTonightTile')?.addEventListener('click', () => {
  const dinner = tonightDinner?.mealId ? mealLibrary[tonightDinner.mealId] : null;
  if (!dinner) return;
  const html = renderMealDetailSheet(dinner, tonightDinner, true); // readonly
  const mount = document.getElementById('taskSheetMount');
  mount.innerHTML = renderBottomSheet(html);
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) mount.innerHTML = ''; });
});
```

- [ ] **Step 6: Verify**

Open `kid.html?kid=KidName`. If `prefs.showMeals` is not false and dinner is planned for today, the Tonight tile appears. Tapping opens a read-only detail sheet. No edit/remove buttons visible.

- [ ] **Step 7: Commit**

```bash
git add kid.html
git commit -m "feat(meals): add Tonight's dinner tile to kid mode"
```

---

## Task 12: Service worker cache bump

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump CACHE_NAME**

In `sw.js`, find:
```js
const CACHE_NAME = 'rundown-v63';
```

Change to:
```js
const CACHE_NAME = 'rundown-v64';
```

- [ ] **Step 2: Add changelog entry**

In `sw.js`, in the CACHE_BUMPS comment block, add above the v63 line:

```
// v64 (2026-04-25) — 1.3 Meal Planning: Meal Library + Meal Plan schedule
//                    (mealLibrary + meals/ Firebase schema), three sheet flows
//                    (plan/detail/editor), dashboard ambient dinner chip,
//                    calendar day view meals section, admin Meals tab,
//                    ambientStrip setting, per-kid showMeals pref, kid
//                    Tonight tile. Spec: docs/superpowers/specs/2026-04-25-meals-design.md
```

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump cache to v64 for 1.3 Meal Planning"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Firebase schema (mealLibrary + meals/{date}/{slot}) — Task 1
- [x] 8 Firebase helpers — Task 1
- [x] `card--meal` + `card--meal--school` CSS — Task 2
- [x] `renderMealEditorSheet` — Task 3
- [x] `renderMealPlanSheet` (search + recents + inline create) — Task 4
- [x] `renderMealDetailSheet` — Task 5
- [x] Dashboard dinnerData wiring — Task 6
- [x] Dashboard chip tap handlers + FAB menu item — Task 7
- [x] Calendar day view meals section — Task 8
- [x] Admin Meals tab (full CRUD) — Task 9
- [x] Admin ambientStrip setting — Task 10
- [x] Admin per-kid showMeals toggle — Task 10
- [x] Kid Tonight tile — Task 11
- [x] SW cache bump — Task 12
- [x] School source seam (read-only rendering, no edit affordance) — Tasks 5, 8
- [x] `source: 'manual'` set on all writes — Tasks 7, 9
- [x] Cascade delete (library removal removes plan references) — Tasks 7, 9
- [x] `lastUsed` updated on plan — Tasks 7
- [x] `isFavorite` floats to top of picker — Tasks 4, 9
- [x] All 4 slot tabs — Task 4

**Type/name consistency:**
- `mealLibrary` (module state) — consistent across Tasks 6, 7, 9, 11
- `viewMeals` (dashboard viewDate meals) — consistent across Tasks 6, 7
- `pushMealLibrary` / `writeMealLibrary` / `removeMealLibrary` — match Task 1 definitions
- `renderMealEditorSheet(meal, mealId)` — called consistently in Tasks 7, 9
- `renderMealDetailSheet(meal, planEntry, readonly)` — called consistently in Tasks 7, 8, 11
- `renderMealPlanSheet({ date, slot, library, currentMealId })` — called consistently in Tasks 7

**Placeholder scan:** No TBDs, no "implement later", no vague steps. All code blocks are complete.
