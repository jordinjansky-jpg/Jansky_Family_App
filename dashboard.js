import { initFirebase, isFirstRun, readSettings, readPeople, readTasks, readCategories, readAllSchedule, readEvents, writeCompletion, removeCompletion, writeTask, pushTask, pushEvent, writeEvent, removeEvent, writePerson, onConnectionChange, onValue, onCompletions, onEvents, onScheduleDay, onMultipliers, readOnce, multiUpdate, onAllMessages, writeMessage, markMessageSeen, removeMessage, writeBankToken, markBankTokenUsed, readBank, readRewards, removeData, writeMultiplier, removeMessagesByEntryKey, removeLatestBankToken, readKitchenPlan, readKitchenRecipes, writeKitchenPlanSlot, removeKitchenPlanSlot, pushKitchenRecipe, writeKitchenRecipe, removeKitchenRecipe } from './shared/firebase.js';
import { renderNavBar, renderHeader, renderEmptyState, renderPersonFilter, renderProgressBar, renderTaskCard, renderTimeHeader, renderOverdueBanner, renderCelebration, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderQuickAddSheet, renderEditTaskSheet, renderEventBubble, renderEventDetailSheet, renderEventForm, renderAddMenu, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm, applyDataColors, renderBanner, renderFab, renderSectionHead, renderOverflowMenu, renderFilterChip, renderPersonFilterSheet, renderDashboardSkeleton, renderAmbientStrip, renderComingUp, renderMealDetailSheet, renderMealEditorSheet, renderMealManageSheet, renderWeatherSheet, renderRepeatSheet } from './shared/components.js';
import { fetchWeather, fetchForecast } from './shared/weather.js';
import { initOwnerChips, getSelectedOwners } from './shared/dom-helpers.js';
import { resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet } from './shared/ai-helpers.js';
import { applyTheme, loadCachedTheme, defaultThemeConfig, resolveTheme } from './shared/theme.js';
import { todayKey, addDays, formatDateLong, formatDateShort, DAY_NAMES, dayOfWeek, escapeHtml, debounce } from './shared/utils.js';
const esc = (s) => escapeHtml(String(s ?? ''));
const KITCHEN_WORKER_URL = 'https://kitchen-import.jordin-jansky.workers.dev';
import { isComplete, filterByPerson, filterEventsByPerson, getEventsForDate, getEventsForRange, sortEvents, groupByFrequency, dayProgress, getOverdueEntries, getOverdueCooldownTaskIds, isAllDone, sortEntries } from './shared/state.js';
import { basePoints, dailyScore, dailyPossible, gradeDisplay, computeRollover } from './shared/scoring.js';
import { buildScheduleUpdates, getRotationOwner, rebuildSingleTaskSchedule } from './shared/scheduler.js';


// ── Cached theme (device override > family cache > default) ──
applyTheme(resolveTheme());

// Paint the skeleton immediately, before any async Firebase call.
// First paint is now <50ms; skeleton resolves into real content on first render().
{
  const earlyMain = document.getElementById('mainContent');
  if (earlyMain) earlyMain.innerHTML = renderDashboardSkeleton();
}

// ── Init Firebase ──
initFirebase();
const firstRun = await isFirstRun();
if (firstRun) { window.location.href = 'setup.html'; }

// ── Load core data ──
const [settings, peopleObj, tasksObj, catsObj, eventsObj] = await Promise.all([
  readSettings(), readPeople(), readTasks(), readCategories(), readEvents()
]);

// Apply family theme from Firebase only if no device override
if (settings?.theme) applyTheme(resolveTheme(settings.theme));
// Cache app name for instant title on next load (used by inline script)
if (settings?.appName) localStorage.setItem('dr-app-name', settings.appName);

const tz = settings?.timezone || 'America/Chicago';
const today = todayKey(tz);
const people = peopleObj ? Object.entries(peopleObj).map(([id, p]) => ({ id, ...p })) : [];
const tasks = tasksObj || {};
const cats = catsObj || {};
let events = eventsObj || {};
const rewardsData = await readRewards() || {};
let recipes = (await readKitchenRecipes()) || {};
let viewMeals = (await readKitchenPlan(today)) || {};
let activePressTimer = null;
let pendingSliderOverride = null; // { entryKey, value } — set by slider, consumed by toggleTask/closeSheet

// ── Person link mode (?person=Name) ──
const personParam = new URLSearchParams(window.location.search).get('person');
const linkedPerson = personParam
  ? people.find(p => p.name.toLowerCase() === personParam.toLowerCase())
  : null;

// Show error if person param given but not found
if (personParam && !linkedPerson) {
  const errMain = document.getElementById('mainContent');
  errMain.innerHTML = `
    <div class="error-placeholder">
      <div class="error-placeholder__icon">🤔</div>
      <h2 class="error-placeholder__title">Who's ${esc(personParam)}?</h2>
      <p class="error-placeholder__body">We couldn't find anyone with that name.<br>Check the link or ask an admin.</p>
      <a href="index.html" class="btn btn--secondary mt-md">Go to Dashboard</a>
    </div>`;
  // Skip rest of init — error message is displayed
} else {

// Apply person's saved theme from Firebase (overrides family theme)
if (linkedPerson?.theme?.preset) {
  applyTheme(linkedPerson.theme);
}

// ── App state ──
let viewDate = today;     // currently viewed date
// Restore saved filter from Firebase for person link (prefs.dashboard > legacy savedFilter)
let activePerson = linkedPerson
  ? (linkedPerson.prefs?.dashboard?.personFilter !== undefined ? linkedPerson.prefs.dashboard.personFilter
    : linkedPerson.savedFilter !== undefined ? linkedPerson.savedFilter : null)
  : null;
let completions = {};
let viewEntries = {};     // entries for viewDate
let overdueItems = [];
let multipliers = {};
let suppressedCooldownTaskIds = new Set();
let celebrationShown = false;
let lastRenderedIsToday = true; // tracks viewDate==today across renders so Back-to-Today pill only animates on the transition away from today, not on passive re-renders
let lastWeatherData = null; // set in render(); read by ambient chip tap handler
let renderInFlight = false; // prevents concurrent renders when fetchWeather is awaited

// ── Person link title (uses app name from Firebase settings) ──
if (linkedPerson) document.title = `${esc(linkedPerson.name)}'s ${settings?.appName || 'Daily Rundown'}`;

// ── Header & Nav ──
function buildHeaderOverflow() {
  const items = [];
  items.push({ id: 'calendar', label: 'Calendar' });
  items.push({ id: 'admin', label: 'Admin' });
  items.push({ id: 'kitchen', label: 'Kitchen' });
  items.push({ id: 'theme', label: 'Theme' });
  if (localStorage.getItem('dr-debug') === 'true') {
    items.push({ id: 'debug', label: 'Debug (turn off)' });
  }
  return items.sort((a, b) => a.label.localeCompare(b.label));
}

function openOverflowOrMoreSheet() {
  const items = buildHeaderOverflow();
  if (items.length === 0) return;
  taskSheetMount.innerHTML = renderBottomSheet(
    `<h3 class="sheet-section-title">More</h3>${renderOverflowMenu(items)}`
  );
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });
  taskSheetMount.querySelector('.overflow-menu')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-item-id]');
    if (!btn) return;
    const itemId = btn.dataset.itemId;
    closeTaskSheet();
    setTimeout(() => {
      if (itemId === 'calendar') {
        location.href = 'calendar.html';
      } else if (itemId === 'admin') {
        location.href = 'admin.html';
      } else if (itemId === 'kitchen') {
        location.href = 'kitchen.html';
      } else if (itemId === 'theme') {
        openDeviceThemeSheet(
          document.getElementById('taskSheetMount'),
          settings?.theme,
          linkedPerson ? () => render() : undefined,
          linkedPerson ? { person: linkedPerson, writePerson } : undefined
        );
      } else if (itemId === 'debug') {
        localStorage.setItem('dr-debug', 'false');
        render();
      }
    }, 320);
  });
}

function wireHeaderActions() {
  document.getElementById('headerOverflow')?.addEventListener('click', openOverflowOrMoreSheet);
}

function openMoreSheet() { openOverflowOrMoreSheet(); }
function openAddMenuFromFab() { openAddMenu?.(); }

function renderHeaderMount() {
  const title = linkedPerson ? linkedPerson.name : 'Home';
  const subtitle = formatDateLong(viewDate);
  document.getElementById('headerMount').innerHTML = renderHeader({
    title,
    subtitle,
    showBell: true,
    overflowItems: buildHeaderOverflow()
  });
  applyDataColors(document.getElementById('headerMount'));
  wireHeaderActions();
  updateHeaderSubtitle();
}
renderHeaderMount();

function updateHeaderSubtitle() {
  const el = document.querySelector('.app-header__subtitle');
  if (!el) return;
  const longText = formatDateLong(viewDate);
  const shortText = formatDateShort(viewDate);
  el.innerHTML = `<span class="app-header__subtitle-long">${esc(longText)}</span><span class="app-header__subtitle-short">${esc(shortText)}</span>`;
}

function getTodayFilterChipHtml() {
  if (people.length < 2) return '';
  const activePersonObj = activePerson ? people.find(p => p.id === activePerson) : null;
  return renderFilterChip({
    id: 'openFilterSheet',
    activePersonName: activePersonObj?.name || '',
    activePersonColor: activePersonObj?.color || '',
  });
}

// 5-tab bottom nav with More → openMoreSheet
document.getElementById('navMount').innerHTML = renderNavBar('home', { onMoreClick: true });
document.getElementById('navMore')?.addEventListener('click', () => openMoreSheet());

// FAB (primary add action)
document.getElementById('fabMount').innerHTML = renderFab({ id: 'fabAdd', label: 'Add' });
document.getElementById('fabAdd')?.addEventListener('click', () => openAddMenuFromFab());

// ── Connection status + Offline/Online banner ──
let __isOffline = false;
initOfflineBanner(onConnectionChange);
// Offline state feeds the banner queue (spec §3.2 --info offline sub-variant).
// Existing initOfflineBanner above keeps the connection dot + transient toast;
// this listener routes the persistent offline state through the priority queue.
onConnectionChange((connected) => {
  __isOffline = !connected;
  // If the dashboard has rendered, refresh the banner mount.
  if (document.getElementById('bannerMount')) {
    const overdueActive = overdueItems.filter(e => !isComplete(e.entryKey, completions));
    const overdueFiltered = activePerson
      ? overdueActive.filter(e => e.ownerId === activePerson)
      : overdueActive;
    mountBannerQueue({ overdueItems: overdueFiltered });
  }
});

// ── Notification bell ──
initBell(() => people, () => rewardsData, onAllMessages, { writeMessageFn: writeMessage, markMessageSeenFn: markMessageSeen, removeMessageFn: removeMessage, writeBankTokenFn: writeBankToken, markBankTokenUsedFn: markBankTokenUsed, readBankFn: readBank, writeMultiplierFn: writeMultiplier, getTodayFn: () => today, approverName: linkedPerson?.name || null });

// Skeleton is replaced by render() below; no show/hide needed.
const main = document.getElementById('mainContent');

// ── Celebration mount ──
document.getElementById('celebrationMount').innerHTML = renderCelebration();
applyDataColors(document.getElementById('celebrationMount'));

// ══════════════════════════════════════════
// Render the dashboard
// ══════════════════════════════════════════

// loadData only loads overdue items (completions and schedule/{viewDate} come from listeners)
async function loadData() {
  const allSched = await readAllSchedule();
  overdueItems = getOverdueEntries(allSched || {}, completions, today, tasks);
  suppressedCooldownTaskIds = getOverdueCooldownTaskIds(allSched || {}, completions, tasks, today);
}

async function render() {
  if (renderInFlight) return;
  renderInFlight = true;
  try {
  clearTimeout(activePressTimer);
  activePressTimer = null;
  // Filter out event schedule entries (type: 'event') — real events come from events collection
  let displayEntries = {};
  for (const [key, entry] of Object.entries(viewEntries)) {
    if (entry.type === 'event') continue;
    if (suppressedCooldownTaskIds.size > 0 && viewDate > today && suppressedCooldownTaskIds.has(entry.taskId)) continue;
    displayEntries[key] = entry;
  }
  const filtered = filterByPerson(displayEntries, activePerson);

  // Get events for current date from events collection
  let dayEvents = getEventsForDate(events, viewDate);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);
  const prog = dayProgress(filtered, completions);
  const isToday = viewDate === today;
  const isFuture = viewDate > today;
  const overdueActive = overdueItems.filter(e => !isComplete(e.entryKey, completions));
  const overdueFiltered = activePerson
    ? overdueActive.filter(e => e.ownerId === activePerson)
    : overdueActive;

  // Compute daily score for filtered entries
  const score = dailyScore(filtered, completions, tasks, cats, settings, viewDate, today);
  const gd = gradeDisplay(score.percentage);

  // Compute total task time for filtered entries
  let totalMinutes = 0;
  for (const [key, entry] of Object.entries(filtered)) {
    const task = tasks[entry.taskId];
    if (task?.estMin) totalMinutes += task.estMin;
  }
  const timeH = Math.floor(totalMinutes / 60);
  const timeM = totalMinutes % 60;
  const timeLabel = timeH > 0 ? `${timeH}h${timeM > 0 ? ' ' + String(timeM).padStart(2, '0') + 'm' : ''}` : `${timeM}m`;

  let html = '';

  // === DASHBOARD RENDER ORDER (spec 2026-04-25 §2.1) ===
  // Hard order, top to bottom:
  //   1. #bannerMount                     (single banner, queued)
  //   2. .back-to-today                   (when viewDate !== today)
  //   3. .ambient-row                     (Task 7 — gated on settings.ambientStrip)
  //   4. .coming-up                       (Task 8 — 7-day rail)
  //   5. .section--events                 (when events present)
  //   6. .section--today                  (always)
  //   7. .debug-panel                     (when debug enabled)
  // Anything inserted here must respect that order. The pill anchors
  // to position 2 regardless of which sections below it are populated.
  html += `<div id="bannerMount"></div>`;

  // Back-to-Today pill (non-today only). Animate only on the transition away
  // from today — not on every Firebase-driven re-render of the same past day.
  if (!isToday) {
    const isEntering = lastRenderedIsToday;
    const wrapperCls = isEntering ? 'back-to-today is-entering' : 'back-to-today';
    const chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
    html += `<div class="${wrapperCls}">
      <button class="btn btn--secondary btn--sm back-to-today__btn" id="goToday" type="button">
        <span class="back-to-today__chevron" aria-hidden="true">${chevronSvg}</span>
        <span>Back to Today</span>
      </button>
    </div>`;
  }
  lastRenderedIsToday = isToday;

  // === Ambient strip (spec §3.3) ===
  // Gated on settings.ambientStrip; renders zero pixels until 1.3 + 1.4 wire data.
  // Both chips render with nudge copy when their data source is absent.
  if (settings?.ambientStrip ?? true) {
    // Both data sources are nullable; component handles empty-state internally.
    const weatherData = await fetchWeather(viewDate, settings);
    lastWeatherData = weatherData;
    const dinnerPlan = viewMeals?.dinner;
    const dinnerEntry = dinnerPlan?.recipeId ? recipes[dinnerPlan.recipeId] : null;
    const dinnerName = dinnerEntry?.name || dinnerPlan?.customName || null;
    const dinnerData = dinnerName ? { name: dinnerName, source: dinnerPlan?.source } : null;
    html += renderAmbientStrip({ weather: weatherData, dinner: dinnerData });
  }

  // === Coming up rail (spec §3.4) ===
  {
    const comingUpExpanded = localStorage.getItem('dr-coming-up-state') === 'expanded';
    const cuStart = addDays(today, 1);
    const cuEnd = addDays(today, 7);
    const cuInRange = getEventsForRange(events, cuStart, cuEnd);
    const cuFiltered = filterEventsByPerson(cuInRange, activePerson);
    // Group by date.
    const cuByDate = {};
    for (const [id, ev] of Object.entries(cuFiltered)) {
      if (!cuByDate[ev.date]) cuByDate[ev.date] = [];
      cuByDate[ev.date].push([id, ev]);
    }
    // Build sorted day-blocks.
    const cuDayKeys = Object.keys(cuByDate).sort();
    const cuDays = cuDayKeys.map(dk => {
      const dt = new Date(dk + 'T00:00:00');
      return {
        dateKey: dk,
        dayLabel: {
          dow: DAY_NAMES[dt.getDay()].slice(0, 3),
          monthDay: dt.toLocaleString('en-US', { month: 'short', day: 'numeric' })
        },
        events: cuByDate[dk].sort((a, b) => {
          const [, ea] = a, [, eb] = b;
          if (ea.allDay && !eb.allDay) return -1;
          if (!ea.allDay && eb.allDay) return 1;
          return (ea.startTime || '').localeCompare(eb.startTime || '');
        })
      };
    });
    // Summary copy (events-only count).
    const cuTotalEvents = Object.keys(cuFiltered).length;
    const cuFilterPersonName = activePerson
      ? (people.find(p => p.id === activePerson)?.name || '')
      : '';
    let cuSummary;
    if (cuTotalEvents === 0) {
      cuSummary = cuFilterPersonName ? `clear week for ${cuFilterPersonName}` : 'clear week';
    } else {
      const cuNoun = cuTotalEvents === 1 ? 'event' : 'events';
      cuSummary = cuFilterPersonName
        ? `${cuTotalEvents} ${cuNoun} for ${cuFilterPersonName} this week`
        : `${cuTotalEvents} ${cuNoun} this week`;
    }
    html += renderComingUp({
      days: cuDays,
      isExpanded: comingUpExpanded,
      summary: cuSummary,
      filterPersonName: cuFilterPersonName
    });
  }

  let firstSectionRendered = false;

  // Events section
  if (sortedEvents.length > 0) {
    html += `<section class="section">`;
    html += renderSectionHead('Events', null, { divider: firstSectionRendered });
    firstSectionRendered = true;
    for (const [eventId, event] of sortedEvents) {
      html += renderEventBubble(eventId, event, people);
    }
    html += `</section>`;
  }

  // Today section — flat list, incomplete first then completed
  const totalCount = prog.total;
  const doneCount = prog.done;
  const todaySectionCls = activePerson ? 'section section--filtered' : 'section';
  if (totalCount === 0 && sortedEvents.length === 0) {
    html += `<section class="${todaySectionCls}">`;
    html += renderSectionHead('Today', null, {
      divider: firstSectionRendered,
      trailingHtml: getTodayFilterChipHtml(),
    });
    firstSectionRendered = true;
    if (activePerson) {
      html += renderEmptyState('', '', '', { variant: 'no-match', personName: people.find(p => p.id === activePerson)?.name });
    } else {
      html += `<div class="empty empty--calm">
        <div class="empty__title">${isToday ? 'Nothing on the list' : 'No tasks scheduled'}</div>
        <div class="empty__message">${isToday ? 'Enjoy your day.' : ''}</div>
      </div>`;
    }
    html += `</section>`;
  } else if (totalCount > 0) {
    // === Today section meta (spec §3.7) ===
    // Family view: "X of Y done"
    // Filtered to person: "X of Y done · NN pt · GRADE" (NN = today's pt, store-economy)
    const isFiltered = !!activePerson && people.length >= 2;
    const doneVerb = (doneCount === totalCount) ? 'All done' : `${doneCount} of ${totalCount} done`;
    const futureVerb = (doneCount === 0 && isFuture) ? `0 of ${totalCount} scheduled` : null;
    const metaPieces = [futureVerb || doneVerb];

    if (isFiltered && !isFuture) {
      // Today's earned pt (store-economy): percentage × multiplier; cap not enforced
      // (multiplier days legitimately push past 100). Computed live; matches the
      // snapshot value at midnight.
      const todayMul = (multipliers?.[today]?.[activePerson]?.multiplier
                        ?? multipliers?.[today]?.all?.multiplier
                        ?? 1);
      const earnedPt = Math.round(score.percentage * todayMul);
      metaPieces.push(`${earnedPt} pt`);
      metaPieces.push(`<span class="section__meta__grade">${esc(gd.grade)}</span>`);
    }

    const metaHtmlPieces = metaPieces.map((p, i) => {
      if (i === 0) return esc(p);
      const isHtml = p.startsWith('<');
      return `<span class="section__meta__dot" aria-hidden="true"></span>${isHtml ? p : esc(p)}`;
    });
    const metaHtmlStr = metaHtmlPieces.join('');

    html += `<section class="${todaySectionCls}">`;
    html += renderSectionHead('Today', null, {
      divider: firstSectionRendered,
      trailingHtml: getTodayFilterChipHtml(),
      metaHtml: metaHtmlStr,
    });
    firstSectionRendered = true;

    // Sort all entries together with the new sort rule (incomplete before complete,
    // owner -> late-today-first -> TOD -> name).
    const sortedAll = sortEntries(filtered, completions, tasks, people, today);
    for (const [entryKey, entry] of sortedAll) {
      const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
      const person = people.find(p => p.id === entry.ownerId);
      const cat = task.category ? cats[task.category] : null;
      const pts = score.pointsMap[entryKey] || basePoints(task, settings?.difficultyMultipliers);
      const ovr = completions[entryKey]?.pointsOverride ?? entry.pointsOverride ?? null;
      const done = isComplete(entryKey, completions);
      html += renderTaskCard({
        entryKey,
        entry: { ...entry, dateKey: viewDate },
        task,
        person,
        category: cat,
        completed: done,
        overdue: false,
        points: { possible: pts, override: ovr },
        isEvent: !!cat?.isEvent,
        showTodIconBoth: !!settings?.showTodIconBoth,
        showTodIconSingle: !!settings?.showTodIconSingle,
        isPastDaily: !done && viewDate < today && entry.rotationType === 'daily'
      });
    }
    html += `</section>`;
  }

  // Debug overlay
  if (localStorage.getItem('dr-debug') === 'true') {
    html += renderDebugPanel(filtered, score);
  }

  main.innerHTML = html;
  applyDataColors(main);
  bindEvents();

  // Mount banner queue (priority: vacation > freeze > overdue > multiplier > info).
  mountBannerQueue({ overdueItems: overdueFiltered });
  } finally {
    renderInFlight = false;
  }
}

// Banner queue — priority: vacation > freeze > overdue > multiplier > info-activity > info-offline.
// Phase 1 + 1.5 wired overdue + multiplier; this rev adds vacation, freeze,
// running-activity (dead until 1.6/2.4 ship), and pre-existing offline as
// a banner sub-use. (Spec 2026-04-25 §3.2.)
function resolveBanner(overdueIncomplete, isOffline) {
  // 1. Vacation (dead until 2.4 wires people[].away[]; resolver branch present so
  // the data hookup is one-line in that PR).
  if (typeof window !== 'undefined' && window.__activeVacation) {
    const v = window.__activeVacation; // { personName, endDate, isLinkedPerson? }
    return {
      variant: 'vacation',
      title: `${v.personName} is away until ${v.endDate}`,
      message: undefined,
      action: v.isLinkedPerson ? { label: 'End early', onClick: () => window.__endVacationEarly?.() } : undefined
    };
  }
  // 2. Freeze (future feature; placeholder data hook).
  if (typeof window !== 'undefined' && window.__scheduleFrozen) {
    return { variant: 'freeze', title: 'Schedule frozen', message: undefined };
  }
  // 3. Overdue.
  if (overdueIncomplete.length > 0) {
    const n = overdueIncomplete.length;
    return {
      variant: 'overdue',
      title: `${n} overdue ${n === 1 ? 'task' : 'tasks'}`,
      message: 'Tap to review.',
      action: { label: 'Review', onClick: () => openOverdueSheet(overdueIncomplete) },
      bodyClickable: true,
      onBodyClick: () => openOverdueSheet(overdueIncomplete)
    };
  }
  // 4. Multiplier.
  const todayMultipliers = multipliers?.[today] || {};
  const scope = activePerson || 'all';
  const m = todayMultipliers[scope] || todayMultipliers.all;
  if (m && Number(m.multiplier) !== 1) {
    const n = Number(m.multiplier);
    const label = n === 2 ? 'Double-points day' : `${n}× points today`;
    const msg = m.note || `All tasks count ${n}× until midnight.`;
    return { variant: 'multiplier', title: label, message: msg };
  }
  // 5. Info — running activity (dead until 1.6).
  if (typeof window !== 'undefined' && window.__activeActivitySession) {
    const s = window.__activeActivitySession; // { name, elapsed: 'mm:ss' }
    return {
      variant: 'info',
      title: `${s.name} · ${s.elapsed}`,
      message: undefined,
      action: { label: 'Stop', onClick: () => window.__stopActivitySession?.() }
    };
  }
  // 6. Info — offline (live).
  if (isOffline) {
    return { variant: 'info', title: 'Offline', message: 'Changes will sync when you reconnect.' };
  }
  return null;
}

function mountBannerQueue({ overdueItems: overdueIncomplete }) {
  const mount = document.getElementById('bannerMount');
  if (!mount) return;
  const b = resolveBanner(overdueIncomplete, __isOffline);
  if (!b) { mount.innerHTML = ''; return; }
  mount.innerHTML = renderBanner(b.variant, {
    title: b.title,
    message: b.message,
    action: b.action ? { label: b.action.label } : undefined,
    bodyClickable: !!b.bodyClickable
  });
  if (b.action) {
    mount.querySelector('[data-banner-action]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      b.action.onClick?.();
    });
  }
  if (b.bodyClickable && b.onBodyClick) {
    mount.querySelector('[data-banner-body]')?.addEventListener('click', b.onBodyClick);
  }
}

function openOverdueSheet(items) {
  const cards = items.map(e => {
    const task = tasks[e.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
    const person = people.find(p => p.id === e.ownerId);
    const cat = task.category ? cats[task.category] : null;
    const pts = basePoints(task, settings?.difficultyMultipliers);
    return renderTaskCard({
      entryKey: e.entryKey,
      entry: { ...e, dateKey: e.dateKey },
      task,
      person,
      category: cat,
      completed: false,
      overdue: true,
      points: { possible: pts, override: e.pointsOverride ?? null },
      isEvent: !!cat?.isEvent,
      showTodIconBoth: !!settings?.showTodIconBoth,
      showTodIconSingle: !!settings?.showTodIconSingle,
      isPastDaily: false
    });
  }).join('');
  const body = `<h3 class="sheet-section-title">Overdue tasks</h3>${cards || '<div class="empty empty--calm"><div class="empty__message">Nothing overdue.</div></div>'}`;
  taskSheetMount.innerHTML = renderBottomSheet(body);
  applyDataColors(taskSheetMount);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });
  taskSheetMount.querySelectorAll('.task-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const ek = btn.dataset.entryKey;
      const dk = btn.dataset.dateKey;
      closeTaskSheet();
      setTimeout(() => openTaskSheet(ek, dk), 320);
    });
  });
}

function openPersonFilterSheet() {
  const body = `<h3 class="sheet-section-title">Show tasks for</h3>${renderPersonFilterSheet(people, activePerson)}`;
  taskSheetMount.innerHTML = renderBottomSheet(body);
  applyDataColors(taskSheetMount);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });
  taskSheetMount.querySelector('.list-group')?.addEventListener('click', async (ev) => {
    const row = ev.target.closest('[data-person-id]');
    if (!row) return;
    const personId = row.dataset.personId || null;
    activePerson = personId;
    if (linkedPerson) {
      const prefs = { ...(linkedPerson.prefs || {}), dashboard: { personFilter: activePerson } };
      linkedPerson.prefs = prefs;
      linkedPerson.savedFilter = activePerson || null;
      const { id, ...data } = linkedPerson;
      await writePerson(id, data);
    }
    celebrationShown = false;
    closeTaskSheet();
  });
}

function renderDebugPanel(filtered, score) {
  let dbg = `<div class="debug-panel">`;
  dbg += `<div class="debug-panel__title">🐛 Debug — Day Score</div>`;
  dbg += `<pre class="debug-panel__pre">`;
  dbg += `Date: ${viewDate} | Person filter: ${activePerson || 'All'}\n`;
  dbg += `Score: ${score.earned}/${score.possible} = ${score.percentage}%\n`;
  dbg += `Grade: ${gradeDisplay(score.percentage).grade}\n\n`;
  dbg += `Entry Key | Task | Base Pts | Earned | Override | Status\n`;
  dbg += `${'—'.repeat(70)}\n`;

  for (const [entryKey, entry] of Object.entries(filtered)) {
    const task = tasks[entry.taskId] || { name: '?', difficulty: 'medium', estMin: 0 };
    const bp = basePoints(task, settings?.difficultyMultipliers);
    const comp = completions[entryKey];
    const earned = score.pointsMap?.[entryKey] || 0;
    const ovr = comp?.pointsOverride ?? '—';
    const status = comp ? 'done' : 'pending';
    dbg += `${entryKey.slice(0, 16)} | ${esc(task.name).slice(0, 20).padEnd(20)} | ${String(bp).padStart(4)} | ${String(earned).padStart(6)} | ${String(ovr).padStart(8)} | ${status}\n`;
  }

  dbg += `</pre>`;
  dbg += `<button class="btn btn--ghost btn--sm" id="copyDebug" type="button">Copy to Clipboard</button>`;
  dbg += `</div>`;
  return dbg;
}

// ══════════════════════════════════════════
// Event binding
// ══════════════════════════════════════════

function bindEvents() {
  // "Back to Today" pill
  document.getElementById('goToday')?.addEventListener('click', async () => {
    viewDate = today;
    celebrationShown = false;
    updateHeaderSubtitle();
    subscribeSchedule(viewDate);
    viewMeals = (await readKitchenPlan(viewDate)) || {};
    await loadData();
  });

  // Task card: tap to toggle, long-press to open detail sheet
  // Movement threshold (px) — cancel long-press if finger moves more than this (scroll detection)
  const PRESS_MOVE_THRESHOLD = 10;
  main.querySelectorAll('.task-card').forEach(btn => {
    let didLongPress = false;
    let startX = 0, startY = 0;

    const startPress = (e) => {
      didLongPress = false;
      startX = e.clientX; startY = e.clientY;
      clearTimeout(activePressTimer);
      activePressTimer = setTimeout(() => {
        didLongPress = true;
        activePressTimer = null;
        openTaskSheet(btn.dataset.entryKey, btn.dataset.dateKey);
      }, settings?.longPressMs ?? 800);
    };

    const movePress = (e) => {
      if (activePressTimer && (Math.abs(e.clientX - startX) > PRESS_MOVE_THRESHOLD || Math.abs(e.clientY - startY) > PRESS_MOVE_THRESHOLD)) {
        clearTimeout(activePressTimer); activePressTimer = null;
      }
    };

    const endPress = (e) => {
      clearTimeout(activePressTimer);
      activePressTimer = null;
      if (!didLongPress) {
        // Block tap on past incomplete daily tasks — must use detail sheet
        const ek = btn.dataset.entryKey;
        const dk = btn.dataset.dateKey || viewDate;
        const entry = viewEntries[ek] || overdueItems.find(o => o.entryKey === ek);
        if (entry && dk < today && entry.rotationType === 'daily' && !isComplete(ek, completions)) {
          openTaskSheet(ek, dk);
          return;
        }
        toggleTask(ek, dk);
      }
    };

    const cancelPress = () => { clearTimeout(activePressTimer); activePressTimer = null; };

    btn.addEventListener('pointerdown', startPress);
    btn.addEventListener('pointermove', movePress);
    btn.addEventListener('pointerup', endPress);
    btn.addEventListener('pointerleave', cancelPress);
    btn.addEventListener('pointercancel', cancelPress);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Ambient chips — tap = recipe/plan, long-press = manage (edit/change/remove)
  main.querySelectorAll('.ambient-chip').forEach(chip => {
    let didLongPress = false;
    let pressTimer = null;
    let startX = 0, startY = 0;

    chip.addEventListener('pointerdown', e => {
      didLongPress = false;
      startX = e.clientX; startY = e.clientY;
      const which = chip.dataset.chip;
      if (which !== 'dinner') return;
      const dinnerPlan = viewMeals?.dinner;
      if (!dinnerPlan?.recipeId && !dinnerPlan?.customName) return;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        pressTimer = null;
        openMealManageSheet(dinnerPlan, 'dinner');
      }, settings?.longPressMs ?? 800);
    });

    chip.addEventListener('pointermove', e => {
      if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
        clearTimeout(pressTimer); pressTimer = null;
      }
    });

    chip.addEventListener('pointerup', () => { clearTimeout(pressTimer); pressTimer = null; });
    chip.addEventListener('pointercancel', () => { clearTimeout(pressTimer); pressTimer = null; });
    chip.addEventListener('contextmenu', e => e.preventDefault());

    chip.addEventListener('click', async () => {
      if (didLongPress) { didLongPress = false; return; }
      const which = chip.dataset.chip;
      if (which === 'dinner') {
        const dinnerPlan = viewMeals?.dinner;
        if (dinnerPlan?.recipeId || dinnerPlan?.customName) {
          openMealDetailSheet(dinnerPlan, 'dinner');
        } else {
          openMealPlanSheet('dinner');
        }
      }
      if (which === 'weather') {
        if (!settings?.weatherLocation || !settings?.weatherApiKey) {
          location.href = 'admin.html';
          return;
        }
        if (lastWeatherData?.isPast || lastWeatherData?.isFuture) return;

        const tomorrowK = addDays(today, 1);

        taskSheetMount.innerHTML = renderWeatherSheet(
          await fetchForecast(settings),
          today,
          tomorrowK
        );
        requestAnimationFrame(() => {
          document.getElementById('bottomSheet')?.classList.add('active');
        });
        document.getElementById('bottomSheet')?.addEventListener('click', e => {
          if (e.target === document.getElementById('bottomSheet')) closeTaskSheet();
        });
        document.getElementById('weatherSheetClose')?.addEventListener('click', closeTaskSheet);
      }
    });
  });

  // Coming up rail (Task 8)
  const comingUpEl = main.querySelector('.coming-up');
  if (comingUpEl) {
    document.getElementById('comingUpToggle')?.addEventListener('click', () => {
      const isExpanded = comingUpEl.dataset.expanded === 'true';
      const next = !isExpanded;
      comingUpEl.dataset.expanded = next ? 'true' : 'false';
      document.getElementById('comingUpToggle')?.setAttribute('aria-expanded', next ? 'true' : 'false');
      const blocks = document.getElementById('comingUpBlocks');
      if (blocks) blocks.hidden = !next;
      localStorage.setItem('dr-coming-up-state', next ? 'expanded' : 'collapsed');
    });
    comingUpEl.querySelectorAll('.cal-day-block__head').forEach(btn => {
      btn.addEventListener('click', async () => {
        const date = btn.dataset.date;
        if (!date) return;
        viewDate = date;
        celebrationShown = false;
        updateHeaderSubtitle();
        subscribeSchedule(viewDate);
        viewMeals = (await readKitchenPlan(viewDate)) || {};
        await loadData();
      });
    });
    comingUpEl.querySelectorAll('.event-row').forEach(btn => {
      let pressTimer = null, didLong = false, sx = 0, sy = 0;
      btn.addEventListener('pointerdown', e => {
        didLong = false; sx = e.clientX; sy = e.clientY;
        pressTimer = setTimeout(() => { didLong = true; pressTimer = null; openEventDetailSheet(btn.dataset.eventId); }, settings?.longPressMs ?? 800);
      });
      btn.addEventListener('pointermove', e => {
        if (pressTimer && (Math.abs(e.clientX - sx) > PRESS_MOVE_THRESHOLD || Math.abs(e.clientY - sy) > PRESS_MOVE_THRESHOLD)) { clearTimeout(pressTimer); pressTimer = null; }
      });
      btn.addEventListener('pointerup', () => { clearTimeout(pressTimer); pressTimer = null; if (!didLong) openEventDetailSheet(btn.dataset.eventId); });
      btn.addEventListener('pointerleave', () => { clearTimeout(pressTimer); pressTimer = null; });
      btn.addEventListener('pointercancel', () => { clearTimeout(pressTimer); pressTimer = null; });
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  // Event bubbles — tap or long-press to open detail sheet
  main.querySelectorAll('.event-bubble[data-event-id]').forEach(btn => {
    let pressTimer = null, didLong = false, sx = 0, sy = 0;
    btn.addEventListener('pointerdown', e => {
      didLong = false; sx = e.clientX; sy = e.clientY;
      pressTimer = setTimeout(() => { didLong = true; pressTimer = null; openEventDetailSheet(btn.dataset.eventId); }, settings?.longPressMs ?? 800);
    });
    btn.addEventListener('pointermove', e => {
      if (pressTimer && (Math.abs(e.clientX - sx) > PRESS_MOVE_THRESHOLD || Math.abs(e.clientY - sy) > PRESS_MOVE_THRESHOLD)) { clearTimeout(pressTimer); pressTimer = null; }
    });
    btn.addEventListener('pointerup', () => { clearTimeout(pressTimer); pressTimer = null; if (!didLong) openEventDetailSheet(btn.dataset.eventId); });
    btn.addEventListener('pointerleave', () => { clearTimeout(pressTimer); pressTimer = null; });
    btn.addEventListener('pointercancel', () => { clearTimeout(pressTimer); pressTimer = null; });
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });

  // Debug copy button
  document.getElementById('copyDebug')?.addEventListener('click', async () => {
    const pre = main.querySelector('.debug-panel__pre');
    if (pre) {
      await navigator.clipboard.writeText(pre.textContent);
      await showConfirm({ title: 'Copied to clipboard!', alert: true });
    }
  });
}

async function changeDay(delta) {
  viewDate = addDays(viewDate, delta);
  celebrationShown = false;
  updateHeaderSubtitle();
  subscribeSchedule(viewDate);
  viewMeals = (await readKitchenPlan(viewDate)) || {};
  await loadData();
}

// ── Swipe to change day ──
let swipeStartX = 0;
let swipeStartY = 0;
main.addEventListener('touchstart', (e) => {
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: true });
main.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    changeDay(dx < 0 ? 1 : -1);
  }
}, { passive: true });

// ══════════════════════════════════════════
// Completion toggle
// ══════════════════════════════════════════

let undoTimer = null;

async function toggleTask(entryKey, dateKey, { noPenalty = false } = {}) {
  if (!entryKey) return;
  const wasComplete = isComplete(entryKey, completions);

  if (wasComplete) {
    // Uncomplete
    delete completions[entryKey];
    await removeCompletion(entryKey);
    celebrationShown = false;
  } else {
    // Complete — include pending slider override or saved override from schedule entry
    const record = {
      completedAt: firebase.database.ServerValue.TIMESTAMP,
      completedBy: 'dashboard'
    };
    const pendingVal = pendingSliderOverride?.entryKey === entryKey ? pendingSliderOverride.value : null;
    const savedVal = (viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey))?.pointsOverride;
    const overrideVal = pendingVal ?? savedVal ?? null;
    if (overrideVal != null && overrideVal !== 100) {
      record.pointsOverride = overrideVal;
    }
    pendingSliderOverride = null;

    // Late completion: apply penalty if completing a past-date task with no prior override
    const entryDateKey = dateKey || viewDate;
    if (!noPenalty && entryDateKey < today && record.pointsOverride == null) {
      const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
      const task = entry ? tasks[entry.taskId] : null;
      const cat = task?.category ? cats[task.category] : null;
      if (!cat?.isEvent && !task?.exempt) {
        record.pointsOverride = settings?.pastDueCreditPct ?? 75;
        record.isLate = true;
      }
    }

    completions[entryKey] = record;
    await writeCompletion(entryKey, record);
  }

  // Look up the entry once for archive + cooldown logic
  const toggledEntry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);

  // Bounty reward on completion
  if (!wasComplete && toggledEntry) {
    const bountyTask = tasks[toggledEntry.taskId];
    if (bountyTask?.bounty) {
      if (bountyTask.bounty.type === 'points') {
        await writeMessage(toggledEntry.ownerId, {
          type: 'bonus',
          title: `Bounty: ${bountyTask.name}`,
          body: null,
          amount: bountyTask.bounty.amount,
          rewardId: null,
          entryKey,
          seen: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: 'system'
        });
      } else if (bountyTask.bounty.type === 'reward' && bountyTask.bounty.rewardId) {
        const reward = rewardsData[bountyTask.bounty.rewardId];
        await writeMessage(toggledEntry.ownerId, {
          type: 'redemption-approved',
          title: `Bounty reward: ${reward?.name || 'Reward'}`,
          body: null,
          amount: 0,
          rewardId: bountyTask.bounty.rewardId,
          entryKey,
          seen: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: 'system'
        });
        if (reward?.rewardType === 'task-skip' || reward?.rewardType === 'penalty-removal') {
          await writeBankToken(toggledEntry.ownerId, {
            rewardType: reward.rewardType,
            acquiredAt: Date.now(),
            used: false,
            usedAt: null,
            targetEntryKey: null
          });
        }
      }
      // Multi-person bounty: first-come-first-served — remove other entries
      if (bountyTask.ownerAssignmentMode === 'duplicate' && bountyTask.owners?.length > 1) {
        const dateKey2 = toggledEntry.dateKey || viewDate;
        const daySchedule = await readOnce(`schedule/${dateKey2}`) || {};
        for (const [otherKey, otherEntry] of Object.entries(daySchedule)) {
          if (otherKey !== entryKey && otherEntry.taskId === toggledEntry.taskId) {
            await removeData(`schedule/${dateKey2}/${otherKey}`);
          }
        }
      }
    }
  }

  // Auto-archive one-time tasks on completion
  let archivedTaskId = null;
  if (!wasComplete && toggledEntry) {
    const task = tasks[toggledEntry.taskId];
    if (task && task.rotation === 'once') {
      archivedTaskId = toggledEntry.taskId;
      task.status = 'completed';
      await writeTask(toggledEntry.taskId, task);
    }
  }

  // Cooldown task rebuild: re-place future entries anchored from today
  if (toggledEntry) {
    const cdTask = tasks[toggledEntry.taskId];
    if (cdTask?.cooldownDays > 0) {
      const allSched = await readAllSchedule() || {};
      const cdUpdates = rebuildSingleTaskSchedule(
        toggledEntry.taskId, cdTask, today, allSched, completions, people, settings, tasks, catsObj
      );
      if (Object.keys(cdUpdates).length > 0) {
        await multiUpdate(cdUpdates);
      }
      await loadData();
    }
  }

  const doRenderAndToast = () => {
    render();

    // Undo toast
    showUndoToast(
      wasComplete ? 'Task marked incomplete' : (archivedTaskId ? 'One-time task completed & archived' : 'Task completed'),
      async () => {
        if (wasComplete) {
          const record = { completedAt: firebase.database.ServerValue.TIMESTAMP, completedBy: 'dashboard' };
          completions[entryKey] = record;
          await writeCompletion(entryKey, record);
        } else {
          delete completions[entryKey];
          await removeCompletion(entryKey);
          // Reverse bounty rewards on undo
          if (toggledEntry) {
            const undoBountyTask = tasks[toggledEntry.taskId];
            if (undoBountyTask?.bounty) {
              await removeMessagesByEntryKey(toggledEntry.ownerId, entryKey);
              if (undoBountyTask.bounty.type === 'reward' && undoBountyTask.bounty.rewardId) {
                const bReward = rewardsData[undoBountyTask.bounty.rewardId];
                if (bReward?.rewardType === 'task-skip' || bReward?.rewardType === 'penalty-removal') {
                  await removeLatestBankToken(toggledEntry.ownerId, bReward.rewardType);
                }
              }
            }
          }
          // Restore archived one-time task
          if (archivedTaskId && tasks[archivedTaskId]) {
            tasks[archivedTaskId].status = 'active';
            await writeTask(archivedTaskId, tasks[archivedTaskId]);
          }
        }
        celebrationShown = false;
        // Rebuild cooldown task schedule after undo
        const undoEntry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
        if (undoEntry) {
          const undoTask = tasks[undoEntry.taskId];
          if (undoTask?.cooldownDays > 0) {
            const allSched = await readAllSchedule() || {};
            const undoUpdates = rebuildSingleTaskSchedule(
              undoEntry.taskId, undoTask, today, allSched, completions, people, settings, tasks, catsObj
            );
            if (Object.keys(undoUpdates).length > 0) {
              await multiUpdate(undoUpdates);
            }
            await loadData();
          }
        }
        render();
      }
    );

    // Check for celebration
    checkCelebration();
  };

  if (!wasComplete) {
    // Add press animation, then render after delay
    const cardEl = document.querySelector(`[data-entry-key="${entryKey}"]`);
    if (cardEl) {
      cardEl.classList.add('task-card--completing');
      cardEl.style.pointerEvents = 'none';
    }
    setTimeout(doRenderAndToast, 400);
  } else {
    doRenderAndToast();
  }
}

function showUndoToast(message, undoCallback) {
  const mount = document.getElementById('toastMount');
  mount.innerHTML = renderUndoToast(message);
  const toast = mount.querySelector('.undo-toast');

  if (undoTimer) clearTimeout(undoTimer);

  toast.querySelector('.undo-toast__btn').addEventListener('click', () => {
    mount.innerHTML = '';
    if (undoTimer) clearTimeout(undoTimer);
    undoCallback();
  });

  // Auto-dismiss after 4s
  undoTimer = setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      setTimeout(() => { mount.innerHTML = ''; }, 300);
    }
  }, 4000);
}

function checkCelebration() {
  if (celebrationShown) return;
  const filtered = filterByPerson(viewEntries, activePerson);
  if (isAllDone(filtered, completions)) {
    celebrationShown = true;
    const cel = document.getElementById('celebration');
    cel.classList.add('active');
    setTimeout(() => {
      cel.classList.add('celebration--dismiss');
      setTimeout(() => {
        cel.classList.remove('active', 'celebration--dismiss');
      }, 400);
    }, 2500);
  }
}

// ══════════════════════════════════════════
// Task detail bottom sheet (long-press)
// ══════════════════════════════════════════

const taskSheetMount = document.getElementById('taskSheetMount');

function openEventDetailSheet(eventId) {
  const event = events[eventId];
  if (!event) return;
  const html = renderEventDetailSheet(eventId, event, people);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  applyDataColors(taskSheetMount);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  document.getElementById('eventDelete')?.addEventListener('click', async () => {
    if (!await showConfirm({ title: 'Delete this event?', danger: true })) return;
    await removeEvent(eventId);
    delete events[eventId];
    closeTaskSheet();
    render();
  });

  document.getElementById('eventEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openEventForm(eventId), 320);
  });
}

function openMealPlanSheet(preSlot = 'dinner', preDate = null) {
  const date = preDate || viewDate;
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  let selectedSlot = preSlot;
  let selectedMealId = viewMeals?.[selectedSlot]?.recipeId || null;

  const sortedEntries = Object.entries(recipes).sort(([, a], [, b]) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return (b.lastUsed || 0) - (a.lastUsed || 0);
  });

  function buildSlotTabs() {
    return SLOTS.map(s =>
      `<button class="tab${s === selectedSlot ? ' is-active' : ''}" data-slot="${s}" type="button">${SLOT_LABELS[s]}</button>`
    ).join('');
  }

  function buildRecipeRows(filter) {
    const lc = filter?.toLowerCase() || '';
    const filtered = lc ? sortedEntries.filter(([, r]) => r.name.toLowerCase().includes(lc)) : sortedEntries;
    if (filtered.length === 0) {
      return lc
        ? `<div class="recipe-pick__none">No match — will save as "${esc(filter)}"</div>`
        : `<div class="recipe-pick__none">No recipes yet.</div>`;
    }
    return filtered.map(([id, r]) =>
      `<button class="recipe-pick__row${selectedMealId === id ? ' is-selected' : ''}"
        data-recipe-pick="${esc(id)}" type="button">
        <span>${esc(r.name)}</span>
        ${selectedMealId === id ? '<span class="recipe-pick__check">✓</span>' : ''}
      </button>`
    ).join('');
  }

  function slotHasMeal(slot) {
    const e = viewMeals?.[slot];
    return !!(e?.recipeId && recipes[e.recipeId]) || !!(e?.customName);
  }

  taskSheetMount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Plan a meal</h2>
    </div>
    <div class="sheet__content">
      <div class="field" style="margin-bottom:var(--spacing-md)">
        <span class="field__label">Slot</span>
        <nav class="tabs tabs--segmented" id="mpSlotTabs" style="margin-top:var(--spacing-xs)">${buildSlotTabs()}</nav>
      </div>
      <div class="field">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--spacing-xs)">
          <span class="field__label">Meal</span>
          <button class="btn btn--ghost btn--sm" id="mpCreateRecipe" type="button">+ New recipe</button>
        </div>
        <input id="mpSearch" type="text" autocomplete="off"
          placeholder="Search recipes or type any name…">
      </div>
      <div class="recipe-pick-list" id="mpRecipePick">${buildRecipeRows('')}</div>
      ${slotHasMeal(selectedSlot) ? '<button class="mp-remove-link" id="mpRemoveLink" type="button">Remove from this slot</button>' : ''}
    </div>
    <div class="sheet__footer">
      <button class="btn btn--primary" id="mpSave" type="button">Save</button>
    </div>`);

  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  function bindPickRows() {
    document.getElementById('mpRecipePick')?.querySelectorAll('[data-recipe-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMealId = btn.dataset.recipePick;
        document.getElementById('mpSearch').value = recipes[selectedMealId]?.name || '';
        document.getElementById('mpRecipePick').innerHTML = buildRecipeRows(document.getElementById('mpSearch').value);
        bindPickRows();
      });
    });
  }
  bindPickRows();

  document.getElementById('mpSlotTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-slot]');
    if (!btn) return;
    selectedSlot = btn.dataset.slot;
    selectedMealId = viewMeals?.[selectedSlot]?.recipeId || null;
    document.querySelectorAll('#mpSlotTabs .tab').forEach(b =>
      b.classList.toggle('is-active', b.dataset.slot === selectedSlot)
    );
    document.getElementById('mpSearch').value = '';
    document.getElementById('mpRecipePick').innerHTML = buildRecipeRows('');
    bindPickRows();
    const removeLink = document.getElementById('mpRemoveLink');
    if (removeLink) removeLink.style.display = slotHasMeal(selectedSlot) ? '' : 'none';
  });

  document.getElementById('mpSearch')?.addEventListener('input', e => {
    selectedMealId = null;
    document.getElementById('mpRecipePick').innerHTML = buildRecipeRows(e.target.value);
    bindPickRows();
  });

  document.getElementById('mpCreateRecipe')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(null, preSlot), 320);
  });

  document.getElementById('mpRemoveLink')?.addEventListener('click', async () => {
    await removeKitchenPlanSlot(date, selectedSlot);
    viewMeals = (await readKitchenPlan(viewDate)) || {};
    closeTaskSheet();
    render();
  });

  document.getElementById('mpSave')?.addEventListener('click', async () => {
    const typed = document.getElementById('mpSearch')?.value.trim();
    if (!selectedMealId && !typed) return;
    if (selectedMealId) {
      await writeKitchenPlanSlot(date, selectedSlot, { recipeId: selectedMealId, source: 'manual' });
      const entry = recipes[selectedMealId];
      if (entry) {
        await writeKitchenRecipe(selectedMealId, { ...entry, lastUsed: firebase.database.ServerValue.TIMESTAMP });
        entry.lastUsed = Date.now();
      }
    } else {
      const match = Object.entries(recipes).find(([, r]) => r.name.toLowerCase() === typed.toLowerCase());
      if (match) {
        await writeKitchenPlanSlot(date, selectedSlot, { recipeId: match[0], source: 'manual' });
      } else {
        await writeKitchenPlanSlot(date, selectedSlot, { customName: typed, source: 'manual' });
      }
    }
    viewMeals = (await readKitchenPlan(viewDate)) || {};
    recipes = (await readKitchenRecipes()) || {};
    closeTaskSheet();
    render();
  });
}

function openMealDetailSheet(planEntry, slot) {
  const meal = planEntry?.recipeId ? recipes[planEntry.recipeId] : null;
  const html = renderMealDetailSheet(meal, planEntry, false);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  // Pencil button in header — open full editor, return to recipe view on save
  document.getElementById('mdEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(planEntry.recipeId, slot), 320);
  });
}

function openMealManageSheet(planEntry, slot) {
  const meal = planEntry?.recipeId ? recipes[planEntry.recipeId] : null;
  if (!meal) return;
  taskSheetMount.innerHTML = renderBottomSheet(renderMealManageSheet(meal, slot));
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('mdEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(planEntry.recipeId, slot), 320);
  });

  document.getElementById('mdChange')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealPlanSheet(slot), 320);
  });

  document.getElementById('mdRemove')?.addEventListener('click', async () => {
    await removeKitchenPlanSlot(viewDate, slot);
    viewMeals = (await readKitchenPlan(viewDate)) || {};
    closeTaskSheet();
    render();
  });
}

function openMealEditorSheet(mealId = null, returnSlot = null) {
  const meal = mealId ? recipes[mealId] : null;
  const html = renderMealEditorSheet(meal, mealId);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('me_fav')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!pressed));
    btn.classList.toggle('is-active', !pressed);
  });

  const urlInput = document.getElementById('me_url');
  const urlOpen = document.getElementById('me_urlOpen');
  urlInput?.addEventListener('input', () => {
    const val = urlInput.value.trim();
    if (urlOpen) { urlOpen.href = val || '#'; urlOpen.hidden = !val; }
  });

  let ingredients = meal ? [...(meal.ingredients || [])] : [];
  let tags = meal ? [...(meal.tags || [])] : [];

  function refreshIngredients() {
    const container = document.getElementById('me_ingredients');
    if (!container) return;
    container.innerHTML = ingredients.map((item, i) =>
      `<div class="me-ingredient-row">
        <input type="text" value="${esc(item)}" placeholder="e.g. 2 lbs ground beef"
               data-ingr-index="${i}" aria-label="Ingredient ${i + 1}">
        <button class="me-ingredient-remove" data-ingr-index="${i}" type="button" aria-label="Remove">&times;</button>
      </div>`
    ).join('');
  }

  function bindIngredientEvents() {
    const container = document.getElementById('me_ingredients');
    container?.addEventListener('input', e => {
      const input = e.target.closest('input[data-ingr-index]');
      if (input) ingredients[parseInt(input.dataset.ingrIndex)] = input.value;
    });
    container?.addEventListener('click', e => {
      const btn = e.target.closest('.me-ingredient-remove');
      if (!btn) return;
      ingredients.splice(parseInt(btn.dataset.ingrIndex), 1);
      refreshIngredients();
    });
  }
  bindIngredientEvents();

  document.getElementById('me_addIngredient')?.addEventListener('click', () => {
    ingredients.push('');
    refreshIngredients();
    const inputs = document.querySelectorAll('#me_ingredients input');
    inputs[inputs.length - 1]?.focus();
  });

  function refreshTags() {
    const container = document.getElementById('me_tags');
    if (!container) return;
    container.innerHTML = tags.map((t, i) =>
      `<span class="me-tag">
        ${esc(t)}
        <button class="me-tag__remove" data-tag-index="${i}" type="button" aria-label="Remove tag">&times;</button>
      </span>`
    ).join('');
    container.querySelectorAll('.me-tag__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        tags.splice(parseInt(btn.dataset.tagIndex), 1);
        refreshTags();
      });
    });
  }

  document.getElementById('me_tagInput')?.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
      e.preventDefault();
      tags.push(e.target.value.trim().replace(/,$/,''));
      e.target.value = '';
      refreshTags();
    }
  });

  // Delete (edit mode only)
  document.getElementById('meDelete')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({
      title: 'Delete meal?',
      message: `"${meal?.name ?? ''}" will be removed from any planned days.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const allPlanSnap = await readOnce('kitchen/plan');
    const cascadeUpdates = {};
    if (allPlanSnap) {
      for (const [dateKey, slots] of Object.entries(allPlanSnap)) {
        for (const [s, entry] of Object.entries(slots || {})) {
          if (entry?.recipeId === mealId) cascadeUpdates[`kitchen/plan/${dateKey}/${s}`] = null;
        }
      }
    }
    cascadeUpdates[`kitchen/recipes/${mealId}`] = null;
    await multiUpdate(cascadeUpdates);
    delete recipes[mealId];
    viewMeals = (await readKitchenPlan(viewDate)) || {};
    closeTaskSheet();
    render();
  });

  // Save
  document.getElementById('meForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('me_name').value.trim();
    if (!name) {
      document.getElementById('me_nameError').textContent = 'Name is required';
      return;
    }
    document.querySelectorAll('#me_ingredients input[data-ingr-index]').forEach((inp, i) => {
      ingredients[i] = inp.value;
    });
    const data = {
      name,
      isFavorite: document.getElementById('me_fav')?.getAttribute('aria-pressed') === 'true',
      prepTime: document.getElementById('me_prepTime').value.trim() || null,
      tags: tags.filter(Boolean),
      ingredients: ingredients.filter(Boolean),
      url: document.getElementById('me_url').value.trim() || null,
      notes: document.getElementById('me_notes').value.trim() || null,
      lastUsed: meal?.lastUsed || null,
      createdAt: meal?.createdAt || firebase.database.ServerValue.TIMESTAMP,
    };
    if (mealId) {
      await writeKitchenRecipe(mealId, data);
      recipes[mealId] = data;
    } else {
      const newId = await pushKitchenRecipe({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      recipes[newId] = data;
    }
    closeTaskSheet();
    if (returnSlot) setTimeout(() => openMealPlanSheet(returnSlot), 320);
    render();
  });
}

function openEventForm(existingEventId = null, savedState = null) {
  const event = savedState
    || (existingEventId ? events[existingEventId] : {});
  const mode = existingEventId ? 'edit' : 'create';
  const html = renderEventForm({ event, eventId: existingEventId, people, dateKey: viewDate, mode });
  taskSheetMount.innerHTML = renderBottomSheet(html);

  // Apply person chip colors via JS (CSS var --chip-color per chip)
  taskSheetMount.querySelectorAll('.ef2-person-chip[data-person-color]').forEach(chip => {
    chip.style.setProperty('--chip-color', chip.dataset.personColor);
  });

  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    if (mode === 'create') document.getElementById('ef2_name')?.focus();
  });

  // Restore family mode visual state if returning from a sub-sheet
  if (savedState?.isFamilyMode) {
    requestAnimationFrame(() => {
      const pw = document.getElementById('ef2_people');
      pw?.querySelectorAll('.ef2-person-chip').forEach(chip => {
        if (chip.dataset.personId === '__family__') {
          chip.setAttribute('data-state', 'primary');
        } else {
          chip.setAttribute('data-state', 'attending');
        }
      });
    });
  }

  // ── Close / Cancel ───────────────────────────────────────────
  document.getElementById('ef2_close')?.addEventListener('click', closeTaskSheet);
  document.getElementById('ef2_cancel')?.addEventListener('click', closeTaskSheet);
  document.getElementById('bottomSheet')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('bottomSheet')) closeTaskSheet();
  });

  // ── Date picker toggle ───────────────────────────────────────
  const dateBtn = document.getElementById('ef2_dateBtn');
  const datePicker = document.getElementById('ef2_datePicker');
  const dateDisplay = document.getElementById('ef2_dateDisplay');
  const dateInput = document.getElementById('ef2_date');
  const timePicker = document.getElementById('ef2_timePicker');
  const timeBtn = document.getElementById('ef2_timeBtn');
  const timeDisplay = document.getElementById('ef2_timeDisplay');
  const startInput = document.getElementById('ef2_startTime');
  const endInput = document.getElementById('ef2_endTime');

  dateBtn?.addEventListener('click', () => {
    const open = datePicker.classList.toggle('is-open');
    if (open) timePicker?.classList.remove('is-open');
  });

  dateInput?.addEventListener('change', () => {
    dateDisplay.textContent = dateInput.value ? formatDateShort(dateInput.value) : 'Set date';
    datePicker?.classList.remove('is-open');
  });

  // ── Time picker toggle ───────────────────────────────────────
  timeBtn?.addEventListener('click', () => {
    const open = timePicker.classList.toggle('is-open');
    if (open) datePicker?.classList.remove('is-open');
  });

  function updateTimeDisplay() {
    if (document.getElementById('ef2_allDay')?.classList.contains('chip--active')) return;
    const s = startInput?.value;
    const e = endInput?.value;
    if (timeDisplay) {
      const fmt = (t) => {
        if (!t) return '';
        const [h, min] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
      };
      timeDisplay.textContent = s ? `${fmt(s)} → ${fmt(e)}` : 'Set time';
    }
  }

  startInput?.addEventListener('change', () => { updateTimeDisplay(); timePicker?.classList.remove('is-open'); });
  endInput?.addEventListener('change', () => { updateTimeDisplay(); timePicker?.classList.remove('is-open'); });

  // ── All day toggle ───────────────────────────────────────────
  document.getElementById('ef2_allDay')?.addEventListener('click', () => {
    const allDayBtn = document.getElementById('ef2_allDay');
    const timeSection = document.getElementById('ef2_timeSection');
    allDayBtn.classList.toggle('chip--active');
    const isAllDay = allDayBtn.classList.contains('chip--active');
    timeSection?.classList.toggle('ef2-hidden', isAllDay);
    if (!isAllDay) updateTimeDisplay();
  });

  // ── Person chip primary / attending state machine ─────────────
  const peopleWrap = document.getElementById('ef2_people');

  function getPrimaryChip() {
    return peopleWrap?.querySelector('.ef2-person-chip[data-state="primary"]');
  }

  function getPersonChips() {
    return [...(peopleWrap?.querySelectorAll('.ef2-person-chip') || [])];
  }

  function setFamilyMode(on) {
    getPersonChips().forEach(chip => {
      if (chip.dataset.personId === '__family__') {
        if (on) chip.setAttribute('data-state', 'primary');
        else chip.removeAttribute('data-state');
      } else {
        if (on) chip.setAttribute('data-state', 'attending');
        else chip.removeAttribute('data-state');
      }
    });
  }

  peopleWrap?.addEventListener('click', (e) => {
    const chip = e.target.closest('.ef2-person-chip');
    if (!chip) return;
    const pid = chip.dataset.personId;

    if (pid === '__family__') {
      const isFamilyActive = chip.dataset.state === 'primary';
      setFamilyMode(!isFamilyActive);
      return;
    }

    // Clear family mode if a person chip is tapped
    const familyChip = peopleWrap.querySelector('.ef2-person-chip--family');
    if (familyChip?.dataset.state) setFamilyMode(false);

    const currentState = chip.dataset.state;
    if (!currentState) {
      const hasPrimary = !!getPrimaryChip();
      chip.setAttribute('data-state', hasPrimary ? 'attending' : 'primary');
    } else if (currentState === 'attending') {
      const oldPrimary = getPrimaryChip();
      if (oldPrimary) oldPrimary.setAttribute('data-state', 'attending');
      chip.setAttribute('data-state', 'primary');
    } else if (currentState === 'primary') {
      chip.removeAttribute('data-state');
      const firstAttending = peopleWrap.querySelector('.ef2-person-chip[data-state="attending"]');
      if (firstAttending) firstAttending.setAttribute('data-state', 'primary');
    }
  });

  // ── Secondary fields (Notes, Location) ──────────────────────
  document.getElementById('ef2_notesChip')?.addEventListener('click', () => {
    document.getElementById('ef2_notesReveal')?.classList.add('is-open');
    document.getElementById('ef2_notesChip')?.classList.add('is-active');
    document.getElementById('ef2_notes')?.focus();
  });

  document.getElementById('ef2_notesClose')?.addEventListener('click', () => {
    document.getElementById('ef2_notesReveal')?.classList.remove('is-open');
    document.getElementById('ef2_notesChip')?.classList.remove('is-active');
  });

  document.getElementById('ef2_locChip')?.addEventListener('click', () => {
    document.getElementById('ef2_locReveal')?.classList.add('is-open');
    document.getElementById('ef2_locChip')?.classList.add('is-active');
    document.getElementById('ef2_location')?.focus();
  });

  document.getElementById('ef2_locClose')?.addEventListener('click', () => {
    document.getElementById('ef2_locReveal')?.classList.remove('is-open');
    document.getElementById('ef2_locChip')?.classList.remove('is-active');
  });

  // ── Repeat chip → sub-sheet (wired in Task 5) ─────────────
  let currentRepeat = event.repeat || null;

  document.getElementById('ef2_repeatChip')?.addEventListener('click', () => {
    if (typeof openRepeatSheet !== 'function') return;
    const formState = captureFormState();
    openRepeatSheet(currentRepeat, (newRule) => {
      currentRepeat = newRule;
      openEventForm(existingEventId, { ...formState, repeat: currentRepeat });
    }, () => {
      openEventForm(existingEventId, formState);
    });
  });

  // ── Capture form state (used before transitioning to sub-sheets) ──
  function captureFormState() {
    const primaryChip = getPrimaryChip();
    const attendingChips = [...(peopleWrap?.querySelectorAll('.ef2-person-chip[data-state="attending"]') || [])];
    const isFamilyMode = !!peopleWrap?.querySelector('.ef2-person-chip--family[data-state="primary"]');
    let peoplArr = [];
    if (isFamilyMode) {
      peoplArr = people.map(p => p.id);
    } else {
      if (primaryChip && primaryChip.dataset.personId !== '__family__') {
        peoplArr.push(primaryChip.dataset.personId);
      }
      attendingChips.forEach(c => {
        if (c.dataset.personId !== '__family__') peoplArr.push(c.dataset.personId);
      });
    }
    return {
      name: document.getElementById('ef2_name')?.value || '',
      date: document.getElementById('ef2_date')?.value || viewDate,
      allDay: document.getElementById('ef2_allDay')?.classList.contains('chip--active') || false,
      startTime: document.getElementById('ef2_startTime')?.value || '09:00',
      endTime: document.getElementById('ef2_endTime')?.value || '10:00',
      isFamilyMode,
      people: peoplArr,
      notes: document.getElementById('ef2_notes')?.value || '',
      location: document.getElementById('ef2_location')?.value || '',
      repeat: currentRepeat,
    };
  }

  // ── Save ─────────────────────────────────────────────────────
  document.getElementById('ef2_save')?.addEventListener('click', async () => {
    const name = document.getElementById('ef2_name')?.value.trim();
    if (!name) {
      const inp = document.getElementById('ef2_name');
      inp?.classList.add('ef2-shake');
      inp?.focus();
      inp?.addEventListener('animationend', () => inp.classList.remove('ef2-shake'), { once: true });
      return;
    }

    const formState = captureFormState();
    formState.name = name;

    const primaryId = formState.people[0] || null;
    const primaryPerson = people.find(p => p.id === primaryId);
    const isFamilyMode = !!peopleWrap?.querySelector('.ef2-person-chip--family[data-state="primary"]');
    const color = isFamilyMode
      ? (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4285f4')
      : (primaryPerson?.color || people[0]?.color || '#4285f4');

    const eventData = {
      name: formState.name,
      date: formState.date || viewDate,
      allDay: formState.allDay,
      startTime: formState.allDay ? null : (formState.startTime || null),
      endTime: formState.allDay ? null : (formState.endTime || null),
      color,
      people: formState.people,
      location: formState.location || null,
      notes: formState.notes || null,
      repeat: formState.repeat || null,
      createdDate: existingEventId
        ? (events[existingEventId]?.createdDate || todayKey(settings?.timezone || 'America/Chicago'))
        : todayKey(settings?.timezone || 'America/Chicago'),
    };

    const saveBtn = document.getElementById('ef2_save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }

    try {
      if (existingEventId) {
        const oldEvent = events[existingEventId];
        await writeEvent(existingEventId, eventData);
        events[existingEventId] = eventData;
        if (oldEvent && oldEvent.date !== eventData.date) {
          const allSched = await readAllSchedule() || {};
          const moveUpdates = {};
          for (const [dk, dayEntries] of Object.entries(allSched)) {
            for (const [ek, entry] of Object.entries(dayEntries || {})) {
              if (entry.type === 'event' && entry.eventId === existingEventId) {
                moveUpdates[`schedule/${dk}/${ek}`] = null;
              }
            }
          }
          const newSchedKey = `sched_${Date.now()}_event`;
          moveUpdates[`schedule/${eventData.date}/${newSchedKey}`] = { type: 'event', eventId: existingEventId };
          await multiUpdate(moveUpdates);
        }
      } else {
        const newId = await pushEvent(eventData);
        events[newId] = eventData;
        const schedKey = `sched_${Date.now()}_event`;
        await multiUpdate({ [`schedule/${eventData.date}/${schedKey}`]: { type: 'event', eventId: newId } });
      }
      closeTaskSheet();
      render();
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = existingEventId ? 'Save Changes' : 'Add Event'; }
      const errEl = document.getElementById('ef2_importError');
      if (errEl) { errEl.textContent = 'Couldn\'t save — try again.'; errEl.classList.add('is-visible'); }
    }
  });

  // ── Delete (edit mode) ──────────────────────────────────────
  document.getElementById('ef2_deleteBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('ef2_deleteBtn');
    if (btn) btn.style.display = 'none';
    document.getElementById('ef2_deleteConfirm')?.classList.add('is-open');
  });

  document.getElementById('ef2_deleteNo')?.addEventListener('click', () => {
    document.getElementById('ef2_deleteConfirm')?.classList.remove('is-open');
    const btn = document.getElementById('ef2_deleteBtn');
    if (btn) btn.style.display = '';
  });

  document.getElementById('ef2_deleteYes')?.addEventListener('click', async () => {
    if (!existingEventId) return;
    try {
      await removeEvent(existingEventId);
      delete events[existingEventId];
      closeTaskSheet();
      render();
    } catch (err) {
      document.getElementById('ef2_deleteConfirm')?.classList.remove('is-open');
      const btn = document.getElementById('ef2_deleteBtn');
      if (btn) btn.style.display = '';
      const errEl = document.getElementById('ef2_importError');
      if (errEl) { errEl.textContent = "Couldn't delete — try again."; errEl.classList.add('is-visible'); }
    }
  });

  // ── Import flows (wired in Task 4) ──────────────────────────
  document.getElementById('ef2_wand')?.addEventListener('click', () => doWandParse());
  document.getElementById('ef2_photoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) doPhotoImport(file);
  });
  document.getElementById('ef2_ical')?.addEventListener('click', () => openEfIcalSheet());

  let errDismissTimer = null;

  async function doWandParse() {
    const title = document.getElementById('ef2_name')?.value.trim();
    if (!title) return;

    const wandBtn = document.getElementById('ef2_wand');
    const loadEl = document.getElementById('ef2_importLoading');
    const errEl = document.getElementById('ef2_importError');
    const msgEl = document.getElementById('ef2_importMsg');

    wandBtn?.classList.add('ef2-icon-btn--loading');
    if (loadEl) { loadEl.classList.add('is-visible'); }
    if (msgEl) msgEl.textContent = 'Parsing…';
    if (errEl) errEl.classList.remove('is-visible');

    try {
      const res = await fetch(KITCHEN_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'parseEvent', input: { text: title, contextDate: today } }),
      });
      const data = await res.json();

      if (data.error || !data.name) {
        if (errEl) { errEl.textContent = 'Couldn\'t parse — fill manually.'; errEl.classList.add('is-visible'); }
        clearTimeout(errDismissTimer);
        errDismissTimer = setTimeout(() => errEl?.classList.remove('is-visible'), 3000);
      } else {
        if (data.name) {
          const inp = document.getElementById('ef2_name');
          if (inp) inp.value = data.name;
        }
        if (data.date) {
          const di = document.getElementById('ef2_date');
          const dd = document.getElementById('ef2_dateDisplay');
          if (di) di.value = data.date;
          if (dd) dd.textContent = formatDateShort(data.date);
        }
        if (data.time && !data.allDay) {
          const si = document.getElementById('ef2_startTime');
          if (si) si.value = data.time;
          const [h, m] = data.time.split(':').map(Number);
          const endH = String((h + 1) % 24).padStart(2, '0');
          const ei = document.getElementById('ef2_endTime');
          if (ei) ei.value = `${endH}:${String(m).padStart(2, '0')}`;
          updateTimeDisplay();
        }
        if (data.allDay) {
          const allDayBtn = document.getElementById('ef2_allDay');
          const timeSection = document.getElementById('ef2_timeSection');
          allDayBtn?.classList.add('chip--active');
          timeSection?.classList.add('ef2-hidden');
        }
        if (data.name) {
          const lowerName = data.name.toLowerCase();
          for (const p of people) {
            if (lowerName.includes(p.name.toLowerCase())) {
              const primaryChip = peopleWrap?.querySelector('.ef2-person-chip[data-state="primary"]');
              const thisChip = peopleWrap?.querySelector(`.ef2-person-chip[data-person-id="${p.id}"]`);
              if (thisChip && !primaryChip) {
                thisChip.setAttribute('data-state', 'primary');
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      if (errEl) { errEl.textContent = 'Couldn\'t parse — fill manually.'; errEl.classList.add('is-visible'); }
      clearTimeout(errDismissTimer);
      errDismissTimer = setTimeout(() => errEl?.classList.remove('is-visible'), 3000);
    } finally {
      wandBtn?.classList.remove('ef2-icon-btn--loading');
      loadEl?.classList.remove('is-visible');
    }
  }

  async function doPhotoImport(file) {
    const loadEl = document.getElementById('ef2_importLoading');
    const errEl = document.getElementById('ef2_importError');
    const msgEl = document.getElementById('ef2_importMsg');

    if (loadEl) { loadEl.classList.add('is-visible'); }
    if (msgEl) msgEl.textContent = 'Reading photo…';
    if (errEl) errEl.classList.remove('is-visible');

    const contextNote = document.getElementById('ef2_name')?.value.trim() || '';

    try {
      const { base64, mediaType } = await resizeImageForUpload(file);
      const payload = { base64, mediaType, contextDate: today };
      if (contextNote) payload.context = contextNote;

      const res = await fetch(KITCHEN_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'calendarPhoto', input: payload }),
      });
      const data = await res.json();
      loadEl?.classList.remove('is-visible');

      if (data.error || !data.events?.length) {
        if (errEl) { errEl.textContent = 'No events found — try a clearer photo.'; errEl.classList.add('is-visible'); }
        return;
      }

      const savedState = captureFormState();

      const proceed = (eventsArr) => {
        openEfImportConfirm(eventsArr, data.hadRecurring || false, () => {
          openEventForm(existingEventId, savedState);
        });
      };

      if (data.monthUncertain) {
        openMonthClarificationSheet(data.assumedMonth, (yearMonth) => {
          const remapped = data.events.map(ev => {
            if (!ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return ev;
            return { ...ev, date: `${yearMonth}-${ev.date.slice(8, 10)}` };
          });
          proceed(remapped);
        });
      } else {
        proceed(data.events);
      }
    } catch (err) {
      loadEl?.classList.remove('is-visible');
      if (errEl) { errEl.textContent = 'Something went wrong — try again.'; errEl.classList.add('is-visible'); }
    }
  }

  function openEfIcalSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'ef2-subsheet-overlay';
    overlay.innerHTML = `<div class="ef2-subsheet">
      <div class="sheet__header">
        <h2 class="sheet__title">Calendar URL</h2>
      </div>
      <div class="sheet__content">
        <p class="sheet__hint">Paste a .ics calendar feed URL (e.g. from TeamSnap or your school).</p>
        <div class="field">
          <label class="field__label" for="ef2IcalUrl">Calendar URL (.ics)</label>
          <input class="field__input" id="ef2IcalUrl" type="url" placeholder="https://…/calendar.ics" autocomplete="off">
        </div>
        <div id="ef2IcalStatus" class="sheet__hint"></div>
      </div>
      <div class="sheet__footer">
        <button class="btn btn--ghost" id="ef2IcalCancel">Cancel</button>
        <button class="btn btn--primary" id="ef2IcalImport">Import</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      overlay.querySelector('#ef2IcalUrl')?.focus();
    });

    function closeIcal() {
      overlay.classList.remove('active');
      setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 320);
    }

    overlay.querySelector('#ef2IcalCancel')?.addEventListener('click', closeIcal);

    overlay.querySelector('#ef2IcalImport')?.addEventListener('click', async () => {
      const url = overlay.querySelector('#ef2IcalUrl')?.value.trim();
      if (!url) return;
      const status = overlay.querySelector('#ef2IcalStatus');
      const btn = overlay.querySelector('#ef2IcalImport');
      btn.disabled = true; btn.textContent = 'Fetching…';
      if (status) status.textContent = 'Fetching calendar…';

      try {
        const res = await fetch(KITCHEN_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'ical', input: url }),
        });
        const data = await res.json();
        if (data.error || !data.events?.length) {
          if (status) status.textContent = 'Couldn\'t fetch that calendar. Check the URL.';
          btn.disabled = false; btn.textContent = 'Import';
          return;
        }
        closeIcal();
        const savedState = captureFormState();
        setTimeout(() => {
          if (!document.getElementById('bottomSheet')?.classList.contains('active')) return;
          openEfImportConfirm(data.events, data.hadRecurring || false, () => {
            openEventForm(existingEventId, savedState);
          });
        }, 320);
      } catch (err) {
        if (status) status.textContent = 'Couldn\'t fetch that calendar. Check the URL.';
        btn.disabled = false; btn.textContent = 'Import';
      }
    });
  }
}

function openEfImportConfirm(eventsArr, hadRecurring, onCancel) {
  const recurringBanner = hadRecurring
    ? `<div class="banner banner--info" role="status">Recurring events were skipped — only one-time events are supported.</div>`
    : '';

  const rows = eventsArr.map((ev, i) => {
    const timeSub = ev.time ? ev.time : (ev.allDay ? 'All day' : null);
    const row = renderConfirmRow(
      { ...ev, _sub: timeSub },
      { labelKey: 'name', subKey: '_sub', confidenceKey: 'confidence', key: i }
    );
    const dateLabel = ev.dateConfidence === 'low'
      ? `<label class="ef2-date-label ef2-date-label--warn">Date (uncertain — please verify)</label>`
      : `<label class="ef2-date-label">Date</label>`;
    const dateWrap = `<div class="ev-date-wrap" data-idx="${i}" style="padding:0 var(--spacing-md) var(--spacing-xs)">
      ${dateLabel}
      <input type="date" class="field__input ev-date" data-idx="${i}" value="${ev.date || ''}">
    </div>`;
    return row + dateWrap;
  }).join('');

  const n = eventsArr.length;
  taskSheetMount.innerHTML = renderBottomSheet(`
    <div class="sheet__header"><h2 class="sheet__title">Import events</h2></div>
    <div class="sheet__content">
      ${recurringBanner}
      <div class="confirm-list" id="efIevList">${rows}</div>
    </div>
    <div class="sheet__footer">
      <button class="btn btn--ghost" id="efIevCancel">Cancel</button>
      <button class="btn btn--primary" id="efIevImport">Import ${n} event${n !== 1 ? 's' : ''}</button>
    </div>`);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  const list = taskSheetMount.querySelector('#efIevList');
  const importBtn = taskSheetMount.querySelector('#efIevImport');

  const updateBtn = () => {
    const count = list.querySelectorAll('.confirm-row:not(.is-deselected)').length;
    importBtn.textContent = `Import ${count} event${count !== 1 ? 's' : ''}`;
    importBtn.disabled = count === 0;
  };

  list.addEventListener('click', (e) => {
    if (e.target.closest('.ev-date-wrap')) return;
    const row = e.target.closest('.confirm-row');
    if (!row) return;
    const idx = row.dataset.key;
    row.classList.toggle('is-deselected');
    const dateWrap = list.querySelector(`.ev-date-wrap[data-idx="${idx}"]`);
    if (dateWrap) dateWrap.style.display = row.classList.contains('is-deselected') ? 'none' : '';
    updateBtn();
  });

  taskSheetMount.querySelector('#efIevCancel')?.addEventListener('click', () => {
    closeTaskSheet();
    if (onCancel) setTimeout(onCancel, 320);
  });

  importBtn.addEventListener('click', async () => {
    const selected = [...list.querySelectorAll('.confirm-row:not(.is-deselected)')]
      .map(row => {
        const ev = eventsArr[+row.dataset.key];
        const dateEl = list.querySelector(`.ev-date[data-idx="${row.dataset.key}"]`);
        const date = dateEl?.value || ev.date || null;
        return date ? { ...ev, date } : null;
      })
      .filter(Boolean);
    if (!selected.length) { closeTaskSheet(); return; }
    importBtn.disabled = true; importBtn.textContent = 'Adding…';
    try {
      let counter = 0;
      for (const ev of selected) {
        const eventData = {
          name: ev.name, date: ev.date,
          allDay: ev.allDay ?? true,
          startTime: ev.time || null, endTime: null,
          color: people[0]?.color || '#4285f4',
          people: [], notes: ev.notes || null, repeat: null,
        };
        const newId = await pushEvent(eventData);
        events[newId] = eventData;
        const schedKey = `sched_${Date.now()}_evt_${counter++}`;
        await multiUpdate({ [`schedule/${ev.date}/${schedKey}`]: { type: 'event', eventId: newId } });
      }
      closeTaskSheet();
      render();
    } catch (err) {
      importBtn.disabled = false;
      importBtn.textContent = `Import ${selected.length} event${selected.length !== 1 ? 's' : ''}`;
    }
  });
}

function openRepeatSheet(currentRule, onDone, onCancel) {
  taskSheetMount.innerHTML = renderBottomSheet(renderRepeatSheet(currentRule));
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));

  const getSelectedType = () => {
    const sel = taskSheetMount.querySelector('.ef2-repeat-option.is-selected');
    return sel?.dataset.type || 'none';
  };

  taskSheetMount.querySelectorAll('.ef2-repeat-option').forEach(opt => {
    opt.addEventListener('click', () => {
      taskSheetMount.querySelectorAll('.ef2-repeat-option').forEach(o => o.classList.remove('is-selected'));
      opt.classList.add('is-selected');
      const type = opt.dataset.type;
      const weeklySub = document.getElementById('rptWeeklySub');
      const customSub = document.getElementById('rptCustomSub');
      const endSection = document.getElementById('rptEndSection');
      weeklySub?.classList.toggle('is-open', type === 'weekly');
      customSub?.classList.toggle('is-open', type === 'custom');
      endSection?.classList.toggle('is-open', type !== 'none');
    });
  });

  taskSheetMount.querySelectorAll('.ef2-day-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('is-active'));
  });

  document.getElementById('rptEndType')?.addEventListener('change', (e) => {
    document.getElementById('rptEndDateWrap').style.display = e.target.value === 'on' ? 'block' : 'none';
    document.getElementById('rptEndCountWrap').style.display = e.target.value === 'after' ? 'flex' : 'none';
  });

  document.getElementById('rptBack')?.addEventListener('click', () => {
    closeTaskSheet();
    if (onCancel) setTimeout(onCancel, 320);
  });
  document.getElementById('rptCancel')?.addEventListener('click', () => {
    closeTaskSheet();
    if (onCancel) setTimeout(onCancel, 320);
  });

  document.getElementById('rptDone')?.addEventListener('click', () => {
    const type = getSelectedType();
    if (type === 'none') {
      closeTaskSheet();
      if (onDone) setTimeout(() => onDone(null), 320);
      return;
    }
    const rule = { type };
    if (type === 'weekly') {
      rule.days = [...taskSheetMount.querySelectorAll('.ef2-day-chip.is-active')].map(c => c.dataset.day);
    }
    if (type === 'custom') {
      rule.every = parseInt(document.getElementById('rptEvery')?.value, 10) || 2;
      rule.unit = document.getElementById('rptUnit')?.value || 'weeks';
    }
    const endType = document.getElementById('rptEndType')?.value || 'never';
    if (endType === 'on') {
      rule.end = { type: 'on', date: document.getElementById('rptEndDate')?.value || '' };
    } else if (endType === 'after') {
      rule.end = { type: 'after', count: parseInt(document.getElementById('rptEndCount')?.value, 10) || 5 };
    } else {
      rule.end = { type: 'never' };
    }
    closeTaskSheet();
    if (onDone) setTimeout(() => onDone(rule), 320);
  });
}

function openTaskSheet(entryKey, dateKey) {
  // Find entry in current view or overdue
  const entry = viewEntries[entryKey]
    || overdueItems.find(o => o.entryKey === entryKey);
  if (!entry) return;

  const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
  const person = people.find(p => p.id === entry.ownerId);
  const cat = task.category ? cats[task.category] : null;
  const completed = isComplete(entryKey, completions);
  const pts = basePoints(task, settings?.difficultyMultipliers);
  const completion = completions[entryKey];
  const currentOverride = completion?.pointsOverride ?? entry.pointsOverride ?? null;

  // Grade preview
  const filtered = filterByPerson(viewEntries, activePerson);
  const score = dailyScore(filtered, completions, tasks, cats, settings, viewDate, today);
  const gd = gradeDisplay(score.percentage);
  const gradePreview = score.possible > 0 ? `${gd.grade} (${score.percentage}%)` : null;

  const sheetContent = renderTaskDetailSheet({
    entryKey,
    entry: { ...entry, dateKey: dateKey || viewDate },
    task,
    person,
    category: cat,
    completed,
    points: { possible: pts },
    sliderMin: settings?.sliderMin ?? 0,
    sliderMax: settings?.sliderMax ?? 150,
    currentOverride: currentOverride != null ? currentOverride : 100,
    gradePreview,
    people,
    showDelegate: true,
    showMove: true,
    showEdit: true,
    isEvent: !!cat?.isEvent,
    isPastDate: (dateKey || viewDate) < today
  });

  taskSheetMount.innerHTML = renderBottomSheet(sheetContent);
  applyDataColors(taskSheetMount);

  requestAnimationFrame(() => {
    const overlay = document.getElementById('bottomSheet');
    if (overlay) overlay.classList.add('active');
  });

  // Bind sheet events
  bindTaskSheetEvents(entryKey, dateKey);
}

async function closeTaskSheet() {
  // Save any pending slider override before closing
  if (pendingSliderOverride) {
    const { entryKey, dateKey: sliderDateKey, value } = pendingSliderOverride;
    const override = value === 100 ? null : value;
    pendingSliderOverride = null;
    // Always persist to schedule entry (works for both complete and incomplete tasks)
    await multiUpdate({ [`schedule/${sliderDateKey}/${entryKey}/pointsOverride`]: override });
    // Also update the in-memory schedule entry
    if (viewEntries[entryKey]) viewEntries[entryKey].pointsOverride = override;
    // If already completed, update the completion record too
    if (isComplete(entryKey, completions)) {
      completions[entryKey].pointsOverride = override;
      await writeCompletion(entryKey, completions[entryKey]);
    }
  }
  const overlay = document.getElementById('bottomSheet');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => { taskSheetMount.innerHTML = ''; render(); }, 300);
  }
}

function bindTaskSheetEvents(entryKey, dateKey) {
  // Close on overlay click
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  // Toggle complete
  document.getElementById('sheetToggleComplete')?.addEventListener('click', async () => {
    await closeTaskSheet();
    await toggleTask(entryKey, dateKey);
  });

  // Complete without penalty (full credit for late task)
  document.getElementById('sheetCompleteNoPenalty')?.addEventListener('click', async () => {
    await closeTaskSheet();
    await toggleTask(entryKey, dateKey, { noPenalty: true });
  });

  // Points slider — stores pending override, saved on sheet close or toggle-complete
  const slider = document.getElementById('pointsSlider');
  if (slider) {
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      const basePts = parseInt(slider.dataset.basePts, 10);
      const earnedPts = Math.round(basePts * (val / 100));
      const label = document.getElementById('sliderValueLabel');
      if (label) label.textContent = `${val}% (${earnedPts}pt)`;

      // Track pending override
      pendingSliderOverride = { entryKey, dateKey, value: val };

      // Live grade preview — temporarily inject override into completions
      const filtered = filterByPerson(viewEntries, activePerson);
      const hadRecord = !!completions[entryKey];
      const origRecord = completions[entryKey];
      completions[entryKey] = {
        ...(origRecord || { completedAt: Date.now(), completedBy: 'preview' }),
        pointsOverride: val === 100 ? null : val
      };
      const previewScore = dailyScore(filtered, completions, tasks, cats, settings, viewDate, today);
      const previewGd = gradeDisplay(previewScore.percentage);
      const previewEl = document.getElementById('gradePreview');
      if (previewEl) previewEl.textContent = `Grade: ${previewGd.grade} (${previewScore.percentage}%)`;
      // Restore original state
      if (hadRecord) completions[entryKey] = origRecord;
      else delete completions[entryKey];
    });

    // Reset to 100% button
    const resetBtn = document.getElementById('sliderReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        slider.value = 100;
        slider.dispatchEvent(new Event('input'));
      });
    }
  }

  // Delegate
  document.getElementById('sheetDelegate')?.addEventListener('click', () => {
    document.getElementById('delegatePanel')?.classList.toggle('is-hidden');
  });

  // Delegate person chips
  let pendingDelegateOwnerId = null;
  document.querySelectorAll('#delegatePanel .chip--selectable').forEach(chip => {
    chip.addEventListener('click', async () => {
      const newOwnerId = chip.dataset.personId;
      if (!newOwnerId) return;

      const moveToggle = document.getElementById('delegateMoveToggle');
      if (moveToggle?.checked) {
        // Store selection, open date picker for delegate+move
        pendingDelegateOwnerId = newOwnerId;
        document.querySelectorAll('#delegatePanel .chip--selectable').forEach(c => c.classList.remove('chip--active'));
        chip.classList.add('chip--active');
        const picker = document.getElementById('delegateMoveDatePicker');
        if (picker) { try { picker.showPicker(); } catch(e) { picker.click(); } }
        return;
      }

      // Regular delegate (no move)
      const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
      if (!entry) return;

      const originalPerson = people.find(p => p.id === entry.ownerId);
      const targetDate = dateKey || viewDate;
      const newEntry = { ...entry, ownerId: newOwnerId, delegatedFromName: originalPerson?.name || '?' };
      delete newEntry.entryKey;

      const updates = {};
      updates[`schedule/${targetDate}/${entryKey}`] = null;
      const newKey = `sched_${Date.now()}_delegate`;
      updates[`schedule/${targetDate}/${newKey}`] = newEntry;

      if (completions[entryKey]) {
        updates[`completions/${entryKey}`] = null;
        updates[`completions/${newKey}`] = completions[entryKey];
      }

      await multiUpdate(updates);
      closeTaskSheet();
      await loadData();
      render();
    });
  });

  // Delegate+Move date picker
  document.getElementById('delegateMoveDatePicker')?.addEventListener('change', async (e) => {
    const newDate = e.target.value;
    if (!newDate || !pendingDelegateOwnerId) return;

    const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
    if (!entry) return;

    const originalPerson = people.find(p => p.id === entry.ownerId);
    const sourceDate = dateKey || viewDate;
    const newEntry = { ...entry, ownerId: pendingDelegateOwnerId, delegatedFromName: originalPerson?.name || '?', movedFromDate: sourceDate };
    delete newEntry.entryKey;

    const updates = {};
    updates[`schedule/${sourceDate}/${entryKey}`] = null;
    const newKey = `sched_${Date.now()}_delegate_moved`;
    updates[`schedule/${newDate}/${newKey}`] = newEntry;

    if (completions[entryKey]) {
      updates[`completions/${entryKey}`] = null;
      updates[`completions/${newKey}`] = completions[entryKey];
    }

    await multiUpdate(updates);
    pendingDelegateOwnerId = null;
    closeTaskSheet();
    await loadData();
    render();
  });

  // Move — directly open date picker
  document.getElementById('sheetMove')?.addEventListener('click', () => {
    const picker = document.getElementById('moveDatePicker');
    if (picker) { try { picker.showPicker(); } catch(e) { picker.click(); } }
  });

  document.getElementById('moveDatePicker')?.addEventListener('change', async (e) => {
    const newDate = e.target.value;
    if (!newDate) return;

    const entry = viewEntries[entryKey] || overdueItems.find(o => o.entryKey === entryKey);
    if (!entry) return;

    const sourceDate = dateKey || viewDate;
    const newEntry = { ...entry, movedFromDate: sourceDate };
    delete newEntry.entryKey;

    const updates = {};
    updates[`schedule/${sourceDate}/${entryKey}`] = null;
    const newKey = `sched_${Date.now()}_moved`;
    updates[`schedule/${newDate}/${newKey}`] = newEntry;

    if (completions[entryKey]) {
      updates[`completions/${entryKey}`] = null;
      updates[`completions/${newKey}`] = completions[entryKey];
    }

    await multiUpdate(updates);
    closeTaskSheet();
    await loadData();
    render();
  });

  // Skip (mark as missed — remove from schedule)
  document.getElementById('moveSkip')?.addEventListener('click', async () => {
    const sourceDate = dateKey || viewDate;
    const updates = {};
    updates[`schedule/${sourceDate}/${entryKey}`] = null;
    if (completions[entryKey]) {
      updates[`completions/${entryKey}`] = null;
    }
    await multiUpdate(updates);
    closeTaskSheet();
    await loadData();
    render();
  });

  // Edit task
  document.getElementById('sheetEdit')?.addEventListener('click', () => {
    const taskId = document.getElementById('sheetEdit').dataset.taskId;
    // Close detail sheet then open edit sheet after animation completes
    const overlay = document.getElementById('bottomSheet');
    if (overlay) overlay.classList.remove('active');
    setTimeout(() => { openEditTaskSheet(taskId); }, 320);
  });

  // Notes inline editing
  const notesAddBtn = document.getElementById('notesAddBtn');
  const notesEditBtn = document.getElementById('notesEditBtn');
  const notesCancelBtn = document.getElementById('notesCancelBtn');
  const notesSaveBtn = document.getElementById('notesSaveBtn');
  const notesEditor = document.getElementById('notesEditor');
  const notesDisplay = document.getElementById('notesDisplay');
  const notesInput = document.getElementById('notesInput');

  function openNotesEditor() {
    notesEditor?.classList.remove('is-hidden');
    notesDisplay?.classList.add('is-hidden');
    notesAddBtn?.classList.add('is-hidden');
    if (notesInput) notesInput.focus();
  }

  function closeNotesEditor() {
    notesEditor?.classList.add('is-hidden');
    const originalText = document.getElementById('notesText')?.textContent?.trim() || '';
    if (notesInput) notesInput.value = originalText;
    notesDisplay?.classList.toggle('is-hidden', !originalText);
    notesAddBtn?.classList.toggle('is-hidden', !!originalText);
  }

  notesAddBtn?.addEventListener('click', openNotesEditor);
  notesEditBtn?.addEventListener('click', openNotesEditor);
  notesCancelBtn?.addEventListener('click', closeNotesEditor);

  notesSaveBtn?.addEventListener('click', async () => {
    const noteValue = notesInput?.value.trim() || null;
    const ek = notesSaveBtn.dataset.entryKey;
    const dk = notesSaveBtn.dataset.dateKey;
    if (ek && dk) {
      await multiUpdate({ [`schedule/${dk}/${ek}/notes`]: noteValue });
      if (viewEntries[ek]) viewEntries[ek].notes = noteValue;
    }
    const notesText = document.getElementById('notesText');
    if (notesText) notesText.textContent = noteValue || '';
    closeNotesEditor();
  });
}

// ══════════════════════════════════════════
// Edit task sheet (no PIN)
// ══════════════════════════════════════════

function openEditTaskSheet(taskId) {
  const task = tasks[taskId];
  if (!task) return;

  const catsArr = Object.entries(cats).map(([key, c]) => ({ key, ...c }));
  const sheetContent = renderEditTaskSheet(taskId, task, catsArr, people, rewardsData);
  taskSheetMount.innerHTML = renderBottomSheet(sheetContent);
  applyDataColors(taskSheetMount);
  initOwnerChips('et_owners');

  requestAnimationFrame(() => {
    const overlay = document.getElementById('bottomSheet');
    if (overlay) overlay.classList.add('active');
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeTaskSheet(); });
  document.getElementById('et_cancel')?.addEventListener('click', closeTaskSheet);

  // Assignment mode toggle
  const modeGroup = document.getElementById('et_assignMode');
  if (modeGroup) {
    for (const btn of modeGroup.querySelectorAll('.admin-mode-btn')) {
      btn.addEventListener('click', () => {
        modeGroup.querySelectorAll('.admin-mode-btn').forEach(b => b.classList.remove('admin-mode-btn--active'));
        btn.classList.add('admin-mode-btn--active');
      });
    }
  }

  // Rotation change — show/hide dedicated day vs date
  document.getElementById('et_rotation')?.addEventListener('change', (e) => {
    const rot = e.target.value;
    const group = document.getElementById('et_dedicatedDayGroup');
    const daySelect = document.getElementById('et_daySelect');
    const dateRow = document.getElementById('et_dedicatedDateRow');
    const label = document.getElementById('et_dedicatedDayLabel');
    const catOpt = document.getElementById('et_category')?.selectedOptions[0];
    const isEvent = catOpt?.dataset.event === '1';
    if (rot === 'daily') {
      group.classList.add('is-hidden');
    } else {
      group.classList.remove('is-hidden');
      const eventBtn = label?.querySelector('#et_eventDateBtn');
      const btnHtml = eventBtn ? eventBtn.outerHTML : '';
      if (rot === 'once') {
        daySelect.classList.add('is-hidden');
        dateRow.classList.toggle('is-hidden', isEvent);
        label.innerHTML = (isEvent ? 'Event Date ' : 'Scheduled Date ') + btnHtml;
      } else {
        daySelect.classList.remove('is-hidden');
        dateRow.classList.add('is-hidden');
        label.innerHTML = 'Dedicated Day ' + btnHtml;
      }
      label?.querySelector('#et_eventDateBtn')?.addEventListener('click', () => {
        const picker = document.getElementById('et_eventDate');
        if (picker) { try { picker.showPicker(); } catch(e2) { picker.click(); } }
      });
    }
  });

  // Category change — show/hide event date button
  document.getElementById('et_category')?.addEventListener('change', (e) => {
    const isEvent = e.target.selectedOptions[0]?.dataset.event === '1';
    const eventBtn = document.getElementById('et_eventDateBtn');
    if (eventBtn) eventBtn.classList.toggle('is-hidden', !isEvent);
    const eventTimeGroup = document.getElementById('et_eventTimeGroup');
    if (eventTimeGroup) eventTimeGroup.classList.toggle('is-hidden', !isEvent);
    const notesGroup = document.getElementById('et_notesGroup');
    if (notesGroup) notesGroup.classList.toggle('is-hidden', !isEvent);
    if (isEvent) {
      const rotSelect = document.getElementById('et_rotation');
      if (rotSelect) { rotSelect.value = 'once'; rotSelect.dispatchEvent(new Event('change')); }
    }
  });

  // Event date icon
  document.getElementById('et_eventDateBtn')?.addEventListener('click', () => {
    const picker = document.getElementById('et_eventDate');
    if (picker) { try { picker.showPicker(); } catch(e) { picker.click(); } }
  });

  // Exempt / Bounty chip toggles
  document.getElementById('et_exempt')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('chip--active'));
  document.getElementById('et_bountyToggle')?.addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('chip--active');
    const bountyFields = document.getElementById('et_bountyFields');
    if (bountyFields) bountyFields.classList.toggle('is-hidden', !e.currentTarget.classList.contains('chip--active'));
    if (e.currentTarget.classList.contains('chip--active')) document.getElementById('et_exempt')?.classList.add('chip--active');
  });
  for (const btn of document.querySelectorAll('#et_bountyType .segmented-btn')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#et_bountyType .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      document.getElementById('et_bountyPointsField').classList.toggle('is-hidden', btn.dataset.value !== 'points');
      document.getElementById('et_bountyRewardField').classList.toggle('is-hidden', btn.dataset.value !== 'reward');
    });
  }

  document.getElementById('et_save')?.addEventListener('click', async () => {
    const name = document.getElementById('et_name')?.value.trim();
    if (!name) { document.getElementById('et_name')?.focus(); return; }

    const owners = getSelectedOwners('et_owners');
    const rotation = document.getElementById('et_rotation')?.value || task.rotation;
    const activeMode = modeGroup?.querySelector('.admin-mode-btn--active')?.dataset.mode || 'rotate';
    const dayVal = document.getElementById('et_daySelect')?.value;
    const dedicatedDay = (rotation !== 'once' && dayVal !== '' && dayVal != null) ? parseInt(dayVal, 10) : null;
    const dedicatedDate = rotation === 'once' ? (document.getElementById('et_dedicatedDate')?.value || null) : null;
    const cooldown = document.getElementById('et_cooldown')?.value;
    const catOpt = document.getElementById('et_category')?.selectedOptions[0];
    const catIsEvent = catOpt?.dataset.event === '1';
    const eventDate = document.getElementById('et_eventDate')?.value;
    const effectiveDedicatedDate = catIsEvent && eventDate ? eventDate : dedicatedDate;

    const eventTime = catIsEvent ? (document.getElementById('et_eventTime')?.value || null) : null;
    const notes = catIsEvent ? (document.getElementById('et_notes')?.value.trim() || null) : null;
    const updated = {
      ...task,
      name,
      rotation,
      difficulty: document.getElementById('et_difficulty')?.value || task.difficulty,
      timeOfDay: document.getElementById('et_timeOfDay')?.value || task.timeOfDay,
      estMin: (v => isNaN(v) ? 10 : v)(parseInt(document.getElementById('et_estMin')?.value, 10)),
      category: document.getElementById('et_category')?.value || task.category,
      owners,
      ownerAssignmentMode: activeMode,
      dedicatedDay,
      dedicatedDate: effectiveDedicatedDate,
      eventTime,
      notes,
      cooldownDays: cooldown ? parseInt(cooldown, 10) : null,
      exempt: document.getElementById('et_exempt')?.classList.contains('chip--active') || false
    };

    // Read bounty data
    const isBounty = document.getElementById('et_bountyToggle')?.classList.contains('chip--active');
    if (isBounty) {
      const bountyType = document.querySelector('#et_bountyType .segmented-btn--active')?.dataset?.value || 'points';
      updated.bounty = {
        type: bountyType,
        amount: bountyType === 'points' ? (parseInt(document.getElementById('et_bountyAmount')?.value) || 50) : null,
        rewardId: bountyType === 'reward' ? (document.getElementById('et_bountyReward')?.value || null) : null
      };
      updated.exempt = true;
    } else {
      updated.bounty = null;
    }

    await writeTask(taskId, updated);
    tasks[taskId] = updated;

    // Auto-rebuild future schedule so edits take effect immediately
    const allSched = await readAllSchedule() || {};
    const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, { includeToday: true }, catsObj);
    await multiUpdate(futureUpdates);

    await loadData();
    closeTaskSheet();
    render();
  });
}

// ══════════════════════════════════════════
// Quick-add task (header + button)
// ══════════════════════════════════════════

function openQuickAddSheet() {
  const catsArr = Object.entries(cats).map(([key, c]) => ({ key, ...c }));
  const defaultCatKey = catsArr.find(c => c.isDefault)?.key || '';
  // FAB pre-fill (spec §3.8.1): pass activePerson as default owner when filtered.
  const sheetContent = renderQuickAddSheet(people, catsArr, defaultCatKey, rewardsData, activePerson || null);
  taskSheetMount.innerHTML = renderBottomSheet(sheetContent);
  applyDataColors(taskSheetMount);
  initOwnerChips('qa_owners');

  requestAnimationFrame(() => {
    const overlay = document.getElementById('bottomSheet');
    if (overlay) overlay.classList.add('active');
    document.getElementById('qa_name')?.focus();
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeTaskSheet(); });

  // Show/hide event date icon when category changes
  document.getElementById('qa_category')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    const isEvent = opt?.dataset.event === '1';
    const eventBtn = document.getElementById('qa_eventDateBtn');
    if (eventBtn) eventBtn.classList.toggle('is-hidden', !isEvent);
    const eventTimeGroup = document.getElementById('qa_eventTimeGroup');
    if (eventTimeGroup) eventTimeGroup.classList.toggle('is-hidden', !isEvent);
    const notesGroup = document.getElementById('qa_notesGroup');
    if (notesGroup) notesGroup.classList.toggle('is-hidden', !isEvent);
    if (isEvent) {
      const rotSelect = document.getElementById('qa_rotation');
      if (rotSelect) { rotSelect.value = 'once'; rotSelect.dispatchEvent(new Event('change')); }
    }
  });

  // Event date icon — open native date picker
  document.getElementById('qa_eventDateBtn')?.addEventListener('click', () => {
    const picker = document.getElementById('qa_eventDate');
    if (picker) { try { picker.showPicker(); } catch(e) { picker.click(); } }
  });

  // Rotation change — show/hide dedicated day vs date
  document.getElementById('qa_rotation')?.addEventListener('change', (e) => {
    const rot = e.target.value;
    const group = document.getElementById('qa_dedicatedDayGroup');
    const daySelect = document.getElementById('qa_daySelect');
    const dateRow = document.getElementById('qa_dedicatedDateRow');
    const label = document.getElementById('qa_dedicatedDayLabel');
    // Check if current category is an event
    const catOpt = document.getElementById('qa_category')?.selectedOptions[0];
    const isEvent = catOpt?.dataset.event === '1';
    if (rot === 'daily') {
      group.classList.add('is-hidden');
    } else {
      group.classList.remove('is-hidden');
      const eventBtn = label?.querySelector('#qa_eventDateBtn');
      const btnHtml = eventBtn ? eventBtn.outerHTML : '';
      if (rot === 'once') {
        daySelect.classList.add('is-hidden');
        // Events: only show 📅 icon, no date input row
        dateRow.classList.toggle('is-hidden', isEvent);
        label.innerHTML = (isEvent ? 'Event Date ' : 'Scheduled Date ') + btnHtml;
      } else {
        daySelect.classList.remove('is-hidden');
        dateRow.classList.add('is-hidden');
        label.innerHTML = 'Dedicated Day ' + btnHtml;
      }
      // Re-bind event date button after innerHTML replace
      label?.querySelector('#qa_eventDateBtn')?.addEventListener('click', () => {
        const picker = document.getElementById('qa_eventDate');
        if (picker) { try { picker.showPicker(); } catch(e2) { picker.click(); } }
      });
    }
  });

  // Assignment mode toggle
  const qaModeGroup = document.getElementById('qa_assignMode');
  if (qaModeGroup) {
    for (const btn of qaModeGroup.querySelectorAll('.admin-mode-btn')) {
      btn.addEventListener('click', () => {
        qaModeGroup.querySelectorAll('.admin-mode-btn').forEach(b => b.classList.remove('admin-mode-btn--active'));
        btn.classList.add('admin-mode-btn--active');
      });
    }
  }

  document.getElementById('qa_cancel')?.addEventListener('click', closeTaskSheet);

  // Exempt / Bounty chip toggles for quick-add
  document.getElementById('qa_exempt')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('chip--active'));
  document.getElementById('qa_bountyToggle')?.addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('chip--active');
    const bountyFields = document.getElementById('qa_bountyFields');
    if (bountyFields) bountyFields.classList.toggle('is-hidden', !e.currentTarget.classList.contains('chip--active'));
    if (e.currentTarget.classList.contains('chip--active')) document.getElementById('qa_exempt')?.classList.add('chip--active');
  });
  for (const btn of document.querySelectorAll('#qa_bountyType .segmented-btn')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#qa_bountyType .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      document.getElementById('qa_bountyPointsField').classList.toggle('is-hidden', btn.dataset.value !== 'points');
      document.getElementById('qa_bountyRewardField').classList.toggle('is-hidden', btn.dataset.value !== 'reward');
    });
  }

  document.getElementById('qa_save')?.addEventListener('click', async () => {
    const name = document.getElementById('qa_name')?.value.trim();
    if (!name) { document.getElementById('qa_name')?.focus(); return; }

    const owners = getSelectedOwners('qa_owners');
    const catKey = document.getElementById('qa_category')?.value || '';
    const isEvent = !!cats[catKey]?.isEvent;
    const eventDate = document.getElementById('qa_eventDate')?.value || '';
    const rotation = isEvent && eventDate ? 'once' : (document.getElementById('qa_rotation')?.value || 'daily');

    // Read assignment mode
    const activeModeBtn = document.querySelector('#qa_assignMode .admin-mode-btn--active');
    const assignMode = isEvent ? 'fixed' : (activeModeBtn?.dataset.mode || 'rotate');

    // Read dedicated day/date
    const dayVal = document.getElementById('qa_daySelect')?.value;
    const dedicatedDay = (rotation !== 'once' && dayVal !== '' && dayVal != null) ? parseInt(dayVal, 10) : null;
    const dedicatedDate = isEvent && eventDate ? eventDate : (rotation === 'once' ? (document.getElementById('qa_dedicatedDate')?.value || null) : null);

    const eventTime = isEvent ? (document.getElementById('qa_eventTime')?.value || null) : null;
    const notes = isEvent ? (document.getElementById('qa_notes')?.value.trim() || null) : null;
    const taskData = {
      name,
      rotation,
      difficulty: document.getElementById('qa_difficulty')?.value || 'medium',
      timeOfDay: document.getElementById('qa_timeOfDay')?.value || 'anytime',
      estMin: (v => isNaN(v) ? 10 : v)(parseInt(document.getElementById('qa_estMin')?.value, 10)),
      category: catKey,
      owners,
      ownerAssignmentMode: assignMode,
      dedicatedDay,
      dedicatedDate,
      eventTime,
      notes,
      cooldownDays: parseInt(document.getElementById('qa_cooldown')?.value, 10) || null,
      exempt: !!document.getElementById('qa_exempt')?.classList.contains('chip--active'),
      status: 'active',
      createdDate: today
    };

    // Read bounty data
    const isBounty = document.getElementById('qa_bountyToggle')?.classList.contains('chip--active');
    if (isBounty) {
      const bountyType = document.querySelector('#qa_bountyType .segmented-btn--active')?.dataset?.value || 'points';
      taskData.bounty = {
        type: bountyType,
        amount: bountyType === 'points' ? (parseInt(document.getElementById('qa_bountyAmount')?.value) || 50) : null,
        rewardId: bountyType === 'reward' ? (document.getElementById('qa_bountyReward')?.value || null) : null
      };
      taskData.exempt = true;
    } else {
      taskData.bounty = null;
    }

    const newId = await pushTask(taskData);
    tasks[newId] = taskData;

    // Create schedule entry: event/once with date goes on that date, otherwise today
    // Skip today for weekly/monthly with dedicatedDay that isn't today
    const skipToday = (taskData.rotation === 'once' && dedicatedDate && dedicatedDate !== today)
      || ((taskData.rotation === 'weekly' || taskData.rotation === 'monthly') && taskData.dedicatedDay != null && dayOfWeek(today) !== taskData.dedicatedDay);
    const schedDate = dedicatedDate || today;
    if (owners.length > 0 && !skipToday) {
      const schedUpdates = {};
      const mode = taskData.ownerAssignmentMode || 'rotate';
      const timeOfDay = taskData.timeOfDay || 'anytime';
      const baseEntry = { taskId: newId, rotationType: taskData.rotation, ownerAssignmentMode: mode, ...(taskData.notes ? { notes: taskData.notes } : {}) };
      let qaCounter = 0;
      const qaKey = () => `sched_${Date.now()}_qa_${String(qaCounter++).padStart(3, '0')}`;

      if (mode === 'duplicate') {
        for (const oid of owners) {
          if (timeOfDay === 'both') {
            schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId: oid, timeOfDay: 'am' };
            schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId: oid, timeOfDay: 'pm' };
          } else {
            schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId: oid, timeOfDay };
          }
        }
      } else {
        // Use proper rotation owner instead of always first owner
        const ownerId = mode === 'fixed' ? owners[0] : getRotationOwner(taskData, today, newId);
        if (timeOfDay === 'both') {
          schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId, timeOfDay: 'am' };
          schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId, timeOfDay: 'pm' };
        } else {
          schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId, timeOfDay };
        }
      }
      await multiUpdate(schedUpdates);
    }

    // Rebuild future schedule so the new task appears on upcoming days
    const allSched = await readAllSchedule() || {};
    const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, undefined, catsObj);
    await multiUpdate(futureUpdates);

    await loadData();
    closeTaskSheet();
    render();
  });
}

function openAddMenu() {
  const options = [
    { key: 'event', label: 'New Event', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>' },
    { key: 'task', label: 'New Task', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>' },
    { key: 'meal', label: 'New Meal',
      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>' }
  ];
  const html = renderAddMenu(options);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  applyDataColors(taskSheetMount);
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  taskSheetMount.querySelectorAll('.add-menu__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      closeTaskSheet();
      if (action === 'event') {
        setTimeout(() => openEventForm(), 320);
      } else if (action === 'task') {
        setTimeout(() => openQuickAddSheet(), 320);
      } else if (action === 'meal') {
        setTimeout(() => openMealPlanSheet('dinner'), 320);
      }
    });
  });
}

// Bind the header buttons
document.getElementById('headerThemeBtn')?.addEventListener('click', () => {
  openDeviceThemeSheet(
    document.getElementById('taskSheetMount'),
    settings?.theme,
    linkedPerson ? () => render() : undefined,
    linkedPerson ? { person: linkedPerson, writePerson } : undefined
  );
});

// ══════════════════════════════════════════
// Real-time listeners
// ══════════════════════════════════════════

const debouncedRender = debounce(() => render(), 100);

// Completions listener — stays active for the lifetime of the page
onCompletions(async (val) => {
  completions = val || {};
  await loadData();
  debouncedRender();
});

// Events listener — stays active for the lifetime of the page
onEvents((val) => {
  events = val || {};
  debouncedRender();
});

// Multipliers listener — drives the multiplier banner.
onMultipliers((val) => {
  multipliers = val || {};
  debouncedRender();
});

// Person filter chip tap (re-rendered every render; use delegation on body).
document.body.addEventListener('click', (ev) => {
  if (ev.target.closest('#openFilterSheet')) openPersonFilterSheet();
});

// Schedule listener — resubscribed when viewDate changes
let unsubscribeSchedule = null;

function subscribeSchedule(dateKey) {
  if (unsubscribeSchedule) unsubscribeSchedule();
  unsubscribeSchedule = onScheduleDay(dateKey, (val) => {
    viewEntries = val || {};
    debouncedRender();
  });
}

// ══════════════════════════════════════════
// Daily rollover — create snapshots for past days
// ══════════════════════════════════════════

async function runRollover() {
  const [allSched, existingSnapshots, existingStreaks] = await Promise.all([
    readAllSchedule(),
    readOnce('snapshots'),
    readOnce('streaks')
  ]);

  const { updates, snapshotCount } = computeRollover(
    today, allSched || {}, completions, tasks, cats, settings,
    people, existingSnapshots || {}, existingStreaks || {}
  );

  if (snapshotCount > 0) {
    await multiUpdate(updates);
  }
}

// ══════════════════════════════════════════
// Initial load
// ══════════════════════════════════════════

// Subscribe to today's schedule (fires immediately with current data)
subscribeSchedule(viewDate);
// Load overdue items (one-shot, spans multiple past dates)
await loadData();
// listeners will trigger debouncedRender; run render immediately for first paint
render();
runRollover(); // fire-and-forget, don't block UI

} // end person-not-found else
