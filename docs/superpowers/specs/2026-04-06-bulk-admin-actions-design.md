# Bulk Admin Actions — Design Spec

**Date:** 2026-04-06
**Status:** Draft

## Overview

Add multi-select mode to the admin tasks tab. Users toggle into select mode, check off tasks, then batch-edit fields or batch-delete via a floating action bar. After batch writes, the schedule auto-rebuilds and select mode turns off.

## State

Two new module-level variables in admin.html:

- `selectMode` (boolean, default `false`) — whether the tasks tab is in select mode
- `selectedTaskIds` (Set) — IDs of currently selected tasks

Both reset when switching tabs or exiting select mode.

## UI Changes

### Section Header (select mode toggle)

**Normal mode** (current + new "Select" button):
```
[ N tasks ]                    [ Select ] [ Templates ] [ + Add Task ]
```

**Select mode** (replaces Templates and Add Task):
```
[ N selected ] [ Select All | Deselect All ]                [ Cancel ]
```

- "Select" is a secondary button (`btn--secondary btn--sm`), same row as Templates and Add Task.
- Entering select mode hides Templates, Add Task, and the Select button. Shows count, Select All/Deselect All toggle link, and Cancel button.
- Cancel clears `selectedTaskIds`, sets `selectMode = false`, re-renders.

### Task Row Checkboxes

In select mode, each task row (`.admin-list-item[data-task-id]`) gets:

- A checkbox rendered on the left side of the row (before the task name).
- Clicking anywhere on the row toggles selection (instead of opening the edit modal).
- Selected rows get a `.admin-list-item--selected` class for a subtle background highlight.
- Per-row Edit / Pause / Delete buttons are hidden in select mode.

In normal mode, rows behave exactly as today (click opens edit modal, action buttons visible).

### Floating Action Bar

A fixed-position bar at the bottom of the screen, visible when `selectedTaskIds.size > 0` in select mode.

```
┌─────────────────────────────────────────────────────┐
│  [ Cancel ]          [ Delete Selected ] [ Edit Selected ]  │
└─────────────────────────────────────────────────────┘
```

- Position: `fixed`, bottom, centered, above nav bar (z-index above nav).
- Style: rounded corners, box shadow, background matching admin card style.
- **Edit Selected** — primary button, opens batch edit modal.
- **Delete Selected** — danger/red button, opens confirmation dialog.
- **Cancel** — secondary/ghost button, exits select mode.
- Bar disappears when selection is empty or select mode exits.

### Batch Edit Modal

Uses existing `task-form-backdrop` / `task-form-modal` pattern.

**Title:** "Edit N tasks"

**Fields** (8 dropdowns/inputs, each defaulting to "— no change —"):

| Field | Type | Options |
|-------|------|---------|
| Rotation | select | — no change —, daily, weekly, monthly, once |
| Owner Assignment Mode | select | — no change —, rotate, duplicate, fixed |
| Category | select | — no change —, (all categories from catsArray) |
| Status | select | — no change —, active, paused, completed |
| Difficulty | select | — no change —, easy, medium, hard |
| Time of Day | select | — no change —, AM, PM, Anytime, Both |
| Estimated Minutes | text input | blank = no change, numeric value = change |
| Owners | owner chips | untouched = no change; any interaction = replace owners |

**Owner chips:** Uses the existing `initOwnerChips` / `getSelectedOwners` pattern. A boolean `ownersChanged` tracks whether the user has interacted with the chips. Initially false — all chips render unselected with a hint label "Leave unchanged." On first chip click, `ownersChanged` flips to true and the hint disappears. From then on, the selected chips represent the new owner list (which may be empty if all are deselected). Only when `ownersChanged === true` does the owners field get applied during save.

**Footer:**
```
[ Cancel ]                              [ Apply to N tasks ]
```

- Cancel closes modal, returns to select mode (selection preserved).
- "Apply to N tasks" is primary button, disabled until at least one field is changed.

### Batch Delete

Uses `confirm("Delete N tasks? This cannot be undone.")`.

On confirm:
1. Delete each selected task via `removeTask(id)`.
2. Clean up orphaned schedule entries and completions for each deleted task (same cleanup logic as single-task delete, minus the undo timer).
3. Remove from `tasksObj` in memory.
4. Single schedule rebuild via `buildScheduleUpdates` + `multiUpdate`.
5. Exit select mode.
6. Show toast: "Deleted N tasks."

## Behavior Rules

1. **Save logic:** Only fields changed from "— no change —" are applied. Each task is updated via `writeTask(id, mergedData)` preserving all unchanged fields from the existing task object.
2. **Schedule rebuild:** One rebuild after all writes complete (not per-task). Uses `buildScheduleUpdates` with `{ includeToday: true }` + `multiUpdate`, same as existing task-edit pattern.
3. **Exit select mode:** After batch edit save or batch delete confirm, `selectMode` resets to false, `selectedTaskIds` clears, and `render()` is called. Toast confirms the action ("Updated N tasks" or "Deleted N tasks").
4. **Tab switching:** Switching away from tasks tab resets select mode and clears selection.
5. **Filter interaction:** Filters remain functional in select mode. Changing a filter re-renders the list — tasks that are selected but filtered out stay in `selectedTaskIds` but aren't visible. The count in the header and action bar reflects total selected (including filtered-out), so the user knows. This avoids surprising behavior where filtering deselects tasks.
6. **Select All / Deselect All:** "Select All" adds all currently visible (filtered) task IDs to `selectedTaskIds`. "Deselect All" clears the entire set (including any filtered-out selections).

## CSS Changes

New styles in `admin.css`:

- `.admin-list-item--selected` — subtle highlight background (e.g., `var(--primary-light)` or similar themed color with low opacity).
- `.bulk-action-bar` — fixed bottom bar styling (position, padding, shadow, z-index, flex layout).
- `.bulk-edit-form` — layout for the batch edit modal content (field grid, spacing).
- `.bulk-checkbox` — checkbox styling within task rows (aligned left, proper spacing).

## Files Changed

- **admin.html** — New state variables, updated `renderTasksTab()`, new `renderBulkEditModal()`, new `renderBulkActionBar()`, updated `bindTasksTab()` with select mode event handling, new `handleBulkEdit()` and `handleBulkDelete()` functions.
- **admin.css** — New styles for selected rows, floating action bar, batch edit modal, checkboxes.

No changes to shared modules, firebase.js, scheduler.js, or any other page.
