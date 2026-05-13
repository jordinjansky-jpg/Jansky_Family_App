# Rewards Pass 4 — Bank / History / Approvals Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** The non-Shop tabs match Shop's polish. Bank groups duplicate tokens. History rows tap-to-detail. Approvals pending items pop visually. Filter sheets share a single opener.

**Spec:** [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md) — "Pass 4 — Bank / History / Approvals Polish".

**Pass 1-3 context loaded:**
- Bank tab uses `loadAndRenderBankTab()` which renders each token as a separate `renderBankTokenEl` row.
- History uses `renderHistoryRow` (pure display, no tap).
- Approvals splits Pending (loud-ish) and Recent (collapsed behind toggle).
- Both filter sheets use `renderFormFooter` with the same shape — ripe for dedup.

**Files touched:**
- `rewards.js` — bank grouping, history tap, approval pending visual, filter dedup
- `shared/components.js` — possibly a `renderHistoryDetailSheet` helper; possibly a generic `openFilterSheet` helper
- `styles/rewards.css` — bank group row, approval pending card, history-row tap state
- `sw.js` — cache bumps

**Commits:** 5 (4 feature + 1 docs).

---

## Task 1: Bank visual hierarchy — group tokens by reward

**Files:**
- `rewards.js` — refactor `loadAndRenderBankTab` to group active tokens by reward
- `styles/rewards.css` — group row + expanded-state styles
- `sw.js` — bump cache v281 → v282

**Why:** Today bank shows `9 YouTube tokens` as 9 separate rows. Collapse identical tokens into one group with a count chip and a tap-to-expand affordance.

### Step 1: Refactor `loadAndRenderBankTab` to group

Find the function at [rewards.js:831](../../../rewards.js#L831). The current active-token loop is:

```js
    activeTokens.forEach(([tokenId, token]) => {
      const reward = rewardsObj?.[token.rewardId] || {};
      html += renderBankTokenEl(tokenId, token, {
        showUse: true,
        isAdult,
        approvalRequired: reward.approvalRequired !== false,
        description: reward?.description || ''
      });
    });
```

REPLACE with grouping logic:

```js
    // Group active tokens by rewardId (custom) or rewardType (functional).
    // Each group becomes a single row showing count; tap expands to individual tokens.
    const groups = new Map();
    for (const [tokenId, token] of activeTokens) {
      const key = token.rewardId || token.rewardType || 'unknown';
      if (!groups.has(key)) {
        const reward = token.rewardId ? rewardsObj?.[token.rewardId] : null;
        groups.set(key, {
          tokens: [],
          rewardName: token.rewardName || reward?.name || 'Reward',
          rewardIcon: token.rewardIcon || reward?.icon || '🎁',
          rewardType: token.rewardType || 'custom',
          description: reward?.description || '',
          approvalRequired: reward?.approvalRequired !== false,
        });
      }
      groups.get(key).tokens.push([tokenId, token]);
    }

    for (const [groupKey, group] of groups) {
      if (group.tokens.length === 1) {
        // Single token — render as normal
        const [tokenId, token] = group.tokens[0];
        html += renderBankTokenEl(tokenId, token, {
          showUse: true,
          isAdult,
          approvalRequired: group.approvalRequired,
          description: group.description,
        });
      } else {
        // Group — render header + collapsed children
        const groupId = `bankGroup_${esc(groupKey)}`;
        html += `<div class="card card--reward bank-group" data-group-key="${esc(groupKey)}">
          <div class="card__leading">
            <span class="icon-tile">${esc(group.rewardIcon)}</span>
          </div>
          <div class="card__body">
            <div class="card__title">${esc(group.rewardName)}</div>
            ${group.description ? `<div class="card--reward__desc">${esc(group.description)}</div>` : ''}
            <div class="card__meta">${group.tokens.length} saved</div>
          </div>
          <div class="card__trailing">
            <button class="chip bank-group__expand" data-group-key="${esc(groupKey)}" type="button" aria-expanded="false">×${group.tokens.length}</button>
          </div>
        </div>
        <div class="bank-group__items" id="${groupId}" hidden>`;
        for (const [tokenId, token] of group.tokens) {
          html += renderBankTokenEl(tokenId, token, {
            showUse: true,
            isAdult,
            approvalRequired: group.approvalRequired,
            description: '', // suppress in expanded rows — already on the group header
          });
        }
        html += `</div>`;
      }
    }
```

### Step 2: Wire up expand toggle

In `bindBankTabContent` (around line 893+), find the existing toggle binding and ADD a new one for groups:

```js
  document.querySelectorAll('.bank-group__expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupKey = btn.dataset.groupKey;
      const list = document.getElementById(`bankGroup_${groupKey}`);
      if (!list) return;
      list.hidden = !list.hidden;
      btn.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
      btn.classList.toggle('bank-group__expand--open', !list.hidden);
    });
  });
```

### Step 3: CSS

In `styles/rewards.css`, append:

```css
/* ── Bank group row (Pass 4) ── */
.bank-group__items {
  margin-left: var(--spacing-md);
  border-left: 2px solid var(--border);
  padding-left: var(--spacing-sm);
}

.bank-group__expand {
  cursor: pointer;
}

.bank-group__expand--open {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
```

### Step 4: Bump cache

`v281 → v282`.

### Step 5: Verify

Switch to a person with multiple identical tokens (e.g. Lexi with 9 used YouTube tokens). On the Bank tab, identical active tokens should collapse into a single row with `×N` count chip. Tap the chip to expand into individual rows.

### Step 6: Commit

```bash
git add rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): bank groups duplicate tokens, tap to expand

Active bank tokens that share rewardId/rewardType collapse into a
single row with an 'xN' count chip. Tap the chip to expand into
individual instances. Single-token groups render unchanged.

The used-tokens collapse from Pass 1 stays as-is.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tappable history rows + detail sheet

**Files:**
- `shared/components.js` — `renderHistoryRow` adds a tappable wrapper; add `renderHistoryDetailSheet` helper
- `rewards.js` — bind tap to open the detail sheet
- `styles/rewards.css` — hover/focus on tappable history rows; detail sheet styles
- `sw.js` — bump cache v282 → v283

**Why:** History rows are read-only. User can't see why a deduction happened, or any custom body text the parent attached.

### Step 1: Make `renderHistoryRow` a tappable button

In [shared/components.js:1999+](../../../shared/components.js#L1999), find `renderHistoryRow`. The current return:

```js
  return `<div class="history-row">
    <span class="history-row__icon">${icon}</span>
    <span class="history-row__label">${esc(entry.title || entry.type)}</span>
    ${amountStr ? `<span class="history-row__amount ${amountClass}">${amountStr}</span>` : ''}
    <span class="history-row__date">${date}</span>
  </div>`;
```

REPLACE with a button:

```js
  // Wrap in a button so callers can bind a click → detail handler.
  // Callers that don't bind a handler get a non-functional button (visually identical to before).
  return `<button class="history-row history-row--tappable" type="button" data-msg-id="${esc(entry.id || '')}" data-person-id="${esc(entry.personId || '')}" data-msg-type="${esc(entry.type)}">
    <span class="history-row__icon">${icon}</span>
    <span class="history-row__label">${esc(entry.title || entry.type)}</span>
    ${amountStr ? `<span class="history-row__amount ${amountClass}">${amountStr}</span>` : ''}
    <span class="history-row__date">${date}</span>
  </button>`;
```

Note: the existing callers in rewards.js pass `msg` objects that may not have `id` / `personId` attached. We need to ensure they do — see Step 3.

### Step 2: Add `renderHistoryDetailSheet`

In [shared/components.js](../../../shared/components.js), near `renderHistoryRow`, add:

```js
/**
 * Render the detail sheet for a history entry.
 * @param {Object} entry  - Full message object with title, body, amount, createdAt, etc.
 * @param {Object|null} reward - The reward record if applicable
 * @param {string} tz
 */
export function renderHistoryDetailSheet(entry, reward, tz) {
  const isPositive = (entry.amount || 0) > 0;
  const amountStr = entry.amount
    ? `${isPositive ? '+' : ''}${Math.round(entry.amount).toLocaleString()} pts`
    : '';
  const amountClass = isPositive ? 'history-detail__amount--pos' : (entry.amount < 0 ? 'history-detail__amount--neg' : '');
  const date = entry.createdAt
    ? new Date(entry.createdAt).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const icon = historyTypeIcon(entry.type);

  return renderBottomSheet(`
    <div class="history-detail">
      <div class="history-detail__header">
        <span class="history-detail__icon">${icon}</span>
        <div class="history-detail__title">${esc(entry.title || entry.type)}</div>
      </div>
      ${amountStr ? `<div class="history-detail__amount ${amountClass}">${amountStr}</div>` : ''}
      ${entry.body ? `<div class="history-detail__body">${esc(entry.body)}</div>` : ''}
      ${reward ? `<div class="history-detail__reward">
        <span class="history-detail__reward-label">Reward:</span>
        <span>${esc(reward.icon || '🎁')} ${esc(reward.name || 'Reward')}</span>
      </div>` : ''}
      <div class="history-detail__date">${date}</div>
      <button class="btn btn--secondary" id="historyDetailClose" type="button">Close</button>
    </div>
  `);
}
```

### Step 3: `rewards.js` — pass msg metadata into renderHistoryRow

The current call sites in `rewards.js` (lines 557, 580, 672) pass `msg` objects but without explicit `id` / `personId`. We need to spread those in. Find each call:

**Line 557 (visible rows):**
```js
  html += visible.map(msg => renderHistoryRow(msg, tz)).join('');
```

This needs the entry to carry `id` and `personId`. Update the `entries` build at line 538:

```js
  let entries = Object.values(raw)
    .filter(msg => allowedTypes.has(msg.type) && matchesHistoryGroup(msg.type, historyFilter.type))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
```

REPLACE with (carries id + personId):

```js
  let entries = Object.entries(raw)
    .map(([id, msg]) => ({ ...msg, id, personId: activePerson.id }))
    .filter(msg => allowedTypes.has(msg.type) && matchesHistoryGroup(msg.type, historyFilter.type))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
```

Similarly inside `bindHistoryTab`'s show-more handler (line 571-574), update the `entries` build the same way.

For line 672 (approvals recent):
```js
${recentItems.map(({ msg }) => renderHistoryRow(msg, tz)).join('')}
```

The `recentItems` build (around line 644-649) already loops `for (const [personId, msgs] of Object.entries(allMessages || {}))` and `for (const [, msg] of Object.entries(msgs || {}))`. Update to capture the msgId too:

```js
  for (const [personId, msgs] of Object.entries(allMessages || {})) {
    for (const [msgId, msg] of Object.entries(msgs || {})) {
      if (resolvedTypes.includes(msg.type) && Date.now() - (msg.createdAt || 0) < THIRTY_DAYS) {
        recentItems.push({ msg: { ...msg, id: msgId, personId }, personId });
      }
    }
  }
```

### Step 4: Bind history-row tap handler

In `bindHistoryTab` (line 566), ADD after the show-more handler:

```js
  document.querySelectorAll('.history-row--tappable').forEach(row => {
    row.addEventListener('click', () => {
      const msgId = row.dataset.msgId;
      const personId = row.dataset.personId;
      if (!msgId || !personId) return;
      const msg = allMessages?.[personId]?.[msgId];
      if (!msg) return;
      const reward = msg.rewardId ? rewardsObj?.[msg.rewardId] : null;
      const tz = settings?.timezone || 'UTC';
      const mount = document.getElementById('sheetMount');
      mount.innerHTML = renderHistoryDetailSheet({ ...msg, id: msgId, personId }, reward, tz);
      requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
      document.getElementById('bottomSheet')?.addEventListener('click', e => {
        if (e.target.id === 'bottomSheet') mount.innerHTML = '';
      });
      document.getElementById('historyDetailClose')?.addEventListener('click', () => { mount.innerHTML = ''; });
    });
  });
```

Also import `renderHistoryDetailSheet` from components.js. Find the components import in rewards.js and add `renderHistoryDetailSheet`.

### Step 5: Update binding in approvals' Recent list

In `bindApprovalsTab` (line 679), the recent rows are rendered but not bound. ADD a binding similar to history:

```js
  document.querySelectorAll('#approvalsRecentList .history-row--tappable').forEach(row => {
    row.addEventListener('click', () => {
      const msgId = row.dataset.msgId;
      const personId = row.dataset.personId;
      if (!msgId || !personId) return;
      const msg = allMessages?.[personId]?.[msgId];
      if (!msg) return;
      const reward = msg.rewardId ? rewardsObj?.[msg.rewardId] : null;
      const tz = settings?.timezone || 'UTC';
      const mount = document.getElementById('sheetMount');
      mount.innerHTML = renderHistoryDetailSheet({ ...msg, id: msgId, personId }, reward, tz);
      requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
      document.getElementById('bottomSheet')?.addEventListener('click', e => {
        if (e.target.id === 'bottomSheet') mount.innerHTML = '';
      });
      document.getElementById('historyDetailClose')?.addEventListener('click', () => { mount.innerHTML = ''; });
    });
  });
```

### Step 6: CSS

In `styles/rewards.css`, append:

```css
/* ── Tappable history row (Pass 4) ── */
.history-row.history-row--tappable {
  width: 100%;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: var(--spacing-xs) var(--spacing-md);
}

.history-row--tappable:hover { background: var(--surface-2); }
.history-row--tappable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ── History detail sheet ── */
.history-detail {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.history-detail__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.history-detail__icon svg { display: block; }

.history-detail__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.history-detail__amount {
  font-size: var(--font-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.history-detail__amount--pos { color: var(--success); }
.history-detail__amount--neg { color: var(--danger); }

.history-detail__body {
  font-size: var(--font-sm);
  color: var(--text-muted);
  line-height: 1.5;
  padding: var(--spacing-sm) 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.history-detail__reward {
  font-size: var(--font-sm);
  display: flex;
  gap: var(--spacing-xs);
}

.history-detail__reward-label {
  color: var(--text-muted);
}

.history-detail__date {
  font-size: var(--font-xs);
  color: var(--text-faint);
}
```

### Step 7: Bump cache + commit

`v282 → v283`.

```bash
git add shared/components.js rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): tappable history rows open detail sheet

History rows on the History tab and the Approvals tab's Recent
list become buttons. Tap opens a bottom sheet showing the full
title, amount, body text (if any), linked reward (if any), and
full timestamp.

renderHistoryRow now uses <button> semantics with data-msg-id +
data-person-id attrs; renderHistoryDetailSheet is the new shared
component for the detail view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Approvals pending visual weight

**Files:**
- `shared/components.js` — `renderApprovalRow` gets a visual upgrade (richer card, prominent buttons)
- `styles/rewards.css` — pending card styles
- `sw.js` — bump cache v283 → v284

**Why:** Pending approvals should be the loudest thing on the page when they exist. Currently they look about as important as the recent-list rows.

### Step 1: Update `renderApprovalRow` in components.js

Find `renderApprovalRow` at [shared/components.js:2039+](../../../shared/components.js#L2039). Read the current implementation and update it to emit a richer "filled card" structure. The exact change depends on what's there. The minimum upgrade:

- Wrap in a stronger container (e.g. `card card--approval-pending`)
- Use larger Approve / Deny buttons with `btn--primary` / `btn--ghost` rather than plain `chip`
- Show the cost prominently

If the existing implementation already uses prominent buttons, focus on:
- Adding a border-left accent strip in the person's color
- Larger text
- More breathing room

### Step 2: CSS

In `styles/rewards.css`, append (or modify if these classes already exist):

```css
/* ── Pending approval card (Pass 4) ── */
.card--approval-pending {
  padding: var(--spacing-md);
  border-left: 4px solid var(--owner-color, var(--accent));
  background: var(--surface-2);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
}

.card--approval-pending .approval-row__actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.card--approval-pending .approval-row__actions .btn {
  flex: 1;
}
```

### Step 3: Bump cache + commit

`v283 → v284`.

```bash
git add shared/components.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): approval pending items get full-card visual weight

Pending requests on the Approve tab render as filled cards with
the requester's color as a left-accent stripe, prominent
Approve / Deny buttons sized for thumb-tap, and clearer cost
display. The recent-list collapses behind the existing 'Show N
recent' toggle untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Filter sheets dedup

**Files:**
- `rewards.js` — extract `openFilterSheet(config)` helper; `openShopFilterSheet` + `openHistoryFilterSheet` call it
- `sw.js` — bump cache v284 → v285

**Why:** Shop and History filter sheets share 90% of their shape — chip groups + Cancel/Apply footer. One opener with a config object reduces duplication.

### Step 1: Add `openFilterSheet` helper

In `rewards.js`, near the other filter-sheet code, ADD:

```js
/**
 * Generic filter sheet opener. Sections are chip groups; Apply collects active
 * values and calls onApply(values).
 *
 * @param {Object} cfg
 * @param {string} cfg.title — sheet section title
 * @param {string} cfg.saveId — DOM id for Apply button
 * @param {string} cfg.cancelId — DOM id for Cancel button
 * @param {Array}  cfg.sections — [{ label, name, opts: [{v,l}], current }]
 * @param {Function} cfg.onApply — (values) => void; values is { [section.name]: selectedV }
 */
function openFilterSheet(cfg) {
  const mount = document.getElementById('sheetMount');
  const sectionsHtml = cfg.sections.map(section => `
    <div class="filter-section">
      <div class="filter-section__label">${esc(section.label)}</div>
      <div class="filter-chips">
        ${section.opts.map(o => `<button class="chip${section.current === o.v ? ' chip--active' : ''}" data-section="${esc(section.name)}" data-value="${esc(o.v)}" type="button">${esc(o.l)}</button>`).join('')}
      </div>
    </div>
  `).join('');

  const html = `<div class="fs-body">
    <h3 class="sheet-section-title">${esc(cfg.title)}</h3>
    ${sectionsHtml}
  </div>
  ${renderFormFooter({ saveLabel: 'Apply', saveId: cfg.saveId, cancelId: cfg.cancelId })}`;

  mount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });

  // Wire up chip click — single-select per section
  mount.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      mount.querySelectorAll(`[data-section="${section}"]`).forEach(x => x.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
  });

  mount.querySelector(`#${cfg.cancelId}`)?.addEventListener('click', () => { mount.innerHTML = ''; });

  mount.querySelector(`#${cfg.saveId}`)?.addEventListener('click', () => {
    const values = {};
    for (const section of cfg.sections) {
      const active = mount.querySelector(`[data-section="${section.name}"].chip--active`);
      values[section.name] = active?.dataset.value || section.current;
    }
    mount.innerHTML = '';
    cfg.onApply(values);
  });
}
```

### Step 2: Replace `openShopFilterSheet` with a config-driven call

REPLACE the entire `openShopFilterSheet` function with:

```js
function openShopFilterSheet() {
  openFilterSheet({
    title: 'Filter rewards',
    saveId: 'shopFilterApply',
    cancelId: 'shopFilterCancel',
    sections: [
      {
        label: 'Type',
        name: 'type',
        current: shopFilter.type,
        opts: [
          { v: 'all', l: 'All Types' }, { v: 'custom', l: 'Custom' },
          { v: 'functional', l: 'Functional' }, { v: 'bounties', l: 'Bounties' },
        ],
      },
      {
        label: 'Sort by',
        name: 'sort',
        current: shopFilter.sort,
        opts: [
          { v: 'name', l: 'Name' },
          { v: 'cost', l: 'Cost' },
          { v: 'closest', l: 'Closest to affordable' },
        ],
      },
    ],
    onApply: (values) => {
      shopFilter.type = values.type;
      shopFilter.sort = values.sort;
      const content = document.getElementById('rewardsContent');
      if (content) { content.innerHTML = renderShopTab(); applyDataColors(content); bindShopTab(); }
    },
  });
}
```

### Step 3: Replace `openHistoryFilterSheet` with a config-driven call

REPLACE the entire `openHistoryFilterSheet` function with:

```js
function openHistoryFilterSheet() {
  const adultOpts = [
    { v: 'all', l: 'All' }, { v: 'purchases', l: 'Purchases' },
    { v: 'uses', l: 'Uses' }, { v: 'bonuses', l: 'Bonuses' }, { v: 'deductions', l: 'Deductions' },
  ];
  const kidOpts = [
    { v: 'all', l: 'All' }, { v: 'purchases', l: 'Purchases' }, { v: 'uses', l: 'Uses' },
  ];
  openFilterSheet({
    title: 'Filter history',
    saveId: 'historyFilterApply',
    cancelId: 'historyFilterCancel',
    sections: [
      {
        label: 'Type',
        name: 'type',
        current: historyFilter.type,
        opts: isKidMode ? kidOpts : adultOpts,
      },
    ],
    onApply: (values) => {
      historyFilter.type = values.type;
      const content = document.getElementById('rewardsContent');
      if (content) { content.innerHTML = renderHistoryTab(); bindHistoryTab(); }
    },
  });
}
```

### Step 4: Bump cache + commit

`v284 → v285`.

```bash
git add rewards.js sw.js
git commit -m "$(cat <<'EOF'
refactor(rewards): single openFilterSheet helper, two callers

Shop + History filter sheets shared 90% of their shape. Extract
to openFilterSheet({ title, sections, onApply, ... }) — each
caller now describes its chip groups declaratively and a single
implementation handles the markup, chip-click state, and
Cancel/Apply wiring.

Behavior unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Docs + push

- [ ] Append "Pass 4 — Shipped" note to [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md). Include commit SHAs. Note that this is the final pass — the rewards rebuild is complete.
- [ ] Stage + commit + push.

```bash
git add docs/superpowers/specs/2026-05-13-rewards-rebuild.md docs/superpowers/plans/2026-05-13-rewards-pass-4.md
git commit -m "$(cat <<'EOF'
docs(rewards): Pass 4 plan + shipped note (rebuild complete)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review checklist

1. **Spec coverage:** 4.1 bank grouping → Task 1; 4.2 tappable history → Task 2; 4.3 approvals visual weight → Task 3; 4.4 filter dedup → Task 4. ✓
2. **No schema changes.** All four tasks read existing Firebase paths.
3. **Cache bumps:** 4 sequential (v282-v285).
4. **Backward compatibility:** `renderHistoryRow` signature unchanged (callers still pass entry+tz). The wrapping `<button>` is invisible unless callers bind a click handler.
