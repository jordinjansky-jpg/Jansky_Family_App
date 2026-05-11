// kitchen.js — Kitchen page: meal planning + shopping lists
import { initFirebase, readSettings, writeSettings, readPeople, onConnectionChange,
  onAllMessages, writeMessage, markMessageSeen, removeMessage,
  writeBankToken, markBankTokenUsed, removeBankToken, readBank, writeMultiplier,
  readKitchenRecipes, readKitchenLists, readKitchenStaples,
  readKitchenPlan, onKitchenItems, readOnce,
  pushKitchenList, writeKitchenList, removeKitchenList, removeKitchenItem,
  pushKitchenItem, writeKitchenItem, pushKitchenStaple,
  writeKitchenPlanSlot, removeKitchenPlanSlot, writeKitchenRecipe, pushKitchenRecipe, removeKitchenRecipe,
  getDb,
  readSchoolLunchFeeds, writeSchoolLunchFeed, removeSchoolLunchFeed, writeSchoolLunchFeedSync
} from './shared/firebase.js';
import { parseIcs, mapEventsToPlan } from './shared/kitchen-ical.js';
import { applyTheme, resolveTheme } from './shared/theme.js';
import { renderHeader, renderNavBar, initNavMore, initBell,
  initOfflineBanner, showConfirm, showToast, renderFab,
  renderBottomSheet, renderEmptyState, renderAddMenu, renderSkeleton, renderErrorState,
  renderFormFooter, renderFormSheetHeader,
  renderChipPicker, bindChipPicker,
  renderColorButton, initColorButton, applyDataColors
} from './shared/components.js';
import { todayKey, escapeHtml, formatLastCooked, avgRating } from './shared/utils.js';
import { resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet } from './shared/ai-helpers.js';

const esc = (s) => escapeHtml(String(s ?? ''));

// ── Fraction helpers (servings scaler) ────────────────────────────────────────
function parseQtyAmount(str) {
  if (!str) return null;
  const s = str.trim();
  let m;
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)(.*)/);
  if (m) return { amount: parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]), unit: m[4].trim() };
  m = s.match(/^(\d+)\/(\d+)(.*)/);
  if (m) return { amount: parseInt(m[1]) / parseInt(m[2]), unit: m[3].trim() };
  m = s.match(/^(\d*\.?\d+)(.*)/);
  if (m) return { amount: parseFloat(m[1]), unit: m[2].trim() };
  return null;
}

function formatFraction(n) {
  if (n <= 0) return '0';
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.03) return String(whole || '0');
  if (frac > 0.97) return String(whole + 1);
  const fracs = [[1,8],[1,6],[1,4],[1,3],[3,8],[1,2],[5,8],[2,3],[3,4],[7,8]];
  let best = fracs[0], bestDist = Infinity;
  for (const [num, den] of fracs) {
    const d = Math.abs(frac - num / den);
    if (d < bestDist) { bestDist = d; best = [num, den]; }
  }
  const fracStr = `${best[0]}/${best[1]}`;
  return whole ? `${whole} ${fracStr}` : fracStr;
}

function scaleQty(qtyStr, factor) {
  if (!qtyStr || factor === 1) return qtyStr;
  const parsed = parseQtyAmount(qtyStr);
  if (!parsed || !parsed.amount) return qtyStr;
  const scaled = parsed.amount * factor;
  const fmt = formatFraction(scaled);
  return parsed.unit ? `${fmt} ${parsed.unit}` : fmt;
}

// Parse a prep-time string into minutes for filter bucketing only.
// Returns null when the string is empty/unrecognizable — the caller treats
// null as "exclude from any specific bucket" rather than "include in <30".
function formatPrepBucket(prepTimeStr) {
  if (!prepTimeStr || typeof prepTimeStr !== 'string') return null;
  const s = prepTimeStr.toLowerCase().trim();
  if (!s) return null;

  let total = 0;
  let matched = false;

  // Hours: "1h", "1 hr", "1 hour", "1 hours"
  const hr = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour|hours)\b/);
  if (hr) { total += parseFloat(hr[1]) * 60; matched = true; }

  // Minutes: "30m", "30 min", "30 mins", "30 minutes"
  const mn = s.match(/(\d+(?:\.\d+)?)\s*(?:m\b|min|mins|minute|minutes)/);
  if (mn) { total += parseFloat(mn[1]); matched = true; }

  // Bare number (no unit): treat as minutes
  if (!matched) {
    const bare = s.match(/^(\d+(?:\.\d+)?)$/);
    if (bare) { total = parseFloat(bare[1]); matched = true; }
  }

  return matched && total > 0 ? Math.round(total) : null;
}

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
let linkedPerson = null; // resolved from ?person=Name query param
let recipes = {}, lists = {}, staples = {}, planCache = {};
let activeTab = localStorage.getItem('dr-kitchen-tab') || 'meals';
let activeListId = null;
let currentItems = {}; // last items snapshot, used by wand cleanup
let itemsUnsub = null; // Firebase onValue unsubscribe for active list
let keepAddFieldOpen = false; // true while user is in a multi-item add session
let recipeFilter = {
  show: 'all',          // 'all' | 'favorites' | 'never-cooked'
  prepBucket: 'any',    // 'any' | 'lt-30' | '30-60' | 'gt-60'
  difficulty: 'any',    // 'any' | 'Easy' | 'Medium' | 'Hard'
  tags: [],             // [] = no tag filter; else AND across these tag strings
  sort: 'alpha',        // 'alpha' | 'recent' | 'quickest' | 'last-cooked' | 'highest-rated'
};
let recipeSearchQuery = ''; // transient — not persisted across sessions

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  [settings, people] = await Promise.all([
    readSettings().catch(() => null),
    readPeople().then(obj => obj ? Object.entries(obj).map(([id, p]) => ({ id, ...p })) : []),
  ]);

  // Resolve ?person=Name query param
  const personParam = new URLSearchParams(window.location.search).get('person');
  if (personParam) {
    linkedPerson = people.find(p => p.name.toLowerCase() === personParam.toLowerCase()) || null;
  }

  // Phase 2: apply family theme from Firebase
  applyTheme(resolveTheme(settings?.theme));

  // Header
  document.getElementById('headerMount').innerHTML = renderHeader({
    title: 'Kitchen',
    showBell: true,
  });

  // Nav
  document.getElementById('navMount').innerHTML = renderNavBar('kitchen');
  initNavMore(document.getElementById('sheetMount'), () => settings?.theme, undefined,
    { settings, writeSettings, displayDefaults: settings },
    () => render());
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
      removeBankTokenFn: removeBankToken,
      readBankFn: readBank,
      writeMultiplierFn: writeMultiplier,
      getTodayFn: () => todayKey(settings?.timezone),
    }
  );

  // Tabs
  renderTabs();

  // Show skeleton while data loads
  document.getElementById('kitchenContent').innerHTML = renderSkeleton('list');

  // Load data + render active tab
  try {
    await loadData();
    renderActiveTab();
  } catch (err) {
    renderErrorState(document.getElementById('kitchenContent'), {
      title: "Couldn't load kitchen",
      message: 'Check your connection and try again.',
      retry: () => location.reload(),
    });
  }
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
  const wandSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>`;
  document.getElementById('kitchenTabsMount').innerHTML = `
    <div class="kitchen-tabs-row">
      <nav class="tabs tabs--pill tabs--md" id="kitchenTabs">
        ${tabs.map(t => `
          <button class="tab${t === activeTab ? ' is-active' : ''}" data-tab="${t}" type="button">
            ${esc(labels[t])}
          </button>`).join('')}
      </nav>
      <button class="kitchen-aitools-btn" id="kitchenAiToolsBtn" type="button" aria-label="Kitchen AI tools">
        ${wandSvg}
      </button>
    </div>`;
  document.getElementById('kitchenTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    localStorage.setItem('dr-kitchen-tab', activeTab);
    renderTabs();
    renderActiveTab();
    bindFab();
  });
  document.getElementById('kitchenAiToolsBtn')?.addEventListener('click', openKitchenAiToolsSheet);
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
    if (activeTab === 'meals') {
      const tz = settings?.timezone || 'America/Chicago';
      const todayStr = todayKey(tz);
      openPlanMealSheet(todayStr, 'dinner');
    }
    else if (activeTab === 'recipes') openRecipeForm(null);
    else { if (!activeListId) openCreateListSheet(); else openItemAddField(); }
  });
}

// ── Meals tab helpers ──────────────────────────────────────────────────────────
const SLOT_ORDER = ['breakfast', 'lunch', 'school-lunch', 'school-lunch-2', 'dinner', 'snack'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', school: 'School', 'school-lunch': 'School 1', 'school-lunch-2': 'School 2', dinner: 'Dinner', snack: 'Snack' };
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

// Returns the display label for a school-lunch slot key given the day's plan.
// SCHOOL when only one of the two is planned; SCHOOL 1 / SCHOOL 2 when both.
function getSchoolSlotLabel(slotKey, dayPlan) {
  const hasOne = !!dayPlan?.['school-lunch'];
  const hasTwo = !!dayPlan?.['school-lunch-2'];
  if (hasOne && hasTwo) {
    return slotKey === 'school-lunch' ? 'School 1' : 'School 2';
  }
  return 'School';
}

// 32×32 thumb for a planned slot entry. Falls back to 🍴 placeholder.
// `entry` is null for the always-on Dinner empty state (returns spacer).
function buildSlotThumb(entry) {
  if (!entry) {
    return `<span class="day-block__slot-thumb day-block__slot-thumb--spacer" aria-hidden="true"></span>`;
  }
  const recipe = entry.recipeId ? recipes[entry.recipeId] : null;
  if (recipe?.imageUrl) {
    return `<img class="day-block__slot-thumb" src="${esc(recipe.imageUrl)}" alt="" loading="lazy">`;
  }
  return `<span class="day-block__slot-thumb day-block__slot-thumb--placeholder" aria-hidden="true">🍴</span>`;
}

async function renderMealsTab() {
  const content = document.getElementById('kitchenContent');
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);

  // Rolling 7 days starting today — no pagination.
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
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
    const dayMonth = MONTHS[d.getMonth()];

    // Order: planned non-dinner slots (in SLOT_ORDER), then Dinner always last.
    const nonDinnerPlanned = SLOT_ORDER.filter(s => s !== 'dinner' && plan[s]);
    const dinnerEntry = plan.dinner || null;

    const slotRows = [];
    for (const s of nonDinnerPlanned) {
      const entry = plan[s];
      const name = entry.recipeId ? (recipes[entry.recipeId]?.name || 'Unknown') : (entry.mealName || entry.customName || '');
      const label = (s === 'school-lunch' || s === 'school-lunch-2')
        ? getSchoolSlotLabel(s, plan)
        : SLOT_LABELS[s];
      slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
        ${buildSlotThumb(entry)}
        <span class="day-block__slot-label">${esc(label)}</span>
        <span class="day-block__slot-name">${esc(name)}</span>
      </div>`);
    }

    // Dinner row — always rendered. Empty state when not planned.
    if (dinnerEntry) {
      const dinnerName = dinnerEntry.recipeId ? (recipes[dinnerEntry.recipeId]?.name || 'Unknown') : (dinnerEntry.mealName || dinnerEntry.customName || '');
      slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
        ${buildSlotThumb(dinnerEntry)}
        <span class="day-block__slot-label">${esc(SLOT_LABELS.dinner)}</span>
        <span class="day-block__slot-name">${esc(dinnerName)}</span>
      </div>`);
    } else {
      slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
        ${buildSlotThumb(null)}
        <span class="day-block__slot-label">${esc(SLOT_LABELS.dinner)}</span>
        <span class="day-block__slot-name day-block__slot-name--empty">Plan dinner <span aria-hidden="true">›</span></span>
      </div>`);
    }

    const slotsHtml = slotRows.join('');

    return `<div class="day-block">
      <div class="day-block__head${isToday ? ' day-block__head--today' : ''}">
        <span class="day-block__head-text">${dayName} ${dayMonth} ${dayNum}</span>
        ${isToday ? '<span class="day-block__today-pill">Today</span>' : ''}
        <button class="day-block__add" data-add-date="${esc(dk)}" type="button" aria-label="Add a meal for ${dayName} ${dayMonth} ${dayNum}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="day-block__slots">${slotsHtml}</div>
    </div>`;
  }).join('');

  content.innerHTML = `
    <div class="week-strip" id="weekStrip">
      <div class="week-strip__week">${weekHtml}</div>
    </div>`;

  content.querySelectorAll('.day-block__slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const dk = slot.dataset.date;
      const s = slot.dataset.slot;
      const entry = planCache[dk]?.[s];
      if (entry) openSlotEditSheet(dk, s, entry);
      else openPlanMealSheet(dk, s);
    });
  });

  content.querySelectorAll('[data-add-date]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dk = btn.dataset.addDate;
      // Open Plan-a-meal with no slot pre-selected; user picks from picker.
      openPlanMealSheet(dk, null);
    });
  });
}

function renderRecipesTab() {
  function buildRecipeCardThumb(recipe) {
    if (recipe?.imageUrl) {
      // onerror swaps the broken img for the placeholder span when the
      // URL fails to load (TikTok CDN URLs are time-signed and expire).
      return `<img class="rl-card-thumb" src="${esc(recipe.imageUrl)}" alt="" loading="lazy" onerror="this.outerHTML='&lt;span class=&quot;rl-card-thumb rl-card-thumb--placeholder&quot; aria-hidden=&quot;true&quot;&gt;\\ud83c\\udf74&lt;/span&gt;'">`;
    }
    return `<span class="rl-card-thumb rl-card-thumb--placeholder" aria-hidden="true">🍴</span>`;
  }

  function buildRecipeCardChips(recipe) {
    const { avg } = avgRating(recipe, linkedPerson?.id);
    const STAR_FILLED_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`;
    const STAR_EMPTY_SVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>`;

    let ratingChip;
    if (avg != null) {
      const num = Number.isInteger(avg) ? `${avg}.0` : avg.toFixed(1);
      ratingChip = `<button class="rl-chip rl-chip--rating" data-rate-recipe type="button" aria-label="Rating ${num} of 5">${STAR_FILLED_SVG}<span>${esc(num)}</span></button>`;
    } else {
      ratingChip = `<button class="rl-chip rl-chip--unrated" data-rate-recipe type="button" aria-label="Not yet rated — tap to rate">${STAR_EMPTY_SVG}</button>`;
    }
    const prepChip = recipe?.prepTime ? `<span class="rl-chip">${esc(recipe.prepTime)}</span>` : '';
    const tz = settings?.timezone || 'America/Chicago';
    const todayStr = todayKey(tz);
    const lastChip = `<span class="rl-chip">${esc(formatLastCooked(recipe?.lastUsed, tz, todayStr))}</span>`;
    return [ratingChip, prepChip, lastChip].filter(Boolean).join('<span class="rl-chip-sep">·</span>');
  }

  function buildRecipeCard(id, r) {
    return `
      <article class="card rl-recipe-card" data-recipe-id="${esc(id)}">
        ${buildRecipeCardThumb(r)}
        <div class="rl-card-body">
          <div class="rl-card-title">${esc(r.name)}</div>
          <div class="rl-card-chips">${buildRecipeCardChips(r)}</div>
        </div>
        <div class="rl-card-actions">
          ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"
              class="btn-icon" aria-label="Open recipe link" data-recipe-link="${esc(id)}">${linkIcon}</a>` : ''}
        </div>
      </article>`;
  }

  const content = document.getElementById('kitchenContent');
  let recipeEntries = Object.entries(recipes);

  // SHOW
  if (recipeFilter.show === 'top-rated') {
    recipeEntries = recipeEntries.filter(([, r]) => {
      const { avg } = avgRating(r, linkedPerson?.id);
      return avg != null && avg >= 4.0;
    });
  } else if (recipeFilter.show === 'never-cooked') {
    recipeEntries = recipeEntries.filter(([, r]) => !r.lastUsed);
  }

  // PREP BUCKET
  if (recipeFilter.prepBucket !== 'any') {
    recipeEntries = recipeEntries.filter(([, r]) => {
      const mins = formatPrepBucket(r.prepTime);
      if (mins == null) return false;
      if (recipeFilter.prepBucket === 'lt-30') return mins < 30;
      if (recipeFilter.prepBucket === '30-60') return mins >= 30 && mins <= 60;
      return mins > 60;
    });
  }

  // DIFFICULTY
  if (recipeFilter.difficulty !== 'any') {
    recipeEntries = recipeEntries.filter(([, r]) => r.difficulty === recipeFilter.difficulty);
  }

  // TAGS (AND across selected tags)
  if (recipeFilter.tags?.length) {
    recipeEntries = recipeEntries.filter(([, r]) => {
      const rtags = r.tags || [];
      return recipeFilter.tags.every(t => rtags.includes(t));
    });
  }

  // SEARCH (added in Task 3 — keep)
  const q = recipeSearchQuery.trim().toLowerCase();
  if (q) recipeEntries = recipeEntries.filter(([, r]) => (r.name || '').toLowerCase().includes(q));

  // SORT
  recipeEntries.sort((a, b) => {
    const [, ra] = a, [, rb] = b;
    switch (recipeFilter.sort) {
      case 'recent':         return (rb.createdAt || 0) - (ra.createdAt || 0);
      case 'quickest': {
        const ma = formatPrepBucket(ra.prepTime); const mb = formatPrepBucket(rb.prepTime);
        if (ma == null && mb == null) return 0;
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb;
      }
      case 'last-cooked': {
        const la = ra.lastUsed || 0; const lb = rb.lastUsed || 0;
        return lb - la;
      }
      case 'highest-rated': return (rb.rating || 0) - (ra.rating || 0);
      case 'alpha':
      default:               return (ra.name || '').localeCompare(rb.name || '');
    }
  });

  const linkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  const filterCount =
    (recipeFilter.show !== 'all'         ? 1 : 0) +
    (recipeFilter.prepBucket !== 'any'   ? 1 : 0) +
    (recipeFilter.difficulty !== 'any'   ? 1 : 0) +
    (recipeFilter.tags?.length           ? 1 : 0) +
    (recipeFilter.sort !== 'alpha'       ? 1 : 0);
  const filterLabel = filterCount > 0 ? `Filter & Sort · ${filterCount}` : 'Filter & Sort';

  const recipeLibHtml = (() => {
    if (recipeEntries.length > 0) {
      return recipeEntries.map(([id, r]) => buildRecipeCard(id, r)).join('');
    }
    const totalCount = Object.keys(recipes).length;
    if (totalCount === 0) {
      // Library is empty.
      return renderEmptyState('', 'No recipes yet', 'Tap "New recipe" to add your first.');
    }
    // Library has recipes but the filter/search yields zero.
    const hasSearch = !!recipeSearchQuery.trim();
    const hasFilter = (recipeFilter.show !== 'all' || recipeFilter.prepBucket !== 'any' || recipeFilter.difficulty !== 'any' || recipeFilter.tags?.length);
    const title = 'No recipes match';
    let body;
    if (hasSearch && hasFilter) body = 'Try clearing the search or adjusting filters.';
    else if (hasSearch)         body = 'Try a different search term.';
    else                        body = 'Try a different filter combination.';
    const buttonLabel = hasSearch && hasFilter ? 'Clear search & filters'
                      : hasSearch              ? 'Clear search'
                      :                          'Clear filters';
    return renderEmptyState('', title, body) +
      `<div class="rl-empty-actions"><button class="btn btn--secondary" id="rlClearAll" type="button">${buttonLabel}</button></div>`;
  })();

  const countLabel = recipeEntries.length === 1 ? '1 recipe' : `${recipeEntries.length} recipes`;

  content.innerHTML = `
    <div class="rl-wrap">
      <div class="rl-search-row">
        <div class="rl-search-input-wrap">
          <span class="rl-search-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input class="rl-search-input" id="rlSearch" type="search" placeholder="Search recipes…" value="${esc(recipeSearchQuery)}" autocomplete="off">
          ${recipeSearchQuery ? `<button class="rl-search-clear" id="rlSearchClear" type="button" aria-label="Clear search">✕</button>` : ''}
        </div>
      </div>
      <div class="rl-controls">
        <span class="rl-count">${esc(countLabel)}</span>
        <button class="chip rl-filter-btn${filterCount > 0 ? ' chip--active' : ''}" id="recipeFilterBtn" type="button">${filterLabel} &#9662;</button>
      </div>
      <div id="recipeLibrary">${recipeLibHtml}</div>
    </div>`;

  document.getElementById('recipeFilterBtn')?.addEventListener('click', openRecipeFilterSheet);

  document.getElementById('rlClearAll')?.addEventListener('click', () => {
    recipeSearchQuery = '';
    recipeFilter = {
      show: 'all',
      prepBucket: 'any',
      difficulty: 'any',
      tags: [],
      sort: 'alpha',
    };
    renderRecipesTab();
  });

  const searchInput = document.getElementById('rlSearch');
  searchInput?.addEventListener('input', (e) => {
    recipeSearchQuery = e.target.value;
    renderRecipesTab();
    // Re-focus the input — re-render replaces the DOM and the focus is lost.
    setTimeout(() => {
      const next = document.getElementById('rlSearch');
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    }, 0);
  });
  document.getElementById('rlSearchClear')?.addEventListener('click', () => {
    recipeSearchQuery = '';
    renderRecipesTab();
  });

  content.querySelectorAll('[data-recipe-id]').forEach(card => {
    const id = card.dataset.recipeId;
    bindLongPress(
      card,
      () => openRecipeForm(id),
      (e) => {
        if (e.target.closest('[data-recipe-link]') || e.target.closest('[data-rate-recipe]')) return;
        openRecipeDetailSheet(id);
      }
    );
  });

  content.querySelectorAll('[data-rate-recipe]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('[data-recipe-id]');
      const id = card?.dataset.recipeId;
      if (id) openRecipeRatingSheet(id);
    });
  });
}

// When user picks the virtual 'school' slot, resolve to the concrete
// school-lunch or school-lunch-2 schema key based on what's free on the day.
// Returns null when both slots are taken — caller should keep Save disabled.
function resolveSchoolSlot(dateKey) {
  const dayPlan = planCache[dateKey] || {};
  if (!dayPlan['school-lunch']) return 'school-lunch';
  if (!dayPlan['school-lunch-2']) return 'school-lunch-2';
  return null;
}

function openPlanMealSheet(preDate, preSlot, preRecipeId = null) {
  const mount = document.getElementById('sheetMount');
  let selectedRecipeId = preRecipeId;
  let secondOpen = false;
  let secondRecipeId = null;
  let secondTypedName = '';
  // Picker offers a single 'School' option. Auto-allocation in handleSchoolSave()
  // maps it to school-lunch or school-lunch-2 based on day state.
  const PLAN_SLOT_ORDER = ['breakfast', 'lunch', 'school', 'dinner', 'snack'];

  let selectedSlot = PLAN_SLOT_ORDER.includes(preSlot) ? preSlot : (preSlot === null ? null : 'dinner');

  function formatDateLabel(dk) {
    const d = new Date(dk + 'T12:00:00');
    return `${DAY_ABBR[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  function buildPickRow(id, r) {
    const isSelected = selectedRecipeId === id;
    const thumb = r.imageUrl
      ? `<img class="recipe-pick__thumb" src="${esc(r.imageUrl)}" alt="" loading="lazy">`
      : `<span class="recipe-pick__thumb recipe-pick__thumb--placeholder" aria-hidden="true">🍴</span>`;
    return `<button class="recipe-pick__row${isSelected ? ' is-selected' : ''}" data-recipe-pick="${esc(id)}" type="button">
      ${thumb}
      <span class="recipe-pick__name">${esc(r.name)}</span>
      ${isSelected ? '<span class="recipe-pick__check">&#10003;</span>' : ''}
    </button>`;
  }

  function buildRecipeRows(filter) {
    const lc = filter?.toLowerCase() || '';
    const all = Object.entries(recipes).sort((a, b) => {
      if (a[1].isFavorite !== b[1].isFavorite) return a[1].isFavorite ? -1 : 1;
      return a[1].name.localeCompare(b[1].name);
    });
    const entries = lc ? all.filter(([, r]) => r.name.toLowerCase().includes(lc)) : all;
    if (entries.length === 0 && lc) return `<div class="recipe-pick__none">No match — will save as "${esc(filter)}"</div>`;
    if (entries.length === 0) return `<div class="recipe-pick__none">No recipes yet. Type any meal name to continue.</div>`;
    return entries.map(([id, r]) => buildPickRow(id, r)).join('');
  }

  const preRecipeName = preRecipeId ? (recipes[preRecipeId]?.name || '') : '';

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Plan a meal', closeId: 'kp_close' })}
    <div class="kp-day-section">
      <span class="ef2-section-label">Day</span>
      <div class="kp-date-wrap">
        <button class="kp-date-btn" id="kp_datebtn" type="button">${formatDateLabel(preDate)}</button>
        <input type="date" id="kp_day" class="kp-date-input" value="${esc(preDate)}">
      </div>
    </div>
    <div class="ef2-divider"></div>
    <div class="kp-slot-section">
      <span class="ef2-section-label">Slot</span>
      <nav class="tabs tabs--pill kp-slot-tabs" id="kp_slotPills">
        ${PLAN_SLOT_ORDER.map(s => {
  const isOccupied = s === 'school'
    ? !!(planCache[preDate]?.['school-lunch'] && planCache[preDate]?.['school-lunch-2'])
    : !!planCache[preDate]?.[s];
  return `<button class="tab${s === selectedSlot ? ' is-active' : ''}${isOccupied ? ' is-occupied' : ''}" data-slot="${esc(s)}" type="button">${esc(SLOT_LABELS[s])}</button>`;
}).join('')}
      </nav>
    </div>
    <div class="ef2-divider"></div>
    <div class="kp-meal-section">
      <div class="kp-meal-header">
        <span class="ef2-section-label">Meal</span>
        <button class="btn btn--ghost btn--sm" id="kp_createRecipe" type="button">+ New recipe</button>
      </div>
      <button class="kp-meal-select${preRecipeName ? ' has-value' : ''}${preRecipeName ? '' : ' is-open'}" id="kp_mealSelect" type="button">
        <span id="kp_mealLabel">${esc(preRecipeName || 'Choose a meal…')}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="kp-meal-dropdown${preRecipeName ? '' : ' is-open'}" id="kp_mealDropdown">
        <input class="kp-search-input" id="kp_search" type="text" autocomplete="off" placeholder="Search…" value="${esc(preRecipeName)}">
        <div class="recipe-pick-list" id="recipePick">${buildRecipeRows(preRecipeName)}</div>
      </div>
    </div>
    <div class="kp-second-school${selectedSlot === 'school' && (selectedRecipeId || preRecipeName) ? ' is-visible' : ''}" id="kp_secondSection">
      <button class="ef2-add-chip${secondOpen ? ' is-active' : ''}" id="kp_addSecond" type="button">${secondOpen ? '− Remove second option' : '+ Plan a second School option'}</button>
      <div class="kp-second-meal${secondOpen ? ' is-open' : ''}" id="kp_secondMealWrap">
        <button class="kp-meal-select" id="kp_secondMealSelect" type="button">
          <span id="kp_secondMealLabel">Choose a meal…</span>
        </button>
        <div class="kp-meal-dropdown is-open" id="kp_secondMealDropdown">
          <input class="kp-search-input" id="kp_secondSearch" type="text" autocomplete="off" placeholder="Search…">
          <div class="recipe-pick-list" id="kp_secondPick"></div>
        </div>
      </div>
    </div>
    ${renderFormFooter({ saveLabel: 'Save', cancelId: 'kp_cancel', saveId: 'kp_save', disabled: !selectedSlot || !(preRecipeName || selectedRecipeId) })}`);
  activateSheet(mount);

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('kp_close')?.addEventListener('click', close);
  document.getElementById('kp_cancel')?.addEventListener('click', close);

  document.getElementById('kp_mealSelect')?.addEventListener('click', () => {
    const dropdown = document.getElementById('kp_mealDropdown');
    const willOpen = !dropdown.classList.contains('is-open');
    dropdown.classList.toggle('is-open');
    document.getElementById('kp_mealSelect').classList.toggle('is-open', willOpen);
    if (willOpen) setTimeout(() => document.getElementById('kp_search')?.focus(), 50);
  });

  document.getElementById('kp_datebtn')?.addEventListener('click', () => {
    const inp = document.getElementById('kp_day');
    try { inp.showPicker(); } catch { inp.focus(); }
  });
  document.getElementById('kp_day')?.addEventListener('change', (e) => {
    if (e.target.value) document.getElementById('kp_datebtn').textContent = formatDateLabel(e.target.value);
  });

  document.getElementById('kp_slotPills')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-slot]');
    if (!tab) return;
    selectedSlot = tab.dataset.slot;
    document.getElementById('kp_slotPills').querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
    syncSecondSchoolVisibility();
    updateSaveBtn();
  });

  document.getElementById('kp_createRecipe')?.addEventListener('click', () => {
    const day = document.getElementById('kp_day')?.value || preDate;
    const slot = selectedSlot;
    mount.innerHTML = '';
    openRecipeForm(null, (newId) => openPlanMealSheet(day, slot, newId));
  });

  function updateSaveBtn() {
    const val = document.getElementById('kp_search')?.value.trim();
    document.getElementById('kp_save').disabled = !selectedSlot || !(val || selectedRecipeId);
  }

  function syncMealLabel(name) {
    const label = document.getElementById('kp_mealLabel');
    if (label) label.textContent = name || 'Choose a meal…';
    document.getElementById('kp_mealSelect')?.classList.toggle('has-value', !!name);
  }

  function closeMealDropdown() {
    document.getElementById('kp_mealDropdown')?.classList.remove('is-open');
    document.getElementById('kp_mealSelect')?.classList.remove('is-open');
  }

  function bindPickRows() {
    document.getElementById('recipePick')?.querySelectorAll('[data-recipe-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (selectedRecipeId === btn.dataset.recipePick) {
          selectedRecipeId = null;
          document.getElementById('kp_search').value = '';
          syncMealLabel('');
        } else {
          selectedRecipeId = btn.dataset.recipePick;
          const name = recipes[selectedRecipeId]?.name || '';
          document.getElementById('kp_search').value = name;
          syncMealLabel(name);
          closeMealDropdown();
        }
        document.getElementById('recipePick').innerHTML = buildRecipeRows(document.getElementById('kp_search').value);
        bindPickRows();
        updateSaveBtn();
        syncSecondSchoolVisibility();
      });
    });
  }
  bindPickRows();

  function syncSecondSchoolVisibility() {
    const section = document.getElementById('kp_secondSection');
    const dayKey = document.getElementById('kp_day')?.value;
    const dayPlan = planCache[dayKey] || {};
    const otherSchoolFree = !(dayPlan['school-lunch'] && dayPlan['school-lunch-2']);
    const show = selectedSlot === 'school' && (selectedRecipeId || document.getElementById('kp_search')?.value.trim()) && otherSchoolFree;
    section?.classList.toggle('is-visible', show);
  }

  function bindSecondPickRows() {
    document.getElementById('kp_secondPick')?.querySelectorAll('[data-recipe-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.recipePick;
        secondRecipeId = secondRecipeId === id ? null : id;
        const name = secondRecipeId ? recipes[secondRecipeId]?.name || '' : '';
        document.getElementById('kp_secondSearch').value = name;
        document.getElementById('kp_secondMealLabel').textContent = name || 'Choose a meal…';
        document.getElementById('kp_secondPick').innerHTML = buildRecipeRows(name);
        bindSecondPickRows();
      });
    });
  }

  document.getElementById('kp_addSecond')?.addEventListener('click', () => {
    secondOpen = !secondOpen;
    document.getElementById('kp_addSecond').textContent = secondOpen ? '− Remove second option' : '+ Plan a second School option';
    document.getElementById('kp_addSecond').classList.toggle('is-active', secondOpen);
    document.getElementById('kp_secondMealWrap')?.classList.toggle('is-open', secondOpen);
    if (secondOpen) {
      document.getElementById('kp_secondPick').innerHTML = buildRecipeRows('');
      bindSecondPickRows();
    } else {
      secondRecipeId = null;
      secondTypedName = '';
    }
  });

  document.getElementById('kp_secondSearch')?.addEventListener('input', (e) => {
    secondRecipeId = null;
    secondTypedName = e.target.value.trim();
    document.getElementById('kp_secondPick').innerHTML = buildRecipeRows(e.target.value);
    bindSecondPickRows();
  });

  document.getElementById('kp_search')?.addEventListener('input', (e) => {
    selectedRecipeId = null;
    document.getElementById('recipePick').innerHTML = buildRecipeRows(e.target.value);
    bindPickRows();
    syncMealLabel(e.target.value.trim());
    updateSaveBtn();
    syncSecondSchoolVisibility();
  });

  document.getElementById('kp_save')?.addEventListener('click', async () => {
    const day = document.getElementById('kp_day')?.value;
    if (!day || !selectedSlot) return;
    const typed = document.getElementById('kp_search')?.value.trim();
    if (!selectedRecipeId && !typed) return;

    // Resolve concrete schema key (school virtual → school-lunch[-2]).
    const concreteSlot = selectedSlot === 'school' ? resolveSchoolSlot(day) : selectedSlot;
    if (!concreteSlot) {
      showToast('Both school slots are full for this day');
      return;
    }

    // First option write
    let firstData;
    if (selectedRecipeId) {
      firstData = { recipeId: selectedRecipeId, source: 'manual' };
    } else {
      const match = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === typed.toLowerCase());
      if (match) {
        selectedRecipeId = match[0];
        firstData = { recipeId: match[0], source: 'manual' };
      } else {
        firstData = { customName: typed, source: 'manual' };
      }
    }
    await writeKitchenPlanSlot(day, concreteSlot, firstData);

    // Optional second option (only relevant for school slot, when secondOpen and the OTHER school slot is free).
    if (selectedSlot === 'school' && secondOpen && (secondRecipeId || secondTypedName)) {
      const secondSlot = concreteSlot === 'school-lunch' ? 'school-lunch-2' : 'school-lunch';
      let secondData;
      if (secondRecipeId) {
        secondData = { recipeId: secondRecipeId, source: 'manual' };
      } else {
        const match = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === secondTypedName.toLowerCase());
        secondData = match ? { recipeId: match[0], source: 'manual' } : { customName: secondTypedName, source: 'manual' };
      }
      await writeKitchenPlanSlot(day, secondSlot, secondData);
    }

    // Bump lastUsed on chosen recipes
    if (selectedRecipeId) {
      await writeKitchenRecipe(selectedRecipeId, { ...recipes[selectedRecipeId], lastUsed: firebase.database.ServerValue.TIMESTAMP });
      recipes[selectedRecipeId].lastUsed = Date.now();
    }
    if (secondRecipeId) {
      await writeKitchenRecipe(secondRecipeId, { ...recipes[secondRecipeId], lastUsed: firebase.database.ServerValue.TIMESTAMP });
      recipes[secondRecipeId].lastUsed = Date.now();
    }

    mount.innerHTML = '';
    await renderMealsTab();
    showToast('Meal planned');
  });
}

function openSlotEditSheet(dk, slot, entry) {
  const mount = document.getElementById('sheetMount');
  const recipe = entry.recipeId ? recipes[entry.recipeId] : null;
  const name = recipe?.name || entry.mealName || entry.customName || '';
  const hasIngredients = (recipe?.ingredients || []).filter(i => (i?.name || i)?.trim()).length > 0;
  const d = new Date(dk + 'T12:00:00');
  const dayLabel = `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;

  const CLOSE_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  mount.innerHTML = renderBottomSheet(`
    <div class="task-detail-sheet">
      <div class="sheet__header">
        <h2 class="sheet__title">${esc(name)}</h2>
        <button class="ef2-icon-btn" id="slotClose" type="button" aria-label="Close">${CLOSE_SVG}</button>
      </div>
      <div class="task-detail__chips">
        ${(() => {
          const labelOverride = (slot === 'school-lunch' || slot === 'school-lunch-2')
            ? getSchoolSlotLabel(slot, planCache[dk] || {})
            : SLOT_LABELS[slot] || slot;
          return `<span class="chip">${esc(labelOverride)}</span>`;
        })()}
        <span class="chip">${esc(dayLabel)}</span>
      </div>
      <div class="me-detail__chips">
        ${hasIngredients ? `<button class="chip" id="slotAddToListBtn" type="button">Add to list</button>` : ''}
        <button class="chip" id="changeSlotMeal" type="button">Change meal</button>
        <button class="chip" id="removeSlotMeal" type="button">Remove</button>
      </div>
    </div>`);
  activateSheet(mount);

  document.getElementById('slotClose')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('slotAddToListBtn')?.addEventListener('click', async () => {
    mount.innerHTML = '';
    await addRecipeIngredientsToList(recipe);
  });
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

  const LINK_SVG   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const PENCIL_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH_SVG  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  const CLOSE_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  let sourceDomain = '';
  if (recipe.url) { try { sourceDomain = new URL(recipe.url).hostname.replace(/^www\./, ''); } catch {} }

  const baseServings = recipe.servings || null;
  let currentServings = baseServings;

  function scaleFactor() {
    return (baseServings && currentServings) ? currentServings / baseServings : 1;
  }

  function buildIngredientRows() {
    const factor = scaleFactor();
    return (recipe.ingredients || []).map(i =>
      `<span class="rd-ing-qty">${esc(scaleQty(i.qty || '', factor) || '')}</span><span class="rd-ing-name">${esc(i.name || '')}</span>`
    ).join('');
  }

  function buildServingsRow() {
    if (!baseServings) return '';
    return `
      <div class="rd-servings-row">
        <span class="rd-servings-label">Ingredients</span>
        <div class="rd-serves-stepper">
          <button class="rd-stepper-btn" id="rdServingsDown" type="button" aria-label="Fewer servings">−</button>
          <span class="rd-stepper-val" id="rdServingsVal">${currentServings}</span>
          <span class="rd-stepper-unit">servings</span>
          <button class="rd-stepper-btn" id="rdServingsUp" type="button" aria-label="More servings">+</button>
        </div>
      </div>`;
  }

  function buildMetaChips() {
    return [
      recipe.prepTime   ? `<span class="rd-meta-chip">${esc(recipe.prepTime)}</span>` : '',
      baseServings      ? `<span class="rd-meta-chip">Serves ${baseServings}</span>` : '',
      recipe.difficulty ? `<span class="rd-meta-chip">${esc(recipe.difficulty)}</span>` : '',
    ].filter(Boolean).join('');
  }

  function buildStars() {
    const { avg } = avgRating(recipe, linkedPerson?.id);
    if (avg == null) {
      return `<button class="rd-stars-btn rd-stars-btn--empty" id="rdStarsBtn" type="button" aria-label="Not rated — tap to rate"><span class="rd-stars-empty">☆☆☆☆☆</span></button>`;
    }
    const numText = Number.isInteger(avg) ? `${avg}.0` : avg.toFixed(1);
    // Render avg as half-precision visual + numeric
    const fullStars = Math.floor(avg);
    const hasHalf = (avg - fullStars) >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    const visual = '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(emptyStars);
    return `<button class="rd-stars-btn" id="rdStarsBtn" type="button" aria-label="Rating ${numText} of 5 — tap to rate"><span class="rd-stars-visual">${visual}</span><span class="rd-stars-num">${esc(numText)}</span></button>`;
  }

  const hasIngredients = (recipe.ingredients?.length || 0) > 0;

  function render() {
    const metaChips = buildMetaChips();
    mount.innerHTML = renderBottomSheet(`
      ${recipe.imageUrl ? `<div class="rd-hero"><img src="${esc(recipe.imageUrl)}" alt="" class="rd-hero__img" loading="lazy" onerror="this.parentElement.remove()"/></div>` : ''}
      <div class="sheet__header">
        <h2 class="sheet__title">${esc(recipe.name)}</h2>
        <div class="rf-header-actions">
          ${recipe.url ? `<a class="ef2-icon-btn" href="${esc(recipe.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open recipe">${LINK_SVG}</a>` : ''}
          <button class="ef2-icon-btn rf-delete-btn" id="deleteRecipeBtn" aria-label="Delete" type="button">${TRASH_SVG}</button>
          <button class="ef2-icon-btn" id="editRecipeBtn" aria-label="Edit" type="button">${PENCIL_SVG}</button>
          <button class="ef2-icon-btn" id="closeRecipeDetail" aria-label="Close" type="button">${CLOSE_SVG}</button>
        </div>
      </div>
      ${metaChips ? `<div class="rd-meta">${metaChips}</div>` : ''}
      <div class="rd-source-row">
        ${sourceDomain ? `<span class="rd-source">from ${esc(sourceDomain)}</span>` : '<span></span>'}
        <div class="rd-stars">${buildStars()}</div>
      </div>
      ${recipe.notes ? `
        <details class="rd-chef-notes" open>
          <summary class="rd-chef-notes__label">Chef's notes</summary>
          <p class="rd-chef-notes__body">${esc(recipe.notes)}</p>
        </details>` : ''}
      ${hasIngredients ? `
        <div class="me-detail__section">
          ${buildServingsRow()}
          ${!baseServings ? '<span class="me-detail__section-label">Ingredients</span>' : ''}
          <div class="rd-ingredients" id="rdIngredients">${buildIngredientRows()}</div>
        </div>` : ''}
      <div class="sheet__footer">
        ${hasIngredients ? `<button class="btn btn--primary" id="addToListBtn" type="button">Add to list</button>` : ''}
        <button class="btn btn--ghost" id="planThisMealBtn" type="button">Plan this meal</button>
      </div>`);
    activateSheet(mount);
    bindButtons();
  }

  function bindButtons() {
    document.getElementById('closeRecipeDetail')?.addEventListener('click', close);

    document.getElementById('rdServingsDown')?.addEventListener('click', () => {
      if (currentServings <= 1) return;
      currentServings--;
      document.getElementById('rdServingsVal').textContent = currentServings;
      document.getElementById('rdIngredients').innerHTML = buildIngredientRows();
    });
    document.getElementById('rdServingsUp')?.addEventListener('click', () => {
      currentServings++;
      document.getElementById('rdServingsVal').textContent = currentServings;
      document.getElementById('rdIngredients').innerHTML = buildIngredientRows();
    });

    document.getElementById('rdStarsBtn')?.addEventListener('click', () => {
      close();
      openRecipeRatingSheet(recipeId);
    });

    document.getElementById('planThisMealBtn')?.addEventListener('click', () => {
      close();
      const tz = settings?.timezone || 'America/Chicago';
      openPlanMealSheet(todayKey(tz), 'dinner', recipeId);
    });

    document.getElementById('addToListBtn')?.addEventListener('click', () => {
      close();
      openAddToListReviewSheet(recipe, currentServings, baseServings);
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

  const close = () => { mount.innerHTML = ''; };
  render();
}

function openAddToListReviewSheet(recipe, currentServings, baseServings) {
  const mount = document.getElementById('sheetMount');
  const listEntries = Object.entries(lists);
  const factor = (baseServings && currentServings) ? currentServings / baseServings : 1;

  // Build working copy of ingredients (scaled qty, editable)
  const items = (recipe.ingredients || [])
    .filter(i => i.name?.trim())
    .map((i, idx) => ({ idx, name: i.name.trim(), qty: scaleQty(i.qty || '', factor) || i.qty || '', checked: true }));

  if (!items.length) return;

  function buildRows() {
    return items.map((it, i) => `
      <div class="ral-row${it.checked ? '' : ' ral-row--unchecked'}" data-ral-idx="${i}">
        <button class="ral-check" data-ral-check="${i}" type="button" aria-label="${it.checked ? 'Deselect' : 'Select'}">
          ${it.checked
            ? `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="var(--accent)"/><path d="M6.5 11l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="var(--border)" stroke-width="1.5"/></svg>`}
        </button>
        <input class="ral-qty" data-ral-qty="${i}" type="text" value="${esc(it.qty)}" placeholder="qty" autocomplete="off">
        <span class="ral-name">${esc(it.name)}</span>
      </div>`).join('');
  }

  function buildListSelector() {
    if (listEntries.length <= 1) return '';
    return `<div class="ral-list-row">
      <span class="ral-list-label">Add to</span>
      <select class="ral-list-select" id="ralListSelect">
        ${listEntries.map(([id, l]) => `<option value="${esc(id)}">${esc(l.name)}</option>`).join('')}
      </select>
    </div>`;
  }

  function checkedCount() { return items.filter(i => i.checked).length; }

  function renderSheet() {
    mount.innerHTML = renderBottomSheet(`
      <div class="sheet__header">
        <h2 class="sheet__title">Add to list</h2>
        <button class="ef2-icon-btn" id="ralClose" type="button" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      ${buildListSelector()}
      <div class="ral-list" id="ralList">${buildRows()}</div>
      <div class="sheet__footer">
        <button class="btn btn--ghost" id="ralCancel" type="button">Cancel</button>
        <button class="btn btn--primary" id="ralAdd" type="button">Add <span id="ralCount">${checkedCount()}</span> items</button>
      </div>`);
    activateSheet(mount);

    document.getElementById('ralClose')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('ralCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });

    mount.querySelector('#ralList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ral-check]');
      if (!btn) return;
      const i = parseInt(btn.dataset.ralCheck, 10);
      items[i].checked = !items[i].checked;
      mount.querySelector('#ralList').innerHTML = buildRows();
      rebindQtyInputs();
      document.getElementById('ralCount').textContent = checkedCount();
    });

    function rebindQtyInputs() {
      mount.querySelectorAll('[data-ral-qty]').forEach(inp => {
        inp.addEventListener('input', () => {
          items[parseInt(inp.dataset.ralQty, 10)].qty = inp.value;
        });
      });
    }
    rebindQtyInputs();

    document.getElementById('ralAdd')?.addEventListener('click', async () => {
      const selectedItems = items.filter(i => i.checked);
      if (!selectedItems.length) { mount.innerHTML = ''; return; }

      let listId;
      if (listEntries.length === 0) {
        mount.innerHTML = '';
        openCreateListSheet(async (newId) => {
          const now = Date.now();
          for (const it of selectedItems)
            await pushKitchenItem(newId, { name: it.name, qty: it.qty || null, checked: false, addedAt: now });
          showToast(`Added ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`);
        });
        return;
      } else if (listEntries.length === 1) {
        listId = listEntries[0][0];
      } else {
        listId = document.getElementById('ralListSelect')?.value;
      }
      if (!listId) { mount.innerHTML = ''; return; }

      mount.innerHTML = '';
      const now = Date.now();
      for (const it of selectedItems)
        await pushKitchenItem(listId, { name: it.name, qty: it.qty || null, checked: false, addedAt: now });
      showToast(`Added ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} to ${lists[listId]?.name || 'list'}`);
    });
  }

  renderSheet();
}

// pickList removed — list selection is now inline in openAddToListReviewSheet

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
function openRecipeRatingSheet(recipeId) {
  const recipe = recipes[recipeId];
  if (!recipe) return;
  const mount = document.getElementById('sheetMount');

  if (!linkedPerson) {
    showToast('Open this page from your personal link to rate recipes');
    return;
  }

  const viewerId = linkedPerson.id;
  let myRating = (recipe.ratings && recipe.ratings[viewerId]) || 0;

  function renderStars(value) {
    // 5 star slots, each with two tap zones (half / full).
    return Array.from({ length: 5 }, (_, i) => {
      const star = i + 1;
      const filled = value >= star ? 'full' : (value >= star - 0.5 ? 'half' : 'empty');
      return `
        <span class="rrs-star rrs-star--${filled}">
          <button class="rrs-star__half rrs-star__half--left" data-rrs-val="${star - 0.5}" type="button" aria-label="${star - 0.5} stars"></button>
          <button class="rrs-star__half rrs-star__half--right" data-rrs-val="${star}" type="button" aria-label="${star} stars"></button>
          <span class="rrs-star__glyph">★</span>
        </span>`;
    }).join('');
  }

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: `Rate ${recipe.name}`, closeId: 'rrs_close' })}
      <div class="rrs-body">
        <div class="rrs-stars" id="rrsStars">${renderStars(myRating)}</div>
        <div class="rrs-helper">${myRating ? `Your rating: ${myRating}` : 'Tap a star to rate'}</div>
      </div>
      <div class="rrs-footer">
        ${myRating ? `<button class="btn btn--ghost" id="rrsClear" type="button">Remove my rating</button>` : ''}
      </div>
    `);
    activateSheet(mount);
    bindStars();
    document.getElementById('rrs_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('rrsClear')?.addEventListener('click', async () => {
      myRating = 0;
      const ratings = { ...(recipe.ratings || {}) };
      delete ratings[viewerId];
      recipes[recipeId] = { ...recipe, ratings };
      await writeKitchenRecipe(recipeId, { ...recipes[recipeId] });
      mount.innerHTML = '';
      renderActiveTab();
      showToast('Rating removed');
    });
  }

  function bindStars() {
    mount.querySelectorAll('[data-rrs-val]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const val = parseFloat(btn.dataset.rrsVal);
        myRating = val;
        const ratings = { ...(recipe.ratings || {}), [viewerId]: val };
        recipes[recipeId] = { ...recipe, ratings };
        await writeKitchenRecipe(recipeId, { ...recipes[recipeId] });
        mount.innerHTML = '';
        renderActiveTab();
        showToast('Rating saved');
      });
    });
  }

  render();
}
function openRecipeFilterSheet() {
  const mount = document.getElementById('sheetMount');

  // Build the tag pool from all recipes (deduplicated, alpha-sorted).
  const tagPool = (() => {
    const set = new Set();
    Object.values(recipes).forEach(r => (r.tags || []).forEach(t => {
      const trim = (t || '').trim();
      if (trim) set.add(trim);
    }));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  // Working copy — applied only on Save.
  const work = {
    show: recipeFilter.show,
    prepBucket: recipeFilter.prepBucket,
    difficulty: recipeFilter.difficulty,
    tags: [...(recipeFilter.tags || [])],
    sort: recipeFilter.sort,
  };

  const showOpts = [
    { v: 'all',          l: 'All' },
    { v: 'top-rated',    l: 'Top rated' },
    { v: 'never-cooked', l: 'Never cooked' },
  ];
  const prepOpts = [
    { v: 'any',   l: 'Any' },
    { v: 'lt-30', l: '< 30 min' },
    { v: '30-60', l: '30–60 min' },
    { v: 'gt-60', l: '> 60 min' },
  ];
  const diffOpts = [
    { v: 'any',    l: 'Any' },
    { v: 'Easy',   l: 'Easy' },
    { v: 'Medium', l: 'Medium' },
    { v: 'Hard',   l: 'Hard' },
  ];
  const sortOpts = [
    { v: 'alpha',          l: 'A–Z' },
    { v: 'recent',         l: 'Recently added' },
    { v: 'quickest',       l: 'Quickest first' },
    { v: 'last-cooked',    l: 'Last cooked' },
    { v: 'highest-rated',  l: 'Highest rated' },
  ];

  function chipRow(opts, key) {
    return opts.map(o =>
      `<button class="chip${work[key] === o.v ? ' chip--active' : ''}" data-rf-key="${esc(key)}" data-rf-val="${esc(o.v)}" type="button">${esc(o.l)}</button>`
    ).join('');
  }

  function tagsHtml() {
    if (!tagPool.length) {
      return `<div class="filter-section__hint">No tags yet — add tags from the recipe form.</div>`;
    }
    return tagPool.map(t =>
      `<button class="chip${work.tags.includes(t) ? ' chip--active' : ''}" data-rf-tag="${esc(t)}" type="button">${esc(t)}</button>`
    ).join('');
  }

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Filter & Sort', closeId: 'rf_close' })}
    <div class="filter-section">
      <div class="filter-section__label">SHOW</div>
      <div class="filter-chips">${chipRow(showOpts, 'show')}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">PREP TIME</div>
      <div class="filter-chips">${chipRow(prepOpts, 'prepBucket')}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">DIFFICULTY</div>
      <div class="filter-chips">${chipRow(diffOpts, 'difficulty')}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">TAGS</div>
      <div class="filter-chips" id="rfTags">${tagsHtml()}</div>
    </div>
    <div class="filter-section">
      <div class="filter-section__label">SORT BY</div>
      <div class="filter-chips">${chipRow(sortOpts, 'sort')}</div>
    </div>
    ${renderFormFooter({ saveLabel: 'Apply', cancelId: 'rfCancel', saveId: 'rfApply' })}
  `);
  activateSheet(mount);

  // Single-select chip groups (show / prepBucket / difficulty / sort)
  mount.querySelectorAll('[data-rf-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rfKey;
      const val = btn.dataset.rfVal;
      work[key] = val;
      mount.querySelectorAll(`[data-rf-key="${key}"]`).forEach(b => {
        b.classList.toggle('chip--active', b.dataset.rfVal === val);
      });
    });
  });

  // Multi-select tags
  mount.querySelectorAll('[data-rf-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.rfTag;
      if (work.tags.includes(tag)) {
        work.tags = work.tags.filter(t => t !== tag);
      } else {
        work.tags.push(tag);
      }
      btn.classList.toggle('chip--active', work.tags.includes(tag));
    });
  });

  document.getElementById('rf_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('rfCancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('rfApply')?.addEventListener('click', () => {
    recipeFilter = { ...work };
    mount.innerHTML = '';
    renderRecipesTab();
  });
}

async function runSchoolLunchImport(file) {
  if (!file) return;
  const mount = document.getElementById('sheetMount');

  // Show a loading sheet immediately while we work
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header"><h2 class="sheet__title">Extracting school lunch menu…</h2></div>
    <div class="sheet__content"><p style="color:var(--text-muted)">This usually takes 10–20 seconds.</p></div>
  `);
  activateSheet(mount);

  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'schoolLunch', input: { base64, mediaType: file.type || 'image/jpeg' } }),
    });
    const data = await res.json();
    // Worker returns { days: [{ date, lunch1, lunch2, confidence }] }
    // Expand each day into flat entries: lunch1 → school-lunch, lunch2 → school-lunch-2
    let days = Array.isArray(data?.days) ? data.days : [];

    function buildAndOpen(resolvedDays) {
      const entries = [];
      for (const d of resolvedDays) {
        if (d.date && d.lunch1) {
          entries.push({ date: d.date, name: d.lunch1, slot: 'school-lunch' });
          if (d.lunch2) {
            entries.push({ date: d.date, name: d.lunch2, slot: 'school-lunch-2' });
          }
        }
      }
      if (!entries.length) {
        mount.innerHTML = '';
        showToast('Could not read the menu — try a clearer photo');
        return;
      }
      openSchoolLunchConfirmSheet(entries);
    }

    if (data?.monthUncertain) {
      mount.innerHTML = '';
      openMonthClarificationSheet(data.assumedMonth, (yearMonth) => {
        const remapped = days.map(d => d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
          ? { ...d, date: `${yearMonth}-${d.date.slice(8, 10)}` }
          : d);
        buildAndOpen(remapped);
      });
    } else {
      buildAndOpen(days);
    }
  } catch (err) {
    console.error('school-lunch import failed', err);
    mount.innerHTML = '';
    showToast('Import failed — try again');
  }
}

function openSchoolLunchConfirmSheet(entries) {
  const mount = document.getElementById('sheetMount');
  // entries: [{ date: 'YYYY-MM-DD', name: 'Crispy Chicken Sandwich', slot: 'school-lunch' | 'school-lunch-2' }]
  const working = entries.map((e, i) => ({ ...e, checked: true, idx: i }));

  function rows() {
    return working.map(e => `
      <div class="sl-confirm-row${e.checked ? '' : ' is-unchecked'}" data-idx="${e.idx}">
        <button class="ral-check" data-toggle="${e.idx}" type="button" aria-label="${e.checked ? 'Skip' : 'Include'}">
          ${e.checked
            ? `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="var(--accent)"/><path d="M6.5 11l3 3 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="var(--border)" stroke-width="1.5"/></svg>`}
        </button>
        <span class="sl-confirm-date">${esc(e.date)}</span>
        <input class="sl-confirm-name" data-name="${e.idx}" type="text" value="${esc(e.name)}">
      </div>`).join('');
  }

  function bindRows() {
    mount.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.toggle, 10);
        const entry = working.find(e => e.idx === i);
        if (entry) entry.checked = !entry.checked;
        mount.querySelector('#sl_list').innerHTML = rows();
        bindRows();
      });
    });
    mount.querySelectorAll('[data-name]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.dataset.name, 10);
        const entry = working.find(e => e.idx === i);
        if (entry) entry.name = inp.value;
      });
    });
  }

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: `Import ${entries.length} lunches`, closeId: 'sl_close' })}
    <div class="sl-confirm-list" id="sl_list">${rows()}</div>
    ${renderFormFooter({ saveLabel: `Import`, cancelId: 'sl_cancel', saveId: 'sl_save' })}
  `);
  activateSheet(mount);
  bindRows();

  document.getElementById('sl_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('sl_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  document.getElementById('sl_save')?.addEventListener('click', async () => {
    const accepted = working.filter(e => e.checked && e.name.trim() && e.date);
    let count = 0;
    for (const e of accepted) {
      const dayPlan = await readKitchenPlan(e.date).catch(() => null) || {};
      let target;
      if (e.slot === 'school-lunch-2') {
        target = dayPlan['school-lunch-2'] ? null : 'school-lunch-2';
      } else {
        target = !dayPlan['school-lunch'] ? 'school-lunch' : (!dayPlan['school-lunch-2'] ? 'school-lunch-2' : null);
      }
      if (!target) continue;
      await writeKitchenPlanSlot(e.date, target, { customName: e.name.trim(), source: 'school-photo' });
      count++;
    }
    mount.innerHTML = '';
    await renderMealsTab();
    showToast(`Imported ${count} lunch${count === 1 ? '' : 'es'}`);
  });
}

async function syncOneFeed(personId) {
  const feed = (await readSchoolLunchFeeds())?.[personId];
  if (!feed?.url) return;
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);
  let lastError = null;
  let icsText = null;
  try {
    const res = await fetch(feed.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    icsText = await res.text();
  } catch (err) {
    lastError = err?.message || 'Fetch failed';
    await writeSchoolLunchFeedSync(personId, { lastSync: Date.now(), lastError });
    return;
  }

  let mapped = [];
  try {
    const events = parseIcs(icsText);
    // Read current plan for the window
    const days = [];
    const day0 = new Date(todayStr + 'T00:00:00');
    for (let i = 0; i < 30; i++) {
      const d = new Date(day0);
      d.setDate(d.getDate() + i);
      days.push(dateKey(d));
    }
    const planByDate = {};
    for (const dk of days) {
      planByDate[dk] = await readKitchenPlan(dk).catch(() => null) || {};
    }
    mapped = mapEventsToPlan(events, planByDate, todayStr);
  } catch (err) {
    lastError = err?.message || 'Parse failed';
    await writeSchoolLunchFeedSync(personId, { lastSync: Date.now(), lastError });
    return;
  }

  let written = 0;
  const conflicts = {};
  for (const m of mapped) {
    if (!m.target) {
      conflicts[m.date] = m.conflictType || 'unknown';
      continue;
    }
    await writeKitchenPlanSlot(m.date, m.target, { customName: m.summary, source: 'ical' });
    written++;
  }
  await writeSchoolLunchFeedSync(personId, {
    lastSync: Date.now(),
    lastError: null,
    conflicts: Object.keys(conflicts).length ? conflicts : null,
  });
  const conflictCount = Object.keys(conflicts).length;
  showToast(
    conflictCount
      ? `Synced ${written}; ${conflictCount} conflict${conflictCount === 1 ? '' : 's'} skipped`
      : `Synced ${written} lunch${written === 1 ? '' : 'es'}`
  );
  await renderMealsTab();
}

async function openSchoolLunchIcalSheet() {
  const mount = document.getElementById('sheetMount');
  const feeds = (await readSchoolLunchFeeds()) || {};

  function rowsHtml() {
    const peopleById = Object.fromEntries(people.map(p => [p.id, p]));
    const entries = Object.entries(feeds);
    if (!entries.length) return `<div class="sli-empty">No feeds yet. Tap "+ Add a feed" to start.</div>`;
    return entries.map(([personId, f]) => {
      const person = peopleById[personId];
      const host = (() => { try { return new URL(f.url).hostname.replace(/^www\./, ''); } catch { return f.url; } })();
      const lastSync = f.lastSync ? new Date(f.lastSync).toLocaleString() : 'Never';
      const conflictCount = f.conflicts ? Object.keys(f.conflicts).length : 0;
      const conflictChip = conflictCount
        ? `<span class="sli-conflicts">${conflictCount} conflict${conflictCount === 1 ? '' : 's'}</span>`
        : '';
      return `<div class="sli-row" data-person="${esc(personId)}">
        <div class="sli-row__title">${esc(person?.name || 'Unknown')} · ${esc(host)} ${conflictChip}</div>
        <div class="sli-row__meta">Last sync: ${esc(lastSync)}${f.lastError ? ` · <span class="sli-err">${esc(f.lastError)}</span>` : ''}</div>
        <div class="sli-row__actions">
          <button class="chip" data-sync="${esc(personId)}" type="button">Sync now</button>
          <button class="chip" data-edit="${esc(personId)}" type="button">Edit URL</button>
          <button class="chip" data-remove="${esc(personId)}" type="button">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: 'School lunch iCal feeds', closeId: 'sli_close' })}
      <div class="sli-list" id="sli_list">${rowsHtml()}</div>
      <div class="sli-add-row">
        <button class="btn btn--ghost btn--full" id="sli_add" type="button">+ Add a feed</button>
      </div>
    `);
    activateSheet(mount);
    bindRowActions();
    document.getElementById('sli_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('sli_add')?.addEventListener('click', () => openFeedEdit(null));
  }

  function bindRowActions() {
    mount.querySelectorAll('[data-sync]').forEach(b => b.addEventListener('click', async () => {
      await syncOneFeed(b.dataset.sync);
      const fresh = (await readSchoolLunchFeeds()) || {};
      Object.assign(feeds, fresh);
      for (const k of Object.keys(feeds)) if (!fresh[k]) delete feeds[k];
      render();
    }));
    mount.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openFeedEdit(b.dataset.edit)));
    mount.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', async () => {
      const personId = b.dataset.remove;
      const ok = await showConfirm({ title: 'Remove this feed?', confirmLabel: 'Remove', danger: true });
      if (!ok) return;
      await removeSchoolLunchFeed(personId);
      delete feeds[personId];
      render();
    }));
  }

  function openFeedEdit(existingPersonId) {
    const existing = existingPersonId ? feeds[existingPersonId] : null;
    const subMount = mount;
    subMount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: existing ? 'Edit feed' : 'Add a feed', closeId: 'slie_close' })}
      <label class="field">
        <span class="field__label">Person</span>
        <select class="field__input" id="slie_person" ${existingPersonId ? 'disabled' : ''}>
          ${people.map(p => `<option value="${esc(p.id)}" ${p.id === existingPersonId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Feed URL</span>
        <input class="field__input" id="slie_url" type="url" placeholder="https://..." value="${esc(existing?.url || '')}" autocomplete="off">
      </label>
      ${renderFormFooter({ saveLabel: existing ? 'Save' : 'Add', cancelId: 'slie_cancel', saveId: 'slie_save' })}
    `);
    activateSheet(subMount);
    document.getElementById('slie_close')?.addEventListener('click', () => render());
    document.getElementById('slie_cancel')?.addEventListener('click', () => render());
    document.getElementById('slie_save')?.addEventListener('click', async () => {
      const pid = document.getElementById('slie_person')?.value;
      const url = document.getElementById('slie_url')?.value.trim();
      if (!pid || !url) return;
      const data = {
        url,
        addedAt: existing?.addedAt || Date.now(),
        addedBy: existing?.addedBy || pid,
      };
      await writeSchoolLunchFeed(pid, data);
      feeds[pid] = { ...(feeds[pid] || {}), ...data };
      render();
    });
  }

  render();
}

function openKitchenAiToolsSheet() {
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Kitchen AI tools', closeId: 'kait_close' })}
    <div class="kait-section">
      <div class="kait-section__label">SCHOOL LUNCH</div>
      <div class="kait-grid">
        <button class="btn btn--secondary" id="kait_schoolPhoto" type="button">📷 Take photo</button>
        <button class="btn btn--secondary" id="kait_schoolGallery" type="button">🖼 From gallery</button>
        <button class="btn btn--secondary" id="kait_schoolFile" type="button">📄 Upload file</button>
        <button class="btn btn--secondary" id="kait_schoolIcal" type="button">🔗 iCal feed</button>
      </div>
    </div>
    <div class="kait-section">
      <div class="kait-section__label">RECIPES</div>
      <div class="kait-grid">
        <button class="btn btn--secondary" id="kait_recipeUrl" type="button">🔗 Import from URL</button>
        <button class="btn btn--secondary" id="kait_recipePhoto" type="button">📷 Import from photo</button>
        <button class="btn btn--secondary" id="kait_recipeFind" type="button">🔎 Find ideas online</button>
      </div>
    </div>
  `);
  activateSheet(mount);
  document.getElementById('kait_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  // Hidden file inputs for the three sources
  const fileSources = {
    photo:   { accept: 'image/*', capture: 'environment' },
    gallery: { accept: 'image/*', capture: undefined },
    file:    { accept: '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif', capture: undefined },
  };
  function openFilePicker(kind) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = fileSources[kind].accept;
    if (fileSources[kind].capture) input.capture = fileSources[kind].capture;
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) runSchoolLunchImport(file);
    };
    input.click();
  }

  document.getElementById('kait_schoolPhoto')?.addEventListener('click', () => openFilePicker('photo'));
  document.getElementById('kait_schoolGallery')?.addEventListener('click', () => openFilePicker('gallery'));
  document.getElementById('kait_schoolFile')?.addEventListener('click', () => openFilePicker('file'));
  document.getElementById('kait_schoolIcal')?.addEventListener('click', () => {
    document.getElementById('sheetMount').innerHTML = '';
    openSchoolLunchIcalSheet();
  });

  document.getElementById('kait_recipeUrl')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openRecipeForm(null);
    // Focus the URL field after the form is mounted
    setTimeout(() => document.getElementById('recipeUrl')?.focus(), 50);
  });

  document.getElementById('kait_recipePhoto')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openRecipeForm(null);
    // Trigger the photo-source picker via the existing camera button
    setTimeout(() => document.getElementById('kr_photo')?.click(), 50);
  });

  document.getElementById('kait_recipeFind')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openFindRecipesSheet();
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
  const starOutlineSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Add items</h2>
    </div>
    <p class="kb-hint">Type each item and press Enter, or paste a list. Tap the star to also save each new item as a staple.</p>
    <div class="kb-input-row">
      <input class="field__input" id="bulkAddInput" type="text"
        placeholder="e.g. Milk" autocomplete="off" autocorrect="off">
      <button class="btn-icon kb-input-star" id="bulkAddStarToggle" type="button"
        aria-pressed="false" aria-label="Also save each new item as a staple">${starOutlineSvg}</button>
    </div>
    <div id="bulkAddedList"></div>
    <div class="kb-footer">
      <button class="btn btn--primary" id="bulkAddDone" type="button">Done</button>
    </div>`);
  activateSheet(mount);

  let addedItems = [];
  let staplesByDefault = false;

  const starBtn = document.getElementById('bulkAddStarToggle');
  starBtn?.addEventListener('click', () => {
    staplesByDefault = !staplesByDefault;
    starBtn.setAttribute('aria-pressed', String(staplesByDefault));
    starBtn.classList.toggle('is-active', staplesByDefault);
  });

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
    // Auto-save to staples when the star toggle is active and not already a staple.
    if (staplesByDefault) {
      const isSaved = Object.values(staples).some(s => s.name.toLowerCase() === trimmed.toLowerCase());
      if (!isSaved) {
        const sid = await pushKitchenStaple({ name: trimmed, category: null });
        staples[sid] = { name: trimmed, category: null };
      }
    }
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

function buildIngredientNamePool() {
  const set = new Set();
  Object.values(recipes || {}).forEach(r => (r.ingredients || []).forEach(ing => {
    const n = (ing.name || '').trim();
    if (n) set.add(n);
  }));
  Object.values(staples || {}).forEach(s => {
    const n = (s.name || '').trim();
    if (n) set.add(n);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function openRecipeForm(recipeId, onSave = null) {
  const existing = recipeId ? recipes[recipeId] : null;
  const ingredients = existing?.ingredients ? [...existing.ingredients] : [];
  let imageUrl = existing?.imageUrl || '';
  const tagsOpen = existing?.tags?.length ? ' is-open' : '';
  const cookTimeOpen = existing?.cookTime ? ' is-open' : '';

  const mount = document.getElementById('sheetMount');
  const INGREDIENT_LIST_ID = 'kr_ingredient_datalist';

  function buildIngredientRow(i) {
    const ing = ingredients[i];
    return `<div class="ingredient-row" data-index="${i}">
        <input class="ingredient-qty" data-edit-index="${i}" data-edit-field="qty" type="text" inputmode="decimal" value="${esc(ing.qty || '')}" placeholder="qty" autocomplete="off" enterkeyhint="next">
        <input class="ingredient-name" data-edit-index="${i}" data-edit-field="name" type="text" value="${esc(ing.name || '')}" placeholder="ingredient" autocomplete="off" list="${INGREDIENT_LIST_ID}">
        <button class="btn-icon" data-remove-index="${i}" type="button" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
  }

  function buildIngredientList() {
    return ingredients.map((_, i) => buildIngredientRow(i)).join('');
  }

  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${existing ? 'Edit recipe' : 'New recipe'}</h2>
      <div class="rf-header-actions">
        ${recipeId ? `<button class="ef2-icon-btn rf-delete-btn" id="kr_delete" type="button" aria-label="Delete recipe"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
        <button class="ef2-icon-btn rf-save-btn" id="kr_save" type="button" aria-label="${existing ? 'Save changes' : 'Create recipe'}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="ef2-icon-btn" id="kr_close" aria-label="Close" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>

    <div class="kr-section" id="recipeUrlSection">
      <label class="field${existing?.url ? ' is-hidden' : ''}" id="recipeUrlField">
        <span class="field__label">Recipe link</span>
        <input id="recipeUrl" type="url" placeholder="https://…"
          value="${esc(existing?.url || '')}" autocomplete="off">
      </label>
      <div class="kr-url-collapsed${existing?.url ? '' : ' is-hidden'}" id="recipeUrlCollapsed">
        <span class="kr-url-host" id="recipeUrlHost">${existing?.url ? `from ${esc((function(u){try{return new URL(u).hostname.replace(/^www\\./,'');}catch{return u;}})(existing.url))}` : ''}</span>
        <button class="btn btn--ghost btn--sm" id="recipeUrlEdit" type="button">Change</button>
      </div>
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

    <div class="kr-section kr-meta-row">
      <label class="field">
        <span class="field__label">Prep time</span>
        <input id="recipePrepTime" type="text" class="field__input" placeholder="30 min"
          value="${esc(existing?.prepTime || '')}" autocomplete="off">
      </label>
      <label class="field">
        <span class="field__label">Serves</span>
        <input id="recipeServings" type="number" inputmode="numeric" class="field__input" min="1" max="99" placeholder="4"
          value="${existing?.servings || ''}" autocomplete="off">
      </label>
      <label class="field">
        <span class="field__label">Difficulty</span>
        ${renderChipPicker({
          pickerId: 'recipeDifficultyPicker',
          hiddenId: 'recipeDifficulty',
          options: [{ value: 'Easy', label: 'Easy' }, { value: 'Medium', label: 'Medium' }, { value: 'Hard', label: 'Hard' }],
          value: existing?.difficulty || '',
        })}
      </label>
    </div>

    <div class="kr-section">
      <span class="ef2-section-label">Ingredients</span>
      <datalist id="${INGREDIENT_LIST_ID}">
        ${buildIngredientNamePool().map(n => `<option value="${esc(n)}"></option>`).join('')}
      </datalist>
      <div id="ingredientList">${buildIngredientList()}</div>
      <div class="kr-add-ingredient-row">
        <input class="kr-add-qty" id="newIngredientQty" type="text" inputmode="decimal"
          placeholder="qty" autocomplete="off" enterkeyhint="next">
        <input class="field__input" id="newIngredientInput" type="text"
          placeholder="Add ingredient…" autocomplete="off" enterkeyhint="done" list="${INGREDIENT_LIST_ID}">
        <button class="btn btn--secondary" id="addIngredientBtn" type="button">Add</button>
      </div>
    </div>

    <div class="kr-section">
      <span class="ef2-section-label">Notes</span>
      <textarea id="recipeNotes" class="kr-notes" placeholder="Description, tips, source…" autocomplete="off">${esc(existing?.notes || '')}</textarea>
    </div>

    <div class="ef2-secondary-row">
      <button class="ef2-add-chip${tagsOpen ? ' is-active' : ''}" id="kr_tagsChip" type="button">+ Tags</button>
      <button class="ef2-add-chip${cookTimeOpen ? ' is-active' : ''}" id="kr_cookTimeChip" type="button">+ Cook time</button>
    </div>

    <div class="ef2-field-reveal${tagsOpen}" id="kr_tagsReveal">
      <label class="field">
        <span class="field__label">Tags</span>
        <input id="recipeTags" type="text" class="field__input" placeholder="Italian, quick, vegetarian…"
          value="${esc((existing?.tags || []).join(', '))}" autocomplete="off">
      </label>
    </div>

    <div class="ef2-field-reveal${cookTimeOpen}" id="kr_cookTimeReveal">
      <label class="field">
        <span class="field__label">Cook time</span>
        <input id="recipeCookTime" type="text" class="field__input" placeholder="45 min"
          value="${esc(existing?.cookTime || '')}" autocomplete="off">
      </label>
    </div>`);
  activateSheet(mount);
  requestAnimationFrame(() => {
    const ta = document.getElementById('recipeNotes');
    if (ta) { ta.style.height = '0'; ta.style.height = ta.scrollHeight + 'px'; }
  });
  document.getElementById('recipeNotes')?.addEventListener('input', (e) => {
    e.target.style.height = '0'; e.target.style.height = e.target.scrollHeight + 'px';
  });

  // Difficulty chip picker
  bindChipPicker({ pickerId: 'recipeDifficultyPicker', hiddenId: 'recipeDifficulty' });

  // Tags / Cook time disclosure chips
  document.getElementById('kr_tagsChip')?.addEventListener('click', () => {
    const chip = document.getElementById('kr_tagsChip');
    const reveal = document.getElementById('kr_tagsReveal');
    const opening = !reveal.classList.contains('is-open');
    reveal.classList.toggle('is-open');
    chip.classList.toggle('is-active', opening);
    if (opening) document.getElementById('recipeTags')?.focus();
  });
  document.getElementById('kr_cookTimeChip')?.addEventListener('click', () => {
    const chip = document.getElementById('kr_cookTimeChip');
    const reveal = document.getElementById('kr_cookTimeReveal');
    const opening = !reveal.classList.contains('is-open');
    reveal.classList.toggle('is-open');
    chip.classList.toggle('is-active', opening);
    if (opening) document.getElementById('recipeCookTime')?.focus();
  });

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('kr_close')?.addEventListener('click', close);
  document.getElementById('kr_delete')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({ title: 'Delete recipe?', danger: true });
    if (!confirmed) return;
    await removeKitchenRecipe(recipeId);
    delete recipes[recipeId];
    close();
    renderActiveTab();
    showToast('Recipe deleted');
  });

  function addIngredient() {
    const val = document.getElementById('newIngredientInput')?.value.trim();
    if (!val) return;
    const qty = document.getElementById('newIngredientQty')?.value.trim() || null;
    const idx = ingredients.length;
    ingredients.push({ name: cleanIngredientName(val), qty });
    document.getElementById('newIngredientInput').value = '';
    document.getElementById('newIngredientQty').value = '';
    // Append only the new row — avoids full DOM rebuild that collapses the keyboard on iOS
    document.getElementById('ingredientList').insertAdjacentHTML('beforeend', buildIngredientRow(idx));
    bindIngredientRowEvents();
    document.getElementById('newIngredientInput').focus();
  }
  document.getElementById('addIngredientBtn')?.addEventListener('click', addIngredient);
  document.getElementById('newIngredientQty')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('newIngredientInput')?.focus(); }
  });
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
      if (data.imageUrl && !imageUrl) imageUrl = data.imageUrl;
      if (data.prepTime && !document.getElementById('recipePrepTime')?.value)
        document.getElementById('recipePrepTime').value = data.prepTime;
      if (data.servings && !document.getElementById('recipeServings')?.value)
        document.getElementById('recipeServings').value = data.servings;
      if (data.difficulty && !document.getElementById('recipeDifficulty')?.value) {
        document.getElementById('recipeDifficulty').value = data.difficulty;
        // Sync chip-picker visual state since setting hidden input value alone
        // doesn't update the chips. Match by data-val.
        const picker = document.getElementById('recipeDifficultyPicker');
        picker?.querySelectorAll('.tab').forEach(t => {
          t.classList.toggle('is-active', t.dataset.val === data.difficulty);
        });
      }
      if (data.ingredients?.length) {
        ingredients.length = 0;
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
      // Auto-collapse URL section after successful import (got a name OR ingredients)
      if (type === 'url' && (data.name || data.ingredients?.length)) {
        const urlVal = document.getElementById('recipeUrl')?.value.trim();
        if (urlVal) {
          let host = urlVal;
          try { host = new URL(urlVal).hostname.replace(/^www\./, ''); } catch (_) {}
          const hostEl = document.getElementById('recipeUrlHost');
          if (hostEl) hostEl.textContent = `from ${host}`;
          document.getElementById('recipeUrlField')?.classList.add('is-hidden');
          document.getElementById('recipeUrlCollapsed')?.classList.remove('is-hidden');
        }
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

  // "Change" button → re-expand collapsed URL field
  document.getElementById('recipeUrlEdit')?.addEventListener('click', () => {
    document.getElementById('recipeUrlField')?.classList.remove('is-hidden');
    document.getElementById('recipeUrlCollapsed')?.classList.add('is-hidden');
    document.getElementById('recipeUrl')?.focus();
  });

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
      const { base64, mediaType } = await resizeImageForUpload(file, 640);
      // Store as hero image immediately — worker extraction may fail or return no image
      if (!imageUrl) imageUrl = `data:image/jpeg;base64,${base64}`;
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
    const tagsRaw = document.getElementById('recipeTags')?.value.trim() || '';
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const data = {
      name,
      url,
      notes: document.getElementById('recipeNotes')?.value.trim() || null,
      source: existing?.source || 'manual',
      ingredients,
      isFavorite: existing?.isFavorite || false,
      lastUsed: existing?.lastUsed || null,
      prepTime: document.getElementById('recipePrepTime')?.value.trim() || null,
      cookTime: document.getElementById('recipeCookTime')?.value.trim() || null,
      servings: parseInt(document.getElementById('recipeServings')?.value, 10) || null,
      difficulty: document.getElementById('recipeDifficulty')?.value || null,
      tags: tags.length ? tags : null,
      imageUrl: imageUrl || null,
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
      `<button class="btn btn--secondary btn--full" id="createFirstList">Create a list</button>`;
    document.getElementById('createFirstList')?.addEventListener('click', openCreateListSheet);
    return;
  }

  const WAND_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2L19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2L11 5"/></svg>`;
  const CAM_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

  content.innerHTML = `
    <div class="list-switcher">
      <div class="list-switcher__tabs">
        ${listIds.map(id => {
          const l = lists[id];
          const icon = l.icon ? `<span class="tab--list-icon" data-bg-color="${esc(l.color || DEFAULT_LIST_COLOR)}">${esc(l.icon)}</span>` : '';
          return `
          <button class="tab${id === activeListId ? ' is-active' : ''} tab--list"
                  data-list-id="${esc(id)}" type="button">
            ${icon}${esc(l.name)}
          </button>`;
        }).join('')}
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
      <button class="chip" id="staplesTopBtn" type="button">Add from staples</button>
      <div class="list-icon-group">
        <button class="list-camera-btn" id="listCameraBtn" type="button" aria-label="Add from photo">${CAM_SVG}</button>
        <button class="list-wand-btn" id="listCleanupBtn" type="button" aria-label="Clean up list with AI" title="Clean up list" disabled>${WAND_SVG}</button>
      </div>
    </div>
    <div id="itemAddMount"></div>
    <div id="listItemsArea" class="list-content"></div>`;

  applyDataColors(content);

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
    // Collapse completed items behind a "Completed (N) ▾" header so a busy list
    // shows only what's left to buy. State persists across re-renders (which fire
    // on every check/uncheck via the Firebase listener).
    const expanded = localStorage.getItem('dr-shopping-completed-expanded') === 'true';
    const chevron = `<svg class="shopping-completed-toggle__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>`;
    html += `<button class="shopping-completed-toggle${expanded ? ' is-expanded' : ''}" type="button" data-shopping-completed-toggle aria-expanded="${expanded}">
      <span class="shopping-completed-toggle__label">Completed (${checked.length})</span>
      ${chevron}
    </button>`;
    if (expanded) {
      for (const [id, item] of checked) {
        html += renderShoppingCard(id, item, true);
      }
    }
  }

  area.innerHTML = html;

  area.querySelector('[data-shopping-completed-toggle]')?.addEventListener('click', () => {
    const cur = localStorage.getItem('dr-shopping-completed-expanded') === 'true';
    localStorage.setItem('dr-shopping-completed-expanded', cur ? 'false' : 'true');
    renderItemsArea(currentItems);
  });

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

  if (isNowChecked) {
    const allCards = document.querySelectorAll('#listItemsArea .card--shopping');
    const unchecked = document.querySelectorAll('#listItemsArea .card--shopping:not(.is-checked)');
    if (allCards.length > 0 && unchecked.length === 0) {
      const listName = lists[activeListId]?.name || 'List';
      const doClear = await showConfirm({
        title: `All done with ${listName}!`,
        message: 'Clear checked items to reuse this list?',
        confirmLabel: 'Clear',
        cancelLabel: 'Undo',
      });
      if (doClear) {
        const checkedIds = Object.entries(currentItems)
          .filter(([, v]) => v.checked)
          .map(([itemId]) => itemId);
        for (const itemId of checkedIds) {
          await removeKitchenItem(activeListId, itemId);
        }
      } else {
        await getDb().ref(`rundown/kitchen/items/${activeListId}/${id}`).update({ checked: false, checkedAt: null });
      }
    }
  }
}

const LIST_EMOJIS = ['🛒','🛍️','🏪','🥬','🍎','🥩','🧀','🥛','🍞','🐟','🌮','🍕','🥗','🧴','🧻','🍷'];
const DEFAULT_LIST_COLOR = '#FFE6CC';

function openCreateListSheet(onCreated = null) {
  const mount = document.getElementById('sheetMount');
  const defaultEmoji = '🛒';
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">New list</h2>
      <button class="ef2-icon-btn" id="kl_close" aria-label="Close" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="rf-title-row">
      <button class="rf-emoji-btn" id="kl_emojiBtnPreview" type="button" title="Pick icon" data-bg-color="${DEFAULT_LIST_COLOR}">${defaultEmoji}</button>
      <input class="tf-title-input" id="kl_name" type="text" placeholder="Grocery, Costco, Target…" autocomplete="off">
    </div>
    <div class="rf-emoji-reveal" id="kl_emojiReveal">
      <div class="rf-emoji-grid">
        ${LIST_EMOJIS.map(e => `<button type="button" class="rf-emoji-cell${defaultEmoji === e ? ' is-selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
        <input type="search" id="kl_customEmoji" class="rf-emoji-custom" placeholder="+">
      </div>
      <div class="rf-color-row">
        <span class="rf-color-label">Background color</span>
        ${renderColorButton(DEFAULT_LIST_COLOR, 'kl_iconColor')}
      </div>
    </div>
    <div class="me-detail__chips">
      <button class="chip" id="kl_cancel" type="button">Cancel</button>
      <button class="chip" id="kl_save" type="button">Create</button>
    </div>`);
  activateSheet(mount);
  applyDataColors(mount);

  let currentEmoji = defaultEmoji;
  let currentColor = DEFAULT_LIST_COLOR;
  const emojiPreview = mount.querySelector('#kl_emojiBtnPreview');
  if (emojiPreview) emojiPreview.style.backgroundColor = currentColor;
  initColorButton(mount.querySelector('#kl_iconColor')?.closest('.cpick-wrap'), (color) => {
    currentColor = color;
    if (emojiPreview) emojiPreview.style.backgroundColor = color;
  });
  const emojiReveal = mount.querySelector('#kl_emojiReveal');
  emojiPreview?.addEventListener('click', () => emojiReveal?.classList.toggle('is-open'));
  for (const cell of mount.querySelectorAll('.rf-emoji-cell')) {
    cell.addEventListener('click', () => {
      mount.querySelectorAll('.rf-emoji-cell').forEach(c => c.classList.remove('is-selected'));
      cell.classList.add('is-selected');
      currentEmoji = cell.dataset.emoji;
      emojiPreview.textContent = currentEmoji;
      mount.querySelector('#kl_customEmoji').value = '';
      emojiReveal?.classList.remove('is-open');
    });
  }
  mount.querySelector('#kl_customEmoji')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) {
      currentEmoji = v;
      emojiPreview.textContent = v;
      mount.querySelectorAll('.rf-emoji-cell').forEach(c => c.classList.remove('is-selected'));
    }
  });

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
    const data = { name, sortOrder, icon: currentEmoji, color: currentColor, createdAt: firebase.database.ServerValue.TIMESTAMP };
    const id = await pushKitchenList(data);
    lists[id] = { name, sortOrder, icon: currentEmoji, color: currentColor };
    activeListId = id;
    localStorage.setItem('dr-kitchen-active-list', id);
    close();
    renderListsTab();
    bindFab();
    if (onCreated) onCreated(id);
  });
}

function openManageListSheet() {
  if (!activeListId || !lists[activeListId]) return;
  const list = lists[activeListId];
  const listName = list.name;
  const initialEmoji = list.icon || '🛒';
  const initialColor = list.color || DEFAULT_LIST_COLOR;
  const mount = document.getElementById('sheetMount');
  const TRASH_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  const SAVE_SVG  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const CLOSE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  mount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Edit list</h2>
      <div class="rf-header-actions">
        <button class="ef2-icon-btn km-delete-icon" id="km_deleteBtn" aria-label="Delete list" type="button">${TRASH_SVG}</button>
        <button class="ef2-icon-btn rf-save-btn" id="km_save" aria-label="Save" type="button">${SAVE_SVG}</button>
        <button class="ef2-icon-btn" id="km_close" aria-label="Close" type="button">${CLOSE_SVG}</button>
      </div>
    </div>
    <div class="rf-title-row">
      <button class="rf-emoji-btn" id="km_emojiBtnPreview" type="button" title="Pick icon" data-bg-color="${esc(initialColor)}">${esc(initialEmoji)}</button>
      <input class="tf-title-input" id="km_name" type="text" value="${esc(listName)}" autocomplete="off">
    </div>
    <div class="rf-emoji-reveal" id="km_emojiReveal">
      <div class="rf-emoji-grid">
        ${LIST_EMOJIS.map(e => `<button type="button" class="rf-emoji-cell${initialEmoji === e ? ' is-selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
        <input type="search" id="km_customEmoji" class="rf-emoji-custom" placeholder="+">
      </div>
      <div class="rf-color-row">
        <span class="rf-color-label">Background color</span>
        ${renderColorButton(initialColor, 'km_iconColor')}
      </div>
    </div>
    <div class="me-detail__chips">
      <button class="chip" id="km_copyBtn" type="button">Copy list</button>
      <button class="chip" id="km_clearBtn" type="button">Clear checked</button>
    </div>`);
  activateSheet(mount);
  applyDataColors(mount);

  let currentEmoji = initialEmoji;
  let currentColor = initialColor;
  const emojiPreview = mount.querySelector('#km_emojiBtnPreview');
  if (emojiPreview) emojiPreview.style.backgroundColor = currentColor;
  initColorButton(mount.querySelector('#km_iconColor')?.closest('.cpick-wrap'), (color) => {
    currentColor = color;
    if (emojiPreview) emojiPreview.style.backgroundColor = color;
  });
  const emojiReveal = mount.querySelector('#km_emojiReveal');
  emojiPreview?.addEventListener('click', () => emojiReveal?.classList.toggle('is-open'));
  for (const cell of mount.querySelectorAll('.rf-emoji-cell')) {
    cell.addEventListener('click', () => {
      mount.querySelectorAll('.rf-emoji-cell').forEach(c => c.classList.remove('is-selected'));
      cell.classList.add('is-selected');
      currentEmoji = cell.dataset.emoji;
      emojiPreview.textContent = currentEmoji;
      mount.querySelector('#km_customEmoji').value = '';
      emojiReveal?.classList.remove('is-open');
    });
  }
  mount.querySelector('#km_customEmoji')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) {
      currentEmoji = v;
      emojiPreview.textContent = v;
      mount.querySelectorAll('.rf-emoji-cell').forEach(c => c.classList.remove('is-selected'));
    }
  });

  const close = () => { mount.innerHTML = ''; };
  document.getElementById('km_close')?.addEventListener('click', close);

  document.getElementById('km_save')?.addEventListener('click', async () => {
    const name = document.getElementById('km_name')?.value.trim();
    if (!name) return;
    const updated = { ...lists[activeListId], name, icon: currentEmoji, color: currentColor };
    await writeKitchenList(activeListId, updated);
    lists[activeListId] = updated;
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
  const mount = document.getElementById('itemAddMount');
  if (!mount) return;

  if (document.getElementById('itemAddField')) {
    document.getElementById('itemAddField').focus();
    return;
  }

  keepAddFieldOpen = true;

  const wrap = document.createElement('div');
  wrap.className = 'item-add-wrap';
  wrap.innerHTML = `<input class="item-add-field" id="itemAddField" type="text"
    placeholder="Add items…" autocomplete="off" autocorrect="off" enterkeyhint="done">`;
  mount.appendChild(wrap);
  const field = document.getElementById('itemAddField');
  field.focus();

  async function addItem() {
    const name = field.value.trim();
    if (!name) { keepAddFieldOpen = false; wrap.remove(); return; }
    if (!activeListId) return;
    field.value = '';
    field.placeholder = '✓ Added';
    field.classList.add('is-confirmed');
    field.focus();
    setTimeout(() => {
      field.placeholder = 'Add items…';
      field.classList.remove('is-confirmed');
    }, 800);
    await pushKitchenItem(activeListId, {
      name,
      checked: false,
      addedAt: firebase.database.ServerValue.TIMESTAMP,
      category: null,
    });
  }

  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
    if (e.key === 'Escape') { keepAddFieldOpen = false; wrap.remove(); }
  });
  field.addEventListener('blur', () => {
    if (!field.isConnected) return;
    if (!field.value.trim()) { keepAddFieldOpen = false; wrap.remove(); }
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
              <p style="color:var(--text-muted);font-size:var(--font-sm)">No items detected — try a clearer photo.</p>
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
            <p style="color:var(--text-muted);font-size:var(--font-sm)">Something went wrong.</p>
            <p style="color:var(--text-muted);font-size:var(--font-xs)">${esc(err?.message) || 'Check your connection.'}</p>
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
  if (el) renderErrorState(el, {
    title: 'Could not load Kitchen',
    message: 'Check your connection and try again.',
    retry: () => location.reload(),
  });
});
