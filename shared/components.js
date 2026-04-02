// components.js — Reusable UI rendering functions
// These functions return HTML strings or create DOM elements.
// Pages call these functions and insert results into the DOM.

/**
 * Navigation bar configuration.
 * Adding a page = adding one entry here + creating the HTML file.
 */
const NAV_ITEMS = [
  { icon: '🏠', label: 'Home', href: 'index.html', id: 'home' },
  { icon: '📅', label: 'Calendar', href: 'calendar.html', id: 'calendar' },
  { icon: '🏆', label: 'Scoreboard', href: 'scoreboard.html', id: 'scoreboard' },
  { icon: '✅', label: 'Tracker', href: 'tracker.html', id: 'tracker' }
];

/**
 * Render the bottom navigation bar.
 * activePage: the id of the current page (e.g., 'home', 'calendar')
 * Returns an HTML string.
 */
export function renderNavBar(activePage) {
  const items = NAV_ITEMS.map(item => {
    const active = item.id === activePage ? ' nav-item--active' : '';
    return `<a href="${item.href}" class="nav-item${active}" data-page="${item.id}">
      <span class="nav-item__icon">${item.icon}</span>
      <span class="nav-item__label">${item.label}</span>
    </a>`;
  }).join('');

  return `<nav class="bottom-nav">${items}</nav>`;
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
    showAdmin = true,
    showDebug = false,
    rightContent = ''
  } = options;

  const debugIcon = showDebug ? '<span class="header__debug" title="Debug mode active">🐛</span>' : '';
  const adminLink = showAdmin ? '<a href="admin.html" class="header__admin" title="Admin">⚙️</a>' : '';

  return `<header class="app-header">
    <div class="header__left">
      <h1 class="header__title">${appName}</h1>
      ${subtitle ? `<span class="header__subtitle">${subtitle}</span>` : ''}
    </div>
    <div class="header__right">
      ${rightContent}
      ${debugIcon}
      ${adminLink}
    </div>
  </header>`;
}

/**
 * Render a loading spinner overlay.
 * message: optional loading text
 */
export function renderLoading(message = 'Loading...') {
  return `<div class="loading-overlay">
    <div class="loading-spinner"></div>
    <p class="loading-text">${message}</p>
  </div>`;
}

/**
 * Render an inline loading indicator (not full-page).
 */
export function renderLoadingInline(message = 'Loading...') {
  return `<div class="loading-inline">
    <div class="loading-spinner loading-spinner--small"></div>
    <span>${message}</span>
  </div>`;
}

/**
 * Render a connection status indicator.
 * connected: boolean
 */
export function renderConnectionStatus(connected) {
  const cls = connected ? 'connection-dot--online' : 'connection-dot--offline';
  const label = connected ? 'Connected' : 'Offline';
  return `<span class="connection-dot ${cls}" title="${label}"></span>`;
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
export function renderEmptyState(icon, title, subtitle = '') {
  return `<div class="empty-state">
    <span class="empty-state__icon">${icon}</span>
    <h3 class="empty-state__title">${title}</h3>
    ${subtitle ? `<p class="empty-state__subtitle">${subtitle}</p>` : ''}
  </div>`;
}

/**
 * Render a confirmation modal.
 * options: { title, message, confirmText, cancelText, danger }
 * Returns an HTML string. Page handles show/hide and button clicks.
 */
export function renderConfirmModal(options = {}) {
  const {
    title = 'Confirm',
    message = 'Are you sure?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false
  } = options;

  const btnClass = danger ? 'btn btn--danger' : 'btn btn--primary';

  return `<div class="modal-overlay" id="confirmModal">
    <div class="modal">
      <h3 class="modal__title">${title}</h3>
      <p class="modal__message">${message}</p>
      <div class="modal__actions">
        <button class="btn btn--secondary modal__cancel" type="button">${cancelText}</button>
        <button class="${btnClass} modal__confirm" type="button">${confirmText}</button>
      </div>
    </div>
  </div>`;
}

/**
 * Render a bottom sheet shell.
 * content: HTML string for the sheet body
 * Returns an HTML string.
 */
export function renderBottomSheet(content) {
  return `<div class="bottom-sheet-overlay" id="bottomSheet">
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
export function renderPersonFilter(people, activePerson) {
  const allActive = !activePerson ? ' person-pill--active' : '';
  let html = `<div class="person-filter">`;
  html += `<button class="person-pill${allActive}" data-person-id="">All</button>`;

  for (const p of people) {
    const active = activePerson === p.id ? ' person-pill--active' : '';
    html += `<button class="person-pill${active}" data-person-id="${p.id}" style="--person-color: ${p.color}">${p.name}</button>`;
  }

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
    <div class="progress-bar">
      <div class="progress-bar__fill" style="width:${pct}%"></div>
    </div>
  </div>`;
}

/**
 * Render a single task card.
 * options: { entryKey, entry, task, person, category, completed, overdue, dateLabel }
 */
export function renderTaskCard(options) {
  const { entryKey, entry, task, person, category, completed, overdue, dateLabel } = options;
  const doneClass = completed ? ' task-card--done' : '';
  const overdueClass = overdue ? ' task-card--overdue' : '';
  const catIcon = category?.icon || '';
  const ownerColor = person?.color || 'var(--text-secondary)';
  const ownerInitial = (person?.name || '?')[0].toUpperCase();
  const estLabel = task.estMin ? `${task.estMin}m` : '';
  const diffPoints = task.difficulty === 'hard' ? '50p' : task.difficulty === 'easy' ? '7p' : '17p';
  const meta = [estLabel, diffPoints].filter(Boolean).join(' · ');
  const dateLine = dateLabel ? `<span class="task-card__date">${dateLabel}</span>` : '';
  const taskName = catIcon ? `${catIcon} ${task.name}` : task.name;

  return `<button class="task-card${doneClass}${overdueClass}" data-entry-key="${entryKey}" data-date-key="${entry.dateKey || ''}" type="button" aria-pressed="${completed}" style="--owner-color:${ownerColor}">
    <span class="task-card__initial">${ownerInitial}</span>
    <span class="task-card__name">${taskName}</span>
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
  return `<button class="overdue-banner" id="overdueToggle" type="button">
    <span class="overdue-banner__icon">⚠️</span>
    <span class="overdue-banner__text">${count} overdue ${s}</span>
    <span class="overdue-banner__arrow" id="overdueArrow">▸</span>
  </button>`;
}

/**
 * Render the day-complete celebration overlay.
 */
export function renderCelebration() {
  return `<div class="celebration" id="celebration">
    <div class="celebration__content">
      <span class="celebration__icon">🎉</span>
      <h3 class="celebration__title">All Done!</h3>
      <p class="celebration__subtitle">Great job finishing today's tasks!</p>
    </div>
  </div>`;
}
