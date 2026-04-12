// components.js — Reusable UI rendering functions (v2)
// These functions return HTML strings or create DOM elements.
// Pages call these functions and insert results into the DOM.

import { escapeHtml, formatDateShort } from './utils.js';
import { getPresets, getColorPalette, loadDeviceTheme, saveDeviceTheme, applyTheme, defaultThemeConfig } from './theme.js';

const esc = (s) => escapeHtml(String(s ?? ''));

function formatEventTime(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatMovedDate(dateStr) {
  if (!dateStr) return 'moved';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return 'moved';
  return `${days[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;
}

/**
 * Navigation bar configuration.
 * Adding a page = adding one entry here + creating the HTML file.
 */
const NAV_ITEMS = [
  { icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>', label: 'Home', href: 'index.html', id: 'home' },
  { icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', label: 'Calendar', href: 'calendar.html', id: 'calendar' },
  { icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15l-2 5l9-11h-5l2-5l-9 11z"/></svg>', label: 'Scores', href: 'scoreboard.html', id: 'scoreboard' },
  { icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', label: 'Tracker', href: 'tracker.html', id: 'tracker' }
];

/**
 * Render the bottom navigation bar.
 * activePage: the id of the current page (e.g., 'home', 'calendar')
 * Returns an HTML string.
 */
export function renderNavBar(activePage) {
  const personHome = sessionStorage.getItem('dr-person-home');
  const items = NAV_ITEMS.map(item => {
    let href;
    if (item.id === 'home' && personHome) {
      href = `person.html?person=${encodeURIComponent(personHome)}`;
    } else if (personHome && item.id !== 'home') {
      href = `${item.href}?person=${encodeURIComponent(personHome)}`;
    } else {
      href = item.href;
    }
    const active = item.id === activePage ? ' nav-item--active' : '';
    return `<a href="${href}" class="nav-item${active}" data-page="${item.id}" aria-label="${item.label}"${active ? ' aria-current="page"' : ''}>
      <span class="nav-item__icon" aria-hidden="true">${item.icon}</span>
      <span class="nav-item__label">${item.label}</span>
    </a>`;
  }).join('');

  return `<nav class="bottom-nav" role="navigation" aria-label="Main navigation">${items}</nav>`;
}

/**
 * Render the page header.
 * options: { appName, subtitle, showAdmin, showDebug, rightContent }
 * Returns an HTML string.
 */
export function renderHeader(options = {}) {
  const {
    appName = 'Daily Rundown',
    subtitle = '',
    dateLine = '',
    showAdmin = true,
    showDebug = false,
    showAddTask = false,
    showThemePicker = false,
    rightContent = ''
  } = options;

  const debugIcon = showDebug ? '<span class="header__debug" title="Debug mode active">🐛</span>' : '';
  const adminLink = showAdmin ? '<a href="admin.html" class="header__admin" title="Admin">⚙️</a>' : '';
  const addTaskBtn = showAddTask ? '<button class="header__add-task" id="headerAddTask" title="Add Task" type="button">📝</button>' : '';
  const themeBtn = showThemePicker ? '<button class="header__theme" id="headerThemeBtn" title="Device Theme" type="button">🎨</button>' : '';

  return `<header class="app-header">
    <div class="header__left">
      <h1 class="header__title">${esc(appName)}</h1>
      ${subtitle ? `<span class="header__subtitle">${esc(subtitle)}</span>` : ''}
      ${dateLine ? `<span class="header__date">${esc(dateLine)}</span>` : ''}
    </div>
    <div class="header__right">
      ${rightContent}
      ${addTaskBtn}
      ${themeBtn}
      ${debugIcon}
      ${adminLink}
    </div>
  </header>`;
}

/**
 * Render a connection status indicator.
 * connected: boolean
 */
export function renderConnectionStatus(connected) {
  const cls = connected ? 'connection-dot--online' : 'connection-dot--offline';
  const label = connected ? 'Connected' : 'Offline';
  return `<span class="connection-dot ${cls}" title="${label}" role="status" aria-label="${label}"></span>`;
}

/**
 * Render an undo toast.
 * message: what happened (e.g., "3 tasks marked complete")
 * Returns an HTML string. The page is responsible for inserting it and handling the undo click.
 */
export function renderUndoToast(message) {
  return `<div class="undo-toast" role="alert">
    <span class="undo-toast__message">${message}</span>
    <button class="undo-toast__btn" type="button">Undo</button>
  </div>`;
}

/**
 * Render an empty state message.
 */
const EMPTY_VARIANTS = {
  'all-done':     { icon: '🏆', title: 'Nothing left — you crushed it!' },
  'free-day':     { icon: '🏖️', title: 'Free day!', subtitle: 'Nothing scheduled — enjoy it.' },
  'future-empty': { icon: '📅', title: 'Nothing planned yet' },
  'no-match':     { icon: '🔍', title: 'No tasks for {name}', subtitle: 'Try a different filter.' },
  'kid-done':     { icon: '🎉', title: "You're all done!", subtitle: 'Go play!' },
  'kid-free':     { icon: '☀️', title: 'No chores today!', subtitle: 'Lucky you!' }
};

export function renderEmptyState(icon, title, subtitle = '', options = {}) {
  const { variant, personName, gradeHtml } = options;
  if (variant && EMPTY_VARIANTS[variant]) {
    const v = EMPTY_VARIANTS[variant];
    icon = v.icon;
    title = v.title.replace('{name}', esc(personName || ''));
    subtitle = v.subtitle || subtitle || '';
  }
  const gradeRow = gradeHtml ? `<div class="empty-state__grade">${gradeHtml}</div>` : '';
  return `<div class="empty-state">
    <span class="empty-state__icon">${icon}</span>
    <h3 class="empty-state__title">${title}</h3>
    ${subtitle ? `<p class="empty-state__subtitle">${subtitle}</p>` : ''}
    ${gradeRow}
  </div>`;
}

/**
 * Render a bottom sheet shell.
 * content: HTML string for the sheet body
 * Returns an HTML string.
 */
export function renderBottomSheet(content) {
  return `<div class="bottom-sheet-overlay" id="bottomSheet" role="dialog" aria-modal="true">
    <div class="bottom-sheet">
      <div class="bottom-sheet__handle"></div>
      <div class="bottom-sheet__content">
        ${content}
      </div>
    </div>
  </div>`;
}

/**
 * Render person filter pills.
 * people: array of { id, name, color }
 * activePerson: id of selected person or null for "All"
 * Returns an HTML string.
 */
export function renderPersonFilter(people, activePerson, trailingHtml = '') {
  const allActive = !activePerson ? ' person-pill--active' : '';
  let html = `<div class="person-filter" role="group" aria-label="Filter by person">`;
  html += `<button class="person-pill${allActive}" data-person-id="" aria-pressed="${!activePerson}">All</button>`;

  for (const p of people) {
    const active = activePerson === p.id ? ' person-pill--active' : '';
    html += `<button class="person-pill${active}" data-person-id="${p.id}" style="--person-color: ${p.color}" aria-pressed="${activePerson === p.id}"><span class="person-pill__dot" style="background:${p.color}"></span>${esc(p.name)}</button>`;
  }

  html += trailingHtml;
  html += `</div>`;
  return html;
}

/**
 * Render a progress bar with label.
 * done: number completed, total: number total
 */
export function renderProgressBar(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const label = total === 0 ? 'No tasks today' : `${done} of ${total} done`;
  return `<div class="progress-section">
    <div class="progress-label">
      <span>${label}</span>
      <span class="progress-pct">${pct}%</span>
    </div>
    <div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
      <div class="progress-bar__fill" style="width:${pct}%"></div>
    </div>
  </div>`;
}

/**
 * Render a single task card.
 * options: { entryKey, entry, task, person, category, completed, overdue, dateLabel, points }
 * points: optional { possible, override } — override is the pointsOverride percentage (null = no override)
 */
export function renderTaskCard(options) {
  const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points, isEvent, showPoints = true, isPastDaily = false } = options;
  const doneClass = completed ? ' task-card--done' : '';
  const overdueClass = overdue ? ' task-card--overdue' : '';
  const eventClass = isEvent ? ' task-card--event' : '';
  const showIcon = category?.showIcon !== false;
  const catIcon = showIcon ? (category?.icon || '') : '';
  const ownerColor = person?.color || 'var(--text-secondary)';
  const ownerInitial = (person?.name || '?')[0].toUpperCase();
  const estLabel = task.estMin ? `${task.estMin}m` : '';
  const eventColor = isEvent && category?.eventColor ? category.eventColor : null;

  // Points label: show override value with color if active, else base (skip for events, exempt).
  // When points are hidden but an override is active, show a colored ▲/▼ arrow in the points slot.
  let ptsLabel = '';
  if (points && !isEvent && !task.exempt) {
    if (points.override != null && points.override !== 100) {
      const colorClass = points.override > 100 ? 'task-card__pts--up' : 'task-card__pts--down';
      if (showPoints) {
        const overridePts = Math.round(points.possible * (points.override / 100));
        ptsLabel = `<span class="${colorClass}">${overridePts}pt</span>`;
      } else {
        const icon = points.override > 100 ? '▲' : '▼';
        ptsLabel = `<span class="${colorClass}">${icon}</span>`;
      }
    } else if (showPoints) {
      ptsLabel = `${points.possible}pt`;
    }
  }

  // Delegation/move indicator based on entry key suffix
  let actionTags = '';
  if (entryKey && entryKey.includes('_delegate')) {
    const fromName = entry.delegatedFromName || '?';
    actionTags += `<span class="task-card__tag task-card__tag--delegated">↪ ${esc(fromName)}</span>`;
  }
  if (entryKey && entryKey.includes('_moved')) {
    const fromDate = entry.movedFromDate || '';
    const movedLabel = fromDate ? formatMovedDate(fromDate) : 'moved';
    actionTags += `<span class="task-card__tag task-card__tag--moved">${movedLabel}</span>`;
  }
  // Late chip for incomplete past daily tasks
  if (isPastDaily && !completed) {
    actionTags += `<span class="task-card__tag task-card__tag--late">Late</span>`;
  }

  const eventTimeLabel = isEvent && task.eventTime ? formatEventTime(task.eventTime) : '';
  const entryTod = entry.timeOfDay;
  const taskTod = task.timeOfDay;
  const isAmOrPm = entryTod === 'am' || entryTod === 'pm';
  const showTod = isAmOrPm && ((taskTod === 'both' && options.showTodIconBoth) || (taskTod !== 'both' && options.showTodIconSingle));
  const todLabel = showTod ? (entryTod === 'am' ? '🌅 AM' : '🌙 PM') : '';
  const meta = [todLabel, eventTimeLabel, estLabel, ptsLabel].filter(Boolean).join(' · ');
  const dateLine = dateLabel ? `<span class="task-card__date">${dateLabel}</span>` : '';
  const eventPrefix = isEvent ? '📅 ' : '';
  const taskName = catIcon ? `${esc(task.name)} ${catIcon}` : `${eventPrefix}${esc(task.name)}`;
  const eventStyle = eventColor ? `;--event-color:${eventColor}` : '';
  const tagsRow = actionTags ? `<div class="task-card__tags">${actionTags}</div>` : '';

  return `<button class="task-card${doneClass}${overdueClass}${eventClass}" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button" aria-pressed="${completed}" style="--owner-color:${ownerColor}${eventStyle}">
      <span class="task-card__avatar">${ownerInitial}</span>
      <div class="task-card__body">
        <span class="task-card__name">${taskName}</span>
        ${tagsRow}
      </div>
      <div class="task-card__right">
        <span class="task-card__meta">${meta}</span>
        ${dateLine}
        <span class="task-card__check"></span>
      </div>
    </button>`;
}

/**
 * Render a time-of-day section header.
 * label: 'Morning', 'Afternoon', 'Anytime'
 */
export function renderTimeHeader(label) {
  return `<div class="time-header">${label}</div>`;
}

/**
 * Render the overdue summary card.
 * count: number of overdue entries
 */
export function renderOverdueBanner(count) {
  if (count === 0) return '';
  const s = count === 1 ? 'task' : 'tasks';
  return `<button class="overdue-banner" id="overdueToggle" type="button" aria-expanded="false" aria-controls="overdueList">
    <span class="overdue-banner__icon" aria-hidden="true">⚠️</span>
    <span class="overdue-banner__text">${count} overdue ${s}</span>
    <span class="overdue-banner__arrow" id="overdueArrow" aria-hidden="true">▸</span>
  </button>`;
}

/**
 * Render a grade badge.
 * grade: letter string (e.g., 'A+', 'B-'), tier: 'a'|'b'|'c'|'d'|'f'
 */
export function renderGradeBadge(grade, tier) {
  if (!grade || grade === '--') return `<span class="grade-badge grade-badge--none" aria-label="No grade">--</span>`;
  return `<span class="grade-badge grade-badge--${tier}" aria-label="Grade: ${grade}">${grade}</span>`;
}

// ── Calendar event helpers (private) ──────────────────────────

/** Format "HH:MM" 24h to "3:30pm" */
function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Format time range "3:30pm – 4:30pm" or just "3:30pm" if no end */
function formatTimeRange(start, end) {
  const s = formatTime12(start);
  if (!end) return s;
  return `${s} – ${formatTime12(end)}`;
}

// ── Calendar event components ─────────────────────────────────

/**
 * Render an event pill for week/month views.
 * event: { name, startTime, allDay, color, people[] }
 * people: array of { id, name, color }
 */
/**
 * Build multi-person event styling.
 * Single person: solid color. Multiple people: horizontal gradient blend (all-day)
 * or segmented left border (timed).
 */
function eventPersonColors(event, people) {
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  return assignedPeople.map(p => p.color);
}

function eventAllDayBg(event, people) {
  const colors = eventPersonColors(event, people);
  const eventColor = event.color || '#5b7fd6';
  if (colors.length <= 1) return eventColor;
  // Soft horizontal gradient blending person colors
  return `linear-gradient(90deg, ${colors.join(', ')})`;
}

function eventTimedBorderGradient(colors) {
  // Vertical segmented border: each person's color stacked evenly
  const pct = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * pct}%, ${c} ${(i + 1) * pct}%`);
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

export function renderEventPill(event, people = []) {
  const isTimed = !event.allDay && event.startTime;
  const colors = eventPersonColors(event, people);
  const isMulti = colors.length > 1;

  // Person color dots for multi-person events
  const dotsHtml = isMulti
    ? `<span class="event-pill__people">${colors.map(c => `<span class="event-pill__dot" style="background:${c}"></span>`).join('')}</span>`
    : '';

  if (isTimed) {
    const timeStr = formatTimeRange(event.startTime, event.endTime);
    const barColor = event.color || '#5b7fd6';
    const isShort = !event.endTime;
    const cls = `event-pill event-pill--timed${isShort ? ' event-pill--short' : ''}${isMulti ? ' event-pill--multi' : ''}`;
    // Multi-person timed: segmented left border via gradient
    const borderStyle = isMulti
      ? `--event-bg:${barColor};border-image:${eventTimedBorderGradient(colors)} 1;border-image-slice:1`
      : `--event-bg:${barColor}`;
    return `<div class="${cls}" style="${borderStyle}">
      <span class="event-pill__time">${esc(timeStr)}</span>
      <span class="event-pill__text">${esc(event.name)}</span>
      ${dotsHtml}
    </div>`;
  }

  // All-day: solid or gradient blend + dots
  const bg = eventAllDayBg(event, people);
  return `<div class="event-pill${isMulti ? ' event-pill--multi' : ''}" style="background:${bg}">
    <span class="event-pill__text">${esc(event.name)}</span>
    ${dotsHtml}
  </div>`;
}

/**
 * Render an event bubble for day view (larger, more detail than pill).
 */
export function renderEventBubble(eventId, event, people = []) {
  const bg = event.color || '#5b7fd6';
  const timeStr = event.allDay ? 'All Day' : formatTimeRange(event.startTime, event.endTime);
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  const peopleDots = assignedPeople.map(p =>
    `<span class="event-bubble__dot" style="background:${p.color}" title="${esc(p.name)}"></span>`
  ).join('');
  const locationHtml = event.location ? `<span class="event-bubble__location">${esc(event.location)}</span>` : '';

  return `<button class="event-bubble" data-event-id="${eventId}" style="--event-color:${bg}" type="button">
    <div class="event-bubble__time">${esc(timeStr)}</div>
    <div class="event-bubble__name">${esc(event.name)}</div>
    ${locationHtml}
    <div class="event-bubble__people">${peopleDots}</div>
  </button>`;
}

/**
 * Render the universal "+" add menu.
 * options: array of { key, label, icon }
 */
export function renderAddMenu(options) {
  const items = options.map(o =>
    `<button class="add-menu__item" data-action="${o.key}" type="button">
      <span class="add-menu__icon">${o.icon}</span>
      <span class="add-menu__label">${esc(o.label)}</span>
    </button>`
  ).join('');
  return `<div class="add-menu">${items}</div>`;
}

/**
 * Render the view switcher button for the calendar header.
 * currentView: 'week' | 'month'
 */
export function renderViewSwitcher(currentView) {
  const icon = currentView === 'week' ? '📅' : '📋';
  const label = currentView === 'week' ? 'Month' : 'Week';
  return `<button class="view-switcher" id="viewSwitcher" type="button" title="Switch to ${label} view">${icon}</button>`;
}

/**
 * Render the new event creation/edit form.
 * options: { event?, eventId?, people, dateKey, mode: 'create'|'edit' }
 */
export function renderEventForm({ event = {}, eventId = null, people = [], dateKey = '', mode = 'create' }) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Event' : 'New Event';
  const saveLabel = isEdit ? 'Save' : 'Create';
  const peoplePills = people.map(p => {
    const selected = (event.people || []).includes(p.id);
    return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${esc(p.name)}</button>`;
  }).join('');

  const colorPalette = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fdd663', '#57bb8a', '#e8710a', '#795548', '#9e9e9e', '#607d8b'];
  const currentColor = event.color || people[0]?.color || '#4285f4';
  const colorDots = colorPalette.map(c =>
    `<button class="dt-color-btn${c === currentColor ? ' dt-color-btn--active' : ''}" data-color="${c}" style="background:${c}" type="button"></button>`
  ).join('');

  return `<div class="task-detail-sheet">
    <h3 class="admin-form__title">${title}</h3>
    <div class="admin-form__group">
      <label class="form-label" for="ef_name">Event name</label>
      <input class="form-input" id="ef_name" type="text" placeholder="Soccer practice, Dentist, etc." value="${esc(event.name || '')}" autocomplete="off">
    </div>
    <div class="admin-form__group">
      <label class="form-label" for="ef_date">Date</label>
      <input class="form-input" id="ef_date" type="date" value="${event.date || dateKey}">
    </div>
    <div class="admin-form__group">
      <label class="form-label">
        <input type="checkbox" id="ef_allDay" ${event.allDay ? 'checked' : ''}> All day
      </label>
    </div>
    <div class="ef-time-row" id="ef_timeGroup" ${event.allDay ? 'style="display:none"' : ''}>
      <div class="ef-time-field">
        <label class="form-label" for="ef_startTime">Start</label>
        <input class="form-input" id="ef_startTime" type="time" value="${event.startTime || ''}">
      </div>
      <div class="ef-time-field">
        <label class="form-label" for="ef_endTime">End</label>
        <input class="form-input" id="ef_endTime" type="time" value="${event.endTime || ''}">
      </div>
    </div>
    <div class="admin-form__group">
      <label class="form-label">People</label>
      <div class="owner-chips" id="ef_people">${peoplePills}</div>
    </div>
    <details class="ef-more-options">
      <summary class="form-label ef-more-toggle">More options</summary>
      <div class="admin-form__group">
        <label class="form-label">Color</label>
        <div class="dt-colors" id="ef_colors">${colorDots}</div>
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="ef_location">Location</label>
        <input class="form-input" id="ef_location" type="text" placeholder="Optional" value="${esc(event.location || '')}">
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="ef_notes">Notes</label>
        <textarea class="form-input form-textarea" id="ef_notes" rows="2" placeholder="Optional">${esc(event.notes || '')}</textarea>
      </div>
      <div class="admin-form__group">
        <label class="form-label" for="ef_url">Link / URL</label>
        <input class="form-input" id="ef_url" type="url" placeholder="Optional" value="${esc(event.url || '')}">
      </div>
    </details>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="ef_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="ef_save" type="button" ${eventId ? `data-event-id="${eventId}"` : ''}>${saveLabel}</button>
    </div>
    ${isEdit ? `<button class="btn btn--danger btn--small mt-md" id="ef_delete" type="button" data-event-id="${eventId}">Delete Event</button>` : ''}
  </div>`;
}

/**
 * Render event detail sheet (shown on tap in day view).
 */
export function renderEventDetailSheet(eventId, event, people = []) {
  const timeStr = event.allDay ? 'All Day' : formatTimeRange(event.startTime, event.endTime);
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  const peopleHtml = assignedPeople.map(p =>
    `<span class="chip" style="--person-color:${p.color}">${esc(p.name)}</span>`
  ).join(' ');

  return `<div class="task-detail-sheet">
    <div class="event-detail__color-bar" style="background:${event.color || '#5b7fd6'}"></div>
    <h3 class="event-detail__name">${esc(event.name)}</h3>
    <div class="event-detail__time">${esc(timeStr)}</div>
    <div class="event-detail__date">${formatDateShort(event.date)}</div>
    ${peopleHtml ? `<div class="event-detail__people">${peopleHtml}</div>` : ''}
    ${event.location ? `<div class="event-detail__row"><strong>Location:</strong> ${esc(event.location)}</div>` : ''}
    ${event.notes ? `<div class="event-detail__row"><strong>Notes:</strong> ${esc(event.notes)}</div>` : ''}
    ${event.url ? `<div class="event-detail__row"><a href="${esc(event.url)}" target="_blank" rel="noopener">Open Link</a></div>` : ''}
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="eventEdit" data-event-id="${eventId}" type="button">Edit</button>
      <button class="btn btn--danger btn--small" id="eventDelete" data-event-id="${eventId}" type="button">Delete</button>
    </div>
  </div>`;
}

/**
 * Render a task detail bottom sheet (long-press actions).
 * options: { entryKey, entry, task, person, category, completed, points, sliderMin, sliderMax, currentOverride, gradePreview }
 */
export function renderTaskDetailSheet(options) {
  const {
    entryKey, entry, task, person, category, completed, points,
    sliderMin, sliderMax, currentOverride, gradePreview,
    people, showDelegate, showMove, showEdit, dateKey, showPoints = true,
    isEvent = false, readOnly = false, isPastDate = false
  } = options;
  const catIcon = category?.icon || '';
  const ownerColor = person?.color || 'var(--text-secondary)';
  const diffLabel = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[task.difficulty] || 'Medium';
  const rotLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'One-Time' }[entry.rotationType] || '';
  const todLabel = { am: 'Morning', pm: 'Afternoon', anytime: 'Anytime' }[entry.timeOfDay] || '';
  const sliderVal = currentOverride ?? 100;

  let html = `<div class="task-detail-sheet">`;

  // Task info
  html += `<div class="task-detail__info">
    <div class="task-detail__name" style="--owner-color:${ownerColor}">
      <span class="task-card__avatar">${(person?.name || '?')[0].toUpperCase()}</span>
      <span>${esc(task.name)}${catIcon ? ' ' + catIcon : ''}</span>
    </div>
    <div class="task-detail__meta">
      ${person ? `<span class="chip" style="--person-color:${person.color}">${esc(person.name)}</span>` : ''}
      <span class="chip">${rotLabel}</span>
      <span class="chip">${diffLabel}</span>
      ${todLabel ? `<span class="chip">${todLabel}</span>` : ''}
      ${task.eventTime ? `<span class="chip">🕐 ${formatEventTime(task.eventTime)}</span>` : ''}
      ${task.estMin ? `<span class="chip">${task.estMin}m</span>` : ''}
      ${points && !task.exempt && showPoints ? `<span class="chip">${points.possible}pt</span>` : ''}
    </div>
    ${entry.delegatedFromName ? `<div class="task-detail__source-info">↪ Delegated from <strong>${esc(entry.delegatedFromName)}</strong></div>` : ''}
    ${entry.movedFromDate ? `<div class="task-detail__source-info">📅 Moved from <strong>${formatMovedDate(entry.movedFromDate).replace('from ', '')}</strong></div>` : ''}
  </div>`;

  // Event notes
  if (isEvent) {
    const noteText = entry.notes || '';
    if (readOnly) {
      // Read-only mode (kid mode)
      if (noteText) {
        html += `<div class="task-detail__notes mt-md">
          <span class="form-label">Notes</span>
          <div class="task-detail__notes-text">${esc(noteText)}</div>
        </div>`;
      }
    } else {
      html += `<div class="task-detail__notes mt-md">
        <span class="form-label">Notes</span>
        <div class="task-detail__notes-display" id="notesDisplay" style="display:${noteText ? '' : 'none'}">
          <div class="task-detail__notes-text" id="notesText">${esc(noteText)}</div>
          <button class="btn btn--ghost btn--sm" id="notesEditBtn" type="button">Edit</button>
        </div>
        <button class="btn btn--ghost btn--sm" id="notesAddBtn" type="button" style="display:${noteText ? 'none' : ''}">+ Add Note</button>
        <div class="task-detail__notes-editor" id="notesEditor" style="display:none">
          <textarea class="task-detail__notes-input" id="notesInput" rows="3" placeholder="Add notes for this event...">${esc(noteText)}</textarea>
          <div class="task-detail__notes-actions">
            <button class="btn btn--secondary btn--sm" id="notesCancelBtn" type="button">Cancel</button>
            <button class="btn btn--primary btn--sm" id="notesSaveBtn" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">Save</button>
          </div>
        </div>
      </div>`;
    }
  }

  // Complete/uncomplete button
  const isLateEligible = isPastDate && !completed && !isEvent && !task.exempt;
  const toggleLabel = completed ? 'Mark Incomplete' : (isLateEligible ? 'Complete (Late)' : 'Mark Complete');
  const toggleClass = completed ? 'btn--secondary' : 'btn--primary';
  html += `<button class="btn ${toggleClass} btn--full mt-md" id="sheetToggleComplete" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">${toggleLabel}</button>`;

  // Action buttons row: Delegate, Move, Edit
  const hasActions = showDelegate || showMove || showEdit;
  if (hasActions) {
    html += `<div class="task-detail__actions mt-md">`;

    if (showDelegate) {
      html += `<button class="btn btn--secondary btn--sm" id="sheetDelegate" type="button">👤 Delegate</button>`;
    }
    if (showMove) {
      html += `<button class="btn btn--secondary btn--sm" id="sheetMove" type="button">📅 Move</button>`;
      html += `<button class="btn btn--ghost btn--sm" id="moveSkip" type="button">⏭ Skip</button>`;
    }
    if (showEdit) {
      html += `<button class="btn btn--secondary btn--sm" id="sheetEdit" data-task-id="${entry.taskId}" type="button">✏️ Edit</button>`;
    }

    html += `</div>`;
  }

  // Delegate panel (hidden by default, shown when Delegate clicked)
  if (showDelegate && people) {
    const otherPeople = people.filter(p => p.id !== entry.ownerId);
    html += `<div class="task-detail__delegate-panel" id="delegatePanel" style="display:none;">
      <div class="task-detail__delegate-header">
        <span class="form-label">Reassign to:</span>
        ${showMove ? `<label class="task-detail__move-toggle"><input type="checkbox" id="delegateMoveToggle"> 📅 Move too</label>` : ''}
      </div>
      <div class="task-detail__person-chips">
        ${otherPeople.map(p => `<button class="chip chip--selectable" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${esc(p.name)}</button>`).join('')}
      </div>
      <input type="date" id="delegateMoveDatePicker" class="task-detail__date-input" style="position:absolute;opacity:0;pointer-events:none;">
    </div>`;
  }

  // Move date picker (hidden input, triggered by Move button)
  if (showMove) {
    html += `<input type="date" id="moveDatePicker" class="task-detail__date-input" style="position:absolute;opacity:0;pointer-events:none;">`;
  }

  // Points slider — always visible regardless of showPoints (that only hides card labels)
  if (points) {
    const min = sliderMin ?? 0;
    const max = sliderMax ?? 150;
    const earnedPts = Math.round(points.possible * (sliderVal / 100));
    const sliderLabel = 'Points Override';
    html += `<div class="task-detail__slider mt-md">
      <div class="task-detail__slider-header">
        <span class="form-label">${sliderLabel}</span>
        <span class="task-detail__slider-value task-detail__slider-value--numeric" id="sliderValueLabel">${sliderVal}% (${earnedPts}pt)</span>
      </div>
      <div class="task-detail__slider-row">
        <input type="range" class="slider" id="pointsSlider" min="${min}" max="${max}" value="${sliderVal}" step="5" data-entry-key="${entryKey}" data-base-pts="${points.possible}">
        ${sliderVal !== 100 ? `<button class="btn btn--secondary btn--sm" id="sliderReset" type="button">Reset</button>` : ''}
      </div>
      ${gradePreview ? `<div class="task-detail__grade-preview" id="gradePreview">Grade: ${gradePreview}</div>` : ''}
    </div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Render the day-complete celebration overlay.
 */
export function renderCelebration() {
  const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997','#ff6b6b'];
  let confetti = '';
  for (let i = 0; i < 15; i++) {
    const color = colors[i % colors.length];
    const left = 5 + Math.round((i * 6.5) % 90);
    const delay = (i * 0.12).toFixed(2);
    const size = 8 + (i % 3) * 4;
    confetti += `<span class="celebration__confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;width:${size}px;height:${size}px;"></span>`;
  }
  return `<div class="celebration" id="celebration">
    ${confetti}
    <div class="celebration__content">
      <span class="celebration__icon">🎉</span>
      <h3 class="celebration__title">All Done!</h3>
      <p class="celebration__subtitle">Great job finishing today's tasks!</p>
    </div>
  </div>`;
}

/**
 * Render a condensed task form that fits mobile without scrolling.
 * @param {Object} opts
 * @param {Object} opts.task - task object ({} for new)
 * @param {string|null} opts.taskId - task ID or null for create
 * @param {'create'|'edit'} opts.mode
 * @param {Array} opts.categories - [{ key, label, icon, isEvent, isDefault }]
 * @param {Array} opts.people - [{ id, name, color }]
 * @param {string} opts.prefix - ID prefix ('tf','qa','et')
 */
export function renderTaskFormCompact({ task = {}, taskId = null, mode = 'create', categories = [], people = [], prefix = 'tf' }) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Task' : 'New Task';
  const selectedOwners = task.owners || [];
  const assignMode = task.ownerAssignmentMode || 'rotate';
  const catObj = categories.find(c => c.key === task.category);
  const isEvent = !!catObj?.isEvent;
  const showDedicated = task.rotation && task.rotation !== 'daily';

  const catOptions = categories.map(c =>
    `<option value="${esc(c.key)}" data-event="${c.isEvent ? '1' : ''}"${
      task.category === c.key || (!task.category && c.isDefault) ? ' selected' : ''
    }>${esc(c.icon)} ${esc(c.label)}</option>`
  ).join('');

  const ownerChips = people.map(p =>
    `<button type="button" class="owner-chip${selectedOwners.includes(p.id) ? ' owner-chip--selected' : ''}" data-id="${p.id}">${esc(p.name)}</button>`
  ).join('');

  const dayOptions = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
    const val = (i + 1) % 7;
    return `<option value="${val}"${task.dedicatedDay === val ? ' selected' : ''}>${d}</option>`;
  }).join('');

  return `<div class="form-compact" id="${prefix}_form">
    <h3 class="admin-form__title">${title}</h3>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input type="text" id="${prefix}_name" value="${esc(task.name || '')}" placeholder="e.g., Take out trash">
    </div>
    <div class="form-row-3">
      <div class="form-group">
        <label class="form-label">Rotation</label>
        <select id="${prefix}_rotation">
          <option value="daily"${task.rotation === 'daily' ? ' selected' : ''}>Daily</option>
          <option value="weekly"${task.rotation === 'weekly' ? ' selected' : ''}>Weekly</option>
          <option value="monthly"${task.rotation === 'monthly' ? ' selected' : ''}>Monthly</option>
          <option value="once"${task.rotation === 'once' ? ' selected' : ''}>One-Time</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Difficulty</label>
        <select id="${prefix}_difficulty">
          <option value="easy"${task.difficulty === 'easy' ? ' selected' : ''}>Easy</option>
          <option value="medium"${(task.difficulty || 'medium') === 'medium' ? ' selected' : ''}>Medium</option>
          <option value="hard"${task.difficulty === 'hard' ? ' selected' : ''}>Hard</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Time</label>
        <select id="${prefix}_timeOfDay">
          <option value="anytime"${(task.timeOfDay || 'anytime') === 'anytime' ? ' selected' : ''}>Any</option>
          <option value="am"${task.timeOfDay === 'am' ? ' selected' : ''}>AM</option>
          <option value="pm"${task.timeOfDay === 'pm' ? ' selected' : ''}>PM</option>
          <option value="both"${task.timeOfDay === 'both' ? ' selected' : ''}>Both</option>
        </select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-group form-group--2fr">
        <label class="form-label">Category</label>
        <select id="${prefix}_category">${catOptions}</select>
      </div>
      <div class="form-group form-group--1fr">
        <label class="form-label">Est. Min</label>
        <input type="number" id="${prefix}_estMin" value="${task.estMin ?? 10}" min="0" max="120">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Owners</label>
      <div class="owner-chips" id="${prefix}_owners">${ownerChips}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Assign</label>
      <div class="form-row" id="${prefix}_assignMode">
        <button class="btn btn--secondary btn--sm admin-mode-btn${assignMode === 'rotate' ? ' admin-mode-btn--active' : ''}" data-mode="rotate" type="button">Rotate</button>
        <button class="btn btn--secondary btn--sm admin-mode-btn${assignMode === 'duplicate' ? ' admin-mode-btn--active' : ''}" data-mode="duplicate" type="button">Duplicate</button>
      </div>
    </div>
    <div class="inline-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Cooldown</label>
        <input type="number" id="${prefix}_cooldown" value="${task.cooldownDays || ''}" min="0" max="30" placeholder="0">
      </div>
      <label class="admin-checkbox"><input type="checkbox" id="${prefix}_exempt"${task.exempt ? ' checked' : ''}> Exempt</label>
    </div>
    <div class="form-group" id="${prefix}_dedicatedDayGroup" style="display:${showDedicated ? '' : 'none'}">
      <label class="form-label" id="${prefix}_dedicatedDayLabel">${task.rotation === 'once' ? (isEvent ? 'Event Date' : 'Date') : 'Day'} <button type="button" id="${prefix}_eventDateBtn" class="btn btn--ghost btn--sm" style="display:${isEvent ? 'inline' : 'none'};padding:0 4px;font-size:1.1em;vertical-align:middle" title="Pick event date">📅</button></label>
      <input type="date" id="${prefix}_eventDate" style="position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;clip:rect(0,0,0,0);" value="${task.dedicatedDate || ''}">
      <select id="${prefix}_daySelect" class="dedicated-day-select" style="display:${task.rotation === 'once' ? 'none' : ''}">
        <option value=""${task.dedicatedDay == null ? ' selected' : ''}>Any</option>
        ${dayOptions}
      </select>
      <div id="${prefix}_dedicatedDateRow" style="display:${task.rotation === 'once' && !isEvent ? '' : 'none'}">
        <input type="date" id="${prefix}_dedicatedDate" class="task-detail__date-input" style="width:100%" value="${task.dedicatedDate || ''}">
      </div>
    </div>
    <div class="form-group" id="${prefix}_eventTimeGroup" style="display:${isEvent ? '' : 'none'}">
      <label class="form-label">Event Time</label>
      <input type="time" id="${prefix}_eventTime" value="${task.eventTime || ''}">
    </div>
    <div class="form-group" id="${prefix}_notesGroup" style="display:${isEvent ? '' : 'none'}">
      <label class="form-label">Notes</label>
      <textarea id="${prefix}_notes" class="task-detail__notes-input" rows="3" placeholder="Add notes for this event...">${esc(task.notes || '')}</textarea>
    </div>
    <div class="admin-form__actions">
      <button class="btn btn--secondary" id="${prefix}_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="${prefix}_save" type="button"${taskId ? ` data-task-id="${taskId}"` : ''}>${isEdit ? 'Save' : 'Create'}</button>
    </div>
  </div>`;
}

/**
 * Render the quick-add task bottom sheet.
 * people: array of { id, name, color }
 * categories: array of { key, label, icon }
 */
export function renderQuickAddSheet(people, categories, defaultCategoryKey) {
  const task = defaultCategoryKey ? { category: defaultCategoryKey } : {};
  return `<div class="task-detail-sheet">${renderTaskFormCompact({
    task,
    mode: 'create',
    categories,
    people,
    prefix: 'qa'
  })}</div>`;
}

/**
 * Render an inline edit task form inside a bottom sheet.
 * task: the task object, categories: [{key, label, icon}], people: [{id, name, color}]
 */
export function renderEditTaskSheet(taskId, task, categories, people) {
  return `<div class="task-detail-sheet">${renderTaskFormCompact({
    task,
    taskId,
    mode: 'edit',
    categories,
    people,
    prefix: 'et'
  })}</div>`;
}

export function renderOfflineBanner(message) {
  return `<div class="offline-banner" role="status" aria-live="polite">
    <span class="offline-banner__dot"></span>
    <span class="offline-banner__text">${esc(message)}</span>
  </div>`;
}

// initOwnerChips / getSelectedOwners moved to ./dom-helpers.js
// (components.js stays pure — no DOM access)

/**
 * Open the device theme picker bottom sheet.
 * mountEl: DOM element to render into
 * familyTheme: the Firebase settings.theme (fallback when device override cleared)
 * onApply: optional callback after theme changes (e.g. to re-render page)
 */
export function openDeviceThemeSheet(mountEl, familyTheme, onApply, personOpts) {
  const presets = getPresets();
  const colorPalette = getColorPalette();
  const current = loadDeviceTheme();
  const currentPreset = current?.preset || '';
  // For person pages, use person's color as the active accent
  const currentAccent = personOpts
    ? (personOpts.person.color || '#5b7fd6')
    : (current?.accentColor || familyTheme?.accentColor || '#5b7fd6');

  const html = renderBottomSheet(`<div class="task-detail-sheet">
    <h3 class="admin-form__title">${personOpts ? 'My Settings' : 'Device Theme'}</h3>
    <div class="dt-section">
      <label class="form-label">Theme</label>
      <div class="dt-themes">
        <button class="dt-theme-btn${!currentPreset ? ' dt-theme-btn--active' : ''}" data-preset="" type="button">Family Default</button>
        ${presets.map(p => `<button class="dt-theme-btn${currentPreset === p.key ? ' dt-theme-btn--active' : ''}" data-preset="${p.key}" type="button">${esc(p.label)}</button>`).join('')}
      </div>
    </div>
    <div class="dt-section">
      <label class="form-label">${personOpts ? 'My Color' : 'Accent Color'}</label>
      <div class="dt-colors">
        ${colorPalette.map(c => `<button class="dt-color-btn${c === currentAccent ? ' dt-color-btn--active' : ''}" data-color="${c}" style="background:${c}" type="button"></button>`).join('')}
      </div>
    </div>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="dtClose" type="button">Done</button>
    </div>
  </div>`);

  mountEl.innerHTML = html;

  requestAnimationFrame(() => {
    const overlay = document.getElementById('bottomSheet');
    if (overlay) overlay.classList.add('active');
  });

  let activePreset = currentPreset;
  let activeAccent = currentAccent;

  async function applyAndSave() {
    if (!activePreset) {
      if (!personOpts) saveDeviceTheme(null);
      applyTheme(familyTheme || defaultThemeConfig());
      if (personOpts) {
        personOpts.person.theme = null;
        const { id, ...data } = personOpts.person;
        await personOpts.writePerson(id, data);
      }
    } else {
      const info = presets.find(p => p.key === activePreset);
      const themeConfig = { mode: info.mode, preset: activePreset, accentColor: activeAccent };
      if (!personOpts) saveDeviceTheme(themeConfig);
      applyTheme(themeConfig);
      if (personOpts) {
        personOpts.person.theme = themeConfig;
        const { id, ...data } = personOpts.person;
        await personOpts.writePerson(id, data);
      }
    }
    if (onApply) onApply();
  }

  // Theme buttons
  mountEl.querySelectorAll('.dt-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mountEl.querySelectorAll('.dt-theme-btn').forEach(b => b.classList.remove('dt-theme-btn--active'));
      btn.classList.add('dt-theme-btn--active');
      activePreset = btn.dataset.preset;
      applyAndSave();
    });
  });

  // Accent color buttons (also sets person color when on a person page)
  mountEl.querySelectorAll('.dt-color-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      mountEl.querySelectorAll('.dt-color-btn').forEach(b => b.classList.remove('dt-color-btn--active'));
      btn.classList.add('dt-color-btn--active');
      activeAccent = btn.dataset.color;
      if (!activePreset) {
        // If on family default, auto-switch to the family preset so accent takes effect
        const fam = familyTheme || defaultThemeConfig();
        activePreset = fam.preset;
        mountEl.querySelectorAll('.dt-theme-btn').forEach(b => {
          b.classList.toggle('dt-theme-btn--active', b.dataset.preset === activePreset);
        });
      }
      if (personOpts) {
        personOpts.person.color = btn.dataset.color;
      }
      applyAndSave();
    });
  });

  // Close
  function closeSheet() {
    const overlay = document.getElementById('bottomSheet');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => { mountEl.innerHTML = ''; }, 300);
    } else {
      mountEl.innerHTML = '';
    }
  }

  const overlay = document.getElementById('bottomSheet');
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  document.getElementById('dtClose')?.addEventListener('click', closeSheet);
}

/**
 * Initialize the offline/online banner and connection dot.
 * Creates a mount element, subscribes to connection changes, and auto-hides banners.
 *
 * @param {Function} onConnectionChange - Firebase connection listener function
 * @param {object} options - { showConnectionDot: boolean } — dot updates the header
 * @returns {Function} unsubscribe function
 */
export function initOfflineBanner(onConnectionChange, options = {}) {
  const { showConnectionDot = true } = options;
  const mount = document.createElement('div');
  mount.id = 'offlineBannerMount';
  document.body.appendChild(mount);

  let timer = null;
  let wasOffline = false;

  return onConnectionChange((connected) => {
    // Update connection dot in header
    if (showConnectionDot) {
      const existing = document.querySelector('.connection-dot');
      const dotHtml = renderConnectionStatus(connected);
      if (existing) existing.outerHTML = dotHtml;
      else document.querySelector('.header__right')?.insertAdjacentHTML('afterbegin', dotHtml);
    }

    // Show offline/online banner
    if (timer) clearTimeout(timer);
    if (!connected) {
      wasOffline = true;
      mount.innerHTML = renderOfflineBanner('Working offline — changes will sync');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 3000);
    } else if (wasOffline) {
      mount.innerHTML = renderOfflineBanner('Back online');
      mount.querySelector('.offline-banner')?.classList.add('offline-banner--online');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 2000);
    }
  });
}
