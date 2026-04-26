# Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse admin.html from 11 inconsistent tabs into 4 coherent sections (Library · People · Settings · Tools) with a shared list-row pattern, Person detail pages, PIN bypass for admin-flagged users, and full removal of dead features (Templates, Debug, Theme tab).

**Architecture:** Everything lives in `admin.html` (one file, one inline `<script>`). The existing render/bind pattern is preserved — `render()` builds HTML, `bindTabContent()` wires events. The restructure replaces the `TABS` array (11 → 4 entries), adds a `activeLibrarySection` sub-nav state, and replaces every per-tab list with a shared `renderAdminRow()` helper. Person detail becomes a full-view switcher within admin.html (no new file). Theme controls migrate from their own tab into Settings. Debug, Templates, and the Theme tab are deleted entirely.

**Tech Stack:** Vanilla JS ES modules, Firebase RTDB compat SDK (`firebase.` global), existing helpers in `shared/firebase.js`, `shared/utils.js`, `shared/scoring.js`, `shared/components.js`.

**Execute as a feature branch** — admin is PIN-gated so partial states won't affect users, but don't deploy until Task 15 (SW bump) is complete.

---

## Files

| File | Action | Responsibility |
|---|---|---|
| `admin.html` | Modify | All UI + JS — single file, all tasks touch this |
| `styles/admin.css` | Modify | New `.admin-icon-tile`, `.admin-list-item` updates, Library sub-nav pills, Person detail sections |
| `sw.js` | Modify | Bump cache version (Task 15) |

---

## Task 1: Delete removed features

Remove Templates, Debug tab, and Theme tab entirely. This is pure deletion — no new code. Do it first to reduce noise in all subsequent tasks.

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Delete the TASK_TEMPLATES constant and comment (lines 106–169)**

Remove the entire block:
```
// ── Task template presets ──
const TASK_TEMPLATES = { ... };
```

- [ ] **Step 2: Delete `showingTemplates` state variable and `renderTemplatePanel` function**

Remove:
- `let showingTemplates = false;` (line ~362)
- The entire `function renderTemplatePanel() { ... }` block (lines ~367–386)

- [ ] **Step 3: Remove Templates button and conditional from `renderTasksTab`**

Find the section in `renderTasksTab` that renders the section header (around line 462–490). Remove:
- The `<button id="templateBtn">Templates</button>` button from the header row
- The `if (showingTemplates) { html += renderTemplatePanel(); }` conditional block

- [ ] **Step 4: Remove template event handlers from `bindTasksTab`**

Find in `bindTasksTab`:
```js
showingTemplates = false;
...
main.querySelector('#templateBtn')?.addEventListener('click', () => {
  showingTemplates = !showingTemplates;
  ...
```
Delete the `showingTemplates = false` resets and the `#templateBtn` listener block and the template import logic block (the one with `const pack = TASK_TEMPLATES[key]`).

- [ ] **Step 5: Delete `renderDebugTab` and `bindDebugTab`**

Remove:
- The entire `// ══ Debug Tab ══` section heading and `function renderDebugTab() { ... }` block (lines ~1515–1624)
- The entire `function bindDebugTab() { ... }` block (lines ~4209 to end of file, before closing `</script>`)
- The `debugActive` variable and the `showDebug: debugActive` reference in the header render (lines ~198–204)

- [ ] **Step 6: Delete `renderThemeTab` and `bindThemeTab`**

Remove:
- The entire `// ══ Theme Tab ══` section and `function renderThemeTab() { ... }` block (lines ~1310–1352)
- The entire `function bindThemeTab() { ... }` block (lines ~3917–3946)

- [ ] **Step 7: Verify file compiles — open admin.html in browser, enter PIN, confirm tasks tab loads without JS errors**

- [ ] **Step 8: Commit**

```bash
git add admin.html
git commit -m "refactor(admin): delete Templates, Debug tab, Theme tab — code removal"
```

---

## Task 2: Restructure tab navigation (4 tabs + Library sub-nav)

**Files:**
- Modify: `admin.html`
- Modify: `styles/admin.css`

- [ ] **Step 1: Replace the TABS array**

Find `const TABS = [` (line ~267) and replace the entire array with:

```js
const TABS = [
  { id: 'library',  label: 'Library'  },
  { id: 'people',   label: 'People'   },
  { id: 'settings', label: 'Settings' },
  { id: 'tools',    label: 'Tools'    },
];

const LIBRARY_SECTIONS = [
  { id: 'tasks',      label: 'Tasks'      },
  { id: 'events',     label: 'Events'     },
  { id: 'meals',      label: 'Meals'      },
  { id: 'categories', label: 'Categories' },
  { id: 'rewards',    label: 'Rewards'    },
  { id: 'badges',     label: 'Badges'     },
];
```

- [ ] **Step 2: Add `activeLibrarySection` state**

Below `let activeTab = 'tasks';`, add:
```js
let activeTab = 'library';
let activeLibrarySection = 'tasks';
```

- [ ] **Step 3: Rewrite `render()` to use the new TABS and add Library sub-nav**

Replace the entire `function render() { ... }` body (lines ~299–330) with:

```js
function render() {
  // Top-level tab bar
  let html = `<div class="admin-tabs" role="tablist" aria-label="Admin sections">`;
  for (const tab of TABS) {
    const active = tab.id === activeTab ? ' admin-tab--active' : '';
    html += `<button class="admin-tab${active}" data-tab="${tab.id}" type="button" role="tab" aria-selected="${tab.id === activeTab}">${esc(tab.label)}</button>`;
  }
  html += `</div>`;

  // Library sub-nav
  if (activeTab === 'library') {
    html += `<div class="admin-subnav" role="tablist" aria-label="Library sections">`;
    for (const sec of LIBRARY_SECTIONS) {
      const active = sec.id === activeLibrarySection ? ' admin-subnav__pill--active' : '';
      html += `<button class="admin-subnav__pill${active}" data-section="${sec.id}" type="button">${esc(sec.label)}</button>`;
    }
    html += `</div>`;
  }

  html += `<div class="admin-content" role="tabpanel">`;

  switch (activeTab) {
    case 'library':
      switch (activeLibrarySection) {
        case 'tasks':      html += renderTasksTab();      break;
        case 'events':     html += renderEventsTab();     break;
        case 'meals':      html += renderMealsTab();      break;
        case 'categories': html += renderCategoriesTab(); break;
        case 'rewards':    html += renderRewardsTab();    break;
        case 'badges':     html += renderAchievementsTab(); break;
      }
      break;
    case 'people':   html += renderPeopleTab();   break;
    case 'settings': html += renderSettingsTab(); break;
    case 'tools':    html += renderToolsTab();    break;
  }

  html += `</div>`;
  main.innerHTML = html;
  applyDataColors(main);
  bindTabEvents();
  bindTabContent();
}
```

- [ ] **Step 4: Rewrite `bindTabEvents()` to handle both top-level tabs and Library sub-nav**

Replace the entire `function bindTabEvents() { ... }` block with:

```js
function bindTabEvents() {
  for (const tab of main.querySelectorAll('.admin-tab')) {
    tab.addEventListener('click', async () => {
      activeTab = tab.dataset.tab;
      if (activeTab === 'library' && activeLibrarySection === 'badges') {
        allAchievements = (await readAllAchievements()) || {};
        achievementDefsObj = (await readAchievementDefs()) || {};
      }
      render();
    });
  }
  for (const pill of main.querySelectorAll('.admin-subnav__pill')) {
    pill.addEventListener('click', async () => {
      activeLibrarySection = pill.dataset.section;
      selectMode = false;
      selectedTaskIds.clear();
      if (activeLibrarySection === 'badges') {
        allAchievements = (await readAllAchievements()) || {};
        achievementDefsObj = (await readAchievementDefs()) || {};
      }
      if (activeLibrarySection === 'rewards') {
        allAchievements = (await readAllAchievements()) || {};
        allMessagesObj = (await readAllMessages()) || {};
        allBankData = {};
        for (const pid of Object.keys(peopleObj)) {
          allBankData[pid] = (await readBank(pid)) || {};
        }
      }
      render();
    });
  }
}
```

- [ ] **Step 5: Update `bindTabContent()` to match new structure**

Replace the entire `function bindTabContent() { ... }` block with:

```js
function bindTabContent() {
  switch (activeTab) {
    case 'library':
      switch (activeLibrarySection) {
        case 'tasks':      bindTasksTab();      break;
        case 'events':     bindEventsTab();     break;
        case 'meals':      bindMealsTab();      break;
        case 'categories': bindCategoriesTab(); break;
        case 'rewards':    bindRewardsTab();    break;
        case 'badges':     bindAchievementsTab(); break;
      }
      break;
    case 'people':   bindPeopleTab();   break;
    case 'settings': bindSettingsTab(); break;
    case 'tools':    bindToolsTab();    break;
  }
}
```

- [ ] **Step 6: Add a stub `renderToolsTab` and `bindToolsTab` so the switch doesn't error**

Add below the existing `renderDataTab` function:

```js
function renderToolsTab() {
  return renderScheduleTab() + renderDataTab();
}

function bindToolsTab() {
  bindScheduleTab();
  bindDataTab();
}
```

- [ ] **Step 7: Add Library sub-nav CSS to `styles/admin.css`**

Append to `styles/admin.css`:

```css
/* ── Library sub-nav ── */
.admin-subnav {
  display: flex;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.admin-subnav::-webkit-scrollbar { display: none; }

.admin-subnav__pill {
  flex-shrink: 0;
  padding: 5px var(--spacing-sm);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.admin-subnav__pill--active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
```

- [ ] **Step 8: Verify — open admin.html, enter PIN, confirm 4 tabs render, Library sub-nav shows 6 pills, each section renders its existing content without errors**

- [ ] **Step 9: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "refactor(admin): restructure to 4 tabs — Library/People/Settings/Tools + Library sub-nav"
```

---

## Task 3: Add shared `renderAdminRow` helper + icon tile CSS

This is the foundation for all Library section reworks in Tasks 5–10.

**Files:**
- Modify: `admin.html`
- Modify: `styles/admin.css`

- [ ] **Step 1: Add `renderAdminRow` helper function**

Find the `// ── Helpers ──` block (around line 285). Add below `catsArray()`:

```js
/**
 * Shared list row for all Library sections.
 * icon: HTML string (SVG, emoji in a span, or color swatch div)
 * primary: escaped text string
 * secondary: escaped text string or ''
 * dataAttrs: string of additional data-* attributes for the row, e.g. 'data-task-id="abc"'
 */
function renderAdminRow({ icon, primary, secondary = '', dataAttrs = '' }) {
  return `<div class="admin-list-item admin-list-item--clickable" ${dataAttrs}>
    <div class="admin-icon-tile">${icon}</div>
    <div class="admin-list-item__body">
      <span class="admin-list-item__name">${primary}</span>
      ${secondary ? `<span class="admin-list-item__meta">${secondary}</span>` : ''}
    </div>
    <svg class="admin-list-item__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
  </div>`;
}

/**
 * Color swatch for use as the icon in renderAdminRow.
 * color: CSS color string
 */
function renderColorSwatch(color) {
  return `<div class="admin-icon-tile__swatch" style="background:${color}"></div>`;
}

/**
 * Emoji tile for use as the icon in renderAdminRow.
 */
function renderEmojiTile(emoji) {
  return `<span class="admin-icon-tile__emoji" aria-hidden="true">${emoji}</span>`;
}
```

- [ ] **Step 2: Add icon tile CSS to `styles/admin.css`**

Append:

```css
/* ── Admin icon tile (shared list row) ── */
.admin-list-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: 56px;
  border-bottom: 1px solid var(--color-border-subtle);
}
.admin-list-item--clickable {
  cursor: pointer;
}
.admin-list-item--clickable:active {
  background: var(--color-surface-hover);
}

.admin-icon-tile {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.admin-icon-tile__swatch {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
}

.admin-icon-tile__emoji {
  font-size: 20px;
  line-height: 1;
}

.admin-list-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-list-item__name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-list-item__meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-list-item__chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.5;
}

/* Add button above list */
.admin-list-add {
  display: flex;
  justify-content: flex-end;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border-subtle);
}

/* Empty state inside admin sections */
.admin-empty {
  padding: var(--spacing-2xl) var(--spacing-md);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 3: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "feat(admin): add renderAdminRow helper + shared icon tile CSS"
```

---

## Task 4: PIN bypass for `isAdmin` users

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add isAdmin bypass check immediately after the existing `pinSessionValid` check**

Find this block (around line 222):

```js
const pinTs = parseInt(sessionStorage.getItem(PIN_SESSION_KEY) || '0', 10);
const pinSessionValid = Date.now() - pinTs < PIN_SESSION_TTL;
if (pinSessionValid) {
  // Skip PIN gate — render() called after main is defined below
  document.getElementById('mainContent').style.display = '';
} else {
  document.getElementById('pinGate').style.display = '';
```

Replace with:

```js
const pinTs = parseInt(sessionStorage.getItem(PIN_SESSION_KEY) || '0', 10);
const pinSessionValid = Date.now() - pinTs < PIN_SESSION_TTL;

// isAdmin bypass: if person.html set dr-person-home and that person has isAdmin===true, skip PIN
const personHomeName = sessionStorage.getItem('dr-person-home');
const personHomeEntry = personHomeName
  ? Object.values(peopleObj).find(p => p.name === personHomeName)
  : null;
const isAdminBypass = !!personHomeEntry?.isAdmin;

if (pinSessionValid || isAdminBypass) {
  if (isAdminBypass && !pinSessionValid) {
    sessionStorage.setItem(PIN_SESSION_KEY, String(Date.now()));
  }
  document.getElementById('mainContent').style.display = '';
} else {
  document.getElementById('pinGate').style.display = '';
```

- [ ] **Step 2: Verify bypass works — in browser console, run `sessionStorage.setItem('dr-person-home', 'Jordin')`, reload admin.html. If Jordin has `isAdmin: true` in Firebase, PIN gate should be skipped. Without the flag (or a matching person), PIN gate should show.**

(To test without modifying Firebase first, temporarily hardcode `isAdmin: true` in the Firebase test record, then remove after confirming.)

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat(admin): PIN bypass for isAdmin-flagged people via dr-person-home sessionStorage"
```

---

## Task 5: Library — Tasks section (shared row)

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Replace the tasks list rendering inside `renderTasksTab`**

Find the section that builds individual task rows (around line 495–560, the part that loops `filtered` and builds `admin-list-item` divs). Replace the entire task list loop with:

```js
html += `<div class="admin-list-add">
  <button class="btn btn--primary btn--sm" id="addTaskBtn" type="button">+ Add Task</button>
</div>`;

if (filtered.length === 0) {
  html += `<div class="admin-empty">No tasks match the current filters.</div>`;
} else {
  html += `<div class="admin-list" id="taskList">`;
  for (const [id, t] of filtered) {
    const cat = catsObj[t.category] || {};
    const catColor = cat.color || 'var(--color-surface-raised)';
    const catIcon = cat.icon || '📋';
    const icon = renderColorSwatch(catColor);
    const ownerNames = (t.owners || []).map(oid => peopleObj[oid]?.name || '?').join(', ');
    const rotLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'One-time' }[t.rotation] || t.rotation;
    const secondary = `${rotLabel}${ownerNames ? ' · ' + ownerNames : ''}`;
    html += renderAdminRow({
      icon,
      primary: esc(t.name),
      secondary: esc(secondary),
      dataAttrs: `data-task-id="${id}"`,
    });
  }
  html += `</div>`;
}
```

- [ ] **Step 2: Update `bindTasksTab` row click handler**

Find where the existing task rows are clicked (look for `admin-list-item--clickable` click delegation or `admin-edit-task` buttons in `bindTasksTab`). Replace with a delegated click on `.admin-list`:

```js
main.querySelector('#taskList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-task-id]');
  if (!row) return;
  editingTaskId = row.dataset.taskId;
  render();
});
```

- [ ] **Step 3: Wire `#addTaskBtn`**

In `bindTasksTab`, find the existing `#addTaskBtn` listener. Confirm it sets `editingTaskId = 'new'` and calls `render()`. If it doesn't exist yet, add:

```js
main.querySelector('#addTaskBtn')?.addEventListener('click', () => {
  editingTaskId = 'new';
  render();
});
```

- [ ] **Step 4: Verify — Library → Tasks shows the new row layout. Tapping a row opens the task form. + Add Task opens a blank form.**

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Library Tasks section — shared row pattern"
```

---

## Task 6: Library — Events section (shared row)

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Replace event list rendering in `renderEventsTab`**

Find the list loop in `renderEventsTab` (around lines 582–635). Replace the section that renders event rows with:

```js
html += `<div class="admin-list-add">
  <button class="btn btn--primary btn--sm" id="addEventBtn" type="button">+ Add Event</button>
</div>`;

const evEntries = Object.entries(eventsObj || {})
  .sort((a, b) => (a[1].date || '').localeCompare(b[1].date || ''));

if (evEntries.length === 0) {
  html += `<div class="admin-empty">No events yet. Tap + Add Event to create one.</div>`;
} else {
  html += `<div class="admin-list" id="eventList">`;
  for (const [id, ev] of evEntries) {
    const cat = catsObj[ev.category] || {};
    const eventColor = cat.eventColor || cat.color || 'var(--color-primary)';
    const icon = renderColorSwatch(eventColor);
    const dateStr = ev.date ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const timeStr = ev.eventTime || (ev.allDay ? 'All day' : '');
    const secondary = [dateStr, timeStr].filter(Boolean).join(' · ');
    html += renderAdminRow({
      icon,
      primary: esc(ev.name || 'Untitled'),
      secondary: esc(secondary),
      dataAttrs: `data-event-id="${id}"`,
    });
  }
  html += `</div>`;
}
```

- [ ] **Step 2: Update `bindEventsTab` row click handler**

Replace the existing per-row edit button wiring with delegated click on `#eventList`:

```js
main.querySelector('#eventList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-event-id]');
  if (!row) return;
  editingEventId = row.dataset.eventId;
  render();
});

main.querySelector('#addEventBtn')?.addEventListener('click', () => {
  editingEventId = 'new';
  render();
});
```

- [ ] **Step 3: Verify — Library → Events shows shared row layout, tapping opens existing event form.**

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Library Events section — shared row pattern"
```

---

## Task 7: Library — Meals section (shared row)

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Replace meal list rendering in `renderMealsTab`**

Find the meal list loop in `renderMealsTab` (around lines 711–930). Replace the section that renders individual meal library rows with:

```js
html += `<div class="admin-list-add">
  <button class="btn btn--primary btn--sm" id="addMealBtn" type="button">+ Add Meal</button>
</div>`;

const mealEntries = Object.entries(mealLibrary || {})
  .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

if (mealEntries.length === 0) {
  html += `<div class="admin-empty">No meals in the library yet. Tap + Add Meal to create one.</div>`;
} else {
  html += `<div class="admin-list" id="mealList">`;
  for (const [id, meal] of mealEntries) {
    const emoji = meal.emoji || '🍽';
    const icon = renderEmojiTile(emoji);
    const tags = (meal.tags || []).slice(0, 2).join(', ');
    const extraTags = (meal.tags || []).length > 2 ? ` +${meal.tags.length - 2}` : '';
    const secondary = tags ? esc(tags + extraTags) : '';
    html += renderAdminRow({
      icon,
      primary: esc(meal.name || 'Untitled'),
      secondary,
      dataAttrs: `data-meal-id="${id}"`,
    });
  }
  html += `</div>`;
}
```

- [ ] **Step 2: Update `bindMealsTab` row click handler**

Replace the existing per-row edit button wiring with:

```js
main.querySelector('#mealList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-meal-id]');
  if (!row) return;
  editingMealId = row.dataset.mealId;
  render();
});

main.querySelector('#addMealBtn')?.addEventListener('click', () => {
  editingMealId = 'new';
  render();
});
```

- [ ] **Step 3: Verify — Library → Meals shows shared row layout. Tapping opens existing meal editor (full form with ingredients, URL, notes, tags — no fields removed).**

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Library Meals section — shared row pattern"
```

---

## Task 8: Library — Categories section (shared row)

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Replace category list rendering in `renderCategoriesTab`**

Find the category list loop in `renderCategoriesTab` (around lines 1056–1091). Replace the part that renders category rows with:

```js
html += `<div class="admin-list-add">
  <button class="btn btn--primary btn--sm" id="addCatBtn" type="button">+ Add Category</button>
</div>`;

if (ca.length === 0) {
  html += `<div class="admin-empty">No categories yet. Tap + Add Category to create one.</div>`;
} else {
  html += `<div class="admin-list" id="catList">`;
  for (const c of ca) {
    const taskCount = Object.values(tasksObj).filter(t => t.category === c.key).length;
    const icon = `<span class="admin-icon-tile__emoji" aria-hidden="true">${c.icon || '📁'}</span>`;
    const secondary = `${taskCount} task${taskCount !== 1 ? 's' : ''}${c.weightPercent ? ' · ' + c.weightPercent + '%' : ''}`;
    html += renderAdminRow({
      icon,
      primary: esc(c.label || c.key),
      secondary: esc(secondary),
      dataAttrs: `data-cat-key="${esc(c.key)}"`,
    });
  }
  html += `</div>`;
}
```

- [ ] **Step 2: Update `bindCategoriesTab` row click handler**

Replace the existing per-row edit button wiring with:

```js
main.querySelector('#catList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-cat-key]');
  if (!row) return;
  editingCatKey = row.dataset.catKey;
  render();
});

main.querySelector('#addCatBtn')?.addEventListener('click', () => {
  editingCatKey = 'new';
  render();
});
```

- [ ] **Step 3: Verify — Library → Categories shows shared row layout with task count. Tapping opens existing category form.**

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Library Categories section — shared row pattern"
```

---

## Task 9: Library — Rewards section (shared row, remove bank management)

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Replace reward list in `renderRewardsTab`**

Find the reward list loop in `renderRewardsTab` (around lines 1644–1716). Replace the section that renders reward rows with:

```js
html += `<div class="admin-list-add">
  <button class="btn btn--primary btn--sm" id="addRewardBtn" type="button">+ Add Reward</button>
</div>`;

const activeRewards = Object.entries(rewardsObj || {}).filter(([, r]) => r.status !== 'archived');
const archivedRewards = Object.entries(rewardsObj || {}).filter(([, r]) => r.status === 'archived');

if (activeRewards.length === 0) {
  html += `<div class="admin-empty">No rewards defined yet. Tap + Add Reward to create one.</div>`;
} else {
  html += `<div class="admin-list" id="rewardList">`;
  for (const [id, r] of activeRewards) {
    const icon = renderEmojiTile(r.icon || '🎁');
    const secondary = `${r.pointCost ?? 0} pts · ${r.rewardType || 'custom'}`;
    html += renderAdminRow({
      icon,
      primary: esc(r.name || 'Untitled'),
      secondary: esc(secondary),
      dataAttrs: `data-reward-id="${id}"`,
    });
  }
  html += `</div>`;
}

// Redemption history (collapsed)
const allRedemptions = Object.values(allMessagesObj).flatMap(msgs =>
  Object.values(msgs).filter(m => m.type === 'redemption-approved')
);
html += `<details class="admin-details" style="margin-top:var(--spacing-md)">
  <summary class="admin-details__summary">Redemption History (${allRedemptions.length})</summary>
  <div class="admin-list">`;
for (const r of allRedemptions.slice(-30).reverse()) {
  const person = Object.values(peopleObj).find(p => Object.keys(allMessagesObj).some(pid => peopleObj[pid] === p)) || {};
  html += `<div class="admin-list-item">
    <div class="admin-list-item__body">
      <span class="admin-list-item__name">${esc(r.rewardName || 'Reward')}</span>
      <span class="admin-list-item__meta">${esc(r.title || '')} · ${r.amount ? r.amount + ' pts' : ''}</span>
    </div>
  </div>`;
}
html += `</div></details>`;
```

- [ ] **Step 2: Remove the Bank Management section from `renderRewardsTab`**

Find the `// ── Bank Management ──` block (around lines 1710–1750) and delete it entirely. The bank management moves to Person detail (Task 11) and remains in the Bell dropdown.

- [ ] **Step 3: Update `bindRewardsTab` row click handler**

Replace the existing per-row edit button wiring with:

```js
main.querySelector('#rewardList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-reward-id]');
  if (!row) return;
  editingRewardId = row.dataset.rewardId;
  render();
});

main.querySelector('#addRewardBtn')?.addEventListener('click', () => {
  editingRewardId = 'new';
  render();
});
```

Remove any bank-related event listeners that were in `bindRewardsTab` (look for `#bankAdd_`, `#bankSend` etc).

- [ ] **Step 4: Verify — Library → Rewards shows shared rows for active rewards, collapsed redemption history. No bank management UI present.**

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Library Rewards section — shared row, remove bank management"
```

---

## Task 10: Library — Badges section (move Achievements into Library sub-nav)

**Files:**
- Modify: `admin.html`

The existing `renderAchievementsTab` and `bindAchievementsTab` functions are already wired into the Library sub-nav switch in Task 2. This task adds the shared row pattern to the Badges list.

- [ ] **Step 1: Replace the achievements list in `renderAchievementsTab`**

Find the section in `renderAchievementsTab` that renders per-person status rows (around lines 2130–2185). Keep the "Status by Person" section as-is (it's a summary view, not a list of manageable items). Replace only the Achievement Definitions list with:

```js
html += `<div class="admin-section" style="margin-top:var(--spacing-md)">
  <div class="admin-list-add" style="justify-content:flex-start">
    <h3 style="font-size:var(--font-size-sm);font-weight:600;color:var(--color-text-muted);margin:0">Achievement Definitions</h3>
  </div>
  <div class="admin-list" id="badgeList">`;

for (const [key, def] of Object.entries(achievementDefsObj || {})) {
  const icon = renderEmojiTile(def.icon || '🏆');
  const unlockedCount = Object.values(allAchievements).filter(pa => pa[key]?.unlockedAt && !pa[key]?.revoked).length;
  const secondary = `${unlockedCount} / ${peopleArray().length} unlocked`;
  html += renderAdminRow({
    icon,
    primary: esc(def.label || key),
    secondary: esc(secondary),
    dataAttrs: `data-badge-key="${esc(key)}"`,
  });
}

html += `</div></div>`;
```

- [ ] **Step 2: Update `bindAchievementsTab` badge row click handler**

Add delegated click for the badge definitions list:

```js
main.querySelector('#badgeList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-badge-key]');
  if (!row) return;
  editingAchievementKey = row.dataset.badgeKey;
  render();
});
```

(Confirm `editingAchievementKey` state variable exists; if not, add `let editingAchievementKey = null;` near the other editing state variables.)

- [ ] **Step 3: Verify — Library → Badges shows Status by Person summary, then shared achievement rows with unlock counts. Tapping a row opens the existing achievement edit form.**

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Library Badges section — shared row, moved from standalone tab"
```

---

## Task 11: People tab — list view + person detail

**Files:**
- Modify: `admin.html`
- Modify: `styles/admin.css`

- [ ] **Step 1: Rewrite `renderPeopleTab` to use shared row for the list and a full-view detail when `editingPersonId !== null`**

Replace the entire `function renderPeopleTab() { ... }` body with:

```js
function renderPeopleTab() {
  // Detail view
  if (editingPersonId !== null) {
    return renderPersonDetail(editingPersonId === 'new' ? null : editingPersonId);
  }

  // List view
  const pa = peopleArray();
  let html = `<div class="admin-list-add">
    <button class="btn btn--primary btn--sm" id="addPersonBtn" type="button">+ Add Person</button>
  </div>`;

  if (pa.length === 0) {
    html += `<div class="admin-empty">No people yet. Tap + Add Person to get started.</div>`;
  } else {
    html += `<div class="admin-list" id="peopleList">`;
    for (const p of pa) {
      const icon = renderColorSwatch(p.color || '#ccc');
      const roleLabel = p.role === 'child' ? 'Kid' : 'Adult';
      const adminBadge = p.isAdmin ? ' · Admin' : '';
      html += renderAdminRow({
        icon,
        primary: esc(p.name),
        secondary: esc(roleLabel + adminBadge),
        dataAttrs: `data-person-id="${p.id}"`,
      });
    }
    html += `</div>`;
  }
  return html;
}
```

- [ ] **Step 2: Add `renderPersonDetail` function**

Add directly below `renderPeopleTab`:

```js
function renderPersonDetail(personId) {
  const person = personId ? peopleObj[personId] : {};
  const isEdit = !!personId;
  const colors = getColorPalette();
  const usedColors = peopleArray().filter(p => p.id !== personId).map(p => p.color);
  const selColor = person.color || colors.find(c => !usedColors.includes(c)) || colors[0];
  const role = person.role || 'adult';
  const ks = person.kidSettings || {};
  const prefs = person.prefs || {};

  return `<div class="admin-person-detail">
    <div class="admin-detail-back">
      <button class="btn btn--ghost btn--sm" id="personDetailBack" type="button">‹ People</button>
      <h2 class="admin-detail-title">${isEdit ? esc(person.name || 'Person') : 'New Person'}</h2>
    </div>

    <div class="admin-detail-section">
      <div class="admin-detail-section__title">Profile</div>
      <div class="admin-form__group">
        <label class="form-label" for="pf_name">Name</label>
        <input class="form-input" type="text" id="pf_name" value="${esc(person.name || '')}" placeholder="e.g., Jordin">
      </div>
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
      <div class="admin-form__group">
        <label class="form-label">Role</label>
        <div class="form-row">
          <button class="btn btn--secondary btn--sm admin-role-btn${role === 'adult' ? ' admin-mode-btn--active' : ''}" data-role="adult" type="button">Adult</button>
          <button class="btn btn--secondary btn--sm admin-role-btn${role === 'child' ? ' admin-mode-btn--active' : ''}" data-role="child" type="button">Kid</button>
        </div>
      </div>
    </div>

    <div class="admin-detail-section" id="adminAccessSection" style="display:${role === 'adult' ? '' : 'none'}">
      <div class="admin-detail-section__title">Admin Access</div>
      <label class="admin-toggle-row">
        <span class="admin-toggle-row__label">
          Can access admin without PIN
          <span class="admin-toggle-row__hint">This person can open admin directly from their home screen.</span>
        </span>
        <input type="checkbox" id="pf_isAdmin" class="admin-toggle"${person.isAdmin ? ' checked' : ''}>
      </label>
    </div>

    <div class="admin-detail-section" id="kidSettingsSection" style="display:${role === 'child' ? '' : 'none'}">
      <div class="admin-detail-section__title">Kid Settings</div>
      <label class="admin-toggle-row"><span class="admin-toggle-row__label">Show tonight's dinner</span><input type="checkbox" id="pf_showMeals" class="admin-toggle"${prefs.showMeals !== false ? ' checked' : ''}></label>
      <label class="admin-toggle-row"><span class="admin-toggle-row__label">Show weather</span><input type="checkbox" id="pf_showWeather" class="admin-toggle"${prefs.showWeather !== false ? ' checked' : ''}></label>
      <label class="admin-toggle-row"><span class="admin-toggle-row__label">Show store</span><input type="checkbox" id="pf_showStore" class="admin-toggle"${ks.showStore !== false ? ' checked' : ''}></label>
      <label class="admin-toggle-row"><span class="admin-toggle-row__label">Show achievements</span><input type="checkbox" id="pf_showAchievements" class="admin-toggle"${ks.showAchievements !== false ? ' checked' : ''}></label>
      <label class="admin-toggle-row"><span class="admin-toggle-row__label">Celebrations enabled</span><input type="checkbox" id="pf_celebrationsEnabled" class="admin-toggle"${ks.celebrationsEnabled !== false ? ' checked' : ''}></label>
      <label class="admin-toggle-row"><span class="admin-toggle-row__label">Can swipe between days</span><input type="checkbox" id="pf_canSwipeDays" class="admin-toggle"${ks.canSwipeDays ? ' checked' : ''}></label>
      <div class="admin-form__group mt-sm">
        <label class="form-label">Celebration style</label>
        <select class="form-input" id="pf_celebrationStyle">
          <option value="full"${(ks.celebrationStyle || 'full') === 'full' ? ' selected' : ''}>Full</option>
          <option value="subtle"${ks.celebrationStyle === 'subtle' ? ' selected' : ''}>Subtle</option>
          <option value="off"${ks.celebrationStyle === 'off' ? ' selected' : ''}>Off</option>
        </select>
      </div>
      <div class="admin-form__group">
        <label class="form-label">Personal theme</label>
        <select class="form-input" id="pf_theme">
          <option value=""${!person.theme?.preset ? ' selected' : ''}>Use family theme</option>
          ${getPresets().map(p => `<option value="${p.key}"${person.theme?.preset === p.key ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    ${isEdit ? `<div class="admin-detail-section">
      <div class="admin-detail-section__title">Rewards</div>
      <div class="admin-form__group">
        <div class="admin-person-detail__balance-label">Store balance</div>
        <div class="admin-person-detail__balance" id="personBalance_${person.id}">Loading…</div>
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="pf_balanceAnchor">Balance anchor</label>
        <input class="form-input" type="number" id="pf_balanceAnchor" value="${person.balanceAnchor ?? 0}" step="1">
        <button class="btn btn--secondary btn--sm mt-xs" id="pf_saveAnchor" type="button">Save Anchor</button>
      </div>
      <div class="admin-form__actions">
        <button class="btn btn--secondary btn--sm" id="pf_addBonus" data-person-id="${person.id}" type="button">+ Add Bonus</button>
        <button class="btn btn--secondary btn--sm" id="pf_addDeduction" data-person-id="${person.id}" type="button">− Add Deduction</button>
      </div>
    </div>` : ''}

    <div class="admin-detail-section">
      <div class="admin-detail-section__title">Profile link</div>
      <a href="${role === 'child' ? 'kid.html?kid=' : 'person.html?person='}${encodeURIComponent(person.name || '')}" class="btn btn--secondary btn--sm" target="_blank">Open ${role === 'child' ? 'Kid' : 'Person'} page</a>
    </div>

    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="personDetailCancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="personDetailSave" type="button">${isEdit ? 'Save Changes' : 'Add Person'}</button>
    </div>

    ${isEdit ? `<div class="admin-detail-section admin-detail-section--danger">
      <div class="admin-detail-section__title">Danger Zone</div>
      <button class="btn btn--danger btn--sm" id="deletePersonBtn" data-person-id="${person.id}" type="button">Delete ${esc(person.name || 'Person')}…</button>
      <p class="form-hint mt-xs">Removes this person and all associated messages, bank tokens, wishlist, and achievements.</p>
    </div>` : ''}
  </div>`;
}
```

- [ ] **Step 3: Add Person detail CSS to `styles/admin.css`**

Append:

```css
/* ── Person detail view ── */
.admin-person-detail {
  padding: var(--spacing-md);
}

.admin-detail-back {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.admin-detail-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0;
}

.admin-detail-section {
  background: var(--color-surface-raised);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.admin-detail-section--danger {
  border: 1px solid var(--color-error, #e53e3e);
}

.admin-detail-section__title {
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-sm);
}

.admin-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  cursor: pointer;
}

.admin-toggle-row__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.admin-toggle-row__hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Update `bindPeopleTab` to handle the new list and detail views**

Replace the entire `function bindPeopleTab() { ... }` with:

```js
function bindPeopleTab() {
  // List view bindings
  main.querySelector('#addPersonBtn')?.addEventListener('click', () => {
    editingPersonId = 'new';
    render();
  });

  main.querySelector('#peopleList')?.addEventListener('click', e => {
    const row = e.target.closest('[data-person-id]');
    if (!row) return;
    editingPersonId = row.dataset.personId;
    render();
  });

  // Detail view bindings
  main.querySelector('#personDetailBack')?.addEventListener('click', () => {
    editingPersonId = null;
    render();
  });
  main.querySelector('#personDetailCancel')?.addEventListener('click', () => {
    editingPersonId = null;
    render();
  });

  // Role toggle
  for (const btn of main.querySelectorAll('.admin-role-btn')) {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      main.querySelectorAll('.admin-role-btn').forEach(b => b.classList.toggle('admin-mode-btn--active', b.dataset.role === role));
      const kidSection = main.querySelector('#kidSettingsSection');
      const adminSection = main.querySelector('#adminAccessSection');
      if (kidSection) kidSection.style.display = role === 'child' ? '' : 'none';
      if (adminSection) adminSection.style.display = role === 'adult' ? '' : 'none';
    });
  }

  // Color swatch
  for (const swatch of main.querySelectorAll('#pf_colorGrid .color-swatch')) {
    swatch.addEventListener('click', () => {
      main.querySelectorAll('#pf_colorGrid .color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
  }

  // Save person
  main.querySelector('#personDetailSave')?.addEventListener('click', async () => {
    const name = main.querySelector('#pf_name')?.value.trim();
    if (!name) { showToast('Name is required'); return; }
    const color = main.querySelector('#pf_colorGrid .color-swatch.selected')?.dataset.color || '#ccc';
    const role = main.querySelector('.admin-role-btn.admin-mode-btn--active')?.dataset.role || 'adult';
    const isAdmin = role === 'adult' ? (main.querySelector('#pf_isAdmin')?.checked || false) : false;
    const kidSettings = role === 'child' ? {
      celebrationsEnabled: main.querySelector('#pf_celebrationsEnabled')?.checked ?? true,
      celebrationStyle: main.querySelector('#pf_celebrationStyle')?.value || 'full',
      canSwipeDays: main.querySelector('#pf_canSwipeDays')?.checked || false,
      showStore: main.querySelector('#pf_showStore')?.checked ?? true,
      showAchievements: main.querySelector('#pf_showAchievements')?.checked ?? true,
    } : undefined;
    const prefs = role === 'child' ? {
      showMeals: main.querySelector('#pf_showMeals')?.checked ?? true,
      showWeather: main.querySelector('#pf_showWeather')?.checked ?? true,
    } : undefined;
    const themePreset = main.querySelector('#pf_theme')?.value || '';
    const theme = themePreset ? { preset: themePreset } : undefined;

    const data = { name, color, role, isAdmin, ...(kidSettings && { kidSettings }), ...(prefs && { prefs }), ...(theme && { theme }) };

    if (editingPersonId && editingPersonId !== 'new') {
      await firebase.database().ref(`rundown/people/${editingPersonId}`).update(data);
    } else {
      await firebase.database().ref('rundown/people').push(data);
    }
    peopleObj = await readPeople() || {};
    editingPersonId = null;
    render();
  });

  // Delete person
  main.querySelector('#deletePersonBtn')?.addEventListener('click', async () => {
    const pid = main.querySelector('#deletePersonBtn')?.dataset.personId;
    if (!pid) return;
    const personName = peopleObj[pid]?.name || 'this person';
    const confirmed = await showConfirm({
      title: `Delete ${personName}?`,
      message: 'This removes the person and all associated messages, bank tokens, wishlist, and achievements. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await firebase.database().ref(`rundown/people/${pid}`).remove();
    await deletePersonRewardsData(pid);
    peopleObj = await readPeople() || {};
    editingPersonId = null;
    render();
  });

  // Balance anchor save
  main.querySelector('#pf_saveAnchor')?.addEventListener('click', async () => {
    const pid = editingPersonId;
    if (!pid || pid === 'new') return;
    const amount = parseFloat(main.querySelector('#pf_balanceAnchor')?.value || '0');
    await firebase.database().ref(`rundown/balanceAnchors/${pid}`).set({ amount, anchoredAt: firebase.database.ServerValue.TIMESTAMP });
    showToast('Balance anchor saved');
  });
}
```

- [ ] **Step 5: Verify — People tab shows shared list rows. Tapping a person opens the detail view with all sections. Back button returns to list. Save works. Delete shows confirm modal.**

- [ ] **Step 6: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "feat(admin): People tab — shared list rows + full person detail view"
```

---

## Task 12: Settings tab — consolidate + add theme controls + auto-prune

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Move theme controls into `renderSettingsTab`**

Find `function renderSettingsTab()`. Locate the Display fieldset (around line 1280). Add the theme controls from the now-deleted `renderThemeTab` function directly after the ambient strip toggle, inside the Display fieldset:

```html
<fieldset class="admin-form__fieldset">
  <legend>Display</legend>
  <label class="admin-checkbox">
    <input type="checkbox" id="set_ambientStrip"${(settings?.ambientStrip ?? true) ? ' checked' : ''}> Ambient strip
  </label>
  <div class="form-group mt-sm">
    <label class="form-label">App theme preset</label>
    <div class="admin-theme-presets" id="sf_themePresets">
      ${getPresets().map(p => `<button class="btn btn--secondary btn--sm admin-theme-preset${settings?.theme?.preset === p.key ? ' admin-mode-btn--active' : ''}" data-preset="${p.key}" type="button">${esc(p.label)}</button>`).join('')}
    </div>
    <p class="form-hint">Sets the default theme for all family members.</p>
  </div>
  <div class="form-group mt-sm">
    <label class="form-label">Accent color</label>
    <div class="color-grid" id="sf_accentGrid">
      ${getAccentColors().map(c => `<div class="color-swatch${settings?.theme?.accent === c ? ' selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
    </div>
  </div>
</fieldset>
```

(Use `getAccentColors()` — confirm this helper exists in admin.html from the old Theme tab; if not, copy its implementation from `bindThemeTab`.)

- [ ] **Step 2: Add auto-prune setting to the Behavior fieldset**

Find the Behavior section in `renderSettingsTab` (long-press sliders, etc.). Add after the existing Behavior controls:

```html
<div class="form-group mt-sm">
  <label class="form-label" for="set_autoPruneMonths">Auto-prune old data</label>
  <select class="form-input" id="set_autoPruneMonths">
    <option value="0"${!(settings?.autoPruneMonths) ? ' selected' : ''}>Off</option>
    <option value="3"${settings?.autoPruneMonths === 3 ? ' selected' : ''}>Older than 3 months</option>
    <option value="6"${settings?.autoPruneMonths === 6 ? ' selected' : ''}>Older than 6 months</option>
    <option value="12"${settings?.autoPruneMonths === 12 ? ' selected' : ''}>Older than 12 months</option>
  </select>
  <p class="form-hint">Schedule entries, completions, and snapshots older than this are removed silently on admin load. Tasks and settings are never pruned.</p>
</div>
```

- [ ] **Step 3: Add `autoPruneMonths` to the settings save handler**

Find the `updated` object in `bindSettingsTab` (the block that reads all form fields and calls `writeSettings`). Add:

```js
autoPruneMonths: parseInt(main.querySelector('#set_autoPruneMonths')?.value || '0', 10),
```

- [ ] **Step 4: Wire theme preset buttons and accent grid in `bindSettingsTab`**

In `bindSettingsTab`, add (after the existing save handler):

```js
for (const btn of main.querySelectorAll('.admin-theme-preset')) {
  btn.addEventListener('click', async () => {
    main.querySelectorAll('.admin-theme-preset').forEach(b => b.classList.remove('admin-mode-btn--active'));
    btn.classList.add('admin-mode-btn--active');
    const preset = btn.dataset.preset;
    const theme = { ...(settings?.theme || {}), preset };
    await writeSettings({ theme });
    settings = await readSettings();
    applyTheme(resolveTheme(settings?.theme));
  });
}

for (const swatch of main.querySelectorAll('#sf_accentGrid .color-swatch')) {
  swatch.addEventListener('click', async () => {
    main.querySelectorAll('#sf_accentGrid .color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    const theme = { ...(settings?.theme || {}), accent: swatch.dataset.color };
    await writeSettings({ theme });
    settings = await readSettings();
    applyTheme(resolveTheme(settings?.theme));
  });
}
```

- [ ] **Step 5: Verify — Settings tab shows Display section with ambient strip toggle + theme preset buttons + accent grid. Behavior section has auto-prune dropdown. Saving settings persists autoPruneMonths to Firebase.**

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Settings tab — theme controls merged, auto-prune setting added"
```

---

## Task 13: Tools tab — Schedule + Data

**Files:**
- Modify: `admin.html`

The `renderToolsTab` stub from Task 2 already concatenates `renderScheduleTab() + renderDataTab()`. This task removes the Archive button from Data and combines them into one clean view.

- [ ] **Step 1: Remove the Archive Old Data section from `renderDataTab`**

Find in `renderDataTab` (around lines 1464–1478):
```html
<h3 class="admin-form__title mt-lg">Archive Old Data</h3>
...
<button ... id="archiveBtn" ...>Prune Data</button>
```
Delete this entire block (heading + hint + select + button + status div).

- [ ] **Step 2: Remove Archive event handlers from `bindDataTab`**

Find in `bindDataTab` any handlers for `#archiveBtn` and `#archiveMonths`. Delete them.

- [ ] **Step 3: Add a visual divider between Schedule and Data sections in `renderToolsTab`**

Replace the stub `renderToolsTab` with:

```js
function renderToolsTab() {
  return `<div class="admin-form">
    <h3 class="admin-form__title">Schedule</h3>
    ${renderScheduleTab()}
    <hr style="border:none;border-top:1px solid var(--color-border);margin:var(--spacing-lg) 0">
    <h3 class="admin-form__title">Data</h3>
    ${renderDataTab()}
  </div>`;
}
```

- [ ] **Step 4: Verify — Tools tab shows Schedule stats + rebuild buttons, then a divider, then Export/Import/Reset Scoreboard/Factory Reset. No Archive button.**

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Tools tab — Schedule + Data combined, Archive button removed"
```

---

## Task 14: Auto-prune on admin load

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add the `autoPrune` function**

Find the `// ── Helpers ──` block (around line 285). Add:

```js
async function autoPrune(months) {
  if (!months || months <= 0) return;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffKey = cutoff.toLocaleDateString('en-CA', { timeZone: tz });

  const db = firebase.database();
  const pruneRef = (path) => db.ref(path).orderByKey().endAt(cutoffKey).once('value').then(snap => {
    const updates = {};
    snap.forEach(child => { updates[child.key] = null; });
    if (Object.keys(updates).length > 0) return db.ref(path).update(updates);
  });

  await Promise.all([
    pruneRef('rundown/schedule'),
    pruneRef('rundown/snapshots'),
    // completions are keyed by entryKey (not date), so skip — only schedule+snapshots
  ]);
}
```

- [ ] **Step 2: Call `autoPrune` after data is loaded**

Find the `// ── Load data ──` block (around line 179). After `const today = todayKey(tz);`, add:

```js
autoPrune(settings?.autoPruneMonths || 0).catch(() => {}); // fire-and-forget, silent
```

- [ ] **Step 3: Verify — set `autoPruneMonths: 0` in Settings, confirm no Firebase writes happen. Set to `3`, confirm old schedule and snapshot nodes are removed on next admin load.**

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): auto-prune old schedule+snapshot data on load — silent, configurable"
```

---

## Task 15: SW cache bump

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump CACHE_NAME**

Open `sw.js`. Find `const CACHE_NAME = 'family-hub-v65';`. Change to `'family-hub-v66'`. Add a comment in the bump log:

```js
// v66 (2026-04-25) — Admin redesign: 4-tab structure, shared row pattern, Person detail, PIN bypass
```

- [ ] **Step 2: Verify in browser — DevTools → Application → Service Workers → Update. Confirm v66 appears in Cache Storage.**

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): bump to v66 — admin redesign"
```

---

## Self-Review

### Spec coverage check

| Spec section | Covered by |
|---|---|
| §2 4-tab navigation (Library/People/Settings/Tools) | Task 2 |
| §2.1 PIN bypass — `isAdmin` flag, `dr-person-home` lookup | Task 4 |
| §3.1 Library sub-nav (6 pills) | Task 2 |
| §3.2 Shared list row pattern | Task 3 |
| §3.3 Tasks — shared row, Templates deleted | Tasks 1 + 5 |
| §3.3 Events — shared row | Task 6 |
| §3.3 Meals — shared row, ingredients kept | Task 7 |
| §3.3 Categories — shared row, task count in secondary | Task 8 |
| §3.3 Rewards — shared row, bank management removed | Task 9 |
| §3.3 Badges — merged into Library sub-nav | Task 10 |
| §4 People list — shared row, role + admin badge | Task 11 |
| §4.2 Person detail — Profile, Admin Access, Kid Settings, Rewards, Danger Zone | Task 11 |
| §5 Settings — theme controls merged into Display | Task 12 |
| §5 Settings — auto-prune dropdown, `autoPruneMonths` key | Task 12 |
| §6 Tools — Schedule + Data combined | Task 13 |
| §6 Archive button removed | Task 13 |
| §7 Debug tab deleted entirely | Task 1 |
| §7 Theme tab deleted | Task 1 |
| §7 Task Templates deleted | Task 1 |
| §8 `renderAdminRow` helper in admin.html | Task 3 |
| §8 `isAdmin` written via Firebase update | Task 11 |
| §8 Auto-prune runs silently on admin load | Task 14 |
| §9 Empty states in all Library sections | Tasks 5–10 |
| §10 Bell unmodified | Not touched ✓ |
| §10 Per-person theme on person.html unmodified | Not touched ✓ |
| SW cache bump | Task 15 |

All sections covered.

### Notes for implementer

- `getAccentColors()` — verify this function exists in admin.html before Task 12 Step 1. It was used in the old `bindThemeTab`. If it doesn't exist as a named function, extract it from the old Theme tab JS before deleting that code in Task 1.
- `deletePersonRewardsData(pid)` — already imported from `shared/firebase.js`. Used in Task 11 delete handler.
- `showToast` — already available in admin.html scope.
- `editingEventId`, `editingMealId`, `editingCatKey`, `editingAchievementKey` — verify each exists as a module-level `let` before referencing in bind functions. Add any that are missing near the other state variable declarations.
