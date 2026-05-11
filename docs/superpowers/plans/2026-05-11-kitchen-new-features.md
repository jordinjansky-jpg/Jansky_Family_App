# Kitchen New Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Testing note:** No test runner. Manual Playwright verification at 412×915 mobile viewport per [CLAUDE.md](../../../CLAUDE.md).

**Goal:** Ship six net-new Kitchen capabilities — recipe URL dedup, Cook mode, Meal history, AI ingredient suggestions, read-only share-list URL, and multi-option meal voting.

**Architecture:** Six independent feature groups landing on one shared branch `feat/kitchen-new-features`. Each feature is self-contained — features can be merged individually if the user wants to stop early. Worker change (AI suggest) bundles into the existing pending `wrangler deploy`. New HTML page (`share-list.html`) is the only new top-level file. All other changes touch `kitchen.js`, `shared/firebase.js`, `shared/utils.js`, `styles/kitchen.css`, `workers/kitchen-import.js`, and `sw.js`.

**Tech Stack:** Vanilla JS ES modules, Firebase compat SDK, no bundler, Cloudflare Worker (Claude Haiku for new `recipeSuggest`).

**Spec:** [docs/superpowers/specs/2026-05-11-kitchen-new-features.md](../specs/2026-05-11-kitchen-new-features.md)

---

## File structure overview

| File | Responsibility | Touch |
|---|---|---|
| [kitchen.js](../../../kitchen.js) | Cook mode + meal history + AI suggest UI + share-list UI + dup-detection + voting UI | Heavy edits |
| [shared/firebase.js](../../../shared/firebase.js) | Range read + share-token write/remove + plan-slot write (array-shape) | New + modified exports |
| [shared/utils.js](../../../shared/utils.js) | parseSteps, generateShareToken, normalizePlanSlot, pickWinner | Four new exports |
| [workers/kitchen-import.js](../../../workers/kitchen-import.js) | New `recipeSuggest` handler | New handler |
| [share-list.html](../../../share-list.html) | New read-only public list viewer | **Create** |
| [styles/kitchen.css](../../../styles/kitchen.css) | Cook-mode + history-sheet + suggest-sheet + share-sheet + vote-card styles | New rules |
| [sw.js](../../../sw.js) | Cache bump + precache new files | Bump + add |

Scope: ~1500-2000 lines of new code, ~50 lines of replacements.

---

## Pre-flight

### Task 0: Branch

- [ ] **Step 1: Create feature branch off main**

```bash
git checkout main
git pull origin main
git checkout -b feat/kitchen-new-features
```

No commit. Dev server should already be running on port 8080.

---

## Feature A — Recipe duplicate detection on URL import

Smallest, isolated. Single task.

### Task A1: URL match on recipe form blur

Per spec §5: on `kr_url` field blur, normalize the URL and check against existing recipes. If match → prompt `Open existing` / `Save anyway`.

**Files:**
- Modify: `kitchen.js` — `openRecipeForm` URL field event binding + new local helper

### Step 1: Add normalizeRecipeUrl helper

Inside `openRecipeForm` (or near it), add a local helper:
```js
function normalizeRecipeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    // Lowercase scheme + host; drop search + hash; drop trailing slash on path
    let path = u.pathname.replace(/\/$/, '');
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}
```

### Step 2: Bind blur on `recipeUrl` field

Inside `openRecipeForm`, after the existing event bindings near the URL field, add:
```js
const urlField = document.getElementById('recipeUrl');
urlField?.addEventListener('blur', async () => {
  const typed = normalizeRecipeUrl(urlField.value);
  if (!typed) return;
  // Don't match against the currently-edited recipe itself.
  const editingId = recipeId || null;
  const match = Object.entries(recipes).find(([id, r]) => {
    if (id === editingId) return false;
    return normalizeRecipeUrl(r.url || '') === typed;
  });
  if (!match) return;
  const [matchedId, matchedRecipe] = match;
  const ageDays = matchedRecipe.createdAt
    ? Math.floor((Date.now() - matchedRecipe.createdAt) / 86_400_000)
    : null;
  const ageText = ageDays === null ? '' : ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`;
  const confirmed = await showConfirm({
    title: 'You already have a recipe for this link',
    body: `"${matchedRecipe.name}"${ageText ? ` was added ${ageText}.` : ''}\n\nOpen the existing recipe?`,
    confirmLabel: 'Open existing',
    cancelLabel: 'Save anyway',
  });
  if (confirmed) {
    close();
    openRecipeDetailSheet(matchedId);
  }
  // 'Save anyway' falls through — user continues with the form as normal.
});
```

Verify the `showConfirm` API supports a `body` parameter and a `cancelLabel`. If not, inline the message into `title` (e.g. ``You already have "${matchedRecipe.name}" for this link. Open existing?``) and let Cancel default to its standard label.

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): recipe URL dedup on form blur

When the user pastes/types a URL into the recipe form's URL field and
blurs, normalize and compare against existing recipes. If a match is
found, prompt to open the existing recipe or save anyway. Normalization
strips trailing slashes, query strings, and hash fragments; matches are
case-insensitive on scheme + host.
"
```

### Step 4: Verify

Open the recipe form. Paste a URL that matches an existing recipe → confirm dialog appears. Tap "Open existing" → form closes, existing recipe detail opens. Re-open form, paste the same URL → confirm "Save anyway" → form stays, user continues normally.

---

## Feature B — Cook mode

### Task B1: Add `steps[]` to recipe schema + form

Per spec §1: new optional `steps: string[]` field on the recipe.

**Files:**
- Modify: `kitchen.js` — `openRecipeForm` add steps disclosure chip + save payload

### Step 1: Update form template

Inside `openRecipeForm`, find the other disclosure chips (`+ Tags`, `+ Cook time`). Add a `+ Steps` chip alongside them. Insert near them in the chip row:
```js
<button class="ef2-add-chip${stepsOpen ? ' is-active' : ''}" id="kr_stepsChip" type="button">+ Steps</button>
```

And add the matching reveal section near the existing tags/cooktime reveals:
```js
<div class="ef2-field-reveal${stepsOpen}" id="kr_stepsReveal">
  <label class="field">
    <span class="field__label">Steps (one per line)</span>
    <textarea id="recipeSteps" class="kr-notes" placeholder="Preheat oven to 400°F&#10;Mix dry ingredients in a bowl&#10;…" autocomplete="off">${esc((existing?.steps || []).join('\n'))}</textarea>
  </label>
</div>
```

Above the form definition, near `tagsOpen` and `cookTimeOpen`, add:
```js
const stepsOpen = (existing?.steps?.length) ? ' is-open' : '';
```

### Step 2: Wire the disclosure chip

Near the existing tags/cookTime chip wiring inside `openRecipeForm`, add:
```js
document.getElementById('kr_stepsChip')?.addEventListener('click', () => {
  const reveal = document.getElementById('kr_stepsReveal');
  const open = reveal?.classList.toggle('is-open');
  document.getElementById('kr_stepsChip')?.classList.toggle('is-active', open);
});
```

### Step 3: Update save payload

In the save handler (around `kitchen.js:2454+`), add `steps` to the `data` object:
```js
const stepsRaw = document.getElementById('recipeSteps')?.value || '';
const steps = stepsRaw.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30);
const data = {
  // ...existing fields...
  steps: steps.length ? steps : null,
  // ...rest...
};
```

### Step 4: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): steps[] field on recipe form for Cook mode

New '+ Steps' disclosure chip on the recipe form reveals a textarea
where the user enters one step per line. Persisted as steps[] on the
recipe (max 30, blank lines stripped). When absent, Cook mode (next
commit) falls back to splitting recipe.notes by newlines.
"
```

### Step 5: Verify

Open recipe form → tap `+ Steps` → textarea reveals. Type three steps separated by newlines. Save. Reopen the recipe → tap edit → `+ Steps` is auto-active → the three steps appear in the textarea.

---

### Task B2: parseSteps helper + Cook mode sheet

Per spec §1: full-viewport Cook mode with step navigation, wake-lock, ingredients toggle.

**Files:**
- Modify: `shared/utils.js` — new `parseSteps(notes)` export
- Modify: `kitchen.js` — new `openCookModeSheet(recipe)`
- Modify: `styles/kitchen.css` — `.cook-mode` rules

### Step 1: Add parseSteps to utils.js

```js
// Parse a recipe's notes field into an ordered list of step strings.
// Used as the fallback for Cook mode when recipe.steps[] is absent.
// Splits on newlines, strips leading bullets/numbers, drops empty lines,
// caps at 30 steps (defensive — most recipes have under 15).
export function parseSteps(notes) {
  if (!notes || typeof notes !== 'string') return [];
  return notes
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 30);
}
```

### Step 2: Import parseSteps in kitchen.js

Update the existing import line from `./shared/utils.js`:
```js
import { todayKey, escapeHtml, formatLastCooked, avgRating, parseSteps } from './shared/utils.js';
```

### Step 3: Add openCookModeSheet function

Insert near other sheet-opener functions:
```js
async function openCookModeSheet(recipe) {
  if (!recipe) return;
  const stepList = (recipe.steps && recipe.steps.length) ? recipe.steps : parseSteps(recipe.notes);
  if (stepList.length === 0) { showToast('No steps to cook — add steps in the recipe form'); return; }

  const mount = document.getElementById('sheetMount');
  let current = 0;
  let wakeLock = null;
  let ingredientsOpen = false;

  // Request screen wake-lock; silent on denial.
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* silent */ }

  function renderIngredientPanel() {
    if (!ingredientsOpen) return '';
    const rows = (recipe.ingredients || []).map(ing => `
      <div class="cook-ing-row">
        <span class="cook-ing-qty">${esc(ing.qty || '')}</span>
        <span class="cook-ing-name">${esc(ing.name || '')}</span>
      </div>`).join('');
    return `<div class="cook-ing-panel"><div class="cook-ing-panel__title">Ingredients</div>${rows}</div>`;
  }

  function renderDots() {
    return stepList.map((_, i) => {
      const cls = i < current ? 'is-done' : (i === current ? 'is-current' : '');
      return `<span class="cook-dot ${cls}"></span>`;
    }).join('');
  }

  function render() {
    const isLast = current === stepList.length - 1;
    const isFirst = current === 0;
    mount.innerHTML = `
      <div class="cook-mode" id="cookMode">
        <div class="cook-mode__topbar">
          <button class="ef2-icon-btn" id="cook_back" type="button" aria-label="Back">←</button>
          <div class="cook-mode__title">Cook · ${esc(recipe.name || '')}</div>
          <button class="ef2-icon-btn" id="cook_close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="cook-mode__body">
          <div class="cook-mode__progress">Step ${current + 1} of ${stepList.length}</div>
          <div class="cook-mode__step">${esc(stepList[current])}</div>
          <button class="btn btn--ghost" id="cook_toggleIng" type="button">${ingredientsOpen ? 'Hide' : 'Show'} ingredients</button>
          ${renderIngredientPanel()}
        </div>
        <div class="cook-mode__nav">
          <button class="btn btn--secondary" id="cook_prev" type="button"${isFirst ? ' disabled' : ''}>‹ Prev</button>
          <div class="cook-mode__dots">${renderDots()}</div>
          <button class="btn btn--primary" id="cook_next" type="button">${isLast ? 'Done' : 'Next ›'}</button>
        </div>
      </div>`;

    document.getElementById('cook_close')?.addEventListener('click', exit);
    document.getElementById('cook_back')?.addEventListener('click', exit);
    document.getElementById('cook_toggleIng')?.addEventListener('click', () => {
      ingredientsOpen = !ingredientsOpen;
      render();
    });
    document.getElementById('cook_prev')?.addEventListener('click', () => {
      if (current > 0) { current--; render(); }
    });
    document.getElementById('cook_next')?.addEventListener('click', async () => {
      if (current < stepList.length - 1) { current++; render(); return; }
      // Done — bump lastUsed and exit.
      await writeKitchenRecipe(recipe.id, { ...recipes[recipe.id], lastUsed: Date.now() });
      if (recipes[recipe.id]) recipes[recipe.id].lastUsed = Date.now();
      showToast('Recipe complete');
      exit();
    });
  }

  function exit() {
    wakeLock?.release?.().catch(() => { /* silent */ });
    mount.innerHTML = '';
    renderActiveTab();
  }

  render();
}
```

Note: `recipe.id` may not be set on the object passed in. The caller (Task B3) should pass `{ ...recipes[recipeId], id: recipeId }` to make sure `id` is present.

### Step 4: Add CSS

Append to `styles/kitchen.css`:
```css
.cook-mode {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.cook-mode__topbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.cook-mode__title {
  flex: 1;
  font-weight: 600;
  font-size: var(--font-sm);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cook-mode__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-md);
}

.cook-mode__progress {
  font-size: var(--font-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  text-align: center;
}

.cook-mode__step {
  font-size: 1.4rem;
  line-height: 1.5;
  color: var(--text);
  text-align: center;
  padding: var(--spacing-md) 0;
}

.cook-mode__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.cook-mode__dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cook-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.cook-dot.is-current { background: var(--accent); transform: scale(1.4); }
.cook-dot.is-done    { background: var(--accent-soft); }

.cook-ing-panel {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-top: var(--spacing-sm);
}

.cook-ing-panel__title {
  font-size: var(--font-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: var(--spacing-sm);
}

.cook-ing-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.cook-ing-row:last-child { border-bottom: none; }

.cook-ing-qty {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cook-ing-name {
  font-size: var(--font-sm);
  color: var(--text);
}
```

### Step 5: Commit

```bash
git add shared/utils.js kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): Cook mode full-viewport sheet with step navigation

openCookModeSheet renders a full-viewport overlay with step text,
progress dots, Prev/Next, and a toggle for the ingredients panel.
Wake-lock requested on entry (silent on denial). Done updates
recipe.lastUsed to now. parseSteps helper in shared/utils.js splits
notes by newlines when steps[] is absent, stripping leading bullets/
numbers.
"
```

---

### Task B3: 'Start cooking' button on recipe detail sheet

**Files:**
- Modify: `kitchen.js` — `openRecipeDetailSheet` footer

### Step 1: Add the button

In `openRecipeDetailSheet`'s render template, find the footer where `addToListBtn` + `planThisMealBtn` are emitted. Insert a new primary button BEFORE the others:
```js
${(recipe.steps?.length || recipe.notes) ? `<button class="btn btn--primary" id="startCookingBtn" type="button">Start cooking</button>` : ''}
```

Make the existing `Plan this meal` and `Add to list` buttons `btn--secondary` to avoid two primary buttons in the footer.

### Step 2: Wire the handler

After the existing button bindings in `bindButtons` inside `openRecipeDetailSheet`, add:
```js
document.getElementById('startCookingBtn')?.addEventListener('click', () => {
  close();
  openCookModeSheet({ ...recipe, id: recipeId });
});
```

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): Start cooking button on recipe detail

Primary footer button (renders when the recipe has steps or notes)
closes the detail sheet and opens Cook mode. Plan this meal and Add to
list demote to secondary style so the footer has a single primary CTA.
"
```

### Step 4: Verify

Open a recipe with notes or steps → detail sheet footer has `Start cooking` as primary. Tap → Cook mode opens. Navigate forward → progress dots fill. Tap `Show ingredients` → panel slides into view. Tap Done on the last step → recipe.lastUsed updates and Cook mode closes.

---

## Feature C — Meal history

### Task C1: readKitchenPlanRange Firebase export

**Files:**
- Modify: `shared/firebase.js` — new export

### Step 1: Add export

Append near the existing kitchen-plan exports in `shared/firebase.js`:
```js
// Read plan slots for a date range (inclusive). Returns { [dateKey]: planObj }
// where missing dates are omitted. Used by Meal History view.
export async function readKitchenPlanRange(startDate, endDate) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  const lastDay = new Date(end);
  lastDay.setHours(0, 0, 0, 0);
  const out = {};
  while (day <= lastDay) {
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    const dk = `${y}-${m}-${d}`;
    const plan = await readKitchenPlan(dk).catch(() => null);
    if (plan) out[dk] = plan;
    day.setDate(day.getDate() + 1);
  }
  return out;
}
```

### Step 2: Commit

```bash
git add shared/firebase.js
git commit -m "feat(firebase): readKitchenPlanRange for meal history

Iterates dates from start to end (inclusive), calls readKitchenPlan per
date, returns a { dateKey: planObj } map omitting empty dates. Used by
the meal history sheet to fetch the last 30 days of dinner data.
"
```

---

### Task C2: openMealHistorySheet

**Files:**
- Modify: `kitchen.js` — new `openMealHistorySheet` + import
- Modify: `styles/kitchen.css` — `.mh-*` styles

### Step 1: Import readKitchenPlanRange

Update the existing import from `./shared/firebase.js` in `kitchen.js` to include `readKitchenPlanRange`.

### Step 2: Add openMealHistorySheet

Insert near other sheet-opener functions:
```js
async function openMealHistorySheet() {
  const mount = document.getElementById('sheetMount');
  const tz = settings?.timezone || 'America/Chicago';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 30);

  // Loading state
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Meal history', closeId: 'mh_close' })}
    <div class="mh-loading">Loading last 30 days…</div>
  `);
  activateSheet(mount);
  document.getElementById('mh_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  const planByDate = await readKitchenPlanRange(start, today);

  // Build a 30-day list (today backward), grouped by Monday-anchored week.
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const plan = planByDate[dk];
    days.push({ date: d, dateKey: dk, dinner: plan?.dinner || null });
  }

  // Group by Monday-anchored week
  function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const weekGroups = {};
  for (const dayInfo of days) {
    const mk = mondayOf(dayInfo.date);
    const mkStr = `${mk.getFullYear()}-${String(mk.getMonth() + 1).padStart(2, '0')}-${String(mk.getDate()).padStart(2, '0')}`;
    if (!weekGroups[mkStr]) weekGroups[mkStr] = { monday: mk, days: [] };
    weekGroups[mkStr].days.push(dayInfo);
  }
  const sortedWeeks = Object.values(weekGroups).sort((a, b) => b.monday - a.monday);

  const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const weeksHtml = sortedWeeks.map(week => {
    const m = week.monday;
    const weekLabel = `Week of ${MONTHS_SHORT[m.getMonth()]} ${m.getDate()}`;
    // Sort within week: chronological, oldest at top
    const sortedDays = [...week.days].sort((a, b) => a.date - b.date);
    const rowsHtml = sortedDays.map(({ date, dateKey, dinner }) => {
      const dayLabel = `${DAY_NAMES_SHORT[date.getDay()]} ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
      let dinnerName = '—';
      let isInteractive = false;
      if (dinner) {
        if (dinner.recipeId) {
          dinnerName = recipes[dinner.recipeId]?.name || 'Unknown recipe';
          isInteractive = true;
        } else if (dinner.customName) {
          dinnerName = dinner.customName;
        } else if (dinner.mealName) {
          dinnerName = dinner.mealName;
        }
      }
      const attrs = isInteractive ? ` data-mh-recipe-id="${esc(dinner.recipeId)}" role="button"` : '';
      return `<div class="mh-row${isInteractive ? ' mh-row--interactive' : ''}"${attrs}>
        <span class="mh-day-label">${esc(dayLabel)}</span>
        <span class="mh-meal-name">${esc(dinnerName)}</span>
      </div>`;
    }).join('');
    return `<div class="mh-week">
      <div class="mh-week-label">${esc(weekLabel)}</div>
      ${rowsHtml}
    </div>`;
  }).join('');

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Meal history', closeId: 'mh_close' })}
    <div class="mh-hint">Last 30 days — dinners only</div>
    <div class="mh-list">${weeksHtml}</div>
  `);
  activateSheet(mount);
  document.getElementById('mh_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  mount.querySelectorAll('[data-mh-recipe-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.mhRecipeId;
      mount.innerHTML = '';
      openRecipeDetailSheet(id);
    });
  });
}
```

### Step 3: Add CSS

Append to `styles/kitchen.css`:
```css
.mh-loading {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-lg) 0;
  font-size: var(--font-sm);
}
.mh-hint {
  font-size: var(--font-xs);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-xs) 0 var(--spacing-md);
}
.mh-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-md);
}
.mh-week {
  display: flex;
  flex-direction: column;
}
.mh-week-label {
  font-size: var(--font-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  padding: var(--spacing-xs) 0;
}
.mh-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px var(--spacing-xs);
  border-bottom: 1px solid var(--border);
}
.mh-row:last-child { border-bottom: none; }
.mh-row--interactive { cursor: pointer; }
.mh-row--interactive:active { background: var(--surface-2); }
.mh-day-label {
  width: 84px;
  flex-shrink: 0;
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-muted);
}
.mh-meal-name {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--text);
}
```

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): meal history sheet — last 30 days of dinners

openMealHistorySheet fetches the last 30 days via readKitchenPlanRange,
groups by Monday-anchored week, renders each day with its dinner name
or em-dash. Tapping a row with a recipeId opens the recipe detail
sheet. Dinner-only — other slots are out of scope for v1.
"
```

---

### Task C3: History entry on Meals tab

**Files:**
- Modify: `kitchen.js` — add a `History ›` chip on the Meals tab

### Step 1: Add chip near the week strip

In `renderMealsTab`, find where the week-strip HTML begins. Add a small chip above (or below) the week-strip:
```js
content.innerHTML = `
  <div class="meals-controls">
    <button class="chip mh-open-btn" id="mhOpenBtn" type="button">History ›</button>
  </div>
  <div class="week-strip" id="weekStrip">
    <div class="week-strip__week">${weekHtml}</div>
  </div>`;
```

Bind the click after `content.innerHTML = …`:
```js
document.getElementById('mhOpenBtn')?.addEventListener('click', openMealHistorySheet);
```

### Step 2: Add CSS

Append to `styles/kitchen.css`:
```css
.meals-controls {
  display: flex;
  justify-content: flex-end;
  padding: var(--spacing-sm) 0;
}
.mh-open-btn {
  font-size: var(--font-xs);
}
```

### Step 3: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): History entry above the Meals week strip

Small chip 'History ›' above the rolling-7-day week strip opens the
meal history sheet. Right-aligned to avoid drawing attention away from
the primary week-strip content."
```

### Step 4: Verify

Reload Kitchen → Meals tab. `History ›` chip visible at the top. Tap → meal history sheet opens. Each week's dinners listed. Tap a row with a recipe → recipe detail opens. Close all sheets and confirm the Meals tab is unaffected.

---

## Feature D — AI "What can I make?"

### Task D1: New Worker handler `recipeSuggest`

**Files:**
- Modify: `workers/kitchen-import.js` — add new prompt, handler, dispatcher entry

### Step 1: Add SUGGEST_PROMPT constant

After the existing `*_PROMPT` constants near the top of `workers/kitchen-import.js`, add:
```js
const SUGGEST_PROMPT = (pantry) => `You are helping a family decide what to make for dinner tonight.

INPUT — what they have on hand (or what they're craving):
"${pantry}"

Return 3-5 recipe ideas that match. For each:
- Use ingredients from the input where possible.
- Suggest realistic family-friendly meals (no five-Michelin-star techniques).
- Tag with cuisine / cook style descriptors.

Return JSON:
{
  "suggestions": [
    {
      "name": "recipe name",
      "description": "1-2 sentence summary including approximate cook time",
      "tags": ["array of 2-4 short lowercase tags"]
    }
  ]
}
Return only valid JSON, nothing else.`;
```

### Step 2: Add the handler

Insert near other handler functions (e.g., after `handleScan`):
```js
async function handleRecipeSuggest(input, env, corsHeaders) {
  if (!input?.pantry || typeof input.pantry !== 'string') {
    return jsonError('No pantry input provided', 400, corsHeaders);
  }
  const pantry = input.pantry.slice(0, 500).trim();
  if (!pantry) return jsonError('No pantry input provided', 400, corsHeaders);
  try {
    const raw = await callClaude([{
      role: 'user',
      content: SUGGEST_PROMPT(pantry),
    }], env, 1024);
    const parsed = parseJson(raw);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter(s => s && s.name && s.description)
          .map(s => ({
            name: String(s.name).slice(0, 100),
            description: String(s.description).slice(0, 240),
            tags: Array.isArray(s.tags)
              ? s.tags.slice(0, 4).filter(t => typeof t === 'string' && t.trim())
              : [],
          }))
          .slice(0, 5)
      : [];
    return jsonOk({ suggestions }, corsHeaders);
  } catch {
    return jsonError('Could not generate suggestions', 500, corsHeaders);
  }
}
```

### Step 3: Register the handler

Find the `HANDLERS` object and add:
```js
recipeSuggest: (input, env) => handleRecipeSuggest(input, env, CORS),
```

### Step 4: Commit

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): recipeSuggest handler for AI 'What can I make?'

Takes a pantry input string ('chicken thighs, rice, broccoli, ginger')
and returns 3-5 recipe suggestions with name, 1-2-sentence description,
and 2-4 short lowercase tags. ~1 Haiku call per ask; ~\$0.001/call.

Worker change — needs separate wrangler deploy.
"
```

---

### Task D2: 'What can I make?' button + sub-sheet

**Files:**
- Modify: `kitchen.js` — extend `openKitchenAiToolsSheet` + new `openAiSuggestSheet`
- Modify: `styles/kitchen.css` — `.suggest-*` styles

### Step 1: Add 4th button to AI Tools RECIPES section

In `openKitchenAiToolsSheet`, find the RECIPES section markup (added in SP2). It currently has three buttons (Import from URL / Import from photo / Find ideas online). Add a fourth:
```js
<button class="btn btn--secondary" id="kait_recipeSuggest" type="button">💡 What can I make?</button>
```

Inside the `.kait-grid` div. Three columns won't fit nicely at 412px; the grid wraps to 2 columns × 2 rows naturally.

### Step 2: Wire the button

After the existing recipes button bindings in `openKitchenAiToolsSheet`, add:
```js
document.getElementById('kait_recipeSuggest')?.addEventListener('click', () => {
  mount.innerHTML = '';
  openAiSuggestSheet();
});
```

### Step 3: Add openAiSuggestSheet

Insert near other sheet-opener functions:
```js
function openAiSuggestSheet() {
  const mount = document.getElementById('sheetMount');
  let pantry = '';
  let suggestions = null;
  let loading = false;

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: 'What can I make?', closeId: 'sug_close' })}
      ${suggestions === null ? `
        <p class="sug-hint">List what you have on hand</p>
        <textarea id="sug_pantry" class="sug-textarea" placeholder="e.g. chicken thighs, rice, broccoli, soy sauce, ginger" autofocus>${esc(pantry)}</textarea>
        <div class="sug-footer">
          <button class="btn btn--primary" id="sug_go" type="button"${loading || pantry.trim().split(/\s+/).filter(Boolean).length < 2 ? ' disabled' : ''}>
            ${loading ? 'Thinking…' : 'Suggest recipes'}
          </button>
        </div>
      ` : `
        <div class="sug-results">
          ${suggestions.length === 0
            ? `<div class="sug-empty">No suggestions — try different ingredients.</div>`
            : suggestions.map((s, i) => `
              <div class="sug-card" data-sug-idx="${i}">
                <div class="sug-card__title">${esc(s.name)}</div>
                <div class="sug-card__body">${esc(s.description)}</div>
                ${s.tags?.length ? `<div class="sug-card__tags">${s.tags.map(t => `<span class="sug-tag">${esc(t)}</span>`).join('')}</div>` : ''}
                <button class="btn btn--secondary btn--sm" data-sug-save="${i}" type="button">Save to library</button>
              </div>`).join('')}
        </div>
        <div class="sug-footer">
          <button class="btn btn--ghost" id="sug_back" type="button">Try different ingredients</button>
        </div>
      `}
    `);
    activateSheet(mount);

    document.getElementById('sug_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('sug_back')?.addEventListener('click', () => { suggestions = null; render(); });

    document.getElementById('sug_pantry')?.addEventListener('input', (e) => {
      pantry = e.target.value;
      // Re-render only the button to flip disabled state
      const btn = document.getElementById('sug_go');
      if (btn) btn.disabled = pantry.trim().split(/\s+/).filter(Boolean).length < 2;
    });

    document.getElementById('sug_go')?.addEventListener('click', async () => {
      loading = true;
      render();
      try {
        const res = await fetch(KITCHEN_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'recipeSuggest', input: { pantry } }),
        });
        const data = await res.json();
        suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      } catch (err) {
        console.warn('recipeSuggest failed', err);
        suggestions = [];
      }
      loading = false;
      render();
    });

    mount.querySelectorAll('[data-sug-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.sugSave, 10);
        const s = suggestions[i];
        if (!s) return;
        const newRecipe = {
          name: s.name,
          notes: s.description,
          tags: s.tags?.length ? s.tags : null,
          ingredients: [],
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          source: 'ai-suggest',
        };
        const id = await pushKitchenRecipe(newRecipe);
        recipes[id] = { ...newRecipe, createdAt: Date.now() };
        showToast(`Saved "${s.name}" — fill in ingredients later`);
        btn.disabled = true;
        btn.textContent = 'Saved ✓';
      });
    });
  }

  render();
}
```

### Step 4: Add CSS

Append to `styles/kitchen.css`:
```css
.sug-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
  text-align: center;
  margin: 0 0 var(--spacing-sm);
}
.sug-textarea {
  width: 100%;
  min-height: 100px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--text);
  font-size: var(--font-md);
  font-family: inherit;
  resize: vertical;
}
.sug-textarea:focus { outline: none; border-color: var(--accent); }
.sug-footer {
  display: flex;
  justify-content: center;
  padding: var(--spacing-md) 0;
}
.sug-results {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
}
.sug-empty {
  text-align: center;
  padding: var(--spacing-lg) 0;
  color: var(--text-muted);
  font-style: italic;
}
.sug-card {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
.sug-card__title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
}
.sug-card__body {
  font-size: var(--font-sm);
  color: var(--text-muted);
  line-height: 1.4;
}
.sug-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sug-tag {
  font-size: var(--font-xs);
  background: var(--surface);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
```

### Step 5: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): AI 'What can I make?' suggestion sheet

Fourth button in the AI Tools sheet RECIPES section opens a sub-sheet.
User pastes pantry contents (textarea), taps Suggest, Worker returns
3-5 ideas, each saveable to the library as a stub recipe (name +
description as notes + tags; ingredients left empty for user fill-in).
"
```

### Step 6: Verify

After Worker deploy (Task SP4-final), tap wand → AI Tools → `What can I make?` → sub-sheet opens. Type ingredients. Tap Suggest → 3-5 cards appear. Tap Save to library → toast confirms; button flips to `Saved ✓`. Open Recipes tab → new recipe present with the AI-generated name + description.

---

## Feature E — Share-list URL

### Task E1: Token helper + Firebase exports

**Files:**
- Modify: `shared/utils.js` — new `generateShareToken` export
- Modify: `shared/firebase.js` — new exports `writeKitchenListShareToken`, `removeKitchenListShareToken`, `readListByToken`

### Step 1: Add generateShareToken to utils.js

```js
// Generate a 20-char alphanumeric token for share-list URLs.
// Math.random is acceptable for the threat model — these links should
// not be shared on public surfaces, and revoking is one click.
export function generateShareToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
```

(Avoided I, O, l, o, 0, 1 — easy-to-misread characters.)

### Step 2: Add Firebase exports

Append near the existing `rundown/kitchen/lists/*` exports in `shared/firebase.js`:
```js
export function writeKitchenListShareToken(listId, tokenObj) {
  return getDb().ref(`${ROOT}/kitchen/lists/${listId}/shareToken`).set(tokenObj);
}

export function removeKitchenListShareToken(listId) {
  return getDb().ref(`${ROOT}/kitchen/lists/${listId}/shareToken`).remove();
}

// Read a list + its items + its name + icon + color by validating the URL token.
// Used by share-list.html — no auth required (anonymous read OK by Firebase rules
// at the resolved path, but we still validate token client-side to keep the
// share contract honest).
export async function readListByToken(listId, token) {
  const snap = await getDb().ref(`${ROOT}/kitchen/lists/${listId}`).once('value');
  const list = snap.val();
  if (!list) return null;
  if (!list.shareToken || list.shareToken.token !== token) return null;
  const itemsSnap = await getDb().ref(`${ROOT}/kitchen/items/${listId}`).once('value');
  const items = itemsSnap.val() || {};
  return { list, items };
}
```

(`ROOT` must match the existing constant in the file — adapt if it's spelled differently.)

### Step 3: Commit

```bash
git add shared/utils.js shared/firebase.js
git commit -m "feat(firebase): per-list shareToken + readListByToken

Schema: rundown/kitchen/lists/{listId}/shareToken { token, createdAt,
createdBy }. writeKitchenListShareToken / removeKitchenListShareToken
manage it; readListByToken returns the list + items only when the URL
token matches the stored one. generateShareToken in shared/utils.js
produces a 20-char alphanumeric token using a confusion-free alphabet.
"
```

---

### Task E2: Share-list URL UI in overflow menu

**Files:**
- Modify: `kitchen.js` — new `openShareListSheet` + add entry to `openListActionsMenu`

### Step 1: Add openShareListSheet

Insert near other sheet-opener functions:
```js
async function openShareListSheet() {
  if (!activeListId || !lists[activeListId]) return;
  const list = lists[activeListId];
  let token = list.shareToken?.token || null;

  // Generate a token if none exists yet
  if (!token) {
    token = generateShareToken();
    const tokenObj = { token, createdAt: Date.now(), createdBy: linkedPerson?.id || 'anonymous' };
    await writeKitchenListShareToken(activeListId, tokenObj);
    lists[activeListId] = { ...list, shareToken: tokenObj };
  }

  const url = `${window.location.origin}/share-list.html?id=${encodeURIComponent(activeListId)}&token=${encodeURIComponent(token)}`;

  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: `Share "${list.name}"`, closeId: 'shr_close' })}
    <div class="shr-body">
      <p class="shr-hint">Anyone with this link can view (not edit) this list.</p>
      <div class="shr-url"><code>${esc(url)}</code></div>
      <div class="shr-actions">
        <button class="btn btn--primary" id="shr_copy" type="button">Copy link</button>
        <a class="btn btn--secondary" id="shr_open" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open</a>
      </div>
      <button class="btn btn--ghost shr-revoke" id="shr_revoke" type="button">Revoke link</button>
    </div>
  `);
  activateSheet(mount);

  document.getElementById('shr_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('shr_copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      showToast('Couldn\'t copy — long-press the URL above to copy manually');
    }
  });
  document.getElementById('shr_revoke')?.addEventListener('click', async () => {
    const ok = await showConfirm({
      title: 'Revoke this link?',
      body: 'The existing URL will stop working immediately. A new link can be generated later.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    await removeKitchenListShareToken(activeListId);
    delete lists[activeListId].shareToken;
    mount.innerHTML = '';
    showToast('Link revoked');
  });
}
```

### Step 2: Add entry to openListActionsMenu

In `openListActionsMenu` (built in SP3 T2), insert a new action between `Copy as text` and `Clear checked items`:
```js
<button class="lam-action" id="lam_share" type="button">Share read-only link</button>
```

And bind it:
```js
document.getElementById('lam_share')?.addEventListener('click', () => {
  mount.innerHTML = '';
  openShareListSheet();
});
```

### Step 3: Add imports + CSS

Update kitchen.js import line for `shared/utils.js` to include `generateShareToken`, and `shared/firebase.js` to include `writeKitchenListShareToken`, `removeKitchenListShareToken`.

Append to `styles/kitchen.css`:
```css
.shr-body {
  padding: var(--spacing-md) var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.shr-hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin: 0;
}
.shr-url {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
}
.shr-url code {
  font-size: var(--font-xs);
  color: var(--text);
  word-break: break-all;
}
.shr-actions {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}
.shr-actions .btn { flex: 1; }
.shr-revoke {
  color: var(--danger);
}
```

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): share-list URL — overflow menu + sheet

Overflow menu (SP3) gains a 'Share read-only link' entry between
'Copy as text' and 'Clear checked items'. Opens a sheet that generates
(or reuses) a 20-char token, displays the URL, offers Copy + Open
buttons, and a Revoke button that clears the token from Firebase.
"
```

---

### Task E3: New share-list.html public viewer page

**Files:**
- Create: `share-list.html`
- Modify: `sw.js` — add to precache list

### Step 1: Create the file

Create `c:/Users/jordi/OneDrive/Documents/Personal/Claude/Jansky_Family_App/share-list.html`:
```html
<!DOCTYPE html>
<!-- v1 -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Read-only shopping list view">
  <meta name="theme-color" content="#141413">
  <link rel="icon" href="/app-icon.png" type="image/png">
  <title>Shopping list</title>
  <link rel="stylesheet" href="styles/base.css">
  <link rel="stylesheet" href="styles/layout.css">
  <link rel="stylesheet" href="styles/components.css">
  <link rel="stylesheet" href="styles/kitchen.css">
  <link rel="stylesheet" href="styles/responsive.css">
</head>
<body>
  <div class="page-content" id="app">
    <main id="shareMount" style="padding: var(--spacing-md);">
      <div class="share-loading">Loading…</div>
    </main>
  </div>

  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>

  <script type="module">
    import { initFirebase, readListByToken } from './shared/firebase.js';
    import { escapeHtml as esc } from './shared/utils.js';
    import { applyTheme, resolveTheme } from './shared/theme.js';

    applyTheme(resolveTheme());
    initFirebase();

    const params = new URLSearchParams(window.location.search);
    const listId = params.get('id');
    const token = params.get('token');
    const mount = document.getElementById('shareMount');

    if (!listId || !token) {
      mount.innerHTML = `<div class="share-error">This link is missing required information.</div>`;
    } else {
      try {
        const data = await readListByToken(listId, token);
        if (!data) {
          mount.innerHTML = `<div class="share-error">This link is no longer valid.</div>`;
        } else {
          const { list, items } = data;
          const allItems = Object.values(items);
          const active = allItems.filter(it => it && it.name && !it.checked);
          const completed = allItems.filter(it => it && it.name && it.checked);
          const activeHtml = active.map(it => `
            <div class="share-item">
              <span class="share-item__bullet"></span>
              <span class="share-item__name">${esc(it.name)}</span>
              ${it.qty ? `<span class="share-item__qty">${esc(it.qty)}</span>` : ''}
            </div>`).join('');
          const completedHtml = completed.length === 0 ? '' : `
            <details class="share-completed">
              <summary>Completed (${completed.length})</summary>
              ${completed.map(it => `
                <div class="share-item share-item--done">
                  <span class="share-item__name">${esc(it.name)}</span>
                  ${it.qty ? `<span class="share-item__qty">${esc(it.qty)}</span>` : ''}
                </div>`).join('')}
            </details>`;
          mount.innerHTML = `
            <div class="share-header">
              <span class="share-icon" style="background:${esc(list.color || '#888')}">${esc(list.icon || '🛒')}</span>
              <h1 class="share-title">${esc(list.name)}</h1>
            </div>
            <div class="share-body">
              ${active.length === 0 ? `<div class="share-empty">Nothing left on the list. ✓</div>` : activeHtml}
              ${completedHtml}
            </div>
            <div class="share-footer">Shared from Family Hub · view-only</div>`;
        }
      } catch (err) {
        console.error('share-list load error', err);
        mount.innerHTML = `<div class="share-error">Could not load this list. Check the link.</div>`;
      }
    }
  </script>
</body>
</html>
```

### Step 2: Add CSS for share viewer

Append to `styles/kitchen.css`:
```css
.share-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) 0;
  border-bottom: 1px solid var(--border);
}
.share-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.share-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.share-body {
  padding: var(--spacing-md) 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}
.share-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px 0;
}
.share-item__bullet {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
}
.share-item__name {
  flex: 1;
  font-size: var(--font-md);
  color: var(--text);
}
.share-item__qty {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.share-item--done .share-item__name {
  text-decoration: line-through;
  color: var(--text-muted);
}
.share-completed {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border);
}
.share-completed summary {
  font-size: var(--font-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--spacing-xs) 0;
}
.share-empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-lg) 0;
  font-size: var(--font-md);
}
.share-error {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-lg) 0;
  font-size: var(--font-sm);
}
.share-loading {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-lg) 0;
  font-size: var(--font-sm);
}
.share-footer {
  font-size: var(--font-xs);
  color: var(--text-faint);
  text-align: center;
  padding: var(--spacing-md) 0;
}
```

### Step 3: Add to SW precache

In `sw.js`, find the `APP_SHELL` (or equivalent) array. Add `'/share-list.html'` to the list.

### Step 4: Commit

```bash
git add share-list.html styles/kitchen.css sw.js
git commit -m "feat(kitchen): share-list.html public read-only viewer

New top-level page renders a list (icon + name + active items + collapsed
completed section) when the URL token matches the stored shareToken.
Otherwise shows 'This link is no longer valid.' Layout reuses the
existing kitchen CSS tokens. Anonymous — no auth required; the token
in the URL is the only credential. Precache list updated.
"
```

### Step 5: Verify

From kitchen, overflow → Share read-only link → Copy link → paste in a new browser tab → list renders. Revoke from the share sheet → reload tab → "This link is no longer valid."

**Note on Firebase rules:** Default Firebase rules may block anonymous reads of `rundown/*`. If reads fail with permission errors, the user will need to add a rule that permits reads to `rundown/kitchen/lists/{listId}` and `rundown/kitchen/items/{listId}` (which already happens via the existing rule set — Daily Rundown allows public read of the family data tree). Verify in dev that the read works; if not, defer Firebase rule changes to a separate follow-up that the user runs in the Firebase console.

---

## Feature F — Multi-option meal voting

The most invasive feature — schema migration on `rundown/kitchenPlan`. Lazy migration: existing single-object entries read as one-element arrays, write back as array on first mutation.

### Task F1: normalizePlanSlot helper + pickWinner + write update

**Files:**
- Modify: `shared/utils.js` — new `normalizePlanSlot`, `pickWinner` exports
- Modify: `shared/firebase.js` — update `writeKitchenPlanSlot` to always write array

### Step 1: Add helpers to utils.js

```js
// Convert a stored kitchenPlan slot value (single object — legacy — OR
// array — new) into an array. Always returns an array; missing slot
// returns [].
export function normalizePlanSlot(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

// Given an array of meal options with votes maps, return the winning
// option. Ties broken by earliest addedAt. Returns null if the array is
// empty.
export function pickWinner(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  if (options.length === 1) return options[0];
  let bestIdx = 0;
  let bestScore = -1;
  let bestAddedAt = Infinity;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const score = opt?.votes ? Object.keys(opt.votes).length : 0;
    const addedAt = opt?.addedAt || 0;
    if (score > bestScore || (score === bestScore && addedAt < bestAddedAt)) {
      bestIdx = i;
      bestScore = score;
      bestAddedAt = addedAt;
    }
  }
  return options[bestIdx];
}
```

### Step 2: Update writeKitchenPlanSlot

In `shared/firebase.js`, find `writeKitchenPlanSlot`. Currently it writes a single object. Update it to always write an array — but accept either a single object (auto-wrapped) or an array:
```js
export function writeKitchenPlanSlot(dateKey, slot, data) {
  // Always store as an array so the schema is one shape going forward.
  // Single-element arrays for the common case; lazy migration on read.
  const value = Array.isArray(data) ? data : [data];
  return getDb().ref(`${ROOT}/kitchen/plan/${dateKey}/${slot}`).set(value);
}
```

(Adapt the path to match the existing pattern in the file.)

### Step 3: Commit

```bash
git add shared/utils.js shared/firebase.js
git commit -m "feat(kitchen): normalizePlanSlot + pickWinner; writeKitchenPlanSlot writes arrays

normalizePlanSlot reads either legacy single-object or new array shapes
and always returns an array. pickWinner picks the option with the most
votes (ties broken by earliest addedAt). writeKitchenPlanSlot now
auto-wraps single objects into one-element arrays so the on-disk shape
is consistently 'array of options' going forward. Existing data is
read transparently via normalizePlanSlot — no bulk migration.
"
```

---

### Task F2: Meals tab day-block — render array shape

**Files:**
- Modify: `kitchen.js` — slot row rendering inside `renderMealsTab`

### Step 1: Import the helpers

Update the import from `shared/utils.js` in kitchen.js to include `normalizePlanSlot` and `pickWinner`.

### Step 2: Adapt slot reading

Find the slot rendering inside `renderMealsTab`. Wherever it reads `plan[s]` and expects a single object, replace with:
```js
const optionsForSlot = normalizePlanSlot(plan[s]);
if (optionsForSlot.length === 0) continue; // no plan for this slot
const winner = pickWinner(optionsForSlot);
const isMulti = optionsForSlot.length > 1;
const name = winner.recipeId
  ? (recipes[winner.recipeId]?.name || 'Unknown')
  : (winner.mealName || winner.customName || '');
const displayName = isMulti
  ? `${name} <span class="day-block__multi-badge">+${optionsForSlot.length - 1}</span>`
  : name;
```

And use `displayName` in the slot's HTML (instead of `esc(name)` directly — but be careful: `displayName` is already escaped + has HTML, so don't double-escape).

Be explicit:
```js
const safeName = esc(name);
const multiBadge = isMulti ? `<span class="day-block__multi-badge">+${optionsForSlot.length - 1}</span>` : '';
// In the slot row:
slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
  ${buildSlotThumb(winner)}
  <span class="day-block__slot-label">${label}</span>
  <span class="day-block__slot-name">${safeName} ${multiBadge}</span>
</div>`);
```

### Step 3: Add CSS for multi-badge

Append to `styles/kitchen.css`:
```css
.day-block__multi-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: var(--radius-full);
  padding: 1px 6px;
}
```

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): Meals tab day-block reads array-shape plan slots

normalizePlanSlot wraps either legacy single-object or new array shapes
into an array. The day-block renders the winner (via pickWinner) plus
a small '+N' badge when multiple options exist for the slot.
"
```

---

### Task F3: openSlotEditSheet — multi-option voting UI

**Files:**
- Modify: `kitchen.js` — `openSlotEditSheet`

### Step 1: Detect multi-option case

In `openSlotEditSheet`, at the start:
```js
const options = normalizePlanSlot(planCache[dk]?.[slot]);
if (options.length === 0) { return; }
const isMulti = options.length > 1;
```

### Step 2: Branch rendering

If `options.length === 1`, keep the existing single-option layout (recipe name + chips + buttons). If `options.length > 1`, render a vote-card list:
```js
if (isMulti) {
  // ... build vote-card HTML for each option ...
  // Each card: thumbnail + name + vote count + vote button + Lock-in + Remove
}
```

Sketch (insert near the existing single-option render path in `openSlotEditSheet`):
```js
async function getViewerId() {
  if (linkedPerson) return linkedPerson.id;
  // Fall back: prompt-and-cache via sessionStorage
  const cached = sessionStorage.getItem('dr-kitchen-voter-id');
  if (cached && people.find(p => p.id === cached)) return cached;
  // Prompt the user once per session
  const chosenId = await openWhoVotesPrompt(); // small sub-sheet that lists family members
  if (chosenId) sessionStorage.setItem('dr-kitchen-voter-id', chosenId);
  return chosenId;
}

function renderVoteCards() {
  return options.map((opt, i) => {
    const name = opt.recipeId
      ? (recipes[opt.recipeId]?.name || 'Unknown')
      : (opt.mealName || opt.customName || '');
    const voteIds = Object.keys(opt.votes || {});
    const voteCount = voteIds.length;
    const voterNames = voteIds.map(id => people.find(p => p.id === id)?.name).filter(Boolean);
    const winnerCls = (pickWinner(options) === opt) ? ' vote-card--winner' : '';
    return `
      <div class="vote-card${winnerCls}" data-vote-idx="${i}">
        <div class="vote-card__title">${esc(name)}${winnerCls ? ' <span class="vote-card__crown">🏆</span>' : ''}</div>
        <div class="vote-card__row">
          ${voterNames.length ? voterNames.map(n => `<span class="vote-chip">${esc(n)}</span>`).join('') : '<span class="vote-card__nobody">No votes yet</span>'}
          <button class="btn btn--ghost btn--sm" data-vote-toggle="${i}" type="button">👍 ${voteCount}</button>
        </div>
        <div class="vote-card__actions">
          <button class="btn btn--secondary btn--sm" data-vote-lock="${i}" type="button">Lock in</button>
          <button class="btn btn--ghost btn--sm" data-vote-remove="${i}" type="button">Remove</button>
        </div>
      </div>`;
  }).join('');
}
```

And bind the actions:
```js
mount.querySelectorAll('[data-vote-toggle]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const voterId = await getViewerId();
    if (!voterId) return;
    const i = parseInt(btn.dataset.voteToggle, 10);
    const opt = options[i];
    const votes = { ...(opt.votes || {}) };
    if (votes[voterId]) delete votes[voterId];
    else votes[voterId] = 1;
    options[i] = { ...opt, votes };
    await writeKitchenPlanSlot(dk, slot, options);
    planCache[dk] = { ...planCache[dk], [slot]: options };
    openSlotEditSheet(dk, slot, entry); // re-render
  });
});

mount.querySelectorAll('[data-vote-lock]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const i = parseInt(btn.dataset.voteLock, 10);
    const winner = options[i];
    // Lock in: write back ONE option, dropping the rest.
    await writeKitchenPlanSlot(dk, slot, [winner]);
    planCache[dk] = { ...planCache[dk], [slot]: [winner] };
    mount.innerHTML = '';
    await renderMealsTab();
    showToast('Winner locked in');
  });
});

mount.querySelectorAll('[data-vote-remove]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const i = parseInt(btn.dataset.voteRemove, 10);
    const remaining = options.filter((_, idx) => idx !== i);
    if (remaining.length === 0) {
      // Removed last option — clear the slot.
      await removeKitchenPlanSlot(dk, slot);
      delete planCache[dk][slot];
      mount.innerHTML = '';
      await renderMealsTab();
      return;
    }
    await writeKitchenPlanSlot(dk, slot, remaining);
    planCache[dk] = { ...planCache[dk], [slot]: remaining };
    openSlotEditSheet(dk, slot, entry); // re-render
  });
});
```

### Step 3: `openWhoVotesPrompt` sub-sheet

Add a small helper inside `openSlotEditSheet`'s closure (or near it):
```js
async function openWhoVotesPrompt() {
  return new Promise(resolve => {
    const mount = document.getElementById('sheetMount');
    const existing = mount.innerHTML; // preserve current sheet
    const overlay = document.createElement('div');
    overlay.className = 'who-overlay';
    overlay.innerHTML = `
      <div class="who-card">
        <div class="who-title">Who's voting?</div>
        <div class="who-chips">
          ${people.map(p => `<button class="chip" data-who-id="${esc(p.id)}" type="button" style="--chip-color:${esc(p.color || '#888')}">${esc(p.name)}</button>`).join('')}
        </div>
        <button class="btn btn--ghost btn--sm who-cancel" type="button">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-who-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.whoId;
        overlay.remove();
        resolve(id);
      });
    });
    overlay.querySelector('.who-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}
```

### Step 4: Add the "Add another option" entry from Plan-a-meal

In the single-option `openSlotEditSheet` branch, add a chip near the bottom of the existing actions row:
```js
${options.length < 3 ? `<button class="chip" id="addAnotherOption" type="button">+ Add another option</button>` : ''}
```

Wire it:
```js
document.getElementById('addAnotherOption')?.addEventListener('click', () => {
  mount.innerHTML = '';
  // Open Plan-a-meal pre-set to this date + slot. The save handler in T2 of
  // SP1 was written for the array shape via writeKitchenPlanSlot; it should
  // append cleanly via the array-write path below.
  openPlanMealSheet(dk, slot, null, { appendMode: true });
});
```

(Pass the `appendMode: true` option — see Task F4 for the corresponding change in `openPlanMealSheet`.)

### Step 5: Add CSS

Append to `styles/kitchen.css`:
```css
.vote-card {
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}
.vote-card--winner {
  border: 1px solid var(--accent);
}
.vote-card__title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
  margin-bottom: var(--spacing-xs);
}
.vote-card__crown { font-size: var(--font-sm); }
.vote-card__row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-sm);
}
.vote-chip {
  font-size: var(--font-xs);
  background: var(--surface);
  color: var(--text);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
.vote-card__nobody {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-style: italic;
}
.vote-card__actions {
  display: flex;
  gap: var(--spacing-xs);
}

.who-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.who-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  width: 90%;
  max-width: 360px;
}
.who-title {
  font-size: var(--font-md);
  font-weight: 600;
  margin-bottom: var(--spacing-md);
}
.who-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}
.who-cancel {
  display: block;
  margin: 0 auto;
}
```

### Step 6: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): multi-option voting UI in slot-edit sheet

When a slot has 2+ options, the slot-edit sheet renders one card per
option with vote chips, a vote-toggle button, Lock-in (collapses to
single winner), and Remove. Single-option slots keep the existing
detail layout plus a small '+ Add another option' chip (when fewer
than 3 options exist). Cap: 3 options per slot.

Vote identity comes from linkedPerson (?person=X URL) when present;
otherwise prompts 'Who's voting?' once per session and caches in
sessionStorage. No individual scores are shown — only the per-person
chips.
"
```

---

### Task F4: Plan-a-meal `appendMode` support

**Files:**
- Modify: `kitchen.js` — `openPlanMealSheet` save handler

### Step 1: Accept appendMode option

Update `openPlanMealSheet`'s signature to accept an optional options object:
```js
function openPlanMealSheet(preDate, preSlot, preRecipeId = null, opts = {}) {
  const appendMode = opts.appendMode === true;
  // ... existing body ...
```

### Step 2: Append on save

In the save handler, when `appendMode` is true and the slot already has options, append the new option instead of replacing:
```js
const existingOptions = normalizePlanSlot(planCache[day]?.[concreteSlot]);
let finalArray;
if (appendMode && existingOptions.length > 0) {
  finalArray = [...existingOptions, firstData];
  if (finalArray.length > 3) finalArray = finalArray.slice(0, 3); // cap at 3
} else {
  finalArray = [firstData];
}
await writeKitchenPlanSlot(day, concreteSlot, finalArray);
```

(Adapt to the existing save-handler structure — `firstData` is the variable name from SP1's school-slot logic; verify the actual local variable name in current code.)

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): Plan-a-meal appendMode for multi-option slots

When opened with { appendMode: true }, save handler appends the new
option to the existing array instead of replacing. Cap at 3 options
per slot. Used by the '+ Add another option' chip in the slot-edit
sheet (multi-option voting feature).
"
```

### Step 4: Verify

Open a planned slot (single option). Tap `+ Add another option`. Plan-a-meal opens. Pick a different recipe. Save. Slot-edit sheet now shows TWO vote cards. Vote on one → vote chip appears for the current viewer. Tap Lock in on the other → slot collapses to a single option. The meals-tab day-block reflects the change.

---

## Task SP4-Final — SW cache bump + smoke test

**Files:**
- Modify: `sw.js` — bump cache + add `share-list.html` to precache

### Step 1: Bump cache

Bump CACHE_NAME and add a comment in the bumps section. Add `/share-list.html` to the precache APP_SHELL array.

### Step 2: Visual smoke test at 412×915 (controller does Playwright)

Subagents skip. Controller verifies:
- Recipe form blur on a duplicate URL triggers the prompt.
- Cook mode renders full-viewport, step navigation works, ingredients toggle works, Done updates lastUsed.
- Meal history sheet opens from the Meals tab, shows 30 days grouped by week.
- AI Tools sheet RECIPES section has 4 buttons; What can I make? opens the suggest sub-sheet; suggestions render after Worker call.
- Overflow menu Share read-only link generates a URL + Copy / Open work.
- `share-list.html` viewer renders for a valid token; shows error for invalid token.
- Multi-option voting: add a second option via slot-edit `+ Add another option`; vote chips render; Lock-in collapses.
- No regressions on Meals / Recipes / Lists at 412×915.

### Step 3: Commit + ship

```bash
git add sw.js
git commit -m "chore(sw): bump cache for kitchen new features (SP4)

New file share-list.html added to precache list."
```

Then `superpowers:finishing-a-development-branch` → Option 1 → merge to main, push, deploy via Cloudflare Pages.

**Reminder:** After this merge, do one `wrangler deploy workers/kitchen-import.js` to activate `recipeSuggest` (plus all the pending fixes from earlier sub-projects).

---

## Acceptance criteria mapping

Spec §8 lists 26 ACs. Mapping:

| Spec AC | Task |
|---|---|
| 1-5  Cook mode (Start cooking button, fullscreen, wake-lock, Done lastUsed, Close behavior) | B2, B3 |
| 6-8  Meal history (History entry, sheet renders, tap row → recipe) | C1, C2, C3 |
| 9-12 AI suggestions (button, sub-sheet, Worker, save creates stub) | D1, D2 |
| 13-16 Share-list (overflow entry, sheet generate-or-reuse, viewer renders + revoke) | E1, E2, E3 |
| 17-18 Dup detection (prompt on blur, Open existing closes form + opens detail) | A1 |
| 19-24 Multi-option voting (array shape, slot-edit single-option unchanged, multi vote cards, lock-in, day-block +N badge, cap 3) | F1, F2, F3, F4 |
| 25 SW cache bump | SP4-Final |
| 26 No regressions | SP4-Final |

All 26 covered.

---

## Self-review notes

- **Placeholder scan:** every step has code or commands.
- **Type/name consistency:** `normalizePlanSlot`, `pickWinner`, `generateShareToken`, `parseSteps`, `urlToDataUrl`, `openCookModeSheet`, `openMealHistorySheet`, `openAiSuggestSheet`, `openShareListSheet` referenced consistently.
- **Schema migration safety:** F1's `writeKitchenPlanSlot` auto-wraps single objects; F2's `normalizePlanSlot` handles both shapes on read. No bulk migration job needed — drift heals lazily per-slot.
- **Worker contract:** `recipeSuggest` handler shape matches the client's consumption (D2 reads `data.suggestions[].name/description/tags`).
- **Test gate adaptation:** Manual Playwright check at 412×915 per task.
- **Known follow-up:** Firebase security rules may need adjustment for the share-list.html anonymous read path. Verify in dev; defer to a separate Firebase console change if blocked.
