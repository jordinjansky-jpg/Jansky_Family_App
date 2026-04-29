// kitchen.js — Kitchen page: meal planning + shopping lists
import { initFirebase, readSettings, readPeople, onConnectionChange,
  onAllMessages, writeMessage, markMessageSeen, removeMessage,
  writeBankToken, markBankTokenUsed, readBank, writeMultiplier,
  readKitchenRecipes, readKitchenLists, readKitchenStaples,
  readKitchenPlan, onKitchenItems
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
  document.getElementById('kitchenContent').innerHTML = `<p style="padding:var(--spacing-md)">Lists tab — coming in next task</p>`;
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
