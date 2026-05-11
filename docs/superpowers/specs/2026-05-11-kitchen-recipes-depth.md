# Kitchen Recipes Tab — Depth Spec

**Date:** 2026-05-11
**Status:** Approved design — implementation pending
**Sub-project:** 2 of 5 in the Kitchen UI/UX program
**Scope:** Visual + interaction depth for the Recipes tab inside `kitchen.html`, plus completion of the AI Tools sheet's RECIPES section that was reserved in sub-project 1.

## Why this spec exists

The Recipes tab today is functional but visually thin: cards show only name + ingredient count, there's no search, the Filter & Sort sheet has two filters and two sorts, and "Find ideas online" is a low-value chip on the main tab. The recipe form already captures rich data (tags, prep time, cook time, difficulty, rating, last-cooked) that the library never surfaces. This sub-project lifts the library to surface that data and adds the search + filter depth needed once a family grows past ~20 recipes.

## Goals

1. Library cards visually communicate the recipe at a glance — thumbnail, rating, prep time, last-cooked.
2. Library is searchable in real time from a sticky top input.
3. Filter & Sort sheet expands to five filter dimensions and five sort modes using already-captured recipe data.
4. AI Tools sheet RECIPES section is wired up (URL import, photo import, Find ideas online drawer).
5. "Find ideas online" chip is removed from the Recipes tab — relocated to the AI Tools sheet.

## Non-goals (out of scope for this sub-project)

- Inline rename / long-press action sheet for cards. Status quo three-tap edit-form path is fine for the rare typo case.
- Recipe form changes (tag chip-input upgrade, image preview, name-above-link reorder) — all explicitly passed on the roadmap or out of scope here.
- AI ingredient-based suggestions ("what should we make tonight?") — sub-project 5.
- Recipe duplicate detection on URL import — sub-project 5.
- Cook mode — sub-project 5.
- Recipe detail sheet redesign — the existing detail sheet is the best UI in the tab per the review; no changes.

---

## 1. Library card

### Shape
Compact row with leading 56×56 thumbnail, name + chip line on the right, trailing favorite/link icons. Replaces the current two-line "name + ingredient count" pattern at [kitchen.js:362-377](kitchen.js#L362-L377).

```
┌─────────────────────────────────────────────────────────────┐
│ [thumb]  Alfredo Chicken Bacon Ravioli Bake                 │
│  56×56   ★★★★☆ · 30 min · cooked 3d ago            ☆   ↗   │
└─────────────────────────────────────────────────────────────┘
```

### Card content
- **Thumbnail (56×56, `--radius-md`)** on the leading edge.
  - `recipe.imageUrl` present → recipe thumbnail (`object-fit: cover`).
  - `recipe.imageUrl` missing → `--surface-2` square with centered 🍴 emoji glyph at ~24px. Matches placeholder language used elsewhere in the kitchen (see [kitchen.js:456](kitchen.js#L456)).
- **First line** — recipe name, `--text` weight 600, single line, ellipsis on overflow.
- **Second line — chip line**, in this order, separated by middle-dot `·`:
  1. **Rating** — 5 unicode star glyphs (`★★★★☆`) colored with `--accent` when filled, `--border` when empty. When `rating` is 0 or undefined, this chip slot renders the muted text `Not rated` instead of stars (the line still carries three chips for visual consistency).
  2. **Prep time** — verbatim `recipe.prepTime` string ("30 min"). Hidden if missing.
  3. **Last cooked** — `formatLastCooked(recipe.lastUsed)` (see §6). Always shown (renders "Never cooked" if missing — useful signal).
- **Trailing icons** — existing star (favorite toggle) + external-link arrow. Unchanged from current implementation at [kitchen.js:370-376](kitchen.js#L370-L376).

### Density
At 412 px viewport the card lands at ~84 px tall — denser than dashboard task cards (≈72 px) but justified by the richer content. Six cards visible per viewport before scroll; better than the current four.

### Tap behavior (unchanged)
- Tap card → existing `openRecipeDetailSheet`.
- Long-press card → existing `openRecipeForm` (full edit). Stays the way it is.
- Tap star → existing favorite toggle.
- Tap link icon → opens recipe URL in new tab.

---

## 2. Sticky search

A search input sits above the controls row at the top of the Recipes tab and remains sticky as the library scrolls.

```
┌─────────────────────────────────────┐  ← sticky from top of #kitchenContent
│ 🔍  Search recipes…              ✕  │
├─────────────────────────────────────┤
│ 14 recipes              Filter & Sort ▾│
├─────────────────────────────────────┤
│ [card]                              │
```

- Input is borderless `--surface` with subtle `--surface-2` background and `--border` 1px ring on focus. Leading magnifier glyph, trailing clear-`✕` (only renders when input has value).
- Real-time filtering: as the user types, the rendered library is filtered to `name.toLowerCase().includes(query.toLowerCase())`. Filter applies *on top of* the Filter & Sort selections (intersection, not replacement).
- When the query yields zero results, the empty state is rendered via `renderEmptyState` with title `No recipes match` and a `Clear search` button below. If a Filter & Sort selection is also active, the button reads `Clear search & filters`.
- Search query is **not persisted** across sessions — it's a transient filter, not a saved preference. Filter & Sort selections continue to persist via the existing `recipeFilter` state.

---

## 3. Controls row

The existing row at [kitchen.js:384-388](kitchen.js#L384-L388) is preserved with two changes:
- **`Find ideas online` chip is removed** — relocated to the AI Tools sheet (§5).
- **Recipe count** displays plain `14 recipes`. Unchanged.
- **`Filter & Sort` chip** retains current behavior (badge with `· N` when any filter active) but the count rule expands — see §4.

Result row:
```
14 recipes                                 Filter & Sort · 3 ▾
```

---

## 4. Filter & Sort sheet

Rebuilt to surface the data the recipe form already captures. Replaces the existing `openRecipeFilterSheet` ([kitchen.js:949](kitchen.js#L949)).

### Layout
```
Filter & Sort                                            ✕
───────────────────────────────────────────────────────────
SHOW
  [All]   [Favorites]   [Never cooked]

PREP TIME
  [Any]   [< 30 min]   [30–60 min]   [> 60 min]

DIFFICULTY
  [Any]   [Easy]   [Medium]   [Hard]

TAGS
  [Italian] [Quick] [Vegetarian] [Chicken] [Soup] [Pasta]
  (chips render from the union of all tag arrays in `recipes`)

SORT BY
  [A–Z]   [Recently added]   [Quickest first]
  [Last cooked]   [Highest rated]

───────────────────────────────────────────────────────────
[Cancel]                                            [Apply]
```

### Behavior per dimension

| Dimension | Default | Multi-select | Notes |
|---|---|---|---|
| Show | `All` | Single-select | `Never cooked` = `lastUsed` falsy. `Favorites` = `isFavorite === true`. |
| Prep time | `Any` | Single-select | Parsed via `formatPrepBucket` (§6). Buckets: `<30`, `30-60`, `>60`. Recipes with no/unparseable `prepTime` are excluded when a bucket is selected. |
| Difficulty | `Any` | Single-select | Matches `recipe.difficulty` string exactly. |
| Tags | (none selected) | **Multi-select** | Multiple selected tags = recipes that match ALL selected (AND). Chips are sourced from `Object.values(recipes).flatMap(r => r.tags || [])` deduplicated, alpha-sorted. If the library has zero tags the section renders a small muted hint `No tags yet — add tags from the recipe form.` |
| Sort by | `A–Z` | Single-select | Sort modes: `A–Z` (alpha on name), `Recently added` (createdAt desc), `Quickest first` (parsed prep minutes asc; unparseable last), `Last cooked` (lastUsed desc; never-cooked last), `Highest rated` (rating desc; unrated last). |

### Filter chip count rule (controls row badge)
The `Filter & Sort · N` badge shows the count of *non-default selections*:
- `Show` ≠ `All` → +1
- `Prep time` ≠ `Any` → +1
- `Difficulty` ≠ `Any` → +1
- Any tag selected → +1 (per-tag count does not multiply)
- `Sort by` ≠ `A–Z` → +1

### Persistence
The full filter state persists in the `recipeFilter` state object as today, extended:
```js
recipeFilter = {
  show: 'all' | 'favorites' | 'never-cooked',
  prepBucket: 'any' | 'lt-30' | '30-60' | 'gt-60',
  difficulty: 'any' | 'Easy' | 'Medium' | 'Hard',
  tags: [],            // array of tag strings (AND across)
  sort: 'alpha' | 'recent' | 'quickest' | 'last-cooked' | 'highest-rated'
};
```
Same backing store as today (in-memory; no localStorage persistence needed beyond what already exists for the tab).

---

## 5. AI Tools sheet — RECIPES section

Wired up to replace the `(coming soon)` placeholder reserved in sub-project 1's spec.

```
Kitchen AI tools                                          ✕
───────────────────────────────────────────────────────────
SCHOOL LUNCH                                  (from sub-project 1)
  [Take photo]  [From gallery]  [Upload file]  [iCal feed]

RECIPES
  [Import from URL]  [Import from photo]  [Find ideas online]
───────────────────────────────────────────────────────────
```

### Action wiring
| Button | Behavior |
|---|---|
| Import from URL | Closes AI Tools sheet → opens recipe form (`openRecipeForm(null)`) → focuses the URL field. User pastes URL → existing Worker flow triggers as today. |
| Import from photo | Closes AI Tools sheet → opens recipe form → immediately invokes the photo source picker (the existing `kr_photo` button click handler at [kitchen.js:~1215](kitchen.js#L1215) — gallery vs camera vs file). |
| Find ideas online | Closes AI Tools sheet → opens the existing `openFindRecipesSheet` ([kitchen.js:926](kitchen.js#L926)) — the 8-site drawer. No content change; just relocated entry point. |

The existing `findRecipesBtn` chip and `findRecipesBtn` event listener on the Recipes tab are **removed** ([kitchen.js:388, 392](kitchen.js#L388)). The link list itself stays in the codebase, only its entry point shifts.

---

## 6. Helper functions

### `formatLastCooked(timestamp)`
Lives in [shared/utils.js](shared/utils.js) (new export). Pure function.

| Input | Output |
|---|---|
| Falsy (null, undefined, 0) | `"Never cooked"` |
| Today (same `todayKey` in tz) | `"Cooked today"` |
| 1 day ago | `"Cooked yesterday"` |
| 2–6 days ago | `"Xd ago"` |
| 7–13 days ago | `"Last week"` |
| 14–27 days ago | `"Xw ago"` |
| 28–59 days ago | `"Last month"` |
| 60+ days ago | `"Xmo ago"` |
| 365+ days ago | `"Over a year ago"` |

All thresholds inclusive on the lower bound. Uses the family `timezone` setting for day comparison.

### `formatPrepBucket(prepTimeStr)`
Lives in [kitchen.js](kitchen.js) (local helper — only used by the filter logic). Permissive parser:

| Input | Parsed minutes |
|---|---|
| `"30 min"`, `"30m"`, `"30"` | 30 |
| `"1 hr"`, `"1h"`, `"1 hour"`, `"60 min"` | 60 |
| `"1h 30m"`, `"1 hour 30 min"`, `"90 min"` | 90 |
| `""`, `null`, `"a while"`, garbage | `null` (filter excludes) |

Bucket assignment: `< 30 min` → `lt-30`, `30 ≤ x ≤ 60` → `30-60`, `> 60` → `gt-60`, `null` → excluded when any bucket is selected.

---

## 7. Visual tokens

| Element | Token / value |
|---|---|
| Card thumbnail size | 56×56 px |
| Card thumbnail radius | `var(--radius-md)` |
| Card thumbnail placeholder | `var(--surface-2)` background, 🍴 emoji at 24px |
| Card row height (target) | ≈ 84 px |
| Rating star (filled) | `var(--accent)` |
| Rating star (empty) | `var(--border)` |
| Search input bg | `var(--surface-2)` |
| Search input border (focus) | `1px solid var(--accent)` |
| Filter chip badge background (active count) | unchanged from current `chip--active` style |

No new color tokens. All chrome reuses existing tokens.

---

## 8. File-level impact

| File | Change |
|---|---|
| [kitchen.js](kitchen.js) | `renderRecipesTab` rebuilt for sticky search + new card shape. `openRecipeFilterSheet` rebuilt for the five-dimension sheet. New helper `formatPrepBucket`. New AI Tools sheet RECIPES section wiring (inside `openKitchenAiToolsSheet` from sub-project 1). `findRecipesBtn` chip + handler removed from `renderRecipesTab`. |
| [styles/kitchen.css](styles/kitchen.css) | New rules for `.rl-recipe-card` thumbnail (56×56), `.rl-chips` line, `.rl-search` sticky search input, expanded `.filter-section` rules for the new sheet. |
| [shared/utils.js](shared/utils.js) | Export new `formatLastCooked(timestamp, timezone, todayStr)`. |
| [sw.js](sw.js) | `CACHE_NAME` bump (combined with sub-project 1's bump if shipped together). |

No DESIGN.md changes during sub-project 2 alone — section §6.10 will be updated once sub-projects 1-3 ship.

---

## 9. Acceptance criteria

1. Recipe library cards render with a 56×56 leading thumbnail; missing-image cards show 🍴 placeholder on `--surface-2`.
2. Each card's second line shows rating stars · prep time · last-cooked label, with each chip hidden gracefully when the data is missing (except last-cooked which always renders, defaulting to "Never cooked").
3. A sticky search input sits at the top of the Recipes tab and filters the library in real time on every keystroke. A trailing ✕ clears the input.
4. Search and Filter & Sort selections compose (intersection). The empty-state message reflects which is active and offers a one-tap clear.
5. Filter & Sort sheet renders all five dimensions (Show / Prep time / Difficulty / Tags / Sort by) and persists selections within the session.
6. Tags section is populated from the actual tags in the library; if no tags exist, the section shows a muted "No tags yet" hint.
7. The Filter & Sort badge on the controls row counts the number of non-default dimensions active.
8. The AI Tools sheet's RECIPES section renders three buttons (Import from URL / Import from photo / Find ideas online), each wired to the right downstream flow.
9. The standalone `Find ideas online` chip on the Recipes tab is removed.
10. `formatLastCooked` and `formatPrepBucket` behave as specified in §6 and are unit-testable via manual probing in dev (the app has no test runner — verify by sampling representative timestamps and prep-time strings in browser console).
11. Service worker cache name is bumped.
12. No regressions on the Meals or Lists tabs at 412×915 mobile viewport.

---

## 10. Open questions (none currently)

All design questions resolved during brainstorming. Inline rename was explicitly deferred (status quo preserved).
