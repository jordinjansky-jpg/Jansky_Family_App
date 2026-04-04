# Task Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Condense all task forms to fit mobile screens without scrolling, unify 3 duplicate form renderers into one, and convert admin inline edit to a centered modal.

**Architecture:** One shared `renderTaskFormCompact()` in `components.js` replaces 3 duplicated form renderers. Admin edit uses a modal overlay instead of inline expansion. CSS compact form class reduces spacing and packs fields into dense grid rows.

**Tech Stack:** Vanilla JS, CSS, HTML (no framework/bundler)

---

### Task 1: Add Compact Form CSS

**Files:**
- Modify: `styles/components.css` (append after line ~413)
- Modify: `styles/admin.css` (append after line ~276)

- [ ] **Step 1: Add `.form-compact` spacing overrides and grid rows to `components.css`**

Append after the `.form-row > *` rule (line ~413):

```css
/* ============ Compact Form ============ */
.form-compact .form-group {
  margin-bottom: var(--spacing-xs);
}
.form-compact .form-label {
  margin-bottom: 2px;
  font-size: var(--font-size-xs);
}
.form-compact .form-row {
  gap: var(--spacing-xs);
}
.form-compact .form-row-3 {
  display: flex;
  gap: var(--spacing-xs);
}
.form-compact .form-row-3 > * {
  flex: 1;
  min-width: 0;
}
.form-compact .form-row-2 {
  display: flex;
  gap: var(--spacing-xs);
}
.form-compact .form-row-2 > .form-group--2fr {
  flex: 2;
  min-width: 0;
}
.form-compact .form-row-2 > .form-group--1fr {
  flex: 1;
  min-width: 0;
}
.form-compact .admin-form__title {
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-base);
}
.form-compact .admin-form__actions {
  margin-top: var(--spacing-sm);
}
.form-compact .owner-chips {
  gap: var(--spacing-xs);
}
.form-compact .form-hint {
  margin-top: 2px;
}
.form-compact select,
.form-compact input[type="text"],
.form-compact input[type="number"],
.form-compact input[type="time"],
.form-compact input[type="date"] {
  padding: 6px 8px;
  font-size: var(--font-size-sm);
}
.form-compact .inline-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.form-compact .inline-row .form-group {
  margin-bottom: 0;
}
.form-compact .admin-checkbox {
  margin-top: 0;
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 2: Add modal overlay styles to `admin.css`**

Append after the `.admin-form__actions` rule (line ~276):

```css
/* Task Form Modal Overlay */
.task-form-backdrop {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-md);
}
.task-form-modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  max-width: 420px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 3: Commit**

```bash
git add styles/components.css styles/admin.css
git commit -m "feat: add compact form CSS and admin modal overlay styles"
```

---

### Task 2: Create Unified `renderTaskFormCompact()` in `components.js`

**Files:**
- Modify: `shared/components.js:431-629` — replace `renderQuickAddSheet` and `renderEditTaskSheet` bodies, add new `renderTaskFormCompact` export

- [ ] **Step 1: Add `renderTaskFormCompact()` function**

Insert before `renderQuickAddSheet` (line 431). This is the single shared renderer:

```js
/**
 * Render a condensed task form that fits mobile without scrolling.
 * @param {Object} opts
 * @param {Object} opts.task - task object ({} for new)
 * @param {string|null} opts.taskId - task ID or null for create
 * @param {'create'|'edit'} opts.mode
 * @param {Array} opts.categories - [{ key, label, icon, isEvent, isDefault }]
 * @param {Array} opts.people - [{ id, name, color }]
 * @param {string} opts.prefix - ID prefix ('tf','qa','et')
 */
export function renderTaskFormCompact({ task = {}, taskId = null, mode = 'create', categories = [], people = [], prefix = 'tf' }) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Task' : 'New Task';
  const selectedOwners = task.owners || [];
  const assignMode = task.ownerAssignmentMode || 'rotate';
  const catObj = categories.find(c => c.key === task.category);
  const isEvent = !!catObj?.isEvent;
  const showDedicated = task.rotation && task.rotation !== 'daily';

  const catOptions = categories.map(c =>
    `<option value="${esc(c.key)}" data-event="${c.isEvent ? '1' : ''}"${
      task.category === c.key || (!task.category && c.isDefault) ? ' selected' : ''
    }>${esc(c.icon)} ${esc(c.label)}</option>`
  ).join('');

  const ownerChips = people.map(p =>
    `<button type="button" class="owner-chip${selectedOwners.includes(p.id) ? ' owner-chip--selected' : ''}" data-id="${p.id}">${esc(p.name)}</button>`
  ).join('');

  const dayOptions = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
    const val = (i + 1) % 7;
    return `<option value="${val}"${task.dedicatedDay === val ? ' selected' : ''}>${d}</option>`;
  }).join('');

  return `<div class="form-compact" id="${prefix}_form">
    <h3 class="admin-form__title">${title}</h3>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" id="${prefix}_name" value="${esc(task.name || '')}" placeholder="e.g., Take out trash">
    </div>
    <div class="form-row-3">
      <div class="form-group">
        <label class="form-label">Rotation</label>
        <select id="${prefix}_rotation">
          <option value="daily"${task.rotation === 'daily' ? ' selected' : ''}>Daily</option>
          <option value="weekly"${task.rotation === 'weekly' ? ' selected' : ''}>Weekly</option>
          <option value="monthly"${task.rotation === 'monthly' ? ' selected' : ''}>Monthly</option>
          <option value="once"${task.rotation === 'once' ? ' selected' : ''}>One-Time</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Difficulty</label>
        <select id="${prefix}_difficulty">
          <option value="easy"${task.difficulty === 'easy' ? ' selected' : ''}>Easy</option>
          <option value="medium"${(task.difficulty || 'medium') === 'medium' ? ' selected' : ''}>Medium</option>
          <option value="hard"${task.difficulty === 'hard' ? ' selected' : ''}>Hard</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Time</label>
        <select id="${prefix}_timeOfDay">
          <option value="anytime"${(task.timeOfDay || 'anytime') === 'anytime' ? ' selected' : ''}>Any</option>
          <option value="am"${task.timeOfDay === 'am' ? ' selected' : ''}>AM</option>
          <option value="pm"${task.timeOfDay === 'pm' ? ' selected' : ''}>PM</option>
          <option value="both"${task.timeOfDay === 'both' ? ' selected' : ''}>Both</option>
        </select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-group form-group--2fr">
        <label class="form-label">Category</label>
        <select id="${prefix}_category">${catOptions}</select>
      </div>
      <div class="form-group form-group--1fr">
        <label class="form-label">Est. Min</label>
        <input type="number" id="${prefix}_estMin" value="${task.estMin ?? 10}" min="0" max="120">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Owners</label>
      <div class="owner-chips" id="${prefix}_owners">${ownerChips}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Assign</label>
      <div class="form-row" id="${prefix}_assignMode">
        <button class="btn btn--secondary btn--sm admin-mode-btn${assignMode === 'rotate' ? ' admin-mode-btn--active' : ''}" data-mode="rotate" type="button">Rotate</button>
        <button class="btn btn--secondary btn--sm admin-mode-btn${assignMode === 'duplicate' ? ' admin-mode-btn--active' : ''}" data-mode="duplicate" type="button">Duplicate</button>
      </div>
    </div>
    <div class="inline-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Cooldown</label>
        <input type="number" id="${prefix}_cooldown" value="${task.cooldownDays || ''}" min="0" max="30" placeholder="0">
      </div>
      <label class="admin-checkbox"><input type="checkbox" id="${prefix}_exempt"${task.exempt ? ' checked' : ''}> Exempt</label>
    </div>
    <div class="form-group" id="${prefix}_dedicatedDayGroup" style="display:${showDedicated ? '' : 'none'}">
      <label class="form-label" id="${prefix}_dedicatedDayLabel">${task.rotation === 'once' ? (isEvent ? 'Event Date' : 'Date') : 'Day'} <button type="button" id="${prefix}_eventDateBtn" class="btn btn--ghost btn--sm" style="display:${isEvent ? 'inline' : 'none'};padding:0 4px;font-size:1.1em;vertical-align:middle" title="Pick event date">📅</button></label>
      <input type="date" id="${prefix}_eventDate" style="position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;clip:rect(0,0,0,0);" value="${task.dedicatedDate || ''}">
      <select id="${prefix}_daySelect" class="dedicated-day-select" style="display:${task.rotation === 'once' ? 'none' : ''}">
        <option value=""${task.dedicatedDay == null ? ' selected' : ''}>Any</option>
        ${dayOptions}
      </select>
      <div id="${prefix}_dedicatedDateRow" style="display:${task.rotation === 'once' && !isEvent ? '' : 'none'}">
        <input type="date" id="${prefix}_dedicatedDate" class="task-detail__date-input" style="width:100%" value="${task.dedicatedDate || ''}">
      </div>
    </div>
    <div class="form-group" id="${prefix}_eventTimeGroup" style="display:${isEvent ? '' : 'none'}">
      <label class="form-label">Event Time</label>
      <input type="time" id="${prefix}_eventTime" value="${task.eventTime || ''}">
    </div>
    <div class="admin-form__actions">
      <button class="btn btn--secondary" id="${prefix}_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="${prefix}_save" type="button"${taskId ? ` data-task-id="${taskId}"` : ''}>${isEdit ? 'Save' : 'Create'}</button>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Rewrite `renderQuickAddSheet` as a wrapper**

Replace the body of `renderQuickAddSheet` (lines 431-525) with:

```js
export function renderQuickAddSheet(people, categories, defaultCategoryKey) {
  const defaultCat = defaultCategoryKey ? categories.find(c => c.key === defaultCategoryKey) : null;
  const task = defaultCategoryKey ? { category: defaultCategoryKey } : {};
  return `<div class="task-detail-sheet">${renderTaskFormCompact({
    task,
    mode: 'create',
    categories,
    people,
    prefix: 'qa'
  })}</div>`;
}
```

- [ ] **Step 3: Rewrite `renderEditTaskSheet` as a wrapper**

Replace the body of `renderEditTaskSheet` (lines 531-629) with:

```js
export function renderEditTaskSheet(taskId, task, categories, people) {
  return `<div class="task-detail-sheet">${renderTaskFormCompact({
    task,
    taskId,
    mode: 'edit',
    categories,
    people,
    prefix: 'et'
  })}</div>`;
}
```

- [ ] **Step 4: Update the export to include `renderTaskFormCompact`**

The function is already exported via `export function` syntax — verify the import lines in consuming files don't need changes (they import `renderQuickAddSheet` and `renderEditTaskSheet` which still exist as wrappers).

- [ ] **Step 5: Commit**

```bash
git add shared/components.js
git commit -m "feat: add unified renderTaskFormCompact, rewrite quick-add and edit sheet as wrappers"
```

---

### Task 3: Update Admin Task Form to Use Compact Renderer + Modal

**Files:**
- Modify: `admin.html:57-70` (imports)
- Modify: `admin.html:462-614` (renderTaskForm + renderTasksTab)
- Modify: `admin.html:1286-1305` (edit click handlers)
- Modify: `admin.html:1369-1442` (bindTaskForm)
- Modify: `admin.html:1444-1557` (save/cancel handlers)

This is the largest task. It replaces the inline `renderTaskForm()` in `admin.html` with the shared compact renderer, and changes edit mode to use a modal overlay.

- [ ] **Step 1: Add `renderTaskFormCompact` to admin imports**

In the import from `./shared/components.js` (line 65), add `renderTaskFormCompact`:

```js
import { renderNavBar, renderHeader, renderConnectionStatus, renderEmptyState, renderUndoToast, renderOfflineBanner, initOwnerChips, getSelectedOwners, renderTaskFormCompact } from './shared/components.js';
```

- [ ] **Step 2: Replace `renderTaskForm()` function**

Delete the entire `renderTaskForm` function (lines 516-616) and replace with a function that wraps the compact renderer:

```js
    function renderTaskForm(taskId) {
      const task = taskId ? tasksObj[taskId] : {};
      const pa = peopleArray();
      const ca = catsArray();
      return `<div class="admin-form">${renderTaskFormCompact({
        task,
        taskId,
        mode: taskId ? 'edit' : 'create',
        categories: ca,
        people: pa,
        prefix: 'tf'
      })}</div>`;
    }
```

- [ ] **Step 3: Change edit rendering from inline to modal**

In `renderTasksTab()`, remove the inline edit form after each task row. Replace lines 505-508:

```js
          // Inline edit form right after this task row
          if (editingThis) {
            html += renderTaskForm(id);
          }
```

with nothing (delete those lines).

After the task list closing `</div>` (after the `html += '</div>'` on line ~510), add the modal rendering:

```js
      // Modal overlay for editing (not for 'new' — new stays at top)
      if (editingTaskId && editingTaskId !== 'new') {
        html += `<div class="task-form-backdrop" id="taskFormBackdrop">
          <div class="task-form-modal">${renderTaskForm(editingTaskId)}</div>
        </div>`;
      }
```

- [ ] **Step 4: Update edit click handlers to not scroll**

Replace the edit click handler block (lines 1287-1305). Remove `scrollToTask` calls since modal doesn't need scrolling:

```js
      // Edit task — click row or edit button → open modal
      for (const item of main.querySelectorAll('.admin-list-item[data-task-id]')) {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.admin-list-item__actions')) return;
          const tid = item.dataset.taskId;
          editingTaskId = editingTaskId === tid ? null : tid;
          render();
        });
      }
      for (const btn of main.querySelectorAll('.admin-edit-task')) {
        btn.addEventListener('click', () => {
          const tid = btn.dataset.taskId;
          editingTaskId = editingTaskId === tid ? null : tid;
          render();
        });
      }
```

- [ ] **Step 5: Add backdrop click handler in `bindTaskListeners`**

After the edit click handlers, add:

```js
      // Modal backdrop click → close
      document.querySelector('#taskFormBackdrop')?.addEventListener('click', (e) => {
        if (e.target.id === 'taskFormBackdrop') {
          editingTaskId = null;
          render();
        }
      });
```

- [ ] **Step 6: Update `bindTaskForm` for new element IDs**

The compact form uses `${prefix}_cancel` and `${prefix}_save` instead of `taskFormCancel` and `taskFormSave`. Also `${prefix}_form` instead of `taskForm`. The assignment mode hint element is removed. Update `bindTaskForm()`:

Replace the cancel handler (line ~1445):
```js
      // Cancel
      const cancelBtn = main.querySelector('#tf_cancel') || document.querySelector('#tf_cancel');
      cancelBtn?.addEventListener('click', () => {
        const prevId = editingTaskId;
        editingTaskId = null;
        render();
      });
```

Replace the save handler selector (line ~1453):
```js
      const saveBtn = main.querySelector('#tf_save') || document.querySelector('#tf_save');
      saveBtn?.addEventListener('click', async () => {
```

Remove the assignment mode hint update from the mode toggle handler (lines 1382-1385) — delete the `const hint` and `if (hint)` lines since the compact form has no hint element.

Update the `dedicatedDayGroup`, `daySelect`, `dedicatedDateRow`, `dedicatedDayLabel` selectors to use prefix — change `#dedicatedDayGroup` to `#tf_dedicatedDayGroup`, `#daySelect` to `#tf_daySelect`, `#dedicatedDateRow` to `#tf_dedicatedDateRow`, `#dedicatedDayLabel` to `#tf_dedicatedDayLabel`.

Since the modal is outside `main`, form queries need to search `document` as well. Update `bindTaskForm` to query from `document` when `editingTaskId !== 'new'`:

```js
    function bindTaskForm() {
      const root = editingTaskId === 'new' ? main : document;
      initOwnerChips('tf_owners');
      // Assignment mode toggle
      for (const btn of root.querySelectorAll('.admin-mode-btn')) {
        btn.addEventListener('click', () => {
          root.querySelectorAll('.admin-mode-btn').forEach(b => b.classList.remove('admin-mode-btn--active'));
          btn.classList.add('admin-mode-btn--active');
        });
      }
```

And use `root` instead of `main` for all subsequent queries in `bindTaskForm` (for `#tf_category`, `#tf_eventDateBtn`, `#tf_rotation`, `#tf_cancel`, `#tf_save`, etc.).

- [ ] **Step 7: Update save handler field selectors**

The save handler currently reads from `main.querySelector`. When editing (modal is on `document`), it needs to read from `root`. Apply the same `root` variable pattern:

```js
      saveBtn?.addEventListener('click', async () => {
        const root = editingTaskId === 'new' ? main : document;
        const name = root.querySelector('#tf_name')?.value.trim();
        if (!name) { root.querySelector('#tf_name')?.focus(); return; }

        const owners = getSelectedOwners('tf_owners');
        const activeMode = root.querySelector('.admin-mode-btn.admin-mode-btn--active');
        const assignMode = activeMode?.dataset.mode || 'rotate';
        const cooldown = root.querySelector('#tf_cooldown')?.value;
        const rotation = root.querySelector('#tf_rotation')?.value || 'daily';

        const dayVal = root.querySelector('#tf_daySelect')?.value;
        const dedicatedDay = (rotation !== 'once' && dayVal !== '' && dayVal != null) ? parseInt(dayVal, 10) : null;
        const dedicatedDate = rotation === 'once' ? (root.querySelector('#tf_dedicatedDate')?.value || null) : null;

        const catKey = root.querySelector('#tf_category')?.value || '';
        const catIsEvent = catsObj[catKey]?.isEvent || false;
        const effectiveMode = catIsEvent ? 'fixed' : assignMode;

        const eventDate = catIsEvent ? (root.querySelector('#tf_eventDate')?.value || null) : null;
        const effectiveRotation = catIsEvent && eventDate ? 'once' : rotation;
        const effectiveDedicatedDate = catIsEvent && eventDate ? eventDate : dedicatedDate;
        const eventTime = catIsEvent ? (root.querySelector('#tf_eventTime')?.value || null) : null;
```

(The rest of the save handler — `taskData` object construction, the create/edit branching — stays the same, just ensure `root` is used for all querySelector calls.)

- [ ] **Step 8: Commit**

```bash
git add admin.html
git commit -m "feat: admin task form uses compact renderer, edit opens as centered modal"
```

---

### Task 4: Update Quick-Add and Edit Sheet Event Handlers in Dashboard/Calendar/Tracker

**Files:**
- Modify: `index.html` — update selectors for qa_ and et_ prefixed cancel/save buttons
- Modify: `calendar.html` — same
- Modify: `tracker.html` — same (edit only, no quick-add)

The compact form changed button IDs from `qaCancel`/`qaSave` to `qa_cancel`/`qa_save`, and from `etCancel`/`etSave` to `et_cancel`/`et_save`. Also `assignModeHint` → removed, and dedicated day group IDs are now prefixed.

- [ ] **Step 1: Update quick-add selectors in `index.html`**

Button IDs changed: `qaCancel` → `qa_cancel`, `qaSave` → `qa_save`.

The `qa_assignModeHint` element no longer exists. The save handler currently finds the active mode button via `document.getElementById('qa_assignModeHint')?.parentElement?.querySelector('.admin-mode-btn--active')`. Replace with `document.querySelector('#qa_assignMode .admin-mode-btn--active')`.

Remove the mode toggle hint text update lines that reference `qa_assignModeHint`.

- [ ] **Step 2: Update edit-task selectors in `index.html`**

Button IDs changed: `etCancel` → `et_cancel`, `etSave` → `et_save`.

Replace `document.getElementById('et_assignModeHint')?.parentElement?.querySelector('.admin-mode-btn--active')` with `document.querySelector('#et_assignMode .admin-mode-btn--active')`.

Remove the mode toggle hint text update lines that reference `et_assignModeHint`.

- [ ] **Step 3: Same selector updates in `calendar.html`**

Same patterns as steps 1-2: `qaCancel` → `qa_cancel`, `qaSave` → `qa_save`, `etCancel` → `et_cancel`, `etSave` → `et_save`. Replace all `assignModeHint?.parentElement` queries with `#qa_assignMode` / `#et_assignMode` selectors. Remove hint text updates.

- [ ] **Step 4: Same for `tracker.html`**

Tracker only has edit (no quick-add): `etCancel` → `et_cancel`, `etSave` → `et_save`. Replace `et_assignModeHint` parent queries with `#et_assignMode`. Remove hint text updates.

- [ ] **Step 5: Commit**

```bash
git add index.html calendar.html tracker.html
git commit -m "feat: update dashboard/calendar/tracker for compact form button IDs"
```

---

### Task 5: Manual Testing + Cleanup

**Files:**
- Possibly: `admin.html` — remove dead `scrollToTask` calls if any remain
- Possibly: `shared/components.js` — verify no dead code from old form renderers

- [ ] **Step 1: Remove `scrollToTask` function from admin if no longer called**

Check if `scrollToTask` is still used for anything (new task form scroll is still useful for the inline create form at top). If it's still referenced for the "new" case, keep it. If only the edit case called it (now modal), remove those calls but keep the function for the create case.

- [ ] **Step 2: Test all form paths**

Open the app and test:
1. Admin → Tasks → "+ Add Task" → compact form appears at top, all fields fit without scroll
2. Admin → Tasks → click a task row → modal appears centered with backdrop
3. Click backdrop → modal closes
4. Click Cancel in modal → modal closes
5. Edit a task via modal → save works, modal closes
6. Dashboard → "+" quick-add → compact form in bottom sheet
7. Dashboard → long-press task → edit sheet → compact form
8. Calendar → quick-add and edit sheet → same compact form
9. Tracker → edit sheet → same compact form

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup dead code from task form redesign"
```
