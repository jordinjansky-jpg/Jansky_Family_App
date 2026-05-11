# Kitchen New Features Spec

**Date:** 2026-05-11
**Status:** Approved design — implementation pending
**Sub-project:** 4 of 4 in the Kitchen UI/UX program
**Scope:** Six net-new Kitchen features layered on top of sub-projects 1–3.

## Why this spec exists

Sub-projects 1–3 redesign the existing Kitchen surfaces. This sub-project adds the meaningful new capabilities that make Kitchen feel less like a meal-list and more like a real family hub: an actual cooking surface (Cook mode), an "what did we eat?" view (Meal history), AI-driven recipe discovery, a shareable list link for non-family helpers, recipe-URL deduplication, and multi-option meal voting for households that plan democratically.

## Goals

1. Recipes become cookable in-app, not just plannable.
2. Past dinners are surface-able for "we just had that" reasoning.
3. Recipe library grows easily — paste-or-type ingredients you have on hand, get AI suggestions.
4. Shopping lists can be shared read-only with grandparents / babysitters / co-parents.
5. Pasting a duplicate recipe URL nudges the user to the existing version instead of silently creating a copy.
6. Families that vote on meals can plan 2–3 options per slot and tally per-person preference.

## Non-goals

- Pantry awareness (explicitly passed on the roadmap).
- Per-person recipe ratings (explicitly passed).
- Recipe step images / video steps in Cook mode — text-only steps for v1.
- Push notifications when a vote is cast (out of scope; covered by the Push Notifications roadmap item).
- Two-way sync of shared lists (the share URL is read-only by design).
- Auto-resolve voting (e.g., "winner locked after 2 votes") — manual lock-in only.

---

## 1. Cook mode

### Trigger
A new `Start cooking` button on the recipe detail sheet ([kitchen.js:752-755](kitchen.js#L752-L755)) alongside the existing `Add to list` and `Plan this meal` buttons. Order in the footer: `Start cooking` (primary) → `Plan this meal` → `Add to list`. Renders only when the recipe has at least one step (`steps[]` present OR `notes` non-empty).

### Step source
- A new optional `steps: string[]` field on the recipe (added to the recipe form as a `+ Add steps` disclosure chip).
- When `steps[]` is missing OR empty, fall back to splitting `recipe.notes` on `\n` and using non-empty lines as steps. This gives Cook mode something to work with even for recipes whose notes weren't curated as steps.
- `formatStepCount(recipe)` helper returns `0` when neither source yields a step.

### Cook-mode view
Renders as a **full-viewport** sheet (not a half-sheet) — uses `.cook-mode` container that overlays everything below the global header.

```
┌──────────────────────────────────────────┐
│ ←  Cook · Alfredo Chicken Bake       ✕  │  ← top bar
├──────────────────────────────────────────┤
│                                          │
│             Step 3 of 7                  │  ← progress text
│                                          │
│  Add chicken to the skillet and          │  ← current step
│  cook for 6–8 minutes, stirring          │     (large text)
│  until lightly browned.                  │
│                                          │
│  [ Show ingredients ]                    │  ← peek toggle
│                                          │
├──────────────────────────────────────────┤
│  ‹ Prev          ●●●○○○○         Next ›  │  ← dots + nav
└──────────────────────────────────────────┘
```

- **Step text** — large (`font-lg`+2), high-contrast, generous line-height.
- **Step count** — `Step N of M`.
- **Progress dots** — N circles, filled for completed/current, hollow for upcoming.
- **Show ingredients** — toggle that slides up a panel showing the current ingredients list. Tap again to dismiss. Helpful mid-cook when you need to double-check qty.
- **`‹ Prev` / `Next ›`** — disabled at boundaries.
- **`Done`** — replaces `Next ›` on the last step. Closes Cook mode, marks `recipe.lastUsed = now()`.
- **Close ✕** — abandons Cook mode without updating lastUsed.

### Wake-lock
On entry, `navigator.wakeLock.request('screen')` is invoked. If the browser denies or doesn't support it, silently continue (no toast, no warning). On exit, release the lock.

### Step parsing fallback (when notes is the source)
- Split `recipe.notes` by `\n`.
- Strip leading numbers/bullets per line: `1.`, `1)`, `-`, `•`, `*` followed by whitespace.
- Drop empty lines.
- Cap at 30 steps (defensive — most recipes have under 15).

---

## 2. Meal history

### Trigger
A new entry in the Kitchen Meals tab. A small `History ›` chip in the day-header row of the today block, or as a header-right action — chosen by visual weight at implementation time. Tap → opens the history sheet.

### Sheet content
```
┌──────────────────────────────────────────┐
│ Meal history                          ✕  │
├──────────────────────────────────────────┤
│ Last 30 days                            │
│                                          │
│ WEEK OF MAY 4                            │
│   Mon May 4   Beef Taco Pasta            │
│   Tue May 5   Spaghetti                  │
│   Wed May 6   —                          │
│   Thu May 7   Coconut Curry Chicken      │
│   …                                       │
│                                          │
│ WEEK OF APR 27                           │
│   …                                       │
└──────────────────────────────────────────┘
```

- **Scope** — Dinner slot only (the most-planned, most-historically-relevant slot).
- **Range** — Last 30 days from today.
- **Grouping** — By calendar week (Mon-anchored).
- **Empty days** — Show `—` (em-dash) for days with no dinner planned.
- **Tap a row with `recipeId`** — opens the existing `openRecipeDetailSheet` for that recipe.
- **Tap a row with `customName`** — shows a small toast with the entry's notes if any, or no-op.
- **Top hint** — `Last 30 days`. Could become a tappable dropdown in a future iteration; v1 is fixed.

### Data source
Reads from `rundown/kitchenPlan/{date}/dinner` for each date in the last 30 days. New `readKitchenPlanRange(startDate, endDate)` helper in [shared/firebase.js](shared/firebase.js).

### No new schema
Existing `kitchenPlan` data — nothing new to migrate.

---

## 3. AI "What can I make tonight?"

### Trigger
A new button in the AI Tools sheet's RECIPES section (alongside the three from sub-project 2):

```
RECIPES
  [Import from URL]   [Import from photo]
  [Find ideas online] [What can I make?]
```

### Sub-sheet
Tap → bottom sheet opens:

```
┌──────────────────────────────────────────┐
│ What can I make?                      ✕  │
├──────────────────────────────────────────┤
│ List what you have on hand               │
│ ┌──────────────────────────────────────┐ │
│ │ chicken thighs, rice, broccoli,      │ │
│ │ soy sauce, ginger                    │ │
│ └──────────────────────────────────────┘ │
│                                          │
│             [Suggest recipes]            │
└──────────────────────────────────────────┘
```

- Textarea, multi-line, autofocus.
- `[Suggest recipes]` button disabled until at least 2 words entered.
- On tap → calls new Worker handler `recipeSuggest` with the textarea contents.

### Suggestions view
```
┌──────────────────────────────────────────┐
│ ← Suggestions                         ✕  │
├──────────────────────────────────────────┤
│ Ginger Chicken Stir-Fry                  │
│ Quick weeknight stir-fry with broccoli  │
│ and ginger over rice. ~30 min.           │
│ Tags: Asian, quick, weeknight            │
│ [ Save to library ]                      │
│                                          │
│ Chicken Fried Rice                       │
│ One-pan rice + chicken thighs with soy. │
│ ~25 min.                                 │
│ Tags: Asian, quick, family-friendly      │
│ [ Save to library ]                      │
│                                          │
│ Sheet-pan Soy-Ginger Chicken             │
│ …                                        │
└──────────────────────────────────────────┘
```

- 3–5 suggestions per call (Worker decides).
- Each suggestion: name, 1–2-sentence description, suggested tags.
- `Save to library` → creates a new recipe with the name, description as `notes`, tags applied. Ingredients are **left empty** for the user to fill (Cook mode won't be available until they add steps).
- After save → close the suggestion sheet, return to the AI Tools sheet, optional toast `Saved to library`.

### Worker handler
New handler `recipeSuggest(input)` in [workers/kitchen-import.js](workers/kitchen-import.js). Input: `{ pantry: string }`. Output: `{ suggestions: [{ name, description, tags: [] }] }`. Uses Claude Haiku.

Cost: ~$0.001 per call (input is small, output is ~300 tokens).

---

## 4. Share-list URL

### Trigger
Overflow menu (the new sheet from sub-project 3 §2) gains a new option: `Share read-only link`. Position: between `Copy as text` and `Clear checked items`.

### Flow
1. Tap `Share read-only link` → if no token exists, generate one. Display a sheet:
```
┌──────────────────────────────────────────┐
│ Share Walmart                         ✕  │
├──────────────────────────────────────────┤
│ Anyone with this link can view (not edit)│
│ this list.                               │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ https://dashboard.jansky.app/        │ │
│ │ share-list.html?id=ABC&token=XYZ     │ │
│ └──────────────────────────────────────┘ │
│ [ Copy link ]   [ Open in new tab ]      │
│                                          │
│ [ Revoke link ]                          │
└──────────────────────────────────────────┘
```
2. Copy → `navigator.clipboard.writeText(url)` + toast `Link copied`.
3. Open in new tab → `window.open(url, '_blank')`.
4. Revoke → confirmation prompt → clear token. Next view of the sheet generates a fresh one.

### Schema
New per-list field:
```
rundown/kitchenLists/{listId}/shareToken: {
  token:     string,      // 20-char alphanumeric
  createdAt: number,
  createdBy: string       // person ID
}
```
Field is omitted when no link has ever been generated.

### Public viewer page
New file: `share-list.html`. Loads `?id=<listId>&token=<token>` from query string.

- Validates: reads `rundown/kitchenLists/{listId}/shareToken/token`; renders the list **only** if the URL token matches.
- Token mismatch → renders `This link is no longer valid` placeholder.
- Renders: list name + icon + active items (with qty) + completed items (struck through, collapsed).
- No checkboxes (read-only). No FAB. No nav.
- Subtle `Shared from {familyAppName}` footer.
- Loads once at page-load; no live updates. User can pull-to-refresh or reload.

### Security
- Firebase rules **must be updated** to allow read of `rundown/kitchenLists/{listId}` (and its items) when the request includes a matching `token` parameter — implementation-time will use a Firebase rule that compares URL token to the stored token via a Cloudflare Worker proxy if rules can't enforce this directly. Out of scope for the spec to nail the exact rule; the implementation plan covers it.
- Tokens are 20 chars from `[a-zA-Z0-9]` (`Math.random` based; acceptable for the threat model — these links should not be shared on public surfaces).
- Revoking a link is the only way to invalidate; tokens don't auto-expire.

---

## 5. Recipe duplicate detection on URL import

### Trigger
On the recipe form, after the user types/pastes a URL into the `recipeUrl` field and blurs (or before Worker import fires).

### Match logic
- Normalize URL: lowercase scheme + host, strip trailing slash on path, strip query string and hash.
- Compare against `recipe.url` of every existing recipe in `recipes` state object (normalized the same way).
- If a match is found → prompt:
```
┌──────────────────────────────────────────┐
│ You already have a recipe for this link  │
├──────────────────────────────────────────┤
│ "Alfredo Chicken Bacon Ravioli Bake"     │
│ was added 14 days ago.                   │
│                                          │
│ [ Open existing ]   [ Save anyway ]      │
└──────────────────────────────────────────┘
```
- `Open existing` → close the recipe form, open the matched recipe in the detail sheet.
- `Save anyway` → dismiss prompt, continue with the form (URL import worker fires as usual).
- No match → silent, no prompt.

### Out of scope
- Fuzzy duplicate detection by name (different URL but same recipe name). Useful but error-prone — skipped for v1.
- Duplicate detection on photo import. Skipped — photo OCR results are too noisy to match against existing recipes reliably.

---

## 6. Multi-option meal voting

### Schema migration
`rundown/kitchenPlan/{date}/{slot}` changes from a single object to an **array of options**:
```
// before (existing)
{ recipeId: 'abc', source: 'manual' }

// after
[
  {
    recipeId:  'abc',     // or customName
    source:    'manual',
    addedBy:   'person-1',
    addedAt:   1715000000,
    votes:     { 'person-1': 1, 'person-2': 1 }     // per-person thumbs-up
  },
  {
    recipeId:  'def',
    source:    'manual',
    addedBy:   'person-1',
    addedAt:   1715000010,
    votes:     { 'person-3': 1 }
  }
]
```

### Lazy migration
- Existing single-object entries are read as `[entry]` arrays on load — a helper `normalizePlanSlot(raw)` wraps non-array values into single-element arrays.
- On first **write** to a slot that's still in object shape, write the array shape instead. No bulk migration job; per-slot drift heals on use.
- `writeKitchenPlanSlot(date, slot, data)` is updated to always write array shape.

### UI changes

**Default planning** (single option):
- Plan-a-meal sheet is unchanged from sub-projects 1–2 when adding the first option for a slot. Save behaves as today; the slot just contains an array of one.

**Adding a second option:**
- Slot-edit sheet (`openSlotEditSheet`) gains a `+ Add another option` chip when the slot has 1–2 options. Tap → opens Plan-a-meal in "add another" mode (saves an additional element to the array, not a replacement).
- Maximum 3 options per slot (UI hard cap; protects against runaway voting UI).

**Slot-edit sheet (multi-option):**
```
┌──────────────────────────────────────────┐
│ Dinner · Wed May 13                   ✕  │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ Alfredo Chicken Bake     🏆 winner   │ │
│ │ 👍 Jordin · Samantha     [vote 👍]   │ │
│ │ [Lock in]   [Remove]                 │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ Beef Taco Pasta                      │ │
│ │ 👍 Lexi                  [vote 👍]   │ │
│ │ [Lock in]   [Remove]                 │ │
│ └──────────────────────────────────────┘ │
│ [ + Add another option ]                 │
└──────────────────────────────────────────┘
```

- Each option-card shows: name, vote chips (people who voted up), a `vote 👍` button (toggles current viewer's vote), and `Lock in` + `Remove`.
- `🏆 winner` badge auto-applied to the option with the most votes (tie → earliest added wins).
- `Lock in` → converts the array back to a single-object entry in the schema (deletes the other options). Closes the sheet.
- `Remove` → removes that option from the array. If array length drops to 1, the multi-option UI collapses on next render to the single-option detail view.

**Single-option slot-edit (unchanged):**
- When the array has only 1 option, the existing single-option layout renders (recipe name + "Change meal" / "Remove" / "Add to list"). Existing UX preserved for the most-common case.

### Person identity for voting
The "current viewer" — whose vote toggles when `vote 👍` is tapped — comes from:
1. `linkedPerson` if in person-link mode (`?person=Name`).
2. Otherwise, prompt to pick "Who's voting?" on first tap (sheet of family members); cache the choice in `sessionStorage` for the session.

This is light-touch — voting is opt-in by family.

### Auto-resolve
**None in v1.** Manual `Lock in` only.

### Backwards compatibility
The Meals tab day-block already iterates a slot's content to display the meal name — needs updating to handle the array shape: when array has 1 element, behavior is unchanged (display that element's name). When array has 2+, display the winner's name plus a small `+N` chip suffix (e.g., `Alfredo Chicken Bake +2`).

---

## 7. File-level impact

| File | Change |
|---|---|
| [kitchen.js](kitchen.js) | New `openCookModeSheet(recipe)` + cook-mode state machine. `openRecipeDetailSheet` adds `Start cooking` button. `openRecipeForm` adds `+ Add steps` disclosure chip + `steps[]` field. New `openMealHistorySheet()`. AI Tools sheet RECIPES section gains the fourth `What can I make?` button. New `openAiSuggestSheet()`. Overflow menu (sub-project 3) gains `Share read-only link` → `openShareListSheet()`. Recipe form gains URL blur handler for dup detection. `openPlanMealSheet`, `openSlotEditSheet`, `writeKitchenPlanSlot` updated for multi-option voting. `renderMealsTab` day-block updated for array-shape slot rendering. |
| [shared/firebase.js](shared/firebase.js) | New exports: `readKitchenPlanRange`, `writeKitchenListShareToken`, `removeKitchenListShareToken`. `writeKitchenPlanSlot` updated to always write array shape. |
| [shared/utils.js](shared/utils.js) | New helpers: `normalizePlanSlot(raw)`, `pickWinner(options)`, `parseSteps(notes)`, `generateShareToken()`. |
| [shared/ai-helpers.js](shared/ai-helpers.js) | New `renderRecipeSuggestionCard` if useful; otherwise local to kitchen.js. |
| [workers/kitchen-import.js](workers/kitchen-import.js) | New handler `recipeSuggest`. Reuses existing CORS + Claude Haiku patterns. |
| [share-list.html](share-list.html) | New file. Public read-only viewer. Minimal CSS via existing tokens. |
| [styles/kitchen.css](styles/kitchen.css) | Cook mode styles, meal history list, multi-option vote cards, share sheet. |
| Firebase rules | Update to allow `share-list.html` to read a list + its items when the URL token matches the stored token. (Tactical — covered by implementation plan.) |
| [sw.js](sw.js) | `CACHE_NAME` bump. New `share-list.html` added to the precache list. |

---

## 8. Acceptance criteria

### Cook mode
1. Recipe detail sheet shows a `Start cooking` primary button when the recipe has steps (from `steps[]` or parsed `notes`).
2. Tapping `Start cooking` enters a full-viewport cook-mode view with step text, step count, progress dots, Prev/Next, and Show ingredients toggle.
3. The screen wake-lock is requested on entry (silent on denial) and released on exit.
4. `Done` (last step's Next button) updates `recipe.lastUsed` to now and closes cook mode.
5. `Close ✕` exits without updating lastUsed.

### Meal history
6. Meals tab provides a `History ›` entry that opens the Meal history sheet.
7. The sheet shows last 30 days of dinner-slot data, grouped by week, with `—` for empty days.
8. Tapping a row with `recipeId` opens the recipe detail sheet.

### AI suggestions
9. AI Tools sheet RECIPES section has a fourth button `What can I make?`.
10. Tapping it opens a sub-sheet with a textarea and a `Suggest recipes` button that becomes enabled once ≥ 2 words are entered.
11. Worker `recipeSuggest` returns 3–5 suggestions rendered as cards with `Save to library` buttons.
12. Saving creates a new recipe with name, description as notes, and suggested tags; ingredients are empty for user fill-in.

### Share-list
13. Overflow menu has a `Share read-only link` entry.
14. Tapping it generates a token (if none exists) and shows the share sheet with copy, open-in-new-tab, and revoke actions.
15. `share-list.html?id=<id>&token=<token>` renders the list read-only when the token matches; renders an invalid-link placeholder otherwise.
16. Revoking the link makes the existing URL stop working immediately.

### Recipe dup detection
17. After the user pastes/types a URL into the recipe form's URL field and blurs the field, if the URL normalizes equal to an existing recipe's URL the form prompts `Open existing` / `Save anyway` before any Worker import fires.
18. `Open existing` closes the form and opens the matched recipe in the detail sheet.

### Multi-option meal voting
19. `kitchenPlan/{date}/{slot}` writes always use array shape; existing single-object entries are read transparently as one-element arrays.
20. Slot-edit for a single-option slot renders unchanged from sub-projects 1–2.
21. Slot-edit for a multi-option slot renders one card per option with vote chips, vote button, Lock-in, and Remove.
22. Lock-in collapses the slot back to a single-object schema with the chosen option.
23. Meals tab day-block displays the winner's name for multi-option slots plus a `+N` chip suffix.
24. Maximum of 3 options per slot is enforced on `+ Add another option` (button disabled when 3 are present).

### General
25. Service worker cache name is bumped; `share-list.html` is in the precache list.
26. No regressions on Meals, Recipes, or Lists at 412×915 mobile viewport.

---

## 9. Open questions (none currently)

All design questions resolved during brainstorming. Implementation-time details (e.g., Firebase rule for share-list token validation) are deferred to the implementation plan.
