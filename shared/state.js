// state.js — Completion state management, query helpers
// Pure functions. No DOM. No Firebase writes (pages handle persistence).

/**
 * Check if a schedule entry has been completed.
 * @param {string} entryKey - The schedule entry key
 * @param {object} completions - All completion records { entryKey: { completedAt, completedBy } }
 * @returns {boolean}
 */
export function isComplete(entryKey, completions) {
  return !!(completions && completions[entryKey]);
}

/**
 * Get the completion record for an entry, or null.
 */
export function getCompletionRecord(entryKey, completions) {
  return (completions && completions[entryKey]) || null;
}

/**
 * Filter schedule entries to a single person. Pass null/undefined for all.
 * @param {object} entries - { entryKey: entry }
 * @param {string|null} personId
 * @returns {object} filtered entries
 */
export function filterByPerson(entries, personId) {
  if (!personId || !entries) return entries || {};
  const result = {};
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.ownerId === personId) result[key] = entry;
  }
  return result;
}

/**
 * Group schedule entries by timeOfDay bucket.
 * Returns { am: {}, pm: {}, anytime: {} }
 */
export function groupByTime(entries) {
  const groups = { am: {}, pm: {}, anytime: {} };
  if (!entries) return groups;
  for (const [key, entry] of Object.entries(entries)) {
    const tod = entry.timeOfDay || 'anytime';
    const bucket = groups[tod] || groups.anytime;
    bucket[key] = entry;
  }
  return groups;
}

/**
 * Calculate progress for a set of entries.
 * @returns {{ total: number, done: number, pct: number }}
 */
export function dayProgress(entries, completions) {
  if (!entries) return { total: 0, done: 0, pct: 0 };
  const keys = Object.keys(entries);
  const total = keys.length;
  const done = keys.filter(k => isComplete(k, completions)).length;
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/**
 * Find overdue entries — past dates with incomplete tasks.
 * @param {object} schedule - Full schedule { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions
 * @param {string} today - Today's date key (YYYY-MM-DD)
 * @returns {Array<{ dateKey, entryKey, ...entry }>} sorted oldest first
 */
export function getOverdueEntries(schedule, completions, today) {
  const overdue = [];
  if (!schedule) return overdue;
  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    if (dateKey >= today || !dayEntries) continue;
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      if (!isComplete(entryKey, completions)) {
        overdue.push({ dateKey, entryKey, ...entry });
      }
    }
  }
  return overdue.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * Check if every entry in the set is complete.
 * Returns false if there are zero entries.
 */
export function isAllDone(entries, completions) {
  if (!entries) return false;
  const keys = Object.keys(entries);
  return keys.length > 0 && keys.every(k => isComplete(k, completions));
}

/**
 * Sort entries by: incomplete first, then by timeOfDay priority (am < pm < anytime).
 * Returns array of [entryKey, entry] pairs.
 */
export function sortEntries(entries, completions) {
  if (!entries) return [];
  const todPriority = { am: 0, pm: 1, anytime: 2 };
  return Object.entries(entries).sort(([kA, a], [kB, b]) => {
    const doneA = isComplete(kA, completions) ? 1 : 0;
    const doneB = isComplete(kB, completions) ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const todA = todPriority[a.timeOfDay] ?? 2;
    const todB = todPriority[b.timeOfDay] ?? 2;
    return todA - todB;
  });
}
