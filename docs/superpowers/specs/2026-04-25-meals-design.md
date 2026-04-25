# 1.3 Meal Planning — Design Spec

**Date:** 2026-04-25
**Status:** Approved (brainstorm complete, ready for implementation plan)
**Design source of truth:** [docs/DESIGN.md](../../DESIGN.md) §1 (Principles), §2 (Feature-home map), §5 (Components)
**Dashboard wiring spec:** [docs/superpowers/specs/2026-04-25-dashboard-final-design.md](2026-04-25-dashboard-final-design.md) §3.3 (Ambient strip)
**Related backlog:** 1.4 (Weather — ambient strip partner), 1.7 (Shopping list — ingredient consumer), 2.3 (School lunch PDF import — lunch slot source)

---

## 1. Goal

Give the Jansky family a simple way to track what they're eating. Two distinct actions: **building a meal library** (defining meals with ingredients, recipe links, and metadata) and **planning meals** (assigning library entries to day/slot slots). The planning flow is a single-sheet, fast action. The library is persistent and reusable across weeks.

This spec does not build a recipe database or a full nutrition tracker — it answers "what's for dinner?" at a glance and sets up shopping list integration (1.7) cleanly.

---

## 2. Architecture

### 2.1 Core concepts

**Meal Library** — the family's collection of named meals with full details. Creating a meal is about the meal itself, not when it's being eaten. Persists forever; grows organically.

**Meal Plan** — lightweight schedule assignments. Each entry is a day + slot → library reference. Creating a plan entry is a fast action: pick a day, pick a slot, pick a meal.

These two concepts are intentionally separate. Planning does not copy meal data — it references the library entry by ID. Editing a library entry propagates to all planned instances automatically (since the name/details are always resolved at render time, not at plan time).

### 2.2 Firebase schema

```
rundown/mealLibrary/{pushId}
  {
    name: string,                         // required
    ingredients: string[],                // free-text list, e.g. ["2 lbs ground beef", "1 onion"]
    url?: string,                         // recipe link
    notes?: string,                       // free text
    prepTime?: string,                    // free text, e.g. "30 min"
    isFavorite: boolean,                  // floats to top of picker
    tags: string[],                       // e.g. ["Mexican", "Quick", "Kid-friendly"]
    lastUsed: timestamp | null,           // updated each time it's planned
    createdAt: ServerValue.TIMESTAMP
  }

rundown/meals/{YYYY-MM-DD}/{slot}
  {
    mealId: string,                       // key into mealLibrary
    source?: 'manual' | 'school'          // default 'manual'; 'school' = read-only (backlog 2.3)
  }
```

**Slots:** `breakfast` | `lunch` | `dinner` | `snack`

### 2.3 School lunch seam (backlog 2.3)

School lunch PDF import (backlog 2.3) writes to `rundown/meals/{date}/lunch` with `source: 'school'`. These entries render distinctly (school icon, muted style) and are fully read-only — no edit, no delete affordance. This spec makes no other changes to accommodate 2.3; the seam is the `source` field.

### 2.4 Shopping list seam (backlog 1.7)

"Add to shopping list" on a planned meal will pull `mealLibrary/{mealId}.ingredients` as a pre-populated list. The free-text ingredient format is intentional — 1.7 can display them as-is without needing structured qty/unit parsing. No schema changes required when 1.7 ships.

### 2.5 New Firebase helpers

All added to `shared/firebase.js`:

| Function | Path | Operation |
|---|---|---|
| `readMeals(dateKey)` | `meals/{dateKey}` | one-shot read, all slots |
| `writeMeal(dateKey, slot, data)` | `meals/{dateKey}/{slot}` | set |
| `removeMeal(dateKey, slot)` | `meals/{dateKey}/{slot}` | remove |
| `readMealLibrary()` | `mealLibrary` | one-shot read, all entries |
| `pushMealLibrary(data)` | `mealLibrary` | push, returns key |
| `writeMealLibrary(id, data)` | `mealLibrary/{id}` | set |
| `removeMealLibrary(id)` | `mealLibrary/{id}` | remove |

---

## 3. Flows

### 3.1 Flow 1 — Planning a meal (primary everyday action)

**Entry points:**
- Dashboard FAB add menu → "Plan a meal" (pre-fills `viewDate` + dinner slot)
- Dashboard dinner chip, when not planned ("Not planned · Plan dinner") → same sheet, dinner + `viewDate`
- Calendar day view → add meal button per slot

**Implementation:** Single bottom sheet. No multi-step navigation.

**Sheet structure (top to bottom):**
1. **Date field** — date picker pre-filled with `viewDate`. User can change to plan ahead.
2. **Slot tabs** — Breakfast · Lunch · Dinner · Snack. Pre-selected by entry point context. Switching slots resets the search and shows the correct current assignment for that slot.
3. **Search input** — placeholder "Search meals…". Filters the library as the user types.
4. **Recents / favorites** — shown below the search input when no search text is entered. Favorites (isFavorite) float above recents (sorted by `lastUsed`). Displayed as tappable chips.
5. **Search results** — replaces recents/favorites when search text is present. Matching library entries as chips.
6. **"Create new meal"** — always visible at the bottom of the list. Expands the meal editor inline (§3.3) within the same sheet. Does not navigate away.

**Save:** writes `rundown/meals/{date}/{slot} = { mealId, source: 'manual' }`. Updates `mealLibrary/{mealId}.lastUsed`. Closes sheet. Dashboard re-renders with the new dinner chip value.

**Remove:** if a meal is already assigned to the selected slot, a muted "Remove" link appears below the slot tabs. Tap → `removeMeal(date, slot)` → close sheet.

**States:**
| State | Behavior |
|---|---|
| Loading library | Chip area shows skeleton rows |
| Empty library | "No meals yet. Create your first one." with "Create new meal" prominent |
| No search match | "No results for '[query]'" + "Create new meal" button |
| Populated | Chips + search as described |

---

### 3.2 Flow 2 — Meal detail (viewing a planned meal)

**Entry points:** tap dinner chip on dashboard (when planned), tap a meal card in calendar day view, tap kid mode Tonight tile.

**Sheet structure:**
- Meal name (large, `--font-xl`)
- Prep time chip (if set) — muted, left of name
- Tags chips (if any)
- Ingredients list — each as a simple row with a bullet. Empty if none.
- "Open recipe" button — primary action, only when `url` present. Opens new tab.
- Divider
- Secondary actions row: **Change meal** · **Edit meal** · **Remove from plan**

**Kid mode:** same sheet, secondary actions hidden entirely. "Open recipe" remains (kids can look at recipes).

**States:**
| State | Behavior |
|---|---|
| No URL | "Open recipe" button absent |
| No ingredients | Ingredients section absent (no "none listed" placeholder — calm) |
| No tags | Tags row absent |
| Source = school | "Remove from plan" and "Edit meal" hidden; a muted "Added from school lunch import" note in place of actions |

---

### 3.3 Flow 3 — Meal editor (create / edit library entry)

**Entry points:** "Create new meal" from planning sheet (inline expand), "Edit meal" from detail sheet, "Add meal" button in admin library, edit icon on an admin library row.

**Fields (all in one scrollable sheet):**

| Field | Type | Required |
|---|---|---|
| Name | text input | Yes |
| Favorite | toggle/star | No (default off) |
| Prep time | text input, placeholder "e.g. 30 min" | No |
| Tags | chip adder — type to add, tap chip to remove | No |
| Ingredients | text list — one per line, add/remove rows | No |
| Recipe URL | URL input | No |
| Notes | textarea | No |

**Save behavior:** `pushMealLibrary` (new) or `writeMealLibrary` (edit). On save from planning flow: also writes the plan entry and closes the outer planning sheet.

**Delete:** only available when editing an existing entry (not during create). Confirm modal: "Delete [meal name]? It will be removed from any planned days." On confirm: `removeMealLibrary(id)` + scan and `removeMeal` on all `meals/` entries that reference this `mealId`.

**States:**
| State | Behavior |
|---|---|
| Loading (edit) | Fields populate from library data |
| Validation error | Name field shows inline error |
| Save in progress | Save button shows spinner, disabled |

---

## 4. Surface integrations

### 4.1 Dashboard ambient strip

**Data fetch:** on every `render()`, read `rundown/meals/{viewDate}/dinner` via `readOnce` (not a persistent listener — meal plan data is not real-time critical and won't change mid-session). If entry exists, read `mealLibrary/{mealId}` to get `name` and `source`. Pass `dinnerData = { name, source }` to `renderAmbientStrip`.

**`viewDate`-aware:** when `viewDate` changes (swipe or Coming Up day-block tap), the dinner fetch re-runs for the new date.

**Interactions:**
- Tap chip, meal planned → Flow 2 meal detail sheet
- Tap chip, not planned → Flow 1 planning sheet, pre-filled dinner + `viewDate`

**Existing stub in `dashboard.js`:**
```js
const dinnerData = null; // Wired by 1.3.
```
This line is replaced with the live fetch.

**Ambient strip gate:** `settings.ambientStrip` remains off by default until both 1.3 and 1.4 ship. Users can manually enable it in admin to use the dinner chip alone before 1.4 ships.

### 4.2 Calendar day view (calendar.html)

A **Meals section** renders in the calendar day sheet, positioned above tasks and below events (consistent with DESIGN.md §6.1 task grouping rule that events come before tasks; meals are contextual like events).

**Rendering:**
- Only slots with a planned meal render a row — empty slots are silent (no per-slot empty state)
- Each row: `card--meal` variant — slot label muted on the right, meal name on the left
- School lunch rows (`source: 'school'`): muted background, school building icon replacing the slot label, no tap action leading to edit
- Tapping a meal row → Flow 2 meal detail sheet
- A quiet "+" icon at the end of the Meals section head opens Flow 1 planning sheet for that day

**States:**
| State | Behavior |
|---|---|
| No meals planned for day | Section head absent (fully silent) |
| Some slots planned | Only planned slots render |
| All planned | All four rows render |

### 4.3 Admin — Meal Library tab

New **"Meals"** tab in the admin navigation (alongside Tasks, People, Categories, etc.).

**List view:** each library entry as a list row:
- Meal name (bold)
- Muted meta: last used date · prep time (if set) · ingredient count
- Favorite star (filled if `isFavorite`)
- Trailing: edit icon · delete icon

**"Add meal" button** at top → Flow 3 meal editor sheet.

**Edit:** edit icon → Flow 3 meal editor pre-populated.

**Delete:** confirm modal as described in §3.3. Cascade removes all plan references.

**Empty state:** "No meals yet. Add your first one to get started." with "Add meal" button.

### 4.4 Admin — Settings

**Admin → Settings → Appearance → Display** gains:

```
[toggle] Ambient strip
Show weather and tonight's dinner on the dashboard.
```

Writes to `settings.ambientStrip`. Default off; admin can enable to see dinner chip before weather (1.4) ships.

### 4.5 Admin — People (kid profiles)

Each person row in admin, when that person has kid mode enabled, gains:

```
[toggle] Show tonight's dinner in kid mode
```

Writes to `people/{id}/prefs/showMeals`. Default true (opt-out rather than opt-in — the tile is calm and useful by default).

### 4.6 Kid mode

When `prefs.showMeals !== false` (default on):

- A quiet **"Tonight: [meal name]"** tile renders below the task list
- Tap → Flow 2 meal detail sheet (read-only — no secondary actions)
- When dinner is not planned: tile is hidden entirely (no nudge copy in kid mode — calm)
- When `prefs.showMeals === false`: tile absent

---

## 5. Component additions

### 5.1 `card--meal` variant

Added to `shared/components.js` and `styles/components.css`.

```html
<article class="card card--meal">
  <div class="card__body">
    <div class="card__title">{meal name}</div>
    <div class="card__meta">{prep time if set}</div>
  </div>
  <div class="card__trailing">
    <span class="card__slot-label">{slot label}</span>
  </div>
</article>
```

School variant adds `.card--meal--school` modifier: muted surface, school icon in leading slot instead of slot label, pointer-events none.

### 5.2 New sheet render functions in `shared/components.js`

- `renderMealPlanSheet({ date, slot, library, onSave, onRemove })` — Flow 1
- `renderMealDetailSheet({ meal, planEntry, onEdit, onChange, onRemove, readonly })` — Flow 2
- `renderMealEditorSheet({ meal, onSave, onDelete })` — Flow 3 (null meal = create mode)

All three follow the existing sheet DOM pattern (`sheet-backdrop` + `sheet` + `sheet__grab` + `sheet__header` + `sheet__content` + `sheet__footer`).

---

## 6. Files changed

| File | Change |
|---|---|
| `shared/firebase.js` | Add 7 meal CRUD helpers |
| `shared/components.js` | Add `renderMealPlanSheet`, `renderMealDetailSheet`, `renderMealEditorSheet`, `card--meal` render helper |
| `styles/components.css` | Add `.card--meal` and `.card--meal--school` styles |
| `dashboard.js` | Wire `dinnerData` from Firebase; add dinner chip tap handlers |
| `calendar.html` + `shared/calendar-views.js` | Add Meals section to day sheet |
| `admin.html` | Add Meals tab; add `ambientStrip` setting; add per-kid `showMeals` toggle |
| `kid.html` | Add Tonight tile; gate on `prefs.showMeals` |
| `sw.js` | Bump cache version |

---

## 7. Accessibility & states

Every new surface ships all four states per DESIGN.md §1 principle 5:

- **Loading:** skeleton chips in the meal picker; skeleton card in kid tonight tile
- **Empty:** per-surface empty states documented in §3 and §4
- **Error:** Firebase read failure → show `renderErrorState` in the sheet content area; chip shows "—" fallback
- **Populated:** as specced

Tap targets ≥ 44×44 on all interactive elements. Meal name in the detail sheet uses `--font-xl` (large text), so 3:1 contrast minimum applies. All new form fields follow the `.field` component pattern with label above, inline error below.

---

## 8. Out of scope for this PR

- **Drag-and-drop week planning** (quick-plan grid) — backlog note, future
- **School lunch PDF import** — backlog 2.3; seam is built, implementation is not
- **Shopping list integration** — backlog 1.7; seam is built (ingredients on library entry)
- **Weather chip wiring** — backlog 1.4; ambient strip renders dinner-only until 1.4 ships
- **Kiosk (`display.html`) meals** — backlog 1.5; kiosk is its own layout file
- **Per-slot admin enable/disable** — not needed; all 4 slots always available, empty slots are silent

---

## 9. Success criteria

1. "What's for dinner?" is answerable in one glance from the dashboard (when ambient strip is on).
2. Adding "Taco Tuesday" to Thursday takes under 5 taps after the first time it's been created.
3. The meal library grows organically — every planned meal is saved automatically.
4. School lunch entries (when 2.3 ships) render in the lunch slot with zero additional code changes.
5. Shopping list (when 1.7 ships) can read ingredients from `mealLibrary/{id}.ingredients` with zero schema changes.
6. All new surfaces have empty, loading, error, and populated states.
7. Kid tonight tile respects `prefs.showMeals` and the per-kid admin toggle.
