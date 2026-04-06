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
 * Simple string hash for deterministic per-task tie-breaking.
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Determine the assigned owner for a rotate-mode task on a given date.
 * - daily: deterministic rotation with per-task hash offset so different daily
 *   tasks go to different people on the same day (not all to the same person)
 * - once: first owner
 * - weekly/monthly: delegates to getBalancedOwner for time-based balancing
 *
 * taskId is optional — only needed for daily tasks to compute per-task offset.
 */
export function getRotationOwner(task, dateKey, taskId) {
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
      // Per-task hash offset so different tasks rotate to different people on the same day
      const offset = taskId ? hashCode(taskId) : 0;
      index = (daysSinceEpoch + offset) % owners.length;
      break;
    }
    case 'weekly': {
      // Fallback for callers without balanceCtx — use week-based rotation
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
 * Calculate total estimated minutes for a specific person on a given day.
 * Merges new schedule entries (being built) with existing schedule entries.
 * Includes ALL task types (daily, weekly, monthly, one-time) already placed.
 */
function personDayLoad(personId, dateKey, newDayEntries, existingDayEntries, tasks) {
  let totalMin = 0;
  const counted = new Set();

  if (newDayEntries) {
    for (const [key, entry] of Object.entries(newDayEntries)) {
      if (entry.ownerId !== personId) continue;
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
      if (entry.ownerId !== personId) continue;
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
 * Pick the owner with the least total time on the target day.
 * Considers ALL tasks already placed (daily, weekly, etc.) so the person
 * with the lightest actual workload that day gets the assignment.
 *
 * Tie-breaker: per-task hash + period index ensures different tasks
 * stagger across people and the same person rarely gets the same task
 * in consecutive periods.
 */
function getBalancedOwner(task, taskId, dateKey, newSchedule, existingSchedule, allTasks) {
  const owners = task.owners;
  if (!owners || owners.length === 0) return null;
  if (owners.length === 1) return owners[0];

  const newDay = newSchedule[dateKey] || null;
  const existDay = existingSchedule ? existingSchedule[dateKey] : null;

  // Compute per-person load on this specific day (all task types included)
  const loads = {};
  let minLoad = Infinity;
  for (const oid of owners) {
    loads[oid] = personDayLoad(oid, dateKey, newDay, existDay, allTasks);
    if (loads[oid] < minLoad) minLoad = loads[oid];
  }

  const tied = owners.filter(oid => Math.abs(loads[oid] - minLoad) < 0.01);

  if (tied.length === 1) return tied[0];

  // Tie-breaker: task hash + period index for deterministic anti-repeat
  const taskHash = hashCode(taskId);
  let periodIndex;
  switch (task.rotation) {
    case 'weekly':
      periodIndex = isoWeekNumber(dateKey);
      break;
    case 'monthly':
      periodIndex = monthNumber(dateKey);
      break;
    default:
      periodIndex = 0;
  }

  // Sort tied owners for deterministic ordering, then pick via hash + period
  tied.sort();
  return tied[(taskHash + periodIndex) % tied.length];
}

/**
 * Generate entries with proper owner rotation.
 * For weekly/monthly rotate tasks, uses day-level time-based load balancing.
 * For daily/once/duplicate/fixed, uses deterministic rotation.
 *
 * balanceCtx: { newSchedule, existingSchedule, allTasks } — passed for weekly/monthly
 */
function generateRotatedEntries(task, taskId, dateKey, balanceCtx) {
  const mode = task.ownerAssignmentMode || 'rotate';
  const baseEntry = {
    taskId,
    rotationType: task.rotation,
    ownerAssignmentMode: mode,
    ...(task.notes ? { notes: task.notes } : {})
  };

  const entries = [];

  if (mode === 'duplicate') {
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

  // Rotate mode: pick owner
  // Weekly/monthly: use day-level load balancing (all task types on that day)
  // Daily/once: use deterministic rotation
  let ownerId;
  if (balanceCtx && (task.rotation === 'weekly' || task.rotation === 'monthly')) {
    ownerId = getBalancedOwner(task, taskId, dateKey,
      balanceCtx.newSchedule, balanceCtx.existingSchedule, balanceCtx.allTasks);
  } else {
    ownerId = getRotationOwner(task, dateKey, taskId);
  }

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
 * Calculate total estimated minutes for a specific category on a given day.
 * If personId is provided, returns that person's category load.
 * If personId is null, returns the household total across all people.
 */
function categoryDayLoad(categoryId, personId, dateKey, newSchedule, existingSchedule, tasks) {
  let totalMin = 0;
  const counted = new Set();
  const newDay = newSchedule[dateKey] || null;
  const existDay = existingSchedule ? existingSchedule[dateKey] : null;

  if (newDay) {
    for (const [key, entry] of Object.entries(newDay)) {
      const task = tasks[entry.taskId];
      if (!task || task.category !== categoryId) continue;
      if (personId && entry.ownerId !== personId) continue;
      counted.add(key);
      const raw = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
      totalMin += raw;
    }
  }

  if (existDay) {
    for (const [key, entry] of Object.entries(existDay)) {
      if (counted.has(key)) continue;
      const task = tasks[entry.taskId];
      if (!task || task.category !== categoryId) continue;
      if (personId && entry.ownerId !== personId) continue;
      const raw = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
      totalMin += raw;
    }
  }

  return totalMin;
}

/**
 * Check whether placing a task on a given day would stay within category limits.
 * Returns true if both per-person and per-household limits pass (or aren't set).
 *
 * For duplicate mode: checks each owner independently against per-person limit,
 * and checks combined total against household limit.
 * For rotate/fixed mode: checks the single assigned owner.
 */
function canPlaceUnderCategoryLimit(task, dateKey, categories, newSchedule, existingSchedule, tasks) {
  if (!categories) return true;
  const cat = categories[task.category];
  if (!cat) return true;

  const personLimit = cat.dailyLimitPerPerson;
  const householdLimit = cat.dailyLimitPerHousehold;
  if (!personLimit && !householdLimit) return true;

  const taskMin = task.timeOfDay === 'both' ? Math.ceil((task.estMin || 1) / 2) : (task.estMin || 1);
  // For duplicate mode, total household addition is taskMin * number of owners
  const mode = task.ownerAssignmentMode || 'rotate';
  const ownerCount = mode === 'duplicate' ? (task.owners?.length || 1) : 1;

  // Per-person check: each owner must have room
  // Note: for rotate mode, we check owners[0] as a heuristic. The actual owner
  // is determined later by getBalancedOwner (lightest load), so this may over- or
  // under-restrict in rare cases where owners have very different category loads.
  if (personLimit) {
    const ownersToCheck = mode === 'duplicate' ? task.owners : [task.owners?.[0]];
    for (const ownerId of ownersToCheck) {
      if (!ownerId) continue;
      const current = categoryDayLoad(task.category, ownerId, dateKey, newSchedule, existingSchedule, tasks);
      if (current + taskMin > personLimit) return false;
    }
  }

  // Household check: total across all people
  if (householdLimit) {
    const current = categoryDayLoad(task.category, null, dateKey, newSchedule, existingSchedule, tasks);
    if (current + (taskMin * ownerCount) > householdLimit) return false;
  }

  return true;
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
    ownerAssignmentMode: 'duplicate',
    ...(task.notes ? { notes: task.notes } : {})
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
export function generateSchedule(tasks, people, settings, completions, existingSchedule, options, categories) {
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

  // Balance context passed to weekly/monthly placement for per-day load balancing.
  // getBalancedOwner reads newSchedule + existingSchedule to compute each person's
  // total estMin on the target day (including daily tasks already placed).
  const balanceCtx = { newSchedule, existingSchedule, allTasks: tasks, categories };

  // Process tasks in rotation order: daily → weekly → monthly → once
  // Daily tasks are placed first so weekly/monthly balancing sees them.
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
          placeWeeklyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey, balanceCtx);
          break;
        case 'monthly':
          placeMonthlyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey, balanceCtx);
          break;
        case 'once':
          placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, ww, tasks, nextKey, balanceCtx);
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
function placeWeeklyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey, balanceCtx) {
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
      if (!targetDay) {
        // Dedicated day already passed this week — place on the past date
        // so it appears in the overdue banner instead of pretending it's a today task
        const wStart = weekStart(weekDates[0]);
        const fullWeek = dateRange(wStart, weekEnd(weekDates[0]));
        targetDay = fullWeek.find(dk => dayOfWeek(dk) === task.dedicatedDay);
        if (targetDay) {
          if (!newSchedule[targetDay]) newSchedule[targetDay] = {};
        }
      }
      // Dedicated-day tasks: if over category limit, skip this period
      if (targetDay && !canPlaceUnderCategoryLimit(task, targetDay, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
        continue;
      }
    } else {
      // Try lightest day first, then fall back to other days if over category limit
      // Apply weekend weighting to match findLightestDay behavior
      const sortedDays = [...weekDates].sort((a, b) => {
        const rawA = totalDayLoad(a, newSchedule[a], existingSchedule?.[a], allTasks);
        const rawB = totalDayLoad(b, newSchedule[b], existingSchedule?.[b], allTasks);
        const loadA = isWeekend(a) ? (rawA + 1) / weekendWeight : rawA + 1;
        const loadB = isWeekend(b) ? (rawB + 1) / weekendWeight : rawB + 1;
        return loadA - loadB;
      });
      targetDay = null;
      for (const dk of sortedDays) {
        if (task.createdDate && dk < task.createdDate) continue;
        if (canPlaceUnderCategoryLimit(task, dk, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
          targetDay = dk;
          break;
        }
      }
    }

    if (!targetDay) continue;
    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned via day-level load balancing)
    const entries = generateRotatedEntries(task, taskId, targetDay, balanceCtx);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
  }
}

/**
 * Place a monthly task — once per month, distributed across weeks.
 */
function placeMonthlyTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey, balanceCtx) {
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
      if (!targetDay) {
        // Dedicated day already passed this month — place on the most recent past
        // occurrence so it appears in the overdue banner
        const mStart = monthStart(monthDates[0]);
        const fullMonth = dateRange(mStart, monthEnd(monthDates[0]));
        const pastOccurrences = fullMonth.filter(dk => dayOfWeek(dk) === task.dedicatedDay && dk < monthDates[0]);
        targetDay = pastOccurrences.length > 0 ? pastOccurrences[pastOccurrences.length - 1] : null;
        if (targetDay) {
          if (!newSchedule[targetDay]) newSchedule[targetDay] = {};
        }
      }
      // Dedicated-day tasks: if over category limit, skip this period
      if (targetDay && !canPlaceUnderCategoryLimit(task, targetDay, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
        continue;
      }
    }
    if (!targetDay) {
      // Try days sorted by load, pick first that passes category limit
      // Apply weekend weighting to match findLightestDay behavior
      const sortedDays = [...monthDates].sort((a, b) => {
        const rawA = totalDayLoad(a, newSchedule[a], existingSchedule?.[a], allTasks);
        const rawB = totalDayLoad(b, newSchedule[b], existingSchedule?.[b], allTasks);
        const loadA = isWeekend(a) ? (rawA + 1) / weekendWeight : rawA + 1;
        const loadB = isWeekend(b) ? (rawB + 1) / weekendWeight : rawB + 1;
        return loadA - loadB;
      });
      for (const dk of sortedDays) {
        if (task.createdDate && dk < task.createdDate) continue;
        if (canPlaceUnderCategoryLimit(task, dk, balanceCtx.categories, newSchedule, existingSchedule, allTasks)) {
          targetDay = dk;
          break;
        }
      }
    }

    if (!targetDay) continue;
    if (task.createdDate && targetDay < task.createdDate) continue;

    // 2. Place entries (owner assigned via day-level load balancing)
    const entries = generateRotatedEntries(task, taskId, targetDay, balanceCtx);
    for (const entry of entries) {
      const key = nextKey();
      newSchedule[targetDay][key] = entry;
    }
  }
}

/**
 * Place a once task on the best available future day.
 */
function placeOnceTask(taskId, task, futureDates, newSchedule, existingSchedule, completions, weekendWeight, allTasks, nextKey, balanceCtx) {
  // Check if already handled
  if (isOnceTaskHandled(taskId, newSchedule, completions, existingSchedule)) return;

  const eligibleDates = futureDates.filter(dk => !task.createdDate || dk >= task.createdDate);
  if (eligibleDates.length === 0) return;

  const categories = balanceCtx?.categories;

  // 1. Pick the DAY first
  let targetDay;
  if (task.dedicatedDate) {
    targetDay = eligibleDates.find(dk => dk === task.dedicatedDate);
    // If the dedicated date is in the past, place on the first eligible day
    // (today) so the task still appears in the overdue banner instead of vanishing.
    if (!targetDay && task.dedicatedDate < eligibleDates[0]) {
      targetDay = eligibleDates[0];
    }
    if (!targetDay) return; // date is out of the future window
    // Dedicated-date tasks: if over category limit, skip entirely
    if (!canPlaceUnderCategoryLimit(task, targetDay, categories, newSchedule, existingSchedule, allTasks)) return;
  } else if (task.dedicatedDay != null) {
    // Try the first occurrence, then subsequent ones if over limit
    const dayOccurrences = eligibleDates.filter(dk => dayOfWeek(dk) === task.dedicatedDay);
    targetDay = null;
    for (const dk of dayOccurrences) {
      if (canPlaceUnderCategoryLimit(task, dk, categories, newSchedule, existingSchedule, allTasks)) {
        targetDay = dk;
        break;
      }
    }
  }
  if (!targetDay) {
    // Try days sorted by load, pick first under category limit
    const candidates = eligibleDates.slice(0, 14);
    const sortedDays = [...candidates].sort((a, b) => {
      const rawA = totalDayLoad(a, newSchedule[a], existingSchedule?.[a], allTasks);
      const rawB = totalDayLoad(b, newSchedule[b], existingSchedule?.[b], allTasks);
      const loadA = isWeekend(a) ? (rawA + 1) / weekendWeight : rawA + 1;
      const loadB = isWeekend(b) ? (rawB + 1) / weekendWeight : rawB + 1;
      return loadA - loadB;
    });
    for (const dk of sortedDays) {
      if (canPlaceUnderCategoryLimit(task, dk, categories, newSchedule, existingSchedule, allTasks)) {
        targetDay = dk;
        break;
      }
    }
  }

  if (!targetDay) return;

  const entries = generateRotatedEntries(task, taskId, targetDay);
  for (const entry of entries) {
    const key = nextKey();
    newSchedule[targetDay][key] = entry;
  }
}

// ============================================================
// Single-task cooldown schedule rebuild
// ============================================================

/**
 * Rebuild future schedule entries for a single cooldown task, anchored from a
 * specific date (typically the actual completion date). Deletes stale future
 * entries and re-places the task using its rotation's placement logic.
 *
 * Returns a flat Firebase multi-update object:
 *   { 'schedule/YYYY-MM-DD/entryKey': entry | null }
 * where null deletes stale entries.
 */
export function rebuildSingleTaskSchedule(taskId, task, anchorDate, existingSchedule, completions, people, settings, allTasks, categories) {
  if (!task || !task.cooldownDays || !settings) return {};

  const timezone = settings.timezone || 'America/Chicago';
  const today = todayKey(timezone);
  const startDate = addDays(anchorDate, 1);
  const endDate = addDays(today, SCHEDULE_DAYS);
  if (startDate > endDate) return {};

  const futureDates = dateRange(startDate, endDate);
  const updates = {};

  // 1. Find and null-out all future entries for this task
  for (const dk of futureDates) {
    const dayEntries = existingSchedule[dk];
    if (!dayEntries) continue;
    for (const [ek, entry] of Object.entries(dayEntries)) {
      if (entry.taskId === taskId) {
        updates[`schedule/${dk}/${ek}`] = null;
      }
    }
  }

  // 2. Build a cleaned existingSchedule (without stale entries for this task)
  //    so placement functions see accurate load from other tasks
  const cleanedSchedule = {};
  for (const [dk, dayEntries] of Object.entries(existingSchedule || {})) {
    if (!dayEntries) continue;
    const cleaned = {};
    for (const [ek, entry] of Object.entries(dayEntries)) {
      // Keep entries from other tasks, and completed entries for this task
      if (entry.taskId !== taskId || (completions && completions[ek])) {
        cleaned[ek] = entry;
      }
    }
    if (Object.keys(cleaned).length > 0) cleanedSchedule[dk] = cleaned;
  }

  // 3. Place the task using its rotation logic
  const newSchedule = {};
  for (const dk of futureDates) {
    newSchedule[dk] = {};
  }

  let keyCounter = 0;
  function nextKey() {
    keyCounter++;
    return `sched_${Date.now()}_${String(keyCounter).padStart(5, '0')}`;
  }

  const weekendWeightWeekly = settings.weekendWeightWeekly ?? settings.weekendWeight ?? 1.5;
  const weekendWeightMonthly = settings.weekendWeightMonthly ?? settings.weekendWeight ?? 3;
  const balanceCtx = { newSchedule, existingSchedule: cleanedSchedule, allTasks, categories };

  // Inject a synthetic entry at anchorDate so placeDailyTask sees it as the
  // most recent placement and spaces cooldown from there.
  // ONLY used for daily rotation — weekly/monthly use isScheduledThisWeek/Month
  // checks that would incorrectly treat the synthetic anchor as a real placement.
  const anchoredSchedule = { ...cleanedSchedule };
  if (task.rotation === 'daily') {
    if (!anchoredSchedule[anchorDate]) anchoredSchedule[anchorDate] = {};
    anchoredSchedule[anchorDate] = { ...anchoredSchedule[anchorDate], _cooldownAnchor: { taskId } };
  }

  switch (task.rotation) {
    case 'daily':
      placeDailyTask(taskId, task, futureDates, newSchedule, anchoredSchedule, completions, weekendWeightWeekly, allTasks, nextKey);
      break;
    case 'weekly':
      placeWeeklyTask(taskId, task, futureDates, newSchedule, cleanedSchedule, completions, weekendWeightWeekly, allTasks, nextKey, balanceCtx);
      break;
    case 'monthly':
      placeMonthlyTask(taskId, task, futureDates, newSchedule, cleanedSchedule, completions, weekendWeightMonthly, allTasks, nextKey, balanceCtx);
      break;
  }

  // 4. Merge new entries into updates
  for (const [dk, dayEntries] of Object.entries(newSchedule)) {
    for (const [ek, entry] of Object.entries(dayEntries)) {
      updates[`schedule/${dk}/${ek}`] = entry;
    }
  }

  return updates;
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
export function buildScheduleUpdates(tasks, people, settings, completions, existingSchedule, options, categories) {
  const { clearPast = false } = options || {};
  const newSchedule = generateSchedule(tasks, people, settings, completions, existingSchedule, options, categories);
  const updates = {};

  // Optionally wipe all past date nodes entirely
  if (clearPast) {
    const timezone = settings.timezone || 'America/Chicago';
    const today = todayKey(timezone);
    for (const dk of Object.keys(existingSchedule || {})) {
      if (dk >= today) continue;
      updates[`schedule/${dk}`] = null;
    }
  }

  for (const [dateKey, entries] of Object.entries(newSchedule)) {
    const hasEntries = Object.keys(entries).length > 0;
    updates[`schedule/${dateKey}`] = hasEntries ? entries : null;
  }

  return updates;
}

