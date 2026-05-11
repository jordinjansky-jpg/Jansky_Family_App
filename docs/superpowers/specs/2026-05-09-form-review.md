# Form UI/UX Review — All Input Forms

**Date:** 2026-05-09
**Reviewer:** Claude (Opus 4.7)
**Bar:** Skylight / Linear / Things / Notion mobile quality
**Goal:** Lift each form to paid-app polish, then unify so they all look and feel like the same app.

**Test environment:**
- Playwright at 412×915 (Samsung S26 Ultra)
- `http://localhost:8080/?env=dev` (isolated dev Firebase path)
- Viewport-only screenshots (`fullPage: false`) — sheets have sticky headers and fixed save buttons.

**Reference:** Event Form (`renderEventForm` in [shared/components.js:1208](../../../shared/components.js#L1208), `openEventForm` in [dashboard.js:1868](../../../dashboard.js#L1868)). DESIGN.md §5.23 + §13.13. The Event Form is treated as canonical — but issues found in it are flagged too rather than excused.

**Severity legend:**
- 🔴 **Critical** — broken, unsafe, or breaks DESIGN.md non-negotiable rules
- 🟠 **High** — reads as unfinished or inconsistent with paid-app bar
- 🟡 **Medium** — polish gap a careful designer would catch
- 🟢 **Low** — nit, but worth noting

---

## Forms reviewed

(populated as each form is reviewed — see sections below)

**Reviewer note:** DESIGN.md is treated as input, not gospel. Where the spec itself looks wrong against the Skylight/Linear/Things bar, that gets called out too — not just spec deviations.

---

## 1. Task form (new + edit)

**Renderer:** [shared/components.js:1545](../../../shared/components.js#L1545) — `renderTaskForm`
**Opener:** [dashboard.js:2902](../../../dashboard.js#L2902) — `openTaskForm` (also opened from [calendar.html:1973](../../../calendar.html#L1973), [tracker.html:842](../../../tracker.html#L842))
**How to open:** Dashboard FAB → "New Task" (create) · long-press any task → Edit (edit)

### Initial state
Sheet covers ~52% of viewport height. Header reads `New Task` with a small purple ✓ icon and an ✕ icon top-right. Below: title input "What's the task?", a "For" row of 4 person chips (all unselected, just gray with color dot), a Daily/Weekly/Monthly/One-Time pill row with `Daily` filled purple, an "Any day" pill, then a row of four detail chips (Medium · 10 min · Anytime · Chores), then two add-chips (`+ Notes` and `+ Options`). Form ends at the add-chips — there is **no footer**, no Save button at the bottom of the sheet.

### Expanded state
Tapping `+ Notes` reveals a textarea inline with an ✕ close inside the field. Tapping `+ Options` reveals an "Exempt from scoring [Off]" toggle row; if rotation is Weekly/Monthly, a "Cooldown [3] days" number input also appears. Active add-chips flip to **solid black filled** (not the canonical "same color, just solid border" the Event Form uses).

Switching rotation:
- Weekly/Monthly: a generic-looking "Any day" `<select>` shows above (native HTML select), and `+ Options` reveals cooldown row.
- One-Time: `<input type="date">` shows native browser placeholder `mm/dd/yyyy` — ugly, looks like an unfilled HTML form.

Tapping a detail chip (Medium/10 min/Anytime/Chores) opens a floating dropdown overlay (`tf-picker-overlay` + backdrop). Difficulty is a 3-row list. Duration is a 2×4 grid ending with `…` for custom.

### Findings

**Typography & hierarchy**
- 🟠 High: Title input "What's the task?" uses the same gray weight as the section labels — it's the most important field on the form but doesn't pop. Compare Linear/Things where the title is large and visually distinct.
- 🟡 Medium: Section labels are inconsistent sizes/weights between sections — "For" is small text inline with chips, but the rotation pills have no label at all, and detail chips have no label. A user can't tell what "Medium · 10 min · Anytime · Chores" *is* without poking it.
- 🟡 Medium: "New Task" sheet title sits flush against the top of the sheet right under the drag handle — feels cramped.
- 🟢 Low: No visible hierarchy distinguishing required vs optional fields.

**Spacing & layout**
- 🟠 High: No sticky footer — the form just stops after the add-chips/reveals. Save is only the small ✓ icon top-right (~38×38px, far from thumb reach). On a paid app, the primary action should be at the bottom in the safe area, not buried in the header.
- 🟡 Medium: Vertical rhythm is OK but dividers do a lot of heavy lifting — every section is hairline-separated. Could lean more on whitespace.
- 🟡 Medium: Detail chips row (Medium · 10 min · Anytime · Chores) wraps OK at 412 width but on narrower phones could squeeze. No tested narrower breakpoint.
- 🟢 Low: The drag handle is visible but tiny; consider whether the sheet should snap to half/full heights with this much vertical real estate.

**Inputs & controls**
- 🔴 Critical: One-Time uses raw `<input type="date">` with the browser's `mm/dd/yyyy` placeholder. This is the exact thing the Event Form's whole "inline picker" pattern exists to avoid. Looks unfinished, reads as "developer didn't bother".
- 🟠 High: Detail chips look identical to passive display tags (rounded gray pills with no chevron, no underline, no hover/press affordance). Users have no clue these are tappable pickers — they look like meta-info or filter chips. A small chevron `▾` or a subtle leading icon would solve it.
- 🟠 High: The picker overlay that opens when you tap a detail chip is a generic floating context menu — different visual style from the Event Form's inline `ef2-picker-wrap` reveal pattern. Two pickers in the same app, two completely different mental models.
- 🟠 High: Difficulty picker is a vertical list, Duration picker is a 2×4 grid. Inconsistent shape for the same kind of thing.
- 🟠 High: Person chips have no default selection and no hint that you need to pick one. All four chips look identical (gray + color dot). On save, validation will catch it, but the empty state gives no direction.
- 🟡 Medium: Person chips support only one state (selected/unselected) — no primary vs attending. That's fine for tasks (no need to "attend" a chore) but the visual style is identical to the Event Form's chips, which DO have those states. Inconsistent semantics behind identical visuals.
- 🟡 Medium: "Any day" `<select>` is the same width as a button row and uses native browser styling. On Android the dropdown will be the OS chrome; on iOS it's the wheel. Inconsistent with how Event Form date/time work.
- 🟡 Medium: "Any day" placeholder is ambiguous — does it mean "task can run any day" (no preference) or "shown every day"? On Weekly that's day-of-week; on Monthly the same select shows day-of-week which is *probably wrong* for monthly tasks.
- 🟡 Medium: "Exempt from scoring [Off]" is a custom black-pill toggle, not a `.form-toggle` switch. Inconsistent with the rest of admin where toggles are switches per the user's saved preference (no checkboxes, always `.form-toggle`).
- 🟡 Medium: Cooldown number input has placeholder `3` (the rotation default) but no min/max guidance shown to the user — they can type 0 and have no idea what that means.
- 🟢 Low: `…` in duration picker for "custom" — should be `Custom…` or `Other…`. A bare ellipsis isn't recognizable.
- 🟢 Low: No `inputmode="numeric"` on cooldown days input (need to verify in source — UX impact: brings full keyboard instead of number pad on Android).

**Hidden / advanced options**
- 🟠 High: Active add-chip state is **solid black background, white text**. The DESIGN.md spec for Event Form explicitly says "Same color either way (no big visual weight change)". Task form's active style screams primary action and visually clobbers everything around it. Looks like a programmer's first pass at "active state = invert colors".
- 🟡 Medium: `+ Options` is a vague label — what's inside? "Cooldown" and "Exempt from scoring" don't share an obvious mental category. Could split into `+ Cooldown` (only when applicable) and `+ Exempt`, or rename to `+ Advanced` / `+ Scoring`.
- 🟡 Medium: Cooldown row only renders when `showCooldown` is true (weekly/monthly), and gets hidden when rotation flips back to Daily — but the +Options chip stays "active" if you previously toggled exempt. Inconsistent active-state logic risk.
- 🟢 Low: No ability to have notes auto-expand if a task has long notes in edit mode (they'll be shown but the textarea is fixed at 3 rows).

**Empty / first-use state**
- 🟠 High: Save button is not visibly disabled when title is empty. There's no "Create Task" CTA at all — just a checkmark icon. So the user has no feedback whether they're allowed to save.
- 🟠 High: Placeholder "What's the task?" is OK but generic. "e.g. Brush teeth" or "Take out the trash" would be more product-design-savvy.
- 🟡 Medium: No suggestion or examples for first-task users — empty form, no help.

**Copy & tone**
- 🟡 Medium: Header reads "New Task" but the save action is a checkmark with no label. Users with low UI literacy may not connect ✓ to "save". A labelled "Add Task" button at the bottom would be clearer.
- 🟡 Medium: "Exempt from scoring" is jargon for non-technical users. Could be "Don't count this for points" or "Just a chore (no points)".
- 🟡 Medium: "Any day" in the day-of-week select is ambiguous (see Inputs).
- 🟢 Low: Difficulty has no explanation of point implications.

**Polish details**
- 🟠 High: No loading/saving state visible — user has no feedback after tapping save. Even the icon doesn't change.
- 🟡 Medium: Auto-focus does not happen on open (per spec — keyboard pops too soon). But also no clear visual prompt that you should tap the title field first.
- 🟡 Medium: Picker dropdowns drop in/out without animation — looks janky.
- 🟡 Medium: Add-chip flip from outline → black is jarring (no transition, no morph).
- 🟢 Low: No haptic feedback hooks (Vibration API) — minor but a phone-app polish thing.

**Other (catchall)**
- 🟠 High: There is no shorthand for "assign to all kids" — Event Form has a "Family" chip; Task form doesn't. Users with 4 kids must tap each one individually.
- 🟡 Medium: Edit mode shows trash icon next to save in the header, but tapping it triggers a `showConfirm()` modal (no inline "Delete this? [Delete] [Keep]" zone like the Event Form has below the sticky footer). Inconsistent destructive-action pattern.
- 🟡 Medium: There's a `tf-assign-row` (Rotate vs Everyone) that only appears when 2+ people are selected. Discoverability is poor — most users won't realize this exists. And "Rotate" vs "Everyone" needs a one-line explainer the first time.
- 🟡 Medium: When rotation flips between Daily/Weekly/Monthly/Once, the day/date select swaps — but there's no animation/transition, just a sudden DOM change.

### Compared to Event Form (canonical)
- ❌ No sticky bottom footer with Cancel + primary action
- ❌ No inline date picker (uses raw `<input type="date">`)
- ❌ No inline time picker (N/A — tasks don't have times)
- ❌ Detail chips use a different picker pattern (floating overlay) than Event Form's inline `ef2-picker-wrap` reveal
- ❌ No "Family" / "All kids" shortcut chip (Event has one)
- ❌ Active add-chip state visually inverts (Event keeps the same color, just solid border)
- ❌ No AI/wand/photo import affordances (probably intentional for tasks but could be useful for "import a chore list from photo")
- ❌ Delete button uses different pattern (trash icon → showConfirm modal vs inline confirm zone)
- ✅ Uses same `ef2-divider`, `ef2-for-section`, `ef2-person-chip`, `ef2-secondary-row`, `ef2-field-reveal` classes (good — sharing primitives)
- ✅ Header structure (`sheet__header` + title + icon row) matches

---

## 2. Event form (new + edit)

**Renderer:** [shared/components.js:1208](../../../shared/components.js#L1208) — `renderEventForm`
**Opener:** [dashboard.js:1868](../../../dashboard.js#L1868) — `openEventForm` (also [calendar.html:932](../../../calendar.html#L932), [admin.html:1318](../../../admin.html#L1318) `openEventFormAdmin`)
**How to open:** Dashboard FAB → "New Event" (create) · long-press an event in calendar (edit)

### Initial state
Sheet ~52% of viewport. Header reads `New Event` with same purple ✓ + ✕ icons in top-right (identical to Task form). Title input `What's happening?` paired with three icon buttons (wand, photo, calendar) on the right. Below: a date pill (`Sun, May 10`) and a `Set time` pill side-by-side. Then the `For` row with all 4 person chips unselected. Then the `+ Notes / + Location / + Repeat` add-chips alongside an `All day` chip.

**Important: there is no Family chip**, despite DESIGN.md §5.23 explicitly describing one (`.ef2-person-chip--family ... lives next to the section label`). Spec describes a UI element that does not exist in the implementation.

### Expanded state
Tapping the date pill reveals an inline native `<input type="date">` showing `05/10/2026` with a calendar icon — this is the OS native date input, NOT a custom inline calendar grid. Tapping `Set time` reveals the custom 6-element time picker: text input + AM/PM button + arrow + text input + AM/PM button. This matches the spec.

Tapping `+ Notes` / `+ Location` reveals fields with X close inside; both chips flip to **solid black filled** active state (same anti-pattern as Task form — spec §5.23 explicitly says "Same color either way (no big visual weight change)" but the implementation contradicts the spec).

Tapping `+ Repeat` opens a STACKED sub-sheet titled "Repeat" with options None / Daily / Weekly / Monthly / Yearly / Custom and a Cancel + Done footer. Tapping the photo icon opens an "Import from" stacked sub-sheet with Camera / Gallery / Files options + an "Optional note for AI" input pre-filled from the title. Tapping the iCal icon opens a "Calendar URL" stacked sub-sheet with a `.ics` URL input + Cancel + Import.

### Findings

**Typography & hierarchy**
- 🟠 High: Title input is large but uses the same gray weight as section labels — same problem as Task form. The single most important field doesn't pop.
- 🟡 Medium: "New Event" sheet title sits flush against the drag handle — cramped. Add ~8px breathing room above.
- 🟡 Medium: The `For` label is small text inline next to the chips. The chip row visually dominates; the label barely reads.
- 🟡 Medium: Date pill text "Sun, May 10" lacks any chevron or affordance to communicate "this is a button that opens a picker."

**Spacing & layout**
- 🔴 Critical: NO sticky bottom footer with a labeled Save/Cancel. DESIGN.md §5.23 explicitly mandates an `ef2-footer` with "STICKY: Cancel + primary action" — the implementation does not include this element. Save is a small ✓ icon in the header. The spec describes a layout that does not exist anywhere in the codebase. (The Repeat/iCal SUB-sheets DO have such footers — only the parent forms don't.)
- 🟠 High: Save action being a top-right ✓ icon rather than a thumb-reachable bottom button is a real UX issue regardless of spec — top-right is the worst spot on a 412px-wide phone for one-handed thumb use.
- 🟡 Medium: Date and time pills are grouped horizontally on one row — fine, but no separator/grouping treatment to indicate they're a single date/time field unit.
- 🟡 Medium: Person chips are scrollable horizontally (per spec), but at 412px width with only 4 short names they all fit — no scroll affordance triggers and the spec'd fade-gradient is not visible. Untestable until 5+ people.
- 🟢 Low: No visible way to tell sheet height — drag handle present but the sheet doesn't snap to fixed heights.

**Inputs & controls**
- 🟠 High: Date picker uses the OS native `<input type="date">`. On Android this is a calendar grid (decent), on iOS it's a wheel (terrible). The whole point of inline pickers per the spec was to avoid OS-native time wheels — but the date picker just delegates to the OS too. The treatment of date and time inside the same form is inconsistent.
- 🟠 High: Location input shows a magenta focus outline on tap. DESIGN.md §5.23 explicitly says "Don't use outline rings on focus inside a form sheet" — but the implementation breaks its own rule. Reads as default browser focus chrome, looks unfinished.
- 🟡 Medium: Time picker text inputs (`9:00`, `10:00`) and AM/PM buttons sit at the same height/styling — the AM/PM toggle doesn't read as a button.
- 🟡 Medium: Time picker arrow `→` between start/end is a static character, not a visual flow indicator. Could be a thin line or dash.
- 🟡 Medium: Person chips have no default — same problem as Task. User must tap at least one and there's no hint.
- 🟡 Medium: "All day" is in the secondary-row alongside +Notes/+Location/+Repeat. Mentally these are not the same — All day is a primary toggle that hides the time picker; the others are reveal sections. Mixing them dilutes meaning.
- 🟢 Low: Photo button opens a sub-sheet with three options instead of using the native `<input type="file" capture="environment">` directly — fine, but adds a tap.

**Hidden / advanced options**
- 🟠 High: Active add-chip state inverts to solid black + white text. Visually screams "primary action" when these are progressive disclosures. Same problem as Task form.
- 🟡 Medium: `+ Notes` / `+ Location` reveal inline; `+ Repeat` opens a sub-sheet (modal). Inconsistent treatment of "secondary fields" — some are inline, one is modal.
- 🟡 Medium: Once Notes/Location are open, the chips show as "active" but there's no way to tell them apart visually from each other (both are pure black pills).
- 🟢 Low: No way to add multiple custom fields (e.g. URL, attendees outside of family) — but probably out of scope.

**Empty / first-use state**
- 🟠 High: Save ✓ is not visibly disabled when title is empty (or at least no clear visual change). User has no signal that save is gated.
- 🟠 High: No CTA labeled "Add Event" anywhere — just a checkmark. Discoverability for non-tech users is poor.
- 🟡 Medium: Title placeholder "What's happening?" is friendly but generic — could include an example.
- 🟢 Low: First-use users won't know what the wand/photo/calendar icons do (no tooltips on mobile).

**Copy & tone**
- 🟢 Low: "What's happening?" works. "Set time" works. "Sun, May 10" date label is friendly.
- 🟡 Medium: "All day" toggle could be clearer — when enabled, time picker disappears, but no text confirms "no specific time" anywhere.
- 🟡 Medium: Photo sub-sheet's "Optional note for AI" placeholder ("e.g. May 2026, Sophie's school") is excellent — best copy in the app. Other forms should adopt this pattern.

**Polish details**
- 🟠 High: No save-in-progress state visible.
- 🟡 Medium: Sub-sheet (Repeat) has Cancel + Done buttons in its footer — but Done is gray/disabled-looking even when "None" is the default selected option. Confusing default state.
- 🟡 Medium: Repeat sub-sheet has BOTH a `← Back` link top-left AND a `Cancel` button in the footer — two ways to back out, redundant.
- 🟡 Medium: Photo sub-sheet's `Cancel` is text-only (purple link), but iCal sub-sheet's `Cancel` is a button next to `Import`. Inconsistent.
- 🟡 Medium: Sub-sheet animations don't have a clear "stack" feel — they appear to slide up from below the parent without dimming the parent further. Hard to tell which sheet is active.
- 🟢 Low: No focus-on-open by design (per spec, to avoid keyboard popping). But the title input also doesn't visually invite tap — needs a soft cursor/highlight.

**Other (catchall)**
- 🟠 High: The Family chip described in spec §5.23 ("Family chip uses --accent ... lives next to the section label") does not exist in the implementation. Quick "select all family" is a common-enough workflow that paid family apps universally include it.
- 🟡 Medium: Person chips support primary vs attending state (per spec) — but there's no explanation of what these mean. First-time users will tap a chip and not understand why it's filled vs outlined later.
- 🟡 Medium: No URL/link field for events (very common — Zoom links, Google Meet) despite kid-school-events being a primary use case.
- 🟢 Low: Wand button has no example tooltip — first-time user won't know they can write "Soccer practice tomorrow at 4pm" and have it parsed.

### Compared to Event Form (canonical)
This IS the canonical form — but the canonical form itself has serious gaps versus its own spec and versus the Skylight bar:

- ❌ Spec says sticky footer with Cancel + primary action — implementation has none
- ❌ Spec says no outline ring on focus — Location input shows one
- ❌ Spec says active chips have "no big visual weight change" — implementation inverts to solid black
- ❌ Spec describes a Family quick-select chip — implementation has none
- ❌ Spec implies inline date picker — implementation uses native `<input type="date">`
- ✅ Time picker correctly avoids native `<input type="time">` wheel (good)
- ✅ Sub-sheet stacking pattern works (Repeat / Photo / iCal all stack as overlays, parent state preserved)
- ✅ AI / wand / photo import affordances are paid-app-quality features

**The takeaway:** treating the Event Form as "the canonical anchor" is risky because the implementation diverged from the spec. Either the spec needs to be updated to match the implementation (and then we acknowledge the implementation's flaws), or the implementation needs to be brought up to the spec (which has its own flaws). Either way — pick a single new target before propagating to other forms.

---

## 3. Meal plan sheet (Plan a meal)

**Renderer:** [shared/components.js:3253](../../../shared/components.js#L3253) — `renderMealPlanSheet`
**Opener:** [dashboard.js:1460](../../../dashboard.js#L1460) — `openMealPlanSheet` · also kitchen.js:437 `openPlanMealSheet`
**How to open:** Dashboard → "Plan dinner ›" tile · Kitchen Meals tab → tap any empty slot

### Initial state
Sheet starts at ~52% viewport. Header reads `Plan a meal` + ✕ (no save icon — uses footer Save). Below: a `Day` label + a date pill (`Sun May 10`), then a `Slot` label + a 4-segment control (Breakfast / Lunch / Dinner / Snack) with Dinner filled purple. Then `Meal` label + `+ New recipe` link right-aligned. Then a `Search meals…` input. **The recipe list is not shown by default — it's a hidden dropdown.** Footer has a left-aligned purple-text `Cancel` and a right-aligned filled-gray `Save` (Save disabled until selection).

### Expanded state
Tapping the search input expands the sheet to ~70% viewport. The recipe list dropdown becomes visible below the input — alphabetical list of recipe names, one per row. The Cancel/Save footer remains sticky at the bottom.

### Findings

**Typography & hierarchy**
- 🟢 Low: Field labels (`Day`, `Slot`, `Meal`) are small caps-ish — clear and consistent.
- 🟡 Medium: Recipe list rows are just plain names — no thumbnails, no description, no "last cooked" date, no tags. Sparse compared to paid meal apps.
- 🟢 Low: "Plan a meal" sheet title vs "Add Event" / "New Task" verbiage — slightly inconsistent (a/the vs no article).

**Spacing & layout**
- 🟢 Low: Footer is sticky and works correctly — this form has the pattern the others lack.
- 🟡 Medium: Day pill has a generic input-looking style ("Sun May 10" inside a bordered box) — looks more like a disabled input than a tappable button.
- 🟡 Medium: When the list is closed, there's empty space between the search and the footer that looks unused — ~150px of nothing. Could collapse the sheet to fit content.
- 🟢 Low: Sheet drag handle is barely visible against the white background.

**Inputs & controls**
- 🟠 High: Search input shows a magenta focus outline. Same anti-pattern as Event Form. Looks like default browser focus chrome inside what should be a polished sheet.
- 🟠 High: Search input has no leading magnifying-glass icon — looks like a generic text field, doesn't read as "search".
- 🟠 High: No clear (X) affordance inside the search input to wipe the query.
- 🟡 Medium: Slot segmented control active state is purple-filled — different active treatment than rotation pills in Task form (which use the same purple-filled style — at least these two are consistent). But it's a different style than the chip-active-black pattern used elsewhere in Notes/Location/Repeat. Three different "active" styles in the same app.
- 🟡 Medium: Date pill uses native `<input type="date">` triggered via showPicker. Same OS-native picker problem as Event/Task forms.
- 🟡 Medium: Recipe rows have no chevron, no leading thumbnail, no trailing star (despite the spec saying favorites get a star). Just plain text rows.
- 🟢 Low: No `X` to clear the day picker (e.g. if user wants to reset).

**Hidden / advanced options**
- 🟠 High: Recipe list is hidden by default — user must tap the search input to see what's available. A meal-planning UI's primary content is the recipe list; hiding it is the wrong default. Spec §5.24 even says the default list should show favorites + recents — implementation hides everything.
- 🟢 Low: No way to filter by category (Italian, vegetarian, quick) — only by name.

**Empty / first-use state**
- 🟠 High: With no recipes, the user has no path forward except "+ New recipe" (which is a small purple link). On a first-run dev environment the sheet would be near-empty and unhelpful.
- 🟡 Medium: Save button is gray-disabled on open (good — tells user they need to pick something) but no helper text saying what to do.
- 🟢 Low: No "or type a custom name" hint — spec says ad-hoc entries are allowed but UI doesn't tell user.

**Copy & tone**
- 🟢 Low: "Plan a meal" is friendly. "+ New recipe" is clear.
- 🟡 Medium: "Search meals…" placeholder — the field is for "recipes" but the label says "Meal". Inconsistent vocabulary (meal vs recipe).
- 🟢 Low: Slot names are direct. Could add example time hints (Breakfast · 7am) for kid-mode users.

**Polish details**
- 🟡 Medium: When sheet auto-expands on focus, there's no smooth animation — it jumps to a new height.
- 🟡 Medium: The recipe list dropdown appears as a flat list with no separation from the search field — feels unfinished.
- 🟡 Medium: Footer Save button is disabled-gray but not visibly "muted" — could be lower opacity to look more clearly disabled.
- 🟢 Low: No saving spinner/state on tap.

**Other (catchall)**
- 🟠 High: No image thumbnails on recipe rows. Every paid meal-planning app shows a small recipe image. Without one, this looks like a basic database list.
- 🟡 Medium: Tapping `+ New recipe` opens the Recipe Form using the close-delay-open pattern — works correctly but the parent form state resets the search filter (need to verify).
- 🟡 Medium: No "favorited recipes" pinning visible (despite spec). Either no favorites in the data or the pinning logic isn't surfaced.
- 🟢 Low: Cannot drag-to-reorder or undo a recent meal pick.

### Compared to Event Form (canonical)
- ✅ HAS a sticky bottom footer (Cancel + Save) — this is the exception, not the rule, in the app
- ✅ Slot segmented control is clean and consistent
- ❌ Different active-state pattern (purple-filled segmented) than the Notes/Location chips (black-filled add-chips) — three competing "active" treatments
- ❌ Date input is also native `<input type="date">` — same problem
- ❌ Search input has magenta focus outline (against spec)
- ➕ Picker-list pattern (§5.24) is genuinely different from the Event Form pattern, which is fine — but the visual language (chips, dividers, header) should match more closely than it does

---

## 4. Recipe form (new + edit)

**Opener:** [kitchen.js:1131](../../../kitchen.js#L1131) — `openRecipeForm` (also dashboard.js:1224 for inline-from-meal-plan)
**How to open:** Kitchen → Recipes tab → FAB + (create) · tap any recipe row → Edit (edit)

### Initial state
Sheet covers ~60% of viewport. Header reads `New recipe` + ✓ purple checkmark + ✕. Below: a `Recipe link` label + URL input `https://…`. Then a borderless `Recipe name…` placeholder input + camera icon to its right. Then a 3-column row of `Prep time` (text input "30 min" placeholder) / `Serves` (number, "4" placeholder) / `Difficulty` (native `<select>` showing "—"). Then an `Ingredients` section with a `qty` + `Add ingredient…` text + `Add` button row. Then a `Notes` section with a `Description, tips, source…` textarea. Form ends here — **no footer**.

### Expanded state
Tapping the camera icon opens an "Import from" stacked sub-sheet identical to the Event Form's photo source picker (Camera / Gallery / Files + "Optional note for AI" with "e.g. NYT Cooking pasta recipe" placeholder + Cancel link). Tapping the Difficulty select opens the OS-native dropdown with `— / Easy / Medium / Hard`.

In edit mode: same form + a trash icon next to the save icon in the header. Delete uses `showConfirm()` modal (no inline delete-zone like the Event Form spec describes).

### Findings

**Typography & hierarchy**
- 🟠 High: Recipe name input (`kr-title-input`) is borderless and large — looks like the canonical "title" field. But it's visually crowded against the camera button, and unlike the Event Form's title row, there's no AI/wand button — only camera.
- 🟡 Medium: "Recipe link" sits ABOVE the recipe name. That order is unusual — most recipe apps put the name first. Reads "fill the URL to autofill the form" as the primary affordance.
- 🟡 Medium: Section labels (`Ingredients`, `Notes`) use `ef2-section-label` — consistent with Event Form's "For" label, but with no associated chips this label visually orphans.
- 🟢 Low: 3-column meta row (Prep / Serves / Difficulty) reads OK at 412 width but at narrower widths the labels could truncate.

**Spacing & layout**
- 🔴 Critical: NO footer with Cancel + Save. Same problem as Task and Event forms.
- 🟠 High: No image preview area — once a photo is picked, the form has no visible affordance showing "you have an image". Recipe images are central to a paid recipe app.
- 🟡 Medium: Recipe link section has its own `kr-section` block but the URL input is wrapped in a `field` label component. Different pattern than other sections (which use the `ef2-section-label` span).
- 🟡 Medium: Vertical rhythm changes between sections — link section is 97px, title row is 56px, meta row is 97px, ingredients is 87px, notes is 84px. Inconsistent visual cadence.
- 🟢 Low: Ingredient rows are stacked tightly with no visible row separator.

**Inputs & controls**
- 🟠 High: Difficulty is a native `<select>` element — but the same Difficulty options exist in the Task form as a custom popup picker (`tf-picker-overlay`). Two completely different UI patterns for the *exact same* control with the *exact same* options across two forms.
- 🟠 High: Prep time is a free-text input with placeholder "30 min" — meaning users can type anything ("half an hour", "30", "30 minutes"). No structured input. Should be a number + unit picker.
- 🟠 High: Ingredient row pattern: `qty` + `name` + Add button. After adding, the row gets X close. But there's no autocomplete from past ingredients or staples — users retype the same things forever.
- 🟡 Medium: URL input has type="url" which on Android may bring URL keyboard — good. But no validation on whether the URL is reachable; clicking the wand-equivalent (auto-import on URL change?) isn't surfaced.
- 🟡 Medium: Notes textarea has auto-grow behavior (good!) but also has the same magenta focus outline problem.
- 🟡 Medium: Number input for Serves has `min="1" max="99"` — good — but uses a number input which on Android shows numeric keyboard. Could be a stepper +/- buttons for one-handed use.
- 🟢 Low: No way to add subsections to ingredients (e.g., "for the sauce" / "for the topping") — power-user feature.

**Hidden / advanced options**
- 🟡 Medium: There are no progressive disclosures here at all — every field is shown upfront. That's reasonable for a recipe form (it's a form, not a list), but means there's no `+ Tags`, `+ Source`, `+ Cook time` (vs prep), `+ Yield/units`, etc.
- 🟢 Low: No way to mark a recipe as a draft/favorite from inside the form (must edit after creation).

**Empty / first-use state**
- 🟠 High: Save ✓ is enabled even when name is empty — pressing it would either fail silently or save a blank recipe. No visible disabled state.
- 🟡 Medium: "Recipe name…" placeholder is generic — could be example like "Spaghetti carbonara".
- 🟡 Medium: Empty ingredient row (qty + name) shows even before user types — feels overloaded for first-time use. Could start with just an "Add first ingredient" button.

**Copy & tone**
- 🟢 Low: "Recipe link" / "Prep time" / "Serves" / "Difficulty" / "Ingredients" / "Notes" — all friendly, direct.
- 🟡 Medium: Notes placeholder "Description, tips, source…" — fine but "source" is implicit in Recipe Link. Could split to clearer "Cook notes / variations".
- 🟢 Low: "Add" button next to ingredient field is generic. "Add to list" or "+ Add" would read more action-y.

**Polish details**
- 🟠 High: No image preview after picking a photo (mentioned above).
- 🟠 High: No save-state feedback — tapping ✓ has no visual confirmation.
- 🟡 Medium: Photo source sheet's Cancel is a text link (purple) — same as Event Form. But the form's own footer is missing entirely — so the only consistent interaction pattern is "Cancel = purple text link in sub-sheet".
- 🟡 Medium: No drag-to-reorder ingredients.
- 🟡 Medium: No sticky header/footer when scrolling — the kr-section labels scroll out of view, then the user loses context.

**Other (catchall)**
- 🟠 High: Recipe form uses `kr-` CSS prefix. DESIGN.md §13.13 step 1 says "rf- recipe form". Implementation uses kr- — minor naming drift but a crack in the spec adherence. (Bigger issue: every form picking its own prefix multiplies CSS bundle size and makes pattern reuse harder.)
- 🟠 High: `+ New recipe` from Meal Plan opens this form via close-delay-open pattern. On save, the parent reopens with the new recipe — works correctly per spec — but there's no toast confirming the new recipe was created.
- 🟡 Medium: AI-import from URL/photo updates fields silently (no "imported these 6 ingredients" feedback).
- 🟡 Medium: Image upload pipeline isn't shown in this form — uploaded photo is stored in a hidden variable `imageUrl`, never visible to user.

### Compared to Event Form (canonical)
- ❌ Uses `kr-` prefix instead of the spec's `rf-`
- ❌ No footer (same as Event Form, but the Event Form spec says it should have one)
- ❌ Difficulty uses native `<select>` (Event Form's similar field — "All day" — uses a custom chip)
- ❌ No `ef2-divider` between sections (uses kr-section spacing instead)
- ❌ No "+ Add Field" pattern for optional metadata
- ✅ Uses `ef2-icon-btn` for header buttons (consistent)
- ✅ Photo source sub-sheet matches Event Form's exactly (good cross-form consistency)
- ✅ AI auto-fill on URL change is present (matches Event Form's wand pattern semantically)

---

## 5. Reward form (new + edit)

**Opener (rewards page):** [rewards.js:1105](../../../rewards.js#L1105) — `openRewardForm`
**Opener (admin):** [admin.html:2671](../../../admin.html#L2671) — also called `openRewardForm` but locally scoped (different code)
**How to open:** Rewards page → FAB + (create) · tap a reward (edit) · admin → Rewards tab → +/edit

### Initial state (rewards page)
Sheet covers ~50% viewport. Header `New Reward` + ✓ + ✕. Below: a colored emoji button (🎁 default) inline with `Reward name` input. A 3-segment "type" control: `Custom` (purple-filled active) / `Task Skip` / `No Penalty`. A `0 pts` number input + `+ Pricing help` link right-aligned. A `Visible to` label (with no chips visible — relies on person filter). Two add-chips at the bottom: `Approval required` (active solid black) and `+ Advanced`.

### Expanded state
Tapping the emoji preview reveals an INLINE 2-row × 8-col grid of suggested emojis (🍕🎮🍦⭐🎬📱🛹🧁 / 🎯🏆🎪🏊🎨🎵🛍️🧸) plus a `+` cell at the start of row 3 (purpose unclear — custom emoji?).

Tapping `+ Pricing help` reveals an inline calculator: a "X days at GRADE (Y%)" compound input with a horizontal range slider, and explanatory text "7 days at B+ (88%) → 615 pts (tap to apply)".

Tapping `+ Advanced` reveals a label/value table:
- `Max uses`: Unlimited pill
- `Streak required`: None pill
- `Expires`: native `<input type="date">` (mm/dd/yyyy)

The `Approval required` and `Advanced` chips both flip to solid black filled when active. Form ends at the Expires row — no footer.

### Findings

**Typography & hierarchy**
- 🟠 High: The reward emoji is the visual focal point but has no clear treatment as "tap to change icon" — looks like decoration, not a control.
- 🟠 High: No clear visual hierarchy distinguishing the primary input ("Reward name") from secondary controls. Same gray label weight throughout.
- 🟡 Medium: "Visible to" label is shown with no associated control visible — the person chip area below is empty (relies on the page's person filter being set).
- 🟡 Medium: Pricing-help calculator's text "7 days at B+ (88%) → 615 pts (tap to apply)" mixes math and instruction in one line — hard to parse.
- 🟢 Low: Header reads "New Reward" but the create button label says "Create reward" (lowercase r). Inconsistent capitalization.

**Spacing & layout**
- 🔴 Critical: NO footer with Cancel + Save. Same pattern as all the other forms.
- 🟠 High: Advanced section uses a left-label / right-value table layout — completely different visual pattern than every other form's stacked label-then-control structure.
- 🟡 Medium: Emoji grid expansion happens inline, pushing the rest of the form down with no animation.
- 🟡 Medium: "Approval required" + "Advanced" chips wrap below the "Visible to" label — visually they look like they belong to that section but they're top-level toggles.
- 🟢 Low: Pricing slider has no min/max labels at the ends.

**Inputs & controls**
- 🟠 High: 3-segment "type" control (Custom/Task Skip/No Penalty) uses purple-filled active state. The `Approval required` chip uses black-filled active state. The Advanced chip is also black-filled. Three different "active" treatments in the same form.
- 🟠 High: Reward "type" segmented control values (Custom / Task Skip / No Penalty) have no explanation. What's the difference between Custom and Task Skip? A first-time user has no clue.
- 🟠 High: `0 pts` input has no min/max guidance. Can users enter 0? Negative? Decimals?
- 🟠 High: Expires uses raw `<input type="date">` with browser placeholder. Same issue as Task/Event.
- 🟡 Medium: Max uses defaults to "Unlimited" pill — but tapping it would do what? Open a number picker? Toggle to a value input? Unclear.
- 🟡 Medium: Streak required defaults to "None" — same ambiguity as Max uses.
- 🟡 Medium: Pricing slider's "tap to apply" affordance is unclear — what do you tap? The slider value pill? The text? The arrow?
- 🟡 Medium: Emoji grid has no aria-labels on cells — accessibility fail.
- 🟡 Medium: Emoji `+` cell purpose unclear — opens OS picker? Custom text input?
- 🟢 Low: No way to upload a photo as the reward icon (e.g. picture of the actual ice-cream shop reward) — emoji-only.

**Hidden / advanced options**
- 🟠 High: `+ Pricing help` is a confusing label — most users won't know "pricing" means "set the points cost". And it's a calculator, not help text. Better: "Suggest pts" or "Help me price this".
- 🟡 Medium: `+ Advanced` is a generic catch-all — Max uses + Streak required + Expires aren't naturally one category. Could be split into clearer disclosure groups (Limits / Expiry).
- 🟡 Medium: When Advanced is collapsed, no indication that there are 3 hidden fields — just "+ Advanced". Could show "+ Advanced (3)" or "+ Limits & expiry".
- 🟢 Low: Pricing-help calculator stays open after applying — should auto-collapse.

**Empty / first-use state**
- 🟠 High: "Reward name" placeholder is generic. "e.g. Pizza night" or "Movie pick" would teach the pattern.
- 🟠 High: Save ✓ has no visible disabled state when name + points are blank.
- 🟡 Medium: First-use users won't understand the difference between Custom/Task Skip/No Penalty without a one-liner explanation.

**Copy & tone**
- 🟡 Medium: "Pricing help" — see above.
- 🟡 Medium: "Visible to" — clear but the empty state below is mysterious (no chips because no person filter).
- 🟡 Medium: "Approval required" should be a verb-ish action ("Require approval before redeem") for clarity.
- 🟢 Low: "Custom" reward type is a misnomer — *every* reward is custom by definition.

**Polish details**
- 🟠 High: No save-state feedback.
- 🟡 Medium: Emoji grid lacks animation on expand/collapse.
- 🟡 Medium: Pricing-help reveals adds significant vertical content but no smooth scroll-into-view.
- 🟡 Medium: "Approval required" and "Advanced" chips both turn solid black when active — they look identical visually but represent very different things (a toggle vs an expand).
- 🟢 Low: No haptic on type-segment change.

**Other (catchall)**
- 🟠 High: Two implementations exist: rewards.js and admin.html each have their own `openRewardForm`. Likely diverged over time. They should be one shared function.
- 🟠 High: There's NO "color" picker for the reward icon — only emoji. Most paid family apps offer a color + icon combo.
- 🟡 Medium: No preview of the reward as a card (the way it'll appear in the Shop) before saving.
- 🟢 Low: Dev-banner "Clear data" badge overlaps the bottom of the form area in dev mode (cosmetic but noticeable in screenshots).

### Compared to Event Form (canonical)
- ✅ Header pattern matches (✓ + ✕ icons)
- ✅ Add-chip pattern (`Approval required`, `+ Advanced`) reuses the `ef2-add-chip` style
- ✅ Inline expand pattern matches the Notes/Location reveals
- ❌ NO footer (same as the canonical form, which is also missing one)
- ❌ Multiple competing "active" treatments in one form (purple-filled + black-filled)
- ❌ Native `<input type="date">` for Expires
- ❌ Inline pricing calculator is a unique pattern not used anywhere else — could be valuable elsewhere (e.g. estimating task points) but currently a one-off
- ❌ Emoji grid is inline and instant; Event Form uses sub-sheets for similar pickers — inconsistent picker patterns

---

## 6. Achievement / Badge form (admin)

**Renderer + opener:** [admin.html:3149](../../../admin.html#L3149) `renderAchievementForm` + [admin.html:3258](../../../admin.html#L3258) `openAdminAchSheet`
**How to open:** Admin → Library tab → Badges sub-tab → "+ Add Badge" (or tap a badge to edit)

### Initial state
Sheet ~62% viewport. Header `New Badge` + ✓ + ✕. Below: a borderless `Badge name` input, then immediately a 3-row × 8-col emoji grid (about 19 emojis, last one ✏️ shown with a card-style border indicating selection). Then a `What does this badge celebrate?` description input. Then a 3-segment `Auto / Either / Manual` (Either filled purple). Then a 2-column row: `Select condition…` `<select>` + `e.g. 7` number input. Then a 3-segment `Badge Only / + Points / Store Item` (Badge Only filled purple). Then a row of 4 person chips (Jordin, Samantha, Lexi, Elijah) with a `None = all` hint text on the right.

### Expanded state
Tapping the condition `<select>` opens OS-native dropdown with options: Current Streak (days) / Best Streak (days) / Total Points Earned / Tasks Completed / Perfect Days (100%) / Daily Grade / Weekly Grade / Monthly Grade / First Store Purchase. No further reveal sections — every field is shown upfront.

### Findings

**Typography & hierarchy**
- 🟠 High: Form is dense — emoji grid (3 rows), description, 2 segmented controls, dropdown + number, person chips, all stacked with no breathing-room dividers between conceptual groups (icon vs trigger vs reward vs people).
- 🟠 High: No section labels at all — the user has to infer what each segmented control is for. No "Trigger:", "Reward:", "Visible to:" labels.
- 🟡 Medium: "Badge name" input is the same gray-on-gray treatment as Task / Event / Recipe / Reward forms — consistent but always under-emphasized.
- 🟡 Medium: Emoji grid takes up ~25% of the form's vertical space — disproportionate to its importance vs other fields.

**Spacing & layout**
- 🔴 Critical: NO footer with Cancel + Save (consistent gap with all other forms).
- 🟠 High: Field grouping is unclear — emoji is associated with name but visually disconnected; trigger (Auto/Either/Manual) and condition (dropdown + number) are conceptually related but treated as separate rows.
- 🟡 Medium: Person chips are smaller and styled differently than Event/Task form chips (no color dot, plain gray pill). Different person-chip pattern.
- 🟡 Medium: The "None = all" hint text floats to the right of the person chips — easy to miss.
- 🟢 Low: Emoji grid wraps cleanly but the rows have no visual separator.

**Inputs & controls**
- 🟠 High: Condition is a native `<select>` — but Task form's similar "category picker" uses a custom popup. Multiple competing dropdown patterns.
- 🟠 High: Threshold input shows `e.g. 7` placeholder — but if the condition is "First Store Purchase" (boolean), the number field doesn't make sense. Need conditional show/hide.
- 🟠 High: No comparison operator shown — is the threshold ≥, =, or >? "Current Streak (days) [e.g. 7]" needs a "≥" between them.
- 🟡 Medium: Emoji selection uses a **card border** to indicate selection. The Reward form uses a **separate preview tile** with the chosen emoji. Two patterns for the same control.
- 🟡 Medium: Person chips have no clear "deselected = all" state — the empty state IS the active state. Confusing.
- 🟡 Medium: "Badge Only / + Points / Store Item" reward type — what extra fields appear when "+ Points" or "Store Item" is selected? They're not visible until selected, and the user doesn't know to expect them.
- 🟢 Low: No way to upload a custom badge image.

**Hidden / advanced options**
- 🟢 Low: No progressive disclosure used here at all — every field is shown upfront. Could collapse "Reward type" details under each variant.
- 🟡 Medium: When condition is a "Grade" (Daily/Weekly/Monthly), the threshold field is a number — but grades are letter values (A/B/C). Fragile coupling.

**Empty / first-use state**
- 🟠 High: No Save disabled state on empty fields.
- 🟠 High: First-use users cannot tell what differentiates Auto vs Either vs Manual — no help text.
- 🟡 Medium: Description placeholder "What does this badge celebrate?" is friendly but generic; an example would help.

**Copy & tone**
- 🟢 Low: "Badge name", "What does this badge celebrate?" are friendly.
- 🟡 Medium: "Auto / Either / Manual" — what do these mean to a non-technical user? Auto-grant vs hand-grant? Need labels or tooltips.
- 🟡 Medium: "Badge Only / + Points / Store Item" — similar opacity. "+ Points" implies adding something but is presented as a mutually exclusive segment.
- 🟡 Medium: "None = all" person-chip hint should be more prominent — current placement reads as a tooltip.

**Polish details**
- 🟡 Medium: Emoji selection has no animation on tap.
- 🟡 Medium: Auto/Either/Manual segmented control is purple-filled (consistent with Slot/Reward type elsewhere). Good.
- 🟡 Medium: No save-state feedback.
- 🟢 Low: Last-row emoji ✏️ is partially in row 3 alone — could fit more emojis.

**Other (catchall)**
- 🟠 High: This form should ideally use a 2-step wizard (1: pick icon + name, 2: define trigger + reward) given how dense it is.
- 🟡 Medium: No way to test the badge condition before saving (e.g. "this would award to: Jordin, Lexi").
- 🟡 Medium: No preview of the badge as it appears in scoreboard or trophy case.
- 🟡 Medium: Editing an existing badge that's already been awarded — does it re-evaluate or grandfather existing recipients? No UI hint.

### Compared to Event Form (canonical)
- ✅ Header pattern matches (✓ + ✕)
- ✅ Borderless title input pattern matches
- ❌ NO footer (matches the canonical, which is also missing one)
- ❌ Person chips have a totally different visual treatment (smaller, no color dot)
- ❌ No section labels (Event Form uses `For` label inline; Badge form uses none)
- ❌ Inline emoji grid vs Reward form's collapsible emoji grid — inconsistent
- ❌ Native `<select>` for condition picker
- ❌ Different selection pattern for emojis (border vs preview tile)

---

## 7. Person form (admin)

**Opener:** [admin.html:1621](../../../admin.html#L1621) — `openPersonSheet`
**How to open:** Admin → People tab → "+ Add Person" (create) · tap a person row (edit)

### Initial state
Sheet ~30% viewport (compact). Header `New Person` + ✓ + ✕. Below:
- Borderless `Name` input
- A `Color` label inline with a single color swatch (a red circle showing current selection) and an `Adult / Kid` 2-segment to its right (Adult purple-filled)
- A `+ Options` text-link expand chip (purple text, NOT a chip — different style than `+ Notes` etc.)

### Expanded state
`+ Options` reveals:
- `Admin access` label + a switch toggle (off by default — uses a real `.form-toggle` switch, the only form to do so)
- `Personal theme` label + native `<select>` dropdown
- `Open profile` button (purple text link, opens person.html)

Tapping the Color swatch opens an inline 9-col × 5-row grid of ~45 color swatches. Currently selected color has a thick black outline.

### Findings

**Typography & hierarchy**
- 🟡 Medium: `Name` input is borderless and gray-on-gray — same generic title input across forms. Could use stronger visual presence as the primary field.
- 🟡 Medium: `Color` label is inline with the swatch + role segmented control on one row — visually crowded. The role pill (Adult/Kid) competes with the color picker for attention.
- 🟢 Low: "+ Options" is a text link, unlike the chip-style "+ Options" in Task form. Inconsistent.

**Spacing & layout**
- 🔴 Critical: NO footer with Cancel + Save (consistent gap with all other forms).
- 🟠 High: `Color` and `Adult / Kid` share a single row — they're conceptually unrelated (color = identity, role = permissions) but visually grouped.
- 🟡 Medium: When color picker grid opens, it covers the Admin access toggle and Personal theme dropdown — user can't see what they're affecting.
- 🟡 Medium: Form is shorter than other forms — looks unfinished. Could fit avatar selection, birthdate, etc.

**Inputs & controls**
- 🟠 High: Color swatch indicator is **thick black outline** — different from Reward form (separate preview tile) and Badge form (card border). Three competing "selected" patterns across three forms.
- 🟠 High: Personal theme uses a native `<select>` — yet another native dropdown. Other forms have custom popups for similar choice sets.
- 🟡 Medium: Color grid swatches look ~30px — borderline below 44px tap target minimum.
- 🟡 Medium: Color swatches have no aria-labels — accessibility fail.
- 🟢 Low: `Adult / Kid` is binary — could be a switch rather than 2-segment.

**Hidden / advanced options**
- 🟠 High: `+ Options` reveals 3 fields (Admin access, Personal theme, Open profile). The link doesn't preview what's inside.
- 🟡 Medium: `Open profile` button inside a form is unusual — it's a navigation, not a form field. Should be a separate row outside the form, or a settings-detail link with a chevron.

**Empty / first-use state**
- 🟠 High: Save ✓ has no visible disabled state for empty name.
- 🟡 Medium: "Name" placeholder is generic — "First name (e.g. Sam)" would be more guiding.
- 🟡 Medium: First-use users won't know what "Personal theme" means or why they'd want it.

**Copy & tone**
- 🟢 Low: "Adult / Kid" is friendly. "Admin access" is direct.
- 🟡 Medium: "Personal theme" is fine, but if the family already has a theme, what does this add? Could be "Override family theme".

**Polish details**
- 🟠 High: No save-state feedback.
- 🟡 Medium: Color picker grid has no animation on open.
- 🟡 Medium: Switch toggle for Admin access is the only proper switch in the entire app's form library — feels like it landed here by accident.
- 🟢 Low: No icon/avatar picker — only color.

**Other (catchall)**
- 🟠 High: No avatar / photo upload for people. Most family apps have this; the app uses a colored circle with the first letter as default.
- 🟡 Medium: No way to set up notification preferences from this form — would need to navigate to person.html via "Open profile".
- 🟡 Medium: Birthdate / nickname / pronouns / etc. — none captured.

### Compared to Event Form (canonical)
- ✅ Header pattern matches
- ✅ Borderless name input matches
- ❌ NO footer
- ❌ Different "selected" indicator on color picker
- ❌ Native `<select>` for theme
- ❌ "+ Options" is a purple text-link, not a styled chip
- ❌ Uses real switch toggle (good!) but inconsistent with the rest of the app's chip-toggles

---

## 8. Category form (admin)

**Renderer + opener:** [admin.html:1955](../../../admin.html#L1955) `renderCategoryForm` + [admin.html:2034](../../../admin.html#L2034) `openAdminCatSheet`
**How to open:** Admin → Library tab → Categories sub-tab → "+ Add Category" (or tap a category to edit)

### Initial state
Sheet ~50% viewport. Header `New Category` + ✓ + ✕. Below: a small icon-input box (text input with maxlength=4 + emoji placeholder 🧹) inline with a borderless `Category name` input. A divider. Then 4 toggle rows in left-label/right-switch layout:
- `Event category` [off]
- `Show icon on task cards` [ON, purple]
- `PIN protected` [off]
- `Default for new tasks` [off]

A divider, then `+ Advanced` add-chip.

### Expanded state
Tapping `+ Advanced` reveals:
- `Scoring weight` label + number input (placeholder "None") with helper text "Percentage of total score this category contributes. Leave empty for no weighting."
- `Limit per person (min/day)` label + number input (placeholder "—")
- `Limit per household (min/day)` label + number input (placeholder "—")

If `Event category` is ON, an `Event color` row appears (with the cpick-btn) and the entire Advanced section gets hidden — different sub-form for events.

### Findings

**Typography & hierarchy**
- 🟢 Low: Toggle rows have consistent visual rhythm — clean.
- 🟡 Medium: Icon input is an undecorated text input — looks like a typo box, doesn't communicate "tap to pick emoji or type one".
- 🟡 Medium: "Category name" input has no leading label — relies on the placeholder.
- 🟢 Low: Helper text under "Scoring weight" is the only inline explanation in any form. Other forms should adopt this.

**Spacing & layout**
- 🔴 Critical: NO footer with Cancel + Save (consistent gap with other forms).
- 🟡 Medium: 4 toggle rows with no sub-grouping — they're conceptually different (Event vs visibility vs gating vs default) but treated identically.
- 🟡 Medium: Helper text uses an INLINE STYLE (`style="margin:0 0 var(--spacing-xs)"`) — direct violation of DESIGN.md's no-inline-styles rule.
- 🟢 Low: Sticky-style behavior is fine since the sheet doesn't need to scroll.

**Inputs & controls**
- ✅ Uses real `.form-toggle` switches consistently for all four toggles — best toggle implementation in the app.
- 🟠 High: Icon picker is a TEXT INPUT for raw emoji entry — typing 🧹 with the OS emoji keyboard works but isn't discoverable. Should be a tap-to-open emoji picker like Reward/Badge forms.
- 🟡 Medium: "Scoring weight" defaults to placeholder "None" but accepts numbers 0–100 — the placeholder is "None", the semantic is "0–100 or empty". Confusing.
- 🟡 Medium: Limit inputs use placeholder "—" for empty — should be more explicit ("Unlimited" or "No limit").
- 🟢 Low: Number inputs with proper min/max — good (matches HTML5 conventions).

**Hidden / advanced options**
- ✅ "+ Advanced" uses the proper `ef2-add-chip` pattern (matches Event Form) — consistent.
- 🟡 Medium: Advanced reveals 3 fields and they all have implications for scoring/limits. Could split into "Scoring" and "Limits" sub-groups.
- 🟡 Medium: When "Event category" toggle is ON, the Advanced section disappears entirely — fine logic but no message explaining "Event categories don't have scoring".

**Empty / first-use state**
- 🟠 High: Save ✓ has no visible disabled state for empty name/icon.
- 🟡 Medium: Default icon placeholder is 🧹 (broom) — biased toward chores. Could rotate or be neutral.
- 🟡 Medium: First-use users wouldn't know what "PIN protected" or "Scoring weight" do without trial.

**Copy & tone**
- 🟢 Low: Toggle labels are direct and friendly.
- 🟡 Medium: "Event category" — turning this on seems to fundamentally change the form (hides Advanced, shows color picker). That's a big mode switch hidden behind a toggle. Maybe should be a 2-segment "Type: Tasks / Events" upfront instead.
- 🟢 Low: "Default for new tasks" — clear but no warning if turning on while another category is already default.

**Polish details**
- 🟡 Medium: No animation on the conditional Event-color row showing/hiding.
- 🟡 Medium: No save-state feedback.
- 🟢 Low: Form-hint helper text is the only one in the app — should be reused everywhere.

**Other (catchall)**
- 🟠 High: Color picker is shown only when Event category is on — for non-event categories the icon is colored but you can't pick the color. Unintentional limitation?
- 🟡 Medium: Edit mode title is the category's own name (not "Edit Category") — different convention than other forms ("Edit Event", "Edit Task", etc.).
- 🟡 Medium: The "+ Add Category" trigger button in the page styling (looks like a thin pill button) doesn't match the FAB used on rewards/kitchen pages.

### Compared to Event Form (canonical)
- ✅ Reuses `tf-form` and `tf-options-row` classes (sharing primitives is good)
- ✅ Uses `ef2-divider` for section separation (consistent)
- ✅ Uses `ef2-add-chip` for + Advanced (consistent)
- ✅ Uses `ef2-field-reveal` for the advanced reveal (consistent)
- ❌ NO footer
- ❌ Title in edit mode = entity name (not "Edit X")
- ❌ Icon "picker" is a raw text input (different pattern from Reward/Badge emoji grids)
- ✅ Form-hint helper text usage — model pattern, should be propagated

---

## 9. Shopping list form (create + edit list)

**Openers:** [kitchen.js:1653](../../../kitchen.js#L1653) `openCreateListSheet` · [kitchen.js:1694](../../../kitchen.js#L1694) `openManageListSheet`
**How to open:** Kitchen → Lists tab → list-switcher area → `+` (create) · ⋮ menu / "Manage list" button (edit)

### Initial state — Create
Sheet ~25% viewport (very compact). Header `New list` + ✕ ONLY (no save icon — the only form to drop the header save). A single name input with placeholder "Grocery, Costco, Target…". A footer-ish row with Cancel + Create chip buttons.

### Initial state — Edit (Manage list)
Sheet ~28% viewport. Header `Edit list` + 🗑️ trash icon + ✓ + ✕ (FOUR icons). A name input pre-filled with the list name. Two chip buttons below: `Copy list` and `Clear checked`.

### Findings

**Typography & hierarchy**
- 🟢 Low: Both forms are minimalist — appropriate for the simple data they capture.
- 🟡 Medium: No icon/color affordance for the list (Walmart, Target, Costco visually identical — just text labels).

**Spacing & layout**
- 🔴 Critical: Create form HAS a footer (Cancel + Create) but Edit form does NOT — inconsistent within the same feature pair.
- 🟠 High: Create-form uses `chip` class for footer buttons (rounded pills, equal weight). Edit-form uses icon-only header buttons. Two completely different action patterns for paired forms.
- 🟡 Medium: Edit form has 4 icon buttons in the header (trash, save, close + the implicit overall row) — crowded.
- 🟡 Medium: Create form has no save icon in header (the only form like this) — the user has to scroll to find Create at the bottom.

**Inputs & controls**
- 🟢 Low: Name input placeholder ("Grocery, Costco, Target…") is great — friendly, multi-example.
- 🟡 Medium: No "set color" / "pick icon" affordance for the list — limits visual differentiation.
- 🟡 Medium: "Copy list" and "Clear checked" are equal-weight chip buttons — Clear should arguably be more dangerous-styled since it's destructive (technically reversible if no items removed though).
- 🟢 Low: No undo affordance after Clear checked.

**Hidden / advanced options**
- 🟢 Low: No advanced options here — appropriate for a simple list. But could include "share with…" / "default store hours" / etc.

**Empty / first-use state**
- 🟢 Low: Empty state on the page ("No lists yet / Create your first shopping list") with a "Create a list" button — clear.
- 🟠 High: When NO lists exist, there's no clear path to create one from the FAB (it tries to add an item, falls through to `openCreateListSheet`). Discoverability friction.

**Copy & tone**
- 🟢 Low: "New list" / "Edit list" / "Create" / "Cancel" — direct.
- 🟡 Medium: "Copy list" doesn't tell user where it copies to (clipboard? share sheet?).
- 🟡 Medium: "Clear checked" — what's the result? Removes from list permanently? Just unchecks? The label is ambiguous.

**Polish details**
- 🟡 Medium: No save-state feedback on Create.
- 🟡 Medium: Chip buttons for Cancel/Create are visually less authoritative than the primary `btn` styles used elsewhere — looks half-finished.
- 🟢 Low: Shake animation (`kl-shake`) for empty-name validation works correctly per spec.

**Other (catchall)**
- 🟠 High: Two separate functions (`openCreateListSheet`, `openManageListSheet`) with very different layouts for what's essentially the same form (just CRUD on a list name). Should be one form with mode-aware action buttons.
- 🟡 Medium: List doesn't have a sortOrder UI — created in order, no rearranging.
- 🟡 Medium: "Manage list" name is awkward — could be "Edit list" (which is the title) or just an icon.

### Compared to Event Form (canonical)
- ❌ Create form has no header save icon (every other form has one)
- ❌ Create form uses chip-styled footer buttons (different from Meal Plan's footer btn pattern)
- ❌ Edit form has 4 icon buttons in header (most forms have 3 max)
- ❌ Two paired forms (Create/Edit) with different header structures — inconsistency within the feature
- ✅ Inline shake animation for empty-name validation matches spec (`ef2-shake` pattern via `kl-shake`)

---

## 10. Item form (Item edit + Bulk add + Staple edit)

**Openers:** [kitchen.js:1829](../../../kitchen.js#L1829) `openItemEditSheet` · [kitchen.js:1023](../../../kitchen.js#L1023) `openBulkAddSheet` · [kitchen.js:1982](../../../kitchen.js#L1982) `openStapleEditSheet`
**How to open:** Long-press a list item (edit) · Lists FAB → "Add multiple" (bulk) · Staples sheet → tap a staple (edit)

### Initial state — Item Edit
Sheet ~30% viewport. Header `Edit item` + ✕ ONLY (no save). One section: an `ingredient-row` with `qty` + `item name` text inputs side-by-side. If item is not yet a staple, a `Save to staples` ghost button row appears below. Then a `ki-footer` with Cancel (ghost) + Save (primary). Then a `ki-delete-zone` with a "Remove item" red link.

### Initial state — Bulk Add
Sheet height auto-grows. Header `Add items` only — NO close button at all. A hint paragraph: "Type each item and press Enter, or paste a list." A single text input with `e.g. Milk` placeholder. A list area below for items as you type. Footer is JUST `Done` button (no Cancel).

### Initial state — Staple Edit
Almost identical to Item Edit — name input only (no qty), plus Cancel/Save footer + "Remove staple" delete zone.

### Findings (all three lumped)

**Typography & hierarchy**
- 🟢 Low: Item edit section is appropriately compact for what it does.
- 🟡 Medium: Bulk add hint paragraph "Type each item and press Enter, or paste a list" uses an inline class `kb-hint` — good helper text pattern; should be reused in other forms (matches the Category form's only-instance form-hint).
- 🟢 Low: Names are direct ("Edit item", "Add items", "Edit staple").

**Spacing & layout**
- ✅ Item edit and Staple edit BOTH have a proper footer with Cancel + Save buttons (using `btn` classes!) — unlike the Task/Event/Recipe/Reward/Badge/Person forms which lack footers entirely.
- ✅ Item edit and Staple edit BOTH have a delete zone below the footer — matches the spec for Edit-mode delete pattern.
- 🟠 High: Bulk add has NO close X — user can only "Done" out. If they typed an item and want to back out, no obvious cancel.
- 🟠 High: Inconsistent footer patterns within the same feature: Bulk add = single Done button; Item edit = Cancel + Save buttons; Staple edit = Cancel + Save buttons. Three patterns in three sister forms.
- 🟡 Medium: Item edit's `Save to staples` button is a full-width ghost button between the section and the footer — feels orphaned.

**Inputs & controls**
- ✅ Item edit's qty + name layout matches the Recipe form's ingredient row layout — shared primitive working well.
- 🟡 Medium: Bulk add doesn't show a "Save to staples" star inline as the user types — only after the item is added to the bottom list. Discoverability gap.
- 🟡 Medium: No category picker on Item edit — a power user might want to assign "milk" to "Dairy" for organization.
- 🟢 Low: No `inputmode="decimal"` on qty input even though "1/3" or "0.5" is common — minor.

**Hidden / advanced options**
- 🟢 Low: No advanced options needed for these tiny forms.

**Empty / first-use state**
- 🟢 Low: Bulk add placeholder "e.g. Milk" is the cleanest example placeholder in the app.
- 🟡 Medium: Item edit has no validation hint if name is wiped to empty — Save just fails silently per the code (`if (!name || !activeListId) return;`).

**Copy & tone**
- 🟢 Low: "Save to staples" is direct.
- 🟡 Medium: Bulk add's "Done" — what does it do? Saves all? Closes? Both? Should be "Add all" or "Done — add to list".
- 🟢 Low: "Remove item" / "Remove staple" — clear destructive labels.

**Polish details**
- 🟡 Medium: No save-state feedback on Item edit.
- 🟡 Medium: Item edit has a second action ("Save to staples") which uses `btn--ghost btn--full` — competing with the primary Save button visually.
- 🟢 Low: `requestAnimationFrame` + select() on the name input — minor polish for power-user typing.

**Other (catchall)**
- 🟠 High: Three separate forms (`ki-`, `kb-`, `ks-`) for related operations on items/staples. Each has its own CSS prefix and slight layout variations. Should be unified.
- 🟡 Medium: Bulk add's per-item star toggle is a great pattern for "save to staples while adding" — should be the same pattern used in single Item edit.
- 🟡 Medium: No confirm-on-close for bulk add if items are added but not yet "Done"-ed.

### Compared to Event Form (canonical)
- ✅ Item Edit & Staple Edit have proper Cancel/Save footers — actually MORE polished than the Event Form
- ✅ Item Edit & Staple Edit have inline delete-zone with red link — matches the Event Form spec for delete pattern
- ❌ Each form picks its own CSS prefix (ki-, kb-, ks-) for nearly identical layouts
- ❌ Bulk add has no close X (every other form does)
- ❌ Bulk add has Done-only footer (no Cancel)
- ✅ Reuses `ingredient-row` from Recipe form (shared primitive)

---

## 11. Other forms found via grep (catchall)

**Forms not deeply reviewed but spotted via grep — calling them out for follow-up.**

- [admin.html:1318](../../../admin.html#L1318) `openEventFormAdmin` — admin variant of the Event form. Likely diverged from dashboard's openEventForm. Should be unified.
- [admin.html:703](../../../admin.html#L703) `openAdminTaskSheet` — admin variant of the Task form (different from dashboard's openTaskForm). Should be unified.
- [admin.html:1111](../../../admin.html#L1111) `openIcalFeedSheet` — adds an iCal subscription URL. Tiny form. Worth reviewing for parity with the iCal URL sub-sheet in the Event form.
- [calendar.html:578](../../../calendar.html#L578) `openImportEventsSheet`, [calendar.html:604](../../../calendar.html#L604) `openIcalImportSheet`, [calendar.html:783](../../../calendar.html#L783) `openTextEventSheet` — all event-import variants in calendar. Likely overlap with the Event form's photo/iCal sub-sheets.
- [admin.html:1563](../../../admin.html#L1563) `openAdminRepeatSheet`, [dashboard.js:2517](../../../dashboard.js#L2517) `openRepeatSheet`, [calendar.html:1487](../../../calendar.html#L1487) `openRepeatSheet` — three implementations of the SAME Repeat sub-sheet across three pages.
- [dashboard.js:2310](../../../dashboard.js#L2310) `openPhotoSourceSheet`, [calendar.html:1317](../../../calendar.html#L1317) `openCalPhotoSourceSheet`, [kitchen.js:2064](../../../kitchen.js#L2064) `openListPhotoSourceSheet` — three implementations of the photo source picker.
- [dashboard.js:2357](../../../dashboard.js#L2357) `openEfIcalSheet`, [calendar.html:1359](../../../calendar.html#L1359) `openCalEfIcalSheet` — two implementations of the iCal URL sub-sheet.
- [dashboard.js:1719](../../../dashboard.js#L1719) `openMealEditorSheet`, [shared/components.js:3151](../../../shared/components.js#L3151) `renderMealEditorSheet` — a meal editor (separate from the meal plan picker). Quick edit for a single meal entry.
- [shared/components.js:2153](../../../shared/components.js#L2153) `renderSendMessageSheet` — the "send message" sheet for cross-person messaging. Form-shaped. Worth reviewing.
- [shared/components.js:2316](../../../shared/components.js#L2316) `renderBonusDaySheet` — bonus-day grant form. Possibly form-shaped.
- [shared/components.js:1691](../../../shared/components.js#L1691) `openDeviceThemeSheet` — device theme picker. Form-shaped per-mode.

### Findings (cross-cutting from this catchall)
- 🔴 Critical: At least THREE sub-sheet implementations of the same primitive (Repeat, Photo source, iCal URL) exist — copied across pages instead of reused. This guarantees drift over time.
- 🟠 High: At least TWO implementations of Event form (dashboard, admin) and Task form (dashboard, admin). Likely diverged.
- 🟡 Medium: The "Repeat" sub-sheet is critical UX (used by tasks, events, calendar) — having three versions is high-risk for inconsistency.

---

# Unified Improvement Plan

The per-form findings reveal that **no two forms in this app look or behave the same way**, even when they share the same primitives. The fix is not a per-form polish pass — it's extracting a small set of canonical components, fixing them once, then applying them everywhere. This plan lists everything; act on it as a multi-PR initiative.

## Anchor

**Don't anchor on the Event Form blindly.** The Event Form is the *spec's* canonical reference, but the implementation diverged from the spec — Event Form has no sticky footer, uses native `<input type="date">`, and shows magenta focus outlines despite spec rules against all three. Anchor on a NEW Form System Spec to be defined as part of this work, drawn from:

- The **Meal Plan sheet** for footer pattern (only form with a real Cancel+Save bottom-stuck footer that works).
- The **Item Edit sheet** for inline delete-zone pattern (footer + delete zone matches the spec).
- The **Category form** for switch-toggle and helper-text patterns (best in app).
- The **Event Form's title row + AI affordances** for primary-input pattern.
- The **Event Form's sub-sheet stacking** for modal sub-pickers.

Then the Event Form gets brought UP to that bar along with everyone else.

## Sequencing

Do this in order. Earlier phases unblock later ones — don't skip ahead.

### Phase 0 — Decide the spec (1 PR, doc-only)
0.1. Update `docs/DESIGN.md` §5.23 to reflect what's actually being targeted (or commit to making implementation match).
0.2. Pick a final naming convention: ONE prefix for shared form classes (`fs-` form sheet?), keep per-form prefixes only where intentional.
0.3. Decide on canonical "active" treatments for: chip-toggles, segmented controls, selected items in a picker. Document once.
0.4. Define the canonical primary input style (large, bold, distinguishable from labels).
0.5. Decide the dropdown picker pattern: inline reveal vs floating popup vs native `<select>`. Pick ONE for each input class.

### Phase 1 — Extract shared primitives (3-4 PRs)

These primitives are the consolidation backbone — every later phase depends on them.

1.1. **`<FormFooter>`** (or `renderFormFooter()`) — sticky-positioned Cancel + primary-action row matching the meal plan's pattern. Pulls in the `safe-area-inset-bottom` + negative-margin breakout from §5.23. Used by every form sheet. Add Loading state.
1.2. **`<DateInput>`** — wrap the date picker once. Default to a styled inline picker (not raw OS `<input type="date">`). Trigger via a labelled pill. Anchor: replace the half-baked Event Form treatment.
1.3. **`<TimeInput>`** — keep the existing custom 6-element pattern from Event Form. Promote it from a one-off to a shared primitive that all time-related forms use.
1.4. **`<ChipPicker>`** — the universal pill picker for Difficulty, Time-of-day, Slot, etc. Replace BOTH the Task form's floating popup AND the Recipe form's native `<select>` and the Badge form's native `<select>`. Anchor: derived from the meal plan's segmented control pattern (purple-filled active).
1.5. **`<EmojiPicker>`** — one inline grid component. Replace Reward's separate-preview-tile pattern, Badge's card-border pattern, and Category's raw text input. Add aria-labels (currently missing on Reward + Badge).
1.6. **`<ColorPicker>`** — `cpick-` exists already; promote it to a documented primitive and use everywhere (Person, Category, Reward needs one, List needs one).
1.7. **`<PersonChips>`** — single chip primitive used by Event, Task, Badge, Reward. The Badge form's plain-gray chips and Event form's color-dot chips should be the same component with optional state machine.
1.8. **`<SwitchToggle>`** — the Category form's `.form-toggle` is the right pattern. Reward's "Approval required" black-pill chip should be replaced with this.
1.9. **`<HelperText>`** — promote the Category form's `form-hint` class to a documented primitive. Stop using inline `style="..."` on it (current bug).
1.10. **`<InlineRevealField>`** — extract `ef2-field-reveal` pattern (Notes, Location, Options) into a primitive used by every form. Standardize the active-chip styling at the same time.
1.11. **`<FormSheetHeader>`** — title + ✕ + optional save/delete icon row. Standardize 3 vs 4 buttons. Decide: keep ✓ icon in header (paired with bottom footer button) or remove.

### Phase 2 — Fix the canonical reference itself (1 PR)
Bring the Event Form to the new primitives + new spec:
2.1. Add the proper Cancel+Save footer (Phase 1.1).
2.2. Replace the inline `<input type="date">` with `<DateInput>` (Phase 1.2).
2.3. Drop the magenta focus outline on the Location input (CSS-only).
2.4. Either implement the Family chip the spec describes, or remove the spec mention.
2.5. Change active add-chip styling to "same color, just solid border" per spec (or update the spec to match black-fill).
2.6. Add visible disabled state on save when title is empty.
2.7. Add saving spinner state to the save action.

### Phase 3 — Propagate to every other form (one PR per form, parallelizable)

For each of the 10 forms reviewed (Task, Meal Plan, Recipe, Reward, Badge, Person, Category, Shopping List Create+Edit, Item Edit, Bulk Add, Staple Edit, Send Message, Bonus Day, Theme picker), apply:

3.1. Replace its bespoke header/footer/toggle/picker patterns with the Phase 1 primitives.
3.2. Add proper Cancel+Save footer to every form that doesn't have one (Task, Event, Recipe, Reward, Badge, Person, Bulk Add, all admin variants).
3.3. Add visible disabled state on save when required fields empty.
3.4. Add saving spinner / success toast.
3.5. Apply the form's per-form follow-ups (see Per-Form Follow-Ups below).

### Phase 4 — DRY duplicates (1-2 PRs)
4.1. Unify `openEventForm` (dashboard.js + calendar.html + admin.html as `openEventFormAdmin`) into one function.
4.2. Unify `openTaskForm` (dashboard.js + calendar.html + tracker.html + admin's `openAdminTaskSheet`) into one.
4.3. Unify `openRewardForm` (rewards.js + admin.html) into one.
4.4. Unify the THREE `openRepeatSheet` variants (dashboard, calendar, admin's `openAdminRepeatSheet`).
4.5. Unify the THREE photo source picker variants (`openPhotoSourceSheet` in dashboard, `openCalPhotoSourceSheet` in calendar, `openListPhotoSourceSheet` in kitchen).
4.6. Unify the TWO iCal URL sub-sheets (`openEfIcalSheet` dashboard + `openCalEfIcalSheet` calendar).
4.7. Unify the related Item / Bulk-add / Staple-edit forms (`ki-`, `kb-`, `ks-` prefixes) into a single shared component with mode flags.

### Phase 5 — Polish + a11y sweep (1 PR)
5.1. Add `aria-label`s to all Emoji and Color picker swatches.
5.2. Audit tap targets — Color swatches (~30px) and any other under-44px controls.
5.3. Add transitions for inline reveals + emoji-grid expand.
5.4. Add `inputmode` attributes consistently (numeric for cooldown, decimal for qty).
5.5. Standardize sub-sheet animation (slide up + dim parent further).

---

## Patterns that repeat across forms (universal fixes)

These are the cross-cutting issues. **Fixing them as primitives in Phase 1 + propagating in Phase 3 gives ~80% of the polish lift in this plan.**

### P1. Missing sticky footer on most forms
**Forms affected:** Task, Event (canonical!), Recipe, Reward, Badge, Person, Bulk Add, Edit list, Create list (uses chips not btn), all admin variants
**Anchor:** Meal Plan + Item Edit
**Fix:** Phase 1.1 (`<FormFooter>`) + Phase 2.1 + Phase 3.2.
**Severity:** 🔴 Critical — primary action (Save) is currently a 38px icon at the top-right of the screen, the worst spot for thumb reach. Single biggest paid-app gap.

### P2. Three competing "active" treatments in one app
**Visual treatments observed:**
- **Purple-filled** background — used by 3-segment controls (Slot, Reward type, Auto/Either/Manual, Rotation pills)
- **Solid black filled** — used by add-chips when active (Notes, Location, Options, Approval required, Advanced)
- **Card border** — used by Badge emoji selection
- **Thick black outline** — used by Color picker selection
- **Separate preview tile** — used by Reward emoji
**Anchor:** Pick TWO at most: one for "primary toggle" (e.g. purple-filled), one for "selection within a grid" (e.g. card border + ✓).
**Fix:** Phase 0.3 + Phase 1.4 + Phase 1.5 + Phase 1.10.
**Severity:** 🟠 High — looks like 3 different design teams worked on the app.

### P3. Picker / dropdown style inconsistency
**Patterns observed for picking from a list:**
- Inline `ef2-picker-wrap` reveal (Event Form date, time)
- Floating popup overlay (Task form Difficulty, Duration, Category)
- Native HTML `<select>` (Recipe Difficulty, Badge Condition, Person Theme)
- Inline grid (Reward emoji, Badge emoji)
- Sub-sheet (Repeat picker, Photo source)
**Same control, three implementations:** Difficulty (Task uses popup, Recipe uses native select).
**Anchor:** Pick by control class — short list = popup; long list = sub-sheet; toggleable groups = chip row; date/time = inline reveal.
**Fix:** Phase 0.5 + Phase 1.4.
**Severity:** 🟠 High — confuses muscle memory.

### P4. Native `<input type="date">` everywhere
**Forms affected:** Task (One-Time), Event (date picker shows native input inside ef2-picker-wrap), Recipe (none — no date), Reward (Expires), Badge (none), Meal Plan (uses kp-date-btn pattern — better), all admin variants.
**Anchor:** Meal Plan's `kp-date-btn` triggering `<input type="date">` via `.showPicker()` is the BETTER pattern. Or build a real custom calendar grid.
**Fix:** Phase 1.2 + Phase 2.2 + Phase 3.1.
**Severity:** 🟠 High — on Android the wheel-day-picker is worst-in-class. Same problem the spec set out to avoid for time pickers, ignored for date.

### P5. Magenta focus outlines on inputs inside form sheets
**Forms affected:** Event (Location), Recipe (Notes), Reward (?), Person (?), all forms with text inputs.
**Spec says:** No outline rings inside form sheets — use background tint instead.
**Fix:** CSS-only audit + ditch focus-visible outline on `.bottom-sheet input:focus`.
**Severity:** 🟠 High — visually broken; reads as default browser chrome.

### P6. CSS prefix sprawl (each form picks its own)
**Prefixes in use:** `ef2-` (event), `tf-` (task), `kr-` (recipe — should be `rf-` per spec), `cf-` (category), `ki-` (item), `ks-` (staple), `kb-` (bulk add), `kl-` (list), `ps-` (person), `cpick-` (color picker), `kp-` (meal plan picker)
**Anchor:** Reduce to a shared `fs-` (form-sheet) prefix for primitives, then per-form prefix only for genuinely-unique classes.
**Fix:** Phase 0.2 + Phase 1.* + Phase 4.7.
**Severity:** 🟡 Medium — invisible to users but dramatically increases CSS surface area + drift risk.

### P7. No save-state feedback on any form
**Forms affected:** Every single one.
**Fix:** Phase 1.1 includes loading state on the Save button (spinner + disabled). Phase 3.4.
**Severity:** 🟠 High — user has no feedback whether their tap registered.

### P8. No visible disabled state when required fields empty
**Forms affected:** Every form. Save is always tappable; failures are silent or shake-only.
**Fix:** Phase 1.1 + Phase 2.6 + Phase 3.3 — Save button reflects `disabled` state on every field-input event.
**Severity:** 🟠 High — paid apps universally show this.

### P9. Title input doesn't visually dominate
**Forms affected:** Task, Event, Recipe, Reward, Badge, Person, Category, Item, List.
**Anchor:** Linear / Things title input style — large, bold, color: var(--text), distinct from label gray.
**Fix:** Phase 0.4 + Phase 1.* (single shared `<TitleInput>`).
**Severity:** 🟡 Medium — the most important field is always under-emphasized.

### P10. Person chip variants
**Forms affected:** Event/Task use `ef2-person-chip` (color-dot, primary/attending state machine). Badge uses small plain-gray chips. Reward shows them differently in "Visible to" (currently empty in screenshots).
**Anchor:** Single PersonChips primitive with state-machine flags (primary/attending/single-select/multi-select).
**Fix:** Phase 1.7.
**Severity:** 🟡 Medium.

### P11. Toggle component split: switch vs chip
**Forms affected:** Person (Admin access uses `.form-toggle` switch), Category (4× `.form-toggle` switches), Reward ("Approval required" uses black-pill chip), Task ("Exempt from scoring" uses pill toggle).
**Per CLAUDE.md user memory:** "Never use checkboxes — always use `.form-toggle`." Reward and Task break this.
**Fix:** Phase 1.8 + Phase 3.1.
**Severity:** 🟠 High (user explicitly called this out as a preference).

### P12. Helper text exists in exactly one form
**Forms affected:** Category form's "Scoring weight" hint is the ONLY explanatory inline text in the entire form library.
**Anchor:** Category's `form-hint` class.
**Fix:** Phase 1.9 + Phase 3.5 — add helper text under cooldown, exempt, condition, expires, max uses, etc.
**Severity:** 🟡 Medium — improves first-use comprehension dramatically.

### P13. Edit-mode title inconsistency
**Forms affected:** Most use "Edit X" (Edit Event, Edit Task, Edit Recipe, Edit Item, Edit list, Edit staple, Edit Reward). Category form uses the entity's own name as the title (e.g. "Chores").
**Fix:** Phase 0.* — pick one convention. Recommend "Edit X" for clarity.
**Severity:** 🟢 Low.

### P14. Sub-sheet patterns are inconsistent
**Patterns observed:**
- Repeat sub-sheet: ← Back link top-left + Cancel/Done footer (redundant)
- Photo source sub-sheet: Cancel as text-link only (no Done — picking auto-confirms)
- iCal URL sub-sheet: Cancel + Import buttons (proper)
**Fix:** Phase 1.* + Phase 4.4-4.6 — single sub-sheet shell with header (no back link, just ✕) + Cancel/primary footer.
**Severity:** 🟡 Medium.

### P15. Three implementations of the same primitive sub-sheet
- `openRepeatSheet` × 3 (dashboard, calendar, admin)
- `openPhotoSourceSheet` × 3 (dashboard, calendar, kitchen)
- `openEfIcalSheet` × 2 (dashboard, calendar)
- `openEventForm` × 3 (dashboard, calendar, admin)
- `openTaskForm` × 4 (dashboard, calendar, tracker, admin)
- `openRewardForm` × 2 (rewards, admin)
**Fix:** Phase 4.
**Severity:** 🟠 High — guarantees drift over time.

### P16. No image previews where they matter
- Recipe form: photo-import path stores `imageUrl` in a hidden variable; no thumbnail shown.
- Reward form: emoji-only, no photo upload.
- Person form: color-only, no avatar upload.
- List form: name-only, no icon/color/image.
**Fix:** Per-form Phase 3 work.
**Severity:** 🟡 Medium — content-poor visual identity.

### P17. Person chips have no default selection / direction
**Forms affected:** Event, Task, Badge ("None = all" hint).
**Fix:** Either pre-select a default (current user / family) or add a more prominent hint ("Tap to assign").
**Severity:** 🟡 Medium.

### P18. Borderless title input lacks visual cursor / invitation
Same forms as P9. The title input is positioned to be the first thing the user types but provides no visual cue ("tap me first"). Combined with the no-auto-focus rule (correct, prevents keyboard popping), users can stare at the form for several seconds.
**Fix:** Add a subtle pulse animation, a placeholder-rotating example, or a soft caret outline.
**Severity:** 🟢 Low.

### P19. No undo / no toasts on destructive operations
**Forms affected:** Edit list "Clear checked" deletes items irreversibly (showConfirm wrapped). Item edit "Remove item" same. Category delete same. Reward delete same.
**Fix:** Add a "Undo" toast for ~5 seconds after destructive actions. Higher polish bar.
**Severity:** 🟡 Medium.

### P20. Inline `style="..."` violations
Found in Category form's helper text ("`<p class="form-hint" style="margin:0 0 var(--spacing-xs)">"`). DESIGN.md non-negotiable rule.
**Fix:** Phase 1.9 sets the margin in CSS.
**Severity:** 🟢 Low (rule violation, but cosmetic).

---

## Per-Form Follow-Ups (form-specific, beyond shared patterns)

### Task form
- Add an "All kids" / "Family" quick-select chip (Event Form spec describes one too — both need it).
- Add `+ Cooldown` and `+ Exempt` as separate disclosure chips, or rename `+ Options` to `+ Scoring` for clarity.
- Wire same Difficulty `<ChipPicker>` as Recipe form (P3).
- Disambiguate "Any day" select on Weekly vs Monthly — what does "any" mean? Add helper text or pre-fill sensible default.
- Inline Edit-mode delete-zone (matching Item Edit pattern), drop the showConfirm modal.
- Add saving spinner / "Created" toast.
- Add labels under detail chips (Medium, 10 min) — e.g. "Difficulty", "Duration".

### Event form
- See Phase 2 (canonical fix-up).
- Add a URL/link field — common for Zoom/Meet/school events.
- Wand button needs a discoverable example (tooltip on first use).
- Make date pill have a chevron affordance.
- Either render the spec'd Family chip or remove it from spec.
- Disambiguate "All day" treatment vs the other secondary chips.

### Meal plan sheet
- Add leading magnifying-glass icon to search.
- Add X clear button to search input.
- Show default recipe list (favorites + 3 most-recent) per spec — currently hidden until search.
- Add image thumbnails to recipe rows.
- Reduce empty space when list is closed (~150px of nothing).
- Add favorite-star toggle inline (not just in the recipe form).

### Recipe form
- Show image preview after photo upload.
- Replace native Difficulty `<select>` with shared `<ChipPicker>`.
- Add Save-disabled state on empty name.
- Replace `kr-` prefix with `rf-` per spec.
- Add ingredient autocomplete from past ingredients + staples.
- Add "+ Tags" / "+ Cook time" disclosure chips.
- Reorder so Recipe name is above Recipe link (name is more important).
- Auto-collapse the URL input once a recipe is parsed.

### Reward form
- Unify the rewards.js + admin.html duplicates.
- Replace native `<input type="date">` for Expires.
- Replace "Approval required" black-pill chip with proper switch.
- Define what Custom / Task Skip / No Penalty mean (helper text or icons).
- Make "+ Pricing help" → "Suggest pts" or "Help me price this".
- Add color picker for icon background.
- Show preview of how the reward card will look in the Shop.
- Add aria-labels to emoji cells.
- Disambiguate "Unlimited" / "None" pills in Advanced — should be values + edit, not labels.

### Badge form
- Show "≥" between condition and threshold, or use a comparison `<select>`.
- Hide threshold input when condition is "First Store Purchase" (boolean).
- Add labels: "Trigger", "Reward", "Visible to".
- Replace native Condition `<select>` with shared picker.
- Add explanation for Auto / Either / Manual.
- Show preview of how the badge will appear in scoreboard.
- Replace the in-form ✏️ emoji with the shared `<EmojiPicker>` component.
- Tighten emoji grid (last row has only 3 cells).

### Person form
- Add an avatar/photo upload field.
- Pull "Open profile" out of the form — it's a navigation, not a field.
- Replace native Theme `<select>` with shared picker.
- Make color picker grid swatches ≥44px tappable.
- Add aria-labels (hex name) to swatches — Person form's swatches lack labels (Category form's have hex labels — propagate).
- Add fields for nickname / pronouns / birthdate.
- "+ Options" link → match the chip pattern from other forms.

### Category form
- Replace icon text input with shared `<EmojiPicker>`.
- Make Event-color picker available for non-event categories (limitation seems unintentional).
- Move Event-category toggle into a 2-segment "Type: Tasks / Events" upfront.
- Edit-mode title should be "Edit Category" (currently shows entity's own name).
- Remove the inline `style="..."` on form-hint.
- Group "Scoring weight" + "Limits" into a sub-section with its own header.

### Shopping list form (Create + Edit list)
- Unify openCreateListSheet + openManageListSheet into one form with mode flag.
- Use proper btn classes for footer in Create form (currently `chip`).
- Add icon/color picker for list (Walmart vs Target visual differentiation).
- Add ✓ icon in Create header (every other form has one).
- "Copy list" should specify destination (clipboard / share).
- "Clear checked" should specify scope (removes permanently).

### Item / Bulk Add / Staple Edit forms
- Unify into a single shared component with mode flags.
- Add ✕ close to Bulk add header.
- Replace Bulk add's "Done" with "Add all to list" and add a Cancel button.
- Add category picker in Item edit.
- Bulk add: show "save to staples" star inline as user types (not just in added-list).
- Add confirm-on-close for Bulk add if items added but not saved.

### Setup wizard (skipped per user instructions)
Out of scope for this review — needs full rebuild.

### Other (catchall) forms
- Audit `renderSendMessageSheet`, `renderBonusDaySheet`, `openDeviceThemeSheet`, `openIcalFeedSheet`, `openImportEventsSheet`, `openTextEventSheet`, `openSlotEditSheet`, `openMealEditorSheet`, `openAddToListReviewSheet` against the new primitives.
- These weren't deeply screenshotted but follow the same general patterns and will benefit from the Phase 1 primitives.

---

## What "done" looks like

After this work, opening any two forms in the app should feel like opening two screens of the same app:
- Same header with title + ✕ (and consistent save-icon decision).
- Same primary input weight.
- Same chip patterns and same active treatment.
- Same picker behavior for the same kind of input.
- Same sticky footer with Cancel + primary action.
- Same disabled state when required fields empty.
- Same loading spinner when saving.
- Same delete-zone pattern in edit mode.
- Same sub-sheet pattern for nested pickers.

Today, none of the above are true between any pair of forms.

---

