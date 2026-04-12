// utils.js — Date/time helpers, formatting, timezone handling (v2)
// All functions are pure. No DOM access. No side effects.

/**
 * Get the current date string (YYYY-MM-DD) in the given IANA timezone.
 */
export function todayKey(timezone) {
  return dateToKey(new Date(), timezone);
}

/**
 * Convert a Date object to YYYY-MM-DD string in the given timezone.
 */
export function dateToKey(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD key into a Date at midnight UTC.
 */
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Get the day of week (0=Sun..6=Sat) for a date key in the given timezone.
 */
export function dayOfWeek(dateKey) {
  const d = keyToDate(dateKey);
  return d.getUTCDay();
}

/**
 * Add days to a date key, return new YYYY-MM-DD key.
 */
export function addDays(dateKey, n) {
  const d = keyToDate(dateKey);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get the ISO week number for a date key.
 */
export function isoWeekNumber(dateKey) {
  const d = keyToDate(dateKey);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Get the month number (1-12) for a date key.
 */
export function monthNumber(dateKey) {
  return parseInt(dateKey.split('-')[1], 10);
}

/**
 * Get the year for a date key.
 */
export function yearNumber(dateKey) {
  return parseInt(dateKey.split('-')[0], 10);
}

/**
 * Get the Monday date key for the week containing the given date key.
 */
export function weekStart(dateKey) {
  const d = keyToDate(dateKey);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday is start of week
  return addDays(dateKey, diff);
}

/**
 * Get the Sunday date key for the week containing the given date key.
 */
export function weekEnd(dateKey) {
  const d = keyToDate(dateKey);
  const day = d.getUTCDay();
  const diff = day === 0 ? 0 : 7 - day;
  return addDays(dateKey, diff);
}

/**
 * Get the start date key of the week containing dateKey,
 * using a configurable start day (0=Sunday, 1=Monday, ...).
 * Default is 0 (Sunday).
 */
export function weekStartForDay(dateKey, startDay = 0) {
  const dow = dayOfWeek(dateKey);
  const diff = (dow - startDay + 7) % 7;
  return addDays(dateKey, -diff);
}

/**
 * Get the end date key (6 days after start) of the week containing dateKey,
 * using a configurable start day.
 */
export function weekEndForDay(dateKey, startDay = 0) {
  return addDays(weekStartForDay(dateKey, startDay), 6);
}

/**
 * Get the first day of the month for a date key.
 */
export function monthStart(dateKey) {
  return dateKey.substring(0, 8) + '01';
}

/**
 * Get the last day of the month for a date key.
 */
export function monthEnd(dateKey) {
  const y = yearNumber(dateKey);
  const m = monthNumber(dateKey);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${dateKey.substring(0, 8)}${String(lastDay).padStart(2, '0')}`;
}

/**
 * Generate an array of date keys from start to end (inclusive).
 */
export function dateRange(startKey, endKey) {
  const result = [];
  let current = startKey;
  while (current <= endKey) {
    result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

/**
 * Parse an integer from a string, returning fallback for NaN/null/undefined.
 * Critically, this preserves a valid 0 value (unlike `parseInt(...) || fallback`).
 */
export function parseIntOr(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Parse a float from a string, returning fallback for NaN/null/undefined.
 * Preserves a valid 0 value.
 */
export function parseFloatOr(value, fallback) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Format minutes as "Xh Ym" or just "Ym" if under 60.
 */
export function formatMinutes(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Format a date key for display (e.g., "Mon, Apr 2").
 */
export function formatDateShort(dateKey) {
  const d = keyToDate(dateKey);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

/**
 * Format a date key for display (e.g., "Monday, April 2, 2026").
 */
export function formatDateLong(dateKey) {
  const d = keyToDate(dateKey);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Check if a date key falls on a weekend (Sat or Sun).
 */
export function isWeekend(dateKey) {
  const day = dayOfWeek(dateKey);
  return day === 0 || day === 6;
}

/**
 * Get common IANA timezone options for the setup wizard.
 */
export function getTimezoneOptions() {
  return [
    { value: 'America/New_York', label: 'Eastern Time (US)' },
    { value: 'America/Chicago', label: 'Central Time (US)' },
    { value: 'America/Denver', label: 'Mountain Time (US)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
    { value: 'America/Anchorage', label: 'Alaska Time (US)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (US)' },
    { value: 'America/Phoenix', label: 'Arizona (no DST)' },
    { value: 'America/Toronto', label: 'Eastern Time (Canada)' },
    { value: 'America/Vancouver', label: 'Pacific Time (Canada)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Central European Time' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
    { value: 'Asia/Shanghai', label: 'China Standard Time' },
    { value: 'Asia/Kolkata', label: 'India Standard Time' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time' },
    { value: 'Pacific/Auckland', label: 'New Zealand Time' }
  ];
}

/**
 * Detect the user's likely timezone.
 */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/Chicago';
  }
}

/**
 * Day names for display.
 */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Debounce a function — delays invocation until `ms` milliseconds after the
 * last call. Returns a wrapper function with a .cancel() method.
 */
export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return debounced;
}
