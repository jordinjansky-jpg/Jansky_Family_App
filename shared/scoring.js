// scoring.js — Points formula, grade calculation, snapshot creation, aggregation (v2)
// Pure functions. No DOM. No Firebase writes (pages handle persistence).


// ── Difficulty multipliers ──

export const DEFAULT_DIFFICULTY_MULTIPLIERS = { easy: 1, medium: 2, hard: 3 };
const MIN_EST_MIN = 5;

// ── Grade table (descending order for lookup) ──

const GRADE_TABLE = [
  { min: 97, grade: 'A+' },
  { min: 93, grade: 'A' },
  { min: 90, grade: 'A-' },
  { min: 87, grade: 'B+' },
  { min: 83, grade: 'B' },
  { min: 80, grade: 'B-' },
  { min: 77, grade: 'C+' },
  { min: 73, grade: 'C' },
  { min: 70, grade: 'C-' },
  { min: 67, grade: 'D+' },
  { min: 63, grade: 'D' },
  { min: 60, grade: 'D-' },
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
  const clamped = Math.round(pct);
  if (clamped >= 90) return 'a';
  if (clamped >= 80) return 'b';
  if (clamped >= 70) return 'c';
  if (clamped >= 60) return 'd';
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
  const base = basePoints(task, difficultyMultipliers);

  if (completion.pointsOverride != null) {
    return Math.round(base * (completion.pointsOverride / 100));
  }

  return base;
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

  // Calculate weighted base points per entry using only the owner's regular total
  for (const [key, { entry, task, cat }] of Object.entries(weighted)) {
    const w = cat.weightPercent;
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
    let pts;
    if (completion.pointsOverride != null) {
      pts = Math.round(basePts * (completion.pointsOverride / 100));
    } else {
      pts = basePts;
    }
    earned += pts;
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
      let pts;
      if (completion.pointsOverride != null) {
        pts = Math.round(basePts * (completion.pointsOverride / 100));
      } else {
        pts = basePts;
      }
      earned += pts;
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

// ── Streaks ──

/**
 * Update streak data given today's completion status.
 *
 * @param {object} currentStreaks - { current, best, lastCompleteDate } or null
 * @param {string} dateKey - The date to evaluate
 * @param {boolean} allComplete - Whether all tasks were completed that day
 * @returns {object} updated { current, best, lastCompleteDate }
 */
export function updateStreaks(currentStreaks, dateKey, allComplete) {
  const prev = currentStreaks || { current: 0, best: 0, lastCompleteDate: null };

  if (!allComplete) {
    return { current: 0, best: prev.best, lastCompleteDate: prev.lastCompleteDate };
  }

  // Check if this is the consecutive next day
  const isConsecutive = prev.lastCompleteDate && isNextDay(prev.lastCompleteDate, dateKey);
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
  for (const p of people) {
    streaks[p.id] = existingStreaks?.[p.id] || { current: 0, best: 0, lastCompleteDate: null };
  }

  // Collect past dates with entries, sorted ascending
  const pastDates = Object.keys(schedule)
    .filter(d => d < today)
    .sort();

  for (const dateKey of pastDates) {
    const dayEntries = schedule[dateKey];
    if (!dayEntries) continue;

    for (const person of people) {
      // Skip if snapshot already exists
      if (existingSnapshots?.[dateKey]?.[person.id]) continue;

      // Filter entries for this person
      const personEntries = {};
      for (const [key, entry] of Object.entries(dayEntries)) {
        if (entry.ownerId === person.id) personEntries[key] = entry;
      }

      if (Object.keys(personEntries).length === 0) continue;

      const snapshot = buildSnapshot(personEntries, completions, tasks, categories, settings, dateKey);
      if (!snapshot) continue;

      updates[`snapshots/${dateKey}/${person.id}`] = snapshot;
      snapshotCount++;

      // Update streak for this person
      const allDone = snapshot.missedKeys.length === 0;
      streaks[person.id] = updateStreaks(streaks[person.id], dateKey, allDone);
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
 * @returns {{ balance: number, totalEarned: number }}
 */
export function calculateBalance(personId, allSnapshots, messages, anchor, multipliers) {
  const anchorAmount = anchor?.amount || 0;
  const anchorDate = anchor?.anchoredAt || 0;
  // Derive anchor date string (YYYY-MM-DD) for safe comparison — avoids timezone mismatch
  // between Unix timestamp anchor and YYYY-MM-DD snapshot keys
  const anchorDateKey = anchorDate ? new Date(anchorDate).toISOString().split('T')[0] : '';

  let snapshotEarning = 0;
  if (allSnapshots) {
    for (const [dateKey, people] of Object.entries(allSnapshots)) {
      const snap = people?.[personId];
      if (!snap) continue;
      if (dateKey <= anchorDateKey) continue;
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

  const balance = anchorAmount + snapshotEarning + bonuses - deductions - spent;
  const totalEarned = anchorAmount + snapshotEarning + bonuses;

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
    if (existingAchievements[key]) continue;
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
