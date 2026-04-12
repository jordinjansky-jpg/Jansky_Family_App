# 1.1 Calendar Overhaul (Family Hub) — Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Scope:** calendar.html, calendar.css, shared modules, Firebase schema

## Goal

Transform the calendar from a task-centric month grid into the family's primary hub screen — a Skylight-quality, Google-Calendar-replacing unified view of events, tasks, and family activity. This is the single most important feature for the Skylight transformation.

**Design bar:** As clean as Skylight, as easy as Google Calendar. Must be polished enough that the family stops opening Google Calendar entirely.

---

## 1. View Hierarchy & Navigation

### Views

| View | Role | Entry point |
|------|------|-------------|
| **Week** | Default landing screen. "What's happening this week?" | Calendar page load, header switcher |
| **Month** | Navigation tool. "Which day/week do I want?" | Header view switcher button |
| **Day** | Full detail drill-in. "Everything about this day." | Tap a day from week or month |

### Navigation

- **View switcher** in the header toggles between Week and Month (small button, like Skylight's top-corner switcher).
- **Day view** is entered by tapping a day — zoom-in feel, not a mode switch. No explicit "Day" tab.
- **Swipe left/right** navigates within the current view:
  - Week view: previous/next week
  - Month view: previous/next month
  - Day view: previous/next day
- **"Today" button** snaps back to the current week (week view) or current month (month view).
- **Back from day view:** swipe down, back button, or tap the week/month header to zoom back out.

### Transitions

- Subtle **fade and slide** CSS transitions between views (not page loads).
- Drilling from month/week → day: slide-in from the tapped cell's direction.
- Swipe navigation: smooth scroll feel via CSS `transform` and `transition`.
- No elaborate zoom-morph animations in v1 — polish pass later.

---

## 2. Week View (Default Landing Screen)

The primary "at a glance" view. Shows the current 7-day week.

### Layout

- **7 day columns**, current day highlighted with accent border.
- Each column divided into time sections (not rigidly slotted — content-driven).

### Content per day column

1. **All-day events** — Colored banner at top of column spanning full width.
2. **Timed events** — Colored pills using the event's own color (filled background, white text). Format: "3:30 Soccer". Ordered chronologically.
3. **Weekly/monthly tasks** — Below events as compact checkable rows. Lighter visual weight: small checkbox + person color dot + task name. Checkable directly from week view.
4. Daily chores and anytime tasks are **NOT shown** in week view — keeps it clean. They appear only in the day view.

### Event pills

- Background color: the event's own color (defaults to first assigned person's color, overridable per event).
- People shown as small colored dots beside/below the pill when multiple people are assigned.
- Density setting controls how many pills show per day before "+N more" overflow chip.

### Task rows

- Outlined/lighter styling to distinguish from event pills visually.
- Small checkbox, person color dot, task name.
- Tap checkbox to complete directly. Tap name for detail.

### Density setting

- **Cozy** — Fewer items per column, larger text. Good for wall/distance viewing.
- **Snug** — More items, smaller text. For busy families / phone screens.
- Default auto-detects based on screen width (cozy for tablet+, snug for phone).
- Configurable in admin settings (family default) and personal preferences (per-device override).

### Person filter

- Person pills persistent at top, below header.
- Selecting a person filters events and tasks to show only theirs.
- "All" shows everyone (default).
- Filter persists across view switches.

---

## 3. Day View (Drill-in)

Entered by tapping any day from week or month view. Slide/fade transition in.

### Layout

**Single continuous scroll** with sticky section headers. Content dictates space — no fixed split.

### Sections

#### Events (sticky header: "Events")
- Chronological list of the day's events.
- Each event rendered as a colored bubble: event color background, time + name + person dots.
- All-day events listed first with an "All Day" label instead of time.
- Tap an event to open detail sheet (location, notes, people, edit, delete).

#### Tasks (sticky header: "Tasks")
- **Grouped by person** (Skylight-style). Each person gets a sub-section with their name and color as the header.
- Tasks within each person sorted by time-of-day: Morning → Afternoon → Evening → Anytime.
- Tasks not relevant to the current time of day are **dimmed but not hidden** (user may want to complete morning tasks late).
- Checkboxes for completion. Tap to toggle.
- Completed tasks sink to bottom of each person's section (strikethrough, dimmed).
- Long-press opens detail sheet (points slider, delegate, move, edit) — same behavior as current app.
- Past daily tasks are tap-blocked (opens detail sheet instead) — same as current.

### Day header

- Date, day of week, "Today" badge if applicable.
- Overall progress: "8/12 done".
- Grade badge (if scoring enabled).

### Navigation

- Swipe left/right between days.
- On wider screens (tablet/kiosk): Events and Tasks sections render **side-by-side** instead of stacked.

---

## 4. Month View (Navigation Tool)

Accessed via the view switcher in the header. Its job is answering "which day do I want to look at?" with enough visual signal to guide that choice.

### Day cells (controlled by density setting)

**Snug (default on phone):**
- Day number
- 1-2 truncated event names in event colors
- Task progress indicator (small bar or ring)
- "+N more" chip when content overflows

**Cozy (default on tablet+):**
- Day number
- Colored dots for events (no text)
- Task progress indicator
- Simpler, readable from distance

### Visual states (carried from current implementation)

- Today: accent border + gentle tint.
- All-done days: green checkmark treatment.
- Past days: dimmed. Past-incomplete: slightly dimmed.
- Selected day: accent highlight.

### Interaction

- Tap a day → zooms into day view.
- Swipe left/right → previous/next month.
- Person filter applies — cells reflect only the filtered person's events/tasks.

---

## 5. Universal Add Menu ("+")

### Entry point

Single "+" button in the header (replaces current "Add Task" button). Tap opens a quick menu:

- **New Event** — Opens streamlined event form.
- **New Task** — Opens current quick-add task form (cleaned up visually).
- (Future slots: **Add Meal** for 1.3, **Add to List** for 1.6 — extensible by design.)

### New Event form

**Minimal by default (3 core fields):**
1. **Name** — Text input, auto-focused.
2. **Date** — Pre-filled with currently viewed day (from week/day view context).
3. **Start time** — Time picker. Toggle for "All day" which hides time fields.
4. **People** — Color chips, multi-select.

**"More options" expandable section:**
- End time
- Color picker (defaults to first assigned person's color)
- Location
- Notes
- URL/link (for Zoom links, school portals, etc.)
- Recurrence — hidden until 2.2 is built
- Reminders — hidden until 2.1 is built

**No PIN required.** Anyone in the family can create events.

### New Task form

- Same as current quick-add form, cleaned up visually to match new design.
- PIN-gated if `pinProtected` is enabled on the task's category.

---

## 6. Event Architecture (New)

### Why separate events from tasks

Events and tasks are fundamentally different:
- **Events** have: name, date/time, duration, color, people, location — they're things that happen.
- **Tasks** have: rotation, owners, difficulty, estMin, points, category, cooldown — they're things to do.

They share almost nothing. Keeping them in the same `tasks/` node means every code path needs `if (isEvent)` guards. Separating them is the right architecture.

### Event coloring

- Each event has its **own color** (not derived from a category or person).
- Default: first assigned person's color.
- Override: user picks a custom color in the event form (e.g., "all school events are yellow").
- In views: event pills/bubbles use the event's color. Assigned people shown as small colored dots.
- Person filter shows/hides events based on people assignment.

### Events and the schedule

- Events get entries in `rundown/schedule/` with `type: 'event'` and `eventId`.
- Event schedule entries are lightweight: `{ type: 'event', eventId }`. No `ownerId`, `rotationType`, or other task fields.
- Events do NOT participate in: scoring, completions, streaks, snapshots, scheduler rotation logic.
- Events are purely display items in the schedule — they exist so the calendar views can query by date range efficiently (same `readAllSchedule()` call loads both tasks and events).
- Events can also be read directly from `rundown/events/` and filtered by `date` field for simpler lookups (e.g., day view).

### Event editing and deletion

- Tap an event in any view → opens event detail sheet (same bottom sheet pattern as task detail).
- Detail sheet shows: name, date/time, people, location, notes, URL, color.
- **Edit** button opens the event form pre-filled. Save updates `events/{id}` and the corresponding schedule entry.
- **Delete** button with confirmation. Removes `events/{id}` and its schedule entry.
- **No PIN required** for editing or deleting events (consistent with creation).

### Migration from isEvent categories

- One-time migration (run from admin or on first load, idempotent).
- Reads all categories with `isEvent: true`.
- For each task with an event category:
  - Creates a new `events/` record (name, date from dedicatedDate, time from eventTime, color from category's eventColor, people from owners).
  - Updates schedule entries: sets `type: 'event'`, adds `eventId`, removes `taskId`.
  - Removes orphaned completions (events don't have completions).
- After migration: `isEvent` categories can be deleted or converted to regular categories.

---

## 7. Firebase Schema Changes

### New node: `rundown/events/`

```
rundown/events/{pushId} ← {
  name,             // string — event title
  date,             // string YYYY-MM-DD
  allDay,           // boolean — true = no start/end time
  startTime?,       // string HH:MM (24h) — null if allDay
  endTime?,         // string HH:MM (24h) — optional
  color,            // string hex color (e.g., "#4285f4")
  people[],         // string[] — array of person IDs
  location?,        // string — optional
  notes?,           // string — optional
  url?,             // string — optional link (Zoom, school portal)
  recurrence?,      // object — reserved for 2.2, null for now
  reminders?,       // object — reserved for 2.1, null for now
  createdDate       // string YYYY-MM-DD
}
```

### Modified: `rundown/schedule/` entries

```
rundown/schedule/{YYYY-MM-DD}/{entryKey} ← {
  type: 'task' | 'event',  // NEW — defaults to 'task' for backward compat
  taskId?,                   // present when type === 'task'
  eventId?,                  // present when type === 'event'
  ownerId,                   // kept for tasks (single owner per entry)
  // ... existing task schedule fields unchanged
}
```

### Modified: `rundown/settings`

```
calendarDefaults: {
  defaultView: 'week',      // 'week' | 'month'
  density: 'snug',          // 'cozy' | 'snug'
  weekStartDay: 0           // 0 = Sunday, 1 = Monday
}
```

### Unchanged

- `rundown/tasks/` — no schema changes
- `rundown/completions/` — only applies to tasks, unchanged
- `rundown/snapshots/` — only applies to tasks, unchanged
- `rundown/streaks/` — unchanged
- `rundown/people/` — unchanged
- `rundown/categories/` — `isEvent` categories removed after migration

### localStorage additions (personal preferences)

```
dr-cal-prefs: {
  defaultView?: 'week' | 'month',
  density?: 'cozy' | 'snug',
  personFilter?: string | null
}
```

Resolution order: personal localStorage → family admin default → app default.

---

## 8. Settings & Configuration

### Family defaults (admin, PIN-protected)

Set in admin Settings tab:
- **Default calendar view:** Week or Month
- **Display density:** Cozy or Snug
- **Week start day:** Sunday or Monday

These apply to everyone unless overridden by personal preferences.

### Personal preferences (theme/preferences button, no PIN)

The existing theme button (palette icon) on all page headers expands into a **Preferences sheet**:
- Device theme (already exists)
- Preferred default view
- Density override
- Default person filter

Stored in `localStorage` as `dr-cal-prefs`, per-device. No PIN required.

The theme button already exists on: dashboard, calendar, scoreboard, tracker. Available on all main pages.

---

## 9. Scope Boundaries

### In scope for 1.1

- Week view (default), month view (navigation), day view (drill-in)
- View switcher in header + tap-to-zoom day drill-in
- Event architecture: new `events/` Firebase node, separated from tasks
- Universal "+" menu with New Event (minimal form) and New Task
- All-day events
- Event color picker + people dots
- Person filter across all views
- Display density setting (Cozy / Snug)
- Week start day setting
- Personal preferences via theme button
- Migration from isEvent categories to events/ node
- Fade/slide CSS transitions
- Responsive: side-by-side day view on wider screens

### NOT in scope for 1.1

- **Recurrence rules** — Reserved field only. Built in 2.2.
- **Push notifications / reminders** — Reserved field only. Built in 2.1.
- **Meal planning integration** — Day view section layout supports it, but no meal data. Built in 1.3.
- **Kiosk/wall display mode** — Density settings lay groundwork. Built in 1.5.
- **Person-as-navigation (avatar tap)** — Noted for 1.5 kiosk backlog.
- **Unified vs separated view toggle ("Skylight mode")** — Unified is the only mode in 1.1. Option for separated mode is a future preference.
- **Google Calendar sync/import** — Not currently planned.
- **Natural language event input** — Structured form only.
- **Dashboard changes** — index.html / dashboard.js unchanged.
- **Shopping lists** — Separate feature (1.6).

---

## 10. Backlog Updates Required

The following backlog items in CLAUDE.md should be updated after this spec is approved:

1. **1.1 spec** — Replace current description with reference to this design doc.
2. **1.3 (Meal Planning)** — Note that the day view's sticky-section architecture is designed to accommodate a "Meals" section. The universal "+" menu has a slot for "Add Meal."
3. **1.5 (Kiosk)** — Add "person-as-navigation / avatar tap" to feature list. Note that density settings and responsive side-by-side day view lay groundwork.
4. **2.1 (Push Notifications)** — Note that `reminders` field is reserved on `events/` schema.
5. **2.2 (Flexible Recurrence)** — Note that `recurrence` field is reserved on `events/` schema. Recurrence applies to events (new node) not just tasks.
6. **General** — Note that events are now a separate `rundown/events/` node, not tasks with an `isEvent` category. Any backlog items referencing event categories should be updated.
