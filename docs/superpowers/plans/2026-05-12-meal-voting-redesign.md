# Meal Voting Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-option meal voting a first-class capability of Plan-a-meal (Single / Vote segmented control), surface vote state as a single consistent `Vote · N options` indicator everywhere, and route vote-sheet taps inline (no more kitchen.html detour).

**Architecture:** All voting machinery (array shape, `normalizePlanSlot`, `pickWinner`, vote tallies, lock-in) already exists. This plan only changes UI + entry points. The multi-option branch of `openSlotEditSheet` extracts into a shared `openVoteSheet` opener in `shared/components.js` so dashboard + calendar + kitchen can all call it. Plan-a-meal gains a top-of-sheet segmented control that swaps the meal-picker for a stack of candidate rows when set to Vote.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase compat SDK, CSS variables for theming. No test framework — every task ends in manual verification at `http://localhost:8080/?env=dev` on a 412×915 viewport (Samsung S26 Ultra).

**Spec:** [docs/superpowers/specs/2026-05-12-meal-voting-redesign-design.md](../specs/2026-05-12-meal-voting-redesign-design.md)

**Before starting:** read DESIGN.md §5.23 v2 + §13.13 (form-sheet primitives — Plan-a-meal already uses them; new pieces must too) and §6.10 Kitchen (current state of Meals tab + Plan-a-meal).

**Pre-flight:**
```bash
node serve.js  # leave running in another terminal — http://localhost:8080
```
If port 8080 is already bound, check `netstat -ano | findstr :8080` before starting a second instance.

---

## Task 1: Extract `openVoteSheet` to shared/components.js (pure refactor)

**Why first:** Every later task that opens the vote sheet from a non-Kitchen surface (dashboard, calendar) needs this. Doing it as a pure refactor with no behavior change lets us verify the extraction in isolation.

**Files:**
- Modify: `shared/components.js` — append `openVoteSheet({...})` near other sheet openers (~end of file)
- Modify: `kitchen.js:1233-1338` — replace `renderMultiOption(opts)` body with a call to `openVoteSheet`

**Function signature:**

```js
// shared/components.js
// Opens the multi-option voting sheet for a slot. Caller supplies state +
// callbacks since this function has zero side effects of its own.
//
// Args:
//   mount         — DOM element to render into (the sheet host)
//   dk            — date key, 'YYYY-MM-DD'
//   slot          — slot key, 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'school-lunch' | 'school-lunch-2'
//   slotLabel     — display label for the slot ('Dinner' or 'School Lunch' etc.) — caller resolves school
//   dayLabel      — display label for the date ('Wed 13')
//   options       — array of slot options (the vote candidates)
//   recipes       — id → recipe lookup
//   people        — array of people (for voter chips + who-votes prompt)
//   viewerId      — current voter id, or null (caller fetches from linkedPerson / session)
//   showToast     — toast fn from caller
//   showConfirm   — confirm fn from caller (for lock-in gate)
//   onWriteOptions(newOptions) — async — caller persists + updates its cache
//   onRemoveSlot()             — async — caller removes the slot entirely
//   onAddAnother()             — caller opens Plan-a-meal in Vote mode pre-filled
//   onClose()                  — caller resets state, re-renders
//
// Returns: nothing.
```

- [ ] **Step 1: Read the current `renderMultiOption` implementation**

Open `kitchen.js:1233-1338` and re-read. The function captures `dk`, `slot`, `entry`, `mount`, `opts`, plus closures over module-scope `recipes`, `people`, `planCache`, `linkedPerson`, `writeKitchenPlanSlot`, `removeKitchenPlanSlot`, `openPlanMealSheet`, `renderMealsTab`, `showToast`, `getSchoolSlotLabel`, `SLOT_LABELS`, `DAY_ABBR`, `pickWinner`, `esc`, `renderBottomSheet`, `activateSheet`, `openWhoVotesPrompt`.

Most of those need to become explicit parameters or be re-imported in components.js. `renderBottomSheet`, `activateSheet`, `esc`, `pickWinner` are already in components.js. `showToast`, `showConfirm` come in as args. `openWhoVotesPrompt` is kitchen-local — fold its behavior into a `viewerId` resolution flow at the call site (kitchen.js resolves it BEFORE opening, passes the resolved id in).

- [ ] **Step 2: Add `openVoteSheet` to `shared/components.js`**

Append to the end of `shared/components.js` (above any final `export` aggregator if one exists; otherwise just at the end):

```js
/**
 * Render the multi-option voting sheet for a meal slot.
 * See header doc for arg shape.
 */
export function openVoteSheet({
  mount, dk, slot, slotLabel, dayLabel,
  options, recipes, people,
  viewerId,
  showToast, showConfirm,
  onWriteOptions, onRemoveSlot, onAddAnother, onClose,
}) {
  const CLOSE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  function buildCard(opt, i) {
    const name = opt.recipeId
      ? (recipes[opt.recipeId]?.name || 'Unknown')
      : (opt.mealName || opt.customName || '');
    const voteIds = Object.keys(opt.votes || {});
    const voteCount = voteIds.length;
    const voterNames = voteIds
      .map(id => people.find(p => p.id === id)?.name)
      .filter(Boolean);
    const winnerCls = (pickWinner(options) === opt) ? ' vote-card--winner' : '';
    return `
      <div class="vote-card${winnerCls}" data-vote-idx="${i}">
        <div class="vote-card__title">${esc(name)}${winnerCls ? ' <span class="vote-card__crown">&#x1F3C6;</span>' : ''}</div>
        <div class="vote-card__row">
          ${voterNames.length
            ? voterNames.map(n => `<span class="vote-chip">${esc(n)}</span>`).join('')
            : '<span class="vote-card__nobody">No votes yet</span>'}
          <button class="btn btn--ghost btn--sm" data-vote-toggle="${i}" type="button">&#x1F44D; ${voteCount}</button>
        </div>
        <div class="vote-card__actions">
          <button class="btn btn--secondary btn--sm" data-vote-lock="${i}" type="button">Lock in</button>
          <button class="btn btn--ghost btn--sm" data-vote-remove="${i}" type="button">Remove</button>
        </div>
      </div>`;
  }

  mount.innerHTML = renderBottomSheet(`
    <div class="task-detail-sheet">
      <div class="sheet__header">
        <h2 class="sheet__title">${esc(slotLabel)} &middot; ${esc(dayLabel)}</h2>
        <button class="ef2-icon-btn" id="slotClose" type="button" aria-label="Close">${CLOSE_SVG}</button>
      </div>
      <div class="vote-cards">
        ${options.map((opt, i) => buildCard(opt, i)).join('')}
      </div>
      ${options.length < 3 ? `<div class="me-detail__chips"><button class="chip" id="addAnotherOption" type="button">+ Add another option</button></div>` : ''}
    </div>`);
  activateSheet(mount);

  document.getElementById('slotClose')?.addEventListener('click', onClose);
  document.getElementById('addAnotherOption')?.addEventListener('click', onAddAnother);

  mount.querySelectorAll('[data-vote-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!viewerId) return;
      const i = parseInt(btn.dataset.voteToggle, 10);
      const opt = options[i];
      const votes = { ...(opt.votes || {}) };
      if (votes[viewerId]) delete votes[viewerId];
      else votes[viewerId] = 1;
      const next = [...options];
      next[i] = { ...opt, votes };
      await onWriteOptions(next);
    });
  });

  mount.querySelectorAll('[data-vote-lock]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.voteLock, 10);
      const winner = options[i];
      const name = winner.recipeId
        ? (recipes[winner.recipeId]?.name || 'this meal')
        : (winner.mealName || winner.customName || 'this meal');
      const ok = await showConfirm(`Lock in ${name}? Other options will be removed.`);
      if (!ok) return;
      await onWriteOptions([winner]);
      onClose();
      showToast('Winner locked in');
    });
  });

  mount.querySelectorAll('[data-vote-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.voteRemove, 10);
      const remaining = options.filter((_, idx) => idx !== i);
      if (remaining.length === 0) {
        await onRemoveSlot();
        onClose();
        return;
      }
      await onWriteOptions(remaining);
    });
  });
}
```

Note: this version uses `showConfirm` on lock-in (per spec §3 polish) — bring that change in here rather than as a separate task.

- [ ] **Step 3: Update `kitchen.js` to import + call `openVoteSheet`**

In `kitchen.js`, find the existing import from `./shared/components.js` (line 11 or so — it's a long destructured import) and add `openVoteSheet` to the list:

```js
import { renderNavBar, /* ... existing names ... */, openCookMode, openVoteSheet } from './shared/components.js';
```

Then replace the body of `renderMultiOption(opts)` inside `openSlotEditSheet` (starts ~line 1233) with:

```js
function renderMultiOption(opts) {
  // Resolve voter id up front (was inline async before; lifting it out keeps
  // openVoteSheet purely synchronous from a setup-time perspective).
  resolveVoterId().then(viewerId => {
    const d = new Date(dk + 'T12:00:00');
    const dayLabel = `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;
    const slotLabel = (slot === 'school-lunch' || slot === 'school-lunch-2')
      ? getSchoolSlotLabel(slot, planCache[dk] || {})
      : (SLOT_LABELS[slot] || slot);

    openVoteSheet({
      mount, dk, slot, slotLabel, dayLabel,
      options: opts,
      recipes, people,
      viewerId,
      showToast, showConfirm,
      onWriteOptions: async (newOpts) => {
        await writeKitchenPlanSlot(dk, slot, newOpts);
        planCache[dk] = { ...planCache[dk], [slot]: newOpts };
        opts = newOpts;
        // Re-render in place — the sheet rebuilds itself on each write.
        renderMultiOption(newOpts);
      },
      onRemoveSlot: async () => {
        await removeKitchenPlanSlot(dk, slot);
        delete planCache[dk][slot];
        await renderMealsTab();
      },
      onAddAnother: () => {
        mount.innerHTML = '';
        openPlanMealSheet(dk, slot, null, { appendMode: true });
      },
      onClose: () => { mount.innerHTML = ''; },
    });
  });
}

function resolveVoterId() {
  if (linkedPerson) return Promise.resolve(linkedPerson.id);
  const cached = sessionStorage.getItem('dr-kitchen-voter-id');
  if (cached && people.find(p => p.id === cached)) return Promise.resolve(cached);
  return openWhoVotesPrompt();
}
```

Make sure `showConfirm` is imported alongside `showToast`:

```js
import { /* ... */, showConfirm, showToast } from './shared/components.js';
```

If `showConfirm` isn't already imported, add it. If it is, leave alone.

- [ ] **Step 4: Verify in browser (no behavior change expected)**

```bash
# Server should already be running on 8080.
# Open in browser (or have Playwright open at 412×915):
http://localhost:8080/?env=dev
```

Manual steps:
1. Open Kitchen tab → Meals.
2. Tap a slot that already has 2+ voting options (or create one quickly: tap an empty Dinner → pick a meal → save → tap that slot → in slot-edit, tap `+ Add another option` → pick a 2nd meal → save).
3. Tap the slot with 2 options. Expected: same vote sheet as before — vote cards, thumbs-up, Lock in, Remove, `+ Add another option`.
4. Tap thumbs-up — vote count increments, voter chip appears. Tap again — decrements/removes.
5. Tap Lock in. **New behavior:** confirmation prompt `Lock in {meal}? Other options will be removed.` Confirm → winner locks in, sheet closes, toast appears.
6. Tap Remove on one option. Expected: option disappears; if down to 1 remaining, sheet closes and slot becomes single-meal.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js kitchen.js
git commit -m "refactor(kitchen): extract openVoteSheet to shared/components.js

Multi-option branch of openSlotEditSheet lifted into shared/components.js
as openVoteSheet({...}). Pure refactor — same render, same handlers — with
one small behavior add per spec: lock-in now gated by showConfirm.

Unblocks dashboard + calendar opening the vote sheet directly without
routing through kitchen.html.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add Single/Vote segmented control to Plan-a-meal (UI only, no Vote-mode logic yet)

**Why second:** Establishes the toggle skeleton so subsequent tasks just fill in Vote-mode rendering. Vote mode shows an empty container in this task — no candidate rows, no save.

**Files:**
- Modify: `kitchen.js:755-850` (the top of `openPlanMealSheet` — sheet template)
- Modify: `styles/kitchen.css` — append segmented-control CSS

- [ ] **Step 1: Add the segmented control HTML to the sheet template**

In `openPlanMealSheet`, find the `mount.innerHTML = renderBottomSheet(...)` block (~line 801). Right after `renderFormSheetHeader` and BEFORE `<div class="kp-day-section">`, insert:

```js
// Segmented control: Single / Vote. Hidden when School slot is selected
// (school keeps its own dual-pick flow).
${selectedSlot !== 'school' ? `
  <div class="kp-mode-section" id="kp_modeSection">
    <nav class="tabs tabs--pill kp-mode-tabs" id="kp_modeTabs" role="tablist">
      <button class="tab is-active" data-mode="single" type="button">Single meal</button>
      <button class="tab" data-mode="vote" type="button">Set up a vote</button>
    </nav>
  </div>
  <div class="ef2-divider"></div>
` : ''}
```

Add state at the top of `openPlanMealSheet` (around line 759, near other state vars):

```js
let mealMode = 'single'; // 'single' | 'vote'
```

After `activateSheet(mount)` (~line 851), wire the toggle:

```js
document.getElementById('kp_modeTabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-mode]');
  if (!tab) return;
  mealMode = tab.dataset.mode;
  document.getElementById('kp_modeTabs').querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('is-active', t === tab));
  // Toggle visibility of meal-section vs vote-section.
  document.getElementById('kp_mealSection')?.classList.toggle('is-hidden', mealMode === 'vote');
  document.getElementById('kp_voteSection')?.classList.toggle('is-hidden', mealMode === 'single');
  updateSaveBtn();
});
```

Wrap the existing `<div class="kp-meal-section">...</div>` block in an id so we can hide it:

```html
<div class="kp-meal-section" id="kp_mealSection">  <!-- existing content -->
```

Right after the meal section, BEFORE `kp_secondSection`, add a placeholder vote section:

```js
<div class="kp-vote-section is-hidden" id="kp_voteSection">
  <span class="ef2-section-label">Candidates</span>
  <p class="kp-vote-placeholder">Vote mode coming in next task.</p>
</div>
```

Also update the slot-pill click handler to hide/show the mode tabs based on slot:

```js
document.getElementById('kp_slotPills')?.addEventListener('click', (e) => {
  // existing code...
  selectedSlot = tab.dataset.slot;
  // existing tab class updates...
  const modeSection = document.getElementById('kp_modeSection');
  if (modeSection) modeSection.style.display = (selectedSlot === 'school') ? 'none' : '';
  // existing renderOccupiedNotice / updateSaveBtn calls
});
```

- [ ] **Step 2: Append CSS for the segmented control + vote section**

Append to `styles/kitchen.css`:

```css
/* Plan-a-meal: Single / Vote mode segmented control */
.kp-mode-section {
  padding: var(--spacing-md) var(--spacing-md) 0;
}

.kp-mode-tabs {
  display: flex;
  gap: var(--spacing-xs);
}

.kp-mode-tabs .tab {
  flex: 1;
}

/* Vote-mode container (filled out in Task 3) */
.kp-vote-section {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.kp-vote-section.is-hidden {
  display: none;
}

.kp-meal-section.is-hidden {
  display: none;
}

.kp-vote-placeholder {
  color: var(--text-muted);
  font-size: var(--font-sm);
  margin: 0;
}
```

- [ ] **Step 3: Verify in browser**

1. Open `http://localhost:8080/?env=dev` at 412×915.
2. Kitchen → Meals tab → tap an empty dinner slot.
3. Expected: Plan-a-meal sheet opens with `[Single meal] [Set up a vote]` segmented control at the top.
4. Tap **Set up a vote**. Expected: meal-picker section disappears; "Candidates — Vote mode coming in next task." placeholder shows.
5. Tap **Single meal**. Expected: meal-picker section reappears.
6. Switch slot pill to **School**. Expected: segmented control disappears entirely.
7. Switch slot pill back to **Dinner**. Expected: segmented control reappears.

- [ ] **Step 4: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): Plan-a-meal Single/Vote segmented control (UI shell)

Top-of-sheet segmented control swaps between Single (existing meal picker)
and Vote (placeholder container — filled in next task). Hidden when School
slot is selected — school keeps its existing dual-pick flow per spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Render Vote-mode candidate rows (2 hardcoded empty rows, picker wiring)

**Why third:** Visible UI for candidate rows before any add/remove or save logic. Each row is a self-contained meal picker — same search + recipe list pattern as the existing single-mode picker.

**Files:**
- Modify: `kitchen.js` — extract `buildMealPickerRow(rowIdx)` helper, render 2 rows in vote section, wire per-row search + select
- Modify: `styles/kitchen.css` — append candidate-row CSS

- [ ] **Step 1: Add candidates state**

Near the top of `openPlanMealSheet` (where `selectedRecipeId` etc. live):

```js
// Vote-mode candidate state. Each entry: { selectedRecipeId, typedName }.
// Starts with 2 empty rows. Single mode ignores this.
let candidates = [
  { selectedRecipeId: null, typedName: '' },
  { selectedRecipeId: null, typedName: '' },
];
```

- [ ] **Step 2: Build the candidate-row HTML helper**

Add near `buildPickRow` / `buildRecipeRows`:

```js
function buildCandidateRow(i) {
  const c = candidates[i];
  const labelName = c.selectedRecipeId
    ? (recipes[c.selectedRecipeId]?.name || '')
    : (c.typedName || '');
  const placeholder = `Option ${i + 1}`;
  return `
    <div class="kp-cand-row" data-cand-idx="${i}">
      <div class="kp-cand-head">
        <span class="kp-cand-label">${esc(placeholder)}</span>
        ${candidates.length > 2 ? `<button class="kp-cand-remove" data-cand-remove="${i}" type="button" aria-label="Remove option">&times;</button>` : ''}
      </div>
      <button class="kp-meal-select${labelName ? ' has-value' : ''}" data-cand-select="${i}" type="button">
        <span class="kp-cand-mealname">${esc(labelName || 'Choose a meal…')}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="kp-meal-dropdown" data-cand-dropdown="${i}">
        <input class="kp-search-input" data-cand-search="${i}" type="text" autocomplete="off" placeholder="Search…" value="${esc(c.typedName || labelName)}">
        <div class="recipe-pick-list" data-cand-list="${i}">${buildRecipeRows(c.typedName || labelName, i)}</div>
      </div>
    </div>`;
}
```

Update `buildRecipeRows` to accept an optional row index so its `data-recipe-pick` attribute is per-row. The cleanest path: rename the existing `buildPickRow(id, r)` to take a row index and emit `data-cand-pick="${rowIdx}-${id}"` instead of `data-recipe-pick="${id}"`. The existing single-mode handler keys off `data-recipe-pick`; leave that intact and add a parallel `data-cand-pick` for vote mode.

Add a second helper that's vote-mode aware:

```js
function buildCandPickRow(rowIdx, id, r) {
  const isSelected = candidates[rowIdx].selectedRecipeId === id;
  const thumb = r.imageUrl
    ? `<img class="recipe-pick__thumb" src="${esc(r.imageUrl)}" alt="" loading="lazy">`
    : `<span class="recipe-pick__thumb recipe-pick__thumb--placeholder" aria-hidden="true">🍴</span>`;
  return `<button class="recipe-pick__row${isSelected ? ' is-selected' : ''}" data-cand-pick="${rowIdx}:${esc(id)}" type="button">
    ${thumb}
    <span class="recipe-pick__name">${esc(r.name)}</span>
    ${isSelected ? '<span class="recipe-pick__check">&#10003;</span>' : ''}
  </button>`;
}

function buildCandRecipeRows(filter, rowIdx) {
  const lc = filter?.toLowerCase() || '';
  const all = Object.entries(recipes).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const entries = lc ? all.filter(([, r]) => r.name.toLowerCase().includes(lc)) : all;
  if (entries.length === 0 && lc) return `<div class="recipe-pick__none">No match — will save as "${esc(filter)}"</div>`;
  if (entries.length === 0) return `<div class="recipe-pick__none">No recipes yet. Type any meal name to continue.</div>`;
  return entries.map(([id, r]) => buildCandPickRow(rowIdx, id, r)).join('');
}
```

Replace `buildRecipeRows(c.typedName || labelName, i)` in `buildCandidateRow` with `buildCandRecipeRows(c.typedName || labelName, i)`.

- [ ] **Step 3: Render the vote section**

Replace the placeholder vote section from Task 2:

```js
<div class="kp-vote-section is-hidden" id="kp_voteSection">
  <span class="ef2-section-label">Candidates (max 3)</span>
  <div class="kp-cand-list" id="kp_candList">
    ${candidates.map((_, i) => buildCandidateRow(i)).join('')}
  </div>
  <button class="ef2-add-chip" id="kp_addCand" type="button"${candidates.length >= 3 ? ' style="display:none"' : ''}>+ Add option ${candidates.length + 1}</button>
</div>
```

- [ ] **Step 4: Wire per-row picker interactions**

After `activateSheet(mount)`, add:

```js
// Helper: re-render only the vote section (preserves single-mode state).
function rerenderVoteSection() {
  const wrap = document.getElementById('kp_voteSection');
  if (!wrap) return;
  const wasHidden = wrap.classList.contains('is-hidden');
  wrap.innerHTML = `
    <span class="ef2-section-label">Candidates (max 3)</span>
    <div class="kp-cand-list" id="kp_candList">
      ${candidates.map((_, i) => buildCandidateRow(i)).join('')}
    </div>
    <button class="ef2-add-chip" id="kp_addCand" type="button"${candidates.length >= 3 ? ' style="display:none"' : ''}>+ Add option ${candidates.length + 1}</button>`;
  if (wasHidden) wrap.classList.add('is-hidden');
  wireCandidateRows();
  updateSaveBtn();
}

function wireCandidateRows() {
  // Toggle dropdown open on select-button tap.
  document.querySelectorAll('[data-cand-select]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.candSelect, 10);
      const dd = document.querySelector(`[data-cand-dropdown="${i}"]`);
      // Close other dropdowns
      document.querySelectorAll('[data-cand-dropdown]').forEach(d => {
        if (d !== dd) d.classList.remove('is-open');
      });
      dd.classList.toggle('is-open');
      if (dd.classList.contains('is-open')) {
        setTimeout(() => document.querySelector(`[data-cand-search="${i}"]`)?.focus(), 50);
      }
    });
  });

  // Search input filters this row's list.
  document.querySelectorAll('[data-cand-search]').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(inp.dataset.candSearch, 10);
      const val = e.target.value.trim();
      candidates[i].typedName = val;
      candidates[i].selectedRecipeId = null;
      document.querySelector(`[data-cand-list="${i}"]`).innerHTML = buildCandRecipeRows(val, i);
      updateSaveBtn();
    });
  });

  // Recipe selection.
  document.querySelectorAll('[data-cand-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [iStr, id] = btn.dataset.candPick.split(':');
      const i = parseInt(iStr, 10);
      candidates[i].selectedRecipeId = id;
      candidates[i].typedName = recipes[id]?.name || '';
      // Collapse this row's dropdown + update label.
      document.querySelector(`[data-cand-dropdown="${i}"]`).classList.remove('is-open');
      const mealNameSpan = document.querySelector(`[data-cand-select="${i}"] .kp-cand-mealname`);
      if (mealNameSpan) mealNameSpan.textContent = recipes[id]?.name || '';
      document.querySelector(`[data-cand-select="${i}"]`)?.classList.add('has-value');
      updateSaveBtn();
    });
  });
}

wireCandidateRows();
```

Update `updateSaveBtn()` to handle vote mode:

```js
function updateSaveBtn() {
  let canSave = false;
  if (mealMode === 'single') {
    const val = document.getElementById('kp_search')?.value.trim();
    canSave = !!(selectedSlot && (val || selectedRecipeId));
  } else {
    // Vote mode: at least one candidate must have a selection.
    canSave = !!selectedSlot && candidates.some(c => c.selectedRecipeId || c.typedName.trim());
  }
  const btn = document.getElementById('kp_save');
  if (btn) btn.disabled = !canSave;
}
```

- [ ] **Step 5: Append CSS for candidate rows**

Append to `styles/kitchen.css`:

```css
.kp-cand-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.kp-cand-row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.kp-cand-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kp-cand-label {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--text-muted);
}

.kp-cand-remove {
  background: transparent;
  border: 0;
  font-size: var(--font-lg);
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
}

.kp-cand-remove:hover {
  color: var(--text);
}

.kp-cand-mealname {
  flex: 1;
  text-align: left;
}
```

- [ ] **Step 6: Verify in browser**

1. Reload `http://localhost:8080/?env=dev` at 412×915.
2. Kitchen → Meals → tap empty dinner slot → Plan-a-meal opens.
3. Switch to **Set up a vote**.
4. Expected: 2 candidate rows visible labeled `Option 1` / `Option 2`, each with a `Choose a meal…` picker.
5. Tap Option 1's picker → recipe list dropdown opens, search input focused.
6. Type a recipe name → list filters.
7. Tap a recipe in the list → dropdown collapses, row label shows the meal name.
8. Repeat for Option 2.
9. Save button should remain disabled until at least one candidate is filled (verify by toggling rows empty).

**Save still does nothing in Vote mode** — wired in Task 5. Don't expect saves to persist yet.

- [ ] **Step 7: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): Plan-a-meal Vote mode — candidate rows render + picker

Two empty candidate rows render in Vote mode, each with an inline meal
picker (search + filter + select) parallel to single-mode's picker.
State held in a candidates[] array. Save wiring still TBD next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire add/remove candidate rows (cap 3, min 2)

**Files:**
- Modify: `kitchen.js` — wire `+ Add option N` chip and per-row `×` remove

- [ ] **Step 1: Wire add-candidate chip**

After `wireCandidateRows()` is called, add:

```js
function wireAddRemoveCandidates() {
  document.getElementById('kp_addCand')?.addEventListener('click', () => {
    if (candidates.length >= 3) return;
    candidates.push({ selectedRecipeId: null, typedName: '' });
    rerenderVoteSection();
  });

  document.querySelectorAll('[data-cand-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.candRemove, 10);
      if (candidates.length <= 2) return; // min 2 in Vote mode
      candidates.splice(i, 1);
      rerenderVoteSection();
    });
  });
}

wireAddRemoveCandidates();
```

Update `rerenderVoteSection()` to also call `wireAddRemoveCandidates()`:

```js
function rerenderVoteSection() {
  // ... existing innerHTML rebuild ...
  wireCandidateRows();
  wireAddRemoveCandidates();
  updateSaveBtn();
}
```

- [ ] **Step 2: Verify in browser**

1. Reload, open Plan-a-meal Vote mode.
2. Expected: 2 candidate rows, no `×` buttons (min 2 — can't remove).
3. Tap `+ Add option 3`. Expected: 3rd row appears; `×` buttons appear on all 3 rows; the add chip hides.
4. Tap `×` on the 3rd row. Expected: 3rd row disappears; `×` buttons disappear (back to 2); add chip reappears as `+ Add option 3`.
5. Tap `+ Add option 3` again → 3rd row reappears empty.
6. Re-verify: tapping `+ Add option 3` when 3 rows are present does nothing (chip is hidden but defensive check should also guard).

- [ ] **Step 3: Commit**

```bash
git add kitchen.js
git commit -m "feat(kitchen): Plan-a-meal Vote mode — add/remove candidate rows

+ Add option 3 chip appends a row (cap 3). Per-row × removes a row (min 2).
Both fully re-render the vote section to keep wiring in sync.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire Vote-mode Save (commit array)

**Files:**
- Modify: `kitchen.js` — `kp_save` click handler branches on `mealMode`

- [ ] **Step 1: Find the current Save handler**

In `openPlanMealSheet`, find the existing `kp_save` click handler (search for `document.getElementById('kp_save')?.addEventListener` — it's around line 1050-1100). The current handler does single-mode logic + occupied-notice + school dual-save.

- [ ] **Step 2: Branch on mealMode**

Wrap the existing handler body with a Vote-mode branch FIRST:

```js
document.getElementById('kp_save')?.addEventListener('click', async () => {
  const day = document.getElementById('kp_day')?.value || preDate;
  const concreteSlot = selectedSlot; // may be 'school' — handled in single-mode school branch
  if (!concreteSlot) return;

  // ===== Vote mode branch =====
  if (mealMode === 'vote' && concreteSlot !== 'school') {
    const filled = candidates
      .filter(c => c.selectedRecipeId || c.typedName.trim())
      .map(c => {
        const base = {
          source: 'manual',
          addedBy: linkedPerson?.id || (people[0]?.id ?? null),
          addedAt: Date.now(),
          votes: {},
        };
        if (c.selectedRecipeId) return { ...base, recipeId: c.selectedRecipeId };
        return { ...base, customName: c.typedName.trim() };
      });
    if (filled.length === 0) return; // shouldn't happen — Save is disabled
    await writeKitchenPlanSlot(day, concreteSlot, filled);
    planCache[day] = { ...planCache[day], [concreteSlot]: filled };
    mount.innerHTML = '';
    await renderMealsTab();
    showToast(filled.length === 1 ? 'Meal saved' : `${filled.length} options saved`);
    return;
  }

  // ===== Existing single-mode branch (unchanged) =====
  // ... existing code from line ~1050 onward ...
});
```

Make sure `writeKitchenPlanSlot`, `planCache`, `renderMealsTab`, `showToast` are accessible (they already are — kitchen-local).

- [ ] **Step 3: Verify in browser**

1. Reload at 412×915.
2. Kitchen → Meals → tap empty Wednesday dinner slot → Plan-a-meal.
3. Switch to **Set up a vote**.
4. Pick a meal in Option 1.
5. Pick a meal in Option 2.
6. Tap **Save**. Expected: sheet closes, Meals tab shows... (current display still shows Dinner 1 / Dinner 2 — display rule update is Tasks 6-8. Just verify the data persisted by tapping the slot → vote sheet opens with both options visible.)
7. Open Firebase console or check `?env=dev` data in browser devtools to confirm the slot has an array of 2 entries.
8. Repeat with 3 options + custom-typed name.
9. Repeat with only 1 filled row → expected: saves as array of 1 (single-meal-equivalent).

- [ ] **Step 4: Commit**

```bash
git add kitchen.js
git commit -m "feat(kitchen): Plan-a-meal Vote mode — Save commits array of candidates

Save handler branches on mealMode. Vote mode collects filled rows,
synthesizes vote-shape entries ({recipeId|customName, source, addedBy,
addedAt, votes: {}}), and writes via writeKitchenPlanSlot. Single mode
unchanged. School slot ignores the branch (always uses single mode).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Update Meals tab display rule — single `Vote · N options` row

**Files:**
- Modify: `kitchen.js:432-461` (renderMealsTab dinner branch)

- [ ] **Step 1: Replace the multi-option Dinner 1 / Dinner 2 rendering**

Find the block at `kitchen.js:432-461`. Replace the `if (dinnerOptions.length > 1)` branch:

```js
const dinnerOptions = normalizePlanSlot(plan.dinner);
if (dinnerOptions.length > 1) {
  // Voting in progress — single consistent indicator, no per-option names.
  slotRows.push(`<div class="day-block__slot day-block__slot--voting" data-date="${esc(dk)}" data-slot="dinner">
    ${buildSlotThumb(null, { voteGlyph: true })}
    <span class="day-block__slot-label">${esc(SLOT_LABELS.dinner)}</span>
    <span class="day-block__slot-name day-block__slot-name--voting">&#x1F44D; Vote &middot; ${dinnerOptions.length} options</span>
  </div>`);
} else if (dinnerOptions.length === 1) {
  // existing single-option code unchanged
  // ...
}
```

Update `buildSlotThumb` to accept a `voteGlyph` option (or add a new helper). The minimal change — add a parameter check:

```js
function buildSlotThumb(opt, { voteGlyph = false } = {}) {
  if (voteGlyph) {
    return `<span class="day-block__slot-thumb day-block__slot-thumb--vote" aria-hidden="true">&#x1F44D;</span>`;
  }
  // existing logic for opt-based thumb
}
```

If `buildSlotThumb`'s call signature can't easily accept options without refactoring, add a parallel `buildVoteThumb()` helper instead.

Also append CSS to `styles/kitchen.css`:

```css
.day-block__slot--voting .day-block__slot-name {
  color: var(--accent-ink);
  font-weight: 500;
}

.day-block__slot-thumb--vote {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  font-size: var(--font-md);
}
```

- [ ] **Step 2: Verify in browser**

1. Reload at 412×915.
2. Make sure a slot has 2 voting options (set one up via Task 5 if needed).
3. Kitchen → Meals tab.
4. Expected: that day's Dinner row shows `👍 Vote · 2 options` (single row, not "Dinner 1 / Dinner 2").
5. Tap the row. Expected: vote sheet opens (existing behavior — unchanged).
6. Add a 3rd option via the vote sheet's `+ Add another option`.
7. Back on Meals tab: row should now say `👍 Vote · 3 options`.

- [ ] **Step 3: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "feat(kitchen): Meals tab shows 'Vote · N options' instead of Dinner 1/2

Replaces the per-option list rendering with a single consistent indicator
when a slot has 2-3 candidates. Tap behavior unchanged (opens vote sheet).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update Dashboard dinner tile — hide winner name + open vote sheet inline

**Files:**
- Modify: `dashboard.js:305-358` (tile rendering)
- Modify: `dashboard.js:852-871` (tile click handler)

- [ ] **Step 1: Hide winner name in vote state**

In the dinner tile rendering block (`dashboard.js:310-355`):

```js
const dinnerOptions = normalizePlanSlot(viewMeals?.dinner);
const dinnerIsMulti = dinnerOptions.length > 1;
const dinnerWinner = dinnerIsMulti ? null : pickWinner(dinnerOptions);
const dinnerEntry = dinnerWinner?.recipeId ? recipes[dinnerWinner.recipeId] : null;
const dinnerName = dinnerEntry?.name || dinnerWinner?.customName || null;

const dinnerSub = dinnerIsMulti
  ? `&#x1F44D; Vote &middot; ${dinnerOptions.length} options`
  : '';
const dinnerTile = renderDashboardTile({
  label: 'Dinner',
  // Vote state hides winner name — show generic copy instead. Spec §2.
  value: dinnerIsMulti ? 'Tonight\'s dinner' : (dinnerName || 'Plan dinner'),
  sub: dinnerSub,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>',
  iconColor: 'var(--ambient-dinner-fg)',
  action: 'dinner',
  empty: !dinnerIsMulti && !dinnerName
});
```

- [ ] **Step 2: Replace tile-click behavior**

In the tile click handler (`dashboard.js:852-871`), replace the `if (which === 'dinner')` branch:

```js
if (which === 'dinner') {
  const dinnerOpts = normalizePlanSlot(viewMeals?.dinner);
  if (dinnerOpts.length > 1) {
    // Open vote sheet inline — no more kitchen.html detour.
    await openVoteSheetForDinner(dinnerOpts);
    return;
  }
  const dinnerWinnerClick = pickWinner(dinnerOpts);
  if (dinnerWinnerClick?.recipeId || dinnerWinnerClick?.customName) {
    openMealDetailSheet(dinnerWinnerClick, 'dinner');
  } else {
    openMealPlanSheet('dinner');
  }
}
```

Add the `openVoteSheetForDinner` helper somewhere in dashboard.js (near other sheet-opener functions). It mirrors what kitchen.js's `renderMultiOption` does, adapted for dashboard:

```js
async function openVoteSheetForDinner(options) {
  const tz = settings.timezone || detectTimezone();
  const dk = todayKey(tz);
  const slot = 'dinner';
  const slotLabel = 'Dinner';
  const d = new Date(dk + 'T12:00:00');
  const dayLabel = `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()}`;

  // Resolve voter id (mirror kitchen.js logic).
  let viewerId = linkedPerson?.id || null;
  if (!viewerId) {
    const cached = sessionStorage.getItem('dr-kitchen-voter-id');
    if (cached && people.find(p => p.id === cached)) viewerId = cached;
  }
  // For dashboard, if no viewer can be resolved, fall back to a who-votes prompt.
  // Kitchen has openWhoVotesPrompt — port it or import it. For v1, just skip if null.

  openVoteSheet({
    mount: taskSheetMount,
    dk, slot, slotLabel, dayLabel,
    options,
    recipes, people,
    viewerId,
    showToast, showConfirm,
    onWriteOptions: async (newOpts) => {
      await writeKitchenPlanSlot(dk, slot, newOpts);
      // Refresh local view of meals + re-render dashboard.
      await loadData();
      render();
    },
    onRemoveSlot: async () => {
      await removeKitchenPlanSlot(dk, slot);
      await loadData();
      render();
    },
    onAddAnother: () => {
      // Open Plan-a-meal in Vote mode pre-filled. For v1: redirect to Kitchen.
      // (Inline Plan-a-meal on dashboard is out-of-scope — too much rework.)
      const personParam = linkedPerson ? `?person=${encodeURIComponent(linkedPerson.name)}` : '';
      location.href = `kitchen.html${personParam}`;
    },
    onClose: () => { taskSheetMount.innerHTML = ''; },
  });
}
```

Add imports at the top of `dashboard.js`:

```js
import { /* ... existing names ... */, openVoteSheet, showConfirm } from './shared/components.js';
import { /* ... */, writeKitchenPlanSlot, removeKitchenPlanSlot } from './shared/firebase.js';
```

`writeKitchenPlanSlot` and `removeKitchenPlanSlot` are already imported from line 1 — verify and add if missing.

- [ ] **Step 3: Verify in browser**

1. Reload `http://localhost:8080/?env=dev` at 412×915.
2. Set up today's dinner with 2 voting options (via Kitchen → Plan-a-meal Vote mode).
3. Go to Dashboard.
4. Expected: Dinner tile shows main label `Tonight's dinner` (not the winner's name), sub-line `👍 Vote · 2 options`.
5. Tap the tile. Expected: vote sheet opens **on the dashboard** (no navigation away). Vote cards visible.
6. Tap thumbs-up on an option. Expected: vote registered, sheet re-renders.
7. Tap Lock in → confirmation prompt → confirm → winner locks in, sheet closes, dashboard tile now shows the winner's meal name (single-meal state).

- [ ] **Step 4: Commit**

```bash
git add dashboard.js
git commit -m "feat(dashboard): dinner tile hides winner in vote state + opens vote sheet inline

Vote-state tile shows generic 'Tonight's dinner' label with 'Vote · N
options' sub-line; tap opens the vote sheet inline via openVoteSheet
instead of routing to kitchen.html. Writes refresh dashboard state via
loadData + render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Update Calendar day sheet — same display rule + inline vote sheet

**Files:**
- Modify: `calendar.html` — find meal slot rendering in day-sheet code

- [ ] **Step 1: Locate the calendar's meal rendering**

```bash
# Grep for meal slot rendering in calendar.html
grep -n "planCache\|kitchenPlan\|SLOT_LABELS\|normalizePlanSlot" calendar.html
```

Look for the day-sheet rendering block that lists today's planned meals. If found, apply the same pattern as Meals tab:

```js
const slotOptions = normalizePlanSlot(plan[s]);
if (slotOptions.length > 1) {
  // Voting row
  html += `<div class="cal-meal-row cal-meal-row--voting" data-date="${esc(dk)}" data-slot="${esc(s)}">
    <span class="cal-meal-thumb cal-meal-thumb--vote">&#x1F44D;</span>
    <span class="cal-meal-label">${esc(SLOT_LABELS[s])}</span>
    <span class="cal-meal-name cal-meal-name--voting">Vote &middot; ${slotOptions.length} options</span>
  </div>`;
} else if (slotOptions.length === 1) {
  // existing single-option rendering
}
```

Wire the click handler to open `openVoteSheet` (imported from `shared/components.js`):

```js
row.addEventListener('click', async () => {
  const dk = row.dataset.date;
  const s = row.dataset.slot;
  const opts = normalizePlanSlot(planCache[dk]?.[s]);
  if (opts.length > 1) {
    openVoteSheet({ /* ... same shape as dashboard ... */ });
  } else {
    // existing single-option behavior
  }
});
```

If calendar.html doesn't currently render meal options at all in its day sheet, skip this task and note it. Per CLAUDE.md, calendar.html is inline-scripted — the change goes inline.

- [ ] **Step 2: Verify in browser**

1. Reload at 412×915.
2. Navigate to Calendar tab.
3. Open today's day sheet (or whatever day has a voting slot).
4. Expected: voting slot shows `👍 Vote · N options` row.
5. Tap → vote sheet opens inline on calendar.
6. Vote interactions work; close returns to calendar.

- [ ] **Step 3: Commit**

```bash
git add calendar.html
git commit -m "feat(calendar): day sheet shows 'Vote · N options' + opens vote sheet inline

Same display rule as Meals tab + Dashboard. Tap routes through shared
openVoteSheet rather than navigating to kitchen.html.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Plan-a-meal pre-population from existing slot state

**Files:**
- Modify: `kitchen.js` — `openPlanMealSheet` opener-time logic

- [ ] **Step 1: Detect "slot already has voting" at open**

At the top of `openPlanMealSheet` (before the `mount.innerHTML = renderBottomSheet(...)`):

```js
function openPlanMealSheet(preDate, preSlot, preRecipeId = null, opts = {}) {
  // ===== Early redirect: if slot is already in vote state, jump to vote sheet =====
  if (preSlot && preSlot !== 'school' && !opts.appendMode) {
    const existing = normalizePlanSlot(planCache[preDate]?.[preSlot]);
    if (existing.length >= 2) {
      showToast('This slot has a vote in progress — opening vote sheet.');
      // openSlotEditSheet routes through renderMultiOption -> openVoteSheet.
      openSlotEditSheet(preDate, preSlot, existing[0]);
      return;
    }
  }

  // ===== Normal opener flow =====
  const appendMode = opts.appendMode === true;
  // ... existing code
}
```

- [ ] **Step 2: Pre-fill Vote-mode row 1 when toggling from a 1-meal slot**

In the segmented-control click handler (Task 2), update the vote-mode side:

```js
document.getElementById('kp_modeTabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-mode]');
  if (!tab) return;
  const prevMode = mealMode;
  mealMode = tab.dataset.mode;

  // Going single → vote: if there's a current single-mode selection, seed row 1.
  if (prevMode === 'single' && mealMode === 'vote') {
    const val = document.getElementById('kp_search')?.value.trim();
    if (selectedRecipeId) {
      candidates[0] = { selectedRecipeId, typedName: recipes[selectedRecipeId]?.name || '' };
    } else if (val) {
      candidates[0] = { selectedRecipeId: null, typedName: val };
    }
    rerenderVoteSection();
  }

  // Going vote → single: discard candidates silently (spec §1).
  if (prevMode === 'vote' && mealMode === 'single') {
    candidates = [
      { selectedRecipeId: null, typedName: '' },
      { selectedRecipeId: null, typedName: '' },
    ];
    // No DOM changes needed in single mode — the search input still holds prior value.
  }

  // existing toggle UI updates...
});
```

- [ ] **Step 3: Pre-fill Vote-mode when opened in appendMode with existing options**

When `appendMode === true`, the slot-edit "+ Add another option" path is calling us. Pre-fill candidates with the existing options:

```js
function openPlanMealSheet(preDate, preSlot, preRecipeId = null, opts = {}) {
  // ... early redirect for vote state (skipped if appendMode) ...
  const appendMode = opts.appendMode === true;

  // Default initial state:
  let candidates = [
    { selectedRecipeId: null, typedName: '' },
    { selectedRecipeId: null, typedName: '' },
  ];
  let mealMode = 'single';

  // If appendMode, switch to Vote mode and pre-fill with existing options.
  if (appendMode && preSlot && preSlot !== 'school') {
    const existing = normalizePlanSlot(planCache[preDate]?.[preSlot]);
    if (existing.length >= 1) {
      mealMode = 'vote';
      candidates = existing.map(opt => ({
        selectedRecipeId: opt.recipeId || null,
        typedName: opt.recipeId ? '' : (opt.customName || opt.mealName || ''),
      }));
      // Append one empty row if we have fewer than 3 to leave room for the new one.
      if (candidates.length < 3) {
        candidates.push({ selectedRecipeId: null, typedName: '' });
      }
    }
  }

  // ... rest of opener ...
}
```

In the template, set the segmented-control active tab based on `mealMode`:

```js
${selectedSlot !== 'school' ? `
  <div class="kp-mode-section" id="kp_modeSection">
    <nav class="tabs tabs--pill kp-mode-tabs" id="kp_modeTabs" role="tablist">
      <button class="tab${mealMode === 'single' ? ' is-active' : ''}" data-mode="single" type="button">Single meal</button>
      <button class="tab${mealMode === 'vote' ? ' is-active' : ''}" data-mode="vote" type="button">Set up a vote</button>
    </nav>
  </div>
  <div class="ef2-divider"></div>
` : ''}
```

And update the meal/vote section hidden state:

```html
<div class="kp-meal-section${mealMode === 'vote' ? ' is-hidden' : ''}" id="kp_mealSection">
<!-- ... -->
<div class="kp-vote-section${mealMode === 'single' ? ' is-hidden' : ''}" id="kp_voteSection">
```

- [ ] **Step 4: Verify in browser**

1. Slot with 1 meal: Kitchen → Meals → tap the slot. Slot-edit (single-option) opens. Tap the back/change route to Plan-a-meal. Toggle Vote mode. Expected: row 1 pre-fills with that meal.
2. Empty slot: open Plan-a-meal. Toggle Vote. Expected: 2 empty rows.
3. Slot with 2 voting options: tap from Meals tab. Expected: vote sheet opens directly (no Plan-a-meal). Tap `+ Add another option` from vote sheet. Expected: Plan-a-meal opens in Vote mode, candidates rows 1+2 pre-filled with existing 2 options, row 3 empty.
4. Slot with 3 voting options: tap `+ Add another option` (should be hidden in vote sheet at 3 — verify it's hidden).
5. Vote → Single toggle: pick 2 candidates, toggle back to Single. Expected: candidates discarded, single-mode picker shows blank.

- [ ] **Step 5: Commit**

```bash
git add kitchen.js
git commit -m "feat(kitchen): Plan-a-meal pre-population for existing slot states

- Slot with 2-3 voting options: opener redirects to vote sheet with toast
- appendMode pre-fills candidates with existing options + one empty row
- Single → Vote toggle seeds row 1 with single-mode selection
- Vote → Single toggle discards candidates silently per spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Remove kp_occupiedNotice block

**Files:**
- Modify: `kitchen.js` — remove `renderOccupiedNotice` function + call sites
- Modify: `styles/kitchen.css` — remove `.kp-occupied-notice*` rules

- [ ] **Step 1: Remove from kitchen.js**

In `openPlanMealSheet`:
- Delete the entire `function renderOccupiedNotice() { ... }` block (~lines 890-917).
- Delete the call sites: `renderOccupiedNotice();` and the `kp_day` change listener that calls it.
- Delete the `<div class="kp-occupied-notice" id="kp_occupiedNotice"></div>` line in the sheet template.
- In the save handler, delete the `kp_voteToggle` checked-state read and any `userAsksAppend` logic that depended on the toggle. Single-mode save no longer reads any occupied-notice state — when the slot is already in vote state, the early redirect in Task 9 already routed away.

- [ ] **Step 2: Remove from kitchen.css**

```bash
# Find the rules to delete:
grep -n "kp-occupied-notice" styles/kitchen.css
```

Delete all `.kp-occupied-notice*` rule blocks.

- [ ] **Step 3: Verify**

1. Reload at 412×915.
2. Open Plan-a-meal on an empty slot, on a slot with 1 meal, on a slot with 2+ options.
3. Expected: no "Already planned / Save as another option" toggle row appears in any case.
4. Slot with 2+ options: still redirects to vote sheet (Task 9 behavior).
5. Slot with 1 meal: meal-picker pre-selects that meal; saving REPLACES (no silent append).
6. To add an option to a 1-meal slot, user toggles Vote mode (the explicit path).

- [ ] **Step 4: Commit**

```bash
git add kitchen.js styles/kitchen.css
git commit -m "chore(kitchen): remove kp_occupiedNotice block

The 'occupied notice' toggle was the old way to add a second option to an
already-planned slot. Replaced by the explicit Vote mode toggle in
Plan-a-meal (Tasks 2-5) plus the 2+ vote-state early redirect (Task 9).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Drop appendMode (now redundant)

**Files:**
- Modify: `kitchen.js` — drop `opts.appendMode` plumbing from `openPlanMealSheet`; update slot-edit `+ Add another option` to NOT pass appendMode but rely on the new pre-population

- [ ] **Step 1: Re-think the slot-edit add-another flow**

The vote sheet's `+ Add another option` currently does:
```js
openPlanMealSheet(dk, slot, null, { appendMode: true });
```

After Task 9, `appendMode` triggers pre-population from existing slot options. After this task, we want the same behavior without the `appendMode` flag — Plan-a-meal should infer pre-population from the existing slot state directly.

Update the early-pre-population logic in `openPlanMealSheet`:

```js
function openPlanMealSheet(preDate, preSlot, preRecipeId = null, opts = {}) {
  // (preserve opts param for future use, but appendMode is no longer read)

  // ===== Pre-populate Vote mode if slot already has voting options =====
  let candidates = [
    { selectedRecipeId: null, typedName: '' },
    { selectedRecipeId: null, typedName: '' },
  ];
  let mealMode = 'single';

  if (preSlot && preSlot !== 'school') {
    const existing = normalizePlanSlot(planCache[preDate]?.[preSlot]);
    if (existing.length >= 2) {
      // Slot is in vote state — early redirect to vote sheet (was the Task 9 logic;
      // unchanged).
      showToast('This slot has a vote in progress — opening vote sheet.');
      openSlotEditSheet(preDate, preSlot, existing[0]);
      return;
    }
    // existing.length is 0 or 1 — normal Plan-a-meal flow.
  }

  // ... rest of opener ...
}
```

Wait — Task 9 already pre-populated for `appendMode`. Now we want add-another to land in Vote mode pre-filled too, WITHOUT `appendMode`. Solution: when the vote sheet calls `+ Add another option`, it should explicitly call Plan-a-meal in Vote mode with the existing options.

Update the kitchen.js `onAddAnother` callback (where `openVoteSheet` is wired in Task 1):

```js
onAddAnother: () => {
  mount.innerHTML = '';
  // Build candidates array from existing options + one empty row.
  const existing = normalizePlanSlot(planCache[dk]?.[slot]);
  const preCandidates = existing.map(o => ({
    selectedRecipeId: o.recipeId || null,
    typedName: o.recipeId ? '' : (o.customName || o.mealName || ''),
  }));
  if (preCandidates.length < 3) preCandidates.push({ selectedRecipeId: null, typedName: '' });

  openPlanMealSheet(dk, slot, null, {
    initialMode: 'vote',
    initialCandidates: preCandidates,
  });
},
```

In `openPlanMealSheet`:

```js
function openPlanMealSheet(preDate, preSlot, preRecipeId = null, opts = {}) {
  let candidates = opts.initialCandidates || [
    { selectedRecipeId: null, typedName: '' },
    { selectedRecipeId: null, typedName: '' },
  ];
  let mealMode = opts.initialMode || 'single';

  // ===== Skip the 2+ early redirect when initialCandidates is provided =====
  if (preSlot && preSlot !== 'school' && !opts.initialCandidates) {
    const existing = normalizePlanSlot(planCache[preDate]?.[preSlot]);
    if (existing.length >= 2) {
      showToast('This slot has a vote in progress — opening vote sheet.');
      openSlotEditSheet(preDate, preSlot, existing[0]);
      return;
    }
  }

  // Drop the old appendMode reference entirely.
  // ...
}
```

Replace anywhere else that calls `openPlanMealSheet(..., { appendMode: true })` with the new shape. Search:

```bash
grep -n "appendMode" kitchen.js
```

Update each call site.

- [ ] **Step 2: Verify**

1. Vote sheet (2 options) → `+ Add another option` → Plan-a-meal opens in Vote mode with rows 1+2 pre-filled, row 3 empty.
2. Empty slot → Plan-a-meal → defaults to Single mode, 2 empty rows in Vote mode.
3. 1-meal slot → opens slot-edit (single-option) → "Change" → Plan-a-meal in Single mode with that meal pre-selected.
4. Search the codebase for `appendMode` — should return zero results.

- [ ] **Step 3: Commit**

```bash
git add kitchen.js
git commit -m "chore(kitchen): drop appendMode in favor of explicit initialMode/initialCandidates

The 'add another option' flow now passes explicit Vote-mode + pre-filled
candidates instead of relying on a hidden flag. Clearer call sites, no
implicit behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Vote sheet polish — header label + add-another CTA promotion

**Files:**
- Modify: `shared/components.js` — `openVoteSheet`

- [ ] **Step 1: Update sheet header to include "Vote —"**

In `openVoteSheet`, find:
```js
<h2 class="sheet__title">${esc(slotLabel)} &middot; ${esc(dayLabel)}</h2>
```

Replace with:
```js
<h2 class="sheet__title">Vote &mdash; ${esc(slotLabel)} &middot; ${esc(dayLabel)}</h2>
```

- [ ] **Step 2: Promote `+ Add another option` to primary CTA when at 2 options**

Current:
```js
${options.length < 3 ? `<div class="me-detail__chips"><button class="chip" id="addAnotherOption" type="button">+ Add another option</button></div>` : ''}
```

Replace with:
```js
${options.length < 3 ? `
  <div class="vote-add-another">
    <button class="${options.length === 2 ? 'btn btn--primary btn--block' : 'chip'}" id="addAnotherOption" type="button">+ Add another option</button>
  </div>
` : ''}
```

Append CSS to `styles/components.css`:

```css
.vote-add-another {
  padding: var(--spacing-md);
}
```

- [ ] **Step 3: Verify**

1. Open a slot with 2 voting options. Vote sheet shows.
2. Expected: header reads `Vote — Dinner · Wed 13` (with em-dash).
3. Expected: `+ Add another option` is a full-width primary button (not a small chip).
4. Tap `+ Add another option` → Plan-a-meal opens in Vote mode pre-filled.
5. Add a 3rd option, save, reopen vote sheet.
6. Expected: 3 vote cards visible, NO `+ Add another option` button (cap reached).

- [ ] **Step 4: Commit**

```bash
git add shared/components.js styles/components.css
git commit -m "feat(components): vote sheet polish — header label + add-another CTA promotion

Header now self-labels as 'Vote — {Slot} · {Day}'. The + Add another
option chip becomes a full-width primary button when there are 2 options
to promote it from afterthought to legitimate next step.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: DESIGN.md update + SW cache bump

**Files:**
- Modify: `docs/DESIGN.md` §6.10
- Modify: `sw.js` — bump CACHE_NAME

- [ ] **Step 1: Update DESIGN.md §6.10**

Open `docs/DESIGN.md`, find §6.10 Kitchen (the Plan-a-meal section). Add a sub-section after the existing Plan-a-meal description:

```markdown
### Plan-a-meal: Single / Vote modes

The Plan-a-meal sheet has two modes selected via a segmented control at
the top:

- **Single meal** (default): the existing one-meal flow.
- **Set up a vote**: a stack of 2-3 candidate rows. Each row is an
  independent meal picker (search + recipe list + custom-name fallback).
  `+ Add option 3` chip appears when both initial rows are filled; `×`
  per row removes (min 2). Save commits the array of filled candidates.

The segmented control is hidden when **School** is the selected slot —
school keeps its own dual-pick flow because the two school slots are
distinct slot keys, not vote options.

### Voting display rule

Wherever a slot's content is summarized (dashboard tile, Meals tab row,
calendar day sheet), voting state shows a single consistent indicator:

- 1 option (or no voting): meal name, unchanged.
- 2-3 options: `Vote · N options` (with thumbs-up glyph on dashboard
  + meals tab).

Per-option names are not shown in summaries — recipe names are routinely
too long to fit two side-by-side on a phone tile. The vote sheet itself
is the only surface that lists candidates with their tallies.

### Vote sheet

Same `openVoteSheet` shared opener (from `shared/components.js`) is
called from every entry point: kitchen Meals tab, dashboard dinner tile,
calendar day sheet. No more navigating to `kitchen.html` to vote.
```

- [ ] **Step 2: Bump SW cache**

Open `sw.js`. Find the CACHE_NAME at the bottom of the log header (around line 411):

```js
const CACHE_NAME = 'family-hub-v251';
```

Change to `v252` and add a log entry at the top of the log header (after v251):

```js
// v252 (2026-05-12) — Meal voting redesign: Plan-a-meal Single/Vote
//                     segmented control with candidate rows; vote sheet
//                     extracted to shared openVoteSheet; display rule
//                     'Vote · N options' replaces per-option lists across
//                     dashboard/meals tab/calendar; vote-sheet entry
//                     points inline (no more kitchen.html detour);
//                     appendMode + kp_occupiedNotice removed.
```

- [ ] **Step 3: Verify**

1. Reload at 412×915. Hard refresh to install the new SW.
2. DevTools → Application → Service Workers → confirm `family-hub-v252` is active.
3. Spot check the full feature path:
   - Plan a meal in Vote mode with 2 candidates → save
   - Confirm Meals tab shows `Vote · 2 options`
   - Confirm Dashboard tile shows `Tonight's dinner` + `Vote · 2 options` sub-line
   - Tap dashboard tile → vote sheet opens inline
   - Vote, lock in, confirm
   - Dashboard now shows the winner's meal name

- [ ] **Step 4: Commit**

```bash
git add docs/DESIGN.md sw.js
git commit -m "docs(design): meal voting redesign + SW cache v252

DESIGN.md §6.10 documents the new Single/Vote modes, the unified
'Vote · N options' display rule, and the shared openVoteSheet opener.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review checklist (run after final commit)

- [ ] **Spec coverage:** Every section of the spec (§1 Plan-a-meal, §2 Display rules, §3 Vote sheet, §4 Cleanup, §5 Edge cases) maps to a task above. Confirm by re-reading the spec end-to-end.
- [ ] **No stale references:** `grep -n "appendMode\|kp_occupiedNotice\|kp-occupied-notice\|Dinner 1\|Dinner 2" kitchen.js dashboard.js styles/` returns zero hits.
- [ ] **Vote sheet works from all three entry points:** Kitchen Meals tab, Dashboard dinner tile, Calendar day sheet — all open `openVoteSheet` inline.
- [ ] **School slot untouched:** Open Plan-a-meal with School slot selected — segmented control hidden, existing dual-pick flow intact.
- [ ] **Single mode unchanged from user perspective:** Single mode picker, save, and slot-edit single-option behavior all match the pre-spec experience.
- [ ] **No new form sheets** beyond what's documented (Plan-a-meal updated in place, vote sheet extracted not rewritten) — satisfies CLAUDE.md "no new form sheet without reading DESIGN.md §5.23 + §13.13".
- [ ] **Edge cases covered:** Saving Vote-mode with 1 candidate → array of 1 (verified Task 5). Saving with 0 candidates → disabled (verified Task 3/5). Toggling Vote → Single discards (verified Task 9).

If any item fails, file a follow-up commit before declaring done.
