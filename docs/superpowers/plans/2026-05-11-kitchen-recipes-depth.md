# Kitchen Recipes Tab Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Testing note:** No test runner in this codebase (vanilla JS, no npm in frontend per [CLAUDE.md](../../../CLAUDE.md)). "Verify" steps are manual Playwright checks at 412×915 mobile viewport. Treat each verification as the gate — do NOT mark a task complete without passing it.

**Goal:** Lift the Kitchen Recipes tab to dashboard-quality — library cards gain thumbnails + rating/prep/last-cooked chips, sticky search input filters in real time, Filter & Sort sheet expands from 2 dimensions to 5, AI Tools RECIPES section gets wired with URL/photo/find-ideas actions.

**Architecture:** All changes inside the existing Recipes tab surface — `renderRecipesTab` and `openRecipeFilterSheet` in `kitchen.js`, plus a new `formatLastCooked` helper in `shared/utils.js`. Reuses the AI Tools sheet shell shipped in SP1. No new Worker handlers, no new Firebase schema. The recipe form itself is unchanged.

**Tech Stack:** Vanilla JS ES modules, Firebase compat SDK, no bundler. CSS uses existing design tokens.

**Spec:** [docs/superpowers/specs/2026-05-11-kitchen-recipes-depth.md](../specs/2026-05-11-kitchen-recipes-depth.md)

---

## File structure overview

| File | Responsibility | Touch type |
|---|---|---|
| [kitchen.js](../../../kitchen.js) | Recipes tab UI + filter sheet + AI Tools RECIPES wiring | Heavy edits to `renderRecipesTab` + `openRecipeFilterSheet` + `openKitchenAiToolsSheet` |
| [styles/kitchen.css](../../../styles/kitchen.css) | Library card / sticky search / filter sheet styles | New rules, some replacements |
| [shared/utils.js](../../../shared/utils.js) | Date/time formatting helpers | One new export: `formatLastCooked` |
| [sw.js](../../../sw.js) | Cache version bump | Single-line bump |

Scope: ~400-500 lines of new code, ~80 lines of replacements.

---

## Pre-flight

### Task 0: Branch

- [ ] **Step 1: Create feature branch off main**

```bash
git checkout main
git pull origin main
git checkout -b feat/kitchen-recipes-depth
```

No commit. The working tree may carry the pre-existing uncommitted files unrelated to this sub-project — `git add` per-file in each task to avoid roping them in.

- [ ] **Step 2: Confirm dev server is up** (`node serve.js`, port 8080). Skip if already running.

---

## Task 1: `formatLastCooked` and `formatPrepBucket` helpers

Per spec §6: two helper functions. `formatLastCooked` is a shared utility (exported from `shared/utils.js`). `formatPrepBucket` is local to `kitchen.js` (only the filter logic needs it).

**Files:**
- Modify: `shared/utils.js` — add new export `formatLastCooked`
- Modify: `kitchen.js` — add local helper `formatPrepBucket` near the existing fraction/qty helpers

### Step 1: Add `formatLastCooked` to `shared/utils.js`

Append a new export. The function takes `(timestamp, timezone, todayStr)` and returns a human-readable string per the spec table:

```js
// Format a "last cooked" timestamp as a human-readable relative phrase.
// Uses the family timezone for day comparisons so the day count matches
// what the user perceives, not the device's local time.
export function formatLastCooked(timestamp, timezone, todayStr) {
  if (!timestamp) return 'Never cooked';

  const lastDate = new Date(timestamp);
  const lastKey = lastDate.toLocaleDateString('en-CA', { timeZone: timezone || 'America/Chicago' });
  if (lastKey === todayStr) return 'Cooked today';

  const today = new Date(todayStr + 'T00:00:00');
  const last  = new Date(lastKey  + 'T00:00:00');
  const diffMs = today.getTime() - last.getTime();
  const days = Math.round(diffMs / 86400000);

  if (days <= 0) return 'Cooked today';
  if (days === 1) return 'Cooked yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 14)  return 'Last week';
  if (days < 28)  return `${Math.floor(days / 7)}w ago`;
  if (days < 60)  return 'Last month';
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return 'Over a year ago';
}
```

The `toLocaleDateString('en-CA', { timeZone })` trick returns `YYYY-MM-DD` for any timezone — matches the existing `todayKey()` shape elsewhere.

### Step 2: Add `formatPrepBucket` to `kitchen.js`

Insert near the existing `parseQtyAmount` / `formatFraction` helpers (around [kitchen.js:26](../../../kitchen.js#L26)):

```js
// Parse a prep-time string into minutes for filter bucketing only.
// Returns null when the string is empty/unrecognizable — the caller treats
// null as "exclude from any specific bucket" rather than "include in <30".
function formatPrepBucket(prepTimeStr) {
  if (!prepTimeStr || typeof prepTimeStr !== 'string') return null;
  const s = prepTimeStr.toLowerCase().trim();
  if (!s) return null;

  let total = 0;
  let matched = false;

  // Hours: "1h", "1 hr", "1 hour", "1 hours"
  const hr = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour|hours)\b/);
  if (hr) { total += parseFloat(hr[1]) * 60; matched = true; }

  // Minutes: "30m", "30 min", "30 mins", "30 minutes"
  const mn = s.match(/(\d+(?:\.\d+)?)\s*(?:m\b|min|mins|minute|minutes)/);
  if (mn) { total += parseFloat(mn[1]); matched = true; }

  // Bare number (no unit): treat as minutes
  if (!matched) {
    const bare = s.match(/^(\d+(?:\.\d+)?)$/);
    if (bare) { total = parseFloat(bare[1]); matched = true; }
  }

  return matched && total > 0 ? Math.round(total) : null;
}
```

### Step 3: Commit

```bash
git add shared/utils.js kitchen.js
git commit -m "feat(kitchen): formatLastCooked + formatPrepBucket helpers

formatLastCooked returns relative phrases ('Cooked today' / '3d ago' /
'Last week' / 'X months ago') honoring family timezone. formatPrepBucket
parses prep-time strings into minutes for filter bucketing.
"
```

### Step 4: Verify (no UI yet — manual probe)

Open the kitchen page in the browser and in the console:
```js
import('/shared/utils.js').then(m => {
  console.log(m.formatLastCooked(null, 'America/Chicago', '2026-05-11'));         // 'Never cooked'
  console.log(m.formatLastCooked(Date.now(), 'America/Chicago', '2026-05-11'));    // 'Cooked today'
  console.log(m.formatLastCooked(Date.now() - 3*86400000, 'America/Chicago', '2026-05-11')); // '3d ago'
  console.log(m.formatLastCooked(Date.now() - 21*86400000, 'America/Chicago', '2026-05-11')); // '3w ago'
});
```

---

## Task 2: Library card rebuild — 56×56 thumb + chip line

Per spec §1: replace the existing card row with a thumbnail-leading layout.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderRecipesTab` recipe-card HTML
- Modify: [styles/kitchen.css](../../../styles/kitchen.css) — `.rl-recipe-card` rules

### Step 1: Add imports + use in `renderRecipesTab`

In the import block at the top of `kitchen.js`, add `formatLastCooked` to the `from './shared/utils.js'` line. Existing line looks like:
```js
import { todayKey, escapeHtml } from './shared/utils.js';
```

Change to:
```js
import { todayKey, escapeHtml, formatLastCooked } from './shared/utils.js';
```

### Step 2: Rebuild the recipe-card HTML

In `renderRecipesTab` (around [kitchen.js:362-377](../../../kitchen.js#L362-L377)), the existing card HTML is:
```js
<article class="card rl-recipe-card" data-recipe-id="${esc(id)}">
  <div class="card__body rl-card-body">
    <div class="card__title">${esc(r.name)}</div>
    <div class="card__meta">
      ${r.ingredients?.length ? `${r.ingredients.length} ingredient${r.ingredients.length !== 1 ? 's' : ''}` : 'No ingredients'}
    </div>
  </div>
  <div class="rl-card-actions">
    <button class="btn-icon rl-fav-btn${r.isFavorite ? ' is-fav' : ''}"
      data-fav-recipe="${esc(id)}" type="button" aria-label="${r.isFavorite ? 'Unfavorite' : 'Favorite'}">
      ${r.isFavorite ? starFilled : starEmpty}
    </button>
    ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"
        class="btn-icon" aria-label="Open recipe link" data-recipe-link="${esc(id)}">${linkIcon}</a>` : ''}
  </div>
</article>
```

Replace the body of the `.map()` with a thumbnail-leading layout. Also need a `buildRecipeCardThumb` helper near the top of `renderRecipesTab`:

```js
function buildRecipeCardThumb(recipe) {
  if (recipe?.imageUrl) {
    return `<img class="rl-card-thumb" src="${esc(recipe.imageUrl)}" alt="" loading="lazy">`;
  }
  return `<span class="rl-card-thumb rl-card-thumb--placeholder" aria-hidden="true">🍴</span>`;
}

function buildRecipeCardChips(recipe) {
  const ratingValue = recipe?.rating || 0;
  let ratingChip;
  if (ratingValue > 0) {
    const stars = '★★★★★'.slice(0, ratingValue) + '☆☆☆☆☆'.slice(0, 5 - ratingValue);
    ratingChip = `<span class="rl-chip rl-chip--rating">${stars}</span>`;
  } else {
    ratingChip = `<span class="rl-chip rl-chip--unrated">Not rated</span>`;
  }
  const prepChip = recipe?.prepTime ? `<span class="rl-chip">${esc(recipe.prepTime)}</span>` : '';
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);
  const lastChip = `<span class="rl-chip">${esc(formatLastCooked(recipe?.lastUsed, tz, todayStr))}</span>`;
  return [ratingChip, prepChip, lastChip].filter(Boolean).join('<span class="rl-chip-sep">·</span>');
}
```

Then the card HTML becomes:
```js
<article class="card rl-recipe-card" data-recipe-id="${esc(id)}">
  ${buildRecipeCardThumb(r)}
  <div class="rl-card-body">
    <div class="rl-card-title">${esc(r.name)}</div>
    <div class="rl-card-chips">${buildRecipeCardChips(r)}</div>
  </div>
  <div class="rl-card-actions">
    <button class="btn-icon rl-fav-btn${r.isFavorite ? ' is-fav' : ''}"
      data-fav-recipe="${esc(id)}" type="button" aria-label="${r.isFavorite ? 'Unfavorite' : 'Favorite'}">
      ${r.isFavorite ? starFilled : starEmpty}
    </button>
    ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"
        class="btn-icon" aria-label="Open recipe link" data-recipe-link="${esc(id)}">${linkIcon}</a>` : ''}
  </div>
</article>
```

Note we dropped the `card__title` / `card__meta` classes — they applied global ellipsis + meta typography. The new `.rl-card-title` and `.rl-card-chips` get their own rules below to keep the card focused.

### Step 3: Replace `.rl-recipe-card` styles

In `styles/kitchen.css`, find the existing `.rl-recipe-card` + `.rl-card-body` block (around [styles/kitchen.css:134-152](../../../styles/kitchen.css#L134-L152)) and replace with:

```css
.rl-recipe-card {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
}

.rl-card-thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  font-size: 24px;
}

.rl-card-thumb--placeholder {
  /* surface-2 + 🍴 centered — inherited from .rl-card-thumb */
}

.rl-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rl-card-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rl-card-chips {
  font-size: var(--font-xs);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.rl-chip {
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.rl-chip--rating {
  color: var(--accent);
  letter-spacing: 1px;
}

.rl-chip--unrated {
  color: var(--text-faint);
  font-style: italic;
}

.rl-chip-sep {
  color: var(--text-faint);
}
```

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css shared/utils.js
git commit -m "feat(recipes): library cards gain thumb + rating/prep/last-cooked

56×56 thumbnail leads each card (recipe.imageUrl or 🍴 placeholder).
Second line carries a chip strip: star rating, prep-time, last-cooked
relative phrase. Drops the prior 'X ingredients' line.
"
```

### Step 5: Verify in browser

Reload `http://localhost:8080/kitchen.html`. Tap the Recipes tab. Each card should show a 56×56 image (or 🍴 placeholder) + name + chip line. Star+link icons stay on the right. No regression to tap-to-detail or favorite toggle.

---

## Task 3: Sticky search input above the controls row

Per spec §2: real-time filter input that sticks to the top.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderRecipesTab` (add search input + filter logic)
- Modify: [styles/kitchen.css](../../../styles/kitchen.css) — sticky search styles

### Step 1: Add search state

At the top of `kitchen.js` near the other state declarations (around [kitchen.js:107-116](../../../kitchen.js#L107-L116)), add:
```js
let recipeSearchQuery = ''; // transient — not persisted across sessions
```

### Step 2: Add search input to `renderRecipesTab`

Modify `renderRecipesTab` (around [kitchen.js:338-416](../../../kitchen.js#L338-L416)) so:

1. Filtering applies both `recipeFilter` and `recipeSearchQuery` (intersection).
2. The HTML structure is:
```js
content.innerHTML = `
  <div class="rl-wrap">
    <div class="rl-search-row">
      <span class="rl-search-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
      <input class="rl-search-input" id="rlSearch" type="search" placeholder="Search recipes…" value="${esc(recipeSearchQuery)}" autocomplete="off" autocorrect="off">
      ${recipeSearchQuery ? `<button class="rl-search-clear" id="rlSearchClear" type="button" aria-label="Clear search">✕</button>` : ''}
    </div>
    <div class="rl-controls">
      <span class="rl-count">${esc(countLabel)}</span>
      <button class="chip rl-filter-btn${filterCount > 0 ? ' chip--active' : ''}" id="recipeFilterBtn" type="button">${filterLabel} &#9662;</button>
    </div>
    <div id="recipeLibrary">${recipeLibHtml}</div>
  </div>`;
```

3. After mounting, bind:
```js
const searchInput = document.getElementById('rlSearch');
searchInput?.addEventListener('input', (e) => {
  recipeSearchQuery = e.target.value;
  renderRecipesTab();
  // Re-focus the input — re-render replaces the DOM and the focus is lost.
  setTimeout(() => {
    const next = document.getElementById('rlSearch');
    if (next) {
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    }
  }, 0);
});
document.getElementById('rlSearchClear')?.addEventListener('click', () => {
  recipeSearchQuery = '';
  renderRecipesTab();
});
```

4. The filter pipeline that computes `recipeEntries` (around [kitchen.js:340-351](../../../kitchen.js#L340-L351)) gains a search filter step before the sort:
```js
let recipeEntries = Object.entries(recipes);
if (recipeFilter.filter === 'favorites') recipeEntries = recipeEntries.filter(([, r]) => r.isFavorite);
const q = recipeSearchQuery.trim().toLowerCase();
if (q) recipeEntries = recipeEntries.filter(([, r]) => (r.name || '').toLowerCase().includes(q));
// ...existing sort logic stays...
```

5. Remove the `Find ideas online` `<button>` chip — that's Task 4. Keep it for now; it'll be deleted next.

### Step 3: Add CSS

Append to `styles/kitchen.css`:
```css
.rl-search-row {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) 0;
  background: var(--bg);
}

.rl-search-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  padding-left: 12px;
  pointer-events: none;
  position: absolute;
  left: 0;
}

.rl-search-input {
  flex: 1;
  width: 100%;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: var(--font-md);
  padding: 10px 36px 10px 38px;
  outline: none;
  transition: border-color var(--t-fast);
}

.rl-search-input::placeholder { color: var(--text-faint); }
.rl-search-input:focus { border-color: var(--accent); }

.rl-search-clear {
  position: absolute;
  right: 8px;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  border-radius: var(--radius-full);
}
.rl-search-clear:active { background: var(--surface-2); }
```

Note: the search row is `position: relative` implicitly via flex; the icon and clear button are positioned absolutely inside it. Make sure `.rl-search-row { position: sticky; ... }` doesn't conflict with the positioning context. Add `position: relative` if needed.

Actually the sticky positioning will work for the row as a whole — the absolute-positioned children are positioned relative to the row. Update the rule:

```css
.rl-search-row {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) 0;
  background: var(--bg);
  /* Sticky needs the element itself to be a positioning context */
}

/* But the icon + clear button need a positioning context that's NOT
   the sticky one (sticky + absolute = browser confusion). Use a wrapper. */
```

Actually simpler — make the children flex items, not absolute-positioned. Rewrite:

```css
.rl-search-row {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) 0;
  background: var(--bg);
}

.rl-search-input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.rl-search-icon {
  position: absolute;
  left: 12px;
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
  pointer-events: none;
}

.rl-search-input {
  flex: 1;
  width: 100%;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: var(--font-md);
  padding: 10px 36px 10px 38px;
  outline: none;
  transition: border-color var(--t-fast);
}

.rl-search-input::placeholder { color: var(--text-faint); }
.rl-search-input:focus { border-color: var(--accent); }

.rl-search-clear {
  position: absolute;
  right: 8px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  border-radius: var(--radius-full);
}
.rl-search-clear:active { background: var(--surface-2); }

/* Type="search" reset to suppress browser-default clear UI */
.rl-search-input::-webkit-search-decoration,
.rl-search-input::-webkit-search-cancel-button,
.rl-search-input::-webkit-search-results-button,
.rl-search-input::-webkit-search-results-decoration { -webkit-appearance: none; }
```

Update the HTML in `renderRecipesTab` to use the wrapper:
```js
<div class="rl-search-row">
  <div class="rl-search-input-wrap">
    <span class="rl-search-icon" aria-hidden="true"><svg ...></svg></span>
    <input class="rl-search-input" id="rlSearch" type="search" placeholder="Search recipes…" value="${esc(recipeSearchQuery)}" autocomplete="off">
    ${recipeSearchQuery ? `<button class="rl-search-clear" id="rlSearchClear" type="button" aria-label="Clear search">✕</button>` : ''}
  </div>
</div>
```

### Step 4: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(recipes): sticky search input filters library in real time

Search applies on top of the existing favorites/sort filter (intersection).
Sticky at the top of the Recipes tab. Trailing ✕ clears the query.
"
```

### Step 5: Verify

Reload Recipes. A search bar at the top is sticky as you scroll. Type "chicken" → only chicken-named recipes remain. Tap ✕ → reverts to full list. Verify the sticky behavior in long lists by scrolling and confirming the search input remains visible.

---

## Task 4: AI Tools RECIPES section wiring + drop "Find ideas online" chip

Per spec §3 + §5: relocate the "Find ideas online" entry point + add URL/photo entries to the AI Tools sheet's RECIPES section. Drop the standalone chip from the Recipes tab.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderRecipesTab` (drop chip), `openKitchenAiToolsSheet` (replace "coming soon" with 3 buttons + handlers)

### Step 1: Drop `Find ideas online` chip from `renderRecipesTab`

In `renderRecipesTab`, find and DELETE both:
- The `<button class="chip rl-find-btn" id="findRecipesBtn" type="button">Find ideas online &#x2197;</button>` line.
- The `document.getElementById('findRecipesBtn')?.addEventListener('click', openFindRecipesSheet);` line.

Keep `openFindRecipesSheet` function definition unchanged — it just won't be called from the Recipes tab anymore.

### Step 2: Replace RECIPES "coming soon" placeholder in `openKitchenAiToolsSheet`

In `openKitchenAiToolsSheet` (added in SP1 task 8), find the RECIPES section block:
```js
<div class="kait-section">
  <div class="kait-section__label">RECIPES</div>
  <div class="kait-soon">Coming in the next Kitchen update</div>
</div>
```

Replace with:
```js
<div class="kait-section">
  <div class="kait-section__label">RECIPES</div>
  <div class="kait-grid">
    <button class="btn btn--secondary" id="kait_recipeUrl" type="button">🔗 Import from URL</button>
    <button class="btn btn--secondary" id="kait_recipePhoto" type="button">📷 Import from photo</button>
    <button class="btn btn--secondary" id="kait_recipeFind" type="button">🔎 Find ideas online</button>
  </div>
</div>
```

### Step 3: Wire the three buttons

After the existing school-lunch button bindings inside `openKitchenAiToolsSheet`, add:
```js
document.getElementById('kait_recipeUrl')?.addEventListener('click', () => {
  mount.innerHTML = '';
  openRecipeForm(null);
  // Focus the URL field after the form is mounted
  setTimeout(() => document.getElementById('recipeUrl')?.focus(), 50);
});

document.getElementById('kait_recipePhoto')?.addEventListener('click', () => {
  mount.innerHTML = '';
  openRecipeForm(null);
  // Trigger the photo-source picker via the existing camera button
  setTimeout(() => document.getElementById('kr_photo')?.click(), 50);
});

document.getElementById('kait_recipeFind')?.addEventListener('click', () => {
  mount.innerHTML = '';
  openFindRecipesSheet();
});
```

### Step 4: Commit

```bash
git add kitchen.js
git commit -m "feat(recipes): AI Tools RECIPES section wired; standalone chip removed

URL / photo / find-ideas relocated to the AI Tools sheet. The standalone
'Find ideas online' chip on the Recipes tab is gone. openFindRecipesSheet
and openRecipeForm functions are unchanged — only entry points shifted.
"
```

### Step 5: Verify

Reload Recipes — no `Find ideas online` chip in the controls row. Tap the wand → AI Tools sheet → RECIPES section has 3 buttons. Tap `Import from URL` → recipe form opens with URL field focused. Tap `Find ideas online` → existing 8-site drawer opens.

---

## Task 5: Filter & Sort sheet rebuild — 5 dimensions

Per spec §4: rebuild `openRecipeFilterSheet` for Show / Prep / Difficulty / Tags / Sort by.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `openRecipeFilterSheet` + filter pipeline + `recipeFilter` state shape

### Step 1: Update the `recipeFilter` state shape

At the top of `kitchen.js`, find the existing state declaration:
```js
let recipeFilter = { sort: 'alpha', filter: 'all' };
```

Replace with the new shape:
```js
let recipeFilter = {
  show: 'all',          // 'all' | 'favorites' | 'never-cooked'
  prepBucket: 'any',    // 'any' | 'lt-30' | '30-60' | 'gt-60'
  difficulty: 'any',    // 'any' | 'Easy' | 'Medium' | 'Hard'
  tags: [],             // [] = no tag filter; else AND across these tag strings
  sort: 'alpha',        // 'alpha' | 'recent' | 'quickest' | 'last-cooked' | 'highest-rated'
};
```

### Step 2: Update the filter pipeline in `renderRecipesTab`

Replace the existing filter+sort block with the new five-dimension logic:
```js
let recipeEntries = Object.entries(recipes);

// SHOW
if (recipeFilter.show === 'favorites') {
  recipeEntries = recipeEntries.filter(([, r]) => r.isFavorite);
} else if (recipeFilter.show === 'never-cooked') {
  recipeEntries = recipeEntries.filter(([, r]) => !r.lastUsed);
}

// PREP BUCKET
if (recipeFilter.prepBucket !== 'any') {
  recipeEntries = recipeEntries.filter(([, r]) => {
    const mins = formatPrepBucket(r.prepTime);
    if (mins == null) return false;
    if (recipeFilter.prepBucket === 'lt-30') return mins < 30;
    if (recipeFilter.prepBucket === '30-60') return mins >= 30 && mins <= 60;
    return mins > 60;
  });
}

// DIFFICULTY
if (recipeFilter.difficulty !== 'any') {
  recipeEntries = recipeEntries.filter(([, r]) => r.difficulty === recipeFilter.difficulty);
}

// TAGS (AND across selected tags)
if (recipeFilter.tags?.length) {
  recipeEntries = recipeEntries.filter(([, r]) => {
    const rtags = r.tags || [];
    return recipeFilter.tags.every(t => rtags.includes(t));
  });
}

// SEARCH (already added in Task 3)
const q = recipeSearchQuery.trim().toLowerCase();
if (q) recipeEntries = recipeEntries.filter(([, r]) => (r.name || '').toLowerCase().includes(q));

// SORT
recipeEntries.sort((a, b) => {
  const [, ra] = a, [, rb] = b;
  switch (recipeFilter.sort) {
    case 'recent':         return (rb.createdAt || 0) - (ra.createdAt || 0);
    case 'quickest': {
      const ma = formatPrepBucket(ra.prepTime); const mb = formatPrepBucket(rb.prepTime);
      if (ma == null && mb == null) return 0;
      if (ma == null) return 1;
      if (mb == null) return -1;
      return ma - mb;
    }
    case 'last-cooked': {
      const la = ra.lastUsed || 0; const lb = rb.lastUsed || 0;
      return lb - la;
    }
    case 'highest-rated': return (rb.rating || 0) - (ra.rating || 0);
    case 'alpha':
    default:               return (ra.name || '').localeCompare(rb.name || '');
  }
});
```

### Step 3: Update the filter-count label

Find the `filterCount` / `filterLabel` block:
```js
const filterCount = (recipeFilter.filter !== 'all' ? 1 : 0) + (recipeFilter.sort !== 'alpha' ? 1 : 0);
```

Replace with the new five-dimension count:
```js
const filterCount =
  (recipeFilter.show !== 'all'         ? 1 : 0) +
  (recipeFilter.prepBucket !== 'any'   ? 1 : 0) +
  (recipeFilter.difficulty !== 'any'   ? 1 : 0) +
  (recipeFilter.tags?.length           ? 1 : 0) +
  (recipeFilter.sort !== 'alpha'       ? 1 : 0);
const filterLabel = filterCount > 0 ? `Filter & Sort · ${filterCount}` : 'Filter & Sort';
```

### Step 4: Rebuild `openRecipeFilterSheet`

Replace the existing function ([kitchen.js:949-989](../../../kitchen.js#L949-L989)) with:

```js
function openRecipeFilterSheet() {
  const mount = document.getElementById('sheetMount');

  // Build the tag pool from all recipes (deduplicated, alpha-sorted).
  const tagPool = (() => {
    const set = new Set();
    Object.values(recipes).forEach(r => (r.tags || []).forEach(t => {
      const trim = (t || '').trim();
      if (trim) set.add(trim);
    }));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  // Working copy — applied only on Save.
  const work = {
    show: recipeFilter.show,
    prepBucket: recipeFilter.prepBucket,
    difficulty: recipeFilter.difficulty,
    tags: [...(recipeFilter.tags || [])],
    sort: recipeFilter.sort,
  };

  const showOpts = [
    { v: 'all',          l: 'All' },
    { v: 'favorites',    l: 'Favorites' },
    { v: 'never-cooked', l: 'Never cooked' },
  ];
  const prepOpts = [
    { v: 'any',   l: 'Any' },
    { v: 'lt-30', l: '< 30 min' },
    { v: '30-60', l: '30–60 min' },
    { v: 'gt-60', l: '> 60 min' },
  ];
  const diffOpts = [
    { v: 'any',    l: 'Any' },
    { v: 'Easy',   l: 'Easy' },
    { v: 'Medium', l: 'Medium' },
    { v: 'Hard',   l: 'Hard' },
  ];
  const sortOpts = [
    { v: 'alpha',          l: 'A–Z' },
    { v: 'recent',         l: 'Recently added' },
    { v: 'quickest',       l: 'Quickest first' },
    { v: 'last-cooked',    l: 'Last cooked' },
    { v: 'highest-rated',  l: 'Highest rated' },
  ];

  function chipRow(opts, key) {
    return opts.map(o =>
      `<button class="chip${work[key] === o.v ? ' chip--active' : ''}" data-rf-key="${esc(key)}" data-rf-val="${esc(o.v)}" type="button">${esc(o.l)}</button>`
    ).join('');
  }

  function tagsHtml() {
    if (!tagPool.length) {
      return `<div class="filter-section__hint">No tags yet — add tags from the recipe form.</div>`;
    }
    return tagPool.map(t =>
      `<button class="chip${work.tags.includes(t) ? ' chip--active' : ''}" data-rf-tag="${esc(t)}" type="button">${esc(t)}</button>`
    ).join('');
  }

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Filter & Sort', closeId: 'rf_close' })}
    <div class="filter-section">
      <div class="filter-section__label">SHOW</div>
      <div class="filter-chips">${chipRow(showOpts, 'show')}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">PREP TIME</div>
      <div class="filter-chips">${chipRow(prepOpts, 'prepBucket')}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">DIFFICULTY</div>
      <div class="filter-chips">${chipRow(diffOpts, 'difficulty')}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">TAGS</div>
      <div class="filter-chips" id="rfTags">${tagsHtml()}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">SORT BY</div>
      <div class="filter-chips">${chipRow(sortOpts, 'sort')}</div>
    </div>
    ${renderFormFooter({ saveLabel: 'Apply', cancelId: 'rfCancel', saveId: 'rfApply' })}
  `);
  activateSheet(mount);

  // Single-select chip groups (show / prepBucket / difficulty / sort)
  mount.querySelectorAll('[data-rf-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rfKey;
      const val = btn.dataset.rfVal;
      work[key] = val;
      mount.querySelectorAll(`[data-rf-key="${key}"]`).forEach(b => {
        b.classList.toggle('chip--active', b.dataset.rfVal === val);
      });
    });
  });

  // Multi-select tags
  mount.querySelectorAll('[data-rf-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.rfTag;
      if (work.tags.includes(tag)) {
        work.tags = work.tags.filter(t => t !== tag);
      } else {
        work.tags.push(tag);
      }
      btn.classList.toggle('chip--active', work.tags.includes(tag));
    });
  });

  document.getElementById('rf_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('rfCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('rfApply')?.addEventListener('click', () => {
    recipeFilter = { ...work };
    mount.innerHTML = '';
    renderRecipesTab();
  });
}
```

### Step 5: Add CSS for the "No tags yet" hint and section spacing tweaks

Append to `styles/kitchen.css` (these classes are referenced from the rebuilt filter sheet):
```css
.filter-section__hint {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-style: italic;
  padding: var(--spacing-xs) 0;
}
```

(The existing `.filter-section` / `.filter-section__label` / `.filter-chips` rules from `components.css` already cover the rest.)

### Step 6: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(recipes): Filter & Sort sheet rebuilt with 5 dimensions

Show / Prep Time / Difficulty / Tags / Sort By. Tag chips render from
actual tags in the library; empty-state hint when no tags exist.
Single-select for show/prep/difficulty/sort; multi-select (AND) for tags.
"
```

### Step 7: Verify

Reload Recipes. Tap `Filter & Sort` → new sheet with five sections. Apply each filter:
- `Favorites` → only favorited recipes show.
- `< 30 min` → only recipes with parsed prep < 30.
- `Easy` → only Easy difficulty.
- Tap a tag chip → only recipes with that tag.
- `Quickest first` → sorted ascending by parsed prep.
The badge on the controls-row chip increments per active dimension.

---

## Task 6: Empty state for filtered/searched zero results

Per spec §2 + §4: when filters/search yield zero matches, render `renderEmptyState` with a clear-action CTA.

**Files:**
- Modify: [kitchen.js](../../../kitchen.js) — `renderRecipesTab` library rendering

### Step 1: Replace the empty-state branch

In `renderRecipesTab`, find the line that builds `recipeLibHtml`:
```js
const recipeLibHtml = recipeEntries.length > 0
  ? recipeEntries.map(([id, r]) => `... card ...`).join('')
  : renderEmptyState('', 'No recipes yet', 'Tap "New recipe" to add your first.');
```

Replace the empty branch with a context-aware empty state:
```js
const recipeLibHtml = (() => {
  if (recipeEntries.length > 0) {
    return recipeEntries.map(([id, r]) => `... card ...`).join('');
  }
  const totalCount = Object.keys(recipes).length;
  if (totalCount === 0) {
    // Library is empty.
    return renderEmptyState('', 'No recipes yet', 'Tap "New recipe" to add your first.');
  }
  // Library has recipes but the filter/search yields zero.
  const hasSearch = !!recipeSearchQuery.trim();
  const hasFilter = (recipeFilter.show !== 'all' || recipeFilter.prepBucket !== 'any' || recipeFilter.difficulty !== 'any' || recipeFilter.tags?.length);
  const title = 'No recipes match';
  let body;
  if (hasSearch && hasFilter) body = 'Try clearing the search or adjusting filters.';
  else if (hasSearch)         body = 'Try a different search term.';
  else                        body = 'Try a different filter combination.';
  const buttonLabel = hasSearch && hasFilter ? 'Clear search & filters'
                    : hasSearch              ? 'Clear search'
                    :                          'Clear filters';
  return renderEmptyState('', title, body) +
    `<div class="rl-empty-actions"><button class="btn btn--secondary" id="rlClearAll" type="button">${buttonLabel}</button></div>`;
})();
```

Wire the clear button after the content mounts. Add after the existing event bindings in `renderRecipesTab`:
```js
document.getElementById('rlClearAll')?.addEventListener('click', () => {
  recipeSearchQuery = '';
  recipeFilter = {
    show: 'all',
    prepBucket: 'any',
    difficulty: 'any',
    tags: [],
    sort: 'alpha',
  };
  renderRecipesTab();
});
```

### Step 2: Add CSS

Append to `styles/kitchen.css`:
```css
.rl-empty-actions {
  display: flex;
  justify-content: center;
  padding: var(--spacing-md) 0;
}
```

### Step 3: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(recipes): context-aware empty state for zero matches

When the library has recipes but a filter/search yields zero, show a
'No recipes match' empty state with a Clear button that resets the
relevant state (search-only, filter-only, or both).
"
```

### Step 4: Verify

In Recipes tab:
1. Type a garbage search ("zzzzz") → empty state "No recipes match" / "Try a different search term." / `Clear search` button.
2. Open Filter & Sort, select `Never cooked` + `< 30 min` (likely 0 matches given the demo data) + Apply → empty state with `Clear filters` button.
3. Combine garbage search + a restrictive filter → `Clear search & filters` button.
4. Tap the clear button → returns to full library.

---

## Task 7: SW cache bump + final smoke test

**Files:**
- Modify: [sw.js](../../../sw.js) — bump `CACHE_NAME`

### Step 1: Bump cache version

In `sw.js`, find `CACHE_NAME` and increment the version (current after SP1 merge is `v227`; bump to `v228`). Add a comment line near the bump describing the recipes-depth work.

### Step 2: Visual smoke test at 412×915

Via Playwright at 412×915:

1. **Recipes tab — full-page** screenshot:
   - Sticky search row at top.
   - 14+ recipe cards each with a 56×56 thumb on the left, name, and chip line (rating · prep · last-cooked).
   - "Filter & Sort" chip on the right of the controls row.
   - No "Find ideas online" chip.

2. **Search behavior** — type "chick" → list filters in real time. ✕ button appears → tap to clear.

3. **Filter & Sort sheet** — viewport screenshot:
   - SHOW / PREP TIME / DIFFICULTY / TAGS / SORT BY sections.
   - Tag chips populated from real library tags.
   - Apply / Cancel footer.

4. **AI Tools sheet** — viewport screenshot:
   - SCHOOL LUNCH section (4 buttons, from SP1).
   - RECIPES section now has 3 buttons (Import from URL / Import from photo / Find ideas online) — no "coming soon."

5. **Empty-state behaviors** — verify the three empty-state variants render.

6. **Regression check** — Meals + Lists tabs render unchanged.

Delete all screenshots after analysis (per CLAUDE.md screenshot cleanup rule).

### Step 3: Commit

```bash
git add sw.js
git commit -m "chore(sw): bump cache to v228 for recipes tab depth"
```

### Step 4: Wrap up

Use `superpowers:finishing-a-development-branch` to choose merge/push/PR.

---

## Acceptance criteria mapping

Spec §9:

| Spec criterion | Task |
|---|---|
| 1. Cards show 56×56 leading thumbnail; missing image falls back to 🍴 | Task 2 |
| 2. Second line shows rating stars · prep time · last-cooked | Task 2 |
| 3. Sticky search filters library in real time; ✕ clears | Task 3 |
| 4. Search + Filter compose; empty state reflects active state | Tasks 5, 6 |
| 5. Filter sheet has five dimensions; selections persist | Task 5 |
| 6. Tags section pulled from library; "No tags yet" hint | Task 5 |
| 7. Filter & Sort badge counts non-default dimensions | Task 5 |
| 8. AI Tools sheet RECIPES section has three buttons | Task 4 |
| 9. Standalone "Find ideas online" chip removed | Task 4 |
| 10. `formatLastCooked` + `formatPrepBucket` behave per §6 | Task 1 |
| 11. SW cache bumped | Task 7 |
| 12. No regressions on Meals / Lists at 412×915 | Task 7 |

All 12 covered.

---

## Self-review notes

- **Placeholder scan:** every step has concrete code or commands. No "fill in details" prose.
- **Type/name consistency:** `recipeFilter.show` / `.prepBucket` / `.difficulty` / `.tags` / `.sort` referenced consistently across the filter pipeline, the filter sheet, and the badge count. `recipeSearchQuery` is the single source of truth for search.
- **Helper function shape:** `formatLastCooked(timestamp, timezone, todayStr)` signature consistent in Task 1 + its callers in Task 2. `formatPrepBucket(prepTimeStr)` signature consistent in Task 1 + its callers in Task 5.
- **Spec coverage:** all 12 ACs mapped above.
- **Test gate adaptation:** no test runner; manual Playwright check at 412×915 per task.
