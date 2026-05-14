// calendar-views.js — Pure render functions for calendar week/day/month views.
// No DOM access. Returns HTML strings. Import into calendar.html.

import { addDays, weekStartForDay, weekEndForDay, dateRange, dayOfWeek, monthNumber, yearNumber, monthEnd, escapeHtml, DAY_NAMES_SHORT, normalizePlanSlot } from './utils.js';
import { renderEventPill, renderEventBubble } from './components.js';
import { filterByPerson, filterEventsByPerson, getEventsForDate, sortEvents, dayProgress, isComplete, sortEntries, groupByFrequency } from './state.js';

const esc = (s) => escapeHtml(String(s ?? ''));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Build a compact time-grid HTML for timed events.
 * Events are stacked vertically by overlap group (no empty time gaps).
 * Overlapping events sit side-by-side within a group.
 * @param {Array} timedEvents - [[id, eventObj], ...]
 * @param {Array} people - people array
 * @param {number} scale - px per minute (default 1.5)
 * @param {number} minHeight - minimum pill height in px (default 28)
 * @param {string} wrapperClass - CSS class for the grid container
 * @returns {string} HTML string
 */
function buildTimeGrid(timedEvents, people, { scale = 1.5, minHeight = 28, wrapperClass = 'cal-week__time-grid', itemClass = 'cal-week__timed' } = {}) {
  if (timedEvents.length === 0) return '';

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const parsed = timedEvents.map(([id, evt]) => {
    const start = toMin(evt.startTime);
    const end = evt.endTime ? toMin(evt.endTime) : start + 15;
    return { id, evt, start, end, dur: end - start };
  });

  // Overlap detection
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  let curGroup = [], groupEnd = 0;
  for (const ev of parsed) {
    if (curGroup.length > 0 && ev.start >= groupEnd) { groups.push(curGroup); curGroup = []; }
    curGroup.push(ev);
    groupEnd = Math.max(groupEnd, ev.end);
  }
  if (curGroup.length > 0) groups.push(curGroup);

  // Column assignment per group
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

  // Compact stacked render
  const groupGap = 4;
  let yOffset = 0;
  let html = '';
  for (const group of groups) {
    const groupHeight = Math.max(...group.map(ev => Math.max(ev.dur * scale, minHeight)));
    for (const ev of group) {
      const height = Math.max(ev.dur * scale, minHeight);
      const { col, totalCols } = layout.get(ev);
      const left = (col / totalCols) * 100;
      const width = (1 / totalCols) * 100;
      const pill = renderEventPill(ev.evt, people);
      html += `<div class="${itemClass}" data-event-id="${ev.id}" data-timegrid-pos="${yOffset.toFixed(1)}|${height.toFixed(1)}|${left.toFixed(1)}|${width.toFixed(1)}">${pill}</div>`;
    }
    yOffset += groupHeight + groupGap;
  }
  const gridHeight = Math.max(yOffset - groupGap, 0);
  return `<div class="${wrapperClass}" data-timegrid-height="${gridHeight.toFixed(1)}">${html}</div>`;
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
 * Render the week view.
 * @param {object} opts
 * @param {string} opts.weekStartDate - YYYY-MM-DD of the first day of the displayed week
 * @param {string} opts.today - today's YYYY-MM-DD
 * @param {object} opts.events - all events { eventId: event }
 * @param {object} opts.allSchedule - full schedule { dateKey: { entryKey: entry } }
 * @param {object} opts.completions - all completions
 * @param {object} opts.tasks - all tasks { taskId: task }
 * @param {object} opts.cats - all categories
 * @param {Array} opts.people - people array [{ id, name, color }]
 * @param {string|null} opts.activePerson - filtered person ID or null
 * @param {string} opts.density - 'cozy' | 'snug'
 * @param {number} opts.weekStartDay - 0=Sun, 1=Mon
 * @returns {string} HTML
 */
export function renderWeekView(opts) {
  const { weekStartDate, today, events, allSchedule, completions, tasks, cats, people, activePerson, density, weekStartDay, showDailyInWeek } = opts;
  const days = dateRange(weekStartDate, addDays(weekStartDate, 6));
  const maxPills = density === 'cozy' ? 3 : 5;

  // Day name headers — respect configurable week start
  const dayHeaders = days.map(dk => {
    const dow = dayOfWeek(dk);
    return `<div class="cal-week__dow${dk === today ? ' cal-week__dow--today' : ''}">${DAY_NAMES_SHORT[dow]}<br><span class="cal-week__date-num">${parseInt(dk.split('-')[2], 10)}</span></div>`;
  }).join('');

  // Mobile sort order: today first, future ascending, past at bottom (nearest-past first).
  // When today isn't in this week, keep chronological order.
  const todayPos = days.indexOf(today);
  const mobileOrder = days.map((dk, i) => {
    if (todayPos < 0) return i;
    if (dk === today) return 0;
    if (dk > today) return i - todayPos;
    // Past: after all future days, nearest-past first
    return (days.length - 1 - todayPos) + (todayPos - i);
  });

  const dayColumns = days.map((dk, dayIndex) => {
    const isToday = dk === today;
    const isPast = dk < today;

    // Events for this day
    let dayEvents = getEventsForDate(events, dk, addDays);
    dayEvents = filterEventsByPerson(dayEvents, activePerson);
    const sortedEvents = sortEvents(dayEvents);

    // Tasks — split into weekly/monthly/once vs daily
    const dayEntries = allSchedule[dk] || {};
    const filteredEntries = filterByPerson(dayEntries, activePerson);
    const recurringTasks = {};
    const dailyTasks = {};
    for (const [key, entry] of Object.entries(filteredEntries)) {
      if (entry.type === 'event') continue;
      const rt = entry.rotationType || 'daily';
      if (rt === 'daily') {
        dailyTasks[key] = entry;
      } else {
        recurringTasks[key] = entry;
      }
    }
    const sortedRecurring = sortEntries(recurringTasks, completions);
    const sortedDaily = showDailyInWeek ? sortEntries(dailyTasks, completions) : [];

    // Separate all-day vs timed events
    const allDayEvents = sortedEvents.filter(([, e]) => e.allDay);
    const timedEvents = sortedEvents.filter(([, e]) => !e.allDay && e.startTime);

    // All-day pills (simple list)
    let allDayHtml = '';
    for (const [id, evt] of allDayEvents) {
      allDayHtml += `<div class="cal-week__event-allday" data-event-id="${esc(id)}">${renderEventPill(evt, people)}</div>`;
    }

    // Timed events — compact time grid
    const timeGridHtml = buildTimeGrid(timedEvents, people);

    let eventsHtml = allDayHtml + timeGridHtml;

    // Helper to build task row HTML
    function taskRow(entryKey, entry) {
      const task = tasks[entry.taskId] || { name: 'Unknown' };
      const person = people.find(p => p.id === entry.ownerId);
      const done = isComplete(entryKey, completions);
      const isPastDaily = dk < today && entry.rotationType === 'daily';
      return `<div class="cal-week__task${done ? ' cal-week__task--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}">
        <button class="cal-week__task-check${done ? ' cal-week__task-check--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button" aria-pressed="${done}"></button>
        ${person ? `<span class="cal-week__task-dot" data-bg-color="${person.color}"></span>` : ''}
        <span class="cal-week__task-name">${esc(task.name)}</span>
      </div>`;
    }

    const visibleRecurring = sortedRecurring.slice(0, maxPills);
    const visibleDaily     = sortedDaily.slice(0, maxPills);
    const overflowCount = (sortedRecurring.length - visibleRecurring.length)
                        + (sortedDaily.length - visibleDaily.length);

    let recurringHtml = '';
    for (const [entryKey, entry] of visibleRecurring) recurringHtml += taskRow(entryKey, entry);

    let dailyHtml = '';
    for (const [entryKey, entry] of visibleDaily) dailyHtml += taskRow(entryKey, entry);

    const overflowRow = overflowCount > 0
      ? `<div class="cal-week__task cal-week__task--overflow">+${overflowCount} more</div>`
      : '';

    const dow = dayOfWeek(dk);
    const dayNum = parseInt(dk.split('-')[2], 10);
    const monthIdx = parseInt(dk.split('-')[1], 10) - 1;
    const todayTag = isToday ? '<span class="cal-week__today-tag">Today</span>' : '';
    const colLabel = `<div class="cal-week__col-label"><span class="cal-week__col-day">${DAY_NAMES_FULL[dow]}</span>${todayTag}<span class="cal-week__col-date">${MONTH_NAMES[monthIdx]} ${dayNum}</span></div>`;

    return `<div class="cal-week__col${isToday ? ' cal-week__col--today' : ''}${isPast ? ' cal-week__col--past' : ''}" data-date="${dk}" data-mobile-order="${mobileOrder[dayIndex]}">
      ${colLabel}
      <div class="cal-week__events">${eventsHtml}</div>
      ${recurringHtml ? `<div class="cal-week__tasks">${recurringHtml}</div>` : ''}
      ${dailyHtml ? `<div class="cal-week__tasks cal-week__tasks--daily">${dailyHtml}</div>` : ''}
      ${overflowRow}
    </div>`;
  }).join('');

  return `<div class="cal-week">
    <div class="cal-week__header">${dayHeaders}</div>
    <div class="cal-week__body">${dayColumns}</div>
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
      const incomplete = sorted.filter(([k]) => !isComplete(k, completions));
      const completed  = sorted.filter(([k]) =>  isComplete(k, completions));
      tasksHtml += `<div class="cal-day__freq-group">
        <div class="cal-day__freq-label">${label}</div>`;
      for (const [k, e] of incomplete) tasksHtml += renderDayTaskRow(k, e);
      for (const [k, e] of completed)  tasksHtml += renderDayTaskRow(k, e);
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
  const { viewMonth, today, events, allSchedule, completions, tasks, cats, people, activePerson, density, weekStartDay } = opts;
  const mStart = `${viewMonth}-01`;
  const mEnd = monthEnd(mStart);
  const firstDow = dayOfWeek(mStart);
  const days = dateRange(mStart, mEnd);

  // Day-of-week headers respecting week start day
  const dowHeaders = [];
  for (let i = 0; i < 7; i++) {
    const dow = (weekStartDay + i) % 7;
    dowHeaders.push(`<div class="cal-grid__dow">${DAY_NAMES_SHORT[dow]}</div>`);
  }

  // Empty cells before first day
  const emptyBefore = (firstDow - weekStartDay + 7) % 7;
  const emptyCells = Array(emptyBefore).fill('<div class="cal-grid__cell cal-grid__cell--empty"></div>').join('');

  // Day cells
  const dayCells = days.map(dk => {
    const isToday = dk === today;
    const isPast = dk < today;

    // Events
    let dayEvents = getEventsForDate(events, dk, addDays);
    dayEvents = filterEventsByPerson(dayEvents, activePerson);
    const sortedEvents = sortEvents(dayEvents);

    // Tasks
    const dayEntries = allSchedule[dk] || {};
    const filtered = filterByPerson(dayEntries, activePerson);
    const taskEntries = Object.fromEntries(
      Object.entries(filtered).filter(([, e]) => e.type !== 'event')
    );
    const prog = dayProgress(taskEntries, completions);
    const allDone = prog.total > 0 && prog.done === prog.total;

    let cls = 'cal-grid__cell';
    if (isToday) cls += ' cal-grid__cell--today';
    if (allDone) cls += ' cal-grid__cell--alldone';
    if (isPast && !isToday && prog.total === 0 && sortedEvents.length === 0) cls += ' cal-grid__cell--past';
    else if (isPast && !isToday && !allDone && prog.total > 0) cls += ' cal-grid__cell--past-incomplete';

    const dayNum = parseInt(dk.split('-')[2], 10);

    // Event pills (compact for month cells — show names with owner-color accents)
    const maxEventPills = 2;
    let eventsHtml = '';
    if (sortedEvents.length > 0) {
      const visible = sortedEvents.slice(0, maxEventPills);
      const overflow = sortedEvents.length - maxEventPills;
      eventsHtml = visible.map(([id, e]) => {
        const accentColor = e.color || (people.find(p => e.people?.includes(p.id))?.color) || '#5b7fd6';
        const timeStr = !e.allDay && e.startTime ? e.startTime.replace(/:00$/, '') + ' ' : '';
        return `<div class="cal-grid__event" data-event-id="${esc(id)}" data-bg-color="${esc(accentColor)}">
          ${timeStr ? `<span class="cal-grid__event-time">${esc(timeStr)}</span>` : ''}
          <span class="cal-grid__event-name">${esc(e.name)}</span>
        </div>`;
      }).join('');
      if (overflow > 0) eventsHtml += `<div class="cal-grid__overflow">+${overflow}</div>`;
    }

    // Progress indicator
    let progressHtml = '';
    if (prog.total > 0) {
      const pct = Math.round((prog.done / prog.total) * 100);
      progressHtml = `<div class="cal-grid__progress"><div class="cal-grid__progress-fill" data-progress="${pct}"></div></div>`;
    }

    return `<button class="${cls}" data-date="${dk}" type="button">
      <span class="cal-grid__day">${dayNum}</span>
      ${eventsHtml}
      ${progressHtml}
    </button>`;
  }).join('');

  return `<div class="cal-month">
    <div class="cal-grid">
      ${dowHeaders.join('')}
      ${emptyCells}
      ${dayCells}
    </div>
  </div>`;
}

/**
 * Render the calendar page header with view navigation.
 */
export function renderCalendarNav(opts) {
  const { currentView, viewLabel, isCurrentPeriod, weekStartDay, controlsHtml = '', subtitle = '', titleDateValue = '' } = opts;

  return `<div class="cal-nav">
    <div class="cal-nav__row">
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
      <div class="cal-nav__controls">
        <button class="cal-nav__icon-btn" id="calSearchBtn" type="button" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <div class="segmented-control cal-nav__view-seg" role="tablist" aria-label="View">
          <button class="segmented-btn${currentView === 'week'  ? ' segmented-btn--active' : ''}" data-cal-view="week"  type="button" role="tab">Week</button>
          <button class="segmented-btn${currentView === 'month' ? ' segmented-btn--active' : ''}" data-cal-view="month" type="button" role="tab">Month</button>
          <button class="segmented-btn${currentView === 'day'   ? ' segmented-btn--active' : ''}" data-cal-view="day"   type="button" role="tab">Day</button>
        </div>
        ${controlsHtml}
      </div>
    </div>
  </div>`;
}
