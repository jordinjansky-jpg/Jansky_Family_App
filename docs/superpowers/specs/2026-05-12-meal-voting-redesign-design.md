# Meal Voting Redesign — Spec

**Date:** 2026-05-12
**Status:** Design approved — implementation pending
**Predecessor:** [2026-05-11 Kitchen New Features](2026-05-11-kitchen-new-features.md) §6 (Multi-option meal voting)

## Why this spec exists

The 2026-05-11 spec shipped multi-option voting end-to-end: array-shape storage, lazy migration, vote tallies, lock-in, dashboard sub-line, and a slot-edit vote sheet. The machinery works. The **discoverability** does not:

- Creating a vote requires planning one meal, closing the sheet, reopening slot-edit, tapping `+ Add another option`, going through Plan-a-meal again — and repeating.
- An alternative path exists via an "occupied notice" toggle that appears only when you happen to pick an already-occupied slot. Easy to miss; doesn't feel like a feature.
- The dashboard tile shows the winner's name with a `Vote · N options` sub-line and routes to `kitchen.html` on tap — broad navigation, not a direct path to vote.
- The school slot has its own special dual-pick UX baked into Plan-a-meal that doesn't generalize.

The fix is to **make voting a first-class mode of Plan-a-meal**, surface vote state with a single consistent indicator across the app, and route taps directly to the vote sheet.

## Goals

1. Setting up a vote takes one trip through Plan-a-meal — pick all candidates in the same sheet, save once.
2. Vote state is recognizable at a glance from any slot summary, with one consistent visual.
3. Tapping a voting slot from anywhere goes straight to the vote sheet — no navigational detour.
4. School slot's existing dual-pick UX stays untouched — risk avoidance over consolidation.

## Non-goals

- Changing the storage shape, lazy migration, vote tally model, or winner-picking logic — all already shipped and working.
- Adding per-option preference weights or ranked-choice voting — thumbs-up tally stays.
- Auto-locking a winner after N votes — manual lock-in only (unchanged from the existing spec's non-goal).
- Push notifications when a vote is cast — out of scope.

---

## 1. Plan-a-meal sheet — Single / Vote toggle

### Top of sheet

A segmented control replaces the implicit "you can only pick one" model:

```
┌──────────────────────────────────────────┐
│ Plan a meal                          ✕  │
├──────────────────────────────────────────┤
│  [ Single meal ]   [ Set up a vote ]    │  ← segmented control
├──────────────────────────────────────────┤
│  Day:  Wed May 13                        │
│  Slot: [Breakfast][Lunch][Dinner][Snack] │
└──────────────────────────────────────────┘
```

- Default mode: **Single meal** (matches the 90% case).
- Switching to **Set up a vote** swaps the meal-picker section for a vote-builder (below).
- Switching back to Single discards any in-progress vote candidates, with no warning toast (the candidates aren't persisted until Save). If we discover this is jarring during implementation, an inline `← Back to one meal · 2 candidates will be cleared` link can be added — out of scope unless friction shows up.

### Single mode

Unchanged from today: one date picker, one slot picker, one meal-picker (search + list), one Save button. Behavior parity with current `openPlanMealSheet`.

### Vote mode

The meal section is replaced with a stack of **candidate rows**:

```
┌──────────────────────────────────────────┐
│  Candidates (max 3):                     │
│                                          │
│  Option 1                          [×]   │
│  [ Tacos                              ▾] │
│                                          │
│  Option 2                          [×]   │
│  [ Choose a meal…                     ▾] │
│                                          │
│  [ + Add option 3 ]                      │
└──────────────────────────────────────────┘
```

- **Starts with 2 empty candidate rows** when entering Vote mode from scratch.
- Each row is a self-contained meal picker: same search input + recipe list + custom-typed-name fallback as the Single-mode picker. Tapping the row collapses it; another tap expands. Only one row's dropdown is open at a time.
- `+ Add option 3` chip appears when both row 1 and row 2 have a selection. Tapping adds a third row. After 3, the chip hides (hard cap from existing spec).
- `[×]` on a row removes that candidate. Removing leaves rows 1 and 2 minimum; the × is hidden on the row when there are only 2 rows total and one is empty (you can't drop below 2 in Vote mode).
- **Saving with only 1 row filled in Vote mode** is allowed and silently degrades to a single-meal save. No "you need 2 candidates" gate — if the user changes their mind mid-flow, just save what they picked. Storage stays array-shape (length 1).

### Pre-population when opened from an existing slot

- **Empty slot + Plan a meal**: opens in Single mode with no pre-selection (today's behavior).
- **Existing single-meal slot + tap to edit**: opens in Single mode with that meal pre-selected (today's behavior). Toggling to Vote mode pre-fills row 1 with the existing meal and leaves row 2 empty.
- **Existing voting slot + tap to edit**: this goes through the Slot-edit vote sheet, not Plan-a-meal (see §3). Plan-a-meal isn't an entry point for in-progress votes.

### School slot — unchanged

School keeps its existing dual-pick UX entirely as-is. The `kp_addSecond` / "Plan a second School option" branch stays. The Single / Vote segmented control **does not appear** when School is the selected slot — School is its own thing (two real slot keys: `school-lunch` and `school-lunch-2`, not one slot with multiple options) and folding it into Vote mode would conflate "plan both school meals for the day" with "vote on what to eat." Keeping school separate avoids confusion and risk of regression in the auto-allocation logic.

Implementation: when the slot picker selects School, the Single/Vote toggle is hidden and the existing school flow renders unchanged.

### Removal of the occupied-notice toggle

The current `kp_occupiedNotice` block (which shows `Already planned: X / Save as another option for voting` with a checkbox toggle) is **removed**. Its job — adding a second option to an occupied slot — is now done explicitly via Vote mode. If the user picks a slot that's already occupied:

- **Slot has 1 meal**: the meal-picker shows that meal as pre-selected; saving replaces it. To add a second option, the user toggles to Vote mode. Row 1 pre-fills with the existing meal.
- **Slot has 2-3 voting options**: Plan-a-meal redirects to the Slot-edit vote sheet (§3) instead of opening on top. A one-shot toast explains: `This slot has a vote in progress — opening vote sheet.`

---

## 2. Display rules — one consistent voting indicator

Wherever a slot's content is summarized, voting state replaces the per-option name list with a single consistent indicator.

### Rule

- **0 options (empty)**: existing empty-state copy (unchanged).
- **1 option**: meal name (unchanged).
- **2 or 3 options**: `Vote · N options` where N is the count.

No more `Vote · Tacos vs Pizza`, no per-option preview. Recipe names are routinely too long to fit even one name on a phone tile; trying to show two reliably degrades to clutter.

### Surfaces

- **Dashboard dinner tile**: today's dinner row. Sub-line currently reads `👍 Vote · 2 options` — keep the thumbs-up glyph, change the format to `Vote · N options`. The tile's main `value` line shows `Tonight's dinner` (or similar generic copy) instead of the winner's name when in voting state. This is a behavior change — today the tile shows the current winner. Spec choice: hide the winner until voting is locked, to keep all surfaces consistent. (If the user wants to see "current leader" we can add it back as an explicit feature — flagged as a follow-up consideration, not in this spec.)
- **Meals tab slot row** (kitchen.js Meals tab, per-day per-slot rows): shows `Vote · N options` instead of any individual option name. Thumbnail slot is replaced with a generic vote glyph (existing thumbs-up icon).
- **Calendar day sheet meals section** (calendar.html): same rule — `Vote · N options` per voting slot.

### What gets hidden

- Per-option names in the slot summary across the app (dashboard, meals tab, calendar).
- The "current winner" indicator in non-vote-sheet surfaces. Winners are only visible inside the vote sheet itself.

### What stays visible

- The slot's date/time/label (Dinner, Lunch, etc.).
- Inside the vote sheet, all option names with their vote counts and the crown on the current leader.

---

## 3. Vote sheet — direct entry from any voting summary

The existing `openSlotEditSheet` multi-option view (vote cards, thumbs-up, lock-in, remove, add-another) is the **single canonical voting surface**. No new sheet, no new component — just expand who opens it.

### Entry points

| Surface | Today | After this spec |
|---|---|---|
| Dashboard dinner tile (voting) | Routes to `kitchen.html` | Opens vote sheet inline on dashboard |
| Meals tab slot row (voting) | Opens vote sheet | Unchanged |
| Calendar day sheet meals (voting) | No direct vote entry — must navigate to Kitchen | Opens vote sheet inline on calendar |

### Implementation note

The vote-sheet renderer must be callable from any page (dashboard, calendar, kitchen). It currently lives inside `openSlotEditSheet` in kitchen.js with kitchen-page-local dependencies (`planCache`, `recipes`, `people`, `renderMealsTab`). To call it from dashboard/calendar, extract the multi-option branch into a shared opener in `shared/components.js` that accepts:

- `dk` (date key), `slot`
- `options[]` (the array)
- `recipes` (lookup)
- `people` (for voter chips)
- `currentViewerId` (or a fallback prompt)
- `onChange(newOptions)` callback — invoked after each vote toggle / lock-in / remove, so the caller can update its own cache and re-render.

The Kitchen page wraps this and threads `planCache` updates + `renderMealsTab()`. Dashboard wraps it and re-renders the dashboard tile via `loadData() + render()`. Calendar does the same with its day sheet.

### Polish to the existing vote sheet (minor)

- Sheet header shows `Vote — {Slot} · {Day}` (was `Dinner · Wed May 13` — adds the word "Vote" so the surface self-labels).
- The `+ Add another option` chip becomes a primary call-to-action when there are only 2 options (mild visual lift — promotes it from afterthought to legitimate next step).
- `Lock in` button shows confirm dialog (`showConfirm`) before committing — voting feels like a group decision, accidental lock-in is annoying. Confirm copy: `Lock in {Meal name}? Other options will be removed.`
- `Remove` continues to be unconfirmed (low-cost mistake — they can re-add).

---

## 4. Cleanup

Removed code paths once this ships:

- `kp_occupiedNotice` block in `openPlanMealSheet` (and its CSS).
- `appendMode` option on `openPlanMealSheet` — slot-edit's `+ Add another option` opens Plan-a-meal in Vote mode with existing options pre-loaded instead of using a hidden flag.

Kept as-is (do not touch):

- `kp_addSecond` / "Plan a second School option" branch — School slot stays on its existing flow, unrelated to general voting.

What stays:

- `normalizePlanSlot`, `pickWinner`, array-shape writes — all working as designed.
- Lazy migration on read — unchanged.
- Vote tally model (`votes: { [personId]: 1 }`) — unchanged.

---

## 5. Edge cases and decisions

| Case | Decision |
|---|---|
| Save in Vote mode with only 1 candidate filled | Save as single-meal (array of 1). No gate. |
| Save in Vote mode with 0 candidates filled | Save button is disabled (existing pattern). |
| Toggle Vote → Single with 2-3 candidates | Discard candidates silently. Row 1's candidate becomes the single-mode pick if filled. |
| Open Plan-a-meal on a slot with 2-3 existing options | Redirect to vote sheet. Toast: `This slot has a vote in progress — opening vote sheet.` |
| User taps `+ Add another option` in vote sheet | Opens Plan-a-meal in Vote mode, with all existing options pre-loaded into rows, plus one empty row appended. User can edit any row. |
| User locks in a winner from vote sheet | Existing behavior: `writeKitchenPlanSlot(dk, slot, [winner])`, toast `Winner locked in`. Now gated by `showConfirm`. |
| Custom-name meal (typed-not-saved) as a vote candidate | Supported. Stored as `{ customName: '...', votes: {...} }`. Already handled by `normalizePlanSlot`. |
| `linkedPerson` (PWA person shortcut) voting | Their ID is the voter ID — no "who's voting?" prompt. Existing behavior. |
| Voter prompt when not linkedPerson and no cached voter ID | Existing `openWhoVotesPrompt` flow — unchanged. |

---

## 6. Implementation surface

Files touched (estimate, refined in implementation plan):

- `kitchen.js` — `openPlanMealSheet` rewrite (segmented control, vote-mode candidate rows, school folding); Meals tab slot row rendering uses new display rule.
- `dashboard.js` — dinner tile: hide winner name in vote state; tap routes to vote sheet (not `kitchen.html`).
- `shared/components.js` — extract `openVoteSheet({ dk, slot, options, recipes, people, viewerId, onChange })` from the multi-option branch of `openSlotEditSheet`. Both kitchen.js and dashboard.js call this.
- `calendar.html` — day-sheet meals rendering uses new display rule; voting taps open the new shared vote sheet.
- `styles/kitchen.css` — vote-mode candidate row styles; remove `.kp-occupied-notice-*` rules. `.kp-second-school` rules stay (school flow unchanged).
- `styles/dashboard.css` — minor sub-line tweak if existing CSS doesn't already match.
- `docs/DESIGN.md` §6.10 — update Kitchen Plan-a-meal description; add a §6.10.x "Voting" sub-section documenting the indicator and entry points.

No schema changes. No new Firebase paths. No Worker changes.

---

## 7. Out of scope (deferred to follow-up)

- Showing the current leader's name on the dashboard tile in vote state (e.g., `Vote · 3 options · Tacos leading`). Could be a useful add but adds clutter and isn't requested.
- Per-option photos in the vote sheet (vote cards currently show name + votes only). Would help recognition for similarly-named meals; tracked as future polish.
- Vote history / who-voted-when. Not requested; storage is current-state only.
- Surfacing voting state on the kid page. Kids shouldn't be able to vote in this iteration (admin/family decision); leaving kid page unchanged.
