// components.js — Reusable UI rendering functions (v2)
// These functions return HTML strings or create DOM elements.
// Pages call these functions and insert results into the DOM.

import { escapeHtml, formatDateShort } from './utils.js';
import { getPresets, getColorPalette, loadDeviceTheme, saveDeviceTheme, applyTheme, defaultThemeConfig } from './theme.js';

const esc = (s) => escapeHtml(String(s ?? ''));

// SVG glyph map for weather conditions (Lucide-style, monochrome).
// Module-level so renderAmbientStrip and renderWeatherSheet share one copy.
const WEATHER_GLYPHS = {
  sun:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.78A6 6 0 0 0 4 13.5 5.5 5.5 0 0 0 9.5 19h8z"/></svg>',
  rain:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0-1-7.87A6 6 0 0 0 4 11"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="16" y1="19" x2="16" y2="21"/></svg>',
  snow:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
  fog:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="3" y1="18" x2="15" y2="18"/></svg>'
};

/**
 * Render a color-button + swatch popover.
 * @param {string} selected  - hex color currently selected
 * @param {string} inputId   - id for the hidden input (callers read .value from it)
 */
export function renderColorButton(selected, inputId) {
  const palette = getColorPalette();
  const norm = (selected || '').toLowerCase();
  const swatches = palette.map(c =>
    `<button type="button" class="cpick-swatch${c.toLowerCase() === norm ? ' cpick-swatch--active' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`
  ).join('');
  return `<div class="cpick-wrap">
    <button type="button" class="cpick-btn" style="background:${selected || palette[0]}" aria-label="Choose color" aria-expanded="false"></button>
    <div class="cpick-pop" hidden>${swatches}</div>
    <input type="hidden" id="${inputId}" value="${selected || palette[0]}">
  </div>`;
}

/**
 * Wire the color button + popover created by renderColorButton.
 * @param {Element} container - the .cpick-wrap element
 * @param {function|null} onChange - called with the hex color when a swatch is picked
 */
export function initColorButton(container, onChange) {
  if (!container) return;
  const btn = container.querySelector('.cpick-btn');
  const pop = container.querySelector('.cpick-pop');
  const hidden = container.querySelector('input[type="hidden"]');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!pop.hidden) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    const rect = btn.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 330) + 'px';
    pop.style.top = '0px';
    pop.hidden = false;
    const popH = pop.getBoundingClientRect().height;
    const top = (rect.bottom + 6 + popH > window.innerHeight)
      ? Math.max(6, rect.top - popH - 6)
      : rect.bottom + 6;
    pop.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true');
  });

  pop?.addEventListener('click', (e) => {
    const swatch = e.target.closest('.cpick-swatch');
    if (!swatch) return;
    const color = swatch.dataset.color;
    pop.querySelectorAll('.cpick-swatch').forEach(s => s.classList.remove('cpick-swatch--active'));
    swatch.classList.add('cpick-swatch--active');
    btn.style.background = color;
    if (hidden) hidden.value = color;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (onChange) onChange(color);
  });

  document.addEventListener('click', function closeOnOutside(e) {
    if (!container.contains(e.target)) { pop.hidden = true; btn?.setAttribute('aria-expanded', 'false'); }
  }, { capture: true, passive: true });
}

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
  { label: 'Home',    href: 'index.html',      id: 'home' },
  { label: 'Rewards', href: 'rewards.html',    id: 'rewards' },
  { label: 'Scores',  href: 'scoreboard.html', id: 'scoreboard' },
  { label: 'Tracker', href: 'tracker.html',    id: 'tracker' }
];

/**
 * Bottom navigation. 5 items: Home, Rewards, Scores, Tracker, More.
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
    { page: 'home',       href: 'index.html',      label: 'Home',    svg: `<path d="M3 12l9-9 9 9"></path><path d="M5 10v10h14V10"></path>` },
    { page: 'kitchen',    href: 'kitchen.html',    label: 'Kitchen', svg: `<path d="M3 2v7a3 3 0 0 0 6 0V2"/><path d="M6 9v13"/><path d="M14 2v20"/><path d="M18 2c-2 2-3 4-3 7s1 4 3 4v9"/>` },
    { page: 'scoreboard', href: 'scoreboard.html', label: 'Scores',  svg: `<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M17 4h3v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V4h3"></path><path d="M7 4h10v5a5 5 0 0 1-10 0z"></path>` },
    { page: 'rewards',    href: 'rewards.html',    label: 'Rewards', svg: `<path d="M20 12v10H4V12"/><rect x="2" y="7" width="20" height="5" rx="1"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>` },
  ];
  const mainPages = new Set(items.map(i => i.page));
  const moreActive = activePage && !mainPages.has(activePage);
  const personHome = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('dr-person-home') : null;
  const linkItems = items.map(it => {
    const isActive = it.page === activePage;
    let href = it.href;
    if (personHome) {
      href = it.page === 'home'
        ? `person.html?person=${encodeURIComponent(personHome)}`
        : `${it.href}?person=${encodeURIComponent(personHome)}`;
    }
    return `<a class="bottom-nav__item${isActive ? ' is-active' : ''}" href="${href}" data-page="${it.page}">
      <svg class="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${it.svg}</svg>
      <span class="nav-item__label">${esc(it.label)}</span>
    </a>`;
  }).join('');
  const moreItem = `<button class="bottom-nav__item${moreActive ? ' is-active' : ''}" id="navMore" type="button"${options.onMoreClick ? '' : ' data-more-unbound="1"'}>
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
 * Wire the #navMore button on non-dashboard pages.
 * Shows a sheet with Admin, Calendar, Rewards, Theme options (alphabetical).
 * Call after renderNavBar() has mounted to DOM.
 * @param {HTMLElement} sheetMount - element to mount the sheet into
 * @param {object} [familyTheme] - current family theme for openDeviceThemeSheet
 */
export function initNavMore(sheetMount, getTheme, personOpts) {
  const _svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">${p}</svg>`;
  const items = [
    { id: 'admin',    label: 'Admin',    icon: _svg('<circle cx="12" cy="12" r="3"></circle><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>') },
    { id: 'calendar', label: 'Calendar', icon: _svg('<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>') },
    { id: 'tracker',  label: 'Tracker',  icon: _svg('<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>') },
    { id: 'theme',    label: 'Theme',    icon: _svg('<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>') },
  ];

  function openMoreSheet() {
    const currentPage = location.pathname.split('/').pop().replace('.html', '');
    const filtered = items.filter(item => item.id !== currentPage);
    sheetMount.innerHTML = renderBottomSheet(
      `<h3 class="sheet-section-title">More</h3>${renderOverflowMenu(filtered)}`
    );
    requestAnimationFrame(() => {
      const sheet = document.getElementById('bottomSheet');
      sheet?.classList.add('active');
      sheet?.addEventListener('click', (e) => {
        if (e.target === sheet) sheetMount.innerHTML = '';
      });
    });
    sheetMount.querySelector('.overflow-menu')?.addEventListener('click', (ev) => {
      const row = ev.target.closest('[data-item-id]');
      if (!row) return;
      sheetMount.innerHTML = '';
      const id = row.dataset.itemId;
      if (id === 'admin')    location.href = 'admin.html';
      if (id === 'calendar') location.href = 'calendar.html';
      if (id === 'tracker')  location.href = 'tracker.html';
      if (id === 'theme')    openDeviceThemeSheet(sheetMount, typeof getTheme === 'function' ? getTheme() : getTheme, undefined, personOpts);
    });
  }

  document.getElementById('navMore')?.addEventListener('click', openMoreSheet);
  document.getElementById('headerAdmin')?.addEventListener('click', () => { location.href = 'admin.html'; });
}

/**
 * Header renderer. Two call shapes:
 *
 *  STANDARD (all pages except admin):
 *    renderHeader({ title, subtitle, showBell })
 *    — font-2xl title, optional subtitle, gear button, optional bell
 *
 *  ADMIN VARIANT:
 *    renderHeader({ variant: 'admin', title, subtitle })
 *    — same structure but no bell and no gear (avoids self-referential settings button)
 */
export function renderHeader(options = {}) {
  if (options.variant === 'admin') {
    return _renderHeaderAdmin(options);
  }
  return _renderHeaderV2(options);
}

function _renderHeaderV2({ title, subtitle, showBell }) {
  const bellHtml = showBell
    ? `<button class="btn-icon" id="headerBell" aria-label="Notifications" type="button">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
           <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
         </svg>
         <span class="btn-icon__dot is-hidden" id="headerBellDot" aria-hidden="true"></span>
       </button>`
    : '';
  const adminHtml = `<button class="btn-icon" id="headerAdmin" aria-label="Settings" type="button">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 10 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>`;
  return `<header class="app-header">
    <div class="app-header__text">
      <div class="app-header__title">${esc(title)}</div>
      ${subtitle ? `<div class="app-header__subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="app-header__actions">
      ${bellHtml}
      ${adminHtml}
    </div>
  </header>`;
}

function _renderHeaderAdmin({ title, subtitle }) {
  return `<header class="app-header">
    <div class="app-header__text">
      <div class="app-header__title">${esc(title)}</div>
      ${subtitle ? `<div class="app-header__subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="app-header__actions"></div>
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
 * Render an error state into a DOM element.
 * Spec §5.19: title, optional message, optional retry callback.
 * root: HTMLElement to write into
 * options: { title, message, retry }
 */
export function renderErrorState(root, { title = 'Something went wrong', message = 'Check your connection and try again.', retry } = {}) {
  const retryBtn = retry ? `<button class="error-state__retry" type="button" id="errorStateRetry">Try again</button>` : '';
  root.innerHTML = `<div class="error-state">
    <span class="error-state__icon" aria-hidden="true">⚠️</span>
    <h3 class="error-state__title">${esc(title)}</h3>
    ${message ? `<p class="error-state__message">${esc(message)}</p>` : ''}
    ${retryBtn}
  </div>`;
  if (retry) root.querySelector('#errorStateRetry')?.addEventListener('click', retry);
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
    const bountyLabel = task.bounty.type === 'points'
      ? `+${task.bounty.amount} pt`
      : '+ Reward';
    actionTags += `<span class="task-card__tag task-card__bounty">${esc(bountyLabel)}</span>`;
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
  const iconMap = {
    overdue:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
    multiplier: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    vacation:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-1 0-2 1-3.5 2.5L9 3 7.2 4.8 13 9 9 13l-2-.5L5 11l-1 1 4 3 3 4 1-1-1.5-2 4-4 4.8 5.8z"/></svg>`,
    freeze:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    info:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };
  const icon = iconMap[variant] ?? iconMap.info;
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
  const { divider = false, trailingHtml = '', metaHtml: rawMetaHtml = '' } = options;
  // metaHtml (raw) takes precedence over meta (escaped text). Caller is responsible
  // for escaping any user-authored content inside metaHtml.
  let metaHtml = '';
  if (rawMetaHtml) {
    metaHtml = `<div class="section__meta">${rawMetaHtml}</div>`;
  } else if (meta) {
    metaHtml = `<div class="section__meta">${esc(meta)}</div>`;
  }
  const trailing = trailingHtml ? `<div class="section__head-trailing">${trailingHtml}</div>` : '';
  const dividerCls = divider ? ' section__head--divider' : '';
  return `<div class="section__head${dividerCls}">
    <div class="section__title">${esc(title)}</div>
    ${metaHtml}
    ${trailing}
  </div>`;
}

/**
 * Scoreboard leaderboard card (.card.card--score).
 * @param {Object} b  - Board entry: { person: {id, name, color}, streak: {current}, trend: 'up'|'down'|null }
 * @param {Object} active - Grade data: { earned, possible, percentage }
 * @param {Object} gd - Grade display: { grade, tier }
 * @param {number} liveBalance - Computed reward balance for this person
 * @param {string} badgeIcons - Concatenated emoji icons for earned achievements (up to 5)
 */
export function renderScoreCard(b, active, gd, liveBalance, badgeIcons) {
  const metaParts = [
    b.streak.current > 0 ? `${b.streak.current}d streak` : null,
    `${liveBalance.toLocaleString()} pts`,
  ].filter(Boolean).join(' · ');

  const badgeRow = badgeIcons
    ? `<div class="card--score__badges">${badgeIcons}</div>`
    : '';

  return `<button class="card card--score" data-person-id="${esc(b.person.id)}" type="button" style="--owner-color: ${esc(b.person.color)}">
    <div class="card__leading">
      <div class="avatar" style="--person-color: ${esc(b.person.color)}">${esc((b.person.name || '?')[0].toUpperCase())}</div>
    </div>
    <div class="card__body">
      <div class="card__title">${esc(b.person.name)}</div>
      <div class="card__meta">${esc(metaParts)}</div>
      ${badgeRow}
    </div>
    <div class="card__trailing">
      <span class="grade-badge grade-badge--${esc(gd.tier)}">${esc(gd.grade)}</span>
      <span class="card--score__pct">${esc(active.percentage)}%</span>
    </div>
  </button>`;
}

/**
 * Reward card (.card--reward).
 * Shows reward icon, name, point cost, eligibility criteria, progress bar, and optional "Get it" button.
 * @param {Object} reward - Reward object: { id, name, icon, pointCost, streakRequirement?, maxRedemptions?, expiresAt? }
 * @param {number} balance - Current point balance of the viewer
 * @param {Object} opts - Options: { showGet, streak, redemptionCount }
 *   showGet: whether to show the "Get it" button
 *   streak: current streak (for eligibility check)
 *   redemptionCount: number of times already redeemed (for stock check)
 */
export function renderRewardCard(reward, balance, opts = {}) {
  const { showGet = false, streak = 0, redemptionCount = 0 } = opts;
  const canAfford = balance >= reward.pointCost;
  const meetsStreak = streak >= (reward.streakRequirement || 0);
  const stockOk = !reward.maxRedemptions || redemptionCount < reward.maxRedemptions;
  const notExpired = !reward.expiresAt || Date.now() <= reward.expiresAt;
  const canGet = canAfford && meetsStreak && stockOk && notExpired;
  const progress = Math.min(100, Math.round((balance / Math.max(reward.pointCost, 1)) * 100));

  let badges = '';
  if (reward.streakRequirement) {
    const needed = reward.streakRequirement - streak;
    badges += `<span class="chip chip--muted">${reward.streakRequirement}-day streak${!meetsStreak ? ` · need ${needed} more` : ''}</span>`;
  }
  if (reward.maxRedemptions && stockOk) {
    badges += `<span class="chip chip--muted">${reward.maxRedemptions - redemptionCount} left</span>`;
  }
  if (!stockOk) {
    badges += `<span class="chip chip--muted">Out of stock</span>`;
  }
  if (reward.expiresAt && notExpired) {
    const daysLeft = Math.ceil((reward.expiresAt - Date.now()) / 86400000);
    if (daysLeft <= 7) badges += `<span class="chip chip--warning">Expires in ${daysLeft}d</span>`;
  }

  const costChipClass = canAfford ? 'chip--success' : 'chip--muted';
  const dimClass = canGet || !showGet ? '' : ' card--dim';
  return `<div class="card card--reward${dimClass}" data-reward-id="${esc(reward.id)}">
    <div class="card__leading">
      <span class="icon-tile">${esc(reward.icon || '🎁')}</span>
    </div>
    <div class="card__body">
      <div class="card__title">${esc(reward.name)}</div>
      ${badges ? `<div class="card__badges">${badges}</div>` : ''}
      <div class="reward-progress"><div class="reward-progress__bar" data-progress="${progress}"></div></div>
      ${!canAfford && showGet ? `<div class="card__hint">Need ${(reward.pointCost - balance).toLocaleString()} more pts</div>` : ''}
    </div>
    ${showGet ? `<div class="card__trailing card__trailing--reward">
      <span class="chip ${costChipClass}">${(reward.pointCost || 0).toLocaleString()} pts</span>
      ${canGet ? `<button class="chip reward-get-btn" data-reward-id="${esc(reward.id)}" type="button">Get it</button>` : ''}
    </div>` : ''}
  </div>`;
}

/**
 * Render a bank token (saved reward) card.
 * @param {string} tokenId      - Token ID from bank
 * @param {Object} token        - Token record { rewardType, rewardName?, rewardIcon?, acquiredAt, used?, ... }
 * @param {Object} opts         - { showUse, isAdult, approvalRequired }
 */
export function renderBankToken(tokenId, token, opts = {}) {
  const { showUse = true, isAdult = false, approvalRequired = true } = opts;
  const isFunctional = token.rewardType === 'task-skip' || token.rewardType === 'penalty-removal';
  const canUseInstant = isAdult || isFunctional || !approvalRequired;
  const typeLabel = token.rewardType === 'task-skip' ? 'Task Skip'
    : token.rewardType === 'penalty-removal' ? 'Penalty Removal'
    : esc(token.rewardName || 'Reward');
  const acquired = new Date(token.acquiredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `<div class="card card--reward" data-token-id="${esc(tokenId)}" data-reward-type="${esc(token.rewardType || 'custom')}">
    <div class="card__leading">
      <span class="icon-tile">${esc(token.rewardIcon || '🎁')}</span>
    </div>
    <div class="card__body">
      <div class="card__title">${typeLabel}</div>
      <div class="card__meta">Saved ${acquired}</div>
    </div>
    ${showUse ? `<div class="card__trailing">
      <button class="btn btn--sm btn--primary bank-use-btn"
        data-token-id="${esc(tokenId)}"
        data-reward-type="${esc(token.rewardType || 'custom')}"
        data-token-name="${esc(typeLabel)}"
        data-reward-id="${esc(token.rewardId || '')}"
        data-reward-icon="${esc(token.rewardIcon || '🎁')}"
        data-can-instant="${canUseInstant}"
        type="button">Use</button>
    </div>` : ''}
  </div>`;
}

/**
 * Render a history row (balance message entry).
 * @param {Object} entry  - Message record { title?, type, amount?, createdAt }
 * @param {string} tz     - Timezone for date formatting
 */
export function renderHistoryRow(entry, tz) {
  const isPositive = (entry.amount || 0) > 0;
  const isNegative = (entry.amount || 0) < 0;
  const amountStr = entry.amount
    ? `${isPositive ? '+' : ''}${Math.round(entry.amount).toLocaleString()} pts`
    : '';
  const amountClass = isPositive ? 'history-row__amount--pos' : isNegative ? 'history-row__amount--neg' : '';
  const date = entry.createdAt
    ? new Date(entry.createdAt).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
    : '';

  const typeIcons = {
    'redemption-request': '🎁',
    'redemption-approved': '✅',
    'redemption-denied': '❌',
    'use-request': '🎁',
    'use-approved': '✅',
    'use-denied': '❌',
    'reward-used': '🎁',
    'bonus': '⭐',
    'deduction': '📉',
    'fyi': 'ℹ️',
  };
  const icon = typeIcons[entry.type] || '•';

  return `<div class="history-row">
    <span class="history-row__icon">${icon}</span>
    <span class="history-row__label">${esc(entry.title || entry.type)}</span>
    ${amountStr ? `<span class="history-row__amount ${amountClass}">${amountStr}</span>` : ''}
    <span class="history-row__date">${date}</span>
  </div>`;
}

/**
 * Render an approval row (pending redemption/use request).
 * @param {string} msgId    - Message ID
 * @param {Object} msg      - Message record { amount, rewardId?, intent?, ... }
 * @param {Object} person   - Person object { id, name, color }
 * @param {Object} reward   - Reward object { pointCost, name, icon }
 */
export function renderApprovalRow(msgId, msg, person, reward) {
  const intent = msg.intent || 'save';
  const intentLabel = intent === 'use-now' ? 'Use Now' : 'Save for Later';
  const intentClass = intent === 'use-now' ? 'chip--accent' : 'chip--muted';
  const cost = Math.abs(msg.amount || reward?.pointCost || 0);

  return `<div class="approval-row" data-msg-id="${esc(msgId)}" data-person-id="${esc(person?.id || '')}" data-reward-id="${esc(msg.rewardId || '')}" data-intent="${esc(intent)}">
    <div class="approval-row__who">
      <span class="avatar avatar--xs" style="--person-color:${esc(person?.color || '#888')}">${esc((person?.name || '?')[0].toUpperCase())}</span>
      <span class="approval-row__name">${esc(person?.name || '?')}</span>
    </div>
    <div class="approval-row__reward">
      <span>${esc(reward?.icon || '🎁')}</span>
      <span>${esc(reward?.name || msg.title || 'Reward')}</span>
      <span class="chip ${intentClass}">${intentLabel}</span>
    </div>
    <div class="approval-row__cost">${cost.toLocaleString()} pts</div>
    <div class="approval-row__actions">
      <button class="btn btn--sm btn--primary approval-approve-btn" data-msg-id="${esc(msgId)}" type="button">Approve</button>
      <button class="btn btn--sm btn--danger approval-deny-btn" data-msg-id="${esc(msgId)}" type="button">Deny</button>
    </div>
  </div>`;
}

/**
 * Bottom sheet body for the tracker filter chip.
 * Renders category chip group + status chip group + Clear/Apply actions.
 * Mount inside renderBottomSheet(); bind #filterClear and #filterApply after mount.
 * @param {Object} cats          - Categories object from Firebase { [key]: { name|label, icon? } }
 * @param {string|null} activeCategory  - Currently selected category key, or null for All
 * @param {string|null} activeStatus    - Currently selected status value, or null for All
 */
export function renderTrackerFilterSheet(cats, activeCategory, activeStatus) {
  const catEntries = Object.entries(cats || {});
  const statusOptions = [
    { value: 'done',     label: 'Done' },
    { value: 'late',     label: 'Done Late' },
    { value: 'overdue',  label: 'Overdue' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'cooldown', label: 'Cooldown' },
    { value: 'skipped',  label: 'Skipped' },
  ];

  const catChips = [
    `<button class="chip chip--selectable${!activeCategory ? ' chip--active' : ''}" data-filter-cat="" type="button">All</button>`,
    ...catEntries.map(([key, cat]) => {
      const label = ((cat.icon || '') + ' ' + (cat.label || cat.name || key)).trim();
      return `<button class="chip chip--selectable${activeCategory === key ? ' chip--active' : ''}" data-filter-cat="${esc(key)}" type="button">${esc(label)}</button>`;
    }),
  ].join('');

  const statusChips = [
    `<button class="chip chip--selectable${!activeStatus ? ' chip--active' : ''}" data-filter-status="" type="button">All</button>`,
    ...statusOptions.map(opt =>
      `<button class="chip chip--selectable${activeStatus === opt.value ? ' chip--active' : ''}" data-filter-status="${esc(opt.value)}" type="button">${esc(opt.label)}</button>`
    ),
  ].join('');

  return `<div class="sheet-body">
    <div class="sheet-label sheet-label--spaced">Category</div>
    <div class="chip-group">${catChips}</div>
    <div class="sheet-label sheet-label--spaced">Status</div>
    <div class="chip-group">${statusChips}</div>
    <div class="sheet-actions">
      <button class="btn btn--ghost" id="filterClear" type="button">Clear all</button>
      <button class="btn btn--primary" id="filterApply" type="button">Apply</button>
    </div>
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

  // All-day: solid or gradient blend (vivid) / soft tint (non-vivid)
  const bg = eventAllDayBg(event, people);
  const barColor = event.color || '#5b7fd6';
  return `<div class="event-pill${isMulti ? ' event-pill--multi' : ''}" data-bg-color="${esc(bg)}" data-event-bg="${esc(barColor)}">
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

function ef2fmt12(t) {
  if (!t) return '';
  const [h, min] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

function ef2TimeDisplay(start, end) {
  if (!start) return 'Set time';
  if (!end) return ef2fmt12(start);
  return `${ef2fmt12(start)} → ${ef2fmt12(end)}`;
}

function ef2ParseTime(hhmm) {
  if (!hhmm) return { hour: 9, min: 0, ampm: 'AM' };
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return { hour, min: m, ampm };
}

function ef2TimeToText(hhmm) {
  if (!hhmm) return '';
  const { hour, min } = ef2ParseTime(hhmm);
  return `${hour}:${String(min).padStart(2, '0')}`;
}

function ef2RepeatLabel(rule) {
  if (!rule || !rule.type || rule.type === 'none') return '+ Repeat';
  if (rule.type === 'daily') return 'Daily';
  if (rule.type === 'weekly') {
    const days = (rule.days || []).join(' · ');
    return `Weekly${days ? ' · ' + days : ''}`;
  }
  if (rule.type === 'monthly') return 'Monthly';
  if (rule.type === 'yearly') return 'Yearly';
  if (rule.type === 'custom') return `Every ${rule.every || 1} ${rule.unit || 'weeks'}`;
  return '+ Repeat';
}

/**
 * Render the new event creation/edit form (v2).
 * options: { event?, eventId?, people, dateKey, mode: 'create'|'edit' }
 * @caller After mounting, call: taskSheetMount.querySelectorAll('.ef2-person-chip[data-person-color]').forEach(c => c.style.setProperty('--chip-color', c.dataset.personColor));
 */
export function renderEventForm({ event = {}, eventId = null, people = [], dateKey = '', mode = 'create' }) {
  const isEdit = mode === 'edit';
  const saveLabel = isEdit ? 'Save Changes' : 'Add Event';
  const dateVal = event.date || dateKey;
  const dateDisplay = dateVal ? formatDateShort(dateVal) : 'Set date';
  const startTime = event.startTime || '09:00';
  const endTime = event.endTime || '10:00';
  const timeDisplay = event.allDay ? 'All day' : ef2TimeDisplay(event.startTime, event.endTime);

  const primaryId = (event.people || [])[0] || null;
  const attendingIds = new Set((event.people || []).slice(1));

  const personChipsHtml = people.map(p => {
    const state = p.id === primaryId ? 'primary' : (attendingIds.has(p.id) ? 'attending' : '');
    return `<button class="ef2-person-chip" data-person-id="${esc(p.id)}" data-person-color="${esc(p.color)}"${state ? ` data-state="${state}"` : ''} type="button">${esc(p.name)}</button>`;
  }).join('');

  const WAND_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2L19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2L11 5"/></svg>`;
  const PHOTO_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  const ICAL_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const CLOSE_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const SAVE_SVG   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const DELETE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

  const importIcons = isEdit ? '' : `
    <button class="ef2-icon-btn" id="ef2_wand" type="button" aria-label="Parse title with AI">${WAND_SVG}</button>
    <button class="ef2-icon-btn" id="ef2_photoBtn" type="button" aria-label="Import from photo">${PHOTO_SVG}</button>
    <input type="file" accept="image/*" capture="environment" id="ef2_photoCamera" hidden>
    <input type="file" accept="image/*" id="ef2_photoGallery" hidden>
    <input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif" id="ef2_photoFiles" hidden>
    <button class="ef2-icon-btn" id="ef2_ical" type="button" aria-label="Import from calendar URL">${ICAL_SVG}</button>`;

  const notesOpen = (event.notes || event.notesOpen) ? ' is-open' : '';
  const locOpen = (event.location || event.locOpen) ? ' is-open' : '';
  const repeatLabel = ef2RepeatLabel(event.repeat);
  const repeatActive = (event.repeat && event.repeat.type && event.repeat.type !== 'none') ? ' is-active' : '';

  return `<div class="ef2-form">
  <div class="sheet__header">
    <h2 class="sheet__title">${isEdit ? 'Edit Event' : 'New Event'}</h2>
    <div class="rf-header-actions">
      ${isEdit ? `<button class="ef2-icon-btn rf-delete-btn" id="ef2_delete" type="button" aria-label="Delete event" title="Delete event">${DELETE_SVG}</button>` : ''}
      <button class="ef2-icon-btn rf-save-btn" id="ef2_save" type="button" aria-label="${saveLabel}" title="${saveLabel}">${SAVE_SVG}</button>
      <button class="ef2-icon-btn" id="ef2_close" type="button" aria-label="Close">${CLOSE_SVG}</button>
    </div>
  </div>

  <div class="ef2-title-row">
    <input class="ef2-title-input" id="ef2_name" type="text" placeholder="What's happening?" value="${esc(event.name || '')}" autocomplete="off">
    ${importIcons}
  </div>

  <div class="ef2-import-feedback">
    <div class="ef2-import-loading" id="ef2_importLoading">
      <div class="spinner spinner--sm"></div>
      <span id="ef2_importMsg">Reading…</span>
    </div>
    <div class="ef2-import-error" id="ef2_importError"></div>
  </div>

  <div class="ef2-divider"></div>

  <div class="ef2-datetime-section">
    <div class="tf-details-row">
      <button class="tf-detail-chip" id="ef2_dateBtn" type="button">
        <span id="ef2_dateDisplay">${esc(dateDisplay)}</span>
      </button>
      <button class="tf-detail-chip${event.allDay ? ' ef2-hidden' : ''}" id="ef2_timeBtn" type="button">
        <span id="ef2_timeDisplay">${esc(timeDisplay)}</span>
      </button>
    </div>
    <div class="ef2-picker-wrap" id="ef2_datePicker">
      <input type="date" id="ef2_date" value="${esc(dateVal)}">
    </div>
    <div class="ef2-picker-wrap${event.allDay ? ' ef2-hidden' : ''}" id="ef2_timePicker">
      <div class="ef2-time-inputs">
        <div class="ef2-time-entry">
          <input type="text" class="ef2-time-text" id="ef2_startText" inputmode="numeric" maxlength="5" placeholder="9:00" value="${ef2TimeToText(startTime)}">
          <button class="ef2-ampm-btn" id="ef2_startAmPm" data-ampm="${ef2ParseTime(startTime).ampm}" type="button">${ef2ParseTime(startTime).ampm}</button>
        </div>
        <span class="ef2-time-arrow" aria-hidden="true">→</span>
        <div class="ef2-time-entry">
          <input type="text" class="ef2-time-text" id="ef2_endText" inputmode="numeric" maxlength="5" placeholder="10:00" value="${ef2TimeToText(endTime)}">
          <button class="ef2-ampm-btn" id="ef2_endAmPm" data-ampm="${ef2ParseTime(endTime).ampm}" type="button">${ef2ParseTime(endTime).ampm}</button>
        </div>
      </div>
    </div>
  </div>

  <div class="ef2-divider"></div>

  <div class="ef2-for-section" id="ef2_people">
    <span class="ef2-section-label">For</span>
    <div class="ef2-person-chips">${personChipsHtml}</div>
  </div>

  <div class="ef2-divider"></div>

  <div class="ef2-secondary-row">
    <button class="ef2-add-chip${event.allDay ? ' is-active' : ''}" id="ef2_allDay" type="button">All day</button>
    <button class="ef2-add-chip${notesOpen ? ' is-active' : ''}" id="ef2_notesChip" type="button">+ Notes</button>
    <button class="ef2-add-chip${locOpen ? ' is-active' : ''}" id="ef2_locChip" type="button">+ Location</button>
    <button class="ef2-add-chip${repeatActive}" id="ef2_repeatChip" type="button">${esc(repeatLabel)}</button>
  </div>

  <div class="ef2-field-reveal${notesOpen}" id="ef2_notesReveal">
    <div class="ef2-field-reveal-inner">
      <textarea id="ef2_notes" rows="3" placeholder="Notes…">${esc(event.notes || '')}</textarea>
      <button class="ef2-field-close" id="ef2_notesClose" type="button" aria-label="Close notes">${CLOSE_SVG}</button>
    </div>
  </div>

  <div class="ef2-field-reveal${locOpen}" id="ef2_locReveal">
    <div class="ef2-field-reveal-inner">
      <input type="text" id="ef2_location" placeholder="Location" value="${esc(event.location || '')}">
      <button class="ef2-field-close" id="ef2_locClose" type="button" aria-label="Close location">${CLOSE_SVG}</button>
    </div>
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
    <div class="ef2-footer">
      <button class="btn btn--secondary" id="eventEdit" data-event-id="${eventId}" type="button">Edit</button>
      <button class="btn btn--danger btn--sm" id="eventDelete" data-event-id="${eventId}" type="button">Delete</button>
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

  const DS_CLOSE    = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const DS_CHEVRON  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
  const DS_EDIT     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const DS_MOVE     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const DS_SKIP     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`;
  const DS_DELEGATE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const DS_CAL_SM   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

  const catIcon    = category?.icon || '';
  const ownerColor = person?.color || 'var(--text-faint)';
  const diffLabel  = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[task.difficulty] || 'Medium';
  const rotLabel   = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', once: 'One-Time' }[entry.rotationType] || '';
  const todLabel   = { am: 'Morning', pm: 'Afternoon', anytime: 'Anytime' }[entry.timeOfDay] || '';
  const sliderVal  = currentOverride ?? 100;
  const hasActions = showDelegate || showMove || showEdit;

  let html = `<div class="task-detail-sheet">`;

  // ── Header ───────────────────────────────────────────────
  html += `<div class="sheet__header">
    <h2 class="sheet__title" data-owner-color="${esc(ownerColor)}">${esc(task.name)}${catIcon ? ' ' + catIcon : ''}</h2>
    <button class="ef2-icon-btn" id="dsClose" type="button" aria-label="Close">${DS_CLOSE}</button>
  </div>`;

  // ── Meta chips ───────────────────────────────────────────
  html += `<div class="task-detail__chips">`;
  if (person) html += `<span class="chip" data-person-color="${esc(person.color)}">${esc(person.name)}</span>`;
  if (rotLabel) html += `<span class="chip">${rotLabel}</span>`;
  html += `<span class="chip">${diffLabel}</span>`;
  if (todLabel) html += `<span class="chip">${todLabel}</span>`;
  if (task.eventTime) html += `<span class="chip">${formatEventTime(task.eventTime)}</span>`;
  if (task.estMin) html += `<span class="chip">${task.estMin}m</span>`;
  html += `</div>`;

  // ── Source info ──────────────────────────────────────────
  if (entry.delegatedFromName || entry.movedFromDate) {
    html += `<div class="task-detail__source-row">`;
    if (entry.delegatedFromName) html += `<span class="task-detail__source-item">↪ Delegated from <strong>${esc(entry.delegatedFromName)}</strong></span>`;
    if (entry.movedFromDate) html += `<span class="task-detail__source-item">${DS_CAL_SM} Moved from <strong>${formatMovedDate(entry.movedFromDate).replace('from ', '')}</strong></span>`;
    html += `</div>`;
  }

  html += `<div class="ef2-divider"></div>`;

  // ── Event notes ──────────────────────────────────────────
  if (isEvent) {
    const noteText = entry.notes || '';
    if (readOnly) {
      if (noteText) {
        html += `<div class="task-detail__notes">
          <span class="ef2-section-label">Notes</span>
          <div class="task-detail__notes-text">${esc(noteText)}</div>
        </div>`;
      }
    } else {
      html += `<div class="task-detail__notes">
        <span class="ef2-section-label">Notes</span>
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

  // ── Action list (complete + edit/move/skip/delegate) ─────
  const DS_CHECK  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const DS_UNDO   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
  const isLateEligible = isPastDate && !completed && !isEvent && !task.exempt;
  if (hasActions) {
    html += `<div class="ef2-divider"></div><div class="task-detail__action-list">`;
    if (showEdit)     html += `<button class="task-detail__action-row" id="sheetEdit" data-task-id="${entry.taskId}" type="button">${DS_EDIT}<span>Edit task</span>${DS_CHEVRON}</button>`;
    if (showMove)     html += `<button class="task-detail__action-row" id="sheetMove" type="button">${DS_MOVE}<span>Move to date</span>${DS_CHEVRON}</button>`;
    if (showMove)     html += `<button class="task-detail__action-row task-detail__action-row--muted" id="moveSkip" type="button">${DS_SKIP}<span>Skip</span>${DS_CHEVRON}</button>`;
    if (showDelegate) html += `<button class="task-detail__action-row" id="sheetDelegate" type="button">${DS_DELEGATE}<span>Delegate</span>${DS_CHEVRON}</button>`;
    html += `</div>`;
  }

  // ── Delegate panel ───────────────────────────────────────
  if (showDelegate && people) {
    const otherPeople = people.filter(p => p.id !== entry.ownerId);
    html += `<div class="task-detail__delegate-panel is-hidden" id="delegatePanel">
      <div class="ef2-divider"></div>
      <div class="task-detail__delegate-header">
        <span class="ef2-section-label">Reassign to</span>
        ${showMove ? `<button class="task-detail__move-pill" id="delegateMoveToggle" type="button">Move too</button>` : ''}
      </div>
      <div class="ef2-person-chips">
        ${otherPeople.map(p => `<button class="ef2-person-chip" data-person-id="${p.id}" data-person-color="${esc(p.color)}" type="button">${esc(p.name)}</button>`).join('')}
      </div>
      <input type="date" id="delegateMoveDatePicker" class="task-detail__date-input task-detail__date-input--hidden">
    </div>`;
  }

  if (showMove) {
    html += `<input type="date" id="moveDatePicker" class="task-detail__date-input task-detail__date-input--hidden">`;
  }

  // ── Points slider ────────────────────────────────────────
  if (points) {
    const min = sliderMin ?? 0;
    const max = sliderMax ?? 150;
    const earnedPts = Math.round(points.possible * (sliderVal / 100));
    html += `<div class="task-detail__slider">
      <div class="ef2-divider"></div>
      <div class="task-detail__slider-header">
        <span class="ef2-section-label">Points Override</span>
        <span class="task-detail__slider-value task-detail__slider-value--numeric" id="sliderValueLabel">${sliderVal}% (${earnedPts}pt)</span>
      </div>
      <div class="task-detail__slider-row">
        <input type="range" class="slider" id="pointsSlider" min="${min}" max="${max}" value="${sliderVal}" step="5" data-entry-key="${entryKey}" data-base-pts="${points.possible}">
        ${sliderVal !== 100 ? `<button class="btn btn--secondary btn--sm" id="sliderReset" type="button">Reset</button>` : ''}
      </div>
      ${gradePreview ? `<div class="task-detail__grade-preview" id="gradePreview">Grade: ${gradePreview}</div>` : ''}
    </div>`;
  }

  // ── Complete footer ──────────────────────────────────────
  if (!readOnly && !isEvent && !task.exempt) {
    if (isLateEligible) {
      html += `<div class="task-detail__complete-footer">
        <button class="task-detail__complete-btn task-detail__complete-btn--success" id="sheetCompleteNoPenalty" type="button">${DS_CHECK} Complete (full credit)</button>
        <button class="task-detail__complete-btn task-detail__complete-btn--muted" id="sheetToggleComplete" type="button">${DS_CHECK} Complete (late)</button>
      </div>`;
    } else if (completed) {
      html += `<div class="task-detail__complete-footer">
        <button class="task-detail__complete-btn task-detail__complete-btn--muted" id="sheetToggleComplete" type="button">${DS_UNDO} Mark incomplete</button>
      </div>`;
    } else {
      html += `<div class="task-detail__complete-footer">
        <button class="task-detail__complete-btn task-detail__complete-btn--success" id="sheetToggleComplete" type="button">${DS_CHECK} Mark complete</button>
      </div>`;
    }
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

const CLOSE_SVG_TF  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const SAVE_SVG_TF   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
const DELETE_SVG_TF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

export function renderTaskForm({ task = {}, taskId = null, mode = 'create', categories = [], people = [] }) {
  const isEdit = mode === 'edit';
  const rotation = task.rotation || 'daily';
  const difficulty = task.difficulty || 'medium';
  const estMin = task.estMin ?? 10;
  const timeOfDay = task.timeOfDay || 'anytime';
  const defaultCat = categories.find(c => c.isDefault);
  const catKey = task.category || defaultCat?.key || '';
  const catObj = categories.find(c => c.key === catKey);
  const selectedOwners = task.owners || [];
  const assignMode = task.ownerAssignmentMode || 'rotate';

  const DIFF_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const TOD_LABELS  = { am: 'Morning', pm: 'Afternoon', anytime: 'Anytime', both: 'Both' };
  const diffLabel = DIFF_LABELS[difficulty] || 'Medium';
  const todLabel  = TOD_LABELS[timeOfDay] || 'Anytime';
  const durLabel  = `${estMin} min`;
  const catLabel  = catObj ? `${catObj.icon || ''} ${catObj.label}`.trim() : 'Category';

  const showAssign = selectedOwners.length >= 2;
  const showCooldown = rotation === 'weekly' || rotation === 'monthly';
  const cdDefault = rotation === 'weekly' ? 3 : rotation === 'monthly' ? 7 : 0;
  const cooldownVal = task.cooldownDays ?? '';
  const exempt = !!task.exempt;
  const notesOpen = task.notesOpen ? ' is-open' : '';
  const optionsOpen = task.optionsOpen ? ' is-open' : '';
  const optChipLabel = '+ Options';
  const optChipActive = (task.optionsOpen || task.cooldownDays || task.exempt) ? ' is-active' : '';
  const notesChipActive = (task.notesOpen || task.notes) ? ' is-active' : '';

  const personChipsHtml = people.map(p => {
    const state = selectedOwners.includes(p.id) ? 'primary' : '';
    return `<button class="ef2-person-chip" data-person-id="${esc(p.id)}" data-person-color="${esc(p.color)}"${state ? ` data-state="${state}"` : ''} type="button">${esc(p.name)}</button>`;
  }).join('');

  const dayOptions = [['', 'Any day'], ['1','Mon'], ['2','Tue'], ['3','Wed'], ['4','Thu'], ['5','Fri'], ['6','Sat'], ['0','Sun']]
    .map(([val, label]) => {
      const sel = val === '' ? task.dedicatedDay == null : task.dedicatedDay === parseInt(val, 10);
      return `<option value="${val}"${sel ? ' selected' : ''}>${label}</option>`;
    }).join('');

  return `<div class="tf-form">
  <div class="sheet__header">
    <h2 class="sheet__title">${isEdit ? 'Edit Task' : 'New Task'}</h2>
    <div class="rf-header-actions">
      ${isEdit ? `<button class="ef2-icon-btn rf-delete-btn" id="tf_delete" type="button" aria-label="Delete task" title="Delete task">${DELETE_SVG_TF}</button>` : ''}
      <button class="ef2-icon-btn rf-save-btn" id="tf_save" type="button"${taskId ? ` data-task-id="${taskId}"` : ''} aria-label="${isEdit ? 'Save changes' : 'Create task'}" title="${isEdit ? 'Save changes' : 'Create task'}">${SAVE_SVG_TF}</button>
      <button class="ef2-icon-btn" id="tf_close" type="button" aria-label="Close">${CLOSE_SVG_TF}</button>
    </div>
  </div>

  <div class="tf-title-row">
    <input class="tf-title-input" id="tf_name" type="text" placeholder="What's the task?" value="${esc(task.name || '')}" autocomplete="off">
  </div>

  <div class="ef2-divider"></div>

  <div class="ef2-for-section" id="tf_people">
    <span class="ef2-section-label">For</span>
    <div class="ef2-person-chips">${personChipsHtml}</div>
    <div class="tf-assign-row${showAssign ? '' : ' is-hidden'}" id="tf_assignRow">
      <button class="tf-assign-pill${assignMode === 'rotate' ? ' tf-assign-pill--active' : ''}" data-mode="rotate" type="button">Rotate</button>
      <button class="tf-assign-pill${(assignMode === 'everyone' || assignMode === 'duplicate') ? ' tf-assign-pill--active' : ''}" data-mode="everyone" type="button">Everyone</button>
    </div>
  </div>

  <div class="ef2-divider"></div>

  <div class="tf-rotation-section">
    <div class="tf-rotation-pills" id="tf_rotation">
      <button class="tf-rot-pill${rotation === 'daily'   ? ' tf-rot-pill--active' : ''}" data-rot="daily"   type="button">Daily</button>
      <button class="tf-rot-pill${rotation === 'weekly'  ? ' tf-rot-pill--active' : ''}" data-rot="weekly"  type="button">Weekly</button>
      <button class="tf-rot-pill${rotation === 'monthly' ? ' tf-rot-pill--active' : ''}" data-rot="monthly" type="button">Monthly</button>
      <button class="tf-rot-pill${rotation === 'once'    ? ' tf-rot-pill--active' : ''}" data-rot="once"    type="button">One-Time</button>
    </div>
    <div class="tf-rot-reveal${rotation !== 'once' ? ' is-open' : ''}" id="tf_weeklyReveal">
      <select id="tf_daySelect">${dayOptions}</select>
    </div>
    <div class="tf-rot-reveal${rotation === 'once' ? ' is-open' : ''}" id="tf_onceReveal">
      <input type="date" id="tf_onceDate" value="${esc(task.dedicatedDate || '')}">
    </div>
  </div>

  <div class="ef2-divider"></div>

  <div class="tf-details-row">
    <button class="tf-detail-chip" id="tf_diffChip"  data-field="diff" data-val="${esc(difficulty)}"  type="button">${esc(diffLabel)}</button>
    <button class="tf-detail-chip" id="tf_durChip"   data-field="dur"  data-val="${esc(estMin)}"      type="button">${esc(durLabel)}</button>
    <button class="tf-detail-chip" id="tf_todChip"   data-field="tod"  data-val="${esc(timeOfDay)}"   type="button">${esc(todLabel)}</button>
    <button class="tf-detail-chip" id="tf_catChip"   data-field="cat"  data-val="${esc(catKey)}"      type="button">${esc(catLabel)}</button>
  </div>

  <div class="ef2-divider"></div>

  <div class="ef2-secondary-row">
    <button class="ef2-add-chip${notesChipActive}"   id="tf_notesChip"   type="button">+ Notes</button>
    <button class="ef2-add-chip${optChipActive}"     id="tf_optionsChip" data-show-cd="${showCooldown ? '1' : ''}" type="button">${optChipLabel}</button>
  </div>

  <div class="ef2-field-reveal${notesOpen}" id="tf_notesReveal">
    <div class="ef2-field-reveal-inner">
      <textarea id="tf_notes" rows="3" placeholder="Notes…">${esc(task.notes || '')}</textarea>
      <button class="ef2-field-close" id="tf_notesClose" type="button" aria-label="Close notes">${CLOSE_SVG_TF}</button>
    </div>
  </div>

  <div class="ef2-field-reveal${optionsOpen}" id="tf_optionsReveal">
    <div class="tf-options-inner">
      <div class="tf-options-row${showCooldown ? '' : ' is-hidden'}" id="tf_cooldownRow">
        <span class="tf-options-label">Cooldown</span>
        <input class="tf-cooldown-input" type="number" id="tf_cooldown" min="0" max="60" value="${esc(cooldownVal)}" placeholder="${cdDefault || ''}">
        <span class="tf-options-unit">days</span>
      </div>
      <div class="tf-options-row">
        <span class="tf-options-label">Exempt from scoring</span>
        <button class="tf-exempt-chip${exempt ? ' is-active' : ''}" id="tf_exempt" type="button">${exempt ? 'On' : 'Off'}</button>
      </div>
    </div>
  </div>

</div>`;
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
      ${renderColorButton(currentAccent, 'dt_accentPicker')}
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

  // Accent color button (also sets person color when on a person page)
  initColorButton(mountEl.querySelector('#dt_accentPicker')?.closest('.cpick-wrap'), async (color) => {
    activeAccent = color;
    if (!activePreset) {
      const fam = familyTheme || defaultThemeConfig();
      activePreset = fam.preset;
      mountEl.querySelectorAll('.dt-theme-btn').forEach(b => {
        b.classList.toggle('dt-theme-btn--active', b.dataset.preset === activePreset);
      });
    }
    if (personOpts) personOpts.person.color = color;
    applyAndSave();
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
 * Generic loading skeleton dispatcher.
 * variant: 'dashboard' | 'list' | 'card-grid'
 * Falls back to 'dashboard' for unknown variants.
 */
export function renderSkeleton(variant = 'dashboard') {
  if (variant === 'list') {
    const row = `<div class="skeleton-list-row">
      <div class="skeleton skeleton-list-row__icon"></div>
      <div class="skeleton-list-row__bars">
        <div class="skeleton skeleton-list-row__bar skeleton-list-row__bar--title"></div>
        <div class="skeleton skeleton-list-row__bar skeleton-list-row__bar--meta"></div>
      </div>
      <div class="skeleton skeleton-list-row__action"></div>
    </div>`;
    return `<div>${row}${row}${row}${row}${row}</div>`;
  }
  if (variant === 'card-grid') {
    const card = `<div class="skeleton-card-block">
      <div class="skeleton skeleton-card-block__icon"></div>
      <div class="skeleton skeleton-card-block__bar skeleton-card-block__bar--title"></div>
      <div class="skeleton skeleton-card-block__bar skeleton-card-block__bar--sub"></div>
      <div class="skeleton skeleton-card-block__btn"></div>
    </div>`;
    return `<div>${card}${card}${card}</div>`;
  }
  return renderDashboardSkeleton();
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

  return onConnectionChange((connected) => {
    if (showConnectionDot) {
      const existing = document.querySelector('.connection-dot');
      const dotHtml = renderConnectionStatus(connected);
      if (existing) existing.outerHTML = dotHtml;
      else document.querySelector('.app-header__actions')?.insertAdjacentHTML('afterbegin', dotHtml);
    }

    if (timer) clearTimeout(timer);
    if (!connected) {
      mount.innerHTML = renderOfflineBanner('Working offline — changes will sync');
      timer = setTimeout(() => { mount.innerHTML = ''; }, 3000);
    } else {
      mount.innerHTML = '';
    }
  });
}

/**
 * Render the notification bell dropdown content for parents.
 */
export function renderBellDropdown({ pendingRequests = [], recentActivity = [], rewards = {}, people = [], kidBankSummary = [] }) {
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
    const icon = item.type === 'fyi' ? '🛍️' :
                 item.type === 'bonus' ? '➕' :
                 item.type === 'deduction' ? '➖' :
                 item.type === 'redemption-approved' ? '✅' :
                 item.type === 'redemption-denied' ? '❌' :
                 item.type === 'use-approved' ? '✅' :
                 item.type === 'use-denied' ? '❌' :
                 item.type === 'reward-used' ? '🎉' : '📋';
    const canRevoke = item.type === 'fyi' && item.bankTokenId;
    html += `<div class="bell-dropdown__item">
      <span class="bell-dropdown__icon">${icon}</span>
      <div class="bell-dropdown__body">
        <div class="bell-dropdown__item-title">${esc(item.title)}</div>
        <div class="bell-dropdown__item-subtitle">${personName(item.personId)} &middot; ${item.amount > 0 ? '+' : ''}${item.amount} pts</div>
        ${canRevoke ? `<div class="bell-dropdown__item-actions">
          <button class="btn btn--sm btn--ghost bell-revoke" data-msg-id="${esc(item.id)}" data-person-id="${esc(item.personId)}" type="button">Revoke</button>
        </div>` : ''}
      </div>
    </div>`;
  }

  // Kids' bank summary — shows active saved tokens per child
  if (kidBankSummary.length > 0) {
    html += `<div class="bell-dropdown__section-head">Kids' Banks</div>`;
    for (const kid of kidBankSummary) {
      if (kid.activeCount === 0) continue;
      const names = kid.tokens.map(t => esc(t.rewardName || 'Reward')).join(', ');
      html += `<div class="bell-dropdown__item bell-dropdown__item--bank">
        <span class="bell-dropdown__icon">🏦</span>
        <div class="bell-dropdown__body">
          <div class="bell-dropdown__item-title">${esc(kid.name)} &middot; ${kid.activeCount} saved</div>
          <div class="bell-dropdown__item-subtitle">${names}</div>
        </div>
      </div>`;
    }
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
 * @param {Array} people - people array
 * @param {string|null} preselectedPersonId
 * @param {object} rewards - rewards object (optional, for reward send)
 */
export function renderSendMessageSheet(people, preselectedPersonId = null, rewards = {}) {
  const positiveOpts = POSITIVE_TEMPLATES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const negativeOpts = NEGATIVE_TEMPLATES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const activeRewards = Object.entries(rewards)
    .filter(([, r]) => r.status !== 'archived')
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
  const rewardOpts = activeRewards.map(([id, r]) =>
    `<option value="${esc(id)}">${esc(r.icon || '🎁')} ${esc(r.name)} (${r.pointCost ?? 0} pts)</option>`
  ).join('');

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
      <button class="segmented-btn msg-type-btn msg-type-btn--active" data-type="bonus" type="button">+ Bonus</button>
      <button class="segmented-btn msg-type-btn" data-type="deduction" type="button">− Deduction</button>
    </div>

    <label class="form-label sheet-label--spaced">Title</label>
    <input type="text" id="msg_customTitle" class="form-input" placeholder="Enter message title" autocomplete="off">
    <select class="form-input mt-xs" id="msg_templateSelect">
      <option value="">— Or pick a template —</option>
      ${positiveOpts}
    </select>

    <label class="form-label sheet-label--spaced">Personal note (optional)</label>
    <textarea id="msg_body" class="form-input" rows="2" placeholder="Great job helping your sister!"></textarea>

    <label class="form-label sheet-label--spaced">Points</label>
    <input type="number" id="msg_points" class="form-input input--narrow" value="25" min="0">

    ${activeRewards.length > 0 ? `
    <label class="form-label sheet-label--spaced">Reward (optional)</label>
    <select class="form-input" id="msg_rewardSelect">
      <option value="">None</option>
      ${rewardOpts}
    </select>` : ''}

    <div class="ef2-footer">
      <button class="btn btn--secondary" id="msg_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="msg_send" type="button">Send</button>
    </div>
  `);
}

/**
 * Bind event listeners for the send message sheet.
 */
export function bindSendMessageSheet(mount, writeMessageFn, approverName, writeBankTokenFn, getRewardsFn) {
  const approver = approverName || 'Parent';
  const sheet = mount.querySelector('.bottom-sheet');
  if (!sheet) return;

  let msgType = 'bonus';

  // Person chips
  for (const chip of sheet.querySelectorAll('#msg_people .chip--selectable')) {
    chip.addEventListener('click', () => chip.classList.toggle('chip--active'));
  }

  // Type toggle — swap template options and default points
  for (const btn of sheet.querySelectorAll('.msg-type-btn')) {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('.msg-type-btn').forEach(b => b.classList.remove('msg-type-btn--active'));
      btn.classList.add('msg-type-btn--active');
      msgType = btn.dataset.type;
      const sel = sheet.querySelector('#msg_templateSelect');
      if (sel) {
        const templates = msgType === 'bonus' ? POSITIVE_TEMPLATES : NEGATIVE_TEMPLATES;
        sel.innerHTML = `<option value="">— Or pick a template —</option>` +
          templates.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        sel.value = '';
      }
      sheet.querySelector('#msg_points').value = msgType === 'bonus' ? 25 : 15;
    });
  }

  // Template select → populate title input
  sheet.querySelector('#msg_templateSelect')?.addEventListener('change', (e) => {
    if (e.target.value) {
      const titleInput = sheet.querySelector('#msg_customTitle');
      if (titleInput) { titleInput.value = e.target.value; titleInput.focus(); }
    }
  });

  // Cancel / overlay dismiss
  sheet.querySelector('#msg_cancel')?.addEventListener('click', () => { mount.innerHTML = ''; });
  const overlay = mount.querySelector('.bottom-sheet-overlay');
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) mount.innerHTML = ''; });

  // Send
  sheet.querySelector('#msg_send')?.addEventListener('click', async () => {
    const personIds = [...sheet.querySelectorAll('#msg_people .chip--active')].map(c => c.dataset.personId);
    if (personIds.length === 0) { sheet.querySelector('#msg_people .chip--selectable')?.focus(); return; }

    const title = sheet.querySelector('#msg_customTitle')?.value.trim();
    if (!title) { sheet.querySelector('#msg_customTitle')?.focus(); return; }

    const points = parseInt(sheet.querySelector('#msg_points')?.value || '0', 10);
    const body = sheet.querySelector('#msg_body')?.value.trim() || null;
    const amount = msgType === 'deduction' ? -(points || 0) : (points || 0);
    const rewardId = sheet.querySelector('#msg_rewardSelect')?.value || null;
    const rewards = getRewardsFn ? getRewardsFn() : {};
    const reward = rewardId ? rewards[rewardId] : null;

    if (amount === 0 && !reward) {
      showToast('Add points or a reward to send.');
      return;
    }

    for (const pid of personIds) {
      if (amount !== 0) {
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
      if (reward && writeBankTokenFn) {
        await writeBankTokenFn(pid, {
          rewardType: reward.rewardType || 'custom',
          rewardId,
          rewardName: reward.name || 'Reward',
          rewardIcon: reward.icon || '🎁',
          acquiredAt: Date.now(),
          used: false,
          usedAt: null,
          targetEntryKey: null
        });
        await writeMessageFn(pid, {
          type: 'redemption-approved',
          title: `${reward.icon || '🎁'} ${reward.name || 'Reward'} sent!`,
          body: null,
          amount: 0,
          rewardId,
          entryKey: null,
          seen: false,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          createdBy: approver
        });
      }
    }

    mount.innerHTML = '';
    showToast('Message sent!');
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

    <div class="ef2-footer">
      <button class="btn btn--secondary" id="bd_cancel" type="button">Cancel</button>
      <button class="btn btn--primary" id="bd_save" type="button">Set Bonus Day</button>
    </div>
  `);
}

/**
 * Show a polished in-app confirmation/alert modal. Replaces browser confirm()/alert().
 * Returns a Promise<boolean> — true if confirmed, false if cancelled.
 */
export function showConfirm({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, alert: isAlert = false, inputPlaceholder = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `<div class="confirm-modal__card">
      <div class="confirm-modal__title" id="confirmModalTitle">${escapeHtml(title)}</div>
      ${message ? `<div class="confirm-modal__message">${escapeHtml(message)}</div>` : ''}
      ${inputPlaceholder ? `<textarea class="confirm-modal__input" placeholder="${escapeHtml(inputPlaceholder)}" rows="2" style="width:100%;margin-top:10px;resize:none;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;font:inherit;background:var(--surface-2);color:var(--text);"></textarea>` : ''}
      <div class="confirm-modal__actions">
        ${!isAlert ? `<button class="btn btn--secondary confirm-modal__cancel" type="button">${escapeHtml(cancelLabel)}</button>` : ''}
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} confirm-modal__ok" type="button">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
    overlay.setAttribute('aria-labelledby', 'confirmModalTitle');

    const okBtn = overlay.querySelector('.confirm-modal__ok');
    const cancelBtn = overlay.querySelector('.confirm-modal__cancel');
    const inputEl = overlay.querySelector('.confirm-modal__input');

    function close(confirmed) {
      document.removeEventListener('keydown', keyHandler);
      overlay.classList.remove('confirm-modal--active');
      const result = !confirmed ? false : inputPlaceholder ? { confirmed: true, value: inputEl?.value.trim() || '' } : true;
      setTimeout(() => { overlay.remove(); resolve(result); }, 200);
    }

    okBtn.addEventListener('click', () => close(true));
    cancelBtn?.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(isAlert ? true : false); });

    // Focus trap: Tab cycles between cancel and ok (or stays on ok for alerts)
    function keyHandler(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(isAlert ? true : false); }
      else if (e.key === 'Enter' && document.activeElement !== inputEl) { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') {
        const focusable = [cancelBtn, inputEl, okBtn].filter(Boolean);
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
      (inputEl || okBtn).focus();
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
  // Use module-level glyph map (shared with renderWeatherSheet).
  const weatherGlyphs = WEATHER_GLYPHS;
  const utensilsGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7a3 3 0 0 0 6 0V2M6 9v13M14 2v20M18 2c-2 2-3 4-3 7s1 4 3 4v9"/></svg>';

  // Weather chip
  let weatherValue = '—° · Set location';
  let weatherGlyph = weatherGlyphs.cloud;
  if (weather) {
    if (weather.isPast) weatherValue = 'Past day';
    else if (weather.isFuture) weatherValue = '—° · No forecast yet';
    else {
      weatherValue = `${esc(weather.conditionLabel)} · ${esc(weather.tempLabel)}`;
      weatherGlyph = weatherGlyphs[weather.glyph] || weatherGlyphs.cloud;
    }
  }

  // Dinner chip
  let dinnerValue = 'Not planned';
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
 * 5-day weather forecast bottom sheet.
 * days: Array<{ dateKey, tempLabel, conditionLabel, glyph, high, low }>
 */
export function renderWeatherSheet(days, today, tomorrow) {
  function dayLabel(dk) {
    if (dk === today) return 'Today';
    if (dk === tomorrow) return 'Tomorrow';
    const d = new Date(dk + 'T12:00:00'); // noon avoids DST midnight ambiguity
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  function shortDate(dk) {
    const d = new Date(dk + 'T12:00:00'); // noon avoids DST midnight ambiguity
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (!days || days.length === 0) {
    return renderBottomSheet(`
      <h3 class="sheet-section-title">Weather</h3>
      <div class="weather-sheet__rows weather-sheet__rows--empty">Could not load forecast. Check your connection.</div>
      <div class="sheet-actions">
        <button class="btn btn--secondary btn--full" id="weatherSheetClose" type="button">Done</button>
      </div>
    `);
  }

  const rowsHtml = days.map(day => {
    if (!day) return '';
    const glyph = WEATHER_GLYPHS[day.glyph] || WEATHER_GLYPHS.cloud;
    const morningGlyph = WEATHER_GLYPHS[day.morningGlyph || day.glyph] || WEATHER_GLYPHS.cloud;
    const afternoonGlyph = WEATHER_GLYPHS[day.afternoonGlyph || day.glyph] || WEATHER_GLYPHS.cloud;
    const popHtml = (day.pop != null && day.pop > 0) ? `<span class="weather-row__pop">${day.pop}% precip</span>` : '';
    return `<div class="weather-row">
      <div class="weather-row__day">
        <strong>${esc(dayLabel(day.dateKey))}</strong>
        <span>${esc(shortDate(day.dateKey))}</span>
      </div>
      <div class="weather-row__glyph" aria-hidden="true">${glyph}</div>
      <div class="weather-row__data">
        <strong>${esc(day.high)} / ${esc(day.low)}</strong>
        <span>${esc(day.conditionLabel)}</span>
        ${popHtml}
      </div>
      <div class="weather-row__periods" aria-label="Morning and afternoon forecast">
        <div class="weather-period">
          <span class="weather-period__glyph" aria-hidden="true">${morningGlyph}</span>
          <span class="weather-period__label">AM</span>
        </div>
        <div class="weather-period">
          <span class="weather-period__glyph" aria-hidden="true">${afternoonGlyph}</span>
          <span class="weather-period__label">PM</span>
        </div>
      </div>
    </div>`;
  }).join('');

  return renderBottomSheet(`
    <h3 class="sheet-section-title">Weather</h3>
    <div class="weather-sheet__rows">${rowsHtml}</div>
    <div class="sheet-actions">
      <button class="btn btn--secondary btn--full" id="weatherSheetClose" type="button">Done</button>
    </div>
  `);
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
export function initBell(getPeople, getRewards, onAllMessagesFn, { writeMessageFn, markMessageSeenFn, removeMessageFn, writeBankTokenFn, markBankTokenUsedFn, removeBankTokenFn, readBankFn, writeMultiplierFn, getTodayFn, approverName } = {}) {
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
        if ((msg.type === 'redemption-request' || msg.type === 'use-request' || msg.type === 'fyi') && !msg.seen) count++;
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

  document.addEventListener('click', async (e) => {
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

      // Read all kids' banks in parallel for the summary section
      const kids = people.filter(p => p.role === 'child');
      let kidBankSummary = [];
      if (readBankFn && kids.length > 0) {
        const banks = await Promise.all(kids.map(k => readBankFn(k.id).then(b => ({ id: k.id, name: k.name, bank: b || {} }))));
        kidBankSummary = banks.map(({ id, name, bank }) => ({
          id, name,
          activeCount: Object.values(bank).filter(t => !t.used).length,
          tokens: Object.entries(bank).filter(([, t]) => !t.used).map(([, t]) => t)
        }));
      }

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
        people,
        kidBankSummary
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
        mount.innerHTML = renderSendMessageSheet(getPeople(), null, getRewards());
        requestAnimationFrame(() => { document.getElementById('bottomSheet')?.classList.add('active'); });
        bindSendMessageSheet(mount, writeMessageFn, approver, writeBankTokenFn, getRewards);
      });

      // Wire "Clear All" button — deletes all messages except unseen FYIs with revoke options
      document.getElementById('bellClearAll')?.addEventListener('click', async () => {
        if (!await showConfirm({ title: 'Clear all notification history?', danger: true })) return;
        const people = getPeople();
        for (const p of people) {
          const msgs = bellMessages[p.id];
          if (!msgs) continue;
          for (const [msgId, msg] of Object.entries(msgs)) {
            // Keep unseen FYIs that have a bank token — parent may still want to revoke
            if (msg.type === 'fyi' && !msg.seen && msg.bankTokenId) continue;
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
          if (msg.intent === 'use-now') {
            // One approval covers purchase + use — no bank token
            await writeMessageFn(personId, {
              type: 'redemption-approved',
              title: `${reward.name || 'Reward'} approved${approver !== 'Parent' ? ` by ${approver}` : ''}!`,
              body: null,
              amount: 0,
              intent: 'use-now',
              rewardId: msg.rewardId,
              entryKey: null,
              seen: false,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: approver
            });
            await writeMessageFn(personId, {
              type: 'reward-used',
              title: `Used: ${reward.name || 'Reward'}`,
              body: null,
              amount: 0,
              rewardId: msg.rewardId || null,
              entryKey: null,
              seen: true,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: approver
            });
          } else {
            // Legacy save intent — bank the token
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
          }

          closeBellDropdown();
        });
      }

      for (const btn of document.querySelectorAll('.bell-deny')) {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          closeBellDropdown();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          const reward = getRewards()[msg.rewardId] || {};
          const result = await showConfirm({
            title: `Deny ${reward.name || 'this request'}?`,
            message: msg.intent === 'use-now' ? 'Points will be refunded.' : '',
            confirmLabel: 'Deny',
            cancelLabel: 'Cancel',
            danger: true,
            inputPlaceholder: 'Reason (optional — kid will see this)'
          });
          if (!result) return;
          const reason = typeof result === 'object' ? result.value : '';

          await writeMessageFn(personId, {
            type: 'redemption-denied',
            title: `${reward.name || 'Reward'} denied${approver !== 'Parent' ? ` by ${approver}` : ''}`,
            body: reason || null,
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

          // Mark seen last so a network failure on the refund write doesn't lose the request
          await markMessageSeenFn(personId, msgId);
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
          closeBellDropdown();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          const result = await showConfirm({
            title: `Deny use of ${msg.rewardName || 'this reward'}?`,
            confirmLabel: 'Deny',
            cancelLabel: 'Cancel',
            danger: true,
            inputPlaceholder: 'Reason (optional — kid will see this)'
          });
          if (!result) return;
          const reason = typeof result === 'object' ? result.value : '';

          await writeMessageFn(personId, {
            type: 'use-denied',
            title: `${msg.rewardName || 'Reward'} — not right now (${approver})`,
            body: reason || null,
            amount: 0,
            rewardId: msg.rewardId || null,
            entryKey: null,
            seen: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: approver
          });

          await markMessageSeenFn(personId, msgId);
        });
      }

      // Wire FYI revoke buttons
      for (const btn of document.querySelectorAll('.bell-revoke')) {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const personId = btn.dataset.personId;
          const msgId = btn.dataset.msgId;
          const msg = bellMessages[personId]?.[msgId];
          if (!msg) return;

          await markMessageSeenFn(personId, msgId);

          // Remove the bank token from the kid's bank
          const kidPersonId = msg.createdBy;
          if (msg.bankTokenId && removeBankTokenFn && kidPersonId) {
            await removeBankTokenFn(kidPersonId, msg.bankTokenId);
          }

          // Refund the points
          if (msg.amount && writeMessageFn && kidPersonId) {
            await writeMessageFn(kidPersonId, {
              type: 'bonus',
              title: `Refund: ${getRewards()[msg.rewardId]?.name || 'Reward'}`,
              body: null,
              amount: Math.abs(msg.amount),
              rewardId: msg.rewardId || null,
              entryKey: null,
              seen: true,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: 'system'
            });
          }

          // Notify the kid their reward was revoked
          if (writeMessageFn && kidPersonId) {
            await writeMessageFn(kidPersonId, {
              type: 'redemption-denied',
              title: `${getRewards()[msg.rewardId]?.name || 'Reward'} was revoked`,
              body: null,
              amount: 0,
              rewardId: msg.rewardId || null,
              entryKey: null,
              seen: false,
              createdAt: firebase.database.ServerValue.TIMESTAMP,
              createdBy: approver
            });
          }

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

/**
 * Render the meal editor sheet body (create or edit a meal library entry).
 * meal: null (create) or { name, ingredients, url, notes, prepTime, isFavorite, tags }
 * mealId: null (create) or existing library key
 * Returns HTML string; mount inside renderBottomSheet() then bind #meForm events in the page.
 *
 * Events the page must bind after mounting:
 *   #meForm submit           → save
 *   #me_addIngredient click  → add ingredient row
 *   .me-ingredient-remove    → remove ingredient row (delegate on #me_ingredients)
 *   #me_tagInput keydown     → Enter/comma adds a tag
 *   .me-tag__remove          → remove tag (delegate on #me_tags)
 *   #meDelete click          → delete (edit mode only)
 */
export function renderMealEditorSheet(meal = null, mealId = null) {
  const isEdit = meal !== null;
  const name     = isEdit ? esc(meal.name || '') : '';
  const prepTime = isEdit ? esc(meal.prepTime || '') : '';
  const url      = isEdit ? esc(meal.url || '') : '';
  const notes    = isEdit ? esc(meal.notes || '') : '';
  const isFav    = isEdit && meal.isFavorite;
  const tags     = isEdit ? (meal.tags || []) : [];
  const ingr     = isEdit ? (meal.ingredients || []) : [];

  const tagChips = tags.map((t, i) =>
    `<span class="me-tag" data-tag-index="${i}">
      ${esc(t)}
      <button class="me-tag__remove" data-tag-index="${i}" type="button" aria-label="Remove tag ${esc(t)}">&times;</button>
    </span>`
  ).join('');

  const ingrRows = ingr.map((item, i) =>
    `<div class="me-ingredient-row" data-ingr-index="${i}">
      <input type="text" value="${esc(item)}" placeholder="e.g. 2 lbs ground beef"
             data-ingr-index="${i}" aria-label="Ingredient ${i + 1}">
      <button class="me-ingredient-remove" data-ingr-index="${i}" type="button" aria-label="Remove">&times;</button>
    </div>`
  ).join('');

  const starSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  const trashSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  const checkSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const closeSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  return `<form class="task-detail-sheet" id="meForm" novalidate>
    <div class="sheet__header">
      <h2 class="sheet__title">${isEdit ? 'Edit meal' : 'New meal'}</h2>
      <div class="rf-header-actions">
        <button class="ef2-icon-btn me-fav-btn${isFav ? ' is-active' : ''}" id="me_fav" type="button"
                aria-pressed="${isFav}" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          ${starSvg}
        </button>
        ${isEdit ? `<button class="ef2-icon-btn rf-delete-btn" id="meDelete" type="button" aria-label="Delete meal">${trashSvg}</button>` : ''}
        <button class="ef2-icon-btn rf-save-btn" type="submit" aria-label="${isEdit ? 'Save changes' : 'Create meal'}">${checkSvg}</button>
        <button class="ef2-icon-btn" id="me_closeBtn" type="button" aria-label="Close">${closeSvg}</button>
      </div>
    </div>

    <label class="field">
      <span class="field__label">Name <span aria-hidden="true" class="field__required-star">*</span></span>
      <input class="field__input" id="me_name" type="text" value="${name}"
             placeholder="e.g. Taco Tuesday" autocomplete="off" required>
      <span class="field__error" id="me_nameError" role="alert"></span>
    </label>

    <label class="field">
      <span class="field__label">Prep time</span>
      <input class="field__input" id="me_prepTime" type="text" value="${prepTime}"
             placeholder="e.g. 30 min">
    </label>

    <div class="field">
      <span class="field__label">Ingredients</span>
      <div id="me_ingredients">${ingrRows}</div>
      <button class="btn btn--ghost btn--sm me-add-ingredient-btn" id="me_addIngredient" type="button">+ Add ingredient</button>
    </div>

    <div class="field">
      <label class="field__label" for="me_url">Recipe link</label>
      <div class="me-url-row">
        <input class="field__input" id="me_url" type="url" value="${url}"
               placeholder="https://…">
        <a class="me-url-open" id="me_urlOpen" href="${esc(url || '#')}"
           target="_blank" rel="noopener noreferrer" aria-label="Open recipe link"${url ? '' : ' hidden'}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>
    </div>

    <label class="field">
      <span class="field__label">Notes</span>
      <textarea class="field__input" id="me_notes" placeholder="Any notes…" rows="3">${notes}</textarea>
    </label>

    <input type="hidden" id="me_mealId" value="${esc(mealId || '')}">
  </form>`;
}

/**
 * Render the meal plan sheet body (assign a meal to a day/slot).
 *
 * opts:
 *   date: string 'YYYY-MM-DD' — pre-selected date
 *   slot: 'breakfast'|'lunch'|'dinner'|'snack' — pre-selected slot
 *   library: object { [mealId]: mealObj } — full meal library
 *   currentMealId: string|null — currently assigned meal for this slot (for remove link)
 *
 * Events the page must bind after mounting:
 *   #mpForm submit                    → save selected meal
 *   .mp-slot-tab click                → switch active slot (delegate on #mp_slotTabs)
 *   #mp_search input                  → filter library chips
 *   .meal-chip[data-meal-id] click    → select a meal
 *   #mp_createNew click               → open inline editor (hide results, show #mp_inlineEditor)
 *   #mp_removeLink click              → remove existing assignment
 *   #mp_inlineBack click              → back to picker from inline editor
 */
export function renderMealPlanSheet({ date, slot = 'dinner', library = {}, currentMealId = null } = {}) {
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

  const slotGrid = SLOTS.map(s =>
    `<button class="mp-slot-tab${s === slot ? ' is-active' : ''}" data-slot="${s}"
             type="button" role="tab" aria-selected="${s === slot}">
      ${SLOT_LABELS[s]}
    </button>`
  ).join('');

  const entries = Object.entries(library).sort(([, a], [, b]) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return (b.lastUsed || 0) - (a.lastUsed || 0);
  });

  const checkSvg = `<svg class="meal-option__check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

  const mealRows = entries.map(([id, m]) =>
    `<button class="meal-option${id === currentMealId ? ' is-selected' : ''}"
             data-meal-id="${esc(id)}" type="button">
      <span class="meal-option__name">${esc(m.name)}</span>
      ${checkSvg}
    </button>`
  ).join('');

  const hasEntries = entries.length > 0;
  const hasFavs = entries.some(([, m]) => m.isFavorite);
  const resultsLabel = hasEntries ? (hasFavs ? 'Favorites & Recent' : 'Recent') : '';

  const removeLinkHtml = currentMealId && library[currentMealId]
    ? `<button class="mp-remove-link" id="mp_removeLink" type="button">Remove from this slot</button>`
    : '';

  return `<form class="task-detail-sheet" id="mpForm" novalidate>
    <h3 class="me-editor-title mp-sheet-title">Plan a meal</h3>

    <label class="field">
      <span class="field__label">Date</span>
      <input class="field__input" id="mp_date" type="date" value="${esc(date || '')}"
             aria-label="Date">
    </label>

    <div class="mp-slot-section">
      <span class="field__label">Slot</span>
      <div class="mp-slot-grid" id="mp_slotTabs" role="tablist" aria-label="Meal slot">
        ${slotGrid}
      </div>
    </div>

    <div class="mp-meal-section">
      <div class="mp-search-row">
        <input class="field__input mp-search-input" id="mp_search" type="search"
               placeholder="Search meals…" autocomplete="off">
        <button class="mp-create-btn" id="mp_createNew" type="button" aria-label="Create new meal">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      ${resultsLabel ? `<span class="mp-results-label">${resultsLabel}</span>` : ''}
      <div class="mp-results" id="mp_results">${mealRows}</div>
      ${removeLinkHtml}
    </div>

    <div class="mp-inline-editor" id="mp_inlineEditor" hidden>
      <div class="mp-inline-header">
        <button class="btn btn--ghost btn--sm" id="mp_inlineBack" type="button">← Back</button>
        <span class="mp-inline-title">New meal</span>
      </div>
      <label class="field">
        <span class="field__label">Name <span class="field__required-star" aria-hidden="true">*</span></span>
        <input class="field__input" id="mp_inlineName" type="text"
               placeholder="e.g. Taco Tuesday" autocomplete="off">
        <span class="field__error" id="mp_inlineNameError" role="alert"></span>
      </label>
      <label class="field">
        <span class="field__label">Prep time</span>
        <input class="field__input" id="mp_inlinePrepTime" type="text" placeholder="e.g. 30 min">
      </label>
      <label class="field">
        <span class="field__label">Recipe link</span>
        <input class="field__input" id="mp_inlineUrl" type="url" placeholder="https://…">
      </label>
      <label class="field">
        <span class="field__label">Notes</span>
        <textarea class="field__input" id="mp_inlineNotes" placeholder="Any notes…" rows="2"></textarea>
      </label>
    </div>

    <input type="hidden" id="mp_selectedMealId" value="${esc(currentMealId || '')}">
    <button class="btn btn--primary btn--full mp-save-btn" type="submit">Save</button>
  </form>`;
}

/**
 * Render the meal detail sheet body (view a planned meal's library entry).
 *
 * meal: meal library object { name, ingredients, url, notes, prepTime, isFavorite, tags }
 * planEntry: { mealId, source } from meals/{date}/{slot}
 * slot: string — slot key for display label
 * readonly: boolean — when true, hides edit/change/remove actions (kid mode / calendar)
 *
 * Events the page must bind after mounting:
 *   #mdClose click     → close sheet
 *   #mdLink click      → open recipe URL (only if meal.url)
 *   #mdAddToList click → add ingredients to shopping list (only if ingredients present)
 *   #mdChange click    → open plan sheet to change meal (only if !readonly && !isSchool)
 *   #mdEdit click      → open meal editor (only if !readonly && !isSchool)
 *   #mdRemove click    → remove this slot from plan (only if !readonly && !isSchool)
 */
export function renderMealDetailSheet(meal, planEntry, readonly = false, slot = '') {
  if (!meal) return `<p class="text-muted" style="padding:var(--spacing-md)">Meal not found.</p>`;

  const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const isSchool = planEntry?.source === 'school';
  const hasIngredients = (meal.ingredients || []).filter(i => (i?.name || i)?.trim()).length > 0;

  const CLOSE_SVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const LINK_SVG    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const LIST_SVG    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
  const SWAP_SVG    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
  const PENCIL_SVG  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const TRASH_SVG   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  const CHEVRON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

  const chips = [];
  if (slot && SLOT_LABELS[slot]) chips.push(`<span class="chip">${esc(SLOT_LABELS[slot])}</span>`);
  if (meal.prepTime) chips.push(`<span class="chip">${esc(meal.prepTime)}</span>`);
  if (isSchool) chips.push(`<span class="chip">School</span>`);
  (meal.tags || []).forEach(t => chips.push(`<span class="chip">${esc(t)}</span>`));

  const ingrHtml = hasIngredients
    ? `<div class="me-detail__section">
        <span class="me-detail__section-label">Ingredients</span>
        <ul class="me-detail__ingredients">
          ${meal.ingredients.filter(i => (i?.name || i)?.trim()).map(i =>
            typeof i === 'string'
              ? `<li><span>${esc(i)}</span></li>`
              : `<li>${i.qty ? `<span class="me-detail__ing-qty">${esc(i.qty)}</span>` : ''}<span>${esc(i.name || '')}</span></li>`
          ).join('')}
        </ul>
       </div>`
    : '';

  const notesHtml = meal.notes
    ? `<div class="me-detail__section">
        <span class="me-detail__section-label">Notes</span>
        <p class="me-detail__notes">${esc(meal.notes)}</p>
       </div>`
    : '';

  let actions = '';
  if (!isSchool) {
    actions += `<div class="ef2-divider"></div><div class="task-detail__action-list">`;
    if (meal.url) {
      actions += `<a class="task-detail__action-row" id="mdLink" href="${esc(meal.url)}" target="_blank" rel="noopener noreferrer">${LINK_SVG}<span>Open recipe</span>${CHEVRON_SVG}</a>`;
    }
    if (hasIngredients && !readonly) {
      actions += `<button class="task-detail__action-row" id="mdAddToList" type="button">${LIST_SVG}<span>Add ingredients to list</span>${CHEVRON_SVG}</button>`;
    }
    if (!readonly) {
      actions += `<button class="task-detail__action-row" id="mdChange" type="button">${SWAP_SVG}<span>Change meal</span>${CHEVRON_SVG}</button>`;
      actions += `<button class="task-detail__action-row" id="mdEdit" type="button">${PENCIL_SVG}<span>Edit meal</span>${CHEVRON_SVG}</button>`;
      actions += `<button class="task-detail__action-row task-detail__action-row--muted" id="mdRemove" type="button">${TRASH_SVG}<span>Remove from plan</span></button>`;
    }
    actions += `</div>`;
  }

  return `<div class="task-detail-sheet">
    <div class="sheet__header">
      <h2 class="sheet__title">${esc(meal.name)}</h2>
      <button class="ef2-icon-btn" id="mdClose" type="button" aria-label="Close">${CLOSE_SVG}</button>
    </div>
    ${chips.length ? `<div class="task-detail__chips">${chips.join('')}</div>` : ''}
    ${ingrHtml}
    ${notesHtml}
    ${actions}
  </div>`;
}

/**
 * Render the Repeat sub-sheet HTML.
 * rule: null | { type, days?, every?, unit?, end? }
 */
export function renderRepeatSheet(rule) {
  const t = rule?.type || 'none';
  const selectedDays = new Set(rule?.days || []);
  const DAY_KEYS = ['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  const DAY_LABELS = { S: 'S', M: 'M', T: 'T', W: 'W', Th: 'T', F: 'F', Sa: 'S' };

  const CHECK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

  function opt(key, label) {
    const sel = t === key;
    return `<div class="ef2-repeat-option${sel ? ' is-selected' : ''}" data-type="${key}">
      <span class="ef2-repeat-label">${label}</span>
      <span class="ef2-repeat-check" aria-hidden="true">${CHECK_SVG}</span>
    </div>`;
  }

  const dayChips = DAY_KEYS.map(d =>
    `<button class="ef2-day-chip${selectedDays.has(d) ? ' is-active' : ''}" data-day="${d}" type="button">${DAY_LABELS[d]}</button>`
  ).join('');

  const weeklySubOpen = t === 'weekly' ? ' is-open' : '';
  const customSubOpen = t === 'custom' ? ' is-open' : '';
  const endSectionOpen = (t !== 'none' && t !== '') ? ' is-open' : '';
  const every = rule?.every || 2;
  const unit = rule?.unit || 'weeks';
  const endType = rule?.end?.type || 'never';
  const endDate = rule?.end?.date || '';
  const endCount = rule?.end?.count || 5;

  return `<div class="sheet__header sheet__header--with-back">
    <button class="btn btn--ghost btn--sm" id="rptBack" type="button">← Back</button>
    <h2 class="sheet__title">Repeat</h2>
  </div>
  <div class="sheet__content">
    ${opt('none', 'None')}
    ${opt('daily', 'Daily')}
    ${opt('weekly', 'Weekly')}
    <div class="ef2-repeat-sub${weeklySubOpen}" id="rptWeeklySub">${dayChips}</div>
    ${opt('monthly', 'Monthly')}
    ${opt('yearly', 'Yearly')}
    ${opt('custom', 'Custom')}
    <div class="ef2-repeat-sub${customSubOpen}" id="rptCustomSub">
      <div class="ef2-repeat-custom-row">
        <span class="ef2-repeat-custom-label">Every</span>
        <input id="rptEvery" type="number" min="1" max="99" value="${esc(every)}">
        <select id="rptUnit">
          <option value="days"${unit === 'days' ? ' selected' : ''}>Days</option>
          <option value="weeks"${unit === 'weeks' ? ' selected' : ''}>Weeks</option>
          <option value="months"${unit === 'months' ? ' selected' : ''}>Months</option>
        </select>
      </div>
    </div>

    <div class="ef2-repeat-end${endSectionOpen}" id="rptEndSection">
      <div class="ef2-section-label" style="margin-top:var(--spacing-md)">Ends</div>
      <select class="field__input" id="rptEndType" style="width:100%">
        <option value="never"${endType === 'never' ? ' selected' : ''}>Never</option>
        <option value="on"${endType === 'on' ? ' selected' : ''}>On date</option>
        <option value="after"${endType === 'after' ? ' selected' : ''}>After</option>
      </select>
      <div id="rptEndDateWrap" style="margin-top:var(--spacing-xs);display:${endType === 'on' ? 'block' : 'none'}">
        <input class="field__input" id="rptEndDate" type="date" value="${esc(endDate)}">
      </div>
      <div id="rptEndCountWrap" style="display:${endType === 'after' ? 'flex' : 'none'};align-items:center;gap:var(--spacing-sm);margin-top:var(--spacing-xs)">
        <input class="field__input" id="rptEndCount" type="number" min="1" max="999" value="${esc(endCount)}" style="width:80px">
        <span style="font-size:var(--font-sm)">occurrences</span>
      </div>
    </div>
  </div>
  <div class="sheet__footer">
    <button class="btn btn--ghost" id="rptCancel" type="button">Cancel</button>
    <button class="btn btn--primary" id="rptDone" type="button">Done</button>
  </div>`;
}
