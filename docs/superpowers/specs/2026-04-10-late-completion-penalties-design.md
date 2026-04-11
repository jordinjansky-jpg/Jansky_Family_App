# Late Completion Penalties — Design Spec

## Summary

Move late-completion penalty logic from scoring-time detection to completion-time recording. Block tap-to-complete on past daily tasks (require long-press detail sheet). Make the late penalty visible via the existing points slider and overridable by parents.

## Schema Change

Completion record gains one optional field:

```
completions/{entryKey}: {
  completedAt: timestamp,
  completedBy: string,
  pointsOverride?: number,   // existing — now also used for late penalty
  isLate?: true              // NEW — display/tracking flag, not used in scoring
}
```

No migration needed. Existing completions without `isLate` are treated as on-time. Historical snapshots already captured their scores.

## Late Detection at Completion Time

When `toggleTask` completes a task (across all pages), it checks:

```
entryDateKey < today
```

If true AND the task is not an event/exempt:
- Sets `isLate: true` on the completion record
- Sets `pointsOverride: settings.pastDueCreditPct` (default 75)

**Precedence:** If a parent pre-set the slider via the schedule entry's `pointsOverride` before completion, that value takes priority (it's an intentional override). Late penalty only applies when no prior override exists.

Applies to all rotation types: daily, weekly, monthly, one-time.

## Scoring Simplification

Remove late-detection logic from scoring — it's now baked into `pointsOverride` at completion time.

### `earnedPoints` (scoring.js)
- Remove `isOverdue` option and its branch
- Logic becomes: if `pointsOverride` exists → `base × (pointsOverride / 100)`, otherwise → `base`

### `dailyScore` (scoring.js)
- Remove `isOverdueDate` variable and the `else if (isOverdueDate)` branch
- Logic becomes: if `pointsOverride` exists → use it, otherwise → base points

### `buildSnapshot` (scoring.js)
- Remove `completedDateKey > dateKey` late-detection block (lines 240-244)
- Remove the `rotationType !== 'daily'` exemption (line 241)
- Logic becomes: if `pointsOverride` exists → use it, otherwise → base points

## Tap Blocking on Past Daily Tasks

In dashboard.js, calendar.html, and kid.html, the `endPress` handler (tap) gains a guard:

```
if (isPastDaily) return;  // block tap — must use detail sheet
```

A task is "past daily" when:
- `entryDateKey < today`
- `rotationType === 'daily'`

This requires each page to make the entry's rotationType and dateKey available at tap time (via data attributes on the card or entry lookup).

**Only daily tasks are tap-blocked.** Weekly/monthly/one-time on past dates remain tappable — they already appear in the overdue banner where quick toggling is expected. The late flag + pointsOverride still get set automatically.

## Detail Sheet Button

### "Complete (Late)" label

In `renderTaskDetailSheet` (components.js) and `renderKidTaskSheet` (kid.html):

When a task is on a past date, not completed, and not an event/exempt:
- Button text: **"Complete (Late)"** instead of "Mark Complete"
- Button style: `btn--primary btn--full` (same as current — no extra elements, no wrapping)

Events/exempt tasks on past dates: button says "Complete" (no penalty applies).

No special click handler needed — `toggleTask` handles late detection for all tasks.

### Slider after late complete

After completing a task late, reopening the detail sheet shows the slider at the `pastDueCreditPct` value (e.g. 75%). Parent can adjust freely. The `isLate` flag persists regardless of slider changes.

## Task Card Visual

Incomplete past daily task cards get a small "Late" chip (same style as existing rotation/difficulty chips). This signals that tap is blocked and long-press is needed.

Completed late tasks (any rotation type) can optionally show a "Late" indicator in score detail views for transparency.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Today's tasks | No change. Tap works. Full credit. No flag. |
| Future tasks | No change. Tap works. Full credit. |
| Events / exempt | Tap blocked on past daily events for consistency. No penalty (not scored). Button says "Complete" not "Complete (Late)". |
| Overdue banner items | Tappable (not daily). Late flag + pointsOverride set on completion. |
| Uncomplete then re-complete | Record deleted on uncomplete. Re-completing re-runs late detection, re-sets both fields. |
| Parent pre-set slider | Pre-set `pointsOverride` on schedule entry takes priority over late penalty. |
| Calendar day sheet | Same rules: past daily blocked, past non-daily tappable, all get late flag. |

## Files Touched

| File | Changes |
|------|---------|
| `shared/scoring.js` | Simplify `earnedPoints`, `dailyScore`, `buildSnapshot` — remove late-detection logic |
| `shared/components.js` | "Complete (Late)" button label in `renderTaskDetailSheet` |
| `dashboard.js` | Tap blocking guard, late detection in `toggleTask` |
| `calendar.html` | Tap blocking guard, late detection in `toggleTask` |
| `kid.html` | Tap blocking guard, late detection in `toggleTask`, "Complete (Late)" in `renderKidTaskSheet` |
| `shared/components.js` or page files | "Late" chip on past daily task cards |
