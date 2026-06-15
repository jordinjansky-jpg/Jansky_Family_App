// Themed category icons — single-color, stroke-based SVGs (Lucide family) that
// replace category EMOJI app-wide. Emoji stay reserved for user-authored
// content (list/reward/badge names, kid greeting); categories are chrome and
// should match the nav/banner/time-pill iconography.
//
// Resolution order in renderCategoryIcon():
//   1. cat.iconKey            — explicit themed icon (set by the category picker)
//   2. DEFAULT_CATEGORY_ICON  — the seeded default keys (chores, wellness, …)
//   3. cat.icon (emoji)       — graceful fallback for un-mapped/custom categories
// So existing default categories render themed with NO data migration; only
// new/custom categories need an iconKey.

import { escapeHtml } from './utils.js';

const esc = (s) => escapeHtml(String(s ?? ''));

// Inner <path>/<rect> content only — renderCategoryIcon wraps it in the <svg>.
const ICON_PATHS = {
  // Cleaning / household
  broom:      '<path d="M19 4 8.5 14.5"/><path d="M11 7l6 6"/><path d="M8.5 14.5 4 19v1h1l4.5-4.5"/><path d="M14 17l-2 3"/><path d="M17 14l-1.5 3.5"/>',
  sparkles:   '<path d="M9.94 14.34A2 2 0 0 0 8.66 13.06L3 11l5.66-2.06A2 2 0 0 0 9.94 7.66L12 2l2.06 5.66a2 2 0 0 0 1.28 1.28L21 11l-5.66 2.06a2 2 0 0 0-1.28 1.28L12 20Z"/>',
  home:       '<path d="M3 9.5 12 2l9 7.5"/><path d="M5 9v11a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9"/>',
  trash:      '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>',
  shirt:      '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  // Health / wellness
  heart:      '<path d="M12 21s-7-4.6-9.3-9A5 5 0 0 1 12 7a5 5 0 0 1 9.3 5C19 16.4 12 21 12 21z"/>',
  dumbbell:   '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  droplet:    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  leaf:       '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
  // School / learning / creative
  book:       '<path d="M12 7v13"/><path d="M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 2 3 3 0 0 0-3-2z"/>',
  pencil:     '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  backpack:   '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M8 21v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5"/><path d="M8 18h8"/>',
  music:      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  palette:    '<circle cx="13.5" cy="6.5" r=".6" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r=".6" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r=".6" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r=".6" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h1.99c3.05 0 5.56-2.5 5.56-5.55C21.96 6.01 17.46 2 12 2z"/>',
  // Reward / behavior / fun
  star:       '<path d="M12 3l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.3 6.99 19l1-5.75-4.2-4.1 5.8-.85z"/>',
  trophy:     '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  gift:       '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  smile:      '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  // Time / routine
  calendar:   '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon:       '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  bed:        '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  // Life / errands
  utensils:   '<path d="M3 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2"/><path d="M5 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  coins:      '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  car:        '<path d="M19 17h2v-3.34a4 4 0 0 0-1.17-2.83L17 8H7L4.17 10.83A4 4 0 0 0 3 13.66V17h2"/><path d="M5 17h14"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  paw:        '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.05Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  check:      '<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>',
};

// Seeded default category keys → themed icon. Lets existing default categories
// render themed without a data migration.
export const DEFAULT_CATEGORY_ICON = {
  chores: 'broom',
  wellness: 'heart',
  fitness: 'dumbbell',
  education: 'book',
  events: 'calendar',
  behavior: 'star',
};

// Ordered icon keys for the category-form picker.
export const CATEGORY_ICON_KEYS = Object.keys(ICON_PATHS);

// The themed icon key a category resolves to (explicit iconKey, else the
// seeded default-by-key), or '' if it has none (emoji-only / custom).
export function effectiveIconKey(cat) {
  if (!cat) return '';
  if (ICON_PATHS[cat.iconKey]) return cat.iconKey;
  const mapped = DEFAULT_CATEGORY_ICON[cat.key];
  return ICON_PATHS[mapped] ? mapped : '';
}

// True when a category resolves to a themed SVG (vs. falling back to emoji).
export function hasCategoryIcon(cat) {
  return !!effectiveIconKey(cat);
}

// Color tone (muted vs accent) is driven globally by a root class
// (`html.cat-icons-accent`) applied from settings.categoryIconTone — see
// applyCategoryIconTone() in theme.js — so render sites stay tone-agnostic.

/**
 * Render a category's icon as inline HTML.
 * @param {object} cat   - category record ({ key, iconKey?, icon? })
 * @param {object} opts
 * @param {number} opts.size  - px (default 20)
 * @returns {string} an <svg> (themed) or the escaped emoji (fallback)
 */
export function renderCategoryIcon(cat, { size = 20 } = {}) {
  if (!cat) return '';
  const path = ICON_PATHS[effectiveIconKey(cat)];
  if (path) {
    return `<svg class="cat-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }
  return cat.icon ? esc(cat.icon) : '';
}

// Raw <svg> for a known icon key (used by the picker tiles). Returns '' if unknown.
export function categoryIconSvg(iconKey, { size = 22 } = {}) {
  const path = ICON_PATHS[iconKey];
  if (!path) return '';
  return `<svg class="cat-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/**
 * Render the themed category-icon picker (replaces the emoji picker on the
 * category form). Mirrors renderEmojiPicker/bindEmojiPicker: a grid of tiles
 * plus a hidden input holding the chosen icon key.
 */
export function renderCategoryIconPicker({ pickerId, hiddenId, value = '' }) {
  const tiles = CATEGORY_ICON_KEYS.map(k =>
    `<button type="button" class="cat-icon-tile${k === value ? ' cat-icon-tile--active' : ''}" data-icon-key="${k}" aria-label="${esc(k)}">${categoryIconSvg(k, { size: 22 })}</button>`
  ).join('');
  return `<div class="cat-icon-picker" id="${esc(pickerId)}">${tiles}</div><input type="hidden" id="${esc(hiddenId)}" value="${esc(value)}">`;
}

// Wire the picker tiles → hidden input + active state. Call after mounting.
export function bindCategoryIconPicker({ pickerId, hiddenId }) {
  const picker = document.getElementById(pickerId);
  const hidden = document.getElementById(hiddenId);
  if (!picker || !hidden) return;
  picker.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-icon-key]');
    if (!tile) return;
    picker.querySelectorAll('.cat-icon-tile').forEach(t => t.classList.toggle('cat-icon-tile--active', t === tile));
    hidden.value = tile.dataset.iconKey || '';
  });
}
