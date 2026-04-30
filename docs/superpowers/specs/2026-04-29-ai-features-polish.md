# AI Features Polish
## Design Spec · 2026-04-29

> Covers all AI entry points across kitchen.js, calendar.html, and admin.html. Single source of truth for AI import UX, confidence indicators, image handling, and the email imports inbox. Read before touching any Worker integration.

---

## 1. Purpose & Scope

Six Worker endpoints return AI-extracted content that users review before importing: `calendarPhoto`, `schoolLunch`, `taskScan`, `photoToList`, `ical`, and `parseEvent`. A seventh (`scan`) is the unified handler. A separate email pipeline writes to `rundown/emailImports` for async review.

This spec standardises:
- **Shared infrastructure:** image resize helper + confidence row component + month clarification sheet
- **Confidence indicators:** visual treatment for low/medium/high confidence items across all confirm screens
- **Month clarification parity:** admin school lunch matches the calendar.html flow exactly
- **Email imports inbox:** full design for the existing `rundown/emailImports` review UI
- **Loading/empty/error states:** consistent across all AI entry points

Out of scope: Worker prompt changes, new Worker endpoints, recipe import confidence (the `url`/`screenshot` handlers don't return per-item confidence), and the `scan` unified endpoint (not currently used in any page).

---

## 2. Shared Infrastructure

### 2.1 `shared/ai-helpers.js`

New ES module. Three exports. `resizeImageForUpload` and `renderConfirmRow` are pure functions (no DOM). `openMonthClarificationSheet` mounts a bottom sheet and is the only function here that touches the DOM.

#### `resizeImageForUpload(file, maxPx = 1092)`

```
async resizeImageForUpload(file, maxPx = 1092) → Promise<{ base64: string, mediaType: string }>
```

- If `file.type === 'application/pdf'`: read via FileReader, return raw base64 + `'application/pdf'` mediaType unchanged.
- For images: draw to a canvas. If either dimension exceeds `maxPx`, scale proportionally so the longer side = `maxPx`. Export as JPEG quality 0.85. Return `{ base64, mediaType: 'image/jpeg' }`.
- Replaces the raw `FileReader` blocks currently duplicated in kitchen.js, calendar.html, and admin.html.
- Target output size for a typical phone photo: ~100–200KB vs. the current 3–8MB.

#### `renderConfirmRow(item, opts)`

```
renderConfirmRow(item, { labelKey, subKey?, confidenceKey?, deselected? }) → string
```

Returns an HTML string for one tap-to-deselect row. Intended for use inside a `<div class="confirm-list">` container.

**Confidence treatment (using `item[confidenceKey]`):**
- `'high'` or absent: no indicator
- `'medium'`: `<span class="confidence-dot">` before the label text (amber `·` using `var(--c-warning)`)
- `'low'`: same dot + `confidence-low` class on the row (70% opacity)

**Deselected state (when `deselected === true`):**
- `is-deselected` class on the row
- Label gets `text-decoration: line-through`
- Checkmark icon switches to an empty circle

**Row anatomy:**
```html
<div class="confirm-row [confidence-low?] [is-deselected?]" data-key="...">
  <div class="confirm-row__body">
    <span class="confirm-row__label">
      [<span class="confidence-dot">·</span>?] Label text
    </span>
    [<span class="confirm-row__sub">Sub text</span>?]
  </div>
  <div class="confirm-row__check"><!-- SVG checkmark or empty circle --></div>
</div>
```

The `data-key` attribute holds the array index (e.g. `"0"`, `"1"`) so click delegation can find the corresponding item in the original data array.

The page is responsible for: mounting the list, attaching a single delegated click listener to `.confirm-list`, toggling `is-deselected` on the clicked row, and reading selected state before import.

#### `openMonthClarificationSheet(assumedMonth, onConfirm)`

```
openMonthClarificationSheet(assumedMonth: string, onConfirm: (month: string) => void) → { close: () => void }
```

Extracted verbatim from calendar.html's existing month clarification flow. Mounts a bottom sheet with:
- Copy: "I couldn't clearly read the month — I guessed **[assumedMonth]**."
- A scrollable list of 24 months (current month − 1 through current month + 22) as selectable rows, with `assumedMonth` pre-selected and scrolled into view.
- Sheet footer: Cancel (secondary) + Confirm (primary, disabled until a month is selected).
- Confirm calls `onConfirm(selectedMonth)` then closes the sheet.
- Returns `{ close }` so callers can dismiss programmatically.

After this is extracted, calendar.html replaces its inline implementation with a call to this helper. Admin school lunch does the same.

---

### 2.2 CSS additions (`styles/components.css`)

All new rules appended to the bottom of components.css. Token-based only — no hardcoded colors.

```css
/* AI confirm rows */
.confirm-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.confirm-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: opacity 0.15s, background 0.1s;
  -webkit-tap-highlight-color: transparent;
}

.confirm-row:active {
  background: var(--bg-secondary);
}

.confirm-row.confidence-low {
  opacity: 0.7;
}

.confirm-row.is-deselected .confirm-row__label {
  text-decoration: line-through;
  color: var(--text-muted);
}

.confirm-row__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.confirm-row__label {
  font-size: var(--font-size-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.confirm-row__sub {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.confirm-row__sub.confidence-date-low {
  color: var(--c-warning);
}

.confirm-row__check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  color: var(--accent);
}

.confirm-row.is-deselected .confirm-row__check {
  color: var(--border);
}

.confidence-dot {
  color: var(--c-warning);
  margin-right: 4px;
  font-size: 1.1em;
  line-height: 1;
}
```

---

## 3. Image Resize Integration

All three files import `resizeImageForUpload` from `shared/ai-helpers.js` and replace their `FileReader` block with `await resizeImageForUpload(file)`.

| File | Location | Notes |
|---|---|---|
| kitchen.js | Recipe photo import | Image only |
| kitchen.js | Photo-to-list camera/gallery | Image only |
| calendar.html | Calendar photo import | Image only |
| admin.html | School lunch upload | PDF passthrough + image resize |
| admin.html | Task scanner | Image only |

URL-based imports (`ical`, `parseEvent`, recipe URL) are unaffected — no image involved.

The camera/gallery picker pattern is unchanged: two icon-button tiles, camera tile sets `input.capture = 'environment'`, gallery tile does not. The resize happens after file selection, before the Worker POST.

---

## 4. Confidence Indicators in Confirm Screens

Each confirm screen replaces its current list rendering with `renderConfirmRow()` calls and a tap-to-deselect interaction.

### 4.1 Photo-to-list (kitchen.js)

Worker response: `items: [{ name, category, confidence }]`

- Row label: `item.name`
- Row sub: `item.category` (e.g. "produce") or "Uncategorised" in muted style if absent
- Confidence key: `confidence`
- All items start selected. Tapping toggles `is-deselected`.
- Import button: "Add [N] items" where N updates live as rows are toggled. Disabled at 0.

### 4.2 Task scanner (admin.html)

Worker response: `tasks: [{ name, dueDate?, notes?, confidence }]`, `hasUncertainDates: bool`

- Row label: `task.name`
- Row sub: formatted `dueDate` if present; "No due date" in muted style if absent
- Confidence key: `confidence`
- When `hasUncertainDates === true`: show a non-blocking banner inside the confirm sheet above the list — "Some dates were unclear — review before importing." Uses existing `.banner--info` class.
- Import button: "Import [N] tasks".

### 4.3 School lunch (admin.html)

Worker response: `days: [{ date, lunch1, lunch2?, confidence }]`, `monthUncertain`, `assumedMonth`

- Month clarification fires first if `monthUncertain === true` (see §5).
- Row label: formatted date (e.g. "Mon, May 5")
- Row sub: `lunch1` + `lunch2` joined with " · " if both present
- Confidence key: `confidence`
- Import button: "Import [N] days".

### 4.4 Calendar photo import (calendar.html)

Worker response: `events: [{ name, date, time?, allDay, notes?, confidence, dateConfidence }]`, `monthUncertain`, `assumedMonth`

- Month clarification fires first if `monthUncertain === true` (see §5).
- Row label: `event.name`. Confidence key: `confidence` (drives dot + opacity).
- Row sub: formatted date + time. When `dateConfidence === 'low'`, the sub text gets class `confidence-date-low` (amber color) — a secondary signal that the date specifically is uncertain, independent of the overall confidence.
- Import button: "Import [N] events".

### 4.5 Email imports (admin.html)

See §6 for full email imports design. Events within an email card use `renderConfirmRow()` with `confidence` key. Same tap-to-deselect behavior.

---

## 5. Month Clarification Parity

**Trigger:** `data.monthUncertain === true` in the Worker response for `calendarPhoto` and `schoolLunch`.

**Flow (both calendar.html and admin.html):**
1. Worker responds → check `monthUncertain`.
2. If true: call `openMonthClarificationSheet(data.assumedMonth, (correctedMonth) => { remapDates(data, correctedMonth); openConfirmScreen(data); })`.
3. If false: skip to `openConfirmScreen(data)` directly.

**Date remapping for school lunch:** Days come back as `YYYY-MM-DD` strings based on the AI's assumed month. When the user selects a different month, remap each `day.date` by replacing the year+month component while keeping the day-of-month digit. E.g. `"2026-03-05"` → user selects May 2026 → `"2026-05-05"`. String operation only, no Date object needed.

**calendar.html change:** Replace the inline month clarification block with a call to `openMonthClarificationSheet()` from `shared/ai-helpers.js`. Behavior is identical — this is extraction only.

---

## 6. Email Imports Inbox

### 6.1 Firebase schema

```
rundown/emailImports/{pushId} ← {
  from: string,           // sender address, e.g. "School <noreply@school.edu>"
  subject: string,
  events: [{
    name: string,
    date: string?,        // YYYY-MM-DD or null
    time: string?,        // HH:MM 24h or null
    allDay: bool,
    notes: string?,
    confidence: "high"|"medium"|"low"
  }],
  receivedAt: number,     // epoch ms
  processed: bool
}
```

### 6.2 Location

Inside admin.html's **Tools tab**, under the existing "AI Imports" heading. Renders as a section below task scanner. No new tab.

### 6.3 States

**Loading:** Spinner + "Loading email imports…" while the Firebase one-shot read is in flight.

**Empty:** Muted icon + "No pending imports" body text. A small "Refresh" text link in the section header remains visible.

**Error:** "Couldn't load imports" + small error detail + "Retry" button.

**Populated:** One card per unprocessed email entry. Cards render in reverse-chronological order (newest first).

### 6.4 Email card anatomy

```
┌──────────────────────────────────────────────┐
│ [Sender name]          [Relative timestamp]  │
│ [Subject line]                               │
├──────────────────────────────────────────────┤
│ ·  Event name              [check icon]      │
│    Mon, May 5 at 3:00 PM                     │
│ ~  Uncertain event name    [check icon]      │  ← medium confidence
│    Date unknown — tap to set                 │
├──────────────────────────────────────────────┤
│ [Dismiss]          [Import N events →]       │
└──────────────────────────────────────────────┘
```

- Sender name: parsed from `from` field (display name if present, otherwise the address).
- Timestamp: relative ("2h ago", "Yesterday") using existing `formatRelative()` from utils.js.
- Events: rendered with `renderConfirmRow()`. Confidence indicators apply.
- Events with `date === null`: sub-label reads "Date unknown — tap to set" in amber (`--c-warning`). Tapping the row (when it has no date) reveals an inline `<input type="date">` field directly below the row label. Selecting a date closes the input and updates the sub-label to show the chosen date. The row remains selected (not deselected) by this tap — a separate tap on the checkmark area toggles selection.

### 6.5 Actions

**Dismiss:** Marks `processed: true` on the emailImport node. Card fades out. No events written.

**Import N events:** Creates each selected event using the same mechanism as the calendar FAB quick-add: a one-time task in `rundown/tasks/` (`rotation: 'once'`, the family's default event category, `eventTime` from the event's `time` field, `dedicatedDate` from the event's `date` field) followed by a matching schedule entry in `rundown/schedule/`. Events with no date are skipped unless the user set one via the inline date input. After all writes complete, marks `processed: true` on the emailImport node. Card fades out. Shows toast: "N event(s) added to schedule."

**Import disabled:** When zero rows are selected. Button text stays "Import 0 events" with reduced opacity.

### 6.6 Zero-event edge case

If an email card has `events: []` or the Worker returned an empty array:
- Show "No events found" in muted text inside the card body.
- Only a Dismiss button is shown (no Import button).

### 6.7 Refresh

A "Refresh" text link in the section header re-runs `loadEmailImports()`. The inbox uses a one-shot read (not `onValue`) — infrequent arrivals don't warrant a live listener.

---

## 7. Loading, Empty, and Error States

### 7.1 Standard pattern

All AI entry points follow this pattern while the Worker POST is in-flight:

**Loading state (inside sheet content):**
- Existing `.loading-spinner` (or spinner equivalent) centered in the content area.
- Single descriptive line below: see copy per-feature in §7.2.
- Camera/gallery picker tiles hidden.
- Sheet footer buttons disabled.

**Empty state (Worker returned zero items):**
- Muted icon + single message line (see §7.2).
- "Try again" button that re-shows the picker tiles.
- No confirm screen shown.

**Error state (network failure, Worker 500, malformed response):**
- "Something went wrong" as headline.
- Raw error message in small muted text (for parent debuggability).
- "Try again" button.
- No `window.alert` or `window.confirm`. No console-only errors.

### 7.2 Per-feature copy

| Feature | Loading copy | Empty copy |
|---|---|---|
| Recipe photo (kitchen.js) | "Fetching recipe…" | "Couldn't read that URL — check the link or try a photo instead." |
| Photo-to-list (kitchen.js) | "Scanning photo…" | "No items detected — try a clearer photo." |
| Calendar photo (calendar.html) | "Reading calendar…" | "No events found — try a clearer photo." |
| iCal import (calendar.html) | "Importing calendar…" | "No events found in that calendar." |
| parseEvent (calendar.html) | "Parsing…" | "Couldn't parse that — try being more specific (e.g. 'dentist Friday May 2 at 3pm')." |
| School lunch (admin.html) | "Parsing lunch menu…" | "No lunch items found — try a clearer photo or PDF." |
| Task scanner (admin.html) | "Scanning document…" | "No tasks found — try a clearer photo." |

### 7.3 iCal recurring events

When the Worker returns `hadRecurring: true`, the confirm screen shows a non-blocking info banner: "Recurring events were skipped — only one-time events are supported." This is not an error; the import proceeds normally with the non-recurring events.

---

## 8. Camera/Gallery Picker Pattern

All AI features that accept images use the same two-tile picker. This is already implemented in kitchen.js and partially in admin.html — standardised here for reference.

```html
<div class="admin-form__actions admin-form__actions--2col">
  <button class="btn btn--secondary" id="cameraBtn">
    <svg><!-- camera icon --></svg>
    Take photo
  </button>
  <button class="btn btn--secondary" id="galleryBtn">
    <svg><!-- image icon --></svg>
    Choose file
  </button>
</div>
<input type="file" id="photoInput" accept="image/*" hidden>
```

- Camera button: sets `photoInput.capture = 'environment'` before triggering `.click()`.
- Gallery button: removes `capture` attribute before triggering `.click()`.
- For school lunch only: gallery button also sets `accept="image/*,application/pdf"` before click; camera button keeps `accept="image/*"`.
- Tiles are hidden once an image is selected (replaced by loading state).

---

## 9. Pre-Implementation Checklist

- [ ] `shared/ai-helpers.js` created and importable from kitchen.js, calendar.html, admin.html
- [ ] `resizeImageForUpload()` tested with: JPEG photo, PNG screenshot, PDF, file >10MB
- [ ] `renderConfirmRow()` renders correctly for all three confidence levels
- [ ] `openMonthClarificationSheet()` tested in both calendar.html and admin.html
- [ ] All confirm screens use tap-to-deselect (no checkboxes, no `.form-toggle`)
- [ ] Calendar photo: dateConfidence low shows amber date sub-label
- [ ] Email imports inbox: loading/empty/error/populated states all render
- [ ] Inline date input on email events with null date
- [ ] iCal `hadRecurring` banner shown when applicable
- [ ] parseEvent empty state copy shown when Worker returns null
- [ ] No `window.confirm` / `window.alert` anywhere in AI flows
- [ ] No hardcoded colors in new CSS
- [ ] Tested in ≥2 themes (light + dark)
- [ ] SW cache version bumped if `shared/ai-helpers.js` is added to cache list
