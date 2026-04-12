// calendar-views.js — Pure render functions for calendar week/day/month views.
// No DOM access. Returns HTML strings. Import into calendar.html.

import { addDays, weekStartForDay, weekEndForDay, dateRange, dayOfWeek, monthNumber, yearNumber, monthEnd, escapeHtml, DAY_NAMES_SHORT } from './utils.js';
import { renderEventPill, renderEventBubble } from './components.js';
import { filterByPerson, filterEventsByPerson, getEventsForDate, sortEvents, dayProgress, isComplete, sortEntries } from './state.js';

const esc = (s) => escapeHtml(String(s ?? ''));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  const dayColumns = days.map(dk => {
    const isToday = dk === today;
    const isPast = dk < today;

    // Events for this day
    let dayEvents = getEventsForDate(events, dk);
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

    // Build event pills HTML
    let eventsHtml = '';
    const allDayEvents = sortedEvents.filter(([, e]) => e.allDay);
    const timedEvents = sortedEvents.filter(([, e]) => !e.allDay);
    const visibleEvents = [...allDayEvents, ...timedEvents];
    const overflow = visibleEvents.length - maxPills;

    for (let i = 0; i < Math.min(visibleEvents.length, maxPills); i++) {
      const [, evt] = visibleEvents[i];
      eventsHtml += renderEventPill(evt, people);
    }
    if (overflow > 0) {
      eventsHtml += `<div class="cal-week__overflow">+${overflow} more</div>`;
    }

    // Helper to build task row HTML
    function taskRow(entryKey, entry) {
      const task = tasks[entry.taskId] || { name: 'Unknown' };
      const person = people.find(p => p.id === entry.ownerId);
      const done = isComplete(entryKey, completions);
      return `<label class="cal-week__task${done ? ' cal-week__task--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dk}">
        <input type="checkbox" class="cal-week__task-check" ${done ? 'checked' : ''} data-entry-key="${entryKey}" data-date-key="${dk}">
        ${person ? `<span class="cal-week__task-dot" style="background:${person.color}"></span>` : ''}
        <span class="cal-week__task-name">${esc(task.name)}</span>
      </label>`;
    }

    let recurringHtml = '';
    for (const [entryKey, entry] of sortedRecurring) recurringHtml += taskRow(entryKey, entry);

    let dailyHtml = '';
    for (const [entryKey, entry] of sortedDaily) dailyHtml += taskRow(entryKey, entry);

    const dow = dayOfWeek(dk);
    const dayNum = parseInt(dk.split('-')[2], 10);
    const monthIdx = parseInt(dk.split('-')[1], 10) - 1;
    const colLabel = `<div class="cal-week__col-label"><span class="cal-week__col-day">${DAY_NAMES_FULL[dow]}</span><span class="cal-week__col-date">${MONTH_NAMES[monthIdx]} ${dayNum}</span></div>`;

    return `<div class="cal-week__col${isToday ? ' cal-week__col--today' : ''}${isPast ? ' cal-week__col--past' : ''}" data-date="${dk}">
      ${colLabel}
      <div class="cal-week__events">${eventsHtml}</div>
      ${recurringHtml ? `<div class="cal-week__tasks">${recurringHtml}</div>` : ''}
      ${dailyHtml ? `<div class="cal-week__tasks cal-week__tasks--daily">${dailyHtml}</div>` : ''}
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
  const { dateKey, today, events, allSchedule, completions, tasks, cats, people, activePerson, settings } = opts;

  // Events section
  let dayEvents = getEventsForDate(events, dateKey);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  let eventsHtml = '';
  if (sortedEvents.length > 0) {
    eventsHtml += `<div class="cal-day__section">
      <div class="cal-day__section-header cal-day__section-header--sticky">Events</div>`;
    for (const [eventId, event] of sortedEvents) {
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

    // Group by person
    const byPerson = {};
    for (const [key, entry] of Object.entries(filteredEntries)) {
      const pid = entry.ownerId || '_unassigned';
      if (!byPerson[pid]) byPerson[pid] = {};
      byPerson[pid][key] = entry;
    }

    // Render each person's section
    const personOrder = people.filter(p => byPerson[p.id]).concat(
      byPerson._unassigned ? [{ id: '_unassigned', name: 'Unassigned', color: '#999' }] : []
    );

    for (const person of personOrder) {
      const personEntries = byPerson[person.id];
      if (!personEntries) continue;
      const sorted = sortEntries(personEntries, completions);
      const incomplete = sorted.filter(([k]) => !isComplete(k, completions));
      const completed = sorted.filter(([k]) => isComplete(k, completions));

      tasksHtml += `<div class="cal-day__person">
        <div class="cal-day__person-header" style="--person-color:${person.color}">
          <span class="cal-day__person-dot" style="background:${person.color}"></span>
          ${esc(person.name)}
          <span class="cal-day__person-count">${completed.length}/${sorted.length}</span>
        </div>`;

      for (const [entryKey, entry] of incomplete) {
        const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0, difficulty: 'medium' };
        const cat = task.category ? cats[task.category] : null;
        const isPastDaily = dateKey < today && entry.rotationType === 'daily';
        const todLabel = entry.timeOfDay === 'am' ? 'AM' : entry.timeOfDay === 'pm' ? 'PM' : '';
        tasksHtml += `<div class="cal-day__task" data-entry-key="${entryKey}" data-date-key="${dateKey}">
          <button class="cal-day__task-check" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${isPastDaily ? 'data-tap-blocked="true"' : ''} type="button"></button>
          ${todLabel ? `<span class="cal-day__task-tod">${todLabel}</span>` : ''}
          <span class="cal-day__task-name">${esc(task.name)}</span>
          ${cat?.icon ? `<span class="cal-day__task-icon">${cat.icon}</span>` : ''}
        </div>`;
      }

      if (completed.length > 0) {
        for (const [entryKey, entry] of completed) {
          const task = tasks[entry.taskId] || { name: 'Unknown' };
          tasksHtml += `<div class="cal-day__task cal-day__task--done" data-entry-key="${entryKey}" data-date-key="${dateKey}">
            <button class="cal-day__task-check cal-day__task-check--done" data-entry-key="${entryKey}" data-date-key="${dateKey}" type="button"></button>
            <span class="cal-day__task-name">${esc(task.name)}</span>
          </div>`;
        }
      }

      tasksHtml += `</div>`;
    }
    tasksHtml += `</div>`;
  }

  // Empty state
  if (sortedEvents.length === 0 && Object.keys(filteredEntries).length === 0) {
    const emptyMsg = activePerson ? 'Nothing scheduled for this person' : 'Nothing scheduled';
    eventsHtml = `<div class="cal-day__empty">${emptyMsg}</div>`;
  }

  return `<div class="cal-day"><div class="cal-day__grid">${eventsHtml}${tasksHtml}</div></div>`;
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
  const maxEventNames = density === 'cozy' ? 0 : 2;

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
    let dayEvents = getEventsForDate(events, dk);
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

    // Event names or dots based on density
    let eventsHtml = '';
    if (maxEventNames > 0 && sortedEvents.length > 0) {
      const visible = sortedEvents.slice(0, maxEventNames);
      const overflow = sortedEvents.length - maxEventNames;
      eventsHtml = visible.map(([, e]) =>
        `<div class="cal-grid__event-name" style="color:${e.color || '#5b7fd6'}">${esc(e.name)}</div>`
      ).join('');
      if (overflow > 0) eventsHtml += `<div class="cal-grid__overflow">+${overflow}</div>`;
    } else if (sortedEvents.length > 0) {
      // Cozy: just dots
      const dots = sortedEvents.slice(0, 4).map(([, e]) =>
        `<span class="cal-grid__event-dot" style="background:${e.color || '#5b7fd6'}"></span>`
      ).join('');
      eventsHtml = `<div class="cal-grid__dots">${dots}</div>`;
    }

    // Progress indicator
    let progressHtml = '';
    if (prog.total > 0) {
      const pct = Math.round((prog.done / prog.total) * 100);
      progressHtml = `<div class="cal-grid__progress"><div class="cal-grid__progress-fill" style="width:${pct}%"></div></div>`;
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
  const { currentView, viewLabel, isCurrentPeriod, weekStartDay } = opts;
  const switchLabel = currentView === 'week' ? 'Month' : 'Week';
  const switchIcon = currentView === 'week' ? '📅' : '📋';

  return `<div class="cal-nav">
    <div class="cal-nav__row">
      <button class="date-nav__btn" id="prevPeriod" type="button" title="Previous">&lsaquo;</button>
      <div class="cal-nav__center">
        <span class="cal-nav__label">${viewLabel}</span>
        ${!isCurrentPeriod ? `<button class="cal-today-link" id="goToday" type="button">Today</button>` : ''}
      </div>
      <button class="date-nav__btn" id="nextPeriod" type="button" title="Next">&rsaquo;</button>
      <button class="cal-nav__view-btn" id="viewSwitcher" type="button" title="Switch to ${switchLabel}">${switchIcon}</button>
    </div>
  </div>`;
}
