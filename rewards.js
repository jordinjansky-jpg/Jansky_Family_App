import { initFirebase, readSettings, writeSettings, readPeople, readRewards, readAllMessages,
  readAllBalanceAnchors, readAllSnapshots, readAllStreaks, readBank, readMultipliers,
  writeFyiMessage, writeMessage, markMessageSeen, writeBankToken,
  markBankTokenUsed, removeBankToken, onConnectionChange, pushReward,
  writeReward, archiveReward, removeReward,
  onAllMessages, removeMessage, writeMultiplier, writePerson,
  readAllActivityEarnings
} from './shared/firebase.js';
import { startLongPressTimer, recordTap } from './shared/dom-helpers.js';
import { applyTheme, resolveTheme } from './shared/theme.js';
import { calculateBalance } from './shared/scoring.js';
import { renderNavBar, initNavMore, initBottomNav, renderHeader, initBell, initOfflineBanner,
  showConfirm, showToast, renderBottomSheet, applyDataColors,
  renderRewardCard, renderBankToken as renderBankTokenEl, renderHistoryRow, renderHistoryDetailSheet, renderApprovalRow,
  openDeviceThemeSheet, renderOverflowMenu, renderSkeleton, renderEmptyState,
  renderDateInput, bindDateInput, renderSwitchToggle,
  renderColorButton, initColorButton, renderPersonAvatar, renderFormFooter,
  readRewardsCustomize,
} from './shared/components.js';
import { todayKey, formatDateShort, addDays } from './shared/utils.js';

await initFirebase();
applyTheme(resolveTheme());

// ── URL param detection ──
const params = new URLSearchParams(location.search);
const kidName = params.get('kid');
const personParam = params.get('person');
const tabParam = params.get('tab');

const isKidMode = !!kidName;

// ── State ──
let settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers, allStreaks, allActivityEarnings;
let people = [];
let activePerson = null;
let viewerPerson = null; // the person whose perspective owns this session (theme, etc.)
let activeTab = tabParam || 'shop';
let shopFilter = { type: 'all', sort: 'cost', search: '' };
let historyFilter = { type: 'all' };

async function loadData() {
  [settings, peopleObj, rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers, allStreaks, allActivityEarnings] = await Promise.all([
    readSettings(), readPeople(), readRewards(),
    readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers(), readAllStreaks(),
    readAllActivityEarnings()
  ]);
  people = Object.entries(peopleObj || {}).map(([id, p]) => ({ id, ...p }));

  if (isKidMode) {
    activePerson = people.find(p => p.name === kidName) || people[0];
  } else if (personParam) {
    activePerson = people.find(p => p.name === personParam) || people.find(p => p.role !== 'child') || people[0];
  } else {
    // Restore last-selected person from localStorage; fall back to first adult
    let restored = null;
    try {
      const savedId = localStorage.getItem('rewards-active-person');
      if (savedId) restored = people.find(p => p.id === savedId);
    } catch {}
    activePerson = restored || people.find(p => p.role !== 'child') || people[0];
  }
  if (!viewerPerson) viewerPerson = activePerson; // set once on first load
}

async function init() {
  document.getElementById('rewardsContent').innerHTML = renderSkeleton('card-grid');
  await loadData();
  // Apply user's preferred default Shop sort
  shopFilter.sort = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null).shopSort;
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
    initBottomNav({
      navMount:     document.getElementById('navMount'),
      activePage:   'rewards',
      sheetMount:   document.getElementById('sheetMount'),
      getTheme:     () => settings?.theme,
      personOpts:   viewerPerson ? { person: viewerPerson, writePerson, displayDefaults: settings } : undefined,
      currentPage:  'rewards',
      onPageRender: () => render(),
    });
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
  'use-request','use-approved','use-denied','task-skip-used','penalty-removed','reward-used','fyi',
  'earned',
]);
const KID_HISTORY_TYPES = new Set([
  'redemption-request','redemption-approved','redemption-denied',
  'use-request','use-approved','use-denied','reward-used','task-skip-used','penalty-removed','fyi',
  'earned',
]);

function matchesHistoryGroup(type, group) {
  if (group === 'all') return true;
  if (group === 'purchases') return ['redemption-request','redemption-approved','redemption-denied','fyi'].includes(type);
  if (group === 'uses') return ['use-request','use-approved','use-denied','reward-used','task-skip-used','penalty-removed'].includes(type);
  if (group === 'bonuses') return type === 'bonus';
  if (group === 'deductions') return type === 'deduction';
  if (group === 'earned') return type === 'earned';
  return false;
}

// Build the full history list for a person: messages from Firebase + synthetic
// "earned" entries derived from daily snapshots (one row per day with earnings).
// Filters by allowed types and active group, then sorts newest first.
function buildHistoryEntries(personId, allowedTypes, groupFilter) {
  const raw = allMessages?.[personId] || {};
  const msgEntries = Object.entries(raw)
    .map(([id, msg]) => ({ ...msg, id, personId }))
    .filter(msg => allowedTypes.has(msg.type) && matchesHistoryGroup(msg.type, groupFilter));

  const earnedEntries = [];
  for (const [dateKey, peopleSnaps] of Object.entries(allSnapshots || {})) {
    const snap = peopleSnaps?.[personId];
    if (!snap || !snap.earned) continue;
    // Synthetic timestamp at noon UTC of the dateKey — sorts within the right
    // day regardless of timezone formatting at render time.
    const ms = new Date(`${dateKey}T12:00:00Z`).getTime();
    earnedEntries.push({
      id: `earned-${dateKey}`,
      personId,
      type: 'earned',
      title: `Earned · ${snap.percentage}% ${snap.grade}`,
      amount: snap.earned,
      createdAt: ms,
    });
  }
  const filteredEarned = earnedEntries
    .filter(e => allowedTypes.has(e.type) && matchesHistoryGroup(e.type, groupFilter));

  return [...msgEntries, ...filteredEarned].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function render() {
  document.getElementById('app').innerHTML =
    renderBalanceZone() +
    renderApprovalsBanner() +
    renderFamilyBanner() +
    renderTabsHtml() +
    `<div id="rewardsContent"></div>`;
  renderActiveTab();
  bindTabs();
  if (!isKidMode) {
    const chipMount = document.getElementById('personChipMount');
    if (chipMount) {
      chipMount.innerHTML = renderPersonSwitcherChip();
      document.getElementById('personSwitcherChip')?.addEventListener('click', openPersonSwitcherSheet);
    }
  }
}

function renderPersonSwitcherChip() {
  if (!activePerson || people.length <= 1) return '';
  return `<button class="rewards-view-as-chip" id="personSwitcherChip" type="button" aria-label="Switch person">
    <span class="rewards-view-as-chip__avatar" style="--person-color: ${esc(activePerson.color || 'var(--accent)')}">${esc((activePerson.name || '?')[0].toUpperCase())}</span>
    <span class="rewards-view-as-chip__name">${esc(activePerson.name)}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
  </button>`;
}

function openPersonSwitcherSheet() {
  const mount = document.getElementById('sheetMount');
  const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const rows = people.map(p => `
    <button class="person-switcher-row${p.id === activePerson?.id ? ' is-active' : ''}" data-person-id="${esc(p.id)}" type="button">
      <span class="person-switcher-row__avatar" style="--person-color: ${esc(p.color || 'var(--accent)')}">${esc((p.name || '?')[0].toUpperCase())}</span>
      <span class="person-switcher-row__name">${esc(p.name)}</span>
      ${p.id === activePerson?.id ? `<span class="person-switcher-row__check">${CHECK_SVG}</span>` : ''}
    </button>
  `).join('');

  mount.innerHTML = renderBottomSheet(`
    <h3 class="sheet-section-title">View as</h3>
    <div class="person-switcher-list">${rows}</div>
  `);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });

  mount.querySelectorAll('.person-switcher-row[data-person-id]').forEach(row => {
    row.addEventListener('click', () => {
      const pid = row.dataset.personId;
      const next = people.find(p => p.id === pid);
      if (next) {
        activePerson = next;
        try { localStorage.setItem('rewards-active-person', pid); } catch {}
        mount.innerHTML = '';
        render();
      }
    });
  });
}

function getBalance(personId) {
  const msgs = allMessages?.[personId] || {};
  const anchor = allAnchors?.[personId] || null;
  const tz = settings?.timezone || 'UTC';
  const result = calculateBalance(personId, allSnapshots, msgs, anchor, allMultipliers, tz, allActivityEarnings);
  return Math.round(result?.balance ?? result ?? 0);
}

/** Sum spendable balance across all people. Used for adult-mode banner. */
function familyTotalBalance() {
  let total = 0;
  for (const p of people) {
    total += getBalance(p.id);
  }
  return total;
}

/** Approximate week-over-week change for the family. */
function familyBalanceTrendDirection() {
  const tz = settings?.timezone || 'UTC';
  const today = todayKey(tz);
  let last7 = 0, prior7 = 0;
  for (const p of people) {
    if (!allSnapshots) continue;
    let cur = addDays(today, -6);
    while (cur <= today) {
      const pct = allSnapshots[cur]?.[p.id]?.percentage || 0;
      const mult = allMultipliers?.[cur]?.[p.id]?.multiplier || 1;
      last7 += pct * mult;
      cur = addDays(cur, 1);
    }
    let cur2 = addDays(today, -13);
    while (cur2 <= addDays(today, -7)) {
      const pct = allSnapshots[cur2]?.[p.id]?.percentage || 0;
      const mult = allMultipliers?.[cur2]?.[p.id]?.multiplier || 1;
      prior7 += pct * mult;
      cur2 = addDays(cur2, 1);
    }
  }
  if (last7 === 0 || prior7 === 0) return null;
  const diff = ((last7 - prior7) / prior7) * 100;
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return null;
}

/** Render the family-banner HTML; empty string when conditions aren't met. */
function renderFamilyBanner() {
  const prefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  if (!prefs.showFamilyBanner) return '';
  if (isKidMode || people.length < 2 || viewerPerson?.role === 'child') return '';
  const familyTotal = familyTotalBalance();
  const trendDir = familyBalanceTrendDirection();
  const trendArrow = trendDir === 'up'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>'
    : trendDir === 'down'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>'
    : '';
  return `<div class="rewards-family-banner">
    <span class="rewards-family-banner__label">Family</span>
    <span class="rewards-family-banner__amount">${familyTotal.toLocaleString()} pts in circulation</span>
    ${trendArrow}
  </div>`;
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
    ${renderPersonAvatar(activePerson, { size: 'lg' })}
    <div class="rewards-balance__info">
      <div class="rewards-balance__name">${esc(activePerson.name)}</div>
      <div class="rewards-balance__amount">${balance.toLocaleString()}<span class="rewards-balance__unit">pts</span></div>
    </div>
    <div class="rewards-trend-wrap">
      ${renderTrendLine(activePerson.id)}
      <div class="rewards-trend__label">30-day balance</div>
    </div>
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
  // Approvals tab is for adults only — gate on viewer role AND not in kid-mode URL.
  // viewerPerson is set once on first load (the page's "owner") so this is stable
  // across in-page person switches.
  const showApprovals = !isKidMode && viewerPerson?.role !== 'child';
  const allTabs = [
    { id: 'shop', label: 'Shop' },
    { id: 'bank', label: 'Bank' },
    { id: 'history', label: 'History' },
    ...(showApprovals ? [{ id: 'approvals', label: 'Approve' }] : []),
  ];
  // Apply user's customize visibility filter (keeps at least one tab)
  const prefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  const visibleTabs = allTabs.filter(t => prefs.tabs.includes(t.id));
  const tabs = visibleTabs.length > 0 ? visibleTabs : allTabs.slice(0, 1);
  return `<div class="tabs tabs--pill rewards-tabs" role="tablist">
    ${tabs.map(t => `<button class="tab${activeTab === t.id ? ' is-active' : ''}" role="tab" aria-selected="${activeTab === t.id}" data-tab="${t.id}" type="button">${t.label}</button>`).join('')}
  </div>`;
}

function renderActiveTab() {
  const content = document.getElementById('rewardsContent');
  if (!content) return;
  // Guard: ?tab=approvals in a kid-mode URL or as a child viewer falls back to shop.
  if (activeTab === 'approvals' && (isKidMode || viewerPerson?.role === 'child')) {
    activeTab = 'shop';
  }
  // If the user has hidden the current active tab via Customize, fall back to the first visible
  const prefsForGuard = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
  if (!prefsForGuard.tabs.includes(activeTab)) {
    activeTab = prefsForGuard.tabs[0] || 'shop';
  }
  if (activeTab === 'shop')           content.innerHTML = renderShopTab();
  else if (activeTab === 'bank')      { content.innerHTML = renderSkeleton('list'); loadAndRenderBankTab(); }
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
  if (!activePerson) return renderEmptyState('', 'No person selected', 'Use the filter above to pick someone.');
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

  if (shopFilter.sort === 'cost') {
    visible.sort((a, b) => (a.pointCost || 0) - (b.pointCost || 0));
  } else if (shopFilter.sort === 'closest') {
    // Closest-to-affordable: affordable items first (highest cost descending —
    // 'just barely afford' at top), then unaffordable items by gap ascending
    // ('almost there' at top of the unaffordable group).
    visible.sort((a, b) => {
      const gapA = (a.pointCost || 0) - balance;
      const gapB = (b.pointCost || 0) - balance;
      if (gapA <= 0 && gapB > 0) return -1;
      if (gapA > 0 && gapB <= 0) return 1;
      if (gapA <= 0 && gapB <= 0) return (b.pointCost || 0) - (a.pointCost || 0);
      return gapA - gapB;
    });
  } else {
    visible.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // Precompute streak + per-reward redemption count for eligibility checks.
  // Previously renderRewardCard was called with streak=0/redemptionCount=0 default,
  // silently bypassing streakRequirement and maxRedemptions.
  const personStreak = allStreaks?.[activePerson.id]?.current || 0;
  const personMessages = allMessages?.[activePerson.id] || {};
  const redemptionCountByReward = {};
  for (const msg of Object.values(personMessages)) {
    if (!msg.rewardId) continue;
    if (msg.type === 'redemption-approved' || msg.type === 'reward-used') {
      redemptionCountByReward[msg.rewardId] = (redemptionCountByReward[msg.rewardId] || 0) + 1;
    }
  }

  let html = `<div class="rewards-filter-bar">
    <input type="search" class="form-input rewards-search" id="shopSearch" placeholder="Search rewards…" value="${esc(shopFilter.search)}">
    ${renderFilterSortChip('shopFilterBtn', getShopFilterCount())}
  </div>`;

  if (visible.length === 0) {
    html += renderEmptyState('', 'No rewards yet', 'Ask a parent to add some in Admin.');
  } else {
    const cardPrefs = readRewardsCustomize(viewerPerson ? { person: viewerPerson } : null);
    html += visible.map(r => renderRewardCard(r, balance, {
      showGet: true,
      streak: personStreak,
      redemptionCount: redemptionCountByReward[r.id] || 0,
      show: cardPrefs.cardShow,
      density: cardPrefs.cardDensity,
    })).join('');
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
      pressTimer = startLongPressTimer(() => {
        didLongPress = true;
        pressTimer = null;
        navigator.vibrate?.(30);
        openRewardForm(card.dataset.rewardId);
      }, { longPressMs: 600 });
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
      recordTap();
      handleGetReward(card.dataset.rewardId);
    });
  });
}

/**
 * Generic filter sheet opener. Sections are chip groups; Apply collects active
 * values and calls onApply(values).
 *
 * @param {Object} cfg
 * @param {string} cfg.title — sheet section title
 * @param {string} cfg.saveId — DOM id for Apply button
 * @param {string} cfg.cancelId — DOM id for Cancel button
 * @param {Array}  cfg.sections — [{ label, name, opts: [{v,l}], current }]
 * @param {Function} cfg.onApply — (values) => void; values keyed by section.name
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

// ── History tab ──

function renderHistoryTab() {
  if (!activePerson) return renderEmptyState('', 'No person selected', 'Use the filter above to pick someone.');
  const tz = settings?.timezone || 'UTC';
  const allowedTypes = isKidMode ? KID_HISTORY_TYPES : ADULT_HISTORY_TYPES;

  const entries = buildHistoryEntries(activePerson.id, allowedTypes, historyFilter.type);

  const filterActiveCount = historyFilter.type !== 'all' ? 1 : 0;

  let html = `<div class="rewards-filter-bar">
    ${renderFilterSortChip('historyFilterBtn', filterActiveCount)}
  </div>`;

  if (entries.length === 0) {
    html += renderEmptyState('📜', 'No history yet', 'Activity will appear here as you earn and spend points.');
    return html;
  }

  const PAGE = 50;
  const visible = entries.slice(0, PAGE);
  const remaining = entries.slice(PAGE);

  html += visible.map(msg => renderHistoryRow(msg, tz, { tappable: msg.type !== 'earned' })).join('');

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
    const entries = buildHistoryEntries(activePerson.id, allowedTypes, historyFilter.type);
    const remaining = entries.slice(50);
    const content = document.getElementById('rewardsContent');
    if (!content) return;
    // Append remaining rows before removing the button
    const fragment = document.createElement('div');
    fragment.innerHTML = remaining.map(msg => renderHistoryRow(msg, tz, { tappable: msg.type !== 'earned' })).join('');
    while (fragment.firstChild) {
      this.before(fragment.firstChild);
    }
    this.remove();
    // Bind tap handlers on newly-appended rows
    document.querySelectorAll('.history-row--tappable:not([data-bound])').forEach(row => {
      row.dataset.bound = '1';
      row.addEventListener('click', () => {
        const msgId = row.dataset.msgId;
        const personId = row.dataset.personId;
        if (!msgId || !personId) return;
        openHistoryDetail(msgId, personId);
      });
    });
  });

  function openHistoryDetail(msgId, personId) {
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
  }

  document.querySelectorAll('.history-row--tappable').forEach(row => {
    row.dataset.bound = '1';
    row.addEventListener('click', () => {
      const msgId = row.dataset.msgId;
      const personId = row.dataset.personId;
      if (!msgId || !personId) return;
      openHistoryDetail(msgId, personId);
    });
  });
}

function openHistoryFilterSheet() {
  const adultOpts = [
    { v: 'all', l: 'All' }, { v: 'earned', l: 'Earned' }, { v: 'purchases', l: 'Purchases' },
    { v: 'uses', l: 'Uses' }, { v: 'bonuses', l: 'Bonuses' }, { v: 'deductions', l: 'Deductions' },
  ];
  const kidOpts = [
    { v: 'all', l: 'All' }, { v: 'earned', l: 'Earned' }, { v: 'purchases', l: 'Purchases' }, { v: 'uses', l: 'Uses' },
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
    for (const [msgId, msg] of Object.entries(msgs || {})) {
      if (resolvedTypes.includes(msg.type) && Date.now() - (msg.createdAt || 0) < THIRTY_DAYS) {
        recentItems.push({ msg: { ...msg, id: msgId, personId }, personId });
      }
    }
  }
  recentItems.sort((a, b) => (b.msg.createdAt || 0) - (a.msg.createdAt || 0));

  const tz = settings?.timezone || 'UTC';

  // Render pending section
  let html = `<div class="rewards-section-heading">Pending</div>`;
  if (pendingItems.length === 0) {
    html += renderEmptyState('✅', 'No pending approvals', "You're all caught up.");
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
    html += renderEmptyState('🎒', 'No saved rewards', 'Redeem something from the Shop to save it here.');
  } else {
    // Group active tokens by rewardId (custom) or rewardType (functional).
    // Each group becomes one row with a count chip; tap expands to instances.
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
        const [tokenId, token] = group.tokens[0];
        html += renderBankTokenEl(tokenId, token, {
          showUse: true,
          isAdult,
          approvalRequired: group.approvalRequired,
          description: group.description,
        });
      } else {
        const safeKey = String(groupKey).replace(/[^a-zA-Z0-9_-]/g, '_');
        html += `<div class="card card--reward bank-group" data-group-key="${esc(safeKey)}">
          <div class="card__leading">
            <span class="icon-tile">${esc(group.rewardIcon)}</span>
          </div>
          <div class="card__body">
            <div class="card__title">${esc(group.rewardName)}</div>
            ${group.description ? `<div class="card--reward__desc">${esc(group.description)}</div>` : ''}
            <div class="card__meta">${group.tokens.length} saved</div>
          </div>
          <div class="card__trailing">
            <button class="chip bank-group__expand" data-group-key="${esc(safeKey)}" type="button" aria-expanded="false">×${group.tokens.length}</button>
          </div>
        </div>
        <div class="bank-group__items" id="bankGroup_${esc(safeKey)}" hidden>`;
        for (const [tokenId, token] of group.tokens) {
          html += renderBankTokenEl(tokenId, token, {
            showUse: true,
            isAdult,
            approvalRequired: group.approvalRequired,
            description: '',
          });
        }
        html += `</div>`;
      }
    }

    if (usedTokens.length > 0) {
      html += `<button class="rewards-show-more" id="bankUsedToggle" type="button">Show ${usedTokens.length} used</button>
        <div id="bankUsedList" hidden>`;
      usedTokens.forEach(([tokenId, token]) => {
        const reward = rewardsObj?.[token.rewardId] || {};
        html += renderBankTokenEl(tokenId, token, {
          showUse: false,
          description: reward?.description || ''
        });
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
        html += `<div class="rewards-section-heading rewards-section-heading--spaced">${esc(kid.name)}'s Bank</div>`;
        kidActive.forEach(([tokenId, token]) => {
          const reward = rewardsObj?.[token.rewardId] || {};
          html += renderBankTokenEl(tokenId, token, {
            showUse: false,
            description: reward?.description || ''
          });
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
    // Refresh allMessages so we don't miss a recent use-request from another tab/device.
    allMessages = await readAllMessages();
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

  const LIGHTNING_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const BAG_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;

  mount.innerHTML = renderBottomSheet(`
    <div class="task-detail-sheet intent-sheet">
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
      ${reward.description ? `<div class="intent-sheet__desc">${esc(reward.description)}</div>` : ''}
      <div class="intent-sheet__options">
        <button class="intent-sheet__option" id="is_useNow" type="button">
          <span class="intent-sheet__option-icon intent-sheet__option-icon--primary">${LIGHTNING_SVG}</span>
          <span class="intent-sheet__option-body">
            <span class="intent-sheet__option-title">Use now</span>
            <span class="intent-sheet__option-desc">Redeem this reward right away</span>
          </span>
        </button>
        <button class="intent-sheet__option" id="is_save" type="button">
          <span class="intent-sheet__option-icon">${BAG_SVG}</span>
          <span class="intent-sheet__option-body">
            <span class="intent-sheet__option-title">Save for later</span>
            <span class="intent-sheet__option-desc">Add to your Bank, use anytime</span>
          </span>
        </button>
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
        <button class="rf-emoji-btn" id="rcf_emojiBtnPreview" type="button" title="Pick emoji" data-bg-color="${esc(reward.iconColor || '#FFE6CC')}">${defaultEmoji}</button>
        <input class="tf-title-input" id="rcf_name" type="text" placeholder="Reward name" value="${esc(reward.name || '')}" autocomplete="off">
      </div>

      <div class="rf-emoji-reveal" id="rcf_emojiReveal">
        <div class="rf-emoji-grid">
          ${REWARD_EMOJIS.map(e => `<button type="button" class="rf-emoji-cell${defaultEmoji === e ? ' is-selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
          <input type="search" id="rcf_customEmoji" class="rf-emoji-custom" placeholder="+">
        </div>
        <div class="rf-color-row">
          <span class="rf-color-label">Background color</span>
          ${renderColorButton(reward.iconColor || '#FFE6CC', 'rcf_iconColor')}
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

      <div class="tf-options-row">
        <span class="tf-options-label">Approval required</span>
        ${renderSwitchToggle({ id: 'rcf_approvalRequired', checked: isApprovalRequired })}
      </div>

      <div class="ef2-secondary-row">
        <button class="ef2-add-chip" id="rcf_advancedChip" type="button">+ Advanced</button>
      </div>

      <div class="ef2-field-reveal" id="rcf_advancedReveal">
        <div class="rf-adv-grid">
          <div class="rf-adv-row">
            <span class="rf-adv-label">Max uses</span>
            <input type="number" inputmode="numeric" id="rcf_maxRedemptions" class="rf-adv-input" value="${reward.maxRedemptions || ''}" min="1" placeholder="Unlimited">
          </div>
          <div class="rf-adv-row">
            <span class="rf-adv-label">Streak required</span>
            <input type="number" inputmode="numeric" id="rcf_streakReq" class="rf-adv-input" value="${reward.streakRequirement || ''}" min="1" placeholder="None">
          </div>
          <div class="rf-adv-row">
            <span class="rf-adv-label">Expires</span>
            ${renderDateInput({
              btnId: 'rcf_expiresAtBtn',
              inputId: 'rcf_expiresAt',
              labelId: 'rcf_expiresAtLabel',
              value: reward.expiresAt ? new Date(reward.expiresAt).toLocaleDateString('en-CA', { timeZone: tz }) : '',
              label: reward.expiresAt ? formatDateShort(new Date(reward.expiresAt).toLocaleDateString('en-CA', { timeZone: tz })) : 'Set date',
            })}
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

  // Date picker (Expires)
  bindDateInput({
    btnId: 'rcf_expiresAtBtn',
    inputId: 'rcf_expiresAt',
    labelId: 'rcf_expiresAtLabel',
    format: (v) => v ? formatDateShort(v) : 'Set date',
  });

  // Emoji + icon background color
  let currentEmoji = defaultEmoji;
  let currentIconColor = reward.iconColor || '#FFE6CC';
  const emojiPreview = mount.querySelector('#rcf_emojiBtnPreview');
  if (emojiPreview) emojiPreview.style.backgroundColor = currentIconColor;
  initColorButton(mount.querySelector('#rcf_iconColor')?.closest('.cpick-wrap'), (color) => {
    currentIconColor = color;
    if (emojiPreview) emojiPreview.style.backgroundColor = color;
  });
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

  // Approval required — native checkbox tracks state, no closure needed.

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
    const approvalRequired = mount.querySelector('#rcf_approvalRequired')?.checked ?? true;
    const data = {
      name, icon: currentEmoji, iconColor: currentIconColor, pointCost: cost, rewardType,
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
  [rewardsObj, allMessages, allAnchors, allSnapshots, allMultipliers, allStreaks] = await Promise.all([
    readRewards(), readAllMessages(), readAllBalanceAnchors(), readAllSnapshots(), readMultipliers(), readAllStreaks()
  ]);
}

init().catch(console.error);
