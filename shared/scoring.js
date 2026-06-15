// scoring.js — Points formula, grade calculation, snapshot creation, aggregation (v2)
// Pure functions. No DOM. No Firebase writes (pages handle persistence).


// ── Difficulty multipliers ──

export const DEFAULT_DIFFICULTY_MULTIPLIERS = { easy: 1, medium: 2, hard: 3 };
const MIN_EST_MIN = 5;

// ── Grade table (descending order for lookup) ──
//
// SB4: softened from a standard academic curve for a family motivation product.
// Grades are RETROSPECTIVE only (X1 removed live grades) — but a kid who did
// half their chores last week shouldn't see a red "F" in the rear-view. So:
// passing (C- or better) starts at ~46%, and F is reserved for genuinely low
// effort (below 28%). gradeTier() below mirrors these bands so the red badge /
// faintest heatmap cell only appear under 28%.
const GRADE_TABLE = [
  { min: 95, grade: 'A+' },
  { min: 88, grade: 'A' },
  { min: 82, grade: 'A-' },
  { min: 76, grade: 'B+' },
  { min: 70, grade: 'B' },
  { min: 64, grade: 'B-' },
  { min: 58, grade: 'C+' },
  { min: 52, grade: 'C' },
  { min: 46, grade: 'C-' },
  { min: 40, grade: 'D+' },
  { min: 34, grade: 'D' },
  { min: 28, grade: 'D-' },
  { min: 0,  grade: 'F' }
];

// ── Core calculations ──

/**
 * Calculate base points for a task.
 * Formula: max(estMin, 5) × difficultyMultiplier.
 * Both operands are integers, so the result is an integer with no rounding.
 *
 * @param {object} task - The task definition
 * @param {object} [difficultyMultipliers] - Per-family multipliers; falls back to defaults
 * @returns {number} integer base points
 */
export function basePoints(task, difficultyMultipliers) {
  const mults = difficultyMultipliers || DEFAULT_DIFFICULTY_MULTIPLIERS;
  const mult = mults[task.difficulty] ?? 1;
  const est = Math.max(task.estMin || 0, MIN_EST_MIN);
  return est * mult;
}

/**
 * Get the letter grade for a percentage (0–100+).
 */
export function letterGrade(pct) {
  const clamped = Math.round(pct);
  for (const row of GRADE_TABLE) {
    if (clamped >= row.min) return row.grade;
  }
  return 'F';
}

/**
 * Get a CSS-friendly grade tier key for coloring.
 * Returns 'a', 'b', 'c', 'd', or 'f'.
 */
export function gradeTier(pct) {
  // SB4: bands mirror the softened GRADE_TABLE above so color severity matches
  // the letter. 'f' (red badge / faintest heatmap) is reserved for below 28%.
  const clamped = Math.round(pct);
  if (clamped >= 82) return 'a';
  if (clamped >= 64) return 'b';
  if (clamped >= 46) return 'c';
  if (clamped >= 28) return 'd';
  return 'f';
}

// ── Daily scoring ──

/**
 * Calculate earned points for a single entry.
 * Uses pointsOverride if set (late penalty or manual slider), otherwise base points.
 *
 * @param {object} task - The task definition
 * @param {object|null} completion - The completion record (or null if incomplete)
 * @returns {number} earned points (0 if not completed)
 */
export function earnedPoints(task, completion, difficultyMultipliers) {
  if (!completion) return 0;
  return applyOverride(basePoints(task, difficultyMultipliers), completion);
}

/**
 * Apply a completion's pointsOverride percentage to a precomputed base.
 * Single home for the override math (was inlined in dailyScore/buildSnapshot).
 */
function applyOverride(basePts, completion) {
  if (completion?.pointsOverride != null) {
    return Math.round(basePts * (completion.pointsOverride / 100));
  }
  return basePts;
}

/**
 * Calculate the possible points for a set of entries for one person.
 * Handles weighted categories — weighted tasks get dynamic base points.
 *
 * @param {object} entries - { entryKey: entry } for a single day, single person
 * @param {object} tasks - All task definitions
 * @param {object} categories - All category definitions
 * @returns {{ possible: number, pointsMap: object }}
 *   pointsMap: { entryKey: possiblePoints } for each entry
 */
export function dailyPossible(entries, tasks, categories, difficultyMultipliers) {
  if (!entries || Object.keys(entries).length === 0) {
    return { possible: 0, pointsMap: {} };
  }

  // Split entries into regular and weighted per owner (exclude event categories)
  // regularByOwner: { ownerId: { key: { entry, task } } }
  // weighted: { key: { entry, task, cat } }
  const regularByOwner = {};
  const weighted = {};

  for (const [key, entry] of Object.entries(entries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    const cat = task.category ? categories[task.category] : null;
    // Skip event categories and exempt tasks — they don't count for scoring
    if (cat?.isEvent) continue;
    if (task.exempt) continue;
    if (cat && cat.weightPercent > 0) {
      weighted[key] = { entry, task, cat };
    } else {
      const oid = entry.ownerId;
      if (!regularByOwner[oid]) regularByOwner[oid] = {};
      regularByOwner[oid][key] = { entry, task };
    }
  }

  // Sum regular base points per owner
  const regularTotalByOwner = {};
  const pointsMap = {};
  for (const [oid, entries_] of Object.entries(regularByOwner)) {
    let total = 0;
    for (const [key, { task }] of Object.entries(entries_)) {
      const pts = basePoints(task, difficultyMultipliers);
      pointsMap[key] = pts;
      total += pts;
    }
    regularTotalByOwner[oid] = total;
  }

  // Calculate weighted base points per entry using only the owner's regular total.
  // Clamp the weight below 100 — w/(100-w) divides by zero at exactly 100.
  for (const [key, { entry, task, cat }] of Object.entries(weighted)) {
    const w = Math.min(cat.weightPercent, 95);
    const ownerRegular = regularTotalByOwner[entry.ownerId] || 0;
    const weightedPts = ownerRegular > 0
      ? Math.round(ownerRegular * (w / (100 - w)))
      : basePoints(task, difficultyMultipliers);
    pointsMap[key] = weightedPts;
  }

  const possible = Object.values(pointsMap).reduce((sum, p) => sum + p, 0);
  return { possible, pointsMap };
}

/**
 * Calculate daily score for one person on one day.
 *
 * @param {object} personEntries - { entryKey: entry } for this person on this day
 * @param {object} completions - All completion records
 * @param {object} tasks - All task definitions
 * @param {object} categories - All category definitions
 * @param {object} settings - App settings (pastDueCreditPct)
 * @param {string} dateKey - The date (YYYY-MM-DD)
 * @param {string} today - Today's date key
 * @returns {{ earned: number, possible: number, percentage: number, grade: string, pointsMap: object }}
 */
export function dailyScore(personEntries, completions, tasks, categories, settings, dateKey, today) {
  const mults = settings?.difficultyMultipliers;
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories, mults);
  if (possible === 0) return { earned: 0, possible: 0, percentage: 0, grade: '--', pointsMap: {} };

  let earned = 0;
  for (const [key, entry] of Object.entries(personEntries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    const cat = task.category ? categories[task.category] : null;
    if (cat?.isEvent) continue;
    if (task.exempt) continue;
    const completion = completions?.[key] || null;
    if (!completion) continue;
    const basePts = pointsMap[key] ?? basePoints(task, mults);
    earned += applyOverride(basePts, completion);
  }

  const percentage = Math.round((earned / possible) * 100);
  const grade = letterGrade(percentage);

  return { earned, possible, percentage, grade, pointsMap };
}

// ── Snapshots ──

/**
 * Build a daily snapshot for one person.
 * Called at rollover for the day that just ended.
 *
 * @param {object} personEntries - { entryKey: entry } for this person on the snapshot day
 * @param {object} completions - All completions
 * @param {object} tasks - All task definitions
 * @param {object} categories - All category definitions
 * @param {object} settings - App settings
 * @param {string} dateKey - The snapshot date
 * @returns {object} snapshot data { earned, possible, percentage, grade, missedKeys }
 */
export function buildSnapshot(personEntries, completions, tasks, categories, settings, dateKey) {
  const mults = settings?.difficultyMultipliers;
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories, mults);
  if (possible === 0) return null;

  let earned = 0;
  const missedKeys = [];

  for (const [key, entry] of Object.entries(personEntries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    const cat = task.category ? categories[task.category] : null;
    if (cat?.isEvent) continue;
    if (task.exempt) continue;
    const completion = completions?.[key] || null;
    if (completion) {
      const basePts = pointsMap[key] ?? basePoints(task, mults);
      earned += applyOverride(basePts, completion);
    } else {
      missedKeys.push(key);
    }
  }

  const percentage = Math.round((earned / possible) * 100);
  const grade = letterGrade(percentage);

  return { earned, possible, percentage, grade, missedKeys };
}

// ── Aggregation ──

/**
 * Aggregate an array of daily snapshots into a combined score.
 * Used for weekly, monthly, and 12-month views.
 *
 * @param {Array<{earned, possible}>} snapshots
 * @returns {{ earned: number, possible: number, percentage: number, grade: string }}
 */
export function aggregateSnapshots(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    return { earned: 0, possible: 0, percentage: 0, grade: '--' };
  }

  let totalEarned = 0;
  let totalPossible = 0;
  for (const snap of snapshots) {
    totalEarned += snap.earned || 0;
    totalPossible += snap.possible || 0;
  }

  if (totalPossible === 0) return { earned: 0, possible: 0, percentage: 0, grade: '--' };

  const percentage = Math.round((totalEarned / totalPossible) * 100);
  const grade = letterGrade(percentage);

  return { earned: totalEarned, possible: totalPossible, percentage, grade };
}

/**
 * Sum activity earnings for a person across a date range.
 * @param {Object} allEarnings - rundown/activityEarnings (keyed by personId)
 * @param {string} personId
 * @param {string} startDateKey - YYYY-MM-DD inclusive
 * @param {string} endDateKey - YYYY-MM-DD inclusive
 * @returns {number} sum of `earned` from all earnings whose periodKey falls in range
 */
export function sumActivityEarningsInRange(allEarnings, personId, startDateKey, endDateKey) {
  const perPerson = allEarnings?.[personId];
  if (!perPerson) return 0;
  let total = 0;
  for (const activityId of Object.keys(perPerson)) {
    for (const periodKey of Object.keys(perPerson[activityId])) {
      const earning = perPerson[activityId][periodKey];
      if (!earning) continue;
      const dateKey = periodKeyToStartDateKey(periodKey);
      if (dateKey >= startDateKey && dateKey <= endDateKey) {
        total += earning.earned || 0;
      }
    }
  }
  return total;
}

/**
 * Map a periodKey ("YYYY-MM-DD" or "YYYY-Www") to its start date key for range checks.
 */
function periodKeyToStartDateKey(periodKey) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return periodKey;
  const m = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const week = parseInt(m[2], 10);
    // ISO week 1: Jan 4 is always in week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }
  return '0000-00-00';
}

// ── Streaks ──

/**
 * Update streak data given today's completion status.
 *
 * @param {object} currentStreaks - { current, best, lastCompleteDate } or null
 * @param {string} dateKey - The date to evaluate
 * @param {boolean} allComplete - Whether all tasks were completed that day
 * @param {string|null} [prevTaskDate] - The person's most recent EARLIER date
 *   that had any tasks assigned. When provided, a streak continues if that
 *   day was completed — days with zero assigned tasks are streak-neutral
 *   instead of streak-fatal (a kid with only weekly tasks, or a scheduled
 *   day off, no longer resets to 1). When omitted, falls back to the strict
 *   calendar next-day check.
 * @returns {object} updated { current, best, lastCompleteDate }
 */
export function updateStreaks(currentStreaks, dateKey, allComplete, prevTaskDate = null) {
  const prev = currentStreaks || { current: 0, best: 0, lastCompleteDate: null };

  if (!allComplete) {
    return { current: 0, best: prev.best, lastCompleteDate: prev.lastCompleteDate };
  }

  const isConsecutive = !!prev.lastCompleteDate && (
    prevTaskDate != null
      ? prev.lastCompleteDate === prevTaskDate
      : isNextDay(prev.lastCompleteDate, dateKey)
  );
  const newCurrent = isConsecutive ? prev.current + 1 : 1;
  const newBest = Math.max(newCurrent, prev.best);

  return { current: newCurrent, best: newBest, lastCompleteDate: dateKey };
}

/**
 * Check if dateB is exactly one day after dateA.
 */
function isNextDay(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  const diff = (b - a) / (1000 * 60 * 60 * 24);
  return Math.abs(diff - 1) < 0.01;
}

/**
 * Collect snapshots for a person within a date range from a snapshots tree.
 *
 * @param {object} allSnapshots - { dateKey: { personId: snapshot } }
 * @param {string} personId
 * @param {string} startDate - inclusive YYYY-MM-DD
 * @param {string} endDate - inclusive YYYY-MM-DD
 * @returns {Array<{earned, possible, ...}>}
 */
export function collectSnapshots(allSnapshots, personId, startDate, endDate) {
  if (!allSnapshots) return [];
  const result = [];
  for (const [dateKey, people] of Object.entries(allSnapshots)) {
    if (dateKey >= startDate && dateKey <= endDate && people?.[personId]) {
      result.push(people[personId]);
    }
  }
  return result;
}

/**
 * Get aggregated grade for a person over a date range.
 * Convenience wrapper around collectSnapshots + aggregateSnapshots.
 */
export function periodGrade(allSnapshots, personId, startDate, endDate) {
  const snaps = collectSnapshots(allSnapshots, personId, startDate, endDate);
  return aggregateSnapshots(snaps);
}

/**
 * Sum estimated minutes for completed tasks owned by `personId` in the date range [startDate, endDate].
 * Used in the scoreboard drilldown for "X h Y min contributed" stat.
 *
 * @param {string} personId
 * @param {object} schedule - Full schedule map { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions { entryKey: completion }
 * @param {object} tasks - All tasks by id
 * @param {string} startDate - YYYY-MM-DD inclusive
 * @param {string} endDate - YYYY-MM-DD inclusive
 * @param {function} addDaysFn - util.addDays (passed in to keep scoring.js pure)
 * @returns {number} total minutes contributed (integer)
 */
export function timeContributed(personId, schedule, completions, tasks, startDate, endDate, addDaysFn) {
  let total = 0;
  let cur = startDate;
  while (cur <= endDate) {
    const dayEntries = schedule[cur] || {};
    for (const [k, e] of Object.entries(dayEntries)) {
      if (e.ownerId !== personId) continue;
      if (!completions[k]) continue;
      const task = tasks[e.taskId];
      if (!task) continue;
      // 'both' tasks are split into am+pm entries by the scheduler — count
      // half per entry so a completed pair totals the task's estMin once.
      total += task.timeOfDay === 'both'
        ? Math.ceil((task.estMin || 0) / 2)
        : (task.estMin || 0);
    }
    cur = addDaysFn(cur, 1);
  }
  return total;
}

/**
 * Aggregate grade across all people for a given period.
 * Sums earned/possible across each person's per-period grade.
 *
 * @param {Array} perPersonGrades - Array of { earned, possible, percentage } objects (one per person)
 * @returns {object} aggregated { earned, possible, percentage, grade }
 */
export function familyGrade(perPersonGrades) {
  return aggregateSnapshots(perPersonGrades);
}

// ── Rollover ──

/**
 * Compute all snapshot and streak writes needed for rollover.
 * Checks each past date that has schedule entries but no snapshot yet.
 * Returns a map of Firebase paths → values to write via multiUpdate.
 *
 * @param {string} today - Today's date key
 * @param {object} schedule - Full schedule { dateKey: { entryKey: entry } }
 * @param {object} completions - All completions
 * @param {object} tasks - All tasks
 * @param {object} categories - All categories
 * @param {object} settings - App settings
 * @param {Array<{id}>} people - Array of { id, ... }
 * @param {object} existingSnapshots - { dateKey: { personId: snapshot } } (already created)
 * @param {object} existingStreaks - { personId: { current, best, lastCompleteDate } }
 * @returns {{ updates: object, snapshotCount: number }}
 */
export function computeRollover(today, schedule, completions, tasks, categories, settings, people, existingSnapshots, existingStreaks) {
  const updates = {};
  let snapshotCount = 0;
  const streaks = {};
  const lastTaskDate = {}; // per person: most recent earlier date that had entries
  for (const p of people) {
    streaks[p.id] = existingStreaks?.[p.id] || { current: 0, best: 0, lastCompleteDate: null };
    lastTaskDate[p.id] = null;
  }

  // Collect past dates with entries, sorted ascending
  const pastDates = Object.keys(schedule)
    .filter(d => d < today)
    .sort();

  for (const dateKey of pastDates) {
    const dayEntries = schedule[dateKey];
    if (!dayEntries) continue;

    for (const person of people) {
      // Filter entries for this person
      const personEntries = {};
      for (const [key, entry] of Object.entries(dayEntries)) {
        if (entry.ownerId === person.id) personEntries[key] = entry;
      }

      if (Object.keys(personEntries).length === 0) continue;

      // Track the person's task-day chain even for already-snapshotted dates
      // so the streak bridge below sees the true previous task day.
      const prevTaskDay = lastTaskDate[person.id];
      lastTaskDate[person.id] = dateKey;

      // Skip if snapshot already exists
      if (existingSnapshots?.[dateKey]?.[person.id]) continue;

      const snapshot = buildSnapshot(personEntries, completions, tasks, categories, settings, dateKey);
      if (!snapshot) continue;

      updates[`snapshots/${dateKey}/${person.id}`] = snapshot;
      snapshotCount++;

      // Update streak: zero-task days between task days are streak-neutral.
      const allDone = snapshot.missedKeys.length === 0;
      streaks[person.id] = updateStreaks(streaks[person.id], dateKey, allDone, prevTaskDay);
    }
  }

  // Write updated streaks
  for (const person of people) {
    const streak = streaks[person.id];
    if (streak.lastCompleteDate || streak.best > 0) {
      updates[`streaks/${person.id}`] = streak;
    }
  }

  return { updates, snapshotCount };
}

// ── Exports for display ──

/**
 * Format grade with color class for display.
 * Returns { grade, tier } where tier is 'a'|'b'|'c'|'d'|'f'.
 */
export function gradeDisplay(pct) {
  return { grade: letterGrade(pct), tier: gradeTier(pct) };
}

// ── Rewards Balance ──

/**
 * Default achievement definitions — built-in, can be hidden but not deleted.
 * condition: { stat, threshold } where stat is one of:
 *   'streak', 'bestStreak', 'totalEarned', 'perfectDays', 'tasksCompleted',
 *   'gradeDay', 'gradeWeek', 'gradeMonth', 'firstRedemption'
 * conditionType: 'stat' (auto-trigger) | 'manual' (parent grants) | 'hybrid' (either)
 */
export const DEFAULT_ACHIEVEMENTS = {
  'streak-7':    { icon: '🔥', label: '7-Day Streak', description: 'Complete all tasks for 7 days straight', conditionType: 'hybrid', condition: { stat: 'streak', threshold: 7 }, isDefault: true },
  'streak-14':   { icon: '🔥', label: '14-Day Streak', description: 'Complete all tasks for 14 days straight', conditionType: 'hybrid', condition: { stat: 'streak', threshold: 14 }, isDefault: true },
  'streak-30':   { icon: '🔥', label: '30-Day Streak', description: 'Complete all tasks for 30 days straight', conditionType: 'hybrid', condition: { stat: 'streak', threshold: 30 }, isDefault: true },
  'streak-60':   { icon: '🔥', label: '60-Day Streak', description: 'Complete all tasks for 60 days straight', conditionType: 'hybrid', condition: { stat: 'streak', threshold: 60 }, isDefault: true },
  'streak-100':  { icon: '🔥', label: '100-Day Streak', description: 'Complete all tasks for 100 days straight', conditionType: 'hybrid', condition: { stat: 'streak', threshold: 100 }, isDefault: true },
  'grade-a-plus-day':   { icon: '⭐', label: 'Perfect Day', description: 'Score A+ on a single day', conditionType: 'hybrid', condition: { stat: 'gradeDay', threshold: 'A+' }, isDefault: true },
  'grade-a-plus-week':  { icon: '⭐', label: 'Perfect Week', description: 'Score A+ for the whole week', conditionType: 'hybrid', condition: { stat: 'gradeWeek', threshold: 'A+' }, isDefault: true },
  'grade-a-plus-month': { icon: '⭐', label: 'Perfect Month', description: 'Score A+ for the whole month', conditionType: 'hybrid', condition: { stat: 'gradeMonth', threshold: 'A+' }, isDefault: true },
  'points-500':   { icon: '💰', label: '500 Points', description: 'Earn 500 total points', conditionType: 'hybrid', condition: { stat: 'totalEarned', threshold: 500 }, isDefault: true },
  'points-1000':  { icon: '💰', label: '1,000 Points', description: 'Earn 1,000 total points', conditionType: 'hybrid', condition: { stat: 'totalEarned', threshold: 1000 }, isDefault: true },
  'points-5000':  { icon: '💰', label: '5,000 Points', description: 'Earn 5,000 total points', conditionType: 'hybrid', condition: { stat: 'totalEarned', threshold: 5000 }, isDefault: true },
  'points-10000': { icon: '💰', label: '10,000 Points', description: 'Earn 10,000 total points', conditionType: 'hybrid', condition: { stat: 'totalEarned', threshold: 10000 }, isDefault: true },
  'first-redemption': { icon: '🎁', label: 'First Purchase', description: 'Redeem your first reward from the store', conditionType: 'hybrid', condition: { stat: 'firstRedemption', threshold: 1 }, isDefault: true }
};

/** @deprecated Use mergeAchievementDefs() instead. Kept for backward compatibility. */
export const ACHIEVEMENTS = DEFAULT_ACHIEVEMENTS;

/**
 * Merge default achievements with custom definitions from Firebase.
 * Custom defs can override defaults (e.g. hide them) or add new ones.
 * @param {object|null} customDefs - from readAchievementDefs()
 * @returns {object} merged { key: def }
 */
export function mergeAchievementDefs(customDefs) {
  const merged = {};
  // Start with defaults
  for (const [key, def] of Object.entries(DEFAULT_ACHIEVEMENTS)) {
    merged[key] = { ...def };
  }
  // Apply custom defs (overrides + new)
  if (customDefs) {
    for (const [key, def] of Object.entries(customDefs)) {
      if (def === null) continue; // deleted
      if (merged[key]) {
        // Override default — keep isDefault flag
        merged[key] = { ...merged[key], ...def };
      } else {
        merged[key] = { ...def };
      }
    }
  }
  return merged;
}

/**
 * Get only active (non-hidden) achievements.
 */
export function getActiveAchievements(allDefs) {
  const active = {};
  for (const [key, def] of Object.entries(allDefs)) {
    if (def.status !== 'hidden') active[key] = def;
  }
  return active;
}

/**
 * Calculate a person's spendable rewards balance.
 *
 * @param {string} personId
 * @param {object} allSnapshots - { dateKey: { personId: snapshot } }
 * @param {object} messages - { msgId: message } for this person (already filtered)
 * @param {object|null} anchor - { amount, anchoredAt } or null
 * @param {object|null} multipliers - { dateKey: { personId: { multiplier } } }
 * @param {string} [timezone]
 * @param {object|null} [allEarnings] - rundown/activityEarnings (keyed by personId). When
 *   provided, all settled activity earnings for this person are added to balance/totalEarned.
 * @returns {{ balance: number, totalEarned: number }}
 */
export function calculateBalance(personId, allSnapshots, messages, anchor, multipliers, timezone, allEarnings) {
  const anchorAmount = anchor?.amount || 0;
  const anchorDate = anchor?.anchoredAt || 0;
  // Convert anchor timestamp to YYYY-MM-DD in the family timezone (not UTC)
  // so it matches snapshot date keys which are also in the family timezone.
  const tz = timezone || 'America/Chicago';
  const anchorDateKey = anchorDate
    ? new Date(anchorDate).toLocaleDateString('en-CA', { timeZone: tz })
    : '';

  let snapshotEarning = 0;
  if (allSnapshots) {
    for (const [dateKey, people] of Object.entries(allSnapshots)) {
      const snap = people?.[personId];
      if (!snap) continue;
      if (dateKey < anchorDateKey) continue;
      const mult = multipliers?.[dateKey]?.[personId]?.multiplier || 1;
      snapshotEarning += (snap.percentage || 0) * mult;
    }
  }

  let bonuses = 0;
  let deductions = 0;
  let spent = 0;
  if (messages) {
    for (const msg of Object.values(messages)) {
      if (anchorDate && msg.createdAt && msg.createdAt <= anchorDate) continue;
      const amt = msg.amount || 0;
      if (msg.type === 'bonus') bonuses += amt;
      else if (msg.type === 'deduction') deductions += Math.abs(amt);
      else if (msg.type === 'redemption-request') spent += Math.abs(amt);
    }
  }

  // Activity earnings — settled points from activities (e.g. screen time goals).
  // Only counted for dates on or after the anchor date so that re-anchoring
  // correctly resets the balance (same rule as snapshots).
  let activityEarning = 0;
  if (allEarnings) {
    const perPerson = allEarnings[personId];
    if (perPerson) {
      for (const activityId of Object.keys(perPerson)) {
        for (const periodKey of Object.keys(perPerson[activityId])) {
          const earning = perPerson[activityId][periodKey];
          if (!earning) continue;
          if (anchorDateKey && periodKeyToStartDateKey(periodKey) < anchorDateKey) continue;
          activityEarning += earning.earned || 0;
        }
      }
    }
  }

  const balance = anchorAmount + snapshotEarning + activityEarning + bonuses - deductions - spent;
  const totalEarned = anchorAmount + snapshotEarning + activityEarning + bonuses;

  return { balance: Math.round(balance), totalEarned: Math.round(totalEarned) };
}

/**
 * Check which achievements a person has newly earned.
 * Supports both default and custom achievement definitions.
 *
 * @param {object} context - { streak, bestStreak, totalEarned, tasksCompleted, perfectDays, existingAchievements, weeklyGrade, monthlyGrade, dailyGrade, hasRedeemed, personId, achievementDefs }
 * @returns {string[]} newly unlocked achievement keys
 */
export function checkNewAchievements(context) {
  const {
    streak = 0,
    bestStreak = 0,
    totalEarned = 0,
    tasksCompleted = 0,
    perfectDays = 0,
    existingAchievements = {},
    weeklyGrade = '--',
    monthlyGrade = '--',
    dailyGrade = '--',
    hasRedeemed = false,
    personId = null,
    achievementDefs = null
  } = context;

  const defs = achievementDefs || DEFAULT_ACHIEVEMENTS;
  const newKeys = [];

  for (const [key, def] of Object.entries(defs)) {
    const existing = existingAchievements[key];
    if (existing && !existing.revoked) continue; // already earned and not revoked
    if (def.status === 'hidden') continue;
    if (def.conditionType === 'manual') continue; // manual-only, never auto-fires
    if (def.perPerson && personId && !def.perPerson.includes(personId)) continue;
    if (!def.condition) continue;

    const { stat, threshold } = def.condition;
    let met = false;

    switch (stat) {
      case 'streak': met = streak >= threshold; break;
      case 'bestStreak': met = Math.max(streak, bestStreak) >= threshold; break;
      case 'totalEarned': met = totalEarned >= threshold; break;
      case 'tasksCompleted': met = tasksCompleted >= threshold; break;
      case 'perfectDays': met = perfectDays >= threshold; break;
      case 'gradeDay': met = dailyGrade === threshold; break;
      case 'gradeWeek': met = weeklyGrade === threshold; break;
      case 'gradeMonth': met = monthlyGrade === threshold; break;
      case 'firstRedemption': met = hasRedeemed; break;
    }

    if (met) newKeys.push(key);
  }

  return newKeys;
}

/**
 * Compute progress toward a single achievement definition. Returns null if the
 * achievement isn't stat-based (e.g. manual-only) or already unlocked.
 *
 * @param {object} def - Achievement definition with { condition: { stat, threshold }, conditionType }
 * @param {object} context - Same context shape consumed by checkNewAchievements:
 *   { streak, bestStreak, totalEarned, perfectDays, tasksCompleted, gradeDay, gradeWeek, gradeMonth, hasRedeemed }
 * @returns {object|null} { current, required, progressPct, hint } or null if N/A
 */
export function achievementProgress(def, context) {
  if (!def || !def.condition) return null;
  if (def.conditionType === 'manual') return null;
  const { stat, threshold } = def.condition;
  let current = 0;
  let hint = '';
  switch (stat) {
    case 'streak':         current = context.streak ?? 0; hint = `${current}/${threshold} day streak`; break;
    case 'bestStreak':     current = context.bestStreak ?? 0; hint = `${current}/${threshold} best streak`; break;
    case 'totalEarned':    current = context.totalEarned ?? 0; hint = `${current.toLocaleString()}/${threshold.toLocaleString()} pts earned`; break;
    case 'tasksCompleted': current = context.tasksCompleted ?? 0; hint = `${current}/${threshold} tasks`; break;
    case 'perfectDays':    current = context.perfectDays ?? 0; hint = `${current}/${threshold} perfect days`; break;
    case 'firstRedemption':
      current = context.hasRedeemed ? 1 : 0;
      hint = current ? 'unlocked' : 'redeem a reward';
      return { current, required: 1, progressPct: current * 100, hint };
    case 'gradeDay':
    case 'gradeWeek':
    case 'gradeMonth':
      hint = `reach ${threshold} grade`;
      return { current: 0, required: 1, progressPct: 0, hint };
    default:
      return null;
  }
  const progressPct = Math.min(100, Math.round((current / threshold) * 100));
  return { current, required: threshold, progressPct, hint };
}

/**
 * Find the highest-damage penalized task for penalty removal.
 *
 * @param {object} completions - all completions
 * @param {object} schedule - all schedule entries { dateKey: { entryKey: entry } }
 * @param {object} tasks - all task definitions
 * @param {object} settings - app settings
 * @param {string} [personId] - if provided, only consider entries for this person
 * @returns {{ entryKey, dateKey, taskName, pointsRestored } | null}
 */
export function findHighestDamagePenalty(completions, schedule, tasks, settings, personId) {
  const mults = settings?.difficultyMultipliers;
  let best = null;

  for (const [dateKey, dayEntries] of Object.entries(schedule)) {
    for (const [entryKey, entry] of Object.entries(dayEntries)) {
      if (personId && entry.ownerId !== personId) continue;
      const completion = completions?.[entryKey];
      if (!completion?.isLate) continue;
      if (completion.pointsOverride == null) continue;

      const task = tasks?.[entry.taskId];
      if (!task) continue;

      const base = basePoints(task, mults);
      const earned = Math.round(base * (completion.pointsOverride / 100));
      const damage = base - earned;

      if (!best || damage > best.pointsRestored) {
        best = { entryKey, dateKey, taskName: task.name, pointsRestored: damage };
      }
    }
  }

  return best;
}

/**
 * Determine if a person's streak is at risk today.
 * Fires when: current streak ≥ 5, has incomplete tasks today, local time past 6pm.
 *
 * @param {string} personId
 * @param {object} schedule - { dateKey: { entryKey: entry } }
 * @param {object} completions - { entryKey: completion }
 * @param {object} streak - { current, best }
 * @param {string} todayKey - YYYY-MM-DD
 * @param {string} tz - family timezone
 * @returns {object|null} { incompleteCount, currentStreak } or null
 */
export function streakAtRisk(personId, schedule, completions, streak, todayKey, tz) {
  if (!streak || streak.current < 5) return null;

  // Local hour check — past 6pm only
  const nowHour = new Date().toLocaleString('en-US', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false });
  if (parseInt(nowHour, 10) < 18) return null;

  const dayEntries = schedule[todayKey] || {};
  let incomplete = 0;
  for (const [k, e] of Object.entries(dayEntries)) {
    if (e.ownerId !== personId) continue;
    if (completions[k]) continue;
    incomplete += 1;
  }
  if (incomplete === 0) return null;
  return { incompleteCount: incomplete, currentStreak: streak.current };
}

/**
 * Compute day-of-week performance pattern from snapshots.
 * Returns null if fewer than 21 days of data, or delta < 10% between best/worst day.
 *
 * @param {object} allSnapshots
 * @param {string} personId
 * @returns {object|null} { bestDay, bestPct, worstDay, worstPct, delta } or null
 */
export function dayOfWeekPattern(allSnapshots, personId) {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets = Array(7).fill(null).map(() => ({ sum: 0, count: 0 }));
  let totalSnaps = 0;
  if (allSnapshots) {
    for (const [dateKey, people] of Object.entries(allSnapshots)) {
      const snap = people?.[personId];
      if (!snap || snap.possible === 0) continue;
      const d = new Date(`${dateKey}T00:00:00Z`);
      const dow = d.getUTCDay();
      buckets[dow].sum += snap.percentage;
      buckets[dow].count += 1;
      totalSnaps += 1;
    }
  }
  if (totalSnaps < 21) return null;

  let bestIdx = -1, worstIdx = -1;
  let bestAvg = -1, worstAvg = 101;
  for (let i = 0; i < 7; i++) {
    if (buckets[i].count < 2) continue;
    const avg = buckets[i].sum / buckets[i].count;
    if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    if (avg < worstAvg) { worstAvg = avg; worstIdx = i; }
  }
  if (bestIdx === -1 || worstIdx === -1 || bestIdx === worstIdx) return null;
  const delta = Math.round(bestAvg - worstAvg);
  if (delta < 10) return null;
  return { bestDay: DAYS[bestIdx], bestPct: Math.round(bestAvg), worstDay: DAYS[worstIdx], worstPct: Math.round(worstAvg), delta };
}

/**
 * Detect personal best: this month's perfect-day count exceeds every prior month's count.
 * Requires this month to have ≥2 perfect days and at least 1 prior month with data.
 *
 * @param {object} allSnapshots
 * @param {string} personId
 * @param {string} todayKey - YYYY-MM-DD
 * @returns {object|null} { count, monthLabel } or null
 */
export function personalBest(allSnapshots, personId, todayKey) {
  if (!allSnapshots) return null;
  const byMonth = {};
  for (const [dateKey, people] of Object.entries(allSnapshots)) {
    const snap = people?.[personId];
    if (!snap || snap.possible === 0 || snap.percentage !== 100) continue;
    const month = dateKey.slice(0, 7);
    byMonth[month] = (byMonth[month] || 0) + 1;
  }
  const thisMonth = todayKey.slice(0, 7);
  const thisCount = byMonth[thisMonth] || 0;
  if (thisCount < 2) return null;
  const priorMonths = Object.keys(byMonth).filter(m => m !== thisMonth);
  if (priorMonths.length < 1) return null;
  const priorMax = Math.max(...priorMonths.map(m => byMonth[m]));
  if (thisCount <= priorMax) return null;
  const monthLabel = new Date(`${thisMonth}-15T00:00:00Z`).toLocaleString('en-US', { month: 'long' });
  return { count: thisCount, monthLabel };
}
