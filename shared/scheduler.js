// scheduler.js — Schedule generation, owner rotation, load balancing, cooldown
// Pure functions. No DOM access. No side effects beyond returned data.
//
// Implementation order (mandatory per spec):
// 1. Basic schedule generation — daily rotation, single owner, no balancing
// 2. Owner rotation — deterministic by period
// 3. Cooldown checks — skip if completed within cooldownDays
// 4. Load balancing — prefer lighter days for non-exempt tasks
// 5. Duplicate-to-all-owners mode — one entry per owner

import {
  todayKey, addDays, dateRange, dayOfWeek, isoWeekNumber,
  monthNumber, yearNumber, weekStart, weekEnd, monthStart, monthEnd, isWeekend
} from './utils.js';

const SCHEDULE_DAYS = 90;

// ============================================================
// Step 1: Basic schedule generation
// ============================================================

/**
 * Determine if a task should appear on a given date based on its rotation.
 * Does NOT handle cooldown or completion checks — those come later.
 *
 * Returns true if the task should be scheduled on this date.
 */
export function shouldTaskAppearOnDate(task, dateKey) {
  // Task must be active
  if (task.status !== 'active') return false;

  // Task cannot appear before its creation date
  if (task.createdDate && dateKey < task.createdDate) return false;

  // No owners means nothing to schedule
  if (!task.owners || task.owners.length === 0) return false;

  const dow = dayOfWeek(dateKey);

  switch (task.rotation) {
    case 'daily':
      return true;

    case 'weekly':
      // If dedicatedDay is set, only appear on that day
      if (task.dedicatedDay != null) {
        return dow === task.dedicatedDay;
      }
      // Default: appears once per week — placement handled by scheduler
      return true;

    case 'monthly':
      // Placement handled by scheduler — appears once per month
      return true;

    case 'once':
      // Placement handled by scheduler — appears once total
      return true;

    default:
      return false;
  }
}

/**
 * Generate schedule entries for a single task on a single date.
 * Step 1: basic — assigns first owner, no rotation or balancing.
 *
 * Returns an array of entry objects (without keys — keys assigned at write time).
 */
function generateBasicEntries(task, taskId, dateKey) {
  const baseEntry = {
    taskId,
    rotationType: task.rotation,
    ownerAssignmentMode: task.ownerAssignmentMode || 'rotate'
  };

  const ownerId = task.owners[0];
  const entries = [];

  if (task.timeOfDay === 'both') {
    entries.push({ ...baseEntry, ownerId, timeOfDay: 'am' });
    entries.push({ ...baseEntry, ownerId, timeOfDay: 'pm' });
  } else {
    entries.push({ ...baseEntry, ownerId, timeOfDay: task.timeOfDay || 'anytime' });
  }

  return entries;
}

// ============================================================
// Step 2: Owner rotation (deterministic by period)
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
    const entries = [];
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
  if (!task.cooldownDays || task.rotation === 'daily') return false;
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
function personDayLoad(personId, dateKey, newDayEntries, existingDayEntries, tasks) {
  let totalMin = 0;
  const counted = new Set();

  // Count from new schedule being built
  if (newDayEntries) {
    for (const [key, entry] of Object.entries(newDayEntries)) {
      if (entry.ownerId !== personId) continue;
      counted.add(key);
      const task = tasks[entry.taskId];
      if (task) {
        const est = task.timeOfDay === 'both' ? Math.ceil(task.estMin / 2) : task.estMin;
        totalMin += est || 0;
      }
    }
  }

  // Count from existing schedule (entries not already in new schedule)
  if (existingDayEntries) {
    for (const [key, entry] of Object.entries(existingDayEntries)) {
      if (entry.ownerId !== personId) continue;
      if (counted.has(key)) continue;
      const task = tasks[entry.taskId];
      if (task) {
        const est = task.timeOfDay === 'both' ? Math.ceil(task.estMin / 2) : task.estMin;
        totalMin += est || 0;
      }
    }
  }

  return totalMin;
}

/**
 * Find the lightest day for a person within a date range.
 * weekendWeight: multiplier for weekend capacity (higher = more available).
 * Considers both the new schedule being built and the existing schedule.
 *
 * Returns the dateKey of the lightest day.
 */
function findLightestDay(personId, dateKeys, futureSchedule, existingSchedule, tasks, weekendWeight) {
  let bestDay = dateKeys[0];
  let bestLoad = Infinity;

  for (const dk of dateKeys) {
    const existingDay = existingSchedule ? existingSchedule[dk] : null;
    const rawLoad = personDayLoad(personId, dk, futureSchedule[dk], existingDay, tasks);
    // Weekend days have higher capacity, so their effective load is lower
    const effectiveLoad = isWeekend(dk) ? rawLoad / weekendWeight : rawLoad;

    if (effectiveLoad < bestLoad) {
      bestLoad = effectiveLoad;
      bestDay = dk;
    }
  }

  return bestDay;
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

  // Process each task
  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.status !== 'active') continue;
    if (!task.owners || task.owners.length === 0) continue;

    const mode = task.ownerAssignmentMode || 'rotate';

    switch (task.rotation) {
      case 'daily':
        placeDailyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeightWeekly, tasks, nextKey);
        break;

      case 'weekly':
        placeWeeklyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeightWeekly, tasks, nextKey);
        break;

      case 'monthly':
        placeMonthlyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeightMonthly, tasks, nextKey);
        break;

      case 'once':
        placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeightWeekly, tasks, nextKey);
        break;
    }
  }

  return newSchedule;
}

/**
 * Place a daily task across all future dates.
 */
function placeDailyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey) {
  for (const dk of futureDates) {
    if (task.createdDate && dk < task.createdDate) continue;

    // Cooldown check (doesn't apply to daily per spec, but guard anyway)
    if (isInCooldown(task, taskId, dk, completions, existingSchedule)) continue;

    const entries = generateRotatedEntries(task, taskId, dk);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[dk][key] = entry;
    }
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
    // Skip if before creation date
    if (task.createdDate && weekDates[weekDates.length - 1] < task.createdDate) continue;

    // Check if already completed this week
    if (isCompletedThisWeek(taskId, weekDates[0], completions, existingSchedule)) continue;

    // Check if already scheduled this week (new schedule + existing schedule including today)
    if (isScheduledThisWeek(taskId, weekDates[0], newSchedule, existingSchedule)) continue;

    // Cooldown check
    if (isInCooldown(task, taskId, weekDates[0], completions, existingSchedule)) continue;

    // Determine owner
    const mode = task.ownerAssignmentMode || 'rotate';
    let ownerId;
    if (mode === 'duplicate') {
      // Duplicate: place for all owners
    } else {
      ownerId = getRotationOwner(task, weekDates[0]);
    }

    // Determine day
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = weekDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      if (!targetDay) targetDay = weekDates[0]; // fallback if dedicated day not in range
    } else if (mode !== 'duplicate' && !task.exempt) {
      // Load balanced: find lightest day for this person
      targetDay = findLightestDay(ownerId, weekDates, newSchedule, existingSchedule, allTasks, weekendWeight);
    } else {
      targetDay = weekDates[0];
    }

    // Filter by creation date
    if (task.createdDate && targetDay < task.createdDate) continue;

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
    // Skip if before creation date
    if (task.createdDate && monthDates[monthDates.length - 1] < task.createdDate) continue;

    // Check if already completed this month
    if (isCompletedThisMonth(taskId, monthDates[0], completions, existingSchedule)) continue;

    // Check if already scheduled this month (new schedule + existing schedule including today)
    if (isScheduledThisMonth(taskId, monthDates[0], newSchedule, existingSchedule)) continue;

    // Cooldown check
    if (isInCooldown(task, taskId, monthDates[0], completions, existingSchedule)) continue;

    // Determine owner
    const mode = task.ownerAssignmentMode || 'rotate';
    let ownerId;
    if (mode !== 'duplicate') {
      ownerId = getRotationOwner(task, monthDates[0]);
    }

    // Pick the best day within the month
    let targetDay;
    if (task.dedicatedDay != null) {
      targetDay = monthDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
    }
    if (!targetDay && mode !== 'duplicate' && !task.exempt) {
      targetDay = findLightestDay(ownerId, monthDates, newSchedule, existingSchedule, allTasks, weekendWeight);
    }
    if (!targetDay) {
      // Default: place in the middle of the month's available days
      targetDay = monthDates[Math.floor(monthDates.length / 2)];
    }

    if (task.createdDate && targetDay < task.createdDate) continue;

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

  const mode = task.ownerAssignmentMode || 'rotate';
  const eligibleDates = futureDates.filter(dk => !task.createdDate || dk >= task.createdDate);
  if (eligibleDates.length === 0) return;

  let ownerId;
  if (mode !== 'duplicate') {
    ownerId = task.owners[0]; // Once tasks always use first owner
  }

  // Find the target day
  let targetDay;
  if (task.dedicatedDate) {
    // Specific date set — place on that exact date if it's in the future
    targetDay = eligibleDates.find(dk => dk === task.dedicatedDate);
    if (!targetDay) return; // date is in the past or out of range
  } else if (task.dedicatedDay != null) {
    targetDay = eligibleDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
  }
  if (!targetDay && mode !== 'duplicate' && !task.exempt) {
    targetDay = findLightestDay(ownerId, eligibleDates.slice(0, 14), newSchedule, existingSchedule, allTasks, weekendWeight);
  }
  if (!targetDay) {
    targetDay = eligibleDates[0];
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

      // Skip if already completed this period
      if (r.rotation === 'weekly' && isCompletedThisWeek(taskId, today, completions, existingSchedule)) continue;
      if (r.rotation === 'monthly' && isCompletedThisMonth(taskId, today, completions, existingSchedule)) continue;

      if (isInCooldown(task, taskId, today, completions, existingSchedule)) continue;

      const mode = task.ownerAssignmentMode || 'rotate';
      let ownerId;
      if (mode !== 'duplicate') {
        ownerId = getRotationOwner(task, r.remainingDates[0]);
      }

      let targetDay;
      if (task.dedicatedDay != null) {
        targetDay = r.remainingDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
      }
      if (!targetDay && mode !== 'duplicate' && !task.exempt) {
        const ww = r.rotation === 'monthly' ? weekendWeightMonthly : weekendWeightWeekly;
        targetDay = findLightestDay(ownerId, r.remainingDates, periodSchedule, cleanSchedule, tasks, ww);
      }
      if (!targetDay) {
        targetDay = r.remainingDates[0];
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

  // 5. Rebuild full future schedule so everything stays consistent
  const mergedSchedule = { ...cleanSchedule };
  for (const [dk, dayEntries] of Object.entries(allPlaced)) {
    mergedSchedule[dk] = { ...(mergedSchedule[dk] || {}), ...dayEntries };
  }

  const futureUpdates = buildScheduleUpdates(tasks, people, settings, completions, mergedSchedule);
  for (const [path, value] of Object.entries(futureUpdates)) {
    const futureDateKey = path.replace('schedule/', '');
    if (futureDateKey >= today && futureDateKey <= maxPeriodEnd) continue;
    updates[path] = value;
  }

  return updates;
}
