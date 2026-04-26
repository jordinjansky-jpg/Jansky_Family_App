import { initFirebase, isFirstRun, readSettings, readPeople, readTasks, readCategories, readAllSchedule, readEvents, writeCompletion, removeCompletion, writeTask, pushTask, pushEvent, writeEvent, removeEvent, writePerson, onConnectionChange, onValue, onCompletions, onEvents, onScheduleDay, onMultipliers, readOnce, multiUpdate, onAllMessages, writeMessage, markMessageSeen, removeMessage, writeBankToken, markBankTokenUsed, readBank, readRewards, removeData, writeMultiplier, removeMessagesByEntryKey, removeLatestBankToken, readMeals, readMealLibrary, writeMeal, removeMeal, pushMealLibrary, writeMealLibrary, removeMealLibrary } from './shared/firebase.js';
import { renderNavBar, renderHeader, renderEmptyState, renderPersonFilter, renderProgressBar, renderTaskCard, renderTimeHeader, renderOverdueBanner, renderCelebration, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderQuickAddSheet, renderEditTaskSheet, renderEventBubble, renderEventDetailSheet, renderEventForm, renderAddMenu, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm, applyDataColors, renderBanner, renderFab, renderSectionHead, renderOverflowMenu, renderFilterChip, renderPersonFilterSheet, renderDashboardSkeleton, renderAmbientStrip, renderComingUp, renderMealPlanSheet, renderMealDetailSheet, renderMealEditorSheet, renderMealManageSheet, renderWeatherSheet } from './shared/components.js';
import { fetchWeather, fetchForecast } from './shared/weather.js';
import { initOwnerChips, getSelectedOwners } from './shared/dom-helpers.js';
import { applyTheme, loadCachedTheme, defaultThemeConfig, resolveTheme } from './shared/theme.js';
import { todayKey, addDays, formatDateLong, formatDateShort, DAY_NAMES, dayOfWeek, escapeHtml, debounce } from './shared/utils.js';
const esc = (s) => escapeHtml(String(s ?? ''));
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
let mealLibrary = (await readMealLibrary()) || {};
let viewMeals = (await readMeals(today)) || {};
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
  items.push({ id: 'rewards', label: 'Rewards' });
  items.push({ id: 'admin', label: 'Admin' });
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
      if (itemId === 'rewards') {
        // Rewards store currently lives on scoreboard; dedicated sheet lands in Phase 6.
        location.href = 'scoreboard.html';
      } else if (itemId === 'admin') {
        location.href = 'admin.html';
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
    const dinnerEntry = (dinnerPlan?.mealId && mealLibrary[dinnerPlan.mealId]) || null;
    const dinnerData = dinnerEntry ? { name: dinnerEntry.name, source: dinnerPlan.source } : null;
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
    viewMeals = (await readMeals(viewDate)) || {};
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
      if (!dinnerPlan?.mealId || !mealLibrary[dinnerPlan.mealId]) return;
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
        if (dinnerPlan?.mealId && mealLibrary[dinnerPlan.mealId]) {
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
        viewMeals = (await readMeals(viewDate)) || {};
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
  viewMeals = (await readMeals(viewDate)) || {};
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
  const currentMealId = viewMeals?.[preSlot]?.mealId || null;
  const html = renderMealPlanSheet({ date, slot: preSlot, library: mealLibrary, currentMealId });
  taskSheetMount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  const searchInput = document.getElementById('mp_search');
  const resultsDiv = document.getElementById('mp_results');
  const inlineEditor = document.getElementById('mp_inlineEditor');
  let selectedSlot = preSlot;
  let selectedMealId = currentMealId;

  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  // Slot tab switching
  document.getElementById('mp_slotTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.mp-slot-tab');
    if (!btn) return;
    selectedSlot = btn.dataset.slot;
    selectedMealId = viewMeals?.[selectedSlot]?.mealId || null;
    document.getElementById('mp_selectedMealId').value = selectedMealId || '';
    document.querySelectorAll('.mp-slot-tab').forEach(b => {
      b.classList.toggle('is-active', b.dataset.slot === selectedSlot);
      b.setAttribute('aria-selected', b.dataset.slot === selectedSlot);
    });
    const removeLink = document.getElementById('mp_removeLink');
    if (removeLink) {
      const cur = viewMeals?.[selectedSlot];
      removeLink.style.display = (cur?.mealId && mealLibrary[cur.mealId]) ? '' : 'none';
      if (cur?.mealId && mealLibrary[cur.mealId]) {
        removeLink.textContent = `Remove "${mealLibrary[cur.mealId].name}" from this slot`;
      }
    }
    filterOptions('');
    searchInput.value = '';
  });

  const searchRow = document.querySelector('.mp-search-row');

  function filterOptions(query) {
    const q = query.toLowerCase().trim();
    const entries = Object.entries(mealLibrary).sort(([, a], [, b]) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (b.lastUsed || 0) - (a.lastUsed || 0);
    });
    const filtered = q ? entries.filter(([, m]) => m.name.toLowerCase().includes(q)) : entries;
    const checkSvg = `<svg class="meal-option__check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
    resultsDiv.innerHTML = filtered.map(([id, m]) =>
      `<button class="meal-option${id === selectedMealId ? ' is-selected' : ''}"
               data-meal-id="${esc(id)}" type="button">
        <span class="meal-option__name">${esc(m.name)}</span>
        ${checkSvg}
      </button>`
    ).join('');
    bindOptionClicks();
  }

  function bindOptionClicks() {
    resultsDiv.querySelectorAll('.meal-option').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMealId = btn.dataset.mealId;
        document.getElementById('mp_selectedMealId').value = selectedMealId;
        resultsDiv.querySelectorAll('.meal-option').forEach(b =>
          b.classList.toggle('is-selected', b.dataset.mealId === selectedMealId)
        );
      });
    });
  }

  searchInput?.addEventListener('input', () => filterOptions(searchInput.value));
  bindOptionClicks();

  // "+" opens full meal editor and returns to this slot on save
  document.getElementById('mp_createNew')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(null, preSlot), 320);
  });

  // Remove existing assignment
  document.getElementById('mp_removeLink')?.addEventListener('click', async () => {
    const planDate = document.getElementById('mp_date').value || viewDate;
    await removeMeal(planDate, selectedSlot);
    viewMeals = (await readMeals(viewDate)) || {};
    closeTaskSheet();
    render();
  });

  // Save
  document.getElementById('mpForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const planDate = document.getElementById('mp_date').value || viewDate;

    if (!inlineEditor.hidden) {
      // Create new meal inline
      const inlineName = document.getElementById('mp_inlineName').value.trim();
      if (!inlineName) {
        document.getElementById('mp_inlineNameError').textContent = 'Name is required';
        return;
      }
      const inlineUrl = document.getElementById('mp_inlineUrl').value.trim() || null;
      const newId = await pushMealLibrary({
        name: inlineName,
        url: inlineUrl,
        ingredients: [],
        tags: [],
        notes: null,
        prepTime: null,
        isFavorite: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastUsed: firebase.database.ServerValue.TIMESTAMP,
      });
      mealLibrary[newId] = { name: inlineName, url: inlineUrl, ingredients: [], tags: [], isFavorite: false, notes: null, prepTime: null };
      await writeMeal(planDate, selectedSlot, { mealId: newId, source: 'manual' });
    } else {
      if (!selectedMealId) return;
      await writeMeal(planDate, selectedSlot, { mealId: selectedMealId, source: 'manual' });
      const entry = mealLibrary[selectedMealId];
      if (entry) {
        await writeMealLibrary(selectedMealId, { ...entry, lastUsed: firebase.database.ServerValue.TIMESTAMP });
        entry.lastUsed = Date.now();
      }
    }

    viewMeals = (await readMeals(viewDate)) || {};
    mealLibrary = (await readMealLibrary()) || {};
    closeTaskSheet();
    render();
  });
}

function openMealDetailSheet(planEntry, slot) {
  const meal = planEntry?.mealId ? mealLibrary[planEntry.mealId] : null;
  const html = renderMealDetailSheet(meal, planEntry, false);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  // Pencil button in header — open full editor, return to recipe view on save
  document.getElementById('mdEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(planEntry.mealId, slot), 320);
  });
}

function openMealManageSheet(planEntry, slot) {
  const meal = planEntry?.mealId ? mealLibrary[planEntry.mealId] : null;
  if (!meal) return;
  taskSheetMount.innerHTML = renderBottomSheet(renderMealManageSheet(meal, slot));
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('mdEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealEditorSheet(planEntry.mealId, slot), 320);
  });

  document.getElementById('mdChange')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealPlanSheet(slot), 320);
  });

  document.getElementById('mdRemove')?.addEventListener('click', async () => {
    await removeMeal(viewDate, slot);
    viewMeals = (await readMeals(viewDate)) || {};
    closeTaskSheet();
    render();
  });
}

function openMealEditorSheet(mealId = null, returnSlot = null) {
  const meal = mealId ? mealLibrary[mealId] : null;
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
    const allMealsSnap = await readOnce('meals');
    const cascadeUpdates = {};
    if (allMealsSnap) {
      for (const [dateKey, slots] of Object.entries(allMealsSnap)) {
        for (const [s, entry] of Object.entries(slots || {})) {
          if (entry?.mealId === mealId) cascadeUpdates[`meals/${dateKey}/${s}`] = null;
        }
      }
    }
    cascadeUpdates[`mealLibrary/${mealId}`] = null;
    await multiUpdate(cascadeUpdates);
    delete mealLibrary[mealId];
    viewMeals = (await readMeals(viewDate)) || {};
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
      await writeMealLibrary(mealId, data);
      mealLibrary[mealId] = data;
    } else {
      const newId = await pushMealLibrary({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      mealLibrary[newId] = data;
    }
    closeTaskSheet();
    if (returnSlot) setTimeout(() => openMealPlanSheet(returnSlot), 320);
    render();
  });
}

function openEventForm(existingEventId = null) {
  // FAB pre-fill (spec §3.8.1): when filtered, default the new event's people
  // to the active person so creating an event for that person is one tap fewer.
  const event = existingEventId
    ? events[existingEventId]
    : (activePerson ? { people: [activePerson] } : {});
  const mode = existingEventId ? 'edit' : 'create';
  const html = renderEventForm({ event, eventId: existingEventId, people, dateKey: viewDate, mode });
  taskSheetMount.innerHTML = renderBottomSheet(html);
  applyDataColors(taskSheetMount);

  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    if (mode === 'create') document.getElementById('ef_name')?.focus();
  });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });

  document.getElementById('ef_allDay')?.addEventListener('click', () => {
    const btn = document.getElementById('ef_allDay');
    btn.classList.toggle('chip--active');
    const hide = btn.classList.contains('chip--active');
    document.getElementById('ef_timeGroup')?.classList.toggle('ef-time-row--hidden', hide);
    document.getElementById('ef_endTimeGroup')?.classList.toggle('ef-time-row--hidden', hide);
  });

  document.querySelectorAll('#ef_colors .dt-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ef_colors .dt-color-btn').forEach(b => b.classList.remove('dt-color-btn--active'));
      btn.classList.add('dt-color-btn--active');
    });
  });

  document.querySelectorAll('#ef_people .chip--selectable').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  });

  document.getElementById('ef_cancel')?.addEventListener('click', closeTaskSheet);

  document.getElementById('ef_save')?.addEventListener('click', async () => {
    const name = document.getElementById('ef_name')?.value.trim();
    if (!name) { document.getElementById('ef_name')?.focus(); return; }

    const selectedPeople = [];
    document.querySelectorAll('#ef_people .chip--active').forEach(c => {
      if (c.dataset.personId) selectedPeople.push(c.dataset.personId);
    });

    const selectedColor = document.querySelector('#ef_colors .dt-color-btn--active')?.dataset.color
      || (selectedPeople[0] ? people.find(p => p.id === selectedPeople[0])?.color : null)
      || '#4285f4';

    const eventData = {
      name,
      date: document.getElementById('ef_date')?.value || viewDate,
      allDay: document.getElementById('ef_allDay')?.classList.contains('chip--active') || false,
      startTime: document.getElementById('ef_allDay')?.classList.contains('chip--active') ? null : (document.getElementById('ef_startTime')?.value || null),
      endTime: document.getElementById('ef_allDay')?.classList.contains('chip--active') ? null : (document.getElementById('ef_endTime')?.value || null),
      color: selectedColor,
      people: selectedPeople,
      location: document.getElementById('ef_location')?.value.trim() || null,
      notes: document.getElementById('ef_notes')?.value.trim() || null,
      url: document.getElementById('ef_url')?.value.trim() || null,
      createdDate: todayKey(settings?.timezone || 'America/Chicago')
    };

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
      await multiUpdate({
        [`schedule/${eventData.date}/${schedKey}`]: { type: 'event', eventId: newId }
      });
    }

    closeTaskSheet();
    render();
  });

  document.getElementById('ef_delete')?.addEventListener('click', async () => {
    if (!existingEventId) return;
    if (!await showConfirm({ title: 'Delete this event?', danger: true })) return;
    await removeEvent(existingEventId);
    delete events[existingEventId];
    closeTaskSheet();
    render();
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
