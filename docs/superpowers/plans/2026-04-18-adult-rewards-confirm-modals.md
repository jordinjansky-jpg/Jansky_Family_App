# Adult Reward Experience + Confirmation Modals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adult accounts instant-approve for reward buy/use, add "Use" buttons on saved tokens (including functional rewards), replace all 37 browser `confirm()`/`alert()` calls with polished in-app modals, move toast styles to shared CSS.

**Architecture:** New `showConfirm()` async function in `shared/components.js` renders a centered modal card over a dimmed backdrop, returns a Promise<boolean>. Adult reward logic branches on `person.role !== 'child'` in `scoreboard.html`'s `openStore()`. Functional reward usage (task-skip picker, penalty-removal) added as bottom sheets within the store.

**Tech Stack:** Vanilla JS, CSS variables, Firebase RTDB compat SDK

---

### Task 1: Add `showConfirm()` to components.js + CSS

**Files:**
- Modify: `shared/components.js` (add new export at end of file, before `initBell`)
- Modify: `styles/components.css` (add `.confirm-modal` styles after `.bottom-sheet` section, ~line 391)

- [ ] **Step 1: Add `showConfirm()` function to components.js**

Insert before the `initBell` export (before line 1338) in `shared/components.js`:

```js
/**
 * Show a polished in-app confirmation/alert modal. Replaces browser confirm()/alert().
 * Returns a Promise<boolean> — true if confirmed, false if cancelled.
 * Options: { title, message?, confirmLabel?, cancelLabel?, danger?, alert? }
 */
export function showConfirm({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, alert: isAlert = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal';
    overlay.innerHTML = `<div class="confirm-modal__card">
      <div class="confirm-modal__title">${escapeHtml(title)}</div>
      ${message ? `<div class="confirm-modal__message">${escapeHtml(message)}</div>` : ''}
      <div class="confirm-modal__actions">
        ${!isAlert ? `<button class="btn btn--secondary confirm-modal__cancel" type="button">${escapeHtml(cancelLabel)}</button>` : ''}
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} confirm-modal__ok" type="button">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;

    function close(result) {
      overlay.classList.remove('confirm-modal--active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }

    overlay.querySelector('.confirm-modal__ok').addEventListener('click', () => close(true));
    overlay.querySelector('.confirm-modal__cancel')?.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); document.removeEventListener('keydown', handler); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); document.removeEventListener('keydown', handler); }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('confirm-modal--active');
      overlay.querySelector('.confirm-modal__ok').focus();
    });
  });
}
```

- [ ] **Step 2: Add CSS for `.confirm-modal` to components.css**

Insert after the `.bottom-sheet__content` rule (~line 391) in `styles/components.css`:

```css
/* ============ Confirm Modal ============ */
.confirm-modal {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.confirm-modal--active {
  opacity: 1;
}

.confirm-modal__card {
  background: var(--bg-card);
  border-radius: var(--radius-lg, 16px);
  padding: 24px;
  max-width: 340px;
  width: calc(100vw - 48px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  transform: scale(0.9);
  transition: transform 0.2s ease;
}

.confirm-modal--active .confirm-modal__card {
  transform: scale(1);
}

.confirm-modal__title {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.confirm-modal__message {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 16px;
}

.confirm-modal__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.confirm-modal__actions .btn {
  min-width: 80px;
}

.btn--danger {
  background: var(--accent-danger, #e53e3e);
  color: #fff;
  border: none;
}

.btn--danger:hover {
  background: color-mix(in srgb, var(--accent-danger, #e53e3e), #000 10%);
}
```

- [ ] **Step 3: Verify `showConfirm` is exported**

Check `shared/components.js` — the function uses `export function showConfirm(...)` so it's auto-exported. No additional export statement needed.

- [ ] **Step 4: Commit**

```bash
git add shared/components.js styles/components.css
git commit -m "feat: add showConfirm() in-app confirmation modal"
```

---

### Task 2: Move `.toast` styles from kid.css to components.css

**Files:**
- Modify: `styles/components.css` (add `.toast` styles after `.confirm-modal` section)
- Modify: `styles/kid.css` (remove `.toast` rule at line 598)

- [ ] **Step 1: Add `.toast` to components.css**

Insert after the `.btn--danger:hover` rule just added in Task 1:

```css
/* ============ Toast ============ */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius, 8px);
  padding: 12px 20px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 3000;
  animation: toastFadeIn 0.2s ease;
}

@keyframes toastFadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

Note: The kid.css version used `--surface` and `--border` as variable names and the `kidFadeIn` keyframe. The components.css version uses the standard `--bg-card` and `--border-color` variables used throughout `components.css`, and defines its own `toastFadeIn` keyframe so it works independent of kid.css.

- [ ] **Step 2: Remove `.toast` from kid.css**

Remove this line (line 598) from `styles/kid.css`:

```css
    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius, 8px); padding: 12px 20px; font-size: var(--font-size-sm); font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 3000; animation: kidFadeIn 0.2s ease; }
```

- [ ] **Step 3: Commit**

```bash
git add styles/components.css styles/kid.css
git commit -m "refactor: move .toast styles to components.css for shared use"
```

---

### Task 3: Replace `confirm()`/`alert()` in shared/components.js

**Files:**
- Modify: `shared/components.js` (1 confirm, line ~1431)

- [ ] **Step 1: Replace the one `confirm()` call**

In `shared/components.js`, find line ~1431:

```js
        if (!confirm('Clear all notification history?')) return;
```

Replace with:

```js
        if (!await showConfirm({ title: 'Clear all notification history?', danger: true })) return;
```

Note: The enclosing function is already `async` (it's an event handler with `async () =>`).

- [ ] **Step 2: Commit**

```bash
git add shared/components.js
git commit -m "refactor: replace confirm() in components.js bell with showConfirm"
```

---

### Task 4: Replace `confirm()`/`alert()` in dashboard.js

**Files:**
- Modify: `dashboard.js` (2 confirms at lines ~768 and ~879, 1 alert at line ~485)

- [ ] **Step 1: Add `showConfirm` to the components.js import**

In `dashboard.js` line 2, add `showConfirm` to the import from `./shared/components.js`:

Find the existing import and add `showConfirm` to the list:
```js
import { renderNavBar, renderHeader, renderEmptyState, renderPersonFilter, renderProgressBar, renderTaskCard, renderTimeHeader, renderOverdueBanner, renderCelebration, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderQuickAddSheet, renderEditTaskSheet, renderEventBubble, renderEventDetailSheet, renderEventForm, renderAddMenu, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm } from './shared/components.js';
```

- [ ] **Step 2: Replace `confirm()` calls**

Find line ~768:
```js
    if (!confirm('Delete this event?')) return;
```
Replace with:
```js
    if (!await showConfirm({ title: 'Delete this event?', danger: true })) return;
```

Find line ~879:
```js
    if (!confirm('Delete this event?')) return;
```
Replace with:
```js
    if (!await showConfirm({ title: 'Delete this event?', danger: true })) return;
```

- [ ] **Step 3: Replace `alert()` call**

Find line ~485:
```js
      alert('Copied to clipboard!');
```
Replace with:
```js
      await showConfirm({ title: 'Copied to clipboard!', alert: true });
```

Note: Verify the enclosing function is `async`. If not, add `async` to the arrow function.

- [ ] **Step 4: Commit**

```bash
git add dashboard.js
git commit -m "refactor: replace confirm/alert in dashboard with showConfirm"
```

---

### Task 5: Replace `confirm()` in calendar.html

**Files:**
- Modify: `calendar.html` (2 confirms at lines ~674 and ~719)

- [ ] **Step 1: Add `showConfirm` to the components.js import**

In `calendar.html` line 43, add `showConfirm` to the import from `./shared/components.js`:

```js
import { renderNavBar, renderHeader, renderPersonFilter, renderTaskCard, renderTimeHeader, renderEmptyState, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderEditTaskSheet, renderQuickAddSheet, renderEventForm, renderEventDetailSheet, renderAddMenu, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm } from './shared/components.js';
```

- [ ] **Step 2: Replace both `confirm()` calls**

Find line ~674:
```js
        if (!confirm('Delete this event?')) return;
```
Replace with:
```js
        if (!await showConfirm({ title: 'Delete this event?', danger: true })) return;
```

Find line ~719:
```js
        if (!confirm('Delete this event?')) return;
```
Replace with:
```js
        if (!await showConfirm({ title: 'Delete this event?', danger: true })) return;
```

- [ ] **Step 3: Commit**

```bash
git add calendar.html
git commit -m "refactor: replace confirm in calendar with showConfirm"
```

---

### Task 6: Replace `confirm()`/`alert()` in kid.html

**Files:**
- Modify: `kid.html` (4 confirms, 2 alerts)

- [ ] **Step 1: Add `showConfirm` to the components.js import**

In `kid.html`, find the components.js import (there should be one — search for `from './shared/components.js'`). Add `showConfirm` to it. If kid.html imports components individually, find where `renderBottomSheet` is imported and add `showConfirm` next to it.

Search for the import line and add `showConfirm`.

- [ ] **Step 2: Replace `confirm()` calls**

Find line ~1201:
```js
                if (!reward || !confirm(`Spend ${reward.pointCost} pts on ${reward.name}?`)) return;
```
Replace with:
```js
                if (!reward || !await showConfirm({ title: `Spend ${reward.pointCost} pts on ${reward.name}?` })) return;
```

Find line ~1246:
```js
                if (!confirm(`Cancel request for ${rewardName}? Points will be refunded.`)) return;
```
Replace with:
```js
                if (!await showConfirm({ title: `Cancel request for ${rewardName}?`, message: 'Points will be refunded.', danger: true })) return;
```

Find line ~1371:
```js
            if (!confirm(`Restore full points for "${penalty.taskName}" on ${penalty.dateKey}? (+${penalty.pointsRestored} pts)`)) return;
```
Replace with:
```js
            if (!await showConfirm({ title: `Restore full points for "${penalty.taskName}"?`, message: `${penalty.dateKey} — +${penalty.pointsRestored} pts` })) return;
```

Find line ~1400:
```js
              if (!confirm(`Use ${token.rewardName || 'this reward'}? A parent will need to approve.`)) return;
```
Replace with:
```js
              if (!await showConfirm({ title: `Use ${token.rewardName || 'this reward'}?`, message: 'A parent will need to approve.' })) return;
```

- [ ] **Step 3: Replace `alert()` calls**

Find line ~1328:
```js
            if (skippable.length === 0) { alert("All tasks done — nothing to skip!"); return; }
```
Replace with:
```js
            if (skippable.length === 0) { await showConfirm({ title: 'All tasks done — nothing to skip!', alert: true }); return; }
```

Find line ~1369:
```js
            if (!penalty) { alert("No penalties to remove right now"); return; }
```
Replace with:
```js
            if (!penalty) { await showConfirm({ title: 'No penalties to remove right now', alert: true }); return; }
```

- [ ] **Step 4: Commit**

```bash
git add kid.html
git commit -m "refactor: replace confirm/alert in kid.html with showConfirm"
```

---

### Task 7: Replace `confirm()`/`alert()` in admin.html

**Files:**
- Modify: `admin.html` (13 confirms, ~8 alerts)

- [ ] **Step 1: Add `showConfirm` to the components.js import**

In `admin.html` line 73, add `showConfirm` to the import:

```js
import { renderNavBar, renderHeader, renderEmptyState, renderUndoToast, renderTaskFormCompact, renderBottomSheet, initOfflineBanner, showConfirm } from './shared/components.js';
```

- [ ] **Step 2: Replace all 13 `confirm()` calls**

Each replacement follows the pattern: `confirm(msg)` → `await showConfirm({ title: msg })`. For destructive actions, add `danger: true`. Verify each enclosing function is `async`.

Line ~1666 (remove bank token):
```js
          if (!confirm(`Remove "${tokenName}" from ${person?.name}'s bank?`)) return;
```
→
```js
          if (!await showConfirm({ title: `Remove "${tokenName}" from ${person?.name}'s bank?`, danger: true })) return;
```

Line ~1798 (delete reward):
```js
          if (!confirm(`Delete "${reward?.name || 'this reward'}"? This cannot be undone.`)) return;
```
→
```js
          if (!await showConfirm({ title: `Delete "${reward?.name || 'this reward'}"?`, message: 'This cannot be undone.', danger: true })) return;
```

Line ~2084 (reset achievements):
```js
          if (!confirm(`Reset all achievements for ${person?.name}? They can re-earn them when criteria are met again.`)) return;
```
→
```js
          if (!await showConfirm({ title: `Reset all achievements for ${person?.name}?`, message: 'They can re-earn them when criteria are met again.', danger: true })) return;
```

Line ~2147 (revoke achievement):
```js
            if (!confirm(`Revoke "${def.label}" from ${person?.name}?`)) return;
```
→
```js
            if (!await showConfirm({ title: `Revoke "${def.label}" from ${person?.name}?`, danger: true })) return;
```

Line ~2206 (delete achievement def):
```js
          if (!confirm(`Delete "${allDefs[key]?.label || key}"? This cannot be undone.`)) return;
```
→
```js
          if (!await showConfirm({ title: `Delete "${allDefs[key]?.label || key}"?`, message: 'This cannot be undone.', danger: true })) return;
```

Line ~3008 (bulk delete tasks):
```js
      if (!confirm(`Delete ${count} task${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
```
→
```js
      if (!await showConfirm({ title: `Delete ${count} task${count !== 1 ? 's' : ''}?`, message: 'This cannot be undone.', danger: true })) return;
```

Line ~3078 (delete single task):
```js
          if (!confirm(`Delete "${name}"?`)) return;
```
→
```js
          if (!await showConfirm({ title: `Delete "${name}"?`, danger: true })) return;
```

Line ~3224 (reset balance):
```js
          if (!confirm('Reset this person\'s rewards balance to 0?')) return;
```
→
```js
          if (!await showConfirm({ title: 'Reset rewards balance to 0?', danger: true })) return;
```

Line ~3234 (clear messages):
```js
          if (!confirm('Clear message history? Balance will be preserved.')) return;
```
→
```js
          if (!await showConfirm({ title: 'Clear message history?', message: 'Balance will be preserved.', danger: true })) return;
```

Line ~3355 (delete category):
```js
          if (!confirm(`Delete category "${catsObj[key]?.label}"? Tasks will be reassigned to "${fallbackLabel}".`)) return;
```
→
```js
          if (!await showConfirm({ title: `Delete category "${catsObj[key]?.label}"?`, message: `Tasks will be reassigned to "${fallbackLabel}".`, danger: true })) return;
```

Line ~3464 (delete person):
```js
          const ok = confirm(
```
Find the full multi-line confirm and replace with `await showConfirm({ title: ..., message: ..., danger: true })`. Read the actual lines to get the exact message text.

Line ~3631 (import overwrite):
```js
          if (!confirm('This will OVERWRITE all current data with the imported backup. Continue?')) {
```
→
```js
          if (!await showConfirm({ title: 'Overwrite all data?', message: 'This will replace everything with the imported backup.', confirmLabel: 'Overwrite', danger: true })) {
```

Line ~3735 (prune data):
```js
            if (!confirm(`Prune ${schedCount} schedule days, ${compCount} completions, ${snapCount} snapshot days older than ${months} months?`)) {
```
→
```js
            if (!await showConfirm({ title: 'Prune old data?', message: `${schedCount} schedule days, ${compCount} completions, ${snapCount} snapshot days older than ${months} months.`, confirmLabel: 'Prune', danger: true })) {
```

- [ ] **Step 3: Replace all ~8 `alert()` calls**

Line ~1713:
```js
          if (!selectedChip || !rewardId) { alert('Select a person and reward'); return; }
```
→
```js
          if (!selectedChip || !rewardId) { await showConfirm({ title: 'Select a person and reward', alert: true }); return; }
```

Line ~2295:
```js
        if (!name) { alert('Name is required'); return; }
```
→
```js
        if (!name) { await showConfirm({ title: 'Name is required', alert: true }); return; }
```

Line ~2310:
```js
            if (stat !== 'firstRedemption' && !threshold) { alert('Threshold is required'); return; }
```
→
```js
            if (stat !== 'firstRedemption' && !threshold) { await showConfirm({ title: 'Threshold is required', alert: true }); return; }
```

Line ~3124:
```js
        if (!name) { alert('Event name is required.'); return; }
```
→
```js
        if (!name) { await showConfirm({ title: 'Event name is required', alert: true }); return; }
```

Line ~3127:
```js
        if (!date) { alert('Date is required.'); return; }
```
→
```js
        if (!date) { await showConfirm({ title: 'Date is required', alert: true }); return; }
```

Line ~3348:
```js
          if (ca.length <= 1) { alert('Cannot delete the last category.'); return; }
```
→
```js
          if (ca.length <= 1) { await showConfirm({ title: 'Cannot delete the last category', alert: true }); return; }
```

Line ~3435:
```js
          if (catsObj[key]) { alert('A category with this key already exists.'); return; }
```
→
```js
          if (catsObj[key]) { await showConfirm({ title: 'A category with this key already exists', alert: true }); return; }
```

Lines ~3840 and ~3854 (copied to clipboard):
```js
        alert('Copied to clipboard!');
```
→
```js
        await showConfirm({ title: 'Copied to clipboard!', alert: true });
```

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "refactor: replace all confirm/alert in admin with showConfirm"
```

---

### Task 8: Adult instant-purchase in scoreboard store

**Files:**
- Modify: `scoreboard.html` (lines ~42-48 imports, lines ~766-791 "Get it!" handler)

- [ ] **Step 1: Add imports**

In `scoreboard.html` line 42, add `writeSnapshot` to the firebase import:

```js
import { initFirebase, isFirstRun, readSettings, readPeople, readTasks, readCategories, readCompletions, readAllSchedule, readAllSnapshots, readAllStreaks, readAllAchievements, onConnectionChange, writePerson, onAllMessages, writeMessage, markMessageSeen, removeMessage, writeBankToken, markBankTokenUsed, readBank, removeBankToken, writeMultiplier, readAllBalanceAnchors, readAllMessages, readMultipliers, readRewards, countGlobalRedemptions, readAchievementDefs, writeSnapshot, updateData } from './shared/firebase.js';
```

In `scoreboard.html` line 43, add `showConfirm` to the components import:

```js
import { renderNavBar, renderHeader, renderEmptyState, renderPersonFilter, renderGradeBadge, renderBottomSheet, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm } from './shared/components.js';
```

In `scoreboard.html` line 48, add `findHighestDamagePenalty` and `buildSnapshot` to the scoring import:

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, findHighestDamagePenalty, buildSnapshot } from './shared/scoring.js';
```

- [ ] **Step 2: Branch adult vs child in the "Get it!" handler**

In `scoreboard.html`, find the "Get it!" button handler (lines ~766-791). Replace the entire handler body:

Current code:
```js
      for (const btn of mount.querySelectorAll('.store-get-btn')) {
        btn.addEventListener('click', async () => {
          const rewardId = btn.dataset.rewardId;
          const reward = rewards[rewardId];
          if (!reward || !confirm(`Spend ${reward.pointCost} pts on ${reward.name} for ${person.name}?`)) return;

          await writeMessage(personId, {
            type: 'redemption-request',
            title: reward.name,
            body: null,
            amount: -reward.pointCost,
            rewardId,
            entryKey: null,
            seen: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: personId
          });

          mount.innerHTML = '';
          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.textContent = `Requested ${reward.name}! Waiting for approval...`;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        });
      }
```

Replace with:
```js
      for (const btn of mount.querySelectorAll('.store-get-btn')) {
        btn.addEventListener('click', async () => {
          const rewardId = btn.dataset.rewardId;
          const reward = rewards[rewardId];
          if (!reward) return;
          if (!await showConfirm({ title: `Spend ${reward.pointCost} pts on ${reward.name}?` })) return;

          if (person.role !== 'child') {
            // Adult: instant approve — no request, no bell
            await writeMessage(personId, {
              type: 'redemption-approved',
              title: `${reward.name} approved!`,
              body: null,
              amount: -reward.pointCost,
              rewardId,
              entryKey: null,
              seen: true,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: 'self'
            });
            await writeBankToken(personId, {
              rewardType: reward.rewardType || 'custom',
              rewardId,
              rewardName: reward.name,
              rewardIcon: reward.icon || '🎁',
              acquiredAt: Date.now(),
              used: false,
              usedAt: null,
              targetEntryKey: null
            });
            mount.innerHTML = '';
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = `Got ${reward.name}!`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          } else {
            // Child: send request for parent approval
            await writeMessage(personId, {
              type: 'redemption-request',
              title: reward.name,
              body: null,
              amount: -reward.pointCost,
              rewardId,
              entryKey: null,
              seen: false,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: personId
            });
            mount.innerHTML = '';
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = `Requested ${reward.name}! Waiting for approval...`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          }
        });
      }
```

- [ ] **Step 3: Replace the remaining `confirm()` for remove-token**

Find lines ~794-803:
```js
          if (!confirm(`Remove "${tokenName}" from ${person.name}'s bank?`)) return;
```
Replace with:
```js
          if (!await showConfirm({ title: `Remove "${tokenName}" from ${person.name}'s bank?`, danger: true })) return;
```

- [ ] **Step 4: Commit**

```bash
git add scoreboard.html
git commit -m "feat: adult instant-purchase in scoreboard store, replace confirm()"
```

---

### Task 9: Add "Use" button on saved tokens in scoreboard store

**Files:**
- Modify: `scoreboard.html` (saved tokens rendering ~lines 682-705, bind new handlers after ~line 803)

- [ ] **Step 1: Update saved token rendering to include "Use" button for adults**

Find the saved tokens rendering section (lines ~686-702). Replace the loop body:

Current:
```js
        for (const [tokenId, token] of savedTokens) {
          const typeLabel = token.rewardType === 'task-skip' ? 'Task Skip'
            : token.rewardType === 'penalty-removal' ? 'Penalty Removal'
            : (token.rewardName || 'Reward');
          const icon = token.rewardType === 'task-skip' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>'
            : token.rewardType === 'penalty-removal' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
            : esc(token.rewardIcon || '🎁');
          html += `<div class="store-card" style="border-color: var(--accent);">
            <div class="store-card__icon">${icon}</div>
            <div class="store-card__body">
              <div class="store-card__name">${esc(typeLabel)}</div>
              <div class="store-card__cost" style="color: var(--text-secondary); font-size: var(--font-size-xs, 0.75rem);">Saved ${new Date(token.acquiredAt).toLocaleDateString()}</div>
            </div>
            <div class="store-card__actions">
              <button class="btn btn--xs btn--ghost store-remove-token" data-token-id="${esc(tokenId)}" data-token-name="${esc(typeLabel)}" type="button" style="color: var(--accent-danger, #e53e3e);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          </div>`;
        }
```

Replace with:
```js
        const isAdult = person.role !== 'child';
        for (const [tokenId, token] of savedTokens) {
          const typeLabel = token.rewardType === 'task-skip' ? 'Task Skip'
            : token.rewardType === 'penalty-removal' ? 'Penalty Removal'
            : (token.rewardName || 'Reward');
          const icon = token.rewardType === 'task-skip' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>'
            : token.rewardType === 'penalty-removal' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
            : esc(token.rewardIcon || '🎁');
          const useBtn = isAdult ? `<button class="btn btn--xs btn--primary store-use-token" data-token-id="${esc(tokenId)}" data-reward-type="${esc(token.rewardType || 'custom')}" data-token-name="${esc(typeLabel)}" data-reward-id="${esc(token.rewardId || '')}" data-reward-icon="${esc(token.rewardIcon || '🎁')}" type="button">Use</button>` : '';
          html += `<div class="store-card" style="border-color: var(--accent);">
            <div class="store-card__icon">${icon}</div>
            <div class="store-card__body">
              <div class="store-card__name">${esc(typeLabel)}</div>
              <div class="store-card__cost" style="color: var(--text-secondary); font-size: var(--font-size-xs, 0.75rem);">Saved ${new Date(token.acquiredAt).toLocaleDateString()}</div>
            </div>
            <div class="store-card__actions">
              ${useBtn}
              <button class="btn btn--xs btn--ghost store-remove-token" data-token-id="${esc(tokenId)}" data-token-name="${esc(typeLabel)}" type="button" style="color: var(--accent-danger, #e53e3e);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          </div>`;
        }
```

- [ ] **Step 2: Bind "Use" button handlers**

After the existing `store-remove-token` handler block (after line ~803), add:

```js
      // Bind "Use" buttons for adult saved tokens
      for (const btn of mount.querySelectorAll('.store-use-token')) {
        btn.addEventListener('click', async () => {
          const tokenId = btn.dataset.tokenId;
          const rewardType = btn.dataset.rewardType;
          const tokenName = btn.dataset.tokenName;
          const rewardId = btn.dataset.rewardId;
          const rewardIcon = btn.dataset.rewardIcon;

          if (rewardType === 'custom' || (!rewardType || rewardType === '')) {
            // Custom reward: confirm and mark used
            if (!await showConfirm({ title: `Use ${tokenName}?` })) return;
            await markBankTokenUsed(personId, tokenId, null);
            await writeMessage(personId, {
              type: 'reward-used',
              title: `Used: ${tokenName}`,
              body: null,
              amount: 0,
              rewardId: rewardId || null,
              entryKey: null,
              seen: true,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: 'self'
            });
            mount.innerHTML = '';
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = `Used ${tokenName}!`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          } else if (rewardType === 'task-skip') {
            // Task skip: show task picker
            const todaySched = schedule[today] || {};
            const skippable = Object.entries(todaySched).filter(([key, entry]) => {
              if (entry.ownerId !== personId) return false;
              if (comps[key]) return false;
              const task = tasks[entry.taskId];
              if (!task) return false;
              const cat = cats[task.category];
              if (cat?.isEvent) return false;
              if (entry.exempt || entry.skipped) return false;
              return true;
            });

            if (skippable.length === 0) {
              await showConfirm({ title: 'No skippable tasks today!', alert: true });
              return;
            }

            let skipHtml = '<h3 style="margin-bottom: 12px;">Pick a task to skip</h3>';
            for (const [key, entry] of skippable) {
              const task = tasks[entry.taskId];
              skipHtml += `<button class="skip-pick-btn" data-entry-key="${key}" type="button" style="display: block; width: 100%; text-align: left; padding: 12px; margin-bottom: 8px; border: 1px solid var(--border-color); border-radius: var(--radius, 8px); background: var(--bg-card); cursor: pointer;">${esc(task.name)}</button>`;
            }

            mount.innerHTML = renderBottomSheet(skipHtml);
            requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

            for (const skipBtn of mount.querySelectorAll('.skip-pick-btn')) {
              skipBtn.addEventListener('click', async () => {
                const skipEntryKey = skipBtn.dataset.entryKey;
                await updateData(`schedule/${today}/${skipEntryKey}`, { exempt: true, skipped: true });
                await markBankTokenUsed(personId, tokenId, skipEntryKey);
                const skipEntry = todaySched[skipEntryKey];
                const skipTask = tasks[skipEntry?.taskId];
                await writeMessage(personId, { type: 'task-skip-used', title: `Skipped: ${skipTask?.name || 'task'}`, body: null, amount: 0, rewardId: null, entryKey: skipEntryKey, seen: true, createdAt: firebase.database.ServerValue.TIMESTAMP, createdBy: 'self' });
                mount.innerHTML = '';
                const toast = document.createElement('div');
                toast.className = 'toast';
                toast.textContent = `Skipped ${skipTask?.name}!`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
              });
            }

            mount.querySelector('.bottom-sheet-overlay')?.addEventListener('click', (e) => {
              if (e.target.classList.contains('bottom-sheet-overlay')) mount.innerHTML = '';
            });
          } else if (rewardType === 'penalty-removal') {
            // Penalty removal: find and remove highest-damage penalty
            const freshCompletions = await readCompletions();
            const freshSchedule = await readAllSchedule();
            const penalty = findHighestDamagePenalty(freshCompletions || {}, freshSchedule || {}, tasks, settings, personId);

            if (!penalty) {
              await showConfirm({ title: 'No penalties to remove right now', alert: true });
              return;
            }

            if (!await showConfirm({ title: `Restore full points for "${penalty.taskName}"?`, message: `${penalty.dateKey} — +${penalty.pointsRestored} pts` })) return;

            await updateData(`completions/${penalty.entryKey}`, { isLate: null, pointsOverride: null });
            await markBankTokenUsed(personId, tokenId, penalty.entryKey);
            await writeMessage(personId, { type: 'penalty-removed', title: `Restored: ${penalty.taskName}`, body: `Full points restored for ${penalty.dateKey} (+${penalty.pointsRestored} pts)`, amount: penalty.pointsRestored, rewardId: null, entryKey: penalty.entryKey, seen: true, createdAt: firebase.database.ServerValue.TIMESTAMP, createdBy: 'self' });

            // Rebuild snapshot for the affected date
            const freshComps = await readCompletions();
            const penDaySched = (freshSchedule || {})[penalty.dateKey] || {};
            const penPersonEntries = {};
            for (const [k, e] of Object.entries(penDaySched)) {
              if (e.ownerId === personId) penPersonEntries[k] = e;
            }
            const newSnap = buildSnapshot(penPersonEntries, freshComps, tasks, cats, settings, penalty.dateKey);
            if (newSnap) await writeSnapshot(penalty.dateKey, personId, newSnap);

            mount.innerHTML = '';
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = `Restored full points for ${penalty.taskName}!`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          }
        });
      }
```

- [ ] **Step 3: Commit**

```bash
git add scoreboard.html
git commit -m "feat: Use button on saved tokens — custom, task-skip, penalty-removal"
```

---

### Task 10: Replace `alert()` in setup.html

**Files:**
- Modify: `setup.html` (1 alert at line ~828)

- [ ] **Step 1: Check if setup.html loads components.css**

Read the `<head>` section of `setup.html` to confirm `styles/components.css` is included. If not, add it. Since `showConfirm` styles live in `components.css`, the page needs it.

- [ ] **Step 2: Add `showConfirm` import or inline**

`setup.html` may not import from `components.js`. Check the imports. If it doesn't use module imports from components, the simplest approach is to skip this one file — the setup wizard is only seen once and a single `alert()` for "Setup failed" is acceptable. **Skip if no existing components.js import.**

If it does import from components.js, add `showConfirm` to the import and replace:
```js
        alert('Setup failed. Check your connection and try again.');
```
→
```js
        await showConfirm({ title: 'Setup failed', message: 'Check your connection and try again.', alert: true });
```

- [ ] **Step 3: Commit (if changes made)**

```bash
git add setup.html
git commit -m "refactor: replace alert in setup.html with showConfirm"
```

---

### Task 11: Update CLAUDE.md schema docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `reward-used` to message type enum**

Find the message type line in the Firebase schema section of `CLAUDE.md`:
```
│                       type: 'bonus' | 'deduction' | 'redemption-request' | 'redemption-approved' | 'redemption-denied'
│                             | 'use-request' | 'use-approved' | 'use-denied' | 'task-skip-used' | 'penalty-removed'
```

Replace with:
```
│                       type: 'bonus' | 'deduction' | 'redemption-request' | 'redemption-approved' | 'redemption-denied'
│                             | 'use-request' | 'use-approved' | 'use-denied' | 'task-skip-used' | 'penalty-removed' | 'reward-used'
```

- [ ] **Step 2: Update Changelog**

Add to the top of the changelog section:
```
- Adult rewards + confirm modals: Adults skip approval for buying/using rewards (instant). "Use" button on saved tokens in scoreboard store (including task-skip picker and penalty removal). All browser confirm()/alert() replaced with polished in-app showConfirm() modals. Toast styles shared across all pages.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add reward-used message type, update changelog"
```

---

### Task 12: Test all flows end-to-end

- [ ] **Step 1: Start dev server and open the app**

Open `index.html` in browser. Verify no console errors on load.

- [ ] **Step 2: Test confirmation modals**

- Go to admin, try deleting a task → polished modal appears (not browser dialog)
- Cancel → nothing happens
- Confirm → task deleted
- Try keyboard: Escape to cancel, Enter to confirm
- Try clicking backdrop to cancel

- [ ] **Step 3: Test adult instant purchase**

- Open scoreboard → Store → pick an adult
- Click "Get it!" on a reward → polished confirm modal
- Confirm → toast says "Got [name]!", no "Waiting for approval"
- Check bell → no pending request

- [ ] **Step 4: Test "Use" on saved tokens**

- As adult with a saved custom reward → click "Use" → confirm → toast "Used [name]!"
- As adult with task-skip → click "Use" → task picker sheet appears → pick task → toast
- As adult with penalty-removal → click "Use" → confirm with penalty details → toast

- [ ] **Step 5: Test child flows unchanged**

- Open kid.html for a child → buy reward → "Waiting for approval..."
- Approve from bell → Use Now / Save for Later overlay appears
- Scoreboard store for a child → no "Use" button on saved tokens

- [ ] **Step 6: Test toasts render on all pages**

- Scoreboard toast (store purchase) → styled correctly
- Bell "Send Message" toast → styled correctly
- Dashboard event deletion confirm → modal appears

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: adult instant rewards, showConfirm modals, Use button on saved tokens"
```
