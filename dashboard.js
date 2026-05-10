import { initFirebase, isFirstRun, readSettings, writeSettings, readPeople, readTasks, readCategories, readAllSchedule, readEvents, writeCompletion, removeCompletion, writeTask, pushTask, pushEvent, writeEvent, removeEvent, writePerson, onConnectionChange, onValue, onCompletions, onEvents, onScheduleDay, onMultipliers, readOnce, multiUpdate, onAllMessages, writeMessage, markMessageSeen, removeMessage, writeBankToken, markBankTokenUsed, removeBankToken, readBank, readRewards, removeData, writeMultiplier, removeMessagesByEntryKey, removeLatestBankToken, readKitchenPlan, readKitchenRecipes, writeKitchenPlanSlot, removeKitchenPlanSlot, pushKitchenRecipe, writeKitchenRecipe, removeKitchenRecipe, readKitchenLists, pushKitchenItem, readIcalFeeds, writeIcalFeed, writeIcalFeedLastSync } from './shared/firebase.js';
import { renderNavBar, initNavMore, renderHeader, renderEmptyState, renderPersonFilter, renderProgressBar, renderTaskCard, renderTimeHeader, renderPersonHeader, renderOverdueBanner, renderCelebration, renderUndoToast, renderGradeBadge, renderTaskDetailSheet, renderBottomSheet, renderEventBubble, renderEventDetailSheet, renderEventForm, renderAddMenu, openDeviceThemeSheet, initOfflineBanner, initBell, showConfirm, applyDataColors, renderBanner, renderFab, renderSectionHead, renderOverflowMenu, renderFilterChip, renderPersonFilterSheet, renderDashboardSkeleton, renderAmbientStrip, renderComingUp, renderDashboardTile, getWeatherGlyph, renderMealDetailSheet, renderMealEditorSheet, renderWeatherSheet, renderRepeatSheet, renderTaskForm, renderChipPicker, bindChipPicker, openIcalUrlSubsheet, openEventPhotoSourceSheet } from './shared/components.js';
import { fetchWeather, fetchForecast } from './shared/weather.js';
import { resizeImageForUpload, renderConfirmRow, openMonthClarificationSheet } from './shared/ai-helpers.js';
import { applyTheme, loadCachedTheme, defaultThemeConfig, resolveTheme, applyTaskDisplayPrefs, applyTextSize } from './shared/theme.js';
import { todayKey, addDays, formatDateLong, formatDateShort, DAY_NAMES, dayOfWeek, escapeHtml, debounce } from './shared/utils.js';
const esc = (s) => escapeHtml(String(s ?? ''));
const KITCHEN_WORKER_URL = 'https://kitchen-import.jordin-jansky.workers.dev';
import { isComplete, filterByPerson, filterEventsByPerson, getEventsForDate, getEventsForRange, sortEvents, groupByFrequency, dayProgress, getOverdueEntries, getOverdueCooldownTaskIds, isAllDone, sortEntries, groupBySectionsTOD, normalizeTaskGrouping } from './shared/state.js';
import { bindTaskRowGesture, closeTaskSheet as closeTaskSheetShared } from './shared/dom-helpers.js';
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
applyTaskDisplayPrefs(settings);
// Sync text size from Firebase (person override applied after linkedPerson is resolved below)
if (settings?.textSize) applyTextSize(settings.textSize);
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

// Apply person text size override now that linkedPerson is resolved
if (linkedPerson?.prefs?.textSize) applyTextSize(linkedPerson.prefs.textSize);

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
let renderPending = false; // set when render() is called while a prior render is in flight; triggers a follow-up render after the current one completes
let pendingApprovalCount = 0; // unseen redemption-request / use-request across all family inboxes; drives the "approvals" banner

// ── Person link title (uses app name from Firebase settings) ──
if (linkedPerson) document.title = `${esc(linkedPerson.name)}'s ${settings?.appName || 'Daily Rundown'}`;

// ── Header & Nav ──
// More menu is rendered by the shared initNavMore (icons + page list match
// every other page). The dashboard wires it after renderNavBar below.

function wireHeaderActions() {
  document.getElementById('headerAdmin')?.addEventListener('click', () => { location.href = 'admin.html'; });
}

function openAddMenuFromFab() { openAddMenu?.(); }

function renderHeaderMount() {
  const title = linkedPerson ? linkedPerson.name : 'Home';
  const subtitle = formatDateLong(viewDate);
  document.getElementById('headerMount').innerHTML = renderHeader({
    title,
    subtitle,
    showBell: true,
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

// 5-tab bottom nav with More → shared initNavMore (matches every other page).
document.getElementById('navMount').innerHTML = renderNavBar('home', { onMoreClick: true });
initNavMore(
  document.getElementById('taskSheetMount'),
  () => settings?.theme,
  linkedPerson ? { person: linkedPerson, writePerson, displayDefaults: settings } : undefined,
  linkedPerson ? undefined : { settings, writeSettings, displayDefaults: settings },
  () => render()
);

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
initBell(() => people, () => rewardsData, onAllMessages, { writeMessageFn: writeMessage, markMessageSeenFn: markMessageSeen, removeMessageFn: removeMessage, writeBankTokenFn: writeBankToken, markBankTokenUsedFn: markBankTokenUsed, removeBankTokenFn: removeBankToken, readBankFn: readBank, writeMultiplierFn: writeMultiplier, getTodayFn: () => today, approverName: linkedPerson?.name || null });

// ── Pending-approvals banner driver ──
// Subscribe separately from initBell so the dashboard knows about unseen
// requests even when the bell isn't open. Triggers a render to refresh the
// banner queue whenever the count changes.
onAllMessages((allMsgs) => {
  let count = 0;
  for (const msgs of Object.values(allMsgs || {})) {
    if (!msgs) continue;
    for (const msg of Object.values(msgs)) {
      if ((msg.type === 'redemption-request' || msg.type === 'use-request') && !msg.seen) count++;
    }
  }
  if (count !== pendingApprovalCount) {
    pendingApprovalCount = count;
    if (typeof render === 'function') render();
  }
});

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
  if (renderInFlight) {
    // A render is already underway. Mark that another one is needed once it
    // finishes — otherwise settings/data changes that landed during the in-flight
    // render would be silently lost (e.g., toggling grouping never re-renders).
    renderPending = true;
    return;
  }
  renderInFlight = true;
  try {
  clearTimeout(activePressTimer);
  activePressTimer = null;
  // Re-apply display/text prefs on every render so person overrides stay in sync
  applyTaskDisplayPrefs(settings, linkedPerson?.prefs);
  const _ts = linkedPerson?.prefs?.textSize || settings?.textSize;
  if (_ts) applyTextSize(_ts);
  const _dp = linkedPerson?.prefs || {};
  const showTodIconBoth   = _dp.showTodIconBoth   !== undefined ? !!_dp.showTodIconBoth   : !!settings?.showTodIconBoth;
  const showTodIconSingle = _dp.showTodIconSingle !== undefined ? !!_dp.showTodIconSingle : !!settings?.showTodIconSingle;
  const avatarStyle   = _dp.avatarStyle   || settings?.avatarStyle   || 'tab';
  const taskGrouping  = normalizeTaskGrouping(_dp.taskGrouping || settings?.taskGrouping);
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

  // Back-to-Today lives in the header center slot — update it directly so it
  // never displaces page content. Animate only on the transition away from today.
  const headerCenter = document.getElementById('headerCenter');
  if (headerCenter) {
    if (!isToday) {
      const enterCls = lastRenderedIsToday ? ' is-entering' : '';
      const chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
      headerCenter.innerHTML = `<button class="back-to-today__btn${enterCls}" id="goToday" type="button"><span class="back-to-today__chevron" aria-hidden="true">${chevronSvg}</span><span>Back to Today</span></button>`;
    } else {
      headerCenter.innerHTML = '';
    }
  }
  lastRenderedIsToday = isToday;

  // === Ambient strip (spec §3.3) ===
  // Gated on settings.ambientStrip; renders zero pixels until 1.3 + 1.4 wire data.
  // Both chips render with nudge copy when their data source is absent.
  if (settings?.ambientStrip ?? true) {
    const weatherData = await fetchWeather(viewDate, settings);
    lastWeatherData = weatherData;
    const dinnerPlan = viewMeals?.dinner;
    const dinnerEntry = dinnerPlan?.recipeId ? recipes[dinnerPlan.recipeId] : null;
    const dinnerName = dinnerEntry?.name || dinnerPlan?.customName || null;

    // Weather tile
    let weatherValue = '—° · Set location';
    let weatherGlyph = getWeatherGlyph('cloud');
    if (weatherData) {
      if (weatherData.isPast) weatherValue = 'Past day';
      else if (weatherData.isFuture) weatherValue = '—° · No forecast yet';
      else {
        weatherValue = `${esc(weatherData.conditionLabel)} · ${esc(weatherData.tempLabel)}`;
        weatherGlyph = getWeatherGlyph(weatherData.glyph);
      }
    }
    const weatherTile = renderDashboardTile({
      label: 'Weather',
      value: weatherValue,
      icon: weatherGlyph,
      iconColor: 'var(--ambient-weather-fg)',
      action: 'weather',
      empty: !weatherData || weatherData.isPast || weatherData.isFuture
    });

    // Dinner tile — empty state uses verb form ("Plan dinner") + chevron via the
    // tile's built-in empty-action affordance so the tap target reads as actionable
    // rather than as static status.
    const dinnerTile = renderDashboardTile({
      label: 'Dinner',
      value: dinnerName || 'Plan dinner',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>',
      iconColor: 'var(--ambient-dinner-fg)',
      action: 'dinner',
      empty: !dinnerName
    });

    html += `<div class="dashboard-tiles">${weatherTile}${dinnerTile}</div>`;
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
      // Was "clear week" — read as a destructive button label instead of the empty-state phrase it is.
      cuSummary = cuFilterPersonName ? `nothing this week for ${cuFilterPersonName}` : 'nothing coming up';
    } else {
      const cuNoun = cuTotalEvents === 1 ? 'event' : 'events';
      cuSummary = cuFilterPersonName
        ? `${cuTotalEvents} ${cuNoun} for ${cuFilterPersonName} this week`
        : `${cuTotalEvents} ${cuNoun} this week`;
    }
    // Flatten day-blocks into a single sorted list of {dateLabel, title, eventId}
    const cuItems = cuDays.flatMap(d =>
      d.events.map(([eventId, ev]) => ({
        dateLabel: `${d.dayLabel.dow} ${d.dayLabel.monthDay}`,
        title: ev.name || '',
        eventId
      }))
    );
    // Hide the rail entirely when nothing's coming up — empty-state copy was
    // dashboard noise. The rail will reappear automatically once any event
    // lands within the next 7 days.
    if (cuTotalEvents > 0) {
      html += renderComingUp({
        items: cuItems,
        expanded: comingUpExpanded,
        summary: cuSummary,
        filterPersonName: cuFilterPersonName
      });
    }
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
      html += isToday
        ? renderEmptyState('', '', '', { variant: 'free-day' })
        : renderEmptyState('', '', '', { variant: 'future-empty' });
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
      const gradeColorClass = score.percentage >= 90 ? '' : score.percentage >= 70 ? ' grade--warn' : ' grade--bad';
      metaPieces.push(`<span class="section__meta__grade${gradeColorClass}">${esc(gd.grade)}</span>`);
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
    {
      const progPct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
      html += `<div class="progress-bar progress-bar--slim" role="progressbar" aria-valuenow="${progPct}" aria-valuemin="0" aria-valuemax="100" aria-label="${prog.done} of ${prog.total} tasks done"><div class="progress-bar__fill" data-progress="${progPct}"></div></div>`;
    }

    // Per-person daily possible — needed to normalize task base pts into store pts.
    // Store pts = round(taskBasePoints / ownerDailyPossible × 100)
    const entriesByOwner = {};
    for (const [ek, en] of Object.entries(filtered)) {
      if (!entriesByOwner[en.ownerId]) entriesByOwner[en.ownerId] = {};
      entriesByOwner[en.ownerId][ek] = en;
    }
    const ownerDailyPossible = {};
    for (const [ownerId, ownerEntries] of Object.entries(entriesByOwner)) {
      const { possible } = dailyPossible(ownerEntries, tasks, cats, settings?.difficultyMultipliers);
      ownerDailyPossible[ownerId] = possible || 1;
    }

    // Sort all entries together with the new sort rule (incomplete before complete,
    // owner -> late-today-first -> TOD -> name).
    const sortedAll = sortEntries(filtered, completions, tasks, people, today);

    const renderCard = (entryKey, entry) => {
      const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
      const person = people.find(p => p.id === entry.ownerId);
      const cat = task.category ? cats[task.category] : null;
      const rawPts = basePoints(task, settings?.difficultyMultipliers);
      const storePts = Math.round(rawPts / ownerDailyPossible[entry.ownerId] * 100);
      const ovr = completions[entryKey]?.pointsOverride ?? entry.pointsOverride ?? null;
      const done = isComplete(entryKey, completions);
      return renderTaskCard({
        entryKey,
        entry: { ...entry, dateKey: viewDate },
        task,
        person,
        category: cat,
        completed: done,
        overdue: false,
        points: { possible: storePts, override: ovr },
        isEvent: !!cat?.isEvent,
        avatarStyle,
        showTodIconBoth,
        showTodIconSingle,
        isPastDaily: !done && viewDate < today && entry.rotationType === 'daily'
      });
    };

    if (taskGrouping === 'minimal') {
      // Flat sorted list, no headers.
      for (const [entryKey, entry] of sortedAll) {
        html += renderCard(entryKey, entry);
      }
    } else {
      // 'grouped' and 'focus' both group by person → AM/Anytime/PM. They differ
      // only in where completed entries land:
      //   grouped → per-person Completed section at the end of each person
      //   focus   → one shared Completed section at the very bottom
      const groups = groupBySectionsTOD(sortedAll, people, tasks, completions);
      const pooledCompleted = [];
      for (const { person, am, anytime, pm, completed } of groups) {
        html += renderPersonHeader(person?.name || '?', person?.color);
        if (am.length)      { html += renderTimeHeader('Morning');   for (const [ek, en] of am)      html += renderCard(ek, en); }
        if (anytime.length) { html += renderTimeHeader('Anytime');   for (const [ek, en] of anytime) html += renderCard(ek, en); }
        if (pm.length)      { html += renderTimeHeader('Afternoon'); for (const [ek, en] of pm)      html += renderCard(ek, en); }
        if (taskGrouping === 'grouped' && completed.length) {
          html += renderTimeHeader(`Completed (${completed.length})`);
          for (const [ek, en] of completed) html += renderCard(ek, en);
        } else if (taskGrouping === 'focus') {
          for (const pair of completed) pooledCompleted.push(pair);
        }
      }
      if (taskGrouping === 'focus' && pooledCompleted.length) {
        html += renderTimeHeader(`Completed (${pooledCompleted.length})`);
        for (const [ek, en] of pooledCompleted) html += renderCard(ek, en);
      }
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
    // If a render() call landed while we were busy, run it now.
    if (renderPending) {
      renderPending = false;
      render();
    }
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
  // 4. Pending approvals (kid reward requests etc.).
  // Persistent until the parent acts — solves the "I missed the bell dot in the
  // brief unseen window" problem by surfacing the queue at the top of the page.
  if (pendingApprovalCount > 0) {
    const n = pendingApprovalCount;
    const openBell = () => document.getElementById('headerBell')?.click();
    return {
      variant: 'approvals',
      title: `${n} pending ${n === 1 ? 'approval' : 'approvals'}`,
      message: 'Tap to review.',
      action: { label: 'Review', onClick: openBell },
      bodyClickable: true,
      onBodyClick: openBell
    };
  }
  // 5. Multiplier.
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
      showTodIconBoth:   linkedPerson?.prefs?.showTodIconBoth   !== undefined ? !!linkedPerson.prefs.showTodIconBoth   : !!settings?.showTodIconBoth,
      showTodIconSingle: linkedPerson?.prefs?.showTodIconSingle !== undefined ? !!linkedPerson.prefs.showTodIconSingle : !!settings?.showTodIconSingle,
      isPastDaily: false
    });
  }).join('');
  const body = `<h3 class="sheet-section-title">Overdue tasks</h3>${cards || renderEmptyState('', 'Nothing overdue', '')}`;
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

  // Task card: tap to toggle, long-press to open detail sheet (shared helper).
  main.querySelectorAll('.task-card').forEach(btn => {
    bindTaskRowGesture(btn, {
      longPressMs: settings?.longPressMs ?? 800,
      onTap: (ek, dk) => toggleTask(ek, dk || viewDate),
      onLongPress: (ek, dk) => openTaskSheet(ek, dk || viewDate),
      isTapBlocked: (ek, dk) => {
        // Past incomplete daily tasks: tap routes to detail sheet (per-spec, can't toggle).
        const entry = viewEntries[ek] || overdueItems.find(o => o.entryKey === ek);
        const date = dk || viewDate;
        return !!(entry && date < today && entry.rotationType === 'daily' && !isComplete(ek, completions));
      },
    });
  });

  // Dashboard tiles — tap = open sheet, dinner tile long-press = manage
  main.querySelectorAll('.dashboard-tile[data-tile-action]').forEach(tile => {
    let didLongPress = false;
    let pressTimer = null;
    let startX = 0, startY = 0;

    tile.addEventListener('pointerdown', e => {
      didLongPress = false;
      startX = e.clientX; startY = e.clientY;
      const which = tile.dataset.tileAction;
      if (which !== 'dinner') return;
      const dinnerPlan = viewMeals?.dinner;
      if (!dinnerPlan?.recipeId && !dinnerPlan?.customName) return;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        pressTimer = null;
        openMealDetailSheet(dinnerPlan, 'dinner');
      }, settings?.longPressMs ?? 800);
    });

    tile.addEventListener('pointermove', e => {
      if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
        clearTimeout(pressTimer); pressTimer = null;
      }
    });

    tile.addEventListener('pointerup', () => { clearTimeout(pressTimer); pressTimer = null; });
    tile.addEventListener('pointercancel', () => { clearTimeout(pressTimer); pressTimer = null; });
    tile.addEventListener('contextmenu', e => e.preventDefault());

    tile.addEventListener('click', async () => {
      if (didLongPress) { didLongPress = false; return; }
      const which = tile.dataset.tileAction;
      if (which === 'dinner') {
        const dinnerPlan = viewMeals?.dinner;
        if (dinnerPlan?.recipeId || dinnerPlan?.customName) {
          openMealDetailSheet(dinnerPlan, 'dinner');
        } else {
          openMealPlanSheet('dinner');
        }
      }
      if (which === 'weather') {
        if (!settings?.weatherLocation) {
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

  // Coming up rail
  const comingUpEl = main.querySelector('.coming-up');
  if (comingUpEl) {
    document.querySelector('[data-coming-up-toggle]')?.addEventListener('click', (e) => {
      e.currentTarget.blur();
      const next = !comingUpEl.classList.contains('is-expanded');
      comingUpEl.classList.toggle('is-expanded', next);
      e.currentTarget.setAttribute('aria-expanded', next ? 'true' : 'false');
      localStorage.setItem('dr-coming-up-state', next ? 'expanded' : 'collapsed');
    });
    comingUpEl.querySelectorAll('.coming-up__item[data-event-id]').forEach(btn => {
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
  const slideClass = delta > 0 ? 'dash-slide-next' : 'dash-slide-prev';
  main.classList.remove('dash-slide-next', 'dash-slide-prev');
  viewDate = addDays(viewDate, delta);
  celebrationShown = false;
  updateHeaderSubtitle();
  subscribeSchedule(viewDate);
  viewMeals = (await readKitchenPlan(viewDate)) || {};
  await loadData();
  main.classList.add(slideClass);
  main.addEventListener('animationend', () => main.classList.remove(slideClass), { once: true });
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

const _PREP_PREFIXES = /^(freshly|finely|coarsely|roughly|thinly|thickly|chopped|diced|sliced|minced|grated|shredded|crushed|cracked|ground)\s+/i;
function _cleanIngredientName(name) {
  if (!name || typeof name !== 'string') return name;
  let s = name.replace(/\s*\([^)]*\)\s*/g, ' ').split(',')[0];
  while (_PREP_PREFIXES.test(s)) s = s.replace(_PREP_PREFIXES, '');
  return s.replace(/\s+/g, ' ').trim();
}

function openRecipeForm(recipeId = null, onSave = null) {
  const existing = recipeId ? recipes[recipeId] : null;
  const ingredients = existing?.ingredients ? [...existing.ingredients] : [];

  function buildIngredientRow(i) {
    const ing = ingredients[i];
    return `<div class="ingredient-row" data-index="${i}">
        <input class="ingredient-qty" data-edit-index="${i}" data-edit-field="qty" type="text" inputmode="decimal" value="${esc(ing.qty || '')}" placeholder="qty" autocomplete="off" enterkeyhint="next">
        <input class="ingredient-name" data-edit-index="${i}" data-edit-field="name" type="text" value="${esc(ing.name || '')}" placeholder="ingredient" autocomplete="off">
        <button class="btn-icon" data-remove-index="${i}" type="button" aria-label="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
  }

  function buildIngredientList() {
    return ingredients.map((_, i) => buildIngredientRow(i)).join('');
  }

  const TRASH_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  taskSheetMount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">${existing ? 'Edit recipe' : 'New recipe'}</h2>
      <div class="rf-header-actions">
        ${recipeId ? `<button class="ef2-icon-btn rf-delete-btn" id="kr_delete" type="button" aria-label="Delete recipe">${TRASH_SVG}</button>` : ''}
        <button class="ef2-icon-btn rf-save-btn" id="kr_save" type="button" aria-label="${existing ? 'Save changes' : 'Create recipe'}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></button>
        <button class="ef2-icon-btn" id="kr_close" aria-label="Close" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
    <div class="kr-section" id="recipeUrlSection">
      <label class="field${existing?.url ? ' is-hidden' : ''}" id="recipeUrlField">
        <span class="field__label">Recipe link</span>
        <input id="recipeUrl" type="url" placeholder="https://…" value="${esc(existing?.url || '')}" autocomplete="off">
      </label>
      <div class="kr-url-collapsed${existing?.url ? '' : ' is-hidden'}" id="recipeUrlCollapsed">
        <span class="kr-url-host" id="recipeUrlHost">${existing?.url ? `from ${esc((function(u){try{return new URL(u).hostname.replace(/^www\\./,'');}catch{return u;}})(existing.url))}` : ''}</span>
        <button class="btn btn--ghost btn--sm" id="recipeUrlEdit" type="button">Change</button>
      </div>
      <span class="kr-import-status" id="urlImportStatus"></span>
    </div>
    <div class="kr-title-row">
      <input class="kr-title-input" id="recipeName" type="text" value="${esc(existing?.name || '')}" placeholder="Recipe name…" autocomplete="off">
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
      <div id="ingredientList">${buildIngredientList()}</div>
      <div class="kr-add-ingredient-row">
        <input class="kr-add-qty" id="newIngredientQty" type="text" inputmode="decimal" placeholder="qty" autocomplete="off" enterkeyhint="next">
        <input class="field__input" id="newIngredientInput" type="text" placeholder="Add ingredient…" autocomplete="off" enterkeyhint="done">
        <button class="btn btn--secondary" id="addIngredientBtn" type="button">Add</button>
      </div>
    </div>
    <div class="kr-section">
      <span class="ef2-section-label">Notes</span>
      <textarea id="recipeNotes" class="kr-notes" placeholder="Description, tips, source…" autocomplete="off">${esc(existing?.notes || '')}</textarea>

    </div>`);

  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
    const ta = document.getElementById('recipeNotes');
    if (ta) { ta.style.height = '0'; ta.style.height = ta.scrollHeight + 'px'; }
  });
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('kr_close')?.addEventListener('click', closeTaskSheet);
  document.getElementById('recipeNotes')?.addEventListener('input', (e) => {
    e.target.style.height = '0'; e.target.style.height = e.target.scrollHeight + 'px';
  });

  // Difficulty chip picker
  bindChipPicker({ pickerId: 'recipeDifficultyPicker', hiddenId: 'recipeDifficulty' });

  document.getElementById('kr_delete')?.addEventListener('click', async () => {
    const confirmed = await showConfirm({ title: 'Delete recipe?', danger: true });
    if (!confirmed) return;
    await removeKitchenRecipe(recipeId);
    delete recipes[recipeId];
    closeTaskSheet();
    render();
    showToast('Recipe deleted');
  });

  function bindIngredientEvents() {
    document.getElementById('ingredientList')?.querySelectorAll('[data-remove-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        ingredients.splice(parseInt(btn.dataset.removeIndex, 10), 1);
        document.getElementById('ingredientList').innerHTML = buildIngredientList();
        bindIngredientEvents();
      });
    });
    document.getElementById('ingredientList')?.querySelectorAll('[data-edit-index]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.editIndex, 10);
        if (ingredients[idx]) ingredients[idx] = { ...ingredients[idx], [inp.dataset.editField]: inp.value.trim() || null };
      });
    });
  }

  function addIngredient() {
    const val = document.getElementById('newIngredientInput')?.value.trim();
    if (!val) return;
    const qty = document.getElementById('newIngredientQty')?.value.trim() || null;
    const idx = ingredients.length;
    ingredients.push({ name: _cleanIngredientName(val), qty });
    document.getElementById('newIngredientInput').value = '';
    document.getElementById('newIngredientQty').value = '';
    // Append only the new row — avoids full DOM rebuild that collapses the keyboard on iOS
    document.getElementById('ingredientList').insertAdjacentHTML('beforeend', buildIngredientRow(idx));
    bindIngredientEvents();
    document.getElementById('newIngredientInput').focus();
  }
  document.getElementById('addIngredientBtn')?.addEventListener('click', addIngredient);
  document.getElementById('newIngredientQty')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('newIngredientInput')?.focus(); }
  });
  document.getElementById('newIngredientInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addIngredient(); }
  });

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
      if (data.url && !document.getElementById('recipeUrl')?.value) document.getElementById('recipeUrl').value = data.url;
      if (data.name && !document.getElementById('recipeName')?.value) {
        document.getElementById('recipeName').value = data.name;
        document.getElementById('recipeName')?.focus();
      }
      if (data.notes && !document.getElementById('recipeNotes')?.value) document.getElementById('recipeNotes').value = data.notes;
      if (data.ingredients?.length) {
        data.ingredients.forEach(ing => {
          const cleaned = _cleanIngredientName(ing.name);
          if (cleaned) ingredients.push({ name: cleaned, qty: ing.qty || null });
        });
        document.getElementById('ingredientList').innerHTML = buildIngredientList();
        bindIngredientEvents();
      }
      if (status) {
        const n = data.ingredients?.length || 0;
        status.textContent = n > 0 ? `Imported ${n} ingredient${n !== 1 ? 's' : ''}` : data.name ? 'Got the title — no ingredients found.' : 'Couldn\'t read that link — URL kept.';
        status.style.color = 'var(--text-muted)';
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

  let _urlImportTimer = null;
  document.getElementById('recipeUrl')?.addEventListener('blur', () => {
    const url = document.getElementById('recipeUrl')?.value.trim();
    if (url) runImport('url', url);
  });

  // "Change" button → re-expand collapsed URL field
  document.getElementById('recipeUrlEdit')?.addEventListener('click', () => {
    document.getElementById('recipeUrlField')?.classList.remove('is-hidden');
    document.getElementById('recipeUrlCollapsed')?.classList.add('is-hidden');
    document.getElementById('recipeUrl')?.focus();
  });

  let krPhotoContext = '';
  document.getElementById('kr_photo')?.addEventListener('click', () => {
    const overlay2 = document.createElement('div');
    overlay2.className = 'ef2-subsheet-overlay';
    overlay2.innerHTML = `<div class="ef2-source-sheet">
      <div class="ef2-source-header"><span>Import from</span></div>
      <input class="ef2-source-ctx" id="kr_photoCtx" type="text" placeholder="Optional context…" autocomplete="off">
      <div class="ef2-source-btns">
        <button class="ef2-source-btn" data-source="camera" type="button">Camera</button>
        <button class="ef2-source-btn" data-source="gallery" type="button">Gallery</button>
        <button class="ef2-source-btn" data-source="files" type="button">Files</button>
      </div>
      <button class="btn btn--ghost btn--full" id="kr_photoSourceCancel" type="button">Cancel</button>
    </div>`;
    taskSheetMount.appendChild(overlay2);
    requestAnimationFrame(() => overlay2.classList.add('active'));
    const closeOverlay = () => { overlay2.classList.remove('active'); setTimeout(() => overlay2.remove(), 200); };
    overlay2.addEventListener('click', e => { if (e.target === overlay2) closeOverlay(); });
    document.getElementById('kr_photoSourceCancel')?.addEventListener('click', closeOverlay);
    overlay2.querySelectorAll('.ef2-source-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        krPhotoContext = document.getElementById('kr_photoCtx')?.value.trim() || '';
        const src = btn.dataset.source;
        if (src === 'camera') document.getElementById('kr_photoCamera')?.click();
        else if (src === 'gallery') document.getElementById('kr_photoGallery')?.click();
        else document.getElementById('kr_photoFiles')?.click();
        closeOverlay();
      });
    });
  });
  ['kr_photoCamera', 'kr_photoGallery', 'kr_photoFiles'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', async e => {
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
    const data = {
      name,
      url: document.getElementById('recipeUrl')?.value.trim() || null,
      notes: document.getElementById('recipeNotes')?.value.trim() || null,
      prepTime: document.getElementById('recipePrepTime')?.value.trim() || null,
      servings: parseInt(document.getElementById('recipeServings')?.value, 10) || null,
      difficulty: document.getElementById('recipeDifficulty')?.value || null,
      source: existing?.source || 'manual',
      ingredients,
      isFavorite: existing?.isFavorite || false,
      lastUsed: existing?.lastUsed || null,
    };
    if (recipeId) {
      await writeKitchenRecipe(recipeId, { ...data, createdAt: existing?.createdAt });
      recipes[recipeId] = { ...data, createdAt: existing?.createdAt };
      closeTaskSheet();
      if (onSave) { onSave(recipeId); } else { render(); }
    } else {
      const newId = await pushKitchenRecipe({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
      recipes[newId] = data;
      closeTaskSheet();
      if (onSave) { onSave(newId); } else { render(); }
    }
  });
}

function openMealPlanSheet(preSlot = 'dinner', preDate = null, preRecipeId = null) {
  const KP_SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
  const KP_SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const KP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const KP_DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const date = preDate || viewDate;
  let selectedRecipeId = preRecipeId;
  let selectedSlot = preSlot;

  function formatDateLabel(dk) {
    const d = new Date(dk + 'T12:00:00');
    return `${KP_DAY_ABBR[d.getDay()]} ${KP_MONTHS[d.getMonth()]} ${d.getDate()}`;
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

  const hasExisting = !!(viewMeals[preSlot]);
  taskSheetMount.innerHTML = renderBottomSheet(`
    <div class="sheet__header">
      <h2 class="sheet__title">Plan a meal</h2>
      <div class="rf-header-actions">
        <button class="ef2-icon-btn" id="kp_close" aria-label="Close" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="kp-day-section">
      <span class="ef2-section-label">Day</span>
      <div class="kp-date-wrap">
        <button class="kp-date-btn" id="kp_datebtn" type="button">${formatDateLabel(date)}</button>
        <input type="date" id="kp_day" class="kp-date-input" value="${esc(date)}">
      </div>
    </div>
    <div class="ef2-divider"></div>
    <div class="kp-slot-section">
      <span class="ef2-section-label">Slot</span>
      <nav class="tabs tabs--pill kp-slot-tabs" id="kp_slotPills">
        ${KP_SLOT_ORDER.map(s => `<button class="tab${s === selectedSlot ? ' is-active' : ''}${viewMeals[s] ? ' is-occupied' : ''}" data-slot="${esc(s)}" type="button">${esc(KP_SLOT_LABELS[s])}</button>`).join('')}
      </nav>
    </div>
    <div class="ef2-divider"></div>
    <div class="kp-meal-section">
      <div class="kp-meal-header">
        <span class="ef2-section-label">Meal</span>
        <button class="btn btn--ghost btn--sm" id="kp_createRecipe" type="button">+ New recipe</button>
      </div>
      <input class="kp-search-input" id="kp_search" type="text" autocomplete="off" placeholder="Search meals…" value="${esc(preRecipeName)}">
      <div class="kp-meal-dropdown" id="kp_mealDropdown">
        <div class="recipe-pick-list" id="recipePick">${buildRecipeRows(preRecipeName)}</div>
      </div>
    </div>
    <div class="kp-footer">
      <button class="btn btn--ghost" id="kp_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="kp_save" type="button"
        ${preRecipeName || selectedRecipeId ? '' : 'disabled'}>Save</button>
    </div>`);

  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('kp_close')?.addEventListener('click', closeTaskSheet);
  document.getElementById('kp_cancel')?.addEventListener('click', closeTaskSheet);

  const kpSearch = document.getElementById('kp_search');
  const kpDropdown = document.getElementById('kp_mealDropdown');
  kpSearch?.addEventListener('focus', () => {
    kpDropdown.classList.add('is-open');
    kpSearch.classList.add('kp-search--open');
  });
  kpSearch?.addEventListener('blur', () => {
    setTimeout(() => {
      kpDropdown.classList.remove('is-open');
      kpSearch.classList.remove('kp-search--open');
    }, 150);
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
  });

  document.getElementById('kp_createRecipe')?.addEventListener('click', () => {
    const day = document.getElementById('kp_day')?.value || date;
    const slot = selectedSlot;
    closeTaskSheet();
    setTimeout(() => openRecipeForm((newId) => {
      setTimeout(() => openMealPlanSheet(slot, day, newId), 320);
    }), 320);
  });

  function updateSaveBtn() {
    const val = document.getElementById('kp_search')?.value.trim();
    document.getElementById('kp_save').disabled = !(val || selectedRecipeId);
  }

  function closeMealDropdown() {
    document.getElementById('kp_mealDropdown')?.classList.remove('is-open');
    document.getElementById('kp_search')?.classList.remove('kp-search--open');
  }

  function bindPickRows() {
    document.getElementById('recipePick')?.querySelectorAll('[data-recipe-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (selectedRecipeId === btn.dataset.recipePick) {
          selectedRecipeId = null;
          document.getElementById('kp_search').value = '';
        } else {
          selectedRecipeId = btn.dataset.recipePick;
          const name = recipes[selectedRecipeId]?.name || '';
          document.getElementById('kp_search').value = name;
          closeMealDropdown();
        }
        document.getElementById('recipePick').innerHTML = buildRecipeRows(document.getElementById('kp_search').value);
        bindPickRows();
        updateSaveBtn();
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
    const day = document.getElementById('kp_day')?.value || date;
    const slot = selectedSlot;
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
    viewMeals = (await readKitchenPlan(viewDate)) || {};
    recipes = (await readKitchenRecipes()) || {};
    closeTaskSheet();
    render();
  });
}

async function addRecipeIngredientsToList(meal) {
  const listData = await readKitchenLists() || {};
  const listEntries = Object.entries(listData);
  let listId;
  if (!listEntries.length) {
    showToast('No shopping lists — add one in Kitchen');
    return;
  } else if (listEntries.length === 1) {
    listId = listEntries[0][0];
  } else {
    listId = await new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'bottom-sheet active';
      overlay.innerHTML = `<div class="bottom-sheet__content"><div class="sheet__header"><h2 class="sheet__title">Add to list</h2></div><div class="kl-pick-list">${listEntries.map(([id, l]) => `<button class="kl-pick-row" data-id="${esc(id)}" type="button">${esc(l.name)}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>`).join('')}</div><div class="kl-footer"><button class="btn btn--ghost" id="kl_pickCancel" type="button">Cancel</button></div></div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => {
        const row = e.target.closest('.kl-pick-row');
        if (row) { document.body.removeChild(overlay); resolve(row.dataset.id); return; }
        if (e.target === overlay || e.target.id === 'kl_pickCancel') { document.body.removeChild(overlay); resolve(null); }
      });
    });
  }
  if (!listId) return;
  const now = Date.now();
  let count = 0;
  for (const ing of (meal.ingredients || [])) {
    const name = typeof ing === 'string' ? ing.trim() : (ing.name || '').trim();
    if (!name) continue;
    await pushKitchenItem(listId, { name, qty: ing.qty || null, checked: false, addedAt: now });
    count++;
  }
  if (count) showToast(`Added ${count} item${count !== 1 ? 's' : ''} to ${listData[listId]?.name || 'list'}`);
}

function openMealDetailSheet(planEntry, slot) {
  const meal = planEntry?.recipeId ? recipes[planEntry.recipeId] : null;
  const html = renderMealDetailSheet(meal, planEntry, false, slot);
  taskSheetMount.innerHTML = renderBottomSheet(html);
  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeTaskSheet(); });

  document.getElementById('mdClose')?.addEventListener('click', closeTaskSheet);

  document.getElementById('mdAddToList')?.addEventListener('click', () => {
    if (!meal) return;
    closeTaskSheet();
    setTimeout(() => addRecipeIngredientsToList(meal), 320);
  });

  document.getElementById('mdChange')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openMealPlanSheet(slot), 320);
  });

  document.getElementById('mdEdit')?.addEventListener('click', () => {
    closeTaskSheet();
    setTimeout(() => openRecipeForm(planEntry.recipeId, () => render()), 320);
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

  document.getElementById('me_closeBtn')?.addEventListener('click', closeTaskSheet);
  document.getElementById('me_cancel')?.addEventListener('click', closeTaskSheet);

  // Footer Save submits the form (header save is type=submit; footer matches behavior).
  document.getElementById('me_footerSave')?.addEventListener('click', () => {
    document.getElementById('meForm')?.requestSubmit?.() ||
      document.getElementById('meForm')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  // Name input → disable both save buttons when empty.
  document.getElementById('me_name')?.addEventListener('input', (e) => {
    const empty = !e.target.value.trim();
    const headerSave = document.getElementById('me_headerSave');
    const footerSave = document.getElementById('me_footerSave');
    if (headerSave) headerSave.disabled = empty;
    if (footerSave) footerSave.disabled = empty;
  });

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

  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  // ── Close / Cancel ───────────────────────────────────────────
  document.getElementById('ef2_close')?.addEventListener('click', closeTaskSheet);
  document.getElementById('ef2_cancel')?.addEventListener('click', closeTaskSheet);
  document.getElementById('bottomSheet')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('bottomSheet')) closeTaskSheet();
  });

  // Footer Save delegates to header ✓ (single save handler is wired below).
  document.getElementById('ef2_footerSave')?.addEventListener('click', () => {
    document.getElementById('ef2_save')?.click();
  });

  // Title input → disable both save buttons when empty.
  document.getElementById('ef2_name')?.addEventListener('input', (e) => {
    const empty = !e.target.value.trim();
    const headerSave = document.getElementById('ef2_save');
    const footerSave = document.getElementById('ef2_footerSave');
    if (headerSave) headerSave.disabled = empty;
    if (footerSave) footerSave.disabled = empty;
  });

  // ── Date picker toggle ───────────────────────────────────────
  const dateBtn = document.getElementById('ef2_dateBtn');
  const dateDisplay = document.getElementById('ef2_dateDisplay');
  const dateInput = document.getElementById('ef2_date');
  const timePicker = document.getElementById('ef2_timePicker');
  const timeBtn = document.getElementById('ef2_timeBtn');
  const timeDisplay = document.getElementById('ef2_timeDisplay');

  function ef2GetTime(prefix) {
    const raw = (document.getElementById(`ef2_${prefix}Text`)?.value || '').replace(/\D/g, '');
    const ampm = document.getElementById(`ef2_${prefix}AmPm`)?.dataset.ampm || 'AM';
    if (!raw) return '';
    let h, m;
    if (raw.length <= 2) {
      h = parseInt(raw, 10); m = 0;
    } else if (raw.length === 3) {
      h = parseInt(raw[0], 10); m = parseInt(raw.slice(1), 10);
    } else {
      h = parseInt(raw.slice(0, 2), 10); m = parseInt(raw.slice(2, 4), 10);
    }
    if (isNaN(h) || h < 1 || h > 12) return '';
    if (isNaN(m) || m > 59) m = 0;
    let h24 = h;
    if (ampm === 'AM' && h === 12) h24 = 0;
    else if (ampm === 'PM' && h !== 12) h24 = h + 12;
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Date picker — tap pill, OS picker opens via .showPicker(), label updates on change.
  dateBtn?.addEventListener('click', () => {
    if (typeof dateInput?.showPicker === 'function') {
      try { dateInput.showPicker(); return; } catch (_) { /* fall through */ }
    }
    dateInput?.focus();
  });
  dateInput?.addEventListener('change', () => {
    dateDisplay.textContent = dateInput.value ? formatDateShort(dateInput.value) : 'Set date';
  });

  // ── Time picker toggle ───────────────────────────────────────
  timeBtn?.addEventListener('click', () => {
    timePicker.classList.toggle('is-open');
  });

  function updateTimeDisplay() {
    if (document.getElementById('ef2_allDay')?.classList.contains('is-active')) return;
    const s = ef2GetTime('start');
    const e = ef2GetTime('end');
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

  ['ef2_startText', 'ef2_endText'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateTimeDisplay);
  });
  ['ef2_startAmPm', 'ef2_endAmPm'].forEach(id => {
    const btn = document.getElementById(id);
    btn?.addEventListener('click', () => {
      const curr = btn.dataset.ampm || 'AM';
      const next = curr === 'AM' ? 'PM' : 'AM';
      btn.dataset.ampm = next;
      btn.textContent = next;
      updateTimeDisplay();
    });
  });

  // ── All day toggle ───────────────────────────────────────────
  document.getElementById('ef2_allDay')?.addEventListener('click', () => {
    const allDayBtn = document.getElementById('ef2_allDay');
    allDayBtn.classList.toggle('is-active');
    const isAllDay = allDayBtn.classList.contains('is-active');
    document.getElementById('ef2_timeBtn')?.classList.toggle('ef2-hidden', isAllDay);
    document.getElementById('ef2_timePicker')?.classList.toggle('ef2-hidden', isAllDay);
    if (isAllDay) document.getElementById('ef2_timePicker')?.classList.remove('is-open');
    if (!isAllDay) updateTimeDisplay();
  });

  // ── Person chip primary / attending state machine ─────────────
  const peopleWrap = document.getElementById('ef2_people');

  function getPrimaryChip() {
    return peopleWrap?.querySelector('.ef2-person-chip[data-state="primary"]');
  }

  peopleWrap?.addEventListener('click', (e) => {
    const chip = e.target.closest('.ef2-person-chip');
    if (!chip) return;

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
    const reveal = document.getElementById('ef2_notesReveal');
    const isOpen = reveal?.classList.contains('is-open');
    if (isOpen) {
      reveal.classList.remove('is-open');
      document.getElementById('ef2_notesChip')?.classList.remove('is-active');
    } else {
      reveal?.classList.add('is-open');
      document.getElementById('ef2_notesChip')?.classList.add('is-active');
      document.getElementById('ef2_notes')?.focus();
    }
  });

  document.getElementById('ef2_notesClose')?.addEventListener('click', () => {
    document.getElementById('ef2_notesReveal')?.classList.remove('is-open');
    document.getElementById('ef2_notesChip')?.classList.remove('is-active');
  });

  document.getElementById('ef2_locChip')?.addEventListener('click', () => {
    const reveal = document.getElementById('ef2_locReveal');
    const isOpen = reveal?.classList.contains('is-open');
    if (isOpen) {
      reveal.classList.remove('is-open');
      document.getElementById('ef2_locChip')?.classList.remove('is-active');
    } else {
      reveal?.classList.add('is-open');
      document.getElementById('ef2_locChip')?.classList.add('is-active');
      document.getElementById('ef2_location')?.focus();
    }
  });

  document.getElementById('ef2_locClose')?.addEventListener('click', () => {
    document.getElementById('ef2_locReveal')?.classList.remove('is-open');
    document.getElementById('ef2_locChip')?.classList.remove('is-active');
  });

  document.getElementById('ef2_urlChip')?.addEventListener('click', () => {
    const reveal = document.getElementById('ef2_urlReveal');
    const isOpen = reveal?.classList.contains('is-open');
    if (isOpen) {
      reveal.classList.remove('is-open');
      document.getElementById('ef2_urlChip')?.classList.remove('is-active');
    } else {
      reveal?.classList.add('is-open');
      document.getElementById('ef2_urlChip')?.classList.add('is-active');
      document.getElementById('ef2_url')?.focus();
    }
  });

  document.getElementById('ef2_urlClose')?.addEventListener('click', () => {
    document.getElementById('ef2_urlReveal')?.classList.remove('is-open');
    document.getElementById('ef2_urlChip')?.classList.remove('is-active');
  });

  // ── Repeat chip → sub-sheet (wired in Task 5) ─────────────
  let currentRepeat = event.repeat || null;

  document.getElementById('ef2_repeatChip')?.addEventListener('click', () => {
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
    const peoplArr = [];
    if (primaryChip) peoplArr.push(primaryChip.dataset.personId);
    attendingChips.forEach(c => peoplArr.push(c.dataset.personId));
    return {
      name: document.getElementById('ef2_name')?.value || '',
      date: document.getElementById('ef2_date')?.value || viewDate,
      allDay: document.getElementById('ef2_allDay')?.classList.contains('is-active') || false,
      startTime: ef2GetTime('start') || '09:00',
      endTime: ef2GetTime('end') || '10:00',
      people: peoplArr,
      notes: document.getElementById('ef2_notes')?.value || '',
      location: document.getElementById('ef2_location')?.value || '',
      url: document.getElementById('ef2_url')?.value.trim() || '',
      notesOpen: document.getElementById('ef2_notesReveal')?.classList.contains('is-open') || false,
      locOpen: document.getElementById('ef2_locReveal')?.classList.contains('is-open') || false,
      urlOpen: document.getElementById('ef2_urlReveal')?.classList.contains('is-open') || false,
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
    const color = primaryPerson?.color || people[0]?.color || '#4285f4';

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
      url: formState.url || null,
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
  document.getElementById('ef2_delete')?.addEventListener('click', async () => {
    if (!existingEventId) return;
    const name = events[existingEventId]?.name || 'this event';
    if (!await showConfirm({ title: `Delete "${name}"?`, danger: true })) return;
    try {
      await removeEvent(existingEventId);
      delete events[existingEventId];
      closeTaskSheet();
      render();
    } catch (err) {
      const errEl = document.getElementById('ef2_importError');
      if (errEl) { errEl.textContent = "Couldn't delete — try again."; errEl.classList.add('is-visible'); }
    }
  });

  // ── Import flows (wired in Task 4) ──────────────────────────
  document.getElementById('ef2_wand')?.addEventListener('click', () => doWandParse());
  document.getElementById('ef2_photoBtn')?.addEventListener('click', () => openPhotoSourceSheet());
  ['ef2_photoCamera', 'ef2_photoGallery', 'ef2_photoFiles'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) doPhotoImport(file);
      e.target.value = '';
    });
  });
  document.getElementById('ef2_ical')?.addEventListener('click', () => openEfIcalSheet());

  let errDismissTimer = null;
  let photoContextNote = '';

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
          const [h, m] = data.time.split(':').map(Number);
          const setTime = (prefix, h24, min) => {
            const ampm = h24 >= 12 ? 'PM' : 'AM';
            const hour12 = h24 % 12 || 12;
            const minPad = String(Math.round(min / 5) * 5 % 60).padStart(2, '0');
            const textEl = document.getElementById(`ef2_${prefix}Text`);
            const ampmBtn = document.getElementById(`ef2_${prefix}AmPm`);
            if (textEl) textEl.value = `${hour12}:${minPad}`;
            if (ampmBtn) { ampmBtn.dataset.ampm = ampm; ampmBtn.textContent = ampm; }
          };
          setTime('start', h, m);
          setTime('end', (h + 1) % 24, m);
          updateTimeDisplay();
        }
        if (data.allDay) {
          document.getElementById('ef2_allDay')?.classList.add('is-active');
          document.getElementById('ef2_timeBtn')?.classList.add('ef2-hidden');
          document.getElementById('ef2_timePicker')?.classList.add('ef2-hidden');
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

    const contextNote = photoContextNote || document.getElementById('ef2_name')?.value.trim() || '';
    photoContextNote = '';

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

  function openPhotoSourceSheet() {
    openEventPhotoSourceSheet({
      defaultContext: document.getElementById('ef2_name')?.value.trim() || '',
      onSelect: (src, ctx) => {
        photoContextNote = ctx;
        if (src === 'camera') document.getElementById('ef2_photoCamera')?.click();
        else if (src === 'gallery') document.getElementById('ef2_photoGallery')?.click();
        else if (src === 'files') document.getElementById('ef2_photoFiles')?.click();
      },
    });
  }

  function openEfIcalSheet() {
    openIcalUrlSubsheet({
      onImport: async (url, status, btn, close) => {
        const res = await fetch(KITCHEN_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'ical', input: url }),
        });
        const data = await res.json();
        if (data.error || !data.events?.length) {
          if (status) status.textContent = "Couldn't fetch that calendar. Check the URL.";
          btn.disabled = false; btn.textContent = 'Import';
          return;
        }
        close();
        const savedState = captureFormState();
        setTimeout(() => {
          if (!document.getElementById('bottomSheet')?.classList.contains('active')) return;
          openEfImportConfirm(data.events, data.hadRecurring || false, () => {
            openEventForm(existingEventId, savedState);
          });
        }, 320);
      },
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
    document.getElementById('rptEndDateWrap')?.classList.toggle('is-hidden', e.target.value !== 'on');
    document.getElementById('rptEndCountWrap')?.classList.toggle('is-hidden', e.target.value !== 'after');
  });

  // End-date pill — tap opens OS picker via .showPicker(); change updates label.
  document.getElementById('rptEndDateBtn')?.addEventListener('click', () => {
    const input = document.getElementById('rptEndDate');
    if (typeof input?.showPicker === 'function') {
      try { input.showPicker(); return; } catch (_) { /* fall through */ }
    }
    input?.focus();
  });
  document.getElementById('rptEndDate')?.addEventListener('change', (e) => {
    const label = document.getElementById('rptEndDateLabel');
    if (label) label.textContent = e.target.value ? formatDateShort(e.target.value) : 'Set date';
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
  const override = pendingSliderOverride;
  pendingSliderOverride = null;
  await closeTaskSheetShared({
    mount: taskSheetMount,
    pendingOverride: override,
    completions,
    multiUpdate,
    writeCompletion,
    applyToScheduleEntry: (ek, dk, ov) => {
      if (viewEntries[ek]) viewEntries[ek].pointsOverride = ov;
    },
    onClosed: render,
  });
}

function bindTaskSheetEvents(entryKey, dateKey) {
  // Close on overlay click
  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeTaskSheet();
  });
  document.getElementById('dsClose')?.addEventListener('click', closeTaskSheet);

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
  document.getElementById('delegateMoveToggle')?.addEventListener('click', e => {
    e.currentTarget.classList.toggle('is-active');
  });

  // Delegate person chips
  let pendingDelegateOwnerId = null;
  document.querySelectorAll('#delegatePanel .ef2-person-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const newOwnerId = chip.dataset.personId;
      if (!newOwnerId) return;

      const moveToggle = document.getElementById('delegateMoveToggle');
      if (moveToggle?.classList.contains('is-active')) {
        // Store selection, open date picker for delegate+move
        pendingDelegateOwnerId = newOwnerId;
        document.querySelectorAll('#delegatePanel .ef2-person-chip').forEach(c => c.removeAttribute('data-state'));
        chip.setAttribute('data-state', 'primary');
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
    setTimeout(() => { openTaskForm(taskId); }, 320);
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
// Task form — create + edit (tf-* pattern)
// ══════════════════════════════════════════

function tfHidePicker() {
  document.getElementById('tf_pickerOverlay')?.remove();
}

function openTaskForm(taskId = null, savedState = null) {
  const baseTask = savedState || (taskId ? tasks[taskId] : {});
  // activePerson pre-fill: when creating, seed owners from the current filter
  const task = (!taskId && !savedState && activePerson)
    ? { ...baseTask, owners: [activePerson] }
    : baseTask;
  const mode = taskId ? 'edit' : 'create';
  const catsArr = Object.entries(cats).map(([key, c]) => ({ key, ...c }));

  const html = renderTaskForm({ task, taskId, mode, categories: catsArr, people });
  taskSheetMount.innerHTML = renderBottomSheet(html);

  taskSheetMount.querySelectorAll('.ef2-person-chip[data-person-color]').forEach(chip => {
    chip.style.setProperty('--chip-color', chip.dataset.personColor);
  });

  requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

  // ── Close / Cancel ───────────────────────────────────────
  const doClose = () => { tfHidePicker(); closeTaskSheet(); };
  document.getElementById('tf_close')?.addEventListener('click', doClose);
  document.getElementById('tf_cancel')?.addEventListener('click', doClose);
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target === document.getElementById('bottomSheet')) doClose();
  });

  // Footer Save delegates to header tf_save (single save handler wired below).
  document.getElementById('tf_footerSave')?.addEventListener('click', () => {
    document.getElementById('tf_save')?.click();
  });

  // Title input → disable both save buttons when empty.
  document.getElementById('tf_name')?.addEventListener('input', (e) => {
    const empty = !e.target.value.trim();
    const headerSave = document.getElementById('tf_save');
    const footerSave = document.getElementById('tf_footerSave');
    if (headerSave) headerSave.disabled = empty;
    if (footerSave) footerSave.disabled = empty;
  });

  // One-Time date pill — tap opens OS picker via .showPicker(); change updates label.
  document.getElementById('tf_onceBtn')?.addEventListener('click', () => {
    const input = document.getElementById('tf_onceDate');
    if (typeof input?.showPicker === 'function') {
      try { input.showPicker(); return; } catch (_) { /* fall through */ }
    }
    input?.focus();
  });
  document.getElementById('tf_onceDate')?.addEventListener('change', (e) => {
    const label = document.getElementById('tf_onceDateLabel');
    if (label) label.textContent = e.target.value ? formatDateShort(e.target.value) : 'Set date';
  });

  // ── Person chip state machine ─────────────────────────────
  const peopleWrap = document.getElementById('tf_people');

  function tfGetOwnerIds() {
    return [...(peopleWrap?.querySelectorAll('.ef2-person-chip') || [])]
      .filter(c => c.dataset.state === 'primary').map(c => c.dataset.personId);
  }

  function tfUpdateAssignRow() {
    document.getElementById('tf_assignRow')?.classList.toggle('is-hidden', tfGetOwnerIds().length < 2);
  }

  peopleWrap?.querySelectorAll('.ef2-person-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.state === 'primary') chip.removeAttribute('data-state');
      else chip.setAttribute('data-state', 'primary');
      tfUpdateAssignRow();
    });
  });

  // ── Assign mode pills ─────────────────────────────────────
  document.getElementById('tf_assignRow')?.querySelectorAll('.tf-assign-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('tf_assignRow')?.querySelectorAll('.tf-assign-pill').forEach(b => b.classList.remove('tf-assign-pill--active'));
      btn.classList.add('tf-assign-pill--active');
    });
  });

  // ── Rotation pills ────────────────────────────────────────
  let tfRotation = task.rotation || 'daily';

  function tfUpdateRotation(rot) {
    tfRotation = rot;
    document.getElementById('tf_rotation')?.querySelectorAll('.tf-rot-pill').forEach(p => {
      p.classList.toggle('tf-rot-pill--active', p.dataset.rot === rot);
    });
    document.getElementById('tf_weeklyReveal')?.classList.toggle('is-open', rot !== 'once');
    document.getElementById('tf_onceReveal')?.classList.toggle('is-open', rot === 'once');
    const showCd = rot === 'weekly' || rot === 'monthly';
    const chip = document.getElementById('tf_optionsChip');
    if (chip) chip.dataset.showCd = showCd ? '1' : '';
    document.getElementById('tf_cooldownRow')?.classList.toggle('is-hidden', !showCd);
    const cdInput = document.getElementById('tf_cooldown');
    if (cdInput && !cdInput.value) {
      cdInput.placeholder = rot === 'weekly' ? '3' : rot === 'monthly' ? '7' : '';
    }
  }

  document.getElementById('tf_rotation')?.querySelectorAll('.tf-rot-pill').forEach(pill => {
    pill.addEventListener('click', () => tfUpdateRotation(pill.dataset.rot));
  });

  // ── Detail chip pickers ───────────────────────────────────
  let tfDiff = task.difficulty || 'medium';
  let tfDur  = task.estMin ?? 10;
  let tfTod  = task.timeOfDay || 'anytime';
  let tfCat  = task.category || catsArr.find(c => c.isDefault)?.key || '';

  function tfShowPicker(field, chipEl) {
    tfHidePicker();
    const DUR_PRESETS = [5, 10, 15, 20, 30, 45, 60];
    let inner = '';

    if (field === 'diff') {
      inner = `<div class="tf-picker-cells">
        ${[['easy','Easy'],['medium','Medium'],['hard','Hard']].map(([v, l]) =>
          `<button class="tf-picker-cell${tfDiff === v ? ' tf-picker-cell--active' : ''}" data-pick-val="${v}" data-pick-label="${l}" type="button">${l}</button>`
        ).join('')}
      </div>`;
    } else if (field === 'dur') {
      inner = `<div class="tf-dur-grid">
        ${DUR_PRESETS.map(v =>
          `<button class="tf-dur-cell${tfDur === v ? ' tf-dur-cell--active' : ''}" data-pick-val="${v}" data-pick-label="${v} min" type="button">${v}</button>`
        ).join('')}
        <button class="tf-dur-cell" data-pick-val="custom" type="button">...</button>
      </div>
      <div class="tf-dur-custom-wrap is-hidden" id="tf_durCustomWrap">
        <input type="number" id="tf_durCustom" min="1" max="300" placeholder="Minutes" value="${!DUR_PRESETS.includes(tfDur) ? tfDur : ''}">
      </div>`;
    } else if (field === 'tod') {
      inner = `<div class="tf-picker-cells">
        ${[['am','Morning'],['anytime','Anytime'],['pm','Afternoon'],['both','Both']].map(([v, l]) =>
          `<button class="tf-picker-cell${tfTod === v ? ' tf-picker-cell--active' : ''}" data-pick-val="${v}" data-pick-label="${l}" type="button">${l}</button>`
        ).join('')}
      </div>`;
    } else if (field === 'cat') {
      inner = `<div class="tf-cat-list">
        ${catsArr.map(c =>
          `<button class="tf-cat-item${tfCat === c.key ? ' tf-cat-item--active' : ''}" data-pick-val="${esc(c.key)}" data-pick-label="${esc((c.icon || '') + ' ' + c.label)}" type="button">
            <span class="tf-cat-icon">${c.icon || ''}</span>
            <span class="tf-cat-label">${esc(c.label)}</span>
          </button>`
        ).join('')}
      </div>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'tf-picker-overlay';
    overlay.id = 'tf_pickerOverlay';
    overlay.innerHTML = `<div class="tf-picker-backdrop"></div><div class="tf-picker" id="tf_pickerInner">${inner}</div>`;
    document.body.appendChild(overlay);

    // Position near chip
    const rect = chipEl.getBoundingClientRect();
    const picker = overlay.querySelector('.tf-picker');
    const W = Math.min(280, window.innerWidth - 32);
    picker.style.width = `${W}px`;
    let left = rect.left;
    if (left + W > window.innerWidth - 16) left = window.innerWidth - W - 16;
    if (left < 16) left = 16;
    picker.style.left = `${left}px`;
    if (window.innerHeight - rect.bottom > 200) {
      picker.style.top = `${rect.bottom + 8}px`;
    } else {
      picker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    }

    // Backdrop dismiss
    overlay.querySelector('.tf-picker-backdrop').addEventListener('click', tfHidePicker);

    // Custom duration toggle
    overlay.querySelector('[data-pick-val="custom"]')?.addEventListener('click', () => {
      const wrap = overlay.querySelector('#tf_durCustomWrap');
      wrap?.classList.remove('is-hidden');
      overlay.querySelector('#tf_durCustom')?.focus();
    });

    // Custom duration confirm
    const customInput = overlay.querySelector('#tf_durCustom');
    if (customInput) {
      const confirmCustom = () => {
        const v = parseInt(customInput.value, 10);
        if (v > 0) tfOnPickerSelect('dur', v, `${v} min`);
      };
      customInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmCustom(); });
      customInput.addEventListener('blur', confirmCustom);
    }

    // Normal selections
    overlay.querySelectorAll('[data-pick-val]:not([data-pick-val="custom"])').forEach(btn => {
      btn.addEventListener('click', () => {
        tfOnPickerSelect(field, btn.dataset.pickVal, btn.dataset.pickLabel || btn.textContent.trim());
      });
    });
  }

  function tfOnPickerSelect(field, val, label) {
    if (field === 'diff') {
      tfDiff = val;
      document.getElementById('tf_diffChip').textContent = label;
    } else if (field === 'dur') {
      tfDur = typeof val === 'number' ? val : parseInt(val, 10);
      document.getElementById('tf_durChip').textContent = label || `${tfDur} min`;
    } else if (field === 'tod') {
      tfTod = val;
      document.getElementById('tf_todChip').textContent = label;
    } else if (field === 'cat') {
      tfCat = val;
      document.getElementById('tf_catChip').textContent = label;
    }
    tfHidePicker();
  }

  document.getElementById('tf_diffChip')?.addEventListener('click', e => tfShowPicker('diff', e.currentTarget));
  document.getElementById('tf_durChip')?.addEventListener('click',  e => tfShowPicker('dur',  e.currentTarget));
  document.getElementById('tf_todChip')?.addEventListener('click',  e => tfShowPicker('tod',  e.currentTarget));
  document.getElementById('tf_catChip')?.addEventListener('click',  e => tfShowPicker('cat',  e.currentTarget));

  // ── Notes reveal ──────────────────────────────────────────
  document.getElementById('tf_notesChip')?.addEventListener('click', () => {
    const reveal = document.getElementById('tf_notesReveal');
    const chip   = document.getElementById('tf_notesChip');
    const open   = reveal?.classList.toggle('is-open');
    chip?.classList.toggle('is-active', open);
    if (open) document.getElementById('tf_notes')?.focus();
  });
  document.getElementById('tf_notesClose')?.addEventListener('click', () => {
    document.getElementById('tf_notesReveal')?.classList.remove('is-open');
    document.getElementById('tf_notesChip')?.classList.remove('is-active');
  });

  // ── Options reveal ────────────────────────────────────────
  document.getElementById('tf_optionsChip')?.addEventListener('click', () => {
    const reveal = document.getElementById('tf_optionsReveal');
    const chip   = document.getElementById('tf_optionsChip');
    reveal?.classList.toggle('is-open');
    chip?.classList.toggle('is-active');
  });

  // ── Exempt toggle ─────────────────────────────────────────
  document.getElementById('tf_exempt')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    const on  = btn.classList.toggle('is-active');
    btn.textContent = on ? 'On' : 'Off';
  });

  // ── Save ──────────────────────────────────────────────────
  document.getElementById('tf_save')?.addEventListener('click', async () => {
    const name = document.getElementById('tf_name')?.value.trim();
    if (!name) {
      const inp = document.getElementById('tf_name');
      inp?.classList.add('is-invalid');
      inp?.focus();
      setTimeout(() => inp?.classList.remove('is-invalid'), 600);
      return;
    }

    const ownerIds = tfGetOwnerIds();
    const assignPill = document.getElementById('tf_assignRow')?.querySelector('.tf-assign-pill--active')?.dataset.mode;
    const ownerAssignmentMode = ownerIds.length <= 1 ? 'fixed' : (assignPill === 'everyone' ? 'duplicate' : 'rotate');
    const rotation = tfRotation;
    const dayVal = document.getElementById('tf_daySelect')?.value;
    const dedicatedDay = rotation === 'weekly'
      ? (dayVal !== '' && dayVal != null ? parseInt(dayVal, 10) : null)
      : null;
    const dedicatedDate = rotation === 'once'
      ? (document.getElementById('tf_onceDate')?.value || null)
      : null;
    const showCd = rotation === 'weekly' || rotation === 'monthly';
    const cdVal  = document.getElementById('tf_cooldown')?.value;
    const cdDefault = rotation === 'weekly' ? 3 : rotation === 'monthly' ? 7 : 0;
    const cooldownDays = showCd
      ? (cdVal !== '' ? (parseInt(cdVal, 10) || cdDefault) : cdDefault)
      : null;
    const exempt = document.getElementById('tf_exempt')?.classList.contains('is-active') || false;
    const notes  = document.getElementById('tf_notes')?.value.trim() || null;

    const updated = {
      ...(taskId ? tasks[taskId] : {}),
      name,
      rotation,
      difficulty: tfDiff,
      estMin: tfDur,
      timeOfDay: tfTod,
      category: tfCat,
      owners: ownerIds,
      ownerAssignmentMode,
      dedicatedDay,
      dedicatedDate,
      cooldownDays: cooldownDays || null,
      exempt,
      notes: notes || null,
      bounty: taskId ? (tasks[taskId]?.bounty ?? null) : null,
      eventTime: null,
      status: 'active',
    };
    if (!taskId) updated.createdDate = today;

    const saveBtn = document.getElementById('tf_save');
    if (saveBtn) saveBtn.disabled = true;

    if (taskId) {
      // Edit path
      await writeTask(taskId, updated);
      tasks[taskId] = updated;
      const allSched = await readAllSchedule() || {};
      const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, { includeToday: true }, catsObj);
      await multiUpdate(futureUpdates);
    } else {
      // Create path
      const newId = await pushTask(updated);
      tasks[newId] = updated;

      // Today entry — same logic as openQuickAddSheet
      const skipToday = (rotation === 'once' && dedicatedDate && dedicatedDate !== today)
        || ((rotation === 'weekly' || rotation === 'monthly') && dedicatedDay != null && dayOfWeek(today) !== dedicatedDay);
      if (ownerIds.length > 0 && !skipToday) {
        const schedDate = dedicatedDate || today;
        const schedUpdates = {};
        const baseEntry = { taskId: newId, rotationType: rotation, ownerAssignmentMode, timeOfDay: tfTod };
        let qaCounter = 0;
        const qaKey = () => `sched_${Date.now()}_qa_${String(qaCounter++).padStart(3, '0')}`;
        if (ownerAssignmentMode === 'duplicate') {
          for (const oid of ownerIds) {
            if (tfTod === 'both') {
              schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId: oid, timeOfDay: 'am' };
              schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId: oid, timeOfDay: 'pm' };
            } else {
              schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId: oid };
            }
          }
        } else {
          const ownerId = ownerAssignmentMode === 'fixed' ? ownerIds[0] : getRotationOwner(updated, today, newId);
          if (tfTod === 'both') {
            schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId, timeOfDay: 'am' };
            schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId, timeOfDay: 'pm' };
          } else {
            schedUpdates[`schedule/${schedDate}/${qaKey()}`] = { ...baseEntry, ownerId };
          }
        }
        await multiUpdate(schedUpdates);
      }
      const allSched = await readAllSchedule() || {};
      const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, allSched, undefined, catsObj);
      await multiUpdate(futureUpdates);
    }

    tfHidePicker();
    await loadData();
    closeTaskSheet();
    render();
  });

  // ── Delete (edit mode only) ───────────────────────────────
  document.getElementById('tf_delete')?.addEventListener('click', async () => {
    if (!taskId) return;
    const name = tasks[taskId]?.name || 'this task';
    if (!await showConfirm({ title: `Delete "${name}"?`, danger: true })) return;
    const updates = { [`tasks/${taskId}`]: null };
    const allSched = await readAllSchedule() || {};
    for (const [dateKey, dayEntries] of Object.entries(allSched)) {
      for (const [entryKey, entry] of Object.entries(dayEntries || {})) {
        if (entry.taskId === taskId) {
          updates[`schedule/${dateKey}/${entryKey}`] = null;
          updates[`completions/${entryKey}`] = null;
        }
      }
    }
    await multiUpdate(updates);
    delete tasks[taskId];
    tfHidePicker();
    closeTaskSheet();
    await loadData();
    render();
  });
} // end openTaskForm

// ══════════════════════════════════════════
// Edit task sheet (no PIN)
// ══════════════════════════════════════════

// Edit task now handled by openTaskForm

// ══════════════════════════════════════════
// Quick-add task (header + button)
// ══════════════════════════════════════════

// Quick-add now handled by openTaskForm

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
        setTimeout(() => openTaskForm(), 320);
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
    () => render(),
    linkedPerson ? { person: linkedPerson, writePerson, displayDefaults: settings } : undefined,
    linkedPerson ? undefined : { settings, writeSettings, displayDefaults: settings }
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
// iCal feed sync — cooldown-gated, fire-and-forget
// ══════════════════════════════════════════

async function syncIcalFeeds() {
  const feedsObj = await readIcalFeeds();
  if (!feedsObj) return;

  const now = Date.now();
  for (const [feedId, feed] of Object.entries(feedsObj)) {
    if (!feed.enabled || !feed.url) continue;
    const intervalMs = (feed.syncIntervalHours || 6) * 3600 * 1000;
    if (now - (feed.lastSync || 0) < intervalMs) continue;

    try {
      const res = await fetch(KITCHEN_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ical', input: feed.url }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data.events)) continue;

      const primaryOwnerId = (feed.owners || [])[0] || null;
      const primaryPerson = people.find(p => p.id === primaryOwnerId);
      const color = primaryPerson?.color || '#4285f4';

      const updates = {};

      // Remove stale events for this feed
      for (const [eid, ev] of Object.entries(events)) {
        if (ev.source === 'ical' && ev.feedId === feedId) {
          updates[`events/${eid}`] = null;
        }
      }

      // Write refreshed events
      for (let i = 0; i < data.events.length; i++) {
        const ev = data.events[i];
        const newKey = `ical_${feedId}_${Date.now()}_${i}`;
        updates[`events/${newKey}`] = {
          name: ev.name,
          date: ev.date,
          allDay: ev.allDay ?? true,
          startTime: ev.allDay ? null : (ev.time || null),
          endTime: null,
          color,
          people: feed.owners || [],
          notes: ev.notes || null,
          location: null,
          repeat: null,
          createdDate: today,
          source: 'ical',
          feedId,
        };
      }

      if (Object.keys(updates).length > 0) await multiUpdate(updates);
      await writeIcalFeedLastSync(feedId, now);
    } catch {
      // Silently skip feeds that fail — try again next interval
    }
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
syncIcalFeeds(); // fire-and-forget, cooldown-gated


} // end person-not-found else
