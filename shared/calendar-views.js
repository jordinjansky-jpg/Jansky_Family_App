// calendar-views.js — Pure render functions for calendar week/day/month views.
// No DOM access. Returns HTML strings. Import into calendar.html.

import { addDays, weekStartForDay, weekEndForDay, dateRange, dayOfWeek, monthNumber, yearNumber, monthEnd, escapeHtml, DAY_NAMES_SHORT } from './utils.js';
import { renderEventPill, renderEventBubble, renderFilterChip, renderSectionHead } from './components.js';
import { filterByPerson, filterEventsByPerson, getEventsForDate, sortEvents, dayProgress, isComplete, sortEntries } from './state.js';

const esc = (s) => escapeHtml(String(s ?? ''));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Render the week view as a vertical agenda of seven day-blocks.
 * Today-first ordering via CSS `order` (today=0, future=1..6, past=7..).
 * Past days are faded by .cal-day-block--past (opacity in CSS).
 *
 * @param {object} opts
 * @param {string} opts.weekStartDate
 * @param {string} opts.today
 * @param {object} opts.events, allSchedule, completions, tasks, cats
 * @param {Array}  opts.people
 * @param {string|null} opts.activePerson
 * @returns {string} HTML
 */
export function renderWeekView(opts) {
  const { weekStartDate, today, events, allSchedule, completions, tasks, cats, people, activePerson } = opts;
  const days = dateRange(weekStartDate, addDays(weekStartDate, 6));
  const todayPos = days.indexOf(today);

  // Compute CSS `order` for each day: today=0, future days chronologically next,
  // past days at the bottom in nearest-past-first order.
  const orderFor = (idx) => {
    if (todayPos < 0) return idx;            // week without today: chronological
    if (idx === todayPos) return 0;
    if (idx > todayPos) return idx - todayPos;
    return (days.length - 1 - todayPos) + (todayPos - idx);
  };

  const blocks = days.map((dk, i) => buildDayBlock({
    dateKey: dk,
    today,
    order: orderFor(i),
    events, allSchedule, completions, tasks, cats, people, activePerson
  })).join('');

  return `<div class="cal-week-agenda">${blocks}</div>`;
}

/**
 * Build a single day-block for the vertical agenda.
 * Block is a section-like container with a day header,
 * optional Events section, optional Tasks section, and a per-day + chip.
 */
function buildDayBlock({ dateKey, today, order, events, allSchedule, completions, tasks, cats, people, activePerson }) {
  const isToday = dateKey === today;
  const isPast = dateKey < today;
  const dow = dayOfWeek(dateKey);
  const dayNum = parseInt(dateKey.split('-')[2], 10);
  const monthIdx = parseInt(dateKey.split('-')[1], 10) - 1;

  // Events
  let dayEvents = getEventsForDate(events, dateKey);
  dayEvents = filterEventsByPerson(dayEvents, activePerson);
  const sortedEvents = sortEvents(dayEvents);

  // Tasks (events filtered out of schedule entries)
  const dayEntries = allSchedule[dateKey] || {};
  const filteredEntries = filterByPerson(dayEntries, activePerson);
  const taskEntries = Object.fromEntries(
    Object.entries(filteredEntries).filter(([, e]) => e.type !== 'event')
  );
  const sortedTasks = sortEntries(taskEntries, completions);
  const doneCount = sortedTasks.filter(([k]) => isComplete(k, completions)).length;
  const totalCount = sortedTasks.length;

  // Header — day name + date + Today badge
  const todayBadge = isToday ? `<span class="cal-day-block__today">Today</span>` : '';
  const header = `<div class="cal-day-block__head">
    ${todayBadge}
    <span class="cal-day-block__day">${DAY_NAMES_FULL[dow]}</span>
    <span class="cal-day-block__date">${MONTH_NAMES[monthIdx]} ${dayNum}</span>
  </div>`;

  // Events section
  let eventsSection = '';
  if (sortedEvents.length > 0) {
    eventsSection = renderSectionHead('Events', null) +
      `<div class="cal-day-block__events">` +
      sortedEvents.map(([eventId, evt]) => renderEventCard(eventId, evt, people)).join('') +
      `</div>`;
  }

  // Tasks section
  let tasksSection = '';
  if (totalCount > 0) {
    const meta = `${doneCount} of ${totalCount} done`;
    tasksSection = renderSectionHead('Tasks', meta, { divider: sortedEvents.length > 0 }) +
      `<div class="cal-day-block__tasks">` +
      sortedTasks.map(([k, e]) => renderTaskCard(k, e, dateKey, today, tasks, cats, people, completions)).join('') +
      `</div>`;
  }

  // Empty inline if both empty
  let emptyInline = '';
  if (sortedEvents.length === 0 && totalCount === 0) {
    emptyInline = `<div class="cal-day-block__empty">Nothing scheduled</div>`;
  }

  // Per-day quick-add
  const addChip = `<button type="button" class="cal-day-add" data-date="${dateKey}" aria-label="Add event for ${MONTH_NAMES[monthIdx]} ${dayNum}">+</button>`;

  const cls = 'cal-day-block' +
    (isToday ? ' cal-day-block--today' : '') +
    (isPast ? ' cal-day-block--past' : '');

  return `<section class="${cls}" data-date="${dateKey}" style="order: ${order}">
    ${header}
    ${eventsSection}
    ${tasksSection}
    ${emptyInline}
    <div class="cal-day-block__foot">${addChip}</div>
  </section>`;
}

/** Helper: render an event card using the shared .card pattern. */
function renderEventCard(eventId, evt, people) {
  const owner = evt.ownerId ? people.find(p => p.id === evt.ownerId) : null;
  const time = evt.allDay ? '' :
    (evt.startTime ? formatEventTime(evt.startTime) + ' — ' : '');
  const stripe = owner ? `data-owner-color="${owner.color}"` : '';
  return `<article class="card card--event" data-event-id="${eventId}" ${stripe}>
    <div class="card__body">
      <div class="card__title">${esc(time)}${esc(evt.name || 'Untitled')}</div>
      ${owner ? `<div class="card__meta"><span class="card__meta-dot"></span>${esc(owner.name)}</div>` : ''}
    </div>
  </article>`;
}

/** Helper: render a task card using the shared .card pattern + check button. */
function renderTaskCard(entryKey, entry, dateKey, today, tasks, cats, people, completions) {
  const task = tasks[entry.taskId] || { name: 'Unknown', estMin: 0 };
  const owner = entry.ownerId ? people.find(p => p.id === entry.ownerId) : null;
  const done = isComplete(entryKey, completions);
  const isPastDaily = dateKey < today && (entry.rotationType || 'daily') === 'daily';
  const cat = task.category ? cats[task.category] : null;
  const todLabel = entry.timeOfDay === 'am' ? 'AM' : entry.timeOfDay === 'pm' ? 'PM' : '';
  const stripe = owner ? `data-owner-color="${owner.color}"` : '';
  const checkSvg = done
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`
    : '';

  return `<article class="card task-card${done ? ' card--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dateKey}" ${stripe} ${isPastDaily ? 'data-tap-blocked="true"' : ''}>
    <div class="card__body">
      <div class="card__title">${esc(task.name)}</div>
      <div class="card__meta">
        ${owner ? `<span class="card__meta-owner">${esc(owner.name)}</span><span class="card__meta-dot"></span>` : ''}
        ${todLabel ? `<span>${todLabel}</span><span class="card__meta-dot"></span>` : ''}
        ${cat?.icon ? `<span class="card__meta-icon" aria-hidden="true">${cat.icon}</span>` : ''}
      </div>
    </div>
    <div class="card__trailing">
      <button class="check${done ? ' check--done' : ''}" data-entry-key="${entryKey}" data-date-key="${dateKey}" type="button" aria-label="${done ? 'Mark incomplete' : 'Mark complete'}">${checkSvg}</button>
    </div>
  </article>`;
}

/** "14:30" → "2:30 PM" */
function formatEventTime(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '';
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
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
    const allDayEvents = sortedEvents.filter(([, e]) => e.allDay);
    const timedEvents = sortedEvents.filter(([, e]) => !e.allDay && e.startTime);

    eventsHtml += `<div class="cal-day__section">
      <div class="cal-day__section-header cal-day__section-header--sticky">Events</div>`;
    // All-day pills
    for (const [, evt] of allDayEvents) {
      eventsHtml += renderEventPill(evt, people);
    }
    // Timed events — rendered as pills (time-grid retired in Phase 2; full day view rewrite in Task 4)
    for (const [, evt] of timedEvents) {
      eventsHtml += renderEventPill(evt, people);
    }
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
        <div class="cal-day__person-header" data-person-color="${person.color}">
          <span class="cal-day__person-dot" data-bg-color="${person.color}"></span>
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
  const maxEventPills = 4;

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

    // Event pills (condensed for month cells)
    let eventsHtml = '';
    if (sortedEvents.length > 0) {
      const visible = sortedEvents.slice(0, maxEventPills);
      const overflow = sortedEvents.length - maxEventPills;
      eventsHtml = visible.map(([, e]) => renderEventPill(e, people)).join('');
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
 * Render the sticky calendar sub-bar.
 * Row 1: View Tabs (Month | Week | Day).
 * Row 2: Date nav (← {label} →) + right-aligned filter chip.
 *
 * Caller wires click handlers on .cal-subbar__view-tab[data-view],
 * .cal-subbar__nav[data-dir], and #openFilterSheet.
 */
export function renderCalSubbar({ currentView, viewLabel, isCurrentPeriod, activePersonName = '', activePersonColor = '' }) {
  const tabs = ['month', 'week', 'day'].map(v => {
    const label = v.charAt(0).toUpperCase() + v.slice(1);
    const cls = 'cal-subbar__view-tab' + (v === currentView ? ' is-active' : '');
    return `<button type="button" class="${cls}" data-view="${v}">${label}</button>`;
  }).join('');

  const todayChip = !isCurrentPeriod
    ? `<button type="button" class="cal-subbar__today" id="goToday">Today</button>`
    : '';

  const filterChip = renderFilterChip({
    id: 'openFilterSheet',
    activePersonName,
    activePersonColor
  });

  return `<div class="cal-subbar">
    <div class="cal-subbar__row cal-subbar__row--tabs" role="tablist">
      ${tabs}
    </div>
    <div class="cal-subbar__row cal-subbar__row--nav">
      <button type="button" class="cal-subbar__nav" data-dir="prev" aria-label="Previous">&lsaquo;</button>
      <div class="cal-subbar__center">
        <span class="cal-subbar__label">${esc(viewLabel)}</span>
        ${todayChip}
      </div>
      <button type="button" class="cal-subbar__nav" data-dir="next" aria-label="Next">&rsaquo;</button>
      <div class="cal-subbar__filter">${filterChip}</div>
    </div>
  </div>`;
}
