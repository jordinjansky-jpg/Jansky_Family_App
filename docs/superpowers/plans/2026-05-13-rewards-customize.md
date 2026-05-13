# Rewards Customize Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a "Rewards" section to the More → Customize sheet, mirroring the Kitchen-page pattern. Ship 5 preferences: tab visibility, default Shop sort, card density, family banner visibility, and a "Show on reward cards" toggle group.

**Pattern reference:** Kitchen does this via `readKitchenCustomize` / `writeKitchenCustomize` / `renderKitchenCustomizeSection` / `bindKitchenCustomizeSection` in `shared/components.js`. The customize sheet checks `currentPage === 'kitchen'` and inserts the section. Rewards page already passes `currentPage: 'rewards'` and `personOpts` to `initBottomNav` ([rewards.js:90-98](../../../rewards.js#L90)) — no wiring change needed.

**Storage:** Per-person prefs at `person.prefs.customize.rewards` (when in person mode); falls back to `localStorage['dr-customize-rewards']` (device).

**Files touched:**
- `shared/components.js` — add 4 new functions; gate render in `openDeviceThemeSheet`
- `rewards.js` — read prefs; apply to tab list, default sort, family-banner visibility, renderRewardCard call
- `styles/rewards.css` — add `.card--reward--compact` density variant
- `sw.js` — bump cache v286 → v287

**Commits:** 2 (foundation + applied prefs), or 3 if I split the rewards.js wiring. Single-task with bundled changes is fine since they're tightly coupled.

---

## Task 1: Add preferences helpers + Customize section

**Files:**
- `shared/components.js` — 4 new exports + 1 sheet integration line
- `sw.js` — bump cache

### Step 1: Add prefs defaults + read/write helpers

In `shared/components.js`, find the `KITCHEN_PREFS_DEFAULT` block around line 650. After `writeKitchenCustomize`, ADD analogous helpers for rewards:

```js
const REWARDS_PREFS_DEFAULT = {
  tabs: ['shop', 'bank', 'history', 'approvals'],
  shopSort: 'cost',
  cardDensity: 'roomy',
  showFamilyBanner: true,
  cardShow: {
    approvalLabel: true,
    description: true,
    stockBadge: true,
    streakBadge: true,
    progressBar: true,
  },
};

export function readRewardsCustomize(personOpts) {
  let raw = null;
  if (personOpts?.person?.prefs?.customize?.rewards) {
    raw = personOpts.person.prefs.customize.rewards;
  } else {
    try { raw = JSON.parse(localStorage.getItem('dr-customize-rewards') || 'null'); } catch { /* */ }
  }
  if (!raw || typeof raw !== 'object') return {
    ...REWARDS_PREFS_DEFAULT,
    cardShow: { ...REWARDS_PREFS_DEFAULT.cardShow },
  };
  return {
    tabs:            Array.isArray(raw.tabs) ? raw.tabs.filter(t => ['shop','bank','history','approvals'].includes(t)) : [...REWARDS_PREFS_DEFAULT.tabs],
    shopSort:        ['name', 'cost', 'closest'].includes(raw.shopSort) ? raw.shopSort : REWARDS_PREFS_DEFAULT.shopSort,
    cardDensity:     ['roomy', 'compact'].includes(raw.cardDensity) ? raw.cardDensity : REWARDS_PREFS_DEFAULT.cardDensity,
    showFamilyBanner: raw.showFamilyBanner !== false,
    cardShow:        { ...REWARDS_PREFS_DEFAULT.cardShow, ...(raw.cardShow || {}) },
  };
}

export async function writeRewardsCustomize(personOpts, patch) {
  const current = readRewardsCustomize(personOpts);
  const next = { ...current, ...patch };
  if (personOpts?.writePerson && personOpts?.person) {
    const nextPerson = {
      ...personOpts.person,
      prefs: {
        ...(personOpts.person.prefs || {}),
        customize: {
          ...((personOpts.person.prefs || {}).customize || {}),
          rewards: next,
        },
      },
    };
    await personOpts.writePerson(personOpts.person.id, nextPerson);
    personOpts.person = nextPerson;
  } else {
    try { localStorage.setItem('dr-customize-rewards', JSON.stringify(next)); } catch { /* */ }
  }
}
```

### Step 2: Add `renderRewardsCustomizeSection` + `bindRewardsCustomizeSection`

After the kitchen `bindKitchenCustomizeSection` function (around line 873+), ADD:

```js
function renderRewardsCustomizeSection(personOpts) {
  const prefs = readRewardsCustomize(personOpts);
  const sortLabels = { name: 'A–Z', cost: 'Cost', closest: 'Closest to affordable' };
  const chev = `<svg class="dt-collapsible__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  return `<div class="dt-section dt-section--page">
    <label class="form-label">Rewards</label>
    <p class="form-hint mt-xs">Settings that only apply to this page.</p>

    <details class="dt-collapsible dt-collapsible--nested">
      <summary class="dt-collapsible__summary">
        <span class="form-label form-label--sub">Rewards tabs</span>${chev}
      </summary>
      <p class="form-hint mt-xs">Hide tabs you don't use. Always keeps at least one visible.</p>
      ${[
        { id: 'shop',      label: 'Shop' },
        { id: 'bank',      label: 'Bank' },
        { id: 'history',   label: 'History' },
        { id: 'approvals', label: 'Approve' },
      ].map(t => `
        <div class="dt-toggle-row"><span class="dt-toggle-row__label">${esc(t.label)}</span>
          <label class="form-toggle"><input type="checkbox" data-rc-tab="${esc(t.id)}"${prefs.tabs.includes(t.id) ? ' checked' : ''}><span class="form-toggle__track"></span></label>
        </div>
      `).join('')}
    </details>

    <details class="dt-collapsible dt-collapsible--nested">
      <summary class="dt-collapsible__summary">
        <span class="form-label form-label--sub">Shop tab</span>${chev}
      </summary>
      <div class="form-group mt-sm">
        <label class="form-label form-label--sub">Default sort</label>
        <div class="dt-themes" id="dt_rcShopSort">
          ${Object.entries(sortLabels).map(([k, label]) => `<button class="dt-theme-btn${prefs.shopSort === k ? ' dt-theme-btn--active' : ''}" data-sort="${esc(k)}" type="button">${esc(label)}</button>`).join('')}
        </div>
      </div>
      <div class="form-group mt-md">
        <label class="form-label form-label--sub">Card density</label>
        <div class="segmented-control" id="dt_rcCardDensity">
          <button type="button" class="segmented-btn${prefs.cardDensity === 'roomy'   ? ' segmented-btn--active' : ''}" data-density="roomy">Roomy</button>
          <button type="button" class="segmented-btn${prefs.cardDensity === 'compact' ? ' segmented-btn--active' : ''}" data-density="compact">Compact</button>
        </div>
      </div>
    </details>

    <details class="dt-collapsible dt-collapsible--nested">
      <summary class="dt-collapsible__summary">
        <span class="form-label form-label--sub">Show on reward cards</span>${chev}
      </summary>
      ${[
        { key: 'approvalLabel', label: 'Instant / Approval label' },
        { key: 'description',   label: 'Description line' },
        { key: 'stockBadge',    label: 'Stock count badge' },
        { key: 'streakBadge',   label: 'Streak badge' },
        { key: 'progressBar',   label: 'Progress bar' },
      ].map(t => `
        <div class="dt-toggle-row"><span class="dt-toggle-row__label">${esc(t.label)}</span>
          <label class="form-toggle"><input type="checkbox" data-rc-show="${esc(t.key)}"${prefs.cardShow[t.key] ? ' checked' : ''}><span class="form-toggle__track"></span></label>
        </div>
      `).join('')}
    </details>

    <details class="dt-collapsible dt-collapsible--nested">
      <summary class="dt-collapsible__summary">
        <span class="form-label form-label--sub">Family banner</span>${chev}
      </summary>
      <div class="dt-toggle-row"><span class="dt-toggle-row__label">Show family balance summary</span>
        <label class="form-toggle"><input type="checkbox" id="dt_rcFamBanner"${prefs.showFamilyBanner ? ' checked' : ''}><span class="form-toggle__track"></span></label>
      </div>
      <p class="form-hint mt-xs">Hidden automatically in kid mode and single-person families.</p>
    </details>
  </div>`;
}

function bindRewardsCustomizeSection(mountEl, personOpts, onApply) {
  if (!mountEl.querySelector('.dt-section--page')) return;
  const refire = () => { if (onApply) onApply(); };

  // Tab toggles — enforce at least 1 must stay checked
  mountEl.querySelectorAll('[data-rc-tab]').forEach(input => {
    input.addEventListener('change', async () => {
      const checked = Array.from(mountEl.querySelectorAll('[data-rc-tab]:checked')).map(i => i.dataset.rcTab);
      if (checked.length === 0) {
        input.checked = true;
        return;
      }
      await writeRewardsCustomize(personOpts, { tabs: checked });
      refire();
    });
  });

  // Default Shop sort
  mountEl.querySelectorAll('#dt_rcShopSort [data-sort]').forEach(btn => {
    btn.addEventListener('click', async () => {
      mountEl.querySelectorAll('#dt_rcShopSort [data-sort]').forEach(b => b.classList.remove('dt-theme-btn--active'));
      btn.classList.add('dt-theme-btn--active');
      await writeRewardsCustomize(personOpts, { shopSort: btn.dataset.sort });
      refire();
    });
  });

  // Card density
  mountEl.querySelectorAll('#dt_rcCardDensity [data-density]').forEach(btn => {
    btn.addEventListener('click', async () => {
      mountEl.querySelectorAll('#dt_rcCardDensity [data-density]').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      await writeRewardsCustomize(personOpts, { cardDensity: btn.dataset.density });
      refire();
    });
  });

  // Show-on-card toggles
  mountEl.querySelectorAll('[data-rc-show]').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.rcShow;
      const current = readRewardsCustomize(personOpts).cardShow;
      const cardShow = { ...current, [key]: input.checked };
      await writeRewardsCustomize(personOpts, { cardShow });
      refire();
    });
  });

  // Family banner toggle
  mountEl.querySelector('#dt_rcFamBanner')?.addEventListener('change', async (e) => {
    await writeRewardsCustomize(personOpts, { showFamilyBanner: e.target.checked });
    refire();
  });
}
```

### Step 3: Wire the section into `openDeviceThemeSheet`

Find around line 3121:

```js
${!familyOpts && currentPage === 'kitchen' ? renderKitchenCustomizeSection(personOpts) : ''}
```

ADD a sibling line for rewards:

```js
${!familyOpts && currentPage === 'kitchen' ? renderKitchenCustomizeSection(personOpts) : ''}
${!familyOpts && currentPage === 'rewards' ? renderRewardsCustomizeSection(personOpts) : ''}
```

And around line 3132, find:

```js
if (currentPage === 'kitchen') bindKitchenCustomizeSection(mountEl, personOpts, onApply);
```

ADD:

```js
if (currentPage === 'kitchen') bindKitchenCustomizeSection(mountEl, personOpts, onApply);
if (currentPage === 'rewards') bindRewardsCustomizeSection(mountEl, personOpts, onApply);
```

### Step 4: Update renderRewardCard to accept opts

Find `renderRewardCard` at line 1913. The function signature:

```js
export function renderRewardCard(reward, balance, opts = {}) {
  const { showGet = false, streak = 0, redemptionCount = 0 } = opts;
```

Update to accept the show-toggles + density:

```js
export function renderRewardCard(reward, balance, opts = {}) {
  const {
    showGet = false,
    streak = 0,
    redemptionCount = 0,
    show = {
      approvalLabel: true,
      description: true,
      stockBadge: true,
      streakBadge: true,
      progressBar: true,
    },
    density = 'roomy',
  } = opts;
```

Then update the body to gate each piece on its toggle:

1. **Approval label (badges block)** — gate the instant/approval tag insertion at the start of the badges:
```js
  if (showGet && show.approvalLabel) {
    badges += isInstant ? ... : ...;
  }
```

2. **Streak badge** — gate `if (reward.streakRequirement && show.streakBadge)`:
```js
  if (reward.streakRequirement && show.streakBadge) {
    if (meetsStreak) { ... } else { ... }
  }
```

3. **Stock badges** — gate both the "N left" and the "Out of stock":
```js
  if (reward.maxRedemptions && stockOk && show.stockBadge) {
    badges += `<span class="chip chip--muted">${reward.maxRedemptions - redemptionCount} left</span>`;
  }
  if (!stockOk && show.stockBadge) {
    badges += `<span class="chip chip--muted">Out of stock</span>`;
  }
```

4. **Description** — gate the description line:
```js
${reward.description && show.description ? `<div class="card--reward__desc">${esc(reward.description)}</div>` : ''}
```

5. **Progress bar** — gate the bar:
```js
${show.progressBar ? `<div class="reward-progress"><div class="reward-progress__bar" data-progress="${progress}"></div></div>` : ''}
```

6. **Card density class** — apply on the outer:
```js
const densityClass = density === 'compact' ? ' card--reward--compact' : '';
return `<div class="card card--reward${dimClass}${densityClass}" data-reward-id="${esc(reward.id)}">
```

### Step 5: Bump cache

`v286 → v287`.

### Step 6: Commit

```bash
git add shared/components.js sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): add Customize sheet section for the Rewards page

Mirrors the Kitchen customize pattern. Five preferences:
- Rewards tabs visibility (Shop/Bank/History/Approve; ≥1 must stay)
- Default Shop sort (A-Z / Cost / Closest to affordable)
- Card density (Roomy / Compact)
- Show on reward cards (Approval label, Description, Stock badge,
  Streak badge, Progress bar)
- Family banner show/hide

Prefs persist to person.prefs.customize.rewards in person mode;
falls back to localStorage['dr-customize-rewards'] in device mode.

renderRewardCard now accepts opts.show (per-toggle gates) and
opts.density. Default values match prior behavior — pages that
don't pass opts get the same render as before.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Apply preferences in rewards.js

**Files:**
- `rewards.js` — read prefs, apply to tabs/sort/family-banner/card render
- `styles/rewards.css` — `.card--reward--compact` density variant
- `sw.js` — bump cache v287 → v288

### Step 1: Import the read helper

In `rewards.js`, find the components.js import and ADD `readRewardsCustomize`:

```js
import {
  // ...existing imports...
  readRewardsCustomize,
} from './shared/components.js';
```

### Step 2: Apply tabs filter in `renderTabsHtml`

Find `renderTabsHtml()` around line 230 (post-Pass 2 it currently has `showApprovals` logic + tab array). UPDATE to filter the result against user's tab visibility:

```js
function renderTabsHtml() {
  const showApprovals = !isKidMode && viewerPerson?.role !== 'child';
  const allTabs = [
    { id: 'shop', label: 'Shop' },
    { id: 'bank', label: 'Bank' },
    { id: 'history', label: 'History' },
    ...(showApprovals ? [{ id: 'approvals', label: 'Approve' }] : []),
  ];
  // Apply user's customize visibility filter (keeps at least the active tab)
  const prefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  const visibleTabs = allTabs.filter(t => prefs.tabs.includes(t.id));
  const tabs = visibleTabs.length > 0 ? visibleTabs : allTabs.slice(0, 1);
  return `<div class="tabs tabs--pill rewards-tabs" role="tablist">
    ${tabs.map(t => `<button class="tab${activeTab === t.id ? ' is-active' : ''}" role="tab" aria-selected="${activeTab === t.id}" data-tab="${t.id}" type="button">${t.label}</button>`).join('')}
  </div>`;
}
```

ALSO in `renderActiveTab` (around line 239) the existing fallback already handles `activeTab === 'approvals'` when the role doesn't allow. We need a similar fallback for when the user has hidden the active tab. ADD a guard at the top:

```js
function renderActiveTab() {
  const content = document.getElementById('rewardsContent');
  if (!content) return;
  // Existing role-based approvals guard:
  if (activeTab === 'approvals' && (isKidMode || viewerPerson?.role === 'child')) {
    activeTab = 'shop';
  }
  // New: if the user has hidden the active tab, fall back to the first visible
  const prefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  if (!prefs.tabs.includes(activeTab)) {
    activeTab = prefs.tabs[0] || 'shop';
  }
  // ...rest unchanged...
```

### Step 3: Apply default sort in `renderShopTab`

Find around line 391:

```js
  if (shopFilter.sort === 'cost') {
    visible.sort((a, b) => (a.pointCost || 0) - (b.pointCost || 0));
  } else if (shopFilter.sort === 'closest') {
    ...
  } else {
    visible.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
```

The `shopFilter.sort` defaults to `'cost'` at module level (line 36). UPDATE the initial value at line 36 to read the user's preferred default:

```js
let shopFilter = { type: 'all', sort: 'cost', search: '' };
```

REPLACE with a function-call so prefs are read once on init:

```js
let shopFilter = { type: 'all', sort: 'cost', search: '' };
// Apply user's preferred default sort. Done after viewerPerson is set in loadData,
// so this assignment runs in init() after loadData(). See applyShopSortDefault().
```

Actually simpler: just have shopFilter initialize as `cost` (current default) and override in init() after loadData. ADD in `init()` after `loadData()`:

```js
  // Apply user's preferred default Shop sort
  const customPrefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  shopFilter.sort = customPrefs.shopSort;
```

(Place it near the other post-loadData setup before render().)

### Step 4: Apply family-banner show/hide

Find `renderFamilyBanner` (added in Pass 2). Update the early-return condition to include the user pref:

```js
function renderFamilyBanner() {
  const prefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  if (!prefs.showFamilyBanner) return '';
  if (isKidMode || people.length < 2 || viewerPerson?.role === 'child') return '';
  // ...rest unchanged...
```

### Step 5: Apply card render opts in renderShopTab

Find around line 405-409 (the renderRewardCard call):

```js
    html += visible.map(r => renderRewardCard(r, balance, {
      showGet: true,
      streak: personStreak,
      redemptionCount: redemptionCountByReward[r.id] || 0,
    })).join('');
```

UPDATE to pass `show` and `density`:

```js
    const cardPrefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
    html += visible.map(r => renderRewardCard(r, balance, {
      showGet: true,
      streak: personStreak,
      redemptionCount: redemptionCountByReward[r.id] || 0,
      show: cardPrefs.cardShow,
      density: cardPrefs.cardDensity,
    })).join('');
```

### Step 6: CSS for compact density

In `styles/rewards.css`, append:

```css
/* ── Compact reward card density (Customize → Card density) ── */
.card--reward--compact {
  padding: var(--spacing-xs) var(--spacing-sm);
  gap: var(--spacing-sm);
}

.card--reward--compact .icon-tile {
  font-size: 1.5rem;
}

.card--reward--compact .card--reward__desc {
  display: none; /* Compact hides description regardless of toggle */
}

.card--reward--compact .reward-progress {
  height: 2px;
}
```

### Step 7: Bump cache + commit

`v287 → v288`.

```bash
git add rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): apply Customize prefs across the Rewards page

- Tab visibility filter applied in renderTabsHtml + renderActiveTab
  fallback when active tab is hidden
- Default Shop sort applied in init() after loadData
- Family banner respects showFamilyBanner pref
- renderRewardCard call passes show toggles + density to the
  shared component
- New .card--reward--compact CSS for the density variant (smaller
  padding, smaller icon, no description, thinner progress bar)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

1. **Spec coverage:** All 5 prefs (tabs, shopSort, density, family banner, cardShow toggles) get a sheet UI AND get applied to rendering. ✓
2. **Backward compat:** `renderRewardCard` defaults match existing behavior — pages that don't pass `opts` get the same render as before. ✓
3. **Persistence:** Person mode → Firebase `person.prefs.customize.rewards`. Device mode → localStorage. Matches kitchen pattern. ✓
4. **Cache bumps:** 2 sequential (v286 → v288).
