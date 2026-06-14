// kitchen.js — Kitchen page: meal planning + shopping lists
// cache-bust 2026-05-12: force fresh CF Pages content hash (prior upload corrupted)
import { initFirebase, readSettings, writeSettings, readPeople, writePerson, onConnectionChange,
  onAllMessages, writeMessage, markMessageSeen, removeMessage,
  writeBankToken, markBankTokenUsed, removeBankToken, readBank, writeMultiplier,
  readKitchenRecipes, readKitchenLists, readKitchenStaples,
  readKitchenPlan, readKitchenPlanRange, onKitchenItems, readOnce,
  pushKitchenList, writeKitchenList, removeKitchenList, removeKitchenItem,
  pushKitchenItem, writeKitchenItem, updateKitchenItem, pushKitchenStaple,
  updateKitchenStaple, removeKitchenStaple,
  writeKitchenPlanSlot, removeKitchenPlanSlot, writeKitchenRecipe, pushKitchenRecipe, removeKitchenRecipe,
  readRecipeImage, writeRecipeImage, removeRecipeImage,
  multiUpdate, updateData,
  readSchoolLunchFeeds, writeSchoolLunchFeed, removeSchoolLunchFeed, writeSchoolLunchFeedSync,
} from './shared/firebase.js';
import { parseIcs, mapEventsToPlan } from './shared/kitchen-ical.js';
import { applyTheme, resolveTheme } from './shared/theme.js';
import { renderHeader, renderNavBar, initNavMore, initBottomNav, initBell,
  initOfflineBanner, showConfirm, showToast, renderFab,
  renderBottomSheet, renderEmptyState, renderAddMenu, renderSkeleton, renderErrorState,
  renderFormFooter, renderFormSheetHeader,
  renderChipPicker, bindChipPicker,
  renderColorButton, initColorButton, applyDataColors,
  openCookMode, readKitchenCustomize,
  renderMealDetailSheet, openVoteSheet
} from './shared/components.js';
import { todayKey, addDays, formatDateShort, escapeHtml, formatLastCooked, avgRating, parseSteps, normalizePlanSlot, pickWinner, formatRecipeTime, parseRecipeTimeToMinutes, recipeTotalTime, scaleQty } from './shared/utils.js';
import { resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet, urlToDataUrl, base64ToDataUrl, makeThumbnail } from './shared/ai-helpers.js';
import { withButtonLock, validateStoredId } from './shared/dom-helpers.js';

const esc = (s) => escapeHtml(String(s ?? ''));

// Worker URL — set when Cloudflare Worker is deployed
const KITCHEN_WORKER_URL = 'https://kitchen-import.jordin-jansky.workers.dev';

// ── Self-heal for broken recipe images ────────────────────────────────────
// Legacy recipes (imported before the Worker image-proxy landed) store CDN
// URLs that can expire. When a thumbnail fails to load we try once per page
// load to re-fetch via the Worker and persist the result as a data URL. Bad
// URLs would otherwise retry-storm; the caps below bound the blast radius.
const _selfHealAttempted = new Set();   // recipe IDs tried this page load
let   _selfHealCountThisLoad = 0;
const SELF_HEAL_MAX_PER_LOAD = 5;
async function selfHealRecipeImage(recipeId) {
  if (!recipeId) return;
  if (_selfHealAttempted.has(recipeId)) return;
  if (_selfHealCountThisLoad >= SELF_HEAL_MAX_PER_LOAD) return;
  const recipe = recipes[recipeId];
  if (!recipe || !recipe.url) return;                                     // no source to refresh from
  if (typeof recipe.imageUrl === 'string' && recipe.imageUrl.startsWith('data:')) return; // data URLs can't break
  _selfHealAttempted.add(recipeId);
  _selfHealCountThisLoad++;
  try {
    const res = await fetch(KITCHEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url', input: recipe.url }),
    });
    if (!res.ok) throw new Error(`Worker ${res.status}`);
    const data = await res.json();
    let dataUrl = null;
    if (data?.imageData && data?.imageMediaType) {
      dataUrl = await base64ToDataUrl(data.imageData, data.imageMediaType);
    } else if (data?.imageUrl) {
      dataUrl = await urlToDataUrl(data.imageUrl);
    }
    if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('No image');
    recipes[recipeId] = { ...recipe, imageUrl: dataUrl, imageRefreshFails: null };
    // Leaf update — don't replace the whole recipe from a possibly stale snapshot.
    await updateData(`kitchen/recipes/${recipeId}`, { imageUrl: dataUrl, imageRefreshFails: null });
    // Re-render the list so the recovered image appears. Cheap; idempotent.
    if (activeTab === 'recipes') renderRecipesTab();
  } catch {
    const next = (recipe.imageRefreshFails || 0) + 1;
    recipes[recipeId] = { ...recipe, imageRefreshFails: next };
    try { await updateData(`kitchen/recipes/${recipeId}`, { imageRefreshFails: next }); } catch { /* swallow */ }
    // Once we cross the banner threshold, refresh the Recipes tab so it shows.
    if (next === 2 && activeTab === 'recipes') renderRecipesTab();
  }
}
// Expose a tiny trigger for inline `onerror` handlers — they execute outside
// the module scope so can't reach the function directly. Inline handler owns
// the per-context placeholder swap; this one just fires the heal.
if (typeof window !== 'undefined') {
  window.__krImgError = (recipeId) => selfHealRecipeImage(recipeId);
}

// Recipe/meal detail heroes paint the small thumbnail first, then lazily swap
// in the full-resolution image (which lives in kitchen/recipeImages, not on the
// recipe record). Only one detail sheet is open at a time, so the single
// .rd-hero__img selector is unambiguous. fallbackUrl covers un-migrated recipes
// that still carry imageUrl.
async function upgradeHero(recipeId, fallbackUrl) {
  if (!recipeId) return;
  const full = (await readRecipeImage(recipeId)) || fallbackUrl;
  if (!full) return;
  const el = document.querySelector('.rd-hero__img');
  if (el && el.getAttribute('src') !== full) el.setAttribute('src', full);
}

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
// Movement > 10px cancels. Vibrates 30ms on fire. Pointer-event-based so both
// touch AND mouse (kiosk/desktop) users can long-press.
function bindLongPress(el, onLongPress, onTap) {
  let timer = null, didLong = false, sx = 0, sy = 0;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('pointerdown', (e) => {
    if (typeof e.button === 'number' && e.button !== 0) return; // primary button only
    didLong = false;
    sx = e.clientX; sy = e.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      didLong = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress();
    }, 600);
  });
  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
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
let _cleanupInFlight = false; // guards against overlapping AI list-cleanup runs
let recipeFilter = {
  show: 'all',          // 'all' | 'top-rated' | 'never-cooked'
  prepBucket: 'any',    // 'any' | 'lt-30' | '30-60' | 'gt-60'
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

  // Seed Recipes sort from user's Customize → Kitchen pref. (recipeFilter is
  // initialized at module load before linkedPerson is known, so we patch it
  // here once linkedPerson resolution is done.)
  const kPrefs = readKitchenCustomize(linkedPerson ? { person: linkedPerson } : undefined);
  recipeFilter.sort = kPrefs.recipesSort;

  // Phase 2: apply family theme from Firebase
  applyTheme(resolveTheme(settings?.theme));

  // Header
  document.getElementById('headerMount').innerHTML = renderHeader({
    title: 'Kitchen',
    showBell: true,
  });

  // Nav — user-customizable tab order + Customize sheet.
  initBottomNav({
    navMount:     document.getElementById('navMount'),
    activePage:   'kitchen',
    sheetMount:   document.getElementById('sheetMount'),
    getTheme:     () => settings?.theme,
    personOpts:   linkedPerson ? { person: linkedPerson, writePerson, displayDefaults: settings } : undefined,
    currentPage:  'kitchen',
    onPageRender: () => { renderTabs(); renderActiveTab(); },
  });
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
    const storedListId = localStorage.getItem('dr-kitchen-active-list');
    // validateStoredId guards against stale IDs after list deletion
    activeListId = validateStoredId(storedListId, lists) || listIds[0] || null;
    if (!activeListId) {
      try { localStorage.removeItem('dr-kitchen-active-list'); } catch {}
    }
  }
  if (activeListId) localStorage.setItem('dr-kitchen-active-list', activeListId);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function renderTabs() {
  // User-customizable tab visibility — fall back to all-3 if prefs missing.
  const kPrefs = readKitchenCustomize(linkedPerson ? { person: linkedPerson } : undefined);
  const tabs = ['meals', 'recipes', 'lists'].filter(t => kPrefs.tabs.includes(t));
  if (tabs.length === 0) tabs.push('meals'); // safety net
  // If activeTab was hidden, fall back to the first visible tab.
  if (!tabs.includes(activeTab)) {
    activeTab = tabs[0];
    localStorage.setItem('dr-kitchen-tab', activeTab);
  }
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
// Pass { voteGlyph: true } as second arg to render the thumbs-up vote indicator.
function buildSlotThumb(entry, { voteGlyph = false } = {}) {
  if (voteGlyph) {
    return `<span class="day-block__slot-thumb day-block__slot-thumb--vote" aria-hidden="true">&#x1F44D;</span>`;
  }
  if (!entry) {
    return `<span class="day-block__slot-thumb day-block__slot-thumb--spacer" aria-hidden="true"></span>`;
  }
  const recipe = entry.recipeId ? recipes[entry.recipeId] : null;
  const slotThumb = recipe?.thumbUrl || recipe?.imageUrl; // thumbUrl preferred; imageUrl = un-migrated fallback
  if (slotThumb) {
    return `<img class="day-block__slot-thumb" src="${esc(slotThumb)}" alt="" loading="lazy">`;
  }
  return `<span class="day-block__slot-thumb day-block__slot-thumb--placeholder" aria-hidden="true">🍴</span>`;
}

async function renderMealsTab() {
  const content = document.getElementById('kitchenContent');
  const tz = settings?.timezone || 'America/Chicago';
  const todayStr = todayKey(tz);

  // Rolling N-day window — N is user-customizable (3 / 7 / 14).
  // Day 0 derives from the family-timezone today key, not the device clock,
  // so a late-night phone in another timezone still starts on "today".
  const kPrefs = readKitchenCustomize(linkedPerson ? { person: linkedPerson } : undefined);
  const startDate = new Date(todayStr + 'T00:00:00');

  const weekDays = Array.from({ length: kPrefs.daysShown }, (_, i) => {
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

    // Slot rows: a slot renders when (a) it's planned, OR (b) the user
    // configured it to nudge in Customize → Kitchen → Show empty slots.
    // Dinner stays special-cased last so it always sits at the bottom.
    const slotRows = [];
    const renderedSchool = new Set();
    for (const s of SLOT_ORDER) {
      if (s === 'dinner') continue;
      const optionsForSlot = normalizePlanSlot(plan[s]);
      const hasPlanned = optionsForSlot.length > 0;
      // Map school-lunch / school-lunch-2 back to the 'school' nudge key
      // since slot prefs use the user-facing label, not the internal schema.
      const nudgeKey = (s === 'school-lunch' || s === 'school-lunch-2') ? 'school' : s;
      const shouldNudge = !hasPlanned && kPrefs.slotNudge[nudgeKey];
      if (!hasPlanned && !shouldNudge) continue;
      // Avoid double-rendering the school nudge when both school-lunch slots
      // are empty — show one nudge row, not two.
      if (shouldNudge && nudgeKey === 'school') {
        if (renderedSchool.has('school')) continue;
        renderedSchool.add('school');
      }
      const label = (s === 'school-lunch' || s === 'school-lunch-2')
        ? getSchoolSlotLabel(s, plan)
        : SLOT_LABELS[s];
      if (hasPlanned) {
        // Voting in progress — single consistent indicator, no per-option names.
        if (optionsForSlot.length > 1) {
          slotRows.push(`<div class="day-block__slot day-block__slot--voting" data-date="${esc(dk)}" data-slot="${esc(s)}">
            ${buildSlotThumb(null, { voteGlyph: true })}
            <span class="day-block__slot-label">${esc(label)}</span>
            <span class="day-block__slot-name day-block__slot-name--voting">&#x1F44D; Vote &middot; ${optionsForSlot.length} options</span>
          </div>`);
        } else {
          const winner = optionsForSlot[0];
          const rawName = winner.recipeId ? (recipes[winner.recipeId]?.name || 'Unknown') : (winner.mealName || winner.customName || '');
          slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
            ${buildSlotThumb(winner)}
            <span class="day-block__slot-label">${esc(label)}</span>
            <span class="day-block__slot-name">${esc(rawName)}</span>
          </div>`);
        }
      } else {
        const nudgeLabel = `Plan ${(SLOT_LABELS[s] || s).toLowerCase()}`;
        slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="${esc(s)}">
          ${buildSlotThumb(null)}
          <span class="day-block__slot-label">${esc(label)}</span>
          <span class="day-block__slot-name day-block__slot-name--empty">${esc(nudgeLabel)} <span aria-hidden="true">›</span></span>
        </div>`);
      }
    }

    // Dinner row — always last, follows slotNudge.dinner for empty state.
    // Voting in progress — single consistent indicator, no per-option names.
    const dinnerOptions = normalizePlanSlot(plan.dinner);
    if (dinnerOptions.length > 1) {
      slotRows.push(`<div class="day-block__slot day-block__slot--voting" data-date="${esc(dk)}" data-slot="dinner">
        ${buildSlotThumb(null, { voteGlyph: true })}
        <span class="day-block__slot-label">${esc(SLOT_LABELS.dinner)}</span>
        <span class="day-block__slot-name day-block__slot-name--voting">&#x1F44D; Vote &middot; ${dinnerOptions.length} options</span>
      </div>`);
    } else if (dinnerOptions.length === 1) {
      const dinnerWinner = dinnerOptions[0];
      const dinnerName = dinnerWinner.recipeId ? (recipes[dinnerWinner.recipeId]?.name || 'Unknown') : (dinnerWinner.mealName || dinnerWinner.customName || '');
      slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
        ${buildSlotThumb(dinnerWinner)}
        <span class="day-block__slot-label">${esc(SLOT_LABELS.dinner)}</span>
        <span class="day-block__slot-name">${esc(dinnerName)}</span>
      </div>`);
    } else if (kPrefs.slotNudge.dinner) {
      slotRows.push(`<div class="day-block__slot" data-date="${esc(dk)}" data-slot="dinner">
        ${buildSlotThumb(null)}
        <span class="day-block__slot-label">${esc(SLOT_LABELS.dinner)}</span>
        <span class="day-block__slot-name day-block__slot-name--empty">Plan dinner <span aria-hidden="true">›</span></span>
      </div>`);
    }

    // Empty state: all slot nudges off + nothing planned → single muted hint
    // so the day block isn't a bare header.
    if (slotRows.length === 0) {
      slotRows.push(`<div class="day-block__slot-empty-hint">Tap + to plan a meal</div>`);
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
    <div class="meals-controls">
      <button class="chip mh-open-btn" id="mhOpenBtn" type="button">History ›</button>
    </div>
    <div class="week-strip" id="weekStrip">
      <div class="week-strip__week">${weekHtml}</div>
    </div>`;

  document.getElementById('mhOpenBtn')?.addEventListener('click', openMealHistorySheet);

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
  function buildRecipeCardThumb(recipe, id) {
    const cardThumb = recipe?.thumbUrl || recipe?.imageUrl; // thumbUrl preferred; imageUrl = un-migrated fallback
    if (cardThumb) {
      // onerror: swap visual to placeholder + trigger background self-heal.
      // (window.__krImgError lives at module scope; defensive in case the
      // page somehow renders before the module evaluates.)
      const onErr = `(window.__krImgError&&window.__krImgError('${esc(id)}'));this.outerHTML='&lt;span class=&quot;rl-card-thumb rl-card-thumb--placeholder&quot; aria-hidden=&quot;true&quot;&gt;\\ud83c\\udf74&lt;/span&gt;'`;
      return `<img class="rl-card-thumb" src="${esc(cardThumb)}" alt="" loading="lazy" onerror="${onErr}">`;
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
    // Show total cook time (prep + cook) — that's what tells you "how long
    // until dinner". Falls back to whichever side is populated when only one
    // is set, so single-time recipes still display.
    const totalMins = recipeTotalTime(recipe);
    const timeChip = totalMins ? `<span class="rl-chip">${esc(formatRecipeTime(totalMins))}</span>` : '';
    const tz = settings?.timezone || 'America/Chicago';
    const todayStr = todayKey(tz);
    const lastChip = `<span class="rl-chip">${esc(formatLastCooked(recipe?.lastUsed, tz, todayStr))}</span>`;
    return [ratingChip, timeChip, lastChip].filter(Boolean).join('<span class="rl-chip-sep">·</span>');
  }

  function buildRecipeCard(id, r) {
    return `
      <article class="card rl-recipe-card" data-recipe-id="${esc(id)}">
        ${buildRecipeCardThumb(r, id)}
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

  // TIME BUCKET (uses total time so the filter agrees with what's shown on
  // the card chip and detail-sheet total row).
  if (recipeFilter.prepBucket !== 'any') {
    recipeEntries = recipeEntries.filter(([, r]) => {
      const mins = recipeTotalTime(r);
      if (mins == null) return false;
      if (recipeFilter.prepBucket === 'lt-30') return mins < 30;
      if (recipeFilter.prepBucket === '30-60') return mins >= 30 && mins <= 60;
      return mins > 60;
    });
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
        const ma = recipeTotalTime(ra); const mb = recipeTotalTime(rb);
        if (ma == null && mb == null) return 0;
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb;
      }
      case 'last-cooked': {
        const la = ra.lastUsed || 0; const lb = rb.lastUsed || 0;
        return lb - la;
      }
      case 'highest-rated': return (avgRating(rb, linkedPerson?.id).avg ?? 0) - (avgRating(ra, linkedPerson?.id).avg ?? 0);
      case 'alpha':
      default:               return (ra.name || '').localeCompare(rb.name || '');
    }
  });

  const linkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  // The user's saved Customize → Kitchen default sort is the baseline — only
  // a sort that differs from it counts toward the filter badge, and Clear
  // restores it (not hardcoded alpha).
  const kPrefsRender = readKitchenCustomize(linkedPerson ? { person: linkedPerson } : undefined);
  const defaultSort = kPrefsRender.recipesSort || 'alpha';
  const filterCount =
    (recipeFilter.show !== 'all'         ? 1 : 0) +
    (recipeFilter.prepBucket !== 'any'   ? 1 : 0) +
    (recipeFilter.tags?.length           ? 1 : 0) +
    (recipeFilter.sort !== defaultSort   ? 1 : 0);
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
    const hasFilter = (recipeFilter.show !== 'all' || recipeFilter.prepBucket !== 'any' || recipeFilter.tags?.length);
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

  // Banner when any recipe has accumulated ≥2 image-refresh failures —
  // means self-heal couldn't recover it from the source URL. User needs to
  // upload a new photo or clear the dead link from the recipe edit form.
  const flagged = Object.entries(recipes).filter(([, r]) => (r.imageRefreshFails || 0) >= 2);
  const flaggedBanner = flagged.length === 0 ? '' : (() => {
    const label = flagged.length === 1
      ? `Image for "${esc(flagged[0][1].name || 'recipe')}" can't be loaded — tap to fix`
      : `${flagged.length} recipes need attention — tap to view`;
    return `<button class="rl-attn-banner" id="rlAttnBanner" type="button">
      <span class="rl-attn-banner__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </span>
      <span class="rl-attn-banner__label">${label}</span>
      <span class="rl-attn-banner__chev" aria-hidden="true">›</span>
    </button>`;
  })();

  content.innerHTML = `
    <div class="rl-wrap rl-wrap--${esc(kPrefsRender.cardDensity)}">
      ${flaggedBanner}
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

  document.getElementById('rlAttnBanner')?.addEventListener('click', () => {
    openBrokenRecipesSheet(flagged);
  });

  document.getElementById('recipeFilterBtn')?.addEventListener('click', openRecipeFilterSheet);

  document.getElementById('rlClearAll')?.addEventListener('click', () => {
    recipeSearchQuery = '';
    recipeFilter = {
      show: 'all',
      prepBucket: 'any',
      tags: [],
      sort: defaultSort,
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

function openPlanMealSheet(preDate, preSlot, preRecipeId = null, opts = {}) {
  // ===== Early redirect: if slot is already in vote state, jump to vote sheet =====
  if (preSlot && preSlot !== 'school' && !opts.initialCandidates) {
    const existing = normalizePlanSlot(planCache[preDate]?.[preSlot]);
    if (existing.length >= 2) {
      showToast('This slot has a vote in progress — opening vote sheet.');
      openSlotEditSheet(preDate, preSlot, existing[0]);
      return;
    }
  }

  // ===== Normal opener flow =====
  const preServings = (typeof opts.servings === 'number' && opts.servings > 0) ? opts.servings : null;
  const mount = document.getElementById('sheetMount');
  let selectedRecipeId = preRecipeId;
  let secondOpen = false;
  let secondRecipeId = null;
  let secondTypedName = '';
  // Picker offers a single 'School' option. Auto-allocation in handleSchoolSave()
  // maps it to school-lunch or school-lunch-2 based on day state.
  const PLAN_SLOT_ORDER = ['breakfast', 'lunch', 'school', 'dinner', 'snack'];

  // Concrete school-lunch schema keys map back to the picker's virtual
  // 'school' slot — otherwise "Plan school lunch" entry points would silently
  // fall through to Dinner.
  const normalizedPreSlot = (preSlot === 'school-lunch' || preSlot === 'school-lunch-2') ? 'school' : preSlot;
  let selectedSlot = PLAN_SLOT_ORDER.includes(normalizedPreSlot) ? normalizedPreSlot : (normalizedPreSlot === null ? null : 'dinner');
  let mealMode = opts.initialMode || 'single'; // 'single' | 'vote'

  // Vote-mode candidate state. Each entry: { selectedRecipeId, typedName }.
  // Starts with 2 empty rows unless pre-filled via opts.initialCandidates.
  // Single mode ignores this.
  let candidates = opts.initialCandidates || [
    { selectedRecipeId: null, typedName: '' },
    { selectedRecipeId: null, typedName: '' },
  ];

  function formatDateLabel(dk) {
    const d = new Date(dk + 'T12:00:00');
    return `${DAY_ABBR[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  // `selId` defaults to the first picker's selection; the second-school picker
  // passes its own selected id so its rows highlight independently.
  function buildPickRow(id, r, selId = selectedRecipeId) {
    const isSelected = selId === id;
    const pickThumb = r.thumbUrl || r.imageUrl; // thumbUrl preferred; imageUrl = un-migrated fallback
    const thumb = pickThumb
      ? `<img class="recipe-pick__thumb" src="${esc(pickThumb)}" alt="" loading="lazy">`
      : `<span class="recipe-pick__thumb recipe-pick__thumb--placeholder" aria-hidden="true">🍴</span>`;
    return `<button class="recipe-pick__row${isSelected ? ' is-selected' : ''}" data-recipe-pick="${esc(id)}" type="button">
      ${thumb}
      <span class="recipe-pick__name">${esc(r.name)}</span>
      ${isSelected ? '<span class="recipe-pick__check">&#10003;</span>' : ''}
    </button>`;
  }

  function buildRecipeRows(filter, selId = selectedRecipeId) {
    const lc = filter?.toLowerCase() || '';
    const all = Object.entries(recipes).sort((a, b) => {
      // Legacy isFavorite sort — field no longer exposed by rating UI but retained for backward compatibility
      if (a[1].isFavorite !== b[1].isFavorite) return a[1].isFavorite ? -1 : 1;
      return a[1].name.localeCompare(b[1].name);
    });
    const entries = lc ? all.filter(([, r]) => r.name.toLowerCase().includes(lc)) : all;
    if (entries.length === 0 && lc) return `<div class="recipe-pick__none">No match — will save as "${esc(filter)}"</div>`;
    if (entries.length === 0) return `<div class="recipe-pick__none">No recipes yet. Type any meal name to continue.</div>`;
    return entries.map(([id, r]) => buildPickRow(id, r, selId)).join('');
  }

  function buildCandidateRow(i) {
    const c = candidates[i];
    const labelName = c.selectedRecipeId
      ? (recipes[c.selectedRecipeId]?.name || '')
      : (c.typedName || '');
    const placeholder = `Option ${i + 1}`;
    return `
      <div class="kp-cand-row" data-cand-idx="${i}">
        <div class="kp-cand-head">
          <span class="kp-cand-label">${esc(placeholder)}</span>
          ${candidates.length > 2 ? `<button class="kp-cand-remove" data-cand-remove="${i}" type="button" aria-label="Remove option">&times;</button>` : ''}
        </div>
        <button class="kp-meal-select${labelName ? ' has-value' : ''}" data-cand-select="${i}" type="button">
          <span class="kp-cand-mealname">${esc(labelName || 'Choose a meal…')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="kp-meal-dropdown" data-cand-dropdown="${i}">
          <input class="kp-search-input" data-cand-search="${i}" type="text" autocomplete="off" placeholder="Search…" value="${esc(c.typedName || labelName)}">
          <div class="recipe-pick-list" data-cand-list="${i}">${buildCandRecipeRows(c.typedName || labelName, i)}</div>
        </div>
      </div>`;
  }

  function buildCandPickRow(rowIdx, id, r) {
    const isSelected = candidates[rowIdx].selectedRecipeId === id;
    const pickThumb = r.thumbUrl || r.imageUrl; // thumbUrl preferred; imageUrl = un-migrated fallback
    const thumb = pickThumb
      ? `<img class="recipe-pick__thumb" src="${esc(pickThumb)}" alt="" loading="lazy">`
      : `<span class="recipe-pick__thumb recipe-pick__thumb--placeholder" aria-hidden="true">🍴</span>`;
    return `<button class="recipe-pick__row${isSelected ? ' is-selected' : ''}" data-cand-pick-row="${rowIdx}" data-cand-pick-id="${esc(id)}" type="button">
      ${thumb}
      <span class="recipe-pick__name">${esc(r.name)}</span>
      ${isSelected ? '<span class="recipe-pick__check">&#10003;</span>' : ''}
    </button>`;
  }

  function buildCandRecipeRows(filter, rowIdx) {
    const lc = filter?.toLowerCase() || '';
    const all = Object.entries(recipes).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const entries = lc ? all.filter(([, r]) => r.name.toLowerCase().includes(lc)) : all;
    if (entries.length === 0 && lc) return `<div class="recipe-pick__none">No match — will save as "${esc(filter)}"</div>`;
    if (entries.length === 0) return `<div class="recipe-pick__none">No recipes yet. Type any meal name to continue.</div>`;
    return entries.map(([id, r]) => buildCandPickRow(rowIdx, id, r)).join('');
  }

  const preRecipeName = preRecipeId ? (recipes[preRecipeId]?.name || '') : '';

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Plan a meal', closeId: 'kp_close' })}
    ${selectedSlot !== 'school' ? `
      <div class="kp-mode-section" id="kp_modeSection">
        <nav class="tabs tabs--pill kp-mode-tabs" id="kp_modeTabs" role="tablist">
          <button class="tab${mealMode === 'single' ? ' is-active' : ''}" data-mode="single" type="button">Single meal</button>
          <button class="tab${mealMode === 'vote' ? ' is-active' : ''}" data-mode="vote" type="button">Set up a vote</button>
        </nav>
      </div>
      <div class="ef2-divider"></div>
    ` : ''}
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
    <div class="kp-meal-section${mealMode === 'vote' ? ' is-hidden' : ''}" id="kp_mealSection">
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
    <div class="kp-vote-section${mealMode === 'single' ? ' is-hidden' : ''}" id="kp_voteSection">
      <span class="ef2-section-label">Candidates (max 3)</span>
      <div class="kp-cand-list" id="kp_candList">
        ${candidates.map((_, i) => buildCandidateRow(i)).join('')}
      </div>
      <button class="ef2-add-chip${candidates.length >= 3 ? ' is-hidden' : ''}" id="kp_addCand" type="button">+ Add option ${candidates.length + 1}</button>
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

  document.getElementById('kp_modeTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-mode]');
    if (!tab) return;
    const prevMode = mealMode;
    mealMode = tab.dataset.mode;

    // Going single → vote: if there's a current single-mode selection, seed row 1.
    if (prevMode === 'single' && mealMode === 'vote') {
      const val = document.getElementById('kp_search')?.value.trim();
      if (selectedRecipeId) {
        candidates[0] = { selectedRecipeId, typedName: recipes[selectedRecipeId]?.name || '' };
      } else if (val) {
        candidates[0] = { selectedRecipeId: null, typedName: val };
      }
      rerenderVoteSection();
    }

    // Going vote → single: discard candidates silently (spec §1).
    if (prevMode === 'vote' && mealMode === 'single') {
      candidates = [
        { selectedRecipeId: null, typedName: '' },
        { selectedRecipeId: null, typedName: '' },
      ];
      // No DOM changes needed in single mode — the search input still holds prior value.
    }

    // Toggle tab active state and section visibility.
    document.getElementById('kp_modeTabs').querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('is-active', t === tab));
    document.getElementById('kp_mealSection')?.classList.toggle('is-hidden', mealMode === 'vote');
    document.getElementById('kp_voteSection')?.classList.toggle('is-hidden', mealMode === 'single');
    updateSaveBtn();
  });

  // Helper: re-render only the vote section (preserves single-mode state).
  function rerenderVoteSection() {
    const wrap = document.getElementById('kp_voteSection');
    if (!wrap) return;
    const wasHidden = wrap.classList.contains('is-hidden');
    wrap.innerHTML = `
      <span class="ef2-section-label">Candidates (max 3)</span>
      <div class="kp-cand-list" id="kp_candList">
        ${candidates.map((_, i) => buildCandidateRow(i)).join('')}
      </div>
      <button class="ef2-add-chip${candidates.length >= 3 ? ' is-hidden' : ''}" id="kp_addCand" type="button">+ Add option ${candidates.length + 1}</button>`;
    if (wasHidden) wrap.classList.add('is-hidden');
    wireCandidateRows();
    wireAddRemoveCandidates();
    updateSaveBtn();
  }

  function wireCandidateRows() {
    const voteSection = document.getElementById('kp_voteSection');
    if (!voteSection) return;

    // Toggle dropdown open on select-button tap.
    voteSection.querySelectorAll('[data-cand-select]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.candSelect, 10);
        const dd = voteSection.querySelector(`[data-cand-dropdown="${i}"]`);
        // Close other dropdowns
        voteSection.querySelectorAll('[data-cand-dropdown]').forEach(d => {
          if (d !== dd) d.classList.remove('is-open');
        });
        dd.classList.toggle('is-open');
        if (dd.classList.contains('is-open')) {
          setTimeout(() => voteSection.querySelector(`[data-cand-search="${i}"]`)?.focus(), 50);
        }
      });
    });

    // Search input filters this row's list.
    voteSection.querySelectorAll('[data-cand-search]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = parseInt(inp.dataset.candSearch, 10);
        const val = e.target.value.trim();
        candidates[i].typedName = val;
        candidates[i].selectedRecipeId = null;
        voteSection.querySelector(`[data-cand-list="${i}"]`).innerHTML = buildCandRecipeRows(val, i);
        // Mirror recipe-pick path: keep the collapsed-button label + has-value
        // class in sync with the typed name so the row visually reflects state.
        const selectBtn = voteSection.querySelector(`[data-cand-select="${i}"]`);
        const mealNameSpan = selectBtn?.querySelector('.kp-cand-mealname');
        if (mealNameSpan) mealNameSpan.textContent = val || 'Choose a meal…';
        selectBtn?.classList.toggle('has-value', !!val);
        updateSaveBtn();
      });
    });

    // Recipe selection.
    voteSection.querySelectorAll('[data-cand-pick-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.candPickRow, 10);
        const id = btn.dataset.candPickId;
        candidates[i].selectedRecipeId = id;
        candidates[i].typedName = recipes[id]?.name || '';
        // Collapse this row's dropdown + update label.
        voteSection.querySelector(`[data-cand-dropdown="${i}"]`).classList.remove('is-open');
        const mealNameSpan = voteSection.querySelector(`[data-cand-select="${i}"] .kp-cand-mealname`);
        if (mealNameSpan) mealNameSpan.textContent = recipes[id]?.name || '';
        voteSection.querySelector(`[data-cand-select="${i}"]`)?.classList.add('has-value');
        updateSaveBtn();
      });
    });
  }

  function wireAddRemoveCandidates() {
    const voteSection = document.getElementById('kp_voteSection');
    if (!voteSection) return;

    voteSection.querySelector('#kp_addCand')?.addEventListener('click', () => {
      if (candidates.length >= 3) return;
      candidates.push({ selectedRecipeId: null, typedName: '' });
      rerenderVoteSection();
    });

    voteSection.querySelectorAll('[data-cand-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.candRemove, 10);
        if (candidates.length <= 2) return; // min 2 in Vote mode
        candidates.splice(i, 1);
        rerenderVoteSection();
      });
    });
  }

  wireCandidateRows();
  wireAddRemoveCandidates();
  // Sync Save button state to actual mealMode/candidates — important when sheet
  // opens in Vote mode with pre-filled candidates (initialMode/initialCandidates).
  updateSaveBtn();

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
    const modeSection = document.getElementById('kp_modeSection');
    modeSection?.classList.toggle('is-hidden', selectedSlot === 'school');
    // School slot: force back to single mode so a half-filled Vote-mode
    // setup doesn't silently no-op on save.
    if (selectedSlot === 'school' && mealMode === 'vote') {
      mealMode = 'single';
      document.getElementById('kp_mealSection')?.classList.remove('is-hidden');
      document.getElementById('kp_voteSection')?.classList.add('is-hidden');
      document.getElementById('kp_modeTabs')?.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('is-active', t.dataset.mode === 'single'));
    }
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
    let canSave = false;
    if (mealMode === 'single') {
      const val = document.getElementById('kp_search')?.value.trim();
      canSave = !!(selectedSlot && (val || selectedRecipeId));
    } else {
      // Vote mode: at least one candidate must have a selection.
      canSave = !!selectedSlot && candidates.some(c => c.selectedRecipeId || c.typedName.trim());
    }
    const btn = document.getElementById('kp_save');
    if (btn) btn.disabled = !canSave;
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
        document.getElementById('kp_secondPick').innerHTML = buildRecipeRows(name, secondRecipeId);
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
      document.getElementById('kp_secondPick').innerHTML = buildRecipeRows('', secondRecipeId);
      bindSecondPickRows();
    } else {
      secondRecipeId = null;
      secondTypedName = '';
    }
  });

  document.getElementById('kp_secondSearch')?.addEventListener('input', (e) => {
    secondRecipeId = null;
    secondTypedName = e.target.value.trim();
    document.getElementById('kp_secondPick').innerHTML = buildRecipeRows(e.target.value, secondRecipeId);
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

  const kpSaveBtn = document.getElementById('kp_save');
  kpSaveBtn?.addEventListener('click', () => withButtonLock(kpSaveBtn, async () => {
    const day = document.getElementById('kp_day')?.value;
    if (!day || !selectedSlot) return;

    // planCache only holds the Meals tab's visible window — opening the
    // planner from the Recipes tab or picking a far date would otherwise see
    // an empty day and silently clobber votes / misallocate school slots.
    // Refresh the chosen day from Firebase before any occupancy decision.
    const freshPlan = await readKitchenPlan(day).catch(() => null) || {};
    planCache[day] = freshPlan;

    // ===== Vote mode branch =====
    if (mealMode === 'vote' && selectedSlot !== 'school') {
      const voteSlot = selectedSlot;
      // Carry votes/addedAt/addedBy forward from existing options so adding a
      // 3rd candidate (or re-saving) doesn't wipe everyone's votes.
      const existingOpts = normalizePlanSlot(freshPlan[voteSlot]);
      const filled = candidates
        .filter(c => c.selectedRecipeId || c.typedName.trim())
        .map(c => {
          const match = existingOpts.find(o => c.selectedRecipeId
            ? o.recipeId === c.selectedRecipeId
            : (!o.recipeId && (o.customName || o.mealName || '') === c.typedName.trim()));
          const base = {
            source: match?.source || 'manual',
            addedBy: match?.addedBy ?? (linkedPerson?.id || (people[0]?.id ?? null)),
            addedAt: match?.addedAt || Date.now(),
            votes: match?.votes || {},
          };
          if (c.selectedRecipeId) return { ...base, recipeId: c.selectedRecipeId };
          return { ...base, customName: c.typedName.trim() };
        });
      if (filled.length === 0) return; // Save button should be disabled, but guard anyway
      await writeKitchenPlanSlot(day, voteSlot, filled);
      planCache[day] = { ...planCache[day], [voteSlot]: filled };
      mount.innerHTML = '';
      await renderMealsTab();
      showToast(filled.length === 1 ? 'Meal saved' : `${filled.length} options saved`);
      return;
    }

    // ===== Single mode branch (unchanged) =====
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
    firstData.addedAt = Date.now();
    if (linkedPerson?.id) firstData.addedBy = linkedPerson.id;
    // Carry user-adjusted servings from the recipe detail's calculator (only when this recipe was prefilled).
    if (preServings && selectedRecipeId === preRecipeId) {
      firstData.servings = preServings;
    }
    // Single mode always replaces the slot.
    const existingOptions = normalizePlanSlot(planCache[day]?.[concreteSlot]);
    // Protect votes-in-progress: replacing 2+ options requires confirmation
    // since it discards everyone's votes.
    if (existingOptions.length >= 2) {
      const ok = await showConfirm({
        title: 'Replace voting options?',
        message: `This will remove all ${existingOptions.length} options and any votes cast. Continue?`,
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    await writeKitchenPlanSlot(day, concreteSlot, [firstData]);

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
  }));
}

function openSlotEditSheet(dk, slot, entry) {
  const mount = document.getElementById('sheetMount');
  const slotData = planCache[dk]?.[slot];
  const options = normalizePlanSlot(slotData);
  if (options.length === 0) return;

  if (options.length === 1) {
    renderSingleOption(options[0]);
  } else {
    renderMultiOption(options);
  }

  // ============ Single-option render (rich rd-* component) ============
  // Uses the shared renderMealDetailSheet so the slot-edit experience
  // matches the Recipes-tab detail and the Dashboard dinner widget. For
  // customName meals (typed-not-saved), we synthesize a minimal meal object
  // so the sheet still renders rather than falling through to "Meal not
  // found." The synthetic object has no ingredients/notes/steps so those
  // sections (and their footer buttons) naturally hide.
  function renderSingleOption(opt) {
    const meal = opt.recipeId
      ? recipes[opt.recipeId]
      : { name: opt.mealName || opt.customName || '(no name)' };

    mount.innerHTML = renderBottomSheet(renderMealDetailSheet(meal, opt, false, slot));
    activateSheet(mount);
    upgradeHero(opt.recipeId, meal.imageUrl); // paint thumb, then lazily swap in the full image

    document.getElementById('mdClose')?.addEventListener('click', () => { mount.innerHTML = ''; });

    // Servings stepper — only present when the recipe has a base servings
    // count. Mirrors Dashboard's openMealDetailSheet behavior (the carry-into
    // -plan-slot persistence isn't needed here since we're already in a
    // planned slot; the stepper just scales the displayed ingredient list).
    if (meal?.servings) {
      const baseServings = meal.servings;
      let currentServings = (typeof opt.servings === 'number' && opt.servings > 0) ? opt.servings : baseServings;
      const rebuildIngredients = () => {
        const wrap = document.getElementById('mdIngredients');
        if (!wrap) return;
        const factor = currentServings / baseServings;
        wrap.innerHTML = (meal.ingredients || []).filter(i => (i?.name || i)?.trim()).map(i =>
          typeof i === 'string'
            ? `<span class="rd-ing-qty"></span><span class="rd-ing-name">${esc(i)}</span>`
            : `<span class="rd-ing-qty">${esc(scaleQty(i.qty || '', factor) || '')}</span><span class="rd-ing-name">${esc(i.name || '')}</span>`
        ).join('');
      };
      document.getElementById('mdServingsDown')?.addEventListener('click', () => {
        if (currentServings <= 1) return;
        currentServings--;
        const valEl = document.getElementById('mdServingsVal');
        if (valEl) valEl.textContent = currentServings;
        rebuildIngredients();
      });
      document.getElementById('mdServingsUp')?.addEventListener('click', () => {
        currentServings++;
        const valEl = document.getElementById('mdServingsVal');
        if (valEl) valEl.textContent = currentServings;
        rebuildIngredients();
      });
    }

    // Start cooking — only renders when the recipe has steps or notes
    // (the shared component gates the button on those).
    document.getElementById('mdStartCooking')?.addEventListener('click', () => {
      if (!opt.recipeId) return;
      const recipe = recipes[opt.recipeId];
      if (!recipe) return;
      mount.innerHTML = '';
      openCookMode({ ...recipe, id: opt.recipeId }, {
        mount,
        onComplete: async (r) => {
          if (r.id && recipes[r.id]) {
            await writeKitchenRecipe(r.id, { ...recipes[r.id], lastUsed: Date.now() });
            recipes[r.id].lastUsed = Date.now();
          }
        },
        onExit: () => renderActiveTab(),
        showToast,
      });
    });

    document.getElementById('mdAddToList')?.addEventListener('click', () => {
      const recipe = opt.recipeId ? recipes[opt.recipeId] : null;
      if (!recipe) return;
      mount.innerHTML = '';
      // K1: this used to call an undefined addRecipeIngredientsToList() and
      // crash after clearing the sheet. Use the shared review sheet, seeded
      // with the plan entry's persisted servings.
      openAddToListReviewSheet(recipe, opt.servings || recipe.servings, recipe.servings);
    });

    document.getElementById('mdChange')?.addEventListener('click', () => {
      mount.innerHTML = '';
      openPlanMealSheet(dk, slot, opt.recipeId || null);
    });

    // mdEdit opens the recipe edit form; re-opens this slot sheet on save so
    // the user is back where they started after editing.
    document.getElementById('mdEdit')?.addEventListener('click', () => {
      if (!opt.recipeId) return;
      mount.innerHTML = '';
      openRecipeForm(opt.recipeId, () => openSlotEditSheet(dk, slot, opt));
    });

    // mdRemove is "Remove from plan" here (slot context) — not "Delete recipe."
    document.getElementById('mdRemove')?.addEventListener('click', async () => {
      await removeKitchenPlanSlot(dk, slot);
      mount.innerHTML = '';
      await renderMealsTab();
      showToast('Meal removed');
    });

    // Stars: tap → opens rating sheet for the underlying recipe (no-op for
    // customName meals).
    document.getElementById('mdStars')?.addEventListener('click', () => {
      if (!opt.recipeId) return;
      mount.innerHTML = '';
      openRecipeRatingSheet(opt.recipeId);
    });
  }

  // ============ Multi-option render (vote cards) ============
  function renderMultiOption(opts) {
    // Resolve voter id up front (was inline async before; lifting it out keeps
    // openVoteSheet purely synchronous from a setup-time perspective).
    resolveVoterId().then(viewerId => {
      const d = new Date(dk + 'T12:00:00');
      const dayLabel = `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;
      const slotLabel = (slot === 'school-lunch' || slot === 'school-lunch-2')
        ? getSchoolSlotLabel(slot, planCache[dk] || {})
        : (SLOT_LABELS[slot] || slot);

      openVoteSheet({
        mount, dk, slot, slotLabel, dayLabel,
        options: opts,
        recipes, people,
        viewerId,
        showToast, showConfirm,
        onWriteOptions: async (newOpts) => {
          await writeKitchenPlanSlot(dk, slot, newOpts);
          planCache[dk] = { ...planCache[dk], [slot]: newOpts };
          opts = newOpts;
          if (newOpts.length > 1) {
            // Vote toggle or option-removed-but-still-multi: re-render in place.
            renderMultiOption(newOpts);
          } else {
            // Lock-in or remove-to-1: close the vote sheet and refresh Meals tab.
            // For lock-in, openVoteSheet also calls onClose() and showToast() after
            // this resolves; the redundant mount clear is harmless.
            mount.innerHTML = '';
            await renderMealsTab();
          }
        },
        onRemoveSlot: async () => {
          await removeKitchenPlanSlot(dk, slot);
          delete planCache[dk][slot];
          await renderMealsTab();
        },
        onAddAnother: () => {
          mount.innerHTML = '';
          // Build candidates from existing options + one empty row.
          const existing = normalizePlanSlot(planCache[dk]?.[slot]);
          const preCandidates = existing.map(o => ({
            selectedRecipeId: o.recipeId || null,
            typedName: o.recipeId ? '' : (o.customName || o.mealName || ''),
          }));
          if (preCandidates.length < 3) {
            preCandidates.push({ selectedRecipeId: null, typedName: '' });
          }
          openPlanMealSheet(dk, slot, null, {
            initialMode: 'vote',
            initialCandidates: preCandidates,
          });
        },
        onClose: () => { mount.innerHTML = ''; },
      });
    });
  }

  function resolveVoterId() {
    if (linkedPerson) return Promise.resolve(linkedPerson.id);
    const cached = sessionStorage.getItem('dr-kitchen-voter-id');
    if (cached && people.find(p => p.id === cached)) return Promise.resolve(cached);
    return openWhoVotesPrompt();
  }
}

async function openWhoVotesPrompt() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'who-overlay';
    overlay.innerHTML = `
      <div class="who-card">
        <div class="who-title">Who's voting?</div>
        <div class="who-chips">
          ${people.map(p => `<button class="chip" data-who-id="${esc(p.id)}" type="button">${esc(p.name)}</button>`).join('')}
        </div>
        <button class="btn btn--ghost btn--sm who-cancel" type="button">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-who-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.whoId;
        sessionStorage.setItem('dr-kitchen-voter-id', id);
        overlay.remove();
        resolve(id);
      });
    });
    overlay.querySelector('.who-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}
async function openCookModeSheet(recipe) {
  if (!recipe) return;
  const mount = document.getElementById('sheetMount');
  await openCookMode(recipe, {
    mount,
    onComplete: async (r) => {
      // Mark recipe as cooked (bump lastUsed) so it falls down the "never
      // cooked" filter and the "last cooked" chip updates.
      if (r.id && recipes[r.id]) {
        await writeKitchenRecipe(r.id, { ...recipes[r.id], lastUsed: Date.now() });
        recipes[r.id].lastUsed = Date.now();
      }
    },
    onExit: () => renderActiveTab(),
    showToast,
  });
}

async function openMealHistorySheet() {
  const mount = document.getElementById('sheetMount');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 30);

  // Loading state
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Meal history', closeId: 'mh_close' })}
    <div class="mh-loading">Loading last 30 days…</div>
  `);
  activateSheet(mount);
  document.getElementById('mh_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  const planByDate = await readKitchenPlanRange(start, today);

  // Build a 30-day list (today backward).
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const plan = planByDate[dk];
    const dinnerOpts = normalizePlanSlot(plan?.dinner);
    // K29: a never-locked-in vote should show its winner in history.
    days.push({ date: d, dateKey: dk, dinner: dinnerOpts.length > 1 ? pickWinner(dinnerOpts) : (dinnerOpts[0] || null) });
  }

  function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const weekGroups = {};
  for (const dayInfo of days) {
    const mk = mondayOf(dayInfo.date);
    const mkStr = `${mk.getFullYear()}-${String(mk.getMonth() + 1).padStart(2, '0')}-${String(mk.getDate()).padStart(2, '0')}`;
    if (!weekGroups[mkStr]) weekGroups[mkStr] = { monday: mk, days: [] };
    weekGroups[mkStr].days.push(dayInfo);
  }
  const sortedWeeks = Object.values(weekGroups).sort((a, b) => b.monday - a.monday);

  const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const weeksHtml = sortedWeeks.map(week => {
    const m = week.monday;
    const weekLabel = `Week of ${MONTHS_SHORT[m.getMonth()]} ${m.getDate()}`;
    const sortedDays = [...week.days].sort((a, b) => a.date - b.date);
    const rowsHtml = sortedDays.map(({ date, dateKey, dinner }) => {
      const dayLabel = `${DAY_NAMES_SHORT[date.getDay()]} ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
      let dinnerName = '—';
      let recipeIdForRow = null;
      if (dinner) {
        // Handle both legacy single-object and (future) array shape.
        // Array shape from SP4-F may not be in effect yet — guard.
        const optionsArr = Array.isArray(dinner) ? dinner : [dinner];
        const winner = optionsArr[0]; // any element is fine for history display
        if (winner?.recipeId) {
          dinnerName = recipes[winner.recipeId]?.name || 'Unknown recipe';
          recipeIdForRow = winner.recipeId;
        } else if (winner?.customName) {
          dinnerName = winner.customName;
        } else if (winner?.mealName) {
          dinnerName = winner.mealName;
        }
      }
      const isInteractive = !!recipeIdForRow;
      const attrs = isInteractive ? ` data-mh-recipe-id="${esc(recipeIdForRow)}" role="button"` : '';
      return `<div class="mh-row${isInteractive ? ' mh-row--interactive' : ''}"${attrs}>
        <span class="mh-day-label">${esc(dayLabel)}</span>
        <span class="mh-meal-name">${esc(dinnerName)}</span>
      </div>`;
    }).join('');
    return `<div class="mh-week">
      <div class="mh-week-label">${esc(weekLabel)}</div>
      ${rowsHtml}
    </div>`;
  }).join('');

  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Meal history', closeId: 'mh_close' })}
    <div class="mh-hint">Last 30 days — dinners only</div>
    <div class="mh-list">${weeksHtml}</div>
  `);
  activateSheet(mount);
  document.getElementById('mh_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  mount.querySelectorAll('[data-mh-recipe-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.mhRecipeId;
      mount.innerHTML = '';
      openRecipeDetailSheet(id);
    });
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
  const PLAY_SVG   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;

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

  function buildTimesAndServings() {
    const prepMins = parseRecipeTimeToMinutes(recipe.prepTime);
    const cookMins = parseRecipeTimeToMinutes(recipe.cookTime);
    const totalMins = (prepMins || 0) + (cookMins || 0);
    const cells = [];
    if (recipe.prepTime) cells.push(`<div class="rd-time-cell"><span class="rd-time-label">Prep</span><span class="rd-time-val">${esc(recipe.prepTime)}</span></div>`);
    if (recipe.cookTime) cells.push(`<div class="rd-time-cell"><span class="rd-time-label">Cook</span><span class="rd-time-val">${esc(recipe.cookTime)}</span></div>`);
    if (prepMins && cookMins) cells.push(`<div class="rd-time-cell rd-time-cell--total"><span class="rd-time-label">Total</span><span class="rd-time-val">${esc(formatRecipeTime(totalMins))}</span></div>`);
    const timesHtml = cells.length ? `<div class="rd-times">${cells.join('')}</div>` : '';
    const servingsHtml = baseServings ? `
      <div class="rd-servings-row">
        <span class="rd-servings-label">Servings</span>
        <div class="rd-serves-stepper">
          <button class="rd-stepper-btn" id="rdServingsDown" type="button" aria-label="Fewer servings">−</button>
          <span class="rd-stepper-val" id="rdServingsVal">${currentServings}</span>
          <span class="rd-stepper-unit">servings</span>
          <button class="rd-stepper-btn" id="rdServingsUp" type="button" aria-label="More servings">+</button>
        </div>
      </div>` : '';
    if (!timesHtml && !servingsHtml) return '';
    return `<div class="rd-times-block">${timesHtml}${servingsHtml}</div>`;
  }

  function buildStars() {
    const { avg } = avgRating(recipe, linkedPerson?.id);
    if (avg == null) {
      const emptyStars = Array.from({ length: 5 }, () => `<span class="rd-star rd-star--empty">★</span>`).join('');
      return `<button class="rd-stars-btn rd-stars-btn--empty" id="rdStarsBtn" type="button" aria-label="Not rated — tap to rate"><span class="rd-stars-visual">${emptyStars}</span></button>`;
    }
    const numText = Number.isInteger(avg) ? `${avg}.0` : avg.toFixed(1);
    const stars = Array.from({ length: 5 }, (_, i) => {
      const slot = i + 1;
      const kind = avg >= slot ? 'full' : (avg >= slot - 0.5 ? 'half' : 'empty');
      return `<span class="rd-star rd-star--${kind}">★</span>`;
    }).join('');
    return `<button class="rd-stars-btn" id="rdStarsBtn" type="button" aria-label="Rating ${numText} of 5 — tap to rate"><span class="rd-stars-visual">${stars}</span><span class="rd-stars-num">${esc(numText)}</span></button>`;
  }

  const hasIngredients = (recipe.ingredients?.length || 0) > 0;

  function render() {
    const timesBlock = buildTimesAndServings();
    mount.innerHTML = renderBottomSheet(`
      ${(recipe.thumbUrl || recipe.imageUrl) ? `<div class="rd-hero"><img src="${esc(recipe.thumbUrl || recipe.imageUrl)}" alt="" class="rd-hero__img" loading="lazy" onerror="(window.__krImgError&&window.__krImgError('${esc(recipeId)}'));this.parentElement.remove()"/></div>` : ''}
      <div class="sheet__header">
        <h2 class="sheet__title">${esc(recipe.name)}</h2>
        <div class="rf-header-actions">
          ${recipe.videoUrl ? `<a class="ef2-icon-btn" href="${esc(recipe.videoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Watch video">${PLAY_SVG}</a>` : ''}
          ${recipe.url ? `<a class="ef2-icon-btn" href="${esc(recipe.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open recipe">${LINK_SVG}</a>` : ''}
          <button class="ef2-icon-btn rf-delete-btn" id="deleteRecipeBtn" aria-label="Delete" type="button">${TRASH_SVG}</button>
          <button class="ef2-icon-btn" id="editRecipeBtn" aria-label="Edit" type="button">${PENCIL_SVG}</button>
          <button class="ef2-icon-btn" id="closeRecipeDetail" aria-label="Close" type="button">${CLOSE_SVG}</button>
        </div>
      </div>
      ${timesBlock}
      <div class="rd-source-row">
        ${sourceDomain ? `<span class="rd-source">from ${esc(sourceDomain)}</span>` : '<span></span>'}
        <div class="rd-stars">${buildStars()}</div>
      </div>
      ${recipe.notes ? `
        <details class="rd-chef-notes" open>
          <summary class="rd-chef-notes__label">Chef's notes</summary>
          <p class="rd-chef-notes__body">${esc(recipe.notes)}</p>
        </details>` : ''}
      ${recipe.familyNotes ? `
        <details class="rd-chef-notes rd-chef-notes--family" open>
          <summary class="rd-chef-notes__label">Family notes</summary>
          <p class="rd-chef-notes__body">${esc(recipe.familyNotes)}</p>
        </details>` : ''}
      ${hasIngredients ? `
        <div class="me-detail__section">
          <span class="me-detail__section-label">Ingredients</span>
          <div class="rd-ingredients" id="rdIngredients">${buildIngredientRows()}</div>
        </div>` : ''}
      <div class="sheet__footer">
        ${(recipe.steps?.length || recipe.notes) ? `<button class="btn btn--primary" id="startCookingBtn" type="button">Start cooking</button>` : ''}
        ${hasIngredients ? `<button class="btn btn--secondary" id="addToListBtn" type="button">Add to list</button>` : ''}
        <button class="btn btn--secondary" id="planThisMealBtn" type="button">Plan this meal</button>
      </div>`);
    activateSheet(mount);
    bindButtons();
    upgradeHero(recipeId, recipe.imageUrl); // paint thumb, then lazily swap in the full image
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
      openPlanMealSheet(todayKey(tz), 'dinner', recipeId, { servings: currentServings });
    });

    document.getElementById('startCookingBtn')?.addEventListener('click', () => {
      close();
      openCookModeSheet({ ...recipe, id: recipeId });
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

function openAiSuggestSheet() {
  const mount = document.getElementById('sheetMount');
  let pantry = '';
  let suggestions = null;
  let loading = false;

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: 'What can I make?', closeId: 'sug_close' })}
      ${suggestions === null ? `
        <p class="sug-hint">List what you have on hand</p>
        <textarea id="sug_pantry" class="sug-textarea" placeholder="e.g. chicken thighs, rice, broccoli, soy sauce, ginger" autofocus>${esc(pantry)}</textarea>
        <div class="sug-footer">
          <button class="btn btn--primary" id="sug_go" type="button"${loading || pantry.trim().split(/\s+/).filter(Boolean).length < 2 ? ' disabled' : ''}>
            ${loading ? 'Thinking…' : 'Suggest recipes'}
          </button>
        </div>
      ` : `
        <div class="sug-results">
          ${suggestions.length === 0
            ? `<div class="sug-empty">No suggestions — try different ingredients.</div>`
            : suggestions.map((s, i) => `
              <div class="sug-card" data-sug-idx="${i}">
                <div class="sug-card__title">${esc(s.name)}</div>
                <div class="sug-card__body">${esc(s.description)}</div>
                ${s.tags?.length ? `<div class="sug-card__tags">${s.tags.map(t => `<span class="sug-tag">${esc(t)}</span>`).join('')}</div>` : ''}
                <button class="btn btn--secondary btn--sm" data-sug-save="${i}" type="button">Save to library</button>
              </div>`).join('')}
        </div>
        <div class="sug-footer">
          <button class="btn btn--ghost" id="sug_back" type="button">Try different ingredients</button>
        </div>
      `}
    `);
    activateSheet(mount);

    document.getElementById('sug_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
    document.getElementById('sug_back')?.addEventListener('click', () => { suggestions = null; render(); });

    document.getElementById('sug_pantry')?.addEventListener('input', (e) => {
      pantry = e.target.value;
      const btn = document.getElementById('sug_go');
      if (btn) btn.disabled = pantry.trim().split(/\s+/).filter(Boolean).length < 2;
    });

    document.getElementById('sug_go')?.addEventListener('click', async () => {
      loading = true;
      render();
      try {
        const res = await fetch(KITCHEN_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'recipeSuggest', input: { pantry } }),
        });
        const data = await res.json();
        suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      } catch (err) {
        console.warn('recipeSuggest failed', err);
        suggestions = [];
      }
      loading = false;
      render();
    });

    mount.querySelectorAll('[data-sug-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.sugSave, 10);
        const s = suggestions[i];
        if (!s) return;
        const newRecipe = {
          name: s.name,
          notes: s.description,
          tags: s.tags?.length ? s.tags : null,
          ingredients: [],
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          source: 'ai-suggest',
        };
        const id = await pushKitchenRecipe(newRecipe);
        recipes[id] = { ...newRecipe, createdAt: Date.now() };
        showToast(`Saved "${s.name}" — fill in ingredients later`);
        btn.disabled = true;
        btn.textContent = 'Saved ✓';
      });
    });
  }

  render();
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
function openRecipeRatingSheet(recipeId) {
  const recipe = recipes[recipeId];
  if (!recipe) return;
  const mount = document.getElementById('sheetMount');

  if (!linkedPerson) {
    showToast('Open this page from your personal link to rate recipes');
    return;
  }

  const viewerId = linkedPerson.id;
  const savedRating = (recipe.ratings && recipe.ratings[viewerId]) || 0;
  // pendingRating is the *uncommitted* value driven by tap/drag. It only writes
  // to Firebase on Submit, so users can preview half-stars without losing the
  // sheet on the first touch.
  let pendingRating = savedRating;

  function buildStarsHtml(value) {
    return Array.from({ length: 5 }, (_, i) => {
      const star = i + 1;
      const filled = value >= star ? 'full' : (value >= star - 0.5 ? 'half' : 'empty');
      return `<span class="rrs-star rrs-star--${filled}" data-rrs-star="${star}"><span class="rrs-star__glyph">★</span></span>`;
    }).join('');
  }

  // Re-render only the stars + helper, preserving drag state and footer.
  function updateStarsUI() {
    const stars = document.getElementById('rrsStars');
    if (stars) stars.innerHTML = buildStarsHtml(pendingRating);
    const helper = document.getElementById('rrsHelper');
    if (helper) helper.textContent = pendingRating ? `Your rating: ${pendingRating}` : 'Tap or drag to rate';
    const submit = document.getElementById('rrsSubmit');
    if (submit) submit.disabled = !pendingRating || pendingRating === savedRating;
  }

  // Map an absolute pointer X coordinate to a half-star rating (0.5–5.0).
  function xToRating(clientX) {
    const stars = document.getElementById('rrsStars');
    if (!stars) return pendingRating;
    const rect = stars.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const halves = Math.ceil(ratio * 10); // 1..10
    return Math.max(0.5, Math.min(5, halves * 0.5));
  }

  function render() {
    mount.innerHTML = renderBottomSheet(`
      ${renderFormSheetHeader({ title: `Rate ${recipe.name}`, closeId: 'rrs_close' })}
      <div class="rrs-body">
        <div class="rrs-stars" id="rrsStars" role="slider" tabindex="0" aria-valuemin="0.5" aria-valuemax="5" aria-valuenow="${pendingRating || 0}" aria-label="Recipe rating">${buildStarsHtml(pendingRating)}</div>
        <div class="rrs-helper" id="rrsHelper">${pendingRating ? `Your rating: ${pendingRating}` : 'Tap or drag to rate'}</div>
      </div>
      <div class="rrs-footer">
        ${savedRating ? `<button class="btn btn--ghost" id="rrsClear" type="button">Remove rating</button>` : ''}
        <button class="btn btn--primary" id="rrsSubmit" type="button" ${(!pendingRating || pendingRating === savedRating) ? 'disabled' : ''}>${savedRating ? 'Update' : 'Submit'}</button>
      </div>
    `);
    activateSheet(mount);
    bindHandlers();
  }

  function bindHandlers() {
    document.getElementById('rrs_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

    document.getElementById('rrsSubmit')?.addEventListener('click', async () => {
      if (!pendingRating) return;
      const ratings = { ...(recipe.ratings || {}), [viewerId]: pendingRating };
      recipes[recipeId] = { ...recipe, ratings };
      await writeKitchenRecipe(recipeId, { ...recipes[recipeId] });
      mount.innerHTML = '';
      renderActiveTab();
      showToast('Rating saved');
    });

    document.getElementById('rrsClear')?.addEventListener('click', async () => {
      const ratings = { ...(recipe.ratings || {}) };
      delete ratings[viewerId];
      recipes[recipeId] = { ...recipe, ratings };
      await writeKitchenRecipe(recipeId, { ...recipes[recipeId] });
      mount.innerHTML = '';
      renderActiveTab();
      showToast('Rating removed');
    });

    // Pointer-based tap + drag handling. Single listener on the stars
    // container — captures pointerdown / pointermove / pointerup so the value
    // updates live as the user swipes across the row.
    const stars = document.getElementById('rrsStars');
    if (!stars) return;
    let dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      pendingRating = xToRating(e.clientX);
      stars.setAttribute('aria-valuenow', String(pendingRating));
      updateStarsUI();
      e.preventDefault();
    };
    stars.addEventListener('pointerdown', (e) => {
      dragging = true;
      stars.setPointerCapture?.(e.pointerId);
      pendingRating = xToRating(e.clientX);
      stars.setAttribute('aria-valuenow', String(pendingRating));
      updateStarsUI();
      e.preventDefault();
    });
    stars.addEventListener('pointermove', onMove);
    stars.addEventListener('pointerup',   () => { dragging = false; });
    stars.addEventListener('pointercancel', () => { dragging = false; });
  }

  render();
}

// Lists recipes whose image has failed to self-heal twice or more so the user
// can open each one and either upload a new image or clear the dead source
// URL. Tap a row → recipe edit form (where they pick the fix).
function openBrokenRecipesSheet(flagged) {
  const mount = document.getElementById('sheetMount');
  if (!flagged?.length) return;
  const rows = flagged.map(([id, r]) => `
    <button class="brs-row" data-broken-id="${esc(id)}" type="button">
      <span class="brs-row__thumb" aria-hidden="true">🍴</span>
      <span class="brs-row__body">
        <span class="brs-row__name">${esc(r.name || '(untitled recipe)')}</span>
        <span class="brs-row__hint">${(r.imageRefreshFails || 0)} failed refresh${(r.imageRefreshFails || 0) === 1 ? '' : 'es'} — tap to fix</span>
      </span>
      <span class="brs-row__chev" aria-hidden="true">›</span>
    </button>
  `).join('');
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: 'Recipes needing attention', closeId: 'brs_close' })}
    <p class="brs-intro">These recipes' images couldn't be reloaded from their source. Open each one to upload a new photo or clear the dead link.</p>
    <div class="brs-list">${rows}</div>
  `);
  activateSheet(mount);
  document.getElementById('brs_close')?.addEventListener('click', () => { mount.innerHTML = ''; });
  mount.querySelectorAll('[data-broken-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.brokenId;
      mount.innerHTML = '';
      openRecipeForm(id);
    });
  });
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
      <div class="filter-section__label">TOTAL TIME</div>
      <div class="filter-chips">${chipRow(prepOpts, 'prepBucket')}</div>
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

  // Single-select chip groups (show / prepBucket / sort)
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
    mount.querySelectorAll('[data-sync]').forEach(b => b.addEventListener('click', () => withButtonLock(b, async () => {
      await syncOneFeed(b.dataset.sync);
      const fresh = (await readSchoolLunchFeeds()) || {};
      Object.assign(feeds, fresh);
      for (const k of Object.keys(feeds)) if (!fresh[k]) delete feeds[k];
      render();
    })));
    mount.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openFeedEdit(b.dataset.edit)));
    mount.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => withButtonLock(b, async () => {
      const personId = b.dataset.remove;
      const ok = await showConfirm({ title: 'Remove this feed?', confirmLabel: 'Remove', danger: true });
      if (!ok) return;
      await removeSchoolLunchFeed(personId);
      delete feeds[personId];
      render();
    })));
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
    const slieSaveBtn = document.getElementById('slie_save');
    slieSaveBtn?.addEventListener('click', () => withButtonLock(slieSaveBtn, async () => {
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
    }));
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
        <button class="btn btn--secondary" id="kait_recipeSuggest" type="button">💡 What can I make?</button>
      </div>
    </div>
    <div class="kait-section">
      <div class="kait-section__label">LISTS</div>
      <div class="kait-grid">
        <button class="btn btn--secondary" id="kait_listClean" type="button"${!activeListId ? ' disabled' : ''}>🪄 Auto-categorize</button>
        <button class="btn btn--secondary" id="kait_listPhoto" type="button"${!activeListId ? ' disabled' : ''}>📷 Photo → list</button>
      </div>
      ${!activeListId ? `<div class="kait-hint">Create a list first.</div>` : ''}
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

  document.getElementById('kait_recipeSuggest')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openAiSuggestSheet();
  });

  document.getElementById('kait_listClean')?.addEventListener('click', () => {
    if (!activeListId) return;
    mount.innerHTML = '';
    runListCleanup(currentItems);
  });

  document.getElementById('kait_listPhoto')?.addEventListener('click', () => {
    if (!activeListId) return;
    mount.innerHTML = '';
    openListPhotoSourceSheet();
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

async function openRecipeForm(recipeId, onSave = null) {
  const existing = recipeId ? recipes[recipeId] : null;
  const ingredients = existing?.ingredients ? [...existing.ingredients] : [];
  // Editing a migrated recipe: the full image lives in kitchen/recipeImages, not
  // on the record — load it back so the working copy (and the save) has the full
  // image, not just the thumbnail. Un-migrated recipes still carry imageUrl directly.
  let imageUrl = existing?.imageUrl || '';
  if (!imageUrl && recipeId && existing?.thumbUrl) {
    imageUrl = (await readRecipeImage(recipeId)) || existing.thumbUrl || '';
  }
  let videoUrl = existing?.videoUrl || '';
  const tagsOpen = existing?.tags?.length ? ' is-open' : '';
  const stepsOpen = (existing?.steps?.length) ? ' is-open' : '';
  const familyNotesOpen = existing?.familyNotes ? ' is-open' : '';

  function normalizeRecipeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url.trim());
      let path = u.pathname.replace(/\/$/, '');
      return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}`;
    } catch {
      return url.trim().toLowerCase();
    }
  }

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
      ${((existing?.imageRefreshFails || 0) >= 2) ? `<p class="kr-url-dead-hint">This link is no longer reachable. Upload a new photo above, or clear the link to keep the recipe without it.</p>` : ''}
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
      ${(existing?.imageUrl && !existing.imageUrl.startsWith('data:')) ? `<button class="ef2-icon-btn" id="kr_refreshImage" type="button" aria-label="Refresh image (current URL may have expired)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
      </button>` : ''}
    </div>

    <div class="kr-section kr-meta-row">
      <label class="field">
        <span class="field__label">Prep time</span>
        <input id="recipePrepTime" type="text" class="field__input" placeholder="30 min"
          value="${esc(existing?.prepTime || '')}" autocomplete="off">
      </label>
      <label class="field">
        <span class="field__label">Cook time</span>
        <input id="recipeCookTime" type="text" class="field__input" placeholder="45 min"
          value="${esc(existing?.cookTime || '')}" autocomplete="off">
      </label>
      <label class="field">
        <span class="field__label">Serves</span>
        <input id="recipeServings" type="number" inputmode="numeric" class="field__input" min="1" max="99" placeholder="4"
          value="${existing?.servings || ''}" autocomplete="off">
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
      <button class="ef2-add-chip${familyNotesOpen ? ' is-active' : ''}" id="kr_familyNotesChip" type="button">+ Family notes</button>
      <button class="ef2-add-chip${stepsOpen ? ' is-active' : ''}" id="kr_stepsChip" type="button">+ Step-by-step</button>
    </div>

    <div class="ef2-field-reveal${tagsOpen}" id="kr_tagsReveal">
      <label class="field">
        <span class="field__label">Tags</span>
        <input id="recipeTags" type="text" class="field__input" placeholder="Italian, quick, vegetarian…"
          value="${esc((existing?.tags || []).join(', '))}" autocomplete="off">
      </label>
    </div>

    <div class="ef2-field-reveal${familyNotesOpen}" id="kr_familyNotesReveal">
      <label class="field">
        <span class="field__label">Family notes</span>
        <textarea id="recipeFamilyNotes" class="kr-notes" placeholder="What everyone thought, tweaks for next time, kid-friendly swaps…" autocomplete="off">${esc(existing?.familyNotes || '')}</textarea>
      </label>
    </div>

    <div class="ef2-field-reveal${stepsOpen}" id="kr_stepsReveal">
      <label class="field">
        <span class="field__label">Step-by-step (one per line)</span>
        <textarea id="recipeSteps" class="kr-notes" placeholder="Preheat oven to 400°F&#10;Mix dry ingredients in a bowl&#10;…" autocomplete="off">${esc((existing?.steps || []).join('\n'))}</textarea>
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

  // Tags / Family notes / Step-by-step disclosure chips
  function bindDisclosure(chipId, revealId, inputId) {
    document.getElementById(chipId)?.addEventListener('click', () => {
      const chip = document.getElementById(chipId);
      const reveal = document.getElementById(revealId);
      const opening = !reveal.classList.contains('is-open');
      reveal.classList.toggle('is-open');
      chip.classList.toggle('is-active', opening);
      if (opening) document.getElementById(inputId)?.focus();
    });
  }
  bindDisclosure('kr_tagsChip',         'kr_tagsReveal',         'recipeTags');
  bindDisclosure('kr_familyNotesChip',  'kr_familyNotesReveal',  'recipeFamilyNotes');
  bindDisclosure('kr_stepsChip',        'kr_stepsReveal',        'recipeSteps');

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
    const inputEl = document.getElementById('newIngredientInput');
    const val = inputEl?.value.trim();
    if (!val) {
      // Flash red border to signal the input is required
      if (inputEl) {
        inputEl.focus();
        inputEl.classList.add('input--error');
        setTimeout(() => inputEl.classList.remove('input--error'), 600);
      }
      return;
    }
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
    // K17: the form used to sit inert for seconds with no feedback.
    if (status) { status.textContent = 'Importing…'; status.style.display = ''; status.style.color = ''; }
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
      // Image: prefer the Worker-supplied base64 (server-side fetched — no
      // CORS, no expiry). Fall back to data.imageUrl + client-side fetch for
      // older Worker versions that don't return imageData yet.
      if (!imageUrl) {
        if (data.imageData && data.imageMediaType) {
          imageUrl = data.imageUrl || ''; // placeholder while we resize
          base64ToDataUrl(data.imageData, data.imageMediaType).then(dataUrl => {
            if (dataUrl) imageUrl = dataUrl;
          }).catch(() => { /* keep whatever we had */ });
        } else if (data.imageUrl) {
          imageUrl = data.imageUrl;
          urlToDataUrl(data.imageUrl).then(persistent => {
            if (persistent && persistent !== data.imageUrl) imageUrl = persistent;
          }).catch(() => { /* keep remote URL as fallback */ });
        }
      }
      // Prep time: prefer data.prepTime, fall back to totalTime when prep is absent
      // (some sites only expose totalTime in their JSON-LD).
      const prepFallback = data.prepTime || data.totalTime;
      if (prepFallback && !document.getElementById('recipePrepTime')?.value)
        document.getElementById('recipePrepTime').value = prepFallback;
      if (data.cookTime && !document.getElementById('recipeCookTime')?.value)
        document.getElementById('recipeCookTime').value = data.cookTime;
      if (data.servings && !document.getElementById('recipeServings')?.value)
        document.getElementById('recipeServings').value = data.servings;
      if (data.tags?.length && !document.getElementById('recipeTags')?.value) {
        document.getElementById('recipeTags').value = data.tags.join(', ');
        // Open the +Tags disclosure chip so the imported tags are visible.
        document.getElementById('kr_tagsChip')?.classList.add('is-active');
        document.getElementById('kr_tagsReveal')?.classList.add('is-open');
      }
      if (data.videoUrl && !videoUrl) videoUrl = data.videoUrl;
      if (Array.isArray(data.steps) && data.steps.length && !document.getElementById('recipeSteps')?.value) {
        const cleaned = data.steps.map(s => String(s || '').trim()).filter(Boolean).slice(0, 30);
        document.getElementById('recipeSteps').value = cleaned.join('\n');
        // Open the Step-by-step disclosure so the user sees what was captured.
        document.getElementById('kr_stepsChip')?.classList.add('is-active');
        document.getElementById('kr_stepsReveal')?.classList.add('is-open');
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
  document.getElementById('recipeUrl')?.addEventListener('blur', async () => {
    const typed = normalizeRecipeUrl(document.getElementById('recipeUrl')?.value);
    if (!typed) {
      maybeAutoImportUrl();
      return;
    }
    const editingId = recipeId || null;
    const match = Object.entries(recipes).find(([id, r]) => {
      if (id === editingId) return false;
      return normalizeRecipeUrl(r.url || '') === typed;
    });
    if (!match) {
      maybeAutoImportUrl();
      return;
    }
    const [matchedId, matchedRecipe] = match;
    const ageDays = matchedRecipe.createdAt
      ? Math.floor((Date.now() - matchedRecipe.createdAt) / 86_400_000)
      : null;
    const ageText = ageDays === null ? '' : ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`;
    const titleText = `You already have "${matchedRecipe.name}"${ageText ? ` (added ${ageText})` : ''}`;
    const messageText = 'Open the existing recipe, or save a new one with different content?';
    const confirmed = await showConfirm({
      title: titleText,
      message: messageText,
      confirmLabel: 'Open existing',
      cancelLabel: 'Save anyway',
    });
    if (confirmed) {
      close();
      openRecipeDetailSheet(matchedId);
    }
  });

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

  document.getElementById('kr_refreshImage')?.addEventListener('click', async () => {
    const btn = document.getElementById('kr_refreshImage');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    // Re-call the Worker with the recipe's SOURCE URL (the TikTok/page URL),
    // not the expired image URL. The Worker returns a fresh signed imageUrl
    // which we then persist as a data URL so it never expires again.
    const sourceUrl = existing?.url;
    if (!sourceUrl) {
      showToast('No recipe link to refresh from — upload a photo instead');
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
      return;
    }
    try {
      const res = await fetch(KITCHEN_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url', input: sourceUrl }),
      });
      const data = await res.json();
      // Prefer Worker-supplied base64 (server-side fetched, never expires).
      let fresh = null;
      if (data?.imageData && data?.imageMediaType) {
        fresh = await base64ToDataUrl(data.imageData, data.imageMediaType);
      } else if (data?.imageUrl) {
        fresh = await urlToDataUrl(data.imageUrl);
      }
      if (!fresh) {
        showToast('No image found — try uploading a photo');
        return;
      }
      imageUrl = fresh;
      showToast(imageUrl.startsWith('data:') ? 'Image refreshed — Save to keep' : 'Image refreshed (remote) — Save to keep');
    } catch (err) {
      console.error('Image refresh failed', err);
      showToast('Refresh failed — try again');
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
  });

  const krSaveBtn = document.getElementById('kr_save');
  krSaveBtn?.addEventListener('click', () => withButtonLock(krSaveBtn, async () => {
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
    const stepsRaw = document.getElementById('recipeSteps')?.value || '';
    const steps = stepsRaw.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30);
    // Small thumbnail for cards/lists; the full image goes to the lazily-loaded
    // kitchen/recipeImages branch below so the recipe tree stays tiny. On CORS
    // failure makeThumbnail returns '' and we fall back to the full image.
    const thumbUrl = imageUrl ? ((await makeThumbnail(imageUrl, 200)) || imageUrl) : null;
    const data = {
      name,
      url,
      notes: document.getElementById('recipeNotes')?.value.trim() || null,
      familyNotes: document.getElementById('recipeFamilyNotes')?.value.trim() || null,
      source: existing?.source || 'manual',
      ingredients,
      lastUsed: existing?.lastUsed || null,
      prepTime: document.getElementById('recipePrepTime')?.value.trim() || null,
      cookTime: document.getElementById('recipeCookTime')?.value.trim() || null,
      servings: parseInt(document.getElementById('recipeServings')?.value, 10) || null,
      tags: tags.length ? tags : null,
      steps: steps.length ? steps : null,
      thumbUrl,
      videoUrl: videoUrl || null,
      // Any save implicitly "fixes" the recipe — clear the failure counter
      // so any banner attribution disappears.
      imageRefreshFails: null,
    };

    if (recipeId) {
      await writeKitchenRecipe(recipeId, { ...data, createdAt: existing?.createdAt });
      recipes[recipeId] = { ...data, createdAt: existing?.createdAt };
      if (imageUrl) { await writeRecipeImage(recipeId, imageUrl); } else { await removeRecipeImage(recipeId); }
      close();
      if (onSave) { onSave(recipeId); } else { renderActiveTab(); }
      showToast('Recipe updated');
    } else {
      const id = await pushKitchenRecipe({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      recipes[id] = data;
      if (imageUrl) { await writeRecipeImage(id, imageUrl); }
      close();
      if (onSave) { onSave(id); } else { renderActiveTab(); }
      showToast('Recipe saved');
    }
  }));
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

  const activeCount = Object.values(currentItems || {}).filter(it => !it.checked).length;
  const totalCount = Object.values(currentItems || {}).length;
  const countChip = (() => {
    if (totalCount === 0) return '';
    if (activeCount === 0) return '<span class="list-switcher__count list-switcher__count--clear">· clear ✓</span>';
    return `<span class="list-switcher__count">· ${activeCount} left</span>`;
  })();

  content.innerHTML = `
    <div class="list-switcher">
      <div class="list-switcher__tabs">
        ${listIds.map(id => {
          const l = lists[id];
          const icon = l.icon ? `<span class="tab--list-icon" data-bg-color="${esc(l.color || DEFAULT_LIST_COLOR)}">${esc(l.icon)}</span>` : '';
          const isActive = id === activeListId;
          return `
          <button class="tab${isActive ? ' is-active' : ''} tab--list"
                  data-list-id="${esc(id)}" type="button">
            ${icon}${esc(l.name)}${isActive ? countChip : ''}
          </button>`;
        }).join('')}
      </div>
      <div class="list-switcher__actions">
        <button class="btn-icon" id="manageListBtn" aria-label="Manage list" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>
          </svg>
        </button>
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
    if (e.target.closest('#manageListBtn')) { openListActionsMenu(); return; }
  });

  document.getElementById('staplesTopBtn')?.addEventListener('click', openStaplesSheet);

  subscribeListItems();
}

function subscribeListItems() {
  if (itemsUnsub) { itemsUnsub(); itemsUnsub = null; }
  if (!activeListId) { renderItemsArea({}); return; }
  itemsUnsub = onKitchenItems(activeListId, (items) => {
    renderItemsArea(items || {});
    updateListCountChip();
  });
}

function updateListCountChip() {
  const activeBtn = document.querySelector('.list-switcher .tab--list.is-active');
  if (!activeBtn) return;
  activeBtn.querySelectorAll('.list-switcher__count').forEach(el => el.remove());
  const activeCount = Object.values(currentItems || {}).filter(it => !it.checked).length;
  const totalCount = Object.values(currentItems || {}).length;
  if (totalCount === 0) return;
  const chip = document.createElement('span');
  chip.className = activeCount === 0
    ? 'list-switcher__count list-switcher__count--clear'
    : 'list-switcher__count';
  chip.textContent = activeCount === 0 ? '· clear ✓' : `· ${activeCount} left`;
  activeBtn.appendChild(chip);
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
    const staplesCount = Object.keys(staples || {}).length;
    const cta = staplesCount > 0
      ? `<button class="btn btn--primary btn--sm" id="emptyAddFromStaples" type="button">+ Add from staples</button>`
      : `<a class="lam-empty-link" id="emptyOpenStaples" href="#" role="button">Save your basics as staples first</a>`;
    area.innerHTML = `
      <div class="list-empty">
        <div class="list-empty__title">Your list is empty.</div>
        <div class="list-empty__cta">${cta}</div>
        <div class="list-empty__hint">Or tap the <strong>+</strong> to add an item.</div>
      </div>`;
    document.getElementById('emptyAddFromStaples')?.addEventListener('click', () => openStaplesSheet());
    document.getElementById('emptyOpenStaples')?.addEventListener('click', (e) => { e.preventDefault(); openStaplesSheet(); });
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

  // Compute distinct visible categories for header visibility rule
  const distinctCats = new Set(
    Object.values(unchecked).map(([, it]) => it.category || 'Other')
  );
  const multipleCategories = distinctCats.size >= 2;

  // Helper to normalize 'OTHER' and 'Other' as the same category
  const isOtherCategory = (cat) => cat.toUpperCase() === 'OTHER';

  let html = '';

  for (const cat of sortedCats) {
    // Category header renders only when:
    // 1. There are 2+ distinct visible categories, OR
    // 2. The single visible category is NOT 'Other'/'OTHER'
    const shouldShowHeader = multipleCategories || !isOtherCategory(cat);
    if (shouldShowHeader) {
      html += `<div class="shopping-category-label">${esc(cat)}</div>`;
    }
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

  // Fire-and-forget. Categorize uncategorized items in the background; render
  // updates naturally when Firebase pushes the new category values.
  healUncategorizedItems(activeListId, items).catch(err => console.warn('heal pass failed', err));
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

  await updateKitchenItem(activeListId, id, {
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
        await updateKitchenItem(activeListId, id, { checked: false, checkedAt: null });
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
  const klSaveBtn = document.getElementById('kl_save');
  klSaveBtn?.addEventListener('click', () => withButtonLock(klSaveBtn, async () => {
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
  }));
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
`);
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

  const kmSaveBtn = document.getElementById('km_save');
  kmSaveBtn?.addEventListener('click', () => withButtonLock(kmSaveBtn, async () => {
    const name = document.getElementById('km_name')?.value.trim();
    if (!name) return;
    const updated = { ...lists[activeListId], name, icon: currentEmoji, color: currentColor };
    await writeKitchenList(activeListId, updated);
    lists[activeListId] = updated;
    close();
    renderListsTab();
  }));

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

function openListActionsMenu() {
  if (!activeListId || !lists[activeListId]) return;
  const list = lists[activeListId];
  const mount = document.getElementById('sheetMount');
  mount.innerHTML = renderBottomSheet(`
    ${renderFormSheetHeader({ title: `${list.name} actions`, closeId: 'lam_close' })}
    <div class="lam-actions">
      <button class="lam-action" id="lam_newList" type="button">+ New list</button>
      <button class="lam-action" id="lam_staples" type="button">Add from staples</button>
      <button class="lam-action" id="lam_rename" type="button">Rename / change icon</button>
      <button class="lam-action" id="lam_copy" type="button">Copy as text</button>
      <button class="lam-action" id="lam_clear" type="button">Clear checked items</button>
      <div class="lam-divider"></div>
      <button class="lam-action lam-action--danger" id="lam_delete" type="button">Delete list</button>
    </div>
  `);
  activateSheet(mount);

  document.getElementById('lam_close')?.addEventListener('click', () => { mount.innerHTML = ''; });

  document.getElementById('lam_newList')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openCreateListSheet();
  });
  document.getElementById('lam_staples')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openStaplesSheet();
  });
  document.getElementById('lam_rename')?.addEventListener('click', () => {
    mount.innerHTML = '';
    openManageListSheet();
  });
  document.getElementById('lam_copy')?.addEventListener('click', () => {
    mount.innerHTML = '';
    copyListAsText();
  });
  document.getElementById('lam_clear')?.addEventListener('click', async () => {
    mount.innerHTML = '';
    const confirmed = await showConfirm({ title: 'Remove all checked items?', confirmLabel: 'Clear' });
    if (!confirmed) return;
    const checkedCards = document.querySelectorAll('.card--shopping.is-checked');
    const clearUpdates = {};
    for (const card of checkedCards) {
      clearUpdates[`kitchen/items/${activeListId}/${card.dataset.itemId}`] = null;
    }
    // One atomic write (K30) — per-item removes fired a full re-render each.
    if (Object.keys(clearUpdates).length > 0) await multiUpdate(clearUpdates);
  });
  document.getElementById('lam_delete')?.addEventListener('click', async () => {
    mount.innerHTML = '';
    const itemCount = Object.keys(currentItems || {}).length;
    const msg = itemCount > 0
      ? `Delete "${list.name}"? It has ${itemCount} item${itemCount !== 1 ? 's' : ''}.`
      : `Delete "${list.name}"?`;
    const confirmed = await showConfirm({ title: msg, confirmLabel: 'Delete', danger: true });
    if (!confirmed) return;
    await removeKitchenList(activeListId);
    delete lists[activeListId];
    activeListId = Object.keys(lists)[0] || null;
    if (activeListId) localStorage.setItem('dr-kitchen-active-list', activeListId);
    else localStorage.removeItem('dr-kitchen-active-list');
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

  const kiSaveBtn = document.getElementById('ki_save');
  kiSaveBtn?.addEventListener('click', () => withButtonLock(kiSaveBtn, async () => {
    const name = input?.value.trim();
    const qty = qtyInput?.value.trim() || null;
    if (!name || !activeListId) return;
    await writeKitchenItem(activeListId, id, { ...item, name, qty });
    close();
  }));

  const kiDeleteBtn = document.getElementById('ki_deleteBtn');
  kiDeleteBtn?.addEventListener('click', () => withButtonLock(kiDeleteBtn, async () => {
    const confirmed = await showConfirm({ title: `Remove "${item.name}"?`, confirmLabel: 'Remove', danger: true });
    if (!confirmed) return;
    await removeKitchenItem(activeListId, id);
    close();
  }));

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
        await removeKitchenStaple(id);
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

  const ksSaveBtn = document.getElementById('ks_save');
  ksSaveBtn?.addEventListener('click', () => withButtonLock(ksSaveBtn, async () => {
    const name = document.getElementById('ks_name')?.value.trim();
    if (!name) return;
    await updateKitchenStaple(id, { name });
    staples[id].name = name;
    mount.innerHTML = '';
    onDone?.();
    openStaplesSheet();
  }));

  const ksDeleteBtn = document.getElementById('ks_deleteBtn');
  ksDeleteBtn?.addEventListener('click', () => withButtonLock(ksDeleteBtn, async () => {
    const confirmed = await showConfirm({
      title: `Remove "${staple.name}" from staples?`,
      confirmLabel: 'Remove', danger: true,
    });
    if (!confirmed) return;
    await removeKitchenStaple(id);
    delete staples[id];
    mount.innerHTML = '';
    openStaplesSheet();
  }));
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
  // K9: a truncated/hallucinated-but-200 response simply omits items, and we
  // treated every omission as a merged duplicate. Real dedup rarely removes
  // a third of a list — bail rather than silently deleting groceries.
  if (removedIds.length > 2 && removedIds.length > unchecked.length * 0.3) {
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    showToast('Cleanup looked wrong — no changes made');
    return;
  }
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

const _healPassLog = new Map(); // listId → lastPassTimestamp

async function healUncategorizedItems(listId, items) {
  if (!listId || !items) return;
  const now = Date.now();
  const last = _healPassLog.get(listId) || 0;
  if (now - last < 60_000) return; // debounce: max one pass per minute per list
  _healPassLog.set(listId, now);

  // Find items that need re-categorization. Skip checked items (don't waste
  // Worker calls on completed groceries). 'Other' is a legitimate persisted
  // answer (K19) — only null/empty categories are truly uncategorized;
  // legacy 'OTHER' (uppercase) marks pre-categorization items and still heals.
  const candidates = Object.entries(items)
    .filter(([, it]) => it && it.name && !it.checked)
    .filter(([, it]) => !it.category || it.category === '' || it.category === 'OTHER')
    .slice(0, 10);

  if (candidates.length === 0) return;

  for (const [itemId, item] of candidates) {
    // categorizeItem already silently writes to Firebase; no toast/UI noise.
    await categorizeItem(listId, itemId, item.name).catch(() => { /* keep current category */ });
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
    if (!category) return;
    // K19: persist 'Other' too — refusing to write it made genuinely-Other
    // items re-enter the heal pass every 60s forever (1 Worker call/item/min).
    await updateKitchenItem(listId, itemId, { category });
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
    if (!category) return;
    await updateKitchenStaple(stapleId, { category });
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
