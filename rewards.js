import { initFirebase, readSettings, readPeople, readRewards, readAllMessages,
  readAllBalanceAnchors, readAllSnapshots, readBank, readMultipliers,
  writeFyiMessage, writeMessage, markMessageSeen, writeBankToken,
  markBankTokenUsed, removeBankToken, onConnectionChange, pushReward,
  writeReward, archiveReward, removeReward,
  onAllMessages, removeMessage, writeMultiplier, writePerson
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
let viewerPerson = null; // the person whose perspective owns this session (theme, etc.)
let activeTab = tabParam || 'shop';
let shopFilter = { type: 'all', sort: 'cost', search: '' };
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
  if (!viewerPerson) viewerPerson = activePerson; // set once on first load
}

async function init() {
  await loadData();
  applyTheme(resolveTheme(settings?.theme));
  if (viewerPerson?.theme?.preset) applyTheme(viewerPerson.theme);

  if (!isKidMode) {
    document.getElementById('headerMount').innerHTML = renderHeader({
      title: 'Rewards',
      showBell: true,
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
      removeBankTokenFn: removeBankToken,
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
    if (chipMount) {
      chipMount.innerHTML = renderPersonSwitcherChip();
      document.getElementById('personSwitcherSelect')?.addEventListener('change', e => {
        activePerson = people.find(p => p.id === e.target.value) || activePerson;
        render();
      });
    }
  }
}

function renderPersonSwitcherChip() {
  if (!activePerson || people.length <= 1) return '';
  const opts = people.map(p =>
    `<option value="${esc(p.id)}"${p.id === activePerson.id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  return `<label class="rewards-view-as">
    <span class="rewards-view-as__label">View as</span>
    <select class="rewards-view-as__select" id="personSwitcherSelect">${opts}</select>
  </label>`;
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
  return `<div class="tabs tabs--pill rewards-tabs" role="tablist">
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
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleGetReward(btn.dataset.rewardId);
    });
  });

  const isAdult = activePerson?.role !== 'child';
  document.querySelectorAll('.card--reward[data-reward-id]').forEach(card => {
    let pressTimer = null, didLongPress = false, startX = 0, startY = 0;

    card.addEventListener('touchstart', e => {
      if (e.target.closest('.reward-get-btn')) return;
      didLongPress = false;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      if (!isAdult) return;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        pressTimer = null;
        navigator.vibrate?.(30);
        openRewardForm(card.dataset.rewardId);
      }, 600);
    }, { passive: true });
    card.addEventListener('touchmove', e => {
      if (pressTimer && (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10)) {
        clearTimeout(pressTimer); pressTimer = null;
      }
    }, { passive: true });
    card.addEventListener('touchend', () => { clearTimeout(pressTimer); pressTimer = null; });
    card.addEventListener('touchcancel', () => { clearTimeout(pressTimer); pressTimer = null; });
    card.addEventListener('contextmenu', e => e.preventDefault());
    card.addEventListener('click', e => {
      if (e.target.closest('.reward-get-btn')) return;
      if (didLongPress) { didLongPress = false; return; }
      handleGetReward(card.dataset.rewardId);
    });
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
    // Immediately consumed — no bank token; one approval covers purchase + use
    await writeMessage(personId, {
      type: 'redemption-approved',
      title: msg.title || reward.name || '',
      body: null,
      amount: 0,
      intent: 'use-now',
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
  const result = await showConfirm({
    title: 'Deny this request?',
    message: msg?.title || 'Reward request',
    confirmLabel: 'Deny',
    danger: true,
    inputPlaceholder: 'Reason (optional — kid will see this)'
  });
  if (!result) return;
  const reason = typeof result === 'object' ? result.value : '';

  const deniedType = msg?.type === 'use-request' ? 'use-denied' : 'redemption-denied';
  await writeMessage(personId, {
    type: deniedType,
    title: msg?.title || 'Request denied',
    body: reason || null,
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

  // When a parent is viewing, append all kids' saved rewards below their own bank
  if (viewerPerson?.role !== 'child') {
    const kids = people.filter(p => p.role === 'child');
    if (kids.length > 0) {
      const kidBanks = await Promise.all(kids.map(k => readBank(k.id).then(b => ({ kid: k, bank: b || {} }))));
      for (const { kid, bank } of kidBanks) {
        const kidActive = Object.entries(bank).filter(([, t]) => !t.used);
        if (kidActive.length === 0) continue;
        html += `<div class="rewards-section-heading" style="margin-top: 20px;">${esc(kid.name)}'s Bank</div>`;
        kidActive.forEach(([tokenId, token]) => {
          html += renderBankTokenEl(tokenId, token, { showUse: false });
        });
      }
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
    // Guard against duplicate use-request for the same token
    const alreadyPending = Object.values(allMessages?.[activePerson.id] || {}).some(m =>
      m.type === 'use-request' && !m.seen && m.bankTokenId === tokenId);
    if (alreadyPending) { showToast('Already requested — waiting for approval.'); return; }

    if (!await showConfirm({ title: `Request to use ${tokenName}?`, message: 'Your parent will get a notification to approve.' })) return;
    await writeMessage(activePerson.id, {
      type: 'use-request',
      title: tokenName,
      body: null,
      amount: 0,
      rewardId: rewardId || null,
      rewardName: tokenName,
      rewardIcon: rewardIcon || '',
      bankTokenId: tokenId,
      seen: false,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: activePerson.id
    });
    showToast('Requested! Waiting for approval…');
    await refreshData();
    loadAndRenderBankTab();
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

  const isFunctional = reward.rewardType === 'task-skip' || reward.rewardType === 'penalty-removal';

  if (isAdult) {
    if (isFunctional) {
      // Functional rewards always go to the bank first — no "use now" option
      const confirmed = await showConfirm({ title: 'Add to your Bank?', message: reward.name });
      if (!confirmed) return;
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
    // Custom reward: show intent sheet (Use Now = bank + use immediately, no approval needed)
    openIntentSheet(reward, rewardId);
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
    const bankTokenId = await writeBankToken(activePerson.id, {
      rewardType: reward.rewardType || 'custom',
      rewardId,
      rewardName: reward.name || '',
      rewardIcon: reward.icon || '',
      acquiredAt: ts,
      used: false
    });
    // Notify all parents with FYI + revoke option
    const parents = people.filter(p => p.role !== 'child');
    for (const parent of parents) {
      await writeFyiMessage(parent.id, activePerson.name, reward.name, reward.pointCost || 0, rewardId, activePerson.id, bankTokenId);
    }
    showToast('Saved to your Bank!');
    await refreshData();
    render();
    return;
  }

  if (isFunctional) {
    // Path 3 — functional: immediate bank + FYI (no approval to save; parent gets FYI with revoke)
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
    const bankTokenId = await writeBankToken(activePerson.id, {
      rewardType: reward.rewardType || 'custom',
      rewardId,
      rewardName: reward.name || '',
      rewardIcon: reward.icon || '',
      acquiredAt: ts,
      used: false
    });
    const parents = people.filter(p => p.role !== 'child');
    for (const parent of parents) {
      await writeFyiMessage(parent.id, activePerson.name, reward.name, reward.pointCost || 0, rewardId, activePerson.id, bankTokenId);
    }
    showToast('Saved to your Bank!');
    await refreshData();
    renderActiveTab();
    return;
  }

  // Path 2 — custom with approval: show intent sheet
  openIntentSheet(reward, rewardId);
}

function openIntentSheet(reward, rewardId) {
  const mount = document.getElementById('sheetMount');
  const balance = getBalance(activePerson.id);
  const canAfford = balance >= (reward.pointCost || 0);
  const CLOSE_SVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const CHECK_SVG   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const BANK_SVG    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
  const CHEVRON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

  mount.innerHTML = renderBottomSheet(`
    <div class="task-detail-sheet">
      <div class="sheet__header">
        <div class="is-header">
          <h2 class="sheet__title">${esc(reward.name)}</h2>
          <span class="chip ${canAfford ? 'chip--success' : 'chip--muted'}">${(reward.pointCost || 0).toLocaleString()} pts</span>
        </div>
        <button class="ef2-icon-btn" id="is_cancel" type="button" aria-label="Close">${CLOSE_SVG}</button>
      </div>
      <div class="is-preview">
        <span class="is-preview__icon">${esc(reward.icon || '🎁')}</span>
      </div>
      <div class="tabs tabs--pill is-tab-row">
        <button class="tab" id="is_save" type="button">Save to bank</button>
        <button class="tab is-active" id="is_useNow" type="button">Use now</button>
      </div>
    </div>
  `);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    document.getElementById('bottomSheet')?.addEventListener('click', e => {
      if (e.target === document.getElementById('bottomSheet')) mount.innerHTML = '';
    });
  });

  let submitting = false;

  async function sendRequest(intent) {
    if (submitting) return;
    submitting = true;
    mount.innerHTML = '';
    const ts = firebase.database.ServerValue.TIMESTAMP;

    const isAdult = activePerson.role !== 'child';

    if (intent === 'save') {
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
      const bankTokenId = await writeBankToken(activePerson.id, {
        rewardType: reward.rewardType || 'custom',
        rewardId,
        rewardName: reward.name || '',
        rewardIcon: reward.icon || '',
        acquiredAt: ts,
        used: false
      });
      if (!isAdult) {
        const parents = people.filter(p => p.role !== 'child');
        for (const parent of parents) {
          await writeFyiMessage(parent.id, activePerson.name, reward.name, reward.pointCost || 0, rewardId, activePerson.id, bankTokenId);
        }
      }
      showToast('Saved to your Bank!');
    } else if (isAdult) {
      // Adult Use Now — bank then immediately mark used, no approval needed
      await writeMessage(activePerson.id, {
        type: 'redemption-request',
        title: reward.name,
        body: null,
        amount: -(reward.pointCost || 0),
        rewardId,
        rewardName: reward.name,
        rewardIcon: reward.icon || '',
        intent: 'use-now',
        seen: true,
        createdAt: ts,
        createdBy: activePerson.id
      });
      const bankTokenId = await writeBankToken(activePerson.id, {
        rewardType: reward.rewardType || 'custom',
        rewardId,
        rewardName: reward.name || '',
        rewardIcon: reward.icon || '',
        acquiredAt: ts,
        used: false
      });
      await markBankTokenUsed(activePerson.id, bankTokenId, null);
      await writeMessage(activePerson.id, {
        type: 'reward-used',
        title: `Used: ${reward.name}`,
        body: null,
        amount: 0,
        rewardId,
        rewardName: reward.name,
        rewardIcon: reward.icon || '',
        seen: true,
        createdAt: ts,
        createdBy: 'self'
      });
      showToast(`Used ${reward.name}!`);
    } else {
      // Child Use Now — send approval request to parent
      await writeMessage(activePerson.id, {
        type: 'redemption-request',
        title: reward.name,
        body: null,
        amount: -(reward.pointCost || 0),
        rewardId,
        rewardName: reward.name,
        rewardIcon: reward.icon || '',
        intent: 'use-now',
        seen: false,
        createdAt: ts,
        createdBy: activePerson.id
      });
      showToast('Request sent! Waiting for approval…');
    }
    await refreshData();
    renderActiveTab();
  }

  document.getElementById('is_useNow')?.addEventListener('click', () => sendRequest('use-now'));
  document.getElementById('is_save')?.addEventListener('click', () => sendRequest('save'));
  document.getElementById('is_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
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
  document.getElementById('rewardsFab')?.addEventListener('click', () => openRewardForm(null));
  document.addEventListener('click', e => {
    if (e.target.id === 'bannerReviewBtn') { activeTab = 'approvals'; render(); }
    if (e.target.id === 'personSwitcherSelect') {/* handled by change listener added in render */}
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

const RF_CLOSE_SVG   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const RF_SAVE_SVG    = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const RF_DELETE_SVG  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const RF_ARCHIVE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;

function openRewardForm(rewardId = null) {
  const mount = document.getElementById('sheetMount');
  const tz = settings?.timezone || 'UTC';
  const reward = rewardId ? (rewardsObj?.[rewardId] || {}) : {};
  const isEdit = !!rewardId;
  const isArchived = isEdit && reward.status === 'archived';
  const defaultEmoji = reward.icon || '\u{1F381}';
  const isApprovalRequired = reward.approvalRequired !== false;
  const sheetTitle = isArchived ? 'Archived Reward' : (isEdit ? 'Edit Reward' : 'New Reward');

  const peopleHtml = people.map(p => {
    const vis = !reward.perPerson || reward.perPerson.includes(p.id);
    return `<button type="button" class="ef2-person-chip" data-person-id="${esc(p.id)}"${vis ? ' data-state="primary"' : ''} style="--chip-color:${esc(p.color)}">${esc(p.name)}</button>`;
  }).join('');

  mount.innerHTML = renderBottomSheet(`
    <div class="tf-form">
      <div class="sheet__header">
        <h2 class="sheet__title">${sheetTitle}</h2>
        <div class="rf-header-actions">
          ${isEdit ? (isArchived
            ? `<button class="ef2-icon-btn" id="rcf_unarchive" type="button" aria-label="Unarchive" title="Unarchive">${RF_ARCHIVE_SVG}</button>`
            : `<button class="ef2-icon-btn" id="rcf_archive" type="button" aria-label="Archive" title="Archive">${RF_ARCHIVE_SVG}</button>`) : ''}
          ${isEdit ? `<button class="ef2-icon-btn rf-delete-btn" id="rcf_delete" type="button" aria-label="Delete" title="Delete reward">${RF_DELETE_SVG}</button>` : ''}
          <button class="ef2-icon-btn rf-save-btn" id="rcf_save" type="button" aria-label="${isEdit ? 'Save' : 'Create reward'}" title="${isEdit ? 'Save' : 'Create'}">${RF_SAVE_SVG}</button>
          <button class="ef2-icon-btn" id="rcf_close" type="button" aria-label="Close">${RF_CLOSE_SVG}</button>
        </div>
      </div>

      <div class="rf-title-row">
        <button class="rf-emoji-btn" id="rcf_emojiBtnPreview" type="button" title="Pick emoji">${defaultEmoji}</button>
        <input class="tf-title-input" id="rcf_name" type="text" placeholder="Reward name" value="${esc(reward.name || '')}" autocomplete="off">
      </div>

      <div class="rf-emoji-reveal" id="rcf_emojiReveal">
        <div class="rf-emoji-grid">
          ${REWARD_EMOJIS.map(e => `<button type="button" class="rf-emoji-cell${defaultEmoji === e ? ' is-selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
          <input type="search" id="rcf_customEmoji" class="rf-emoji-custom" placeholder="+">
        </div>
      </div>

      <div class="ef2-divider"></div>

      <div class="tf-rotation-section">
        <div class="tf-rotation-pills" id="rcf_type">
          <button class="tf-rot-pill${(reward.rewardType || 'custom') === 'custom' ? ' tf-rot-pill--active' : ''}" data-rtype="custom" type="button">Custom</button>
          <button class="tf-rot-pill${reward.rewardType === 'task-skip' ? ' tf-rot-pill--active' : ''}" data-rtype="task-skip" type="button">Task Skip</button>
          <button class="tf-rot-pill${reward.rewardType === 'penalty-removal' ? ' tf-rot-pill--active' : ''}" data-rtype="penalty-removal" type="button">No Penalty</button>
        </div>
        <div id="rcf_typeHint" class="form-hint rf-type-hint"></div>
      </div>

      <div class="ef2-divider"></div>

      <div class="rf-cost-row">
        <input type="number" id="rcf_pointCost" class="rf-cost-input" value="${reward.pointCost || ''}" min="1" placeholder="0">
        <span class="rf-cost-unit">pts</span>
        <button class="ef2-add-chip" id="rcf_pricingChip" type="button">+ Pricing help</button>
      </div>

      <div class="ef2-field-reveal" id="rcf_pricingReveal">
        <div class="rf-pricing-inner">
          <div class="rf-pricing-row">
            <input type="number" id="rcf_daysInput" class="rf-days-input" value="7" min="1">
            <span class="rf-cost-unit">days at</span>
            <select id="rcf_avgSelect" class="rf-avg-select">
              ${PRICING_AVERAGES.map(a => `<option value="${a.value}"${a.value === 88 ? ' selected' : ''}>${a.label}</option>`).join('')}
            </select>
          </div>
          <input type="range" id="rcf_daysSlider" min="1" max="30" value="7" class="rf-days-slider">
          <div id="rcf_suggestion" class="rf-suggestion"></div>
        </div>
      </div>

      <div class="ef2-divider"></div>

      <div class="tf-for-section">
        <div class="ef2-for-header">
          <span class="ef2-section-label">Visible to</span>
        </div>
        <div class="ef2-person-chips" id="rcf_people">${peopleHtml}</div>
      </div>

      <div class="ef2-divider"></div>

      <div class="ef2-secondary-row">
        <button class="ef2-add-chip${isApprovalRequired ? ' is-active' : ''}" id="rcf_approvalChip" type="button">Approval required</button>
        <button class="ef2-add-chip" id="rcf_advancedChip" type="button">+ Advanced</button>
      </div>

      <div class="ef2-field-reveal" id="rcf_advancedReveal">
        <div class="rf-adv-grid">
          <div class="rf-adv-row">
            <span class="rf-adv-label">Max uses</span>
            <input type="number" id="rcf_maxRedemptions" class="rf-adv-input" value="${reward.maxRedemptions || ''}" min="1" placeholder="Unlimited">
          </div>
          <div class="rf-adv-row">
            <span class="rf-adv-label">Streak required</span>
            <input type="number" id="rcf_streakReq" class="rf-adv-input" value="${reward.streakRequirement || ''}" min="1" placeholder="None">
          </div>
          <div class="rf-adv-row">
            <span class="rf-adv-label">Expires</span>
            <input type="date" id="rcf_expiresAt" class="rf-adv-input" value="${reward.expiresAt ? new Date(reward.expiresAt).toLocaleDateString('en-CA', { timeZone: tz }) : ''}">
          </div>
        </div>
      </div>
    </div>
  `);

  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  const close = () => { mount.innerHTML = ''; };

  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') close();
  });

  // Emoji
  let currentEmoji = defaultEmoji;
  const emojiReveal = mount.querySelector('#rcf_emojiReveal');
  mount.querySelector('#rcf_emojiBtnPreview')?.addEventListener('click', () => {
    emojiReveal?.classList.toggle('is-open');
  });
  for (const cell of mount.querySelectorAll('.rf-emoji-cell')) {
    cell.addEventListener('click', () => {
      mount.querySelectorAll('.rf-emoji-cell').forEach(c => c.classList.remove('is-selected'));
      cell.classList.add('is-selected');
      currentEmoji = cell.dataset.emoji;
      mount.querySelector('#rcf_emojiBtnPreview').textContent = currentEmoji;
      mount.querySelector('#rcf_customEmoji').value = '';
      emojiReveal?.classList.remove('is-open');
    });
  }
  mount.querySelector('#rcf_customEmoji')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) {
      currentEmoji = v;
      mount.querySelector('#rcf_emojiBtnPreview').textContent = v;
      mount.querySelectorAll('.rf-emoji-cell').forEach(c => c.classList.remove('is-selected'));
    }
  });

  // Type pills — initialize hint for existing type
  const typeHint = mount.querySelector('#rcf_typeHint');
  const initType = mount.querySelector('#rcf_type .tf-rot-pill--active')?.dataset?.rtype || 'custom';
  if (initType === 'task-skip') typeHint.textContent = 'Person picks a task to skip for the day';
  else if (initType === 'penalty-removal') typeHint.textContent = 'Removes the late penalty from a past task';
  for (const pill of mount.querySelectorAll('#rcf_type .tf-rot-pill')) {
    pill.addEventListener('click', () => {
      mount.querySelectorAll('#rcf_type .tf-rot-pill').forEach(p => p.classList.remove('tf-rot-pill--active'));
      pill.classList.add('tf-rot-pill--active');
      const val = pill.dataset.rtype;
      typeHint.textContent = val === 'task-skip' ? 'Person picks a task to skip for the day'
        : val === 'penalty-removal' ? 'Removes the late penalty from a past task' : '';
    });
  }

  // Pricing helper
  const slider = mount.querySelector('#rcf_daysSlider');
  const daysInput = mount.querySelector('#rcf_daysInput');
  const avgSelect = mount.querySelector('#rcf_avgSelect');
  const suggestion = mount.querySelector('#rcf_suggestion');
  const pointCostInput = mount.querySelector('#rcf_pointCost');

  function updateSuggestion() {
    const days = parseInt(daysInput.value) || 7;
    const avg = parseInt(avgSelect.value) || 88;
    const cost = Math.round((days * avg) / 5) * 5;
    const avgLabel = PRICING_AVERAGES.find(a => a.value === avg)?.label || avg + '%';
    suggestion.innerHTML = `${days} day${days > 1 ? 's' : ''} at ${avgLabel} &rarr; <strong>${cost} pts</strong> (tap to apply)`;
    suggestion.dataset.cost = cost;
  }

  mount.querySelector('#rcf_pricingChip')?.addEventListener('click', () => {
    const reveal = mount.querySelector('#rcf_pricingReveal');
    reveal?.classList.toggle('is-open');
    mount.querySelector('#rcf_pricingChip')?.classList.toggle('is-active', reveal?.classList.contains('is-open'));
    if (reveal?.classList.contains('is-open')) updateSuggestion();
  });
  slider?.addEventListener('input', () => { daysInput.value = slider.value; updateSuggestion(); });
  daysInput?.addEventListener('input', () => {
    const v = parseInt(daysInput.value);
    if (v && v <= 30) slider.value = v;
    updateSuggestion();
  });
  avgSelect?.addEventListener('change', updateSuggestion);
  suggestion?.addEventListener('click', () => { pointCostInput.value = suggestion.dataset.cost; });

  // Person chips
  for (const chip of mount.querySelectorAll('#rcf_people .ef2-person-chip')) {
    chip.addEventListener('click', () => {
      if (chip.dataset.state === 'primary') chip.removeAttribute('data-state');
      else chip.setAttribute('data-state', 'primary');
    });
  }

  // Approval chip toggle
  let approvalRequired = isApprovalRequired;
  mount.querySelector('#rcf_approvalChip')?.addEventListener('click', () => {
    approvalRequired = !approvalRequired;
    mount.querySelector('#rcf_approvalChip')?.classList.toggle('is-active', approvalRequired);
  });

  // Advanced chip toggle — auto-open if any advanced fields are set
  if (reward.maxRedemptions || reward.streakRequirement || reward.expiresAt) {
    mount.querySelector('#rcf_advancedReveal')?.classList.add('is-open');
    mount.querySelector('#rcf_advancedChip')?.classList.add('is-active');
    mount.querySelector('#rcf_advancedChip').textContent = 'Advanced';
  }
  mount.querySelector('#rcf_advancedChip')?.addEventListener('click', () => {
    const reveal = mount.querySelector('#rcf_advancedReveal');
    reveal?.classList.toggle('is-open');
    const open = reveal?.classList.contains('is-open');
    mount.querySelector('#rcf_advancedChip')?.classList.toggle('is-active', open);
    mount.querySelector('#rcf_advancedChip').textContent = open ? 'Advanced' : '+ Advanced';
  });

  // Close
  mount.querySelector('#rcf_close')?.addEventListener('click', close);

  // Archive / Unarchive / Delete
  mount.querySelector('#rcf_delete')?.addEventListener('click', async () => {
    if (!await showConfirm({ title: `Delete "${reward.name}"?`, message: 'This cannot be undone.', danger: true })) return;
    await removeReward(rewardId);
    close();
    showToast('Reward deleted');
    await refreshData();
    render();
  });

  mount.querySelector('#rcf_archive')?.addEventListener('click', async () => {
    if (!await showConfirm({ title: `Archive "${reward.name}"?`, message: 'It will be hidden from the store but not deleted.' })) return;
    await archiveReward(rewardId);
    close();
    showToast('Reward archived');
    await refreshData();
    render();
  });

  mount.querySelector('#rcf_unarchive')?.addEventListener('click', async () => {
    await writeReward(rewardId, { ...reward, status: 'active' });
    close();
    showToast('Reward restored');
    await refreshData();
    render();
  });

  // Save
  mount.querySelector('#rcf_save')?.addEventListener('click', async () => {
    const name = mount.querySelector('#rcf_name').value.trim();
    if (!name) {
      mount.querySelector('#rcf_name').classList.add('is-invalid');
      mount.querySelector('#rcf_name').focus();
      return;
    }
    const rewardType = mount.querySelector('#rcf_type .tf-rot-pill--active')?.dataset?.rtype || 'custom';
    const cost = parseInt(mount.querySelector('#rcf_pointCost').value) || 0;
    if (cost <= 0) { mount.querySelector('#rcf_pointCost').focus(); return; }
    const selectedPeople = [...mount.querySelectorAll('#rcf_people .ef2-person-chip[data-state="primary"]')].map(c => c.dataset.personId);
    const maxRedemptions = parseInt(mount.querySelector('#rcf_maxRedemptions').value) || null;
    const streakReq = parseInt(mount.querySelector('#rcf_streakReq').value) || null;
    const expiresDate = mount.querySelector('#rcf_expiresAt').value;
    const expiresAt = expiresDate ? new Date(expiresDate + 'T23:59:59').getTime() : null;
    const data = {
      name, icon: currentEmoji, pointCost: cost, rewardType,
      approvalRequired, perPerson: selectedPeople,
      maxRedemptions, streakRequirement: streakReq, expiresAt,
      status: reward.status || 'active'
    };
    if (isEdit) {
      await writeReward(rewardId, data);
      showToast('Reward saved');
    } else {
      await pushReward(data);
      showToast('Reward created!');
    }
    close();
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
