import { initFirebase, readSettings, readPeople, readRewards, readAllMessages,
  readAllBalanceAnchors, readAllSnapshots, readBank, readMultipliers,
  writeFyiMessage, writeMessage, markMessageSeen, writeBankToken,
  markBankTokenUsed, removeBankToken, onConnectionChange, pushReward,
  onAllMessages, removeMessage, writeMultiplier
} from './shared/firebase.js';
import { applyTheme, resolveTheme } from './shared/theme.js';
import { calculateBalance } from './shared/scoring.js';
import { renderNavBar, initNavMore, renderHeader, initBell, initOfflineBanner,
  showConfirm, showToast, renderBottomSheet, applyDataColors,
  renderRewardCard, renderBankToken as renderBankTokenEl, renderHistoryRow, renderApprovalRow,
  openDeviceThemeSheet, renderOverflowMenu
} from './shared/components.js';
import { todayKey } from './shared/utils.js';

await initFirebase();
applyTheme(resolveTheme());

// ── URL param detection ──
const params = new URLSearchParams(location.search);
const kidName = params.get('kid');
const personParam = params.get('person');
const tabParam = params.get('tab');

const isKidMode = !!kidName;

// ── State ──
let settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers;
let people = [];
let activePerson = null;
let activeTab = tabParam || 'shop';
let shopFilter = { type: 'all', sort: 'name', search: '' };
let historyFilter = { type: 'all' };

async function loadData() {
  [settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers] = await Promise.all([
    readSettings(), readPeople(), readRewards(),
    readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers()
  ]);
  people = Object.entries(peopleObj || {}).map(([id, p]) => ({ id, ...p }));

  if (isKidMode) {
    activePerson = people.find(p => p.name === kidName) || people[0];
  } else if (personParam) {
    activePerson = people.find(p => p.name === personParam) || people.find(p => p.role !== 'child') || people[0];
  } else {
    activePerson = people.find(p => p.role !== 'child') || people[0];
  }
}

async function init() {
  await loadData();
  applyTheme(resolveTheme(settings?.theme));

  if (!isKidMode) {
    document.getElementById('headerMount').innerHTML = renderHeader({
      title: 'Rewards',
      showBell: true,
      overflowItems: [{ id: 'admin', label: 'Admin' }, { id: 'theme', label: 'Theme' }]
    });
    // Add person switcher chip slot into the header actions area
    document.querySelector('.app-header__actions')?.insertAdjacentHTML(
      'afterbegin',
      '<div id="personChipMount"></div>'
    );
    document.getElementById('navMount').innerHTML = renderNavBar('rewards');
    document.getElementById('fabMount').innerHTML = renderFab();
    initBell(() => people, () => rewardsObj || {}, onAllMessages, {
      writeMessageFn: writeMessage,
      markMessageSeenFn: markMessageSeen,
      removeMessageFn: removeMessage,
      writeBankTokenFn: writeBankToken,
      markBankTokenUsedFn: markBankTokenUsed,
      readBankFn: readBank,
      writeMultiplierFn: writeMultiplier,
      getTodayFn: () => todayKey(settings?.timezone),
    });
    initNavMore(document.getElementById('sheetMount'), () => theme);
    initOfflineBanner(onConnectionChange);
  } else {
    document.getElementById('headerMount').innerHTML = renderKidHeader();
  }

  render();
  bindPage();
}

function renderFab() {
  return `<button class="fab" id="rewardsFab" type="button" aria-label="Create reward">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  </button>`;
}

function renderKidHeader() {
  return `<header class="app-header">
    <button class="btn btn--ghost btn--sm" id="kidBackBtn" type="button">&#8592; Back</button>
    <h1 class="app-header__title">${esc(activePerson?.name || '')}'s Rewards</h1>
  </header>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const ADULT_HISTORY_TYPES = new Set([
  'bonus','deduction','redemption-request','redemption-approved','redemption-denied',
  'use-request','use-approved','use-denied','task-skip-used','penalty-removed','reward-used','fyi'
]);
const KID_HISTORY_TYPES = new Set([
  'redemption-request','redemption-approved','redemption-denied',
  'use-request','use-approved','use-denied','reward-used','task-skip-used','penalty-removed','fyi'
]);

function matchesHistoryGroup(type, group) {
  if (group === 'all') return true;
  if (group === 'purchases') return ['redemption-request','redemption-approved','redemption-denied','fyi'].includes(type);
  if (group === 'uses') return ['use-request','use-approved','use-denied','reward-used','task-skip-used','penalty-removed'].includes(type);
  if (group === 'bonuses') return type === 'bonus';
  if (group === 'deductions') return type === 'deduction';
  return false;
}

function render() {
  document.getElementById('app').innerHTML =
    renderBalanceZone() +
    renderApprovalsBanner() +
    renderTabsHtml() +
    `<div id="rewardsContent"></div>`;
  renderActiveTab();
  bindTabs();
  if (!isKidMode) {
    const chipMount = document.getElementById('personChipMount');
    if (chipMount) chipMount.innerHTML = renderPersonSwitcherChip();
  }
}

function renderPersonSwitcherChip() {
  if (!activePerson || people.length <= 1) return '';
  return `<button class="chip chip--person" id="personSwitcherChip" type="button" aria-label="Switch person">
    <span class="chip__dot" style="background:${esc(activePerson.color)}"></span>
    ${esc(activePerson.name)}
  </button>`;
}

function openPersonSwitcherSheet() {
  const mount = document.getElementById('sheetMount');
  const rows = people.map(p => `
    <button class="list-row" type="button" data-person-id="${esc(p.id)}">
      <div class="avatar avatar--sm" style="--person-color:${esc(p.color)}">${esc((p.name || '?')[0].toUpperCase())}</div>
      <span class="list-row__label">${esc(p.name)}</span>
      ${activePerson?.id === p.id ? '<span class="badge badge--accent">Viewing</span>' : ''}
    </button>`).join('');
  mount.innerHTML = renderBottomSheet(`
    <h3 class="sheet-section-title">View Rewards for</h3>
    <div class="list-group">${rows}</div>
  `);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });
  mount.querySelectorAll('[data-person-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      activePerson = people.find(p => p.id === btn.dataset.personId) || activePerson;
      mount.innerHTML = '';
      render();
    });
  });
}

function getBalance(personId) {
  const msgs = allMessages?.[personId] || {};
  const anchor = allAnchors?.[personId] || null;
  const tz = settings?.timezone || 'UTC';
  const result = calculateBalance(personId, allSnapshots, msgs, anchor, allMultipliers, tz);
  return Math.round(result?.balance ?? result ?? 0);
}

function renderTrendLine(personId) {
  const tz = settings?.timezone || 'UTC';
  const today = todayKey(tz);
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(new Date(today + 'T00:00:00').getTime() - i * 86400000)
      .toLocaleDateString('en-CA', { timeZone: tz });
    const snap = allSnapshots?.[d]?.[personId];
    days.push(snap ? (snap.earned || 0) : 0);
  }
  const max = Math.max(...days, 1);
  const W = 80, H = 24;
  const pts = days.map((v, i) => {
    const x = Math.round((i / (days.length - 1)) * W);
    const y = Math.round(H - (v / max) * H);
    return `${x},${y}`;
  }).join(' ');
  return `<svg class="rewards-trend" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderBalanceZone() {
  if (!activePerson) return '';
  const balance = getBalance(activePerson.id);
  return `<div class="rewards-balance-zone">
    <div class="avatar" style="--person-color:${esc(activePerson.color)}">${esc(activePerson.name[0].toUpperCase())}</div>
    <div class="rewards-balance__info">
      <div class="rewards-balance__name">${esc(activePerson.name)}</div>
      <div class="rewards-balance__amount">${balance.toLocaleString()}<span class="rewards-balance__unit">pts</span></div>
    </div>
    ${renderTrendLine(activePerson.id)}
  </div>`;
}

function renderApprovalsBanner() {
  if (isKidMode) return '';
  let count = 0;
  for (const msgs of Object.values(allMessages || {})) {
    for (const m of Object.values(msgs || {})) {
      if ((m.type === 'redemption-request' || m.type === 'use-request') && m.seen === false) count++;
    }
  }
  if (count === 0) return '';
  return `<div class="rewards-approval-banner">
    <div class="banner banner--warning">
      ${count} reward${count > 1 ? 's' : ''} waiting for approval
      <button class="btn btn--ghost btn--sm" id="bannerReviewBtn" type="button">Review</button>
    </div>
  </div>`;
}

function renderTabsHtml() {
  const tabs = isKidMode
    ? [{ id: 'shop', label: 'Shop' }, { id: 'bank', label: 'Bank' }, { id: 'history', label: 'History' }]
    : [{ id: 'shop', label: 'Shop' }, { id: 'bank', label: 'Bank' }, { id: 'history', label: 'History' }, { id: 'approvals', label: 'Approvals' }];
  return `<div class="tabs tabs--segmented" role="tablist">
    ${tabs.map(t => `<button class="tab${activeTab === t.id ? ' is-active' : ''}" role="tab" aria-selected="${activeTab === t.id}" data-tab="${t.id}" type="button">${t.label}</button>`).join('')}
  </div>`;
}

function renderActiveTab() {
  const content = document.getElementById('rewardsContent');
  if (!content) return;
  if (activeTab === 'shop')           content.innerHTML = renderShopTab();
  else if (activeTab === 'bank')      { content.innerHTML = '<div class="empty-state"><p>Loading…</p></div>'; loadAndRenderBankTab(); }
  else if (activeTab === 'history')   { content.innerHTML = renderHistoryTab(); }
  else if (activeTab === 'approvals') content.innerHTML = renderApprovalsTab();
  applyDataColors(content);
  bindActiveTab();
}

function bindActiveTab() {
  if (activeTab === 'shop') bindShopTab();
  else if (activeTab === 'bank') {} // binding done inside loadAndRenderBankTab
  else if (activeTab === 'history') bindHistoryTab();
  else if (activeTab === 'approvals') bindApprovalsTab();
}

function renderFilterSortChip(id, activeCount) {
  const label = activeCount > 0 ? `Filter & Sort · ${activeCount}` : 'Filter & Sort';
  const extraCls = activeCount > 0 ? ' chip--active' : '';
  return `<button class="chip${extraCls}" id="${id}" type="button">${label} &#9662;</button>`;
}

function getShopFilterCount() {
  let n = 0;
  if (shopFilter.type !== 'all') n++;
  if (shopFilter.sort !== 'name') n++;
  return n;
}

function renderShopTab() {
  if (!activePerson) return '<div class="empty-state"><p>No person selected.</p></div>';
  const balance = getBalance(activePerson.id);

  let visible = Object.entries(rewardsObj || {}).filter(([id, r]) => {
    if (r.status !== 'active') return false;
    if (r.expiresAt && Date.now() > r.expiresAt) return false;
    if (Array.isArray(r.perPerson) && !r.perPerson.includes(activePerson.id)) return false;
    if (shopFilter.type !== 'all') {
      if (shopFilter.type === 'custom' && r.rewardType !== 'custom') return false;
      if (shopFilter.type === 'functional' && r.rewardType !== 'task-skip' && r.rewardType !== 'penalty-removal') return false;
      if (shopFilter.type === 'bounties' && !r.bounty) return false;
    }
    if (shopFilter.search) {
      if (!(r.name || '').toLowerCase().includes(shopFilter.search.toLowerCase())) return false;
    }
    return true;
  }).map(([id, r]) => ({ id, ...r }));

  if (shopFilter.sort === 'cost') visible.sort((a, b) => (a.pointCost || 0) - (b.pointCost || 0));
  else visible.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  let html = `<div class="rewards-filter-bar">
    <input type="search" class="form-input rewards-search" id="shopSearch" placeholder="Search rewards…" value="${esc(shopFilter.search)}">
    ${renderFilterSortChip('shopFilterBtn', getShopFilterCount())}
  </div>`;

  if (visible.length === 0) {
    html += `<div class="empty-state"><p>No rewards available for you yet.</p></div>`;
  } else {
    html += visible.map(r => renderRewardCard(r, balance, { showGet: true })).join('');
  }
  return html;
}

function bindShopTab() {
  document.getElementById('shopSearch')?.addEventListener('input', e => {
    shopFilter.search = e.target.value;
    const content = document.getElementById('rewardsContent');
    if (content) { content.innerHTML = renderShopTab(); applyDataColors(content); bindShopTab(); }
    document.getElementById('shopSearch')?.focus();
  });
  document.getElementById('shopFilterBtn')?.addEventListener('click', openShopFilterSheet);
  document.querySelectorAll('.reward-get-btn').forEach(btn => {
    btn.addEventListener('click', () => handleGetReward(btn.dataset.rewardId));
  });
}

function openShopFilterSheet() {
  const mount = document.getElementById('sheetMount');
  const typeOpts = [
    { v: 'all', l: 'All Types' }, { v: 'custom', l: 'Custom' },
    { v: 'functional', l: 'Functional' }, { v: 'bounties', l: 'Bounties' }
  ];
  const sortOpts = [{ v: 'name', l: 'Name' }, { v: 'cost', l: 'Cost' }];
  const html = `<div id="shopFilterSheet">
    <div class="filter-section"><div class="filter-section__label">Type</div>
      <div class="filter-chips">
        ${typeOpts.map(o => `<button class="chip${shopFilter.type === o.v ? ' chip--active' : ''}" data-filter-type="${o.v}" type="button">${o.l}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section"><div class="filter-section__label">Sort by</div>
      <div class="filter-chips">
        ${sortOpts.map(o => `<button class="chip${shopFilter.sort === o.v ? ' chip--active' : ''}" data-filter-sort="${o.v}" type="button">${o.l}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn--primary btn--full" id="shopFilterApply" type="button">Apply</button>
  </div>`;
  mount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });
  mount.querySelectorAll('[data-filter-type]').forEach(b =>
    b.addEventListener('click', () => { mount.querySelectorAll('[data-filter-type]').forEach(x => x.classList.remove('chip--active')); b.classList.add('chip--active'); }));
  mount.querySelectorAll('[data-filter-sort]').forEach(b =>
    b.addEventListener('click', () => { mount.querySelectorAll('[data-filter-sort]').forEach(x => x.classList.remove('chip--active')); b.classList.add('chip--active'); }));
  mount.querySelector('#shopFilterApply')?.addEventListener('click', () => {
    shopFilter.type = mount.querySelector('[data-filter-type].chip--active')?.dataset.filterType || 'all';
    shopFilter.sort = mount.querySelector('[data-filter-sort].chip--active')?.dataset.filterSort || 'name';
    mount.innerHTML = '';
    const content = document.getElementById('rewardsContent');
    if (content) { content.innerHTML = renderShopTab(); applyDataColors(content); bindShopTab(); }
  });
}

// ── History tab ──

function renderHistoryTab() {
  if (!activePerson) return '<div class="empty-state"><p>No person selected.</p></div>';
  const tz = settings?.timezone || 'UTC';
  const allowedTypes = isKidMode ? KID_HISTORY_TYPES : ADULT_HISTORY_TYPES;

  const raw = allMessages?.[activePerson.id] || {};
  let entries = Object.values(raw)
    .filter(msg => allowedTypes.has(msg.type) && matchesHistoryGroup(msg.type, historyFilter.type))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const filterActiveCount = historyFilter.type !== 'all' ? 1 : 0;

  let html = `<div class="rewards-filter-bar">
    ${renderFilterSortChip('historyFilterBtn', filterActiveCount)}
  </div>`;

  if (entries.length === 0) {
    html += '<div class="empty-state"><p>No history yet.</p></div>';
    return html;
  }

  const PAGE = 50;
  const visible = entries.slice(0, PAGE);
  const remaining = entries.slice(PAGE);

  html += visible.map(msg => renderHistoryRow(msg, tz)).join('');

  if (remaining.length > 0) {
    html += `<button class="rewards-show-more" id="historyShowMore" type="button">+ ${remaining.length} more</button>`;
  }

  return html;
}

function bindHistoryTab() {
  document.getElementById('historyFilterBtn')?.addEventListener('click', openHistoryFilterSheet);
  document.getElementById('historyShowMore')?.addEventListener('click', function() {
    const tz = settings?.timezone || 'UTC';
    const allowedTypes = isKidMode ? KID_HISTORY_TYPES : ADULT_HISTORY_TYPES;
    const raw = allMessages?.[activePerson.id] || {};
    const entries = Object.values(raw)
      .filter(msg => allowedTypes.has(msg.type) && matchesHistoryGroup(msg.type, historyFilter.type))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const remaining = entries.slice(50);
    const content = document.getElementById('rewardsContent');
    if (!content) return;
    // Append remaining rows before removing the button
    const fragment = document.createElement('div');
    fragment.innerHTML = remaining.map(msg => renderHistoryRow(msg, tz)).join('');
    while (fragment.firstChild) {
      this.before(fragment.firstChild);
    }
    this.remove();
  });
}

function openHistoryFilterSheet() {
  const mount = document.getElementById('sheetMount');
  const adultOpts = [
    { v: 'all', l: 'All' }, { v: 'purchases', l: 'Purchases' },
    { v: 'uses', l: 'Uses' }, { v: 'bonuses', l: 'Bonuses' }, { v: 'deductions', l: 'Deductions' }
  ];
  const kidOpts = [
    { v: 'all', l: 'All' }, { v: 'purchases', l: 'Purchases' }, { v: 'uses', l: 'Uses' }
  ];
  const opts = isKidMode ? kidOpts : adultOpts;
  const html = `<div id="historyFilterSheet">
    <div class="filter-section"><div class="filter-section__label">Type</div>
      <div class="filter-chips">
        ${opts.map(o => `<button class="chip${historyFilter.type === o.v ? ' chip--active' : ''}" data-history-filter-type="${o.v}" type="button">${o.l}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn--primary btn--full" id="historyFilterApply" type="button">Apply</button>
  </div>`;
  mount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });
  mount.querySelectorAll('[data-history-filter-type]').forEach(b =>
    b.addEventListener('click', () => {
      mount.querySelectorAll('[data-history-filter-type]').forEach(x => x.classList.remove('chip--active'));
      b.classList.add('chip--active');
    }));
  mount.querySelector('#historyFilterApply')?.addEventListener('click', () => {
    historyFilter.type = mount.querySelector('[data-history-filter-type].chip--active')?.dataset.historyFilterType || 'all';
    mount.innerHTML = '';
    const content = document.getElementById('rewardsContent');
    if (content) { content.innerHTML = renderHistoryTab(); bindHistoryTab(); }
  });
}

// ── Approvals tab ──

function renderApprovalsTab() {
  // Build pending list: all people, redemption-request + use-request, seen === false
  const pendingItems = [];
  for (const [personId, msgs] of Object.entries(allMessages || {})) {
    for (const [msgId, msg] of Object.entries(msgs || {})) {
      if ((msg.type === 'redemption-request' || msg.type === 'use-request') && msg.seen === false) {
        pendingItems.push({ msgId, msg, personId });
      }
    }
  }
  pendingItems.sort((a, b) => (b.msg.createdAt || 0) - (a.msg.createdAt || 0));

  // Build recent resolved list: approved/denied types, last 30 days
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const resolvedTypes = ['redemption-approved', 'redemption-denied', 'use-approved', 'use-denied'];
  const recentItems = [];
  for (const [personId, msgs] of Object.entries(allMessages || {})) {
    for (const [, msg] of Object.entries(msgs || {})) {
      if (resolvedTypes.includes(msg.type) && Date.now() - (msg.createdAt || 0) < THIRTY_DAYS) {
        recentItems.push({ msg, personId });
      }
    }
  }
  recentItems.sort((a, b) => (b.msg.createdAt || 0) - (a.msg.createdAt || 0));

  const tz = settings?.timezone || 'UTC';

  // Render pending section
  let html = `<div class="rewards-section-heading">Pending</div>`;
  if (pendingItems.length === 0) {
    html += `<div class="empty-state"><p>No pending approvals.</p></div>`;
  } else {
    html += pendingItems.map(({ msgId, msg, personId }) => {
      const person = people.find(p => p.id === personId) || null;
      const reward = rewardsObj?.[msg.rewardId] || null;
      return renderApprovalRow(msgId, msg, person, reward);
    }).join('');
  }

  // Render recent section (only if there are recent items)
  if (recentItems.length > 0) {
    html += `<div class="rewards-section-heading">Recent</div>
      <button class="rewards-show-more" id="approvalsRecentToggle" type="button" data-count="${recentItems.length}">Show ${recentItems.length} recent</button>
      <div id="approvalsRecentList" hidden>
        ${recentItems.map(({ msg }) => renderHistoryRow(msg, tz)).join('')}
      </div>`;
  }

  return html;
}

function bindApprovalsTab() {
  document.getElementById('approvalsRecentToggle')?.addEventListener('click', function() {
    const list = document.getElementById('approvalsRecentList');
    if (list) {
      list.hidden = !list.hidden;
      const count = Number(this.dataset.count);
      this.textContent = list.hidden ? `Show ${count} recent` : 'Hide recent';
    }
  });

  document.querySelectorAll('.approval-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.approval-row');
      const msgId = row?.dataset.msgId || '';
      const personId = row?.dataset.personId || '';
      const rewardId = row?.dataset.rewardId || '';
      const intent = row?.dataset.intent || '';
      handleApprove(msgId, personId, rewardId, intent);
    });
  });

  document.querySelectorAll('.approval-deny-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.approval-row');
      const msgId = row?.dataset.msgId || '';
      const personId = row?.dataset.personId || '';
      handleDeny(msgId, personId);
    });
  });
}

async function handleApprove(msgId, personId, rewardId, intent) {
  const msg = allMessages?.[personId]?.[msgId];
  const reward = rewardsObj?.[rewardId] || {};
  const ts = firebase.database.ServerValue.TIMESTAMP;

  if (msg?.type === 'use-request') {
    if (!msg.bankTokenId) { showToast('Cannot approve: missing bank token reference.'); return; }
    await markBankTokenUsed(personId, msg.bankTokenId, null);
    await writeMessage(personId, {
      type: 'use-approved',
      title: msg.title,
      body: null,
      amount: 0,
      seen: false,
      createdAt: ts,
      createdBy: 'parent'
    });
    await markMessageSeen(personId, msgId);
    showToast('Approved!');
  } else if (msg?.type === 'redemption-request' && intent === 'use-now') {
    // Immediately consumed — no bank token
    await writeMessage(personId, {
      type: 'redemption-approved',
      title: msg.title || reward.name || '',
      body: null,
      amount: 0,
      seen: false,
      createdAt: ts,
      createdBy: 'parent',
      rewardId,
      rewardName: reward.name || '',
      rewardIcon: reward.icon || ''
    });
    await writeMessage(personId, {
      type: 'reward-used',
      title: 'Used: ' + (reward.name || msg.title || ''),
      body: null,
      amount: 0,
      seen: true,
      createdAt: ts,
      createdBy: 'parent'
    });
    await markMessageSeen(personId, msgId);
    showToast('Approved and used!');
  } else if (msg?.type === 'redemption-request') {
    // intent === 'save' — bank the token
    await writeBankToken(personId, {
      rewardType: reward.rewardType || 'custom',
      rewardId,
      rewardName: reward.name || msg.title || '',
      rewardIcon: reward.icon || '',
      acquiredAt: ts,
      used: false
    });
    await writeMessage(personId, {
      type: 'redemption-approved',
      title: msg.title || reward.name || '',
      body: null,
      amount: 0,
      seen: false,
      createdAt: ts,
      createdBy: 'parent',
      rewardId,
      rewardName: reward.name || '',
      rewardIcon: reward.icon || ''
    });
    await markMessageSeen(personId, msgId);
    showToast('Approved!');
  }

  await refreshData();
  renderActiveTab();
}

async function handleDeny(msgId, personId) {
  const msg = allMessages?.[personId]?.[msgId];
  const confirmed = await showConfirm({
    title: 'Deny this request?',
    message: msg?.title || 'Reward request'
  });
  if (!confirmed) return;

  const deniedType = msg?.type === 'use-request' ? 'use-denied' : 'redemption-denied';
  await writeMessage(personId, {
    type: deniedType,
    title: msg?.title || 'Request denied',
    body: null,
    amount: 0,
    seen: false,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    createdBy: 'parent'
  });
  // Refund points when a buy request is denied (use-request denials have no cost to refund)
  if (msg?.type === 'redemption-request' && Math.abs(msg?.amount || 0) > 0) {
    await writeMessage(personId, {
      type: 'bonus',
      title: `Refund: ${msg.rewardName || 'Reward'}`,
      body: null,
      amount: Math.abs(msg.amount),
      seen: true,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'parent'
    });
  }
  await markMessageSeen(personId, msgId);
  showToast('Request denied.');
  await refreshData();
  renderActiveTab();
}

// ── Bank tab ──

function renderBankTab() {
  return '<div class="empty-state"><p>Loading…</p></div>';
}

async function loadAndRenderBankTab() {
  const content = document.getElementById('rewardsContent');
  if (!content) return;
  const personBank = (await readBank(activePerson.id)) || {};
  const isAdult = activePerson.role !== 'child';

  const activeTokens = Object.entries(personBank).filter(([, t]) => !t.used);
  const usedTokens = Object.entries(personBank).filter(([, t]) => t.used)
    .sort((a, b) => (b[1].usedAt || 0) - (a[1].usedAt || 0));

  let html = '';
  if (activeTokens.length === 0 && usedTokens.length === 0) {
    html += '<div class="empty-state"><p>No saved rewards yet.</p></div>';
  } else {
    activeTokens.forEach(([tokenId, token]) => {
      const reward = rewardsObj?.[token.rewardId] || {};
      html += renderBankTokenEl(tokenId, token, {
        showUse: true,
        isAdult,
        approvalRequired: reward.approvalRequired !== false
      });
    });

    if (usedTokens.length > 0) {
      html += `<button class="rewards-show-more" id="bankUsedToggle" type="button">Show ${usedTokens.length} used</button>
        <div id="bankUsedList" hidden>`;
      usedTokens.forEach(([tokenId, token]) => {
        html += renderBankTokenEl(tokenId, token, { showUse: false });
      });
      html += '</div>';
    }
  }

  if (content) content.innerHTML = html;
  bindBankTabContent(personBank, isAdult);
}

function bindBankTabContent(personBank, isAdult) {
  document.getElementById('bankUsedToggle')?.addEventListener('click', function() {
    const list = document.getElementById('bankUsedList');
    if (list) {
      list.hidden = !list.hidden;
      const usedCount = Object.values(personBank).filter(t => t.used).length;
      this.textContent = list.hidden ? `Show ${usedCount} used` : 'Hide used';
    }
  });

  document.querySelectorAll('.bank-use-btn').forEach(btn => {
    btn.addEventListener('click', () => handleUseToken(
      btn.dataset.tokenId,
      btn.dataset.rewardType,
      btn.dataset.tokenName,
      btn.dataset.rewardId,
      btn.dataset.rewardIcon,
      btn.dataset.canInstant === 'true'
    ));
  });
}

async function handleUseToken(tokenId, rewardType, tokenName, rewardId, rewardIcon, canInstant) {
  if (rewardType === 'task-skip') {
    showToast('Task Skip: open the dashboard to skip a task from your Bank.');
    return;
  }
  if (rewardType === 'penalty-removal') {
    showToast('Penalty Removal: open a task completion to apply this.');
    return;
  }
  if (canInstant) {
    if (!await showConfirm({ title: `Use ${tokenName}?` })) return;
    await markBankTokenUsed(activePerson.id, tokenId, null);
    await writeMessage(activePerson.id, {
      type: 'reward-used',
      title: `Used: ${tokenName}`,
      body: null,
      amount: 0,
      rewardId: rewardId || null,
      seen: true,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: 'self'
    });
    showToast(`Used ${tokenName}!`);
    await refreshData();
    render();
  } else {
    if (!await showConfirm({ title: `Request to use ${tokenName}?`, message: 'Your parent will get a notification to approve.' })) return;
    await writeMessage(activePerson.id, {
      type: 'use-request',
      title: tokenName,
      body: null,
      amount: 0,
      rewardId: rewardId || null,
      bankTokenId: tokenId,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: activePerson.id
    });
    showToast('Requested! Waiting for approval…');
  }
}

async function handleGetReward(rewardId) {
  const reward = rewardsObj?.[rewardId];
  if (!reward) return;

  const balance = getBalance(activePerson.id);
  if (balance < (reward.pointCost || 0)) {
    showToast('Not enough points.');
    return;
  }

  const ts = firebase.database.ServerValue.TIMESTAMP;
  const isAdult = activePerson.role !== 'child';

  if (isAdult) {
    // Adult path — confirm then bank immediately (no approval needed)
    const confirmed = await showConfirm({ title: 'Add to your Bank?', message: reward.name });
    if (!confirmed) return;
    // Write a seen redemption-request so calculateBalance deducts the cost
    await writeMessage(activePerson.id, {
      type: 'redemption-request',
      title: reward.name,
      body: null,
      amount: -(reward.pointCost || 0),
      rewardId,
      rewardName: reward.name,
      rewardIcon: reward.icon || '',
      intent: 'save',
      seen: true,
      createdAt: ts,
      createdBy: activePerson.id
    });
    await writeBankToken(activePerson.id, {
      rewardType: reward.rewardType || 'custom',
      rewardId,
      rewardName: reward.name || '',
      rewardIcon: reward.icon || '',
      acquiredAt: ts,
      used: false
    });
    showToast('Added to Bank!');
    await refreshData();
    render();
    return;
  }

  if (reward.approvalRequired === false) {
    // Path 1 — self-serve (only when explicitly set false; undefined defaults to approval-required)
    // Write a seen redemption-request so calculateBalance deducts the cost
    await writeMessage(activePerson.id, {
      type: 'redemption-request',
      title: reward.name,
      body: null,
      amount: -(reward.pointCost || 0),
      rewardId,
      rewardName: reward.name,
      rewardIcon: reward.icon || '',
      intent: 'save',
      seen: true,
      createdAt: ts,
      createdBy: activePerson.id
    });
    await writeBankToken(activePerson.id, {
      rewardType: reward.rewardType || 'custom',
      rewardId,
      rewardName: reward.name || '',
      rewardIcon: reward.icon || '',
      acquiredAt: ts,
      used: false
    });
    // Notify all parents
    const parents = people.filter(p => p.role !== 'child');
    for (const parent of parents) {
      await writeFyiMessage(parent.id, activePerson.name, reward.name, reward.pointCost || 0, rewardId, activePerson.id);
    }
    showToast('Saved to your Bank!');
    await refreshData();
    render();
    return;
  }

  const isFunctional = reward.rewardType === 'task-skip' || reward.rewardType === 'penalty-removal';
  if (isFunctional) {
    // Path 3 — functional with approval: auto-send as save, no intent sheet
    await writeMessage(activePerson.id, {
      type: 'redemption-request',
      title: reward.name,
      body: null,
      amount: -(reward.pointCost || 0),
      rewardId,
      rewardName: reward.name,
      rewardIcon: reward.icon || '',
      intent: 'save',
      seen: false,
      createdAt: ts,
      createdBy: activePerson.id
    });
    showToast('Request sent! Waiting for approval…');
    await refreshData();
    renderActiveTab();
    return;
  }

  // Path 2 — custom with approval: show intent sheet
  openIntentSheet(reward, rewardId);
}

function openIntentSheet(reward, rewardId) {
  const mount = document.getElementById('sheetMount');
  const html = `<div id="intentSheet">
    <div class="sheet-icon">${esc(reward.icon || '🎁')}</div>
    <div class="sheet-title">${esc(reward.name)}</div>
    <p class="text-muted">Your parent will approve before it’s used.</p>
    <button class="btn btn--primary btn--full" id="intentUseNow" type="button">Use Now</button>
    <button class="btn btn--secondary btn--full" id="intentSave" type="button">Save for Later</button>
    <button class="btn btn--ghost btn--full" id="intentCancel" type="button">Cancel</button>
  </div>`;
  mount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  let submitting = false;

  async function sendRequest(intent) {
    if (submitting) return;
    submitting = true;
    mount.innerHTML = '';
    await writeMessage(activePerson.id, {
      type: 'redemption-request',
      title: reward.name,
      body: null,
      amount: -(reward.pointCost || 0),
      rewardId,
      rewardName: reward.name,
      rewardIcon: reward.icon || '',
      intent,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: activePerson.id
    });
    showToast('Request sent! Waiting for approval…');
    await refreshData();
    renderActiveTab();
  }

  document.getElementById('intentUseNow')?.addEventListener('click', () => sendRequest('use-now'));
  document.getElementById('intentSave')?.addEventListener('click', () => sendRequest('save'));
  document.getElementById('intentCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
}

function bindTabs() {
  document.querySelectorAll('.tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tabs .tab').forEach(b => {
        b.classList.toggle('is-active', b.dataset.tab === activeTab);
        b.setAttribute('aria-selected', b.dataset.tab === activeTab);
      });
      renderActiveTab();
    });
  });
}

function bindPage() {
  document.getElementById('kidBackBtn')?.addEventListener('click', () => {
    location.href = `kid.html?kid=${encodeURIComponent(kidName)}`;
  });
  document.getElementById('rewardsFab')?.addEventListener('click', () => openRewardCreateForm());
  document.addEventListener('click', e => {
    if (e.target.id === 'bannerReviewBtn') { activeTab = 'approvals'; render(); }
    if (e.target.closest('#personSwitcherChip')) openPersonSwitcherSheet();
    if (e.target.closest('#headerOverflow')) openHeaderOverflowSheet();
  });
}

function openHeaderOverflowSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(
    `<h3 class="sheet-section-title">More</h3>${renderOverflowMenu([
      { id: 'admin', label: 'Admin' },
      { id: 'theme', label: 'Theme' }
    ])}`
  );
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });
  mount.querySelector('.overflow-menu')?.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-item-id]');
    if (!btn) return;
    mount.innerHTML = '';
    if (btn.dataset.itemId === 'admin') {
      location.href = 'admin.html';
    } else if (btn.dataset.itemId === 'theme') {
      openDeviceThemeSheet(
        document.getElementById('sheetMount'),
        settings?.theme,
        () => render()
      );
    }
  });
}

const REWARD_EMOJIS = ['🍕','🎮','🍦','⭐','🎬','📱','🛹','🧁','🎯','🏆','🎪','🏊','🎨','🎵','🛍️','🧸'];

const PRICING_AVERAGES = [
  { label: 'A (95%)', value: 95 },
  { label: 'B+ (88%)', value: 88 },
  { label: 'B (85%)', value: 85 },
  { label: 'C+ (78%)', value: 78 },
  { label: 'C (75%)', value: 75 }
];

function openRewardCreateForm() {
  const mount = document.getElementById('sheetMount');
  const html = `<div id="rewardCreateForm" class="form-compact">
    <div class="sheet-title">Create Reward</div>

    <div class="form-group">
      <label class="form-label" for="rcf_name">Name</label>
      <input class="form-input" type="text" id="rcf_name" placeholder="Reward name" autocomplete="off">
    </div>

    <div class="form-group">
      <label class="form-label">Emoji</label>
      <div class="emoji-picker" id="rcf_emojiPicker">
        ${REWARD_EMOJIS.map(e => `<button type="button" class="emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
        <input type="text" id="rcf_customEmoji" class="form-input form-input--sm" placeholder="✏️" maxlength="2">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Type</label>
      <div class="segmented-control" id="rcf_typeChips">
        <button class="segmented-btn segmented-btn--active" data-value="custom" type="button">Custom</button>
        <button class="segmented-btn" data-value="task-skip" type="button">Task Skip</button>
        <button class="segmented-btn" data-value="penalty-removal" type="button">No Penalty</button>
      </div>
    </div>

    <div class="form-row-2">
      <div class="form-group">
        <label class="form-label" for="rcf_pointCost">Point Cost</label>
        <input class="form-input" type="number" id="rcf_pointCost" placeholder="e.g. 500" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Earn in ~ days</label>
        <div style="display:flex;gap:4px;align-items:center;">
          <input type="number" id="rcf_daysInput" class="form-input" value="7" min="1" style="width:56px;">
          <select id="rcf_avgSelect" class="form-input" style="flex:1;font-size:var(--font-xs);">
            ${PRICING_AVERAGES.map(a => `<option value="${a.value}"${a.value === 88 ? ' selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <input type="range" id="rcf_daysSlider" min="1" max="30" value="7" style="width:100%;margin-top:-4px;">
    <div id="rcf_suggestion" class="form-hint" style="cursor:pointer;color:var(--accent);margin-bottom:var(--spacing-xs);">
      → <strong>615 pts</strong> (tap to apply)
    </div>

    <div class="form-group">
      <div class="form-label">Approval required</div>
      <label class="form-toggle">
        <input type="checkbox" id="rcf_approvalRequired" checked>
        <span class="form-toggle__track"></span>
      </label>
    </div>

    <div class="form-group">
      <label class="form-label">Visible to</label>
      <div class="filter-chips" id="rcf_personChips">
        ${people.map(p => `<button class="chip chip--active" data-person-id="${esc(p.id)}" type="button">${esc(p.name)}</button>`).join('')}
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="rcf_maxRedemptions">Max redemptions (optional)</label>
      <input class="form-input" type="number" id="rcf_maxRedemptions" placeholder="Unlimited" min="1">
    </div>

    <div class="form-group">
      <label class="form-label" for="rcf_streakRequirement">Streak required (optional)</label>
      <input class="form-input" type="number" id="rcf_streakRequirement" placeholder="None" min="1">
    </div>

    <div class="form-group">
      <label class="form-label" for="rcf_expiresAt">Expires on (optional)</label>
      <input class="form-input" type="date" id="rcf_expiresAt">
    </div>

    <button class="btn btn--primary btn--full" id="rcf_save" type="button">Create Reward</button>
    <button class="btn btn--ghost btn--full" id="rcf_cancel" type="button">Cancel</button>
  </div>`;

  mount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  // Pricing helper
  const rcfDaysInput = mount.querySelector('#rcf_daysInput');
  const rcfAvgSelect = mount.querySelector('#rcf_avgSelect');
  const rcfSlider = mount.querySelector('#rcf_daysSlider');
  const rcfSuggestion = mount.querySelector('#rcf_suggestion');
  const rcfPointCost = mount.querySelector('#rcf_pointCost');

  function updateRcfSuggestion() {
    const days = parseInt(rcfDaysInput.value) || 7;
    const avg = parseInt(rcfAvgSelect.value) || 88;
    const cost = Math.round((days * avg) / 5) * 5;
    const avgLabel = PRICING_AVERAGES.find(a => a.value === avg)?.label || avg + '%';
    rcfSuggestion.innerHTML = `${days} day${days > 1 ? 's' : ''} at ${avgLabel} average &rarr; <strong>${cost} pts</strong> (tap to apply)`;
    rcfSuggestion.dataset.cost = cost;
  }

  rcfSlider.addEventListener('input', () => { rcfDaysInput.value = rcfSlider.value; updateRcfSuggestion(); });
  rcfDaysInput.addEventListener('input', () => {
    const v = parseInt(rcfDaysInput.value);
    if (v && v <= 30) rcfSlider.value = v;
    updateRcfSuggestion();
  });
  rcfAvgSelect.addEventListener('change', updateRcfSuggestion);
  rcfSuggestion.addEventListener('click', () => { rcfPointCost.value = rcfSuggestion.dataset.cost; });
  updateRcfSuggestion();

  // Emoji picker
  mount.querySelectorAll('#rcf_emojiPicker .emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mount.querySelectorAll('#rcf_emojiPicker .emoji-btn').forEach(b => b.classList.remove('emoji-btn--selected'));
      btn.classList.add('emoji-btn--selected');
      const customInput = mount.querySelector('#rcf_customEmoji');
      if (customInput) customInput.value = '';
    });
  });

  // Type segmented control — mutually exclusive
  mount.querySelectorAll('#rcf_typeChips .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mount.querySelectorAll('#rcf_typeChips .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
    });
  });

  // Person chips — multi-select toggle
  mount.querySelectorAll('#rcf_personChips .chip').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('chip--active'));
  });

  // Cancel
  mount.querySelector('#rcf_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });

  // Save
  mount.querySelector('#rcf_save')?.addEventListener('click', async () => {
    const nameInput = mount.querySelector('#rcf_name');
    const costInput = mount.querySelector('#rcf_pointCost');
    const approvalToggle = mount.querySelector('#rcf_approvalRequired');
    const maxInput = mount.querySelector('#rcf_maxRedemptions');
    const streakInput = mount.querySelector('#rcf_streakRequirement');
    const expiresInput = mount.querySelector('#rcf_expiresAt');

    const name = nameInput?.value.trim() || '';
    if (!name) {
      showToast('Please enter a reward name.');
      return;
    }

    const selectedType = mount.querySelector('#rcf_typeChips .segmented-btn--active')?.dataset.value || 'custom';
    const selectedPeopleIds = [...mount.querySelectorAll('#rcf_personChips .chip--active')]
      .map(b => b.dataset.personId);
    const selectedEmoji = mount.querySelector('#rcf_emojiPicker .emoji-btn--selected')?.dataset.emoji
      || mount.querySelector('#rcf_customEmoji')?.value.trim() || '🎁';

    const rewardData = {
      name,
      icon: selectedEmoji,
      rewardType: selectedType,
      pointCost: parseInt(costInput?.value) || 0,
      approvalRequired: approvalToggle?.checked !== false,
      perPerson: selectedPeopleIds,
      maxRedemptions: maxInput?.value ? parseInt(maxInput.value) : null,
      streakRequirement: streakInput?.value ? parseInt(streakInput.value) : null,
      expiresAt: expiresInput?.value ? new Date(expiresInput.value).getTime() : null,
      status: 'active'
    };

    await pushReward(rewardData);
    mount.innerHTML = '';
    showToast('Reward created!');
    await refreshData();
    render();
  });
}

async function refreshData() {
  [rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers] = await Promise.all([
    readRewards(), readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers()
  ]);
}

init().catch(console.error);
