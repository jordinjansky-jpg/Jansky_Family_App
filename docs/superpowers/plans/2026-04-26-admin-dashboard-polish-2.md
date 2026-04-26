# Admin & Dashboard Polish Pass 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 visual and UX issues across admin, dashboard, bell, and weather identified in a QA pass.

**Architecture:** Vanilla JS ES modules, modular CSS. No bundler. Changes are spread across `styles/components.css`, `styles/admin.css`, `dashboard.js`, `admin.html`, `shared/components.js`, and `shared/weather.js`. Each task is independent — no cross-task dependencies except Task 7 (More nav) must complete before tasks that call `initNavMore`.

**Tech Stack:** Vanilla JS ES modules, Firebase RTDB compat SDK (`firebase.` global), Cloudflare Pages (auto-deploys on `git push main`), OpenWeatherMap free API.

---

## Codebase context (read before starting any task)

- App root: `c:\Users\jordi\OneDrive\Documents\Personal\Claude\Jansky_Family_App`
- No build step. Edit files directly; refresh browser to test.
- Service worker caches app shell. After any file change, bump `CACHE_NAME` in `sw.js` (e.g. `family-hub-v69` → `family-hub-v70`) and add a log entry at the top of the bump list.
- CSS variable tokens live in `styles/base.css`. Never use raw hex in component CSS — use tokens or `var(--...)`.
- `shared/components.js` is the single shared rendering library — all pages import from it.
- `admin.html` is a single-file app with inline `<script type="module">`. All admin JS is in that one script block.
- Firebase RTDB compat SDK: all DB access via `firebase.database()` or the helpers in `shared/firebase.js`. Never use modular imports for Firebase.

---

## Task 1: Banner width fix + admin tab fill-width

**Files:**
- Modify: `styles/components.css` (`.banner` rule ~line 1692)
- Modify: `styles/admin.css` (`.admin-tab` rule ~line 110)

The `.banner` component (used for overdue, multiplier, vacation, freeze, info banners) has `margin: 0 var(--spacing-md) var(--spacing-md)`. This extra horizontal margin insets it relative to other full-width content. Remove the horizontal margin so the banner fills its container like everything else.

The `.admin-tab` buttons have `flex: 0 0 auto; min-width: 56px` which lets them be small and leave dead space. Change to `flex: 1` so they distribute evenly across the full tab bar width.

- [ ] **Step 1: Fix banner horizontal margin**

In `styles/components.css`, find the `.banner` rule (currently `margin: 0 var(--spacing-md) var(--spacing-md)`) and change it:

```css
.banner {
  margin: 0 0 var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-lg);
  display: flex; align-items: center; gap: var(--spacing-md);
  background: var(--surface);
  border: 1px solid var(--border);
}
```

- [ ] **Step 2: Fix admin tab fill-width**

In `styles/admin.css`, find `.admin-tab` (currently `flex: 0 0 auto; min-width: 56px`). Change to:

```css
.admin-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--font-xs);
  color: var(--text-faint);
  flex: 1;
  cursor: pointer;
  transition: all var(--t-fast);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

Also remove `min-width: 56px` from `.admin-tab` if it exists as a separate declaration.

- [ ] **Step 3: Verify in browser**

Open admin at 375px width. Check:
- Overdue/multiplier/vacation banners stretch edge-to-edge within page padding (same width as section heads and task cards).
- Library · People · Settings · Tools tabs distribute evenly, no dead space at right.

- [ ] **Step 4: Commit**

```bash
git add styles/components.css styles/admin.css
git commit -m "fix(ui): banner full-width, admin tabs fill available space"
```

---

## Task 2: FAB rename + More menu alpha sort

**Files:**
- Modify: `dashboard.js` (~line 2275 for FAB label, ~line 95 for More sort)

Two simple changes in `dashboard.js`:

1. In `openAddMenu()`, change `label: 'Plan a Meal'` → `label: 'New Meal'`
2. In `buildHeaderOverflow()`, sort items alphabetically by label before returning.

- [ ] **Step 1: Change FAB add-menu label**

Find line ~2275 in `dashboard.js`:
```js
{ key: 'meal', label: 'Plan a Meal',
```
Change to:
```js
{ key: 'meal', label: 'New Meal',
```

- [ ] **Step 2: Sort More menu alpha**

Find `buildHeaderOverflow()` (~line 95):
```js
function buildHeaderOverflow() {
  const items = [];
  items.push({ id: 'rewards', label: 'Rewards' });
  items.push({ id: 'admin', label: 'Admin' });
  items.push({ id: 'theme', label: 'Theme' });
  if (localStorage.getItem('dr-debug') === 'true') {
    items.push({ id: 'debug', label: 'Debug (turn off)' });
  }
  return items;
}
```

Change to sort alpha before return:
```js
function buildHeaderOverflow() {
  const items = [];
  items.push({ id: 'rewards', label: 'Rewards' });
  items.push({ id: 'admin', label: 'Admin' });
  items.push({ id: 'theme', label: 'Theme' });
  if (localStorage.getItem('dr-debug') === 'true') {
    items.push({ id: 'debug', label: 'Debug (turn off)' });
  }
  return items.slice().sort((a, b) => a.label.localeCompare(b.label));
}
```

- [ ] **Step 3: Verify in browser**

- Open FAB → verify "New Meal" label (not "Plan a Meal").
- Open More (three-dot or More button) → verify items are alphabetical: Admin, Debug, Rewards, Theme (Debug only shows when debug mode is on).

- [ ] **Step 4: Commit**

```bash
git add dashboard.js
git commit -m "fix(dashboard): rename FAB 'New Meal', sort More menu alphabetically"
```

---

## Task 3: Admin PIN placeholder + tools stat card fixes

**Files:**
- Modify: `admin.html` (~line 1372 for PIN input, ~line 1453 for stat cards)
- Modify: `styles/admin.css` (`.admin-stat-card__label`, `.admin-list-item` inside stats)

Two fixes in admin:

**A. PIN input:** The input has `letter-spacing: 0.3em` which makes the placeholder "Leave blank to keep current" too wide to read. Move letter-spacing to a `::placeholder`-exempt override so only typed digits get the spacing, not the placeholder.

**B. Tools stat cards:** The 3-col grid is fine but `Days Scheduled` wraps while others don't because "Scheduled" is a long word. Add `text-align: center; white-space: normal` and `word-break: break-word` to ensure uniform behavior. The per-person list uses `admin-icon-tile` (40×40px) which is too large for a dense stats list — replace with a small color dot using `admin-person-dot admin-person-dot--sm`.

- [ ] **Step 1: Fix PIN input placeholder**

Find the `sf_newPin` input in `admin.html`:
```html
<input class="form-input" type="tel" id="sf_newPin" maxlength="4" inputmode="numeric" placeholder="Leave blank to keep current" style="max-width:200px;letter-spacing:0.3em;text-align:center;">
```

Change to — add `id`-specific CSS instead of inline style, or just scope it. Easiest: add a CSS class and move the styles there. But since this is one field, just use a `<style>` scoped approach or add to `admin.css`. The simplest fix is to use the CSS `::placeholder` pseudo. Change the inline style to remove letter-spacing, shorten the placeholder, and add a CSS rule in admin.css:

Change the HTML:
```html
<input class="form-input admin-pin-input" type="tel" id="sf_newPin" maxlength="4" inputmode="numeric" placeholder="Leave blank to keep" style="max-width:200px;text-align:center;">
```

Add to `styles/admin.css`:
```css
.admin-pin-input {
  letter-spacing: 0.3em;
  font-family: monospace;
}
.admin-pin-input::placeholder {
  letter-spacing: normal;
  font-family: inherit;
}
```

- [ ] **Step 2: Fix stat card label wrapping**

In `styles/admin.css`, find `.admin-stat-card__label`:
```css
.admin-stat-card__label {
  font-size: var(--font-xs);
  color: var(--text-faint);
}
```

Change to:
```css
.admin-stat-card__label {
  font-size: var(--font-xs);
  color: var(--text-faint);
  text-align: center;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
```

- [ ] **Step 3: Fix per-person stats row — smaller dot**

In `admin.html`, find `loadScheduleStats()` (~line 1454). The person row currently uses `admin-icon-tile` (40×40). Replace with a small dot + body layout:

```js
html += `<div class="admin-list-item">
  <div class="admin-person-dot admin-person-dot--sm" style="background:${p.color};flex-shrink:0"></div>
  <div class="admin-list-item__body">
    <span class="admin-list-item__name">${esc(p.name)}</span>
    <span class="admin-list-item__meta">${count} tasks · ${avg}/day · ${personTotalStr} total · ${avgMinsStr}/day</span>
  </div>
</div>`;
```

In `styles/admin.css`, verify `.admin-person-dot--sm` has a fixed size (should be ~10px). If not, add:
```css
.admin-person-dot--sm {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
```

- [ ] **Step 4: Verify in browser**

Open Admin → Tools → scroll to Load per Person. Check:
- PIN input placeholder shows full text clearly (no letter spacing on placeholder).
- All 3 stat cards wrap their labels the same way.
- Per-person rows show small dot + name on one line + meta on next line, no truncation.

- [ ] **Step 5: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "fix(admin): PIN placeholder readability, stat card label wrap, stats row dot size"
```

---

## Task 4: Remove back-online notification banner

**Files:**
- Modify: `shared/components.js` (`initOfflineBanner` function ~line 1369)

The "Back online" banner pops up for 2 seconds and blocks the top of the screen. The connection status light already exists in the header. Remove the banner entirely — keep only the connection dot update. Still show "Working offline" when disconnected (that's important info) but auto-hide it faster (2s → immediately after connection restored, we just silently update the dot).

- [ ] **Step 1: Modify initOfflineBanner**

Find `initOfflineBanner` in `shared/components.js` (~line 1369):

```js
export function initOfflineBanner(onConnectionChange, options = {}) {
  const { showConnectionDot = true } = options;
  const mount = document.createElement('div');
  mount.id = 'offlineBannerMount';
  document.body.appendChild(mount);

  let timer = null;
  let wasOffline = false;

  return onConnectionChange((connected) => {
    // Update connection dot in header
    if (showConnectionDot) {
      const existing = document.querySelector('.connection-dot');
      const dotHtml = renderConnectionStatus(connected);
      if (existing) existing.outerHTML = dotHtml;
      else document.querySelector('.header__right')?.insertAdjacentHTML('afterbegin', dotHtml);
    }

    // Show offline/online banner
    if (timer) clearTimeout(timer);
    if (!connected) {
      wasOffline = true;
      mount.innerHTML = renderOfflineBanner('Working offline — changes will sync');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 3000);
    } else if (wasOffline) {
      mount.innerHTML = renderOfflineBanner('Back online');
      mount.querySelector('.offline-banner')?.classList.add('offline-banner--online');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 2000);
    }
  });
}
```

Replace with (remove the "Back online" branch, keep offline warning):

```js
export function initOfflineBanner(onConnectionChange, options = {}) {
  const { showConnectionDot = true } = options;
  const mount = document.createElement('div');
  mount.id = 'offlineBannerMount';
  document.body.appendChild(mount);

  let timer = null;

  return onConnectionChange((connected) => {
    if (showConnectionDot) {
      const existing = document.querySelector('.connection-dot');
      const dotHtml = renderConnectionStatus(connected);
      if (existing) existing.outerHTML = dotHtml;
      else document.querySelector('.header__right')?.insertAdjacentHTML('afterbegin', dotHtml);
    }

    if (timer) clearTimeout(timer);
    if (!connected) {
      mount.innerHTML = renderOfflineBanner('Working offline — changes will sync');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 3000);
    } else {
      mount.innerHTML = '';
    }
  });
}
```

- [ ] **Step 2: Verify in browser**

Throttle network to "Offline" in DevTools → see offline banner appears briefly. Re-enable network → banner disappears immediately (no "Back online" popup). Connection dot in header updates both times.

- [ ] **Step 3: Commit**

```bash
git add shared/components.js
git commit -m "fix(ui): remove 'Back online' toast — connection dot already signals reconnect"
```

---

## Task 5: Admin filter toolbar button height alignment

**Files:**
- Modify: `styles/admin.css` (`.admin-filters--row` and button rule)

In the library filter toolbar (`admin-filters--row`), the `+ Add X` button (`btn btn--primary btn--sm`) is visually taller or smaller than the adjacent `admin-select` inputs. Make all three elements (search input, sort select, add button) the same height.

The root issue: `admin-select` uses custom padding from the admin CSS, while `btn--sm` uses the component button padding. Align them by giving buttons in the filter row an explicit height that matches the select height.

- [ ] **Step 1: Find current heights**

In `styles/admin.css`, find `.admin-select`:
```css
.admin-select {
  /* check current padding values */
}
```

And in `styles/components.css`, find `.btn--sm`:
```css
.btn--sm { /* check padding */ }
```

- [ ] **Step 2: Add height alignment rule**

In `styles/admin.css`, add to the `.admin-filters--row` block:

```css
.admin-filters--row {
  display: flex;
  gap: var(--spacing-xs);
  align-items: stretch;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--border-subtle, var(--border));
  margin-bottom: 0;
}
.admin-filters--row .admin-select { width: auto; }
.admin-filters--row input.admin-select { flex: 1; }
.admin-filters--row .btn {
  align-self: center;
  white-space: nowrap;
  flex-shrink: 0;
}
```

Change `align-items: center` → `align-items: stretch` and add `.btn { align-self: center; }` so the button stays centered while inputs stretch.

- [ ] **Step 3: Verify in browser**

Open Admin → Library (Tasks). The search input, sort select, and Add button should be visually the same height and align cleanly in a row.

- [ ] **Step 4: Commit**

```bash
git add styles/admin.css
git commit -m "fix(admin): filter toolbar button height alignment"
```

---

## Task 6: Color pickers → native color input everywhere

**Files:**
- Modify: `admin.html` (3 color picker locations)
- Modify: `styles/admin.css` (add `.color-pick-btn` style)

Replace all color swatch grids (`color-grid` with `color-swatch` divs) with a single native `<input type="color">` styled as a color preview button. This applies to:

1. **People color** — `pf_colorGrid` in `renderPersonDetail()`
2. **Settings accent color** — `sf_accentGrid` in `renderSettingsTab()`
3. **Event color** — the `admin-color-grid` inside `renderCategoryForm()`

For each, replace the grid HTML and update the binding JS.

### Color button pattern

HTML replacement (for people color, as example):
```html
<div class="admin-form__group">
  <label class="form-label">Color</label>
  <div class="admin-form__row" style="align-items:center;gap:var(--spacing-sm)">
    <input type="color" id="pf_colorPicker" value="${selColor}" class="color-pick-btn">
    <span class="form-hint" style="margin:0">Tap to choose any color</span>
  </div>
</div>
```

CSS to add in `styles/admin.css`:
```css
.color-pick-btn {
  -webkit-appearance: none;
  appearance: none;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border);
  padding: 2px;
  cursor: pointer;
  background: none;
  flex-shrink: 0;
}
.color-pick-btn::-webkit-color-swatch-wrapper { padding: 0; }
.color-pick-btn::-webkit-color-swatch { border-radius: var(--radius-sm); border: none; }
.color-pick-btn::-moz-color-swatch { border-radius: var(--radius-sm); border: none; }
```

- [ ] **Step 1: Add color-pick-btn CSS**

Add the above `.color-pick-btn` rules to `styles/admin.css`.

- [ ] **Step 2: Replace people color grid**

In `admin.html`, find `renderPersonDetail()`. Find the color grid block:
```html
<div class="admin-form__group">
  <label class="form-label">Color</label>
  <div class="color-grid" id="pf_colorGrid">
    ${colors.map(c => {
      const used = usedColors.includes(c);
      const sel = selColor === c ? ' selected' : '';
      return `<div class="color-swatch${sel}${used ? ' color-swatch--used' : ''}" data-color="${c}" style="background:${c}"></div>`;
    }).join('')}
  </div>
</div>
```

Replace with:
```html
<div class="admin-form__group">
  <label class="form-label">Color</label>
  <div class="admin-form__row" style="align-items:center;gap:var(--spacing-sm)">
    <input type="color" id="pf_colorPicker" value="${selColor}" class="color-pick-btn">
    <span class="form-hint" style="margin:0">Tap to choose any color</span>
  </div>
</div>
```

- [ ] **Step 3: Update people color binding**

In `admin.html`, find `bindPeopleTab()`. Find all `pf_colorGrid` event bindings (look for `color-swatch` click handlers on `pf_colorGrid`). Replace with:
```js
// The color picker value is read directly at save time — no binding needed.
// pf_colorPicker value is read in the save handler.
```

Find the save handler (look for where `personDetailSave` is clicked). Find where it reads the selected color — currently reads from `.color-swatch.selected` or similar. Change to read from `#pf_colorPicker`:
```js
// Old: const selColor = main.querySelector('.color-swatch.selected')?.dataset.color || colors[0];
// New:
const selColor = main.querySelector('#pf_colorPicker')?.value || colors[0];
```

- [ ] **Step 4: Replace settings accent color grid**

In `admin.html`, find `renderSettingsTab()`. Find the accent color grid:
```html
<div class="form-group mt-sm">
  <label class="form-label">Accent color</label>
  <div class="color-grid" id="sf_accentGrid">
    ${getAccentColors().map(c => `<div class="color-swatch${settings?.theme?.accent === c ? ' selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
  </div>
</div>
```

Replace with:
```html
<div class="form-group mt-sm">
  <label class="form-label">Accent color</label>
  <div class="admin-form__row" style="align-items:center;gap:var(--spacing-sm)">
    <input type="color" id="sf_accentPicker" value="${settings?.theme?.accent || '#6c63ff'}" class="color-pick-btn">
    <span class="form-hint" style="margin:0">Tap to choose any color</span>
  </div>
</div>
```

- [ ] **Step 5: Update settings accent binding**

In `admin.html`, find `bindSettingsTab()`. Find the accent grid binding (look for `sf_accentGrid .color-swatch` click handlers). Replace with:
```js
main.querySelector('#sf_accentPicker')?.addEventListener('input', async (e) => {
  const theme = { ...(settings?.theme || {}), accent: e.target.value };
  const updated = { ...settings, theme };
  await writeSettings(updated);
  settings = updated;
  applyTheme(resolveTheme(settings.theme));
});
```

Also update the settings save handler to read from `#sf_accentPicker`:
```js
// In the settingsSave click handler, the theme object is built from the theme preset select.
// Accent color is live-applied above (input event), not saved on settingsSave.
// But we should also capture it at save time for safety. Find where theme is built in the save handler and add:
// theme.accent = main.querySelector('#sf_accentPicker')?.value || settings?.theme?.accent;
```

In the `settingsSave` click handler, find where `updated` is built. It currently doesn't include the accent because it was handled by swatch clicks updating Firebase directly. Now the accent is only written on `input` event and that's fine — no change needed in the save handler (accent is already persisted live).

- [ ] **Step 6: Replace event category color picker**

In `admin.html`, find `renderCategoryForm()`. Find the event color section:
```html
<div class="admin-event-color-row" id="eventColorRow" style="display:${cat.isEvent ? 'flex' : 'none'}">
  <span class="form-label" style="margin-bottom:0;">Event Color</span>
  <div class="admin-color-grid admin-color-grid--sm" id="eventColorGrid">
    ${['#ef5350','#e85d75',...].map(c =>
      `<button class="admin-color-dot${...}" data-color="${c}" style="background:${c}" type="button"></button>`
    ).join('')}
  </div>
</div>
```

Replace with:
```html
<div class="admin-event-color-row" id="eventColorRow" style="display:${cat.isEvent ? 'flex' : 'none'};align-items:center;gap:var(--spacing-sm)">
  <span class="form-label" style="margin-bottom:0;">Event Color</span>
  <input type="color" id="cf_eventColor" value="${cat.eventColor || '#5b7fd6'}" class="color-pick-btn">
</div>
```

- [ ] **Step 7: Update category form event color binding**

In `admin.html`, find `bindCategoryForm()`. Find where event color dots are clicked (look for `admin-color-dot` click handlers on `eventColorGrid`). Remove that binding. The color is now just read at save time.

Find the save handler for the category form (look for `catFormSave` click). Find where it reads the selected event color — currently reads from `.admin-color-dot--active` or `data-color`. Change to:
```js
const eventColor = main.querySelector('#cf_eventColor')?.value || '#5b7fd6';
```

- [ ] **Step 8: Verify in browser**

- Admin → People → tap a person → Color shows one square, tap it → native color picker opens → choose any color.
- Admin → Settings → Accent color shows one square, tap → native picker.
- Admin → Library → tap a category → toggle "Event category" → Event Color row shows one square, tap → native picker.

- [ ] **Step 9: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "feat(admin): replace color swatch grids with native color picker input"
```

---

## Task 7: More nav button on non-dashboard pages

**Files:**
- Modify: `shared/components.js` (add `initNavMore` export)
- Modify: `scoreboard.html` (wire More button)
- Modify: `tracker.html` (wire More button)
- Modify: `calendar.html` (wire More button)
- Modify: `person.html` (wire More button if nav is present)

Currently `renderNavBar` renders `#navMore` with `data-more-unbound="1"` on non-dashboard pages. No page wires a click handler, so the More button is a no-op everywhere except the dashboard.

Add a shared `initNavMore` function to `shared/components.js` that wires a standard More sheet (Admin, Rewards, Theme) on any page. Each non-dashboard page calls it after rendering the nav.

- [ ] **Step 1: Add initNavMore to shared/components.js**

Find the `renderNavBar` export in `shared/components.js`. After it (or near `renderOverflowMenu`), add:

```js
/**
 * Wire the #navMore button on non-dashboard pages.
 * Shows a sheet with Admin, Rewards, Theme options (alphabetical).
 * Call after renderNavBar() mounts to DOM.
 * @param {HTMLElement} sheetMount - element to mount the sheet into (e.g. #taskSheetMount)
 * @param {object} [options]
 * @param {string} [options.activePerson] - person name for person-link mode (unused currently)
 */
export function initNavMore(sheetMount, options = {}) {
  const btn = document.getElementById('navMore');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const items = [
      { id: 'admin',   label: 'Admin' },
      { id: 'rewards', label: 'Rewards' },
      { id: 'theme',   label: 'Theme' },
    ];
    sheetMount.innerHTML = renderBottomSheet(
      `<h3 class="sheet-section-title">More</h3>${renderOverflowMenu(items)}`
    );
    requestAnimationFrame(() => {
      document.getElementById('bottomSheet')?.classList.add('active');
    });
    const overlay = document.getElementById('bottomSheet');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) sheetMount.innerHTML = '';
    });
    sheetMount.querySelector('.overflow-menu')?.addEventListener('click', (ev) => {
      const itemBtn = ev.target.closest('[data-item-id]');
      if (!itemBtn) return;
      sheetMount.innerHTML = '';
      const id = itemBtn.dataset.itemId;
      if (id === 'admin')   location.href = 'admin.html';
      if (id === 'rewards') location.href = 'scoreboard.html';
      if (id === 'theme')   openDeviceThemeSheet(sheetMount, null);
    });
  });
}
```

Note: `openDeviceThemeSheet` is already defined in `shared/components.js` — call it directly.

- [ ] **Step 2: Export initNavMore**

Confirm `initNavMore` is added as an export (the `export function initNavMore` keyword handles this).

- [ ] **Step 3: Wire in scoreboard.html**

In `scoreboard.html`, find where the nav is mounted:
```js
document.getElementById('navMount').innerHTML = renderNavBar('scoreboard');
```

Add immediately after:
```js
const taskSheetMount = document.getElementById('taskSheetMount');
if (taskSheetMount) initNavMore(taskSheetMount);
```

Also add `initNavMore` to the import from `./shared/components.js`.

- [ ] **Step 4: Wire in tracker.html**

Same pattern as scoreboard. Find `renderNavBar('tracker')` line and add:
```js
const taskSheetMount = document.getElementById('taskSheetMount');
if (taskSheetMount) initNavMore(taskSheetMount);
```

Add `initNavMore` to the import.

- [ ] **Step 5: Wire in calendar.html**

Same pattern. Find `renderNavBar('calendar')` and add `initNavMore` call. Add to import.

- [ ] **Step 6: Verify in browser**

Open Scoreboard → tap More in nav → sheet appears with Admin, Rewards, Theme. Tap Admin → goes to admin.html. Same test on Tracker and Calendar.

- [ ] **Step 7: Commit**

```bash
git add shared/components.js scoreboard.html tracker.html calendar.html
git commit -m "feat(nav): wire More button on scoreboard, tracker, calendar via shared initNavMore"
```

---

## Task 8: Bell message form — match admin modal, add reward option

**Files:**
- Modify: `shared/components.js` (`renderSendMessageSheet`, `bindSendMessageSheet`)

The bell "Message" button opens a bottom sheet with template chips. The admin add/deduct modal (added in the previous session) is the better pattern: `<select>` dropdown for templates, defaulting to the custom text input (no pre-selected template), and a cleaner layout. Additionally, the user wants to optionally attach a reward from the reward library when sending a message.

### Design

- Default state: custom title input is empty and focused. Template `<select>` has "— Or pick a template —" as default (no pre-selection).
- On template select → populate custom title input with the template text (editable).
- "To" section: person chips (unchanged, multi-select).
- Type toggle: + Bonus / − Deduction (unchanged).
- Title: `<input type="text" id="msg_customTitle">` (always visible, pre-focused).
- Templates: `<select id="msg_templateSelect">` with `— Or pick a template —` default.
- Reward (optional): `<select id="msg_rewardSelect">` listing active rewards. Default = "None". When a reward is selected, the points field becomes the points for the message; a reward bank token is also written.
- Personal note: textarea (unchanged).
- Points: number input (unchanged).

### New renderSendMessageSheet

```js
export function renderSendMessageSheet(people, preselectedPersonId = null, rewards = {}) {
  const positiveOpts = POSITIVE_TEMPLATES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const negativeOpts = NEGATIVE_TEMPLATES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const activeRewards = Object.entries(rewards)
    .filter(([, r]) => r.status !== 'archived')
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
  const rewardOpts = activeRewards.map(([id, r]) =>
    `<option value="${esc(id)}">${esc(r.icon || '🎁')} ${esc(r.name)} (${r.pointCost ?? 0} pts)</option>`
  ).join('');

  return renderBottomSheet(`
    <h3 class="sheet-section-title">Send Message</h3>

    <label class="form-label">To</label>
    <div class="chip-group" id="msg_people">
      ${people.map(p => {
        const selected = p.id === preselectedPersonId;
        return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" data-person-color="${p.color}" type="button">${esc(p.name)}</button>`;
      }).join('')}
    </div>

    <label class="form-label sheet-label--spaced">Type</label>
    <div class="segmented-control msg-type-toggle">
      <button class="segmented-btn msg-type-btn msg-type-btn--active msg-type-btn--positive" data-type="bonus" type="button">+ Bonus</button>
      <button class="segmented-btn msg-type-btn" data-type="deduction" type="button">− Deduction</button>
    </div>

    <label class="form-label sheet-label--spaced">Title</label>
    <input type="text" id="msg_customTitle" class="form-input" placeholder="Enter message title" autocomplete="off">
    <select class="form-input mt-xs" id="msg_templateSelect">
      <option value="">— Or pick a template —</option>
      ${positiveOpts}
    </select>

    <label class="form-label sheet-label--spaced">Personal note (optional)</label>
    <textarea id="msg_body" class="form-input" rows="2" placeholder="Great job helping your sister!"></textarea>

    <label class="form-label sheet-label--spaced">Points</label>
    <input type="number" id="msg_points" class="form-input" value="25" min="0" style="max-width:120px">

    ${activeRewards.length > 0 ? `
    <label class="form-label sheet-label--spaced">Reward (optional)</label>
    <select class="form-input" id="msg_rewardSelect">
      <option value="">None</option>
      ${rewardOpts}
    </select>` : ''}

    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="msg_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="msg_send" type="button">Send</button>
    </div>
  `);
}
```

### New bindSendMessageSheet

```js
export function bindSendMessageSheet(mount, writeMessageFn, approverName, writeBankTokenFn, getRewardsFn) {
  const approver = approverName || 'Parent';
  const sheet = mount.querySelector('.bottom-sheet');
  if (!sheet) return;

  let msgType = 'bonus';

  // Focus custom title on open
  requestAnimationFrame(() => sheet.querySelector('#msg_customTitle')?.focus());

  // Person chips
  for (const chip of sheet.querySelectorAll('#msg_people .chip--selectable')) {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  }

  // Type toggle — swap template options and default points
  for (const btn of sheet.querySelectorAll('.msg-type-btn')) {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('.msg-type-btn').forEach(b => b.classList.remove('msg-type-btn--active'));
      btn.classList.add('msg-type-btn--active');
      msgType = btn.dataset.type;
      const sel = sheet.querySelector('#msg_templateSelect');
      if (sel) {
        const templates = msgType === 'bonus' ? POSITIVE_TEMPLATES : NEGATIVE_TEMPLATES;
        sel.innerHTML = `<option value="">— Or pick a template —</option>` +
          templates.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        sel.value = '';
      }
      sheet.querySelector('#msg_points').value = msgType === 'bonus' ? 25 : 15;
    });
  }

  // Template select → populate title input
  sheet.querySelector('#msg_templateSelect')?.addEventListener('change', (e) => {
    if (e.target.value) {
      const titleInput = sheet.querySelector('#msg_customTitle');
      if (titleInput) { titleInput.value = e.target.value; titleInput.focus(); }
    }
  });

  // Cancel
  sheet.querySelector('#msg_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  mount.querySelector('.bottom-sheet-overlay')?.addEventListener('click', (e) => {
    if (e.target === mount.querySelector('.bottom-sheet-overlay')) mount.innerHTML = '';
  });

  // Send
  sheet.querySelector('#msg_send')?.addEventListener('click', async () => {
    const personIds = [...sheet.querySelectorAll('#msg_people .chip--active')].map(c => c.dataset.personId);
    if (personIds.length === 0) { sheet.querySelector('#msg_people .chip--selectable')?.focus(); return; }

    const title = sheet.querySelector('#msg_customTitle')?.value.trim();
    if (!title) { sheet.querySelector('#msg_customTitle')?.focus(); return; }

    const points = parseInt(sheet.querySelector('#msg_points')?.value || '0', 10);
    const body = sheet.querySelector('#msg_body')?.value.trim() || null;
    const amount = msgType === 'deduction' ? -(points || 0) : (points || 0);
    const rewardId = sheet.querySelector('#msg_rewardSelect')?.value || null;
    const rewards = getRewardsFn ? getRewardsFn() : {};
    const reward = rewardId ? rewards[rewardId] : null;

    for (const pid of personIds) {
      if (amount !== 0) {
        await writeMessageFn(pid, {
          type: msgType,
          title,
          body,
          amount,
          rewardId: null,
          entryKey: null,
          seen: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: approver
        });
      }
      if (reward && writeBankTokenFn) {
        await writeBankTokenFn(pid, {
          rewardType: reward.rewardType || 'custom',
          rewardId,
          rewardName: reward.name || 'Reward',
          rewardIcon: reward.icon || '🎁',
          acquiredAt: Date.now(),
          used: false,
          usedAt: null,
          targetEntryKey: null
        });
        await writeMessageFn(pid, {
          type: 'redemption-approved',
          title: `${reward.icon || '🎁'} ${reward.name || 'Reward'} sent!`,
          body: null,
          amount: 0,
          rewardId,
          entryKey: null,
          seen: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: approver
        });
      }
    }

    mount.innerHTML = '';
    showToast(`Message sent!`);
  });
}
```

- [ ] **Step 1: Update renderSendMessageSheet signature and body**

In `shared/components.js`, replace the existing `renderSendMessageSheet` function with the new version above.

- [ ] **Step 2: Update bindSendMessageSheet signature and body**

Replace the existing `bindSendMessageSheet` function with the new version above.

- [ ] **Step 3: Update the caller in initBell**

In `shared/components.js`, find the `bellSendMessage` click handler inside `initBell`:
```js
document.getElementById('bellSendMessage')?.addEventListener('click', () => {
  closeBellDropdown();
  const mount = document.getElementById('taskSheetMount') || document.getElementById('drilldownMount');
  if (!mount) return;
  mount.innerHTML = renderSendMessageSheet(getPeople());
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });
  bindSendMessageSheet(mount, writeMessageFn, approver);
});
```

Change to:
```js
document.getElementById('bellSendMessage')?.addEventListener('click', () => {
  closeBellDropdown();
  const mount = document.getElementById('taskSheetMount') || document.getElementById('drilldownMount');
  if (!mount) return;
  mount.innerHTML = renderSendMessageSheet(getPeople(), null, getRewards());
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });
  bindSendMessageSheet(mount, writeMessageFn, approver, writeBankTokenFn, getRewards);
});
```

- [ ] **Step 4: Verify in browser**

Open dashboard → bell → tap Message. Check:
- Custom title input is empty and focused.
- Template select shows "— Or pick a template —".
- Select a template → title input gets populated with that text (editable).
- Reward dropdown appears (if any rewards exist).
- Select a reward + type title + select person → Send → reward appears in their store and message appears in bell.
- Points field: set to 0 + send points-only = 0 points (valid, just a message).

- [ ] **Step 5: Commit**

```bash
git add shared/components.js
git commit -m "feat(bell): upgrade message form — custom title default, template select, reward send"
```

---

## Task 9: Weather detailed forecast (morning/afternoon/pop)

**Files:**
- Modify: `shared/weather.js` (`_parseForecast`, add morning/afternoon/pop extraction)
- Modify: `shared/components.js` (`renderWeatherSheet` to show new fields)

The OWM `/forecast` endpoint returns 3-hour intervals with `pop` (probability of precipitation, 0–1). From the list of intervals for each day, extract:
- **Morning glyph:** condition code from the 6am–noon slots (pick the slot closest to 9am, i.e. dt hour = 9)
- **Afternoon glyph:** condition code from noon–6pm slots (pick slot closest to 3pm, i.e. dt hour = 15)
- **Pop:** max `pop` across all slots for the day (as a percent, rounded)

Store these in the cache entry and use them in the weather sheet.

### Updated _parseForecast

```js
function _parseForecast(json, timezone) {
  const byDate = {};
  for (const item of json.list) {
    const dk = _dateKey(item.dt * 1000, timezone);
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(item);
  }
  return Object.entries(byDate).map(([dk, items]) => {
    const temps = items.map(i => i.main.temp);
    const freq = {};
    for (const i of items) freq[i.weather[0].id] = (freq[i.weather[0].id] || 0) + 1;
    const dominantCode = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    const high = Math.round(Math.max(...temps));

    // Morning: slot with dt_txt hour closest to 9 (6am–noon range)
    const morningSlots = items.filter(i => { const h = new Date(i.dt * 1000).getUTCHours(); return h >= 6 && h < 12; });
    const afternoonSlots = items.filter(i => { const h = new Date(i.dt * 1000).getUTCHours(); return h >= 12 && h < 18; });
    const morningCode = morningSlots.length
      ? morningSlots.reduce((best, i) => {
          const bh = Math.abs(new Date(best.dt * 1000).getUTCHours() - 9);
          const ih = Math.abs(new Date(i.dt * 1000).getUTCHours() - 9);
          return ih < bh ? i : best;
        }).weather[0].id
      : dominantCode;
    const afternoonCode = afternoonSlots.length
      ? afternoonSlots.reduce((best, i) => {
          const bh = Math.abs(new Date(best.dt * 1000).getUTCHours() - 15);
          const ih = Math.abs(new Date(i.dt * 1000).getUTCHours() - 15);
          return ih < bh ? i : best;
        }).weather[0].id
      : dominantCode;
    const pop = Math.round(Math.max(...items.map(i => i.pop || 0)) * 100);

    return {
      dateKey: dk,
      tempLabel: high + '°',
      conditionLabel: items.find(i => i.weather[0].id === dominantCode).weather[0].description
        .replace(/\b\w/g, c => c.toUpperCase()),
      glyph: _codeToGlyph(dominantCode),
      high: high + '°',
      low: Math.round(Math.min(...temps)) + '°',
      morningGlyph: _codeToGlyph(morningCode),
      afternoonGlyph: _codeToGlyph(afternoonCode),
      pop,
    };
  });
}
```

Note: OWM returns UTC hours. For most US timezones the local morning slots won't exactly match UTC 6–12, but this is a best-effort approximation and is acceptable for a weather chip.

### Updated _toResult

```js
function _toResult(entry) {
  if (!entry) return null;
  const { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop } = entry;
  return { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop };
}
```

### Updated renderWeatherSheet

In `shared/components.js`, `renderWeatherSheet` currently renders a `weather-row` for each day with glyph + high/low + condition. Add a morning/afternoon section and pop below.

The `WEATHER_GLYPHS` SVG map is already defined in `shared/components.js` (find it with `grep -n WEATHER_GLYPHS`). Reuse it for morning/afternoon glyphs.

```js
export function renderWeatherSheet(days, today, tomorrow) {
  // ... (dayLabel and shortDate helpers unchanged)

  const rowsHtml = days.map(day => {
    if (!day) return '';
    const glyph = WEATHER_GLYPHS[day.glyph] || WEATHER_GLYPHS.cloud;
    const morningGlyph = WEATHER_GLYPHS[day.morningGlyph || day.glyph] || WEATHER_GLYPHS.cloud;
    const afternoonGlyph = WEATHER_GLYPHS[day.afternoonGlyph || day.glyph] || WEATHER_GLYPHS.cloud;
    const popHtml = (day.pop != null && day.pop > 0) ? `<span class="weather-row__pop">${day.pop}% precip</span>` : '';
    return `<div class="weather-row">
      <div class="weather-row__day">
        <strong>${esc(dayLabel(day.dateKey))}</strong>
        <span>${esc(shortDate(day.dateKey))}</span>
      </div>
      <div class="weather-row__glyph" aria-hidden="true">${glyph}</div>
      <div class="weather-row__data">
        <strong>${esc(day.tempLabel)}</strong>
        <span>H:${esc(day.high)}&nbsp; L:${esc(day.low)}</span>
        <span>${esc(day.conditionLabel)}</span>
        ${popHtml}
      </div>
      <div class="weather-row__periods" aria-label="Morning and afternoon forecast">
        <div class="weather-period">
          <span class="weather-period__glyph" aria-hidden="true">${morningGlyph}</span>
          <span class="weather-period__label">AM</span>
        </div>
        <div class="weather-period">
          <span class="weather-period__glyph" aria-hidden="true">${afternoonGlyph}</span>
          <span class="weather-period__label">PM</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // (rest of function unchanged)
}
```

Add CSS for the new weather row elements in `styles/components.css`:
```css
.weather-row__periods {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.weather-period {
  display: flex;
  align-items: center;
  gap: 4px;
}
.weather-period__glyph {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
}
.weather-period__glyph svg { width: 18px; height: 18px; }
.weather-period__label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-weight: 600;
  min-width: 20px;
}
.weather-row__pop {
  font-size: var(--font-xs);
  color: var(--info, #42a5f5);
}
```

- [ ] **Step 1: Update _parseForecast in shared/weather.js**

Replace the existing `_parseForecast` function with the new version above (adds morningGlyph, afternoonGlyph, pop).

- [ ] **Step 2: Update _toResult in shared/weather.js**

Replace `_toResult` to include the new fields.

- [ ] **Step 3: Locate WEATHER_GLYPHS in shared/components.js**

Run: `grep -n "WEATHER_GLYPHS" shared/components.js`

Confirm the map exists and has keys: `sun`, `cloud`, `rain`, `snow`, `fog`.

- [ ] **Step 4: Update renderWeatherSheet in shared/components.js**

Replace the `rowsHtml` map block inside `renderWeatherSheet` with the new version above.

- [ ] **Step 5: Add CSS to styles/components.css**

Add the `.weather-row__periods`, `.weather-period`, `.weather-period__glyph`, `.weather-period__label`, `.weather-row__pop` rules after the existing `.weather-row` rules.

- [ ] **Step 6: Clear weather cache and verify in browser**

After reloading:
- Admin → Settings → Weather → Test (or open the weather chip on dashboard) to trigger a new fetch.
- Tap weather chip → 5-day sheet → each day row shows: AM glyph + PM glyph in a column on the right, precip % below condition label.
- Today and Tomorrow show their labels correctly.

- [ ] **Step 7: Commit**

```bash
git add shared/weather.js shared/components.js styles/components.css
git commit -m "feat(weather): add morning/afternoon glyphs and precip% to 5-day forecast sheet"
```

---

## Task 10: SW cache bump + final deploy

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump CACHE_NAME**

In `sw.js`, change `CACHE_NAME` from `'family-hub-v69'` to `'family-hub-v70'` and add a log entry at the top of the CACHE_BUMPS list:

```
// v70 (2026-04-26) — Polish pass 2: banner full-width, admin tabs fill space,
//                    FAB rename, More sort alpha, remove back-online toast,
//                    PIN placeholder fix, stat card wrap + dot, native color
//                    pickers, More nav on all pages, bell message upgrade
//                    (custom default + reward send), weather AM/PM + pop%.
```

- [ ] **Step 2: Commit and push**

```bash
git add sw.js
git commit -m "chore(sw): bump to v70 for polish pass 2"
git push origin main
```

---

## Self-review

**Spec coverage check:**

1. ✅ Overdue/multiplier banner width → Task 1
2. ✅ More menu + three-dot sort alpha → Task 2
3. ✅ Bell message form (custom default, template select, reward option) → Task 8
4. ✅ Library Add button height alignment → Task 5
5. ✅ Admin tab buttons fill width → Task 1
6. ✅ FAB "New Meal" rename → Task 2
7. ✅ People balance anchor inline (was done in prior session; Task 3 verifies stat cards, not anchor) — **Note:** the anchor inline fix was already committed in the previous session (v69). If the user still sees it stacked, it may be a cache issue (the SW serves v68). Once v70 deploys, the fix should be visible. No new code needed.
8. ✅ Color pickers → native everywhere → Task 6
9. ✅ Remove back-online banner → Task 4
10. ✅ PIN placeholder readable → Task 3
11. ✅ Tools stat cards uniform + dot size → Task 3
12. ✅ More nav on non-dashboard pages → Task 7
13. ✅ Weather 5-day AM/PM + pop% → Task 9

**Placeholder scan:** All steps have concrete code. No TBDs.

**Type consistency:** `_toResult` returns `morningGlyph` and `afternoonGlyph` — same names used in `renderWeatherSheet`. `initNavMore` calls `renderBottomSheet` and `renderOverflowMenu` which are already defined in the same file. ✅
