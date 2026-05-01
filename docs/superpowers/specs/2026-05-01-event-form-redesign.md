# Event Form Redesign Spec

**Date:** 2026-05-01
**Scope:** New Event / Edit Event form on the dashboard. This form is the reference design — once validated, the same visual language and structural patterns cascade to all other forms in the app.

---

## Goal

Replace the existing event creation/edit sheet with a polished, mobile-first form that is fast to complete with one thumb, handles both manual entry and AI import from a single entry point, and establishes the visual standard for every other form in the app.

---

## Design Principles

- **Title first, keyboard up immediately.** The user already knows what they're creating. Get out of the way.
- **One screen, no navigation.** Date, time, and secondary fields expand inline — no new screens except Repeat (which is genuinely complex) and the import confirm screen.
- **Tokens only when asked.** The magic-wand NL parser fires only on explicit tap. AI import fires only when the user picks a photo or iCal. Zero AI cost for plain manual entry.
- **Person color is identity, not decoration.** No per-event color picker. Event color comes from the primary person selected. Consistent scanning across the calendar.
- **This form serves as the reference design.** Every structural and visual decision made here applies to all other forms. Deviate from it intentionally and document why.

---

## Form Structure

### Header
```
New Event                              ✕
```
- Left: sheet title ("New Event" or "Edit Event")
- Right: close icon (✕), dismisses without saving
- No back arrow — this is a sheet, not a navigation stack

### Title Row
```
What's happening?          [🪄]  [📷]  [📅]
```
- Full-width text input, large font (`--font-size-lg` or equivalent), placeholder text "What's happening?"
- Autofocused on open — keyboard appears immediately
- Three small icon buttons inline on the right:
  - **🪄 Magic wand** — NL smart fill (see Import Flow)
  - **📷 Photo** — image import (see Import Flow)
  - **📅 iCal** — calendar feed import (see Import Flow)
- Icons use `--text-muted` color, increase to `--text` on tap. Not labeled — context makes them clear. Touch target minimum 44×44pt each.

### Date / Time Row
```
Thu, May 1
3:00 PM → 4:00 PM                 [ All day ]
```
- **Date row:** formatted as "Day, Mon D" (e.g. "Thu, May 1"). Tapping expands an inline date picker below the row (calendar grid, month view). Tapping again or selecting a date collapses it.
- **Time row:** start time → end time on one row. Tapping either expands an inline time picker below the row (scroll-wheel, hours + minutes). Tapping again or selecting collapses it.
- **All day toggle:** sits on the time row, right-aligned. Toggling on collapses and hides the time row entirely. Toggling off restores it with the last-used times (or defaults: 9:00 AM → 10:00 AM).
- Both rows are separated from the title by a subtle divider.
- Date pre-fills from context (the day the user tapped to create) if available; otherwise today.

### For (Person Selection)
```
For
[● Sophie]  [○ Mom]  [○ Dad]
[○ Emma]    [○ Family]
```
- Section label: "For" in `--font-size-sm`, `--text-muted`
- All family members shown as chips, plus a "Family" shortcut chip at the end
- **First tap** on a chip makes them the primary owner: chip fills solid with their color, label in white
- **Subsequent taps** on other chips add them as attending: chip shows an outline in their color, label in their color, smaller visual weight
- **Tapping the primary chip again** deselects them (primary becomes empty, next attending chip, if any, promotes to primary)
- **Family chip:** selecting it fills all chips with a shared "family" appearance using `--accent` color, overrides individual selections
- **Event color** on the calendar derives from the primary chip's person color. If Family is selected, use `--accent`.
- **Calendar tile display:** primary person's color as tile background. Attending people shown as small avatar initial chips (e.g. `M` `D`) stacked on the tile edge. Cap display at 3 initials + overflow count if more.
- Default state when form opens: no one selected (blank). The user explicitly assigns — no silent defaults that create wrong-owner events.

### Secondary Fields
```
+ Notes       + Location       + Repeat
```
- Three soft add-row chips on one line, `--font-size-sm`, `--text-muted`
- **+ Notes:** tapping reveals a multiline text input inline below the row. A small ✕ collapses it. No character limit.
- **+ Location:** tapping reveals a single-line text input inline below the row. Plain text only — no map integration. A small ✕ collapses it.
- **+ Repeat:** tapping opens the Repeat sub-sheet (see below). When a repeat rule is active, the chip label updates to show the rule summary (e.g. "Weekly · Thu") and tapping it re-opens the sub-sheet to edit.
- Once a secondary field is revealed, it stays visible until explicitly collapsed. Returning to the form after import does not collapse revealed fields.

### Footer (sticky)
```
Cancel                         Add Event
```
- Sticky at the bottom, always visible above the keyboard
- **Cancel:** ghost/secondary style, dismisses without saving
- **Add Event / Save Changes:** primary button, right-aligned, fills remaining space
- In edit mode, button label is "Save Changes"
- **Delete Event** (edit mode only): appears below the footer, full-width, separated by a visible gap. Destructive red text style. Tapping shows an inline confirmation ("Delete this event?" with "Delete" and "Keep" buttons) — no separate confirm sheet, no `window.confirm`.

---

## Repeat Sub-Sheet

Opens as a sheet on top of the event form (stacked). Header: "Repeat" with a back arrow (←) that returns to the event form.

### Options (radio select, one active at a time)
- **None** (default)
- **Daily**
- **Weekly** — reveals a day-of-week chip row below: `S M T W T F S`. One or more days can be selected. Defaults to the day of the event's date.
- **Monthly** — on the same date each month (e.g. "on the 15th")
- **Yearly** — on the same month and date each year
- **Custom** — reveals:
  - "Every" + number input + unit dropdown (Days / Weeks / Months)
  - E.g. "Every 2 Weeks"

### End Date (optional, appears for all non-None options)
```
Ends          [ Never ▾ ]
```
- Dropdown: Never / On date / After N occurrences
- "On date" reveals an inline date picker
- "After N occurrences" reveals a number input

### Footer
```
Cancel                              Done
```
- Done applies the rule and returns to the event form. The + Repeat chip updates to show the rule summary.

---

## Import Flow

All three import methods are triggered from the title row icons. They share the same confirm screen pattern and visual language as the event form.

### Magic Wand (🪄) — Inline NL Parse

**Trigger:** User has typed something sentence-like in the title field (e.g. "Sophie dentist Thursday 3pm") and taps the wand icon.

**Behavior:**
1. Wand icon shows a brief loading state (spinner, ~1 second)
2. AI parses the title text and fills form fields:
   - Recognises person names → sets primary owner (For chip)
   - Recognises date expressions → sets date field
   - Recognises time expressions → sets start time (duration defaults to 1 hour)
   - Remaining text → cleaned title (person name and date/time tokens stripped)
3. Fields the AI couldn't confidently parse stay at their current value — never blanked
4. No confirm screen — fills directly into the form. User reviews and edits normally.
5. Wand icon returns to default state after fill

**Cost:** One Claude API call per tap. Zero cost if user never taps the wand.

**Error handling:** If the API call fails, the title stays as typed, a brief inline error shows below the title ("Couldn't parse — fill manually"), fades after 3 seconds.

### Photo Import (📷)

**Trigger:** User taps the photo icon.

**Behavior:**
1. OS native file picker opens immediately — no sub-sheet, no camera/gallery choice from the app. The OS action sheet handles "Take Photo / Choose from Library / Browse." This is achieved by using `<input type="file" accept="image/*">` without the `capture` attribute.
2. User picks or takes a photo
3. Form transitions to a loading state: title area shows spinner + "Reading photo…". Form fields remain visible but dimmed.
4. Image is resized client-side via `resizeImageForUpload()` before sending to Worker
5. Worker (`calendarPhoto` type) returns events array
6. **Optional context note:** before sending to Worker (step 4), if the form's title field has text in it, that text is sent as `context` alongside the image. This allows the user to type context like "April 19 – May 30, starts in April" before tapping the photo icon, and the AI uses it.
7. Confirm screen slides in (see Confirm Screen below)
8. On confirm: events save, form closes
9. Back/Cancel on confirm screen: returns to event form with title and any other manually entered fields preserved

**Error / empty:** Loading state replaced with "No events found — try a clearer photo." and a "Try again" button that re-opens the OS picker.

### iCal Import (📅)

**Trigger:** User taps the iCal icon.

**Behavior:**
1. A small sheet slides up with a single field:
   ```
   Calendar URL
   [paste your .ics feed URL        ]
   
   Cancel                    Import
   ```
2. User pastes URL and taps Import
3. Loading state: "Fetching calendar…"
4. Worker fetches and parses the iCal feed, returns events array
5. Confirm screen slides in
6. Same back/cancel behavior as photo import

**Error / empty:** Inline error below the URL field — "Couldn't fetch that calendar. Check the URL." with a Retry button.

---

## Confirm Screen

Shared by both photo and iCal import. Appears as a sheet stacked on top of the event form.

```
Import events                          ✕

[ Soccer Practice        ✓ ]
  Thu, May 1
[ ─────────────────────────]
  2026-05-01  ▸ (date input)

[ Field Day              ✓ ]
  Fri, May 2
[ ─────────────────────────]
  2026-05-02  ▸ (date input)

  · Spring Concert       ✓    ← amber dot = low confidence
  Date unknown
  [         ] ▸ (date input, empty)

Cancel                    Import 3 events
```

- Each event is a **tap-to-deselect row** (filled checkmark = included, empty circle = excluded). Tapping the row toggles it.
- Each row has an **editable date input** below it, pre-filled with the AI-detected date. This allows correcting wrong months, wrong dates, or filling in missing dates. Deselecting a row hides its date input.
- **Low confidence** events (AI uncertain about name): amber `·` dot before the name, row at 70% opacity.
- **Low date confidence** (AI uncertain about date): date input label shows in amber — "Date (please verify)"
- **No date** events: date input is empty with label "Date unknown — tap to set"
- **Button** shows count of selected events, updates live, disables at zero
- **Recurring events** detected in iCal: a banner at top of the list — "Recurring events were skipped — only one-time events are supported." (Recurring event support is a future feature.)
- Import saves all selected events and closes back to the event form (which also closes, since the creation goal was achieved)
- The confirm screen uses the same sheet structure, button styles, and chip patterns as the event form

---

## Edit Mode Differences

- Sheet title: "Edit Event"
- All fields pre-filled from the existing event data
- Footer button: "Save Changes"
- Import icons in the title row are hidden in edit mode — import is for creation only
- Delete option below footer (see Footer section above)
- Saving a recurring event (once recurrence is implemented) will prompt: "This event only / All future events / All events" — standard recurrence edit pattern

---

## States

**Loading (on open):** Form fields render immediately with pre-filled context. No skeleton needed — the form is local, not Firebase-fetched.

**Saving:** "Add Event" button shows a brief spinner, then closes the sheet on success. If Firebase write fails, button re-enables with an inline error below the footer: "Couldn't save — try again."

**Validation:** The only required field is Title. If the user taps Add Event with an empty title, the title field pulses (brief shake animation) and gains a red border. No other fields are required — an untimed, unassigned event is valid.

---

## Out of Scope

- Recurrence rule editing for *existing* recurring events (future: "this / all future / all" branching)
- Location map integration / place search (plain text only for now)
- Event attachments / files
- Event URL field (removed — goes in Notes if needed)
- Notifications / alerts (future feature)
- Calendar sharing / external attendee invites
- Any other form in the app — this spec is the reference design only. Other forms are separate work.
