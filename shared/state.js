// state.js — Completion state management, query helpers (v2)
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
 * Calculate progress for a set of entries.
 * @returns {{ total: number, done: number, pct: number }}
 */
export function dayProgress(entries, completions) {
  if (!entries) return { total: 0, done: 0, pct: 0 };
  const keys = Object.keys(entries).filter(k => entries[k]?.type !== 'event');
  const total = keys.length;
  const done = keys.filter(k => isComplete(k, completions)).length;
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

/**
 * Find overdue entries — past dates with incomplete tasks.
 * Excludes daily tasks UNLESS they have a cooldown (cooldown tasks behave like weekly/monthly).
 * @param {object} schedule - Full schedule { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions
 * @param {string} today - Today's date key (YYYY-MM-DD)
 * @param {object} tasks - All tasks { taskId: taskObject }
 * @returns {Array<{ dateKey, entryKey, ...entry }>} sorted oldest first
 */
export function getOverdueEntries(schedule, completions, today, tasks) {
  const overdue = [];
  if (!schedule) return overdue;
  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    if (dateKey >= today || !dayEntries) continue;
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      if (entry.type === 'event') continue; // standalone events aren't overdue tasks
      if (isComplete(entryKey, completions)) continue;
      const isDailyNoCooldown = entry.rotationType === 'daily'
        && !(tasks && tasks[entry.taskId]?.cooldownDays > 0);
      if (!isDailyNoCooldown) {
        overdue.push({ dateKey, entryKey, ...entry });
      }
    }
  }
  return overdue.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * Get task IDs of cooldown tasks that have an overdue (uncompleted, past-date) entry.
 * Used by pages to suppress future instances of these tasks from rendering.
 * @param {object} schedule - Full schedule { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions
 * @param {object} tasks - All tasks { taskId: taskObject }
 * @param {string} today - Today's date key (YYYY-MM-DD)
 * @returns {Set<string>} taskIds with overdue cooldown entries
 */
export function getOverdueCooldownTaskIds(schedule, completions, tasks, today) {
  const ids = new Set();
  if (!schedule || !tasks) return ids;
  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    if (dateKey >= today || !dayEntries) continue;
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      if (isComplete(entryKey, completions)) continue;
      const task = tasks[entry.taskId];
      if (task?.cooldownDays > 0) {
        ids.add(entry.taskId);
      }
    }
  }
  return ids;
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
 * Group schedule entries by frequency bucket.
 * Returns { daily: {}, weekly: {}, monthly: {}, once: {} }
 * If cats is provided, entries belonging to event categories are grouped into 'events' instead.
 */
export function groupByFrequency(entries, tasks, cats) {
  const groups = { events: {}, daily: {}, weekly: {}, monthly: {}, once: {} };
  if (!entries) return groups;
  for (const [key, entry] of Object.entries(entries)) {
    // Check if this entry belongs to an event category
    if (tasks && cats) {
      const task = tasks[entry.taskId];
      const cat = task?.category ? cats[task.category] : null;
      if (cat?.isEvent) {
        groups.events[key] = entry;
        continue;
      }
    }
    const freq = entry.rotationType || 'daily';
    const bucket = groups[freq] || groups.daily;
    bucket[key] = entry;
  }
  return groups;
}

/**
 * Sort entries by: incomplete first, then by owner, then by timeOfDay (am < anytime < pm).
 * Returns array of [entryKey, entry] pairs.
 */
export function sortEntries(entries, completions) {
  if (!entries) return [];
  const todPriority = { am: 0, anytime: 1, pm: 2 };
  return Object.entries(entries).sort(([kA, a], [kB, b]) => {
    const doneA = isComplete(kA, completions) ? 1 : 0;
    const doneB = isComplete(kB, completions) ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    // Sort by owner, then time-of-day
    const ownerCmp = (a.ownerId || '').localeCompare(b.ownerId || '');
    if (ownerCmp !== 0) return ownerCmp;
    const todA = todPriority[a.timeOfDay] ?? 1;
    const todB = todPriority[b.timeOfDay] ?? 1;
    return todA - todB;
  });
}

// ── Event helpers ────────────────────────────────────────────────────────────
// Events are a first-class data type stored separately from schedule entries.
// Event objects: { name, date, allDay, startTime, endTime, color, people[], location, notes, url }

/**
 * Filter events by person. Events use `people[]` array, not `ownerId`.
 * @param {object} events - { eventId: eventObject }
 * @param {string|null} personId
 * @returns {object} filtered events
 */
export function filterEventsByPerson(events, personId) {
  if (!personId || !events) return events || {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.people && event.people.includes(personId)) {
      result[id] = event;
    }
  }
  return result;
}

/**
 * Get events for a specific date.
 * @param {object} events - { eventId: eventObject }
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {object} filtered events for that date
 */
export function getEventsForDate(events, dateKey) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date === dateKey) {
      result[id] = event;
    }
  }
  return result;
}

/**
 * Sort events chronologically. All-day events first, then by startTime.
 * Returns array of [eventId, event] pairs.
 */
export function sortEvents(events) {
  if (!events) return [];
  return Object.entries(events).sort(([, a], [, b]) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    if (a.allDay && b.allDay) return (a.name || '').localeCompare(b.name || '');
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
}

/**
 * Get events for a date range (inclusive).
 * @param {object} events - { eventId: eventObject }
 * @param {string} startKey - YYYY-MM-DD
 * @param {string} endKey - YYYY-MM-DD
 * @returns {object} filtered events
 */
export function getEventsForRange(events, startKey, endKey) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    if (event.date >= startKey && event.date <= endKey) {
      result[id] = event;
    }
  }
  return result;
}
