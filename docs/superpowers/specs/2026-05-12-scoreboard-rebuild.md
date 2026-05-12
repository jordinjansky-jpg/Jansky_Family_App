# Scoreboard Rebuild — Master Spec

**Date:** 2026-05-12
**Author:** Claude (Opus 4.7)
**Bar:** Skylight / Linear / Things mobile quality
**Goal:** Turn the scoreboard from a stats page into a family engagement engine — without making it noisier.

**Test environment:**
- Playwright at 412×915 (Samsung S26 Ultra)
- `http://localhost:8080/scoreboard.html` (live data) or `?env=dev` for writes
- Viewport-only screenshots (`fullPage: false`) — sticky header + bottom nav

**Files this spec touches:**
- [scoreboard.html](../../../scoreboard.html) — single-file page (inline module script)
- [styles/scoreboard.css](../../../styles/scoreboard.css) — page-specific styles
- [shared/components.js](../../../shared/components.js) — `renderScoreCard`, possibly new `renderHeatmap`
- [shared/scoring.js](../../../shared/scoring.js) — possibly new aggregate helpers (family score, day-of-week pattern)
- [shared/firebase.js](../../../shared/firebase.js) — no new paths (no schema changes in this rebuild)

---

## Direction

The scoreboard's job is twofold: **answer "how are we doing?" at a glance**, and **give kids a reason to come back tomorrow**. Today it does the first job (just barely) and almost none of the second. The drilldown — the natural place to load up engagement content — is currently a thin stats summary.

This rebuild splits the work across four passes so we can ship continuously and never leave the page in a broken in-between state:

| Pass | Focus | Theme |
|---|---|---|
| 1 | **Fix + Cut** | Repair the bugs, remove the redundant sections — leaner page in one session |
| 2 | **Hero rebuild** | Rank visibility, family score banner, time-to-grade hint |
| 3 | **Drilldown rebuild** | Achievement gallery, kudos w/ rewards, tappable Needs Attention, time contributed, family-avg comparison |
| 4 | **Insights & heatmap** | 90-day heatmap replaces broken sparkline; streak-at-risk + day-of-week added to Highlights rotation |

**Out of scope for this rebuild** (intentionally deferred):
- Streak freeze tokens — adds rules complexity, lawyer-able by kids; revisit if engagement plateaus
- Shareable recap image — flashy but heavy; wait until after the Year-in-Review roadmap item ships (uses same canvas pipeline)
- Adult/kid split toggle — overkill at 4-person family; revisit at 6+
- Just-me default in person mode — minor; wait for kid-PWA feedback to validate it matters
- Any items already in [docs/ROADMAP.md](../../ROADMAP.md) (Sentiment trend, Sibling collab, Year-in-review, etc.)

---

## Design principles

**1. Main page stays scannable.** Only three additions to the main page across the whole rebuild: family score banner, rank chips, time-to-grade hint. Everything else lives in the drilldown or in the rotating Highlights slot.

**2. Highlights is the noise budget.** Hard-capped at 3 rows max. Computes all candidate insights, shows top 3 by priority. If fewer than 2 candidates fire, hide the section entirely. Prevents the "lonely one-row card" feel.

**3. Drilldown is opt-in, so load it up.** Achievement gallery, kudos, heatmap, comparisons — all of these add zero noise to the main page because they only render on tap.

**4. No new schema in passes 1–3.** Pass 4 may add a single `rundown/familyGoals/` path for the family score; otherwise reads from existing data.

**5. The drilldown should feel like a person profile, not a stats summary.** Right now it's a thin "B+ · 86% · 3 missed tasks" recap. It should answer: "Where am I, what's next to earn, what changed, what can I do about the misses?"

---

## Pass 1 — Fix + Cut

**Goal:** In one session, the page already feels tighter — bugs gone, redundant sections removed, ~30% less vertical scroll.

### Bugs to fix

**1.1 Weekly Trend sparkline collapses to invisibility with sparse data.**

Location: [scoreboard.html:599-613](../../../scoreboard.html#L599-L613)

Today, when 4-week history has only 1-2 weeks of real data, the `Math.max(pct, 4)` floor renders every bar as a barely-visible ~4% slice. Result: section shows 4 labels (`-3w / -2w / Last / Now`) with no visible bars underneath.

**Fix:** Hide the Weekly Trend section entirely when fewer than 2 of 4 weeks have `possible > 0`. Pass 4 replaces this section with a 90-day heatmap, so the sparkline is on borrowed time — the cheap hide is enough until then.

**1.2 Highlights "improvement" arrow is a chevron.**

Location: [scoreboard.html:337-339](../../../scoreboard.html#L337-L339)

The `trendSvg('up')` SVG renders a chevron-up (accordion expand caret), not a rising trend arrow. Reads as "scroll up" not "trending up."

**Fix:** Replace SVG with a true rising trend arrow:
```html
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
  <polyline points="16 7 22 7 22 13"/>
</svg>
```

(Down-arrow is currently unused — leave the down-variant of `trendSvg` deleted or unfixed since no caller uses it.)

**1.3 "12 Mo" column header is inconsistent with "Year" period tab.**

Location: [scoreboard.html:427](../../../scoreboard.html#L427)

Period tabs say "Year." Column says "12 Mo." Pick one.

**Fix:** Change column header to "Year" — but the All Grades table is removed entirely in Pass 1 cut #2, so this fix may be moot. If All Grades survives any future pass, "Year" is the canonical label.

**1.4 Hero card empty state when person has no tasks today.**

Location: [scoreboard.html:131](../../../scoreboard.html#L131), [shared/components.js:1858 `renderScoreCard`](../../../shared/components.js#L1858)

When `todayScore` returns `{ grade: '--', percentage: 0 }`, the hero card on the "Today" tab still shows "0%" and a `--` badge. Reads as failure, not "no tasks scheduled."

**Fix:** In `renderScoreCard`, when `active.possible === 0`, replace the `0%` + `--` badge with the muted copy "No tasks today" in the right slot. Keep the points balance display.

### Sections to cut

**1.5 Remove the Balances section.**

Location: [scoreboard.html:447-462](../../../scoreboard.html#L447-L462)

The hero card already shows points balance. The Balances section repeats it with a chevron-to-rewards. Cut entirely.

**Replacement affordance:** the balance number on the hero card becomes its own tap target. Tap the points → `rewards.html?person=<name>`. Tap anywhere else on the card → drilldown. Implementation in Pass 2 hero rebuild; Pass 1 just removes the section.

**Interim accessibility:** until Pass 2, no rewards link from this page. Users can reach rewards via the bottom nav. Acceptable trade for one session.

**1.6 Remove the All Grades table.**

Location: [scoreboard.html:419-445](../../../scoreboard.html#L419-L445)

5-column-by-N-row table of 20+ grade badges is information-dense but low-signal — hero cards already show the active-period grade. Most families won't read it.

**Cut entirely.** No replacement. If anyone misses it, Pass 2 adds period-cycling on hero cards (tap the grade badge to cycle Today → Week → Month → Year).

### Pass 1 acceptance

- Sparkline section hidden in drilldown when sparse data
- Highlights "up" arrow renders as a rising trend arrow, not a chevron
- Hero card on Today tab shows "No tasks today" when person has no scheduled work
- Balances section gone
- All Grades section gone
- Page renders cleanly with no console errors at 412×915
- Screenshot diff: roughly 30% less vertical scroll on the main page

---

## Pass 2 — Hero Rebuild

**Goal:** The leaderboard finally reads as a leaderboard. Rank is visible. The family is a team, not just a list of competitors. Score is actionable.

### Additions

**2.1 Family score banner.**

A slim row above the period tabs:
```
Family · B+ this week  ↑
```

- Computed by aggregating all four people's `weeklyGrade` (or whichever period is active) into a single `aggregateSnapshots()` call.
- Background: `var(--surface-2)` with a 2-3px accent stripe on the left in family theme color (`var(--accent)`).
- Trend arrow follows the same rules as the existing `weeklyTrend` helper but for the family aggregate.
- When the page is in a person-link context (`?person=<name>`), shrink this banner to "Family avg: B+" — less prominent because the user is here for self-focus.
- Tap target: opens a small sheet showing each person's contribution (mini version of the leaderboard).

**Implementation:** New helper `familyGrade(period)` in [shared/scoring.js](../../../shared/scoring.js). Single row of HTML in `render()` above the period tabs.

**2.2 Rank chips on hero cards.**

Inside the colored left stripe area of each `card--score`, render `#1`, `#2`, `#3`, `#4` as a small badge. Ties get the same number (`#1`, `#1`, `#3`).

- Zero new height — uses existing stripe area.
- Visual treatment for #1: subtle gold ring (`box-shadow: 0 0 0 1px var(--grade-a)`) on the card. #2 silver, #3 bronze (use `var(--grade-b)`, `var(--grade-c)` for color cohesion). Or simpler: only #1 gets the ring, others get the chip alone.
- Sort still happens but rank is now explicit, not implied by position.

**2.3 Time-to-grade hint on Today tab only.**

On each hero card, when `selectedPeriod === 'today'` AND the person has incomplete tasks today AND completing them would lift their grade tier, show a subtitle line:
```
3 more tasks → A−
```

- Computation: figure out the smallest number of remaining tasks (sorted by `basePoints` descending) that pushes `earned/possible` over the next grade tier threshold from [shared/scoring.js](../../../shared/scoring.js).
- Hide when: not Today tab, no incomplete tasks, or already at A+ tier.
- Position: small muted line below the points balance, above the badge emoji row.

**2.4 Hero card becomes multi-zone tappable.**

- Card body → drilldown (current behavior)
- Points balance → `rewards.html?person=<name>` (replaces removed Balances section)
- Grade badge → cycle period (Today → Week → Month → Year) inline — gives All-Grades-table users the comparison without the table

Implementation: nested buttons with stopPropagation on inner zones.

### Pass 2 acceptance

- Family banner renders at the top with correct family aggregate grade + trend arrow
- Tapping the family banner opens a contribution breakdown sheet
- Rank chips visible on every hero card; #1 visually distinguished
- Today tab hero cards show "X more tasks → grade" hint when applicable
- Tapping the balance number navigates to rewards page
- Tapping the grade badge cycles period and re-renders just that card (not full page)
- No regressions: drilldown still opens from card body

---

## Pass 3 — Drilldown Rebuild

**Goal:** The drilldown becomes a real person profile — engagement content, not just a stats recap. This is where most of the engagement payoff lives.

### Additions

**3.1 Inline grade badge in header.**

Currently:
```
[Avatar] Samantha          Last 7 Days  [X]
─────────
[B] 360/420 pts · 86%
```

Change to:
```
[Avatar] Samantha · [B+]   Last 7 Days  [X]
─────────
360/420 pts · 86%  ·  +3 vs family
```

- Grade badge moves inline with the name (smaller — `grade-badge--sm`)
- "Comparison vs family avg" appended to the stats row
- Removes redundant large badge below the divider

**3.2 Achievement gallery section.**

New section after Category Breakdown, before Streak.

```
ACHIEVEMENTS
[unlocked badge grid — 3-column, max 6 visible, "View all" if more]
NEXT TO EARN
[2-3 locked achievements with progress text — e.g. "🔥 7-day streak · 2 days to go"]
```

- Reads from `getActiveAchievements(mergeAchievementDefs(achDefsObj))` (already loaded at line 65)
- Unlocked: sort by `unlockedAt` descending, show top 6 in a 3-col grid (`grid-template-columns: repeat(3, 1fr)`), each as `[icon] [name]` with unlock date below
- Locked: compute "closest to unlock" — for each unrevoked locked def, compute current progress vs. requirement, sort by `(current/required)` descending, show top 3
- Requires a new helper in [shared/scoring.js](../../../shared/scoring.js): `achievementProgress(def, context)` returning `{ current, required, progressPct, hint }`. Currently `checkNewAchievements` only returns boolean — needs sibling to return progress.

**3.3 Time contributed stat.**

Single line in the summary block:
```
B+ · 360/420 pts · 86% · +3 vs family
4h 32min contributed
```

- Wires up the orphan `weeklyTime()` function at [scoreboard.html:163](../../../scoreboard.html#L163)
- Generalizes it to `timeContributed(personId, dStart, dEnd)` — drops in for any period
- Format using existing `formatMinutes()` from utils

**3.4 Kudos + Send Points (reuses message form).**

After the Streak section, a single CTA button:
```
[👏 Send Kudos to Samantha]
```

Tapping opens a sheet that reuses the existing message form pattern (from `renderMealEditorSheet` / message authoring elsewhere). Form fields:
- Message text (required)
- Optional: attach points (+50, +100, custom)
- Optional: attach a reward token (pulls from `readBank()`)
- Sender (auto-set to `linkedPerson?.name`, or family member picker if not in person mode)

On submit:
- Calls `writeMessage(targetPersonId, { type: 'kudos', text, fromName, pointsBonus, rewardTokenId, sentAt })`
- If points attached, also writes a multiplier or balance anchor — schema TBD; recommend new message `type: 'kudos-bonus'` and let scoring.js's `calculateBalance` already-existing message-bonus path handle it (verify it exists; otherwise extend).

**Verification: does `calculateBalance` already credit pointsBonus from messages?** Check [shared/scoring.js](../../../shared/scoring.js) `calculateBalance()`. If yes, only the message type needs adding. If no, add the credit logic there too.

**3.5 Tappable Needs Attention rows + Mark Late-Done quick action.**

Each `sb-drilldown__task` row becomes tappable:
- Single tap → opens that task's detail sheet (reuse `renderTaskDetailSheet` from components.js)
- Long-press (800ms, matching other long-press timing per CLAUDE.md) → context menu: "Mark Late-Done" / "Open Task"

Mark Late-Done writes a completion with `isLate: true` and `pointsOverride: pastDueCreditPct`. Reuses existing late-credit logic. After write, refresh the drilldown without closing it.

### Pass 3 acceptance

- Drilldown header has inline badge and family-comparison subtitle
- Achievements section shows unlocked grid + next-to-earn locked
- Time contributed renders in summary
- Kudos button opens form sheet; submission posts to recipient inbox and credits points/reward if attached
- Missed/Late rows in Needs Attention tappable; long-press shows quick actions
- No regressions: existing sparkline (until Pass 4 replaces it), streak, balance still render

---

## Pass 2 — Shipped 2026-05-12

Commits on main:
- `1b6b792` — feat(scoreboard): family score banner above period tabs
- `9a79820` — feat(scoreboard): rank chips on hero cards with leader gold ring
- `df8ac95` — feat(scoreboard): time-to-grade hint on Today tab hero cards
- `f750c8e` — feat(scoreboard): hero cards have three tap zones

Verified at 412×915: family banner renders with correct trend arrow on week/month; rank chips visible (#1 with green ring using `--grade-a` not literal gold); time-to-grade hints fire on Today tab (e.g. "1 more task → C"); all three click zones routed correctly (card body → drilldown, balance pts → rewards.html?person=…, grade badge → cycles week→month→year→today→week, period tab click clears per-card overrides).

---

## Pass 3 — Shipped 2026-05-12

Commits on main:
- `4503d94` — feat(scoreboard): drilldown header has inline grade badge + family comparison
- `26372d0` — feat(scoreboard): time contributed stat in drilldown
- `101f405` — feat(scoreboard): achievement gallery in drilldown
- `dda632e` — feat(scoreboard): Send Kudos CTA reuses message sheet
- `4a3ad26` — feat(scoreboard): tappable Needs Attention with Mark Late-Done

Verified at 412×915: drilldown header shows inline B+ badge next to name and "+X vs family" subtitle. "2h 19m contributed" line renders under summary. Achievement gallery shows 6 unlocked badges in 3-col grid (sorted by recency) + "Closest to unlock" section with dimmed locked badges and progress text. "Send kudos to NAME" button opens existing `renderSendMessageSheet` preselected to that person. Missed/Late rows are now `<button>` elements; tap opens action sheet with Mark Late-Done that writes the same completion shape as dashboard's late-credit path.

**Findings during execution:**
- `renderSendMessageSheet` already accepted `preselectedPersonId` — no signature change needed.
- Used `type: 'bonus'` for kudos messages so `calculateBalance` credits the points natively (no scoring.js change).
- Drilldown does not have a `loadData()` helper; Mark Late-Done falls back to `location.reload()`. Future polish pass could refactor.
- Family banner tap-to-open contribution sheet was deferred from Pass 2 and remains deferred — not implemented in Pass 3.

---

## Pass 4 — Insights & Heatmap

**Goal:** Replace the broken sparkline with a heatmap that tells a real story. Surface insight rows in Highlights to drive return visits.

### Additions

**4.1 90-day heatmap replaces Weekly Trend sparkline.**

GitHub-contributions-style grid:
- 13 columns (weeks) × 7 rows (days), Sun→Sat
- Each cell colored by daily grade using `var(--grade-a/b/c/f)` palette
- Empty cells (no tasks scheduled / future) rendered as `var(--border)`
- Header labels for month boundaries
- Tap a cell → small tooltip showing date + grade + earned/possible

**Implementation:**
- New helper `renderHeatmap(snapshots, personId, tz, today)` in [shared/components.js](../../../shared/components.js)
- Replace the entire `sb-sparkline--labeled` block in drilldown ([scoreboard.html:597-613](../../../scoreboard.html#L597-L613))
- Section header changes from "Weekly Trend" to "Last 90 Days"

**4.2 Streak-at-risk insight.**

New Highlights candidate:
- Fires when: person has current streak ≥ 5 AND today has incomplete tasks AND local time is past 6pm
- Copy: "⚠️ Lexi's 12-day streak ends tonight — 3 tasks left"
- Priority: 1 (highest — overrides other Highlights candidates if conflict)

Implementation: helper `streakAtRisk(personId, schedule, comps, streak, today, tz)` in scoring.js. Called once per person in the existing `board.map()` precompute block.

**4.3 Day-of-week pattern insight.**

New Highlights candidate:
- Fires when: person has ≥ 21 days of snapshot data (3 weeks) AND there's a measurable best/worst day delta (≥ 10% between best DoW and worst DoW)
- Copy: "Lexi peaks on Tuesdays (A−), dips on Saturdays (C+)"
- Priority: 4 (lowest — only shows if other candidates don't fill the 3 slots)

Implementation: helper `dayOfWeekPattern(snapshots, personId)` in scoring.js. Groups snapshots by `dayOfWeek()` from utils.js, averages each group, returns `{ bestDay, bestGrade, worstDay, worstGrade, delta }` or null if not enough data.

**4.4 Highlights rotation logic.**

Currently the page builds a fixed list of 3 highlight candidates (streak leader, most improved, all-done/100%). Replace with a priority queue:

```
Candidates (compute all that fire):
  1. streak-at-risk      (per person — highest priority)
  2. streak-leader (≥5)
  3. perfect-day-today
  4. all-done-today
  5. most-improved
  6. personal-best
  7. day-of-week-pattern (lowest priority)

Sort by priority, take top 3, render.
```

Also: if zero candidates fire, hide the Highlights section entirely (today it renders empty/missing — already correct, just confirm).

**4.5 Personal-best insight.**

New candidate (priority 6):
- Detects when a person's current month's perfect-day count exceeds any previous month's perfect-day count
- Copy: "🏆 Samantha just set a personal best — 5 perfect days this month"
- Implementation: scan `snapshots` for the person, group by month, count `percentage === 100` days per month, compare current month vs. all prior months

### Pass 4 acceptance

- Heatmap renders in drilldown, 13×7 grid with correct colors for each day
- Tapping a heatmap cell shows date + grade + points popover
- Weekly Trend sparkline code removed from scoreboard.html
- Streak-at-risk fires correctly when conditions met (verify with manual test: create incomplete tasks, set clock to 6pm via dev tools)
- Day-of-week insight shows for accounts with 3+ weeks of history
- Personal-best insight fires the first time a kid sets a new monthly best
- Highlights renders top 3 of fired candidates by priority; hides when 0 fire

---

## Open questions / decisions deferred to plans

1. **Family score schema:** does the family-aggregate grade need its own Firebase path for caching, or compute on every render? Recommend compute-on-render in Pass 2; cache only if perf measurably suffers.
2. **Kudos rewards integration:** verify `calculateBalance` already credits message-bonus points. If not, Pass 3 needs a small extension to scoring.js.
3. **Heatmap tap UX on mobile:** popover vs. inline expansion. Recommend popover (matches existing tooltip pattern on sparkline). Decide during Pass 4.
4. **Locked achievement progress text:** how much hand-holding? "2 days to go" is great. "Complete 3 more tasks this week" is also great. Specific copy per def — needs review during Pass 3.

---

## Plan documents

Plans are written one pass at a time, just before executing, so each plan can incorporate context from completed prior passes.

- Pass 1: [docs/superpowers/plans/2026-05-12-scoreboard-pass-1.md](../plans/2026-05-12-scoreboard-pass-1.md)
- Pass 2: TBD (write after Pass 1 ships)
- Pass 3: TBD (write after Pass 2 ships)
- Pass 4: TBD (write after Pass 3 ships)
