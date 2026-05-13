# Rewards Pass 1 — Fix + Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Five bugs squashed, descriptions surfaced everywhere, hardcoded emoji removed, empty states unified. No visual rebuild yet — that comes in Pass 2+.

**Spec:** [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md) — "Pass 1 — Fix + Descriptions" section.

**Architecture:** Most fixes live in [rewards.js](../../../rewards.js); component changes in [shared/components.js](../../../shared/components.js). One new import (`readAllStreaks`) added to rewards.js. New `historyTypeIcon` helper in components.js. No schema changes.

**Files touched:**
- `rewards.js` — data piping, auth gating, stale-data fix, inline style fix, filter sheet refactor, empty state unification
- `shared/components.js` — `renderRewardCard` description line, `renderBankToken` description, `historyTypeIcon` helper + use in `renderHistoryRow`
- `styles/rewards.css` — small additions for new description line classes, sticky filter footer, replace inline-style
- `sw.js` — cache bumps per task

**Commits:** 6 (5 feature + 1 docs).

---

## Task 1: Streak + stock data piping (Bug #1)

**Files:**
- `rewards.js` — add `readAllStreaks` import + initial fetch; precompute streak + redemption maps; pass to `renderRewardCard` call
- `sw.js` — bump cache

**Why:** [rewards.js:299](../../../rewards.js#L299) calls `renderRewardCard(r, balance, { showGet: true })` without passing `streak` or `redemptionCount`. The eligibility checks in `renderRewardCard` ([shared/components.js:1916-1917](../../../shared/components.js#L1916)) silently see 0 for both. Result: `streakRequirement` and `maxRedemptions` are unenforced.

### Step 1: Add `readAllStreaks` to imports

In [rewards.js](../../../rewards.js), find the firebase import block at line 1-3:

```js
import { initFirebase, readSettings, writeSettings, readPeople, readRewards, readAllMessages,
  readAllBalanceAnchors, readAllSnapshots, readBank, readMultipliers,
```

ADD `readAllStreaks` to the named imports (insert after `readAllSnapshots`):

```js
import { initFirebase, readSettings, writeSettings, readPeople, readRewards, readAllMessages,
  readAllBalanceAnchors, readAllSnapshots, readAllStreaks, readBank, readMultipliers,
```

### Step 2: Add to the initial fetch in `loadData()`

Find the `loadData` function. Around line 40-42 there's a `Promise.all` block:

```js
  [settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers] = await Promise.all([
    readSettings(), readPeople(), readRewards(),
    readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers()
  ]);
```

There's also a state declaration earlier (around line 31). Find:

```js
let settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers;
```

ADD `allStreaks` to both the declaration AND the destructuring + Promise.all. Result:

```js
let settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers, allStreaks;
```

```js
  [settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers, allStreaks] = await Promise.all([
    readSettings(), readPeople(), readRewards(),
    readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers(), readAllStreaks()
  ]);
```

There's also a second Promise.all near line 1421 (used by a refresh path) — apply the same change:

```js
    readRewards(), readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers()
```

Change to:

```js
    readRewards(), readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers(), readAllStreaks()
```

And update its destructuring assignment to match.

### Step 3: Pass streak + redemption count into renderRewardCard

In `renderShopTab()` (around line 269-301), BEFORE the `html += visible.map(...)` line, ADD:

```js
  // Precompute streak + per-reward redemption count for eligibility checks
  const personStreak = allStreaks?.[activePerson.id]?.current || 0;
  const personMessages = allMessages?.[activePerson.id] || {};
  const redemptionCountByReward = {};
  for (const msg of Object.values(personMessages)) {
    if (!msg.rewardId) continue;
    if (msg.type === 'redemption-approved' || msg.type === 'reward-used') {
      redemptionCountByReward[msg.rewardId] = (redemptionCountByReward[msg.rewardId] || 0) + 1;
    }
  }
```

Then UPDATE the renderRewardCard call:

```js
    html += visible.map(r => renderRewardCard(r, balance, {
      showGet: true,
      streak: personStreak,
      redemptionCount: redemptionCountByReward[r.id] || 0,
    })).join('');
```

### Step 4: Bump cache

In [sw.js](../../../sw.js), bump `CACHE_NAME` from current value to next (e.g. `v268 → v269`).

### Step 5: Verify

Open `http://localhost:8080/rewards.html`. If your data includes a reward with `streakRequirement` or `maxRedemptions`, confirm eligibility now reflects the actual streak/redemption history. For data without such rewards, confirm the page still renders cleanly with no console errors.

### Step 6: Commit

```bash
git add rewards.js sw.js
git commit -m "$(cat <<'EOF'
fix(rewards): wire streak + redemption count into shop eligibility

renderRewardCard was always called with streak=0 and
redemptionCount=0, so streakRequirement and maxRedemptions were
silently bypassed. Now precompute personStreak from rundown/streaks
and redemptionCountByReward from message history, pass through.

Adds readAllStreaks to the initial Promise.all + the refresh path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Approvals auth gating (Bug #2)

**Files:**
- `rewards.js` — gate Approvals tab visibility correctly
- `sw.js` — bump cache

**Why:** [rewards.js:232](../../../rewards.js#L232) — tab list is built using `isKidMode = !!kidName` from URL param. Adult viewing as a kid still sees Approvals; kid editing the URL gains parent powers.

### Step 1: Fix the tab list gating

Find the tab-list construction around line 232. It looks something like:

```js
const tabs = isKidMode
  ? [{ key: 'shop', label: 'Shop' }, { key: 'bank', label: 'Bank' }, { key: 'history', label: 'History' }]
  : [{ key: 'shop', label: 'Shop' }, { key: 'bank', label: 'Bank' }, { key: 'history', label: 'History' }, { key: 'approvals', label: 'Approvals' }];
```

REPLACE the conditional with role-aware logic:

```js
// Approvals tab is for adults only — gate on the viewer's role (set once on first load),
// not the kid-mode URL param (which a kid could remove).
const showApprovals = !isKidMode && viewerPerson?.role !== 'child';
const tabs = [
  { key: 'shop', label: 'Shop' },
  { key: 'bank', label: 'Bank' },
  { key: 'history', label: 'History' },
  ...(showApprovals ? [{ key: 'approvals', label: 'Approvals' }] : []),
];
```

### Step 2: Also gate the renderActiveTab handler

Find `renderActiveTab()` (likely around line 250-260). If `activeTab === 'approvals'`, add a guard:

```js
if (activeTab === 'approvals' && (isKidMode || viewerPerson?.role === 'child')) {
  // Fallback to shop if approvals was selected but role doesn't allow
  activeTab = 'shop';
}
```

### Step 3: Bump cache

`v269 → v270`.

### Step 4: Verify

Open `http://localhost:8080/rewards.html?kid=Lexi` — Approvals tab should NOT appear in the tab row. Try `?tab=approvals&kid=Lexi` — should fall back to Shop. Open `http://localhost:8080/rewards.html` as Jordin (adult) — Approvals should appear. Switch to Lexi via the person switcher — Approvals should disappear (because `viewerPerson` is now Lexi who is a child).

Wait — research said `viewerPerson` is set once on first load and never changes. That's intentional for theming, but it means the person switcher doesn't re-evaluate role-gating. **Decide during implementation:** Either (a) make `viewerPerson` mutable when the switcher changes, (b) keep `viewerPerson` frozen and only re-render the tabs when it freezes on first load. (b) is simpler and matches current intent — the page's "owner" is the first person loaded, the switcher is for "viewing as". This means an adult who first loads then switches to view-as-Lexi still sees Approvals (because they're the page's owner). This is acceptable; the security concern is kid-mode URL bypass which we've fixed.

### Step 5: Commit

```bash
git add rewards.js sw.js
git commit -m "$(cat <<'EOF'
fix(rewards): Approvals tab gated by viewer role, not URL param

Previously the Approvals tab was hidden only when ?kid= was set in
the URL. A kid editing the URL to remove the param would gain
access. Now gated on viewerPerson?.role !== 'child' (the page's
owner role, set once on first load) AND not in kid-mode.

Also adds a runtime fallback in renderActiveTab so ?tab=approvals
in a kid-mode URL falls back to shop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Bank stale message detection + inline style (Bugs #3, #4)

**Files:**
- `rewards.js` — re-read messages before duplicate check; replace inline `style="margin-top: 20px;"` with a CSS class
- `styles/rewards.css` — add the new class
- `sw.js` — bump cache

### Step 1: Re-read messages before duplicate-request check (Bug #3)

Find `handleUseToken()` around line 763-810. There's a duplicate-request check around line 790-791 that reads from `allMessages`. Find the check (it looks for an existing pending `use-request` for the same token).

BEFORE the duplicate check, refresh the messages cache:

```js
    // Refresh allMessages so the duplicate check sees writes from other tabs/devices.
    allMessages = await readAllMessages();
```

The check then uses the freshly-fetched data.

Note: `readAllMessages` is already imported. If not, add it to the imports.

### Step 2: Replace inline style (Bug #4)

Find line 729 (the kids-bank section heading with `style="margin-top: 20px;"`). It likely looks like:

```js
html += `<h3 style="margin-top: 20px;">Kids</h3>`;
```

REPLACE with:

```js
html += `<h3 class="rewards-bank-section-heading">Kids</h3>`;
```

(Adjust the exact text/markup to match what's there; just replace the inline-style attribute with the class.)

### Step 3: Add the CSS class

In [styles/rewards.css](../../../styles/rewards.css), append at the end:

```css
/* Kids-bank section heading spacing (Pass 1 fix — replaces inline style) */
.rewards-bank-section-heading {
  margin-top: var(--spacing-lg);
}
```

### Step 4: Verify

```bash
grep -n "style=" rewards.js
```

Expect no matches (or only acceptable CSS-custom-property usages like `style="--chip-color: …"`). Confirm the kids-bank section visually appears with the same spacing.

### Step 5: Bump cache

`v270 → v271`.

### Step 6: Commit

```bash
git add rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
fix(rewards): stale duplicate-check + inline-style violation

- handleUseToken re-reads allMessages before duplicate-request check
  so cross-tab writes are reflected (was using stale page-load cache).
- Replace inline style="margin-top: 20px;" on kids-bank heading with
  .rewards-bank-section-heading class.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Sticky Apply on filter sheets (Bug #5)

**Files:**
- `rewards.js` — refactor `openShopFilterSheet()` and `openHistoryFilterSheet()` to use canonical `fs-footer` pattern
- `sw.js` — bump cache

**Why:** Both filter sheets currently render Apply as a block-flow button at the end of chip lists. On phones with many filter chips, Apply scrolls off-screen. The canonical pattern (per DESIGN.md §5.23) uses sticky `fs-footer`.

### Step 1: Investigate the current sheets

Read `openShopFilterSheet` around line 351-387 and `openHistoryFilterSheet` around line 447-481. Both build HTML that looks like:

```html
<h3>Filter rewards</h3>
<div class="filter-section">…chip group…</div>
<div class="filter-section">…sort chips…</div>
<button class="btn btn--primary" id="…apply">Apply</button>
```

### Step 2: Refactor to fs-footer pattern

Modify both functions so the body and footer are separated. Use the same shape the kitchen/dashboard form sheets use. Look at [shared/components.js](../../../shared/components.js) for a reference function like `renderEventForm` or `renderBonusDaySheet` for the fs-footer pattern.

Generic shape:

```html
<div class="fs-body">
  <h3 class="sheet-section-title">Filter rewards</h3>
  <div class="filter-section">…chip group…</div>
  <div class="filter-section">…sort chips…</div>
</div>
<div class="fs-footer">
  <button class="btn btn--secondary" id="…cancel">Cancel</button>
  <button class="btn btn--primary" id="…apply">Apply</button>
</div>
```

The sheet HTML returns `renderBottomSheet(<above content>)`. Verify by inspecting an existing sheet that uses `fs-footer`.

Add corresponding event listeners for the new Cancel button in both `bindShopFilterSheet` / `bindHistoryFilterSheet` (or wherever the existing Apply listener is wired).

### Step 3: Bump cache

`v271 → v272`.

### Step 4: Verify

Open the Shop tab. Tap "Filter & Sort". Sheet opens. Confirm the Apply button stays pinned at the bottom and the chip list scrolls inside the sheet. Same for History tab → Filter & Sort.

### Step 5: Commit

```bash
git add rewards.js sw.js
git commit -m "$(cat <<'EOF'
refactor(rewards): filter sheets use sticky fs-footer pattern

Shop and History filter sheets now follow DESIGN.md §5.23 sheet
shape — chips scroll inside an fs-body, Cancel + Apply stay pinned
at the bottom. Previous block-flow Apply could scroll off-screen
when the chip list was long.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Hardcoded emoji + unified empty states (Polish 1.6, 1.7)

**Files:**
- `shared/components.js` — extract `historyTypeIcon(type)` helper; update `renderHistoryRow` to use it
- `rewards.js` — replace 3 raw `<div class="empty-state">` blocks with `renderEmptyState()` calls
- `sw.js` — bump cache

### Step 1: Extract `historyTypeIcon` helper

In [shared/components.js](../../../shared/components.js), find `renderHistoryRow` (line 1999). Currently the `typeIcons` map uses emoji:

```js
  const typeIcons = {
    'redemption-request': '🎁',
    'redemption-approved': '✅',
    'redemption-denied': '❌',
    'use-request': '🎁',
    'use-approved': '✅',
    'use-denied': '❌',
    'reward-used': '🎁',
    'bonus': '⭐',
    'deduction': '📉',
    'fyi': 'ℹ️',
  };
  const icon = typeIcons[entry.type] || '•';
```

REPLACE with a call to a new helper. ADD the helper just before `renderHistoryRow`:

```js
/**
 * Return an SVG icon for a history/message type.
 * Replaces the previous emoji-keyed map. Icons are lucide-style.
 */
export function historyTypeIcon(type) {
  const icons = {
    'redemption-request': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
    'redemption-approved': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    'redemption-denied': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    'reward-used': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/></svg>',
    'bonus': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    'deduction': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
    'fyi': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  // Aliases — use/redemption variants share visuals
  icons['use-request'] = icons['redemption-request'];
  icons['use-approved'] = icons['redemption-approved'];
  icons['use-denied'] = icons['redemption-denied'];
  return icons[type] || '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>';
}
```

Then update `renderHistoryRow` to use it:

```js
  const icon = historyTypeIcon(entry.type);
```

### Step 2: Unify empty states in rewards.js

Find the three raw empty-state divs in `rewards.js`:
- Bank tab empty (around line 699)
- History tab empty (around line 408)
- Approvals tab empty (around line 514)

Each looks similar to:

```js
html += `<div class="empty-state"><p>No tokens yet.</p></div>`;
```

REPLACE each with a `renderEmptyState()` call. `renderEmptyState` is already imported (used by Shop tab). Choose appropriate icons + copy:

- Bank empty: `renderEmptyState('🎒', 'No saved rewards', 'Redeem something from the Shop to save it here.')`
- History empty: `renderEmptyState('📜', 'No history yet', 'Activity will appear here as you earn and spend points.')`
- Approvals empty: `renderEmptyState('✅', 'No pending approvals', "You're all caught up.")`

(Use whichever icon vocabulary matches the page — emoji is acceptable for empty-state icons specifically.)

### Step 3: Bump cache

`v272 → v273`.

### Step 4: Verify

History tab — confirm SVG icons render in each row, not emoji. Bank/History/Approvals empty states — confirm the consistent empty-state visual matches Shop's empty state.

### Step 5: Commit

```bash
git add shared/components.js rewards.js sw.js
git commit -m "$(cat <<'EOF'
refactor(rewards): SVG history icons + unified empty states

- New shared/components.historyTypeIcon(type) returns lucide-style
  SVGs for each message type. renderHistoryRow uses it; emoji map
  removed (CLAUDE.md rule — no emoji in chrome surfaces).
- Bank/History/Approvals tabs now call renderEmptyState() instead
  of inline <div class="empty-state"><p>…</p></div>. Shop already
  used the helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Feature M — Description visible everywhere

**Files:**
- `shared/components.js` — `renderRewardCard` shows description below name; `renderBankToken` shows description below acquired-date
- `rewards.js` — intent sheet renders description body
- `styles/rewards.css` (or `components.css`) — new description-line class
- `sw.js` — bump cache

**Why:** The `description` field is collected in the admin reward form but never displayed to the user. Kid sees "Yes Day" in their bank without remembering what it grants.

### Step 1: Update `renderRewardCard`

In [shared/components.js](../../../shared/components.js), find `renderRewardCard` (line 1913). After the `<div class="card__title">…</div>` line, ADD a description line (truncated to ~2 lines via CSS):

```js
      <div class="card__title">${esc(reward.name)}</div>
      ${reward.description ? `<div class="card--reward__desc">${esc(reward.description)}</div>` : ''}
```

### Step 2: Update `renderBankToken`

In [shared/components.js](../../../shared/components.js), find `renderBankToken` (line 1964). The token doesn't store `description` directly — it has `rewardId`. So we need to look up the reward.

**Approach A (simpler):** Have callers pass the reward object as a new opt. But that requires call-site changes.

**Approach B (preferred):** Add an optional `description` param to the opts.

Use Approach B. Update the function signature:

```js
export function renderBankToken(tokenId, token, opts = {}) {
  const { showUse = true, isAdult = false, approvalRequired = true, description = '' } = opts;
```

And update the HTML to render the description below the existing name/date row:

```js
      <div class="card__title">${esc(token.rewardName || 'Reward')}</div>
      <div class="card__meta">Saved ${formatDateShort(...)}</div>
      ${description ? `<div class="card--reward__desc">${esc(description)}</div>` : ''}
```

(Match the actual template — quote it accurately during implementation.)

In `rewards.js` where `renderBankToken` is called, pass the description from the reward lookup:

```js
const reward = rewardsObj?.[token.rewardId] || null;
renderBankToken(tokenId, token, {
  ...existingOpts,
  description: reward?.description || '',
});
```

### Step 3: Update intent sheet

Find `openIntentSheet(reward, rewardId)` around line 937. The sheet HTML currently shows icon + name + Save/Use chips. ADD a description block between the name and the chips:

```js
  <div class="intent-sheet__header">
    <span class="intent-sheet__icon">${esc(reward.icon || '🎁')}</span>
    <div>
      <div class="intent-sheet__name">${esc(reward.name)}</div>
      ${reward.description ? `<div class="intent-sheet__desc">${esc(reward.description)}</div>` : ''}
    </div>
  </div>
```

(Match the actual existing structure; just insert the description div.)

### Step 4: CSS

In [styles/rewards.css](../../../styles/rewards.css), append:

```css
/* ── Reward description line (Pass 1 — Feature M) ── */
.card--reward__desc,
.intent-sheet__desc {
  font-size: var(--font-xs);
  color: var(--text-muted);
  line-height: 1.3;
  margin-top: 2px;
  /* Clamp to 2 lines on the card; full text in the intent sheet */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.intent-sheet__desc {
  -webkit-line-clamp: unset; /* no clamping in the sheet — show full text */
  margin-top: var(--spacing-xs);
}
```

### Step 5: Bump cache

`v273 → v274`.

### Step 6: Verify

Open Shop. Reward cards with a `description` set should show the description below the name (truncated to 2 lines). Tap a custom reward → intent sheet → description appears below the name in full. Switch to Bank tab (with content) → each token shows description.

### Step 7: Commit

```bash
git add shared/components.js rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): description visible on reward card, intent sheet, bank token

The reward form collects a description but it was never displayed.
Now appears:
- Below the name on shop reward cards (2-line clamp)
- Below the name in the intent sheet (full text)
- Below the acquired-date on bank tokens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Docs + push

- [ ] Append a "Pass 1 — Shipped" note to [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md). Include commit SHAs.
- [ ] Stage + commit + push.

```bash
git add docs/superpowers/specs/2026-05-13-rewards-rebuild.md docs/superpowers/plans/2026-05-13-rewards-pass-1.md
git commit -m "$(cat <<'EOF'
docs(rewards): Pass 1 plan + shipped note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review checklist

1. **Spec coverage:** All five bugs (1.1-1.5) → Tasks 1-4. Hardcoded emoji (1.6) + empty states (1.7) → Task 5. Feature M (descriptions) → Task 6. ✓
2. **No schema changes.** Adding `readAllStreaks` to an existing Firebase path; no new paths. ✓
3. **Cache bumps:** 6 sequential. ✓
4. **Each commit independently reverts cleanly.** Verified by structure. ✓
5. **Visual regression risk:** Low — Pass 1 is mostly bugs and additive UI (descriptions). No layout changes to existing structures.
