// components.js — Reusable UI rendering functions (v2)
// These functions return HTML strings or create DOM elements.
// Pages call these functions and insert results into the DOM.

import { escapeHtml, formatDateShort } from './utils.js';
import { getPresets, getColorPalette, loadDeviceTheme, saveDeviceTheme, applyTheme, defaultThemeConfig } from './theme.js';

const esc = (s) => escapeHtml(String(s ?? ''));

/**
 * After innerHTML is set on a container, propagate data-*-color attributes
 * onto their elements as CSS custom properties. Lets us avoid inline
 * style attributes for per-record runtime colors.
 *
 * Reads: data-owner-color, data-person-color, data-event-color, data-bg-color.
 * Sets the matching CSS custom property on the element via Element.style.setProperty.
 */
export function applyDataColors(root) {
  if (!root) return;
  root.querySelectorAll('[data-owner-color]').forEach(el => {
    el.style.setProperty('--owner-color', el.dataset.ownerColor);
  });
  root.querySelectorAll('[data-person-color]').forEach(el => {
    el.style.setProperty('--person-color', el.dataset.personColor);
  });
  root.querySelectorAll('[data-event-color]').forEach(el => {
    el.style.setProperty('--event-color', el.dataset.eventColor);
  });
  root.querySelectorAll('[data-bg-color]').forEach(el => {
    el.style.setProperty('background', el.dataset.bgColor);
  });
  root.querySelectorAll('[data-confetti]').forEach(el => {
    // Parse a compact descriptor so the confetti renderer needn't inject raw style.
    // Format: "L|C|D|S" where L=left%, C=color, D=delay-seconds, S=size-px
    const [left, color, delay, size] = el.dataset.confetti.split('|');
    if (left) el.style.setProperty('left', `${left}%`);
    if (color) el.style.setProperty('background', color);
    if (delay) el.style.setProperty('animation-delay', `${delay}s`);
    if (size) {
      el.style.setProperty('width', `${size}px`);
      el.style.setProperty('height', `${size}px`);
    }
  });
  root.querySelectorAll('[data-progress]').forEach(el => {
    el.style.setProperty('width', `${el.dataset.progress}%`);
  });
  root.querySelectorAll('[data-timegrid-pos]').forEach(el => {
    // Format: "top|height|left|width" (top/height in px, left/width in %)
    const [top, height, left, width] = el.dataset.timegridPos.split('|');
    if (top) el.style.setProperty('top', `${top}px`);
    if (height) el.style.setProperty('height', `${height}px`);
    if (left) el.style.setProperty('left', `${left}%`);
    if (width) el.style.setProperty('width', `${width}%`);
  });
  root.querySelectorAll('[data-timegrid-height]').forEach(el => {
    el.style.setProperty('height', `${el.dataset.timegridHeight}px`);
  });
  root.querySelectorAll('[data-mobile-order]').forEach(el => {
    el.style.setProperty('--mobile-order', el.dataset.mobileOrder);
  });
  root.querySelectorAll('[data-event-bg]').forEach(el => {
    el.style.setProperty('--event-bg', el.dataset.eventBg);
  });
  root.querySelectorAll('[data-event-border-image]').forEach(el => {
    el.style.setProperty('border-image', `${el.dataset.eventBorderImage} 1`);
    el.style.setProperty('border-image-slice', '1');
  });
}

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
 * Bottom navigation. 5 items: Home, Calendar, Scores, Tracker, More.
 * More is a button (opens a sheet in-page); the first four are anchors.
 *
 * Signatures:
 *   renderNavBar(activePage)                       // legacy — More is rendered
 *                                                  //   but unbound (no-op)
 *   renderNavBar(activePage, { onMoreClick })      // Phase 1+ — dashboard binds More
 *
 * Person-link mode: the page rewrites href values after render (existing behavior).
 */
export function renderNavBar(activePage, options = {}) {
  const items = [
    { page: 'home', href: 'index.html', label: 'Home', svg: `<path d="M3 12l9-9 9 9"></path><path d="M5 10v10h14V10"></path>` },
    { page: 'calendar', href: 'calendar.html', label: 'Calendar', svg: `<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>` },
    { page: 'scoreboard', href: 'scoreboard.html', label: 'Scores', svg: `<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M17 4h3v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V4h3"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path>` },
    { page: 'tracker', href: 'tracker.html', label: 'Tracker', svg: `<polyline points="3 12 8 7 13 12 17 8 21 12"></polyline><polyline points="3 18 8 13 13 18 17 14 21 18"></polyline>` }
  ];
  const personHome = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('dr-person-home') : null;
  const linkItems = items.map(it => {
    const isActive = it.page === activePage;
    let href = it.href;
    if (personHome) {
      href = it.page === 'home'
        ? `person.html?person=${encodeURIComponent(personHome)}`
        : `${it.href}?person=${encodeURIComponent(personHome)}`;
    }
    return `<a class="bottom-nav__item nav-item${isActive ? ' is-active nav-item--active' : ''}" href="${href}" data-page="${it.page}">
      <svg class="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${it.svg}</svg>
      <span class="nav-item__label">${esc(it.label)}</span>
    </a>`;
  }).join('');
  const moreItem = `<button class="bottom-nav__item nav-item" id="navMore" type="button"${options.onMoreClick ? '' : ' data-more-unbound="1"'}>
    <svg class="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5"></circle>
      <circle cx="12" cy="12" r="1.5"></circle>
      <circle cx="19" cy="12" r="1.5"></circle>
    </svg>
    <span class="nav-item__label">More</span>
  </button>`;
  return `<nav class="bottom-nav" role="navigation" aria-label="Main navigation">${linkItems}${moreItem}</nav>`;
}

/**
 * Render the notification bell icon with optional badge count.
 */
export function renderBellIcon(count = 0) {
  const badge = count > 0
    ? `<span class="bell__badge">${count > 99 ? '99+' : count}</span>`
    : '';
  return `<button class="header__bell" id="headerBell" title="Notifications" type="button">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
    ${badge}
  </button>`;
}

/**
 * Header renderer. Supports TWO call shapes during Phase 1:
 *
 *  NEW (dashboard):
 *    renderHeader({ title, subtitle, showBell, overflowItems })
 *
 *  LEGACY (all other pages, until their own phase):
 *    renderHeader({ appName, subtitle, dateLine, showAdmin, showDebug,
 *                   showAddTask, showThemePicker, showBell, bellCount, rightContent })
 *
 * Detection: new shape has `title`; legacy has `appName`.
 */
export function renderHeader(options = {}) {
  if (options.title !== undefined) {
    return _renderHeaderV2(options);
  }
  return _renderHeaderLegacy(options);
}

function _renderHeaderV2({ title, subtitle, showBell, overflowItems }) {
  const bellHtml = showBell
    ? `<button class="btn-icon" id="headerBell" aria-label="Notifications" type="button">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
           <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
         </svg>
         <span class="btn-icon__dot is-hidden" id="headerBellDot" aria-hidden="true"></span>
       </button>`
    : '';
  const overflowHtml = (Array.isArray(overflowItems) && overflowItems.length)
    ? `<button class="btn-icon" id="headerOverflow" aria-label="More" type="button">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <circle cx="12" cy="5" r="1.4"></circle>
           <circle cx="12" cy="12" r="1.4"></circle>
           <circle cx="12" cy="19" r="1.4"></circle>
         </svg>
       </button>`
    : '';
  return `<header class="app-header">
    <div class="app-header__text">
      <div class="app-header__title">${esc(title)}</div>
      ${subtitle ? `<div class="app-header__subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="app-header__actions">
      ${bellHtml}
      ${overflowHtml}
    </div>
  </header>`;
}

function _renderHeaderLegacy(options) {
  const {
    appName = 'Daily Rundown',
    subtitle = '',
    dateLine = '',
    showAdmin = true,
    showDebug = false,
    showAddTask = false,
    showThemePicker = false,
    showBell = false,
    bellCount = 0,
    rightContent = ''
  } = options;

  const debugIcon = showDebug ? '<span class="header__debug" title="Debug mode active"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v1h4"/><path d="M18 8h-2V6a4 4 0 0 0-4-4"/><path d="M20 10v1a2 2 0 0 1-2 2"/><rect x="8" y="10" width="8" height="10" rx="4"/><path d="M4 16h4"/><path d="M16 16h4"/><path d="M12 10v10"/></svg></span>' : '';
  const adminLink = showAdmin ? `<a href="admin.html" class="header__admin" title="Admin"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg></a>` : '';
  const addTaskBtn = showAddTask ? `<button class="header__add-task" id="headerAddTask" title="Add Task" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></button>` : '';
  const themeBtn = showThemePicker ? `<button class="header__theme" id="headerThemeBtn" title="Device Theme" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></button>` : '';
  const bellBtn = showBell ? renderBellIcon(bellCount) : '';

  return `<header class="app-header">
    <div class="header__left">
      <h1 class="header__title">${esc(appName)}</h1>
      ${subtitle ? `<span class="header__subtitle">${esc(subtitle)}</span>` : ''}
      ${dateLine ? `<span class="header__date">${esc(dateLine)}</span>` : ''}
    </div>
    <div class="header__right">
      ${rightContent}
      ${addTaskBtn}
      ${bellBtn}
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
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates --person-color and dot bg).
 */
export function renderPersonFilter(people, activePerson, trailingHtml = '') {
  const allActive = !activePerson ? ' person-pill--active' : '';
  let html = `<div class="person-filter" role="group" aria-label="Filter by person">`;
  html += `<button class="person-pill${allActive}" data-person-id="" aria-pressed="${!activePerson}">All</button>`;

  for (const p of people) {
    const active = activePerson === p.id ? ' person-pill--active' : '';
    html += `<button class="person-pill${active}" data-person-id="${p.id}" data-person-color="${esc(p.color)}" aria-pressed="${activePerson === p.id}"><span class="person-pill__dot" data-bg-color="${esc(p.color)}"></span>${esc(p.name)}</button>`;
  }

  html += trailingHtml;
  html += `</div>`;
  return html;
}

/**
 * Render a progress bar with label.
 * done: number completed, total: number total
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates fill width).
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
      <div class="progress-bar__fill" data-progress="${pct}"></div>
    </div>
  </div>`;
}

/**
 * Render a single task card.
 * options: { entryKey, entry, task, person, category, completed, overdue, dateLabel, points }
 * points: optional { possible, override } — override is the pointsOverride percentage (null = no override)
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates --owner-color / --event-color).
 */
export function renderTaskCard(options) {
  const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points, isEvent, isPastDaily = false } = options;
  const doneClass = completed ? ' card--done task-card--done' : '';
  const overdueClass = overdue ? ' task-card--overdue' : '';
  const eventClass = isEvent ? ' card--event task-card--event' : '';
  const showIcon = category?.showIcon !== false;
  const catIcon = showIcon ? (category?.icon || '') : '';
  const ownerColor = person?.color || 'var(--text-faint)';
  const ownerInitial = (person?.name || '?')[0].toUpperCase();
  const estLabel = task.estMin ? `${task.estMin}m` : '';
  const eventColor = isEvent && category?.eventColor ? category.eventColor : null;
  const catName = category?.name || '';

  // Override-direction cue: ▲ if override raises points, ▼ if it lowers them.
  // No bare scoring-pt chip — store-economy points live in the section meta only (spec 2026-04-25 §3.7).
  let ptsLabel = '';
  if (points && !isEvent && !task.exempt && points.override != null && points.override !== 100) {
    const colorClass = points.override > 100 ? 'task-card__pts--up' : 'task-card__pts--down';
    const icon = points.override > 100 ? '▲' : '▼';
    ptsLabel = `<span class="${colorClass}">${icon}</span>`;
  }

  // Rotation tag (spec §5.4) — only for non-daily rotations.
  const rotationLabel = task?.rotation === 'weekly' ? 'Weekly'
    : task?.rotation === 'monthly' ? 'Monthly'
    : task?.rotation === 'once' ? 'One-Time'
    : null;
  const rotationTag = (rotationLabel && !isEvent)
    ? `<span class="tag tag--rotation">${esc(rotationLabel)}</span>`
    : '';

  // Existing action tags (delegated, moved, late, skipped, bounty).
  let actionTags = '';
  if (entryKey && entryKey.includes('_delegate')) {
    const fromName = entry.delegatedFromName || '?';
    actionTags += `<span class="task-card__tag task-card__tag--delegated">↪ ${esc(fromName)}</span>`;
  }
  if (entryKey && entryKey.includes('_moved')) {
    const fromDate = entry.movedFromDate || '';
    const movedLabel = fromDate ? formatMovedDate(fromDate) : 'moved';
    actionTags += `<span class="task-card__tag task-card__tag--moved">${esc(movedLabel)}</span>`;
  }
  if (isPastDaily && !completed) {
    actionTags += `<span class="task-card__tag task-card__tag--late">Late</span>`;
  }
  if (entry?.skipped) {
    actionTags += `<span class="task-card__tag task-card__tag--skipped"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg> Skipped</span>`;
  }
  if (task?.bounty) {
    const bountyLabel = task.bounty.type === 'points' ? `${task.bounty.amount} pts` : 'Reward';
    actionTags += `<span class="task-card__tag task-card__bounty">🎯 ${esc(bountyLabel)}</span>`;
  }

  const eventTimeLabel = isEvent && task.eventTime ? formatEventTime(task.eventTime) : '';
  const entryTod = entry.timeOfDay;
  const taskTod = task.timeOfDay;
  const isAmOrPm = entryTod === 'am' || entryTod === 'pm';
  const showTod = isAmOrPm && ((taskTod === 'both' && options.showTodIconBoth) || (taskTod !== 'both' && options.showTodIconSingle));
  const todLabel = showTod ? (entryTod === 'am' ? '🌅 AM' : '🌙 PM') : '';

  // Build meta row as mockup: category · meta-dot · (tod/event-time/est joined by · ) · rotationTag · actionTags · points.
  const rightMeta = [todLabel, eventTimeLabel, estLabel].filter(Boolean).join(' · ');
  const catSpan = catName ? `<span>${esc(catName)}</span>` : '';
  const dotSpan = (catSpan && rightMeta) ? `<span class="card__meta-dot" aria-hidden="true"></span>` : '';
  const rightSpan = rightMeta ? `<span>${esc(rightMeta)}</span>` : '';
  const ptsSpan = ptsLabel || '';
  const metaInner = `${catSpan}${dotSpan}${rightSpan}${rotationTag}${actionTags}${ptsSpan}`;

  const dateLine = dateLabel ? `<span class="task-card__date">${esc(dateLabel)}</span>` : '';
  const eventPrefix = isEvent ? '📅 ' : '';
  const taskName = catIcon ? `${esc(task.name)} ${catIcon}` : `${eventPrefix}${esc(task.name)}`;
  const eventColorAttr = eventColor ? ` data-event-color="${esc(eventColor)}"` : '';

  // Leading slot: event time label (events) or avatar initial (regular tasks).
  const leading = isEvent
    ? `<div class="card__leading">${esc(eventTimeLabel) || ''}</div>`
    : `<div class="card__leading"><span class="avatar" data-person-color="${esc(ownerColor)}">${esc(ownerInitial)}</span></div>`;

  // Trailing check button — decorative within the card click region (spec §3.6).
  const checkSvg = completed
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : '';
  const checkClass = completed ? 'check check--done' : 'check';
  const checkLabel = completed ? 'Undo' : 'Mark complete';
  const trailing = `<div class="card__trailing"><button class="${checkClass}" aria-label="${checkLabel}" type="button" tabindex="-1">${checkSvg}</button></div>`;

  return `<article class="card task-card${doneClass}${overdueClass}${eventClass}" data-entry-key="${esc(entryKey)}" data-date-key="${esc(entry.dateKey || '')}" role="button" tabindex="0" aria-pressed="${completed}" data-owner-color="${esc(ownerColor)}"${eventColorAttr}>
      ${leading}
      <div class="card__body task-card__body">
        <div class="card__title task-card__name">${taskName}</div>
        <div class="card__meta task-card__meta">${metaInner}${dateLine}</div>
      </div>
      ${trailing}
    </article>`;
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
 * Single-slot banner. Variants: overdue | multiplier | vacation | freeze | info.
 * Called by dashboard.js resolveBanner(); caller is responsible for mounting the
 * returned HTML into #bannerMount and wiring any action button via click delegation.
 * `bodyClickable: true` wraps the body in a button; the page binds clicks
 * via `[data-banner-body]` selector. Used by --overdue per spec §3.2.
 */
export function renderBanner(variant, { title, message, action, bodyClickable = false } = {}) {
  const iconMap = { overdue: '!', multiplier: '*', vacation: 'V', freeze: '-', info: 'i' };
  const icon = iconMap[variant] ?? 'i';
  const actionHtml = action
    ? `<button class="banner__action" data-banner-action="1" type="button">${esc(action.label)}</button>`
    : '';
  const msgHtml = message ? `<div class="banner__message">${esc(message)}</div>` : '';
  const bodyTag = bodyClickable ? 'button' : 'div';
  const bodyAttrs = bodyClickable
    ? ' class="banner__body banner__body--clickable" data-banner-body="1" type="button"'
    : ' class="banner__body"';
  return `<div class="banner banner--${esc(variant)}" role="status">
    <div class="banner__icon" aria-hidden="true">${icon}</div>
    <${bodyTag}${bodyAttrs}>
      <div class="banner__title">${esc(title)}</div>
      ${msgHtml}
    </${bodyTag}>
    ${actionHtml}
  </div>`;
}

/**
 * Floating Action Button. Default icon is a plus (24x24 SVG, strokeWidth via CSS).
 * Caller provides id + aria-label; click is bound by the page (dashboard.js) via
 * addEventListener on the returned element after it is mounted.
 */
export function renderFab({ id = 'fabAdd', label = 'Add', icon } = {}) {
  const plus = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  return `<button class="fab" id="${esc(id)}" aria-label="${esc(label)}" type="button">${icon ?? plus}</button>`;
}

/**
 * Section head used by dashboard Events + Today sections. Exposed so Calendar,
 * Scoreboard, Tracker can reuse in their own phases.
 */
export function renderSectionHead(title, meta, options = {}) {
  const { divider = false, trailingHtml = '' } = options;
  const metaHtml = meta ? `<div class="section__meta">${esc(meta)}</div>` : '';
  const trailing = trailingHtml ? `<div class="section__head-trailing">${trailingHtml}</div>` : '';
  const dividerCls = divider ? ' section__head--divider' : '';
  return `<div class="section__head${dividerCls}">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
    ${trailing}
  </div>`;
}

/**
 * Items: Array<{ id, label, icon?: string (HTML/SVG), variant?: 'default'|'danger' }>.
 * Rendered inside a bottom sheet (the page calls renderBottomSheet(renderOverflowMenu(items))).
 * The page binds clicks via delegation: data-item-id attribute identifies the chosen row.
 */
export function renderOverflowMenu(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map(it => {
    const iconHtml = it.icon ? `<span class="overflow-menu__icon" aria-hidden="true">${it.icon}</span>` : '';
    const variantCls = it.variant === 'danger' ? ' overflow-menu__item--danger' : '';
    return `<button class="overflow-menu__item${variantCls}" data-item-id="${esc(it.id)}" type="button">
      ${iconHtml}
      <span class="overflow-menu__label">${esc(it.label)}</span>
    </button>`;
  }).join('');
  return `<div class="overflow-menu" role="menu">${rows}</div>`;
}

/**
 * Filter chip.
 * - When `activePersonName` is falsy: renders `Filter` (verb), no dot.
 * - When `activePersonName` is a name: renders `<dot> Name`, dot colored
 *   via data-person-color (applyDataColors propagates it to --person-color).
 * The chip always opens the filter sheet on click.
 */
export function renderFilterChip({ id = 'openFilterSheet', activePersonName = '', activePersonColor = '' } = {}) {
  const caret = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  const isActive = !!activePersonName;
  const dot = isActive
    ? `<span class="filter-chip__dot" data-person-color="${esc(activePersonColor)}" aria-hidden="true"></span>`
    : '';
  const label = isActive ? activePersonName : 'Filter';
  const activeCls = isActive ? ' filter-chip--active' : '';
  return `<button class="filter-chip${activeCls}" id="${esc(id)}" type="button" aria-haspopup="dialog">
    ${dot}
    <span class="filter-chip__label">${esc(label)}</span>
    <span class="filter-chip__caret" aria-hidden="true">${caret}</span>
  </button>`;
}

/**
 * List-group sheet body: All row + one per person, with the active row checked.
 * Rendered inside renderBottomSheet by the page. Rows carry data-person-id
 * (empty string = All). Page binds click delegation.
 */
export function renderPersonFilterSheet(people, activePersonId) {
  const rows = [
    { id: '', name: 'All', active: !activePersonId },
    ...people.map(p => ({ id: p.id, name: p.name, active: p.id === activePersonId }))
  ];
  const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const body = rows.map(r => `
    <button class="list-row${r.active ? ' is-active' : ''}" data-person-id="${esc(r.id)}" type="button">
      <span class="list-row__label">${esc(r.name)}</span>
      <span class="list-row__trailing" aria-hidden="true">${r.active ? check : ''}</span>
    </button>
  `).join('');
  return `<div class="list-group" role="menu">${body}</div>`;
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

/**
 * @caller Must call `applyDataColors(container)` after inserting this HTML
 * (propagates --event-bg, border-image, and bg gradients).
 */
export function renderEventPill(event, people = []) {
  const isTimed = !event.allDay && event.startTime;
  const colors = eventPersonColors(event, people);
  const isMulti = colors.length > 1;

  // Person color dots for multi-person events
  const dotsHtml = isMulti
    ? `<span class="event-pill__people">${colors.map(c => `<span class="event-pill__dot" data-bg-color="${esc(c)}"></span>`).join('')}</span>`
    : '';

  if (isTimed) {
    const timeStr = formatTimeRange(event.startTime, event.endTime);
    const barColor = event.color || '#5b7fd6';
    const isShort = !event.endTime;
    const cls = `event-pill event-pill--timed${isShort ? ' event-pill--short' : ''}${isMulti ? ' event-pill--multi' : ''}`;
    // Multi-person timed: segmented left border via gradient
    const borderImgAttr = isMulti
      ? ` data-event-border-image="${esc(eventTimedBorderGradient(colors))}"`
      : '';
    return `<div class="${cls}" data-event-bg="${esc(barColor)}"${borderImgAttr}>
      <span class="event-pill__time">${esc(timeStr)}</span>
      <span class="event-pill__text">${esc(event.name)}</span>
      ${dotsHtml}
    </div>`;
  }

  // All-day: solid or gradient blend + dots
  const bg = eventAllDayBg(event, people);
  return `<div class="event-pill${isMulti ? ' event-pill--multi' : ''}" data-bg-color="${esc(bg)}">
    <span class="event-pill__text">${esc(event.name)}</span>
    ${dotsHtml}
  </div>`;
}

/**
 * Render an event bubble for day view (larger, more detail than pill).
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates --event-color and dot bgs).
 */
export function renderEventBubble(eventId, event, people = []) {
  const bg = event.color || '#5b7fd6';
  const timeStr = event.allDay ? 'All Day' : formatTimeRange(event.startTime, event.endTime);
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  const peopleDots = assignedPeople.map(p =>
    `<span class="event-bubble__dot" data-bg-color="${esc(p.color)}" title="${esc(p.name)}"></span>`
  ).join('');
  const locationHtml = event.location ? `<span class="event-bubble__location">${esc(event.location)}</span>` : '';

  return `<button class="event-bubble" data-event-id="${eventId}" data-event-color="${esc(bg)}" type="button">
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
  const icon = currentView === 'week'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
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
    return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" data-person-color="${esc(p.color)}" type="button">${esc(p.name)}</button>`;
  }).join('');

  const colorPalette = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fdd663', '#57bb8a', '#e8710a', '#795548', '#9e9e9e', '#607d8b'];
  const currentColor = event.color || people[0]?.color || '#4285f4';
  const colorDots = colorPalette.map(c =>
    `<button class="dt-color-btn${c === currentColor ? ' dt-color-btn--active' : ''}" data-color="${c}" data-bg-color="${esc(c)}" type="button"></button>`
  ).join('');

  const timeGroupHiddenClass = event.allDay ? ' ef-time-row--hidden' : '';

  return `<div class="task-detail-sheet">
    <h3 class="admin-form__title">${title}</h3>
    <div class="admin-form__group">
      <label class="form-label" for="ef_name">Event name</label>
      <input class="form-input" id="ef_name" type="text" placeholder="Soccer practice, Dentist, etc." value="${esc(event.name || '')}" autocomplete="off">
    </div>
    <div class="admin-form__group">
      <div class="ef-date-row">
        <div class="ef-date-field">
          <label class="form-label" for="ef_date">Date</label>
          <input class="form-input ef-date-input" id="ef_date" type="date" value="${event.date || dateKey}">
        </div>
        <button type="button" class="chip chip--selectable ef-allday-toggle${event.allDay ? ' chip--active' : ''}" id="ef_allDay">All Day</button>
      </div>
      <div class="ef-time-row${timeGroupHiddenClass}" id="ef_timeGroup">
        <div class="ef-time-field">
          <label class="form-label" for="ef_startTime">Start</label>
          <input class="form-input" id="ef_startTime" type="time" value="${event.startTime || ''}">
        </div>
        <div class="ef-time-field">
          <label class="form-label" for="ef_endTime">End</label>
          <input class="form-input" id="ef_endTime" type="time" value="${event.endTime || ''}">
        </div>
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
      ${isEdit ? `<button class="btn btn--danger" id="ef_delete" type="button" data-event-id="${eventId}">Delete Event</button>` : ''}
      <button class="btn btn--secondary" id="ef_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="ef_save" type="button" ${eventId ? `data-event-id="${eventId}"` : ''}>${saveLabel}</button>
    </div>
  </div>`;
}

/**
 * Render event detail sheet (shown on tap in day view).
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates --person-color chips + color bar).
 */
export function renderEventDetailSheet(eventId, event, people = []) {
  const timeStr = event.allDay ? 'All Day' : formatTimeRange(event.startTime, event.endTime);
  const assignedPeople = (event.people || []).map(pid => people.find(p => p.id === pid)).filter(Boolean);
  const peopleHtml = assignedPeople.map(p =>
    `<span class="chip" data-person-color="${esc(p.color)}">${esc(p.name)}</span>`
  ).join(' ');

  return `<div class="task-detail-sheet">
    <div class="event-detail__color-bar" data-bg-color="${esc(event.color || '#5b7fd6')}"></div>
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
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates --owner-color / --person-color).
 */
export function renderTaskDetailSheet(options) {
  const {
    entryKey, entry, task, person, category, completed, points,
    sliderMin, sliderMax, currentOverride, gradePreview,
    people, showDelegate, showMove, showEdit, dateKey,
    isEvent = false, readOnly = false, isPastDate = false
  } = options;
  const catIcon = category?.icon || '';
  const ownerColor = person?.color || 'var(--text-faint)';
  const diffLabel = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[task.difficulty] || 'Medium';
  const rotLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'One-Time' }[entry.rotationType] || '';
  const todLabel = { am: 'Morning', pm: 'Afternoon', anytime: 'Anytime' }[entry.timeOfDay] || '';
  const sliderVal = currentOverride ?? 100;

  let html = `<div class="task-detail-sheet">`;

  // Task info
  html += `<div class="task-detail__info">
    <div class="task-detail__name" data-owner-color="${esc(ownerColor)}">
      <span class="task-card__avatar">${(person?.name || '?')[0].toUpperCase()}</span>
      <span>${esc(task.name)}${catIcon ? ' ' + catIcon : ''}</span>
    </div>
    <div class="task-detail__meta">
      ${person ? `<span class="chip" data-person-color="${esc(person.color)}">${esc(person.name)}</span>` : ''}
      <span class="chip">${rotLabel}</span>
      <span class="chip">${diffLabel}</span>
      ${todLabel ? `<span class="chip">${todLabel}</span>` : ''}
      ${task.eventTime ? `<span class="chip">🕐 ${formatEventTime(task.eventTime)}</span>` : ''}
      ${task.estMin ? `<span class="chip">${task.estMin}m</span>` : ''}
    </div>
    ${entry.delegatedFromName ? `<div class="task-detail__source-info">↪ Delegated from <strong>${esc(entry.delegatedFromName)}</strong></div>` : ''}
    ${entry.movedFromDate ? `<div class="task-detail__source-info"><svg class="task-detail__source-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Moved from <strong>${formatMovedDate(entry.movedFromDate).replace('from ', '')}</strong></div>` : ''}
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
        <div class="task-detail__notes-display${noteText ? '' : ' is-hidden'}" id="notesDisplay">
          <div class="task-detail__notes-text" id="notesText">${esc(noteText)}</div>
          <button class="btn btn--ghost btn--sm" id="notesEditBtn" type="button">Edit</button>
        </div>
        <button class="btn btn--ghost btn--sm${noteText ? ' is-hidden' : ''}" id="notesAddBtn" type="button">+ Add Note</button>
        <div class="task-detail__notes-editor is-hidden" id="notesEditor">
          <textarea class="task-detail__notes-input" id="notesInput" rows="3" placeholder="Add notes for this event...">${esc(noteText)}</textarea>
          <div class="task-detail__notes-actions">
            <button class="btn btn--secondary btn--sm" id="notesCancelBtn" type="button">Cancel</button>
            <button class="btn btn--primary btn--sm" id="notesSaveBtn" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">Save</button>
          </div>
        </div>
      </div>`;
    }
  }

  // Complete/uncomplete button(s)
  const isLateEligible = isPastDate && !completed && !isEvent && !task.exempt;
  if (isLateEligible) {
    html += `<div class="task-detail__late-buttons mt-md">
      <button class="btn btn--primary btn--full" id="sheetCompleteNoPenalty" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">Complete (Full Credit)</button>
      <button class="btn btn--secondary btn--full" id="sheetToggleComplete" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">Complete (Late)</button>
    </div>`;
  } else {
    const toggleLabel = completed ? 'Mark Incomplete' : 'Mark Complete';
    const toggleClass = completed ? 'btn--secondary' : 'btn--primary';
    html += `<button class="btn ${toggleClass} btn--full mt-md" id="sheetToggleComplete" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button">${toggleLabel}</button>`;
  }

  // Action buttons row: Delegate, Move, Edit
  const hasActions = showDelegate || showMove || showEdit;
  if (hasActions) {
    html += `<div class="task-detail__actions mt-md">`;

    if (showDelegate) {
      html += `<button class="btn btn--secondary btn--sm" id="sheetDelegate" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Delegate</button>`;
    }
    if (showMove) {
      html += `<button class="btn btn--secondary btn--sm" id="sheetMove" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Move</button>`;
      html += `<button class="btn btn--ghost btn--sm" id="moveSkip" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg> Skip</button>`;
    }
    if (showEdit) {
      html += `<button class="btn btn--secondary btn--sm" id="sheetEdit" data-task-id="${entry.taskId}" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>`;
    }

    html += `</div>`;
  }

  // Delegate panel (hidden by default, shown when Delegate clicked)
  if (showDelegate && people) {
    const otherPeople = people.filter(p => p.id !== entry.ownerId);
    html += `<div class="task-detail__delegate-panel is-hidden" id="delegatePanel">
      <div class="task-detail__delegate-header">
        <span class="form-label">Reassign to:</span>
        ${showMove ? `<label class="task-detail__move-toggle"><input type="checkbox" id="delegateMoveToggle"> 📅 Move too</label>` : ''}
      </div>
      <div class="task-detail__person-chips">
        ${otherPeople.map(p => `<button class="chip chip--selectable" data-person-id="${p.id}" data-person-color="${esc(p.color)}" type="button">${esc(p.name)}</button>`).join('')}
      </div>
      <input type="date" id="delegateMoveDatePicker" class="task-detail__date-input task-detail__date-input--hidden">
    </div>`;
  }

  // Move date picker (hidden input, triggered by Move button)
  if (showMove) {
    html += `<input type="date" id="moveDatePicker" class="task-detail__date-input task-detail__date-input--hidden">`;
  }

  // Points slider (override slider for late-credit / boost).
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
 * @caller Must call `applyDataColors(container)` after inserting this HTML (propagates confetti positions/colors).
 */
export function renderCelebration() {
  const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997','#ff6b6b'];
  let confetti = '';
  for (let i = 0; i < 15; i++) {
    const color = colors[i % colors.length];
    const left = 5 + Math.round((i * 6.5) % 90);
    const delay = (i * 0.12).toFixed(2);
    const size = 8 + (i % 3) * 4;
    confetti += `<span class="celebration__confetti" data-confetti="${left}|${esc(color)}|${delay}|${size}"></span>`;
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
export function renderTaskFormCompact({ task = {}, taskId = null, mode = 'create', categories = [], people = [], prefix = 'tf', rewards = {} }) {
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
    <div class="form-row form-row--cooldown">
      <div class="form-group form-group--grow">
        <label class="form-label">Cooldown</label>
        <input type="number" id="${prefix}_cooldown" value="${task.cooldownDays || ''}" min="0" max="30" placeholder="0">
      </div>
      <div class="chip-group chip-group--cooldown">
        <button type="button" class="chip chip--selectable${task.exempt ? ' chip--active' : ''}" id="${prefix}_exempt">Exempt</button>
        <button type="button" class="chip chip--selectable${task.bounty ? ' chip--active' : ''}" id="${prefix}_bountyToggle">Bounty</button>
      </div>
    </div>
    <div id="${prefix}_bountyFields"${task.bounty ? '' : ' class="is-hidden"'}>
      <div class="form-hint form-compact__bounty-hint">Scoring-exempt. Reward granted on completion.</div>
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="segmented-control" id="${prefix}_bountyType">
            <button type="button" class="segmented-btn${(!task.bounty || task.bounty.type === 'points') ? ' segmented-btn--active' : ''}" data-value="points">Points</button>
            <button type="button" class="segmented-btn${task.bounty?.type === 'reward' ? ' segmented-btn--active' : ''}" data-value="reward">Reward</button>
          </div>
        </div>
        <div class="form-group${task.bounty?.type === 'reward' ? ' is-hidden' : ''}" id="${prefix}_bountyPointsField">
          <label class="form-label">Bonus pts</label>
          <input type="number" id="${prefix}_bountyAmount" class="form-input" value="${task.bounty?.amount || 50}" min="1">
        </div>
        <div class="form-group${task.bounty?.type !== 'reward' ? ' is-hidden' : ''}" id="${prefix}_bountyRewardField">
          <label class="form-label">Reward</label>
          <select id="${prefix}_bountyReward" class="form-input">
            <option value="">Select...</option>
            ${Object.entries(rewards).filter(([,r]) => r.status === 'active').map(([id, r]) =>
              `<option value="${id}" ${task.bounty?.rewardId === id ? 'selected' : ''}>${esc(r.icon || '')} ${esc(r.name)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="form-group${showDedicated ? '' : ' is-hidden'}" id="${prefix}_dedicatedDayGroup">
      <label class="form-label" id="${prefix}_dedicatedDayLabel">${task.rotation === 'once' ? (isEvent ? 'Event Date' : 'Date') : 'Day'} <button type="button" id="${prefix}_eventDateBtn" class="btn btn--ghost btn--sm form-compact__date-calendar-btn${isEvent ? '' : ' is-hidden'}" title="Pick event date"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></label>
      <input type="date" id="${prefix}_eventDate" class="form-compact__date-hidden" value="${task.dedicatedDate || ''}">
      <select id="${prefix}_daySelect" class="dedicated-day-select${task.rotation === 'once' ? ' is-hidden' : ''}">
        <option value=""${task.dedicatedDay == null ? ' selected' : ''}>Any</option>
        ${dayOptions}
      </select>
      <div id="${prefix}_dedicatedDateRow"${task.rotation === 'once' && !isEvent ? '' : ' class="is-hidden"'}>
        <input type="date" id="${prefix}_dedicatedDate" class="task-detail__date-input task-detail__date-input--fill" value="${task.dedicatedDate || ''}">
      </div>
    </div>
    <div class="form-group${isEvent ? '' : ' is-hidden'}" id="${prefix}_eventTimeGroup">
      <label class="form-label">Event Time</label>
      <input type="time" id="${prefix}_eventTime" value="${task.eventTime || ''}">
    </div>
    <div class="form-group${isEvent ? '' : ' is-hidden'}" id="${prefix}_notesGroup">
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
export function renderQuickAddSheet(people, categories, defaultCategoryKey, rewards = {}) {
  const task = defaultCategoryKey ? { category: defaultCategoryKey } : {};
  return `<div class="task-detail-sheet">${renderTaskFormCompact({
    task,
    mode: 'create',
    categories,
    people,
    prefix: 'qa',
    rewards
  })}</div>`;
}

/**
 * Render an inline edit task form inside a bottom sheet.
 * task: the task object, categories: [{key, label, icon}], people: [{id, name, color}]
 */
export function renderEditTaskSheet(taskId, task, categories, people, rewards = {}) {
  return `<div class="task-detail-sheet">${renderTaskFormCompact({
    task,
    taskId,
    mode: 'edit',
    categories,
    people,
    prefix: 'et',
    rewards
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
        ${colorPalette.map(c => `<button class="dt-color-btn${c === currentAccent ? ' dt-color-btn--active' : ''}" data-color="${c}" data-bg-color="${c}" type="button"></button>`).join('')}
      </div>
    </div>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="dtClose" type="button">Done</button>
    </div>
  </div>`);

  mountEl.innerHTML = html;
  applyDataColors(mountEl);

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
 * Dashboard loading skeleton — card-shaped placeholders matching the
 * populated layout. Used during first paint before Firebase resolves
 * (typically <500ms in cached + fresh cases). Replaces the inline
 * spinner per spec 2026-04-25 §3.7 + §5.18.
 */
export function renderDashboardSkeleton() {
  const row = `<div class="skeleton-card-row">
    <div class="skeleton skeleton-card-row__avatar"></div>
    <div class="skeleton-card-row__bars">
      <div class="skeleton skeleton-card-row__bar skeleton-card-row__bar--title"></div>
      <div class="skeleton skeleton-card-row__bar skeleton-card-row__bar--meta"></div>
    </div>
    <div class="skeleton skeleton-card-row__check"></div>
  </div>`;
  return `<section class="section">
    <div class="skeleton-section-head">
      <div class="skeleton skeleton-section-head__title"></div>
      <div class="skeleton skeleton-section-head__chip"></div>
    </div>
    ${row}${row}${row}${row}
  </section>`;
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

/**
 * Render the notification bell dropdown content for parents.
 */
export function renderBellDropdown({ pendingRequests = [], recentActivity = [], rewards = {}, people = [] }) {
  const personName = (id) => {
    const p = people.find(p => p.id === id);
    return p ? esc(p.name) : 'Unknown';
  };

  const hasItems = pendingRequests.length > 0 || recentActivity.length > 0;
  let html = `<div class="bell-dropdown">
    <div class="bell-dropdown__header">
      <span class="bell-dropdown__title">Notifications</span>
      <div class="bell-dropdown__actions">
        <button class="btn btn--xs btn--ghost" id="bellSendMessage" type="button">Message</button>
        <button class="btn btn--xs btn--ghost" id="bellBonusDay" type="button">Bonus</button>
        ${hasItems ? `<button class="btn btn--xs btn--ghost bell-clear-btn" id="bellClearAll" type="button">Clear</button>` : ''}
      </div>
    </div>`;

  if (pendingRequests.length === 0 && recentActivity.length === 0) {
    html += `<div class="bell-dropdown__empty">No notifications</div>`;
  }

  for (const req of pendingRequests) {
    const reward = rewards[req.rewardId] || {};
    const archived = reward.status === 'archived' ? ' (Archived)' : '';
    const isUseRequest = req.type === 'use-request';
    const label = isUseRequest
      ? `${personName(req.personId)} wants to use ${esc(req.rewardName || reward.name || 'a reward')}`
      : `${personName(req.personId)} wants ${esc(reward.name || 'a reward')}${archived}`;
    const subtitle = isUseRequest
      ? 'From their saved rewards'
      : `${Math.abs(req.amount)} pts &middot; Balance: ${req.balance} pts`;
    const approveClass = isUseRequest ? 'bell-approve-use' : 'bell-approve';
    const denyClass = isUseRequest ? 'bell-deny-use' : 'bell-deny';
    html += `<div class="bell-dropdown__item bell-dropdown__item--pending" data-msg-id="${esc(req.id)}" data-person-id="${esc(req.personId)}">
      <span class="bell-dropdown__icon">${esc(isUseRequest ? (req.rewardIcon || reward.icon || '🎁') : (reward.icon || '🎁'))}</span>
      <div class="bell-dropdown__body">
        <div class="bell-dropdown__item-title">${label}</div>
        <div class="bell-dropdown__item-subtitle">${subtitle}</div>
        <div class="bell-dropdown__item-actions">
          <button class="btn btn--sm btn--primary ${approveClass}" data-msg-id="${esc(req.id)}" data-person-id="${esc(req.personId)}" type="button">Approve</button>
          <button class="btn btn--sm btn--ghost ${denyClass}" data-msg-id="${esc(req.id)}" data-person-id="${esc(req.personId)}" type="button">Deny</button>
        </div>
      </div>
    </div>`;
  }

  for (const item of recentActivity.slice(0, 20)) {
    const icon = item.type === 'bonus' ? '➕' :
                 item.type === 'deduction' ? '➖' :
                 item.type === 'redemption-approved' ? '✅' :
                 item.type === 'redemption-denied' ? '❌' :
                 item.type === 'use-approved' ? '✅' :
                 item.type === 'use-denied' ? '❌' :
                 item.type === 'reward-used' ? '🎉' : '📋';
    html += `<div class="bell-dropdown__item">
      <span class="bell-dropdown__icon">${icon}</span>
      <div class="bell-dropdown__body">
        <div class="bell-dropdown__item-title">${esc(item.title)}</div>
        <div class="bell-dropdown__item-subtitle">${personName(item.personId)} &middot; ${item.amount > 0 ? '+' : ''}${item.amount} pts</div>
      </div>
    </div>`;
  }

  html += `</div>`;
  return html;
}

const POSITIVE_TEMPLATES = [
  'Awesome Job!', 'Super Star', 'Great Teamwork', 'Above & Beyond',
  'So Proud of You', 'Way to Go!', 'Amazing Effort', 'Kindness Award',
  'Helping Hand', 'You Crushed It!', 'Keep It Up!', 'Big Improvement'
];

const NEGATIVE_TEMPLATES = [
  'Room Check', 'Reminder Needed', "Let's Do Better", 'Responsibility Check',
  'Try Again Tomorrow', 'Needs Attention', 'Not Your Best', 'We Talked About This'
];

/**
 * Render the send message bottom sheet.
 */
export function renderSendMessageSheet(people, preselectedPersonId = null) {
  return renderBottomSheet(`
    <h3 class="sheet-section-title">Send Message</h3>

    <label class="form-label">To</label>
    <div class="chip-group" id="msg_people">
      ${people.map(p => {
        const selected = p.id === preselectedPersonId;
        return `<button class="chip chip--selectable${selected ? ' chip--active' : ''}" data-person-id="${p.id}" data-person-color="${p.color}" type="button">${esc(p.name)}</button>`;
      }).join('')}
    </div>

    <label class="form-label sheet-label--spaced">Type</label>
    <div class="segmented-control msg-type-toggle">
      <button class="segmented-btn msg-type-btn msg-type-btn--active msg-type-btn--positive" data-type="bonus" type="button">+ Bonus</button>
      <button class="segmented-btn msg-type-btn" data-type="deduction" type="button">− Deduction</button>
    </div>

    <label class="form-label sheet-label--spaced">Title</label>
    <div class="template-grid" id="msg_templates">
      ${POSITIVE_TEMPLATES.map(t => `<button class="template-chip" data-title="${esc(t)}" type="button">${esc(t)}</button>`).join('')}
      <button class="template-chip template-chip--custom" data-title="custom" type="button">Custom...</button>
    </div>
    <input type="text" id="msg_customTitle" class="form-input msg-custom-input is-hidden" placeholder="Enter custom title">

    <label class="form-label sheet-label--spaced">Personal note (optional)</label>
    <textarea id="msg_body" class="form-input" rows="2" placeholder="Great job helping your sister!"></textarea>

    <label class="form-label sheet-label--spaced">Points</label>
    <input type="number" id="msg_points" class="form-input" value="25" min="1">

    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="msg_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="msg_send" type="button">Send</button>
    </div>
  `);
}

/**
 * Bind event listeners for the send message sheet.
 */
export function bindSendMessageSheet(mount, writeMessageFn, approverName) {
  const approver = approverName || 'Parent';
  const sheet = mount.querySelector('.bottom-sheet');
  if (!sheet) return;

  let msgType = 'bonus';
  let selectedTitle = '';

  // Person chips
  for (const chip of sheet.querySelectorAll('#msg_people .chip--selectable')) {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  }

  // Type toggle
  for (const btn of sheet.querySelectorAll('.msg-type-btn')) {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('.msg-type-btn').forEach(b => b.classList.remove('msg-type-btn--active'));
      btn.classList.add('msg-type-btn--active');
      msgType = btn.dataset.type;

      // Swap templates
      const grid = sheet.querySelector('#msg_templates');
      const templates = msgType === 'bonus' ? POSITIVE_TEMPLATES : NEGATIVE_TEMPLATES;
      grid.innerHTML = templates.map(t =>
        `<button class="template-chip" data-title="${esc(t)}" type="button">${esc(t)}</button>`
      ).join('') + `<button class="template-chip template-chip--custom" data-title="custom" type="button">Custom...</button>`;
      bindTemplateChips(sheet);

      sheet.querySelector('#msg_points').value = msgType === 'bonus' ? 25 : 15;
      selectedTitle = '';
    });
  }

  function bindTemplateChips(container) {
    for (const chip of container.querySelectorAll('.template-chip')) {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.template-chip').forEach(c => c.classList.remove('template-chip--selected'));
        chip.classList.add('template-chip--selected');
        const customInput = container.querySelector('#msg_customTitle');
        if (chip.dataset.title === 'custom') {
          customInput.classList.remove('is-hidden');
          customInput.focus();
          selectedTitle = '';
        } else {
          customInput.classList.add('is-hidden');
          selectedTitle = chip.dataset.title;
        }
      });
    }
  }
  bindTemplateChips(sheet);

  // Cancel
  sheet.querySelector('#msg_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  mount.querySelector('.bottom-sheet-overlay')?.addEventListener('click', (e) => {
    if (e.target === mount.querySelector('.bottom-sheet-overlay')) mount.innerHTML = '';
  });

  // Send
  sheet.querySelector('#msg_send')?.addEventListener('click', async () => {
    const personIds = [...sheet.querySelectorAll('#msg_people .chip--active')].map(c => c.dataset.personId);
    if (personIds.length === 0) return;

    const title = selectedTitle || sheet.querySelector('#msg_customTitle').value.trim();
    if (!title) return;

    const points = parseInt(sheet.querySelector('#msg_points').value) || 0;
    if (points <= 0) return;

    const body = sheet.querySelector('#msg_body').value.trim() || null;
    const amount = msgType === 'deduction' ? -points : points;

    for (const pid of personIds) {
      await writeMessageFn(pid, {
        type: msgType,
        title,
        body,
        amount,
        rewardId: null,
        entryKey: null,
        seen: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: approver
      });
    }

    mount.innerHTML = '';
    showToast(`${msgType === 'bonus' ? 'Bonus' : 'Deduction'} sent!`);
  });
}

export function renderBonusDaySheet(people, todayDate) {
  const today = todayDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  return renderBottomSheet(`
    <h3 class="sheet-section-title">🎉 Bonus Day</h3>

    <label class="form-label">Who</label>
    <div class="chip-group" id="bd_people">
      <button class="chip chip--selectable chip--active" data-person-id="everyone" type="button">Everyone</button>
      ${people.map(p =>
        `<button class="chip chip--selectable" data-person-id="${p.id}" data-person-color="${p.color}" type="button">${esc(p.name)}</button>`
      ).join('')}
    </div>

    <label class="form-label sheet-label--spaced">Date</label>
    <input type="date" id="bd_date" class="form-input" value="${today}">

    <label class="form-label sheet-label--spaced">Multiplier</label>
    <div class="segmented-control" id="bd_mult">
      <button type="button" class="segmented-btn segmented-btn--active" data-value="2">2x</button>
      <button type="button" class="segmented-btn" data-value="3">3x</button>
    </div>

    <label class="form-label sheet-label--spaced">Note (optional)</label>
    <input type="text" id="bd_note" class="form-input" placeholder="Happy Birthday!">

    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="bd_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="bd_save" type="button">Set Bonus Day</button>
    </div>
  `);
}

/**
 * Show a polished in-app confirmation/alert modal. Replaces browser confirm()/alert().
 * Returns a Promise<boolean> — true if confirmed, false if cancelled.
 */
export function showConfirm({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, alert: isAlert = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="confirm-modal__card">
      <div class="confirm-modal__title" id="confirmModalTitle">${escapeHtml(title)}</div>
      ${message ? `<div class="confirm-modal__message">${escapeHtml(message)}</div>` : ''}
      <div class="confirm-modal__actions">
        ${!isAlert ? `<button class="btn btn--secondary confirm-modal__cancel" type="button">${escapeHtml(cancelLabel)}</button>` : ''}
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} confirm-modal__ok" type="button">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
    overlay.setAttribute('aria-labelledby', 'confirmModalTitle');

    const okBtn = overlay.querySelector('.confirm-modal__ok');
    const cancelBtn = overlay.querySelector('.confirm-modal__cancel');

    function close(result) {
      document.removeEventListener('keydown', keyHandler);
      overlay.classList.remove('confirm-modal--active');
      setTimeout(() => { overlay.remove(); resolve(result); }, 200);
    }

    okBtn.addEventListener('click', () => close(true));
    cancelBtn?.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(isAlert ? true : false); });

    // Focus trap: Tab cycles between cancel and ok (or stays on ok for alerts)
    function keyHandler(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(isAlert ? true : false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') {
        const focusable = [cancelBtn, okBtn].filter(Boolean);
        if (focusable.length <= 1) { e.preventDefault(); return; }
        const idx = focusable.indexOf(document.activeElement);
        e.preventDefault();
        focusable[(idx + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
      }
    }
    document.addEventListener('keydown', keyHandler);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add('confirm-modal--active');
      okBtn.focus();
    });
  });
}

/**
 * Show a brief toast notification at the bottom of the screen.
 */
export function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

/**
 * Ambient strip — 2-up chip row: Weather + Dinner. Both chips are
 * tappable. Empty-state nudges shown when data is absent (chip still
 * renders, with prompt copy). Caller passes data; component is pure.
 *
 * weather: { tempLabel: '72°', conditionLabel: 'Sunny', glyph: 'sun'|'cloud'|'rain'|'snow'|'fog', isPast?: bool, isFuture?: bool } | null
 * dinner:  { name: 'Spaghetti', source?: 'manual'|'school' } | null
 *
 * Per spec 2026-04-25 §3.3: chip leading icons are SVG glyphs (no emoji
 * in chrome). Meal names may include emoji as user-authored text.
 */
export function renderAmbientStrip({ weather = null, dinner = null } = {}) {
  // SVG glyph map (Lucide-style, monochrome).
  const weatherGlyphs = {
    sun:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.78A6 6 0 0 0 4 13.5 5.5 5.5 0 0 0 9.5 19h8z"/></svg>',
    rain:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0-1-7.87A6 6 0 0 0 4 11"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="16" y1="19" x2="16" y2="21"/></svg>',
    snow:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
    fog:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="3" y1="18" x2="15" y2="18"/></svg>'
  };
  const utensilsGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>';

  // Weather chip
  let weatherValue = '—° · Set location';
  let weatherGlyph = weatherGlyphs.cloud;
  if (weather) {
    if (weather.isPast) weatherValue = 'Past day';
    else if (weather.isFuture) weatherValue = '—° · No forecast yet';
    else {
      weatherValue = `${esc(weather.tempLabel)} · ${esc(weather.conditionLabel)}`;
      weatherGlyph = weatherGlyphs[weather.glyph] || weatherGlyphs.cloud;
    }
  }

  // Dinner chip
  let dinnerValue = 'Not planned · Plan dinner';
  if (dinner) dinnerValue = esc(dinner.name);

  return `<div class="ambient-row">
    <button class="ambient-chip" data-chip="weather" type="button">
      <span class="ambient-chip__icon" aria-hidden="true">${weatherGlyph}</span>
      <span class="ambient-chip__body">
        <span class="ambient-chip__label">Weather</span>
        <span class="ambient-chip__value">${weatherValue}</span>
      </span>
    </button>
    <button class="ambient-chip" data-chip="dinner" type="button">
      <span class="ambient-chip__icon" aria-hidden="true">${utensilsGlyph}</span>
      <span class="ambient-chip__body">
        <span class="ambient-chip__label">Dinner</span>
        <span class="ambient-chip__value">${dinnerValue}</span>
      </span>
    </button>
  </div>`;
}

/**
 * Coming up rail — 7-day forward look. Collapsed by default; expanded
 * shows day-blocks for the next 7 days starting today+1 (today excluded).
 * Days with zero events render zero rows. Spec 2026-04-25 §3.4.
 *
 * Args:
 *   days: Array<{ dateKey, dayLabel: { dow, monthDay }, events: Array<[eventId, event]> }>
 *     Sorted ascending; only days with events.
 *   isExpanded: boolean — current expand state.
 *   summary: string — pre-built summary line ("3 events this week" /
 *     "clear week" / "2 events for Noah this week" / etc.).
 *   filterPersonName: string — used by empty-state copy ("for Noah").
 */
export function renderComingUp({ days = [], isExpanded = false, summary = '', filterPersonName = '' } = {}) {
  const chevSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>`;
  const expandedAttr = isExpanded ? 'true' : 'false';

  let blocksHtml = '';
  if (days.length === 0) {
    const emptyCopy = filterPersonName
      ? `No events for ${esc(filterPersonName)} in the next 7 days`
      : 'No events in the next 7 days';
    blocksHtml = `<div class="coming-up__empty">${emptyCopy}</div>`;
  } else {
    blocksHtml = days.map(d => {
      const eventsHtml = d.events.map(([eventId, ev]) => {
        const time = ev.allDay ? 'All day' : (ev.startTime ? _formatEventTime12h(ev.startTime) : '');
        const meta = [ev.location].filter(Boolean).map(esc).join(' · ');
        const metaHtml = meta ? `<span class="event-row__meta">${meta}</span>` : '';
        return `<button class="event-row" data-event-id="${esc(eventId)}" type="button">
          <span class="event-row__time">${esc(time)}</span>
          <span class="event-row__title">${esc(ev.name || '')}</span>
          ${metaHtml}
        </button>`;
      }).join('');
      return `<div class="cal-day-block">
        <button class="cal-day-block__head" data-date="${esc(d.dateKey)}" type="button">
          <strong>${esc(d.dayLabel.dow)}</strong> ${esc(d.dayLabel.monthDay)}
        </button>
        ${eventsHtml}
      </div>`;
    }).join('');
  }

  return `<section class="coming-up" data-expanded="${expandedAttr}">
    <button class="coming-up__row" id="comingUpToggle" aria-expanded="${expandedAttr}" aria-controls="comingUpBlocks" type="button">
      <span class="coming-up__text">
        <span class="coming-up__label">Coming up</span>
        <span class="coming-up__summary">${esc(summary)}</span>
      </span>
      <span class="coming-up__chev" aria-hidden="true">${chevSvg}</span>
    </button>
    <div class="coming-up__blocks" id="comingUpBlocks"${isExpanded ? '' : ' hidden'}>
      ${blocksHtml}
    </div>
  </section>`;
}

// Internal helper — 24h "07:00" -> "7:00 AM".
function _formatEventTime12h(t24) {
  if (!t24) return '';
  const [hStr, mStr] = t24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

/**
 * Cross-page banner queue mount. Caller passes data getters; helper
 * mounts/refreshes the banner on demand. Pages: scoreboard, tracker
 * (dashboard + calendar already manage their own queues with richer
 * data; those keep their inline implementations).
 *
 * Priority: vacation > freeze > running-activity > offline.
 * Overdue and multiplier are dashboard-scoped data and are deliberately
 * excluded here.
 */
export function initBanner({ getIsOffline = () => false } = {}) {
  const mount = document.getElementById('bannerMount');
  if (!mount) return null;
  const refresh = () => {
    let banner = null;
    if (window.__activeVacation) {
      const v = window.__activeVacation;
      banner = { variant: 'vacation', title: `${v.personName} is away until ${v.endDate}` };
    } else if (window.__scheduleFrozen) {
      banner = { variant: 'freeze', title: 'Schedule frozen' };
    } else if (window.__activeActivitySession) {
      const s = window.__activeActivitySession;
      banner = {
        variant: 'info',
        title: `${s.name} · ${s.elapsed}`,
        action: { label: 'Stop', onClick: () => window.__stopActivitySession?.() }
      };
    } else if (getIsOffline()) {
      banner = { variant: 'info', title: 'Offline', message: 'Changes will sync when you reconnect.' };
    }
    if (!banner) { mount.innerHTML = ''; return; }
    mount.innerHTML = renderBanner(banner.variant, {
      title: banner.title,
      message: banner.message,
      action: banner.action ? { label: banner.action.label } : undefined
    });
    if (banner.action) {
      mount.querySelector('[data-banner-action]')?.addEventListener('click', banner.action.onClick);
    }
  };
  refresh();
  return { refresh };
}

/**
 * Initialize the notification bell on any page.
 * Sets up real-time listener and dropdown toggle.
 */
export function initBell(getPeople, getRewards, onAllMessagesFn, { writeMessageFn, markMessageSeenFn, removeMessageFn, writeBankTokenFn, markBankTokenUsedFn, readBankFn, writeMultiplierFn, getTodayFn, approverName } = {}) {
  const approver = approverName || 'Parent';
  let bellMessages = {};

  function closeBellDropdown() {
    document.querySelector('.bell-overlay')?.remove();
    document.querySelector('.bell-dropdown')?.remove();
  }

  onAllMessagesFn((allMsgs) => {
    bellMessages = allMsgs || {};
    let count = 0;
    for (const [pid, msgs] of Object.entries(bellMessages)) {
      if (!msgs) continue;
      for (const msg of Object.values(msgs)) {
        if ((msg.type === 'redemption-request' || msg.type === 'use-request') && !msg.seen) count++;
      }
    }
    // v2 header uses a single dot (no count); legacy header keeps the numeric badge.
    const dot = document.getElementById('headerBellDot');
    if (dot) {
      dot.classList.toggle('is-hidden', count === 0);
      return;
    }
    const bell = document.getElementById('headerBell');
    if (!bell) return;
    const badge = bell.querySelector('.bell__badge');
    if (count > 0) {
      if (badge) { badge.textContent = count > 99 ? '99+' : count; }
      else { bell.insertAdjacentHTML('beforeend', `<span class="bell__badge">${count > 99 ? '99+' : count}</span>`); }
    } else if (badge) {
      badge.remove();
    }
  });

  document.addEventListener('click', (e) => {
    const bellBtn = e.target.closest('#headerBell');
    if (bellBtn) {
      e.stopPropagation();
      const existing = document.querySelector('.bell-overlay');
      if (existing) {
        closeBellDropdown();
        return;
      }

      const people = getPeople();
      const pendingRequests = [];
      const recentActivity = [];

      for (const [pid, msgs] of Object.entries(bellMessages)) {
        if (!msgs) continue;
        for (const [msgId, msg] of Object.entries(msgs)) {
          if ((msg.type === 'redemption-request' || msg.type === 'use-request') && !msg.seen) {
            pendingRequests.push({ ...msg, id: msgId, personId: pid, balance: '\u2014' });
          } else if (msg.type !== 'redemption-request' && msg.type !== 'use-request') {
            recentActivity.push({ ...msg, id: msgId, personId: pid });
          }
        }
      }
      recentActivity.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const bellEl = document.getElementById('headerBell');
      if (!bellEl) return;

      const overlay = document.createElement('div');
      overlay.className = 'bell-overlay';
      overlay.addEventListener('click', closeBellDropdown);
      document.body.appendChild(overlay);

      // Append dropdown to body so it shares the same stacking context as the overlay
      const dropdownContainer = document.createElement('div');
      dropdownContainer.innerHTML = renderBellDropdown({
        pendingRequests,
        recentActivity,
        rewards: getRewards(),
        people
      });
      const dropdown = dropdownContainer.firstElementChild;
      // Position below the header, centered on mobile
      const header = document.querySelector('.app-header');
      const headerBottom = header ? header.getBoundingClientRect().bottom : 56;
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${headerBottom + 4}px`;
      dropdown.style.left = '16px';
      dropdown.style.right = '16px';
      dropdown.style.width = 'auto';
      document.body.appendChild(dropdown);

      // Wire "Send Message" button
      document.getElementById('bellSendMessage')?.addEventListener('click', () => {
        closeBellDropdown();
        const mount = document.getElementById('taskSheetMount') || document.getElementById('drilldownMount');
        if (!mount) return;
        mount.innerHTML = renderSendMessageSheet(getPeople());
        requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });
        bindSendMessageSheet(mount, writeMessageFn, approver);
      });

      // Wire "Clear All" button — deletes all messages
      document.getElementById('bellClearAll')?.addEventListener('click', async () => {
        if (!await showConfirm({ title: 'Clear all notification history?', danger: true })) return;
        const people = getPeople();
        for (const p of people) {
          const msgs = bellMessages[p.id];
          if (!msgs) continue;
          for (const msgId of Object.keys(msgs)) {
            if (removeMessageFn) await removeMessageFn(p.id, msgId);
            else await markMessageSeenFn(p.id, msgId);
          }
        }
        closeBellDropdown();
      });

      // Wire "Bonus Day" button
      document.getElementById('bellBonusDay')?.addEventListener('click', () => {
        closeBellDropdown();
        const mount = document.getElementById('taskSheetMount') || document.getElementById('drilldownMount');
        if (!mount) return;
        mount.innerHTML = renderBonusDaySheet(getPeople(), getTodayFn?.());
        requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });

        // Person chip toggle (exclusive with "Everyone")
        for (const chip of mount.querySelectorAll('#bd_people .chip--selectable')) {
          chip.addEventListener('click', () => {
            if (chip.dataset.personId === 'everyone') {
              mount.querySelectorAll('#bd_people .chip--selectable').forEach(c => c.classList.remove('chip--active'));
              chip.classList.add('chip--active');
            } else {
              mount.querySelector('[data-person-id="everyone"]')?.classList.remove('chip--active');
              chip.classList.toggle('chip--active');
            }
          });
        }

        // Multiplier toggle
        for (const btn of mount.querySelectorAll('#bd_mult .segmented-btn')) {
          btn.addEventListener('click', () => {
            mount.querySelectorAll('#bd_mult .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
            btn.classList.add('segmented-btn--active');
          });
        }

        // Save
        mount.querySelector('#bd_save')?.addEventListener('click', async () => {
          const dateKey = mount.querySelector('#bd_date').value;
          const mult = parseInt(mount.querySelector('#bd_mult .segmented-btn--active')?.dataset?.value) || 2;
          const note = mount.querySelector('#bd_note').value.trim() || null;
          const isEveryone = mount.querySelector('[data-person-id="everyone"]')?.classList.contains('chip--active');
          const selectedIds = isEveryone
            ? getPeople().map(p => p.id)
            : [...mount.querySelectorAll('#bd_people .chip--active')].map(c => c.dataset.personId).filter(id => id !== 'everyone');

          if (writeMultiplierFn) {
            for (const pid of selectedIds) {
              await writeMultiplierFn(dateKey, pid, { multiplier: mult, note, createdBy: approver });
            }
          }
          mount.innerHTML = '';
        });

        mount.querySelector('#bd_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
        mount.querySelector('.bottom-sheet-overlay')?.addEventListener('click', (e) => {
          if (e.target.classList.contains('bottom-sheet-overlay')) mount.innerHTML = '';
        });
      });

      // Wire approve/deny buttons
      for (const btn of document.querySelectorAll('.bell-approve')) {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          await markMessageSeenFn(personId, msgId);

          const reward = getRewards()[msg.rewardId] || {};
          await writeMessageFn(personId, {
            type: 'redemption-approved',
            title: `${reward.name || 'Reward'} approved${approver !== 'Parent' ? ` by ${approver}` : ''}!`,
            body: null,
            amount: 0,
            rewardId: msg.rewardId,
            entryKey: null,
            seen: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: approver
          });

          await writeBankTokenFn(personId, {
            rewardType: reward.rewardType || 'custom',
            rewardId: msg.rewardId,
            rewardName: reward.name || 'Reward',
            rewardIcon: reward.icon || '🎁',
            acquiredAt: Date.now(),
            used: false,
            usedAt: null,
            targetEntryKey: null
          });

          closeBellDropdown();
        });
      }

      for (const btn of document.querySelectorAll('.bell-deny')) {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          await markMessageSeenFn(personId, msgId);

          const reward = getRewards()[msg.rewardId] || {};
          await writeMessageFn(personId, {
            type: 'redemption-denied',
            title: `${reward.name || 'Reward'} denied${approver !== 'Parent' ? ` by ${approver}` : ''}`,
            body: null,
            amount: 0,
            rewardId: msg.rewardId,
            entryKey: null,
            seen: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: approver
          });

          // Refund points
          await writeMessageFn(personId, {
            type: 'bonus',
            title: `Refund: ${reward.name || 'Reward'}`,
            body: null,
            amount: Math.abs(msg.amount),
            rewardId: null,
            entryKey: null,
            seen: true,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: 'system'
          });

          closeBellDropdown();
        });
      }

      // Wire use-request approve/deny buttons
      for (const btn of document.querySelectorAll('.bell-approve-use')) {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          await markMessageSeenFn(personId, msgId);

          // Mark the bank token as used
          if (msg.bankTokenId && markBankTokenUsedFn) {
            await markBankTokenUsedFn(personId, msg.bankTokenId, null);
          }

          await writeMessageFn(personId, {
            type: 'use-approved',
            title: `${msg.rewardName || 'Reward'} — approved${approver !== 'Parent' ? ` by ${approver}` : ''}!`,
            body: null,
            amount: 0,
            rewardId: msg.rewardId || null,
            entryKey: null,
            seen: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: approver
          });

          closeBellDropdown();
        });
      }

      for (const btn of document.querySelectorAll('.bell-deny-use')) {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          await markMessageSeenFn(personId, msgId);

          await writeMessageFn(personId, {
            type: 'use-denied',
            title: `${msg.rewardName || 'Reward'} — not right now (${approver})`,
            body: null,
            amount: 0,
            rewardId: msg.rewardId || null,
            entryKey: null,
            seen: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: approver
          });

          closeBellDropdown();
        });
      }

      return;
    }

    if (!e.target.closest('.bell-dropdown') && !e.target.closest('#headerBell')) {
      closeBellDropdown();
    }
  });
}
