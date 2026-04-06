# Bulk Admin Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select mode to the admin tasks tab with batch edit and batch delete capabilities.

**Architecture:** New state variables (`selectMode`, `selectedTaskIds`) drive conditional rendering in `renderTasksTab()`. A floating action bar and batch edit modal are rendered as siblings of the task list. All batch operations use existing Firebase helpers (`writeTask`, `removeTask`, `multiUpdate`, `buildScheduleUpdates`).

**Tech Stack:** Vanilla JS (ES modules), Firebase Realtime Database (compat SDK), CSS.

**Spec:** `docs/superpowers/specs/2026-04-06-bulk-admin-actions-design.md`

---

### Task 1: Add CSS for bulk action components

**Files:**
- Modify: `styles/admin.css` (append after line 628)

- [ ] **Step 1: Add selected row, floating bar, bulk edit form, and checkbox styles**

Append to `styles/admin.css`:

```css
/* ============ Bulk Admin Actions ============ */

/* Selected task row highlight */
.admin-list-item--selected {
  background: var(--accent-light, rgba(108, 99, 255, 0.08));
  border-color: var(--accent, #6c63ff);
}

/* Bulk select checkbox in task rows */
.bulk-checkbox {
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
  margin-right: var(--spacing-xs);
}

/* Floating action bar at bottom */
.bulk-action-bar {
  position: fixed;
  bottom: calc(60px + env(safe-area-inset-bottom, 0px) + var(--spacing-sm));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 900;
  max-width: calc(100vw - var(--spacing-md) * 2);
}

/* Bulk edit modal form layout */
.bulk-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
.bulk-edit-form .form-group {
  margin-bottom: 0;
}
.bulk-edit-form .owner-chips-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-style: italic;
}
```

- [ ] **Step 2: Verify CSS loads correctly**

Open admin.html in browser, confirm no visual regressions on the tasks tab. The new classes aren't used yet so nothing should change.

- [ ] **Step 3: Commit**

```bash
git add styles/admin.css
git commit -m "style: add CSS for bulk admin action components"
```

---

### Task 2: Add state variables and reset on tab switch

**Files:**
- Modify: `admin.html:312-315` (state variables area)
- Modify: `admin.html:299-306` (bindTabEvents)

- [ ] **Step 1: Add selectMode and selectedTaskIds state variables**

After line 315 (`let showingTemplates = false;`), add:

```js
    let selectMode = false;
    let selectedTaskIds = new Set();
```

- [ ] **Step 2: Reset select mode on tab switch**

In `bindTabEvents()` (line 299-306), add reset before `render()`. Change the click handler body from:

```js
          activeTab = tab.dataset.tab;
          render();
```

to:

```js
          activeTab = tab.dataset.tab;
          selectMode = false;
          selectedTaskIds.clear();
          render();
```

- [ ] **Step 3: Verify no regressions**

Open admin.html, switch between tabs. Everything should work as before.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: add bulk select state variables, reset on tab switch"
```

---

### Task 3: Update section header for select mode toggle

**Files:**
- Modify: `admin.html:412-418` (section header in `renderTasksTab`)

- [ ] **Step 1: Replace the static section header with mode-aware rendering**

Replace the section header block (lines 412-418):

```js
      html += `<div class="admin-section-header">
        <span>${filtered.length} task${filtered.length !== 1 ? 's' : ''}</span>
        <div>
          <button class="btn btn--secondary btn--sm" id="templateBtn" type="button">📋 Templates</button>
          <button class="btn btn--primary btn--sm" id="addTaskBtn" type="button">+ Add Task</button>
        </div>
      </div>`;
```

with:

```js
      if (selectMode) {
        html += `<div class="admin-section-header">
          <span>${selectedTaskIds.size} selected</span>
          <div>
            <button class="btn btn--ghost btn--sm" id="selectAllBtn" type="button">Select All</button>
            <button class="btn btn--ghost btn--sm" id="deselectAllBtn" type="button">Deselect All</button>
            <button class="btn btn--secondary btn--sm" id="cancelSelectBtn" type="button">Cancel</button>
          </div>
        </div>`;
      } else {
        html += `<div class="admin-section-header">
          <span>${filtered.length} task${filtered.length !== 1 ? 's' : ''}</span>
          <div>
            <button class="btn btn--secondary btn--sm" id="selectModeBtn" type="button">Select</button>
            <button class="btn btn--secondary btn--sm" id="templateBtn" type="button">📋 Templates</button>
            <button class="btn btn--primary btn--sm" id="addTaskBtn" type="button">+ Add Task</button>
          </div>
        </div>`;
      }
```

- [ ] **Step 2: Bind the select mode toggle buttons in `bindTasksTab()`**

After the existing templates toggle binding (after line 1154), add:

```js
      // Select mode toggle
      main.querySelector('#selectModeBtn')?.addEventListener('click', () => {
        selectMode = true;
        editingTaskId = null;
        showingTemplates = false;
        render();
      });
      main.querySelector('#cancelSelectBtn')?.addEventListener('click', () => {
        selectMode = false;
        selectedTaskIds.clear();
        render();
      });
      main.querySelector('#selectAllBtn')?.addEventListener('click', () => {
        for (const item of main.querySelectorAll('.admin-list-item[data-task-id]')) {
          selectedTaskIds.add(item.dataset.taskId);
        }
        render();
      });
      main.querySelector('#deselectAllBtn')?.addEventListener('click', () => {
        selectedTaskIds.clear();
        render();
      });
```

- [ ] **Step 3: Verify the select mode toggle works**

Open admin.html → Tasks tab. Click "Select" — header should switch to show "0 selected", Select All, Deselect All, Cancel. Click Cancel — should return to normal header.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: add select mode toggle in tasks tab header"
```

---

### Task 4: Add checkboxes to task rows in select mode

**Files:**
- Modify: `admin.html:434-473` (task list rendering in `renderTasksTab`)
- Modify: `admin.html:1201-1216` (task row click/edit bindings in `bindTasksTab`)

- [ ] **Step 1: Update task row rendering to include checkboxes in select mode**

Replace the task list rendering block (lines 434-473, inside the `else` branch after empty state check):

```js
        html += `<div class="admin-list">`;
        for (const [id, task] of filtered) {
          const cat = catsObj[task.category];
          const owners = (task.owners || []).map(oid => peopleObj[oid]?.name || '?').join(', ');
          const pausedClass = task.status === 'paused' ? ' admin-list-item--paused' : '';
          const pausedBadge = task.status === 'paused' ? '<span class="admin-badge admin-badge--muted">⏸ Paused</span>' : '';
          const diffLabel = { easy: 'Easy', medium: 'Med', hard: 'Hard' }[task.difficulty] || 'Med';
          const todLabel = { am: 'AM', pm: 'PM', anytime: 'Any', both: 'AM+PM' }[task.timeOfDay] || 'Any';
          // Detail badges: est time, cooldown, exempt
          let detailBadges = '';
          if (task.estMin) detailBadges += `<span class="admin-badge">${task.estMin}m</span>`;
          detailBadges += `<span class="admin-badge">${todLabel}</span>`;
          if (task.cooldownDays) detailBadges += `<span class="admin-badge">CD ${task.cooldownDays}d</span>`;
          if (task.dedicatedDay != null) {
            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            detailBadges += `<span class="admin-badge">📅 ${dayNames[task.dedicatedDay] || task.dedicatedDay}</span>`;
          }
          if (task.dedicatedDate) detailBadges += `<span class="admin-badge">📅 ${task.dedicatedDate}</span>`;
          if (task.exempt) detailBadges += `<span class="admin-badge admin-badge--muted">Exempt</span>`;
          const selectedClass = selectMode && selectedTaskIds.has(id) ? ' admin-list-item--selected' : '';
          const checkboxHtml = selectMode ? `<input type="checkbox" class="bulk-checkbox" ${selectedTaskIds.has(id) ? 'checked' : ''}>` : '';
          const actionsHtml = selectMode ? '' : `<div class="admin-list-item__actions">
                <button class="btn btn--ghost btn--sm admin-edit-task" data-task-id="${id}" type="button">Edit</button>
                <button class="btn btn--ghost btn--sm admin-pause-task" data-task-id="${id}" type="button">${task.status === 'paused' ? '▶' : '⏸'}</button>
                <button class="btn btn--ghost btn--sm admin-delete-task" data-task-id="${id}" type="button">✕</button>
              </div>`;
          html += `<div class="admin-list-item admin-list-item--clickable${pausedClass}${selectedClass}" data-task-id="${id}">
            <div class="admin-list-item__row">
              ${checkboxHtml}<span class="admin-list-item__name">${esc(task.name)}${cat?.icon ? ' ' + cat.icon : ''}</span>
              <span class="admin-list-item__tags">
                <span class="admin-badge">${task.rotation}</span>
                <span class="admin-badge">${diffLabel}</span>
                ${pausedBadge}
              </span>
            </div>
            <div class="admin-list-item__tags" style="padding:0 0 2px">${detailBadges}</div>
            <div class="admin-list-item__row">
              <span class="admin-list-item__meta">${owners || 'Unassigned'}${cat ? ' · ' + cat.label : ''}</span>
              ${actionsHtml}
            </div>
          </div>`;
        }
        html += `</div>`;
```

- [ ] **Step 2: Update row click handlers to support select mode**

Replace the existing row click binding (lines 1201-1216):

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

with:

```js
      // Task row click — select mode toggles checkbox, normal mode opens edit
      for (const item of main.querySelectorAll('.admin-list-item[data-task-id]')) {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.admin-list-item__actions')) return;
          const tid = item.dataset.taskId;
          if (selectMode) {
            if (selectedTaskIds.has(tid)) {
              selectedTaskIds.delete(tid);
            } else {
              selectedTaskIds.add(tid);
            }
            render();
          } else {
            editingTaskId = editingTaskId === tid ? null : tid;
            render();
          }
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

- [ ] **Step 3: Verify checkbox behavior**

Open admin.html → Tasks tab → click "Select" → click task rows. Checkboxes should toggle, rows should highlight. "Select All" should check all visible rows. Action buttons (Edit/Pause/Delete) should be hidden in select mode. Click "Cancel" to exit.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: add checkboxes to task rows in select mode"
```

---

### Task 5: Add floating action bar

**Files:**
- Modify: `admin.html` — `renderTasksTab()` (after the modal overlay block, before `return html`)
- Modify: `admin.html` — `bindTasksTab()` (new bindings for action bar buttons)

- [ ] **Step 1: Render the floating action bar**

In `renderTasksTab()`, just before the `return html;` line (line 483), add:

```js
      // Floating action bar (select mode with selections)
      if (selectMode && selectedTaskIds.size > 0) {
        html += `<div class="bulk-action-bar">
          <button class="btn btn--ghost btn--sm" id="bulkCancelBtn" type="button">Cancel</button>
          <button class="btn btn--danger btn--sm" id="bulkDeleteBtn" type="button">Delete ${selectedTaskIds.size}</button>
          <button class="btn btn--primary btn--sm" id="bulkEditBtn" type="button">Edit ${selectedTaskIds.size}</button>
        </div>`;
      }
```

- [ ] **Step 2: Bind action bar buttons in `bindTasksTab()`**

After the select mode toggle bindings added in Task 3 Step 2, add:

```js
      // Floating action bar buttons
      main.querySelector('#bulkCancelBtn')?.addEventListener('click', () => {
        selectMode = false;
        selectedTaskIds.clear();
        render();
      });
      main.querySelector('#bulkEditBtn')?.addEventListener('click', () => {
        renderBulkEditModal();
      });
      main.querySelector('#bulkDeleteBtn')?.addEventListener('click', () => {
        handleBulkDelete();
      });
```

- [ ] **Step 3: Add stub functions for `renderBulkEditModal` and `handleBulkDelete`**

Add after `bindTaskForm()` (after line 1473):

```js
    // ── Bulk Actions ──

    function renderBulkEditModal() {
      // TODO: Task 6 will implement this
      console.log('bulk edit', selectedTaskIds);
    }

    async function handleBulkDelete() {
      // TODO: Task 7 will implement this
      console.log('bulk delete', selectedTaskIds);
    }
```

- [ ] **Step 4: Verify the floating bar appears**

Open admin.html → Tasks tab → "Select" → select 2+ tasks. Floating bar should appear at bottom with Cancel, Delete N, Edit N buttons. Cancel should exit select mode. Edit/Delete should log to console.

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat: add floating action bar for bulk actions"
```

---

### Task 6: Implement batch edit modal

**Files:**
- Modify: `admin.html` — replace `renderBulkEditModal` stub

- [ ] **Step 1: Implement `renderBulkEditModal()`**

Replace the stub `renderBulkEditModal` function with:

```js
    function renderBulkEditModal() {
      const pa = peopleArray();
      const ca = catsArray();
      const count = selectedTaskIds.size;

      const ownerChips = pa.map(p =>
        `<button type="button" class="owner-chip" data-id="${p.id}">${esc(p.name)}</button>`
      ).join('');

      const catOptions = ca.map(c =>
        `<option value="${esc(c.key)}">${esc(c.icon)} ${esc(c.label)}</option>`
      ).join('');

      const modalHtml = `<div class="task-form-backdrop" id="bulkEditBackdrop">
        <div class="task-form-modal">
          <div class="admin-form">
            <h3 class="admin-form__title">Edit ${count} task${count !== 1 ? 's' : ''}</h3>
            <div class="bulk-edit-form">
              <div class="form-group">
                <label class="form-label">Rotation</label>
                <select id="be_rotation">
                  <option value="" selected>— no change —</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="once">One-Time</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Owner Assignment Mode</label>
                <select id="be_assignMode">
                  <option value="" selected>— no change —</option>
                  <option value="rotate">Rotate</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Category</label>
                <select id="be_category">
                  <option value="" selected>— no change —</option>
                  ${catOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select id="be_status">
                  <option value="" selected>— no change —</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Difficulty</label>
                <select id="be_difficulty">
                  <option value="" selected>— no change —</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Time of Day</label>
                <select id="be_timeOfDay">
                  <option value="" selected>— no change —</option>
                  <option value="am">AM</option>
                  <option value="pm">PM</option>
                  <option value="anytime">Anytime</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Estimated Minutes</label>
                <input type="number" id="be_estMin" value="" min="0" max="120" placeholder="Leave blank for no change">
              </div>
              <div class="form-group">
                <label class="form-label">Owners</label>
                <div class="owner-chips" id="be_owners">${ownerChips}</div>
                <span class="owner-chips-hint" id="be_ownersHint">Leave unchanged</span>
              </div>
            </div>
            <div class="admin-form__actions mt-md">
              <button class="btn btn--secondary" id="bulkEditCancel" type="button">Cancel</button>
              <button class="btn btn--primary" id="bulkEditApply" type="button">Apply to ${count} task${count !== 1 ? 's' : ''}</button>
            </div>
          </div>
        </div>
      </div>`;

      // Mount modal into document body so it's above everything
      const mountDiv = document.createElement('div');
      mountDiv.id = 'bulkEditMount';
      mountDiv.innerHTML = modalHtml;
      document.body.appendChild(mountDiv);

      // Track whether owners were touched
      let ownersChanged = false;
      const ownersContainer = document.getElementById('be_owners');
      const ownersHint = document.getElementById('be_ownersHint');
      ownersContainer?.addEventListener('click', (e) => {
        const chip = e.target.closest('.owner-chip');
        if (chip) {
          chip.classList.toggle('owner-chip--selected');
          if (!ownersChanged) {
            ownersChanged = true;
            if (ownersHint) ownersHint.style.display = 'none';
          }
        }
      });

      // Backdrop click closes
      document.getElementById('bulkEditBackdrop')?.addEventListener('click', (e) => {
        if (e.target.id === 'bulkEditBackdrop') closeBulkEditModal();
      });

      // Cancel button
      document.getElementById('bulkEditCancel')?.addEventListener('click', () => {
        closeBulkEditModal();
      });

      // Apply button
      document.getElementById('bulkEditApply')?.addEventListener('click', async () => {
        const changes = {};
        const rotation = document.getElementById('be_rotation')?.value;
        const assignMode = document.getElementById('be_assignMode')?.value;
        const category = document.getElementById('be_category')?.value;
        const status = document.getElementById('be_status')?.value;
        const difficulty = document.getElementById('be_difficulty')?.value;
        const timeOfDay = document.getElementById('be_timeOfDay')?.value;
        const estMinVal = document.getElementById('be_estMin')?.value;

        if (rotation) changes.rotation = rotation;
        if (assignMode) changes.ownerAssignmentMode = assignMode;
        if (category) changes.category = category;
        if (status) changes.status = status;
        if (difficulty) changes.difficulty = difficulty;
        if (timeOfDay) changes.timeOfDay = timeOfDay;
        if (estMinVal !== '' && estMinVal != null) {
          const parsed = parseInt(estMinVal, 10);
          if (!isNaN(parsed)) changes.estMin = parsed;
        }
        if (ownersChanged) {
          changes.owners = Array.from(document.querySelectorAll('#be_owners .owner-chip--selected')).map(b => b.dataset.id);
        }

        if (Object.keys(changes).length === 0) {
          closeBulkEditModal();
          return;
        }

        // Disable button during save
        const applyBtn = document.getElementById('bulkEditApply');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Saving...'; }

        // Apply changes to each selected task
        const ids = [...selectedTaskIds];
        for (const id of ids) {
          const existing = tasksObj[id];
          if (!existing) continue;
          const merged = { ...existing, ...changes };
          await writeTask(id, merged);
          tasksObj[id] = merged;
        }

        // Single schedule rebuild
        const allSched = await readAllSchedule() || {};
        const allComp = await readCompletions() || {};
        const futureUpdates = buildScheduleUpdates(tasksObj, peopleArray(), settings, allComp, allSched, { includeToday: true }, catsObj);
        await multiUpdate(futureUpdates);

        closeBulkEditModal();
        selectMode = false;
        selectedTaskIds.clear();
        render();
        showUndoToast(`Updated ${ids.length} task${ids.length !== 1 ? 's' : ''}`, () => {});
      });
    }

    function closeBulkEditModal() {
      document.getElementById('bulkEditMount')?.remove();
    }
```

- [ ] **Step 2: Verify the batch edit modal works**

Open admin.html → Tasks tab → "Select" → select 3 tasks → click "Edit 3". Modal should appear with all 8 fields defaulting to "— no change —". Change difficulty to "Hard" and click "Apply to 3 tasks". Modal should close, toast should say "Updated 3 tasks", select mode should turn off, and the 3 tasks should now show "Hard" difficulty.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: implement batch edit modal with 8 fields"
```

---

### Task 7: Implement batch delete with confirmation

**Files:**
- Modify: `admin.html` — replace `handleBulkDelete` stub

- [ ] **Step 1: Implement `handleBulkDelete()`**

Replace the stub `handleBulkDelete` function with:

```js
    async function handleBulkDelete() {
      const count = selectedTaskIds.size;
      if (!confirm(`Delete ${count} task${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;

      const ids = [...selectedTaskIds];

      // Remove from local state immediately
      for (const id of ids) {
        delete tasksObj[id];
      }
      selectMode = false;
      selectedTaskIds.clear();
      editingTaskId = null;
      render();

      // Delete tasks from Firebase
      for (const id of ids) {
        await removeTask(id);
      }

      // Clean up orphaned schedule entries and completions
      try {
        const allSched = await readAllSchedule() || {};
        const allComp = await readCompletions() || {};
        const cleanupUpdates = {};
        const idSet = new Set(ids);
        for (const [dateKey, dayEntries] of Object.entries(allSched)) {
          for (const [entryKey, entry] of Object.entries(dayEntries || {})) {
            if (idSet.has(entry.taskId)) {
              cleanupUpdates[`schedule/${dateKey}/${entryKey}`] = null;
              if (allComp[entryKey]) {
                cleanupUpdates[`completions/${entryKey}`] = null;
              }
            }
          }
        }
        if (Object.keys(cleanupUpdates).length > 0) {
          await multiUpdate(cleanupUpdates);
        }
      } catch (e) {
        console.warn('Tasks deleted but schedule cleanup failed:', e);
      }

      // Rebuild schedule
      const allSched2 = await readAllSchedule() || {};
      const allComp2 = await readCompletions() || {};
      const futureUpdates = buildScheduleUpdates(tasksObj, peopleArray(), settings, allComp2, allSched2, { includeToday: true }, catsObj);
      await multiUpdate(futureUpdates);

      showUndoToast(`Deleted ${count} task${count !== 1 ? 's' : ''}`, () => {});
    }
```

- [ ] **Step 2: Verify batch delete works**

Open admin.html → Tasks tab → "Select" → select 2 tasks → click "Delete 2". Confirm dialog should appear. Click OK → tasks should disappear, toast should say "Deleted 2 tasks", select mode should turn off.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: implement batch delete with confirmation dialog"
```

---

### Task 8: Hide new-task form and templates in select mode

**Files:**
- Modify: `admin.html` — `renderTasksTab()` (template panel and new task form sections)

- [ ] **Step 1: Wrap template panel and new-task form in a `!selectMode` guard**

In `renderTasksTab()`, the template panel block (lines 421-423) and new task form block (lines 426-428) should only render outside select mode. Change:

```js
      // Template panel
      if (showingTemplates) {
        html += renderTemplatePanel();
      }

      // New task form at top
      if (editingTaskId === 'new') {
        html += renderTaskForm(null);
      }
```

to:

```js
      if (!selectMode) {
        // Template panel
        if (showingTemplates) {
          html += renderTemplatePanel();
        }

        // New task form at top
        if (editingTaskId === 'new') {
          html += renderTaskForm(null);
        }
      }
```

Also, the edit modal overlay (lines 477-481) should be hidden in select mode. Change:

```js
      // Modal overlay for editing (not for 'new' — new stays at top)
      if (editingTaskId && editingTaskId !== 'new') {
        html += `<div class="task-form-backdrop" id="taskFormBackdrop">
          <div class="task-form-modal">${renderTaskForm(editingTaskId)}</div>
        </div>`;
      }
```

to:

```js
      // Modal overlay for editing (not for 'new' — new stays at top)
      if (!selectMode && editingTaskId && editingTaskId !== 'new') {
        html += `<div class="task-form-backdrop" id="taskFormBackdrop">
          <div class="task-form-modal">${renderTaskForm(editingTaskId)}</div>
        </div>`;
      }
```

- [ ] **Step 2: Verify templates and forms don't appear in select mode**

Open admin.html → open template panel → enter select mode → template panel should disappear. Exit select mode → template panel should be gone (since `showingTemplates` was reset by the selectModeBtn handler).

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: hide task forms and templates in select mode"
```

---

### Task 9: End-to-end verification and CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (changelog)

- [ ] **Step 1: Full manual test of all bulk action flows**

Test the following scenarios in admin.html:

1. Enter select mode → select 3 tasks → "Select All" → verify all visible tasks selected
2. "Deselect All" → verify count is 0, action bar disappears
3. Select 2 tasks → change filters → selected count persists in header
4. Select 3 tasks → "Edit 3" → change rotation to weekly + difficulty to hard → "Apply to 3 tasks" → verify all 3 updated
5. Select 2 tasks → "Delete 2" → confirm → verify tasks removed
6. Enter select mode → switch to People tab → switch back to Tasks tab → verify select mode is off
7. Batch edit with owners: select tasks → Edit → click owner chips → verify "Leave unchanged" hint disappears → apply → verify owners changed
8. Batch edit with no changes → click Apply → modal should close silently (no writes)

- [ ] **Step 2: Update CLAUDE.md changelog**

Replace the last entry in the changelog (the oldest one) with the new entry. The changelog section should have "Bulk admin actions" as the newest entry at the top:

Add to top of changelog:
```
- Bulk admin actions: multi-select mode in tasks tab, batch edit (rotation, assignment mode, category, status, difficulty, time of day, est. minutes, owners), batch delete with confirmation, floating action bar, auto schedule rebuild
```

Remove the oldest changelog entry to keep it at 5 entries.

- [ ] **Step 3: Commit**

```bash
git add admin.html styles/admin.css CLAUDE.md
git commit -m "feat: bulk admin actions — multi-select, batch edit, batch delete"
```
