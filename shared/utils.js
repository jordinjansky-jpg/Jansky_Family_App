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
 * Get the day of week (0=Sun..6=Sat) for a date key. Keys are already
 * timezone-resolved upstream, so this computes in UTC from the key.
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
  min = Math.max(0, min || 0);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Parse a recipe ingredient quantity string into { amount: number, unit: string }.
 * Handles "1 1/2 cups", "1/2 cup", "2.5 lbs", "8" — returns null if unparseable.
 */
export function parseQtyAmount(str) {
  if (!str) return null;
  const s = str.trim();
  let m;
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)(.*)/);
  if (m && parseInt(m[3]) > 0) return { amount: parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]), unit: m[4].trim() };
  m = s.match(/^(\d+)\/(\d+)(.*)/);
  if (m && parseInt(m[2]) > 0) return { amount: parseInt(m[1]) / parseInt(m[2]), unit: m[3].trim() };
  m = s.match(/^(\d*\.?\d+)(.*)/);
  if (m) return { amount: parseFloat(m[1]), unit: m[2].trim() };
  return null;
}

/**
 * Format a decimal number as a kitchen-friendly fraction ("1 1/2", "3/4")
 * snapping to common cooking fractions to avoid odd values like "0.625 cup".
 */
export function formatFraction(n) {
  if (n <= 0) return '0';
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.03) return String(whole || '0');
  if (frac > 0.97) return String(whole + 1);
  const fracs = [[1,8],[1,6],[1,4],[1,3],[3,8],[1,2],[5,8],[2,3],[3,4],[7,8]];
  let best = fracs[0], bestDist = Infinity;
  for (const [num, den] of fracs) {
    const d = Math.abs(frac - num / den);
    if (d < bestDist) { bestDist = d; best = [num, den]; }
  }
  const fracStr = `${best[0]}/${best[1]}`;
  return whole ? `${whole} ${fracStr}` : fracStr;
}

/**
 * Scale a recipe quantity string by a multiplier ("2 cups" * 1.5 → "3 cups").
 * Returns the original string when it can't be parsed.
 */
export function scaleQty(qtyStr, factor) {
  if (!qtyStr || factor === 1) return qtyStr;
  const parsed = parseQtyAmount(qtyStr);
  if (!parsed || !parsed.amount) return qtyStr;
  const scaled = parsed.amount * factor;
  const fmt = formatFraction(scaled);
  return parsed.unit ? `${fmt} ${parsed.unit}` : fmt;
}

/**
 * Format minutes for a recipe time display: "25 min" / "1 hr 15 min".
 * Verbose because it lives in user-facing meal contexts where compact ("1h")
 * is too dense. Returns '' for null/0/negative.
 */
export function formatRecipeTime(mins) {
  if (!mins || mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60); const r = mins % 60;
  return r > 0 ? `${h} hr ${r} min` : `${h} hr`;
}

/**
 * Parse a freeform recipe time string ("30 min" / "1h 30m" / "1 hr") into
 * total minutes. Returns null when unparseable. Reused by chip rendering,
 * filter buckets, and the detail-sheet times block.
 */
export function parseRecipeTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const s = timeStr.toLowerCase().trim();
  if (!s) return null;
  let total = 0;
  let matched = false;
  const hr = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour|hours)\b/);
  if (hr) { total += parseFloat(hr[1]) * 60; matched = true; }
  const mn = s.match(/(\d+(?:\.\d+)?)\s*(?:m\b|min|mins|minute|minutes)/);
  if (mn) { total += parseFloat(mn[1]); matched = true; }
  if (!matched) {
    const bare = s.match(/^(\d+(?:\.\d+)?)$/);
    if (bare) { total = parseFloat(bare[1]); matched = true; }
  }
  return matched && total > 0 ? Math.round(total) : null;
}

/**
 * Compute total time (prep + cook) in minutes for a recipe. Falls back to
 * whichever side is set when only one is populated. Returns null when
 * neither parses.
 */
export function recipeTotalTime(recipe) {
  if (!recipe) return null;
  const p = parseRecipeTimeToMinutes(recipe.prepTime);
  const c = parseRecipeTimeToMinutes(recipe.cookTime);
  if (!p && !c) return null;
  return (p || 0) + (c || 0);
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
 * Escape HTML special characters. Coerces non-string input (null/undefined
 * become '') so a missing Firebase field can never crash a renderer.
 */
export function escapeHtml(str) {
  return String(str ?? '')
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

/**
 * Format a "last cooked" timestamp as a human-readable relative phrase.
 * Uses the family timezone for day comparisons so the day count matches
 * what the user perceives, not the device's local time.
 */
export function formatLastCooked(timestamp, timezone, todayStr) {
  if (!timestamp) return 'Never cooked';

  const lastDate = new Date(timestamp);
  const lastKey = lastDate.toLocaleDateString('en-CA', { timeZone: timezone || 'America/Chicago' });
  if (lastKey === todayStr) return 'Cooked today';

  const today = new Date(todayStr + 'T00:00:00');
  const last  = new Date(lastKey  + 'T00:00:00');
  const diffMs = today.getTime() - last.getTime();
  const days = Math.round(diffMs / 86400000);

  if (days <= 0) return 'Cooked today';
  if (days === 1) return 'Cooked yesterday';
  if (days < 7)   return `${days}d ago`;
  if (days < 14)  return 'Last week';
  if (days < 28)  return `${Math.floor(days / 7)}w ago`;
  if (days < 60)  return 'Last month';
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return 'Over a year ago';
}

/**
 * Compute the displayed rating for a recipe.
 * Returns { avg, count, mine } where avg is null if no ratings exist.
 * 'mine' is the current viewer's rating (or null), kept separate for
 * the popup display but never shown alongside others' scores.
 */
export function avgRating(recipe, viewerPersonId) {
  if (!recipe) return { avg: null, count: 0, mine: null };
  const ratings = recipe.ratings || {};
  const ids = Object.keys(ratings);
  if (ids.length > 0) {
    const sum = ids.reduce((acc, id) => acc + (Number(ratings[id]) || 0), 0);
    const avg = sum / ids.length;
    const mine = viewerPersonId && (viewerPersonId in ratings) ? Number(ratings[viewerPersonId]) : null;
    return { avg, count: ids.length, mine };
  }
  // Legacy fallback: pre-multi-person ratings stored as recipe.rating (single number)
  if (typeof recipe.rating === 'number' && recipe.rating > 0) {
    return { avg: recipe.rating, count: 1, mine: null };
  }
  return { avg: null, count: 0, mine: null };
}

// Parse a recipe's notes field into an ordered list of step strings.
// Used as the fallback for Cook mode when recipe.steps[] is absent.
// Splits on newlines, strips leading bullets/numbers, drops empty lines,
// caps at 30 steps (defensive — most recipes have under 15).
export function parseSteps(notes) {
  if (!notes || typeof notes !== 'string') return [];
  return notes
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 30);
}

// Convert a stored kitchenPlan slot value (legacy single object OR new
// array shape) into an array. Always returns an array; missing slot
// returns [].
export function normalizePlanSlot(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

// Given an array of meal options with votes maps, return the winning
// option. Ties broken by earliest addedAt (options missing addedAt lose
// ties rather than win them). Returns null when the array is empty.
export function pickWinner(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  if (options.length === 1) return options[0];
  let bestIdx = 0;
  let bestScore = -1;
  let bestAddedAt = Infinity;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const score = opt?.votes ? Object.keys(opt.votes).length : 0;
    const addedAt = opt?.addedAt || Infinity;
    if (score > bestScore || (score === bestScore && addedAt < bestAddedAt)) {
      bestIdx = i;
      bestScore = score;
      bestAddedAt = addedAt;
    }
  }
  return options[bestIdx];
}
