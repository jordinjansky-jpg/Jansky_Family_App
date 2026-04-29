// kitchen.js — Kitchen page: meal planning + shopping lists
import { initFirebase, readSettings, readPeople, onConnectionChange,
  onAllMessages, writeMessage, markMessageSeen, removeMessage,
  writeBankToken, markBankTokenUsed, readBank, writeMultiplier,
  readKitchenRecipes, readKitchenLists, readKitchenStaples,
  readKitchenPlan, onKitchenItems,
  pushKitchenList, writeKitchenList, removeKitchenList, removeKitchenItem,
  pushKitchenItem, writeKitchenItem, pushKitchenStaple,
  writeKitchenPlanSlot, removeKitchenPlanSlot, writeKitchenRecipe, pushKitchenRecipe, removeKitchenRecipe,
  getDb
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
  if (activeTab === 'meals') renderMealsTab().catch(console.error);
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

// ── Meals tab helpers ──────────────────────────────────────────────────────────
const SLOT_ORDER = ['breakfast', 'lunch', 'school-lunch', 'dinner', 'snack'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', 'school-lunch': 'School', dinner: 'Dinner', snack: 'Snack' };
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

  if (!currentWeekStart) currentWeekStart = getMondayOf(new Date());

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const planData = await Promise.all(weekDays.map(d => readKitchenPlan(dateKey(d)).then(r => r || {})));
  const weekPlan = {};
  weekDays.forEach((d, i) => { weekPlan[dateKey(d)] = planData[i]; });

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
          const name = entry.recipeId ? (recipes[entry.recipeId]?.name || 'Unknown') : (entry.customName || '');
          const isSchool = s === 'school-lunch';
          return `<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
            <span class="day-block__slot-label">${esc(SLOT_LABELS[s])}</span>
            <span class="day-block__slot-name">${esc(name)}${isSchool ? ' <span class="day-block__slot-school">school</span>' : ''}</span>
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

  const recipeEntries = Object.entries(recipes).sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0));
  const recipeLibHtml = recipeEntries.length > 0
    ? recipeEntries.map(([id, r]) => `
        <article class="card" data-recipe-id="${esc(id)}" style="cursor:pointer">
          <div class="card__body">
            <div class="card__title">${esc(r.name)}</div>
            <div class="card__meta">
              ${r.ingredients?.length ? `${r.ingredients.length} ingredient${r.ingredients.length !== 1 ? 's' : ''}` : 'No ingredients yet'}
              ${r.url ? ' · <span style="color:var(--accent)">&#x2197; Recipe</span>' : ''}
            </div>
          </div>
        </article>`).join('')
    : renderEmptyState('', 'No recipes yet', 'Add a recipe to start planning meals.');

  content.innerHTML = `
    <div class="week-strip" id="weekStrip">
      <div class="week-strip__track" id="weekTrack">
        <div class="week-strip__week">${weekHtml}</div>
      </div>
    </div>
    <div class="recipe-library">
      <div class="recipe-library__title">Recipes</div>
      <div id="recipeLibrary">${recipeLibHtml}</div>
      <button class="btn btn--ghost" id="findRecipesBtn" style="margin-top:var(--spacing-sm)" type="button">
        Find recipe ideas &#x2197;
      </button>
    </div>`;

  bindWeekStripSwipe();

  content.querySelectorAll('.day-block__slot').forEach(slot => {
    slot.addEventListener('click', () => openPlanMealSheet(slot.dataset.date, slot.dataset.slot));
  });

  content.querySelectorAll('[data-recipe-id]').forEach(card => {
    card.addEventListener('click', () => openRecipeDetailSheet(card.dataset.recipeId));
  });

  document.getElementById('findRecipesBtn')?.addEventListener('click', openFindRecipesSheet);
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

// Placeholders — implemented in Tasks 9-12
function openPlanMealSheet(preDate, preSlot) {
  const mount = document.getElementById('sheetMount');
  const recipeOptions = Object.entries(recipes)
    .sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0))
    .map(([id, r]) => `<option value="${esc(id)}">${esc(r.name)}</option>`)
    .join('');

  const slotOptions = SLOT_ORDER
    .map(s => `<option value="${esc(s)}"${s === preSlot ? ' selected' : ''}>${esc(SLOT_LABELS[s])}</option>`)
    .join('');

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const dateOptions = weekDays.map(d => {
    const dk = dateKey(d);
    const label = `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;
    return `<option value="${esc(dk)}"${dk === preDate ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Plan a meal</h2>
      <button class="btn-icon" id="closePlanMeal" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <label class="field">
        <span class="field__label">Day</span>
        <select class="field__input" id="pmDay">${dateOptions}</select>
      </label>
      <label class="field">
        <span class="field__label">Slot</span>
        <select class="field__input" id="pmSlot">${slotOptions}</select>
      </label>
      <label class="field">
        <span class="field__label">Meal</span>
        <input class="field__input" id="pmMealInput" type="text"
          placeholder="Type a meal name..." autocomplete="off" list="pmRecipeList">
        <datalist id="pmRecipeList">${recipeOptions}</datalist>
      </label>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="cancelPlanMeal" type="button">Cancel</button>
      <button class="btn btn--primary btn--full" id="savePlanMeal" type="button">Save</button>
    </div>`);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    document.getElementById('pmMealInput')?.focus();
  });

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closePlanMeal')?.addEventListener('click', close);
  document.getElementById('cancelPlanMeal')?.addEventListener('click', close);

  document.getElementById('savePlanMeal')?.addEventListener('click', async () => {
    const day = document.getElementById('pmDay')?.value;
    const slot = document.getElementById('pmSlot')?.value;
    const mealInput = document.getElementById('pmMealInput')?.value.trim();
    if (!day || !slot || !mealInput) return;

    const matchedEntry = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === mealInput.toLowerCase());
    const data = matchedEntry
      ? { recipeId: matchedEntry[0], source: 'manual' }
      : { customName: mealInput, source: 'manual' };

    await writeKitchenPlanSlot(day, slot, data);

    if (matchedEntry) {
      await writeKitchenRecipe(matchedEntry[0], { ...matchedEntry[1], lastUsed: firebase.database.ServerValue.TIMESTAMP });
      recipes[matchedEntry[0]].lastUsed = Date.now();
    }

    close();
    await renderMealsTab();
    showToast('Meal planned');
  });
}
function openRecipeDetailSheet(recipeId) {
  const recipe = recipes[recipeId];
  if (!recipe) return;
  const mount = document.getElementById('sheetMount');
  const hasIngredients = (recipe.ingredients?.length || 0) > 0;
  const listEntries = Object.entries(lists).sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0));

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${esc(recipe.name)}</h2>
      <button class="btn-icon" id="closeRecipeDetail" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      ${recipe.url
        ? `<a href="${esc(recipe.url)}" target="_blank" rel="noopener noreferrer"
             class="btn btn--secondary btn--full" style="margin-bottom:var(--spacing-md)">
             View recipe ↗
           </a>`
        : ''}

      <div class="field__label" style="margin-bottom:var(--spacing-xs)">Ingredients</div>
      ${hasIngredients
        ? `<ul style="margin:0 0 var(--spacing-md);padding-left:var(--spacing-md);font-size:var(--font-sm)">
            ${recipe.ingredients.map(i => `<li>${esc(i.name)}</li>`).join('')}
           </ul>`
        : `<p style="font-size:var(--font-sm);color:var(--text-muted);margin-bottom:var(--spacing-md)">No ingredients saved yet.</p>`}

      ${listEntries.length > 0
        ? `<button class="btn btn--secondary btn--full" id="addToListBtn"
             ${hasIngredients ? '' : 'disabled'} type="button"
             style="${hasIngredients ? '' : 'opacity:0.5;cursor:not-allowed'}">
             ${hasIngredients ? 'Add ingredients to list' : 'No ingredients — add some first'}
           </button>`
        : ''}

      <button class="btn btn--ghost btn--full" id="planThisMealBtn"
        style="margin-top:var(--spacing-xs)" type="button">Plan this meal</button>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="editRecipeBtn" type="button">Edit</button>
      <button class="btn btn--danger btn--full" id="deleteRecipeBtn" type="button">Delete</button>
    </div>`);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closeRecipeDetail')?.addEventListener('click', close);

  document.getElementById('planThisMealBtn')?.addEventListener('click', () => {
    close();
    const tz = settings?.timezone || 'America/Chicago';
    openPlanMealSheet(todayKey(tz), 'dinner');
    requestAnimationFrame(() => {
      const input = document.getElementById('pmMealInput');
      if (input) input.value = recipe.name;
    });
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
    await renderMealsTab();
    showToast('Recipe deleted');
  });

  document.getElementById('addToListBtn')?.addEventListener('click', async () => {
    if (!hasIngredients) return;
    let targetListId = activeListId;

    if (listEntries.length > 1) {
      targetListId = await pickList(listEntries);
      if (!targetListId) return;
    }

    const added = [];
    for (const ing of recipe.ingredients) {
      const id = await pushKitchenItem(targetListId, {
        name: ing.name,
        checked: false,
        addedAt: firebase.database.ServerValue.TIMESTAMP,
        category: null,
      });
      added.push({ listId: targetListId, id, name: ing.name });
    }

    const listName = lists[targetListId]?.name || 'list';
    showToast(`Added ${added.length} item${added.length !== 1 ? 's' : ''} to ${listName}`);
    close();
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
    requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

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
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('closeFindRecipes')?.addEventListener('click', () => { mount.innerHTML = ''; });
}
function openMealFabSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Add</h2>
      <button class="btn-icon" id="closeMealFab" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content" style="display:flex;flex-direction:column;gap:var(--spacing-sm)">
      <button class="btn btn--secondary btn--full" id="fabPlanMeal" type="button">Plan a meal</button>
      <button class="btn btn--secondary btn--full" id="fabAddRecipe" type="button">Add recipe</button>
    </div>`);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closeMealFab')?.addEventListener('click', close);
  document.getElementById('fabPlanMeal')?.addEventListener('click', () => {
    close();
    const tz = settings?.timezone || 'America/Chicago';
    openPlanMealSheet(todayKey(tz), 'dinner');
  });
  document.getElementById('fabAddRecipe')?.addEventListener('click', () => { close(); openRecipeForm(null); });
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

function openRecipeForm(recipeId) {
  const existing = recipeId ? recipes[recipeId] : null;
  const ingredients = existing?.ingredients ? [...existing.ingredients] : [];

  const mount = document.getElementById('sheetMount');

  function buildIngredientList() {
    return ingredients.map((ing, i) =>
      `<div class="ingredient-row" data-index="${i}" style="display:flex;align-items:center;gap:var(--spacing-xs);margin-bottom:var(--spacing-xs)">
        <span style="flex:1;font-size:var(--font-sm)">${esc(ing.name)}</span>
        <button class="btn-icon" data-remove-index="${i}" type="button" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`
    ).join('');
  }

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${existing ? 'Edit recipe' : 'New recipe'}</h2>
      <button class="btn-icon" id="closeRecipeForm" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <label class="field">
        <span class="field__label">Name <span style="color:var(--danger)">*</span></span>
        <input class="field__input" id="recipeName" type="text"
          value="${esc(existing?.name || '')}" placeholder="e.g. Taco Night" autocomplete="off">
      </label>

      <div class="field">
        <span class="field__label">Ingredients</span>
        <div id="ingredientList">${buildIngredientList()}</div>
        <div style="display:flex;gap:var(--spacing-xs);margin-top:var(--spacing-xs)">
          <input class="field__input" id="newIngredientInput" type="text"
            placeholder="Add ingredient..." autocomplete="off" style="flex:1">
          <button class="btn btn--secondary" id="addIngredientBtn" type="button">Add</button>
        </div>
      </div>

      <div class="field" style="margin-top:var(--spacing-md)">
        <span class="field__label" style="margin-bottom:var(--spacing-xs);display:block">Import from</span>
        <div style="display:flex;flex-wrap:wrap;gap:var(--spacing-xs)">
          <button class="btn btn--secondary btn--sm" disabled type="button">URL (coming soon)</button>
          <button class="btn btn--secondary btn--sm" disabled type="button">TikTok (coming soon)</button>
          <button class="btn btn--secondary btn--sm" disabled type="button">Screenshot (coming soon)</button>
        </div>
      </div>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--secondary" id="cancelRecipeForm" type="button">Cancel</button>
      <button class="btn btn--primary btn--full" id="saveRecipeForm" type="button">Save</button>
    </div>`);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    document.getElementById('recipeName')?.focus();
  });

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('closeRecipeForm')?.addEventListener('click', close);
  document.getElementById('cancelRecipeForm')?.addEventListener('click', close);

  function addIngredient() {
    const val = document.getElementById('newIngredientInput')?.value.trim();
    if (!val) return;
    ingredients.push({ name: val });
    document.getElementById('newIngredientInput').value = '';
    document.getElementById('ingredientList').innerHTML = buildIngredientList();
    bindRemoveButtons();
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
        bindRemoveButtons();
      });
    });
  }
  bindRemoveButtons();

  document.getElementById('saveRecipeForm')?.addEventListener('click', async () => {
    const name = document.getElementById('recipeName')?.value.trim();
    if (!name) { document.getElementById('recipeName')?.focus(); return; }
    const data = {
      name,
      source: existing?.source || 'manual',
      ingredients,
      isFavorite: existing?.isFavorite || false,
      lastUsed: existing?.lastUsed || null,
    };
    if (existing?.url) data.url = existing.url;

    if (recipeId) {
      await writeKitchenRecipe(recipeId, { ...data, createdAt: existing?.createdAt });
      recipes[recipeId] = { ...data, createdAt: existing?.createdAt };
    } else {
      const id = await pushKitchenRecipe({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      recipes[id] = data;
    }
    close();
    await renderMealsTab();
    showToast(recipeId ? 'Recipe updated' : 'Recipe saved');
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
  if (itemsUnsub) { itemsUnsub(); itemsUnsub = null; }
  if (!activeListId) { renderItemsArea({}); return; }
  itemsUnsub = onKitchenItems(activeListId, (items) => renderItemsArea(items || {}));
}

function renderItemsArea(items) {
  const area = document.getElementById('listItemsArea');
  if (!area) return;

  const allItems = Object.entries(items);
  const unchecked = allItems.filter(([, v]) => !v.checked).sort((a, b) => (a[1].addedAt || 0) - (b[1].addedAt || 0));
  const checked   = allItems.filter(([, v]) => v.checked).sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0));

  if (allItems.length === 0) {
    area.innerHTML =
      renderEmptyState('', 'List is empty', 'Tap + to add your first item.') +
      `<button class="staples-btn" id="staplesQuickBtn">Add from staples</button>`;
    document.getElementById('staplesQuickBtn')?.addEventListener('click', openStaplesSheet);
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

  let html = `<button class="staples-btn" id="staplesTopBtn">Add from staples</button>`;

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

  document.getElementById('staplesTopBtn')?.addEventListener('click', openStaplesSheet);

  area.querySelectorAll('.card--shopping').forEach(card => {
    card.addEventListener('click', () => toggleItem(card.dataset.itemId));
  });
}

function renderShoppingCard(id, item, isChecked) {
  return `<article class="card card--shopping${isChecked ? ' is-checked' : ''}" data-item-id="${esc(id)}">
    <span class="card__check" aria-hidden="true"></span>
    <span class="card__name">${esc(item.name)}</span>
  </article>`;
}

async function toggleItem(id) {
  if (!activeListId || !id) return;
  const area = document.getElementById('listItemsArea');
  const card = area?.querySelector(`[data-item-id="${id}"]`);
  if (!card) return;

  const isNowChecked = !card.classList.contains('is-checked');
  card.classList.toggle('is-checked', isNowChecked);

  await writeKitchenItem(activeListId, id, {
    name: card.querySelector('.card__name')?.textContent || '',
    checked: isNowChecked,
    checkedAt: isNowChecked ? firebase.database.ServerValue.TIMESTAMP : null,
    addedAt: Date.now(),
    category: null,
  });
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
    if (KITCHEN_WORKER_URL) categorizeItem(activeListId, id, name);
  }

  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    if (e.key === 'Escape') { wrap.remove(); }
  });
  field.addEventListener('blur', () => {
    if (!field.value.trim()) wrap.remove();
  });
}

function openStaplesSheet() {
  const mount = document.getElementById('sheetMount');

  function renderStaplesChips() {
    const entries = Object.entries(staples);
    if (entries.length === 0) {
      return `<p style="font-size:var(--font-sm);color:var(--text-muted)">Save items you buy every week.</p>`;
    }
    return entries.map(([id, s]) =>
      `<button class="chip chip--muted" data-staple-id="${esc(id)}" type="button">${esc(s.name)}</button>`
    ).join(' ');
  }

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Staples</h2>
      <button class="btn-icon" id="closeStaples" aria-label="Close" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet__content">
      <div id="staplesChips" style="display:flex;flex-wrap:wrap;gap:var(--spacing-xs);margin-bottom:var(--spacing-md)">
        ${renderStaplesChips()}
      </div>
      <div class="item-add-wrap">
        <input class="item-add-field" id="newStapleField" type="text"
          placeholder="Add a staple..." autocomplete="off">
      </div>
    </div>`);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  document.getElementById('closeStaples')?.addEventListener('click', () => { mount.innerHTML = ''; });

  document.getElementById('staplesChips')?.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-staple-id]');
    if (!chip || !activeListId) return;
    const stapleId = chip.dataset.stapleId;
    const name = staples[stapleId]?.name;
    if (!name) return;
    await pushKitchenItem(activeListId, {
      name, checked: false,
      addedAt: firebase.database.ServerValue.TIMESTAMP,
      category: staples[stapleId]?.category || null,
    });
    showToast(`Added "${name}"`);
  });

  const newField = document.getElementById('newStapleField');
  newField?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const name = newField.value.trim();
    if (!name) return;
    newField.value = '';
    const id = await pushKitchenStaple({ name, category: null });
    staples[id] = { name, category: null };
    if (KITCHEN_WORKER_URL) categorizeStaple(id, name);
    document.getElementById('staplesChips').innerHTML = renderStaplesChips();
  });
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
  } catch {
    // Silently fail — item stays in Other
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
  } catch {}
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
