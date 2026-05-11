# Kitchen Image Fix + Rating Redesign — Implementation Plan

> Hot-fix branch on top of SP1 + SP2. Branch: `fix/kitchen-images-and-ratings`.
>
> No new test runner. "Verify" = manual Playwright check at 412×915 mobile viewport per [CLAUDE.md](../../../CLAUDE.md).

**Goal:** Fix the TikTok image-URL-expiration bug + redesign recipe ratings as per-person → displayed-as-average with a tappable half-star popup, replacing the favorite-star UI.

**Architecture:**
- TikTok CDN URLs are time-signed with ~24h expiration. Recipes imported days ago now show broken images. Two-part fix: graceful `onerror` fallback for the broken state + permanent persistence (convert remote `imageUrl` to a data URL on import) so future imports survive.
- Ratings shift from `recipe.rating: number` (single) to `recipe.ratings: { [personId]: number }` (per-person). UI displays only the average; individual scores are never shown. Card chip becomes tappable to open a rating popup with half-star precision via tap-left-half / tap-right-half. Kitchen page gains `?person=Name` parsing so rater identity is known automatically. Favorite (`isFavorite`) is retired entirely; the Filter sheet's "Favorites" option becomes "Top rated" (avg ≥ 4.0).

**Tech Stack:** Vanilla JS ES modules, Firebase compat SDK, no bundler.

**Spec lives in this plan** — no separate spec doc since design was finalized in conversation.

---

## File structure overview

| File | Responsibility | Touch |
|---|---|---|
| `kitchen.js` | Recipes tab + rating chip + popup + detail-sheet rating widget + person-link parsing | Heavy edits |
| `styles/kitchen.css` | Rating chip + popup styles | New rules |
| `shared/utils.js` | New helper `avgRating(recipe)` | One new export |
| `workers/kitchen-import.js` | (Optionally) base64 image conversion server-side | Skip — client-side is cleaner |
| `sw.js` | Cache bump | Single line |

Scope: ~350-450 lines of new code, ~100 lines replaced.

---

## Task 1: `onerror` fallback on recipe image elements

Quick fix for the broken-image symptom. When an `<img>` fails to load, the browser shows a broken-image glyph by default; we instead swap to the 🍴 placeholder span.

**Files:**
- Modify: `kitchen.js` — `buildRecipeCardThumb` + recipe detail hero image

### Step 1: Update `buildRecipeCardThumb` to include onerror fallback

In `kitchen.js`, find `buildRecipeCardThumb`. Currently:
```js
function buildRecipeCardThumb(recipe) {
  if (recipe?.imageUrl) {
    return `<img class="rl-card-thumb" src="${esc(recipe.imageUrl)}" alt="" loading="lazy">`;
  }
  return `<span class="rl-card-thumb rl-card-thumb--placeholder" aria-hidden="true">🍴</span>`;
}
```

Replace with:
```js
function buildRecipeCardThumb(recipe) {
  if (recipe?.imageUrl) {
    // onerror falls back to the placeholder span via replaceChild.
    return `<img class="rl-card-thumb" src="${esc(recipe.imageUrl)}" alt="" loading="lazy" onerror="this.outerHTML='&lt;span class=&quot;rl-card-thumb rl-card-thumb--placeholder&quot; aria-hidden=&quot;true&quot;&gt;\\ud83c\\udf74&lt;/span&gt;'">`;
  }
  return `<span class="rl-card-thumb rl-card-thumb--placeholder" aria-hidden="true">🍴</span>`;
}
```

The escaped onerror string outputs `<span class="rl-card-thumb rl-card-thumb--placeholder" aria-hidden="true">🍴</span>` when the image fails.

### Step 2: Update recipe detail hero image

In `kitchen.js`, find the recipe detail sheet's hero image template (around `kitchen.js:725`):
```js
${recipe.imageUrl ? `<div class="rd-hero"><img src="${esc(recipe.imageUrl)}" alt="" class="rd-hero__img" loading="lazy"/></div>` : ''}
```

Replace with:
```js
${recipe.imageUrl ? `<div class="rd-hero"><img src="${esc(recipe.imageUrl)}" alt="" class="rd-hero__img" loading="lazy" onerror="this.parentElement.remove()"/></div>` : ''}
```

When the hero image fails, the whole `.rd-hero` div is removed from the DOM so the detail sheet doesn't render an empty hero block.

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "fix(kitchen): graceful fallback when recipe image fails to load

TikTok CDN URLs are time-signed and expire ~24h after import. Existing
recipes had broken-image glyphs in their card thumb + detail hero.
Card thumb falls back to 🍴 placeholder; detail hero removes the
whole .rd-hero block when the image 404s.
"
```

### Step 4: Verify

Reload Kitchen → Recipes. Any TikTok recipe with an expired URL now shows the 🍴 placeholder instead of a broken-image icon. Recipes with valid URLs (or base64 data URLs) still render normally.

---

## Task 2: Add `?person=Name` parsing to kitchen.html

Per user direction: every page should know who the user is. Kitchen currently doesn't read `?person=Name`. Replicate the dashboard.js pattern.

**Files:**
- Modify: `kitchen.js` — `init` function + state

### Step 1: Add linkedPerson state

At the top of `kitchen.js`, near `let settings, people = [];` (around line 107), add:
```js
let linkedPerson = null; // resolved from ?person=Name query param
```

### Step 2: Resolve linkedPerson during init

In the `init` function in `kitchen.js`, after `[settings, people] = await Promise.all([...])`, add:
```js
const personParam = new URLSearchParams(window.location.search).get('person');
if (personParam) {
  linkedPerson = people.find(p => p.name.toLowerCase() === personParam.toLowerCase()) || null;
}
```

No error UI needed if `personParam` is set but no match — the chip is just non-functional in that case.

### Step 3: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): support ?person=Name like dashboard does

Reads window.location.search and resolves linkedPerson against people.
Used by rating popup (Task 5) to attribute the rating to the correct
person automatically when accessed via personal URL.
"
```

### Step 4: Verify

Navigate to `http://localhost:8080/kitchen.html?person=Jordin`. Open the browser console and confirm `window.location.search` works as expected. No visible UI change yet — used by Task 5.

---

## Task 3: `avgRating(recipe)` helper

**Files:**
- Modify: `shared/utils.js` — new export

### Step 1: Append to shared/utils.js

```js
// Compute the displayed rating for a recipe.
// Returns { avg, count, mine } where avg is null if no ratings exist.
// 'mine' is the current viewer's rating (or null), kept separate for
// the popup display but never shown alongside others' scores.
export function avgRating(recipe, viewerPersonId) {
  if (!recipe) return { avg: null, count: 0, mine: null };
  const ratings = recipe.ratings || {};
  const ids = Object.keys(ratings);
  if (ids.length > 0) {
    const sum = ids.reduce((acc, id) => acc + (Number(ratings[id]) || 0), 0);
    const avg = sum / ids.length;
    const mine = viewerPersonId && (viewerPersonId in ratings) ? Number(ratings[viewerPersonId]) : null;
    return { avg, count: ids.length, mine };
  }
  // Legacy fallback: pre-multi-person ratings stored as recipe.rating (single number)
  if (typeof recipe.rating === 'number' && recipe.rating > 0) {
    return { avg: recipe.rating, count: 1, mine: null };
  }
  return { avg: null, count: 0, mine: null };
}
```

### Step 2: Import in kitchen.js

Update the existing import line:
```js
import { todayKey, escapeHtml, formatLastCooked } from './shared/utils.js';
```

Add `avgRating`:
```js
import { todayKey, escapeHtml, formatLastCooked, avgRating } from './shared/utils.js';
```

### Step 3: Commit

```bash
git add shared/utils.js kitchen.js
git commit -m "feat(kitchen): avgRating helper for per-person rating model

Returns { avg, count, mine } from recipe.ratings (per-person object) with
a legacy fallback to recipe.rating (single number) for un-migrated data.
'mine' is the viewer's own score; the UI never displays others' scores.
"
```

---

## Task 4: Card rating chip — filled star + numeric, tappable, drop favorite star

Replace the chip-line rating + the trailing favorite-star icon with a single tappable star+number chip.

**Files:**
- Modify: `kitchen.js` — `buildRecipeCardChips` + `buildRecipeCard` + event bindings
- Modify: `styles/kitchen.css` — chip + star SVG styles

### Step 1: Update `buildRecipeCardChips` in kitchen.js

Replace the existing function:
```js
function buildRecipeCardChips(recipe) {
  const { avg } = avgRating(recipe, linkedPerson?.id);
  const STAR_FILLED_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`;
  const STAR_EMPTY_SVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`;

  let ratingChip;
  if (avg != null) {
    const num = Number.isInteger(avg) ? `${avg}.0` : avg.toFixed(1);
    ratingChip = `<button class="rl-chip rl-chip--rating" data-rate-recipe type="button" aria-label="Rating ${num} of 5">${STAR_FILLED_SVG}<span>${esc(num)}</span></button>`;
  } else {
    ratingChip = `<button class="rl-chip rl-chip--unrated" data-rate-recipe type="button" aria-label="Not yet rated — tap to rate">${STAR_EMPTY_SVG}</button>`;
  }
  const prepChip = recipe?.prepTime ? `<span class="rl-chip">${esc(recipe.prepTime)}</span>` : '';
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);
  const lastChip = `<span class="rl-chip">${esc(formatLastCooked(recipe?.lastUsed, tz, todayStr))}</span>`;
  return [ratingChip, prepChip, lastChip].filter(Boolean).join('<span class="rl-chip-sep">·</span>');
}
```

The chip now uses `<button>` so it's tappable, with `data-rate-recipe` attribute for event binding.

### Step 2: Update `buildRecipeCard` to drop the favorite star icon

In `kitchen.js`, find `buildRecipeCard` (added in SP2 Task 6). It currently includes the favorite-star button in `.rl-card-actions`. Remove that button entirely; keep the external-link icon.

New shape:
```js
function buildRecipeCard(id, r) {
  return `
    <article class="card rl-recipe-card" data-recipe-id="${esc(id)}">
      ${buildRecipeCardThumb(r)}
      <div class="rl-card-body">
        <div class="rl-card-title">${esc(r.name)}</div>
        <div class="rl-card-chips">${buildRecipeCardChips(r)}</div>
      </div>
      <div class="rl-card-actions">
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"
            class="btn-icon" aria-label="Open recipe link" data-recipe-link="${esc(id)}">${linkIcon}</a>` : ''}
      </div>
    </article>`;
}
```

### Step 3: Bind tap handler for rating chip

In `renderRecipesTab` event-binding section, after the existing card bindings, add:
```js
content.querySelectorAll('[data-rate-recipe]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = btn.closest('[data-recipe-id]');
    const id = card?.dataset.recipeId;
    if (id) openRecipeRatingSheet(id);
  });
});
```

(`openRecipeRatingSheet` is implemented in Task 5.)

### Step 4: Remove old favorite-star binding

Delete the existing event binding that handled `data-fav-recipe` (the favorite toggle). It's the block that toggles `isFavorite` and calls `writeKitchenRecipe`.

### Step 5: Update CSS — rating chip styles

Replace the existing `.rl-chip--rating` and `.rl-chip--unrated` rules in `styles/kitchen.css`:
```css
.rl-chip {
  font-size: var(--font-xs);
  color: var(--text-muted);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
}

/* Tappable rating chip — overrides button defaults */
button.rl-chip {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.rl-chip--rating {
  color: var(--accent);
  font-weight: 600;
}

.rl-chip--rating svg {
  color: var(--accent);
}

.rl-chip--unrated {
  color: var(--text-faint);
}

.rl-chip--unrated svg {
  color: var(--text-faint);
}
```

Also remove `.rl-fav-btn` / `.rl-fav-btn.is-fav` rules if they exist (they were defined in components.css originally for the heart/star toggle).

### Step 6: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): tappable rating chip with star icon + numeric avg

Replaces the multi-star rating chip with a single filled-star icon plus
the numeric average (e.g., '★ 4.3'). Unrated recipes show an empty
star (tap to rate). Favorite-star toggle in the card trailing area is
removed entirely; the recipe link icon is the only trailing action.
"
```

### Step 7: Verify

Reload Recipes tab. Each card's chip line now shows `★ 4.3` (or `☆` for unrated) before prep/last-cooked. The favorite star next to the link icon is gone. Tap the rating chip → console error (popup isn't built yet — done in Task 5).

---

## Task 5: Rating popup bottom sheet with half-star input

When a user taps a rating chip, open a bottom sheet with a 5-star input that supports half-star precision via tap-left-half / tap-right-half.

**Files:**
- Modify: `kitchen.js` — new `openRecipeRatingSheet(recipeId)`
- Modify: `styles/kitchen.css` — popup styles

### Step 1: Add `openRecipeRatingSheet` function

Insert near other sheet-opener functions in `kitchen.js`:
```js
function openRecipeRatingSheet(recipeId) {
  const recipe = recipes[recipeId];
  if (!recipe) return;
  const mount = document.getElementById('sheetMount');

  if (!linkedPerson) {
    showToast('Open this page from your personal link to rate recipes');
    return;
  }

  const viewerId = linkedPerson.id;
  let myRating = (recipe.ratings && recipe.ratings[viewerId]) || 0;

  function renderStars(value) {
    // 5 star slots, each with two tap zones (half / full).
    return Array.from({ length: 5 }, (_, i) => {
      const star = i + 1;
      const filled = value >= star ? 'full' : (value >= star - 0.5 ? 'half' : 'empty');
      return `
        <span class="rrs-star rrs-star--${filled}">
          <button class="rrs-star__half rrs-star__half--left" data-rrs-val="${star - 0.5}" type="button" aria-label="${star - 0.5} stars"></button>
          <button class="rrs-star__half rrs-star__half--right" data-rrs-val="${star}" type="button" aria-label="${star} stars"></button>
          <span class="rrs-star__glyph">★</span>
        </span>`;
    }).join('');
  }

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: `Rate ${recipe.name}`, closeId: 'rrs_close' })}
      <div class="rrs-body">
        <div class="rrs-stars" id="rrsStars">${renderStars(myRating)}</div>
        <div class="rrs-helper">${myRating ? `Your rating: ${myRating}` : 'Tap a star to rate'}</div>
      </div>
      <div class="rrs-footer">
        ${myRating ? `<button class="btn btn--ghost" id="rrsClear" type="button">Remove my rating</button>` : ''}
      </div>
    `);
    activateSheet(mount);
    bindStars();
    document.getElementById('rrs_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('rrsClear')?.addEventListener('click', async () => {
      myRating = 0;
      const ratings = { ...(recipe.ratings || {}) };
      delete ratings[viewerId];
      recipes[recipeId] = { ...recipe, ratings };
      await writeKitchenRecipe(recipeId, { ...recipes[recipeId] });
      mount.innerHTML = '';
      renderActiveTab();
      showToast('Rating removed');
    });
  }

  function bindStars() {
    mount.querySelectorAll('[data-rrs-val]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = parseFloat(btn.dataset.rrsVal);
        myRating = val;
        const ratings = { ...(recipe.ratings || {}), [viewerId]: val };
        recipes[recipeId] = { ...recipe, ratings };
        await writeKitchenRecipe(recipeId, { ...recipes[recipeId] });
        mount.innerHTML = '';
        renderActiveTab();
        showToast('Rating saved');
      });
    });
  }

  render();
}
```

The handler auto-saves on any star tap and closes the sheet. The Clear button only renders if a rating already exists.

### Step 2: Add popup CSS

Append to `styles/kitchen.css`:
```css
.rrs-body {
  padding: var(--spacing-md) var(--spacing-sm);
  text-align: center;
}

.rrs-stars {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: var(--spacing-md);
}

.rrs-star {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 48px;
  font-size: 44px;
  line-height: 1;
  user-select: none;
}

.rrs-star__glyph {
  display: block;
  pointer-events: none;
  background: linear-gradient(to right, var(--accent) 50%, var(--border) 50%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.rrs-star--full .rrs-star__glyph {
  background: var(--accent);
  -webkit-background-clip: text;
  background-clip: text;
}

.rrs-star--empty .rrs-star__glyph {
  background: var(--border);
  -webkit-background-clip: text;
  background-clip: text;
}

/* half: keep the default gradient defined on .rrs-star__glyph */

.rrs-star__half {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 2;
}

.rrs-star__half--left  { left: 0; }
.rrs-star__half--right { right: 0; }

.rrs-helper {
  font-size: var(--font-sm);
  color: var(--text-muted);
}

.rrs-footer {
  display: flex;
  justify-content: center;
  padding: var(--spacing-sm) 0 var(--spacing-md);
}
```

### Step 3: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): rating popup with half-star precision input

Tap-left-half = 0.5; tap-right-half = full. Auto-saves on tap and closes.
'Remove my rating' clears the viewer's score. Only the current viewer
(linkedPerson) is allowed to rate; non-personal views show a toast.
"
```

### Step 4: Verify

Reload Kitchen with `?person=Jordin`. Tap a rating chip → popup opens. Tap a star → saves + closes + chip updates. Tap an unrated chip → opens empty popup.

---

## Task 6: Update recipe detail sheet rating widget

The recipe detail sheet has a 5-star widget (`rd-stars`) that currently writes to `recipe.rating` (the legacy field). Update it to use the new per-person model.

**Files:**
- Modify: `kitchen.js` — `openRecipeDetailSheet` rating section

### Step 1: Replace the existing star widget

In `openRecipeDetailSheet`, find the `buildStars` function and the rating click handler (around `kitchen.js:715-784`). Currently:
```js
function buildStars(current) {
  return Array.from({ length: 5 }, (_, i) =>
    `<button class="rd-star${i < current ? ' rd-star--filled' : ''}" data-star="${i + 1}" type="button" aria-label="${i + 1} star">★</button>`
  ).join('');
}
// ... later in bindButtons():
document.getElementById('rdStars')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-star]');
  if (!btn) return;
  const star = parseInt(btn.dataset.star, 10);
  const newRating = recipe.rating === star ? 0 : star;
  recipe.rating = newRating;
  recipes[recipeId] = recipe;
  document.getElementById('rdStars').innerHTML = buildStars(newRating);
  await writeKitchenRecipe(recipeId, { ...recipe });
});
```

Replace with a display-only star strip that opens the same `openRecipeRatingSheet` popup when tapped:

```js
function buildStars() {
  const { avg } = avgRating(recipe, linkedPerson?.id);
  if (avg == null) {
    return `<button class="rd-stars-btn rd-stars-btn--empty" id="rdStarsBtn" type="button" aria-label="Not rated — tap to rate"><span class="rd-stars-empty">☆☆☆☆☆</span></button>`;
  }
  const numText = Number.isInteger(avg) ? `${avg}.0` : avg.toFixed(1);
  // Render avg as half-precision visual + numeric
  const fullStars = Math.floor(avg);
  const hasHalf = (avg - fullStars) >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  const visual = '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(emptyStars);
  return `<button class="rd-stars-btn" id="rdStarsBtn" type="button" aria-label="Rating ${numText} of 5 — tap to rate"><span class="rd-stars-visual">${visual}</span><span class="rd-stars-num">${esc(numText)}</span></button>`;
}
// ... and replace the click handler in bindButtons():
document.getElementById('rdStarsBtn')?.addEventListener('click', () => {
  close();
  openRecipeRatingSheet(recipeId);
});
```

(The `close` function in `openRecipeDetailSheet` closes the detail sheet so the rating popup can open over the kitchen view rather than stacking sheets.)

### Step 2: Update CSS for the new display-only star strip

In `styles/kitchen.css`, replace the existing `.rd-star*` rules (around lines 378-395) with:
```css
.rd-stars-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--accent);
  font-weight: 600;
  font-size: var(--font-md);
  -webkit-tap-highlight-color: transparent;
}

.rd-stars-btn--empty {
  color: var(--text-faint);
  font-weight: 400;
}

.rd-stars-visual {
  font-size: 20px;
  letter-spacing: 1px;
}

.rd-stars-num {
  font-size: var(--font-sm);
}

.rd-stars-empty {
  font-size: 20px;
  letter-spacing: 1px;
}
```

### Step 3: Commit

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): recipe detail rating reads avg + opens popup

The detail sheet's rating row now displays the per-person average using
the same half-star + numeric format as the card chip. Tap opens the
rating popup (Task 5) for the current viewer. Closes the detail sheet
first so the popup doesn't stack.
"
```

### Step 4: Verify

Tap a recipe → detail sheet opens. The rating area shows `★★★★½ 4.3` (or `☆☆☆☆☆` if unrated) as a single button. Tap it → detail closes, rating popup opens. Set a rating → returns to recipes tab.

---

## Task 7: Filter sheet — replace "Favorites" with "Top rated"

**Files:**
- Modify: `kitchen.js` — `openRecipeFilterSheet` + filter pipeline + state defaults

### Step 1: Update the `showOpts` array in `openRecipeFilterSheet`

Find in `openRecipeFilterSheet`:
```js
const showOpts = [
  { v: 'all',          l: 'All' },
  { v: 'favorites',    l: 'Favorites' },
  { v: 'never-cooked', l: 'Never cooked' },
];
```

Replace with:
```js
const showOpts = [
  { v: 'all',          l: 'All' },
  { v: 'top-rated',    l: 'Top rated' },
  { v: 'never-cooked', l: 'Never cooked' },
];
```

### Step 2: Update filter pipeline in `renderRecipesTab`

Find the SHOW filter block:
```js
if (recipeFilter.show === 'favorites') {
  recipeEntries = recipeEntries.filter(([, r]) => r.isFavorite);
} else if (recipeFilter.show === 'never-cooked') {
  ...
}
```

Replace with:
```js
if (recipeFilter.show === 'top-rated') {
  recipeEntries = recipeEntries.filter(([, r]) => {
    const { avg } = avgRating(r, linkedPerson?.id);
    return avg != null && avg >= 4.0;
  });
} else if (recipeFilter.show === 'never-cooked') {
  recipeEntries = recipeEntries.filter(([, r]) => !r.lastUsed);
}
```

### Step 3: Migrate any in-memory filter state

If `recipeFilter.show === 'favorites'` is somehow set from a prior session via localStorage or memory, the filter pipeline will silently drop it. Since `recipeFilter` is in-memory only (no persistence), this is fine — on next render the chip just won't match.

### Step 4: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): Filter sheet replaces 'Favorites' with 'Top rated'

Top rated = recipes whose computed average rating is ≥ 4.0. The
'Favorites' option is retired alongside the isFavorite field removal
from the card UI.
"
```

### Step 5: Verify

Open Filter & Sort → SHOW now reads `All / Top rated / Never cooked`. Apply Top rated → only recipes with avg ≥ 4.0 remain.

---

## Task 8: Image persistence on URL import

Convert remote `imageUrl` values to data URLs on import so they don't expire.

**Files:**
- Modify: `kitchen.js` — `runImport` function inside `openRecipeForm`

### Step 1: Add a helper `urlToDataUrl`

Insert near the existing image helpers in `kitchen.js`:
```js
// Download a remote image URL and convert to a data URL via canvas.
// Returns the data URL on success, or the original URL on failure
// (so save still works even if conversion fails).
async function urlToDataUrl(imageUrl) {
  if (!imageUrl || imageUrl.startsWith('data:')) return imageUrl;
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    // Use resizeImageForUpload (which expects a File) to compress.
    const file = new File([blob], 'recipe.jpg', { type: blob.type || 'image/jpeg' });
    const resized = await resizeImageForUpload(file, 800);
    return resized;
  } catch (err) {
    console.warn('urlToDataUrl failed:', err);
    return imageUrl;
  }
}
```

### Step 2: Use it in `runImport`

In `kitchen.js`, find `runImport` (around `kitchen.js:1373-1410`). Currently when `data.imageUrl` comes back from the Worker:
```js
if (data.imageUrl && !imageUrl) imageUrl = data.imageUrl;
```

Replace with:
```js
if (data.imageUrl && !imageUrl) {
  imageUrl = data.imageUrl;
  // Fire-and-forget persistence: convert the (likely time-signed) URL
  // to a data URL so it survives expiration. Updates `imageUrl` in
  // place; the save handler will pick up the data URL when the user
  // submits the form.
  urlToDataUrl(data.imageUrl).then(persistent => {
    if (persistent && persistent !== data.imageUrl) imageUrl = persistent;
  }).catch(() => { /* keep remote URL as fallback */ });
}
```

This runs asynchronously while the user fills out the rest of the form. By the time Save fires, `imageUrl` is usually the data URL.

### Step 3: Add a "Refresh image" action in the recipe edit form for existing recipes

Optional but useful. When the recipe form is open in edit mode for an existing recipe that has a remote `imageUrl` (not a data URL), show a small "Refresh image" button next to the title row. Tapping it calls `urlToDataUrl(existing.imageUrl)` and updates the local `imageUrl` for the save.

Insert in the recipe form render, after `kr_photo` button (around the file input area):
```js
${(existing?.imageUrl && !existing.imageUrl.startsWith('data:')) ? `<button class="ef2-icon-btn" id="kr_refreshImage" type="button" aria-label="Refresh image (current URL may have expired)">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
</button>` : ''}
```

Wire it after the photo-button handler:
```js
document.getElementById('kr_refreshImage')?.addEventListener('click', async () => {
  const btn = document.getElementById('kr_refreshImage');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  const current = existing?.imageUrl;
  if (!current) return;
  try {
    const fresh = await urlToDataUrl(current);
    if (fresh && fresh !== current) {
      imageUrl = fresh;
      showToast('Image refreshed — Save to keep');
    } else {
      showToast('Could not refresh image');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
});
```

### Step 4: Commit

```bash
git add kitchen.js
git commit -m "feat(kitchen): persist remote recipe images as data URLs on import

Worker returns a time-signed CDN URL (TikTok etc.) for the recipe
imageUrl. We now download + base64-encode it via the existing
resizeImageForUpload helper so the saved image is permanent. Adds a
'Refresh image' button on the recipe edit form for existing recipes
whose URL has expired.
"
```

### Step 5: Verify

Import a new recipe from a TikTok URL → after save, inspect the recipe via Firebase console; `imageUrl` should start with `data:image/`. Open an existing TikTok recipe in edit mode → see the refresh button → tap → toast confirms → save → URL becomes a data URL.

---

## Task 9: Drop `isFavorite` references throughout

Hunt and remove any remaining `isFavorite` UI elements in the recipe form and detail sheet. The card actions and filter were handled above.

**Files:**
- Modify: `kitchen.js` — search for `isFavorite` and remove UI/handlers

### Step 1: Grep for `isFavorite`

```bash
grep -n "isFavorite" kitchen.js
```

Expected matches (after the prior tasks):
- The recipe form's favorite field (if present — the form may not have one; original codebase used the card star)
- Sort logic in `openPlanMealSheet` may use `isFavorite` to sort recipes in the picker — keep that, since picker is unrelated to the rating model.
- Any leftover references in `openRecipeDetailSheet` — verify and remove.

### Step 2: Decide per match

For each match:
- If it's UI that toggles `recipe.isFavorite` (e.g., on the detail sheet) → remove.
- If it's READ-ONLY sorting (e.g., favorites-first in Plan-a-meal picker) → keep, but accept that legacy `isFavorite` data continues to influence picker order. Add a note for future cleanup.

The data field stays in Firebase as legacy — no migration needed since it's silently ignored everywhere except plan-a-meal sorting.

### Step 3: Commit (if any deletions)

```bash
git add kitchen.js
git commit -m "refactor(kitchen): remove remaining isFavorite UI references

isFavorite is fully retired from rating model. Legacy field remains in
Firebase but is silently ignored except for the Plan-a-meal recipe
picker's sort-favorites-first logic (left as-is since it doesn't
contradict the new rating UI).
"
```

If grep returns zero new matches: no commit needed; report no-op.

---

## Task 10: SW cache bump + smoke test

**Files:**
- Modify: `sw.js` — bump CACHE_NAME from `v228` to `v229`

### Step 1: Bump cache name

```bash
# Manually edit sw.js: v228 → v229
```

Add a comment in the bumps section: "kitchen image fallback + per-person ratings".

### Step 2: Visual smoke test at 412×915 (controller does Playwright)

Subagents skip this step. Controller verifies:
- TikTok recipes with expired URLs show 🍴 placeholder, not broken-image icon.
- Card chip line shows `★ 4.3` or `☆` for unrated.
- Tap an unrated chip → popup opens with empty stars.
- Tap a star → saves + closes + chip updates.
- Filter sheet `SHOW` reads `All / Top rated / Never cooked`.
- Recipe detail sheet rating area shows half-star visual + numeric.
- No regressions on Meals / Lists tabs.

### Step 3: Commit

```bash
git add sw.js
git commit -m "chore(sw): bump cache to v229 for image fallback + ratings redesign"
```

---

## Acceptance criteria

1. Card images failing to load fall back to the 🍴 placeholder silently.
2. Detail-sheet hero image failing removes the `.rd-hero` block entirely (no empty hero gap).
3. `kitchen.html?person=Name` sets `linkedPerson` correctly.
4. `avgRating(recipe, viewerId)` returns `{ avg, count, mine }` per spec, with legacy fallback to `recipe.rating`.
5. Card chip line shows `★ 4.3` for rated, `☆` for unrated. Single filled star + numeric (no 5-star strip).
6. Card no longer shows a favorite-star icon in trailing actions.
7. Tapping the rating chip opens a popup with 5 stars and half-star tap zones.
8. Popup auto-saves on tap and closes; chip updates after save.
9. Popup shows "Remove my rating" button only when the viewer has previously rated.
10. Without `linkedPerson` (no `?person=` param), tapping the rating chip shows a toast directing the user to use their personal link.
11. Recipe detail sheet rating row displays `★★★★½ 4.3` (or empty stars) and opens the popup on tap.
12. Filter sheet's SHOW dimension reads `All / Top rated / Never cooked`. Top rated = avg ≥ 4.0.
13. New recipe imports via URL persist imageUrl as a data URL (visible by inspecting Firebase or by re-opening the recipe after 24h).
14. Recipe edit form shows a "Refresh image" button for existing recipes whose `imageUrl` is a remote URL.
15. SW cache bumped to v229.
16. No regressions on Meals or Lists at 412×915.

---

## Self-review notes

- **Placeholder scan:** every step has code or commands.
- **Type/name consistency:** `linkedPerson`, `recipe.ratings`, `avgRating`, `openRecipeRatingSheet`, `urlToDataUrl` all referenced consistently across tasks.
- **Schema migration:** non-destructive. Legacy `recipe.rating` is read as a fallback when `recipe.ratings` is absent. `recipe.isFavorite` is silently ignored by new UI but retained for plan-a-meal picker sort.
- **Test gate adaptation:** controller runs Playwright; subagents do code + manual verification by reading.
