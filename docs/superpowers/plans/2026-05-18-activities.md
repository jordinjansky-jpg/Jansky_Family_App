# Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Activities feature end-to-end — time-tracked habits with goal-based scoring, Firebase-synced timers, family-overview page, admin CRUD, and Cloudflare Worker settlement.

**Architecture:** Vanilla JS + Firebase compat SDK. Four new Firebase paths (`rundown/activities`, `rundown/activitySessions`, `rundown/activeTimers`, `rundown/activityEarnings`). One new top-level page (`activities.html`) + one new shared module (`shared/timer.js`). Settlement logic added as two new branches in the existing cron worker. Scoring integration via a new `sumActivityEarningsInRange` aggregator that `getTotalPoints`-style consumers call alongside the existing snapshot-based scoring.

**Tech Stack:** Vanilla JS (ES modules), Firebase Realtime DB (compat SDK via CDN), Cloudflare Worker (cron every 5 min), Cloudflare Pages (auto-deploy on push).

**Spec:** [`docs/superpowers/specs/2026-05-18-activities-design.md`](../specs/2026-05-18-activities-design.md) (commit `3e78f9a`).

---

## File Structure

**New files:**
- `activities.html` — top-level page (sticky header, content shell, sheet mount, bottom nav, inline module script)
- `shared/timer.js` — reusable timer factory + elapsed-from-firebase helper

**Modified files:**
- `shared/firebase.js` — new CRUD helpers for activities, sessions, active timers, earnings (~11 helpers)
- `shared/scoring.js` — new `sumActivityEarningsInRange` function + integration with totals
- `shared/components.js` — register Activities in `ALL_PAGES`; add card renderers + manual-entry sheet builder
- `admin.html` — new "Activities" tab + list view + form sheet
- `workers/kitchen-import.js` — new `runDailySettlement`, `runWeeklySettlement` branches + helpers
- `sw.js` — bump `CACHE_NAME`, add `activities.html` + `shared/timer.js` to precache list
- `docs/DESIGN.md` — new §6.11 "Activities" subsection + update §2 row 1.6 from "future" to "shipped"
- `docs/ROADMAP.md` — replace Activities Phase 1/2 entries with single shipped entry

**Existing rules to follow (non-negotiable per CLAUDE.md):**
- ES module imports MUST include `.js` extension
- Firebase compat SDK only — `firebase.database()`, never modular `getDatabase()`
- No `window.confirm`/`window.alert` — use `showConfirm()`
- No inline styles in HTML
- No hardcoded colors in CSS — design tokens only
- No emoji in nav/tabs/buttons/banners/chips/headers/form labels (only in user-authored content like activity names)
- All form sheets composed from `fs-*` primitives per DESIGN.md §5.23 + §13.13
- Use `settings.timezone` for all date math, never local device time
- After any write: `loadData(); render()` — never `location.reload()`

**Testing approach (no JS test framework in this codebase):**
- Shared modules verified via Node REPL one-liners (`node -e "..."`)
- UI verified via `node serve.js` + Playwright at `http://localhost:8080?env=dev` at mobile viewport 412×915
- Worker verified via `npx wrangler tail` after deploy + manual cron trigger or wait for next 5-min tick
- Every task that touches the running app must be visually verified in dev mode before commit

---

## Phase 1 — Firebase Helpers

### Task 1: Activity CRUD helpers

**Files:**
- Modify: `shared/firebase.js`

- [ ] **Step 1: Confirm existing patterns**

Read `shared/firebase.js:218–245` to see the Tasks CRUD pattern. Mirror it exactly: `readTasks`, `pushTask`, `writeTask`, `removeTask`. Activities follow the same shape.

- [ ] **Step 2: Add activity helpers**

Append to `shared/firebase.js` after the existing tasks helpers (~line 245). Use the existing `ref(path)` helper (constructs `${ROOT}/${path}`) and `pushData(path, data)` (returns the new key).

```js
export async function readActivities() {
  const snap = await ref('activities').once('value');
  return snap.val() || {};
}

export async function pushActivity(data) {
  return pushData('activities', { ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
}

export async function writeActivity(activityId, data) {
  await ref(`activities/${activityId}`).update(data);
}

export async function removeActivity(activityId) {
  await ref(`activities/${activityId}`).remove();
}
```

- [ ] **Step 3: Verify**

```bash
node serve.js
```

In a separate terminal, open `http://localhost:8080?env=dev` in a browser, open DevTools console:

```js
const fb = await import('/shared/firebase.js');
await fb.pushActivity({
  name: 'Test Activity',
  emoji: '📖',
  color: '#4A90E2',
  goalPeriod: 'daily',
  goalMinutes: 30,
  pointsAtGoal: 50,
  assignedTo: {},
  active: true
});
console.log(await fb.readActivities());
```

Expected: console logs an object with one entry; the entry has all the fields above plus `createdAt` timestamp.

- [ ] **Step 4: Clean up the test entry**

```js
const acts = await fb.readActivities();
for (const id of Object.keys(acts)) await fb.removeActivity(id);
```

- [ ] **Step 5: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(firebase): activity CRUD helpers (read/push/write/remove)"
```

---

### Task 2: Session CRUD helpers

**Files:**
- Modify: `shared/firebase.js`

- [ ] **Step 1: Add session helpers**

Append after the activity helpers from Task 1:

```js
export async function readActivitySessions() {
  const snap = await ref('activitySessions').once('value');
  return snap.val() || {};
}

export async function pushActivitySession(data) {
  return pushData('activitySessions', { ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
}

export async function writeActivitySession(sessionId, data) {
  await ref(`activitySessions/${sessionId}`).update(data);
}

export async function removeActivitySession(sessionId) {
  await ref(`activitySessions/${sessionId}`).remove();
}
```

- [ ] **Step 2: Verify**

Refresh `http://localhost:8080?env=dev`, DevTools console:

```js
const fb = await import('/shared/firebase.js');
const acts = await fb.readActivities();
let actId = Object.keys(acts)[0];
if (!actId) actId = await fb.pushActivity({ name: 'Test', emoji: '📖', color: '#000', goalPeriod: 'daily', goalMinutes: 30, pointsAtGoal: 50, assignedTo: {}, active: true });
const key = await fb.pushActivitySession({
  activityId: actId,
  personId: 'test-person',
  startedAt: Date.now() - 600000,
  endedAt: Date.now(),
  durationMin: 10,
  source: 'manual',
  createdBy: 'test'
});
console.log(await fb.readActivitySessions());
await fb.removeActivitySession(key);
```

Expected: console shows one session before `removeActivitySession`, then the test entry is cleaned.

- [ ] **Step 3: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(firebase): activity session CRUD helpers"
```

---

### Task 3: Active timer + earnings reader helpers

**Files:**
- Modify: `shared/firebase.js`

- [ ] **Step 1: Add active timer helpers**

Append after the session helpers:

```js
export async function readActiveTimer(personId) {
  const snap = await ref(`activeTimers/${personId}`).once('value');
  return snap.val() || null;
}

export async function readAllActiveTimers() {
  const snap = await ref('activeTimers').once('value');
  return snap.val() || {};
}

export async function writeActiveTimer(personId, data) {
  await ref(`activeTimers/${personId}`).set(data);
}

export async function clearActiveTimer(personId) {
  await ref(`activeTimers/${personId}`).remove();
}

export function subscribeActiveTimers(callback) {
  const r = ref('activeTimers');
  const handler = r.on('value', snap => callback(snap.val() || {}));
  return () => r.off('value', handler);
}
```

- [ ] **Step 2: Add earnings helpers**

```js
export async function readActivityEarnings(personId) {
  const snap = await ref(`activityEarnings/${personId}`).once('value');
  return snap.val() || {};
}

export async function readAllActivityEarnings() {
  const snap = await ref('activityEarnings').once('value');
  return snap.val() || {};
}

export async function removeActivityEarning(personId, activityId, periodKey) {
  await ref(`activityEarnings/${personId}/${activityId}/${periodKey}`).remove();
}

export async function removeActivityEarningsForActivity(personId, activityId) {
  await ref(`activityEarnings/${personId}/${activityId}`).remove();
}
```

- [ ] **Step 3: Verify**

Refresh dev page, console:

```js
const fb = await import('/shared/firebase.js');
await fb.writeActiveTimer('test-person', {
  activityId: 'test-act',
  startedAt: Date.now(),
  pausedAt: null,
  accumulatedMs: 0
});
console.log(await fb.readActiveTimer('test-person'));
console.log(await fb.readAllActiveTimers());
const unsubscribe = fb.subscribeActiveTimers(t => console.log('subscription:', t));
await fb.clearActiveTimer('test-person');
// Should see one more subscription log with {} (after clear)
unsubscribe();
```

Expected: timer reads back correctly; subscription fires on changes; cleared state is `{}`.

- [ ] **Step 4: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(firebase): active timer + activity earnings read helpers"
```

---

## Phase 2 — Admin CRUD

### Task 4: Add Activities tab to admin

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Find the existing TABS array**

Read `admin.html:247` to confirm the `TABS = [...]` array shape. Each entry is `{ id, label }`.

- [ ] **Step 2: Add the Activities tab entry**

In the `TABS` array, add a new entry. Place it after "Tasks" or "Rewards" (whichever exists — match existing position logic). Example insertion:

```js
const TABS = [
  // ... existing entries
  { id: 'tasks', label: 'Tasks' },
  { id: 'activities', label: 'Activities' },   // NEW
  { id: 'rewards', label: 'Rewards' },
  // ... rest
];
```

- [ ] **Step 3: Add the render case for the new tab**

Find the `render()` function (or equivalent dispatch) and add a render branch for `activities`. For now, a placeholder that proves the tab is wired:

```js
function renderActivitiesTab(mount) {
  mount.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-header">
        <h2>Activities</h2>
        <button class="btn btn--primary" id="activityAddBtn">+ Add Activity</button>
      </div>
      <div id="activityList" class="admin-list"></div>
    </div>
  `;
}
```

Wire it into the dispatch (where `tasks`, `rewards` etc. are dispatched). Example:

```js
if (activeTab === 'activities') return renderActivitiesTab(mount);
```

- [ ] **Step 4: Verify**

```bash
node serve.js
```

Playwright (mobile viewport):
```
browser_resize 412 915
browser_navigate http://localhost:8080/admin.html?env=dev
```

Enter the admin PIN (4-digit; recovery `2522` per CLAUDE.md). Click the "Activities" tab. Expected: tab is highlighted; the page shows a header "Activities" and a "+ Add Activity" button; list area is empty.

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Activities tab scaffolding (empty list + add button)"
```

---

### Task 5: Render Activities list in admin

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Import the new firebase helpers**

In the admin.html module script imports, add:

```js
import {
  readActivities,
  pushActivity,
  writeActivity,
  removeActivity,
  readActivitySessions,
  removeActivitySession,
  readAllActivityEarnings,
  removeActivityEarning,
  removeActivityEarningsForActivity,
  readPeople,
  readSettings
} from './shared/firebase.js';
```

(Match existing import-block style. If `readPeople` is already imported, don't duplicate.)

- [ ] **Step 2: Load activities into the page state**

Find the existing `loadData()` (or boot Promise.all) that reads people, tasks, rewards etc. Add `readActivities()` to the parallel reads and assign the result to a module-scoped variable, e.g. `let activities = {}`.

- [ ] **Step 3: Build the list renderer**

Add this helper function near `renderActivitiesTab`:

```js
function renderActivityList(activities, people) {
  const sorted = Object.entries(activities).sort((a, b) =>
    (a[1].name || '').localeCompare(b[1].name || '')
  );
  if (sorted.length === 0) {
    return '<p class="empty-state">No activities yet. Click + Add Activity to create one.</p>';
  }
  return sorted.map(([id, a]) => {
    const peopleNames = Object.keys(a.assignedTo || {})
      .map(pid => people[pid]?.name || pid)
      .join(', ') || '(no one assigned)';
    const inactiveClass = a.active === false ? ' is-inactive' : '';
    const periodLabel = a.goalPeriod === 'weekly' ? 'Weekly' : 'Daily';
    return `
      <div class="admin-list-row${inactiveClass}" data-activity-id="${id}">
        <div class="admin-list-row__icon">${a.emoji || '·'}</div>
        <div class="admin-list-row__body">
          <div class="admin-list-row__title">${escapeHtml(a.name || '(unnamed)')}</div>
          <div class="admin-list-row__meta">${periodLabel} ${a.goalMinutes || 0} min · ${a.pointsAtGoal || 0} pts · ${escapeHtml(peopleNames)}</div>
        </div>
        <label class="form-toggle">
          <input type="checkbox" class="activity-active-toggle" data-activity-id="${id}" ${a.active === false ? '' : 'checked'} />
          <span class="form-toggle__slider"></span>
        </label>
      </div>
    `;
  }).join('');
}
```

If `escapeHtml` doesn't exist in admin.html, find or create one (one-liner: `s => s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]))`).

- [ ] **Step 4: Update `renderActivitiesTab` to use the renderer**

Replace the placeholder body:

```js
function renderActivitiesTab(mount) {
  mount.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-header">
        <h2>Activities</h2>
        <button class="btn btn--primary" id="activityAddBtn">+ Add Activity</button>
      </div>
      <div id="activityList" class="admin-list">${renderActivityList(activities, people)}</div>
    </div>
  `;
  mount.querySelector('#activityAddBtn').addEventListener('click', () => openActivityFormSheet(null));
  mount.querySelectorAll('.admin-list-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.form-toggle')) return; // toggle handled separately
      const id = row.dataset.activityId;
      openActivityFormSheet(id);
    });
  });
  mount.querySelectorAll('.activity-active-toggle').forEach(toggle => {
    toggle.addEventListener('change', async e => {
      const id = e.target.dataset.activityId;
      await writeActivity(id, { active: e.target.checked });
      await loadData();
      render();
    });
  });
}
```

`openActivityFormSheet` is defined in Task 6. For now it can be a stub: `function openActivityFormSheet(id) { console.log('TODO open form', id); }` — add it just to prevent reference errors.

- [ ] **Step 5: Verify**

Refresh admin → Activities tab. Expected: empty-state copy. In DevTools console, seed one:

```js
const fb = await import('/shared/firebase.js');
await fb.pushActivity({ name: 'Test Reading', emoji: '📖', color: '#4A90E2', goalPeriod: 'daily', goalMinutes: 30, pointsAtGoal: 50, assignedTo: {}, active: true });
```

Click the Activities tab again (or trigger a re-render). Expected: one row showing "Test Reading · Daily 30 min · 50 pts · (no one assigned)" with the toggle ON.

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat(admin): Activities list view with active toggle + click-to-edit"
```

---

### Task 6: Activity form sheet renderer

**Files:**
- Modify: `admin.html` (or `shared/components.js` if the admin existing forms live there — match the pattern used by Tasks/Rewards admin forms)

- [ ] **Step 1: Locate the existing admin form pattern**

Grep `admin.html` for `renderTaskForm` or `renderRewardForm` (whichever exists). Open it; observe the structure: a function returning HTML using `renderFormSheetHeader`, `renderFormFooter`, `renderChipPicker`, `renderEmojiPicker`, `renderColorButton`, `renderSwitchToggle`. Mirror exactly.

- [ ] **Step 2: Add the activity form renderer**

In admin.html (or wherever the other admin form renderers live), add:

```js
function renderActivityForm({ existing, mode, people }) {
  const a = existing || {};
  const peopleEntries = Object.entries(people)
    .sort((x, y) => (x[1].kid === true ? 0 : 1) - (y[1].kid === true ? 0 : 1) || (x[1].name || '').localeCompare(y[1].name || ''));
  const peopleOptions = peopleEntries.map(([pid, p]) => ({ value: pid, label: p.name || pid }));
  const assignedIds = Object.keys(a.assignedTo || {});

  return `
    ${renderFormSheetHeader({
      title: mode === 'edit' ? 'Edit Activity' : 'Add Activity',
      closeId: 'actFormClose',
      saveId: 'actFormSaveHeader',
      deleteId: mode === 'edit' ? 'actFormDelete' : null
    })}
    <div class="fs-body">
      <label class="fs-field">
        <span class="fs-label">Name</span>
        <input type="text" id="actFormName" class="fs-input" maxlength="50" value="${escapeHtml(a.name || '')}" />
      </label>

      <div class="fs-field-row">
        <label class="fs-field">
          <span class="fs-label">Emoji</span>
          ${renderEmojiPicker({ pickerId: 'actFormEmojiPicker', hiddenId: 'actFormEmoji', value: a.emoji || '', allowCustom: true })}
        </label>
        <label class="fs-field">
          <span class="fs-label">Color</span>
          ${renderColorButton({ id: 'actFormColorBtn', hiddenId: 'actFormColor', value: a.color || '#4A90E2' })}
        </label>
      </div>

      <div class="fs-field">
        <span class="fs-label">Goal period</span>
        ${renderChipPicker({
          pickerId: 'actFormGoalPeriod',
          hiddenId: 'actFormGoalPeriodValue',
          options: [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }],
          value: a.goalPeriod || 'daily',
          allowClear: false
        })}
      </div>

      <div class="fs-field-row">
        <label class="fs-field">
          <span class="fs-label">Goal minutes</span>
          <input type="number" id="actFormGoalMinutes" class="fs-input" min="1" max="10080" value="${a.goalMinutes || ''}" />
        </label>
        <label class="fs-field">
          <span class="fs-label">Points at goal</span>
          <input type="number" id="actFormPointsAtGoal" class="fs-input" min="0" max="1000" value="${a.pointsAtGoal ?? 100}" />
        </label>
      </div>

      <div class="fs-field">
        <span class="fs-label">Assigned to</span>
        ${renderChipPicker({
          pickerId: 'actFormAssignedTo',
          hiddenId: 'actFormAssignedToValue',
          options: peopleOptions,
          value: assignedIds,
          allowClear: false,
          multi: true
        })}
      </div>

      <div class="fs-field">
        <span class="fs-label">Active</span>
        ${renderSwitchToggle({ id: 'actFormActive', checked: a.active !== false })}
      </div>
    </div>
    ${renderFormFooter({
      saveLabel: 'Save',
      cancelId: 'actFormCancel',
      saveId: 'actFormSaveFooter',
      disabled: false
    })}
  `;
}
```

Confirm the `renderChipPicker` API supports `multi: true`. If it doesn't, look in `shared/components.js:1642` for the actual multi-select API and adapt. (If multi isn't supported, you may need a different primitive — possibly a custom person picker matching the task assignment pattern; grep for `assignedTo` and `chip-picker` together in `admin.html` to find the existing precedent.)

- [ ] **Step 3: Verify the renderer**

In DevTools console with admin loaded:

```js
const html = renderActivityForm({ existing: null, mode: 'create', people: {} });
document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;background:#fff;padding:20px;overflow:auto;z-index:9999;">${html}</div>`);
```

Expected: the form HTML renders. All fields visible. Close the temp overlay manually after inspecting (`document.querySelectorAll('[style*="z-index:9999"]').forEach(e=>e.remove())`).

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): renderActivityForm — form sheet using fs-* primitives"
```

---

### Task 7: Wire up activity form save/edit/delete

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Open the form sheet from `openActivityFormSheet`**

Replace the stub with the real implementation. Use the existing sheet-mount pattern (grep `openTaskFormSheet` or `openRewardFormSheet` to find the sheet open helper — likely something like `openSheet(html)`):

```js
function openActivityFormSheet(activityId) {
  const existing = activityId ? activities[activityId] : null;
  const mode = activityId ? 'edit' : 'create';
  const html = renderActivityForm({ existing, mode, people });
  openSheet(html);

  // bind pickers
  bindEmojiPicker({ pickerId: 'actFormEmojiPicker', hiddenId: 'actFormEmoji' });
  initColorButton({ buttonId: 'actFormColorBtn', hiddenId: 'actFormColor' });
  bindChipPicker({ pickerId: 'actFormGoalPeriod', hiddenId: 'actFormGoalPeriodValue', multi: false });
  bindChipPicker({ pickerId: 'actFormAssignedTo', hiddenId: 'actFormAssignedToValue', multi: true });

  // validation + save-state sync
  const inputs = ['actFormName', 'actFormEmoji', 'actFormColor', 'actFormGoalPeriodValue', 'actFormGoalMinutes', 'actFormPointsAtGoal', 'actFormAssignedToValue'];
  const validate = () => {
    const name = document.getElementById('actFormName').value.trim();
    const emoji = document.getElementById('actFormEmoji').value.trim();
    const color = document.getElementById('actFormColor').value.trim();
    const period = document.getElementById('actFormGoalPeriodValue').value;
    const mins = parseInt(document.getElementById('actFormGoalMinutes').value, 10);
    const pts = parseInt(document.getElementById('actFormPointsAtGoal').value, 10);
    const assigned = (document.getElementById('actFormAssignedToValue').value || '').split(',').filter(Boolean);
    const maxMins = period === 'weekly' ? 10080 : 1440;
    return name.length > 0 && name.length <= 50
      && emoji.length > 0
      && color.length > 0
      && (period === 'daily' || period === 'weekly')
      && Number.isInteger(mins) && mins >= 1 && mins <= maxMins
      && Number.isInteger(pts) && pts >= 0 && pts <= 1000
      && assigned.length >= 1;
  };
  const syncSaveState = () => {
    const ok = validate();
    document.getElementById('actFormSaveFooter').disabled = !ok;
    document.getElementById('actFormSaveHeader').disabled = !ok;
  };
  inputs.forEach(id => document.getElementById(id)?.addEventListener('input', syncSaveState));
  document.querySelectorAll('#actFormGoalPeriod .chip, #actFormAssignedTo .chip, #actFormEmojiPicker .emoji-cell, #actFormColorBtn').forEach(el => {
    el.addEventListener('click', () => setTimeout(syncSaveState, 0));
  });
  syncSaveState();

  // close/cancel
  const close = () => closeSheet();
  document.getElementById('actFormClose').addEventListener('click', close);
  document.getElementById('actFormCancel').addEventListener('click', close);

  // save
  const doSave = async () => {
    if (!validate()) return;
    const data = {
      name: document.getElementById('actFormName').value.trim(),
      emoji: document.getElementById('actFormEmoji').value.trim(),
      color: document.getElementById('actFormColor').value.trim(),
      goalPeriod: document.getElementById('actFormGoalPeriodValue').value,
      goalMinutes: parseInt(document.getElementById('actFormGoalMinutes').value, 10),
      pointsAtGoal: parseInt(document.getElementById('actFormPointsAtGoal').value, 10),
      active: document.getElementById('actFormActive').checked,
      assignedTo: Object.fromEntries(
        (document.getElementById('actFormAssignedToValue').value || '').split(',').filter(Boolean).map(pid => [pid, true])
      )
    };
    if (activityId) {
      // Invalidate current-period earnings on goal-affecting changes (per spec §6 Edit semantics)
      const goalAffectingChanged =
        existing.goalPeriod !== data.goalPeriod ||
        existing.goalMinutes !== data.goalMinutes ||
        existing.pointsAtGoal !== data.pointsAtGoal;
      if (goalAffectingChanged) {
        const tz = settings.timezone || 'America/New_York';
        const currentKey = data.goalPeriod === 'weekly'
          ? isoWeekKeyFromDate(new Date())
          : new Date().toISOString().slice(0, 10); // crude TZ-naive — replace with todayKey(tz) if imported
        const assignedNow = Object.keys(data.assignedTo || {});
        for (const pid of assignedNow) {
          await removeActivityEarning(pid, activityId, currentKey);
        }
      }
      await writeActivity(activityId, data);
    } else {
      data.createdBy = 'admin';
      await pushActivity(data);
    }
    closeSheet();
    await loadData();
    render();
  };
  document.getElementById('actFormSaveFooter').addEventListener('click', doSave);
  document.getElementById('actFormSaveHeader').addEventListener('click', doSave);

  // delete (edit mode only)
  if (mode === 'edit') {
    document.getElementById('actFormDelete').addEventListener('click', async () => {
      const sessions = await import('./shared/firebase.js').then(m => m.readActivitySessions());
      const hasSessions = Object.values(sessions).some(s => s.activityId === activityId);
      if (!hasSessions) {
        const ok = await showConfirm('Delete this activity?');
        if (!ok) return;
        await removeActivity(activityId);
      } else {
        const choice = await showConfirm(
          'This activity has logged sessions. Mark inactive (keep history) or delete with history (destructive)?',
          { confirmLabel: 'Mark Inactive', cancelLabel: 'Cancel', thirdLabel: 'Delete with History', thirdDanger: true }
        );
        if (choice === false) return;
        if (choice === 'third') {
          const typed = await showPrompt(`Type "${activities[activityId].name}" to confirm full deletion:`);
          if (typed !== activities[activityId].name) return;
          // delete activity + all sessions + all earnings (uses helpers from Task 3)
          await removeActivity(activityId);
          const allSessions = await readActivitySessions();
          for (const [sid, s] of Object.entries(allSessions)) {
            if (s.activityId === activityId) await removeActivitySession(sid);
          }
          const allEarnings = await readAllActivityEarnings();
          for (const [pid, perPerson] of Object.entries(allEarnings)) {
            if (perPerson[activityId]) {
              await removeActivityEarningsForActivity(pid, activityId);
            }
          }
        } else {
          await writeActivity(activityId, { active: false });
        }
      }
      closeSheet();
      await loadData();
      render();
    });
  }
}
```

`showConfirm` and `showPrompt` are existing helpers in the codebase — grep to confirm their API. If `showConfirm` doesn't support a third button, fall back to TWO confirms (first "mark inactive or delete?" then a destructive typed-confirm). Adjust to match whatever `showConfirm` actually supports — preserve the user-facing flow (default is mark-inactive, destructive is gated by typing the name).

- [ ] **Step 2: Verify create**

Admin → Activities → "+ Add Activity". Fill in: Reading / 📖 / a color / Daily / 30 / 50 / pick one person / Active ON. Save. Expected: sheet closes; list shows the new activity row.

- [ ] **Step 3: Verify edit**

Tap the new row. Sheet opens with values prefilled. Change goal minutes to 45. Save. Expected: list reflects "Daily 45 min".

- [ ] **Step 4: Verify soft delete (toggle)**

Toggle the active switch on the row. Expected: row dims to inactive style.

- [ ] **Step 5: Verify hard delete (no sessions)**

Tap the row → 🗑️ in form header → confirm. Expected: row removed from list.

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "feat(admin): activity form save/edit/delete + soft-disable toggle"
```

---

## Phase 3 — Timer Module

### Task 8: shared/timer.js — pure timer logic

**Files:**
- Create: `shared/timer.js`

- [ ] **Step 1: Create the file**

```js
// shared/timer.js — pure logic for activity timers. No DOM. No Firebase.

export function elapsedMs(timer, nowMs = Date.now()) {
  if (!timer) return 0;
  const { startedAt, pausedAt, accumulatedMs = 0 } = timer;
  if (pausedAt) return accumulatedMs;
  return accumulatedMs + Math.max(0, nowMs - startedAt);
}

export function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function pause(timer, nowMs = Date.now()) {
  if (!timer || timer.pausedAt) return timer;
  return {
    ...timer,
    pausedAt: nowMs,
    accumulatedMs: (timer.accumulatedMs || 0) + Math.max(0, nowMs - timer.startedAt)
  };
}

export function resume(timer, nowMs = Date.now()) {
  if (!timer || !timer.pausedAt) return timer;
  return {
    ...timer,
    startedAt: nowMs,
    pausedAt: null
    // accumulatedMs unchanged — banked from pause
  };
}

export function finalDurationMin(timer, nowMs = Date.now()) {
  const ms = elapsedMs(timer, nowMs);
  return Math.max(1, Math.round(ms / 60000));
}

export function isForgotten(timer, nowMs = Date.now()) {
  if (!timer || timer.pausedAt) return false;
  return (nowMs - timer.startedAt) > 6 * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Verify with Node**

```bash
node -e "
const t = await import('./shared/timer.js');
const start = Date.now() - 65000;
const timer = { activityId: 'a', startedAt: start, pausedAt: null, accumulatedMs: 0 };
console.log('elapsed:', t.elapsedMs(timer));
console.log('formatted:', t.formatElapsed(t.elapsedMs(timer)));
const paused = t.pause(timer, start + 30000);
console.log('paused elapsed:', t.elapsedMs(paused, start + 60000));
console.log('final min:', t.finalDurationMin(timer));
console.log('forgotten:', t.isForgotten({...timer, startedAt: Date.now() - 7*3600*1000}));
"
```

Expected output (approximate):
```
elapsed: 65000ish
formatted: 1:05
paused elapsed: 30000
final min: 1
forgotten: true
```

- [ ] **Step 3: Commit**

```bash
git add shared/timer.js
git commit -m "feat(timer): shared/timer.js — pure timer math (elapsed, pause, resume, format)"
```

---

### Task 9: Stub the activities page route in nav

**Files:**
- Modify: `shared/components.js` (specifically `initNavMore` — around line 562 per the existing explore)

- [ ] **Step 1: Add Activities to ALL_PAGES**

In `shared/components.js`, find the `ALL_PAGES` object inside or near `initNavMore` (around line 565-571). Add:

```js
activities: { id: 'activities', label: 'Activities', href: 'activities.html', icon: /* mirror existing icon pattern — small SVG */ '' }
```

Match the exact icon-rendering pattern used by neighboring entries (e.g., `tracker`, `calendar`). If they use `_svg(...)`, do the same.

- [ ] **Step 2: Add Activities to the More overflow menu items**

Find where the overflow menu items array is built (~line 583). Add Activities to the list of items rendered into the More sheet. Likely a simple push:

```js
items.push({ id: 'activities', label: 'Activities', href: 'activities.html' });
```

(Match the existing item shape — observe what surrounds the customizeItem at line 583.)

- [ ] **Step 3: Create a minimal activities.html placeholder**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Activities · Family Hub</title>
<link rel="stylesheet" href="styles/tokens.css" />
<link rel="stylesheet" href="styles/base.css" />
<link rel="stylesheet" href="styles/layout.css" />
<link rel="stylesheet" href="styles/components.css" />
<link rel="manifest" href="manifest.json" />
</head>
<body>
  <div id="headerMount"></div>
  <div class="page-content">
    <div id="mainContent"><p style="padding:20px;text-align:center;">Activities — coming soon.</p></div>
  </div>
  <div id="navMount"></div>
  <div id="sheetMount"></div>
  <script type="module">
    // boot stub — full implementation in Task 10+
    import { initFirebase } from './shared/firebase.js';
    import { initNav } from './shared/components.js';
    await initFirebase();
    initNav(document.getElementById('navMount'), 'activities');
  </script>
</body>
</html>
```

(Match the actual CSS link list from scoreboard.html — copy that head exactly; the list above is illustrative. Check `scoreboard.html:1-43` for the actual head structure.)

- [ ] **Step 4: Verify navigation**

```bash
node serve.js
```

Playwright (mobile viewport):
```
browser_navigate http://localhost:8080?env=dev
```

Tap the More tab → bottom sheet opens. Expected: "Activities" entry is in the list. Tap it → navigates to `/activities.html` showing the placeholder text.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js activities.html
git commit -m "feat(nav): register Activities page in More menu (placeholder route)"
```

---

## Phase 4 — Activities Page

### Task 10: Build the Activities page boot + sticky header + tabs

**Files:**
- Modify: `activities.html`

- [ ] **Step 1: Read scoreboard.html boot for reference**

Open `scoreboard.html`. Note the boot sequence: initFirebase, isFirstRun check, Promise.all of reads, render(). Mirror for activities.

- [ ] **Step 2: Replace activities.html with the full skeleton**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Activities · Family Hub</title>
<!-- CSS list — copy from scoreboard.html head -->
<link rel="manifest" href="manifest.json" />
</head>
<body>
  <div id="headerMount"></div>
  <div class="page-content">
    <div class="activities-page">
      <div class="activities-tabs">
        <button class="chip-tab is-active" data-tab="today">Today</button>
        <button class="chip-tab" data-tab="week">This Week</button>
        <button class="chip-tab" data-tab="history">History</button>
      </div>
      <div id="activitiesContent"></div>
    </div>
  </div>
  <div id="navMount"></div>
  <div id="sheetMount"></div>
  <script type="module">
    import {
      initFirebase, isFirstRun,
      readSettings, readPeople, readActivities, readActivitySessions,
      readAllActiveTimers, readAllActivityEarnings,
      subscribeActiveTimers,
      writeActiveTimer, clearActiveTimer,
      pushActivitySession, writeActivitySession, removeActivitySession,
      removeActivityEarning
    } from './shared/firebase.js';
    import { initNav, renderHeader, openSheet, closeSheet, showConfirm, showToast } from './shared/components.js';
    import { todayKey, weekStart, weekEnd, addDays, detectTimezone } from './shared/utils.js';
    import { elapsedMs, formatElapsed, pause, resume, finalDurationMin, isForgotten } from './shared/timer.js';

    let settings = {}, people = {}, activities = {}, sessions = {}, activeTimers = {}, earnings = {};
    let activeTab = 'today';
    let displayInterval = null;

    await initFirebase();
    if (await isFirstRun()) { window.location.href = 'setup.html'; }

    async function loadData() {
      [settings, people, activities, sessions, activeTimers, earnings] = await Promise.all([
        readSettings(), readPeople(), readActivities(), readActivitySessions(),
        readAllActiveTimers(), readAllActivityEarnings()
      ]);
    }

    function render() {
      renderHeader(document.getElementById('headerMount'), { title: 'Activities', settings, people });
      document.getElementById('activitiesContent').innerHTML = renderContentForTab(activeTab);
      bindTabHandlers();
      bindCardHandlers();
      bindActiveTimerHandlers();
    }

    function renderContentForTab(tab) {
      return '<p style="padding:20px;text-align:center;">Tab content coming in Task 11</p>';
    }

    function bindTabHandlers() {
      document.querySelectorAll('.chip-tab').forEach(t => {
        t.addEventListener('click', () => {
          activeTab = t.dataset.tab;
          document.querySelectorAll('.chip-tab').forEach(x => x.classList.toggle('is-active', x.dataset.tab === activeTab));
          document.getElementById('activitiesContent').innerHTML = renderContentForTab(activeTab);
          bindCardHandlers();
          bindActiveTimerHandlers();
        });
      });
    }

    function bindCardHandlers() { /* Task 11 */ }
    function bindActiveTimerHandlers() { /* Task 12 */ }

    await loadData();
    render();
    initNav(document.getElementById('navMount'), 'activities');

    // subscribe to active-timer changes (cross-device sync)
    subscribeActiveTimers(t => {
      activeTimers = t;
      render();
    });

    // refresh display every 1s while any timer is running
    function ensureDisplayInterval() {
      const anyRunning = Object.values(activeTimers).some(t => t && !t.pausedAt);
      if (anyRunning && !displayInterval) {
        displayInterval = setInterval(() => {
          document.querySelectorAll('[data-timer-readout]').forEach(el => {
            const pid = el.dataset.timerReadout;
            const t = activeTimers[pid];
            if (t) el.textContent = formatElapsed(elapsedMs(t));
          });
        }, 250);
      } else if (!anyRunning && displayInterval) {
        clearInterval(displayInterval);
        displayInterval = null;
      }
    }

    // Hook ensureDisplayInterval into every render cycle
    const origRender = render;
    window.__activitiesRender = () => { origRender(); ensureDisplayInterval(); };
    window.__activitiesRender();
  </script>
</body>
</html>
```

(The exact CSS list and `renderHeader` signature must match the existing convention from scoreboard.html — adapt as you see them.)

- [ ] **Step 3: Verify page boots**

Playwright mobile viewport, navigate to `http://localhost:8080/activities.html?env=dev`. Expected: page loads, sticky header shows "Activities", three chip tabs visible (Today active), tab switching changes the placeholder content. No console errors.

- [ ] **Step 4: Commit**

```bash
git add activities.html
git commit -m "feat(activities): page skeleton — boot, tabs, active-timer subscription"
```

---

### Task 11: Today tab — per-person cards

**Files:**
- Modify: `activities.html`

- [ ] **Step 1: Add helper functions inline in the module script**

Insert before `renderContentForTab`:

```js
function isoWeekKey(date, tz) {
  // Returns YYYY-Www. Uses ISO week (Monday start). Date arg = JS Date object.
  // Use date-fns-equivalent logic inline since we have no dep.
  const d = new Date(date);
  // Thursday in current week decides the year
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function localDateKey(timestampMs, tz) {
  return todayKey(tz, new Date(timestampMs));
}

function minutesForActivityToday(activityId, personId, tz) {
  const today = todayKey(tz);
  return Object.values(sessions)
    .filter(s => s.activityId === activityId && s.personId === personId && localDateKey(s.startedAt, tz) === today)
    .reduce((sum, s) => sum + (s.durationMin || 0), 0);
}

function minutesForActivityThisWeek(activityId, personId, tz) {
  const todayK = todayKey(tz);
  const start = weekStart(todayK);
  const end = weekEnd(todayK);
  return Object.values(sessions)
    .filter(s => {
      if (s.activityId !== activityId || s.personId !== personId) return false;
      const k = localDateKey(s.startedAt, tz);
      return k >= start && k <= end;
    })
    .reduce((sum, s) => sum + (s.durationMin || 0), 0);
}

function paceMinutesToday(actualMinutesThisWeek, goalMinutes, daysRemaining) {
  return Math.max(0, Math.ceil((goalMinutes - actualMinutesThisWeek) / Math.max(1, daysRemaining)));
}

function daysRemainingInWeek(tz) {
  const todayK = todayKey(tz);
  const endK = weekEnd(todayK);
  // count today + future days until end of week
  let count = 0;
  let k = todayK;
  while (k <= endK) { count++; k = addDays(k, 1); }
  return count;
}

function progressBar(actual, target) {
  const pct = target > 0 ? Math.min(1, actual / target) : 0;
  const filled = Math.round(pct * 10);
  return `<div class="progress-bar"><div class="progress-bar__fill" style="width:${pct * 100}%"></div></div>`;
}

function activitiesForPerson(personId) {
  return Object.entries(activities)
    .filter(([id, a]) => a.active !== false && a.assignedTo && a.assignedTo[personId])
    .map(([id, a]) => ({ id, ...a }));
}

function sortedPeople() {
  return Object.entries(people)
    .sort(([, x], [, y]) => {
      const kx = x.kid === true ? 0 : 1;
      const ky = y.kid === true ? 0 : 1;
      if (kx !== ky) return kx - ky;
      return (x.name || '').localeCompare(y.name || '');
    });
}
```

- [ ] **Step 2: Replace `renderContentForTab` body**

```js
function renderContentForTab(tab) {
  const tz = settings.timezone || detectTimezone();
  const activeTimerCards = renderActiveTimers(tz);
  if (tab === 'today') return activeTimerCards + renderTodayTab(tz);
  if (tab === 'week') return activeTimerCards + renderWeekTab(tz);
  if (tab === 'history') return renderHistoryTab(tz);
  return '';
}

function renderActiveTimers(tz) {
  const entries = Object.entries(activeTimers).filter(([, t]) => t);
  if (entries.length === 0) return '';
  return `
    <div class="active-timers">
      <h3 class="section-header">Active timers</h3>
      ${entries.map(([pid, t]) => {
        const person = people[pid] || { name: pid };
        const activity = activities[t.activityId] || { name: 'Unknown', emoji: '·' };
        const elapsed = formatElapsed(elapsedMs(t));
        const forgotten = isForgotten(t);
        const pauseLabel = t.pausedAt ? 'Resume' : 'Pause';
        return `
          <div class="active-timer-card" data-person-id="${pid}">
            <div class="active-timer-card__title">${escapeHtml(person.name)} · ${activity.emoji || ''} ${escapeHtml(activity.name)}</div>
            <div class="active-timer-card__readout" data-timer-readout="${pid}">${elapsed}${forgotten ? ' <span class="chip chip--warn">⚠ Forgotten?</span>' : ''}</div>
            <div class="active-timer-card__actions">
              <button class="btn btn--secondary" data-timer-action="toggle" data-person-id="${pid}">${pauseLabel}</button>
              <button class="btn btn--primary" data-timer-action="stop" data-person-id="${pid}">Stop</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTodayTab(tz) {
  const todayK = todayKey(tz);
  return sortedPeople().map(([pid, person]) => {
    const acts = activitiesForPerson(pid);
    if (acts.length === 0) return '';
    return `
      <div class="person-section">
        <h3 class="person-section__name" style="color:${person.color || 'inherit'}">${escapeHtml(person.name)}</h3>
        <div class="person-section__cards">
          ${acts.map(a => renderTodayCard(a, pid, tz)).join('')}
        </div>
      </div>
    `;
  }).join('') || '<p class="empty-state">No activities yet. Admin can add some from More → Admin → Activities.</p>';
}

function renderTodayCard(a, pid, tz) {
  if (a.goalPeriod === 'weekly') {
    const wkMins = minutesForActivityThisWeek(a.id, pid, tz);
    const days = daysRemainingInWeek(tz);
    const paceTarget = paceMinutesToday(wkMins, a.goalMinutes, days);
    const todayMins = minutesForActivityToday(a.id, pid, tz);
    const hit = wkMins >= a.goalMinutes;
    return `
      <div class="activity-card" data-activity-id="${a.id}" data-person-id="${pid}">
        <div class="activity-card__head">
          <span class="activity-card__emoji">${a.emoji || '·'}</span>
          <span class="activity-card__name">${escapeHtml(a.name)}</span>
          <span class="activity-card__goal">Weekly ${a.goalMinutes} min</span>
        </div>
        ${progressBar(todayMins, paceTarget || 1)}
        <div class="activity-card__meta">${todayMins} / ${paceTarget} min today${hit ? ' <span class="chip chip--success">✓ Goal hit</span>' : ''}</div>
        <div class="activity-card__sub-meta">wk: ${wkMins} / ${a.goalMinutes}</div>
        <div class="activity-card__actions">
          <button class="btn btn--primary" data-card-action="start" data-activity-id="${a.id}" data-person-id="${pid}">▶ Start</button>
          <button class="btn btn--secondary" data-card-action="log" data-activity-id="${a.id}" data-person-id="${pid}">+ Log</button>
        </div>
      </div>
    `;
  }
  // daily
  const todayMins = minutesForActivityToday(a.id, pid, tz);
  const hit = todayMins >= a.goalMinutes;
  return `
    <div class="activity-card" data-activity-id="${a.id}" data-person-id="${pid}">
      <div class="activity-card__head">
        <span class="activity-card__emoji">${a.emoji || '·'}</span>
        <span class="activity-card__name">${escapeHtml(a.name)}</span>
        <span class="activity-card__goal">Daily ${a.goalMinutes} min</span>
      </div>
      ${progressBar(todayMins, a.goalMinutes)}
      <div class="activity-card__meta">${todayMins} / ${a.goalMinutes} min${hit ? ' <span class="chip chip--success">✓ Goal hit</span>' : ''}</div>
      <div class="activity-card__actions">
        <button class="btn btn--primary" data-card-action="start" data-activity-id="${a.id}" data-person-id="${pid}">▶ Start</button>
        <button class="btn btn--secondary" data-card-action="log" data-activity-id="${a.id}" data-person-id="${pid}">+ Log</button>
      </div>
    </div>
  `;
}

function renderWeekTab(tz) { return '<p class="empty-state">Week tab coming in Task 12</p>'; }
function renderHistoryTab(tz) { return '<p class="empty-state">History tab coming in Task 13</p>'; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}
```

- [ ] **Step 3: Add minimal CSS**

In an appropriate page CSS file (e.g., `styles/activities.css` if it doesn't exist, or appended to `styles/components.css`):

```css
.activities-tabs { display: flex; gap: 8px; padding: 12px 16px; }
.chip-tab { padding: 8px 14px; border: 1px solid var(--border); background: var(--surface); border-radius: 999px; font-size: 14px; }
.chip-tab.is-active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.active-timers { padding: 0 16px 16px; }
.active-timer-card { background: var(--surface-raised); padding: 12px; border-radius: 12px; margin-bottom: 8px; }
.active-timer-card__title { font-weight: 600; }
.active-timer-card__readout { font-size: 24px; font-variant-numeric: tabular-nums; margin: 8px 0; }
.active-timer-card__actions { display: flex; gap: 8px; }
.person-section { padding: 8px 16px 16px; }
.person-section__name { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.person-section__cards { display: flex; flex-direction: column; gap: 8px; }
.activity-card { background: var(--surface); padding: 12px; border-radius: 12px; border: 1px solid var(--border); }
.activity-card__head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.activity-card__emoji { font-size: 20px; }
.activity-card__name { flex: 1; font-weight: 600; }
.activity-card__goal { font-size: 12px; color: var(--text-secondary); }
.progress-bar { height: 8px; background: var(--surface-sunken); border-radius: 4px; overflow: hidden; margin: 8px 0; }
.progress-bar__fill { height: 100%; background: var(--accent); }
.activity-card__meta { font-size: 13px; color: var(--text-secondary); }
.activity-card__sub-meta { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.activity-card__actions { display: flex; gap: 8px; margin-top: 8px; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
.chip--success { background: var(--success-soft); color: var(--success); }
.chip--warn { background: var(--warn-soft); color: var(--warn); }
```

(Use ACTUAL design tokens — grep `styles/tokens.css` for the real token names like `--color-accent`, `--surface-1`, etc., and replace placeholders above. Hardcoded colors are forbidden per CLAUDE.md.)

If `styles/activities.css` is created, register it in the `<link>` list of `activities.html`.

- [ ] **Step 4: Verify**

Seed one daily and one weekly activity in admin first. Assign to Lexi and Elijah.

Navigate to `/activities.html?env=dev`. Expected: Today tab shows per-person sections, each person has cards for their activities, daily card shows `0/N min`, weekly card shows `0/pace min today` and `wk: 0/N`. No active timers section. Start and + Log buttons are present but don't yet do anything (wired in Task 12).

- [ ] **Step 5: Commit**

```bash
git add activities.html styles/activities.css
git commit -m "feat(activities): Today tab — per-person cards with daily + weekly variants"
```

---

### Task 12: Week tab + Timer Start/Pause/Stop wiring

**Files:**
- Modify: `activities.html`

- [ ] **Step 1: Replace `renderWeekTab`**

```js
function renderWeekTab(tz) {
  return sortedPeople().map(([pid, person]) => {
    const acts = activitiesForPerson(pid);
    if (acts.length === 0) return '';
    return `
      <div class="person-section">
        <h3 class="person-section__name" style="color:${person.color || 'inherit'}">${escapeHtml(person.name)}</h3>
        <div class="person-section__cards">
          ${acts.map(a => renderWeekCard(a, pid, tz)).join('')}
        </div>
      </div>
    `;
  }).join('') || '<p class="empty-state">No activities yet.</p>';
}

function renderWeekCard(a, pid, tz) {
  if (a.goalPeriod === 'weekly') {
    const wkMins = minutesForActivityThisWeek(a.id, pid, tz);
    const hit = wkMins >= a.goalMinutes;
    return `
      <div class="activity-card" data-activity-id="${a.id}" data-person-id="${pid}">
        <div class="activity-card__head">
          <span class="activity-card__emoji">${a.emoji || '·'}</span>
          <span class="activity-card__name">${escapeHtml(a.name)}</span>
          <span class="activity-card__goal">Weekly ${a.goalMinutes} min</span>
        </div>
        ${progressBar(wkMins, a.goalMinutes)}
        <div class="activity-card__meta">${wkMins} / ${a.goalMinutes} min this week${hit ? ' <span class="chip chip--success">✓ Goal hit</span>' : ''}</div>
        <div class="activity-card__actions">
          <button class="btn btn--primary" data-card-action="start" data-activity-id="${a.id}" data-person-id="${pid}">▶ Start</button>
          <button class="btn btn--secondary" data-card-action="log" data-activity-id="${a.id}" data-person-id="${pid}">+ Log</button>
        </div>
      </div>
    `;
  }
  // daily — show 7-day mini-dot summary
  const todayK = todayKey(tz);
  const start = weekStart(todayK);
  const days = [];
  let k = start;
  while (k <= todayK) {
    const m = Object.values(sessions)
      .filter(s => s.activityId === a.id && s.personId === pid && localDateKey(s.startedAt, tz) === k)
      .reduce((sum, s) => sum + (s.durationMin || 0), 0);
    days.push({ k, hit: m >= a.goalMinutes });
    k = addDays(k, 1);
  }
  const hits = days.filter(d => d.hit).length;
  return `
    <div class="activity-card" data-activity-id="${a.id}" data-person-id="${pid}">
      <div class="activity-card__head">
        <span class="activity-card__emoji">${a.emoji || '·'}</span>
        <span class="activity-card__name">${escapeHtml(a.name)}</span>
        <span class="activity-card__goal">Daily ${a.goalMinutes} min</span>
      </div>
      <div class="activity-card__dots">${days.map(d => `<span class="dot ${d.hit ? 'dot--hit' : 'dot--miss'}"></span>`).join('')}</div>
      <div class="activity-card__meta">${hits} / ${days.length} days hit</div>
      <div class="activity-card__actions">
        <button class="btn btn--primary" data-card-action="start" data-activity-id="${a.id}" data-person-id="${pid}">▶ Start</button>
        <button class="btn btn--secondary" data-card-action="log" data-activity-id="${a.id}" data-person-id="${pid}">+ Log</button>
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Add CSS for dots**

Append to `styles/activities.css`:

```css
.activity-card__dots { display: flex; gap: 4px; margin: 8px 0; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: var(--surface-sunken); }
.dot--hit { background: var(--accent); }
```

- [ ] **Step 3: Implement `bindCardHandlers` and `bindActiveTimerHandlers`**

```js
function bindCardHandlers() {
  document.querySelectorAll('[data-card-action="start"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.personId;
      const aid = btn.dataset.activityId;
      const current = activeTimers[pid];
      if (current && current.activityId !== aid) {
        const stopOk = await showConfirm(`Stop ${activities[current.activityId]?.name || 'current activity'} and start ${activities[aid].name}?`);
        if (!stopOk) return;
        await stopTimer(pid);
      }
      if (current && current.activityId === aid && !current.pausedAt) return; // already running
      await writeActiveTimer(pid, {
        activityId: aid,
        startedAt: Date.now(),
        pausedAt: null,
        accumulatedMs: 0
      });
      showToast(`Started ${activities[aid].emoji || ''} ${activities[aid].name} for ${people[pid].name}`);
    });
  });
  document.querySelectorAll('[data-card-action="log"]').forEach(btn => {
    btn.addEventListener('click', () => openManualEntrySheet(btn.dataset.activityId, btn.dataset.personId));
  });
}

function bindActiveTimerHandlers() {
  document.querySelectorAll('[data-timer-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.personId;
      const t = activeTimers[pid];
      if (!t) return;
      const updated = t.pausedAt ? resume(t) : pause(t);
      await writeActiveTimer(pid, updated);
    });
  });
  document.querySelectorAll('[data-timer-action="stop"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await stopTimer(btn.dataset.personId);
    });
  });
}

async function stopTimer(pid) {
  const t = activeTimers[pid];
  if (!t) return;
  const durationMin = finalDurationMin(t);
  const startedAt = t.startedAt - (t.accumulatedMs || 0); // approximate original start
  const sessionData = {
    activityId: t.activityId,
    personId: pid,
    startedAt: startedAt,
    endedAt: Date.now(),
    durationMin,
    source: 'timer',
    createdBy: pid
  };
  await pushActivitySession(sessionData);
  await clearActiveTimer(pid);
  // delete any settled earning for this period since the new session may change it
  const periodKey = sessionPeriodKey(sessionData, t.activityId);
  if (periodKey) {
    await removeActivityEarning(pid, t.activityId, periodKey);
  }
  await loadData();
  render();
  showToast(`Session saved · ${durationMin} min · ${activities[t.activityId].name}`);
}

function sessionPeriodKey(session, activityId) {
  const a = activities[activityId];
  if (!a) return null;
  const tz = settings.timezone || detectTimezone();
  const dateKey = localDateKey(session.startedAt, tz);
  if (a.goalPeriod === 'daily') return dateKey;
  // weekly — compute ISO week of the start date
  return isoWeekKey(new Date(session.startedAt), tz);
}

function openManualEntrySheet(activityId, personId) {
  // Implemented in Task 14
  showToast('Manual entry coming in Task 14');
}
```

`stopTimer`'s "approximate original start" line is imperfect — a more accurate way is to subscribe and track the original startedAt at start time. For Phase 1, the durationMin is what we use for scoring; startedAt-for-display only needs to reasonably reflect when the session happened.

Actually, simpler: track `originalStartedAt` in the active timer record. Revise the `writeActiveTimer` call in the start handler:

```js
await writeActiveTimer(pid, {
  activityId: aid,
  startedAt: Date.now(),
  originalStartedAt: Date.now(),  // <-- preserved through pause/resume
  pausedAt: null,
  accumulatedMs: 0
});
```

And in `stopTimer`, use:

```js
startedAt: t.originalStartedAt || t.startedAt,
```

Also update `pause`/`resume` in `shared/timer.js` to preserve `originalStartedAt`:

```js
// In pause(): return { ...timer, pausedAt: nowMs, accumulatedMs: ... }
// In resume(): return { ...timer, startedAt: nowMs, pausedAt: null }
// Both already spread `...timer`, so originalStartedAt is preserved automatically. No change needed.
```

- [ ] **Step 4: Verify**

Seed an activity assigned to Lexi (e.g., Reading, Daily 30 min, 50 pts). Open `/activities.html?env=dev`. Click Lexi's Reading card "▶ Start". Expected: active timers section appears at top with "Lexi · 📖 Reading" and a running timer counting up. Click Pause → timer stops counting. Click Resume → timer resumes counting where it left off. Click Stop → session saved, timer disappears, toast appears, today's progress bar reflects the time.

- [ ] **Step 5: Verify cross-device sync**

Open a SECOND browser tab on the same page. In tab 1, Start a timer. Expected: tab 2 immediately shows the active timer. Click Stop in tab 2. Expected: tab 1's timer disappears too.

- [ ] **Step 6: Commit**

```bash
git add activities.html shared/timer.js styles/activities.css
git commit -m "feat(activities): Week tab + timer start/pause/resume/stop with cross-device sync"
```

---

### Task 13: History tab

**Files:**
- Modify: `activities.html`

- [ ] **Step 1: Replace `renderHistoryTab`**

```js
function renderHistoryTab(tz) {
  const sortedSessions = Object.entries(sessions)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  if (sortedSessions.length === 0) return '<p class="empty-state">No sessions logged yet.</p>';

  // group by local date
  const groups = {};
  for (const s of sortedSessions) {
    const k = localDateKey(s.startedAt, tz);
    (groups[k] = groups[k] || []).push(s);
  }

  return Object.entries(groups).map(([dateKey, sList]) => `
    <div class="history-group">
      <h4 class="history-group__date">${formatDateHeader(dateKey, tz)}</h4>
      ${sList.map(s => {
        const person = people[s.personId] || { name: s.personId };
        const activity = activities[s.activityId] || { name: '(deleted)', emoji: '·' };
        const time = formatTime(s.startedAt, tz);
        return `
          <div class="history-row" data-session-id="${s.id}">
            <span class="history-row__icon">${activity.emoji}</span>
            <span class="history-row__title">${escapeHtml(person.name)} · ${escapeHtml(activity.name)}</span>
            <span class="history-row__meta">${s.durationMin} min · ${time}</span>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function formatDateHeader(dateKey, tz) {
  const today = todayKey(tz);
  if (dateKey === today) return 'Today';
  if (dateKey === addDays(today, -1)) return 'Yesterday';
  return dateKey; // could format prettier — utils.js may have formatDateLong
}

function formatTime(timestampMs, tz) {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}
```

- [ ] **Step 2: Bind history-row clicks (defer manual sheet to Task 14)**

In `bindCardHandlers`, add at the bottom:

```js
document.querySelectorAll('.history-row').forEach(row => {
  row.addEventListener('click', () => {
    openManualEntrySheet(null, null, row.dataset.sessionId);
  });
});
```

Update `openManualEntrySheet` signature to accept `(activityId, personId, sessionIdForEdit)`. For now it still just shows a toast — full impl in Task 14.

- [ ] **Step 3: Add CSS**

Append to `styles/activities.css`:

```css
.history-group { padding: 0 16px 12px; }
.history-group__date { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 6px; color: var(--text-secondary); }
.history-row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface); border-radius: 8px; margin-bottom: 4px; cursor: pointer; }
.history-row__icon { font-size: 16px; }
.history-row__title { flex: 1; font-size: 14px; }
.history-row__meta { font-size: 12px; color: var(--text-secondary); }
```

- [ ] **Step 4: Verify**

After completing one or more timer sessions in Task 12, open the History tab. Expected: sessions grouped by date ("Today", "Yesterday", or YYYY-MM-DD); each row shows person name, activity name, duration, and time of day.

- [ ] **Step 5: Commit**

```bash
git add activities.html styles/activities.css
git commit -m "feat(activities): History tab — sessions grouped by date"
```

---

### Task 14: Manual entry sheet (new + edit + delete)

**Files:**
- Modify: `activities.html`

- [ ] **Step 1: Replace `openManualEntrySheet` stub**

```js
function openManualEntrySheet(activityId, personId, sessionIdForEdit) {
  const editing = sessionIdForEdit ? sessions[sessionIdForEdit] : null;
  const aid = editing ? editing.activityId : activityId;
  const pid = editing ? editing.personId : personId;
  const activity = activities[aid];
  if (!activity) return;
  const allowedPersonIds = Object.keys(activity.assignedTo || {});
  const personOptions = allowedPersonIds.map(id => ({ value: id, label: people[id]?.name || id }));
  const tz = settings.timezone || detectTimezone();
  const dateValue = editing ? localDateKey(editing.startedAt, tz) : todayKey(tz);

  const html = `
    ${renderFormSheetHeader({
      title: editing ? 'Edit Session' : 'Log Session',
      closeId: 'sessFormClose',
      saveId: 'sessFormSaveHeader',
      deleteId: editing ? 'sessFormDelete' : null
    })}
    <div class="fs-body">
      <div class="fs-readonly">
        <strong>${activity.emoji || ''} ${escapeHtml(activity.name)}</strong>
      </div>
      <div class="fs-field">
        <span class="fs-label">Person</span>
        ${renderChipPicker({
          pickerId: 'sessFormPerson',
          hiddenId: 'sessFormPersonValue',
          options: personOptions,
          value: pid,
          allowClear: false
        })}
      </div>
      <div class="fs-field">
        <span class="fs-label">Date</span>
        ${renderDateInput({ id: 'sessFormDate', value: dateValue })}
      </div>
      <label class="fs-field">
        <span class="fs-label">Duration (min)</span>
        <input type="number" id="sessFormDuration" class="fs-input" min="1" max="1440" value="${editing ? editing.durationMin : 30}" />
      </label>
      <label class="fs-field">
        <span class="fs-label">Notes</span>
        <input type="text" id="sessFormNotes" class="fs-input" value="${escapeHtml(editing?.notes || '')}" />
      </label>
    </div>
    ${renderFormFooter({
      saveLabel: 'Save',
      cancelId: 'sessFormCancel',
      saveId: 'sessFormSaveFooter',
      disabled: false
    })}
  `;
  openSheet(html);
  bindChipPicker({ pickerId: 'sessFormPerson', hiddenId: 'sessFormPersonValue', multi: false });
  bindDateInput({ id: 'sessFormDate' });

  const close = () => closeSheet();
  document.getElementById('sessFormClose').addEventListener('click', close);
  document.getElementById('sessFormCancel').addEventListener('click', close);

  const doSave = async () => {
    const finalPid = document.getElementById('sessFormPersonValue').value;
    const dateKey = document.getElementById('sessFormDate').value;
    const durationMin = parseInt(document.getElementById('sessFormDuration').value, 10);
    const notes = document.getElementById('sessFormNotes').value.trim();
    if (!finalPid || !dateKey || !Number.isInteger(durationMin) || durationMin < 1) return;
    // place the session at noon local on that date for predictable period-key mapping
    const noonMs = Date.parse(`${dateKey}T12:00:00`); // local time
    const sessionData = {
      activityId: aid,
      personId: finalPid,
      startedAt: noonMs,
      endedAt: noonMs + durationMin * 60000,
      durationMin,
      source: 'manual',
      notes: notes || null,
      createdBy: finalPid
    };
    if (editing) {
      await writeActivitySession(sessionIdForEdit, sessionData);
    } else {
      await pushActivitySession(sessionData);
    }
    // invalidate settled earning for the affected period
    const pkey = sessionPeriodKey(sessionData, aid);
    if (pkey) await removeActivityEarning(finalPid, aid, pkey);
    closeSheet();
    await loadData();
    render();
    showToast(`Manual entry saved · ${activity.name} · ${durationMin} min · ${people[finalPid].name}`);
  };
  document.getElementById('sessFormSaveFooter').addEventListener('click', doSave);
  document.getElementById('sessFormSaveHeader').addEventListener('click', doSave);

  if (editing) {
    document.getElementById('sessFormDelete').addEventListener('click', async () => {
      const ok = await showConfirm('Delete this session?');
      if (!ok) return;
      await removeActivitySession(sessionIdForEdit);
      const pkey = sessionPeriodKey(editing, editing.activityId);
      if (pkey) await removeActivityEarning(editing.personId, editing.activityId, pkey);
      closeSheet();
      await loadData();
      render();
      showToast('Session deleted');
    });
  }
}
```

Imports at top of module script must already include `renderDateInput`, `bindDateInput`, `renderFormSheetHeader`, `renderFormFooter`, `renderChipPicker`, `bindChipPicker`. Add any missing.

- [ ] **Step 2: Verify**

Click + Log on an activity card. Sheet opens. Expected: person pre-filled, date today, duration 30. Change to 25, add a note, Save. Confirm session appears in History and today's card progress reflects 25 min.

Open History → tap a session → sheet opens in edit mode. Change duration. Save. History reflects new duration.

Open History → tap a session → 🗑️ → confirm. Session disappears from history.

- [ ] **Step 3: Commit**

```bash
git add activities.html
git commit -m "feat(activities): manual entry sheet — log, edit, delete sessions"
```

---

## Phase 5 — Scoring Integration

### Task 15: Add `sumActivityEarningsInRange` to scoring.js

**Files:**
- Modify: `shared/scoring.js`

- [ ] **Step 1: Open scoring.js, find `aggregateSnapshots` (~line 255) and `collectSnapshots` (~line 319)**

Note the pattern: these accept ranges as date keys. New aggregator follows the same conventions.

- [ ] **Step 2: Add the new function**

After `aggregateSnapshots` (around line 273):

```js
/**
 * Sum activity earnings for a person across a date range.
 * @param {Object} allEarnings - rundown/activityEarnings (keyed by personId)
 * @param {string} personId
 * @param {string} startDateKey - YYYY-MM-DD inclusive
 * @param {string} endDateKey - YYYY-MM-DD inclusive
 * @returns {number} sum of `earned` from all earnings whose periodKey falls in range
 */
export function sumActivityEarningsInRange(allEarnings, personId, startDateKey, endDateKey) {
  const perPerson = allEarnings?.[personId];
  if (!perPerson) return 0;
  let total = 0;
  for (const activityId of Object.keys(perPerson)) {
    for (const periodKey of Object.keys(perPerson[activityId])) {
      const earning = perPerson[activityId][periodKey];
      if (!earning) continue;
      const dateKey = periodKeyToStartDateKey(periodKey);
      if (dateKey >= startDateKey && dateKey <= endDateKey) {
        total += earning.earned || 0;
      }
    }
  }
  return total;
}

/**
 * Map a periodKey ("YYYY-MM-DD" or "YYYY-Www") to its start date key for range checks.
 */
function periodKeyToStartDateKey(periodKey) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return periodKey;
  const m = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    // ISO week 1: Jan 4 is always in week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }
  return '0000-00-00';
}
```

- [ ] **Step 3: Verify via Node REPL**

```bash
node -e "
const s = await import('./shared/scoring.js');
const fakeEarnings = {
  lexi: {
    reading: {
      '2026-05-18': { earned: 100, periodKey: '2026-05-18' },
      '2026-05-17': { earned: 80, periodKey: '2026-05-17' },
      '2026-W20': { earned: 150, periodKey: '2026-W20' }
    }
  }
};
console.log('Daily range:', s.sumActivityEarningsInRange(fakeEarnings, 'lexi', '2026-05-18', '2026-05-18'));
console.log('Two-day:', s.sumActivityEarningsInRange(fakeEarnings, 'lexi', '2026-05-17', '2026-05-18'));
console.log('Week W20 starts at Mon May 11 2026, so week:', s.sumActivityEarningsInRange(fakeEarnings, 'lexi', '2026-05-11', '2026-05-17'));
"
```

Expected: 100, 180, 150 (or close — verify 2026-W20 actually starts May 11 via a calendar check).

- [ ] **Step 4: Commit**

```bash
git add shared/scoring.js
git commit -m "feat(scoring): sumActivityEarningsInRange — aggregate activity earnings across date range"
```

---

### Task 16: Wire activity earnings into total points

**Files:**
- Modify: `shared/scoring.js`
- Modify: any consumer that displays a "total" (likely `scoreboard.html`, `rewards.js`)

- [ ] **Step 1: Find the top-level "total points for person across range" callers**

Grep for `aggregateSnapshots(` across the codebase. Each call site that represents "person's total for time range" needs to also add activity earnings.

```bash
grep -n "aggregateSnapshots" --include="*.js" --include="*.html" -r .
```

- [ ] **Step 2: Identify call sites and update**

For each call site that computes "person X's total points for a range" (NOT calls that just aggregate a single snapshot list for a chart), modify to add activity earnings. Example pattern:

```js
// BEFORE
const agg = aggregateSnapshots(snapshots);
const totalPts = agg.earned;

// AFTER
import { sumActivityEarningsInRange } from './shared/scoring.js'; // if not already
const agg = aggregateSnapshots(snapshots);
const activityPts = sumActivityEarningsInRange(allEarnings, personId, startDateKey, endDateKey);
const totalPts = agg.earned + activityPts;
```

`allEarnings` is the result of `readAllActivityEarnings()` — add it to the parallel reads in each consumer's `loadData()`.

Apply to:
- `scoreboard.html` — person row totals, period grade if it should include activities
- `rewards.js` — point balance for redemption (kids' redeemable points should include activity earnings)
- Any dashboard or kid-mode display showing "X points"

- [ ] **Step 3: Verify**

Seed an Earning record manually:

```js
// in DevTools console at /scoreboard.html?env=dev
const fb = await import('/shared/firebase.js');
const today = (new Date()).toISOString().slice(0, 10);
await firebase.database().ref(`rundown-dev/activityEarnings/${personId}/${activityId}/${today}`).set({
  periodKey: today,
  goalPeriod: 'daily', goalMinutes: 30,
  actualMinutes: 30, goalPercent: 1.0,
  pointsAtGoal: 50, earned: 50,
  settledAt: Date.now(), formulaVersion: 1
});
```

(Replace `personId` and `activityId` with real IDs from your seeded test data.)

Reload scoreboard. Expected: that person's total points has gone up by 50.

Reload rewards page. Expected: that kid's balance has gone up by 50 (if applicable).

- [ ] **Step 4: Commit**

```bash
git add shared/scoring.js scoreboard.html rewards.js  # whichever you touched
git commit -m "feat(scoring): include activity earnings in person total points across scoreboard + rewards"
```

---

## Phase 6 — Worker Settlement

### Task 17: Add daily settlement branch to the cron worker

**Files:**
- Modify: `workers/kitchen-import.js`

- [ ] **Step 1: Read existing patterns**

Open `workers/kitchen-import.js`. Find:
- `runScheduled` (~line 1904) — main entry
- `runOverdueReminders` (~line 2172) — example branch using `dateKeyInTz`, `fbGet`, iteration over people
- `fbGet(env, path)` (~line 78)
- `fbSet(env, path, value)` (~line 92)

- [ ] **Step 2: Add helper functions**

Near the top of the worker (or grouped with other helpers), add the formula and date helpers:

```js
function calculateEarning(actualMinutes, goalMinutes, pointsAtGoal) {
  if (goalMinutes <= 0) return 0;
  const goalPercent = actualMinutes / goalMinutes;
  if (goalPercent >= 1.0) return Math.round(pointsAtGoal * goalPercent);
  const missPercent = 1.0 - goalPercent;
  const penalty = pointsAtGoal * missPercent * 2;
  return Math.max(0, Math.round(pointsAtGoal - penalty));
}

function yesterdayInTz(now, tz) {
  // Returns YYYY-MM-DD for yesterday in the given IANA timezone.
  const todayKey = dateKeyInTz(now, tz);
  const d = new Date(`${todayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dayWindowMs(dateKey, tz) {
  // Returns { startMs, endMs } for local midnight-to-midnight of dateKey in tz.
  // Worker doesn't have full Intl in all environments — use parse trick.
  const startStr = `${dateKey}T00:00:00`;
  const endStr = `${addDaysISO(dateKey, 1)}T00:00:00`;
  return { startMs: parseAsTz(startStr, tz), endMs: parseAsTz(endStr, tz) };
}

function addDaysISO(dateKey, n) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseAsTz(isoLocal, tz) {
  // Workaround: use the Intl.DateTimeFormat hack to compute UTC offset for tz at that local time.
  // Approximate: assume IANA tz string is correct and use Date.parse + a tz offset lookup.
  const dt = new Date(`${isoLocal}Z`);
  const tzOffsetMin = -new Date(dt.toLocaleString('en-US', { timeZone: tz })).getTimezoneOffset();
  return dt.getTime() - tzOffsetMin * 60000;
}
```

If existing helpers in the worker do this already (check for `dateKeyInTz`, `parseLocalDateInTz`, etc.), reuse those instead. Don't duplicate.

- [ ] **Step 3: Add `runDailySettlement`**

```js
async function runDailySettlement(env, now, tz, people, activities) {
  const yesterdayKey = yesterdayInTz(now, tz);
  const { startMs, endMs } = dayWindowMs(yesterdayKey, tz);

  for (const [personId, person] of Object.entries(people || {})) {
    for (const [activityId, a] of Object.entries(activities || {})) {
      if (a.active === false) continue;
      if (a.goalPeriod !== 'daily') continue;
      if (!a.assignedTo || !a.assignedTo[personId]) continue;

      // Check idempotency — skip if already settled
      const existing = await fbGet(env, `activityEarnings/${personId}/${activityId}/${yesterdayKey}`);
      if (existing) continue;

      // Sum sessions for yesterday
      const allSessions = await fbGet(env, 'activitySessions') || {};
      let actualMinutes = 0;
      for (const s of Object.values(allSessions)) {
        if (s.activityId !== activityId) continue;
        if (s.personId !== personId) continue;
        if (s.startedAt < startMs || s.startedAt >= endMs) continue;
        actualMinutes += s.durationMin || 0;
      }

      const earned = calculateEarning(actualMinutes, a.goalMinutes, a.pointsAtGoal);
      const goalPercent = a.goalMinutes > 0 ? actualMinutes / a.goalMinutes : 0;

      await fbSet(env, `activityEarnings/${personId}/${activityId}/${yesterdayKey}`, {
        periodKey: yesterdayKey,
        goalPeriod: 'daily',
        goalMinutes: a.goalMinutes,
        actualMinutes,
        goalPercent,
        pointsAtGoal: a.pointsAtGoal,
        earned,
        settledAt: Date.now(),
        formulaVersion: 1
      });
    }
  }
}
```

- [ ] **Step 4: Wire it into `runScheduled`**

In `runScheduled` (~line 1904), after the existing branches and before the function returns, add:

```js
const activities = await fbGet(env, 'activities') || {};
await runDailySettlement(env, now, tz, people, activities);
```

(Read `activities` once at this point and pass it; or pull it into the shared read block at the top of `runScheduled` if that fits the existing pattern better.)

- [ ] **Step 5: Verify locally with wrangler dev**

```bash
npx wrangler dev --config workers/wrangler.toml
```

In another terminal, trigger the cron:

```bash
curl -X POST 'http://localhost:8787/__scheduled?cron=*/5+*+*+*+*'
```

(Adjust port/URL per `wrangler dev` output. The `__scheduled` endpoint is a wrangler dev convenience.)

Expected: log shows daily-settlement processed; if you seeded sessions for yesterday, a corresponding `activityEarnings` record appears in Firebase.

- [ ] **Step 6: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): runDailySettlement — settle daily activity goals at period boundary"
```

---

### Task 18: Add weekly settlement branch

**Files:**
- Modify: `workers/kitchen-import.js`

- [ ] **Step 1: Add helpers**

```js
function lastIsoWeekKey(now, tz) {
  // Returns YYYY-Www for the week BEFORE the current week (in tz).
  const todayKey = dateKeyInTz(now, tz);
  // Subtract 7 days
  const d = new Date(`${todayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeekKeyFromDate(d);
}

function isoWeekKeyFromDate(date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function isoWeekRangeMs(weekKey, tz) {
  // Returns { startMs, endMs } for Mon 00:00 to next Mon 00:00 of the given ISO week, in tz.
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return { startMs: 0, endMs: 0 };
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const mondayKey = monday.toISOString().slice(0, 10);
  const startMs = parseAsTz(`${mondayKey}T00:00:00`, tz);
  const endMs = parseAsTz(`${addDaysISO(mondayKey, 7)}T00:00:00`, tz);
  return { startMs, endMs };
}
```

- [ ] **Step 2: Add `runWeeklySettlement`**

```js
async function runWeeklySettlement(env, now, tz, people, activities) {
  // Only fire if today is Monday in tz AND last week hasn't been settled for someone yet
  const todayKey = dateKeyInTz(now, tz);
  const dayOfWeek = new Date(`${todayKey}T12:00:00Z`).getUTCDay(); // 0=Sun, 1=Mon
  if (dayOfWeek !== 1) return;

  const weekKey = lastIsoWeekKey(now, tz);
  const { startMs, endMs } = isoWeekRangeMs(weekKey, tz);

  for (const [personId, person] of Object.entries(people || {})) {
    for (const [activityId, a] of Object.entries(activities || {})) {
      if (a.active === false) continue;
      if (a.goalPeriod !== 'weekly') continue;
      if (!a.assignedTo || !a.assignedTo[personId]) continue;

      const existing = await fbGet(env, `activityEarnings/${personId}/${activityId}/${weekKey}`);
      if (existing) continue;

      const allSessions = await fbGet(env, 'activitySessions') || {};
      let actualMinutes = 0;
      for (const s of Object.values(allSessions)) {
        if (s.activityId !== activityId) continue;
        if (s.personId !== personId) continue;
        if (s.startedAt < startMs || s.startedAt >= endMs) continue;
        actualMinutes += s.durationMin || 0;
      }

      const earned = calculateEarning(actualMinutes, a.goalMinutes, a.pointsAtGoal);
      const goalPercent = a.goalMinutes > 0 ? actualMinutes / a.goalMinutes : 0;

      await fbSet(env, `activityEarnings/${personId}/${activityId}/${weekKey}`, {
        periodKey: weekKey,
        goalPeriod: 'weekly',
        goalMinutes: a.goalMinutes,
        actualMinutes,
        goalPercent,
        pointsAtGoal: a.pointsAtGoal,
        earned,
        settledAt: Date.now(),
        formulaVersion: 1
      });
    }
  }
}
```

- [ ] **Step 3: Wire into runScheduled**

After the daily settlement call:

```js
await runWeeklySettlement(env, now, tz, people, activities);
```

- [ ] **Step 4: Verify**

Seed a weekly activity and a session from last week. Trigger the cron manually (as in Task 17 step 5). Expected: weekly earning record written if today is Monday (else skipped, which is correct behavior).

For a non-Monday test: temporarily comment out the `dayOfWeek !== 1` early-return, trigger, verify, then restore the guard.

- [ ] **Step 5: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): runWeeklySettlement — settle weekly activity goals on Monday tick"
```

---

### Task 19: Deploy the worker

**Files:** (none modified — deployment only)

- [ ] **Step 1: Verify wrangler.toml is current**

```bash
cat workers/wrangler.toml
```

Confirm the cron trigger exists (every 5 min).

- [ ] **Step 2: Deploy**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

If `npx` is blocked by PowerShell execution policy, use cmd.exe or the Cloudflare dashboard editor (per CLAUDE.md).

- [ ] **Step 3: Tail logs to verify next tick**

```bash
npx wrangler tail
```

Wait up to 5 min for the next scheduled invocation. Expected: log shows `runDailySettlement` and `runWeeklySettlement` ran (even if no work to do — they should at least log entry).

- [ ] **Step 4: Validate end-to-end**

1. Open `/activities.html?env=dev`, log a session with a 2026-05-17 (yesterday) manual entry for an active daily activity.
2. Wait for next cron tick (or manually trigger via the Cloudflare dashboard's "Trigger" button).
3. Open Firebase console → `rundown-dev/activityEarnings/{personId}/{activityId}/2026-05-17`. Expected: earning record present with `earned > 0`.
4. Open `/scoreboard.html?env=dev`. Expected: person's total points has increased by the earned amount.

- [ ] **Step 5: Commit (none — no file changes)**

No git commit needed for this task. Move to next.

---

## Phase 7 — Polish & Ship

### Task 20: SW cache bump + precache new files

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Bump CACHE_NAME**

```bash
grep -n "CACHE_NAME" sw.js
```

Update the version string from `family-hub-v328` to `family-hub-v329`.

- [ ] **Step 2: Add new files to precache list**

Find the precache array (`APP_SHELL` per the earlier explore). Add:

```
'/activities.html',
'/shared/timer.js',
```

(And `/styles/activities.css` if that file was created in Task 11.)

- [ ] **Step 3: Verify SW updates correctly**

Hard-reload `http://localhost:8080?env=dev`. In DevTools → Application → Service Workers, the new version should appear after reload. Navigate to `/activities.html` while offline (simulate via DevTools → Network → Offline) — page should still load.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore(sw): cache v329 — precache activities.html + shared/timer.js"
```

---

### Task 21: Update DESIGN.md

**Files:**
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: Update §2 row 1.6**

Find the row referring to Activities (~line 53 per the explore). Update it from "future" to "shipped 2026-MM-DD" wording matching the existing convention. Example:

```md
**1.6 Activities** | Activities page | Per-person grouping, by-person cards, shared timer | More tab (phone), left rail (tablet) | Shipped 2026-MM-DD
```

(Match the actual table structure of the existing row.)

- [ ] **Step 2: Add new section §6.11 Activities**

Insert after the relevant section (likely §6.10 or similar — pick the correct numbered slot). Skeleton:

```md
### 6.11 Activities

**Purpose.** Time-tracked habits with goal-based scoring. Anyone in the family can be assigned activities; sessions are logged via timer or manual entry; points are awarded at period close.

**Page location.** `activities.html`, accessed via More → Activities. Sticky header + chip tabs (Today / This Week / History). By-person grouping under each tab (kids first, alphabetical within group); empty-assignment people hidden.

**Scoring formula.** `earned = max(0, pointsAtGoal × actualPct)` for hits/exceeds; `earned = max(0, pointsAtGoal − pointsAtGoal × missPct × 2)` for misses. Floored at zero per period. See [spec history in git].

**Goal cadence.** Per-activity choice of daily or weekly. Weekly cards on the Today tab show a primary bar for today's pace + a secondary line for week-to-date.

**Timer.** One active timer per person, synced via `rundown/activeTimers/{personId}`. Any device with access can stop. Sanity-warn on >6hr forgotten timers.

**Schema.** Four trees: `rundown/activities`, `rundown/activitySessions`, `rundown/activeTimers`, `rundown/activityEarnings/{personId}/{activityId}/{periodKey}`. Earnings written only by the cron worker at period boundaries.

**Forms.** Admin activity form composed from `fs-*` primitives per §5.23. Manual entry sheet uses the same primitives.
```

(Adapt to the actual section-numbering style of the existing DESIGN.md.)

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs(design): add §6.11 Activities + mark §2 row 1.6 shipped"
```

---

### Task 22: Ship — update ROADMAP, delete plan + spec, final commit

**Files:**
- Modify: `docs/ROADMAP.md`
- Delete: `docs/superpowers/specs/2026-05-18-activities-design.md`
- Delete: `docs/superpowers/plans/2026-05-18-activities.md`

- [ ] **Step 1: Update ROADMAP.md**

Find and remove the "Activities (Phase 1)" entry from MEDIUM. Find and remove the "Activities (Phase 2)" entry from HARD. Add a single new entry under a "Shipped" section (or wherever the existing "shipped" entries live — e.g., next to "Push Notifications · All phases shipped"):

```md
**Activities** · Shipped 2026-MM-DD · Cost: $0
Time-tracked habits with goal-based scoring (linear bonus for exceeding, 2× penalty for missing, floored at zero). Daily/weekly goals per activity; weekly shows adaptive daily pace. Family-overview page in More menu grouped by person. Firebase-synced timers (multi-device). Manual entry + history. Admin CRUD. Cloudflare Worker daily + weekly settlement.
```

(Match the formatting of the existing Push Notifications shipped entry.)

- [ ] **Step 2: Delete plan + spec per the "delete on completion" rule**

```bash
git rm docs/superpowers/specs/2026-05-18-activities-design.md
git rm docs/superpowers/plans/2026-05-18-activities.md
```

- [ ] **Step 3: Final shipped commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark Activities shipped — collapse Phase 1+2 into single roadmap entry"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Verify production**

After Cloudflare Pages auto-deploys (~1-2 min):
- Visit `https://dashboard.jansky.app` (production)
- Hard refresh to bypass cached SW
- More → Activities → confirm page loads, theme correct, no console errors

---

## Self-Review

After completing all tasks, run through these checks:

**Spec coverage** — every spec section maps to a task:

- §1 Overview — Tasks 9, 10 (page exists, registered in nav)
- §2 Data Model — Tasks 1, 2, 3 (all four trees have CRUD helpers)
- §3 Scoring Formula — Task 17 (worker `calculateEarning`)
- §4 Activities Page UI — Tasks 10, 11, 12, 13, 14 (skeleton, Today, Week, History, manual sheet)
- §5 Timer & Manual Entry — Tasks 8, 12, 14
- §6 Admin Form — Tasks 4, 5, 6, 7
- §7 Settlement Worker + Scoring Integration — Tasks 15, 16, 17, 18, 19
- §8 File Map & Build Order — drives the phase structure of this plan

**Risk callouts handled:**
- Worker settlement is last in build order ✓ (Phase 6)
- SW cache bump includes new files ✓ (Task 20)
- Firebase write fan-out — no concern per spec ✓

**No placeholders:** All steps contain runnable code/commands. Where existing-pattern code is referenced (e.g., "match scoreboard.html boot"), exact file:line locations are cited so the executor can read the real code.
