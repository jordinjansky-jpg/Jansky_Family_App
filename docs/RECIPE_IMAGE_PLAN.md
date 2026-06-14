# Recipe Image Thumbnails + Lazy Full Image — Implementation Plan

> **For the next session:** Execute task-by-task. This is a vanilla-JS app with **no test runner** — "verify" steps mean *drive the real app in a browser at `http://localhost:8080/?env=dev` on a 412×915 viewport* (per CLAUDE.md), not unit tests. Commit after each task. Delete this file in the commit that ships the last task (per the repo's "delete shipped plans" rule).

**Goal:** Cut the ~2.5 MB recipe-image load cost (78% of the whole DB) by storing a small thumbnail on each recipe (loaded everywhere) and moving the full image to a lazily-loaded `kitchen/recipeImages/{id}` branch fetched only when a recipe detail / cook mode opens.

**Architecture:** Three-part image model per recipe:
- `recipe.thumbUrl` — a ~200px JPEG **data URL** on the recipe record (~8–20 KB). Rendered by every card/list thumb. Loaded with the recipe tree everywhere.
- `kitchen/recipeImages/{recipeId}` = `{ imageUrl: <full image> }` — the full 640px image (data URL or remote URL). Fetched **lazily**, only when a detail/cook hero needs it.
- `recipe.imageUrl` — **removed** from the recipe record after migration. (Kept only as a read-fallback during the transition so un-migrated recipes still show.)

**Tech stack:** Firebase RTDB compat SDK, ES modules (no bundler), Canvas API for downscaling. No new infrastructure.

**Decision context:** Chosen 2026-06-13 (see memory `project_product_decisions_2026_06`) — thumbnails-in-RTDB over cloud storage, to avoid adding an upload pipeline to a no-build-step app.

---

## Current state (verified 2026-06-13 by grep — re-verify line numbers before editing, the files change often)

- Recipes live at `kitchen/recipes/{id}`; each has `recipe.imageUrl` = a 640px-max base64 **data URL** OR a remote URL. Created via `resizeImageForUpload(file, 640)` in `shared/ai-helpers.js`.
- `recipe.imageUrl` is rendered at **7 sites** (all currently use the full image):
  - `kitchen.js:~350` `recipeThumb` for meal-plan day blocks (`.day-block__slot-thumb`)
  - `kitchen.js:~517` recipe library card (`.rl-card-thumb`, has `onerror` self-heal)
  - `kitchen.js:~808` and `~856` recipe-pick rows (`.recipe-pick__thumb`)
  - `dashboard.js:~1780` recipe-pick row (`.recipe-pick__thumb`)
  - `kitchen.js:~1743` recipe **detail hero** (`.rd-hero__img`, full size) — *needs full image*
  - `shared/components.js` `renderMealDetailSheet` hero (`.me-detail` / `.rd-hero`) — *needs full image*
- Save/import paths that write `imageUrl` (3): meal-editor save `kitchen.js:~3392` (`imageUrl: imageUrl || null`), URL import `runImport` `kitchen.js:~3138`, photo upload `kitchen.js:~3318` (`resizeImageForUpload(file, 640)`).
- Self-heal: `selfHealRecipeImage(recipeId)` `kitchen.js:43` re-fetches expiring **remote** `imageUrl` and writes it back to `kitchen/recipes/{id}` via `updateData`. Triggered by `window.__krImgError(recipeId)` from the hero `onerror`.
- Helpers available in `shared/ai-helpers.js`: `resizeImageForUpload(file, maxDim)`, `urlToDataUrl(url)`, `base64ToDataUrl(b64, mediaType)`.
- DB read on Kitchen/Dashboard/Calendar/Kid pulls the whole `kitchen/recipes` tree (`readKitchenRecipes`).

---

## File structure

- **Create:** none (all additions go into existing modules).
- **Modify:**
  - `shared/ai-helpers.js` — add `makeThumbnail(srcUrl, maxPx)` (loads an image from a data/remote URL, canvas-downscales to a JPEG data URL).
  - `shared/firebase.js` — add `readRecipeImage(id)` / `writeRecipeImage(id, imageUrl)` / `removeRecipeImage(id)` for `kitchen/recipeImages/{id}`; add `recipeImages/{id}` null to `deletePersonCascade`? **No** — recipe images aren't per-person; instead add `kitchen/recipeImages/{id}` cleanup to the recipe-**delete** path (see Task 7).
  - `shared/components.js` — `renderRewardCard` is unrelated; here modify `renderMealDetailSheet` hero to lazy-load; add a shared `lazyLoadRecipeHero(recipeId, mountSelector)` helper (or inline in each page).
  - `kitchen.js` — render sites → `thumbUrl`; detail hero → lazy; 3 save/import paths → write thumb + recipeImages; `selfHealRecipeImage` → operate on `recipeImages`; recipe-delete → remove `recipeImages/{id}`; add the migration + a Tools button.
  - `dashboard.js` — recipe-pick thumb → `thumbUrl`.
  - `styles/kitchen.css` / `styles/components.css` — hero gets a loading/placeholder state (optional, low priority).
  - `sw.js` — bump `CACHE_NAME`.

---

### Task 1: Thumbnail generator helper

**Files:** Modify `shared/ai-helpers.js`

- [ ] **Step 1: Add `makeThumbnail`.** Mirrors `resizeImageForUpload`'s canvas logic but takes a URL (data or remote) instead of a File, and returns a JPEG data URL. Place next to `resizeImageForUpload`.

```js
/**
 * Downscale an image (data: URL or remote URL) to a small JPEG data URL.
 * Used for recipe card thumbnails (~200px) so the recipe tree stays tiny.
 * Returns '' on failure (caller falls back to the full image).
 * @param {string} srcUrl  data: or http(s) URL
 * @param {number} maxPx   longest-edge cap (default 200)
 */
export async function makeThumbnail(srcUrl, maxPx = 200) {
  if (!srcUrl) return '';
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous'; // needed for remote URLs so the canvas isn't tainted
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = srcUrl;
    });
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return ''; // tainted canvas (remote w/o CORS) or load failure — caller keeps full image
  }
}
```

- [ ] **Step 2: Verify in console.** Start `node serve.js`, open `http://localhost:8080/?env=dev`, in DevTools console: `const {makeThumbnail} = await import('/shared/ai-helpers.js'); const t = await makeThumbnail((Object.values((await (await import('/shared/firebase.js')).readKitchenRecipes())).find(r=>r.imageUrl?.startsWith('data:')).imageUrl)); console.log(t.length, t.slice(0,30));`
  Expected: a `data:image/jpeg;base64,...` string, length a few KB (much smaller than the source). **Note the CORS caveat:** remote (non-data) URLs may return `''` (tainted canvas) — that's handled (Task 5 keeps the full image as the thumb fallback in that case).

- [ ] **Step 3: Commit** (`shared/ai-helpers.js`).

---

### Task 2: Firebase helpers for the lazy full-image branch

**Files:** Modify `shared/firebase.js`

- [ ] **Step 1: Add helpers** near the other `kitchen/recipes` helpers (grep `kitchen/recipes` to find the block).

```js
export async function readRecipeImage(recipeId) {
  const v = await readOnce(`kitchen/recipeImages/${recipeId}`);
  return v?.imageUrl || null;
}
export async function writeRecipeImage(recipeId, imageUrl) {
  await writeData(`kitchen/recipeImages/${recipeId}`, { imageUrl });
}
export async function removeRecipeImage(recipeId) {
  await removeData(`kitchen/recipeImages/${recipeId}`);
}
```

- [ ] **Step 2: Verify** they export without error: reload `?env=dev`, console `const fb = await import('/shared/firebase.js'); console.log(typeof fb.readRecipeImage, typeof fb.writeRecipeImage, typeof fb.removeRecipeImage);` → all `"function"`.

- [ ] **Step 3: Commit** (`shared/firebase.js`).

---

### Task 3: Card/list render sites use `thumbUrl` (with `imageUrl` fallback)

**Files:** Modify `kitchen.js` (4 sites), `dashboard.js` (1 site)

> Fallback to `imageUrl` keeps un-migrated recipes showing during the transition. Pattern: `const src = r.thumbUrl || r.imageUrl;`

- [ ] **Step 1:** `kitchen.js:~350` (`recipeThumb`): change `recipe.imageUrl` → `(recipe.thumbUrl || recipe.imageUrl)` in both the `if` guard and the `src`.
- [ ] **Step 2:** `kitchen.js:~512–517` (`.rl-card-thumb`): same. Keep the existing `onerror` self-heal attribute.
- [ ] **Step 3:** `kitchen.js:~808` and `~856` (`.recipe-pick__thumb`): same.
- [ ] **Step 4:** `dashboard.js:~1780` (`.recipe-pick__thumb`): same.
- [ ] **Step 5: Verify.** Reload Kitchen `?env=dev` → Recipes tab. Cards still show images (from `imageUrl` fallback, since nothing's migrated yet). 0 console errors. (After Task 6 migration, they'll come from `thumbUrl`.)
- [ ] **Step 6: Commit** (`kitchen.js`, `dashboard.js`).

---

### Task 4: Detail + meal-detail heroes lazy-load the full image

**Files:** Modify `kitchen.js:~1743` (recipe detail hero), `shared/components.js` (`renderMealDetailSheet` hero)

> The hero needs the **full** image. Render a placeholder using `thumbUrl` immediately, then async-fetch `recipeImages/{id}` and swap it in. Fall back to `recipe.imageUrl` if present (un-migrated).

- [ ] **Step 1: Recipe detail hero (`kitchen.js:~1743`).** Replace the inline `<img src="${esc(recipe.imageUrl)}">` with a thumb-as-placeholder hero that has a stable id, then kick off a lazy fetch after the sheet mounts:

```js
// in the sheet markup (replaces the current rd-hero block):
${(recipe.thumbUrl || recipe.imageUrl) ? `<div class="rd-hero"><img id="rdHero_${esc(recipeId)}" src="${esc(recipe.thumbUrl || recipe.imageUrl)}" alt="" class="rd-hero__img rd-hero__img--loading" loading="lazy" onerror="(window.__krImgError&&window.__krImgError('${esc(recipeId)}'));this.parentElement.remove()"/></div>` : ''}

// after the sheet is mounted/bound (where other post-render wiring lives):
(async () => {
  const full = await readRecipeImage(recipeId) || recipe.imageUrl; // imageUrl = un-migrated fallback
  const el = document.getElementById(`rdHero_${recipeId}`);
  if (el && full) { el.src = full; el.classList.remove('rd-hero__img--loading'); }
})();
```

  Import `readRecipeImage` from `./shared/firebase.js` in `kitchen.js`.

- [ ] **Step 2: Meal-detail hero (`shared/components.js` `renderMealDetailSheet`).** Same approach. Since `components.js` renderers are pure (return strings, no DOM), do the lazy swap in the **page** that opens the sheet (kitchen.js `openMealDetailSheet`, dashboard.js `openMealDetailSheet`): after mount, run the same `readRecipeImage(...)` swap targeting the hero img id. Give the hero `<img>` an id `meHero_${recipeId}` in the component and pass `recipe.thumbUrl || meal.imageUrl` as its initial `src`.
- [ ] **Step 3: Verify.** Reload Kitchen `?env=dev`, open a recipe detail → hero shows (thumb first, then full swaps in — visible only after migration; pre-migration it shows `imageUrl`). Open the dashboard dinner tile → meal detail → hero shows. 0 errors.
- [ ] **Step 4: Commit** (`kitchen.js`, `shared/components.js`, `dashboard.js`).

---

### Task 5: Save/import paths write thumb + full-image branch

**Files:** Modify `kitchen.js` save/import paths (~3138, ~3318, ~3392)

> On save: from the final `imageUrl`, generate a thumb; write the recipe with `thumbUrl` (NOT `imageUrl`); write the full image to `recipeImages/{id}`. **Recipe push then image write** (need the id first). If `makeThumbnail` returns `''` (remote-CORS), store the full image as the thumb too (degraded but correct).

- [ ] **Step 1: Meal-editor save (`kitchen.js:~3392`).** Find where the recipe object is built with `imageUrl: imageUrl || null` and written (push for new, `updateData`/`writeData` for edit). Refactor to:

```js
// build recipe WITHOUT imageUrl:
const recipeRecord = { ...fields /* name, ingredients, steps, etc. */ };
// determine the id (existing edit id, or push to get a new one)
const id = existing?.id || (await pushKitchenRecipe(recipeRecord)).key; // grep for the real push helper name
if (imageUrl) {
  const thumb = await makeThumbnail(imageUrl, 200);
  recipeRecord.thumbUrl = thumb || imageUrl;     // CORS fallback: full image as thumb
  await writeRecipeImage(id, imageUrl);          // full image -> lazy branch
} else {
  recipeRecord.thumbUrl = null;
  await removeRecipeImage(id);                    // editing to no-image clears the branch
}
recipeRecord.imageUrl = null;                    // ensure the heavy field never lands on the recipe
await updateData(`kitchen/recipes/${id}`, recipeRecord);
```

  Adjust to the actual control flow at that site (grep the exact push/update helper). Import `makeThumbnail`, `writeRecipeImage`, `removeRecipeImage`.

- [ ] **Step 2: URL import (`runImport`, ~3138) and photo upload (~3318).** These set `imageUrl` then flow into the save above — confirm they route through the same save path. If they write the recipe directly, apply the same thumb+branch split.
- [ ] **Step 3: Verify.** Reload Kitchen `?env=dev`, add a recipe with a photo (or URL import). After save: console-check `const fb = await import('/shared/firebase.js'); const recs = await fb.readKitchenRecipes(); const r = Object.entries(recs).find(([,x])=>x.name==='<your test name>'); console.log({hasThumb: !!r[1].thumbUrl, hasImageUrl: r[1].imageUrl, fullInBranch: !!(await fb.readRecipeImage(r[0]))});`
  Expected: `hasThumb: true`, `hasImageUrl: null`, `fullInBranch: true`. The card shows the thumb; the detail hero shows the full.
- [ ] **Step 4: Commit** (`kitchen.js`).

---

### Task 6: One-time migration of existing recipes

**Files:** Modify `kitchen.js` (migration fn + a Tools/maintenance trigger)

> Split every existing `recipe.imageUrl` into `thumbUrl` + `recipeImages/{id}`, then null `imageUrl`. Idempotent (skips recipes already migrated). Trigger from a button (recommend a one-shot button in the Kitchen "..." / a dev-only control) rather than auto-run, so it's deliberate. Process sequentially to avoid hammering RTDB; show progress via `showToast`.

- [ ] **Step 1: Add `migrateRecipeImages()`.**

```js
async function migrateRecipeImages() {
  const recipes = await readKitchenRecipes() || {};
  const entries = Object.entries(recipes).filter(([, r]) => r.imageUrl && !r.thumbUrl);
  if (!entries.length) { showToast('Recipe images already migrated'); return; }
  let done = 0;
  for (const [id, r] of entries) {
    try {
      const thumb = await makeThumbnail(r.imageUrl, 200);
      await writeRecipeImage(id, r.imageUrl);
      await updateData(`kitchen/recipes/${id}`, { thumbUrl: thumb || r.imageUrl, imageUrl: null });
      done++;
      if (done % 5 === 0) showToast(`Migrating images… ${done}/${entries.length}`);
    } catch (e) { console.error('[migrate]', id, e); }
  }
  showToast(`Migrated ${done}/${entries.length} recipe images`);
  loadData(); render();
}
```

- [ ] **Step 2: Wire a trigger.** Add a button (label "Optimize recipe images") to a maintenance spot — grep for an existing Kitchen settings/overflow sheet; if none fits, a dev-only button gated on `isDev` is acceptable for the first run. Bind it to `migrateRecipeImages`.
- [ ] **Step 3: Verify on dev.** At `?env=dev`: measure DB size BEFORE (`const fb=await import('/shared/firebase.js'); const all=await fb.readKitchenRecipes(); console.log('recipes KB', Math.round(JSON.stringify(all).length/1024));`). Run the migration. Measure AFTER — the `kitchen/recipes` tree should drop from ~MBs to ~tens of KB. Confirm: cards still show images (now from `thumbUrl`), detail/cook heroes still show full images (now from `recipeImages`), 0 console errors. Spot-check 3+ recipes.
- [ ] **Step 4: Commit** (`kitchen.js`).

---

### Task 7: Self-heal + recipe-delete cleanup for the new model

**Files:** Modify `kitchen.js` (`selfHealRecipeImage` ~43, recipe-delete path)

- [ ] **Step 1: `selfHealRecipeImage`** currently refreshes a remote `recipe.imageUrl`. Update it to refresh `recipeImages/{id}.imageUrl` (the full image now lives there) and regenerate `recipe.thumbUrl` from the refreshed image. Keep the `imageRefreshFails` counter on the recipe.
- [ ] **Step 2: Recipe delete.** Grep the recipe-delete handler; add `await removeRecipeImage(id);` so deleting a recipe also removes its `recipeImages/{id}` blob (no orphan).
- [ ] **Step 3: Verify.** Delete a test recipe at `?env=dev` → confirm `recipeImages/{id}` is gone (`(await (await import('/shared/firebase.js')).readRecipeImage('<id>'))` → null). For self-heal, hard to trigger locally (needs an expired remote URL) — code-review it and confirm no console errors on a normal recipe open.
- [ ] **Step 4: Commit** (`kitchen.js`).

---

### Task 8: Cache bump + final full-surface verification

**Files:** Modify `sw.js`

- [ ] **Step 1: Bump `CACHE_NAME`** to the next version with a changelog line describing the recipe-image split.
- [ ] **Step 2: Full verification at `?env=dev`** (after running the migration on dev): Kitchen Recipes list (thumbs), meal-plan day blocks (thumbs), recipe detail hero (full, lazy), cook mode (works), Dashboard dinner tile → meal detail hero (full, lazy), Calendar (loads fast, no recipe images needed there), Kid mode (loads). 0 console errors on every surface. Re-measure total DB size: confirm `kitchen/recipes` is small and `kitchen/recipeImages` holds the bulk (lazy).
- [ ] **Step 3: Delete this plan file** (`docs/RECIPE_IMAGE_PLAN.md`) and **commit** everything: "feat(kitchen): recipe thumbnails + lazy full image; migrate existing; rm plan".
- [ ] **Step 4: Production migration note.** After merge+deploy, the migration button must be run **once on production** (it's a client-triggered one-shot). Until then, prod recipes keep `imageUrl` and render via the fallback (no breakage, just no perf win yet). Flag this to the user explicitly.

---

## Self-review checklist (done while writing)

- **Coverage:** thumbnail gen (T1), lazy branch (T2), card sites (T3), heroes (T4), save paths (T5), migration (T6), self-heal + delete cleanup (T7), cache + verify (T8). All parts of the decision covered.
- **Field names:** `recipe.imageUrl` (existing), `recipe.thumbUrl` (new), `kitchen/recipeImages/{id}.imageUrl` (new) — consistent across all tasks.
- **Risks called out:** remote-URL CORS tainting (`makeThumbnail` returns `''` → fall back to full image as thumb); migration is idempotent + deliberate (button, not auto); prod needs a one-time manual migration run.
- **No test runner:** every "verify" is a browser/console check, honest for this codebase.

## Known open wrinkles for the executor to decide

- **`recipe.image` vs `imageUrl`:** grep confirmed the field is `imageUrl` everywhere; if any stray `recipe.image` exists, treat it the same.
- **Thumbnail size:** 200px @ 0.7 JPEG is the starting point; card display sizes are ~40–60px so even 160px is fine. Tune after seeing real sizes.
- **Calendar/Kid reads:** they pull `kitchen/recipes` too; after migration those reads carry only thumbs — the win applies there automatically (no code change needed beyond Task 3 if they render thumbs; verify they don't render full heroes).
