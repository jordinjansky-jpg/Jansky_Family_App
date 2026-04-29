# Kitchen — Meal Planning & Shopping Lists
## Design Spec · 2026-04-26

> Replaces backlog items **1.3 Meal Planning** (extends it) and **1.7 Shopping Lists** (supersedes it).
> Single source of truth for the Kitchen feature. Read before designing, building, or reviewing anything in this area.

---

## 1. Purpose & Positioning

Kitchen is a unified family hub for meal planning and shopping. It is not a grocery app — it is a **general-purpose shopping list** that happens to have a meal planning connection. Lists contain food, household supplies, toys, one-offs, anything. The meal→shopping workflow is one input method, not the identity of the feature.

**The core value:** plan meals for the week → ingredients land in your shopping list → family shops from a shared, real-time list. This is the workflow that makes Skylight Calendar 2's headline feature and the reason AnyList commands loyalty. Without the connection between planning and shopping, each half is just a notepad.

**Nav placement:** Kitchen lives in the More sheet on phone (alongside Admin, Calendar, Theme). It is NOT a tab slot. After Shopping and Activities are both built, usage patterns will determine whether either earns a tab slot. No premature promotion.

**Kiosk:** Kitchen's kiosk appearance is deferred to the 1.5 Kiosk build per the user's explicit decision (2026-04-26). The More menu tile in kiosk is reserved but not implemented in this build.

**Kid mode:** Explicitly out of scope for this build. Kids currently see dinner via the dashboard ambient strip (1.3 wiring). No new kid surfaces in this build.

---

## 2. Feature-Home Map Updates

| Feature | Primary home | Change |
|---|---|---|
| **Kitchen (meals + shopping)** | `kitchen.html` | New — replaces 1.3 Admin Meals tab + supersedes 1.7 Shopping |
| Meals (read-only ambient) | Dashboard ambient strip | Unchanged — reads from `kitchen/plan/` |
| Meals (calendar day view) | Calendar day view | Unchanged — reads from `kitchen/plan/` |
| Kid dinner tile | Dashboard ambient strip | Unchanged |

**Admin change:** Admin → Library → Meals tab is removed. All meal management moves to Kitchen. No other Admin sections are affected.

---

## 3. Firebase Schema

New root node: `rundown/kitchen/`. No migration needed — existing `mealLibrary/` and `meals/` nodes have no real data and are abandoned (user confirmed).

```
rundown/kitchen/
│
├── recipes/
│   └── {pushId}          ← {
│                              name,               (required)
│                              url?,               (recipe or TikTok URL)
│                              source,             ('manual'|'url'|'tiktok'|'screenshot')
│                              ingredients: [      (optional array)
│                                { name }          (name only — no quantity field)
│                              ],
│                              servings?,          (set by URL import only, never asked manually)
│                              isFavorite,
│                              createdAt,
│                              lastUsed
│                            }
│
├── plan/
│   └── {YYYY-MM-DD}/
│       └── {slot}        ← {
│                              recipeId?,          (null = custom name with no library entry)
│                              customName?,        (used when recipeId is null)
│                              source              ('manual'|'school')
│                            }
│                            slot values (display order):
│                            'breakfast' | 'lunch' | 'school-lunch' | 'dinner' | 'snack'
│
├── lists/
│   └── {pushId}          ← { name, sortOrder, createdAt }
│
├── items/
│   └── {listId}/
│       └── {pushId}      ← {
│                              name,               (required — quantity in name if needed, e.g. "milk x2")
│                              checked,
│                              checkedAt?,
│                              category?,          (set by Claude after add, nullable → renders as "Other")
│                              addedAt
│                            }
│
└── staples/
    └── {pushId}          ← { name, category? }
```

**Schema rules:**
- `rundown/kitchen/` is the only path this feature touches. Never write to the old `mealLibrary/` or `meals/` paths.
- `category` on items is set asynchronously by the Cloudflare Worker after the item is added. Items render immediately under "Other" and move to their real category within ~1 second. Never block the add on categorization.
- `school-lunch` slot has `source: 'school'` when populated by the 2.3 PDF import. Manual school lunch entries use `source: 'manual'`.
- `servings` is stored when extracted by URL import but never shown or required in any form.

---

## 4. Page Layout — Phone

### Shell (`kitchen.html`)
Identical structure to `rewards.html`:
```html
<div id="bannerMount"></div>
<div id="headerMount"></div>
<div class="page-content" id="app">
  <div id="kitchenTabsMount"></div>
  <div id="kitchenContent"></div>
</div>
<div id="fabMount"></div>
<div id="navMount"></div>
<div id="sheetMount"></div>
<div id="toastMount"></div>
```

### Header
`Kitchen` title, bell icon, overflow (⋯). No subtitle. Standard v2 header pattern.

### Tabs
`.tabs.tabs--pill.tabs--md` with two items: **Meals** | **Lists**.
Tab state persists in `localStorage['dr-kitchen-tab']` so returning to the page restores where you were.

### Bottom nav
Standard 4-slot nav, no active tab highlighted (Kitchen is not a tab slot). More button functional.

### Theme
Two-phase load — mandatory, not optional:
1. `loadDeviceTheme()` from `shared/theme.js` on first paint (localStorage cache → instant).
2. Await Firebase `readSettings()` → `applyTheme(settings.theme)` before rendering content.
This is the same fix applied to `rewards.js` after the theme-mismatch bug (2026-04-26). Do not skip step 2.

---

## 5. Meals Tab

### Week strip
- Swipe left/right to navigate weeks (no chevron arrows — same pattern as dashboard).
- Defaults to current week, always Mon–Sun (fixed — `settings.weekStart` is not yet a configurable setting).
- Each day shows **only planned slots** — empty slots take no space.
- Planned slot display order: Breakfast → Lunch → School Lunch → Dinner → Snack.
- Empty day: single muted `+ Plan something` tap target.
- Days are date-labelled (`Mon 26`, `Tue 27`, etc.). Today gets a subtle `Today` pill.

### Tapping a planned meal
Opens recipe detail sheet (§7).

### Tapping `+ Plan something` on an empty day
Opens add-meal sheet (pre-filled with that day).

### Add-meal sheet
Minimal — two fields, both pre-filled:
```
Sheet: Plan a meal
──────────────────
Day    [ Monday ▾ ]     ← pre-filled from tapped day, changeable
Slot   [ Dinner  ▾ ]    ← pre-filled from tapped slot, changeable
Meal   [______________]  ← text + autocomplete from recipe library

       [ Cancel ]  [ Save ]
```
- If typed name matches a library recipe → `recipeId` is set on save.
- If name is new → saves as `customName` with no `recipeId`. Recipe can be created separately.
- No other fields. No notes, no time, no category.

### Recipe library (below week strip)
- Flat `.card` list: recipe name + ingredient count + URL indicator icon (if URL exists).
- Empty state: `renderEmptyState` with variant `no-recipes` + "Add your first recipe" CTA + "Find recipe ideas" button.
- Tap card → recipe detail sheet.
- FAB (Meals tab): opens a choice sheet — "Plan a meal" | "Add recipe".

### Find recipe ideas sheet
Curated list of free recipe sites that parse cleanly with URL import:
- AllRecipes
- Budget Bytes
- Food Network
- Tasty
- Pinch of Yum
- Simply Recipes
- Delish
- The Kitchn

Small note below the list: *"These sites work great with URL import."* Tap any → opens in browser. No paywalled sites (NYT Cooking excluded).

---

## 6. Lists Tab

### List switcher
Horizontal scrolling pill tabs: `Grocery  Costco  [custom]  +`
- Tap `+` → sheet with a single name field. Save creates list, switches to it.
- A `⋯` icon button sits to the right of the tab row. Tap it → sheet with options: Rename, Delete for the active list. (Long-press on tabs is not used — not an established gesture in this app.)
- Delete requires `showConfirm()` if the list has items ("Delete Grocery? It has 12 items.").
- Active list persists in `localStorage['dr-kitchen-active-list']`.

### Adding an item
FAB tap → inline text field pinned to the top of the list (no sheet):
```
[ What do you need?             ]
```
- Press return → item added, field clears, ready for next item.
- Tap anywhere else → dismiss.
- Item appears immediately under "Other". Claude categorizes asynchronously; item moves to correct category group within ~1 second.
- Never block the add on categorization.

### List view
```
  [ Staples ]                      ← button, opens staples sheet

  PRODUCE
  ○  Apples
  ○  Bananas

  HOUSEHOLD
  ○  Paper towels
  ○  Dish soap

  OTHER
  ○  Legos

  ─────────────────────────────────
  ✓  Milk                           ← checked items: muted, strikethrough, sink here
  ✓  Eggs
```
- Categories rendered as uppercase section headers (`.card__section-label` pattern).
- Tap item circle → checked immediately, item sinks to bottom of list.
- "Other" section shows for any item Claude couldn't categorize confidently.
- Empty list: `renderEmptyState` with variant `list-empty` + "Add your first item" CTA + "Add from staples" secondary CTA.

### Staples sheet
- Opens from the `[ Staples ]` button above the list.
- Items shown as chips — tap any chip to add to the active list instantly.
- `+` in the sheet → inline name field, same pattern as list item add.
- Long-press a staple chip → delete option.
- Empty state: "Save items you buy every week."

### Overflow menu (⋯ in page header)
- **Copy list as text** → native OS share sheet with formatted text:
  ```
  Grocery — Apr 26
  □ Apples
  □ Bananas
  □ Paper towels
  □ Legos
  ```
- **Clear checked items** → removes all checked items (with `showConfirm`).
- **Delete list** → `showConfirm`, then deletes list + all its items.

### Walmart workflow
No direct API integration (Walmart has no public add-to-cart API for third-party apps). The "Copy list as text" share sheet covers the workflow — paste into Walmart's grocery app text entry. A "Search on Walmart" option in overflow opens `walmart.com/search?q={first unchecked item}` for item-level lookups.

---

## 7. Recipe Detail Sheet

Opens from: tapping a recipe card in the library, or tapping a planned meal in the week strip.

```
Sheet: Pasta Night
──────────────────
[ View recipe ↗ ]         ← only shown if URL exists, opens browser

Ingredients
  • Pasta
  • Ground beef
  • Tomato sauce
  [ + Add ingredient ]     ← inline add, same text-field pattern

[ Add ingredients to list ▾ ]  ← dropdown: pick which list
[ Plan this meal ]             ← opens add-meal sheet pre-filled

──────────────────
[ Edit ]   [ Delete ]
```

- "View recipe" button absent when no URL is set.
- "Add ingredients to list" is the core integration moment. Opens a list picker if multiple lists exist, adds all ingredients as items to the selected list, shows a toast "Added 3 items to Grocery". If the recipe has no ingredients saved, the button is disabled with a muted label "No ingredients — add some first".
- Editing a recipe opens the edit sheet (same as add sheet, pre-filled).
- Delete requires `showConfirm`.

---

## 8. Recipe Import Flow

All four paths populate the same add/edit recipe sheet. The user always reviews before saving — no silent writes.

### Manual (active at launch)
Type name, optionally add ingredients one at a time. Name is the only required field.

### URL import (built, inactive at launch)
User pastes a recipe URL. Cloudflare Worker fetches the page, parses Schema.org recipe markup, extracts name + ingredients + servings. Sheet pre-fills. User edits if needed, then saves.

### TikTok import (built, inactive at launch)
User pastes a TikTok URL. Worker hits `tiktok.com/oembed?url=...` (public API, within ToS), gets video description, passes to Claude to extract structured recipe content. If description has no recipe content, sheet opens with video title as name + empty ingredients. User fills in the rest manually.

### Screenshot import (built, inactive at launch)
User taps "Screenshot" → native file picker (photo library or camera). Image sent to Worker → Claude vision reads text from screen (ingredient list text overlays are common in food TikToks). Sheet pre-fills with extracted content.

### Import button states
All four buttons are present in the add-recipe sheet on day one. URL, TikTok, and Screenshot are visually disabled (not hidden) until flipped on. Disabled state communicates the future capability without misleading the user into thinking it works now.

### Cloudflare Worker (`workers/kitchen-import.js`)
Single worker. Accepts `POST { type: 'url'|'tiktok'|'screenshot'|'categorize', input: string|base64 }`. Returns `{ name, ingredients: [{name}], servings?, url? }` for recipe imports, or `{ category: string }` for categorization. Claude API key stored as a Worker secret — never in client code. Error responses return `{ error: string }` and the sheet shows an error state with a "Try manually" fallback.

The Worker endpoint URL is stored as a single constant in `kitchen.js` (`const KITCHEN_WORKER_URL = 'https://kitchen-import.<account>.workers.dev'`). It is never hardcoded elsewhere.

---

## 9. Auto-Categorization

When an item is added to a shopping list, `kitchen.js` fires a background request to the Cloudflare Worker with the item name. The Worker calls Claude (Haiku — cheapest model, adequate for this task) and returns a category string. `writeKitchenItem` is called again with the category set.

**Category set (Claude returns one of these):**
Produce, Dairy, Meat & Seafood, Bakery, Frozen, Pantry, Beverages, Snacks, Household, Personal Care, Baby & Kids, Pets, Clothing, Electronics, Toys, Other.

**Rules:**
- Item appears immediately on add (under "Other"). Category update is a background patch — never a blocker.
- If the Worker errors or times out, item stays as "Other" permanently. No retry, no user prompt.
- Staples get categorized on add to the staples library using the same flow.
- Cost: ~150 tokens per item at Haiku rates = ~$0.0001/item. Negligible.

---

## 10. Shared Module Changes

### `shared/firebase.js` additions
```js
// Recipes
readKitchenRecipes()          → one-shot read of kitchen/recipes/
pushKitchenRecipe(data)       → push to kitchen/recipes/
writeKitchenRecipe(id, data)  → set at kitchen/recipes/{id}
removeKitchenRecipe(id)       → remove kitchen/recipes/{id}

// Meal plan
readMealPlan(dateKey)         → one-shot read of kitchen/plan/{dateKey}
writeMealPlanSlot(dateKey, slot, data) → set at kitchen/plan/{dateKey}/{slot}
removeMealPlanSlot(dateKey, slot)      → remove kitchen/plan/{dateKey}/{slot}

// Lists
readKitchenLists()            → one-shot read of kitchen/lists/
pushKitchenList(data)         → push to kitchen/lists/
writeKitchenList(id, data)    → set at kitchen/lists/{id}
removeKitchenList(id)         → remove kitchen/lists/{id} + all kitchen/items/{id}/

// Items
readKitchenItems(listId)      → onValue listener on kitchen/items/{listId}
pushKitchenItem(listId, data) → push to kitchen/items/{listId}
writeKitchenItem(listId, id, data) → set at kitchen/items/{listId}/{id}
removeKitchenItem(listId, id) → remove kitchen/items/{listId}/{id}

// Staples
readKitchenStaples()          → one-shot read of kitchen/staples/
pushKitchenStaple(data)       → push to kitchen/staples/
removeKitchenStaple(id)       → remove kitchen/staples/{id}
```

### `shared/components.js`
- `initNavMore` updated to add Kitchen entry (alphabetical: Admin, Calendar, Kitchen, Theme).
- No new render functions — Kitchen uses existing `.card`, `.sheet`, `.tabs`, `.fab`, `.chip`, `renderEmptyState`, `renderErrorState`, `showConfirm` patterns.
- The `--shopping` card variant is already defined in the component catalog.

### New files
- `kitchen.html` — page shell
- `kitchen.js` — all Kitchen page logic (not a shared module)
- `styles/kitchen.css` — page-specific styles, loaded after `components.css`
- `workers/kitchen-import.js` — Cloudflare Worker (recipe URL parse, TikTok oEmbed, screenshot vision, auto-categorize)

### `sw.js`
Cache list updated: add `kitchen.html`, `kitchen.js`, `styles/kitchen.css`. Cache version bumped.

### Admin (`admin.html` / `admin.js`)
Meals library tab removed. No other Admin changes.

### Calendar (`calendar.js`)
Meal plan reads updated to pull from `rundown/kitchen/plan/` instead of `rundown/meals/`. Display logic unchanged.

### Dashboard (`dashboard.js`)
Ambient strip dinner chip reads updated to pull from `rundown/kitchen/plan/`. Display logic unchanged.

---

## 11. States

Every view ships all four states — no exceptions.

| View | Empty | Loading | Error | Success |
|---|---|---|---|---|
| Recipe library | `no-recipes` variant + Add CTA + Find Ideas | `skeleton-card-row` × 3 | `renderErrorState` + retry | Toast "Recipe saved" |
| Week strip | Each day shows `+ Plan something` | Skeleton day blocks | Error state in week area | Toast "Meal planned" |
| Shopping list | `list-empty` variant + Add + Staples CTAs | `skeleton-card-row` × 5 | `renderErrorState` + retry | Item appears immediately |
| Import sheet | — | Spinner in sheet while Worker runs | Inline error + "Try manually" | Sheet pre-fills |
| Staples sheet | "Save items you buy every week" | Skeleton chips | Inline error | Chip appears immediately |

---

## 12. Design Rules (Kitchen-specific)

- **Forms are minimal.** Name is the only required field everywhere. Every additional field is a dropout risk.
- **Never block on async.** Items and recipes appear in the UI immediately. Claude categorization and import parsing happen in the background.
- **Import buttons are present but disabled**, not hidden. Future capability is visible, current state is honest.
- **Shopping is general-purpose.** Never use the word "grocery" in UI copy. "Shopping list", "items", never "groceries".
- **No meal attribution on list items.** Items are flat — no "added for Taco Night" metadata.
- **Theme is mandatory.** Two-phase load (localStorage cache → Firebase). No shortcuts.
- **Swipe-only week navigation.** No chevron arrows. Matches dashboard pattern.
- **School lunch is display-only.** Never connected to shopping list. `source: 'school'` entries from 2.3 PDF import are read-only.
- **`showConfirm()` for all destructive actions.** No `window.confirm` / `window.alert`.
- **Free recipe sites only.** No paywalled sites in the Find Recipe Ideas sheet.

---

## 13. Out of Scope (this build)

- Kid mode Kitchen surfaces (kids see meals via existing dashboard ambient strip)
- Kiosk Kitchen layout (deferred to 1.5)
- Tablet two-pane layout (deferred)
- Recipe serving-size scaling UI (servings stored from import, no manual UI)
- Walmart API integration (no public API available; copy-as-text covers the workflow)
- Pantry / "what's in the fridge" feature
- Recipe URL import active (built, disabled — flip on in follow-up)
- TikTok import active (built, disabled — flip on in follow-up)
- Screenshot import active (built, disabled — flip on in follow-up)
- 2.3 school lunch PDF import (separate backlog item, `source: 'school'` slot already reserved)
