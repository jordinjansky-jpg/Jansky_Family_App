// calendar-views.js — Pure render functions for calendar week/day/month views.
// No DOM access. Returns HTML strings. Import into calendar.html.

import { addDays, dateRange, dayOfWeek, monthEnd, escapeHtml, DAY_NAMES_SHORT, formatDateShort, normalizePlanSlot } from './utils.js';
import { renderEventPill, renderEventBubble } from './components.js';
import { filterByPerson, filterEventsByPerson, getEventsForDate, sortEvents, isComplete, sortEntries, groupByFrequency, getEventsForRange } from './state.js';

const esc = (s) => escapeHtml(String(s ?? ''));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Expand all events ONCE over [startKey, endKey] and bucket occurrences by
 * date. Each day's bucket is an `{ id: event }` object identical in shape to
 * what `getEventsForDate(events, day)` returns, so per-day filtering/sorting
 * works unchanged — without re-walking every repeat rule per rendered cell.
 *
 * Multi-day occurrences are fanned across every spanned day (clamped to the
 * window) so continuation days surface the event too.
 *
 * @param {object} events - { eventId: event }
 * @param {string} startKey - YYYY-MM-DD inclusive
 * @param {string} endKey - YYYY-MM-DD inclusive
 * @returns {Map<string, object>} dateKey → { id: event }
 */
function bucketEventsByDate(events, startKey, endKey) {
  const expanded = getEventsForRange(events, startKey, endKey, addDays);
  const byDate = new Map();
  for (const [id, evt] of Object.entries(expanded)) {
    const first = evt.date < startKey ? startKey : evt.date;
    const rawEnd = evt.endDate || evt.date;
    const last = rawEnd > endKey ? endKey : rawEnd;
    for (let cur = first; cur <= last; cur = addDays(cur, 1)) {
      if (!byDate.has(cur)) byDate.set(cur, {});
      byDate.get(cur)[id] = evt;
    }
  }
  return byDate;
}

/**
 * Build a time-axis grid for the day view: hour labels on the left, hour
 * dividers across, events absolutely positioned by their start/end times.
 *
 * Visible range adapts: clamps to [min(6am, earliest event), max(10pm, latest event)].
 * Returns '' when no timed events to render.
 *
 * @param {Array} timedEvents - [[id, event], ...]
 * @param {Array} people
 * @param {string} todayKey
 * @param {string} dateKey
 */
function buildTimeAxisGrid(timedEvents, people, todayKey, dateKey) {
  if (timedEvents.length === 0) return '';

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmtHour = (h) => {
    const period = h < 12 || h === 24 ? 'AM' : 'PM';
    const display = h === 0 || h === 24 ? 12 : (h > 12 ? h - 12 : h);
    return `${display} ${period}`;
  };

  let minMin = 6 * 60;
  let maxMin = 22 * 60;
  for (const [, evt] of timedEvents) {
    const s = toMin(evt.startTime);
    const e = evt.endTime ? toMin(evt.endTime) : s + 30;
    if (s < minMin) minMin = Math.max(0, Math.floor(s / 60) * 60);
    if (e > maxMin) maxMin = Math.min(24 * 60, Math.ceil(e / 60) * 60);
  }
  const startHour = Math.floor(minMin / 60);
  const endHour = Math.ceil(maxMin / 60);
  const totalMin = (endHour - startHour) * 60;
  const PX_PER_MIN = 0.9; // 54px per hour
  const gridHeight = totalMin * PX_PER_MIN;

  // Hour rows (one divider line per hour, label above)
  let hoursHtml = '';
  for (let h = startHour; h <= endHour; h++) {
    const top = (h - startHour) * 60 * PX_PER_MIN;
    hoursHtml += `<div class="cal-day__hour" style="top:${top}px"><span class="cal-day__hour-label">${fmtHour(h)}</span></div>`;
  }

  // Overlap / column assignment — same approach as buildTimeGrid
  const parsed = timedEvents.map(([id, evt]) => {
    const start = toMin(evt.startTime);
    const end = evt.endTime ? toMin(evt.endTime) : start + 30;
    return { id, evt, start, end };
  });
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  let curGroup = [], groupEnd = 0;
  for (const ev of parsed) {
    if (curGroup.length > 0 && ev.start >= groupEnd) { groups.push(curGroup); curGroup = []; }
    curGroup.push(ev);
    groupEnd = Math.max(groupEnd, ev.end);
  }
  if (curGroup.length > 0) groups.push(curGroup);

  const layout = new Map();
  for (const group of groups) {
    const cols = [];
    for (const ev of group) {
      let placed = false;
      for (let ci = 0; ci < cols.length; ci++) {
        if (ev.start >= cols[ci]) { cols[ci] = ev.end; layout.set(ev, { col: ci }); placed = true; break; }
      }
      if (!placed) { layout.set(ev, { col: cols.length }); cols.push(ev.end); }
    }
    const tc = cols.length;
    for (const ev of group) layout.get(ev).totalCols = tc;
  }

  // Event blocks — absolute positioned by time
  let eventsHtml = '';
  for (const ev of parsed) {
    const { col, totalCols } = layout.get(ev);
    const top = (ev.start - startHour * 60) * PX_PER_MIN;
    const height = Math.max((ev.end - ev.start) * PX_PER_MIN, 24);
    const leftPct = (col / totalCols) * 100;
    const widthPct = (1 / totalCols) * 100;
    const pill = renderEventPill(ev.evt, people);
    eventsHtml += `<div class="cal-day__time-event" data-event-id="${ev.id}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 56px);width:calc(${widthPct}% - 56px)">${pill}</div>`;
  }

  // Current-time indicator — only when viewing today
  let nowLineHtml = '';
  if (dateKey === todayKey) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= startHour * 60 && nowMin <= endHour * 60) {
      const top = (nowMin - startHour * 60) * PX_PER_MIN;
      nowLineHtml = `<div class="cal-day__now-line" style="top:${top}px"></div>`;
    }
  }

  return `<div class="cal-day__time-axis" style="height:${gridHeight}px">
    ${hoursHtml}
    ${eventsHtml}
    ${nowLineHtml}
  </div>`;
}

/**
 * Render the new Skylight-style week view: horizontal strip + day detail panel.
 * @param {object} opts
 * @param {string} opts.weekStartDate - YYYY-MM-DD
 * @param {string} opts.today
 * @param {string} opts.selectedDate - currently selected day
 * @param {object} opts.events
 * @param {object} opts.allSchedule
 * @param {object} opts.completions
 * @param {object} opts.tasks
 * @param {object} opts.cats
 * @param {Array} opts.people
 * @param {string|null} opts.activePerson
 * @param {object} opts.settings
 * @param {object} opts.dayMeals
 * @param {object} opts.recipes
 */
export function renderWeekStripView(opts) {
  const { weekStartDate, today, selectedDate, events, allSchedule, completions, tasks, cats, people, activePerson, settings, dayMeals = {}, recipes = {} } = opts;
  const days = dateRange(weekStartDate, addDays(weekStartDate, 6));
  const activeDay = selectedDate || today;

  // Expand repeats/multi-day spans ONCE for the whole week, then bucket per day.
  const eventsByDate = bucketEventsByDate(events, days[0], days[6]);

  // Week strip cells
  const stripCells = days.map(dk => {
    const dow = dayOfWeek(dk);
    const dayNum = parseInt(dk.split('-')[2], 10);
    const isToday = dk === today;
    const isSelected = dk === activeDay;

    let dayEvents = eventsByDate.get(dk) || {};
    dayEvents = filterEventsByPerson(dayEvents, activePerson);
    const sortedEvents = sortEvents(dayEvents);

    const maxDots = 3;
    const visible = sortedEvents.slice(0, maxDots);
    const overflow = sortedEvents.length > maxDots;
    const dots = visible.map(([, e]) => {
      const color = e.color || (people.find(p => e.people?.includes(p.id))?.color) || '#5b7fd6';
      return `<span class="cal-wstrip__dot" data-bg-color="${esc(color)}"></span>`;
    }).join('');
    const dotsRow = sortedEvents.length > 0
      ? `<div class="cal-wstrip__dots">${dots}${overflow ? '<span class="cal-wstrip__dot-more"></span>' : ''}</div>`
      : `<div class="cal-wstrip__dots cal-wstrip__dots--empty"></div>`;

    let cls = 'cal-wstrip__cell';
    if (isToday) cls += ' cal-wstrip__cell--today';
    if (isSelected) cls += ' cal-wstrip__cell--selected';

    return `<button class="${cls}" data-date="${esc(dk)}" type="button" aria-label="${DAY_NAMES_FULL[dow]}, ${MONTH_NAMES[parseInt(dk.split('-')[1], 10) - 1]} ${dayNum}">
      <span class="cal-wstrip__dow">${DAY_NAMES_SHORT[dow]}</span>
      <span class="cal-wstrip__num">${dayNum}</span>
      ${dotsRow}
    </button>`;
  }).join('');

  const strip = `<div class="cal-wstrip" role="tablist" aria-label="Week days">${stripCells}</div>`;

  // Day detail panel for the selected day — reuse the week's bucket when the
  // selected day is inside the displayed week (it always should be).
  const panelEvents = (activeDay >= days[0] && activeDay <= days[6])
    ? (eventsByDate.get(activeDay) || {})
    : getEventsForDate(events, activeDay, addDays);
  const panel = renderWeekDayPanel({ dateKey: activeDay, today, dayEvents: panelEvents, allSchedule, completions, tasks, cats, people, activePerson });

  return `<div class="cal-wstrip-view">
    ${strip}
    ${panel}
  </div>`;
}

/**
 * Render the day detail panel for the week strip view.
 * Shows all-day events as pills, timed events in a time-axis grid, tasks grouped by type.
 * `dayEvents` is the pre-expanded `{ id: event }` bucket for this day.
 */
function renderWeekDayPanel({ dateKey, today, dayEvents: rawDayEvents, allSchedule, completions, tasks, cats, people, activePerson }) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dayName = DAY_NAMES_FULL[d.getUTCDay()];
  const monthName = MONTH_NAMES[d.getUTCMonth()];
  const dayNum = d.getUTCDate();
  const isToday = dateKey === today;
  const headerLabel = isToday
    ? `${dayName}, ${monthName} ${dayNum} <span class="cal-wstrip-panel__today-pill">Today</span>`
    : `${dayName}, ${monthName} ${dayNum}`;

  // Events arrive pre-expanded from the caller's per-week bucket.
  let dayEvents = rawDayEvents || {};
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  let eventsHtml = '';
  if (sortedEvents.length > 0) {
    const allDayEvents = sortedEvents.filter(([, e]) => e.allDay);
    const timedEvents = sortedEvents.filter(([, e]) => !e.allDay && e.startTime);
    const untimedEvents = sortedEvents.filter(([, e]) => !e.allDay && !e.startTime);

    // Helper: render a single event row with inline time (Issue 4)
    const renderPanelEvent = (id, evt, cls = '') => {
      const color = evt.color || (people.find(p => evt.people?.includes(p.id))?.color) || '#5b7fd6';
      let timePrefix = '';
      if (!evt.allDay) {
        if (evt.startTime && evt.endTime) timePrefix = `${fmtTime(evt.startTime)} – ${fmtTime(evt.endTime)}`;
        else if (evt.startTime) timePrefix = fmtTime(evt.startTime);
      }
      const inlineTime = timePrefix
        ? `<span class="cal-panel__event-time-inline">${esc(timePrefix)}</span><span class="cal-panel__event-sep"> · </span>`
        : '';
      const personDots = (evt.people || []).map(pid => {
        const person = people.find(p => p.id === pid);
        return person ? `<span class="cal-wstrip-panel__event-dot" data-bg-color="${esc(person.color)}"></span>` : '';
      }).join('');
      return `<button class="cal-wstrip-panel__event${cls ? ' ' + cls : ''}" data-event-id="${esc(id)}" data-event-color="${esc(color)}" type="button">
        <div class="cal-wstrip-panel__event-stripe" data-bg-color="${esc(color)}"></div>
        <div class="cal-wstrip-panel__event-body">
          <div class="cal-wstrip-panel__event-name">${inlineTime}${esc(evt.name || 'Untitled')}</div>
        </div>
        ${personDots ? `<div class="cal-wstrip-panel__event-people">${personDots}</div>` : ''}
      </button>`;
    };
    // All-day pills
    for (const [id, evt] of allDayEvents) {
      eventsHtml += renderPanelEvent(id, evt, 'cal-wstrip-panel__event--allday');
    }
    // Timed events
    for (const [id, evt] of timedEvents) {
      eventsHtml += renderPanelEvent(id, evt);
    }
    // Untimed events
    for (const [id, evt] of untimedEvents) {
      eventsHtml += renderPanelEvent(id, evt);
    }
  }

  // Tasks section
  const dayEntries = allSchedule ? (allSchedule[dateKey] || {}) : {};
  let filteredEntries = filterByPerson(dayEntries, activePerson);
  filteredEntries = Object.fromEntries(
    Object.entries(filteredEntries).filter(([, e]) => e.type !== 'event')
  );

  let tasksHtml = '';
  if (Object.keys(filteredEntries).length > 0) {
    const groups = groupByFrequency(filteredEntries, tasks, cats);
    const groupOrder = [
      { key: 'monthly', label: 'Monthly' },
      { key: 'weekly',  label: 'Weekly' },
      { key: 'once',    label: 'One-Time' },
      { key: 'daily',   label: 'Daily' },
    ];
    for (const { key, label } of groupOrder) {
      const groupEntries = groups[key];
      if (!groupEntries || Object.keys(groupEntries).length === 0) continue;
      const sorted = sortEntries(groupEntries, completions, tasks, people, today);
      // Group entries by task name (Issue 3)
      const byName = new Map();
      for (const [entryKey, entry] of sorted) {
        const taskName = tasks[entry.taskId]?.name || 'Unknown';
        if (!byName.has(taskName)) byName.set(taskName, []);
        byName.get(taskName).push([entryKey, entry]);
      }
      tasksHtml += `<div class="cal-wstrip-panel__task-group">
        <div class="cal-wstrip-panel__task-group-label">${label}</div>`;
      for (const [taskName, entries] of byName) {
        if (entries.length === 1) {
          const [entryKey, entry] = entries[0];
          const done = isComplete(entryKey, completions);
          const person = people.find(p => p.id === entry.ownerId);
          const personDot = person ? `<span class="cal-wstrip-panel__task-dot" data-bg-color="${esc(person.color)}"></span>` : '';
          const isPastDaily = dateKey < today && entry.rotationType === 'daily';
          tasksHtml += `<div class="cal-wstrip-panel__task${done ? ' cal-wstrip-panel__task--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dateKey}">
            <button class="cal-wstrip-panel__task-check${done ? ' cal-wstrip-panel__task-check--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button"></button>
            ${personDot}
            <span class="cal-wstrip-panel__task-name">${esc(taskName)}</span>
          </div>`;
        } else {
          // Multiple entries for same task name — render one row with avatar cluster
          const allDone = entries.every(([k]) => isComplete(k, completions));
          const firstEntry = entries[0][1];
          const isPastDaily = dateKey < today && firstEntry.rotationType === 'daily';
          const avatars = entries.map(([entryKey, entry]) => {
            const done = isComplete(entryKey, completions);
            const person = people.find(p => p.id === entry.ownerId);
            const initial = person ? esc((person.name || '?')[0].toUpperCase()) : '?';
            const color = person?.color || 'var(--accent)';
            return `<button class="cal-task-avatar${done ? ' cal-task-avatar--done' : ''}" data-entry-key="${esc(entryKey)}" data-date-key="${esc(dateKey)}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button" style="--avatar-color: ${esc(color)}" aria-label="${esc(person?.name || '?')}">${initial}</button>`;
          }).join('');
          // Use first entry key as the primary tap target for task detail sheet
          const primaryKey = entries[0][0];
          tasksHtml += `<div class="cal-wstrip-panel__task${allDone ? ' cal-wstrip-panel__task--done' : ''} cal-wstrip-panel__task--grouped" data-entry-key="${esc(primaryKey)}" data-date-key="${esc(dateKey)}">
            <span class="cal-wstrip-panel__task-name">${esc(taskName)}</span>
            <div class="cal-task-avatars">${avatars}</div>
          </div>`;
        }
      }
      tasksHtml += `</div>`;
    }
  }

  const hasContent = sortedEvents.length > 0 || Object.keys(filteredEntries).length > 0;
  const emptyHtml = !hasContent ? `<div class="cal-wstrip-panel__empty">No events on this day</div>` : '';

  return `<div class="cal-wstrip-panel" data-panel-date="${esc(dateKey)}">
    <div class="cal-wstrip-panel__header">${headerLabel}</div>
    <div class="cal-wstrip-panel__scroll">
      ${eventsHtml}
      ${tasksHtml}
      ${emptyHtml}
    </div>
  </div>`;
}

/**
 * Render the day view.
 */
export function renderDayView(opts) {
  const { dateKey, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings, dayMeals = {}, recipes = {} } = opts;

  // Events section
  let dayEvents = getEventsForDate(events, dateKey, addDays);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  let eventsHtml = '';
  if (sortedEvents.length > 0) {
    const allDayEvents = sortedEvents.filter(([, e]) => e.allDay);
    const timedEvents = sortedEvents.filter(([, e]) => !e.allDay && e.startTime);

    eventsHtml += `<div class="cal-day__section">
      <div class="cal-day__section-header cal-day__section-header--sticky">Events</div>`;
    // All-day pills
    for (const [id, evt] of allDayEvents) {
      eventsHtml += `<div class="cal-day__event-allday" data-event-id="${esc(id)}">${renderEventPill(evt, people)}</div>`;
    }
    // Timed events — true time-axis grid with hour labels and current-time line
    eventsHtml += buildTimeAxisGrid(timedEvents, people, today, dateKey);
    // Remaining events without startTime rendered as bubbles
    const untimed = sortedEvents.filter(([, e]) => !e.allDay && !e.startTime);
    for (const [eventId, event] of untimed) {
      eventsHtml += renderEventBubble(eventId, event, people);
    }
    eventsHtml += `</div>`;
  }

  // Tasks section — grouped by person
  const dayEntries = allSchedule[dateKey] || {};
  let filteredEntries = filterByPerson(dayEntries, activePerson);
  // Exclude event schedule entries
  filteredEntries = Object.fromEntries(
    Object.entries(filteredEntries).filter(([, e]) => e.type !== 'event')
  );

  let tasksHtml = '';
  if (Object.keys(filteredEntries).length > 0) {
    tasksHtml += `<div class="cal-day__section">
      <div class="cal-day__section-header cal-day__section-header--sticky">Tasks</div>`;

    // DESIGN.md §6.2: Events → Monthly → Weekly → One-Time → Daily.
    // Events are rendered in their own section above; here we render the 4
    // non-event frequency groups in spec order.
    const groups = groupByFrequency(filteredEntries, tasks, cats);
    const groupOrder = [
      { key: 'monthly', label: 'Monthly' },
      { key: 'weekly',  label: 'Weekly' },
      { key: 'once',    label: 'One-Time' },
      { key: 'daily',   label: 'Daily' },
    ];

    function renderDayTaskRow(entryKey, entry) {
      const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
      const cat = task.category ? cats[task.category] : null;
      const done = isComplete(entryKey, completions);
      const isPastDaily = dateKey < today && entry.rotationType === 'daily';
      const todLabel = entry.timeOfDay === 'am' ? 'AM' : entry.timeOfDay === 'pm' ? 'PM' : '';
      const doneClass = done ? ' cal-day__task--done' : '';
      const checkClass = done ? 'cal-day__task-check cal-day__task-check--done' : 'cal-day__task-check';
      const person = people.find(p => p.id === entry.ownerId);
      const personDot = person ? `<span class="cal-day__task-dot" data-bg-color="${person.color}"></span>` : '';
      return `<div class="cal-day__task${doneClass}" data-entry-key="${entryKey}" data-date-key="${dateKey}">
        <button class="${checkClass}" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button"></button>
        ${personDot}
        ${todLabel ? `<span class="cal-day__task-tod">${todLabel}</span>` : ''}
        <span class="cal-day__task-name">${esc(task.name)}</span>
        ${cat?.icon ? `<span class="cal-day__task-icon">${cat.icon}</span>` : ''}
      </div>`;
    }

    for (const { key, label } of groupOrder) {
      const groupEntries = groups[key];
      if (!groupEntries || Object.keys(groupEntries).length === 0) continue;
      const sorted = sortEntries(groupEntries, completions, tasks, people, today);
      // Group by task name (Issue 3)
      const byName = new Map();
      for (const [entryKey, entry] of sorted) {
        const taskName = tasks[entry.taskId]?.name || 'Unknown';
        if (!byName.has(taskName)) byName.set(taskName, []);
        byName.get(taskName).push([entryKey, entry]);
      }
      tasksHtml += `<div class="cal-day__freq-group">
        <div class="cal-day__freq-label">${label}</div>`;
      for (const [taskName, entries] of byName) {
        if (entries.length === 1) {
          tasksHtml += renderDayTaskRow(entries[0][0], entries[0][1]);
        } else {
          // Multiple people assigned to same task — one row with avatar cluster
          const allDone = entries.every(([k]) => isComplete(k, completions));
          const firstEntry = entries[0][1];
          const isPastDaily = dateKey < today && firstEntry.rotationType === 'daily';
          const avatars = entries.map(([entryKey, entry]) => {
            const done = isComplete(entryKey, completions);
            const person = people.find(p => p.id === entry.ownerId);
            const initial = person ? esc((person.name || '?')[0].toUpperCase()) : '?';
            const color = person?.color || 'var(--accent)';
            return `<button class="cal-task-avatar${done ? ' cal-task-avatar--done' : ''}" data-entry-key="${esc(entryKey)}" data-date-key="${esc(dateKey)}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button" style="--avatar-color: ${esc(color)}" aria-label="${esc(person?.name || '?')}">${initial}</button>`;
          }).join('');
          const primaryKey = entries[0][0];
          tasksHtml += `<div class="cal-day__task${allDone ? ' cal-day__task--done' : ''} cal-day__task--grouped" data-entry-key="${esc(primaryKey)}" data-date-key="${esc(dateKey)}">
            <span class="cal-day__task-name">${esc(taskName)}</span>
            <div class="cal-task-avatars">${avatars}</div>
          </div>`;
        }
      }
      tasksHtml += `</div>`;
    }

    tasksHtml += `</div>`;
  }

  // Meals section — only slots with an assigned meal render; empty slots are silent
  const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  let mealsHtml = '';
  for (const slot of SLOTS) {
    const plan = dayMeals?.[slot];
    if (!plan) continue;
    const options = normalizePlanSlot(plan);
    if (options.length === 0) continue;
    if (options.length > 1) {
      // Voting in progress — single row showing count, tappable to open vote sheet
      mealsHtml += `<button class="card--meal card--meal--voting" data-vote-slot="${esc(slot)}" type="button">
        <span class="card--meal__name card--meal__name--voting">&#x1F44D; Vote &middot; ${options.length} options</span>
        <span class="card--meal__slot">${esc(SLOT_LABELS[slot] || slot)}</span>
      </button>`;
    } else {
      // Single option — existing rendering
      const singlePlan = options[0];
      const recipe = singlePlan.recipeId ? recipes[singlePlan.recipeId] : null;
      const mealName = recipe?.name || singlePlan.customName || singlePlan.mealName || null;
      if (!mealName) continue;
      const isSchool = singlePlan.source === 'school';
      const schoolIcon = isSchool
        ? `<span class="card--meal__school-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20M3 22V8l9-6 9 6v14M10 22v-6h4v6"/></svg></span>`
        : '';
      mealsHtml += `<button class="card--meal${isSchool ? ' card--meal--school' : ''}"
                            data-meal-id="${esc(singlePlan.recipeId || '')}" data-slot="${esc(slot)}"
                            type="button"${isSchool ? ' aria-disabled="true"' : ''}>
        ${schoolIcon}
        <span class="card--meal__name">${esc(mealName)}</span>
        <span class="card--meal__slot">${esc(SLOT_LABELS[slot] || slot)}</span>
      </button>`;
    }
  }
  if (mealsHtml) {
    mealsHtml = `<div class="cal-day__section">
      <div class="cal-day__section-header">
        Meals
        <button class="cal-day__section-add" data-add-meal="true" type="button" aria-label="Add meal">+</button>
      </div>
      ${mealsHtml}
    </div>`;
  }

  // Empty state
  if (sortedEvents.length === 0 && Object.keys(filteredEntries).length === 0 && !mealsHtml) {
    const emptyMsg = activePerson ? 'Nothing scheduled for this person' : 'Nothing scheduled';
    eventsHtml = `<div class="cal-day__empty">${emptyMsg}</div>`;
  }

  return `<div class="cal-day"><div class="cal-day__grid">${eventsHtml}${mealsHtml}${tasksHtml}</div></div>`;
}

/**
 * Render the month view grid.
 */
export function renderMonthView(opts) {
  const { viewMonth, today, events, people, activePerson, weekStartDay, monthCompact = true, selectedDate = null } = opts;
  const mStart = `${viewMonth}-01`;
  const mEnd = monthEnd(mStart);
  const firstDow = dayOfWeek(mStart);
  const days = dateRange(mStart, mEnd);

  const dowHeaders = [];
  for (let i = 0; i < 7; i++) {
    const dow = (weekStartDay + i) % 7;
    dowHeaders.push(`<div class="cal-grid__dow">${DAY_NAMES_SHORT[dow]}</div>`);
  }

  const emptyBefore = (firstDow - weekStartDay + 7) % 7;
  const emptyCells = Array(emptyBefore).fill('<div class="cal-grid__cell cal-grid__cell--empty"></div>').join('');

  // Expand repeats/multi-day spans ONCE for the month, then bucket per day —
  // the per-cell expansion was O(event-age) × ~31 cells per render.
  const eventsByDate = bucketEventsByDate(events, mStart, mEnd);

  const dayCells = days.map(dk => {
    const isToday = dk === today;
    const isPast = dk < today;
    const isSelected = selectedDate ? dk === selectedDate : dk === today;

    let dayEvents = eventsByDate.get(dk) || {};
    dayEvents = filterEventsByPerson(dayEvents, activePerson);
    const sortedEvents = sortEvents(dayEvents);

    let cls = 'cal-grid__cell';
    if (isToday) cls += ' cal-grid__cell--today';
    if (isPast && !isToday) cls += ' cal-grid__cell--past';
    if (isSelected) cls += ' cal-grid__cell--selected';

    const dayNum = parseInt(dk.split('-')[2], 10);

    // Always use compact dots mode
    let eventsHtml = '';
    if (sortedEvents.length > 0) {
      const maxDots = 3;
      const visible = sortedEvents.slice(0, maxDots);
      const overflow = sortedEvents.length - maxDots;
      const dots = visible.map(([, e]) => {
        const accentColor = e.color || (people.find(p => e.people?.includes(p.id))?.color) || '#5b7fd6';
        return `<span class="cal-grid__dot" data-bg-color="${esc(accentColor)}"></span>`;
      }).join('');
      eventsHtml = `<div class="cal-grid__dots">${dots}${overflow > 0 ? `<span class="cal-grid__dots-more">+${overflow}</span>` : ''}</div>`;
    }

    return `<button class="${cls}" data-date="${dk}" type="button">
      <span class="cal-grid__day">${dayNum}</span>
      ${eventsHtml}
    </button>`;
  }).join('');

  // Selected day panel — reuse the month bucket when the panel date is inside
  // the displayed month (a panel date outside it falls back to a single-day
  // expansion).
  const panelDate = selectedDate || today;
  const panelEvents = (panelDate >= mStart && panelDate <= mEnd)
    ? (eventsByDate.get(panelDate) || {})
    : getEventsForDate(events, panelDate, addDays);
  const panelHtml = renderMonthDayPanel({ dateKey: panelDate, today, dayEvents: panelEvents, people, activePerson });

  return `<div class="cal-month">
    <div class="cal-grid">
      ${dowHeaders.join('')}
      ${emptyCells}
      ${dayCells}
    </div>
    ${panelHtml}
  </div>`;
}

/**
 * Render the selected-day detail panel shown below the month grid.
 */
function renderMonthDayPanel({ dateKey, today, dayEvents: rawDayEvents, people, activePerson }) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dayName = DAY_NAMES_FULL[d.getUTCDay()];
  const monthName = MONTH_NAMES[d.getUTCMonth()];
  const dayNum = d.getUTCDate();
  const yearNum = d.getUTCFullYear();
  const isToday = dateKey === today;
  const headerLabel = isToday
    ? `${dayName}, ${monthName} ${dayNum} <span class="cal-month-panel__today-pill">Today</span>`
    : `${dayName}, ${monthName} ${dayNum}, ${yearNum}`;

  let dayEvents = rawDayEvents || {};
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  let eventsHtml = '';
  if (sortedEvents.length === 0) {
    eventsHtml = `<div class="cal-month-panel__empty">No events — tap + to add</div>`;
  } else {
    for (const [id, evt] of sortedEvents) {
      const color = evt.color || (people.find(p => evt.people?.includes(p.id))?.color) || '#5b7fd6';
      // Issue 4: inline time
      let timePrefix = '';
      if (!evt.allDay) {
        if (evt.startTime && evt.endTime) timePrefix = `${fmtTime(evt.startTime)} – ${fmtTime(evt.endTime)}`;
        else if (evt.startTime) timePrefix = fmtTime(evt.startTime);
      }
      const inlineTime = timePrefix
        ? `<span class="cal-panel__event-time-inline">${esc(timePrefix)}</span><span class="cal-panel__event-sep"> · </span>`
        : '';
      const personDots = (evt.people || []).map(pid => {
        const person = people.find(p => p.id === pid);
        return person ? `<span class="cal-month-panel__event-dot" data-bg-color="${esc(person.color)}"></span>` : '';
      }).join('');
      eventsHtml += `<button class="cal-month-panel__event" data-event-id="${esc(id)}" data-event-color="${esc(color)}" type="button">
        <div class="cal-month-panel__event-stripe" data-bg-color="${esc(color)}"></div>
        <div class="cal-month-panel__event-body">
          <div class="cal-month-panel__event-name">${inlineTime}${esc(evt.name || 'Untitled')}</div>
        </div>
        ${personDots ? `<div class="cal-month-panel__event-people">${personDots}</div>` : ''}
      </button>`;
    }
  }

  return `<div class="cal-month-panel" data-panel-date="${esc(dateKey)}">
    <div class="cal-month-panel__header">${headerLabel}</div>
    <div class="cal-month-panel__events">${eventsHtml}</div>
  </div>`;
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/**
 * Render the calendar page header with view navigation.
 */
export function renderCalendarNav(opts) {
  const { currentView, viewLabel, isCurrentPeriod, weekStartDay, controlsHtml = '', subtitle = '', titleDateValue = '', navMode = 'period' } = opts;

  return `<div class="cal-nav${navMode === 'agenda' ? ' cal-nav--agenda' : ''}">
    <div class="cal-nav__row cal-nav__row--title">
      <button class="date-nav__btn" id="prevPeriod" type="button" title="Previous">&lsaquo;</button>
      <div class="cal-nav__center">
        <button class="cal-nav__title-btn" id="calTitleBtn" type="button" aria-label="Jump to date">
          <span class="cal-nav__label">${viewLabel}</span>
          <input type="date" id="calTitleDateInput" class="cal-nav__title-date-input" value="${esc(titleDateValue)}" aria-hidden="true" tabindex="-1">
        </button>
        ${subtitle ? `<span class="cal-nav__subtitle">${esc(subtitle)}</span>` : ''}
        ${!isCurrentPeriod ? `<button class="cal-today-link" id="goToday" type="button">Today</button>` : ''}
      </div>
      <button class="date-nav__btn" id="nextPeriod" type="button" title="Next">&rsaquo;</button>
    </div>
    <div class="cal-nav__row cal-nav__row--controls">
      <div class="segmented-control cal-nav__view-seg" role="tablist" aria-label="View">
        <button class="segmented-btn${currentView === 'agenda' ? ' segmented-btn--active' : ''}" data-cal-view="agenda" type="button" role="tab">Agenda</button>
        <button class="segmented-btn${currentView === 'week'   ? ' segmented-btn--active' : ''}" data-cal-view="week"   type="button" role="tab">Week</button>
        <button class="segmented-btn${currentView === 'month'  ? ' segmented-btn--active' : ''}" data-cal-view="month"  type="button" role="tab">Month</button>
        <button class="segmented-btn${currentView === 'day'    ? ' segmented-btn--active' : ''}" data-cal-view="day"    type="button" role="tab">Day</button>
      </div>
      <div class="cal-nav__controls">
        ${controlsHtml}
        <button class="cal-nav__icon-btn" id="calSearchBtn" type="button" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

/**
 * Render the agenda view — a chronological scrollable list of upcoming events.
 * - Range: from today through addDays(today, 60). Empty days hidden.
 * - Each event renders as a card: time | name | location (if any) with a fat
 *   person-color left stripe and a tinted background.
 * - Date headers group events by day; today gets a "Today" pill.
 * - Tap an event → opens the event detail sheet (handled by the existing
 *   delegated event-gesture listener that looks for [data-event-id]).
 *
 * @param {object} opts - { today, events, people, activePerson }
 */
export function renderAgendaView(opts) {
  const { today, events, people, activePerson } = opts;

  // ±30 days back, +60 days forward so past events are visible.
  const rangeStart = addDays(today, -30);
  const rangeEnd = addDays(today, 60);

  // Expand recurring + multi-day occurrences in the window via existing path.
  const expandedMap = getEventsForRange(events, rangeStart, rangeEnd, addDays);
  const expanded = filterEventsByPerson(expandedMap, activePerson);

  // Group by date, fanning multi-day events across each spanned day.
  const byDate = new Map();
  for (const [id, evt] of Object.entries(expanded)) {
    const startDate = evt.date < rangeStart ? rangeStart : evt.date;
    const endDate = evt.endDate || evt.date;
    const finalEnd = endDate > rangeEnd ? rangeEnd : endDate;
    let cur = startDate;
    while (cur <= finalEnd) {
      if (!byDate.has(cur)) byDate.set(cur, []);
      byDate.get(cur).push([id, evt]);
      cur = addDays(cur, 1);
    }
  }

  // Sort each day chronologically: all-day first, then by startTime.
  for (const [, items] of byDate) {
    items.sort(([, a], [, b]) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }

  // Render sorted date groups.
  const sortedDates = Array.from(byDate.keys()).sort();
  if (sortedDates.length === 0) {
    return `<div class="cal-agenda"><div class="cal-agenda__empty">
      <div class="cal-agenda__empty-icon">📅</div>
      <div class="cal-agenda__empty-title">No events in this period</div>
      <div class="cal-agenda__empty-body">Events in the past 30 days and next 60 days will appear here.</div>
    </div></div>`;
  }

  let html = `<div class="cal-agenda">`;
  for (const dk of sortedDates) {
    const items = byDate.get(dk);
    const d = new Date(`${dk}T00:00:00Z`);
    const monthName = MONTH_NAMES[d.getUTCMonth()];
    const dayNum = d.getUTCDate();
    const dowName = DAY_NAMES_FULL[d.getUTCDay()];
    const todayPill = dk === today ? ` <span class="cal-agenda__today-pill">Today</span>` : '';
    html += `<div class="cal-agenda__date" data-date="${esc(dk)}">
      <span class="cal-agenda__date-dow">${dowName}</span>
      <span class="cal-agenda__date-num">${monthName} ${dayNum}</span>
      ${todayPill}
    </div>`;
    for (const [id, evt] of items) {
      html += renderAgendaEvent(id, evt, people);
    }
  }
  html += `</div>`;
  return html;
}

function renderAgendaEvent(id, event, people) {
  const personColor = event.color
    || (people.find(p => event.people?.includes(p.id))?.color)
    || '#5b7fd6';
  const isMulti = (event.people || []).length > 1;
  const otherColors = isMulti
    ? (event.people || [])
        .map(pid => people.find(p => p.id === pid)?.color)
        .filter(Boolean)
    : [];

  // Issue 4: inline time — "9:00 AM · Name" on one line
  let timePrefix = '';
  if (!event.allDay) {
    if (event.startTime && event.endTime) {
      timePrefix = `${fmtTime(event.startTime)} – ${fmtTime(event.endTime)}`;
    } else if (event.startTime) {
      timePrefix = fmtTime(event.startTime);
    }
  }
  const inlineTime = timePrefix
    ? `<span class="cal-agenda__event-time-inline">${esc(timePrefix)}</span><span class="cal-agenda__event-sep"> · </span>`
    : '';

  // Multi-day badge for events that span more than one day
  const startDate = event.date;
  const endDate = event.endDate || event.date;
  const spans = endDate > startDate;
  const spanBadge = spans ? `<span class="cal-agenda__event-span">${esc(formatDateShort(startDate))} – ${esc(formatDateShort(endDate))}</span>` : '';

  const peopleBadges = isMulti
    ? `<div class="cal-agenda__event-people">${otherColors.map(c => `<span class="cal-agenda__event-dot" data-bg-color="${esc(c)}"></span>`).join('')}</div>`
    : '';

  return `<button class="cal-agenda__event" data-event-id="${esc(id)}" data-event-color="${esc(personColor)}" type="button">
    <div class="cal-agenda__event-body">
      <div class="cal-agenda__event-line">${inlineTime}<span class="cal-agenda__event-name">${esc(event.name || 'Untitled event')}</span></div>
      ${event.location ? `<div class="cal-agenda__event-loc">${esc(event.location)}</div>` : ''}
      ${spanBadge}
    </div>
    ${peopleBadges}
  </button>`;
}
