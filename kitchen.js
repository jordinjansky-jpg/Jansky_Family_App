// kitchen.js — Kitchen page: meal planning + shopping lists
import { initFirebase, readSettings, readPeople, onConnectionChange,
  onAllMessages, writeMessage, markMessageSeen, removeMessage,
  writeBankToken, markBankTokenUsed, readBank, writeMultiplier,
  readKitchenRecipes, readKitchenLists, readKitchenStaples,
  readKitchenPlan, onKitchenItems,
  pushKitchenList, writeKitchenList, removeKitchenList, removeKitchenItem
} from './shared/firebase.js';
import { applyTheme, resolveTheme } from './shared/theme.js';
import { renderHeader, renderNavBar, initNavMore, initBell,
  initOfflineBanner, showConfirm, showToast, renderFab,
  renderBottomSheet, renderEmptyState
} from './shared/components.js';
import { todayKey, escapeHtml } from './shared/utils.js';

const esc = (s) => escapeHtml(String(s ?? ''));

// Worker URL — single constant, never hardcoded elsewhere
const KITCHEN_WORKER_URL = ''; // Set when Worker is deployed (Task 13)

// ── Phase 1: instant theme paint ──────────────────────────────────────────────
applyTheme(resolveTheme());
initFirebase();

// ── State ─────────────────────────────────────────────────────────────────────
let settings, people = [];
let recipes = {}, lists = {}, staples = {}, planCache = {};
let activeTab = localStorage.getItem('dr-kitchen-tab') || 'meals';
let activeListId = null;
let itemsUnsub = null; // Firebase onValue unsubscribe for active list
let currentWeekStart = null; // Monday of the displayed week (Date object)

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  [settings, people] = await Promise.all([
    readSettings().catch(() => null),
    readPeople().then(obj => obj ? Object.entries(obj).map(([id, p]) => ({ id, ...p })) : []),
  ]);

  // Phase 2: apply family theme from Firebase
  applyTheme(resolveTheme(settings?.theme));

  // Header
  document.getElementById('headerMount').innerHTML = renderHeader({
    title: 'Kitchen',
    showBell: true,
    overflowItems: [
      { id: 'admin',    label: 'Admin' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'theme',    label: 'Theme' },
    ],
  });

  // Nav
  document.getElementById('navMount').innerHTML = renderNavBar('kitchen');
  initNavMore(document.getElementById('sheetMount'), () => settings?.theme);
  initOfflineBanner(onConnectionChange);

  // Bell
  initBell(
    () => people,
    () => ({}),
    onAllMessages,
    {
      writeMessageFn: writeMessage,
      markMessageSeenFn: markMessageSeen,
      removeMessageFn: removeMessage,
      writeBankTokenFn: writeBankToken,
      markBankTokenUsedFn: markBankTokenUsed,
      readBankFn: readBank,
      writeMultiplierFn: writeMultiplier,
      getTodayFn: () => todayKey(settings?.timezone),
    }
  );

  // Tabs
  renderTabs();

  // Load data + render active tab
  await loadData();
  renderActiveTab();
  bindFab();
}

// ── Data loading ───────────────────────────────────────────────────────────────
async function loadData() {
  [recipes, lists, staples] = await Promise.all([
    readKitchenRecipes().then(r => r || {}),
    readKitchenLists().then(r => r || {}),
    readKitchenStaples().then(r => r || {}),
  ]);

  // Seed active list if none saved or saved list was deleted
  const listIds = Object.keys(lists);
  if (!activeListId || !lists[activeListId]) {
    activeListId = localStorage.getItem('dr-kitchen-active-list');
    if (!activeListId || !lists[activeListId]) {
      activeListId = listIds[0] || null;
    }
  }
  if (activeListId) localStorage.setItem('dr-kitchen-active-list', activeListId);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function renderTabs() {
  const tabs = ['meals', 'lists'];
  const labels = { meals: 'Meals', lists: 'Lists' };
  document.getElementById('kitchenTabsMount').innerHTML = `
    <nav class="tabs tabs--pill tabs--md" id="kitchenTabs">
      ${tabs.map(t => `
        <button class="tab${t === activeTab ? ' is-active' : ''}" data-tab="${t}" type="button">
          ${esc(labels[t])}
        </button>`).join('')}
    </nav>`;
  document.getElementById('kitchenTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    localStorage.setItem('dr-kitchen-tab', activeTab);
    renderTabs();
    renderActiveTab();
    bindFab();
  });
}

function renderActiveTab() {
  if (activeTab === 'meals') renderMealsTab();
  else renderListsTab();
}

// ── FAB ───────────────────────────────────────────────────────────────────────
function bindFab() {
  const mount = document.getElementById('fabMount');
  mount.innerHTML = renderFab({ id: 'kitchenFab', label: activeTab === 'meals' ? 'Add' : 'Add item' });
  document.getElementById('kitchenFab')?.addEventListener('click', () => {
    if (activeTab === 'meals') openMealFabSheet();
    else openItemAddField();
  });
}

// Placeholder render functions — implemented in subsequent tasks
function renderMealsTab() {
  document.getElementById('kitchenContent').innerHTML = `<p style="padding:var(--spacing-md)">Meals tab — coming in next task</p>`;
}

function renderListsTab() {
  const content = document.getElementById('kitchenContent');
  const listIds = Object.keys(lists).sort((a, b) => (lists[a].sortOrder || 0) - (lists[b].sortOrder || 0));

  if (listIds.length === 0) {
    content.innerHTML = renderEmptyState('', 'No lists yet', 'Create your first shopping list to get started.') +
      `<div style="padding:0 var(--spacing-md)">
        <button class="btn btn--primary btn--full" id="createFirstList">Create a list</button>
      </div>`;
    document.getElementById('createFirstList')?.addEventListener('click', openCreateListSheet);
    return;
  }

  content.innerHTML = `
    <div class="list-switcher">
      ${listIds.map(id => `
        <button class="tab${id === activeListId ? ' is-active' : ''} tab--list"
                data-list-id="${esc(id)}" type="button">
          ${esc(lists[id].name)}
        </button>`).join('')}
      <button class="tab tab--add" id="addListBtn" type="button">+</button>
      <button class="btn-icon list-switcher__manage" id="manageListBtn" aria-label="Manage list" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>
        </svg>
      </button>
    </div>
    <div id="listItemsArea" class="list-content"></div>`;

  document.querySelector('.list-switcher')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-list-id]');
    if (btn) {
      activeListId = btn.dataset.listId;
      localStorage.setItem('dr-kitchen-active-list', activeListId);
      renderListsTab();
      subscribeListItems();
      return;
    }
    if (e.target.closest('#addListBtn')) { openCreateListSheet(); return; }
    if (e.target.closest('#manageListBtn')) { openManageListSheet(); return; }
  });

  subscribeListItems();
}

function subscribeListItems() {
  // Implemented in Task 6
}

function openCreateListSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">New list</h2>
      <button class="btn-icon" id="closeCreateList" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <label class="field">
        <span class="field__label">List name</span>
        <input class="field__input" id="newListName" type="text" placeholder="e.g. Grocery, Costco, Target" autocomplete="off">
      </label>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="cancelCreateList" type="button">Cancel</button>
      <button class="btn btn--primary btn--full" id="saveCreateList" type="button">Create</button>
    </div>`);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    document.getElementById('newListName')?.focus();
  });

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closeCreateList')?.addEventListener('click', close);
  document.getElementById('cancelCreateList')?.addEventListener('click', close);
  document.getElementById('saveCreateList')?.addEventListener('click', async () => {
    const name = document.getElementById('newListName')?.value.trim();
    if (!name) return;
    const sortOrder = Object.keys(lists).length;
    const id = await pushKitchenList({ name, sortOrder, createdAt: firebase.database.ServerValue.TIMESTAMP });
    lists[id] = { name, sortOrder };
    activeListId = id;
    localStorage.setItem('dr-kitchen-active-list', id);
    close();
    renderListsTab();
    bindFab();
  });
}

function openManageListSheet() {
  if (!activeListId || !lists[activeListId]) return;
  const listName = lists[activeListId].name;
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${esc(listName)}</h2>
      <button class="btn-icon" id="closeManageList" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <label class="field">
        <span class="field__label">Rename</span>
        <input class="field__input" id="renameListInput" type="text" value="${esc(listName)}" autocomplete="off">
      </label>
    </div>
    <div class="sheet__footer" style="flex-direction:column;gap:var(--spacing-sm)">
      <button class="btn btn--primary btn--full" id="saveRenameList" type="button">Save name</button>
      <button class="btn btn--secondary btn--full" id="copyListBtn" type="button">Copy list as text</button>
      <button class="btn btn--secondary btn--full" id="clearCheckedBtn" type="button">Clear checked items</button>
      <button class="btn btn--danger btn--full" id="deleteList" type="button">Delete list</button>
    </div>`);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closeManageList')?.addEventListener('click', close);

  document.getElementById('saveRenameList')?.addEventListener('click', async () => {
    const name = document.getElementById('renameListInput')?.value.trim();
    if (!name) return;
    await writeKitchenList(activeListId, { ...lists[activeListId], name });
    lists[activeListId].name = name;
    close();
    renderListsTab();
  });

  document.getElementById('copyListBtn')?.addEventListener('click', () => {
    copyListAsText();
    close();
  });

  document.getElementById('clearCheckedBtn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({ title: 'Remove all checked items?', confirmLabel: 'Clear' });
    if (!confirmed) return;
    const checkedCards = document.querySelectorAll('.card--shopping.is-checked');
    for (const card of checkedCards) {
      await removeKitchenItem(activeListId, card.dataset.itemId);
    }
    close();
  });

  document.getElementById('deleteList')?.addEventListener('click', async () => {
    const itemCount = document.querySelectorAll('.card--shopping').length;
    const msg = itemCount > 0
      ? `Delete "${listName}"? It has ${itemCount} item${itemCount !== 1 ? 's' : ''}.`
      : `Delete "${listName}"?`;
    const confirmed = await showConfirm({ title: msg, confirmLabel: 'Delete', danger: true });
    if (!confirmed) return;
    await removeKitchenList(activeListId);
    delete lists[activeListId];
    activeListId = Object.keys(lists)[0] || null;
    if (activeListId) localStorage.setItem('dr-kitchen-active-list', activeListId);
    else localStorage.removeItem('dr-kitchen-active-list');
    close();
    renderListsTab();
  });
}

function copyListAsText() {
  const tz = settings?.timezone || 'America/Chicago';
  const dateStr = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', timeZone: tz,
  }).format(new Date());
  const listName = lists[activeListId]?.name || 'List';
  const uncheckedCards = document.querySelectorAll('.card--shopping:not(.is-checked)');
  const lines = Array.from(uncheckedCards).map(c => `□ ${c.querySelector('.card__name')?.textContent?.trim()}`);
  const text = `${listName} — ${dateStr}\n${lines.join('\n')}`;

  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('List copied'));
  }
}

function openMealFabSheet() {}
function openItemAddField() {}

init().catch(err => {
  console.error('[Kitchen] init failed', err);
  const el = document.getElementById('kitchenContent');
  if (el) {
    el.innerHTML = `<div class="empty-state">
      <span class="empty-state__icon">⚠</span>
      <h3 class="empty-state__title">Something went wrong</h3>
      <p class="empty-state__subtitle">Could not load Kitchen. Check your connection.</p>
      <button class="btn btn--secondary" onclick="location.reload()">Retry</button>
    </div>`;
  }
});
