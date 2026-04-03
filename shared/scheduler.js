// scheduler.js — Schedule generation, owner rotation, load balancing, cooldown (v2)
// Pure functions. No DOM access. No side effects beyond returned data.

import {
  todayKey, addDays, dateRange, dayOfWeek, isoWeekNumber,
  monthNumber, yearNumber, weekStart, weekEnd, monthStart, monthEnd, isWeekend
} from './utils.js';

const SCHEDULE_DAYS = 90;

// ============================================================
// Owner rotation (deterministic by period)
// ============================================================

/**
 * Determine the assigned owner for a rotate-mode task on a given date.
 * Rotation is deterministic: same inputs always produce the same owner.
 *
 * - daily: rotate by day index (days since epoch mod owner count)
 * - weekly: ISO week number mod owner count
 * - monthly: month number mod owner count
 * - once: first owner
 */
export function getRotationOwner(task, dateKey) {
  const owners = task.owners;
  if (!owners || owners.length === 0) return null;
  if (owners.length === 1) return owners[0];

  let index;
  switch (task.rotation) {
    case 'daily': {
      // Days since a fixed epoch for consistent rotation
      const d = new Date(dateKey + 'T00:00:00Z');
      const epoch = new Date('2024-01-01T00:00:00Z');
      const daysSinceEpoch = Math.floor((d - epoch) / 86400000);
      index = daysSinceEpoch % owners.length;
      break;
    }
    case 'weekly': {
      const week = isoWeekNumber(dateKey);
      index = week % owners.length;
      break;
    }
    case 'monthly': {
      const month = monthNumber(dateKey);
      index = month % owners.length;
      break;
    }
    case 'once':
    default:
      index = 0;
      break;
  }

  return owners[index];
}

/**
 * Generate entries with proper owner rotation.
 * Replaces basic single-owner assignment for rotate mode.
 */
function generateRotatedEntries(task, taskId, dateKey) {
  const mode = task.ownerAssignmentMode || 'rotate';
  const baseEntry = {
    taskId,
    rotationType: task.rotation,
    ownerAssignmentMode: mode
  };

  const entries = [];

  if (mode === 'duplicate') {
    // Step 5: handled separately — fall through to basic for now
    // (will be filled in by generateDuplicateEntries)
    return generateDuplicateEntries(task, taskId, dateKey);
  }

  if (mode === 'fixed') {
    // Fixed mode (events): always first owner, no rotation
    const ownerId = task.owners[0];
    if (task.timeOfDay === 'both') {
      entries.push({ ...baseEntry, ownerId, timeOfDay: 'am' });
      entries.push({ ...baseEntry, ownerId, timeOfDay: 'pm' });
    } else {
      entries.push({ ...baseEntry, ownerId, timeOfDay: task.timeOfDay || 'anytime' });
    }
    return entries;
  }

  // Rotate mode: one owner per period
  const ownerId = getRotationOwner(task, dateKey);

  if (task.timeOfDay === 'both') {
    entries.push({ ...baseEntry, ownerId, timeOfDay: 'am' });
    entries.push({ ...baseEntry, ownerId, timeOfDay: 'pm' });
  } else {
    entries.push({ ...baseEntry, ownerId, timeOfDay: task.timeOfDay || 'anytime' });
  }

  return entries;
}

// ============================================================
// Step 3: Cooldown checks
// ============================================================

/**
 * Check if a task is in cooldown based on completion records.
 *
 * completions: object of { entryKey: { completedAt, ... } }
 * scheduleData: full schedule object { dateKey: { entryKey: entry } }
 * task: the task object
 * dateKey: the date we're checking placement for
 *
 * Returns true if the task is in cooldown (should NOT be scheduled).
 */
export function isInCooldown(task, taskId, dateKey, completions, scheduleData) {
  if (!task.cooldownDays) return false;
  if (!completions || !scheduleData) return false;

  const cooldownStart = addDays(dateKey, -task.cooldownDays);

  // Look through completions to find any completion of this task within the cooldown window
  for (const [entryKey, completion] of Object.entries(completions)) {
    // Find which schedule entry this completion belongs to
    for (const [schedDate, dayEntries] of Object.entries(scheduleData)) {
      if (schedDate < cooldownStart || schedDate > dateKey) continue;
      if (dayEntries && dayEntries[entryKey] && dayEntries[entryKey].taskId === taskId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a weekly task has already been completed this week.
 */
export function isCompletedThisWeek(taskId, dateKey, completions, scheduleData) {
  if (!completions || !scheduleData) return false;

  const wStart = weekStart(dateKey);
  const wEnd = weekEnd(dateKey);

  for (const [entryKey, completion] of Object.entries(completions)) {
    for (const [schedDate, dayEntries] of Object.entries(scheduleData)) {
      if (schedDate < wStart || schedDate > wEnd) continue;
      if (dayEntries && dayEntries[entryKey] && dayEntries[entryKey].taskId === taskId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a monthly task has already been completed this month.
 */
export function isCompletedThisMonth(taskId, dateKey, completions, scheduleData) {
  if (!completions || !scheduleData) return false;

  const mStart = monthStart(dateKey);
  const mEnd = monthEnd(dateKey);

  for (const [entryKey, completion] of Object.entries(completions)) {
    for (const [schedDate, dayEntries] of Object.entries(scheduleData)) {
      if (schedDate < mStart || schedDate > mEnd) continue;
      if (dayEntries && dayEntries[entryKey] && dayEntries[entryKey].taskId === taskId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a weekly task is already scheduled this week (to avoid duplicates).
 * Checks both the new schedule being built AND existing schedule (includes today).
 */
function isScheduledThisWeek(taskId, dateKey, futureSchedule, existingSchedule) {
  const wStart = weekStart(dateKey);
  const wEnd = weekEnd(dateKey);

  // Check the new schedule being built
  for (const [schedDate, dayEntries] of Object.entries(futureSchedule)) {
    if (schedDate < wStart || schedDate > wEnd) continue;
    if (dayEntries) {
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) return true;
      }
    }
  }

  // Check existing schedule (today + past entries not in newSchedule)
  if (existingSchedule) {
    for (const [schedDate, dayEntries] of Object.entries(existingSchedule)) {
      if (schedDate < wStart || schedDate > wEnd) continue;
      // Skip dates that are in futureSchedule (those are being rebuilt)
      if (futureSchedule[schedDate] !== undefined) continue;
      if (dayEntries) {
        for (const entry of Object.values(dayEntries)) {
          if (entry.taskId === taskId) return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a monthly task is already scheduled this month.
 * Checks both the new schedule being built AND existing schedule (includes today).
 */
function isScheduledThisMonth(taskId, dateKey, futureSchedule, existingSchedule) {
  const mStart = monthStart(dateKey);
  const mEnd = monthEnd(dateKey);

  // Check the new schedule being built
  for (const [schedDate, dayEntries] of Object.entries(futureSchedule)) {
    if (schedDate < mStart || schedDate > mEnd) continue;
    if (dayEntries) {
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) return true;
      }
    }
  }

  // Check existing schedule (today + past entries not in newSchedule)
  if (existingSchedule) {
    for (const [schedDate, dayEntries] of Object.entries(existingSchedule)) {
      if (schedDate < mStart || schedDate > mEnd) continue;
      if (futureSchedule[schedDate] !== undefined) continue;
      if (dayEntries) {
        for (const entry of Object.values(dayEntries)) {
          if (entry.taskId === taskId) return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a once-task is already scheduled or completed anywhere.
 */
function isOnceTaskHandled(taskId, futureSchedule, completions, scheduleData) {
  // Check if already scheduled in future (being built)
  for (const dayEntries of Object.values(futureSchedule)) {
    if (dayEntries) {
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) return true;
      }
    }
  }

  // Check existing schedule (today + past) for any entry with this taskId
  if (scheduleData) {
    for (const dayEntries of Object.values(scheduleData)) {
      if (dayEntries) {
        for (const entry of Object.values(dayEntries)) {
          if (entry.taskId === taskId) return true;
        }
      }
    }
  }

  return false;
}

// ============================================================
// Step 4: Load balancing
// ============================================================

/**
 * Calculate the total estimated minutes for a person on a given day.
 * Merges new schedule entries (being built) with existing schedule entries.
 */
/**
 * Calculate total estimated minutes on a day across ALL people (global load).
 * Used for day-level decisions like weekend weighting.
 */
function totalDayLoad(dateKey, newDayEntries, existingDayEntries, tasks) {
  let totalMin = 0;
  const counted = new Set();

  if (newDayEntries) {
    for (const [key, entry] of Object.entries(newDayEntries)) {
      counted.add(key);
      const task = tasks[entry.taskId];
      if (task) {
        const raw = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
        totalMin += raw;
      }
    }
  }

  if (existingDayEntries) {
    for (const [key, entry] of Object.entries(existingDayEntries)) {
      if (counted.has(key)) continue;
      const task = tasks[entry.taskId];
      if (task) {
        const raw = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
        totalMin += raw;
      }
    }
  }

  return totalMin;
}

/**
 * Find the lightest day within a date range using global load + weekend weighting.
 * Uses total load across ALL people so weekend preference works as a global signal
 * and tasks from different owners don't pile on the same day independently.
 *
 * Returns the dateKey of the lightest day.
 */
function findLightestDay(dateKeys, futureSchedule, existingSchedule, tasks, weekendWeight) {
  const candidates = [];
  for (const dk of dateKeys) {
    const existingDay = existingSchedule ? existingSchedule[dk] : null;
    const rawLoad = totalDayLoad(dk, futureSchedule[dk], existingDay, tasks);
    // Baseline of 1 ensures weekend weight has effect even on empty days
    const effectiveLoad = isWeekend(dk) ? (rawLoad + 1) / weekendWeight : rawLoad + 1;
    candidates.push({ dk, effectiveLoad });
  }

  // Find minimum load, then collect all days tied at that load
  const minLoad = Math.min(...candidates.map(c => c.effectiveLoad));
  const tied = candidates.filter(c => Math.abs(c.effectiveLoad - minLoad) < 0.001);

  // Pick randomly among tied days so tasks spread across all equal options
  return tied[Math.floor(Math.random() * tied.length)].dk;
}

// ============================================================
// Step 5: Duplicate-to-all-owners mode
// ============================================================

/**
 * Generate entries for duplicate mode — one entry per owner.
 */
function generateDuplicateEntries(task, taskId, dateKey) {
  const entries = [];
  const baseEntry = {
    taskId,
    rotationType: task.rotation,
    ownerAssignmentMode: 'duplicate'
  };

  for (const ownerId of task.owners) {
    if (task.timeOfDay === 'both') {
      entries.push({ ...baseEntry, ownerId, timeOfDay: 'am' });
      entries.push({ ...baseEntry, ownerId, timeOfDay: 'pm' });
    } else {
      entries.push({ ...baseEntry, ownerId, timeOfDay: task.timeOfDay || 'anytime' });
    }
  }

  return entries;
}

// ============================================================
// Main schedule generation
// ============================================================

/**
 * Generate the full 90-day rolling schedule.
 *
 * Parameters:
 *   tasks: { taskId: taskObject } — all tasks
 *   people: { personId: personObject } — all people
 *   settings: app settings (timezone, weekendWeight)
 *   completions: { entryKey: completionRecord } — existing completions
 *   existingSchedule: { dateKey: { entryKey: entry } } — current full schedule
 *
 * Options:
 *   includeToday: if true, includes today in the generated schedule (for forced rebuild).
 *                 Default false — today is excluded to preserve existing entry keys & completions.
 *
 * Returns:
 *   { dateKey: { generatedKey: entry } } — new schedule for future dates (and optionally today).
 */
export function generateSchedule(tasks, people, settings, completions, existingSchedule, options) {
  if (!tasks || !people || !settings) return {};

  const { includeToday = false } = options || {};
  const timezone = settings.timezone || 'America/Chicago';
  const weekendWeightWeekly = settings.weekendWeightWeekly ?? settings.weekendWeight ?? 1.5;
  const weekendWeightMonthly = settings.weekendWeightMonthly ?? settings.weekendWeight ?? 3;
  const today = todayKey(timezone);
  const startDate = includeToday ? today : addDays(today, 1);
  const endDate = addDays(today, SCHEDULE_DAYS);
  const futureDates = dateRange(startDate, endDate);

  // When rebuilding (includeToday), strip uncompleted entries from existingSchedule
  // for dates being rebuilt. This lets isScheduledThisWeek/Month re-place tasks
  // that were on old dates (e.g. weekdays) onto better ones (e.g. weekends).
  if (includeToday && existingSchedule) {
    existingSchedule = { ...existingSchedule };
    const completedKeys = new Set(Object.keys(completions || {}));
    for (const dk of futureDates) {
      if (!existingSchedule[dk]) continue;
      const cleaned = {};
      for (const [ek, entry] of Object.entries(existingSchedule[dk])) {
        if (completedKeys.has(ek)) {
          cleaned[ek] = entry; // keep completed entries
        }
        // drop uncompleted entries — they'll be regenerated
      }
      if (Object.keys(cleaned).length > 0) {
        existingSchedule[dk] = cleaned;
      } else {
        delete existingSchedule[dk];
      }
    }
  }

  // The new schedule we're building (future dates only)
  const newSchedule = {};

  // Initialize all future dates
  for (const dk of futureDates) {
    newSchedule[dk] = {};
  }

  // Counter for generating unique keys within this run
  let keyCounter = 0;
  function nextKey() {
    keyCounter++;
    // Generate a key that sorts chronologically like Firebase push IDs
    return `sched_${Date.now()}_${String(keyCounter).padStart(5, '0')}`;
  }

  // Process tasks in rotation order: daily → weekly → monthly → once
  // This ensures weekly load is established before monthly picks days,
  // and weekend weighting works as a global signal across all tasks.
  const taskEntries = Object.entries(tasks).filter(([_, t]) => t.status === 'active' && t.owners?.length > 0);
  const rotationOrder = ['daily', 'weekly', 'monthly', 'once'];
  for (const rotation of rotationOrder) {
    for (const [taskId, task] of taskEntries) {
      if (task.rotation !== rotation) continue;
      const ww = rotation === 'monthly' ? weekendWeightMonthly : weekendWeightWeekly;
      switch (rotation) {
        case 'daily':
          placeDailyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey);
          break;
        case 'weekly':
          placeWeeklyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey);
          break;
        case 'monthly':
          placeMonthlyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey);
          break;
        case 'once':
          placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey);
          break;
      }
    }
  }

  return newSchedule;
}

/**
 * Place a daily task across all future dates.
 * If cooldownDays is set, space entries at fixed intervals (every cooldownDays+1 days).
 */
function placeDailyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey) {
  let lastPlacedDate = null;

  // If cooldown is set, check existing schedule for the most recent entry of this task
  // so we continue the correct cadence from where we left off
  if (task.cooldownDays) {
    for (const [dateKey, dayEntries] of Object.entries(existingSchedule || {})) {
      if (!dayEntries) continue;
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) {
          if (!lastPlacedDate || dateKey > lastPlacedDate) lastPlacedDate = dateKey;
        }
      }
    }
  }

  for (const dk of futureDates) {
    if (task.createdDate && dk < task.createdDate) continue;

    // Fixed-interval spacing: skip if within cooldown window of last placed entry
    // cooldownDays + 1 days apart (e.g., cooldownDays=1 → every other day)
    if (task.cooldownDays && lastPlacedDate) {
      const minNextDate = addDays(lastPlacedDate, task.cooldownDays + 1);
      if (dk < minNextDate) continue;
    }

    const entries = generateRotatedEntries(task, taskId, dk);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[dk][key] = entry;
    }
    if (task.cooldownDays) lastPlacedDate = dk;
  }
}

/**
 * Place a weekly task — once per week on the best day.
 */
function placeWeeklyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey) {
  // Group future dates by ISO week
  const weekGroups = {};
  for (const dk of futureDates) {
    const wk = `${yearNumber(dk)}-W${String(isoWeekNumber(dk)).padStart(2, '0')}`;
    if (!weekGroups[wk]) weekGroups[wk] = [];
    weekGroups[wk].push(dk);
  }

  for (const [weekKey, weekDates] of Object.entries(weekGroups)) {
    if (task.createdDate && weekDates[weekDates.length - 1] < task.createdDate) continue;
    if (isCompletedThisWeek(taskId, weekDates[0], completions, existingSchedule)) continue;
    if (isScheduledThisWeek(taskId, weekDates[0], newSchedule, existingSchedule)) continue;
    if (isInCooldown(task, taskId, weekDates[0], completions, existingSchedule)) continue;

    // 1. Pick the DAY first (global load + weekend weight)
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = weekDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      if (!targetDay) targetDay = weekDates[0];
    } else {
      targetDay = findLightestDay(weekDates, newSchedule, existingSchedule, allTasks, weekendWeight);
    }

    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned inside generateRotatedEntries)
    const entries = generateRotatedEntries(task, taskId, targetDay);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
  }
}

/**
 * Place a monthly task — once per month, distributed across weeks.
 */
function placeMonthlyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey) {
  // Group future dates by month
  const monthGroups = {};
  for (const dk of futureDates) {
    const mk = `${yearNumber(dk)}-${String(monthNumber(dk)).padStart(2, '0')}`;
    if (!monthGroups[mk]) monthGroups[mk] = [];
    monthGroups[mk].push(dk);
  }

  for (const [monthKey, monthDates] of Object.entries(monthGroups)) {
    if (task.createdDate && monthDates[monthDates.length - 1] < task.createdDate) continue;
    if (isCompletedThisMonth(taskId, monthDates[0], completions, existingSchedule)) continue;
    if (isScheduledThisMonth(taskId, monthDates[0], newSchedule, existingSchedule)) continue;
    if (isInCooldown(task, taskId, monthDates[0], completions, existingSchedule)) continue;

    // 1. Pick the DAY first (global load + weekend weight)
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = monthDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
    }
    if (!targetDay) {
      targetDay = findLightestDay(monthDates, newSchedule, existingSchedule, allTasks, weekendWeight);
    }

    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned inside generateRotatedEntries)
    const entries = generateRotatedEntries(task, taskId, targetDay);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
  }
}

/**
 * Place a once task on the best available future day.
 */
function placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey) {
  // Check if already handled
  if (isOnceTaskHandled(taskId, newSchedule, completions, existingSchedule)) return;

  const eligibleDates = futureDates.filter(dk => !task.createdDate || dk >= task.createdDate);
  if (eligibleDates.length === 0) return;

  // 1. Pick the DAY first
  let targetDay;
  if (task.dedicatedDate) {
    targetDay = eligibleDates.find(dk => dk === task.dedicatedDate);
    if (!targetDay) return; // date is in the past or out of range
  } else if (task.dedicatedDay != null) {
    targetDay = eligibleDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
  }
  if (!targetDay) {
    targetDay = findLightestDay(eligibleDates.slice(0, 14), newSchedule, existingSchedule, allTasks, weekendWeight);
  }

  const entries = generateRotatedEntries(task, taskId, targetDay);
  for (const entry of entries) {
    const key = nextKey();
    newSchedule[targetDay][key] = entry;
  }
}

// ============================================================
// Schedule write orchestration
// ============================================================

/**
 * Build the schedule and return the Firebase multi-update payload.
 * This is the function pages call to trigger schedule regeneration.
 *
 * Returns an object of { 'schedule/YYYY-MM-DD': { entries } | null }
 * for all future dates. null values clear dates with no entries.
 */
export function buildScheduleUpdates(tasks, people, settings, completions, existingSchedule, options) {
  const newSchedule = generateSchedule(tasks, people, settings, completions, existingSchedule, options);
  const updates = {};

  for (const [dateKey, entries] of Object.entries(newSchedule)) {
    const hasEntries = Object.keys(entries).length > 0;
    updates[`schedule/${dateKey}`] = hasEntries ? entries : null;
  }

  return updates;
}

/**
 * Reset the current week, month, or both: remove uncompleted entries for the
 * period's weekly/monthly tasks, then re-place them across today → end of period
 * using load balancing. Also rebuilds the full future schedule afterward.
 *
 * period: 'week' | 'month' | 'all'
 *   - 'week':  reset weekly tasks into today → end of week
 *   - 'month': reset monthly tasks into today → end of month
 *   - 'all':   reset weekly into remaining week + monthly into remaining month
 *
 * Returns a Firebase multi-update payload.
 */
export function buildPeriodResetUpdates(period, tasks, people, settings, completions, existingSchedule) {
  const timezone = settings.timezone || 'America/Chicago';
  const weekendWeightWeekly = settings.weekendWeightWeekly ?? settings.weekendWeight ?? 1.5;
  const weekendWeightMonthly = settings.weekendWeightMonthly ?? settings.weekendWeight ?? 3;
  const today = todayKey(timezone);

  // Which rotation types to reset, and their date windows
  const resets = [];
  if (period === 'week' || period === 'all') {
    resets.push({
      rotation: 'weekly',
      periodStart: weekStart(today),
      periodEnd: weekEnd(today),
      remainingDates: dateRange(today, weekEnd(today))
    });
  }
  if (period === 'month' || period === 'all') {
    resets.push({
      rotation: 'monthly',
      periodStart: monthStart(today),
      periodEnd: monthEnd(today),
      remainingDates: dateRange(today, monthEnd(today))
    });
  }

  const updates = {};
  const completedKeys = new Set(Object.keys(completions || {}));

  // 1. Remove uncompleted entries for each rotation type within its period
  for (const r of resets) {
    for (const [dk, dayEntries] of Object.entries(existingSchedule || {})) {
      if (dk < r.periodStart || dk > r.periodEnd) continue;
      if (!dayEntries) continue;
      for (const [entryKey, entry] of Object.entries(dayEntries)) {
        const task = tasks[entry.taskId];
        if (!task || task.rotation !== r.rotation) continue;
        if (completedKeys.has(entryKey)) continue;
        updates[`schedule/${dk}/${entryKey}`] = null;
      }
    }
  }

  // 2. Build clean existing schedule (without removed entries)
  const cleanSchedule = {};
  for (const [dk, dayEntries] of Object.entries(existingSchedule || {})) {
    if (!dayEntries) continue;
    cleanSchedule[dk] = {};
    for (const [ek, entry] of Object.entries(dayEntries)) {
      if (updates[`schedule/${dk}/${ek}`] === null) continue;
      cleanSchedule[dk][ek] = entry;
    }
  }

  // 3. Place tasks for each reset period
  const allPlaced = {}; // combined new placements across all resets
  let keyCounter = 0;
  function nextKey() {
    keyCounter++;
    return `sched_${Date.now()}_reset_${String(keyCounter).padStart(5, '0')}`;
  }

  // Track the outermost period end for future rebuild exclusion
  let maxPeriodEnd = today;

  for (const r of resets) {
    if (r.periodEnd > maxPeriodEnd) maxPeriodEnd = r.periodEnd;

    const periodSchedule = {};
    for (const dk of r.remainingDates) {
      periodSchedule[dk] = allPlaced[dk] ? { ...allPlaced[dk] } : {};
    }

    for (const [taskId, task] of Object.entries(tasks)) {
      if (task.status !== 'active') continue;
      if (task.rotation !== r.rotation) continue;
      if (!task.owners || task.owners.length === 0) continue;

      // Reset ignores prior completions — re-place all tasks into remaining days

      // Pick DAY first (global load + weekend weight), then owner assigned in generateRotatedEntries
      let targetDay;
      if (task.dedicatedDay != null) {
        targetDay = r.remainingDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      }
      if (!targetDay) {
        const ww = r.rotation === 'monthly' ? weekendWeightMonthly : weekendWeightWeekly;
        targetDay = findLightestDay(r.remainingDates, periodSchedule, cleanSchedule, tasks, ww);
      }

      if (task.createdDate && targetDay < task.createdDate) continue;

      const entries = generateRotatedEntries(task, taskId, targetDay);
      for (const entry of entries) {
        const key = nextKey();
        periodSchedule[targetDay][key] = entry;
      }
    }

    // Merge into allPlaced
    for (const [dk, dayEntries] of Object.entries(periodSchedule)) {
      allPlaced[dk] = { ...(allPlaced[dk] || {}), ...dayEntries };
    }
  }

  // 4. Write new period entries into updates
  for (const [dk, dayEntries] of Object.entries(allPlaced)) {
    for (const [key, entry] of Object.entries(dayEntries)) {
      updates[`schedule/${dk}/${key}`] = entry;
    }
  }

  // 5. Rebuild full future schedule (after the reset period) so everything stays consistent.
  //    Merge cleanSchedule + period placements so the rebuild sees correct load state.
  const mergedSchedule = { ...cleanSchedule };
  for (const [dk, dayEntries] of Object.entries(allPlaced)) {
    mergedSchedule[dk] = { ...(mergedSchedule[dk] || {}), ...dayEntries };
  }

  // Rebuild from tomorrow onward (default). The period dates are already handled above,
  // so we only take entries AFTER the period from the rebuild output.
  const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, mergedSchedule, { includeToday: true });
  for (const [path, value] of Object.entries(futureUpdates)) {
    // Path format: "schedule/YYYY-MM-DD"
    const futureDateKey = path.substring(9); // strip "schedule/"
    if (futureDateKey <= maxPeriodEnd) continue;
    updates[path] = value;
  }

  return updates;
}
