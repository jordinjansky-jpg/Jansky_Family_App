# Kitchen Meals Tab — Redesign Spec

**Date:** 2026-05-11
**Status:** Approved design — implementation pending
**Sub-project:** 1 of 5 in the Kitchen UI/UX program
**Scope:** Visual + interaction redesign of the Meals tab inside `kitchen.html`, plus the introduction of a Kitchen-wide "AI Tools" entry point and the consolidation of school-lunch import flows.

## Why this spec exists

The Kitchen tab works functionally but visually underdelivers vs the Dashboard's bar — for a Skylight competitor, the meal-planning surface should be one of the most polished screens in the app. Today the Meals tab is a column of monochrome text rows; planned dinners and school lunches are indistinguishable from empty placeholders; school-lunch import lives only in Admin where parents won't find it; and the "+1 vs +2" school slot labelling reads wrong for most families. This spec ships a tight redesign that addresses all of those without scope creep into Recipes/Lists (those are their own sub-projects).

## Goals

1. Meals tab feels visually competitive with paid family hubs (recipe thumbnails, today emphasis, dashboard-aligned tile language).
2. Dinner — the most-planned slot — always visible per day as a gentle nudge, without flooding the screen with empty placeholders for slots most families never plan.
3. All school-lunch import sources (photo, gallery, file, iCal feed) consolidated under a single Kitchen AI Tools entry point.
4. School-lunch labelling adapts to what's actually planned (one slot → `SCHOOL`; two → `SCHOOL 1` / `SCHOOL 2`).
5. Parents can manually plan a second school option without leaving the Plan-a-meal sheet.

## Non-goals (out of scope for this sub-project)

- Recipe library thumbnails, search, richer filter — sub-project 2.
- Lists tab polish (category fix, button disambiguation, AI labels) — sub-project 3.
- Dashboard ambient tile changes for dinner-this-week / list-running-low — sub-project 4.
- Cook mode, meal history view, share-list link, AI ingredient suggestions, dup detection, multi-option meal voting — sub-project 5.
- Per-family configurable default-visible slots — deferred until a real user reports the absence of breakfast planning is a problem. Today: hardcode Dinner as the always-visible slot.

---

## 1. Day-block layout

### Slot visibility rule
- **Dinner row always renders** for every day in the visible window — populated with the planned name or the empty-state CTA `Plan dinner ›`.
- **All other slots** (Breakfast / Lunch / Snack / School 1 / School 2) render only when planned for that day.
- The day-block never grows or shrinks beyond what's planned — no reserved slots, no empty rows.

### Slot row content (planned)
- 32×32 thumbnail (radius `--radius-sm`) on the leading edge.
  - Has `recipeId` and recipe has `imageUrl` → recipe thumbnail.
  - Has `recipeId` but no `imageUrl` → `🍴` emoji placeholder (matches the existing `recipe-pick__thumb--placeholder` pattern in [kitchen.js:456](kitchen.js#L456)).
  - `customName` / no `recipeId` → same `🍴` placeholder.
- Slot label (72px width, uppercase, `--text-faint`).
- Meal name (`--text`, single line, ellipsis on overflow).

### Slot row content (empty Dinner state)
- 32×32 transparent placeholder square (keeps grid alignment with planned rows).
- `DINNER` label.
- `Plan dinner ›` in `--accent-ink`, italic removed, chevron suffix — matches the Dashboard's "Plan dinner ›" ambient tile copy and visual language.

### Day-header
- Day name + date (`Mon May 11`), `--text` weight 600.
- Today: header background `--accent-soft`, text `--accent-ink`, `TODAY` pill retained from current implementation at [kitchen.js:312](kitchen.js#L312).
- Other days: surface background, `--text-muted` text.
- Right-aligned `+` icon-button (24×24, `--text-muted`) — opens Plan-a-meal sheet with slot picker open and **no slot pre-selected** (forces the user to pick which slot). This is the only entry point for adding Breakfast / Lunch / Snack / non-default-Dinner when Dinner is the only visible row.

### Tap behaviour
- Tap a planned slot row → existing `openSlotEditSheet` ([kitchen.js:622](kitchen.js#L622)).
- Tap the empty-state Dinner row → Plan-a-meal sheet, pre-set to Dinner slot.
- Tap the day-header `+` → Plan-a-meal sheet, slot picker open, no preset.
- All other day-header areas: not tappable (avoid accidental triggers).

---

## 2. Header & navigation

The Meals tab presents a rolling 7-day window starting today. No pagination, no swipe-week, no back-week.

- **No "Week of …" label.** Day rows carry the dates; a redundant week header adds chrome without value when the window is fixed to today+6.
- **No `‹` / `›` arrows.** Matches the Dashboard's chrome-light pattern.
- **No swipe pagination.** Past meals will be reachable through the Meal History view (sub-project 5). Far-future planning is handled by Plan-a-meal's existing date input which accepts any future date.
- **Kitchen tabs row** (Meals / Recipes / Lists) stays as-is, with one addition: a right-aligned **magic-wand AI Tools icon** on the same row. Tap → Kitchen AI Tools sheet (§3). The icon visually echoes the existing wand on Lists used for AI cleanup ([kitchen.css:255](styles/kitchen.css#L255)) so users trained on one transfer to the other.

**Removals from current `renderMealsTab`** ([kitchen.js:266](kitchen.js#L266)):
- `bindWeekStripSwipe` ([kitchen.js:418](kitchen.js#L418)) is dropped.
- `currentWeekStart` becomes derived (always today) rather than a swipe-mutable state.
- The week-strip `__track` transform is dropped — only one week is ever rendered.

---

## 3. Kitchen AI Tools sheet

A new bottom sheet, mountable from anywhere in `kitchen.html`, opened by the wand button in §2.

### Layout
```
Kitchen AI tools                  ✕
─────────────────────────────────────
SCHOOL LUNCH
  [📷 Take photo]    [🖼 From gallery]
  [📄 Upload file]   [🔗 iCal feed]

RECIPES   (coming soon)
─────────────────────────────────────
```

- **Sections are visually distinct with `--text-faint` uppercase labels.** Each section's actions render as a 2×N grid of `.btn.btn--secondary` buttons sized for thumb comfort.
- **Recipes section is reserved space** with a `(coming soon)` ghost line — wired up in sub-project 2 (URL import, photo import, find ideas online consolidation). Showing the section header now communicates "this surface will grow"; rendering empty actions would feel broken.
- **Future sub-project 5** adds an `AI SUGGESTIONS` section with "What should we make tonight?" and similar.

### School lunch actions (sub-project 1 scope)

Each action reuses existing Worker handlers and confirm flows. No new Worker code required for photo / gallery / file paths; iCal is the only new infrastructure.

| Action | Source picker | Worker handler | Confirm UI |
|---|---|---|---|
| Take photo | `<input type="file" accept="image/*" capture="environment">` | `schoolLunch` (existing) | `renderConfirmRow` ([shared/ai-helpers.js](shared/ai-helpers.js)) |
| From gallery | `<input type="file" accept="image/*">` | `schoolLunch` | same |
| Upload file | `<input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.gif">` | `schoolLunch` | same |
| iCal feed | Sub-sheet with URL input + sync controls (see §4) | new client-side iCal fetcher | inline list of upcoming-week entries with edit-before-save |

The Worker's existing `schoolLunch` handler ([workers/kitchen-import.js:92](workers/kitchen-import.js#L92)) is reused unchanged. After AI extraction returns its day-keyed entries, the confirm step lets the user accept/edit each entry before writes land at `rundown/kitchenPlan/{date}/school-lunch[-2]`.

The Admin panel's existing school-lunch import block ([admin.html:4752](admin.html#L4752)) is **removed** as part of this work — the AI Tools sheet becomes the single home. Admin should not own a parent-frequency flow.

---

## 4. iCal feed for school lunch

The most net-new piece in this sub-project. Reuses the existing iCal pattern already wired into [shared/firebase.js](shared/firebase.js) for calendar events (`readIcalFeeds` / `writeIcalFeed` / `writeIcalFeedLastSync`).

### Setup sub-sheet
Opened from the `🔗 iCal feed` button:
- Header `School lunch iCal feeds`.
- One row per person who has a feed configured. Each row: name, host of the feed URL, last sync timestamp, `Sync now` button, overflow (edit, remove).
- `+ Add a feed` row at the bottom → opens an edit sub-sub-sheet: person picker (people with `schoolAge: true` or — simpler — every person), URL field, save.

### Schema
New branch under existing `rundown/kitchen/`:

```
rundown/kitchen/schoolLunchFeeds/{personId} ← {
  url:        string,    // canonical feed URL
  addedAt:    number,
  addedBy:    string,    // person ID
  lastSync:   number | null,
  lastError:  string | null
}
```

Note: this branch is per-person, not per-kid-and-slot. Each feed is "one school's lunch menu" — even if a household has two kids at the same school they share one feed.

### Sync logic
- Runs on `kitchen.html` load and on tab-focus.
- Fetcher is client-side (no Worker) — feeds are public URLs; CORS-safe school district feeds (Nutrislice, etc.) work directly. For CORS-blocked feeds, we'd add a Worker proxy later; out of scope for this sub-project (note in implementation plan).
- For each event in the next 30 days: SUMMARY → `customName`. Date → write to `rundown/kitchenPlan/{date}/school-lunch`. If `school-lunch` is already populated *for that date and was sourced from the same feed*, overwrite. If `school-lunch` is populated from a different source (manual entry, photo import), **do not overwrite** — write to `school-lunch-2` if free; if `school-lunch-2` is also taken, surface a conflict count chip in the sub-sheet.
- Conflicts:
  - Tracked per feed at `rundown/kitchen/schoolLunchFeeds/{personId}/conflicts: { [dateKey]: 'manual' | 'photo' | 'other-feed' }` (lightweight; only set when a conflict occurs, cleared when the conflicting entry is removed).
  - Surfaced as a small `2 conflicts` chip on the feed row in the setup sub-sheet. Tap → list view → resolve one-by-one.

### Out of scope (note in plan)
- Background sync (Cloudflare Worker scheduled fetch). Reasonable extension once usage proves it out; not needed to ship.
- Recipe-mapping (turning "Crispy Chicken Sandwich" into a real `recipeId` so thumbnails work for iCal-sourced entries). For now, iCal entries always render with the `🍴` placeholder.

---

## 5. Dynamic school-lunch labelling

The current behaviour shows hardcoded `SCHOOL 1` / `SCHOOL 2` labels even when only one school slot is planned ([kitchen.js:246](kitchen.js#L246)). Most families have one lunch option per day — the `1` reads as a meaningful enumeration when it isn't.

### Rule (per day)
- Day has only `school-lunch` populated → label reads **`SCHOOL`**.
- Day has only `school-lunch-2` populated → label reads **`SCHOOL`** (rare; happens transiently if entry-1 was deleted and entry-2 wasn't).
- Day has both populated → labels read **`SCHOOL 1`** and **`SCHOOL 2`**.

### Applied surfaces
- Meals tab day-block slot rows.
- Slot-edit sheet ([kitchen.js:622](kitchen.js#L622)) chip showing the slot name.
- Plan-a-meal sheet's slot pill (slot picker shows just `School` — see §6).

The underlying schema keeps `school-lunch` and `school-lunch-2` as distinct slot keys (no migration). Only the display label changes.

---

## 6. Plan-a-meal sheet updates

Two changes to the existing `openPlanMealSheet` ([kitchen.js:440](kitchen.js#L440)):

### Add School to the slot picker
- Current picker filters school slots out (`PLAN_SLOT_ORDER = SLOT_ORDER.filter(s => !s.startsWith('school'))` at [kitchen.js:443](kitchen.js#L443)).
- New picker order: `Breakfast`, `Lunch`, `School`, `Dinner`, `Snack`.
- Selecting `School` auto-allocates on save:
  - If the day's `school-lunch` slot is empty → write to `school-lunch`.
  - If `school-lunch` is taken → write to `school-lunch-2`.
  - If both are taken → save button is disabled with helper text `Both school slots are filled for this day. Tap a slot to edit it.`

### Inline "Plan a second School option"
- Shown only when slot picker is `School` AND the meal-select has a recipe/customName chosen AND the day's other school slot is empty.
- Renders below the meal-select as a ghost row: `+ Plan a second School option`.
- Tap → stacks a second meal-select below the first. Both saves happen in one shot on tap-Save: first selection → `school-lunch`; second → `school-lunch-2`.
- If the user backs out of the second selection (clears it), only the first saves. No "are you sure" — empty second means single school slot, which is the common case.

### Out of scope
- Multi-option planning for Breakfast / Lunch / Dinner / Snack ("plan 3 dinner options, family votes"). Parked as a sub-project 5 line item — schema would shift `kitchenPlan/{date}/{slot}` from object to array, which is a non-trivial migration. Not bundled with this sub-project.

---

## 7. Visual tokens

| Element | Token / value |
|---|---|
| Day-header (today) background | `var(--accent-soft)` |
| Day-header (today) text | `var(--accent-ink)` |
| Day-header (other) background | `var(--surface)` |
| Day-header (other) text | `var(--text-muted)` |
| Slot row thumbnail size | 32×32 px |
| Slot row thumbnail radius | `var(--radius-sm)` |
| Empty-Dinner CTA color | `var(--accent-ink)` |
| AI Tools wand icon color (default) | `var(--text-muted)` |
| AI Tools wand icon color (active/pressed) | `var(--accent)` |
| Per-day `+` button color | `var(--text-muted)` |
| TODAY pill | retained from current `.day-block__today-pill` |

No new color tokens introduced. Theme integration is automatic via `--accent-soft` / `--accent-ink`.

---

## 8. File-level impact

Modifications expected (writing-plans will break this down further):

| File | Change |
|---|---|
| [kitchen.js](kitchen.js) | `renderMealsTab` redesigned; `bindWeekStripSwipe` removed; new `renderSlotRow` helper; `openPlanMealSheet` updated for School slot + inline second-option; new `openKitchenAiToolsSheet`; new `openSchoolLunchIcalSheet`; new dynamic-label helper `getSchoolSlotLabels(plan)` |
| [styles/kitchen.css](styles/kitchen.css) | Day-block updated styles, thumbnail rules, today-emphasis, AI-tools sheet styles, per-day + button |
| [shared/firebase.js](shared/firebase.js) | New exports: `readSchoolLunchFeeds`, `writeSchoolLunchFeed`, `removeSchoolLunchFeed`, `writeSchoolLunchFeedSync` |
| [shared/components.js](shared/components.js) | `renderHeader` left unchanged (wand lives in Kitchen tabs row, not the global header). New `renderKitchenAiToolsSheet` shared renderer if useful across surfaces; otherwise local to kitchen.js |
| [admin.html](admin.html) | School-lunch import block removed (lines around 4752); the panel keeps the rest of its responsibilities |
| [sw.js](sw.js) | `CACHE_NAME` bump |

No DESIGN.md changes needed for sub-project 1; the redesigned Meals tab section will be appended once sub-projects 1-3 ship together (per CLAUDE.md's rule that DESIGN.md is the single source of truth).

---

## 9. Acceptance criteria

A working implementation must satisfy all of the following.

1. Meals tab renders a rolling 7 days from today. No swipe, no arrows, no week header.
2. Every day-block shows a Dinner row whether planned or not. The empty Dinner row shows `Plan dinner ›` in accent-ink with a chevron.
3. Breakfast / Lunch / Snack / School slots render only when populated for the day.
4. Planned slot rows show a 32×32 thumbnail (recipe imageUrl or 🍴 placeholder) on the leading edge.
5. Today's day-header has `--accent-soft` background and shows the TODAY pill. Other day-headers use surface colors.
6. Day-header right side has a `+` button that opens Plan-a-meal with the slot picker open and no slot pre-selected.
7. Magic-wand icon appears on the Kitchen tabs row, right-aligned, opening the Kitchen AI Tools sheet.
8. AI Tools sheet shows SCHOOL LUNCH section with four actions (Take photo, From gallery, Upload file, iCal feed) and a `(coming soon)` RECIPES placeholder.
9. Photo / gallery / file actions reuse the existing `schoolLunch` Worker handler and the existing confirm-row pattern.
10. iCal feed sub-sheet supports adding a per-person feed URL, manual sync-now, and surfaces last sync + conflicts.
11. iCal sync respects existing manual / photo entries — never overwrites them; writes to school-lunch-2 or surfaces a conflict.
12. Slot labels read `SCHOOL` when only one school slot is planned for a day, and `SCHOOL 1` / `SCHOOL 2` when both are.
13. Plan-a-meal's slot picker includes `School` and auto-allocates between `school-lunch` and `school-lunch-2`.
14. When School slot is selected and a meal is chosen, a `+ Plan a second School option` row appears; tapping it stacks a second meal-select; save writes both selections.
15. The Admin school-lunch import block is removed; no orphan imports remain.
16. Service worker cache name is bumped.
17. No regressions to Recipes or Lists tabs (visual spot-check at 412×915 per CLAUDE.md).

---

## 10. Open questions (none currently)

All design questions resolved during brainstorming. If implementation surfaces ambiguity, fall back to the principles: dinner-default-only nudge, dashboard-aligned visual language, no scope creep into other tabs.
