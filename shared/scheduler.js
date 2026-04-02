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
 */
function isScheduledThisWeek(taskId, dateKey, futureSchedule) {
  const wStart = weekStart(dateKey);
  const wEnd = weekEnd(dateKey);

  for (const [schedDate, dayEntries] of Object.entries(futureSchedule)) {
    if (schedDate < wStart || schedDate > wEnd) continue;
    if (dayEntries) {
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) return true;
      }
    }
  }
  return false;
}

/**
 * Check if a monthly task is already scheduled this month.
 */
function isScheduledThisMonth(taskId, dateKey, futureSchedule) {
  const mStart = monthStart(dateKey);
  const mEnd = monthEnd(dateKey);

  for (const [schedDate, dayEntries] of Object.entries(futureSchedule)) {
    if (schedDate < mStart || schedDate > mEnd) continue;
    if (dayEntries) {
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) return true;
      }
    }
  }
  return false;
}

/**
 * Check if a once-task is already scheduled or completed anywhere.
 */
function isOnceTaskHandled(taskId, futureSchedule, completions, scheduleData) {
  // Check if already scheduled in future
  for (const dayEntries of Object.values(futureSchedule)) {
    if (dayEntries) {
      for (const entry of Object.values(dayEntries)) {
        if (entry.taskId === taskId) return true;
      }
    }
  }

  // Check if completed anywhere
  if (completions && scheduleData) {
    for (const [entryKey, completion] of Object.entries(completions)) {
      for (const dayEntries of Object.values(scheduleData)) {
        if (dayEntries && dayEntries[entryKey] && dayEntries[entryKey].taskId === taskId) {
          return true;
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
 * Uses existing schedule entries plus any new entries being placed.
 */
function personDayLoad(personId, dateKey, scheduleForDay, tasks) {
  let totalMin = 0;
  if (!scheduleForDay) return 0;

  for (const entry of Object.values(scheduleForDay)) {
    if (entry.ownerId !== personId) continue;
    const task = tasks[entry.taskId];
    if (task) {
      // For AM/PM split, count half the estimate per entry
      const est = task.timeOfDay === 'both' ? Math.ceil(task.estMin / 2) : task.estMin;
      totalMin += est || 0;
    }
  }
  return totalMin;
}

/**
 * Find the lightest day for a person within a date range.
 * weekendWeight: multiplier for weekend capacity (higher = more available).
 *
 * Returns the dateKey of the lightest day.
 */
function findLightestDay(personId, dateKeys, futureSchedule, tasks, weekendWeight) {
  let bestDay = dateKeys[0];
  let bestLoad = Infinity;

  for (const dk of dateKeys) {
    const rawLoad = personDayLoad(personId, dk, futureSchedule[dk], tasks);
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
 * Returns:
 *   { dateKey: { generatedKey: entry } } — new schedule for future dates only.
 *   Does NOT include today or past dates.
 */
export function generateSchedule(tasks, people, settings, completions, existingSchedule) {
  if (!tasks || !people || !settings) return {};

  const timezone = settings.timezone || 'America/Chicago';
  const weekendWeight = settings.weekendWeight || 1.5;
  const today = todayKey(timezone);
  const startDate = addDays(today, 1); // Tomorrow
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
        placeDailyTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, tasks, nextKey);
        break;

      case 'weekly':
        placeWeeklyTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, tasks, nextKey);
        break;

      case 'monthly':
        placeMonthlyTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, tasks, nextKey);
        break;

      case 'once':
        placeOnceTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, tasks, nextKey);
        break;
    }
  }

  return newSchedule;
}

/**
 * Place a daily task across all future dates.
 */
function placeDailyTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, allTasks, nextKey) {
  for (const dk of futureDates) {
    if (task.createdDate && dk < task.createdDate) continue;

    // Cooldown check (doesn't apply to daily per spec, but guard anyway)
    if (isInCooldown(task, taskId, dk, completions, existingSchedule)) continue;

    const entries = generateRotatedEntries(task, taskId, dk);
    for (const entry of entries) {
      // Step 4: Load balancing for rotate mode, non-exempt daily tasks
      // For daily tasks, the day is fixed — balancing only affects owner selection
      // (owner is already determined by rotation for daily tasks)
      const key = nextKey();
      newSchedule[dk][key] = entry;
    }
  }
}

/**
 * Place a weekly task — once per week on the best day.
 */
function placeWeeklyTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, allTasks, nextKey) {
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

    // Check if already scheduled this week in our new schedule
    if (isScheduledThisWeek(taskId, weekDates[0], newSchedule)) continue;

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
      targetDay = findLightestDay(ownerId, weekDates, newSchedule, allTasks, weekendWeight);
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
function placeMonthlyTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, allTasks, nextKey) {
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

    // Check if already scheduled this month
    if (isScheduledThisMonth(taskId, monthDates[0], newSchedule)) continue;

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
      targetDay = findLightestDay(ownerId, monthDates, newSchedule, allTasks, weekendWeight);
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
function placeOnceTask(taskId, task, futureDates, newSchedule, completions, existingSchedule, weekendWeight, allTasks, nextKey) {
  // Check if already handled
  if (isOnceTaskHandled(taskId, newSchedule, completions, existingSchedule)) return;

  const mode = task.ownerAssignmentMode || 'rotate';
  const eligibleDates = futureDates.filter(dk => !task.createdDate || dk >= task.createdDate);
  if (eligibleDates.length === 0) return;

  let ownerId;
  if (mode !== 'duplicate') {
    ownerId = task.owners[0]; // Once tasks always use first owner
  }

  // Find the lightest day
  let targetDay;
  if (task.dedicatedDay != null) {
    targetDay = eligibleDates.find(dk => dayOfWeek(dk) === task.dedicatedDay);
  }
  if (!targetDay && mode !== 'duplicate' && !task.exempt) {
    targetDay = findLightestDay(ownerId, eligibleDates.slice(0, 14), newSchedule, allTasks, weekendWeight);
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
export function buildScheduleUpdates(tasks, people, settings, completions, existingSchedule) {
  const newSchedule = generateSchedule(tasks, people, settings, completions, existingSchedule);
  const updates = {};

  for (const [dateKey, entries] of Object.entries(newSchedule)) {
    const hasEntries = Object.keys(entries).length > 0;
    updates[`schedule/${dateKey}`] = hasEntries ? entries : null;
  }

  return updates;
}
