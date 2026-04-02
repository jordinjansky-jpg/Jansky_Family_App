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
    showAddTask = false,
    rightContent = ''
  } = options;

  const debugIcon = showDebug ? '<span class="header__debug" title="Debug mode active">🐛</span>' : '';
  const adminLink = showAdmin ? '<a href="admin.html" class="header__admin" title="Admin">⚙️</a>' : '';
  const addTaskBtn = showAddTask ? '<button class="header__add-task" id="headerAddTask" title="Add Task" type="button">+</button>' : '';

  return `<header class="app-header">
    <div class="header__left">
      <h1 class="header__title">${appName}</h1>
      ${subtitle ? `<span class="header__subtitle">${subtitle}</span>` : ''}
    </div>
    <div class="header__right">
      ${rightContent}
      ${addTaskBtn}
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
 * options: { entryKey, entry, task, person, category, completed, overdue, dateLabel, points }
 * points: optional { possible, override } — override is the pointsOverride percentage (null = no override)
 */
export function renderTaskCard(options) {
  const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points } = options;
  const doneClass = completed ? ' task-card--done' : '';
  const overdueClass = overdue ? ' task-card--overdue' : '';
  const showIcon = category?.showIcon !== false;
  const catIcon = showIcon ? (category?.icon || '') : '';
  const ownerColor = person?.color || 'var(--text-secondary)';
  const ownerInitial = (person?.name || '?')[0].toUpperCase();
  const estLabel = task.estMin ? `${task.estMin}m` : '';

  // Points label: show override value with color if active, else base
  let ptsLabel = '';
  if (points) {
    if (points.override != null && points.override !== 100) {
      const overridePts = Math.round(points.possible * (points.override / 100));
      const colorClass = points.override > 100 ? 'task-card__pts--up' : 'task-card__pts--down';
      ptsLabel = `<span class="${colorClass}">${overridePts}pt</span>`;
    } else {
      ptsLabel = `${points.possible}pt`;
    }
  }

  const meta = [estLabel, ptsLabel].filter(Boolean).join(' · ');
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
 * Render a grade badge.
 * grade: letter string (e.g., 'A+', 'B-'), tier: 'a'|'b'|'c'|'d'|'f'
 */
export function renderGradeBadge(grade, tier) {
  if (!grade || grade === '--') return `<span class="grade-badge grade-badge--none">--</span>`;
  return `<span class="grade-badge grade-badge--${tier}">${grade}</span>`;
}

/**
 * Render a task detail bottom sheet (long-press actions).
 * options: { entryKey, entry, task, person, category, completed, points, sliderMin, sliderMax, currentOverride, gradePreview }
 */
export function renderTaskDetailSheet(options) {
  const {
    entryKey, entry, task, person, category, completed, points,
    sliderMin, sliderMax, currentOverride, gradePreview,
    people, showDelegate, showMove, showEdit, dateKey
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
      <span class="task-card__initial">${(person?.name || '?')[0].toUpperCase()}</span>
      <span>${catIcon ? catIcon + ' ' : ''}${task.name}</span>
    </div>
    <div class="task-detail__meta">
      ${person ? `<span class="chip" style="--person-color:${person.color}">${person.name}</span>` : ''}
      <span class="chip">${rotLabel}</span>
      <span class="chip">${diffLabel}</span>
      ${todLabel ? `<span class="chip">${todLabel}</span>` : ''}
      ${task.estMin ? `<span class="chip">${task.estMin}m</span>` : ''}
      ${points ? `<span class="chip">${points.possible}pt</span>` : ''}
    </div>
  </div>`;

  // Complete/uncomplete button
  const toggleLabel = completed ? 'Mark Incomplete' : 'Mark Complete';
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
      <span class="form-label">Reassign to:</span>
      <div class="task-detail__person-chips">
        ${otherPeople.map(p => `<button class="chip chip--selectable" data-person-id="${p.id}" style="--person-color:${p.color}" type="button">${p.name}</button>`).join('')}
      </div>
    </div>`;
  }

  // Move panel (hidden by default, shown when Move clicked)
  if (showMove) {
    html += `<div class="task-detail__move-panel" id="movePanel" style="display:none;">
      <span class="form-label">Move to:</span>
      <div class="task-detail__move-options">
        <input type="date" id="moveDatePicker" class="task-detail__date-input">
        <button class="btn btn--ghost btn--sm" id="moveSkip" type="button">Skip Task</button>
      </div>
    </div>`;
  }

  // Points slider — always visible, preview-only label for incomplete tasks
  if (points) {
    const min = sliderMin ?? 0;
    const max = sliderMax ?? 150;
    const earnedPts = Math.round(points.possible * (sliderVal / 100));
    const sliderLabel = completed ? 'Points Override' : 'Points Preview';
    const previewNote = completed ? '' : '<div class="form-hint">Complete the task to save override</div>';
    html += `<div class="task-detail__slider mt-md">
      <div class="task-detail__slider-header">
        <span class="form-label">${sliderLabel}</span>
        <span class="task-detail__slider-value" id="sliderValueLabel">${sliderVal}% (${earnedPts}pt)</span>
      </div>
      <div class="task-detail__slider-row">
        <input type="range" class="slider" id="pointsSlider" min="${min}" max="${max}" value="${sliderVal}" step="5" data-entry-key="${entryKey}" data-base-pts="${points.possible}">
        ${sliderVal !== 100 ? `<button class="btn btn--secondary btn--sm" id="sliderReset" type="button">Reset</button>` : ''}
      </div>
      ${gradePreview ? `<div class="task-detail__grade-preview" id="gradePreview">Grade: ${gradePreview}</div>` : ''}
      ${previewNote}
    </div>`;
  }

  html += `</div>`;
  return html;
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

/**
 * Render the quick-add task bottom sheet.
 * people: array of { id, name, color }
 * categories: array of { key, label, icon }
 */
export function renderQuickAddSheet(people, categories) {
  let html = `<div class="task-detail-sheet">
    <h3 class="admin-form__title">Quick Add Task</h3>
    <div class="form-group">
      <label class="form-label">Task Name</label>
      <input type="text" id="qa_name" placeholder="e.g., Take out trash" autofocus>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Rotation</label>
        <select id="qa_rotation">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="once">One-Time</option>
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Difficulty</label>
        <select id="qa_difficulty">
          <option value="easy">Easy</option>
          <option value="medium" selected>Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Time of Day</label>
        <select id="qa_timeOfDay">
          <option value="anytime">Anytime</option>
          <option value="am">Morning</option>
          <option value="pm">Afternoon</option>
          <option value="both">Both</option>
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Est. Min</label>
        <input type="number" id="qa_estMin" value="10" min="1" max="120">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select id="qa_category">
        ${categories.map(c => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Owners</label>
      <div class="admin-checkboxes" id="qa_owners">
        ${people.map(p => `<label class="admin-checkbox"><input type="checkbox" value="${p.id}"> ${p.name}</label>`).join('')}
      </div>
    </div>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="qaCancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="qaSave" type="button">Create Task</button>
    </div>
  </div>`;
  return html;
}

/**
 * Render an inline edit task form inside a bottom sheet.
 * task: the task object, categories: [{key, label, icon}], people: [{id, name, color}]
 */
export function renderEditTaskSheet(taskId, task, categories, people) {
  const selectedOwners = task.owners || [];
  let html = `<div class="task-detail-sheet">
    <h3 class="admin-form__title">Edit Task</h3>
    <div class="form-group">
      <label class="form-label">Task Name</label>
      <input type="text" id="et_name" value="${task.name || ''}">
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Rotation</label>
        <select id="et_rotation">
          <option value="daily"${task.rotation === 'daily' ? ' selected' : ''}>Daily</option>
          <option value="weekly"${task.rotation === 'weekly' ? ' selected' : ''}>Weekly</option>
          <option value="monthly"${task.rotation === 'monthly' ? ' selected' : ''}>Monthly</option>
          <option value="once"${task.rotation === 'once' ? ' selected' : ''}>One-Time</option>
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Difficulty</label>
        <select id="et_difficulty">
          <option value="easy"${task.difficulty === 'easy' ? ' selected' : ''}>Easy</option>
          <option value="medium"${(task.difficulty || 'medium') === 'medium' ? ' selected' : ''}>Medium</option>
          <option value="hard"${task.difficulty === 'hard' ? ' selected' : ''}>Hard</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Time of Day</label>
        <select id="et_timeOfDay">
          <option value="anytime"${(task.timeOfDay || 'anytime') === 'anytime' ? ' selected' : ''}>Anytime</option>
          <option value="am"${task.timeOfDay === 'am' ? ' selected' : ''}>Morning</option>
          <option value="pm"${task.timeOfDay === 'pm' ? ' selected' : ''}>Afternoon</option>
          <option value="both"${task.timeOfDay === 'both' ? ' selected' : ''}>Both</option>
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">Est. Min</label>
        <input type="number" id="et_estMin" value="${task.estMin || 10}" min="1" max="120">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select id="et_category">
        ${categories.map(c => `<option value="${c.key}"${task.category === c.key ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Owners</label>
      <div class="admin-checkboxes" id="et_owners">
        ${people.map(p => `<label class="admin-checkbox"><input type="checkbox" value="${p.id}"${selectedOwners.includes(p.id) ? ' checked' : ''}> ${p.name}</label>`).join('')}
      </div>
    </div>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="etCancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="etSave" data-task-id="${taskId}" type="button">Save Changes</button>
    </div>
  </div>`;
  return html;
}
