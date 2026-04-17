# Rewards Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a normalized points economy (100 pts/day from daily scores), rewards store with parent-defined rewards, parent bonus/deduction messages, notification bell, functional rewards (task skip, penalty removal), bounty tasks, achievements, and bonus multiplier days.

**Architecture:** Rewards balance is a computed layer on top of the existing scoring engine — no scoring code changes. All new data lives in new Firebase nodes (`rewards/`, `messages/`, `bank/`, etc.). A notification bell in the shared header drives parent approval workflows and kid message delivery. Functional rewards use a token bank pattern (buy → bank → use whenever).

**Tech Stack:** Vanilla JS (ES modules), Firebase RTDB (compat SDK), CSS variables, no bundler/npm.

**Spec:** `docs/superpowers/specs/2026-04-17-rewards-store-design.md`

**No test suite** — this project has no automated tests. Each task includes manual verification steps.

---

## Phase 1: Data Foundation

### Task 1: Firebase CRUD — Rewards, Messages, Bank, Anchors

**Files:**
- Modify: `shared/firebase.js` (add ~25 new exported functions at bottom)

- [ ] **Step 1: Add rewards CRUD functions**

Add to the bottom of `shared/firebase.js`:

```js
// ── Rewards Store ──

export async function readRewards() {
  return readOnce('rewards');
}

export async function writeReward(rewardId, data) {
  await writeData(`rewards/${rewardId}`, data);
}

export async function pushReward(data) {
  return pushData('rewards', data);
}

export async function archiveReward(rewardId) {
  await updateData(`rewards/${rewardId}`, { status: 'archived' });
}
```

- [ ] **Step 2: Add messages CRUD functions**

```js
// ── Messages ──

export async function readMessages(personId) {
  return readOnce(`messages/${personId}`);
}

export async function readAllMessages() {
  return readOnce('messages');
}

export async function writeMessage(personId, data) {
  return pushData(`messages/${personId}`, data);
}

export async function markMessageSeen(personId, msgId) {
  await updateData(`messages/${personId}/${msgId}`, { seen: true });
}

export async function clearMessages(personId, beforeTimestamp) {
  const msgs = await readOnce(`messages/${personId}`);
  if (!msgs) return;
  const updates = {};
  for (const [id, msg] of Object.entries(msgs)) {
    if (msg.createdAt && msg.createdAt < beforeTimestamp) {
      updates[`messages/${personId}/${id}`] = null;
    }
  }
  if (Object.keys(updates).length > 0) {
    await multiUpdate(updates);
  }
}

export function onMessages(personId, callback) {
  return onValue(`messages/${personId}`, callback);
}

export function onAllMessages(callback) {
  return onValue('messages', callback);
}
```

- [ ] **Step 3: Add balance anchor functions**

```js
// ── Balance Anchors ──

export async function readBalanceAnchor(personId) {
  return readOnce(`balanceAnchors/${personId}`);
}

export async function readAllBalanceAnchors() {
  return readOnce('balanceAnchors');
}

export async function writeBalanceAnchor(personId, data) {
  await writeData(`balanceAnchors/${personId}`, data);
}
```

- [ ] **Step 4: Add bank functions**

```js
// ── Reward Bank (functional reward tokens) ──

export async function readBank(personId) {
  return readOnce(`bank/${personId}`);
}

export async function writeBankToken(personId, data) {
  return pushData(`bank/${personId}`, data);
}

export async function markBankTokenUsed(personId, tokenId, entryKey) {
  await updateData(`bank/${personId}/${tokenId}`, {
    used: true,
    usedAt: firebase.database.ServerValue.TIMESTAMP,
    targetEntryKey: entryKey
  });
}

export function onBank(personId, callback) {
  return onValue(`bank/${personId}`, callback);
}
```

- [ ] **Step 5: Add wishlist, achievements, and multiplier functions**

```js
// ── Wishlist ──

export async function readWishlist(personId) {
  return readOnce(`wishlist/${personId}`);
}

export async function writeWishlistItem(personId, rewardId) {
  await writeData(`wishlist/${personId}/${rewardId}`, {
    addedAt: firebase.database.ServerValue.TIMESTAMP
  });
}

export async function removeWishlistItem(personId, rewardId) {
  await removeData(`wishlist/${personId}/${rewardId}`);
}

// ── Achievements ──

export async function readAchievements(personId) {
  return readOnce(`achievements/${personId}`);
}

export async function readAllAchievements() {
  return readOnce('achievements');
}

export async function writeAchievement(personId, key, data) {
  await writeData(`achievements/${personId}/${key}`, data);
}

export async function markAchievementSeen(personId, key) {
  await updateData(`achievements/${personId}/${key}`, { seen: true });
}

// ── Bonus Multiplier Days ──

export async function readMultipliers() {
  return readOnce('multipliers');
}

export async function writeMultiplier(dateKey, personId, data) {
  await writeData(`multipliers/${dateKey}/${personId}`, data);
}

// ── Person Rewards Data Cleanup ──

export async function deletePersonRewardsData(personId) {
  const updates = {};
  updates[`messages/${personId}`] = null;
  updates[`balanceAnchors/${personId}`] = null;
  updates[`bank/${personId}`] = null;
  updates[`wishlist/${personId}`] = null;
  updates[`achievements/${personId}`] = null;

  // Clean up multipliers referencing this person
  const multipliers = await readOnce('multipliers');
  if (multipliers) {
    for (const [dateKey, people] of Object.entries(multipliers)) {
      if (people[personId]) {
        updates[`multipliers/${dateKey}/${personId}`] = null;
      }
    }
  }

  // Clean up perPerson arrays in rewards
  const rewards = await readOnce('rewards');
  if (rewards) {
    for (const [rewardId, reward] of Object.entries(rewards)) {
      if (Array.isArray(reward.perPerson) && reward.perPerson.includes(personId)) {
        const filtered = reward.perPerson.filter(id => id !== personId);
        updates[`rewards/${rewardId}/perPerson`] = filtered.length > 0 ? filtered : null;
      }
    }
  }

  await multiUpdate(updates);
}
```

- [ ] **Step 6: Verify** — Open any page in the browser, open console, confirm no import errors. Run `await readRewards()` in console to confirm it returns null (no data yet).

- [ ] **Step 7: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(rewards): add Firebase CRUD for rewards, messages, bank, achievements, multipliers"
```

---

### Task 2: Balance Calculation & Achievement Checking (scoring.js)

**Files:**
- Modify: `shared/scoring.js` (add ~120 lines at bottom)

- [ ] **Step 1: Add balance calculation function**

Add to the bottom of `scoring.js`:

```js
// ── Rewards Balance ──

/**
 * Achievement definitions — thresholds and metadata.
 */
export const ACHIEVEMENTS = {
  'streak-7':    { icon: '🔥', label: '7-Day Streak', description: 'One full week!' },
  'streak-14':   { icon: '🔥', label: '14-Day Streak', description: 'Two weeks strong!' },
  'streak-30':   { icon: '🔥', label: '30-Day Streak', description: 'Monthly master!' },
  'streak-60':   { icon: '🔥', label: '60-Day Streak', description: 'Unstoppable!' },
  'streak-100':  { icon: '🔥', label: '100-Day Streak', description: 'Legendary!' },
  'grade-a-plus-day':   { icon: '⭐', label: 'First A+ Day', description: 'Perfect day!' },
  'grade-a-plus-week':  { icon: '⭐', label: 'First A+ Week', description: 'Perfect week!' },
  'grade-a-plus-month': { icon: '⭐', label: 'First A+ Month', description: 'Perfect month!' },
  'points-500':   { icon: '💰', label: '500 Points', description: 'Getting started!' },
  'points-1000':  { icon: '💰', label: '1,000 Points', description: 'On a roll!' },
  'points-5000':  { icon: '💰', label: '5,000 Points', description: 'Point machine!' },
  'points-10000': { icon: '💰', label: '10,000 Points', description: 'Unstoppable earner!' },
  'first-redemption': { icon: '🎁', label: 'First Redemption', description: 'First reward claimed!' }
};

const STREAK_THRESHOLDS = [7, 14, 30, 60, 100];
const POINTS_THRESHOLDS = [500, 1000, 5000, 10000];

/**
 * Calculate a person's spendable rewards balance.
 *
 * @param {string} personId
 * @param {object} allSnapshots - { dateKey: { personId: snapshot } }
 * @param {object} messages - { msgId: message } for this person (already filtered)
 * @param {object|null} anchor - { amount, anchoredAt } or null
 * @param {object|null} multipliers - { dateKey: { personId: { multiplier } } }
 * @returns {{ balance: number, totalEarned: number }}
 */
export function calculateBalance(personId, allSnapshots, messages, anchor, multipliers) {
  const anchorAmount = anchor?.amount || 0;
  const anchorDate = anchor?.anchoredAt || 0;

  let snapshotEarning = 0;
  if (allSnapshots) {
    for (const [dateKey, people] of Object.entries(allSnapshots)) {
      const snap = people?.[personId];
      if (!snap) continue;
      // Convert dateKey to timestamp for anchor comparison
      const dateTs = new Date(dateKey + 'T00:00:00Z').getTime();
      if (dateTs <= anchorDate) continue;
      const mult = multipliers?.[dateKey]?.[personId]?.multiplier || 1;
      snapshotEarning += (snap.percentage || 0) * mult;
    }
  }

  let bonuses = 0;
  let deductions = 0;
  let spent = 0;
  if (messages) {
    for (const msg of Object.values(messages)) {
      if (msg.createdAt && msg.createdAt <= anchorDate) continue;
      const amt = msg.amount || 0;
      if (msg.type === 'bonus') bonuses += amt;
      else if (msg.type === 'deduction') deductions += Math.abs(amt);
      else if (msg.type === 'redemption-request') spent += Math.abs(amt);
    }
  }

  const balance = anchorAmount + snapshotEarning + bonuses - deductions - spent;
  const totalEarned = anchorAmount + snapshotEarning + bonuses;

  return { balance: Math.round(balance), totalEarned: Math.round(totalEarned) };
}

/**
 * Check which achievements a person has newly earned.
 * Returns an array of achievement keys that should be unlocked.
 *
 * @param {object} context - { streak, totalEarned, existingAchievements, weeklyGrade, monthlyGrade, dailyGrade, hasRedeemed }
 * @returns {string[]} newly unlocked achievement keys
 */
export function checkNewAchievements(context) {
  const {
    streak = 0,
    totalEarned = 0,
    existingAchievements = {},
    weeklyGrade = '--',
    monthlyGrade = '--',
    dailyGrade = '--',
    hasRedeemed = false
  } = context;

  const newKeys = [];

  // Streak milestones
  for (const threshold of STREAK_THRESHOLDS) {
    const key = `streak-${threshold}`;
    if (streak >= threshold && !existingAchievements[key]) {
      newKeys.push(key);
    }
  }

  // Grade milestones
  if (dailyGrade === 'A+' && !existingAchievements['grade-a-plus-day']) {
    newKeys.push('grade-a-plus-day');
  }
  if (weeklyGrade === 'A+' && !existingAchievements['grade-a-plus-week']) {
    newKeys.push('grade-a-plus-week');
  }
  if (monthlyGrade === 'A+' && !existingAchievements['grade-a-plus-month']) {
    newKeys.push('grade-a-plus-month');
  }

  // Points milestones
  for (const threshold of POINTS_THRESHOLDS) {
    const key = `points-${threshold}`;
    if (totalEarned >= threshold && !existingAchievements[key]) {
      newKeys.push(key);
    }
  }

  // First redemption
  if (hasRedeemed && !existingAchievements['first-redemption']) {
    newKeys.push('first-redemption');
  }

  return newKeys;
}

/**
 * Find the highest-damage penalized task for penalty removal.
 *
 * @param {object} completions - all completions
 * @param {object} schedule - all schedule entries { dateKey: { entryKey: entry } }
 * @param {object} tasks - all task definitions
 * @param {object} settings - app settings
 * @returns {{ entryKey, dateKey, taskName, pointsRestored } | null}
 */
export function findHighestDamagePenalty(completions, schedule, tasks, settings) {
  const mults = settings?.difficultyMultipliers;
  let best = null;

  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      const completion = completions?.[entryKey];
      if (!completion?.isLate) continue;
      if (completion.pointsOverride == null) continue;

      const task = tasks?.[entry.taskId];
      if (!task) continue;

      const base = basePoints(task, mults);
      const earned = Math.round(base * (completion.pointsOverride / 100));
      const damage = base - earned;

      if (!best || damage > best.pointsRestored) {
        best = { entryKey, dateKey, taskName: task.name, pointsRestored: damage };
      }
    }
  }

  return best;
}
```

- [ ] **Step 2: Verify** — Open any page, check console for import errors. The functions are pure and don't run at import time, so no visible output expected.

- [ ] **Step 3: Commit**

```bash
git add shared/scoring.js
git commit -m "feat(rewards): add balance calculation, achievement checking, penalty finder to scoring.js"
```

---

## Phase 2: Notification Bell

### Task 3: Bell Component in Header

**Files:**
- Modify: `shared/components.js` (add `renderBellIcon` function, update `renderHeader`)
- Modify: `styles/components.css` (add bell styles)

- [ ] **Step 1: Add bell rendering to components.js**

Add a new function before `renderHeader`:

```js
/**
 * Render the notification bell icon with optional badge count.
 * @param {number} count - unseen notification count
 * @returns {string} HTML string
 */
export function renderBellIcon(count = 0) {
  const badge = count > 0
    ? `<span class="bell__badge">${count > 99 ? '99+' : count}</span>`
    : '';
  return `<button class="header__bell" id="headerBell" title="Notifications" type="button">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
    ${badge}
  </button>`;
}
```

- [ ] **Step 2: Update renderHeader to accept bell**

Modify `renderHeader` options to include `showBell` and `bellCount`:

```js
export function renderHeader(options = {}) {
  const {
    appName = 'Daily Rundown',
    subtitle = '',
    dateLine = '',
    showAdmin = true,
    showDebug = false,
    showAddTask = false,
    showThemePicker = false,
    showBell = false,
    bellCount = 0,
    rightContent = ''
  } = options;

  const debugIcon = showDebug ? '<span class="header__debug" title="Debug mode active">🐛</span>' : '';
  const adminLink = showAdmin ? '<a href="admin.html" class="header__admin" title="Admin">⚙️</a>' : '';
  const addTaskBtn = showAddTask ? '<button class="header__add-task" id="headerAddTask" title="Add Task" type="button">📝</button>' : '';
  const themeBtn = showThemePicker ? '<button class="header__theme" id="headerThemeBtn" title="Device Theme" type="button">🎨</button>' : '';
  const bellBtn = showBell ? renderBellIcon(bellCount) : '';

  return `<header class="app-header">
    <div class="header__left">
      <h1 class="header__title">${esc(appName)}</h1>
      ${subtitle ? `<span class="header__subtitle">${esc(subtitle)}</span>` : ''}
      ${dateLine ? `<span class="header__date">${esc(dateLine)}</span>` : ''}
    </div>
    <div class="header__right">
      ${rightContent}
      ${addTaskBtn}
      ${bellBtn}
      ${themeBtn}
      ${debugIcon}
      ${adminLink}
    </div>
  </header>`;
}
```

- [ ] **Step 3: Add bell styles to components.css**

Add to `styles/components.css`:

```css
/* ── Notification Bell ── */
.header__bell {
  position: relative;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}
.header__bell:hover { color: var(--text-primary); }

.bell__badge {
  position: absolute;
  top: -2px;
  right: -4px;
  background: var(--accent-danger, #e53e3e);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Add bell dropdown styles**

```css
/* ── Bell Dropdown ── */
.bell-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  width: min(380px, calc(100vw - 32px));
  max-height: 480px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  z-index: 1000;
  padding: 0;
}

.bell-dropdown__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
}

.bell-dropdown__title {
  font-weight: 600;
  font-size: var(--font-size-base);
}

.bell-dropdown__actions {
  display: flex;
  gap: 8px;
}

.bell-dropdown__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, var(--border));
}

.bell-dropdown__item:last-child {
  border-bottom: none;
}

.bell-dropdown__item--pending {
  background: var(--surface-highlight, rgba(var(--accent-rgb, 108, 99, 255), 0.05));
}

.bell-dropdown__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  width: 36px;
  text-align: center;
}

.bell-dropdown__body {
  flex: 1;
  min-width: 0;
}

.bell-dropdown__item-title {
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.bell-dropdown__item-subtitle {
  color: var(--text-secondary);
  font-size: var(--font-size-xs, 0.75rem);
  margin-top: 2px;
}

.bell-dropdown__item-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.bell-dropdown__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-secondary);
}

.bell-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}
```

- [ ] **Step 5: Add renderBellDropdown function to components.js**

```js
/**
 * Render the notification bell dropdown content for parents.
 * @param {object} options - { pendingRequests, recentActivity, rewards, people }
 * @returns {string} HTML string
 */
export function renderBellDropdown({ pendingRequests = [], recentActivity = [], rewards = {}, people = [] }) {
  const personName = (id) => {
    const p = people.find(p => p.id === id);
    return p ? esc(p.name) : 'Unknown';
  };

  let html = `<div class="bell-dropdown">
    <div class="bell-dropdown__header">
      <span class="bell-dropdown__title">Notifications</span>
      <div class="bell-dropdown__actions">
        <button class="btn btn--sm btn--ghost" id="bellSendMessage" type="button">Send Message</button>
        <button class="btn btn--sm btn--ghost" id="bellBonusDay" type="button">🎉 Bonus Day</button>
      </div>
    </div>`;

  if (pendingRequests.length === 0 && recentActivity.length === 0) {
    html += `<div class="bell-dropdown__empty">No notifications</div>`;
  }

  // Pending requests
  for (const req of pendingRequests) {
    const reward = rewards[req.rewardId] || {};
    const archived = reward.status === 'archived' ? ' (Archived)' : '';
    html += `<div class="bell-dropdown__item bell-dropdown__item--pending" data-msg-id="${esc(req.id)}" data-person-id="${esc(req.personId)}">
      <span class="bell-dropdown__icon">${esc(reward.icon || '🎁')}</span>
      <div class="bell-dropdown__body">
        <div class="bell-dropdown__item-title">${personName(req.personId)} wants ${esc(reward.name || 'a reward')}${archived}</div>
        <div class="bell-dropdown__item-subtitle">${Math.abs(req.amount)} pts &middot; Balance: ${req.balance} pts</div>
        <div class="bell-dropdown__item-actions">
          <button class="btn btn--sm btn--primary bell-approve" data-msg-id="${esc(req.id)}" data-person-id="${esc(req.personId)}" type="button">Approve</button>
          <button class="btn btn--sm btn--ghost bell-deny" data-msg-id="${esc(req.id)}" data-person-id="${esc(req.personId)}" type="button">Deny</button>
        </div>
      </div>
    </div>`;
  }

  // Recent activity (last 20)
  for (const item of recentActivity.slice(0, 20)) {
    const icon = item.type === 'bonus' ? '➕' :
                 item.type === 'deduction' ? '➖' :
                 item.type === 'redemption-approved' ? '✅' :
                 item.type === 'redemption-denied' ? '❌' : '📋';
    html += `<div class="bell-dropdown__item">
      <span class="bell-dropdown__icon">${icon}</span>
      <div class="bell-dropdown__body">
        <div class="bell-dropdown__item-title">${esc(item.title)}</div>
        <div class="bell-dropdown__item-subtitle">${personName(item.personId)} &middot; ${item.amount > 0 ? '+' : ''}${item.amount} pts</div>
      </div>
    </div>`;
  }

  html += `</div>`;
  return html;
}
```

- [ ] **Step 6: Verify** — Open dashboard, confirm bell icon appears in header (it won't show yet since no page passes `showBell: true` — that's the next step). Check no console errors.

- [ ] **Step 7: Commit**

```bash
git add shared/components.js styles/components.css
git commit -m "feat(rewards): add notification bell component and dropdown to header"
```

---

### Task 4: Wire Bell Into All Pages

**Files:**
- Modify: `dashboard.js` (add bell to renderHeader call, add message listeners)
- Modify: `calendar.html` (add bell to renderHeader call)
- Modify: `scoreboard.html` (add bell to renderHeader call)
- Modify: `tracker.html` (add bell to renderHeader call)
- Modify: `admin.html` (add bell to renderHeader call — admin doesn't use renderHeader currently, may need adaptation)

- [ ] **Step 1: Wire bell into dashboard.js**

In `dashboard.js`, update the import to include the new firebase/scoring functions, add message listeners, and pass `showBell: true` to `renderHeader`. The bell count comes from real-time listeners on `messages/` for all people.

Find the `renderHeader` call in dashboard.js and add `showBell: true, bellCount: unseenBellCount`. Add a variable `let unseenBellCount = 0` near the top. Add a listener function that queries unseen `redemption-request` messages across all people and updates the count.

The bell click handler should toggle the dropdown — insert it after headerMount innerHTML is set. Wire up approve/deny buttons within the dropdown to call the approval/denial flow (Task 8 implements the logic; for now, just render the dropdown).

```js
// Near top of dashboard.js, after imports:
import { readRewards, readAllMessages, onAllMessages, readAllBalanceAnchors, writeMessage, markMessageSeen, readMultipliers } from './shared/firebase.js';
import { calculateBalance } from './shared/scoring.js';
import { renderBellIcon, renderBellDropdown } from './shared/components.js';

let unseenBellCount = 0;
let bellMessages = {};
let rewardsData = {};

// After data loads, set up bell listener:
rewardsData = (await readRewards()) || {};

onAllMessages((allMsgs) => {
  bellMessages = allMsgs || {};
  // Count unseen redemption-requests across all people
  let count = 0;
  for (const [pid, msgs] of Object.entries(bellMessages)) {
    if (!msgs) continue;
    for (const msg of Object.values(msgs)) {
      if (msg.type === 'redemption-request' && !msg.seen) count++;
    }
  }
  unseenBellCount = count;
  // Update bell badge without full re-render
  const bell = document.getElementById('headerBell');
  if (bell) {
    const badge = bell.querySelector('.bell__badge');
    if (count > 0) {
      if (badge) { badge.textContent = count > 99 ? '99+' : count; }
      else { bell.insertAdjacentHTML('beforeend', `<span class="bell__badge">${count > 99 ? '99+' : count}</span>`); }
    } else if (badge) {
      badge.remove();
    }
  }
});
```

Add bell click handler after headerMount setup:

```js
document.addEventListener('click', (e) => {
  const bellBtn = e.target.closest('#headerBell');
  if (bellBtn) {
    e.stopPropagation();
    toggleBellDropdown();
    return;
  }
  // Close dropdown on outside click
  const dropdown = document.querySelector('.bell-dropdown');
  if (dropdown && !e.target.closest('.bell-dropdown')) {
    closeBellDropdown();
  }
});

function toggleBellDropdown() {
  const existing = document.querySelector('.bell-overlay');
  if (existing) { closeBellDropdown(); return; }

  const people = peopleArray();
  const pendingRequests = [];
  const recentActivity = [];

  for (const [pid, msgs] of Object.entries(bellMessages)) {
    if (!msgs) continue;
    for (const [msgId, msg] of Object.entries(msgs)) {
      if (msg.type === 'redemption-request' && !msg.seen) {
        pendingRequests.push({ ...msg, id: msgId, personId: pid, balance: '—' });
      } else if (msg.type !== 'redemption-request') {
        recentActivity.push({ ...msg, id: msgId, personId: pid });
      }
    }
  }

  // Sort recent by createdAt desc
  recentActivity.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const headerRight = document.querySelector('.header__right');
  if (!headerRight) return;

  const overlay = document.createElement('div');
  overlay.className = 'bell-overlay';
  overlay.addEventListener('click', closeBellDropdown);
  document.body.appendChild(overlay);

  headerRight.style.position = 'relative';
  headerRight.insertAdjacentHTML('beforeend', renderBellDropdown({
    pendingRequests,
    recentActivity,
    rewards: rewardsData,
    people
  }));
}

function closeBellDropdown() {
  document.querySelector('.bell-overlay')?.remove();
  document.querySelector('.bell-dropdown')?.remove();
}
```

- [ ] **Step 2: Wire bell into calendar.html, scoreboard.html, tracker.html**

Each page needs the same pattern — import the message listener functions, add `showBell: true` to their `renderHeader` call, and add the bell click/dropdown logic. Since the bell logic is identical across pages, extract a shared `initBell(peopleArray, rewardsData)` function in components.js that sets up the listener and dropdown. Pages call it after their initial data load.

Add to `components.js`:

```js
/**
 * Initialize the notification bell on any page.
 * Sets up real-time listener and dropdown toggle.
 * @param {Function} getPeople - returns array of { id, name, color }
 * @param {Function} getRewards - returns rewards object
 * @param {Function} onAllMessagesFn - Firebase onAllMessages listener
 * @param {object} options - { isKidMode, kidPersonId }
 */
export function initBell(getPeople, getRewards, onAllMessagesFn, options = {}) {
  let bellMessages = {};

  onAllMessagesFn((allMsgs) => {
    bellMessages = allMsgs || {};
    let count = 0;
    for (const [pid, msgs] of Object.entries(bellMessages)) {
      if (!msgs) continue;
      for (const msg of Object.values(msgs)) {
        if (msg.type === 'redemption-request' && !msg.seen) count++;
      }
    }
    const bell = document.getElementById('headerBell');
    if (!bell) return;
    const badge = bell.querySelector('.bell__badge');
    if (count > 0) {
      if (badge) { badge.textContent = count > 99 ? '99+' : count; }
      else { bell.insertAdjacentHTML('beforeend', `<span class="bell__badge">${count > 99 ? '99+' : count}</span>`); }
    } else if (badge) {
      badge.remove();
    }
  });

  document.addEventListener('click', (e) => {
    const bellBtn = e.target.closest('#headerBell');
    if (bellBtn) {
      e.stopPropagation();
      const existing = document.querySelector('.bell-overlay');
      if (existing) {
        existing.remove();
        document.querySelector('.bell-dropdown')?.remove();
        return;
      }

      const people = getPeople();
      const pendingRequests = [];
      const recentActivity = [];

      for (const [pid, msgs] of Object.entries(bellMessages)) {
        if (!msgs) continue;
        for (const [msgId, msg] of Object.entries(msgs)) {
          if (msg.type === 'redemption-request' && !msg.seen) {
            pendingRequests.push({ ...msg, id: msgId, personId: pid, balance: '—' });
          } else if (msg.type !== 'redemption-request') {
            recentActivity.push({ ...msg, id: msgId, personId: pid });
          }
        }
      }
      recentActivity.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const headerRight = document.querySelector('.header__right');
      if (!headerRight) return;

      const overlay = document.createElement('div');
      overlay.className = 'bell-overlay';
      overlay.addEventListener('click', () => {
        overlay.remove();
        document.querySelector('.bell-dropdown')?.remove();
      });
      document.body.appendChild(overlay);

      headerRight.style.position = 'relative';
      headerRight.insertAdjacentHTML('beforeend', renderBellDropdown({
        pendingRequests,
        recentActivity,
        rewards: getRewards(),
        people
      }));
      return;
    }

    if (!e.target.closest('.bell-dropdown') && !e.target.closest('#headerBell')) {
      document.querySelector('.bell-overlay')?.remove();
      document.querySelector('.bell-dropdown')?.remove();
    }
  });
}
```

Then in each page, after data loads:

```js
// Add to imports
import { onAllMessages } from './shared/firebase.js';
import { initBell } from './shared/components.js';

// After data loads, call:
initBell(() => peopleArray(), () => rewardsData, onAllMessages);
```

And pass `showBell: true` to their `renderHeader` calls.

- [ ] **Step 3: Verify** — Open dashboard. Bell icon should appear in header. Click it — empty dropdown shows "No notifications". No console errors.

- [ ] **Step 4: Commit**

```bash
git add shared/components.js dashboard.js calendar.html scoreboard.html tracker.html
git commit -m "feat(rewards): wire notification bell into all pages"
```

---

## Phase 3: Admin Rewards Tab

### Task 5: Rewards Tab — List View

**Files:**
- Modify: `admin.html` (add rewards tab to TABS array, add `renderRewardsTab` and `bindRewardsTab` functions)
- Modify: `styles/admin.css` (add reward card styles)

- [ ] **Step 1: Add rewards tab to TABS array in admin.html**

Find the TABS array and add the rewards tab between categories and settings:

```js
const TABS = [
  { id: 'tasks', icon: '✅', label: 'Tasks' },
  { id: 'events', icon: '📅', label: 'Events' },
  { id: 'people', icon: '👥', label: 'People' },
  { id: 'categories', icon: '📂', label: 'Categories' },
  { id: 'rewards', icon: '🎁', label: 'Rewards' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
  { id: 'theme', icon: '🎨', label: 'Theme' },
  { id: 'schedule', icon: '📅', label: 'Schedule' },
  { id: 'data', icon: '💾', label: 'Data' },
  { id: 'debug', icon: '🐛', label: 'Debug' }
];
```

- [ ] **Step 2: Add import for rewards Firebase functions**

Update the import at the top of admin.html's `<script type="module">` to include:

```js
import { readRewards, pushReward, writeReward, archiveReward } from './shared/firebase.js';
```

- [ ] **Step 3: Add rewardsObj state variable and load rewards data**

Near the existing data loading code, add:

```js
let rewardsObj = {};

// In the data loading section:
rewardsObj = (await readRewards()) || {};
```

- [ ] **Step 4: Add renderRewardsTab function**

Add this function alongside the other `render*Tab` functions:

```js
function renderRewardsTab() {
  const rewards = Object.entries(rewardsObj)
    .filter(([, r]) => r.status !== 'archived')
    .sort((a, b) => (a[1].pointCost || 0) - (b[1].pointCost || 0));

  let html = `<div class="admin-section">
    <div class="admin-section__header">
      <h3>Rewards</h3>
      <button class="btn btn--sm btn--primary" id="addRewardBtn" type="button">+ Add Reward</button>
    </div>`;

  if (rewards.length === 0) {
    html += `<div class="empty-state" style="padding: 32px; text-align: center; color: var(--text-secondary);">
      <div style="font-size: 2rem; margin-bottom: 8px;">🎁</div>
      <p>No rewards yet. Add one to get started!</p>
    </div>`;
  } else {
    html += `<div class="reward-list">`;
    for (const [id, reward] of rewards) {
      const typeLabel = reward.rewardType === 'task-skip' ? '⏭️ Task Skip' :
                        reward.rewardType === 'penalty-removal' ? '🛡️ Penalty Removal' : '';
      const streakBadge = reward.streakRequirement
        ? `<span class="reward-card__badge">🔥 ${reward.streakRequirement}-day streak</span>` : '';
      const expiry = reward.expiresAt
        ? `<span class="reward-card__badge">Expires ${new Date(reward.expiresAt).toLocaleDateString()}</span>` : '';
      const personNames = reward.perPerson
        ? reward.perPerson.map(pid => esc(peopleObj[pid]?.name || '?')).join(', ')
        : 'Everyone';

      html += `<div class="reward-card" data-reward-id="${id}">
        <div class="reward-card__icon">${esc(reward.icon || '🎁')}</div>
        <div class="reward-card__body">
          <div class="reward-card__name">${esc(reward.name)}</div>
          <div class="reward-card__meta">
            <span class="reward-card__cost">${reward.pointCost} pts</span>
            ${typeLabel ? `<span class="reward-card__type">${typeLabel}</span>` : ''}
            ${streakBadge}
            ${expiry}
          </div>
          <div class="reward-card__availability">${personNames}</div>
        </div>
        <div class="reward-card__actions">
          <button class="btn btn--ghost btn--sm reward-edit" data-reward-id="${id}" type="button">Edit</button>
          <button class="btn btn--ghost btn--sm reward-archive" data-reward-id="${id}" type="button">Archive</button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  // Show archived rewards toggle
  const archived = Object.entries(rewardsObj).filter(([, r]) => r.status === 'archived');
  if (archived.length > 0) {
    html += `<details class="admin-archived-rewards" style="margin-top: 16px;">
      <summary style="cursor: pointer; color: var(--text-secondary); font-size: var(--font-size-sm);">${archived.length} archived reward${archived.length > 1 ? 's' : ''}</summary>
      <div class="reward-list" style="margin-top: 8px;">`;
    for (const [id, reward] of archived) {
      html += `<div class="reward-card reward-card--archived" data-reward-id="${id}">
        <div class="reward-card__icon" style="opacity: 0.5;">${esc(reward.icon || '🎁')}</div>
        <div class="reward-card__body">
          <div class="reward-card__name" style="text-decoration: line-through;">${esc(reward.name)}</div>
          <div class="reward-card__meta"><span class="reward-card__cost">${reward.pointCost} pts</span></div>
        </div>
      </div>`;
    }
    html += `</div></details>`;
  }

  html += `</div>`;

  // Reward form (hidden until add/edit)
  if (editingRewardId !== null) {
    html += renderRewardForm(editingRewardId === 'new' ? null : editingRewardId);
  }

  return html;
}
```

- [ ] **Step 5: Add reward card styles to admin.css**

```css
/* ── Reward Cards ── */
.reward-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reward-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
}

.reward-card--archived { opacity: 0.6; }

.reward-card__icon { font-size: 1.75rem; flex-shrink: 0; }

.reward-card__body { flex: 1; min-width: 0; }

.reward-card__name {
  font-weight: 600;
  font-size: var(--font-size-base);
}

.reward-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: var(--font-size-sm);
}

.reward-card__cost {
  font-weight: 600;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.reward-card__type {
  color: var(--text-secondary);
}

.reward-card__badge {
  background: var(--surface-alt, var(--surface));
  padding: 1px 6px;
  border-radius: 4px;
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-secondary);
}

.reward-card__availability {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-secondary);
  margin-top: 2px;
}

.reward-card__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
```

- [ ] **Step 6: Wire renderRewardsTab into the main render function**

In the admin render function, add the rewards tab case:

```js
// In the switch/if block that renders tab content:
case 'rewards': html += renderRewardsTab(); break;
// (or add to the if/else chain depending on how the admin render works)
```

- [ ] **Step 7: Verify** — Open admin.html, see the Rewards tab in the tab bar. Click it, see "No rewards yet" empty state.

- [ ] **Step 8: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "feat(rewards): add Rewards tab with list view to admin"
```

---

### Task 6: Rewards Tab — Create/Edit Form with Pricing Helper

**Files:**
- Modify: `admin.html` (add `renderRewardForm`, `bindRewardForm`, pricing helper logic)

- [ ] **Step 1: Add editingRewardId state variable**

```js
let editingRewardId = null; // null = not editing, 'new' = creating, pushId = editing
```

- [ ] **Step 2: Add renderRewardForm function**

```js
const REWARD_EMOJIS = ['🍕', '🎮', '🍦', '⭐', '🎬', '📱', '🛹', '🧁', '🎯', '🏆', '🎪', '🏊', '🎨', '🎵', '🛍️', '🧸'];

const PRICING_AVERAGES = [
  { label: 'A (95%)', value: 95 },
  { label: 'B+ (88%)', value: 88 },
  { label: 'B (85%)', value: 85 },
  { label: 'C+ (78%)', value: 78 },
  { label: 'C (75%)', value: 75 }
];

function renderRewardForm(rewardId) {
  const reward = rewardId ? rewardsObj[rewardId] : {};
  const isEdit = !!rewardId;
  const title = isEdit ? 'Edit Reward' : 'New Reward';

  return `<div class="admin-form-overlay">
    <div class="admin-form" id="rewardForm">
      <h3>${title}</h3>

      <label class="form-label">Name</label>
      <input type="text" id="rf_name" class="form-input" value="${esc(reward.name || '')}" placeholder="Movie Night">

      <label class="form-label">Emoji</label>
      <div class="emoji-picker" id="rf_emojiPicker">
        ${REWARD_EMOJIS.map(e => `<button type="button" class="emoji-btn${reward.icon === e ? ' emoji-btn--selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
        <input type="text" id="rf_customEmoji" class="form-input form-input--sm" placeholder="Custom" maxlength="2" style="width: 60px;" value="${reward.icon && !REWARD_EMOJIS.includes(reward.icon) ? esc(reward.icon) : ''}">
      </div>

      <label class="form-label">Type</label>
      <div class="segmented-control" id="rf_type">
        <button type="button" class="segmented-btn${(reward.rewardType || 'custom') === 'custom' ? ' segmented-btn--active' : ''}" data-value="custom">Custom</button>
        <button type="button" class="segmented-btn${reward.rewardType === 'task-skip' ? ' segmented-btn--active' : ''}" data-value="task-skip">Task Skip</button>
        <button type="button" class="segmented-btn${reward.rewardType === 'penalty-removal' ? ' segmented-btn--active' : ''}" data-value="penalty-removal">Penalty Removal</button>
      </div>
      <div id="rf_typeHint" class="form-hint" style="margin-top: 4px;"></div>

      <label class="form-label">Point Cost</label>
      <input type="number" id="rf_pointCost" class="form-input" value="${reward.pointCost || ''}" min="1" placeholder="Enter or use helper below">

      <div class="pricing-helper" style="background: var(--surface-alt, var(--surface)); padding: 12px; border-radius: var(--radius, 8px); margin-top: 8px;">
        <label class="form-label" style="margin-bottom: 4px;">How long should this take to earn?</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="range" id="rf_daysSlider" min="1" max="30" value="7" style="flex: 1;">
          <input type="number" id="rf_daysInput" class="form-input form-input--sm" value="7" min="1" style="width: 60px;">
          <span>days</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
          <label class="form-label" style="margin: 0;">Assumed average:</label>
          <select id="rf_avgSelect" class="form-input form-input--sm" style="width: auto;">
            ${PRICING_AVERAGES.map(a => `<option value="${a.value}"${a.value === 88 ? ' selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
        <div id="rf_suggestion" class="form-hint" style="margin-top: 8px; cursor: pointer; color: var(--accent);">
          7 days at B+ average &rarr; <strong>615 pts</strong> (click to apply)
        </div>
      </div>

      <label class="form-label" style="margin-top: 12px;">Available to</label>
      <div class="chip-group" id="rf_people">
        ${peopleArray().map(p => {
          const selected = reward.perPerson && reward.perPerson.includes(p.id);
          return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${esc(p.name)}</button>`;
        }).join('')}
        <span class="form-hint" style="margin-left: 4px;">None = everyone</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
        <div>
          <label class="form-label">Max redemptions</label>
          <input type="number" id="rf_maxRedemptions" class="form-input" value="${reward.maxRedemptions || ''}" min="1" placeholder="Unlimited">
        </div>
        <div>
          <label class="form-label">Streak requirement</label>
          <input type="number" id="rf_streakReq" class="form-input" value="${reward.streakRequirement || ''}" min="1" placeholder="None">
        </div>
      </div>

      <label class="form-label" style="margin-top: 12px;">Expires on</label>
      <input type="date" id="rf_expiresAt" class="form-input" value="${reward.expiresAt ? new Date(reward.expiresAt).toISOString().split('T')[0] : ''}">

      <div class="admin-form__actions" style="margin-top: 16px;">
        <button class="btn btn--primary" id="rf_save" type="button">${isEdit ? 'Save' : 'Create'}</button>
        <button class="btn btn--ghost" id="rf_cancel" type="button">Cancel</button>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Add bindRewardForm function**

```js
function bindRewardForm() {
  const form = document.getElementById('rewardForm');
  if (!form) return;

  // Emoji picker
  for (const btn of form.querySelectorAll('.emoji-btn')) {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('emoji-btn--selected'));
      btn.classList.add('emoji-btn--selected');
      form.querySelector('#rf_customEmoji').value = '';
    });
  }

  // Type segmented control
  for (const btn of form.querySelectorAll('#rf_type .segmented-btn')) {
    btn.addEventListener('click', () => {
      form.querySelectorAll('#rf_type .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      const hint = form.querySelector('#rf_typeHint');
      const val = btn.dataset.value;
      hint.textContent = val === 'task-skip' ? 'Person picks a task to skip for the day'
        : val === 'penalty-removal' ? 'Removes the late penalty from a past task' : '';
    });
  }

  // Pricing helper — slider ↔ input sync
  const slider = form.querySelector('#rf_daysSlider');
  const daysInput = form.querySelector('#rf_daysInput');
  const avgSelect = form.querySelector('#rf_avgSelect');
  const suggestion = form.querySelector('#rf_suggestion');
  const pointCost = form.querySelector('#rf_pointCost');

  function updateSuggestion() {
    const days = parseInt(daysInput.value) || 7;
    const avg = parseInt(avgSelect.value) || 88;
    const cost = Math.round((days * avg) / 5) * 5;
    const avgLabel = PRICING_AVERAGES.find(a => a.value === avg)?.label || avg + '%';
    suggestion.innerHTML = `${days} day${days > 1 ? 's' : ''} at ${avgLabel} average &rarr; <strong>${cost} pts</strong> (click to apply)`;
    suggestion.dataset.cost = cost;
  }

  slider.addEventListener('input', () => { daysInput.value = slider.value; updateSuggestion(); });
  daysInput.addEventListener('input', () => {
    const v = parseInt(daysInput.value);
    if (v && v <= 30) slider.value = v;
    updateSuggestion();
  });
  avgSelect.addEventListener('change', updateSuggestion);
  suggestion.addEventListener('click', () => {
    pointCost.value = suggestion.dataset.cost;
  });
  updateSuggestion();

  // Person chips
  for (const chip of form.querySelectorAll('#rf_people .chip--selectable')) {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  }

  // Cancel
  form.querySelector('#rf_cancel').addEventListener('click', () => {
    editingRewardId = null;
    render();
  });

  // Save
  form.querySelector('#rf_save').addEventListener('click', async () => {
    const name = form.querySelector('#rf_name').value.trim();
    if (!name) return;

    const selectedEmoji = form.querySelector('.emoji-btn--selected')?.dataset?.emoji
      || form.querySelector('#rf_customEmoji').value.trim() || '🎁';
    const rewardType = form.querySelector('#rf_type .segmented-btn--active')?.dataset?.value || 'custom';
    const cost = parseInt(form.querySelector('#rf_pointCost').value) || 0;
    if (cost <= 0) return;

    const selectedPeople = [...form.querySelectorAll('#rf_people .chip--active')]
      .map(c => c.dataset.personId);
    const maxRedemptions = parseInt(form.querySelector('#rf_maxRedemptions').value) || null;
    const streakReq = parseInt(form.querySelector('#rf_streakReq').value) || null;
    const expiresDate = form.querySelector('#rf_expiresAt').value;
    const expiresAt = expiresDate ? new Date(expiresDate + 'T23:59:59').getTime() : null;

    const data = {
      name,
      icon: selectedEmoji,
      pointCost: cost,
      rewardType,
      perPerson: selectedPeople.length > 0 ? selectedPeople : null,
      maxRedemptions,
      streakRequirement: streakReq,
      expiresAt,
      status: 'active'
    };

    if (editingRewardId && editingRewardId !== 'new') {
      await writeReward(editingRewardId, data);
      rewardsObj[editingRewardId] = data;
    } else {
      const ref = await pushReward(data);
      rewardsObj[ref.key] = data;
    }

    editingRewardId = null;
    render();
  });
}
```

- [ ] **Step 4: Wire form into render and bind cycles**

In the rewards tab event binding section:

```js
// ── Rewards tab events ──
if (activeTab === 'rewards') {
  document.getElementById('addRewardBtn')?.addEventListener('click', () => {
    editingRewardId = 'new';
    render();
  });

  for (const btn of main.querySelectorAll('.reward-edit')) {
    btn.addEventListener('click', () => {
      editingRewardId = btn.dataset.rewardId;
      render();
    });
  }

  for (const btn of main.querySelectorAll('.reward-archive')) {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.rewardId;
      await archiveReward(id);
      rewardsObj[id].status = 'archived';
      render();
    });
  }

  if (editingRewardId !== null) {
    bindRewardForm();
  }
}
```

- [ ] **Step 5: Add emoji picker styles to admin.css**

```css
/* ── Emoji Picker ── */
.emoji-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.emoji-btn {
  font-size: 1.5rem;
  padding: 4px 6px;
  border: 2px solid transparent;
  border-radius: var(--radius, 8px);
  background: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.emoji-btn:hover { border-color: var(--border); }
.emoji-btn--selected { border-color: var(--accent); background: var(--surface-highlight, rgba(var(--accent-rgb, 108, 99, 255), 0.1)); }

/* ── Segmented Control ── */
.segmented-control {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  overflow: hidden;
}

.segmented-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: var(--surface);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: background 0.15s, color 0.15s;
}

.segmented-btn + .segmented-btn { border-left: 1px solid var(--border); }
.segmented-btn--active { background: var(--accent); color: #fff; }

/* ── Pricing Helper ── */
.pricing-helper input[type="range"] {
  accent-color: var(--accent);
}
```

- [ ] **Step 6: Verify** — Open admin, go to Rewards tab, click "+ Add Reward". Fill out the form — name, emoji, type, adjust the pricing slider, click suggestion to apply. Create the reward. Verify it appears in the list. Edit it. Archive it.

- [ ] **Step 7: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "feat(rewards): add reward create/edit form with pricing helper in admin"
```

---

## Phase 4: Parent Messages

### Task 7: Send Message Sheet (Bonus / Deduction)

**Files:**
- Modify: `shared/components.js` (add `renderSendMessageSheet` function)
- Modify: `dashboard.js` (wire "Send Message" button in bell dropdown to open the sheet)
- Modify: `styles/components.css` (add message sheet styles)

- [ ] **Step 1: Add message templates constant and renderSendMessageSheet to components.js**

```js
const POSITIVE_TEMPLATES = [
  'Awesome Job!', 'Super Star', 'Great Teamwork', 'Above & Beyond',
  'So Proud of You', 'Way to Go!', 'Amazing Effort', 'Kindness Award',
  'Helping Hand', 'You Crushed It!', 'Keep It Up!', 'Big Improvement'
];

const NEGATIVE_TEMPLATES = [
  'Room Check', 'Reminder Needed', "Let's Do Better", 'Responsibility Check',
  'Try Again Tomorrow', 'Needs Attention', 'Not Your Best', 'We Talked About This'
];

/**
 * Render the send message bottom sheet.
 * @param {Array} people - array of { id, name, color }
 * @param {string|null} preselectedPersonId - pre-select a person if provided
 * @returns {string} HTML string
 */
export function renderSendMessageSheet(people, preselectedPersonId = null) {
  return renderBottomSheet(`
    <h3 style="margin-bottom: 12px;">Send Message</h3>

    <label class="form-label">To</label>
    <div class="chip-group" id="msg_people">
      ${people.map(p => {
        const selected = p.id === preselectedPersonId;
        return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${esc(p.name)}</button>`;
      }).join('')}
    </div>

    <label class="form-label" style="margin-top: 12px;">Type</label>
    <div style="display: flex; gap: 8px;">
      <button class="btn btn--bonus msg-type-btn msg-type-btn--active" data-type="bonus" type="button" style="flex:1;">+ Bonus</button>
      <button class="btn btn--deduction msg-type-btn" data-type="deduction" type="button" style="flex:1;">− Deduction</button>
    </div>

    <label class="form-label" style="margin-top: 12px;">Title</label>
    <div class="template-grid" id="msg_templates">
      ${POSITIVE_TEMPLATES.map(t => `<button class="template-chip" data-title="${esc(t)}" type="button">${esc(t)}</button>`).join('')}
      <button class="template-chip template-chip--custom" data-title="custom" type="button">Custom...</button>
    </div>
    <input type="text" id="msg_customTitle" class="form-input" style="display:none; margin-top: 8px;" placeholder="Enter custom title">

    <label class="form-label" style="margin-top: 12px;">Personal note (optional)</label>
    <textarea id="msg_body" class="form-input" rows="2" placeholder="Great job helping your sister!"></textarea>

    <label class="form-label" style="margin-top: 12px;">Points</label>
    <input type="number" id="msg_points" class="form-input" value="25" min="1">

    <div style="margin-top: 16px; display: flex; gap: 8px;">
      <button class="btn btn--primary" id="msg_send" type="button" style="flex:1;">Send</button>
      <button class="btn btn--ghost" id="msg_cancel" type="button">Cancel</button>
    </div>
  `);
}
```

- [ ] **Step 2: Add message sheet styles to components.css**

```css
/* ── Send Message Sheet ── */
.btn--bonus {
  background: var(--accent-success, #38a169);
  color: #fff;
  border: 2px solid transparent;
}
.btn--deduction {
  background: var(--surface);
  color: var(--accent-danger, #e53e3e);
  border: 2px solid var(--accent-danger, #e53e3e);
}
.msg-type-btn--active.btn--bonus { box-shadow: 0 0 0 2px var(--accent-success, #38a169); }
.msg-type-btn--active.btn--deduction {
  background: var(--accent-danger, #e53e3e);
  color: #fff;
  box-shadow: 0 0 0 2px var(--accent-danger, #e53e3e);
}

.template-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.template-chip {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all 0.15s;
}
.template-chip:hover { border-color: var(--accent); }
.template-chip--selected {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.template-chip--custom { font-style: italic; }
```

- [ ] **Step 3: Wire the "Send Message" button in the bell dropdown**

In `initBell` (or in each page's bell click handler), after the dropdown is rendered, bind the "Send Message" button:

```js
// After renderBellDropdown is inserted:
document.getElementById('bellSendMessage')?.addEventListener('click', () => {
  closeBellDropdown(); // close the dropdown
  // Mount the send message sheet
  const mount = document.getElementById('taskSheetMount') || document.getElementById('drilldownMount');
  if (!mount) return;
  mount.innerHTML = renderSendMessageSheet(getPeople());
  bindSendMessageSheet(mount);
});
```

Add `bindSendMessageSheet` to components.js:

```js
/**
 * Bind event listeners for the send message sheet.
 * @param {Element} mount - the mount element containing the sheet
 */
export function bindSendMessageSheet(mount, writeMessageFn) {
  const sheet = mount.querySelector('.bottom-sheet');
  if (!sheet) return;

  let msgType = 'bonus';
  let selectedTitle = '';

  // Person chips
  for (const chip of sheet.querySelectorAll('#msg_people .chip--selectable')) {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  }

  // Type toggle
  for (const btn of sheet.querySelectorAll('.msg-type-btn')) {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('.msg-type-btn').forEach(b => b.classList.remove('msg-type-btn--active'));
      btn.classList.add('msg-type-btn--active');
      msgType = btn.dataset.type;

      // Swap templates
      const grid = sheet.querySelector('#msg_templates');
      const templates = msgType === 'bonus' ? POSITIVE_TEMPLATES : NEGATIVE_TEMPLATES;
      grid.innerHTML = templates.map(t =>
        `<button class="template-chip" data-title="${esc(t)}" type="button">${esc(t)}</button>`
      ).join('') + `<button class="template-chip template-chip--custom" data-title="custom" type="button">Custom...</button>`;
      bindTemplateChips(sheet);

      // Update defaults
      sheet.querySelector('#msg_points').value = msgType === 'bonus' ? 25 : 15;
      selectedTitle = '';
    });
  }

  function bindTemplateChips(container) {
    for (const chip of container.querySelectorAll('.template-chip')) {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.template-chip').forEach(c => c.classList.remove('template-chip--selected'));
        chip.classList.add('template-chip--selected');
        const customInput = container.querySelector('#msg_customTitle');
        if (chip.dataset.title === 'custom') {
          customInput.style.display = '';
          customInput.focus();
          selectedTitle = '';
        } else {
          customInput.style.display = 'none';
          selectedTitle = chip.dataset.title;
        }
      });
    }
  }
  bindTemplateChips(sheet);

  // Cancel
  sheet.querySelector('#msg_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  mount.querySelector('.bottom-sheet__backdrop')?.addEventListener('click', () => { mount.innerHTML = ''; });

  // Send
  sheet.querySelector('#msg_send')?.addEventListener('click', async () => {
    const personIds = [...sheet.querySelectorAll('#msg_people .chip--active')].map(c => c.dataset.personId);
    if (personIds.length === 0) return;

    const title = selectedTitle || sheet.querySelector('#msg_customTitle').value.trim();
    if (!title) return;

    const points = parseInt(sheet.querySelector('#msg_points').value) || 0;
    if (points <= 0) return;

    const body = sheet.querySelector('#msg_body').value.trim() || null;
    const amount = msgType === 'deduction' ? -points : points;

    for (const pid of personIds) {
      await writeMessageFn(pid, {
        type: msgType,
        title,
        body,
        amount,
        rewardId: null,
        entryKey: null,
        seen: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: 'parent'
      });
    }

    mount.innerHTML = '';
    // Show toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = `${msgType === 'bonus' ? 'Bonus' : 'Deduction'} sent!`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  });
}
```

- [ ] **Step 4: Verify** — Open dashboard. Click bell → "Send Message". Select a person, pick "Bonus", choose a template, enter points, send. Check Firebase console to verify the message was written to `rundown/messages/{personId}/`.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js styles/components.css dashboard.js
git commit -m "feat(rewards): add parent send message sheet (bonus/deduction) with templates"
```

---

### Task 8: Approval / Denial Flow in Bell

**Files:**
- Modify: `shared/components.js` (add approve/deny handlers to initBell)
- Modify: `shared/firebase.js` (none — already has writeMessage, markMessageSeen)

- [ ] **Step 1: Wire approve/deny buttons in bell dropdown**

In `initBell`, after the dropdown HTML is inserted, bind the approve/deny buttons:

```js
// After renderBellDropdown is inserted into the DOM:
for (const btn of document.querySelectorAll('.bell-approve')) {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const personId = btn.dataset.personId;
    const msgId = btn.dataset.msgId;
    const msg = bellMessages[personId]?.[msgId];
    if (!msg) return;

    // Mark request as seen
    await markMessageSeenFn(personId, msgId);

    // Write approval message
    const reward = getRewards()[msg.rewardId] || {};
    await writeMessageFn(personId, {
      type: 'redemption-approved',
      title: `${reward.name || 'Reward'} approved!`,
      body: null,
      amount: 0,
      rewardId: msg.rewardId,
      entryKey: null,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'parent'
    });

    // If functional reward, add token to bank
    if (reward.rewardType === 'task-skip' || reward.rewardType === 'penalty-removal') {
      await writeBankTokenFn(personId, {
        rewardType: reward.rewardType,
        acquiredAt: Date.now(),
        used: false,
        usedAt: null,
        targetEntryKey: null
      });
    }

    // Close and re-render dropdown
    closeBellDropdown();
  });
}

for (const btn of document.querySelectorAll('.bell-deny')) {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const personId = btn.dataset.personId;
    const msgId = btn.dataset.msgId;
    const msg = bellMessages[personId]?.[msgId];
    if (!msg) return;

    // Mark request as seen
    await markMessageSeenFn(personId, msgId);

    // Write denial message
    const reward = getRewards()[msg.rewardId] || {};
    await writeMessageFn(personId, {
      type: 'redemption-denied',
      title: `${reward.name || 'Reward'} denied`,
      body: null,
      amount: 0,
      rewardId: msg.rewardId,
      entryKey: null,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'parent'
    });

    // Refund points
    await writeMessageFn(personId, {
      type: 'bonus',
      title: `Refund: ${reward.name || 'Reward'}`,
      body: null,
      amount: Math.abs(msg.amount),
      rewardId: null,
      entryKey: null,
      seen: true, // system refund, no need for kid to acknowledge
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'system'
    });

    closeBellDropdown();
  });
}
```

Note: `initBell` needs to accept `writeMessageFn`, `markMessageSeenFn`, and `writeBankTokenFn` as parameters. Update its signature:

```js
export function initBell(getPeople, getRewards, onAllMessagesFn, { writeMessageFn, markMessageSeenFn, writeBankTokenFn } = {}) {
```

- [ ] **Step 2: Update all initBell call sites** to pass the new functions.

In dashboard.js:
```js
initBell(
  () => peopleArray(),
  () => rewardsData,
  onAllMessages,
  { writeMessageFn: writeMessage, markMessageSeenFn: markMessageSeen, writeBankTokenFn: writeBankToken }
);
```

Same for calendar.html, scoreboard.html, tracker.html (import the needed functions).

- [ ] **Step 3: Verify** — Create a test message of type `redemption-request` manually in Firebase console (or by completing a redemption from kid mode later). Open dashboard, click bell, see the pending request. Click Approve — verify approval message appears in Firebase. Click Deny on another — verify denial + refund messages.

- [ ] **Step 4: Commit**

```bash
git add shared/components.js dashboard.js calendar.html scoreboard.html tracker.html
git commit -m "feat(rewards): add approve/deny flow for redemption requests in bell"
```

---

## Phase 5: Kid Mode — Balance, Messages, Store

### Task 9: Kid Mode — Balance Header & Message Overlays

**Files:**
- Modify: `kid.html` (add balance display, message overlay logic, real-time listeners)
- Modify: `styles/kid.css` (add balance header and message overlay styles)

- [ ] **Step 1: Add imports for rewards data**

At the top of kid.html's script, add to the existing import:

```js
import { readRewards, readMessages, readBank, readWishlist, readAchievements, writeMessage, markMessageSeen, markBankTokenUsed, writeWishlistItem, removeWishlistItem, markAchievementSeen, onMessages, onBank, readAllSnapshots, readAllBalanceAnchors, readMultipliers } from './shared/firebase.js';
import { calculateBalance, ACHIEVEMENTS, checkNewAchievements, findHighestDamagePenalty } from './shared/scoring.js';
```

- [ ] **Step 2: Load rewards data after existing data loads**

After the existing data loading in kid mode (tasks, categories, etc.):

```js
const [rewardsObj, kidMessages, kidBank, kidWishlist, kidAchievements, allSnapshots, allAnchors, allMultipliers] = await Promise.all([
  readRewards(),
  readMessages(kid.id),
  readBank(kid.id),
  readWishlist(kid.id),
  readAchievements(kid.id),
  readAllSnapshots(),
  readAllBalanceAnchors(),
  readMultipliers()
]);

let rewards = rewardsObj || {};
let messages = kidMessages || {};
let bank = kidBank || {};
let wishlist = kidWishlist || {};
let achievements = kidAchievements || {};
const anchor = allAnchors?.[kid.id] || null;
const multipliers = allMultipliers || {};

// Calculate balance
const { balance, totalEarned } = calculateBalance(kid.id, allSnapshots, messages, anchor, multipliers);
```

- [ ] **Step 3: Add balance header rendering**

In the kid mode render function, add the balance header above the task list:

```js
function renderBalanceHeader(balance, todayEarning) {
  return `<div class="kid-balance">
    <div class="kid-balance__main">
      <span class="kid-balance__icon">💰</span>
      <span class="kid-balance__amount ${balance < 0 ? 'kid-balance__amount--negative' : ''}">${balance.toLocaleString()}</span>
      <span class="kid-balance__label">pts</span>
    </div>
    <div class="kid-balance__today">Today so far: +${todayEarning} pts</div>
    <div class="kid-balance__actions">
      <button class="btn btn--sm btn--primary" id="kidStoreBtn" type="button">🎁 Store</button>
      <button class="btn btn--sm btn--ghost" id="kidHistoryBtn" type="button">History</button>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Add message overlay rendering**

```js
function renderMessageOverlay(msg) {
  const isPositive = msg.type === 'bonus' || msg.type === 'redemption-approved' || msg.type === 'task-skip-used' || msg.type === 'penalty-removed';
  const overlayClass = isPositive ? 'kid-msg-overlay--positive' : 'kid-msg-overlay--negative';
  const amountDisplay = msg.amount > 0 ? `+${msg.amount}` : msg.amount;

  return `<div class="kid-msg-overlay ${overlayClass}">
    <div class="kid-msg-overlay__card">
      <div class="kid-msg-overlay__icon">${isPositive ? '⭐' : '📋'}</div>
      <h3 class="kid-msg-overlay__title">${esc(msg.title)}</h3>
      ${msg.body ? `<p class="kid-msg-overlay__body">${esc(msg.body)}</p>` : ''}
      <div class="kid-msg-overlay__amount ${isPositive ? 'kid-msg-overlay__amount--positive' : 'kid-msg-overlay__amount--negative'}">${amountDisplay} pts</div>
      <button class="btn btn--primary kid-msg-overlay__dismiss" type="button">Got it!</button>
    </div>
  </div>`;
}
```

- [ ] **Step 5: Show unseen messages on load and in real-time**

```js
// Check for unseen messages on load
function showUnseenMessages() {
  const unseen = Object.entries(messages)
    .filter(([, m]) => !m.seen && ['bonus', 'deduction', 'redemption-approved', 'redemption-denied', 'task-skip-used', 'penalty-removed'].includes(m.type))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (unseen.length === 0) return;

  const [msgId, msg] = unseen[0]; // Show newest first, one at a time
  const mount = document.getElementById('celebrationMount');
  mount.innerHTML = renderMessageOverlay(msg);

  mount.querySelector('.kid-msg-overlay__dismiss')?.addEventListener('click', async () => {
    await markMessageSeen(kid.id, msgId);
    messages[msgId].seen = true;
    mount.innerHTML = '';
    showUnseenMessages(); // Show next if any
  });
}

showUnseenMessages();

// Real-time listener for new messages
onMessages(kid.id, (newMsgs) => {
  messages = newMsgs || {};
  // Recalculate balance
  const { balance: newBal } = calculateBalance(kid.id, allSnapshots, messages, anchor, multipliers);
  const balEl = document.querySelector('.kid-balance__amount');
  if (balEl) {
    balEl.textContent = newBal.toLocaleString();
    balEl.classList.toggle('kid-balance__amount--negative', newBal < 0);
  }
  showUnseenMessages();
});
```

- [ ] **Step 6: Add kid balance and message overlay styles to kid.css**

```css
/* ── Kid Balance Header ── */
.kid-balance {
  text-align: center;
  padding: 16px;
  margin-bottom: 16px;
}

.kid-balance__main {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}

.kid-balance__icon { font-size: 2rem; }

.kid-balance__amount {
  font-size: 2.5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.kid-balance__amount--negative { color: var(--accent-danger, #e53e3e); }

.kid-balance__label {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

.kid-balance__today {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-top: 4px;
}

.kid-balance__actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

/* ── Message Overlay ── */
.kid-msg-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  animation: fadeIn 0.2s ease;
}

.kid-msg-overlay__card {
  background: var(--surface);
  border-radius: var(--radius-lg, 16px);
  padding: 32px 24px;
  text-align: center;
  max-width: 340px;
  width: calc(100vw - 48px);
  animation: scaleIn 0.25s ease;
}

.kid-msg-overlay--positive .kid-msg-overlay__card {
  border: 2px solid var(--accent-success, #38a169);
}

.kid-msg-overlay--negative .kid-msg-overlay__card {
  border: 2px solid var(--text-secondary);
}

.kid-msg-overlay__icon { font-size: 3rem; margin-bottom: 8px; }

.kid-msg-overlay__title { font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; }

.kid-msg-overlay__body {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  margin-bottom: 12px;
}

.kid-msg-overlay__amount {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-bottom: 16px;
}

.kid-msg-overlay__amount--positive { color: var(--accent-success, #38a169); }
.kid-msg-overlay__amount--negative { color: var(--accent-danger, #e53e3e); }

@keyframes scaleIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 7: Verify** — Open kid.html?kid=Name. Balance header should show (0 pts initially). Send a bonus message from another tab's bell → message overlay should pop up in kid mode in real-time. Dismiss it.

- [ ] **Step 8: Commit**

```bash
git add kid.html styles/kid.css
git commit -m "feat(rewards): add balance header and message overlays to kid mode"
```

---

### Task 10: Kid Mode — Rewards Store Bottom Sheet

**Files:**
- Modify: `kid.html` (add store sheet rendering, redemption request logic)
- Modify: `shared/components.js` (add `renderRewardStoreSheet` function)
- Modify: `styles/kid.css` (add store card styles)

- [ ] **Step 1: Add renderRewardStoreSheet to components.js**

```js
/**
 * Render the rewards store bottom sheet content for kid mode.
 * @param {object} options - { rewards, balance, streak, wishlist, allMessages, personId }
 * @returns {string} HTML string
 */
export function renderRewardStoreSheet({ rewards, balance, streak = 0, wishlist = {}, allMessages = {}, personId }) {
  // Count redemptions per reward for maxRedemptions check
  const redemptionCounts = {};
  for (const [pid, msgs] of Object.entries(allMessages)) {
    if (!msgs) continue;
    for (const msg of Object.values(msgs)) {
      if (msg.type === 'redemption-approved' && msg.rewardId) {
        redemptionCounts[msg.rewardId] = (redemptionCounts[msg.rewardId] || 0) + 1;
      }
    }
  }

  // Filter and sort rewards
  const available = Object.entries(rewards)
    .filter(([, r]) => {
      if (r.status !== 'active') return false;
      if (r.expiresAt && Date.now() > r.expiresAt) return false;
      if (r.perPerson && !r.perPerson.includes(personId)) return false;
      if (r.maxRedemptions && (redemptionCounts[r.id] || 0) >= r.maxRedemptions) return false;
      return true;
    })
    .map(([id, r]) => ({ id, ...r }));

  // Sort: affordable + streak-met first, then by price
  available.sort((a, b) => {
    const aAffordable = balance >= a.pointCost && streak >= (a.streakRequirement || 0);
    const bAffordable = balance >= b.pointCost && streak >= (b.streakRequirement || 0);
    if (aAffordable && !bAffordable) return -1;
    if (!aAffordable && bAffordable) return 1;
    return a.pointCost - b.pointCost;
  });

  // Collect pending requests for this person
  const pendingRequests = [];
  const personMsgs = allMessages?.[personId] || {};
  for (const [msgId, msg] of Object.entries(personMsgs)) {
    if (msg.type === 'redemption-request' && !msg.seen) {
      const reward = rewards[msg.rewardId] || {};
      pendingRequests.push({ msgId, reward, amount: Math.abs(msg.amount) });
    }
  }

  let html = `<div class="store-header">
    <span class="store-balance">💰 ${balance.toLocaleString()} pts</span>
  </div>`;

  // Show pending requests with cancel option
  if (pendingRequests.length > 0) {
    html += `<div class="store-pending">
      <h4 style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 8px;">Pending Requests</h4>`;
    for (const req of pendingRequests) {
      html += `<div class="store-card store-card--pending" style="border-color: var(--accent-warning, #ecc94b); opacity: 0.8;">
        <div class="store-card__icon">${esc(req.reward.icon || '🎁')}</div>
        <div class="store-card__body">
          <div class="store-card__name">${esc(req.reward.name || 'Reward')}</div>
          <div class="store-card__cost">${req.amount} pts — waiting for approval</div>
        </div>
        <div class="store-card__actions">
          <button class="btn btn--sm btn--ghost store-cancel-btn" data-msg-id="${esc(req.msgId)}" data-reward-name="${esc(req.reward.name || 'Reward')}" data-amount="${req.amount}" type="button">Cancel</button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  if (available.length === 0 && pendingRequests.length === 0) {
    html += `<div style="text-align: center; padding: 32px; color: var(--text-secondary);">
      <div style="font-size: 2rem; margin-bottom: 8px;">🏪</div>
      <p>No rewards available yet!</p>
    </div>`;
  }

  for (const reward of available) {
    const canAfford = balance >= reward.pointCost;
    const meetsStreak = streak >= (reward.streakRequirement || 0);
    const canRequest = canAfford && meetsStreak;
    const isWishlisted = !!wishlist[reward.id];
    const progress = Math.min(100, Math.round((balance / reward.pointCost) * 100));
    const daysNeeded = canAfford ? 0 : Math.ceil((reward.pointCost - balance) / 85); // ~B+ avg
    const almostThere = !canAfford && daysNeeded <= 2;

    // Stock indicator
    let stockLabel = '';
    if (reward.maxRedemptions) {
      const used = redemptionCounts[reward.id] || 0;
      const left = reward.maxRedemptions - used;
      stockLabel = `<span class="store-card__badge">${left} left</span>`;
    }

    // Expiry indicator
    let expiryLabel = '';
    if (reward.expiresAt) {
      const daysLeft = Math.ceil((reward.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        expiryLabel = `<span class="store-card__badge store-card__badge--warning">Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</span>`;
      }
    }

    html += `<div class="store-card ${almostThere ? 'store-card--almost' : ''} ${canRequest ? 'store-card--available' : ''}" data-reward-id="${reward.id}">
      <div class="store-card__icon">${esc(reward.icon)}</div>
      <div class="store-card__body">
        <div class="store-card__name">${esc(reward.name)}</div>
        <div class="store-card__cost">${reward.pointCost.toLocaleString()} pts</div>
        <div class="store-card__badges">
          ${reward.streakRequirement ? `<span class="store-card__badge">🔥 ${reward.streakRequirement}-day streak${!meetsStreak ? ` (need ${reward.streakRequirement - streak} more)` : ''}</span>` : ''}
          ${stockLabel}
          ${expiryLabel}
        </div>
        <div class="store-card__progress">
          <div class="store-card__progress-bar" style="width: ${progress}%"></div>
        </div>
        ${almostThere ? `<div class="store-card__nudge">So close! ${daysNeeded} more day${daysNeeded > 1 ? 's' : ''}!</div>` : ''}
        ${!canAfford && !almostThere ? `<div class="store-card__need">Need ${(reward.pointCost - balance).toLocaleString()} more pts</div>` : ''}
      </div>
      <div class="store-card__actions">
        <button class="wishlist-btn ${isWishlisted ? 'wishlist-btn--active' : ''}" data-reward-id="${reward.id}" type="button" title="Wishlist">☆</button>
        ${canRequest ? `<button class="btn btn--sm btn--primary store-get-btn" data-reward-id="${reward.id}" type="button">Get it!</button>` : ''}
      </div>
    </div>`;
  }

  return renderBottomSheet(html);
}
```

- [ ] **Step 2: Add store card styles to kid.css**

```css
/* ── Reward Store ── */
.store-header {
  text-align: center;
  padding: 8px 0 16px;
  font-size: 1.25rem;
  font-weight: 700;
}

.store-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  margin-bottom: 8px;
  transition: all 0.2s;
}

.store-card--available { border-color: var(--accent); }

.store-card--almost {
  border-color: var(--accent-warning, #ecc94b);
  box-shadow: 0 0 8px rgba(236, 201, 75, 0.3);
}

.store-card__icon { font-size: 2rem; flex-shrink: 0; }

.store-card__body { flex: 1; min-width: 0; }

.store-card__name { font-weight: 600; }

.store-card__cost {
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.store-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.store-card__badge {
  font-size: var(--font-size-xs, 0.75rem);
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-alt, var(--surface));
  color: var(--text-secondary);
}

.store-card__badge--warning { color: var(--accent-warning, #ecc94b); }

.store-card__progress {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.store-card__progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s;
}

.store-card__nudge {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--accent-warning, #ecc94b);
  font-weight: 600;
  margin-top: 4px;
}

.store-card__need {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--text-secondary);
  margin-top: 4px;
}

.store-card__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.wishlist-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.wishlist-btn--active { color: var(--accent-warning, #ecc94b); }
```

- [ ] **Step 3: Wire "Store" button in kid mode**

In kid.html, bind the store button after the balance header renders:

```js
document.getElementById('kidStoreBtn')?.addEventListener('click', () => {
  const mount = document.getElementById('taskSheetMount');
  mount.innerHTML = renderRewardStoreSheet({
    rewards: Object.fromEntries(Object.entries(rewards).map(([id, r]) => [id, { id, ...r }])),
    balance,
    streak: kidStreak?.current || 0,
    wishlist,
    allMessages: { [kid.id]: messages },
    personId: kid.id
  });

  // Bind "Get it!" buttons
  for (const btn of mount.querySelectorAll('.store-get-btn')) {
    btn.addEventListener('click', async () => {
      const rewardId = btn.dataset.rewardId;
      const reward = rewards[rewardId];
      if (!reward) return;

      // Confirmation
      if (!confirm(`Spend ${reward.pointCost} pts on ${reward.name}?`)) return;

      // Deduct points immediately via redemption-request message
      await writeMessage(kid.id, {
        type: 'redemption-request',
        title: reward.name,
        body: null,
        amount: -reward.pointCost,
        rewardId,
        entryKey: null,
        seen: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: kid.id
      });

      mount.innerHTML = '';
      // Toast
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = `Requested ${reward.name}! Waiting for approval...`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    });
  }

  // Bind wishlist buttons
  for (const btn of mount.querySelectorAll('.wishlist-btn')) {
    btn.addEventListener('click', async () => {
      const rewardId = btn.dataset.rewardId;
      if (btn.classList.contains('wishlist-btn--active')) {
        await removeWishlistItem(kid.id, rewardId);
        delete wishlist[rewardId];
        btn.classList.remove('wishlist-btn--active');
      } else {
        await writeWishlistItem(kid.id, rewardId);
        wishlist[rewardId] = { addedAt: Date.now() };
        btn.classList.add('wishlist-btn--active');
      }
    });
  }

  // Bind cancel buttons on pending requests
  for (const btn of mount.querySelectorAll('.store-cancel-btn')) {
    btn.addEventListener('click', async () => {
      const msgId = btn.dataset.msgId;
      const rewardName = btn.dataset.rewardName;
      const amount = parseInt(btn.dataset.amount) || 0;
      if (!confirm(`Cancel request for ${rewardName}? Points will be refunded.`)) return;

      // Mark the request as denied (by system)
      await markMessageSeen(kid.id, msgId);

      // Write denial message
      await writeMessage(kid.id, {
        type: 'redemption-denied',
        title: `${rewardName} — cancelled`,
        body: null,
        amount: 0,
        rewardId: null,
        entryKey: null,
        seen: true, // kid initiated, no need to notify
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: 'system'
      });

      // Refund points
      await writeMessage(kid.id, {
        type: 'bonus',
        title: `Refund: ${rewardName}`,
        body: null,
        amount,
        rewardId: null,
        entryKey: null,
        seen: true, // system refund from kid cancel
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: 'system'
      });

      mount.innerHTML = '';
      // Show toast
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = `Cancelled — ${amount} pts refunded`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    });
  }

  // Backdrop close
  mount.querySelector('.bottom-sheet__backdrop')?.addEventListener('click', () => { mount.innerHTML = ''; });
});
```

- [ ] **Step 4: Verify** — Open kid mode. Tap "Store" button. See available rewards (create some in admin first). Tap "Get it!" on an affordable reward. Verify `redemption-request` message appears in Firebase. Switch to dashboard, see the request in the bell. Go back to kid store — see the pending request with "Cancel" button. Tap cancel — verify refund message appears and points are restored.

- [ ] **Step 5: Commit**

```bash
git add kid.html shared/components.js styles/kid.css
git commit -m "feat(rewards): add rewards store bottom sheet with wishlist and redemption requests"
```

---

### Task 11: Kid Mode — Transaction History & Wishlist Display

**Files:**
- Modify: `kid.html` (add history sheet, wishlist progress bars)

- [ ] **Step 1: Add history sheet rendering**

```js
function renderHistorySheet(messages, snapshots, personId, multipliers) {
  // Build unified ledger: snapshots + messages
  const entries = [];

  // Add snapshot daily earnings
  if (snapshots) {
    for (const [dateKey, people] of Object.entries(snapshots)) {
      const snap = people?.[personId];
      if (!snap) continue;
      const mult = multipliers?.[dateKey]?.[personId]?.multiplier || 1;
      const earned = (snap.percentage || 0) * mult;
      entries.push({
        date: dateKey,
        timestamp: new Date(dateKey + 'T23:59:59Z').getTime(),
        icon: '📊',
        title: 'Daily Score',
        amount: Math.round(earned),
        type: 'earning'
      });
    }
  }

  // Add messages
  if (messages) {
    for (const msg of Object.values(messages)) {
      entries.push({
        date: msg.createdAt ? new Date(msg.createdAt).toISOString().split('T')[0] : '?',
        timestamp: msg.createdAt || 0,
        icon: msg.type === 'bonus' ? '➕' :
              msg.type === 'deduction' ? '➖' :
              msg.type === 'redemption-request' ? '🛒' :
              msg.type === 'redemption-approved' ? '✅' :
              msg.type === 'redemption-denied' ? '❌' :
              msg.type === 'task-skip-used' ? '⏭️' :
              msg.type === 'penalty-removed' ? '🛡️' : '📋',
        title: msg.title || msg.type,
        amount: msg.amount || 0,
        body: msg.body,
        type: msg.type
      });
    }
  }

  // Sort newest first
  entries.sort((a, b) => b.timestamp - a.timestamp);

  // Group by date
  const grouped = {};
  for (const entry of entries) {
    const d = entry.date;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(entry);
  }

  let html = '<h3 style="margin-bottom: 12px;">Point History</h3>';

  for (const [date, items] of Object.entries(grouped)) {
    html += `<div class="history-date">${date}</div>`;
    for (const item of items) {
      const amtClass = item.amount >= 0 ? 'history-item__amount--positive' : 'history-item__amount--negative';
      html += `<div class="history-item">
        <span class="history-item__icon">${item.icon}</span>
        <span class="history-item__title">${esc(item.title)}</span>
        <span class="history-item__amount ${amtClass}">${item.amount >= 0 ? '+' : ''}${item.amount}</span>
      </div>`;
    }
  }

  if (entries.length === 0) {
    html += '<div style="text-align: center; padding: 32px; color: var(--text-secondary);">No history yet</div>';
  }

  return renderBottomSheet(html);
}
```

- [ ] **Step 2: Add wishlist progress bars to balance header**

Update `renderBalanceHeader` to include wishlisted rewards:

```js
function renderWishlistProgress(wishlist, rewards, balance) {
  const items = Object.keys(wishlist)
    .map(rewardId => rewards[rewardId])
    .filter(Boolean);

  if (items.length === 0) return '';

  return items.map(r => {
    const progress = Math.min(100, Math.round((balance / r.pointCost) * 100));
    return `<div class="wishlist-tracker">
      <span class="wishlist-tracker__icon">${esc(r.icon)}</span>
      <span class="wishlist-tracker__name">${esc(r.name)}</span>
      <div class="wishlist-tracker__bar">
        <div class="wishlist-tracker__fill" style="width: ${progress}%"></div>
      </div>
      <span class="wishlist-tracker__label">${balance}/${r.pointCost}</span>
    </div>`;
  }).join('');
}
```

- [ ] **Step 3: Wire history button**

```js
document.getElementById('kidHistoryBtn')?.addEventListener('click', () => {
  const mount = document.getElementById('taskSheetMount');
  mount.innerHTML = renderHistorySheet(messages, allSnapshots, kid.id, multipliers);
  mount.querySelector('.bottom-sheet__backdrop')?.addEventListener('click', () => { mount.innerHTML = ''; });
});
```

- [ ] **Step 4: Add history styles to kid.css**

```css
/* ── History ── */
.history-date {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: 8px 0 4px;
  border-bottom: 1px solid var(--border);
  margin-top: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.history-item__icon { font-size: 1.1rem; width: 24px; text-align: center; }
.history-item__title { flex: 1; font-size: var(--font-size-sm); }
.history-item__amount { font-weight: 700; font-variant-numeric: tabular-nums; font-size: var(--font-size-sm); }
.history-item__amount--positive { color: var(--accent-success, #38a169); }
.history-item__amount--negative { color: var(--accent-danger, #e53e3e); }

/* ── Wishlist Tracker ── */
.wishlist-tracker {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: var(--font-size-sm);
}

.wishlist-tracker__icon { font-size: 1rem; }
.wishlist-tracker__name { flex-shrink: 0; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.wishlist-tracker__bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.wishlist-tracker__fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
}

.wishlist-tracker__label {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  font-size: var(--font-size-xs, 0.75rem);
}
```

- [ ] **Step 5: Verify** — Open kid mode. Tap "History" — see daily earning entries and any messages. Add a reward to wishlist from store — see progress bar appear in balance area.

- [ ] **Step 6: Commit**

```bash
git add kid.html styles/kid.css
git commit -m "feat(rewards): add transaction history sheet and wishlist progress to kid mode"
```

---

## Phase 6: Functional Rewards (Bank)

### Task 12: Kid Mode — Bank Display & Token Usage

**Files:**
- Modify: `kid.html` (add bank rendering, task skip picker, penalty removal preview)
- Modify: `shared/firebase.js` (need `updateData` for setting exempt on schedule entries — already exists)

- [ ] **Step 1: Add bank rendering function**

```js
function renderBankSection(bank) {
  const unused = Object.entries(bank)
    .filter(([, t]) => !t.used);

  if (unused.length === 0) return '';

  const skips = unused.filter(([, t]) => t.rewardType === 'task-skip').length;
  const removals = unused.filter(([, t]) => t.rewardType === 'penalty-removal').length;

  return `<div class="kid-bank">
    <h4 class="kid-bank__title">Your Power-Ups</h4>
    <div class="kid-bank__tokens">
      ${skips > 0 ? `<button class="kid-bank__token" id="useTaskSkip" type="button">
        <span class="kid-bank__token-icon">⏭️</span>
        <span>Task Skip ×${skips}</span>
      </button>` : ''}
      ${removals > 0 ? `<button class="kid-bank__token" id="usePenaltyRemoval" type="button">
        <span class="kid-bank__token-icon">🛡️</span>
        <span>Penalty Removal ×${removals}</span>
      </button>` : ''}
    </div>
  </div>`;
}
```

- [ ] **Step 2: Add task skip usage flow**

```js
function bindTaskSkip(bank, viewEntries, tasks, completions, kid) {
  document.getElementById('useTaskSkip')?.addEventListener('click', () => {
    // Find incomplete, non-exempt tasks for today
    const skippable = Object.entries(viewEntries)
      .filter(([key, entry]) => {
        if (entry.ownerId !== kid.id) return false;
        if (completions[key]) return false;
        if (entry.exempt) return false;
        const task = tasks[entry.taskId];
        if (!task) return false;
        const cat = task.category ? catsObj?.[task.category] : null;
        if (cat?.isEvent) return false;
        return true;
      });

    if (skippable.length === 0) {
      alert("All tasks done — nothing to skip!");
      return;
    }

    const mount = document.getElementById('taskSheetMount');
    let html = '<h3 style="margin-bottom: 12px;">Pick a task to skip</h3>';
    for (const [key, entry] of skippable) {
      const task = tasks[entry.taskId];
      html += `<button class="skip-pick-btn" data-entry-key="${key}" type="button" style="display: block; width: 100%; text-align: left; padding: 12px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: var(--radius, 8px); background: var(--surface); cursor: pointer;">
        ${esc(task.name)}
      </button>`;
    }
    mount.innerHTML = renderBottomSheet(html);

    for (const btn of mount.querySelectorAll('.skip-pick-btn')) {
      btn.addEventListener('click', async () => {
        const entryKey = btn.dataset.entryKey;

        // Find an unused task-skip token
        const token = Object.entries(bank).find(([, t]) => t.rewardType === 'task-skip' && !t.used);
        if (!token) return;

        // Mark schedule entry as exempt
        const entry = viewEntries[entryKey];
        const dateKey = todayKey(settings.timezone);
        await updateData(`schedule/${dateKey}/${entryKey}`, { exempt: true });

        // Mark token as used
        await markBankTokenUsed(kid.id, token[0], entryKey);

        // Write confirmation message
        const task = tasks[entry.taskId];
        await writeMessage(kid.id, {
          type: 'task-skip-used',
          title: `Skipped: ${task?.name || 'task'}`,
          body: null,
          amount: 0,
          rewardId: null,
          entryKey,
          seen: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: 'system'
        });

        mount.innerHTML = '';
        // Refresh
        renderAll();
      });
    }

    mount.querySelector('.bottom-sheet__backdrop')?.addEventListener('click', () => { mount.innerHTML = ''; });
  });
}
```

- [ ] **Step 3: Add penalty removal usage flow**

```js
function bindPenaltyRemoval(bank, completions, schedule, tasks, settings, kid) {
  document.getElementById('usePenaltyRemoval')?.addEventListener('click', async () => {
    const penalty = findHighestDamagePenalty(completions, schedule, tasks, settings);

    if (!penalty) {
      alert("No penalties to remove right now");
      return;
    }

    // Preview before confirming
    const confirmed = confirm(`Restore full points for "${penalty.taskName}" on ${penalty.dateKey}? (+${penalty.pointsRestored} pts)`);
    if (!confirmed) return;

    // Find an unused penalty-removal token
    const token = Object.entries(bank).find(([, t]) => t.rewardType === 'penalty-removal' && !t.used);
    if (!token) return;

    // Clear isLate and pointsOverride on the completion
    await updateData(`completions/${penalty.entryKey}`, { isLate: null, pointsOverride: null });

    // Recalculate snapshot for that date
    const dateKey = penalty.dateKey;
    const dayEntries = schedule[dateKey] || {};
    const people = peopleArray();
    const personEntries = {};
    for (const [key, entry] of Object.entries(dayEntries)) {
      if (entry.ownerId === kid.id) personEntries[key] = entry;
    }

    // Re-read completions for accuracy
    const freshCompletions = await readCompletions();
    const snapshot = buildSnapshot(personEntries, freshCompletions, tasks, catsObj, settings, dateKey);
    if (snapshot) {
      await writeSnapshot(dateKey, kid.id, snapshot);

      // Check if day is now 100% — update streaks
      if (snapshot.missedKeys.length === 0) {
        const currentStreaks = await readStreaks(kid.id);
        const updated = updateStreaks(currentStreaks, dateKey, true);
        await writeStreaks(kid.id, updated);
      }
    }

    // Mark token as used
    await markBankTokenUsed(kid.id, token[0], penalty.entryKey);

    // Write confirmation message
    await writeMessage(kid.id, {
      type: 'penalty-removed',
      title: `Restored: ${penalty.taskName}`,
      body: `Full points restored for ${penalty.dateKey} (+${penalty.pointsRestored} pts)`,
      amount: penalty.pointsRestored,
      rewardId: null,
      entryKey: penalty.entryKey,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'system'
    });

    // Refresh
    renderAll();
  });
}
```

- [ ] **Step 4: Add bank styles to kid.css**

```css
/* ── Bank (Power-Ups) ── */
.kid-bank {
  padding: 12px 16px;
  margin-bottom: 16px;
}

.kid-bank__title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.kid-bank__tokens {
  display: flex;
  gap: 8px;
}

.kid-bank__token {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--surface);
  border: 2px solid var(--accent);
  border-radius: var(--radius, 8px);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 600;
  transition: all 0.15s;
}

.kid-bank__token:hover {
  background: var(--accent);
  color: #fff;
}

.kid-bank__token-icon { font-size: 1.25rem; }
```

- [ ] **Step 5: Wire bank section into kid mode render**

Insert `renderBankSection(bank)` into the kid mode main render, between the balance header and the task list. Call `bindTaskSkip` and `bindPenaltyRemoval` after rendering.

- [ ] **Step 6: Verify** — Create Task Skip and Penalty Removal rewards in admin. Request them from kid mode (need enough points — use bonus messages to fund). Approve in bell. See tokens appear in kid mode bank. Use Task Skip — pick a task, verify it shows "Skipped". Use Penalty Removal — verify preview shows, confirm, verify snapshot is recalculated.

- [ ] **Step 7: Commit**

```bash
git add kid.html styles/kid.css
git commit -m "feat(rewards): add bank power-ups — task skip and penalty removal token usage"
```

---

## Phase 7: Bounty Tasks

### Task 13: Admin — Bounty Toggle on Task Form

**Files:**
- Modify: `admin.html` (add bounty fields to task create/edit form)

- [ ] **Step 1: Add bounty toggle to the task form**

In the existing task form rendering (look for `renderTaskForm` or the task creation form), add a bounty section after the existing fields:

```js
// After the existing task form fields (difficulty, estMin, etc.):
const bountySection = `
  <div class="form-group" style="margin-top: 12px;">
    <label class="form-label">
      <input type="checkbox" id="tf_bountyToggle" ${task.bounty ? 'checked' : ''}> 🎯 Bounty Task
    </label>
    <div id="tf_bountyFields" style="${task.bounty ? '' : 'display: none;'}">
      <p class="form-hint" style="margin-bottom: 8px;">Scoring-exempt. Reward granted automatically on completion.</p>
      <div class="segmented-control" id="tf_bountyType" style="margin-bottom: 8px;">
        <button type="button" class="segmented-btn${(!task.bounty || task.bounty.type === 'points') ? ' segmented-btn--active' : ''}" data-value="points">Points</button>
        <button type="button" class="segmented-btn${task.bounty?.type === 'reward' ? ' segmented-btn--active' : ''}" data-value="reward">Reward</button>
      </div>
      <div id="tf_bountyPointsField" style="${task.bounty?.type === 'reward' ? 'display: none;' : ''}">
        <label class="form-label">Bonus points</label>
        <input type="number" id="tf_bountyAmount" class="form-input" value="${task.bounty?.amount || 50}" min="1">
      </div>
      <div id="tf_bountyRewardField" style="${task.bounty?.type !== 'reward' ? 'display: none;' : ''}">
        <label class="form-label">Reward</label>
        <select id="tf_bountyReward" class="form-input">
          <option value="">Select a reward...</option>
          ${Object.entries(rewardsObj).filter(([,r]) => r.status === 'active').map(([id, r]) =>
            `<option value="${id}" ${task.bounty?.rewardId === id ? 'selected' : ''}>${esc(r.icon)} ${esc(r.name)} (${r.pointCost} pts)</option>`
          ).join('')}
        </select>
      </div>
    </div>
  </div>`;
```

- [ ] **Step 2: Bind bounty toggle events**

```js
// In the task form binding:
const bountyToggle = main.querySelector('#tf_bountyToggle');
const bountyFields = main.querySelector('#tf_bountyFields');
bountyToggle?.addEventListener('change', () => {
  bountyFields.style.display = bountyToggle.checked ? '' : 'none';
  // If bounty is enabled, auto-set exempt and rotation to once
  if (bountyToggle.checked) {
    // Set rotation to 'once' if not already
    const rotationBtns = main.querySelectorAll('[data-rotation]');
    rotationBtns.forEach(b => b.classList.remove('segmented-btn--active'));
    main.querySelector('[data-rotation="once"]')?.classList.add('segmented-btn--active');
  }
});

// Bounty type toggle
for (const btn of main.querySelectorAll('#tf_bountyType .segmented-btn')) {
  btn.addEventListener('click', () => {
    main.querySelectorAll('#tf_bountyType .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
    btn.classList.add('segmented-btn--active');
    main.querySelector('#tf_bountyPointsField').style.display = btn.dataset.value === 'points' ? '' : 'none';
    main.querySelector('#tf_bountyRewardField').style.display = btn.dataset.value === 'reward' ? '' : 'none';
  });
}
```

- [ ] **Step 3: Include bounty data in task save**

When saving the task, read bounty fields and include in the task data:

```js
// In the save handler:
const isBounty = main.querySelector('#tf_bountyToggle')?.checked;
let bounty = null;
if (isBounty) {
  const bountyType = main.querySelector('#tf_bountyType .segmented-btn--active')?.dataset?.value || 'points';
  bounty = {
    type: bountyType,
    amount: bountyType === 'points' ? (parseInt(main.querySelector('#tf_bountyAmount')?.value) || 50) : null,
    rewardId: bountyType === 'reward' ? (main.querySelector('#tf_bountyReward')?.value || null) : null
  };
  // Auto-set exempt for bounty tasks
  taskData.exempt = true;
}
taskData.bounty = bounty;
```

- [ ] **Step 4: Verify** — Open admin, create a new task. Toggle "Bounty Task" on. Set type to Points, enter 100. Save. Verify task data in Firebase includes `bounty: { type: 'points', amount: 100 }` and `exempt: true`.

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "feat(rewards): add bounty task toggle to admin task form"
```

---

### Task 14: Bounty Badge on Task Cards & Auto-Reward on Completion

**Files:**
- Modify: `shared/components.js` (update `renderTaskCard` to show bounty badge)
- Modify: `dashboard.js` (add bounty reward logic to completion handler)
- Modify: `kid.html` (add bounty reward logic to completion handler)

- [ ] **Step 1: Update renderTaskCard for bounty badge**

In `renderTaskCard` in components.js, add bounty badge rendering. Look for where the task card HTML is built and add:

```js
// Inside renderTaskCard, after the task name:
const bountyBadge = task?.bounty
  ? `<span class="task-card__bounty">🎯 ${task.bounty.type === 'points' ? task.bounty.amount + ' pts' : esc(rewardName || 'Reward')}</span>`
  : '';
```

Add the bounty badge CSS to components.css:

```css
.task-card__bounty {
  display: inline-block;
  background: var(--accent-warning, #ecc94b);
  color: #000;
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
```

- [ ] **Step 2: Add skipped badge to task card**

```css
.task-card__skipped {
  display: inline-block;
  background: var(--surface-alt, var(--surface));
  color: var(--text-secondary);
  font-size: var(--font-size-xs, 0.75rem);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
```

In renderTaskCard, check for exempt schedule entries and show "Skipped" badge instead of checkbox.

- [ ] **Step 3: Add bounty completion handler to dashboard.js**

In the existing completion toggle handler in dashboard.js, after `writeCompletion`, check if the task is a bounty:

```js
// After writeCompletion succeeds for a new completion:
const task = tasks[entry.taskId];
if (task?.bounty) {
  if (task.bounty.type === 'points') {
    // Write bonus message
    await writeMessage(entry.ownerId, {
      type: 'bonus',
      title: `Bounty: ${task.name}`,
      body: null,
      amount: task.bounty.amount,
      rewardId: null,
      entryKey,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'system'
    });
  } else if (task.bounty.type === 'reward' && task.bounty.rewardId) {
    const reward = rewardsData[task.bounty.rewardId];
    // Write redemption-approved message (no approval needed — parent set it up)
    await writeMessage(entry.ownerId, {
      type: 'redemption-approved',
      title: `Bounty reward: ${reward?.name || 'Reward'}`,
      body: null,
      amount: 0,
      rewardId: task.bounty.rewardId,
      entryKey,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'system'
    });
    // If functional reward, add to bank
    if (reward?.rewardType === 'task-skip' || reward?.rewardType === 'penalty-removal') {
      await writeBankToken(entry.ownerId, {
        rewardType: reward.rewardType,
        acquiredAt: Date.now(),
        used: false,
        usedAt: null,
        targetEntryKey: null
      });
    }
  }

  // Multi-person bounty: first-come-first-served — remove other entries
  if (task.ownerAssignmentMode === 'duplicate' && task.owners?.length > 1) {
    const dayEntries = schedule[viewDate] || {};
    for (const [otherKey, otherEntry] of Object.entries(dayEntries)) {
      if (otherKey !== entryKey && otherEntry.taskId === entry.taskId) {
        await removeData(`schedule/${dateKey}/${otherKey}`);
      }
    }
  }
}
```

- [ ] **Step 4: Add same bounty logic to kid.html completion handler**

Replicate the bounty completion logic in kid.html's completion handler (same code as Step 3).

- [ ] **Step 5: Verify** — Create a bounty task in admin (e.g., "Organize Garage" with 200 pts bounty). Assign to a person. Complete it from dashboard or kid mode. Verify bonus message appears. For multi-person bounties: assign to two people, complete with one, verify the other's entry disappears.

- [ ] **Step 6: Commit**

```bash
git add shared/components.js styles/components.css dashboard.js kid.html
git commit -m "feat(rewards): add bounty badges on task cards and auto-reward on completion"
```

---

## Phase 8: Bonus Multiplier Days

### Task 15: Bonus Day Creation & Display

**Files:**
- Modify: `shared/components.js` (add bonus day creation sheet)
- Modify: `kid.html` (show multiplier banner)
- Modify: `styles/kid.css` (multiplier banner styles)

- [ ] **Step 1: Add renderBonusDaySheet to components.js**

```js
export function renderBonusDaySheet(people) {
  const today = new Date().toISOString().split('T')[0];
  return renderBottomSheet(`
    <h3 style="margin-bottom: 12px;">🎉 Bonus Day</h3>

    <label class="form-label">Who</label>
    <div class="chip-group" id="bd_people">
      <button class="chip chip--selectable chip--active" data-person-id="everyone" type="button">Everyone</button>
      ${people.map(p =>
        `<button class="chip chip--selectable" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${esc(p.name)}</button>`
      ).join('')}
    </div>

    <label class="form-label" style="margin-top: 12px;">Date</label>
    <input type="date" id="bd_date" class="form-input" value="${today}">

    <label class="form-label" style="margin-top: 12px;">Multiplier</label>
    <div class="segmented-control" id="bd_mult">
      <button type="button" class="segmented-btn segmented-btn--active" data-value="2">2x</button>
      <button type="button" class="segmented-btn" data-value="3">3x</button>
    </div>

    <label class="form-label" style="margin-top: 12px;">Note (optional)</label>
    <input type="text" id="bd_note" class="form-input" placeholder="Happy Birthday!">

    <div style="margin-top: 16px; display: flex; gap: 8px;">
      <button class="btn btn--primary" id="bd_save" type="button" style="flex: 1;">Set Bonus Day</button>
      <button class="btn btn--ghost" id="bd_cancel" type="button">Cancel</button>
    </div>
  `);
}
```

- [ ] **Step 2: Wire "Bonus Day" button in bell dropdown**

In `initBell`, bind the `bellBonusDay` button similar to "Send Message":

```js
document.getElementById('bellBonusDay')?.addEventListener('click', () => {
  closeBellDropdown();
  const mount = document.getElementById('taskSheetMount') || document.getElementById('drilldownMount');
  if (!mount) return;
  mount.innerHTML = renderBonusDaySheet(getPeople());

  // Person chip toggle (exclusive with "Everyone")
  for (const chip of mount.querySelectorAll('#bd_people .chip--selectable')) {
    chip.addEventListener('click', () => {
      if (chip.dataset.personId === 'everyone') {
        mount.querySelectorAll('#bd_people .chip--selectable').forEach(c => c.classList.remove('chip--active'));
        chip.classList.add('chip--active');
      } else {
        mount.querySelector('[data-person-id="everyone"]')?.classList.remove('chip--active');
        chip.classList.toggle('chip--active');
      }
    });
  }

  // Multiplier toggle
  for (const btn of mount.querySelectorAll('#bd_mult .segmented-btn')) {
    btn.addEventListener('click', () => {
      mount.querySelectorAll('#bd_mult .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
    });
  }

  // Save
  mount.querySelector('#bd_save')?.addEventListener('click', async () => {
    const dateKey = mount.querySelector('#bd_date').value;
    const mult = parseInt(mount.querySelector('#bd_mult .segmented-btn--active')?.dataset?.value) || 2;
    const note = mount.querySelector('#bd_note').value.trim() || null;
    const isEveryone = mount.querySelector('[data-person-id="everyone"]')?.classList.contains('chip--active');
    const selectedIds = isEveryone
      ? getPeople().map(p => p.id)
      : [...mount.querySelectorAll('#bd_people .chip--active')].map(c => c.dataset.personId).filter(id => id !== 'everyone');

    for (const pid of selectedIds) {
      await writeMultiplierFn(dateKey, pid, { multiplier: mult, note, createdBy: 'parent' });
    }

    mount.innerHTML = '';
  });

  mount.querySelector('#bd_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  mount.querySelector('.bottom-sheet__backdrop')?.addEventListener('click', () => { mount.innerHTML = ''; });
});
```

- [ ] **Step 3: Show multiplier banner in kid mode**

In kid mode render, check for a multiplier on today's date:

```js
const todayMult = multipliers?.[todayKey(settings.timezone)]?.[kid.id];
const multBanner = todayMult
  ? `<div class="kid-multiplier-banner">${todayMult.multiplier}x Day! 🎉${todayMult.note ? ` — ${esc(todayMult.note)}` : ''}</div>`
  : '';
```

Add to kid.css:

```css
.kid-multiplier-banner {
  background: linear-gradient(135deg, var(--accent-warning, #ecc94b), var(--accent, #6c63ff));
  color: #fff;
  text-align: center;
  padding: 8px 16px;
  font-weight: 700;
  font-size: var(--font-size-base);
  border-radius: var(--radius, 8px);
  margin-bottom: 12px;
}
```

- [ ] **Step 4: Verify** — From dashboard bell, click "Bonus Day". Set 2x for today for a person. Open kid mode for that person — see "2x Day!" banner. Check that balance calculation reflects the multiplier.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js kid.html styles/kid.css
git commit -m "feat(rewards): add bonus multiplier days — creation from bell and kid mode banner"
```

---

## Phase 9: Achievements

### Task 16: Achievement Checking & Display

**Files:**
- Modify: `kid.html` (add trophy case, achievement overlays, check on load)
- Modify: `scoreboard.html` (add badge icons next to person names)
- Modify: `styles/kid.css` (trophy case styles)

- [ ] **Step 1: Check achievements on kid mode load**

After balance is calculated in kid mode:

```js
// Check for new achievements
const kidStreak = (await readStreaks(kid.id)) || { current: 0, best: 0 };
const today = todayKey(settings.timezone);
const weekS = weekStart(today);
const weekE = weekEnd(today);
const monthS = monthStart(today);
const monthE = monthEnd(today);

const weekSnaps = collectSnapshots(allSnapshots, kid.id, weekS, weekE);
const monthSnaps = collectSnapshots(allSnapshots, kid.id, monthS, monthE);
const weekAgg = aggregateSnapshots(weekSnaps);
const monthAgg = aggregateSnapshots(monthSnaps);
// Use displayEntries (already filtered to this kid's entries for today in kid.html's render scope)
const todayScore = dailyScore(displayEntries, completions, tasks, catsObj, settings, today, today).grade;

// Check if kid has any redemption-approved messages
const hasRedeemed = Object.values(messages).some(m => m.type === 'redemption-approved');

const newAchievements = checkNewAchievements({
  streak: kidStreak.current,
  totalEarned,
  existingAchievements: achievements,
  weeklyGrade: weekAgg.grade,
  monthlyGrade: monthAgg.grade,
  dailyGrade: todayScore,
  hasRedeemed
});

// Unlock new achievements
for (const key of newAchievements) {
  await writeAchievement(kid.id, key, {
    unlockedAt: Date.now(),
    seen: false
  });
  achievements[key] = { unlockedAt: Date.now(), seen: false };
}
```

- [ ] **Step 2: Add trophy case rendering**

```js
function renderTrophyCase(achievements) {
  let html = '<div class="kid-trophies"><h4 class="kid-trophies__title">Achievements</h4><div class="kid-trophies__grid">';

  for (const [key, def] of Object.entries(ACHIEVEMENTS)) {
    const unlocked = achievements[key];
    html += `<div class="kid-trophy ${unlocked ? 'kid-trophy--unlocked' : 'kid-trophy--locked'}" title="${esc(def.label)}: ${esc(def.description)}">
      <span class="kid-trophy__icon">${def.icon}</span>
      <span class="kid-trophy__label">${esc(def.label)}</span>
    </div>`;
  }

  html += '</div></div>';
  return html;
}
```

- [ ] **Step 3: Show achievement unlock overlays**

```js
function showUnseenAchievements() {
  const unseen = Object.entries(achievements)
    .filter(([, a]) => !a.seen)
    .sort((a, b) => (b[1].unlockedAt || 0) - (a[1].unlockedAt || 0));

  if (unseen.length === 0) return;

  const [key, ach] = unseen[0];
  const def = ACHIEVEMENTS[key];
  if (!def) return;

  const mount = document.getElementById('celebrationMount');
  mount.innerHTML = `<div class="kid-msg-overlay kid-msg-overlay--positive">
    <div class="kid-msg-overlay__card" style="border-color: gold;">
      <div style="font-size: 4rem; margin-bottom: 8px;">${def.icon}</div>
      <h3 class="kid-msg-overlay__title">Achievement Unlocked!</h3>
      <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">${esc(def.label)}</div>
      <div style="color: var(--text-secondary); margin-bottom: 16px;">${esc(def.description)}</div>
      <button class="btn btn--primary kid-msg-overlay__dismiss" type="button">Awesome!</button>
    </div>
  </div>`;

  mount.querySelector('.kid-msg-overlay__dismiss')?.addEventListener('click', async () => {
    await markAchievementSeen(kid.id, key);
    achievements[key].seen = true;
    mount.innerHTML = '';
    showUnseenAchievements();
  });
}

// Call after showing unseen messages
showUnseenAchievements();
```

- [ ] **Step 4: Add trophy case styles to kid.css**

```css
/* ── Trophy Case ── */
.kid-trophies {
  padding: 12px 16px;
  margin-bottom: 16px;
}

.kid-trophies__title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.kid-trophies__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.kid-trophy {
  text-align: center;
  padding: 8px 4px;
  border-radius: var(--radius, 8px);
  border: 1px solid var(--border);
}

.kid-trophy--unlocked {
  background: var(--surface);
}

.kid-trophy--locked {
  opacity: 0.35;
  filter: grayscale(1);
}

.kid-trophy__icon { font-size: 1.5rem; display: block; }

.kid-trophy__label {
  font-size: var(--font-size-xs, 0.75rem);
  display: block;
  margin-top: 2px;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Add achievement badges to scoreboard**

In scoreboard.html, after loading achievements for all people, show small badge icons next to each person's name in the leaderboard:

```js
// In the person card rendering:
const personAchievements = allAchievementsData?.[person.id] || {};
const badgeIcons = Object.keys(personAchievements)
  .map(key => ACHIEVEMENTS[key]?.icon)
  .filter(Boolean)
  .slice(0, 5) // Show max 5 badges
  .join('');
// Add badgeIcons next to the person's name in the leaderboard card HTML
```

- [ ] **Step 6: Verify** — Open kid mode. If the kid has a streak of 7+, see the achievement unlock overlay. Acknowledge it. See the trophy case with unlocked badges highlighted and locked ones grayed out. Check scoreboard for badge icons.

- [ ] **Step 7: Commit**

```bash
git add kid.html scoreboard.html styles/kid.css
git commit -m "feat(rewards): add achievements — trophy case, unlock overlays, scoreboard badges"
```

---

## Phase 10: Scoreboard & Cleanup

### Task 17: Scoreboard Balance Display & Admin Cleanup

**Files:**
- Modify: `scoreboard.html` (add balance display to leaderboard cards)
- Modify: `admin.html` (add balance reset and clear history to People tab, person delete cascade)

- [ ] **Step 1: Add balance to scoreboard leaderboard cards**

In scoreboard.html, after loading rewards data, calculate and display each person's balance:

```js
// Import balance calculation
import { calculateBalance } from './shared/scoring.js';
import { readAllBalanceAnchors, readAllMessages, readMultipliers } from './shared/firebase.js';

// Load rewards data alongside existing data
const [allAnchors, allMessages, allMultipliers] = await Promise.all([
  readAllBalanceAnchors(),
  readAllMessages(),
  readMultipliers()
]);

// In the person card rendering, calculate and display balance:
const personMsgs = allMessages?.[person.id] || {};
const personAnchor = allAnchors?.[person.id] || null;
const { balance } = calculateBalance(person.id, snapshots, personMsgs, personAnchor, allMultipliers);

// Add to card HTML:
// <div class="leaderboard-card__balance">💰 ${balance.toLocaleString()} pts</div>
```

- [ ] **Step 2: Add balance management to admin People tab**

In the People tab rendering, add balance reset and clear history buttons per person:

```js
// After the existing person card content:
html += `<div class="person-balance-actions" style="margin-top: 8px; display: flex; gap: 8px;">
  <button class="btn btn--ghost btn--xs admin-reset-balance" data-person-id="${p.id}" type="button">Reset Balance</button>
  <button class="btn btn--ghost btn--xs admin-clear-history" data-person-id="${p.id}" type="button">Clear History</button>
</div>`;
```

Bind the buttons:

```js
for (const btn of main.querySelectorAll('.admin-reset-balance')) {
  btn.addEventListener('click', async () => {
    if (!confirm('Reset this person\'s rewards balance to 0?')) return;
    await writeBalanceAnchor(btn.dataset.personId, { amount: 0, anchoredAt: Date.now() });
    render();
  });
}

for (const btn of main.querySelectorAll('.admin-clear-history')) {
  btn.addEventListener('click', async () => {
    if (!confirm('Clear message history? Balance will be preserved.')) return;
    const pid = btn.dataset.personId;
    // Calculate current balance first
    const msgs = (await readMessages(pid)) || {};
    const anchor = (await readBalanceAnchor(pid)) || null;
    const snaps = (await readAllSnapshots()) || {};
    const mults = (await readMultipliers()) || {};
    const { balance } = calculateBalance(pid, snaps, msgs, anchor, mults);
    // Write anchor with current balance, then clear messages
    await writeBalanceAnchor(pid, { amount: balance, anchoredAt: Date.now() });
    await clearMessages(pid, Date.now());
    render();
  });
}
```

- [ ] **Step 3: Add person delete cascade**

In the existing person delete handler (around line 2132 in admin.html), add rewards data cleanup:

```js
// After the existing removeData(`people/${id}`) call:
await deletePersonRewardsData(id);
```

Import `deletePersonRewardsData` in the admin imports.

- [ ] **Step 4: Verify** — Open scoreboard, see balance next to each person's grades. Open admin People tab, see "Reset Balance" and "Clear History" buttons. Reset a balance — verify it goes to 0. Clear history — verify balance is preserved but messages are gone in Firebase.

- [ ] **Step 5: Commit**

```bash
git add scoreboard.html admin.html
git commit -m "feat(rewards): add balance to scoreboard, admin balance management, person delete cascade"
```

---

### Task 18: CLAUDE.md Backlog Update

**Files:**
- Modify: `CLAUDE.md` (update backlog, add rewards store to schema docs)

- [ ] **Step 1: Update the Firebase Schema section in CLAUDE.md**

Add the new nodes to the schema documentation:

```
├── rewards/
│   └── {pushId}      ← { name, icon, pointCost, rewardType, perPerson?, maxRedemptions?,
│                         streakRequirement?, expiresAt?, status }
├── messages/
│   └── {personId}/
│       └── {pushId}  ← { type, title, body?, amount, rewardId?, entryKey?, seen, createdAt, createdBy }
├── balanceAnchors/
│   └── {personId}    ← { amount, anchoredAt }
├── bank/
│   └── {personId}/
│       └── {pushId}  ← { rewardType, acquiredAt, used, usedAt?, targetEntryKey? }
├── wishlist/
│   └── {personId}/
│       └── {rewardId} ← { addedAt }
├── achievements/
│   └── {personId}/
│       └── {achievementKey} ← { unlockedAt, seen }
├── multipliers/
│   └── {YYYY-MM-DD}/
│       └── {personId} ← { multiplier, note?, createdBy }
```

- [ ] **Step 2: Update the backlog to mark 1.2 as done**

Mark 1.2 Rewards Store as done, similar to how 1.1 was marked.

- [ ] **Step 3: Update Key Behavior Rules section**

Add:
- Bounty tasks are scoring-exempt (exempt: true) and grant rewards on completion automatically
- Rewards balance = normalized 100pts/day from snapshots + bonuses − deductions − redemptions
- Functional rewards (task skip, penalty removal) are banked as tokens, used at kid's discretion
- Notification bell on all pages shows unseen items; parent vs kid content determined by page context

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with rewards store schema, behavior rules, and backlog status"
```

---

## Summary

**18 tasks across 10 phases:**

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Data Foundation | 1-2 | Firebase CRUD + balance calculation + achievement checking |
| 2. Notification Bell | 3-4 | Bell component in header on all pages |
| 3. Admin Rewards Tab | 5-6 | Reward creation with pricing helper |
| 4. Parent Messages | 7-8 | Bonus/deduction messages + approval flow |
| 5. Kid Mode Core | 9-11 | Balance header, message overlays, store, history, wishlist |
| 6. Functional Rewards | 12 | Bank display, task skip, penalty removal |
| 7. Bounty Tasks | 13-14 | Bounty toggle in admin + auto-reward on completion |
| 8. Bonus Multiplier Days | 15 | Creation from bell + kid mode banner |
| 9. Achievements | 16 | Trophy case, unlock overlays, scoreboard badges |
| 10. Scoreboard & Cleanup | 17-18 | Balance display, admin management, person delete cascade, docs |

Each phase builds on the previous and produces testable functionality.
