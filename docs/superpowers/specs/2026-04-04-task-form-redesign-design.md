# Task Form Redesign — Condensed Layout + Admin Modal

**Date:** 2026-04-04
**Status:** Approved

## Problem

The create/edit task forms require scrolling on mobile. There are 3 nearly-identical form implementations (admin inline, quick-add sheet, edit task sheet). Admin edit opens inline among the task list rather than as a focused overlay.

## Goals

1. No-scroll task form on mobile (target: fits in ~580px viewport height)
2. Admin edit as a centered modal with backdrop dismiss
3. Unify all 3 form implementations into one shared renderer

## Design

### Condensed Form Layout

**Shortened labels** (prevent text wrapping on narrow screens):
| Current | New |
|---|---|
| Task Name | Name |
| Est. Minutes | Est. Min |
| Time of Day | Time |
| Assignment Mode | Assign |
| Cooldown Days | Cooldown |
| Exempt from scoring | Exempt |
| Dedicated Day / Scheduled Date | Day / Date |

**Row packing (top to bottom):**

1. **Name** — full-width input
2. **Rotation \| Difficulty \| Time** — 3-column row
3. **Category \| Est. Min** — 2-column row (category 2fr, est-min 1fr)
4. **Owners** — full-width chip row
5. **Assign** — inline rotate/duplicate toggle buttons, no hint text
6. **Cooldown \| Exempt** — side by side (number input left, checkbox right)
7. **Day/Date** — conditional row, only when rotation ≠ daily
8. **Event Time** — conditional, only when category is event
9. **Cancel \| Save** — action buttons, right-aligned

**Spacing reduction (scoped to compact form class):**
- `form-group` margin-bottom: `--spacing-xs` (down from `--spacing-md`)
- Labels: keep `font-size-sm`, minimal bottom margin
- Remove hint text where buttons/labels are self-explanatory (assignment mode hint)

### Admin Edit Modal

- Replace inline `renderTaskForm(id)` with a centered modal overlay
- Markup: `.task-form-backdrop` (fixed, semi-transparent) wrapping `.task-form-modal` (centered card)
- Backdrop click or Cancel button → close modal, reset `editingTaskId`
- CSS: `position: fixed; inset: 0; display: flex; align-items: center; justify-content: center`
- Modal card: `max-width: 420px; width: calc(100% - 32px); max-height: 90vh; overflow-y: auto` (safety net)
- Same condensed form inside

### Unified Renderer

Replace the 3 duplicated form implementations with one shared function in `components.js`:

```
renderTaskFormCompact({ task, taskId, mode, categories, people, prefix })
```

- `task`: task object (empty `{}` for create)
- `taskId`: string or null
- `mode`: `'create'` | `'edit'`
- `categories`: array of `{ key, label, icon, isEvent, isDefault }`
- `people`: array of `{ id, name, color }`
- `prefix`: ID prefix string (`'tf'`, `'qa'`, `'et'`) for form element IDs — maintains backward compat with existing event listener code

Returns HTML string. Callers wrap it in their container (bottom sheet, modal, or inline div).

### Files Changed

1. **`shared/components.js`** — Add `renderTaskFormCompact()`. Remove `renderQuickAddSheet()` body (re-implement as wrapper calling compact renderer). Remove `renderEditTaskSheet()` body (same). Export new function.
2. **`admin.html`** — Remove inline `renderTaskForm()`. Import and use `renderTaskFormCompact()`. Replace inline edit with modal overlay. Add backdrop click handler.
3. **`styles/components.css`** — Add `.form-compact` scoped spacing overrides, 3-col grid row class.
4. **`styles/admin.css`** — Add `.task-form-backdrop` and `.task-form-modal` styles.

### What Stays the Same

- All form field IDs and prefixes (tf_, qa_, et_) — existing event listener wiring unchanged
- Save/cancel logic in each page — only the HTML rendering changes
- Quick-add still appears as bottom sheet; admin create still appears at top of task list
- Dashboard/calendar edit sheet still appears as bottom sheet
