# Scoreboard Pass 3 — Drilldown Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** The drilldown becomes a real "person profile" — engagement content, not just a stats recap. Achievement gallery, kudos w/ points/rewards, tappable Needs Attention with Late-Done quick action, time contributed, family-avg comparison.

**Spec:** [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) — see "Pass 3 — Drilldown Rebuild" section.

**Architecture:** All work touches the drilldown sheet rendered by `openDrilldown()` in [scoreboard.html](../../../scoreboard.html). Two new helpers in [shared/scoring.js](../../../shared/scoring.js): `achievementProgress` and `timeContributed`. Kudos reuses `renderSendMessageSheet` at [shared/components.js:3387](../../../shared/components.js#L3387). Late-Done reuses the exact completion shape used by dashboard.js (`isLate: true`, `pointsOverride: settings?.pastDueCreditPct ?? 75`).

**No schema changes.** All new content reads from existing Firebase paths. Kudos with points attached use `type: 'bonus'` (already handled by `calculateBalance`) plus a `kudosFrom` attribution field — no scoring.js extension needed.

**Pass 2 deferred item:** Family banner tap-to-open contribution sheet is **NOT included in Pass 3**. Reserve for a future polish pass.

**Files touched (across all 5 tasks):**
- [scoreboard.html](../../../scoreboard.html) — `openDrilldown` rebuild
- [shared/scoring.js](../../../shared/scoring.js) — `achievementProgress` helper, `timeContributed` helper
- [shared/components.js](../../../shared/components.js) — possibly extend `renderSendMessageSheet` with a `presetKudos` option (Task 4)
- [styles/scoreboard.css](../../../styles/scoreboard.css) — drilldown additions
- [sw.js](../../../sw.js) — cache bumps per task

**Commits:** 5 (one per task) + 1 docs commit at the end.

---

## Task 1: Drilldown header polish — inline grade badge + family-avg comparison

**Files:**
- Modify: `scoreboard.html` — `openDrilldown` header HTML + stats row
- Modify: `styles/scoreboard.css` — new helper class for inline badge size

**Context:** Today the drilldown header shows `[Avatar] Samantha · Last 7 Days · X` with the grade badge in a separate row below the divider. Move the badge inline with the name. Add family-comparison subtitle to the stats row.

### Step 1: Compute family average for the active drilldown period

In [scoreboard.html](../../../scoreboard.html), find `openDrilldown(personId)`. Near the top of the function after `grade` is computed, ADD:

```js
      // Family average for the same period — used for "+3 vs family" comparison
      let familyAvgPct = null;
      {
        const ps = selectedPeriod === 'today' ? today : (selectedPeriod === 'week' ? addDays(today, -6) : (selectedPeriod === 'month' ? addDays(today, -29) : y12Start));
        const pe = today;
        const perPerson = people.map(p => {
          if (p.id === personId) return null;
          if (selectedPeriod === 'today') {
            return todayScore(p.id);
          }
          const pastSnaps = collectSnapshots(snapshots, p.id, ps, addDays(today, -1));
          const todayLive = todayScore(p.id);
          const all = [...pastSnaps];
          if (todayLive.possible > 0 && selectedPeriod !== 'today') all.push(todayLive);
          return aggregateSnapshots(all);
        }).filter(Boolean);
        const fam = aggregateSnapshots(perPerson);
        if (fam.possible > 0) familyAvgPct = fam.percentage;
      }
      const familyDiff = (familyAvgPct !== null && grade.possible > 0) ? grade.percentage - familyAvgPct : null;
```

Note: `collectSnapshots` and `aggregateSnapshots` are already imported. `today`, `selectedPeriod`, `y12Start`, `addDays`, `snapshots`, `people`, `todayScore` are all in scope.

### Step 2: Update header HTML

Find in `openDrilldown`:

```js
      // Header
      html += `<div class="sb-drilldown__header" style="--owner-color: ${esc(person.color)}">
        <div class="avatar" style="--person-color: ${esc(person.color)}">${esc((person.name || '?')[0].toUpperCase())}</div>
        <span class="sb-drilldown__name">${esc(person.name)}</span>
        <span class="sb-drilldown__period">${periodLabels[selectedPeriod]}</span>
        <button class="ef2-icon-btn" id="ddClose" aria-label="Close" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
```

REPLACE with (adds inline grade badge between name and period when not empty):

```js
      // Header — name with inline grade badge
      const inlineBadge = grade.possible > 0
        ? `<span class="grade-badge grade-badge--${esc(gd.tier)} grade-badge--sm sb-drilldown__inline-grade">${esc(gd.grade)}</span>`
        : '';
      html += `<div class="sb-drilldown__header" style="--owner-color: ${esc(person.color)}">
        <div class="avatar" style="--person-color: ${esc(person.color)}">${esc((person.name || '?')[0].toUpperCase())}</div>
        <span class="sb-drilldown__name">${esc(person.name)}</span>
        ${inlineBadge}
        <span class="sb-drilldown__period">${periodLabels[selectedPeriod]}</span>
        <button class="ef2-icon-btn" id="ddClose" aria-label="Close" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
```

### Step 3: Update Summary row — drop the now-redundant big badge, add family comparison

Find:

```js
      // Summary row
      html += `<div class="sb-drilldown__summary">
        <span class="grade-badge grade-badge--${esc(gd.tier)} grade-badge--lg">${esc(gd.grade)}</span>
        <span class="sb-drilldown__stats">${grade.earned}/${grade.possible} pts · ${grade.percentage}%</span>
      </div>`;
```

REPLACE with:

```js
      // Summary row — stats inline, no large duplicate badge (badge moved to header)
      const famCompare = familyDiff !== null
        ? ` · <span class="sb-drilldown__fam-cmp">${familyDiff >= 0 ? '+' : ''}${familyDiff} vs family</span>`
        : '';
      html += grade.possible > 0
        ? `<div class="sb-drilldown__summary">
            <span class="sb-drilldown__stats">${grade.earned}/${grade.possible} pts · ${grade.percentage}%${famCompare}</span>
          </div>`
        : `<div class="sb-drilldown__summary">
            <span class="sb-drilldown__stats">No tasks ${periodLabels[selectedPeriod].toLowerCase()}</span>
          </div>`;
```

### Step 4: Append CSS for the inline grade badge spacing + family-compare color

In [styles/scoreboard.css](../../../styles/scoreboard.css), append at the end:

```css
/* ── Drilldown header polish (Pass 3) ── */
.sb-drilldown__inline-grade {
  margin-left: 2px;
}

.sb-drilldown__fam-cmp {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
```

### Step 5: Bump cache

In [sw.js](../../../sw.js), bump `family-hub-v257` → `v258`.

### Step 6: Verify visually at 412×915

Open `http://localhost:8080/scoreboard.html`. Tap a hero card. Drilldown should show `[Avatar] Name [grade-badge] Last 7 Days [X]` in the header. The summary row reads `360/420 pts · 86% · +3 vs family` with the family-comparison muted. When grade has zero possible tasks: `No tasks last 7 days` (no badge, no stats).

### Step 7: Commit

```bash
git add scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): drilldown header has inline grade badge + family comparison

Badge moves inline with name (small variant); stats row gains
'+X vs family' subtitle when there's family data to compare. Empty
period gracefully shows 'No tasks ...' instead of '0/0 pts · 0%'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Time contributed stat

**Files:**
- Modify: `shared/scoring.js` — add `timeContributed` helper export
- Modify: `scoreboard.html` — use the helper in `openDrilldown`; remove orphan `weeklyTime` local helper if unused after this change
- Modify: `styles/scoreboard.css` — small line styling
- Modify: `sw.js` — bump cache

**Context:** [scoreboard.html](../../../scoreboard.html) has a `weeklyTime(personId)` helper that's never called (dead code as of Pass 1). We replace it with a generalized `timeContributed(personId, dStart, dEnd, ...)` in scoring.js and render the result in the drilldown.

### Step 1: Add `timeContributed` helper to scoring.js

In [shared/scoring.js](../../../shared/scoring.js), after `periodGrade` (~line 337), add:

```js
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
      total += (task.estMin || 0);
    }
    cur = addDaysFn(cur, 1);
  }
  return total;
}
```

Note: `addDaysFn` is passed in to avoid importing `utils.js` from `scoring.js` (keeps the pure-no-DOM module shape).

### Step 2: Use `timeContributed` in the drilldown

In [scoreboard.html](../../../scoreboard.html), update the import line for `scoring.js`:

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade } from './shared/scoring.js';
```

Replace with (adds `timeContributed`):

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade, timeContributed } from './shared/scoring.js';
```

Then in `openDrilldown`, AFTER the summary row HTML (from Task 1), ADD:

```js
      // Time contributed for the active period
      const contribMin = timeContributed(personId, schedule, comps, tasks, dStart, dEnd, addDays);
      if (contribMin > 0) {
        html += `<div class="sb-drilldown__contrib">${formatMinutes(contribMin)} contributed</div>`;
      }
```

Note: `formatMinutes` is already imported from `utils.js` at the top of the script (around line 45). `dStart` and `dEnd` are defined earlier in the function for the period range.

### Step 3: Delete the dead local `weeklyTime` helper

In [scoreboard.html](../../../scoreboard.html), find and DELETE the entire `weeklyTime` function:

```js
    /** Calculate total time contributed over the rolling 7 days for a person. */
    function weeklyTime(personId) {
      let totalMin = 0;
      let current = addDays(today, -6);
      while (current <= today) {
        const dayEntries = schedule[current] || {};
        for (const [k, e] of Object.entries(dayEntries)) {
          if (e.ownerId === personId && isComplete(k, comps)) {
            const task = tasks[e.taskId];
            if (task) totalMin += (task.estMin || 0);
          }
        }
        current = addDays(current, 1);
      }
      return totalMin;
    }
```

Run `grep -n "weeklyTime" scoreboard.html` after deletion — expect no matches.

### Step 4: Append CSS

In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Drilldown contribution line ── */
.sb-drilldown__contrib {
  font-size: var(--font-sm);
  color: var(--text-muted);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--spacing-sm);
  font-variant-numeric: tabular-nums;
}
```

### Step 5: Bump cache

In [sw.js](../../../sw.js), bump `v258` → `v259`.

### Step 6: Verify visually

Open the drilldown. Below the summary row, a muted line reads e.g. `2h 30m contributed`. Hidden when contribution is 0 minutes.

### Step 7: Commit

```bash
git add shared/scoring.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): time contributed stat in drilldown

Generalized weeklyTime into scoring.timeContributed(personId, ...,
startDate, endDate). Drilldown renders 'X h Y m contributed' below
the summary row for the active period. Deleted the orphan local
weeklyTime helper. Pure scoring module stays DOM/utils-free by
accepting addDays as a passed argument.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Achievement gallery in drilldown

**Files:**
- Modify: `shared/scoring.js` — add `achievementProgress` helper
- Modify: `shared/components.js` — add `renderAchievementBadge` for the gallery
- Modify: `scoreboard.html` — drilldown gallery render
- Modify: `styles/scoreboard.css` — gallery grid + locked state
- Modify: `sw.js` — bump cache

**Context:** This is the engagement payoff. Show unlocked badges (top 6 by recent unlock) in a 3-column grid, plus 2-3 closest *locked* achievements with progress hints. Use the existing achievement-def structure from `DEFAULT_ACHIEVEMENTS`.

### Step 1: Add `achievementProgress` helper to scoring.js

In [shared/scoring.js](../../../shared/scoring.js), AFTER `checkNewAchievements` (around line 553+), ADD:

```js
/**
 * Compute progress toward a single achievement definition. Returns null if the
 * achievement isn't stat-based (e.g. manual-only), or if already unlocked.
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
      // Grade-based — threshold is a tier number; progress hard to express linearly.
      // Show a friendly hint without numeric progress.
      hint = `reach ${threshold} grade`;
      return { current: 0, required: 1, progressPct: 0, hint };
    default:
      return null;
  }
  const progressPct = Math.min(100, Math.round((current / threshold) * 100));
  return { current, required: threshold, progressPct, hint };
}
```

### Step 2: Add `renderAchievementBadge` to components.js

In [shared/components.js](../../../shared/components.js), find an appropriate location near other small render helpers (e.g. after `renderGradeBadge` around line 2173). ADD:

```js
/**
 * Render a single achievement badge tile (unlocked or locked).
 * Locked tiles are dimmed and show a progress hint underneath.
 *
 * @param {object} def - Achievement definition { icon, label, ... }
 * @param {object} state - { unlocked: boolean, unlockedAt?: number, hint?: string }
 * @returns {string} HTML
 */
export function renderAchievementBadge(def, state) {
  const lockedClass = state.unlocked ? '' : ' achievement-badge--locked';
  const subline = state.unlocked
    ? (state.unlockedAt ? new Date(state.unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')
    : (state.hint || '');
  return `<div class="achievement-badge${lockedClass}" title="${esc(def.description || def.label || '')}">
    <span class="achievement-badge__icon">${esc(def.icon || '🏆')}</span>
    <span class="achievement-badge__label">${esc(def.label || '')}</span>
    ${subline ? `<span class="achievement-badge__sub">${esc(subline)}</span>` : ''}
  </div>`;
}
```

### Step 3: Render the gallery in the drilldown

In [scoreboard.html](../../../scoreboard.html), update the import for components.js to include `renderAchievementBadge`. Find the existing import (line 43 area):

```js
import { renderNavBar, initNavMore, initBottomNav, renderHeader, renderEmptyState, renderErrorState, renderBottomSheet, openDeviceThemeSheet, initOfflineBanner, initBell, initBanner, applyDataColors, renderScoreCard, renderSectionHead, renderPersonAvatar } from './shared/components.js';
```

Add `renderAchievementBadge`:

```js
import { renderNavBar, initNavMore, initBottomNav, renderHeader, renderEmptyState, renderErrorState, renderBottomSheet, openDeviceThemeSheet, initOfflineBanner, initBell, initBanner, applyDataColors, renderScoreCard, renderSectionHead, renderPersonAvatar, renderAchievementBadge } from './shared/components.js';
```

Update scoring.js import to add `achievementProgress`:

```js
import { basePoints, dailyScore, periodGrade, collectSnapshots, aggregateSnapshots, gradeDisplay, earnedPoints, mergeAchievementDefs, getActiveAchievements, calculateBalance, checkNewAchievements, familyGrade, timeContributed, achievementProgress } from './shared/scoring.js';
```

In `openDrilldown`, AFTER the Category Breakdown section and BEFORE the Weekly Trend section, ADD:

```js
      // ── Achievement gallery (Pass 3) ──
      {
        const personAchievements = allAchievementsData?.[personId] || {};
        const unlockedEntries = Object.entries(personAchievements)
          .filter(([, a]) => !a.revoked)
          .map(([key, a]) => ({ key, def: activeDefs[key], unlockedAt: a.unlockedAt }))
          .filter(e => e.def)
          .sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0))
          .slice(0, 6);

        // Build context for progress computation (mirrors checkNewAchievements call site)
        const pStreak = streaks[personId] || { current: 0, best: 0 };
        const personMsgsForCtx = allMessages?.[personId] || {};
        const personAnchorForCtx = allAnchors?.[personId] || null;
        const { totalEarned } = calculateBalance(personId, allSnapshots, personMsgsForCtx, personAnchorForCtx, allMultipliers, tz);
        const progressContext = {
          streak: pStreak.current,
          bestStreak: pStreak.best,
          totalEarned,
          tasksCompleted: 0,
          perfectDays: 0,
          hasRedeemed: Object.values(personMsgsForCtx).some(m => m.type === 'redemption-approved'),
        };

        const lockedCandidates = Object.entries(activeDefs)
          .filter(([key]) => !personAchievements[key] || personAchievements[key].revoked)
          .map(([key, def]) => ({ key, def, prog: achievementProgress(def, progressContext) }))
          .filter(e => e.prog && e.prog.progressPct > 0)
          .sort((a, b) => b.prog.progressPct - a.prog.progressPct)
          .slice(0, 3);

        if (unlockedEntries.length > 0 || lockedCandidates.length > 0) {
          html += renderSectionHead('Achievements');
          html += `<div class="sb-achievements">`;
          for (const e of unlockedEntries) {
            html += renderAchievementBadge(e.def, { unlocked: true, unlockedAt: e.unlockedAt });
          }
          html += `</div>`;

          if (lockedCandidates.length > 0) {
            html += `<div class="sb-achievements__label">Closest to unlock</div>`;
            html += `<div class="sb-achievements sb-achievements--locked">`;
            for (const e of lockedCandidates) {
              html += renderAchievementBadge(e.def, { unlocked: false, hint: e.prog.hint });
            }
            html += `</div>`;
          }
        }
      }
```

### Step 4: Append CSS

In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Achievement gallery (drilldown) ── */
.sb-achievements {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.sb-achievements__label {
  font-size: var(--font-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
  padding: var(--spacing-xs) 0;
}

.achievement-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: var(--spacing-sm) var(--spacing-xs);
  background: var(--surface-2);
  border-radius: var(--radius-md);
  min-height: 80px;
}

.achievement-badge__icon {
  font-size: 1.5rem;
  line-height: 1;
}

.achievement-badge__label {
  font-size: var(--font-xs);
  font-weight: 600;
  line-height: 1.2;
}

.achievement-badge__sub {
  font-size: 10px;
  color: var(--text-faint);
  line-height: 1.2;
}

.achievement-badge--locked {
  opacity: 0.55;
}

.achievement-badge--locked .achievement-badge__icon {
  filter: grayscale(70%);
}
```

### Step 5: Bump cache

`v259` → `v260`.

### Step 6: Verify visually

Open the drilldown for a person with at least 1 unlocked badge. Unlocked badges render in a 3-col grid with icon/label/date. Below them: a "CLOSEST TO UNLOCK" subheader and 1-3 locked badges with hints like "5/7 day streak". If no badges at all, the section is absent (no empty box).

### Step 7: Commit

```bash
git add shared/scoring.js shared/components.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): achievement gallery in drilldown

Top 6 unlocked badges in a 3-col grid (sorted by recency) plus
top 3 closest-to-unlock locked badges with progress hints
('5/7 day streak'). New scoring.achievementProgress() helper and
components.renderAchievementBadge() render the gallery.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Kudos / Send Points button

**Files:**
- Modify: `shared/components.js` — extend `renderSendMessageSheet` to accept a `preset` option (preselects target person, optional preset message)
- Modify: `scoreboard.html` — add "Send Kudos" CTA in the drilldown; wire it to `renderSendMessageSheet`
- Modify: `styles/scoreboard.css` — CTA button styling
- Modify: `sw.js` — bump cache

**Context:** The existing `renderSendMessageSheet` at [shared/components.js:3387](../../../shared/components.js#L3387) already has the chip group + text input + optional points/reward picker. Kudos reuses it; we just need to open it preset to the drilldown's person.

### Step 1: Check & extend `renderSendMessageSheet`

- [ ] First, read the current `renderSendMessageSheet` signature and look for where it's invoked. Grep `renderSendMessageSheet` across the project. Determine:
  - Does it already accept a "preselected target" arg?
  - Does it submit by calling `writeMessage` directly, or returning data to a caller's submit handler?

If it accepts a preselected person ID, no signature change needed — pass `personId` and a preset message body.

If it doesn't accept a preselected target, ADD an optional 3rd or 4th argument like `{ preselectedPersonId, presetTitle, presetBody }` and use those values when rendering the form.

**Do not refactor anything else in `renderSendMessageSheet`.** If a signature change is needed, update only its callers in `scoreboard.html` (introduced this task) and the existing callers (verify they still work with the new optional arg).

### Step 2: Add the "Send Kudos" button in the drilldown

In [scoreboard.html](../../../scoreboard.html), in `openDrilldown`, AFTER the Balance section and BEFORE the Needs Attention section, ADD:

```js
      // ── Send Kudos button (Pass 3) ──
      html += `<button class="sb-kudos-btn" type="button" id="ddKudos">
        <span class="sb-kudos-btn__icon" aria-hidden="true">👏</span>
        <span class="sb-kudos-btn__label">Send kudos to ${esc(person.name)}</span>
      </button>`;
```

### Step 3: Wire up the click

After the existing `requestAnimationFrame(() => { ... })` block that sets up the close button, add:

```js
        document.getElementById('ddKudos')?.addEventListener('click', () => {
          // Open the existing message sheet, preselected to this person
          openKudosSheet(personId);
        });
```

ADD this helper near `closeDrilldown`:

```js
    function openKudosSheet(targetPersonId) {
      const target = people.find(p => p.id === targetPersonId);
      if (!target) return;
      const sheetHtml = renderSendMessageSheet(people, sbRewards || {}, {
        preselectedPersonId: targetPersonId,
        presetTitle: `Kudos from ${linkedPerson?.name || 'family'}`,
        presetBody: '',
      });
      const mount = document.getElementById('drilldownMount');
      mount.innerHTML = renderBottomSheet(sheetHtml);
      applyDataColors(mount);
      requestAnimationFrame(() => {
        const overlay = document.getElementById('bottomSheet');
        overlay?.classList.add('active');
        overlay?.addEventListener('click', (e) => {
          if (e.target === overlay) closeDrilldown();
        });
        // Submit handler — adapt to whatever submit pattern the existing sheet uses.
        // If renderSendMessageSheet sets up its own form#sendMessageForm submit handler,
        // we may need to override it here to inject 'kudos' type. Inspect the existing
        // implementation and decide. Recommended: pass an onSubmit option through the
        // extended signature in Step 1.
      });
    }
```

**Note:** the submit handler is the trickiest part. Investigate the existing `renderSendMessageSheet` integration during Step 1 — if the existing pattern is "page wires up its own form submit handler," then the scoreboard wires up a handler that calls `writeMessage(targetPersonId, { type: 'bonus', title, body, amount, kudosFrom: linkedPerson?.name || 'family', seen: false, createdAt: ServerValue.TIMESTAMP })`. Use `type: 'bonus'` because that's what `calculateBalance` already credits — no scoring.js change needed.

### Step 4: Append CSS

In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Kudos CTA button ── */
.sb-kudos-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  margin: var(--spacing-md) 0;
  background: var(--accent-soft);
  color: var(--accent-ink);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: var(--font-sm);
  cursor: pointer;
  transition: background var(--t-fast, 0.15s);
}

.sb-kudos-btn:hover,
.sb-kudos-btn:focus-visible {
  background: color-mix(in srgb, var(--accent-soft) 80%, var(--accent));
}

.sb-kudos-btn__icon {
  font-size: 1.1rem;
}
```

### Step 5: Bump cache

`v260` → `v261`.

### Step 6: Verify visually

Open drilldown. Below Balance, a soft-accent "👏 Send kudos to Samantha" button appears. Tapping it opens the send-message sheet preset to that person. Submitting writes a message that credits the points to the recipient.

### Step 7: Commit

```bash
git add shared/components.js scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): Send Kudos CTA reuses message sheet

Drilldown gains 'Send kudos to NAME' button that opens the existing
renderSendMessageSheet preset to the target person. Submission
posts a 'bonus' message — already credited by calculateBalance,
so no scoring extension required. Sender attribution stored in
kudosFrom field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tappable Needs Attention + Mark Late-Done

**Files:**
- Modify: `scoreboard.html` — `openDrilldown` Needs Attention rows become tappable; long-press shows menu
- Modify: `styles/scoreboard.css` — affordances
- Modify: `sw.js` — bump cache

**Context:** Missed/Late rows currently render but aren't interactive. Tap → open task detail sheet. Long-press → context menu with "Mark Late-Done" or "Open Task" options. Mark Late-Done writes a completion with `isLate: true` and `pointsOverride: settings?.pastDueCreditPct ?? 75` — same shape as dashboard.js.

### Step 1: Make Needs Attention rows tappable

In [scoreboard.html](../../../scoreboard.html), find the existing Needs Attention task row rendering inside `openDrilldown`:

```js
        for (const item of items) {
          html += `<div class="sb-drilldown__task">
            <span class="sb-drilldown__task-name">${item.catIcon ? esc(item.catIcon) + ' ' : ''}${esc(item.name)}</span>
            <span class="sb-drilldown__task-date">${formatDateShort(item.date)}</span>
            <span class="sb-drilldown__task-pts">${item.earned}/${item.pts}</span>
          </div>`;
        }
```

REPLACE with:

```js
        for (const item of items) {
          // item gained an entryKey for tap-action wiring (Pass 3) — see taskDetails build below
          html += `<button class="sb-drilldown__task sb-drilldown__task--tappable" type="button" data-entry-key="${esc(item.entryKey || '')}" data-status="${esc(item.status)}">
            <span class="sb-drilldown__task-name">${item.catIcon ? esc(item.catIcon) + ' ' : ''}${esc(item.name)}</span>
            <span class="sb-drilldown__task-date">${formatDateShort(item.date)}</span>
            <span class="sb-drilldown__task-pts">${item.earned}/${item.pts}</span>
          </button>`;
        }
```

### Step 2: Ensure `entryKey` is captured in the taskDetails array

Find the `taskDetails.push(...)` call earlier in `openDrilldown`:

```js
          taskDetails.push({ name: task.name, catIcon, date: cur, pts, earned, status });
```

UPDATE to include `entryKey`:

```js
          taskDetails.push({ entryKey: k, name: task.name, catIcon, date: cur, pts, earned, status });
```

`k` is the entryKey from `Object.entries(dayEntries)` — already in scope.

### Step 3: Add the click + long-press handlers

Inside `openDrilldown`'s `requestAnimationFrame(() => { ... })` block, AFTER the existing close-button binding, ADD:

```js
        // Needs Attention rows — tap opens action sheet; long-press also works
        for (const row of document.querySelectorAll('.sb-drilldown__task--tappable')) {
          const entryKey = row.dataset.entryKey;
          const status = row.dataset.status;
          if (!entryKey) continue;
          row.addEventListener('click', () => {
            openLateActionSheet(entryKey, status);
          });
        }
```

### Step 4: Add the late-action sheet helper

Near `openKudosSheet` (from Task 4) and `closeDrilldown`, ADD:

```js
    async function openLateActionSheet(entryKey, status) {
      const entry = (() => {
        for (const day of Object.keys(schedule)) {
          if (schedule[day]?.[entryKey]) return schedule[day][entryKey];
        }
        return null;
      })();
      if (!entry) return;
      const task = tasks[entry.taskId];
      if (!task) return;

      const sheetHtml = `
        <div class="sb-late-action">
          <div class="sb-late-action__title">${esc(task.name)}</div>
          <div class="sb-late-action__sub">Status: ${esc(status)}</div>
          <button class="sb-late-action__btn sb-late-action__btn--primary" id="ddLateDone" type="button">Mark Late-Done</button>
          <button class="sb-late-action__btn" id="ddLateCancel" type="button">Cancel</button>
        </div>`;
      const mount = document.getElementById('drilldownMount');
      // Stack the action sheet ABOVE the drilldown — append, don't replace.
      const overlayEl = document.createElement('div');
      overlayEl.id = 'lateActionOverlay';
      overlayEl.className = 'bottom-sheet-overlay active';
      overlayEl.innerHTML = `<div class="bottom-sheet">${sheetHtml}</div>`;
      mount.appendChild(overlayEl);

      const close = () => overlayEl.remove();
      overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
      document.getElementById('ddLateCancel').addEventListener('click', close);
      document.getElementById('ddLateDone').addEventListener('click', async () => {
        await writeCompletion(entryKey, {
          completedAt: firebase.database.ServerValue.TIMESTAMP,
          completedBy: 'scoreboard',
          pointsOverride: settings?.pastDueCreditPct ?? 75,
          isLate: true,
        });
        close();
        // Refresh the drilldown: cheap path — reload page
        location.reload();
      });
    }
```

Note: We import `writeCompletion` from `./shared/firebase.js`. Find the existing firebase.js import line at the top of the script (line 42):

```js
import { initFirebase, isFirstRun, readSettings, ... } from './shared/firebase.js';
```

Add `writeCompletion` to the named imports.

**Note on `location.reload()`:** the rest of the codebase prefers `loadData(); render();` per CLAUDE.md, but the scoreboard page doesn't have a `loadData()` helper — its data is loaded once at script start. A cheap workaround: `location.reload()` is acceptable here as a one-off. If this is a violation per CLAUDE.md, the implementer should instead refactor data fetches into a callable function before reusing it. **Recommend the cheap `location.reload()` for Pass 3** and revisit if it bites.

### Step 5: Append CSS

In [styles/scoreboard.css](../../../styles/scoreboard.css), append:

```css
/* ── Tappable Needs Attention rows ── */
.sb-drilldown__task--tappable {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-size: var(--font-sm);
  text-align: left;
  width: 100%;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.sb-drilldown__task--tappable:last-child { border-bottom: none; }
.sb-drilldown__task--tappable:hover { background: var(--surface-2); }
.sb-drilldown__task--tappable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ── Late-action sheet ── */
.sb-late-action {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.sb-late-action__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.sb-late-action__sub {
  font-size: var(--font-sm);
  color: var(--text-muted);
  margin-bottom: var(--spacing-sm);
}

.sb-late-action__btn {
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}

.sb-late-action__btn--primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
```

### Step 6: Bump cache

`v261` → `v262`.

### Step 7: Verify visually + functionally

Open drilldown for a person with at least one Missed task. The missed-task rows now have hover + focus affordance. Tap one → action sheet appears with the task name and a "Mark Late-Done" button. Tap Mark Late-Done → completion written, page reloads, the previously-missed task no longer appears in Needs Attention.

### Step 8: Commit

```bash
git add scoreboard.html styles/scoreboard.css sw.js
git commit -m "$(cat <<'EOF'
feat(scoreboard): tappable Needs Attention with Mark Late-Done

Missed/Late rows become tappable buttons. Tap opens a small action
sheet stacked above the drilldown. 'Mark Late-Done' writes a
completion with isLate:true + pointsOverride:pastDueCreditPct
(same shape as dashboard's late-credit path). Page reloads after
write to reflect the new state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Documentation + final push

- [ ] Append a "Pass 3 — Shipped" note at the bottom of [docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md](../specs/2026-05-12-scoreboard-rebuild.md) under the Pass 3 section. Include commit SHAs.

- [ ] Stage and commit:

```bash
git add docs/superpowers/specs/2026-05-12-scoreboard-rebuild.md docs/superpowers/plans/2026-05-12-scoreboard-pass-3.md
git commit -m "$(cat <<'EOF'
docs(scoreboard): Pass 3 plan + shipped note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] Push: `git push origin main`

---

## Self-review checklist

1. **Spec coverage:** 3.1 (inline badge + fam compare) → Task 1. 3.2 (achievement gallery) → Task 3. 3.3 (time contributed) → Task 2. 3.4 (kudos) → Task 4. 3.5 (tappable + late-done) → Task 5. ✓
2. **Placeholders:** Task 4 has an explicit "investigate during Step 1" because `renderSendMessageSheet`'s submit pattern isn't fully known yet; that's a research step, not a placeholder. Document the finding inline in the commit message.
3. **No schema changes:** Confirmed. Kudos uses existing `type: 'bonus'`, late-done uses existing completion shape.
4. **Cache bumps:** Five sequential (v258 through v262). ✓
5. **Backward compatibility:** All new helpers/components are additive. Existing call sites unchanged unless `renderSendMessageSheet` signature extension proves needed (Task 4 Step 1).
