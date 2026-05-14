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
 * Sort entries for dashboard/kid display. Returns array of [entryKey, entry] pairs.
 *
 * Order (spec §5.5):
 *   1. Incomplete before complete
 *   2. Owner (by `people` array order when provided; else stable localeCompare on ownerId)
 *   3. Late-today-first WITHIN OWNER, INCOMPLETE ONLY
 *      (non-daily entry whose task.dedicatedDate is < today — i.e. a genuinely
 *      overdue one-time task that landed on today's list without going through
 *      the move flow. Tasks moved to today via the overdue review sheet have
 *      their lateness resolved by the move action and sort normally.)
 *   4. Time of day (am=0, anytime=1, pm=2)
 *   5. Task name (case-insensitive) — stable tiebreaker
 *
 * 2-arg callers keep prior behavior: owner falls back to localeCompare, late-today
 * bump is a no-op (today=null), name tiebreak is still additive.
 *
 * @param entries     Object keyed by entryKey — { [entryKey]: entry }
 * @param completions Completion map { [entryKey]: completion }
 * @param tasks       Optional — object { [taskId]: task } OR array of task objects
 * @param people      Optional — array of people (order defines owner rank)
 * @param today       Optional — YYYY-MM-DD string enabling late-today bump
 */
export function sortEntries(entries, completions, tasks = null, people = null, today = null) {
  if (!entries) return [];
  const todPriority = { am: 0, anytime: 1, pm: 2 };

  const tasksById = tasks
    ? (Array.isArray(tasks) ? new Map(tasks.map(t => [t.id, t])) : new Map(Object.entries(tasks)))
    : null;
  const ownerRank = (people && people.length)
    ? new Map(people.map((p, i) => [p.id, i]))
    : null;

  const isLateToday = (entry, done) => {
    if (done || !today || !tasksById) return false;
    const task = tasksById.get(entry.taskId);
    if (!task || task.rotation === 'daily') return false;
    // movedFromDate intentionally NOT checked — using the move flow IS the
    // resolution, so the task should sort normally once it's on today's list.
    if (task.dedicatedDate && task.dedicatedDate < today) return true;
    return false;
  };

  return Object.entries(entries).sort(([kA, a], [kB, b]) => {
    // 1. incomplete before complete
    const doneA = isComplete(kA, completions) ? 1 : 0;
    const doneB = isComplete(kB, completions) ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;

    // 2. owner (people-order when available, else stable alpha)
    if (ownerRank) {
      const aOwn = ownerRank.has(a.ownerId) ? ownerRank.get(a.ownerId) : 999;
      const bOwn = ownerRank.has(b.ownerId) ? ownerRank.get(b.ownerId) : 999;
      if (aOwn !== bOwn) return aOwn - bOwn;
    } else {
      const ownerCmp = (a.ownerId || '').localeCompare(b.ownerId || '');
      if (ownerCmp !== 0) return ownerCmp;
    }

    // 3. late-today first (incomplete only)
    const lateA = isLateToday(a, doneA === 1);
    const lateB = isLateToday(b, doneB === 1);
    if (lateA !== lateB) return lateA ? -1 : 1;

    // 4. time of day
    const todA = todPriority[a.timeOfDay] ?? 1;
    const todB = todPriority[b.timeOfDay] ?? 1;
    if (todA !== todB) return todA - todB;

    // 5. name tiebreaker
    const nameA = tasksById ? (tasksById.get(a.taskId)?.name || '') : '';
    const nameB = tasksById ? (tasksById.get(b.taskId)?.name || '') : '';
    return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
  });
}

/**
 * Group sorted entries into per-person, per-time-of-day buckets.
 * Pure data — caller renders headers + cards and decides where completed entries land.
 *
 * Person order follows the `people` array (matches sortEntries owner ranking).
 * TOD bucket falls back to the task's own timeOfDay, then 'anytime'.
 * Completed entries (per `completions`) are split into a separate `completed` bucket
 * so callers can either render them per-person ('Grouped' mode) or pool them across
 * everyone at the bottom ('Focus' mode).
 *
 * @param {Array<[string, object]>} sortedEntries - From sortEntries(). Pre-sorted [entryKey, entry] pairs.
 * @param {Array} people - People array; order defines person ordering.
 * @param {object} tasks - { taskId: task } — used to resolve timeOfDay fallback.
 * @param {object} [completions] - { entryKey: completionRecord }. Omit to keep all entries in TOD buckets.
 * @returns {Array<{ person, am: Array, anytime: Array, pm: Array, completed: Array }>}
 */
export function groupBySectionsTOD(sortedEntries, people, tasks, completions) {
  const personOrder = (people || []).map(p => p.id);
  const personMap = new Map();
  for (const [entryKey, entry] of (sortedEntries || [])) {
    const pid = entry.ownerId;
    if (!personMap.has(pid)) {
      personMap.set(pid, { person: people?.find(p => p.id === pid), am: [], anytime: [], pm: [], completed: [] });
    }
    if (completions && completions[entryKey]) {
      personMap.get(pid).completed.push([entryKey, entry]);
      continue;
    }
    const tod = entry.timeOfDay || tasks?.[entry.taskId]?.timeOfDay || 'anytime';
    const bucket = tod === 'am' ? 'am' : tod === 'pm' ? 'pm' : 'anytime';
    personMap.get(pid)[bucket].push([entryKey, entry]);
  }
  return [...personMap.entries()]
    .sort(([a], [b]) => personOrder.indexOf(a) - personOrder.indexOf(b))
    .map(([, group]) => group);
}

/**
 * Normalize a saved taskGrouping value to a current key.
 * Renames in 2026-05: 'icons' → 'minimal', 'sections' → 'grouped'.
 * New mode 'focus' has no legacy alias.
 * Empty/unknown falls back to the default ('grouped').
 */
export function normalizeTaskGrouping(value) {
  if (value === 'icons') return 'minimal';
  if (value === 'sections') return 'grouped';
  if (value === 'minimal' || value === 'grouped' || value === 'focus') return value;
  return 'grouped';
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
 * @param {function|null} addDaysFn - optional util.addDays; when provided, recurring events are expanded
 * @returns {object} filtered events for that date
 */
export function getEventsForDate(events, dateKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    const endDate = event.endDate || event.date;
    if (event.date <= dateKey && dateKey <= endDate) {
      result[id] = event;
      continue;
    }
    if (event.repeat && event.repeat.type && event.repeat.type !== 'none' && addDaysFn) {
      const occurrences = expandEventRepeats(event, id, dateKey, dateKey, addDaysFn);
      for (const [vid, vev] of occurrences) {
        result[vid] = vev;
      }
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
 * @param {function|null} addDaysFn - optional util.addDays; when provided, recurring events are expanded
 * @returns {object} filtered events
 */
export function getEventsForRange(events, startKey, endKey, addDaysFn = null) {
  if (!events) return {};
  const result = {};
  for (const [id, event] of Object.entries(events)) {
    const endDate = event.endDate || event.date;
    // Range overlap: event spans [event.date, endDate]; we want [startKey, endKey].
    if (event.date <= endKey && endDate >= startKey) {
      result[id] = event;
    }
    if (event.repeat && event.repeat.type && event.repeat.type !== 'none' && addDaysFn) {
      const occurrences = expandEventRepeats(event, id, startKey, endKey, addDaysFn);
      for (const [vid, vev] of occurrences) {
        if (vid !== id) result[vid] = vev;
      }
    }
  }
  return result;
}

/**
 * Expand a single event's repeat rule into individual occurrences within
 * [startDate, endDate]. Each occurrence is a virtual event carrying the
 * parent event's data with the occurrence date.
 *
 * The original (event.date) is always included if it falls in range — the
 * repeat rule adds only subsequent occurrences.
 *
 * Virtual IDs follow the pattern `${parentId}__rpt_${YYYY-MM-DD}`.
 *
 * @param {object} event - { date, repeat?, ... }
 * @param {string} eventId
 * @param {string} startDate - YYYY-MM-DD inclusive
 * @param {string} endDate - YYYY-MM-DD inclusive
 * @param {function} addDaysFn - util.addDays (passed in to keep state.js pure)
 * @returns {Array<[string, object]>} array of [virtualId, virtualEvent] pairs
 */
export function expandEventRepeats(event, eventId, startDate, endDate, addDaysFn) {
  const out = [];
  if (!event || !event.date) return out;

  // Preserve multi-day duration across occurrences
  let durationDays = 0;
  if (event.endDate && event.endDate > event.date) {
    const start = new Date(`${event.date}T00:00:00Z`);
    const end = new Date(`${event.endDate}T00:00:00Z`);
    durationDays = Math.round((end - start) / 86400000);
  }

  if (event.date >= startDate && event.date <= endDate) {
    out.push([eventId, event]);
  }

  const rule = event.repeat;
  if (!rule || !rule.type || rule.type === 'none') return out;

  const endType = rule.end?.type || 'never';
  const endDateRule = rule.end?.date || null;
  const endCount = rule.end?.count || null;

  const DOW = ['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  const dateToDOW = (dateKey) => {
    const d = new Date(`${dateKey}T00:00:00Z`);
    return DOW[d.getUTCDay()];
  };

  let cur = event.date;
  let occurrences = 1;
  let safety = 0;
  while (safety++ < 5000) {
    let next;
    if (rule.type === 'daily') {
      next = addDaysFn(cur, 1);
    } else if (rule.type === 'weekly') {
      const days = rule.days && rule.days.length > 0 ? new Set(rule.days) : null;
      if (days) {
        let probe = cur;
        for (let i = 0; i < 7; i++) {
          probe = addDaysFn(probe, 1);
          if (days.has(dateToDOW(probe))) { next = probe; break; }
        }
        if (!next) next = addDaysFn(cur, 7);
      } else {
        next = addDaysFn(cur, 7);
      }
    } else if (rule.type === 'monthly') {
      const [, , dayStr] = cur.split('-');
      const targetDay = parseInt(dayStr, 10);
      const d = new Date(`${cur}T00:00:00Z`);
      const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, targetDay));
      next = probe.toISOString().slice(0, 10);
    } else if (rule.type === 'yearly') {
      const d = new Date(`${cur}T00:00:00Z`);
      const probe = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
      next = probe.toISOString().slice(0, 10);
    } else if (rule.type === 'custom') {
      const every = rule.every || 1;
      const unit = rule.unit || 'days';
      if (unit === 'days')        next = addDaysFn(cur, every);
      else if (unit === 'weeks')  next = addDaysFn(cur, every * 7);
      else if (unit === 'months') {
        const d = new Date(`${cur}T00:00:00Z`);
        const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + every, d.getUTCDate()));
        next = probe.toISOString().slice(0, 10);
      } else if (unit === 'years') {
        const d = new Date(`${cur}T00:00:00Z`);
        const probe = new Date(Date.UTC(d.getUTCFullYear() + every, d.getUTCMonth(), d.getUTCDate()));
        next = probe.toISOString().slice(0, 10);
      } else break;
    } else {
      break;
    }

    if (!next || next <= cur) break;
    cur = next;

    if (cur > endDate) break;
    if (endType === 'date' && endDateRule && cur > endDateRule) break;
    occurrences += 1;
    if (endType === 'count' && endCount && occurrences > endCount) break;

    if (cur >= startDate && cur <= endDate) {
      const virtual = { ...event, date: cur };
      if (durationDays > 0) {
        virtual.endDate = addDaysFn(cur, durationDays);
      }
      out.push([`${eventId}__rpt_${cur}`, virtual]);
    }
  }
  return out;
}
