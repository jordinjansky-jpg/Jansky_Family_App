// kitchen.js — Kitchen page: meal planning + shopping lists
import { initFirebase, readSettings, readPeople, onConnectionChange,
  onAllMessages, writeMessage, markMessageSeen, removeMessage,
  writeBankToken, markBankTokenUsed, readBank, writeMultiplier,
  readKitchenRecipes, readKitchenLists, readKitchenStaples,
  readKitchenPlan, onKitchenItems, readOnce,
  pushKitchenList, writeKitchenList, removeKitchenList, removeKitchenItem,
  pushKitchenItem, writeKitchenItem, pushKitchenStaple,
  writeKitchenPlanSlot, removeKitchenPlanSlot, writeKitchenRecipe, pushKitchenRecipe, removeKitchenRecipe,
  getDb
} from './shared/firebase.js';
import { applyTheme, resolveTheme } from './shared/theme.js';
import { renderHeader, renderNavBar, initNavMore, initBell,
  initOfflineBanner, showConfirm, showToast, renderFab,
  renderBottomSheet, renderEmptyState, renderAddMenu
} from './shared/components.js';
import { todayKey, escapeHtml } from './shared/utils.js';
import { resizeImageForUpload, renderConfirmRow } from './shared/ai-helpers.js';

const esc = (s) => escapeHtml(String(s ?? ''));

// Worker URL — set when Cloudflare Worker is deployed
const KITCHEN_WORKER_URL = 'https://kitchen-import.jordin-jansky.workers.dev';

// Activate a sheet: animate it in and close on overlay click
function activateSheet(mount, onClose) {
  requestAnimationFrame(() => {
    const sheet = document.getElementById('bottomSheet');
    sheet?.classList.add('active');
    sheet?.addEventListener('click', (e) => {
      if (e.target === sheet) { mount.innerHTML = ''; onClose?.(); }
    });
  });
}

// Long-press helper: 600ms hold fires onLongPress; short tap fires onTap(e).
// Movement > 12px cancels. Vibrates 30ms on fire. Touch-event-based for reliability.
function bindLongPress(el, onLongPress, onTap) {
  let timer = null, didLong = false, sx = 0, sy = 0;
  el.addEventListener('touchstart', (e) => {
    didLong = false;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => {
      didLong = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress();
    }, 600);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!timer) return;
    if (Math.abs(e.touches[0].clientX - sx) > 12 || Math.abs(e.touches[0].clientY - sy) > 12) {
      clearTimeout(timer); timer = null;
    }
  }, { passive: true });
  el.addEventListener('touchend', () => { clearTimeout(timer); timer = null; });
  el.addEventListener('touchcancel', () => { clearTimeout(timer); timer = null; });
  el.addEventListener('click', (e) => { if (didLong) { didLong = false; return; } onTap(e); });
}

// ── Phase 1: instant theme paint ──────────────────────────────────────────────
applyTheme(resolveTheme());
initFirebase();

// ── State ─────────────────────────────────────────────────────────────────────
let settings, people = [];
let recipes = {}, lists = {}, staples = {}, planCache = {};
let activeTab = localStorage.getItem('dr-kitchen-tab') || 'meals';
let activeListId = null;
let currentItems = {}; // last items snapshot, used by wand cleanup
let itemsUnsub = null; // Firebase onValue unsubscribe for active list
let currentWeekStart = null; // Monday of the displayed week (Date object)
let recipeFilter = { sort: 'alpha', filter: 'all' }; // alpha | recent; all | favorites

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
  const tabs = ['meals', 'recipes', 'lists'];
  const labels = { meals: 'Meals', recipes: 'Recipes', lists: 'Lists' };
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
  if (activeTab === 'meals') renderMealsTab().catch(console.error);
  else if (activeTab === 'recipes') renderRecipesTab();
  else renderListsTab();
}

// ── FAB ───────────────────────────────────────────────────────────────────────
function bindFab() {
  const mount = document.getElementById('fabMount');
  const label = activeTab === 'meals' ? 'Add' : activeTab === 'recipes' ? 'New recipe' : 'Add items';
  mount.innerHTML = renderFab({ id: 'kitchenFab', label });
  document.getElementById('kitchenFab')?.addEventListener('click', () => {
    if (activeTab === 'meals') { const tz = settings?.timezone || 'America/Chicago'; openPlanMealSheet(todayKey(tz), 'dinner'); }
    else if (activeTab === 'recipes') openRecipeForm(null);
    else { if (!activeListId) openCreateListSheet(); else openItemAddField(); }
  });
}

// ── Meals tab helpers ──────────────────────────────────────────────────────────
const SLOT_ORDER = ['breakfast', 'lunch', 'school-lunch', 'school-lunch-2', 'dinner', 'snack'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', 'school-lunch': 'School 1', 'school-lunch-2': 'School 2', dinner: 'Dinner', snack: 'Snack' };
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function renderMealsTab() {
  const content = document.getElementById('kitchenContent');
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);

  if (!currentWeekStart) {
    currentWeekStart = new Date();
    currentWeekStart.setHours(0, 0, 0, 0);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const planData = await Promise.all(weekDays.map(d => readKitchenPlan(dateKey(d)).then(r => r || {})));
  const weekPlan = {};
  weekDays.forEach((d, i) => { weekPlan[dateKey(d)] = planData[i]; });
  planCache = weekPlan;

  const weekHtml = weekDays.map(d => {
    const dk = dateKey(d);
    const plan = weekPlan[dk] || {};
    const isToday = dk === todayStr;
    const dayName = DAY_ABBR[d.getDay()];
    const dayNum = d.getDate();

    const plannedSlots = SLOT_ORDER.filter(s => plan[s]);
    const slotsHtml = plannedSlots.length > 0
      ? plannedSlots.map(s => {
          const entry = plan[s];
          const name = entry.recipeId ? (recipes[entry.recipeId]?.name || 'Unknown') : (entry.mealName || entry.customName || '');
          return `<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
            <span class="day-block__slot-label">${esc(SLOT_LABELS[s])}</span>
            <span class="day-block__slot-name">${esc(name)}</span>
          </div>`;
        }).join('')
      : `<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
          <span class="day-block__slot-name day-block__slot-name--empty">Tap to plan</span>
        </div>`;

    return `<div class="day-block">
      <div class="day-block__head${isToday ? ' day-block__head--today' : ''}">
        <span>${dayName} ${dayNum}</span>
        ${isToday ? '<span class="day-block__today-pill">Today</span>' : ''}
      </div>
      <div class="day-block__slots">${slotsHtml}</div>
    </div>`;
  }).join('');

  content.innerHTML = `
    <div class="week-strip" id="weekStrip">
      <div class="week-strip__track" id="weekTrack">
        <div class="week-strip__week">${weekHtml}</div>
      </div>
    </div>`;

  bindWeekStripSwipe();

  content.querySelectorAll('.day-block__slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const dk = slot.dataset.date;
      const s = slot.dataset.slot;
      const entry = planCache[dk]?.[s];
      if (entry) openSlotEditSheet(dk, s, entry);
      else openPlanMealSheet(dk, s);
    });
  });
}

function renderRecipesTab() {
  const content = document.getElementById('kitchenContent');
  let recipeEntries = Object.entries(recipes);
  if (recipeFilter.filter === 'favorites') recipeEntries = recipeEntries.filter(([, r]) => r.isFavorite);
  if (recipeFilter.sort === 'alpha') {
    recipeEntries.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
  } else {
    recipeEntries.sort((a, b) => {
      if (b[1].isFavorite !== a[1].isFavorite) return b[1].isFavorite ? 1 : -1;
      return (b[1].lastUsed || 0) - (a[1].lastUsed || 0);
    });
  }

  const linkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const starFilled = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const starEmpty = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  const filterCount = (recipeFilter.filter !== 'all' ? 1 : 0) + (recipeFilter.sort !== 'alpha' ? 1 : 0);
  const filterLabel = filterCount > 0 ? `Filter & Sort · ${filterCount}` : 'Filter & Sort';

  const recipeLibHtml = recipeEntries.length > 0
    ? recipeEntries.map(([id, r]) => `
        <article class="card" data-recipe-id="${esc(id)}" style="cursor:pointer;display:flex;align-items:center">
          <div class="card__body" style="flex:1;min-width:0">
            <div class="card__title">${esc(r.name)}</div>
            <div class="card__meta">
              ${r.ingredients?.length ? `${r.ingredients.length} ingredient${r.ingredients.length !== 1 ? 's' : ''}` : 'No ingredients'}
            </div>
          </div>
          <div class="rl-card-actions">
            <button class="btn-icon rl-fav-btn${r.isFavorite ? ' is-fav' : ''}"
              data-fav-recipe="${esc(id)}" type="button" aria-label="${r.isFavorite ? 'Unfavorite' : 'Favorite'}">
              ${r.isFavorite ? starFilled : starEmpty}
            </button>
            ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"
                class="btn-icon" aria-label="Open recipe link" data-recipe-link="${esc(id)}">${linkIcon}</a>` : ''}
          </div>
        </article>`).join('')
    : renderEmptyState('', 'No recipes yet', 'Tap "New recipe" to add your first.');

  content.innerHTML = `
    <div style="padding:var(--spacing-sm) 0 var(--spacing-xl)">
      <div style="display:flex;align-items:center;gap:var(--spacing-xs);margin-bottom:var(--spacing-sm)">
        <button class="btn btn--ghost" id="findRecipesBtn" type="button">Find ideas &#x2197;</button>
        <button class="chip${filterCount > 0 ? ' chip--active' : ''}" id="recipeFilterBtn" type="button"
          style="margin-left:auto">${filterLabel} &#9662;</button>
      </div>
      <div id="recipeLibrary">${recipeLibHtml}</div>
    </div>`;

  document.getElementById('findRecipesBtn')?.addEventListener('click', openFindRecipesSheet);
  document.getElementById('recipeFilterBtn')?.addEventListener('click', openRecipeFilterSheet);

  content.querySelectorAll('[data-recipe-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-recipe-link]') || e.target.closest('[data-fav-recipe]')) return;
      openRecipeDetailSheet(card.dataset.recipeId);
    });
  });

  content.querySelectorAll('[data-fav-recipe]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.favRecipe;
      const newFav = !recipes[id]?.isFavorite;
      recipes[id] = { ...recipes[id], isFavorite: newFav };
      await writeKitchenRecipe(id, { ...recipes[id] });
      renderRecipesTab();
    });
  });
}

function bindWeekStripSwipe() {
  const strip = document.getElementById('weekStrip');
  if (!strip) return;
  let startX = 0, startY = 0, moved = false;
  strip.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false;
  }, { passive: true });
  strip.addEventListener('touchmove', () => { moved = true; }, { passive: true });
  strip.addEventListener('touchend', async (e) => {
    if (!moved) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    const dir = dx < 0 ? 1 : -1;
    currentWeekStart = new Date(currentWeekStart);
    currentWeekStart.setDate(currentWeekStart.getDate() + dir * 7);
    await renderMealsTab();
  });
}

function openPlanMealSheet(preDate, preSlot, preRecipeId = null) {
  const mount = document.getElementById('sheetMount');
  let selectedRecipeId = preRecipeId;

  function getRecipeEntries() {
    return Object.entries(recipes).sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0));
  }

  const slotOptions = SLOT_ORDER
    .map(s => `<option value="${esc(s)}"${s === preSlot ? ' selected' : ''}>${esc(SLOT_LABELS[s])}</option>`)
    .join('');

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function formatDateLabel(dk) {
    const d = new Date(dk + 'T12:00:00');
    return `${DAY_ABBR[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  const starFilled = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const starEmpty = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  function buildRecipeRows(filter) {
    const entries = getRecipeEntries();
    const lc = filter?.toLowerCase() || '';
    if (lc) {
      const filtered = entries.filter(([, r]) => r.name.toLowerCase().includes(lc));
      if (filtered.length === 0) return `<div class="recipe-pick__none">No match — will save as "${esc(filter)}"</div>`;
      return filtered.map(([id, r]) => buildPickRow(id, r)).join('');
    }
    if (entries.length === 0) {
      return `<div class="recipe-pick__none">No recipes yet. Type any meal name to continue.</div>`;
    }
    const favorites = entries.filter(([, r]) => r.isFavorite);
    const recent = entries.filter(([, r]) => !r.isFavorite).slice(0, 3);
    return [...favorites, ...recent].map(([id, r]) => buildPickRow(id, r)).join('');
  }

  function buildPickRow(id, r) {
    const isSelected = selectedRecipeId === id;
    return `<div class="recipe-pick__item">
      <button class="recipe-pick__row recipe-pick__pick${isSelected ? ' is-selected' : ''}"
        data-recipe-pick="${esc(id)}" type="button">
        <span>${esc(r.name)}</span>
        ${isSelected ? '<span class="recipe-pick__check">&#10003;</span>' : ''}
      </button>
      <button class="recipe-pick__fav-btn${r.isFavorite ? ' is-fav' : ''}"
        data-fav-id="${esc(id)}" type="button" aria-label="${r.isFavorite ? 'Unfavorite' : 'Favorite'}">
        ${r.isFavorite ? starFilled : starEmpty}
      </button>
    </div>`;
  }

  const preRecipeName = preRecipeId ? (recipes[preRecipeId]?.name || '') : '';

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Plan a meal</h2>
      <button class="ef2-icon-btn" id="kp_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="kp-day-slot-row">
      <label class="field">
        <span class="field__label">Day</span>
        <div class="kp-date-wrap">
          <button class="kp-date-btn" id="kp_datebtn" type="button">${formatDateLabel(preDate)}</button>
          <input type="date" id="kp_day" class="kp-date-input" value="${esc(preDate)}">
        </div>
      </label>
      <label class="field">
        <span class="field__label">Meal slot</span>
        <select id="kp_slot">${slotOptions}</select>
      </label>
    </div>
    <div class="kp-meal-section">
      <div class="kp-meal-header">
        <span class="field__label">Meal</span>
        <button class="btn btn--ghost btn--sm" id="kp_createRecipe" type="button">+ New recipe</button>
      </div>
      <input id="kp_search" type="text" autocomplete="off"
        placeholder="Search recipes or type any name…"
        value="${esc(preRecipeName)}">
    </div>
    <div class="recipe-pick-list" id="recipePick">${buildRecipeRows(preRecipeName)}</div>
    <div class="kp-footer">
      <button class="btn btn--ghost" id="kp_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="kp_save" type="button"
        ${preRecipeName || selectedRecipeId ? '' : 'disabled'}>Save</button>
    </div>`);
  activateSheet(mount);
  if (!preRecipeName) document.getElementById('kp_search')?.focus();

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('kp_close')?.addEventListener('click', close);
  document.getElementById('kp_cancel')?.addEventListener('click', close);

  document.getElementById('kp_datebtn')?.addEventListener('click', () => {
    const inp = document.getElementById('kp_day');
    try { inp.showPicker(); } catch { inp.focus(); }
  });
  document.getElementById('kp_day')?.addEventListener('change', (e) => {
    if (e.target.value) document.getElementById('kp_datebtn').textContent = formatDateLabel(e.target.value);
  });

  document.getElementById('kp_createRecipe')?.addEventListener('click', () => {
    const day = document.getElementById('kp_day')?.value || preDate;
    const slot = document.getElementById('kp_slot')?.value || preSlot;
    mount.innerHTML = '';
    openRecipeForm(null, (newId) => openPlanMealSheet(day, slot, newId));
  });

  function updateSaveBtn() {
    const val = document.getElementById('kp_search')?.value.trim();
    document.getElementById('kp_save').disabled = !(val || selectedRecipeId);
  }

  function bindPickRows() {
    document.getElementById('recipePick')?.querySelectorAll('[data-recipe-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (selectedRecipeId === btn.dataset.recipePick) {
          selectedRecipeId = null;
          document.getElementById('kp_search').value = '';
        } else {
          selectedRecipeId = btn.dataset.recipePick;
          document.getElementById('kp_search').value = recipes[selectedRecipeId]?.name || '';
        }
        document.getElementById('recipePick').innerHTML = buildRecipeRows(document.getElementById('kp_search').value);
        bindPickRows();
        updateSaveBtn();
      });
    });
    document.getElementById('recipePick')?.querySelectorAll('[data-fav-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.favId;
        const newFav = !recipes[id]?.isFavorite;
        recipes[id] = { ...recipes[id], isFavorite: newFav };
        await writeKitchenRecipe(id, { ...recipes[id] });
        document.getElementById('recipePick').innerHTML = buildRecipeRows(document.getElementById('kp_search').value);
        bindPickRows();
      });
    });
  }
  bindPickRows();

  document.getElementById('kp_search')?.addEventListener('input', (e) => {
    selectedRecipeId = null;
    document.getElementById('recipePick').innerHTML = buildRecipeRows(e.target.value);
    bindPickRows();
    updateSaveBtn();
  });

  document.getElementById('kp_save')?.addEventListener('click', async () => {
    const day = document.getElementById('kp_day')?.value;
    const slot = document.getElementById('kp_slot')?.value;
    const typed = document.getElementById('kp_search')?.value.trim();
    if (!day || !slot || (!selectedRecipeId && !typed)) return;

    let data;
    if (selectedRecipeId) {
      data = { recipeId: selectedRecipeId, source: 'manual' };
    } else {
      const match = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === typed.toLowerCase());
      if (match) {
        selectedRecipeId = match[0];
        data = { recipeId: match[0], source: 'manual' };
      } else {
        data = { customName: typed, source: 'manual' };
      }
    }

    await writeKitchenPlanSlot(day, slot, data);
    if (selectedRecipeId) {
      await writeKitchenRecipe(selectedRecipeId, { ...recipes[selectedRecipeId], lastUsed: firebase.database.ServerValue.TIMESTAMP });
      recipes[selectedRecipeId].lastUsed = Date.now();
    }
    mount.innerHTML = '';
    await renderMealsTab();
    showToast('Meal planned');
  });
}

function openSlotEditSheet(dk, slot, entry) {
  const mount = document.getElementById('sheetMount');
  const name = entry.recipeId ? (recipes[entry.recipeId]?.name || 'Unknown recipe') : (entry.mealName || entry.customName || '');
  const d = new Date(dk + 'T12:00:00');
  const dayLabel = `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${esc(SLOT_LABELS[slot] || slot)}</h2>
      <span style="font-size:var(--font-sm);color:var(--text-muted)">${esc(dayLabel)}</span>
    </div>
    <div class="sheet__content">
      <div style="font-size:var(--font-md);font-weight:600;margin-bottom:var(--spacing-md)">${esc(name)}</div>
      <button class="btn btn--secondary btn--full" id="changeSlotMeal" type="button">Change meal</button>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--danger" id="removeSlotMeal" type="button">Remove</button>
    </div>`);
  activateSheet(mount);

  document.getElementById('changeSlotMeal')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openPlanMealSheet(dk, slot, entry.recipeId || null);
  });
  document.getElementById('removeSlotMeal')?.addEventListener('click', async () => {
    await removeKitchenPlanSlot(dk, slot);
    mount.innerHTML = '';
    await renderMealsTab();
    showToast('Meal removed');
  });
}
function openRecipeDetailSheet(recipeId) {
  const recipe = recipes[recipeId];
  if (!recipe) return;
  const mount = document.getElementById('sheetMount');
  const hasIngredients = (recipe.ingredients?.length || 0) > 0;

  const LINK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${esc(recipe.name)}</h2>
      <button class="ef2-icon-btn" id="closeRecipeDetail" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <div class="rd-plan-row" style="display:flex;align-items:center;gap:var(--spacing-xs);margin-bottom:var(--spacing-md)">
        <button class="btn btn--primary" id="planThisMealBtn" style="flex:1" type="button">Plan this meal</button>
        ${recipe.url ? `<a href="${esc(recipe.url)}" target="_blank" rel="noopener noreferrer"
          class="btn btn--secondary rd-link-btn" aria-label="Open recipe" type="button">${LINK_SVG}</a>` : ''}
      </div>

      ${hasIngredients ? `
        <div class="field__label" style="margin-bottom:var(--spacing-xs)">Ingredients</div>
        <ul style="margin:0 0 var(--spacing-md);padding-left:var(--spacing-md);font-size:var(--font-sm)">
          ${recipe.ingredients.map(i => `<li>${i.qty ? `<span style="color:var(--text-muted);margin-right:6px">${esc(i.qty)}</span>` : ''}${esc(i.name)}</li>`).join('')}
        </ul>` : ''}

      ${recipe.notes ? `
        <div class="field__label" style="margin-bottom:var(--spacing-xs)">Notes</div>
        <p style="font-size:var(--font-sm);color:var(--text-muted);margin-bottom:var(--spacing-md);white-space:pre-line">${esc(recipe.notes)}</p>` : ''}
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="editRecipeBtn" type="button">Edit</button>
      <button class="btn btn--danger btn--full" id="deleteRecipeBtn" type="button">Delete</button>
    </div>`);
  activateSheet(mount);

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closeRecipeDetail')?.addEventListener('click', close);

  document.getElementById('planThisMealBtn')?.addEventListener('click', () => {
    close();
    const tz = settings?.timezone || 'America/Chicago';
    openPlanMealSheet(todayKey(tz), 'dinner', recipeId);
  });

  document.getElementById('editRecipeBtn')?.addEventListener('click', () => {
    close();
    openRecipeForm(recipeId);
  });

  document.getElementById('deleteRecipeBtn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({ title: `Delete "${recipe.name}"?`, confirmLabel: 'Delete', danger: true });
    if (!confirmed) return;
    await removeKitchenRecipe(recipeId);
    delete recipes[recipeId];
    close();
    renderActiveTab();
    showToast('Recipe deleted');
  });
}

async function pickList(listEntries) {
  return new Promise((resolve) => {
    const mount = document.getElementById('sheetMount');
    mount.innerHTML = renderBottomSheet(`
      <div class="sheet__header">
        <h2 class="sheet__title">Add to which list?</h2>
      </div>
      <div class="sheet__content" style="display:flex;flex-direction:column;gap:var(--spacing-xs)">
        ${listEntries.map(([id, l]) =>
          `<button class="btn btn--secondary btn--full" data-pick-id="${esc(id)}" type="button">${esc(l.name)}</button>`
        ).join('')}
        <button class="btn btn--ghost btn--full" id="cancelPickList" type="button">Cancel</button>
      </div>`);
    activateSheet(mount);

    mount.querySelectorAll('[data-pick-id]').forEach(btn => {
      btn.addEventListener('click', () => { mount.innerHTML = ''; resolve(btn.dataset.pickId); });
    });
    document.getElementById('cancelPickList')?.addEventListener('click', () => { mount.innerHTML = ''; resolve(null); });
  });
}

function openFindRecipesSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Find recipe ideas</h2>
      <button class="btn-icon" id="closeFindRecipes" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <p style="font-size:var(--font-sm);color:var(--text-muted);margin-bottom:var(--spacing-md)">
        These sites work great with URL import.
      </p>
      <div style="display:flex;flex-direction:column;gap:var(--spacing-xs)">
        ${RECIPE_SITES.map(site =>
          `<a href="${esc(site.url)}" target="_blank" rel="noopener noreferrer"
              class="btn btn--secondary btn--full">${esc(site.name)} &#x2197;</a>`
        ).join('')}
      </div>
    </div>`);
  activateSheet(mount);
  document.getElementById('closeFindRecipes')?.addEventListener('click', () => { mount.innerHTML = ''; });
}
function openRecipeFilterSheet() {
  const mount = document.getElementById('sheetMount');
  const filterOpts = [{ v: 'all', l: 'All' }, { v: 'favorites', l: 'Favorites' }];
  const sortOpts = [{ v: 'alpha', l: 'A – Z' }, { v: 'recent', l: 'Most recent' }];
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header"><h2 class="sheet__title">Filter & Sort</h2></div>
    <div class="sheet__content">
      <div class="filter-section">
        <div class="filter-section__label">Show</div>
        <div class="filter-chips">
          ${filterOpts.map(o => `<button class="chip${recipeFilter.filter === o.v ? ' chip--active' : ''}" data-rf="${o.v}" type="button">${o.l}</button>`).join('')}
        </div>
      </div>
      <div class="filter-section">
        <div class="filter-section__label">Sort by</div>
        <div class="filter-chips">
          ${sortOpts.map(o => `<button class="chip${recipeFilter.sort === o.v ? ' chip--active' : ''}" data-rs="${o.v}" type="button">${o.l}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--ghost" id="rfCancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="rfApply" type="button">Apply</button>
    </div>`);
  activateSheet(mount);
  mount.querySelectorAll('[data-rf]').forEach(b => b.addEventListener('click', () => {
    mount.querySelectorAll('[data-rf]').forEach(x => x.classList.remove('chip--active'));
    b.classList.add('chip--active');
  }));
  mount.querySelectorAll('[data-rs]').forEach(b => b.addEventListener('click', () => {
    mount.querySelectorAll('[data-rs]').forEach(x => x.classList.remove('chip--active'));
    b.classList.add('chip--active');
  }));
  document.getElementById('rfCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('rfApply')?.addEventListener('click', () => {
    recipeFilter.filter = mount.querySelector('[data-rf].chip--active')?.dataset.rf || 'all';
    recipeFilter.sort = mount.querySelector('[data-rs].chip--active')?.dataset.rs || 'alpha';
    mount.innerHTML = '';
    renderRecipesTab();
  });
}

function openMealFabSheet() {
  const mount = document.getElementById('sheetMount');
  const options = [
    {
      key: 'schedule',
      label: 'Schedule meal',
      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    },
    {
      key: 'recipe',
      label: 'Create recipe',
      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>',
    },
  ];
  mount.innerHTML = renderBottomSheet(renderAddMenu(options));
  activateSheet(mount);

  mount.querySelector('.add-menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    mount.innerHTML = '';
    if (btn.dataset.action === 'schedule') {
      const tz = settings?.timezone || 'America/Chicago';
      openPlanMealSheet(todayKey(tz), 'dinner');
    } else {
      openRecipeForm(null);
    }
  });
}

function openBulkAddSheet() {
  if (!activeListId) { openCreateListSheet(); return; }
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Add items</h2>
    </div>
    <p class="kb-hint">Type each item and press Enter, or paste a list.</p>
    <label class="field">
      <input class="field__input" id="bulkAddInput" type="text"
        placeholder="e.g. Milk" autocomplete="off" autocorrect="off">
    </label>
    <div id="bulkAddedList"></div>
    <div class="kb-footer">
      <button class="btn btn--primary" id="bulkAddDone" type="button">Done</button>
    </div>`);
  activateSheet(mount);

  let addedItems = [];

  function refreshAddedList() {
    const el = document.getElementById('bulkAddedList');
    if (!el) return;
    const starFilled = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    const starEmpty = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    el.innerHTML = addedItems.map((n, i) => {
      const isSaved = Object.values(staples).some(s => s.name.toLowerCase() === n.toLowerCase());
      return `<div class="kb-added-row">
        <span class="kb-added-name">${esc(n)}</span>
        <button class="btn-icon kb-added-star${isSaved ? ' is-saved-staple' : ''}" data-staple="${i}"
          type="button" aria-label="${isSaved ? 'Saved to staples' : 'Save to staples'}">
          ${isSaved ? starFilled : starEmpty}
        </button>
        <button class="btn-icon" data-remove="${i}" type="button" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-staple]').forEach(btn => {
      if (btn.classList.contains('is-saved-staple')) return;
      btn.addEventListener('click', async () => {
        const name = addedItems[parseInt(btn.dataset.staple, 10)];
        if (!name) return;
        const sid = await pushKitchenStaple({ name, category: null });
        staples[sid] = { name, category: null };
        showToast(`"${name}" saved to staples`);
        refreshAddedList();
      });
    });
    el.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        addedItems.splice(parseInt(btn.dataset.remove, 10), 1);
        refreshAddedList();
      });
    });
  }

  async function addItem(name) {
    const trimmed = name.trim();
    if (!trimmed || !activeListId) return;
    addedItems.push(trimmed);
    const id = await pushKitchenItem(activeListId, {
      name: trimmed,
      checked: false,
      addedAt: firebase.database.ServerValue.TIMESTAMP,
      category: null,
    });
    refreshAddedList();
  }

  const input = document.getElementById('bulkAddInput');
  input?.focus();

  input?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (val) { input.value = ''; await addItem(val); input.focus(); }
    }
  });

  input?.addEventListener('paste', async (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const lines = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) { input.value = (input.value + text).trim(); return; }
    for (const line of lines) await addItem(line);
    input.value = '';
    input.focus();
  });

  document.getElementById('bulkAddDone')?.addEventListener('click', () => {
    mount.innerHTML = '';
    if (addedItems.length > 0) showToast(`Added ${addedItems.length} item${addedItems.length !== 1 ? 's' : ''}`);
  });
}

const RECIPE_SITES = [
  { name: 'AllRecipes',     url: 'https://www.allrecipes.com' },
  { name: 'Budget Bytes',   url: 'https://www.budgetbytes.com' },
  { name: 'Food Network',   url: 'https://www.foodnetwork.com/recipes' },
  { name: 'Tasty',          url: 'https://tasty.co' },
  { name: 'Pinch of Yum',   url: 'https://pinchofyum.com' },
  { name: 'Simply Recipes', url: 'https://www.simplyrecipes.com' },
  { name: 'Delish',         url: 'https://www.delish.com/cooking/recipe-ideas/' },
  { name: 'The Kitchn',     url: 'https://www.thekitchn.com/recipes' },
];

function openRecipeForm(recipeId, onSave = null) {
  const existing = recipeId ? recipes[recipeId] : null;
  const ingredients = existing?.ingredients ? [...existing.ingredients] : [];

  const mount = document.getElementById('sheetMount');

  function buildIngredientList() {
    return ingredients.map((ing, i) =>
      `<div class="ingredient-row" data-index="${i}">
        <input class="ingredient-qty" data-edit-index="${i}" data-edit-field="qty" type="text" value="${esc(ing.qty || '')}" placeholder="qty" autocomplete="off">
        <input class="ingredient-name" data-edit-index="${i}" data-edit-field="name" type="text" value="${esc(ing.name || '')}" placeholder="ingredient" autocomplete="off">
        <button class="btn-icon" data-remove-index="${i}" type="button" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`
    ).join('');
  }

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${existing ? 'Edit recipe' : 'New recipe'}</h2>
      <button class="ef2-icon-btn" id="kr_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="kr-section">
      <label class="field">
        <span class="field__label">Recipe link</span>
        <input id="recipeUrl" type="url" placeholder="https://…"
          value="${esc(existing?.url || '')}" autocomplete="off">
      </label>
      <span class="kr-import-status" id="urlImportStatus"></span>
    </div>

    <div class="kr-title-row">
      <input class="kr-title-input" id="recipeName" type="text"
        value="${esc(existing?.name || '')}" placeholder="Recipe name…" autocomplete="off">
      <input type="file" accept="image/*" capture="environment" id="kr_photoCamera" hidden>
      <input type="file" accept="image/*" id="kr_photoGallery" hidden>
      <input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif" id="kr_photoFiles" hidden>
      <button class="ef2-icon-btn" id="kr_photo" type="button" aria-label="Import from photo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
    </div>

    <div class="kr-section">
      <span class="field__label">Ingredients</span>
      <div id="ingredientList">${buildIngredientList()}</div>
      <div class="kr-add-ingredient-row">
        <input class="kr-add-qty" id="newIngredientQty" type="text"
          placeholder="qty" autocomplete="off">
        <input class="field__input" id="newIngredientInput" type="text"
          placeholder="Add ingredient…" autocomplete="off">
        <button class="btn btn--secondary" id="addIngredientBtn" type="button">Add</button>
      </div>
    </div>

    <div class="kr-section">
      <label class="field">
        <span class="field__label">Notes</span>
        <textarea id="recipeNotes" class="field__input kr-notes" rows="2" placeholder="Description, tips, source…" autocomplete="off">${esc(existing?.notes || '')}</textarea>
      </label>
    </div>

    <div class="kr-footer">
      <button class="btn btn--ghost" id="kr_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="kr_save" type="button">Save</button>
    </div>`);
  activateSheet(mount);
  requestAnimationFrame(() => (existing ? document.getElementById('recipeName') : document.getElementById('recipeUrl'))?.focus());

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('kr_close')?.addEventListener('click', close);
  document.getElementById('kr_cancel')?.addEventListener('click', close);

  function addIngredient() {
    const val = document.getElementById('newIngredientInput')?.value.trim();
    if (!val) return;
    const qty = document.getElementById('newIngredientQty')?.value.trim() || null;
    ingredients.push({ name: cleanIngredientName(val), qty });
    document.getElementById('newIngredientInput').value = '';
    document.getElementById('newIngredientQty').value = '';
    document.getElementById('ingredientList').innerHTML = buildIngredientList();
    bindIngredientRowEvents();
    document.getElementById('newIngredientInput').focus();
  }
  document.getElementById('addIngredientBtn')?.addEventListener('click', addIngredient);
  document.getElementById('newIngredientInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addIngredient(); }
  });

  function bindRemoveButtons() {
    document.getElementById('ingredientList')?.querySelectorAll('[data-remove-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeIndex, 10);
        ingredients.splice(idx, 1);
        document.getElementById('ingredientList').innerHTML = buildIngredientList();
        bindIngredientRowEvents();
      });
    });
  }

  function bindEditInputs() {
    document.getElementById('ingredientList')?.querySelectorAll('[data-edit-index]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.editIndex, 10);
        const field = inp.dataset.editField;
        if (!ingredients[idx]) return;
        ingredients[idx] = { ...ingredients[idx], [field]: inp.value.trim() || null };
      });
    });
  }

  function bindIngredientRowEvents() {
    bindRemoveButtons();
    bindEditInputs();
  }
  bindIngredientRowEvents();

  async function runImport(type, input) {
    const photoBtn = document.getElementById('kr_photo');
    const status = document.getElementById('urlImportStatus');
    if (photoBtn) photoBtn.disabled = true;
    if (status) status.style.display = 'none';
    try {
      const res = await fetch(KITCHEN_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, input }),
      });
      const data = await res.json();
      // Always preserve the URL — even on partial/full failure — so the user can save & view it.
      if (data.url && !document.getElementById('recipeUrl').value) {
        document.getElementById('recipeUrl').value = data.url;
      }
      if (data.name && !document.getElementById('recipeName').value) {
        document.getElementById('recipeName').value = data.name;
        document.getElementById('recipeName')?.focus();
      }
      if (data.notes && !document.getElementById('recipeNotes').value) {
        document.getElementById('recipeNotes').value = data.notes;
      }
      if (data.ingredients?.length) {
        data.ingredients.forEach(ing => {
          if (!ing.name) return;
          const cleaned = cleanIngredientName(ing.name);
          if (cleaned) ingredients.push({ name: cleaned, qty: ing.qty || null });
        });
        document.getElementById('ingredientList').innerHTML = buildIngredientList();
        bindIngredientRowEvents();
      }

      if (status) {
        const ingCount = data.ingredients?.length || 0;
        if (ingCount > 0) {
          status.textContent = `Imported ${ingCount} ingredient${ingCount !== 1 ? 's' : ''}`;
          status.style.color = 'var(--text-muted)';
        } else if (data.name) {
          status.textContent = 'Got the title — no ingredients found.';
          status.style.color = 'var(--text-muted)';
        } else {
          status.textContent = 'Couldn\'t read that link — URL kept.';
          status.style.color = 'var(--text-muted)';
        }
        status.style.display = 'inline';
      }
    } catch {
      if (status) { status.textContent = 'Import failed.'; status.style.color = 'var(--danger)'; status.style.display = 'inline'; }
    } finally {
      if (photoBtn) photoBtn.disabled = false;
    }
  }

  // Auto-import when URL is pasted or typed then blurred
  let lastImportedUrl = '';
  function maybeAutoImportUrl() {
    const url = document.getElementById('recipeUrl')?.value.trim();
    if (!url || !url.startsWith('http') || url === lastImportedUrl) return;
    lastImportedUrl = url;
    runImport('url', url);
  }
  document.getElementById('recipeUrl')?.addEventListener('paste', () => setTimeout(maybeAutoImportUrl, 50));
  document.getElementById('recipeUrl')?.addEventListener('blur', maybeAutoImportUrl);

  const CAM_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  const GAL_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  const FILE_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  let krPhotoContext = '';
  document.getElementById('kr_photo')?.addEventListener('click', () => {
    const existingName = document.getElementById('recipeName')?.value.trim() || '';
    const overlay = document.createElement('div');
    overlay.className = 'ef2-subsheet-overlay';
    overlay.innerHTML = `<div class="ef2-subsheet">
      <div class="sheet__header"><h2 class="sheet__title">Import from</h2></div>
      <div class="sheet__content">
        <div class="field" style="margin-bottom:var(--spacing-sm)">
          <label class="field__label" for="kr_photoCtx">Optional note for AI</label>
          <input class="field__input" id="kr_photoCtx" type="text" placeholder="e.g. NYT Cooking pasta recipe" value="${existingName.replace(/"/g, '&quot;')}" autocomplete="off">
        </div>
        <button class="ef2-source-btn" data-source="camera" type="button"><span class="ef2-source-icon">${CAM_SVG}</span><span>Camera</span></button>
        <button class="ef2-source-btn" data-source="gallery" type="button"><span class="ef2-source-icon">${GAL_SVG}</span><span>Gallery</span></button>
        <button class="ef2-source-btn" data-source="files" type="button"><span class="ef2-source-icon">${FILE_SVG}</span><span>Files</span></button>
      </div>
      <div class="sheet__footer">
        <button class="btn btn--ghost" id="kr_photoSourceCancel" type="button">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    const closeOverlay = () => {
      overlay.classList.remove('active');
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 320);
    };
    overlay.querySelector('#kr_photoSourceCancel')?.addEventListener('click', closeOverlay);
    overlay.querySelectorAll('.ef2-source-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        krPhotoContext = overlay.querySelector('#kr_photoCtx')?.value.trim() || '';
        const src = btn.dataset.source;
        if (src === 'camera') document.getElementById('kr_photoCamera')?.click();
        else if (src === 'gallery') document.getElementById('kr_photoGallery')?.click();
        else document.getElementById('kr_photoFiles')?.click();
        closeOverlay();
      });
    });
  });

  ['kr_photoCamera', 'kr_photoGallery', 'kr_photoFiles'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const { base64, mediaType } = await resizeImageForUpload(file);
      runImport('screenshot', { base64, mediaType, context: krPhotoContext });
    });
  });

  document.getElementById('kr_save')?.addEventListener('click', async () => {
    const name = document.getElementById('recipeName')?.value.trim();
    if (!name) {
      const inp = document.getElementById('recipeName');
      inp?.classList.add('kr-shake');
      inp?.addEventListener('animationend', () => inp.classList.remove('kr-shake'), { once: true });
      return;
    }
    const url = document.getElementById('recipeUrl')?.value.trim() || null;
    const data = {
      name,
      url,
      notes: document.getElementById('recipeNotes')?.value.trim() || null,
      source: existing?.source || 'manual',
      ingredients,
      isFavorite: existing?.isFavorite || false,
      lastUsed: existing?.lastUsed || null,
    };

    if (recipeId) {
      await writeKitchenRecipe(recipeId, { ...data, createdAt: existing?.createdAt });
      recipes[recipeId] = { ...data, createdAt: existing?.createdAt };
      close();
      if (onSave) { onSave(recipeId); } else { renderActiveTab(); }
      showToast('Recipe updated');
    } else {
      const id = await pushKitchenRecipe({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      recipes[id] = data;
      close();
      if (onSave) { onSave(id); } else { renderActiveTab(); }
      showToast('Recipe saved');
    }
  });
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

  const WAND_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2L19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2L11 5"/></svg>`;
  const CAM_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

  content.innerHTML = `
    <div class="list-switcher">
      <div class="list-switcher__tabs">
        ${listIds.map(id => `
          <button class="tab${id === activeListId ? ' is-active' : ''} tab--list"
                  data-list-id="${esc(id)}" type="button">
            ${esc(lists[id].name)}
          </button>`).join('')}
      </div>
      <div class="list-switcher__actions">
        <button class="btn-icon" id="addListBtn" aria-label="New list" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="btn-icon" id="manageListBtn" aria-label="Manage list" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="list-toolbar">
      <button class="staples-btn" id="staplesTopBtn">Add from staples</button>
      <div style="display:flex;align-items:center;gap:var(--spacing-xs)">
        <button class="list-camera-btn" id="listCameraBtn" type="button" aria-label="Add from photo">${CAM_SVG}</button>
        <button class="list-wand-btn" id="listCleanupBtn" type="button" aria-label="Clean up list with AI" title="Clean up list" disabled>${WAND_SVG}</button>
      </div>
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

  document.getElementById('staplesTopBtn')?.addEventListener('click', openStaplesSheet);
  document.getElementById('listCameraBtn')?.addEventListener('click', openListPhotoSourceSheet);
  document.getElementById('listCleanupBtn')?.addEventListener('click', () => runListCleanup(currentItems));

  subscribeListItems();
}

function subscribeListItems() {
  if (itemsUnsub) { itemsUnsub(); itemsUnsub = null; }
  if (!activeListId) { renderItemsArea({}); return; }
  itemsUnsub = onKitchenItems(activeListId, (items) => renderItemsArea(items || {}));
}

function renderItemsArea(items) {
  const area = document.getElementById('listItemsArea');
  if (!area) return;

  currentItems = items;
  const allItems = Object.entries(items);
  const unchecked = allItems.filter(([, v]) => !v.checked).sort((a, b) => (a[1].addedAt || 0) - (b[1].addedAt || 0));
  const checked   = allItems.filter(([, v]) => v.checked).sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0));

  const wand = document.getElementById('listCleanupBtn');
  if (wand) wand.disabled = allItems.length === 0;

  if (allItems.length === 0) {
    area.innerHTML = renderEmptyState('', 'List is empty', 'Tap + to add your first item.');
    return;
  }

  // Group unchecked by category
  const byCategory = {};
  for (const [id, item] of unchecked) {
    const cat = item.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push([id, item]);
  }

  const CATEGORY_ORDER = ['Produce','Meat & Seafood','Dairy','Bakery','Frozen','Pantry',
    'Beverages','Snacks','Household','Personal Care','Baby & Kids','Pets',
    'Clothing','Electronics','Toys','Other'];

  const sortedCats = Object.keys(byCategory).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let html = '';

  for (const cat of sortedCats) {
    html += `<div class="shopping-category-label">${esc(cat)}</div>`;
    for (const [id, item] of byCategory[cat]) {
      html += renderShoppingCard(id, item, false);
    }
  }

  if (checked.length > 0) {
    html += `<div class="shopping-checked-divider"></div>`;
    for (const [id, item] of checked) {
      html += renderShoppingCard(id, item, true);
    }
  }

  area.innerHTML = html;

  area.querySelectorAll('.card--shopping').forEach(card => {
    const id = card.dataset.itemId;
    bindLongPress(
      card,
      () => openItemEditSheet(id, items[id] || { name: card.querySelector('.card__name')?.textContent?.trim() || '' }),
      () => toggleItem(id)
    );
  });
}

function renderShoppingCard(id, item, isChecked) {
  return `<article class="card card--shopping${isChecked ? ' is-checked' : ''}" data-item-id="${esc(id)}">
    <span class="card__check" aria-hidden="true"></span>
    <span class="card__name">${esc(item.name)}</span>
    ${item.qty ? `<span class="card__qty">${esc(item.qty)}</span>` : ''}
  </article>`;
}

async function toggleItem(id) {
  if (!activeListId || !id) return;
  const area = document.getElementById('listItemsArea');
  const card = area?.querySelector(`[data-item-id="${id}"]`);
  if (!card) return;

  const isNowChecked = !card.classList.contains('is-checked');
  card.classList.toggle('is-checked', isNowChecked);

  await getDb().ref(`rundown/kitchen/items/${activeListId}/${id}`).update({
    checked: isNowChecked,
    checkedAt: isNowChecked ? firebase.database.ServerValue.TIMESTAMP : null,
  });
}

function openCreateListSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">New list</h2>
      <button class="ef2-icon-btn" id="kl_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="kl-name-row">
      <input class="kl-name-input" id="kl_name" type="text" placeholder="Grocery, Costco, Target…" autocomplete="off">
    </div>
    <div class="kl-footer">
      <button class="btn btn--ghost" id="kl_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="kl_save" type="button">Create</button>
    </div>`);
  activateSheet(mount);
  requestAnimationFrame(() => document.getElementById('kl_name')?.focus());

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('kl_close')?.addEventListener('click', close);
  document.getElementById('kl_cancel')?.addEventListener('click', close);
  document.getElementById('kl_save')?.addEventListener('click', async () => {
    const name = document.getElementById('kl_name')?.value.trim();
    if (!name) {
      const inp = document.getElementById('kl_name');
      inp?.classList.add('kl-shake');
      inp?.addEventListener('animationend', () => inp.classList.remove('kl-shake'), { once: true });
      return;
    }
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
      <button class="ef2-icon-btn" id="km_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="km-rename-section">
      <label class="field">
        <span class="field__label">Rename</span>
        <input id="km_name" type="text" value="${esc(listName)}" autocomplete="off">
      </label>
    </div>
    <div class="km-actions-section">
      <div class="overflow-menu">
        <button class="overflow-menu__item" id="km_copyBtn" type="button">Copy list as text</button>
        <button class="overflow-menu__item" id="km_clearBtn" type="button">Clear checked items</button>
      </div>
    </div>
    <div class="km-footer">
      <button class="btn btn--ghost" id="km_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="km_save" type="button">Save name</button>
    </div>
    <div class="km-delete-zone">
      <button class="km-delete-btn" id="km_deleteBtn" type="button">Delete list</button>
    </div>`);
  activateSheet(mount);

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('km_close')?.addEventListener('click', close);
  document.getElementById('km_cancel')?.addEventListener('click', close);

  document.getElementById('km_save')?.addEventListener('click', async () => {
    const name = document.getElementById('km_name')?.value.trim();
    if (!name) return;
    await writeKitchenList(activeListId, { ...lists[activeListId], name });
    lists[activeListId].name = name;
    close();
    renderListsTab();
  });

  document.getElementById('km_copyBtn')?.addEventListener('click', () => {
    copyListAsText();
    close();
  });

  document.getElementById('km_clearBtn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({ title: 'Remove all checked items?', confirmLabel: 'Clear' });
    if (!confirmed) return;
    const checkedCards = document.querySelectorAll('.card--shopping.is-checked');
    for (const card of checkedCards) {
      await removeKitchenItem(activeListId, card.dataset.itemId);
    }
    close();
  });

  document.getElementById('km_deleteBtn')?.addEventListener('click', async () => {
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

function openItemAddField() {
  const area = document.getElementById('listItemsArea');
  if (!area) return;

  if (document.getElementById('itemAddField')) {
    document.getElementById('itemAddField').focus();
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'item-add-wrap';
  wrap.innerHTML = `<input class="item-add-field" id="itemAddField" type="text"
    placeholder="What do you need?" autocomplete="off" autocorrect="off">`;
  area.prepend(wrap);
  const field = document.getElementById('itemAddField');
  field.focus();

  async function addItem() {
    const name = field.value.trim();
    if (!name) { wrap.remove(); return; }
    if (!activeListId) return;
    field.value = '';
    const id = await pushKitchenItem(activeListId, {
      name,
      checked: false,
      addedAt: firebase.database.ServerValue.TIMESTAMP,
      category: null,
    });
  }

  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    if (e.key === 'Escape') { wrap.remove(); }
  });
  field.addEventListener('blur', () => {
    if (!field.value.trim()) wrap.remove();
  });
}

function openItemEditSheet(id, item) {
  const mount = document.getElementById('sheetMount');
  const alreadyStaple = Object.values(staples).some(s => s.name.toLowerCase() === (item.name || '').toLowerCase());

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Edit item</h2>
      <button class="ef2-icon-btn" id="ki_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="ki-item-section">
      <div class="ingredient-row">
        <input id="ki_qty" class="ingredient-qty" type="text" value="${esc(item.qty || '')}" placeholder="qty" autocomplete="off">
        <input id="ki_name" class="ingredient-name" type="text" value="${esc(item.name || '')}" placeholder="item name" autocomplete="off">
      </div>
      ${!alreadyStaple ? `<div class="ki-staples-row"><button class="btn btn--ghost btn--full" id="ki_addToStaples" type="button">Save to staples</button></div>` : ''}
    </div>
    <div class="ki-footer">
      <button class="btn btn--ghost" id="ki_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="ki_save" type="button">Save</button>
    </div>
    <div class="ki-delete-zone">
      <button class="ki-delete-btn" id="ki_deleteBtn" type="button">Remove item</button>
    </div>`);
  activateSheet(mount);

  const input = document.getElementById('ki_name');
  const qtyInput = document.getElementById('ki_qty');
  requestAnimationFrame(() => { input?.select(); });

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('ki_close')?.addEventListener('click', close);
  document.getElementById('ki_cancel')?.addEventListener('click', close);

  document.getElementById('ki_save')?.addEventListener('click', async () => {
    const name = input?.value.trim();
    const qty = qtyInput?.value.trim() || null;
    if (!name || !activeListId) return;
    await writeKitchenItem(activeListId, id, { ...item, name, qty });
    close();
  });

  document.getElementById('ki_deleteBtn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({ title: `Remove "${item.name}"?`, confirmLabel: 'Remove', danger: true });
    if (!confirmed) return;
    await removeKitchenItem(activeListId, id);
    close();
  });

  document.getElementById('ki_addToStaples')?.addEventListener('click', async () => {
    const name = input?.value.trim() || item.name;
    const sid = await pushKitchenStaple({ name, category: item.category || null });
    staples[sid] = { name, category: item.category || null };
    showToast(`"${name}" saved to staples`);
    close();
  });
}

function openStaplesSheet() {
  const mount = document.getElementById('sheetMount');
  const trashSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

  function stapleRows() {
    const entries = Object.entries(staples);
    if (entries.length === 0) {
      return `<p style="font-size:var(--font-sm);color:var(--text-muted)">No staples yet — add things you buy every week.</p>`;
    }
    return entries.map(([id, s]) =>
      `<div class="staple-row" data-staple-id="${esc(id)}"
           style="display:flex;align-items:center;gap:var(--spacing-sm);padding:10px 0;border-bottom:1px solid var(--border)">
        <span class="staple-row__name" style="flex:1;font-size:var(--font-sm)">${esc(s.name)}</span>
        <button class="btn-icon" data-delete-staple="${esc(id)}" aria-label="Delete" type="button">${trashSvg}</button>
      </div>`
    ).join('');
  }

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Staples</h2>
      <button class="btn-icon" id="closeStaples" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <p style="font-size:var(--font-xs);color:var(--text-faint);margin-bottom:var(--spacing-sm)">Tap to add to list · Long-press to rename</p>
      <div id="stapleRows">${stapleRows()}</div>
    </div>
    <div class="sheet__footer">
      <input id="newStapleField" type="text" placeholder="New staple…" autocomplete="off" style="flex:1;min-width:0">
      <button class="btn btn--secondary" id="addStapleBtn" type="button">Add</button>
    </div>`);
  activateSheet(mount);

  document.getElementById('closeStaples')?.addEventListener('click', () => { mount.innerHTML = ''; });

  function rebuildRows() {
    document.getElementById('stapleRows').innerHTML = stapleRows();
    bindStapleRows();
  }

  function bindStapleRows() {
    mount.querySelectorAll('.staple-row').forEach(row => {
      const id = row.dataset.stapleId;
      bindLongPress(
        row,
        () => openStapleEditSheet(id, rebuildRows),
        (e) => {
          if (e.target.closest('[data-delete-staple]')) return;
          if (!activeListId || !staples[id]) return;
          pushKitchenItem(activeListId, {
            name: staples[id].name, checked: false,
            addedAt: firebase.database.ServerValue.TIMESTAMP,
            category: staples[id].category || null,
          }).then(() => showToast(`Added "${staples[id].name}"`));
        }
      );
    });

    mount.querySelectorAll('[data-delete-staple]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteStaple;
        const confirmed = await showConfirm({
          title: `Remove "${staples[id]?.name}" from staples?`,
          confirmLabel: 'Remove', danger: true,
        });
        if (!confirmed) return;
        await getDb().ref(`rundown/kitchen/staples/${id}`).remove();
        delete staples[id];
        rebuildRows();
      });
    });
  }
  bindStapleRows();

  async function addStaple() {
    const field = document.getElementById('newStapleField');
    const name = field?.value.trim();
    if (!name) return;
    field.value = '';
    const id = await pushKitchenStaple({ name, category: null });
    staples[id] = { name, category: null };
    if (KITCHEN_WORKER_URL) categorizeStaple(id, name);
    rebuildRows();
  }

  document.getElementById('addStapleBtn')?.addEventListener('click', addStaple);
  document.getElementById('newStapleField')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addStaple(); }
  });
}

function openStapleEditSheet(id, onDone) {
  const mount = document.getElementById('sheetMount');
  const staple = staples[id];
  if (!staple) return;

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Edit staple</h2>
      <button class="ef2-icon-btn" id="ks_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="ks-name-row">
      <input class="ks-name-input" id="ks_name" type="text" value="${esc(staple.name)}" autocomplete="off">
    </div>
    <div class="ks-footer">
      <button class="btn btn--ghost" id="ks_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="ks_save" type="button">Save</button>
    </div>
    <div class="ks-delete-zone">
      <button class="ks-delete-btn" id="ks_deleteBtn" type="button">Remove staple</button>
    </div>`);
  activateSheet(mount);
  requestAnimationFrame(() => { document.getElementById('ks_name')?.select(); });

  const back = () => { mount.innerHTML = ''; openStaplesSheet(); };
  document.getElementById('ks_close')?.addEventListener('click', back);
  document.getElementById('ks_cancel')?.addEventListener('click', back);

  document.getElementById('ks_save')?.addEventListener('click', async () => {
    const name = document.getElementById('ks_name')?.value.trim();
    if (!name) return;
    await getDb().ref(`rundown/kitchen/staples/${id}/name`).set(name);
    staples[id].name = name;
    mount.innerHTML = '';
    onDone?.();
    openStaplesSheet();
  });

  document.getElementById('ks_deleteBtn')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({
      title: `Remove "${staple.name}" from staples?`,
      confirmLabel: 'Remove', danger: true,
    });
    if (!confirmed) return;
    await getDb().ref(`rundown/kitchen/staples/${id}`).remove();
    delete staples[id];
    mount.innerHTML = '';
    openStaplesSheet();
  });
}

async function addItemToActiveList(name) {
  const trimmed = name.trim();
  if (!trimmed || !activeListId) return;
  const id = await pushKitchenItem(activeListId, {
    name: trimmed, checked: false,
    addedAt: firebase.database.ServerValue.TIMESTAMP, category: null,
  });
}

function openListFabSheet() {
  if (!activeListId) { openCreateListSheet(); return; }
  if (!KITCHEN_WORKER_URL) { openBulkAddSheet(); return; }
  const mount = document.getElementById('sheetMount');
  const cameraIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  const listIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
  const options = [
    { key: 'type', label: 'Add items', icon: listIcon },
    { key: 'photo', label: 'Add from photo', icon: cameraIcon },
  ];
  mount.innerHTML = renderBottomSheet(renderAddMenu(options));
  activateSheet(mount);
  mount.querySelector('.add-menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    mount.innerHTML = '';
    if (btn.dataset.action === 'photo') setTimeout(() => openListPhotoSourceSheet(), 320);
    else setTimeout(() => openBulkAddSheet(), 320);
  });
}

function openListPhotoSourceSheet() {
  if (!activeListId || !KITCHEN_WORKER_URL) return;
  const mount = document.getElementById('sheetMount');
  const CAM_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  const GAL_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  const FILE_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  const lplCamera = document.createElement('input');
  lplCamera.type = 'file'; lplCamera.accept = 'image/*'; lplCamera.capture = 'environment'; lplCamera.hidden = true;
  const lplGallery = document.createElement('input');
  lplGallery.type = 'file'; lplGallery.accept = 'image/*'; lplGallery.hidden = true;
  const lplFiles = document.createElement('input');
  lplFiles.type = 'file'; lplFiles.accept = '.jpg,.jpeg,.png,.heic,.heif,.webp,.gif'; lplFiles.hidden = true;

  let lplContext = '';
  const cleanup = () => [lplCamera, lplGallery, lplFiles].forEach(i => { if (document.body.contains(i)) document.body.removeChild(i); });

  [lplCamera, lplGallery, lplFiles].forEach(inp => {
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      cleanup();
      if (!file) return;
      mount.innerHTML = renderBottomSheet(`
        <div class="sheet__header"><h2 class="sheet__title">Scan for items</h2></div>
        <div class="sheet__content">
          <div class="ai-loading">
            <div class="ai-loading__spinner"></div>
            Scanning photo…
          </div>
        </div>`);
      activateSheet(mount);
      try {
        const { base64, mediaType } = await resizeImageForUpload(file);
        const resp = await fetch(KITCHEN_WORKER_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'photoToList', input: { base64, mediaType, context: lplContext } }),
        });
        const data = await resp.json();
        if (data.error || !data.items?.length) {
          mount.innerHTML = renderBottomSheet(`
            <div class="sheet__header"><h2 class="sheet__title">Scan for items</h2></div>
            <div class="sheet__content">
              <p style="color:var(--text-muted);font-size:var(--font-size-sm)">No items detected — try a clearer photo.</p>
            </div>
            <div class="sheet__footer">
              <button class="btn btn--secondary" id="ptlRetry">Try again</button>
            </div>`);
          activateSheet(mount);
          mount.querySelector('#ptlRetry')?.addEventListener('click', () => openListPhotoSourceSheet());
          return;
        }
        renderPhotoToListConfirm(mount, data.items);
      } catch (err) {
        mount.innerHTML = renderBottomSheet(`
          <div class="sheet__header"><h2 class="sheet__title">Scan for items</h2></div>
          <div class="sheet__content">
            <p style="color:var(--text-muted);font-size:var(--font-size-sm)">Something went wrong.</p>
            <p style="color:var(--text-muted);font-size:var(--font-size-xs)">${esc(err?.message) || 'Check your connection.'}</p>
          </div>
          <div class="sheet__footer">
            <button class="btn btn--secondary" id="ptlRetry">Try again</button>
          </div>`);
        activateSheet(mount);
        mount.querySelector('#ptlRetry')?.addEventListener('click', () => openListPhotoSourceSheet());
      }
    });
  });

  const overlay = document.createElement('div');
  overlay.className = 'ef2-subsheet-overlay';
  overlay.innerHTML = `<div class="ef2-subsheet">
    <div class="sheet__header"><h2 class="sheet__title">Add from photo</h2></div>
    <div class="sheet__content">
      <div class="field" style="margin-bottom:var(--spacing-sm)">
        <label class="field__label" for="lpl_ctx">Optional note for AI</label>
        <input class="field__input" id="lpl_ctx" type="text" placeholder="e.g. pantry restock, whiteboard list" autocomplete="off">
      </div>
      <button class="ef2-source-btn" data-source="camera" type="button"><span class="ef2-source-icon">${CAM_SVG}</span><span>Camera</span></button>
      <button class="ef2-source-btn" data-source="gallery" type="button"><span class="ef2-source-icon">${GAL_SVG}</span><span>Gallery</span></button>
      <button class="ef2-source-btn" data-source="files" type="button"><span class="ef2-source-icon">${FILE_SVG}</span><span>Files</span></button>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--ghost" id="lplCancelBtn" type="button">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  const closeOverlay = () => {
    overlay.classList.remove('active');
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 320);
  };

  overlay.querySelector('#lplCancelBtn')?.addEventListener('click', () => { cleanup(); closeOverlay(); });
  overlay.querySelectorAll('.ef2-source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      lplContext = overlay.querySelector('#lpl_ctx')?.value.trim() || '';
      const src = btn.dataset.source;
      closeOverlay();
      setTimeout(() => {
        if (src === 'camera') lplCamera.click();
        else if (src === 'gallery') lplGallery.click();
        else lplFiles.click();
      }, 320);
    });
  });
}

function renderPhotoToListConfirm(mount, items) {
  const rows = items.map((item, i) => renderConfirmRow(
    { ...item, _cat: item.category || 'Uncategorised' },
    { labelKey: 'name', subKey: '_cat', confidenceKey: 'confidence', key: i }
  )).join('');

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header"><h2 class="sheet__title">Add to list</h2></div>
    <div class="sheet__content">
      <div class="confirm-list" id="ptlList">${rows}</div>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="ptlCancel">Cancel</button>
      <button class="btn btn--primary" id="ptlAdd">Add ${items.length} item${items.length !== 1 ? 's' : ''}</button>
    </div>`);
  activateSheet(mount);

  const list = mount.querySelector('#ptlList');
  const addBtn = mount.querySelector('#ptlAdd');

  function updateBtn() {
    const n = list.querySelectorAll('.confirm-row:not(.is-deselected)').length;
    addBtn.textContent = `Add ${n} item${n !== 1 ? 's' : ''}`;
    addBtn.disabled = n === 0;
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.confirm-row');
    if (!row) return;
    row.classList.toggle('is-deselected');
    updateBtn();
  });

  mount.querySelector('#ptlCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  addBtn.addEventListener('click', async () => {
    const selected = [...list.querySelectorAll('.confirm-row:not(.is-deselected)')]
      .map(row => items[+row.dataset.key].name);
    mount.innerHTML = '';
    for (const name of selected) await addItemToActiveList(name);
  });
}

// Strip prep modifiers + parentheticals from an ingredient name so it reads
// as a clean grocery-store product. Run on every entry point (manual add,
// URL/screenshot import, before sending to the dedup AI).
const PREP_PREFIXES = /^(freshly|finely|coarsely|roughly|thinly|thickly|chopped|diced|sliced|minced|grated|shredded|crushed|cracked|ground)\s+/i;

function cleanIngredientName(name) {
  if (!name || typeof name !== 'string') return name;
  let cleaned = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  cleaned = cleaned.split(',')[0];
  while (PREP_PREFIXES.test(cleaned)) cleaned = cleaned.replace(PREP_PREFIXES, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

async function cleanListAi(items) {
  if (!KITCHEN_WORKER_URL) return null;
  try {
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cleanList', input: { items } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.items)) return null;
    return data.items;
  } catch (err) {
    return null;
  }
}

async function runListCleanup(currentItems) {
  if (!activeListId) return;
  const btn = document.getElementById('listCleanupBtn');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }

  const unchecked = Object.entries(currentItems || {})
    .filter(([, it]) => it && !it.checked && it.name)
    .map(([id, it]) => ({ id, name: it.name, qty: it.qty || null, category: it.category || null, raw: it }));

  if (unchecked.length === 0) {
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    showToast('Nothing to clean');
    return;
  }

  const cleaned = await cleanListAi(unchecked.map(u => ({ id: u.id, name: u.name, qty: u.qty, category: u.category })));
  if (!cleaned) {
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    showToast('Cleanup unavailable — try again');
    return;
  }

  const keptIds = new Set(cleaned.map(c => c.id));
  const removedIds = unchecked.filter(u => !keptIds.has(u.id)).map(u => u.id);
  const byId = new Map(unchecked.map(u => [u.id, u]));

  let changedCount = 0;
  let removedCount = 0;

  for (const c of cleaned) {
    const original = byId.get(c.id);
    if (!original) continue;
    const newName = (c.name || original.name).slice(0, 120);
    const newQty = c.qty || null;
    const newCategory = c.category || original.category || null;
    const changed = newName !== original.name || newQty !== original.qty || newCategory !== original.category;
    if (changed) {
      await writeKitchenItem(activeListId, c.id, { ...original.raw, name: newName, qty: newQty, category: newCategory });
      changedCount++;
    }
  }
  for (const id of removedIds) {
    await removeKitchenItem(activeListId, id);
    removedCount++;
  }

  if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
  const parts = [];
  if (removedCount) parts.push(`merged ${removedCount} duplicate${removedCount !== 1 ? 's' : ''}`);
  if (changedCount) parts.push(`updated ${changedCount}`);
  showToast(parts.length ? `Cleaned up — ${parts.join(', ')}` : 'List already clean');
}

async function dedupIngredientsAi(existing, incoming) {
  if (!KITCHEN_WORKER_URL) return null;
  try {
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'dedupIngredients', input: { existing, incoming } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.toAdd) || !Array.isArray(data.toUpdate)) return null;
    return data;
  } catch (err) {
    return null;
  }
}

async function categorizeItem(listId, itemId, name) {
  if (!KITCHEN_WORKER_URL) return;
  try {
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'categorize', input: name }),
    });
    if (!res.ok) return;
    const { category } = await res.json();
    if (!category || category === 'Other') return;
    await getDb().ref(`rundown/kitchen/items/${listId}/${itemId}/category`).set(category);
  } catch (err) {
    // Silently fail — item stays in Other
  }
}

async function mergeQtyAi(name, qtys) {
  const cleanQtys = (qtys || []).filter(q => q && typeof q === 'string');
  if (cleanQtys.length === 0) return null;
  if (cleanQtys.length === 1) return cleanQtys[0];
  if (!KITCHEN_WORKER_URL) return cleanQtys.join(' + ');
  try {
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'mergeQty', input: { name, qtys: cleanQtys } }),
    });
    if (!res.ok) return cleanQtys.join(' + ');
    const data = await res.json();
    return data.qty || cleanQtys.join(' + ');
  } catch (err) {
    return cleanQtys.join(' + ');
  }
}

async function categorizeStaple(stapleId, name) {
  if (!KITCHEN_WORKER_URL) return;
  try {
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'categorize', input: name }),
    });
    if (!res.ok) return;
    const { category } = await res.json();
    if (!category || category === 'Other') return;
    await getDb().ref(`rundown/kitchen/staples/${stapleId}/category`).set(category);
    staples[stapleId].category = category;
  } catch (err) {}
}

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
