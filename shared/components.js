// components.js — Reusable UI rendering functions (v2)
// These functions return HTML strings or create DOM elements.
// Pages call these functions and insert results into the DOM.

import { escapeHtml } from './utils.js';
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
  const items = NAV_ITEMS.map(item => {
    const active = item.id === activePage ? ' nav-item--active' : '';
    return `<a href="${item.href}" class="nav-item${active}" data-page="${item.id}" aria-label="${item.label}"${active ? ' aria-current="page"' : ''}>
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
export function renderPersonFilter(people, activePerson) {
  const allActive = !activePerson ? ' person-pill--active' : '';
  let html = `<div class="person-filter" role="group" aria-label="Filter by person">`;
  html += `<button class="person-pill${allActive}" data-person-id="" aria-pressed="${!activePerson}">All</button>`;

  for (const p of people) {
    const active = activePerson === p.id ? ' person-pill--active' : '';
    html += `<button class="person-pill${active}" data-person-id="${p.id}" style="--person-color: ${p.color}" aria-pressed="${activePerson === p.id}">${esc(p.name)}</button>`;
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
  const { entryKey, entry, task, person, category, completed, overdue, dateLabel, points, isEvent, showPoints = true } = options;
  const doneClass = completed ? ' task-card--done' : '';
  const overdueClass = overdue ? ' task-card--overdue' : '';
  const eventClass = isEvent ? ' task-card--event' : '';
  const showIcon = category?.showIcon !== false;
  const catIcon = showIcon ? (category?.icon || '') : '';
  const ownerColor = person?.color || 'var(--text-secondary)';
  const ownerInitial = (person?.name || '?')[0].toUpperCase();
  const estLabel = task.estMin ? `${task.estMin}m` : '';
  const eventColor = isEvent && category?.eventColor ? category.eventColor : null;

  // Points label: show override value with color if active, else base (skip for events, exempt, and showPoints off)
  let ptsLabel = '';
  if (points && !isEvent && !task.exempt && showPoints) {
    if (points.override != null && points.override !== 100) {
      const overridePts = Math.round(points.possible * (points.override / 100));
      const colorClass = points.override > 100 ? 'task-card__pts--up' : 'task-card__pts--down';
      ptsLabel = `<span class="${colorClass}">${overridePts}pt</span>`;
    } else {
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

/**
 * Render a task detail bottom sheet (long-press actions).
 * options: { entryKey, entry, task, person, category, completed, points, sliderMin, sliderMax, currentOverride, gradePreview }
 */
export function renderTaskDetailSheet(options) {
  const {
    entryKey, entry, task, person, category, completed, points,
    sliderMin, sliderMax, currentOverride, gradePreview,
    people, showDelegate, showMove, showEdit, dateKey, showPoints = true
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

  // Points slider — always visible, preview-only label for incomplete tasks
  if (points && showPoints) {
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
 * Render the quick-add task bottom sheet.
 * people: array of { id, name, color }
 * categories: array of { key, label, icon }
 */
export function renderQuickAddSheet(people, categories, defaultCategoryKey) {
  // Check if default category is an event
  const defaultCat = defaultCategoryKey ? categories.find(c => c.key === defaultCategoryKey) : null;
  const defaultIsEvent = !!defaultCat?.isEvent;
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
        <label class="form-label">Est. Minutes</label>
        <input type="number" id="qa_estMin" value="10" min="0" max="120">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select id="qa_category">
        ${categories.map(c => `<option value="${esc(c.key)}" data-event="${c.isEvent ? '1' : ''}"${(defaultCategoryKey && c.key === defaultCategoryKey) ? ' selected' : ''}>${esc(c.icon)} ${esc(c.label)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Owners</label>
      <div class="owner-chips" id="qa_owners">
        ${people.map(p => `<button type="button" class="owner-chip" data-id="${p.id}">${esc(p.name)}</button>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Assignment Mode</label>
      <div class="form-row">
        <button class="btn btn--secondary btn--sm admin-mode-btn admin-mode-btn--active" data-mode="rotate" type="button">Rotate</button>
        <button class="btn btn--secondary btn--sm admin-mode-btn" data-mode="duplicate" type="button">Duplicate</button>
      </div>
      <p class="form-hint" id="qa_assignModeHint">Rotate between owners each period.</p>
    </div>
    <div class="form-group" id="qa_dedicatedDayGroup" style="display:none">
      <label class="form-label" id="qa_dedicatedDayLabel">Dedicated Day <button type="button" id="qa_eventDateBtn" class="btn btn--ghost btn--sm" style="display:${defaultIsEvent ? 'inline' : 'none'};padding:0 4px;font-size:1.1em;vertical-align:middle" title="Pick event date">📅</button></label>
      <input type="date" id="qa_eventDate" style="position:absolute;opacity:0;pointer-events:none;">
      <select id="qa_daySelect" class="dedicated-day-select" style="display:none">
        <option value="" selected>Any</option>
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
          const val = (i + 1) % 7;
          return `<option value="${val}">${d}</option>`;
        }).join('')}
      </select>
      <div id="qa_dedicatedDateRow" style="display:none">
        <input type="date" id="qa_dedicatedDate" class="task-detail__date-input" style="width:100%">
      </div>
    </div>
    <div class="form-group" id="qa_eventTimeGroup" style="display:${defaultIsEvent ? '' : 'none'}">
      <label class="form-label">Event Time</label>
      <input type="time" id="qa_eventTime" value="">
      <p class="form-hint">Leave blank for all-day events</p>
    </div>
    <div class="form-group">
      <label class="form-label">Cooldown Days</label>
      <input type="number" id="qa_cooldown" value="" min="0" max="30" placeholder="0">
    </div>
    <label class="admin-checkbox mt-sm"><input type="checkbox" id="qa_exempt"> Exempt from scoring</label>
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
  const assignMode = task.ownerAssignmentMode || 'rotate';
  const catObj = categories.find(c => c.key === task.category);
  const isEvent = !!catObj?.isEvent;
  const showDedicated = task.rotation && task.rotation !== 'daily';
  let html = `<div class="task-detail-sheet">
    <h3 class="admin-form__title">Edit Task</h3>
    <div class="form-group">
      <label class="form-label">Task Name</label>
      <input type="text" id="et_name" value="${esc(task.name || '')}">
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
        <label class="form-label">Est. Minutes</label>
        <input type="number" id="et_estMin" value="${task.estMin ?? 10}" min="0" max="120">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select id="et_category">
        ${categories.map(c => `<option value="${esc(c.key)}" data-event="${c.isEvent ? '1' : ''}"${task.category === c.key ? ' selected' : ''}>${esc(c.icon)} ${esc(c.label)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Owners</label>
      <div class="owner-chips" id="et_owners">
        ${people.map(p => `<button type="button" class="owner-chip${selectedOwners.includes(p.id) ? ' owner-chip--selected' : ''}" data-id="${p.id}">${esc(p.name)}</button>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Assignment Mode</label>
      <div class="form-row">
        <button class="btn btn--secondary btn--sm admin-mode-btn${assignMode === 'rotate' ? ' admin-mode-btn--active' : ''}" data-mode="rotate" type="button">Rotate</button>
        <button class="btn btn--secondary btn--sm admin-mode-btn${assignMode === 'duplicate' ? ' admin-mode-btn--active' : ''}" data-mode="duplicate" type="button">Duplicate</button>
      </div>
      <p class="form-hint" id="et_assignModeHint">${assignMode === 'duplicate' ? 'Each owner gets their own entry.' : 'Rotate between owners each period.'}</p>
    </div>
    <div class="form-group" id="et_dedicatedDayGroup" style="display:${showDedicated ? '' : 'none'}">
      <label class="form-label" id="et_dedicatedDayLabel">${task.rotation === 'once' ? (isEvent ? 'Event Date' : 'Scheduled Date') : 'Dedicated Day'} <button type="button" id="et_eventDateBtn" class="btn btn--ghost btn--sm" style="display:${isEvent ? 'inline' : 'none'};padding:0 4px;font-size:1.1em;vertical-align:middle" title="Pick event date">📅</button></label>
      <input type="date" id="et_eventDate" style="position:absolute;opacity:0;pointer-events:none;" value="${task.dedicatedDate || ''}">
      <select id="et_daySelect" class="dedicated-day-select" style="display:${task.rotation === 'once' ? 'none' : ''}">
        <option value=""${task.dedicatedDay == null ? ' selected' : ''}>Any</option>
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => {
          const val = (i + 1) % 7;
          return `<option value="${val}"${task.dedicatedDay === val ? ' selected' : ''}>${d}</option>`;
        }).join('')}
      </select>
      <div id="et_dedicatedDateRow" style="display:${task.rotation === 'once' && !isEvent ? '' : 'none'}">
        <input type="date" id="et_dedicatedDate" class="task-detail__date-input" style="width:100%" value="${task.dedicatedDate || ''}">
      </div>
    </div>
    <div class="form-group" id="et_eventTimeGroup" style="display:${isEvent ? '' : 'none'}">
      <label class="form-label">Event Time</label>
      <input type="time" id="et_eventTime" value="${task.eventTime || ''}">
      <p class="form-hint">Leave blank for all-day events</p>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">Cooldown Days</label>
        <input type="number" id="et_cooldown" value="${task.cooldownDays || ''}" min="0" max="30" placeholder="0">
      </div>
    </div>
    <label class="admin-checkbox mt-sm"><input type="checkbox" id="et_exempt"${task.exempt ? ' checked' : ''}> Exempt from scoring</label>
    <div class="admin-form__actions mt-md">
      <button class="btn btn--secondary" id="etCancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="etSave" data-task-id="${taskId}" type="button">Save Changes</button>
    </div>
  </div>`;
  return html;
}

export function renderOfflineBanner(message) {
  return `<div class="offline-banner" role="status" aria-live="polite">
    <span class="offline-banner__dot"></span>
    <span class="offline-banner__text">${esc(message)}</span>
  </div>`;
}

/** Attach click-to-toggle on owner chip buttons inside a container. */
export function initOwnerChips(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.owner-chip');
    if (chip) chip.classList.toggle('owner-chip--selected');
  });
}

/** Read selected owner IDs from an owner-chips container. */
export function getSelectedOwners(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .owner-chip--selected`)).map(b => b.dataset.id);
}

/**
 * Open the device theme picker bottom sheet.
 * mountEl: DOM element to render into
 * familyTheme: the Firebase settings.theme (fallback when device override cleared)
 * onApply: optional callback after theme changes (e.g. to re-render page)
 */
export function openDeviceThemeSheet(mountEl, familyTheme, onApply) {
  const presets = getPresets();
  const colorPalette = getColorPalette();
  const current = loadDeviceTheme();
  const currentPreset = current?.preset || '';
  const currentAccent = current?.accentColor || familyTheme?.accentColor || '#5b7fd6';

  const html = renderBottomSheet(`<div class="task-detail-sheet">
    <h3 class="admin-form__title">Device Theme</h3>
    <div class="dt-section">
      <label class="form-label">Theme</label>
      <div class="dt-themes">
        <button class="dt-theme-btn${!currentPreset ? ' dt-theme-btn--active' : ''}" data-preset="" type="button">Family Default</button>
        ${presets.map(p => `<button class="dt-theme-btn${currentPreset === p.key ? ' dt-theme-btn--active' : ''}" data-preset="${p.key}" type="button">${esc(p.label)}</button>`).join('')}
      </div>
    </div>
    <div class="dt-section">
      <label class="form-label">Accent Color</label>
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

  function applyAndSave() {
    if (!activePreset) {
      saveDeviceTheme(null);
      applyTheme(familyTheme || defaultThemeConfig());
    } else {
      const info = presets.find(p => p.key === activePreset);
      const themeConfig = { mode: info.mode, preset: activePreset, accentColor: activeAccent };
      saveDeviceTheme(themeConfig);
      applyTheme(themeConfig);
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

  // Color buttons
  mountEl.querySelectorAll('.dt-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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
