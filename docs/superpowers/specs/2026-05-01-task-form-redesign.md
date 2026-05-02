# Task Form Redesign

**Date:** 2026-05-01  
**Status:** Approved — pending implementation  
**Spec for:** `renderTaskForm()` + `openTaskForm()` — replaces `renderTaskFormCompact()`, `openQuickAddSheet()`, `openEditTaskSheet()`  
**CSS prefix:** `tf-*`  
**Pattern:** §5.23 Form sheet pattern. Event Form (`renderEventForm` + `openEventForm`) is the canonical reference.

---

## Goals

Replace the legacy admin-style task form (dense 3-column grid, no sticky footer, `<input type="time">`, old `owner-chip` pattern) with a polished `tf-*` form that feels as fast and clean as the Event Form. Primary design constraint: **how fast can one enter a task — faster is better.**

---

## Fields Removed

These fields are dropped entirely from the new form:

| Field | Reason |
|---|---|
| Event time | Dead. Standalone events are created via the Event Form now. Existing task data with `eventTime` is ignored on edit. |
| Bounty (type / amount / reward) | Removed. Parents send bonus points or reward messages via the notification bell instead. Existing tasks with `bounty` data are ignored on edit. |

The `Exempt` toggle is kept but moved to the `+ Cooldown` reveal (rare field, lives with other advanced options).

---

## Field Inventory (final)

| Field | Control | Default | Visibility |
|---|---|---|---|
| Name | Large title input | empty | Always |
| Owners | Person chips (ef2 state machine) | activePerson if filtered, else none | Always |
| Assign mode | [Rotate · Everyone] inline pills | Rotate | Only when 2+ owners selected |
| Rotation | [Daily · Weekly · Monthly · One-Time] pills | Daily | Always |
| Dedicated day | Select (Any / Mon–Sun) | Any | Inline reveal — Weekly only |
| Dedicated date | Inline date picker (ef2 pattern) | today | Inline reveal — One-Time only |
| Difficulty | Tappable picker chip | Medium | Always (details row) |
| Duration (Est. Min) | Tappable picker chip | 10 min | Always (details row) |
| Time of Day | Tappable picker chip | Anytime | Always (details row) |
| Category | Tappable picker chip | family default category | Always (details row) |
| Notes | Textarea, hidden by default | empty | Revealed by `+ Notes` chip |
| Cooldown days | Number input, hidden by default | smart default (see below) | Revealed by `+ Cooldown` chip |
| Exempt | Toggle, hidden by default | false | Revealed by `+ Cooldown` chip |

---

## Vertical Structure (top to bottom)

```
sheet__header             "New Task" / "Edit Task"  +  ✕ close
──────────────────────────────────────────────────────────────
tf-title-row              Large name input
                          placeholder: "What's the task?"
──────────────────────────────────────────────────────────────
tf-for-section            "For" label  +  Family chip (header line)
                          Person chips — horizontal scroll, ef2 state machine
                          [Rotate · Everyone] pills — inline, below chips,
                          only visible when 2+ owners selected
──────────────────────────────────────────────────────────────
tf-rotation-section       [Daily] [Weekly] [Monthly] [One-Time] pills
                          → Weekly: reveals day-of-week select inline below pills
                          → One-Time: reveals inline date picker (ef2-picker-wrap)
──────────────────────────────────────────────────────────────
tf-details-row            Tappable summary chips:
                          [Medium]  [10 min]  [Anytime]  [Category name]
                          Each chip opens a lightweight popover picker
──────────────────────────────────────────────────────────────
tf-extras-row             [+ Notes]  [+ Cooldown]
tf-field-reveal (notes)   Textarea — expands when + Notes tapped
tf-field-reveal (cd)      Cooldown number input + Exempt toggle
                          — expands when + Cooldown tapped
──────────────────────────────────────────────────────────────
tf-footer (sticky)        [Cancel]        [Create Task / Save Changes]
──────────────────────────────────────────────────────────────
tf-delete-zone            Edit mode only
                          "Delete this task?" → [Delete] [Keep]
                          Inline confirm, never window.confirm
```

---

## Person Chips — ef2 State Machine

Reuse the exact pattern from the Event Form:

- **Unselected:** gray chip, color dot via `--chip-color` CSS var
- **Primary** (`data-state="primary"`): solid fill in person color, white text
- **Attending** (`data-state="attending"`): outlined in person color
- **Family chip** (`.tf-person-chip--family`, same as `.ef2-person-chip--family`): uses `--accent`, lives in the "For" header line next to the label — not in the scrollable row
- Click rules: unselected → primary (if no primary), else attending. Attending → primary (demote old). Primary → deselect (promote first attending).
- Set `--chip-color` after mount: `chip.style.setProperty('--chip-color', chip.dataset.personColor)`
- Container: `flex-wrap: nowrap; overflow-x: auto` with right-edge fade gradient. Hide scrollbar.

**Family chip behavior (task context):** Tapping Family selects all people as attending and sets assign mode to Everyone (Duplicate). This is the "whole household does this task" shortcut. Family chip deselects if any individual is then deselected.

**Assign mode:** `[Rotate · Everyone]` pills appear in a row below the person chips, only when 2+ owners are selected. Hidden with `is-hidden` class otherwise. Short labels — no wrapping risk on mobile.

---

## Rotation Pills + Contextual Reveals

Four pills: **Daily · Weekly · Monthly · One-Time**

Tapping a pill:
- **Daily:** hides any day/date reveal
- **Weekly:** shows a `<select>` inline below pills (Any / Mon / Tue / Wed / Thu / Fri / Sat / Sun). Also updates cooldown default to 3 days if cooldown reveal is open.
- **Monthly:** hides day/date reveal. Updates cooldown default to 7 days.
- **One-Time:** shows an inline date picker (`<div class="tf-picker-wrap">` collapsible, same pattern as `ef2-picker-wrap`). Default: today's date.

---

## Details Row — Tappable Chip Pickers

A single horizontal row of four chips showing current values. Each chip opens a small focused picker overlay on tap. Picker auto-dismisses on selection or outside tap. Not a full bottom sheet — lightweight popover anchored above the chip row.

### Difficulty picker
Three large tappable cells, full-width in the popover:

```
[ Easy ]   [ Medium ]   [ Hard ]
```

Default: **Medium**. One tap selects and closes.

### Duration picker
Seven preset cells + Custom:

```
[ 5 ]  [ 10 ]  [ 15 ]  [ 20 ]  [ 30 ]  [ 45 ]  [ 60 ]  [ Custom ]
```

Default: **10**. Tapping Custom reveals a number input inline within the popover. Chip label shows "X min" (e.g. "10 min", "45 min", "25 min").

### Time of Day picker
Four cells:

```
[ Morning ]   [ Anytime ]   [ Afternoon ]   [ Both ]
```

Default: **Anytime**. "Both" stores as `"both"` internally (task appears in Morning and Afternoon sections on dashboard). One tap selects and closes.

### Category picker
Scrollable list of all categories from Firebase. Each row: icon + label. Tapping selects and closes. The chip label shows the category icon + truncated name.

---

## Extras — + Notes and + Cooldown

Both follow the `ef2-add-chip` / `ef2-field-reveal` pattern:
- Dashed border when inactive, solid when active (same visual language as Event Form)
- Tap to open and focus, tap again to close. ✕ button inside is secondary close path.
- `+ Cooldown` chip label updates once a non-zero value is set: `+ Cooldown` → `3 days`

### Cooldown reveal
When expanded shows:
1. **Cooldown days** — number input, pre-filled with smart default based on current rotation
2. **Exempt from scoring** — toggle switch

**Smart cooldown defaults** (applied when rotation changes, only affects the pre-fill — user can override):

| Rotation | Default cooldown |
|---|---|
| Daily | 0 (field hidden, irrelevant) |
| Weekly | 3 days |
| Monthly | 7 days |
| One-Time | 0 (field hidden, irrelevant) |

For Daily and One-Time, the cooldown number input is hidden inside the reveal (no scheduling use case), but the `+ Cooldown` chip remains visible so the Exempt toggle is always accessible. The chip label for Daily/One-Time shows `+ Options` instead of `+ Cooldown` to avoid implying a cooldown can be set.

---

## Sticky Footer

Exact `ef2-footer` pattern renamed `tf-footer`:

```css
.tf-footer {
  position: sticky;
  bottom: 0;
  margin: var(--spacing-sm) calc(-1 * var(--spacing-md)) calc(-1 * var(--spacing-lg));
  padding: var(--spacing-sm) var(--spacing-md);
  padding-bottom: calc(var(--spacing-sm) + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  gap: var(--spacing-sm);
  z-index: 1;
}
.tf-footer .btn { flex: 1; }
```

Buttons: `[Cancel]` (ghost) + `[Create Task]` / `[Save Changes]` (primary).

---

## Delete Zone (edit mode only)

Below sticky footer. Destructive red text. Tap reveals inline confirm — never a separate sheet, never `window.confirm`:

```
Delete this task?  [Delete]  [Keep]
```

On confirm: delete task + orphaned schedule entries + orphaned completions from Firebase, then close sheet.

---

## Padding Rules (§5.23)

- Form sections have **no horizontal padding**. `.bottom-sheet__content` supplies the single gutter.
- Title row: `padding: var(--spacing-xs) 0`
- For / rotation / details sections: `padding: var(--spacing-sm) 0`
- No asymmetric vertical gaps between sections.

---

## Architecture

### `renderTaskForm({ task, taskId, mode, categories, people })` — `shared/components.js`
Pure HTML generator. No DOM access. Returns a string. Replaces `renderTaskFormCompact`.

- `mode: 'create' | 'edit'`
- `task`: existing task object (edit) or `{}` (create)
- `taskId`: existing push ID (edit) or `null` (create)
- `categories`: array of `{ key, label, icon, isDefault, isEvent? }` — all categories included. Event-category tasks are valid (the form just lacks the now-removed event-time field). Existing event-category tasks are fully editable.
- `people`: array of `{ id, name, color }`

### `openTaskForm(taskId = null, savedState = null)` — `dashboard.js`
Single wiring function replacing `openQuickAddSheet` and `openEditTaskSheet`.

- `taskId = null` → create mode; `taskId` set → edit mode
- `savedState`: optional serialized form state for sub-sheet round-trips (pickers are inline — no round-trip needed in practice, but the hook is there)
- FAB pre-fills: if `activePerson` is set, that person's chip starts in `primary` state
- Mounts via `taskSheetMount.innerHTML = renderBottomSheet(html)`, attaches all listeners, manages picker overlays, calls Firebase writes

### `captureFormState()` — inner function of `openTaskForm`
Serializes all live form state to a plain object. Captures: name, ownerIds, assignMode, rotation, dedicatedDay, dedicatedDate, difficulty, estMin, timeOfDay, categoryKey, notes, notesOpen, cooldownDays, exempt, cooldownOpen.

### Call sites
| Location | Current | New |
|---|---|---|
| `dashboard.js` FAB | `openQuickAddSheet()` | `openTaskForm()` |
| `dashboard.js` edit | `openEditTaskSheet(taskId)` | `openTaskForm(taskId)` |
| `calendar.html` | local call to `renderTaskFormCompact` | `openTaskForm(taskId)` |
| `tracker.html` | local call to `renderTaskFormCompact` | `openTaskForm(taskId)` |

Both calendar.html and tracker.html have their own `taskSheetMount` div and currently define a local `openEditTaskSheet`. Each page defines its own local `openTaskForm` that calls `renderTaskForm` from `shared/components.js` and wires to its own `taskSheetMount`. Dashboard.js is not a module — there is nothing to import from it. This matches the §5.23 rule: DOM wiring lives in page-level JS.

---

## Save Logic (create)

1. Validate: name required (shake animation + red border if empty)
2. Collect all field values from DOM
3. Set `ownerAssignmentMode`: if 1 owner → `'fixed'`; else read Rotate/Everyone pill
4. Set `cooldownDays`: read from reveal if open; else apply smart default for the rotation
5. Write to `rundown/tasks/{newId}` via `writeTask`
6. Generate today's schedule entry (per existing scheduler behavior for new tasks)
7. Run `buildScheduleUpdates` for future 90 days
8. `closeTaskSheet()`, `render()`

## Save Logic (edit)

Same as create, plus:
1. Auto-rebuild future schedule (`buildScheduleUpdates` with `includeToday: true`) — matches existing `openEditTaskSheet` behavior
2. `tasks[taskId] = updated` local cache update before `render()`

---

## CSS File

All `tf-*` styles added to `styles/components.css` bracketed:

```css
/* ── Task Form ─────────────────────────────────────────── */
...
/* ── End Task Form ─────────────────────────────────────── */
```

The picker overlay (`.tf-picker-overlay`) is positioned fixed, above the bottom sheet, z-index above the sheet but below modals. It contains the picker content and a transparent backdrop that captures outside taps to dismiss.

---

## Non-Negotiables (from §5.23 + CLAUDE.md)

- No `<input type="time">` — time of day is a picker chip, not a time input
- No `window.confirm` / `window.alert` — delete uses inline confirm zone
- No horizontal padding on form sections
- Sticky footer uses negative-margin breakout (`tf-footer`)
- Person chips use ef2 state machine (primary / attending / unselected)
- Each form gets its own CSS prefix — `tf-*` only, never reuse `ef2-*`
- Empty, loading, and error states required on save
- No emoji in buttons, labels, headers, or form chrome

---

## SW Cache

Bump `CACHE_NAME` version in `sw.js` after implementation (no new files are added, but JS/CSS change).
