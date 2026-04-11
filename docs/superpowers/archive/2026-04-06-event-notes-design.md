# Event Notes — Design Spec

**Date:** 2026-04-06
**Status:** Approved

## Summary

Add per-instance notes to event tasks. Notes are set on the task definition (master) and copied to each schedule entry on generation. Admin edits propagate to all future entries; long-press edits are per-instance only. Notes display in the detail sheet (read-only in kid mode) and are editable in admin, quick-add, and the detail sheet.

## Data Model

### Task definition — new optional field

```
rundown/tasks/{pushId}/notes  ← string | null
```

### Schedule entry — new optional field

```
rundown/schedule/{YYYY-MM-DD}/{entryKey}/notes  ← string | null
```

Notes are only shown in the UI for event-category tasks, but the field is structurally available on any task/entry.

## Behavior Rules

| Action | What happens |
|--------|-------------|
| **Create task** (admin or quick-add) | `notes` saved on task definition. Generated schedule entries get `notes` copied from the task. |
| **Edit task in admin** | `notes` updated on task definition. All schedule entries **dated tomorrow or later** with matching `taskId` overwritten with the new note, regardless of prior per-instance edits. Today's entries are left as-is (already actionable). |
| **Long-press detail sheet** | Shows current entry's `notes`. Editable in-place via textarea. Saves directly to `schedule/{date}/{entryKey}/notes`. Does NOT update the task definition. |
| **Scheduler generates entries** | Copies `task.notes` into each generated entry if present. |
| **Task deletion** | No extra cleanup — schedule entries (and their notes) already cleaned up by existing deletion logic. |

## UI Changes

### 1. Detail Sheet (`renderTaskDetailSheet` in `shared/components.js`)

- Add a notes section below the meta chips, above the complete button.
- If notes exist: display note text with `white-space: pre-line`.
- Editable via inline textarea with Save/Cancel buttons (tap "Edit" or "Add Note" to open).
- **Event-category tasks only** — gated by `isEvent` on the category.
- **Kid mode: read-only** — show note text but no edit controls.

### 2. Task Form (`renderTaskFormCompact` in `shared/components.js`)

- Add a `<textarea>` field for notes after the Event Time field.
- Shown only when the selected category has `isEvent: true`.
- Placeholder text: "Add notes for this event..."
- Used by both quick-add and admin task creation/editing.

### 3. Admin Task Edit Propagation (`admin.html`)

- When saving a task edit for an event-category task, update:
  1. `rundown/tasks/{id}/notes` — the master note.
  2. All schedule entries dated **tomorrow or later** with matching `taskId` — overwrite their `notes` field. Today's entries are left unchanged.
- Use a Firebase multi-path update for atomicity.

### 4. Quick-Add (`dashboard.js`, `calendar.html`)

- Notes textarea appears when event category is selected (same as task form).
- On save, `notes` is included in the task definition and copied to the generated schedule entry.

## Scheduler Change

In `shared/scheduler.js`, `generateRotatedEntries()` (line ~166): add `notes: task.notes || null` to `baseEntry` so notes propagate to every generated schedule entry.

Also applies to `generateDuplicateEntries()` — same pattern.

## Firebase

No new helper functions needed. Use existing `writeData()` with path `schedule/${dateKey}/${entryKey}/notes` for per-instance note saves from the detail sheet. Admin propagation uses multi-path update via existing `getDb().ref('rundown').update(updates)`.

## Styling

Minimal additions in `styles/components.css`:

- `.task-detail__notes` — note display container with subtle background, rounded corners, padding.
- `.task-detail__notes-text` — text display with `white-space: pre-line` for line break preservation.
- `.task-detail__notes-input` — textarea matching existing form input styling. 3-4 rows default height.
- `.task-detail__notes-actions` — Save/Cancel button row for inline editing.

## Scope Boundaries

- **Event-only in UI** — notes fields gated by `isEvent` on category.
- **No search/filter** by notes content.
- **No character limit** enforced (plain text, line breaks supported).
- **No display on task cards, calendar cells, or kid mode cards** — detail sheet only.
- **Kid mode detail sheet** — read-only display, no edit controls.
- **No rich text / markdown** — plain text with line breaks only.

## Schema Update (CLAUDE.md)

Update the tasks and schedule entry documentation:

```
tasks/{pushId}      ← { ..., notes? }
schedule/{date}/{entryKey} ← { ..., notes? }
```
