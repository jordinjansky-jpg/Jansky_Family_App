# Kitchen Meals Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Testing note:** This codebase has no test runner (no npm/bundler in frontend per [CLAUDE.md](../../../CLAUDE.md)). "Verify" steps are manual Playwright checks at 412×915 mobile viewport. Use the existing browser MCP per CLAUDE.md's testing convention. Treat the Playwright verification as the test gate — do NOT mark a task complete without passing it.

**Goal:** Redesign the Kitchen Meals tab to dashboard-quality, introduce a global Kitchen AI Tools entry point, consolidate school-lunch import (photo/gallery/file/iCal) into Kitchen and remove its Admin entry point.

**Architecture:** All changes live in [kitchen.js](../../../kitchen.js), [styles/kitchen.css](../../../styles/kitchen.css), [shared/firebase.js](../../../shared/firebase.js), [admin.html](../../../admin.html) (block removal), and [sw.js](../../../sw.js) (cache bump). New Firebase schema branch `rundown/kitchen/schoolLunchFeeds/{personId}` reuses the existing iCal-feed pattern from calendar events. No new HTML pages, no new Worker handlers.

**Tech Stack:** Vanilla JS ES modules, Firebase compat SDK, no bundler, no framework. CSS uses existing design tokens — no new tokens introduced.

**Spec:** [docs/superpowers/specs/2026-05-11-kitchen-meals-redesign.md](../specs/2026-05-11-kitchen-meals-redesign.md)

---

## File structure overview

| File | Responsibility | Touch type |
|---|---|---|
| [kitchen.js](../../../kitchen.js) | Meals tab + AI Tools sheet + iCal sync orchestrator | Heavy edits, new functions |
| [styles/kitchen.css](../../../styles/kitchen.css) | Day-block / thumbnail / AI Tools / iCal sub-sheet styles | New rules, some replacements |
| [shared/firebase.js](../../../shared/firebase.js) | Firebase read/write surface | New exports only — existing untouched |
| [admin.html](../../../admin.html) | Remove school-lunch import block | Deletion only |
| [sw.js](../../../sw.js) | Service worker cache version | Single-line bump |
| [shared/kitchen-ical.js](../../../shared/kitchen-ical.js) | New module — iCal fetch + parse + map | **Create** |

Total scope: ~600-900 lines of new code, ~150 lines of deletions.

---

## Pre-flight

### Task 0: Branch and baseline

**Files:**
- None modified

- [ ] **Step 1: Confirm working tree is clean for SP1 work**

Run:
```bash
git status --short
```

Expected: existing uncommitted files from the broader project may be present; do not touch them. If a `feat/kitchen-meals-redesign` branch should be created, create it now:
```bash
git checkout -b feat/kitchen-meals-redesign
```

- [ ] **Step 2: Capture baseline screenshots at 412×915**

Start the dev server if not already running:
```bash
node serve.js
```

Then via Playwright MCP at viewport 412×915, capture:
- Meals tab full-page
- Recipes tab full-page (no changes expected, but baseline for regression)
- Lists tab full-page (no changes expected, but baseline for regression)
- Plan-a-meal sheet (FAB tap)

Save names: `_baseline-meals.png`, `_baseline-recipes.png`, `_baseline-lists.png`, `_baseline-plan-meal.png`.

Delete after the SP1 work is fully merged (per CLAUDE.md screenshot cleanup rule).

- [ ] **Step 3: No commit yet** — pre-flight only.

---

## Task 1: Add School slot to Plan-a-meal slot picker

Per spec §6: the existing slot picker filters school slots out. The fix is small and unlocks manual school-slot planning. Doing this first because Tasks 8-12 depend on the slot picker shape.

**Files:**
- Modify: [kitchen.js:443](../../../kitchen.js#L443) — `openPlanMealSheet`

- [ ] **Step 1: Replace the school-filtering line**

Find at [kitchen.js:443](../../../kitchen.js#L443):
```js
const PLAN_SLOT_ORDER = SLOT_ORDER.filter(s => !s.startsWith('school'));
```

Replace with:
```js
// Picker offers a single 'School' option. Auto-allocation in handleSchoolSave()
// maps it to school-lunch or school-lunch-2 based on day state.
const PLAN_SLOT_ORDER = ['breakfast', 'lunch', 'school', 'dinner', 'snack'];
```

And update `SLOT_LABELS` reference in the picker rendering. Find the slot-pills HTML at [kitchen.js:491](../../../kitchen.js#L491):
```js
${PLAN_SLOT_ORDER.map(s => `<button class="tab${s === selectedSlot ? ' is-active' : ''}${planCache[preDate]?.[s] ? ' is-occupied' : ''}" data-slot="${esc(s)}" type="button">${esc(SLOT_LABELS[s])}</button>`).join('')}
```

`SLOT_LABELS` does not contain a `school` key yet; add it. Find `SLOT_LABELS` at [kitchen.js:246](../../../kitchen.js#L246):
```js
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', 'school-lunch': 'School 1', 'school-lunch-2': 'School 2', dinner: 'Dinner', snack: 'Snack' };
```

Add `school: 'School',`:
```js
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', school: 'School', 'school-lunch': 'School 1', 'school-lunch-2': 'School 2', dinner: 'Dinner', snack: 'Snack' };
```

Also update `is-occupied` check in the slot-pills HTML — `planCache[preDate]?.['school']` will never be truthy because the picker `school` is a virtual key that maps to `school-lunch[-2]` at save time. Replace the `is-occupied` expression for `school`:

Find the slot-pills HTML and rewrite to:
```js
${PLAN_SLOT_ORDER.map(s => {
  const isOccupied = s === 'school'
    ? !!(planCache[preDate]?.['school-lunch'] && planCache[preDate]?.['school-lunch-2'])
    : !!planCache[preDate]?.[s];
  return `<button class="tab${s === selectedSlot ? ' is-active' : ''}${isOccupied ? ' is-occupied' : ''}" data-slot="${esc(s)}" type="button">${esc(SLOT_LABELS[s])}</button>`;
}).join('')}
```

`is-occupied` for `school` only fires when BOTH school slots are taken — the save handler (Task 2) handles the "one slot taken" case by allocating to the other.

- [ ] **Step 2: Verify in browser**

Reload `http://localhost:8080/kitchen.html`. Tap FAB. Plan-a-meal sheet opens. Slot pills should read: `Breakfast` `Lunch` `School` `Dinner` `Snack`. Tap each — `is-active` styling cycles correctly. Close the sheet without saving.

- [ ] **Step 3: Commit**

```bash
git add kitchen.js
git commit -m "feat(kitchen): add 'School' to Plan-a-meal slot picker

Replaces the filtered-out school-lunch slots with a single virtual
'School' option. Allocation to school-lunch/school-lunch-2 happens at
save time (next commit).
"
```

---

## Task 2: Auto-allocation save logic + inline second-school option

Per spec §6: when slot is `school` and the day already has `school-lunch`, the save handler allocates to `school-lunch-2`. When both are full, save is disabled. The inline `+ Plan a second School option` row appears when `school` is selected after the first pick.

**Files:**
- Modify: [kitchen.js:592-619](../../../kitchen.js#L592-L619) — Plan-a-meal save handler

- [ ] **Step 1: Add `handleSchoolSave` helper above `openPlanMealSheet`**

Insert at [kitchen.js:440](../../../kitchen.js#L440) (above `openPlanMealSheet`):
```js
// When user picks the virtual 'school' slot, resolve to the concrete
// school-lunch or school-lunch-2 schema key based on what's free on the day.
// Returns null when both slots are taken — caller should keep Save disabled.
function resolveSchoolSlot(dateKey) {
  const dayPlan = planCache[dateKey] || {};
  if (!dayPlan['school-lunch']) return 'school-lunch';
  if (!dayPlan['school-lunch-2']) return 'school-lunch-2';
  return null;
}
```

- [ ] **Step 2: Add second-option state and UI to the meal section**

Inside `openPlanMealSheet`, after `let selectedRecipeId = preRecipeId;` (around [kitchen.js:442](../../../kitchen.js#L442)) add:
```js
let secondOpen = false;          // true once user taps "+ Plan a second School option"
let secondRecipeId = null;       // selected recipe for the 2nd school slot
let secondTypedName = '';        // typed (non-recipe) name for the 2nd school slot
```

Inside the sheet HTML — after the existing meal-section block (right before the call to `renderFormFooter`) at [kitchen.js:509](../../../kitchen.js#L509), add a new block:
```js
<div class="kp-second-school${selectedSlot === 'school' && (selectedRecipeId || preRecipeName) ? ' is-visible' : ''}" id="kp_secondSection">
  <button class="ef2-add-chip${secondOpen ? ' is-active' : ''}" id="kp_addSecond" type="button">${secondOpen ? '− Remove second option' : '+ Plan a second School option'}</button>
  <div class="kp-second-meal${secondOpen ? ' is-open' : ''}" id="kp_secondMealWrap">
    <button class="kp-meal-select" id="kp_secondMealSelect" type="button">
      <span id="kp_secondMealLabel">Choose a meal…</span>
    </button>
    <div class="kp-meal-dropdown is-open" id="kp_secondMealDropdown">
      <input class="kp-search-input" id="kp_secondSearch" type="text" autocomplete="off" placeholder="Search…">
      <div class="recipe-pick-list" id="kp_secondPick"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Wire toggle + slot-change visibility**

After `bindPickRows()` is called (around [kitchen.js:582](../../../kitchen.js#L582)), add:
```js
function syncSecondSchoolVisibility() {
  const section = document.getElementById('kp_secondSection');
  const dayKey = document.getElementById('kp_day')?.value;
  const dayPlan = planCache[dayKey] || {};
  const otherSchoolFree = !(dayPlan['school-lunch'] && dayPlan['school-lunch-2']);
  const show = selectedSlot === 'school' && (selectedRecipeId || document.getElementById('kp_search')?.value.trim()) && otherSchoolFree;
  section?.classList.toggle('is-visible', show);
}

function bindSecondPickRows() {
  document.getElementById('kp_secondPick')?.querySelectorAll('[data-recipe-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.recipePick;
      secondRecipeId = secondRecipeId === id ? null : id;
      const name = secondRecipeId ? recipes[secondRecipeId]?.name || '' : '';
      document.getElementById('kp_secondSearch').value = name;
      document.getElementById('kp_secondMealLabel').textContent = name || 'Choose a meal…';
      document.getElementById('kp_secondPick').innerHTML = buildRecipeRows(name);
      bindSecondPickRows();
    });
  });
}

document.getElementById('kp_addSecond')?.addEventListener('click', () => {
  secondOpen = !secondOpen;
  document.getElementById('kp_addSecond').textContent = secondOpen ? '− Remove second option' : '+ Plan a second School option';
  document.getElementById('kp_addSecond').classList.toggle('is-active', secondOpen);
  document.getElementById('kp_secondMealWrap')?.classList.toggle('is-open', secondOpen);
  if (secondOpen) {
    document.getElementById('kp_secondPick').innerHTML = buildRecipeRows('');
    bindSecondPickRows();
  } else {
    secondRecipeId = null;
    secondTypedName = '';
  }
});

document.getElementById('kp_secondSearch')?.addEventListener('input', (e) => {
  secondRecipeId = null;
  secondTypedName = e.target.value.trim();
  document.getElementById('kp_secondPick').innerHTML = buildRecipeRows(e.target.value);
  bindSecondPickRows();
});
```

Update the existing slot-pill click handler at [kitchen.js:532-537](../../../kitchen.js#L532-L537) to call `syncSecondSchoolVisibility()`:
```js
document.getElementById('kp_slotPills')?.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-slot]');
  if (!tab) return;
  selectedSlot = tab.dataset.slot;
  document.getElementById('kp_slotPills').querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
  syncSecondSchoolVisibility();
});
```

Also update the search-input handler at [kitchen.js:584-590](../../../kitchen.js#L584-L590) to call `syncSecondSchoolVisibility()` after each input.

- [ ] **Step 4: Rewrite save handler**

Replace the existing save handler at [kitchen.js:592-619](../../../kitchen.js#L592-L619) with:
```js
document.getElementById('kp_save')?.addEventListener('click', async () => {
  const day = document.getElementById('kp_day')?.value;
  if (!day || !selectedSlot) return;
  const typed = document.getElementById('kp_search')?.value.trim();
  if (!selectedRecipeId && !typed) return;

  // Resolve concrete schema key (school virtual → school-lunch[-2]).
  const concreteSlot = selectedSlot === 'school' ? resolveSchoolSlot(day) : selectedSlot;
  if (!concreteSlot) {
    showToast('Both school slots are full for this day');
    return;
  }

  // First option write
  let firstData;
  if (selectedRecipeId) {
    firstData = { recipeId: selectedRecipeId, source: 'manual' };
  } else {
    const match = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === typed.toLowerCase());
    if (match) {
      selectedRecipeId = match[0];
      firstData = { recipeId: match[0], source: 'manual' };
    } else {
      firstData = { customName: typed, source: 'manual' };
    }
  }
  await writeKitchenPlanSlot(day, concreteSlot, firstData);

  // Optional second option (only relevant for school slot, when secondOpen and the OTHER school slot is free).
  if (selectedSlot === 'school' && secondOpen && (secondRecipeId || secondTypedName)) {
    const secondSlot = concreteSlot === 'school-lunch' ? 'school-lunch-2' : 'school-lunch';
    let secondData;
    if (secondRecipeId) {
      secondData = { recipeId: secondRecipeId, source: 'manual' };
    } else {
      const match = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === secondTypedName.toLowerCase());
      secondData = match ? { recipeId: match[0], source: 'manual' } : { customName: secondTypedName, source: 'manual' };
    }
    await writeKitchenPlanSlot(day, secondSlot, secondData);
  }

  // Bump lastUsed on chosen recipes
  if (selectedRecipeId) {
    await writeKitchenRecipe(selectedRecipeId, { ...recipes[selectedRecipeId], lastUsed: firebase.database.ServerValue.TIMESTAMP });
    recipes[selectedRecipeId].lastUsed = Date.now();
  }
  if (secondRecipeId) {
    await writeKitchenRecipe(secondRecipeId, { ...recipes[secondRecipeId], lastUsed: firebase.database.ServerValue.TIMESTAMP });
    recipes[secondRecipeId].lastUsed = Date.now();
  }

  mount.innerHTML = '';
  await renderMealsTab();
  showToast('Meal planned');
});
```

- [ ] **Step 5: Add CSS for the second-school section**

Append to [styles/kitchen.css](../../../styles/kitchen.css):
```css
.kp-second-school { display: none; }
.kp-second-school.is-visible { display: block; padding-top: var(--spacing-sm); }
.kp-second-meal { display: none; padding-top: var(--spacing-xs); }
.kp-second-meal.is-open { display: block; }
```

- [ ] **Step 6: Verify in browser**

Reload kitchen, FAB → Plan-a-meal:
1. Pick a date with no school slots planned. Select `School`. Pick a recipe. Confirm `+ Plan a second School option` chip appears below the meal-select.
2. Tap it. Confirm a second meal-select appears.
3. Pick a 2nd recipe. Save. Confirm BOTH `school-lunch` and `school-lunch-2` are populated for that day (verify via Firebase console or via re-opening the day on the Meals tab — both rows should now show).
4. Pick a date where one school slot is already taken. Select `School`, pick a recipe, save. Confirm the new entry lands in the FREE slot.
5. Pick a date where both school slots are taken. Select `School` — the Save button still works, but Save triggers the "Both school slots are full" toast.

- [ ] **Step 7: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): school-slot auto-allocation + inline second-option

Plan-a-meal save resolves the virtual 'school' slot to school-lunch or
school-lunch-2 based on day state. When the user picks School and adds
a second option, both writes land in one save.
"
```

---

## Task 3: Dynamic SCHOOL / SCHOOL 1 / SCHOOL 2 label rule

Per spec §5: the slot label adapts to what's planned for the day.

**Files:**
- Modify: [kitchen.js:266-336](../../../kitchen.js#L266-L336) — `renderMealsTab`

- [ ] **Step 1: Add label helper above `renderMealsTab`**

Insert at [kitchen.js:265](../../../kitchen.js#L265):
```js
// Returns the display label for a school-lunch slot key given the day's plan.
// SCHOOL when only one of the two is planned; SCHOOL 1 / SCHOOL 2 when both.
function getSchoolSlotLabel(slotKey, dayPlan) {
  const hasOne = !!dayPlan?.['school-lunch'];
  const hasTwo = !!dayPlan?.['school-lunch-2'];
  if (hasOne && hasTwo) {
    return slotKey === 'school-lunch' ? 'School 1' : 'School 2';
  }
  return 'School';
}
```

- [ ] **Step 2: Use helper in slot row rendering**

Find the slotsHtml block at [kitchen.js:295-307](../../../kitchen.js#L295-L307). Replace its inner map:
```js
const plannedSlots = SLOT_ORDER.filter(s => plan[s]);
const slotsHtml = plannedSlots.length > 0
  ? plannedSlots.map(s => {
      const entry = plan[s];
      const name = entry.recipeId ? (recipes[entry.recipeId]?.name || 'Unknown') : (entry.mealName || entry.customName || '');
      const label = (s === 'school-lunch' || s === 'school-lunch-2')
        ? getSchoolSlotLabel(s, plan).toUpperCase()
        : SLOT_LABELS[s].toUpperCase();
      return `<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
        <span class="day-block__slot-label">${esc(label)}</span>
        <span class="day-block__slot-name">${esc(name)}</span>
      </div>`;
    }).join('')
  : `<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
      <span class="day-block__slot-name day-block__slot-name--empty">Tap to plan</span>
    </div>`;
```

- [ ] **Step 3: Also update `openSlotEditSheet` to use dynamic label**

Find at [kitchen.js:640](../../../kitchen.js#L640):
```js
<span class="chip">${esc(SLOT_LABELS[slot] || slot)}</span>
```

Replace with:
```js
${(() => {
  const labelOverride = (slot === 'school-lunch' || slot === 'school-lunch-2')
    ? getSchoolSlotLabel(slot, planCache[dk] || {})
    : SLOT_LABELS[slot] || slot;
  return `<span class="chip">${esc(labelOverride)}</span>`;
})()}
```

- [ ] **Step 4: Verify in browser**

Reload Meals tab.
- A day with only `school-lunch` planned → label reads `SCHOOL` (not `SCHOOL 1`).
- A day with both school slots planned → labels read `SCHOOL 1` and `SCHOOL 2`.
- Tap a school-slot to open the edit sheet → chip reads matching label.

(If your real data already has both school slots populated on most weekdays per the baseline screenshot, you may need to remove one entry temporarily via the slot-edit sheet to verify the SCHOOL fallback.)

- [ ] **Step 5: Commit**

```bash
git add kitchen.js
git commit -m "feat(kitchen): dynamic SCHOOL / SCHOOL 1 + 2 slot labels

Label collapses to 'SCHOOL' when only one school slot is planned per
day; expands to 'SCHOOL 1' / 'SCHOOL 2' when both are populated. Applied
on Meals tab day blocks and slot-edit sheet chip.
"
```

---

## Task 4: Day-block — recipe thumbnails on planned slots

Per spec §1: 32×32 thumbnail (image when `imageUrl` exists, 🍴 placeholder otherwise) on the leading edge of every planned slot row.

**Files:**
- Modify: [kitchen.js:295-307](../../../kitchen.js#L295-L307) — slot rendering inside `renderMealsTab`
- Modify: [styles/kitchen.css:62-99](../../../styles/kitchen.css#L62-L99) — `.day-block__slot` rules

- [ ] **Step 1: Add `buildSlotThumb` helper above `renderMealsTab`**

Insert at [kitchen.js:265](../../../kitchen.js#L265) (next to `getSchoolSlotLabel`):
```js
// 32×32 thumb for a planned slot entry. Falls back to 🍴 placeholder.
// `entry` is null for the always-on Dinner empty state (returns spacer).
function buildSlotThumb(entry) {
  if (!entry) {
    return `<span class="day-block__slot-thumb day-block__slot-thumb--spacer" aria-hidden="true"></span>`;
  }
  const recipe = entry.recipeId ? recipes[entry.recipeId] : null;
  if (recipe?.imageUrl) {
    return `<img class="day-block__slot-thumb" src="${esc(recipe.imageUrl)}" alt="" loading="lazy">`;
  }
  return `<span class="day-block__slot-thumb day-block__slot-thumb--placeholder" aria-hidden="true">🍴</span>`;
}
```

- [ ] **Step 2: Update slot row markup to include thumb**

Modify the slot-row HTML in `renderMealsTab` to include `${buildSlotThumb(entry)}` as the leading element:
```js
return `<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
  ${buildSlotThumb(entry)}
  <span class="day-block__slot-label">${esc(label)}</span>
  <span class="day-block__slot-name">${esc(name)}</span>
</div>`;
```

- [ ] **Step 3: Replace day-block slot CSS**

In [styles/kitchen.css:62-99](../../../styles/kitchen.css#L62-L99), replace the `.day-block__slot` rules with:
```css
.day-block__slots {
  padding: var(--spacing-xs) 0;
}

.day-block__slot {
  padding: 6px var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 44px;
  cursor: pointer;
  transition: background var(--t-fast);
}

.day-block__slot:active {
  background: var(--surface-2);
}

.day-block__slot-thumb {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  font-size: 18px;
}

.day-block__slot-thumb--spacer {
  background: transparent;
}

.day-block__slot-thumb--placeholder {
  /* falls back to surface-2 from base + emoji centered */
}

.day-block__slot-label {
  font-size: var(--font-xs);
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
  width: 72px;
  flex-shrink: 0;
}

.day-block__slot-name {
  font-size: var(--font-sm);
  color: var(--text);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-block__slot-name--empty {
  color: var(--accent-ink);
  font-style: normal;  /* override prior italic */
}
```

- [ ] **Step 4: Verify in browser**

Reload Meals. Each planned slot row now shows a 32×32 thumb (recipe image when available, 🍴 placeholder otherwise) followed by the label and name. Row height ~44px each. Layout aligned, no overflow.

- [ ] **Step 5: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): thumbnails on planned meal slot rows

32×32 thumb leads each slot row. Uses recipe.imageUrl when present,
falls back to 🍴 placeholder for custom names or thumbnail-less recipes.
"
```

---

## Task 5: Day-block — always-render Dinner row with empty-state CTA

Per spec §1: every day always renders a Dinner row whether planned or not. The empty Dinner row shows `Plan dinner ›` in accent-ink with chevron.

**Files:**
- Modify: [kitchen.js:295-316](../../../kitchen.js#L295-L316) — slot rendering inside `renderMealsTab`

- [ ] **Step 1: Replace `slotsHtml` block with Dinner-always logic**

In `renderMealsTab`, replace the `plannedSlots`/`slotsHtml` block ([kitchen.js:295-307](../../../kitchen.js#L295-L307)) with:
```js
// Order: planned non-dinner slots (in SLOT_ORDER), then Dinner always last.
const nonDinnerPlanned = SLOT_ORDER.filter(s => s !== 'dinner' && plan[s]);
const dinnerEntry = plan.dinner || null;

const slotRows = [];
for (const s of nonDinnerPlanned) {
  const entry = plan[s];
  const name = entry.recipeId ? (recipes[entry.recipeId]?.name || 'Unknown') : (entry.mealName || entry.customName || '');
  const label = (s === 'school-lunch' || s === 'school-lunch-2')
    ? getSchoolSlotLabel(s, plan).toUpperCase()
    : SLOT_LABELS[s].toUpperCase();
  slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
    ${buildSlotThumb(entry)}
    <span class="day-block__slot-label">${esc(label)}</span>
    <span class="day-block__slot-name">${esc(name)}</span>
  </div>`);
}

// Dinner row — always rendered. Empty state when not planned.
if (dinnerEntry) {
  const dinnerName = dinnerEntry.recipeId ? (recipes[dinnerEntry.recipeId]?.name || 'Unknown') : (dinnerEntry.mealName || dinnerEntry.customName || '');
  slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
    ${buildSlotThumb(dinnerEntry)}
    <span class="day-block__slot-label">DINNER</span>
    <span class="day-block__slot-name">${esc(dinnerName)}</span>
  </div>`);
} else {
  slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
    ${buildSlotThumb(null)}
    <span class="day-block__slot-label">DINNER</span>
    <span class="day-block__slot-name day-block__slot-name--empty">Plan dinner <span aria-hidden="true">›</span></span>
  </div>`);
}

const slotsHtml = slotRows.join('');
```

- [ ] **Step 2: Verify in browser**

Reload Meals.
- Every day shows a `DINNER` row, even days that previously had no plan at all.
- Days with planned dinner show the recipe thumb + name.
- Days without planned dinner show the placeholder thumb + `Plan dinner ›` in accent color.
- Tap the empty Dinner row → opens Plan-a-meal pre-set to Dinner.
- Tap a planned Dinner row → opens the slot-edit sheet.

- [ ] **Step 3: Commit**

```bash
git add kitchen.js
git commit -m "feat(kitchen): always-render Dinner row on Meals tab

Dinner row renders for every day whether planned or not. Empty state
shows 'Plan dinner ›' in accent-ink. Other slots (breakfast/lunch/snack/
school) still render only when planned per spec.
"
```

---

## Task 6: Day-block — per-day `+` add button + today emphasis

Per spec §1 + §2: Right-aligned `+` button on day-header that opens Plan-a-meal with no slot pre-selected. Today's day-header background gets `--accent-soft` treatment.

**Files:**
- Modify: [kitchen.js:309-315](../../../kitchen.js#L309-L315) — day-header HTML
- Modify: [kitchen.js:327-335](../../../kitchen.js#L327-L335) — click handler
- Modify: [styles/kitchen.css:36-60](../../../styles/kitchen.css#L36-L60) — day-header styles

- [ ] **Step 1: Update day-header HTML**

Replace the day-header block at [kitchen.js:309-315](../../../kitchen.js#L309-L315) with:
```js
return `<div class="day-block">
  <div class="day-block__head${isToday ? ' day-block__head--today' : ''}">
    <span class="day-block__head-text">${dayName} ${dayMonth} ${dayNum}</span>
    ${isToday ? '<span class="day-block__today-pill">Today</span>' : ''}
    <button class="day-block__add" data-add-date="${esc(dk)}" type="button" aria-label="Add a meal for ${dayName} ${dayMonth} ${dayNum}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  </div>
  <div class="day-block__slots">${slotsHtml}</div>
</div>`;
```

- [ ] **Step 2: Wire `+` click handler**

After the existing slot-click binding at [kitchen.js:327-335](../../../kitchen.js#L327-L335), add:
```js
content.querySelectorAll('[data-add-date]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dk = btn.dataset.addDate;
    // Open Plan-a-meal with no slot pre-selected; user picks from picker.
    openPlanMealSheet(dk, null);
  });
});
```

- [ ] **Step 3: Allow `null` slot in `openPlanMealSheet`**

In `openPlanMealSheet` at [kitchen.js:440](../../../kitchen.js#L440), find the `selectedSlot` initializer:
```js
let selectedSlot = PLAN_SLOT_ORDER.includes(preSlot) ? preSlot : 'dinner';
```

Change to:
```js
let selectedSlot = PLAN_SLOT_ORDER.includes(preSlot) ? preSlot : (preSlot === null ? null : 'dinner');
```

And update the slot-pills HTML so no pill is active when `selectedSlot` is null:
```js
${PLAN_SLOT_ORDER.map(s => {
  const isOccupied = s === 'school'
    ? !!(planCache[preDate]?.['school-lunch'] && planCache[preDate]?.['school-lunch-2'])
    : !!planCache[preDate]?.[s];
  return `<button class="tab${s === selectedSlot ? ' is-active' : ''}${isOccupied ? ' is-occupied' : ''}" data-slot="${esc(s)}" type="button">${esc(SLOT_LABELS[s])}</button>`;
}).join('')}
```

Disable the save button when slot is null (in addition to the existing recipe/typed check):
```js
${renderFormFooter({ saveLabel: 'Save', cancelId: 'kp_cancel', saveId: 'kp_save', disabled: !selectedSlot || !(preRecipeName || selectedRecipeId) })}
```

Update `updateSaveBtn` similarly:
```js
function updateSaveBtn() {
  const val = document.getElementById('kp_search')?.value.trim();
  document.getElementById('kp_save').disabled = !selectedSlot || !(val || selectedRecipeId);
}
```

- [ ] **Step 4: Replace day-header CSS**

In [styles/kitchen.css:36-60](../../../styles/kitchen.css#L36-L60), replace `.day-block__head` rules with:
```css
.day-block__head {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.day-block__head--today {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.day-block__head-text {
  flex: 1;
  min-width: 0;
}

.day-block__today-pill {
  font-size: var(--font-xs);
  font-weight: 700;
  background: var(--surface);
  color: var(--accent-ink);
  border-radius: var(--radius-full);
  padding: 1px 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.day-block__add {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--t-fast), color var(--t-fast);
}

.day-block__head--today .day-block__add {
  color: var(--accent-ink);
}

.day-block__add:active {
  background: var(--surface-2);
}
```

- [ ] **Step 5: Verify in browser**

Reload Meals.
- Every day-header has a `+` button on the right edge.
- Tap it → Plan-a-meal opens with NO slot pill active. Save button disabled until you pick both a slot and a meal.
- Today's day-header has the soft-accent background; other days don't.

- [ ] **Step 6: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): per-day + button + today-emphasis header

Day-header gains a right-aligned + button that opens Plan-a-meal with
no slot pre-selected. Today's day-header background is accent-soft.
Plan-a-meal accepts a null preSlot now.
"
```

---

## Task 7: Remove week swipe + pagination

Per spec §2: rolling 7 days from today only. No swipe, no back/forward pagination.

**Files:**
- Modify: [kitchen.js:271-326](../../../kitchen.js#L271-L326) — `renderMealsTab` pagination state
- Modify: [kitchen.js:418-438](../../../kitchen.js#L418-L438) — `bindWeekStripSwipe`
- Modify: [kitchen.js:113](../../../kitchen.js#L113) — `currentWeekStart` state

- [ ] **Step 1: Remove `bindWeekStripSwipe` function**

Delete the function definition at [kitchen.js:418-438](../../../kitchen.js#L418-L438) entirely.

- [ ] **Step 2: Remove `currentWeekStart` global state**

Delete [kitchen.js:113](../../../kitchen.js#L113):
```js
let currentWeekStart = null; // Monday of the displayed week (Date object)
```

- [ ] **Step 3: Update `renderMealsTab` to compute days from today**

Replace the start of `renderMealsTab` at [kitchen.js:266-285](../../../kitchen.js#L266-L285) with:
```js
async function renderMealsTab() {
  const content = document.getElementById('kitchenContent');
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);

  // Rolling 7 days starting today — no pagination.
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const planData = await Promise.all(weekDays.map(d => readKitchenPlan(dateKey(d)).then(r => r || {})));
  const weekPlan = {};
  weekDays.forEach((d, i) => { weekPlan[dateKey(d)] = planData[i]; });
  planCache = weekPlan;
```

- [ ] **Step 4: Remove call to `bindWeekStripSwipe`**

Delete the call at [kitchen.js:325](../../../kitchen.js#L325):
```js
bindWeekStripSwipe();
```

- [ ] **Step 5: Remove `currentWeekStart` reference in FAB binding**

Find at [kitchen.js:233-236](../../../kitchen.js#L233-L236):
```js
if (activeTab === 'meals') {
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);
  const weekStr = currentWeekStart ? dateKey(currentWeekStart) : todayStr;
  const defaultDate = weekStr > todayStr ? weekStr : todayStr;
  openPlanMealSheet(defaultDate, 'dinner');
}
```

Replace with:
```js
if (activeTab === 'meals') {
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);
  openPlanMealSheet(todayStr, 'dinner');
}
```

- [ ] **Step 6: Update CSS — remove transform-based week paging**

In [styles/kitchen.css:16-19](../../../styles/kitchen.css#L16-L19) and surrounding rules, simplify:
```css
.week-strip {
  /* Static container — no pagination, no swipe. */
}

.week-strip__week {
  padding: var(--spacing-md) 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
```

(Delete `.week-strip__track` rule entirely — there's only one week.)

Update the HTML in `renderMealsTab` ([kitchen.js:318-322](../../../kitchen.js#L318-L322)) to drop the track wrapper:
```js
content.innerHTML = `
  <div class="week-strip" id="weekStrip">
    <div class="week-strip__week">${weekHtml}</div>
  </div>`;
```

- [ ] **Step 7: Verify in browser**

Reload Meals.
- Strip shows today + next 6 days. No swipe response (try horizontal swipe → page does not change).
- Pull-to-refresh and vertical scroll still work normally.

- [ ] **Step 8: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "refactor(kitchen): drop week swipe + pagination

Meals tab is a fixed rolling-7-days-from-today view. Past meals will
land in the meal history view (SP4). currentWeekStart state and
bindWeekStripSwipe removed.
"
```

---

## Task 8: AI Tools sheet — magic-wand button on Kitchen tabs row

Per spec §2 + §3: a right-aligned magic-wand button next to the Kitchen tabs that opens the AI Tools bottom sheet.

**Files:**
- Modify: [kitchen.js:199-218](../../../kitchen.js#L199-L218) — `renderTabs`
- Modify: [styles/kitchen.css:4-7](../../../styles/kitchen.css#L4-L7) — `#kitchenTabsMount` styles

- [ ] **Step 1: Update `renderTabs` to include the wand button**

Replace `renderTabs` at [kitchen.js:199-218](../../../kitchen.js#L199-L218) with:
```js
function renderTabs() {
  const tabs = ['meals', 'recipes', 'lists'];
  const labels = { meals: 'Meals', recipes: 'Recipes', lists: 'Lists' };
  const wandSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>`;
  document.getElementById('kitchenTabsMount').innerHTML = `
    <div class="kitchen-tabs-row">
      <nav class="tabs tabs--pill tabs--md" id="kitchenTabs">
        ${tabs.map(t => `
          <button class="tab${t === activeTab ? ' is-active' : ''}" data-tab="${t}" type="button">
            ${esc(labels[t])}
          </button>`).join('')}
      </nav>
      <button class="kitchen-aitools-btn" id="kitchenAiToolsBtn" type="button" aria-label="Kitchen AI tools">
        ${wandSvg}
      </button>
    </div>`;
  document.getElementById('kitchenTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    localStorage.setItem('dr-kitchen-tab', activeTab);
    renderTabs();
    renderActiveTab();
    bindFab();
  });
  document.getElementById('kitchenAiToolsBtn')?.addEventListener('click', openKitchenAiToolsSheet);
}
```

- [ ] **Step 2: Add `openKitchenAiToolsSheet` stub**

Insert near the end of kitchen.js (above the closing IIFE if any), before `init()` is called:
```js
function openKitchenAiToolsSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Kitchen AI tools', closeId: 'kait_close' })}
    <div class="kait-section">
      <div class="kait-section__label">SCHOOL LUNCH</div>
      <div class="kait-grid">
        <button class="btn btn--secondary" id="kait_schoolPhoto" type="button">📷 Take photo</button>
        <button class="btn btn--secondary" id="kait_schoolGallery" type="button">🖼 From gallery</button>
        <button class="btn btn--secondary" id="kait_schoolFile" type="button">📄 Upload file</button>
        <button class="btn btn--secondary" id="kait_schoolIcal" type="button">🔗 iCal feed</button>
      </div>
    </div>
    <div class="kait-section">
      <div class="kait-section__label">RECIPES</div>
      <div class="kait-soon">Coming in the next Kitchen update</div>
    </div>
  `);
  activateSheet(mount);
  document.getElementById('kait_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  // School lunch handlers wired in Tasks 9-11.
}
```

- [ ] **Step 3: Add CSS for the tab row + wand button + AI tools sheet**

Append to [styles/kitchen.css](../../../styles/kitchen.css):
```css
.kitchen-tabs-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0 0;
}

.kitchen-tabs-row .tabs {
  flex: 1;
  min-width: 0;
}

.kitchen-aitools-btn {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
  flex-shrink: 0;
}

.kitchen-aitools-btn:hover,
.kitchen-aitools-btn:focus-visible {
  color: var(--accent);
  background: var(--surface-2);
  outline: none;
}

.kait-section {
  padding-top: var(--spacing-md);
}

.kait-section__label {
  font-size: var(--font-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: var(--spacing-sm);
}

.kait-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}

.kait-soon {
  font-size: var(--font-sm);
  color: var(--text-faint);
  font-style: italic;
}
```

Also drop the top-padding from `#kitchenTabsMount` since the new `.kitchen-tabs-row` owns it:
```css
#kitchenTabsMount {
  /* padding moved into .kitchen-tabs-row */
}
```

- [ ] **Step 4: Verify in browser**

Reload Kitchen. Tabs row shows `Meals | Recipes | Lists` left-aligned + magic-wand icon button right-aligned. Tap wand → "Kitchen AI tools" sheet opens with SCHOOL LUNCH (4 buttons) + RECIPES (coming-soon hint). Buttons are not yet wired beyond visual.

- [ ] **Step 5: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): AI Tools bottom sheet + tabs-row wand button

Magic-wand button right-aligned on the Kitchen tabs row opens a global
'Kitchen AI tools' sheet with SCHOOL LUNCH (4 buttons, not yet wired)
and a RECIPES coming-soon placeholder (wired up in sub-project 2).
"
```

---

## Task 9: AI Tools — school-lunch photo / gallery / file actions

Per spec §3: reuse existing Worker `schoolLunch` handler + existing confirm-row pipeline. Bind three of the four AI Tools buttons.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `openKitchenAiToolsSheet` (extend handlers)

- [ ] **Step 1: Extract a shared `runSchoolLunchImport(file)` helper**

Insert above `openKitchenAiToolsSheet`:
```js
async function runSchoolLunchImport(file) {
  if (!file) return;
  const mount = document.getElementById('sheetMount');

  // Show a loading sheet immediately while we work
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header"><h2 class="sheet__title">Extracting school lunch menu…</h2></div>
    <div class="sheet__content"><p style="color:var(--text-muted)">This usually takes 10–20 seconds.</p></div>
  `);
  activateSheet(mount);

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'schoolLunch', input: { base64, mediaType: file.type || 'image/jpeg' } }),
    });
    const data = await res.json();
    if (!data?.entries?.length) {
      mount.innerHTML = '';
      showToast('Could not read the menu — try a clearer photo');
      return;
    }
    openSchoolLunchConfirmSheet(data.entries);
  } catch (err) {
    console.error('school-lunch import failed', err);
    mount.innerHTML = '';
    showToast('Import failed — try again');
  }
}
```

- [ ] **Step 2: Add `openSchoolLunchConfirmSheet`**

Insert directly below `runSchoolLunchImport`:
```js
function openSchoolLunchConfirmSheet(entries) {
  const mount = document.getElementById('sheetMount');
  // entries: [{ date: 'YYYY-MM-DD', name: 'Crispy Chicken Sandwich', slot: 'school-lunch' | 'school-lunch-2' }]
  // Default all to checked.
  const working = entries.map((e, i) => ({ ...e, checked: true, idx: i }));

  function rows() {
    return working.map(e => `
      <div class="sl-confirm-row${e.checked ? '' : ' is-unchecked'}" data-idx="${e.idx}">
        <button class="ral-check" data-toggle="${e.idx}" type="button" aria-label="${e.checked ? 'Skip' : 'Include'}">
          ${e.checked
            ? `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="var(--accent)"/><path d="M6.5 11l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="var(--border)" stroke-width="1.5"/></svg>`}
        </button>
        <span class="sl-confirm-date">${esc(e.date)}</span>
        <input class="sl-confirm-name" data-name="${e.idx}" type="text" value="${esc(e.name)}">
      </div>`).join('');
  }

  function bindRows() {
    mount.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.toggle, 10);
        const entry = working.find(e => e.idx === i);
        if (entry) entry.checked = !entry.checked;
        mount.querySelector('#sl_list').innerHTML = rows();
        bindRows();
      });
    });
    mount.querySelectorAll('[data-name]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.dataset.name, 10);
        const entry = working.find(e => e.idx === i);
        if (entry) entry.name = inp.value;
      });
    });
  }

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: `Import ${entries.length} lunches`, closeId: 'sl_close' })}
    <div class="sl-confirm-list" id="sl_list">${rows()}</div>
    ${renderFormFooter({ saveLabel: `Import`, cancelId: 'sl_cancel', saveId: 'sl_save' })}
  `);
  activateSheet(mount);
  bindRows();

  document.getElementById('sl_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('sl_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('sl_save')?.addEventListener('click', async () => {
    const accepted = working.filter(e => e.checked && e.name.trim() && e.date);
    let count = 0;
    for (const e of accepted) {
      // Allocate concrete slot: school-lunch first, then school-lunch-2 if taken.
      const dayPlan = await readKitchenPlan(e.date).catch(() => null) || {};
      let target;
      if (e.slot === 'school-lunch-2') {
        // Worker explicitly assigned slot 2 (e.g., second option in menu).
        target = dayPlan['school-lunch-2'] ? null : 'school-lunch-2';
      } else {
        target = !dayPlan['school-lunch'] ? 'school-lunch' : (!dayPlan['school-lunch-2'] ? 'school-lunch-2' : null);
      }
      if (!target) continue;
      await writeKitchenPlanSlot(e.date, target, { customName: e.name.trim(), source: 'school-photo' });
      count++;
    }
    mount.innerHTML = '';
    await renderMealsTab();
    showToast(`Imported ${count} lunch${count === 1 ? '' : 'es'}`);
  });
}
```

- [ ] **Step 3: Wire the three buttons (photo / gallery / file)**

Replace the comment line `// School lunch handlers wired in Tasks 9-11.` in `openKitchenAiToolsSheet` with:
```js
// Hidden file inputs for the three sources
const fileSources = {
  photo:   { accept: 'image/*', capture: 'environment' },
  gallery: { accept: 'image/*', capture: undefined },
  file:    { accept: '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif', capture: undefined },
};
function openFilePicker(kind) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = fileSources[kind].accept;
  if (fileSources[kind].capture) input.capture = fileSources[kind].capture;
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) runSchoolLunchImport(file);
  };
  input.click();
}

document.getElementById('kait_schoolPhoto')?.addEventListener('click', () => openFilePicker('photo'));
document.getElementById('kait_schoolGallery')?.addEventListener('click', () => openFilePicker('gallery'));
document.getElementById('kait_schoolFile')?.addEventListener('click', () => openFilePicker('file'));
// kait_schoolIcal handler wired in Task 12.
```

- [ ] **Step 4: Add CSS for the confirm sheet**

Append to [styles/kitchen.css](../../../styles/kitchen.css):
```css
.sl-confirm-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding-bottom: var(--spacing-md);
}
.sl-confirm-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 0;
  transition: opacity var(--t-fast);
}
.sl-confirm-row.is-unchecked { opacity: 0.4; }
.sl-confirm-date {
  width: 84px;
  flex-shrink: 0;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.sl-confirm-name {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: var(--font-sm);
  padding: 4px 8px;
}
.sl-confirm-name:focus { outline: none; border-color: var(--accent); }
```

- [ ] **Step 5: Verify in browser**

Reload Kitchen → tap wand → AI Tools sheet → `From gallery` (or `Upload file` if testing on desktop without a camera). Pick a school-lunch menu image. The extraction sheet should load, then the confirm sheet should show parsed entries. Uncheck/edit a row to confirm interactivity. Tap Import → entries land on the Meals tab as `SCHOOL` rows on the right dates.

If `entries` from the Worker has unexpected shape, surface it via console — adjust the parser-side later if needed.

- [ ] **Step 6: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): school lunch import via photo / gallery / file in AI Tools

Three AI Tools buttons (Take photo / From gallery / Upload file) feed
the existing schoolLunch Worker handler and surface a confirm sheet
where each entry can be edited/unchecked before writing to kitchenPlan.
"
```

---

## Task 10: New Firebase exports for school-lunch iCal feed schema

Per spec §4: new branch `rundown/kitchen/schoolLunchFeeds/{personId}`.

**Files:**
- Modify: [shared/firebase.js](../../../shared/firebase.js) — add four exports

- [ ] **Step 1: Add exports at the bottom of the kitchen-related export section**

Locate the existing `readKitchenLists` / `writeKitchenList` / etc. block in [shared/firebase.js](../../../shared/firebase.js). Append:
```js
export function readSchoolLunchFeeds() {
  return readOnce(`${ROOT}/kitchen/schoolLunchFeeds`);
}

export function writeSchoolLunchFeed(personId, data) {
  return getDb().ref(`${ROOT}/kitchen/schoolLunchFeeds/${personId}`).update(data);
}

export function removeSchoolLunchFeed(personId) {
  return getDb().ref(`${ROOT}/kitchen/schoolLunchFeeds/${personId}`).remove();
}

export function writeSchoolLunchFeedSync(personId, payload) {
  // payload: { lastSync: number, lastError: string|null, conflicts?: object }
  return getDb().ref(`${ROOT}/kitchen/schoolLunchFeeds/${personId}`).update(payload);
}
```

(Adjust the constant name `ROOT` to whatever the file actually uses — likely `'rundown'` directly or a variable. Match existing patterns.)

- [ ] **Step 2: Verify import resolves**

In the browser console at `http://localhost:8080/kitchen.html`:
```js
import('/shared/firebase.js').then(m => console.log(typeof m.readSchoolLunchFeeds, typeof m.writeSchoolLunchFeed));
```

Expected: both log as `'function'`. (Modules are statically imported in kitchen.js but the dynamic-import is just a runtime sanity check.)

- [ ] **Step 3: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(firebase): school-lunch iCal feed read/write exports

New schema branch rundown/kitchen/schoolLunchFeeds/{personId} with
url + lastSync + lastError fields. Used by the AI Tools iCal setup
sheet and the client-side sync orchestrator.
"
```

---

## Task 11: New iCal module — fetcher + parser + mapper

Per spec §4: client-side iCal fetcher with conflict-aware mapping.

**Files:**
- Create: [shared/kitchen-ical.js](../../../shared/kitchen-ical.js)

- [ ] **Step 1: Create the module**

Write:
```js
// shared/kitchen-ical.js
// Client-side iCal fetcher + parser for school lunch feeds.
// Public feeds (Nutrislice etc.) are CORS-safe; some districts block CORS and would
// require a Worker proxy (deferred per spec).

// Minimal iCal parser. Handles VEVENT blocks, DTSTART (DATE or DATE-TIME), SUMMARY,
// folded continuation lines, basic escaping. Skipping VTIMEZONE — DTSTART;VALUE=DATE
// is what school feeds use in practice.
export function parseIcs(text) {
  const events = [];
  const lines = unfold(text).split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.date && current?.summary) events.push({ ...current });
      current = null;
      continue;
    }
    if (!current) continue;

    // Property line: "KEY[;params]:VALUE"
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = left.split(';')[0];

    if (key === 'DTSTART') {
      const v = value.replace(/[^0-9TZ]/g, '');
      const y = v.slice(0, 4), m = v.slice(4, 6), d = v.slice(6, 8);
      if (y && m && d) current.date = `${y}-${m}-${d}`;
    } else if (key === 'SUMMARY') {
      current.summary = unescape(value);
    }
  }
  return events;
}

function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function unescape(s) {
  return s.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n').replace(/\\\\/g, '\\');
}

// Map iCal events to kitchen plan entries for the next 30 days from today.
// Returns: [{ date, summary, target: 'school-lunch' | 'school-lunch-2' | null, conflictType?: string }]
export function mapEventsToPlan(events, currentPlanByDate, todayStr) {
  // 30-day forward window
  const todayDate = new Date(todayStr + 'T00:00:00');
  const endDate = new Date(todayDate);
  endDate.setDate(endDate.getDate() + 30);

  // Sort events by date so dup-events on same date go 1 → 2
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  // Track seen dates so a second event on the same date routes to school-lunch-2
  const usedSlot1 = new Set();
  const usedSlot2 = new Set();
  const out = [];

  for (const ev of sorted) {
    if (!ev.date || ev.date < todayStr) continue;
    if (new Date(ev.date + 'T00:00:00') >= endDate) continue;
    const dayPlan = currentPlanByDate[ev.date] || {};

    let target = null;
    let conflictType = null;

    // Slot 1 strategy
    if (!dayPlan['school-lunch'] && !usedSlot1.has(ev.date)) {
      target = 'school-lunch';
      usedSlot1.add(ev.date);
    } else if (dayPlan['school-lunch'] && dayPlan['school-lunch'].source === 'ical') {
      // Overwrite our own previous ical entry
      target = 'school-lunch';
    } else if (!dayPlan['school-lunch-2'] && !usedSlot2.has(ev.date)) {
      target = 'school-lunch-2';
      usedSlot2.add(ev.date);
    } else if (dayPlan['school-lunch-2'] && dayPlan['school-lunch-2'].source === 'ical') {
      target = 'school-lunch-2';
    } else {
      target = null;
      conflictType = dayPlan['school-lunch']?.source || 'unknown';
    }

    out.push({ date: ev.date, summary: ev.summary, target, conflictType });
  }
  return out;
}
```

- [ ] **Step 2: Sanity-check parser**

In the kitchen page's browser console:
```js
import('/shared/kitchen-ical.js').then(m => {
  const test = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260512
SUMMARY:Crispy Chicken Patty Sandwich
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260512
SUMMARY:Turkey & Cheese
END:VEVENT
END:VCALENDAR`;
  console.log(m.parseIcs(test));
});
```

Expected: `[{ date: '2026-05-12', summary: 'Crispy Chicken Patty Sandwich' }, { date: '2026-05-12', summary: 'Turkey & Cheese' }]`.

- [ ] **Step 3: Commit**

```bash
git add shared/kitchen-ical.js
git commit -m "feat(kitchen): client-side iCal parser + plan-mapper for school lunches

parseIcs handles VEVENT/DTSTART/SUMMARY with line unfolding and value
escaping. mapEventsToPlan allocates each event to school-lunch or
school-lunch-2 honoring manual/photo entries (conflicts surface as
null target + conflictType).
"
```

---

## Task 12: iCal feed setup sub-sheet

Per spec §4: bottom sheet listing existing feeds + add/edit/remove + sync-now.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — new `openSchoolLunchIcalSheet`

- [ ] **Step 1: Import the iCal module**

Add to the import block at the top of kitchen.js:
```js
import { parseIcs, mapEventsToPlan } from './shared/kitchen-ical.js';
import {
  readSchoolLunchFeeds, writeSchoolLunchFeed, removeSchoolLunchFeed, writeSchoolLunchFeedSync
} from './shared/firebase.js';
```

(Add `readSchoolLunchFeeds, writeSchoolLunchFeed, removeSchoolLunchFeed, writeSchoolLunchFeedSync` to the existing `from './shared/firebase.js'` import block rather than a separate line.)

- [ ] **Step 2: Add `openSchoolLunchIcalSheet`**

Insert above `openKitchenAiToolsSheet`:
```js
async function openSchoolLunchIcalSheet() {
  const mount = document.getElementById('sheetMount');
  const feeds = (await readSchoolLunchFeeds()) || {};

  function rowsHtml() {
    const peopleById = Object.fromEntries(people.map(p => [p.id, p]));
    const entries = Object.entries(feeds);
    if (!entries.length) return `<div class="sli-empty">No feeds yet. Tap "+ Add a feed" to start.</div>`;
    return entries.map(([personId, f]) => {
      const person = peopleById[personId];
      const host = (() => { try { return new URL(f.url).hostname.replace(/^www\./, ''); } catch { return f.url; } })();
      const lastSync = f.lastSync ? new Date(f.lastSync).toLocaleString() : 'Never';
      const conflictCount = f.conflicts ? Object.keys(f.conflicts).length : 0;
      const conflictChip = conflictCount
        ? `<span class="sli-conflicts">${conflictCount} conflict${conflictCount === 1 ? '' : 's'}</span>`
        : '';
      return `<div class="sli-row" data-person="${esc(personId)}">
        <div class="sli-row__title">${esc(person?.name || 'Unknown')} · ${esc(host)} ${conflictChip}</div>
        <div class="sli-row__meta">Last sync: ${esc(lastSync)}${f.lastError ? ` · <span class="sli-err">${esc(f.lastError)}</span>` : ''}</div>
        <div class="sli-row__actions">
          <button class="chip" data-sync="${esc(personId)}" type="button">Sync now</button>
          <button class="chip" data-edit="${esc(personId)}" type="button">Edit URL</button>
          <button class="chip" data-remove="${esc(personId)}" type="button">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: 'School lunch iCal feeds', closeId: 'sli_close' })}
      <div class="sli-list" id="sli_list">${rowsHtml()}</div>
      <div class="sli-add-row">
        <button class="btn btn--ghost btn--full" id="sli_add" type="button">+ Add a feed</button>
      </div>
    `);
    activateSheet(mount);
    bindRowActions();
    document.getElementById('sli_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('sli_add')?.addEventListener('click', () => openFeedEdit(null));
  }

  function bindRowActions() {
    mount.querySelectorAll('[data-sync]').forEach(b => b.addEventListener('click', async () => {
      await syncOneFeed(b.dataset.sync);
      // Refresh
      const fresh = (await readSchoolLunchFeeds()) || {};
      Object.assign(feeds, fresh);
      // remove keys that were deleted upstream
      for (const k of Object.keys(feeds)) if (!fresh[k]) delete feeds[k];
      render();
    }));
    mount.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openFeedEdit(b.dataset.edit)));
    mount.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
      const personId = b.dataset.remove;
      const ok = await showConfirm({ title: 'Remove this feed?', confirmLabel: 'Remove', danger: true });
      if (!ok) return;
      await removeSchoolLunchFeed(personId);
      delete feeds[personId];
      render();
    }));
  }

  function openFeedEdit(existingPersonId) {
    const existing = existingPersonId ? feeds[existingPersonId] : null;
    const subMount = mount; // single mount; replace contents
    subMount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: existing ? 'Edit feed' : 'Add a feed', closeId: 'slie_close' })}
      <label class="field">
        <span class="field__label">Person</span>
        <select class="field__input" id="slie_person" ${existingPersonId ? 'disabled' : ''}>
          ${people.map(p => `<option value="${esc(p.id)}" ${p.id === existingPersonId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Feed URL</span>
        <input class="field__input" id="slie_url" type="url" placeholder="https://..." value="${esc(existing?.url || '')}" autocomplete="off">
      </label>
      ${renderFormFooter({ saveLabel: existing ? 'Save' : 'Add', cancelId: 'slie_cancel', saveId: 'slie_save' })}
    `);
    activateSheet(subMount);
    document.getElementById('slie_close')?.addEventListener('click', () => render());
    document.getElementById('slie_cancel')?.addEventListener('click', () => render());
    document.getElementById('slie_save')?.addEventListener('click', async () => {
      const pid = document.getElementById('slie_person')?.value;
      const url = document.getElementById('slie_url')?.value.trim();
      if (!pid || !url) return;
      const data = {
        url,
        addedAt: existing?.addedAt || Date.now(),
        addedBy: existing?.addedBy || pid,
      };
      await writeSchoolLunchFeed(pid, data);
      feeds[pid] = { ...(feeds[pid] || {}), ...data };
      render();
    });
  }

  render();
}
```

- [ ] **Step 3: Add `syncOneFeed` orchestrator**

Insert above `openSchoolLunchIcalSheet`:
```js
async function syncOneFeed(personId) {
  const feed = (await readSchoolLunchFeeds())?.[personId];
  if (!feed?.url) return;
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);
  let lastError = null;
  let icsText = null;
  try {
    const res = await fetch(feed.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    icsText = await res.text();
  } catch (err) {
    lastError = err?.message || 'Fetch failed';
    await writeSchoolLunchFeedSync(personId, { lastSync: Date.now(), lastError });
    return;
  }

  let mapped = [];
  try {
    const events = parseIcs(icsText);
    // Read current plan for the window
    const days = [];
    const day0 = new Date(todayStr + 'T00:00:00');
    for (let i = 0; i < 30; i++) {
      const d = new Date(day0);
      d.setDate(d.getDate() + i);
      days.push(dateKey(d));
    }
    const planByDate = {};
    for (const dk of days) {
      planByDate[dk] = await readKitchenPlan(dk).catch(() => null) || {};
    }
    mapped = mapEventsToPlan(events, planByDate, todayStr);
  } catch (err) {
    lastError = err?.message || 'Parse failed';
    await writeSchoolLunchFeedSync(personId, { lastSync: Date.now(), lastError });
    return;
  }

  let written = 0;
  const conflicts = {};
  for (const m of mapped) {
    if (!m.target) {
      conflicts[m.date] = m.conflictType || 'unknown';
      continue;
    }
    await writeKitchenPlanSlot(m.date, m.target, { customName: m.summary, source: 'ical' });
    written++;
  }
  await writeSchoolLunchFeedSync(personId, {
    lastSync: Date.now(),
    lastError: null,
    conflicts: Object.keys(conflicts).length ? conflicts : null,
  });
  const conflictCount = Object.keys(conflicts).length;
  showToast(
    conflictCount
      ? `Synced ${written}; ${conflictCount} conflict${conflictCount === 1 ? '' : 's'} skipped`
      : `Synced ${written} lunch${written === 1 ? '' : 'es'}`
  );
  await renderMealsTab();
}
```

- [ ] **Step 4: Wire the AI Tools `iCal feed` button**

In `openKitchenAiToolsSheet`, replace the comment `// kait_schoolIcal handler wired in Task 12.` with:
```js
document.getElementById('kait_schoolIcal')?.addEventListener('click', () => {
  document.getElementById('sheetMount').innerHTML = '';
  openSchoolLunchIcalSheet();
});
```

- [ ] **Step 5: Add CSS for the iCal sheet**

Append to [styles/kitchen.css](../../../styles/kitchen.css):
```css
.sli-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
}
.sli-empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-lg) 0;
  font-size: var(--font-sm);
}
.sli-row {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
}
.sli-row__title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text);
}
.sli-row__meta {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: 2px 0 var(--spacing-sm);
}
.sli-err { color: var(--danger); }
.sli-row__actions {
  display: flex;
  gap: var(--spacing-xs);
}
.sli-add-row {
  padding: var(--spacing-md) 0 var(--spacing-sm);
}
.sli-conflicts {
  display: inline-block;
  margin-left: var(--spacing-xs);
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--danger);
  background: var(--surface);
  border-radius: var(--radius-full);
  padding: 1px 8px;
}
```

- [ ] **Step 6: Verify in browser**

Reload Kitchen → wand → AI Tools → `iCal feed`. Empty sheet with "No feeds yet" + `+ Add a feed`. Tap add → pick a person, paste a real Nutrislice or similar public ICS feed URL → Save. Row appears. Tap `Sync now` → toast "Synced N lunches". Switch to Meals tab; school slots populate on relevant days.

For test data, a temporary fake `.ics` file served from `serve.js` is acceptable.

- [ ] **Step 7: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): school lunch iCal feed setup + manual sync

AI Tools 'iCal feed' button opens a setup sheet listing per-person
feeds, with add/edit/remove and sync-now. Sync fetches, parses via
shared/kitchen-ical.js, maps to school-lunch/school-lunch-2 honoring
manual/photo entries, and updates the Meals tab.
"
```

---

## Task 13: Remove school-lunch import block from Admin

Per spec §3 + acceptance #15: Admin no longer owns this flow.

**Files:**
- Modify: [admin.html](../../../admin.html) — delete the school-lunch import block

- [ ] **Step 1: Locate and delete the block**

In [admin.html](../../../admin.html), find the school-lunch import block. Per the grep earlier, it sits around lines 4750-4900 (button `slPhotoBtn`, status div `schoolLunchStatus`, the fetch handler that POSTs `type: 'schoolLunch'`).

Identify the surrounding container — likely a `<div class="admin-section">` or similar wrapper that begins above line 4750 and ends after the fetch handler script. Delete the entire wrapper section, **including** the script block that handles `slPhotoBtn`.

If unsure of the exact bounds, search for sibling section markers ("School lunch" heading or admin-section start tags) and remove the contained block top-to-bottom.

- [ ] **Step 2: Verify in browser**

Open `http://localhost:8080/admin.html`. The "School lunch" import section should be gone. The rest of admin (people, settings, recipes, etc.) should render and function normally. No console errors.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "refactor(admin): remove school-lunch import block

Moved to Kitchen AI Tools sheet. Admin should not own a parent-frequency
flow.
"
```

---

## Task 14: Service worker cache bump + final smoke test

**Files:**
- Modify: [sw.js](../../../sw.js) — bump `CACHE_NAME`

- [ ] **Step 1: Bump cache version**

In [sw.js](../../../sw.js), find the `CACHE_NAME` constant and increment to the next value (e.g., `v184` → `v185`).

If [shared/kitchen-ical.js](../../../shared/kitchen-ical.js) needs to be precached (check the existing `urlsToCache` array), add it.

- [ ] **Step 2: Visual smoke test at 412×915**

Via Playwright at 412×915:
1. **Meals tab** — full-page screenshot. Compare to `_baseline-meals.png`:
   - Today's day-header has accent-soft background.
   - Every day-block has a Dinner row.
   - Planned slots show thumbnails.
   - Per-day `+` button visible on the right edge of each day-header.
   - School slots render as `SCHOOL` (single) or `SCHOOL 1`/`SCHOOL 2` (both).
   - Kitchen tabs row shows the wand button right-aligned.
2. **Recipes tab** — full-page screenshot. Compare to `_baseline-recipes.png`. **Should be unchanged**.
3. **Lists tab** — full-page screenshot. Compare to `_baseline-lists.png`. **Should be unchanged**.
4. **Plan-a-meal sheet (FAB)** — viewport screenshot. School slot is in the picker. No regressions.
5. **AI Tools sheet (wand)** — viewport screenshot. SCHOOL LUNCH section has 4 buttons. RECIPES has the coming-soon hint.
6. **Slot-edit sheet** — tap a planned slot → chip shows correct dynamic label.

Delete all screenshots after analysis (per [CLAUDE.md](../../../CLAUDE.md)).

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump cache to v185 for kitchen Meals tab redesign"
```

- [ ] **Step 4: Optional — merge feat/kitchen-meals-redesign into main**

When ready:
```bash
git checkout main
git merge --no-ff feat/kitchen-meals-redesign
git push origin main
```

After push, verify the Worker still serves requests correctly (no Worker code changes in SP1 but worth a sanity check).

---

## Acceptance criteria mapping

Verifying each spec-§9 criterion against a task:

| Spec criterion | Task |
|---|---|
| 1. Rolling 7 days, no swipe, no week header | Task 7 |
| 2. Always-render Dinner row with empty CTA | Task 5 |
| 3. Non-dinner slots only when planned | Task 5 |
| 4. 32×32 thumb on planned slot rows | Task 4 |
| 5. Today emphasis (accent-soft + TODAY pill) | Task 6 |
| 6. Per-day `+` opens Plan-a-meal with no preset | Task 6 |
| 7. Wand icon on tabs row opens AI Tools | Task 8 |
| 8. AI Tools sheet structure + RECIPES coming-soon | Task 8 |
| 9. Photo/gallery/file reuse schoolLunch Worker + confirm | Task 9 |
| 10. iCal feed sub-sheet add/sync/conflicts | Tasks 10-12 |
| 11. iCal sync never overwrites manual/photo | Task 11 (mapper logic) |
| 12. Dynamic SCHOOL / SCHOOL 1+2 labels | Task 3 |
| 13. Plan-a-meal picker includes School with auto-allocate | Tasks 1, 2 |
| 14. Inline second-school option | Task 2 |
| 15. Admin school-lunch block removed | Task 13 |
| 16. SW cache name bumped | Task 14 |
| 17. No regressions on Recipes / Lists at 412×915 | Task 14 |

All 17 covered.

---

## Self-review notes (post-write)

- **Placeholder scan:** every step has concrete code or commands. No "fill in details" / "appropriate error handling" prose.
- **Type/name consistency:** `school` virtual slot is the picker-side key throughout; `school-lunch` / `school-lunch-2` are the schema keys throughout. `runSchoolLunchImport`, `openSchoolLunchConfirmSheet`, `openSchoolLunchIcalSheet`, `syncOneFeed` are all referenced consistently across tasks.
- **Spec coverage:** all 17 acceptance criteria mapped above.
- **Test gate adaptation:** since no test runner exists, each task's "Verify in browser" step is the gate. Subagents executing this plan must perform the Playwright check and produce evidence (screenshot, console log, or stated observation) before marking complete.
- **Known spec-vs-plan gap:** the spec calls for a per-conflict "resolve one-by-one" view tappable from the conflict chip. The plan ships the conflict count chip and writes the conflict map to Firebase, but does not implement the resolve sub-view. Resolving a conflict today requires manually removing the colliding entry from Meals tab then re-syncing — acceptable v1 behavior. The resolve sub-view is a candidate follow-up after SP1 ships.
