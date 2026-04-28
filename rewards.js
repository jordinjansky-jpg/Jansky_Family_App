import { initFirebase, readSettings, readPeople, readRewards, readAllMessages,
  readAllBalanceAnchors, readAllSnapshots, readBank, readMultipliers,
  writeFyiMessage, writeMessage, markMessageSeen, writeBankToken,
  markBankTokenUsed, removeBankToken, onConnectionChange, pushReward,
  onAllMessages, removeMessage, writeMultiplier
} from './shared/firebase.js';
import { applyTheme, loadCachedTheme } from './shared/theme.js';
import { calculateBalance } from './shared/scoring.js';
import { renderNavBar, initNavMore, renderHeader, initBell, initOfflineBanner,
  showConfirm, showToast, renderBottomSheet,
  renderRewardCard, renderBankToken as renderBankTokenEl, renderHistoryRow, renderApprovalRow
} from './shared/components.js';
import { todayKey } from './shared/utils.js';

await initFirebase();
loadCachedTheme();

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
  const theme = settings?.theme || {};
  applyTheme(theme, settings);

  if (!isKidMode) {
    document.getElementById('headerMount').innerHTML = renderHeader({
      title: 'Rewards',
      showBell: true
    });
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

function render() {
  document.getElementById('app').innerHTML =
    renderBalanceZone() +
    renderApprovalsBanner() +
    renderTabsHtml() +
    `<div id="rewardsContent"></div>`;
  renderActiveTab();
  bindTabs();
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
      if (m.type === 'redemption-request' && !m.seen) count++;
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
  return `<div class="tabs" role="tablist">
    ${tabs.map(t => `<button class="tabs__tab${activeTab === t.id ? ' tabs__tab--active' : ''}" role="tab" aria-selected="${activeTab === t.id}" data-tab="${t.id}" type="button">${t.label}</button>`).join('')}
  </div>`;
}

function renderActiveTab() {
  const content = document.getElementById('rewardsContent');
  if (!content) return;
  if (activeTab === 'shop')           content.innerHTML = renderShopTab();
  else if (activeTab === 'bank')      content.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
  else if (activeTab === 'history')   content.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
  else if (activeTab === 'approvals') content.innerHTML = '<div class="empty-state"><p>Loading…</p></div>';
  bindActiveTab();
}

function bindActiveTab() {
  if (activeTab === 'shop') bindShopTab();
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
    if (content) { content.innerHTML = renderShopTab(); bindShopTab(); }
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
  mount.querySelectorAll('[data-filter-type]').forEach(b =>
    b.addEventListener('click', () => { mount.querySelectorAll('[data-filter-type]').forEach(x => x.classList.remove('chip--active')); b.classList.add('chip--active'); }));
  mount.querySelectorAll('[data-filter-sort]').forEach(b =>
    b.addEventListener('click', () => { mount.querySelectorAll('[data-filter-sort]').forEach(x => x.classList.remove('chip--active')); b.classList.add('chip--active'); }));
  mount.querySelector('#shopFilterApply')?.addEventListener('click', () => {
    shopFilter.type = mount.querySelector('[data-filter-type].chip--active')?.dataset.filterType || 'all';
    shopFilter.sort = mount.querySelector('[data-filter-sort].chip--active')?.dataset.filterSort || 'name';
    mount.innerHTML = '';
    const content = document.getElementById('rewardsContent');
    if (content) { content.innerHTML = renderShopTab(); bindShopTab(); }
  });
}

function handleGetReward(rewardId) {} // implemented in Task 13

function bindTabs() {
  document.querySelectorAll('.tabs__tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tabs__tab').forEach(b => {
        b.classList.toggle('tabs__tab--active', b.dataset.tab === activeTab);
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
  });
}

function openRewardCreateForm() {} // implemented in Task 14

async function refreshData() {
  [rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers] = await Promise.all([
    readRewards(), readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers()
  ]);
}

init().catch(console.error);
