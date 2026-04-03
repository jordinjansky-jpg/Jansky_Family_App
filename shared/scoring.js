// scoring.js — Points formula, grade calculation, snapshot creation, aggregation (v2)
// Pure functions. No DOM. No Firebase writes (pages handle persistence).

// ── Difficulty multipliers ──

const DIFFICULTY_MULTIPLIER = { easy: 1, medium: 2, hard: 3 };

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
 * Formula: difficultyMultiplier × (1 + estMin / 30), rounded.
 */
export function basePoints(task) {
  const mult = DIFFICULTY_MULTIPLIER[task.difficulty] || 1;
  const est = task.estMin || 1;
  return Math.round(mult * (1 + est / 30));
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
 * Handles pointsOverride (from slider) and past-due credit.
 *
 * @param {object} task - The task definition
 * @param {object|null} completion - The completion record (or null if incomplete)
 * @param {object} options - { pastDueCreditPct, isOverdue, categories }
 * @returns {number} earned points (0 if not completed)
 */
export function earnedPoints(task, completion, options = {}) {
  if (!completion) return 0;
  const base = basePoints(task);

  // Slider override: pointsOverride is stored as a percentage (0–150)
  if (completion.pointsOverride != null) {
    return Math.round(base * (completion.pointsOverride / 100));
  }

  // Past-due credit
  if (options.isOverdue) {
    const creditPct = options.pastDueCreditPct ?? 75;
    return Math.round(base * (creditPct / 100));
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
export function dailyPossible(entries, tasks, categories) {
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
      const pts = basePoints(task);
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
      : basePoints(task);
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
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories);
  if (possible === 0) return { earned: 0, possible: 0, percentage: 0, grade: '--', pointsMap: {} };

  const isOverdueDate = dateKey < today;
  const pastDueCreditPct = settings?.pastDueCreditPct ?? 75;

  let earned = 0;
  for (const [key, entry] of Object.entries(personEntries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    // Skip event categories — they don't count for scoring
    const cat = task.category ? categories[task.category] : null;
    if (cat?.isEvent) continue;
    const completion = completions?.[key] || null;
    const pts = earnedPoints(task, completion, {
      isOverdue: isOverdueDate,
      pastDueCreditPct
    });
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
  const { possible, pointsMap } = dailyPossible(personEntries, tasks, categories);
  if (possible === 0) return null;

  const pastDueCreditPct = settings?.pastDueCreditPct ?? 75;
  let earned = 0;
  const missedKeys = [];

  for (const [key, entry] of Object.entries(personEntries)) {
    const task = tasks[entry.taskId];
    if (!task) continue;
    // Skip event categories — they don't count for scoring/snapshots
    const cat = task.category ? categories[task.category] : null;
    if (cat?.isEvent) continue;
    const completion = completions?.[key] || null;
    if (completion) {
      earned += earnedPoints(task, completion, { isOverdue: false, pastDueCreditPct });
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
