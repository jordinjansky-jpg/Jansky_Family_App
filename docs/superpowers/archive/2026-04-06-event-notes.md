# Event Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-instance notes to event tasks, editable from the detail sheet, quick-add, and admin.

**Architecture:** Notes stored as a `notes` string field on both task definitions (`rundown/tasks/{id}`) and schedule entries (`rundown/schedule/{date}/{entryKey}`). Scheduler copies task-level notes to entries on generation. Admin edits propagate to all future entries; detail sheet edits are per-instance.

**Tech Stack:** Vanilla JS, Firebase Realtime Database (compat SDK), CSS

---

## File Map

- **Modify:** `shared/components.js` — add notes textarea to task form, add notes display/edit to detail sheet
- **Modify:** `shared/scheduler.js` — copy `task.notes` into generated schedule entries
- **Modify:** `styles/components.css` — add notes-related styles
- **Modify:** `dashboard.js` — read/save notes in quick-add and edit-task handlers, wire up detail sheet note editing
- **Modify:** `calendar.html` — read/save notes in quick-add and edit-task handlers, wire up detail sheet note editing
- **Modify:** `tracker.html` — read/save notes in edit-task handler, wire up detail sheet note editing
- **Modify:** `admin.html` — read/save notes in task form handler, propagate to future entries
- **Modify:** `kid.html` — show notes read-only in kid detail sheet
- **Modify:** `CLAUDE.md` — update schema docs

---

### Task 1: Scheduler — Copy notes to generated entries

**Files:**
- Modify: `shared/scheduler.js:164-170` (generateRotatedEntries baseEntry)
- Modify: `shared/scheduler.js:456-462` (generateDuplicateEntries baseEntry)

- [ ] **Step 1: Add notes to baseEntry in `generateRotatedEntries`**

In `shared/scheduler.js`, edit the `baseEntry` object at line 166-170:

```js
  const baseEntry = {
    taskId,
    rotationType: task.rotation,
    ownerAssignmentMode: mode,
    ...(task.notes ? { notes: task.notes } : {})
  };
```

- [ ] **Step 2: Add notes to baseEntry in `generateDuplicateEntries`**

In `shared/scheduler.js`, edit the `baseEntry` object at line 458-462:

```js
  const baseEntry = {
    taskId,
    rotationType: task.rotation,
    ownerAssignmentMode: 'duplicate',
    ...(task.notes ? { notes: task.notes } : {})
  };
```

- [ ] **Step 3: Commit**

```bash
git add shared/scheduler.js
git commit -m "feat(scheduler): copy task notes to generated schedule entries"
```

---

### Task 2: Task form — Add notes textarea to `renderTaskFormCompact`

**Files:**
- Modify: `shared/components.js:542-545` (after eventTimeGroup)

- [ ] **Step 1: Add notes textarea after event time group**

In `shared/components.js`, find the event time group block (lines 542-545):

```js
    <div class="form-group" id="${prefix}_eventTimeGroup" style="display:${isEvent ? '' : 'none'}">
      <label class="form-label">Event Time</label>
      <input type="time" id="${prefix}_eventTime" value="${task.eventTime || ''}">
    </div>
```

Add immediately after it:

```js
    <div class="form-group" id="${prefix}_notesGroup" style="display:${isEvent ? '' : 'none'}">
      <label class="form-label">Notes</label>
      <textarea id="${prefix}_notes" class="task-detail__notes-input" rows="3" placeholder="Add notes for this event...">${esc(task.notes || '')}</textarea>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add shared/components.js
git commit -m "feat(components): add notes textarea to task form for events"
```

---

### Task 3: Detail sheet — Add notes display and inline editing

**Files:**
- Modify: `shared/components.js:309-408` (renderTaskDetailSheet)

- [ ] **Step 1: Add `isEvent` and `readOnly` to destructured options**

In `shared/components.js` at line 310-313, add `isEvent` and `readOnly` to the destructured options:

```js
  const {
    entryKey, entry, task, person, category, completed, points,
    sliderMin, sliderMax, currentOverride, gradePreview,
    people, showDelegate, showMove, showEdit, dateKey, showPoints = true,
    isEvent = false, readOnly = false
  } = options;
```

- [ ] **Step 2: Add notes section after the meta/source-info block, before the complete button**

Find the closing of the task info div (line 341: `</div>`;) and the complete button (line 343). Insert between them:

```js
  // Event notes
  if (isEvent) {
    const noteText = entry.notes || '';
    if (readOnly) {
      // Read-only mode (kid mode)
      if (noteText) {
        html += `<div class="task-detail__notes mt-md">
          <span class="form-label">Notes</span>
          <div class="task-detail__notes-text">${esc(noteText)}</div>
        </div>`;
      }
    } else {
      html += `<div class="task-detail__notes mt-md">
        <span class="form-label">Notes</span>
        <div class="task-detail__notes-display" id="notesDisplay" style="display:${noteText ? '' : 'none'}">
          <div class="task-detail__notes-text" id="notesText">${esc(noteText)}</div>
          <button class="btn btn--ghost btn--sm" id="notesEditBtn" type="button">Edit</button>
        </div>
        <button class="btn btn--ghost btn--sm" id="notesAddBtn" type="button" style="display:${noteText ? 'none' : ''}">+ Add Note</button>
        <div class="task-detail__notes-editor" id="notesEditor" style="display:none">
          <textarea class="task-detail__notes-input" id="notesInput" rows="3" placeholder="Add notes for this event...">${esc(noteText)}</textarea>
          <div class="task-detail__notes-actions">
            <button class="btn btn--secondary btn--sm" id="notesCancelBtn" type="button">Cancel</button>
            <button class="btn btn--primary btn--sm" id="notesSaveBtn" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">Save</button>
          </div>
        </div>
      </div>`;
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add shared/components.js
git commit -m "feat(components): add notes display and inline editing to detail sheet"
```

---

### Task 4: CSS — Add notes styles

**Files:**
- Modify: `styles/components.css`

- [ ] **Step 1: Add notes styles at the end of components.css**

Append to `styles/components.css`:

```css
/* Event notes */
.task-detail__notes {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.task-detail__notes-display {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.task-detail__notes-text {
  flex: 1;
  white-space: pre-line;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: var(--surface-alt, var(--bg-secondary));
  border-radius: var(--radius-sm, 6px);
  padding: 0.5rem 0.75rem;
  line-height: 1.4;
}

.task-detail__notes-input {
  width: 100%;
  min-height: 4rem;
  padding: 0.5rem 0.75rem;
  font-size: var(--font-size-sm);
  font-family: inherit;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 6px);
  background: var(--bg-primary);
  color: var(--text-primary);
  resize: vertical;
}

.task-detail__notes-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.task-detail__notes-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.task-detail__notes-editor {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles/components.css
git commit -m "feat(css): add event notes styles"
```

---

### Task 5: Dashboard — Wire up notes in save handlers and detail sheet

**Files:**
- Modify: `dashboard.js:681-698` (renderTaskDetailSheet call)
- Modify: `dashboard.js:1019-1034` (et_save handler — edit task)
- Modify: `dashboard.js:1157-1172` (qa_save handler — quick-add)
- Modify: `dashboard.js` (detail sheet event binding — notes save handler)

- [ ] **Step 1: Pass `isEvent` to `renderTaskDetailSheet`**

In `dashboard.js` at the `renderTaskDetailSheet` call (~line 681), add the `isEvent` option:

```js
  const sheetContent = renderTaskDetailSheet({
    entryKey,
    entry: { ...entry, dateKey: dateKey || viewDate },
    task,
    person,
    category: cat,
    completed,
    points: { possible: pts },
    sliderMin: settings?.sliderMin ?? 0,
    sliderMax: settings?.sliderMax ?? 150,
    currentOverride: currentOverride != null ? currentOverride : 100,
    gradePreview,
    people,
    showDelegate: true,
    showMove: true,
    showEdit: true,
    showPoints: settings?.showPoints !== false,
    isEvent: !!cat?.isEvent
  });
```

- [ ] **Step 2: Add notes to edit-task save handler (`et_save`)**

In `dashboard.js` at the `et_save` handler (~line 1019), add notes to the `updated` object. After the `eventTime` line:

```js
    const eventTime = catIsEvent ? (document.getElementById('et_eventTime')?.value || null) : null;
    const notes = catIsEvent ? (document.getElementById('et_notes')?.value.trim() || null) : null;
    const updated = {
      ...task,
      name,
      rotation,
      difficulty: document.getElementById('et_difficulty')?.value || task.difficulty,
      timeOfDay: document.getElementById('et_timeOfDay')?.value || task.timeOfDay,
      estMin: (v => isNaN(v) ? 10 : v)(parseInt(document.getElementById('et_estMin')?.value, 10)),
      category: document.getElementById('et_category')?.value || task.category,
      owners,
      ownerAssignmentMode: activeMode,
      dedicatedDay,
      dedicatedDate: effectiveDedicatedDate,
      eventTime,
      notes,
      cooldownDays: cooldown ? parseInt(cooldown, 10) : null,
      exempt: document.getElementById('et_exempt')?.checked || false
    };
```

- [ ] **Step 3: Add notes to quick-add save handler (`qa_save`)**

In `dashboard.js` at the `qa_save` handler (~line 1157), add notes to `taskData`. After the `eventTime` line:

```js
    const eventTime = isEvent ? (document.getElementById('qa_eventTime')?.value || null) : null;
    const notes = isEvent ? (document.getElementById('qa_notes')?.value.trim() || null) : null;
    const taskData = {
      name,
      rotation,
      difficulty: document.getElementById('qa_difficulty')?.value || 'medium',
      timeOfDay: document.getElementById('qa_timeOfDay')?.value || 'anytime',
      estMin: (v => isNaN(v) ? 10 : v)(parseInt(document.getElementById('qa_estMin')?.value, 10)),
      category: catKey,
      owners,
      ownerAssignmentMode: assignMode,
      dedicatedDay,
      dedicatedDate,
      eventTime,
      notes,
      cooldownDays: parseInt(document.getElementById('qa_cooldown')?.value, 10) || null,
      exempt: !!document.getElementById('qa_exempt')?.checked,
      status: 'active',
      createdDate: today
    };
```

- [ ] **Step 4: Wire up notes inline editing in detail sheet event binding**

Find the function that binds detail sheet events in `dashboard.js` (search for `sheetToggleComplete` event listener setup). Add after existing event bindings:

```js
  // Notes inline editing
  const notesAddBtn = document.getElementById('notesAddBtn');
  const notesEditBtn = document.getElementById('notesEditBtn');
  const notesCancelBtn = document.getElementById('notesCancelBtn');
  const notesSaveBtn = document.getElementById('notesSaveBtn');
  const notesEditor = document.getElementById('notesEditor');
  const notesDisplay = document.getElementById('notesDisplay');
  const notesInput = document.getElementById('notesInput');

  function openNotesEditor() {
    if (notesEditor) notesEditor.style.display = '';
    if (notesDisplay) notesDisplay.style.display = 'none';
    if (notesAddBtn) notesAddBtn.style.display = 'none';
    if (notesInput) notesInput.focus();
  }

  function closeNotesEditor() {
    if (notesEditor) notesEditor.style.display = 'none';
    const hasText = notesInput?.value.trim();
    if (notesDisplay) notesDisplay.style.display = hasText ? '' : 'none';
    if (notesAddBtn) notesAddBtn.style.display = hasText ? 'none' : '';
  }

  notesAddBtn?.addEventListener('click', openNotesEditor);
  notesEditBtn?.addEventListener('click', openNotesEditor);
  notesCancelBtn?.addEventListener('click', closeNotesEditor);

  notesSaveBtn?.addEventListener('click', async () => {
    const noteValue = notesInput?.value.trim() || null;
    const ek = notesSaveBtn.dataset.entryKey;
    const dk = notesSaveBtn.dataset.dateKey;
    if (ek && dk) {
      await writeData(`schedule/${dk}/${ek}/notes`, noteValue);
      // Update local entry
      if (schedule[dk]?.[ek]) schedule[dk][ek].notes = noteValue;
    }
    // Update display
    const notesText = document.getElementById('notesText');
    if (notesText) notesText.textContent = noteValue || '';
    closeNotesEditor();
  });
```

Note: `writeData` needs to be imported. Check the existing imports at the top of `dashboard.js` and add `writeData` to the import from `./shared/firebase.js` if not already there.

- [ ] **Step 5: Add `writeData` to dashboard.js imports if needed**

Check the existing firebase imports in `dashboard.js` line 1. If `writeData` is not imported, add it. Alternatively, use `multiUpdate` which is already imported:

```js
// Alternative using multiUpdate (already imported):
await multiUpdate({ [`schedule/${dk}/${ek}/notes`]: noteValue });
```

Use whichever of `writeData` or `multiUpdate` is already imported.

- [ ] **Step 6: Show/hide notes group on category change**

Find the category change handler in dashboard.js (search for `et_category` change listener and `qa_category` change listener). Add notes group visibility toggling alongside the existing `eventTimeGroup` toggling:

For each category change handler, after the `eventTimeGroup` display toggle line, add:

```js
    const notesGroup = document.getElementById('et_notesGroup'); // or 'qa_notesGroup'
    if (notesGroup) notesGroup.style.display = isEvent ? '' : 'none';
```

- [ ] **Step 7: Commit**

```bash
git add dashboard.js
git commit -m "feat(dashboard): wire up event notes in save handlers and detail sheet"
```

---

### Task 6: Calendar — Wire up notes in save handlers and detail sheet

**Files:**
- Modify: `calendar.html:574` (renderTaskDetailSheet call)
- Modify: `calendar.html:860` (et_save handler)
- Modify: `calendar.html:1109` (qa_save handler)
- Modify: `calendar.html` (detail sheet event binding — notes save handler)

- [ ] **Step 1: Pass `isEvent` to `renderTaskDetailSheet`**

Find the `renderTaskDetailSheet` call at ~line 574 in `calendar.html`. Add `isEvent: !!cat?.isEvent` to the options object.

- [ ] **Step 2: Add notes to edit-task save handler (`et_save`)**

At ~line 860 in `calendar.html`, in the `et_save` handler, read notes and include in the save object. Same pattern as dashboard Task 5 Step 2 — read `document.getElementById('et_notes')?.value.trim() || null` when `catIsEvent`, add `notes` to the updated task data.

- [ ] **Step 3: Add notes to quick-add save handler (`qa_save`)**

At ~line 1109 in `calendar.html`, in the `qa_save` handler, read notes and include in task data. Same pattern as dashboard Task 5 Step 3.

- [ ] **Step 4: Wire up notes inline editing in detail sheet**

Same pattern as dashboard Task 5 Step 4 — add notes editor event binding after existing detail sheet event bindings. Use `multiUpdate` or `writeData` (whichever is imported).

- [ ] **Step 5: Show/hide notes group on category change**

Same pattern as dashboard Task 5 Step 6 — toggle `notesGroup` display in category change handlers.

- [ ] **Step 6: Commit**

```bash
git add calendar.html
git commit -m "feat(calendar): wire up event notes in save handlers and detail sheet"
```

---

### Task 7: Tracker — Wire up notes in save handler and detail sheet

**Files:**
- Modify: `tracker.html:555` (renderTaskDetailSheet call)
- Modify: `tracker.html:825` (et_save handler)
- Modify: `tracker.html` (detail sheet event binding)

- [ ] **Step 1: Pass `isEvent` to `renderTaskDetailSheet`**

Find the `renderTaskDetailSheet` call at ~line 555 in `tracker.html`. Add `isEvent: !!cat?.isEvent` to the options object.

- [ ] **Step 2: Add notes to edit-task save handler (`et_save`)**

At ~line 825 in `tracker.html`, read notes and include in save data. Same pattern as dashboard Task 5 Step 2.

- [ ] **Step 3: Wire up notes inline editing in detail sheet**

Same pattern as dashboard Task 5 Step 4.

- [ ] **Step 4: Show/hide notes group on category change**

Same pattern as dashboard Task 5 Step 6.

- [ ] **Step 5: Commit**

```bash
git add tracker.html
git commit -m "feat(tracker): wire up event notes in save handler and detail sheet"
```

---

### Task 8: Admin — Wire up notes in task form and propagate to future entries

**Files:**
- Modify: `admin.html:1374-1477` (tf_save handler)

- [ ] **Step 1: Add notes to admin task save handler (`tf_save`)**

In `admin.html` at ~line 1397, after the `eventTime` line, read notes:

```js
        const eventTime = catIsEvent ? (root.querySelector('#tf_eventTime')?.value || null) : null;
        const notes = catIsEvent ? (root.querySelector('#tf_notes')?.value.trim() || null) : null;
```

Add `notes` to the `taskData` object at ~line 1399-1414:

```js
        const taskData = {
          name,
          rotation: effectiveRotation,
          difficulty: root.querySelector('#tf_difficulty')?.value || 'medium',
          timeOfDay: root.querySelector('#tf_timeOfDay')?.value || 'anytime',
          estMin: (v => isNaN(v) ? 10 : v)(parseInt(root.querySelector('#tf_estMin')?.value, 10)),
          category: catKey,
          owners,
          ownerAssignmentMode: effectiveMode,
          dedicatedDay,
          dedicatedDate: effectiveDedicatedDate,
          eventTime,
          notes,
          cooldownDays: cooldown ? parseInt(cooldown, 10) : null,
          exempt: root.querySelector('#tf_exempt')?.checked || false,
          status: 'active'
        };
```

- [ ] **Step 2: For new tasks, add notes to today's schedule entries**

In the new-task branch (~line 1428), add notes to the `baseEntry`:

```js
            const baseEntry = { taskId: newId, rotationType: taskData.rotation, ownerAssignmentMode: effectiveMode, ...(taskData.notes ? { notes: taskData.notes } : {}) };
```

No further changes needed — the `buildScheduleUpdates` call at line 1458 will generate future entries via `generateRotatedEntries`/`generateDuplicateEntries` which already copy notes (from Task 1).

- [ ] **Step 3: Show/hide notes group on category change**

Find the category change handlers in admin.html (search for `tf_category` change or `isEvent` toggling). Add notes group visibility toggling:

```js
        const notesGroup = root.querySelector('#tf_notesGroup');
        if (notesGroup) notesGroup.style.display = isEvent ? '' : 'none';
```

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): wire up event notes in task form with future entry propagation"
```

---

### Task 9: Kid mode — Show notes read-only in detail sheet

**Files:**
- Modify: `kid.html:1593-1617` (renderKidTaskSheet)

- [ ] **Step 1: Add read-only notes display to kid detail sheet**

In `kid.html`, find `renderKidTaskSheet` at ~line 1593. After the source-info lines (~line 1617, closing `</div>` of task-detail__info), add:

```js
          // Event notes (read-only)
          const noteText = entry.notes || '';
          if (cat?.isEvent && noteText) {
            html += `<div class="task-detail__notes mt-md">
              <span class="form-label">Notes</span>
              <div class="task-detail__notes-text">${esc(noteText)}</div>
            </div>`;
          }
```

Make sure `esc` is available in kid.html scope (it should be — check imports).

- [ ] **Step 2: Commit**

```bash
git add kid.html
git commit -m "feat(kid): show event notes read-only in detail sheet"
```

---

### Task 10: Update CLAUDE.md schema docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update task schema**

In `CLAUDE.md`, find the tasks schema line:

```
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, dedicatedDate?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt?, eventTime? }
```

Add `notes?` to the field list:

```
│   └── {pushId}      ← { name, rotation, owners[], ownerAssignmentMode,
│                         timeOfDay, dedicatedDay?, dedicatedDate?, cooldownDays?, estMin,
│                         difficulty, category, status, createdDate, exempt?, eventTime?, notes? }
```

- [ ] **Step 2: Update schedule entry schema**

Find the schedule entry line:

```
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay }
```

Add `notes?`:

```
│       └── {entryKey} ← { taskId, ownerId, rotationType, ownerAssignmentMode, timeOfDay, notes? }
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add notes field to task and schedule entry schema"
```

---

### Task 11: Update service worker cache version

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump CACHE_NAME version**

Find the `CACHE_NAME` constant in `sw.js` and increment the version number so the new CSS/JS changes are picked up by clients.

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "chore: bump service worker cache version for event notes"
```
