# Kitchen Lists Tab — Polish Spec

**Date:** 2026-05-11
**Status:** Approved design — implementation pending
**Sub-project:** 3 of 5 in the Kitchen UI/UX program
**Scope:** UX polish on the Lists tab inside `kitchen.html`, plus the addition of a LISTS section to the global AI Tools sheet (introduced in sub-project 1, extended in sub-project 2).

## Why this spec exists

The Lists tab works mechanically but has accumulated UX friction the review surfaced:
- Two `+` icons on one screen do completely different things (header `+` = new list, FAB `+` = add items).
- The AI buttons (wand cleanup + camera photo-import) are anonymous 36×36 icons with no labels and no discovery affordance.
- The "Add from staples" chip is thin and easily missed even though it's a frequent flow after Clear-checked.
- Categorization gets stuck — `milk` shows under `OTHER` because re-categorization only runs at item-creation time.
- Single-item or single-category lists show an ugly `OTHER` header.
- The list-switcher row gives no signal of how many items are left.

This sub-project resolves all of those without touching the underlying data model.

## Goals

1. Two `+` glyphs collapse to one — FAB owns `+`; list creation moves to the overflow menu.
2. AI features consolidate into the global AI Tools sheet (new LISTS section) — no more anonymous inline icons.
3. "Add from staples" gains a permanent home (overflow menu) and a contextual home (empty-state CTA).
4. Categorization heals itself on list load — no manual cleanup required for items that landed in `OTHER`.
5. Category headers disappear when they add no signal (single category, or all-`OTHER`).
6. List-switcher row carries a small "N left" chip so the user knows at a glance how much is left to grab.

## Non-goals

- Archive vs delete for lists — out of scope; delete remains the only path.
- Per-item bulk operations (multi-select to bulk-check / delete). Power-user nicety, not needed.
- Smart suggestions based on planned meals (e.g., "your Wednesday dinner needs onions and you don't have them on the list") — sub-project 5 territory.
- Edit-list sheet color/icon picker — already implemented at [kitchen.js:1881-1890](kitchen.js#L1881-L1890); the review was wrong about this being missing.

---

## 1. Header row — list-switcher

### Current layout
```
[🛒 Walmart                        + ⋮]
```

### New layout
```
[🛒 Walmart  · 3 left                  ⋮]
```

- **Removed:** the `+` icon-button to the right of the list name (manageListBtn's neighbor — see [kitchen.js:1582](kitchen.js#L1582) area). Its only function was `openCreateListSheet`, which moves to the overflow menu.
- **Added:** a small `· N left` chip rendered inline with the list name. Active-item count only (excludes checked / completed items). When the active count is 0, the chip renders `· clear ✓` in `--accent-ink` instead — a positive signal. When there are no items at all (truly empty list), the chip is hidden entirely; the empty state in the items area (§3) carries the messaging.
- **Overflow `⋮`** stays where it is, with its menu rebuilt (§2).
- When there are 2+ lists, the existing per-list switcher pills still render to the left of the active list ([kitchen.js:~1572-1640](kitchen.js#L1572)). Each pill shows just `icon + name`; the `· N left` count is shown only for the **active** list (showing counts on every pill clutters the strip).

---

## 2. Overflow menu

The list-context `⋮` button currently opens `openManageListSheet` which is the full edit-list sheet. We're inserting a lighter-weight action menu first; the full edit sheet becomes one option within it.

### New menu structure (bottom sheet)
```
Walmart actions                              ✕
───────────────────────────────────────────────
  + New list
  Add from staples
  Rename / change icon          → Edit-list sheet
  Copy as text
  Clear checked items
───────────────────────────────────────────────
  Delete list                                ⚠
```

- **+ New list** — opens the existing `openCreateListSheet` ([kitchen.js:1774](kitchen.js#L1774)). Becomes the only entry point for list creation since the header `+` is removed.
- **Add from staples** — opens the existing `openStaplesSheet` ([kitchen.js:2097](kitchen.js#L2097)). Permanent home (independent of whether the list is empty).
- **Rename / change icon** — opens `openManageListSheet` ([kitchen.js:1858](kitchen.js#L1858)), preserved as-is. The sheet already handles name + emoji + color via the existing `rf-emoji-reveal` pattern.
- **Copy as text** — invokes `copyListAsText` ([kitchen.js:1972](kitchen.js#L1972)). Moved out of the edit sheet's chip row.
- **Clear checked items** — confirmation prompt then removes checked items. Moved out of the edit sheet's chip row.
- **Delete list** — confirmation prompt then removes the list. Visually separated (small `--text-faint` divider + red text) to avoid accidental tap-through.

The Edit-list sheet's bottom chip row (`Copy list`, `Clear checked`) is **emptied** since those actions move to the overflow. The Edit-list sheet becomes pure rename/icon/color editing.

---

## 3. Items area — empty state

Today's empty list state ([kitchen.js:1646](kitchen.js#L1646) — `renderItemsArea`) renders a basic empty placeholder. The new empty state is more directive.

```
┌─────────────────────────────────────────┐
│                                         │
│           Your list is empty.           │
│                                         │
│        [+ Add from staples]             │
│                                         │
│   Or tap the + to add an item.          │
│                                         │
└─────────────────────────────────────────┘
```

- Trigger: 0 items (active + completed) on the active list.
- "Add from staples" chip uses `.btn.btn--primary` size `sm`, opens `openStaplesSheet`.
- "Or tap the + to add an item" is `--text-faint` helper copy.
- When the active list has staples available, the chip's label remains `+ Add from staples`. When the staples roster is empty (no staples saved family-wide), the chip is replaced with a muted line `Save your basics as staples first` linking to the same `openStaplesSheet` (which lets users add staples directly).

Post-clear-checked is the most common path to this empty state — it shouldn't feel like a dead-end.

---

## 4. AI Tools sheet — LISTS section

Wired up as a third section in the global Kitchen AI Tools sheet (introduced in sub-project 1, extended in sub-project 2's RECIPES section).

```
Kitchen AI tools                              ✕
────────────────────────────────────────────────
SCHOOL LUNCH                  (sub-project 1)
  [Take photo]  [From gallery]  [Upload file]  [iCal feed]

RECIPES                       (sub-project 2)
  [Import from URL]  [Import from photo]  [Find ideas online]

LISTS
  [Auto-categorize current list]   [Photo → list]
────────────────────────────────────────────────
```

### Action wiring
| Button | Behavior |
|---|---|
| Auto-categorize current list | Closes AI Tools sheet → runs the existing `runListCleanup(currentItems)` ([kitchen.js:2454](kitchen.js#L2454)) which uses the `cleanList` Worker handler. Shows the existing "wand loading" state visually during the call. |
| Photo → list | Closes AI Tools sheet → opens the existing `openListPhotoSourceSheet` ([kitchen.js:2273](kitchen.js#L2273)) — gallery / camera / file picker → `photoToList` Worker → confirm step → items added to the active list. |

### Inline button removal
The two inline icon-buttons (`list-wand-btn` + `list-camera-btn` at [kitchen.css:254-275](styles/kitchen.css#L254-L275)) and their wrapping `.list-toolbar` row are **removed** from the items area. Their handlers stay in `kitchen.js` but only invoked from the AI Tools sheet now.

### Active-list awareness
The AI Tools sheet must know which list is active when LISTS actions fire. Pattern: the sheet reads `activeListId` at the time the button is tapped. If `activeListId` is null (no lists exist), the LISTS section renders a muted hint `Create a list first` and both buttons are disabled.

---

## 5. Self-healing categorization

### Problem
`milk` displays under `OTHER` because re-categorization only runs at item-creation in `addItemToActiveList` ([kitchen.js:2243](kitchen.js#L2243)) via `categorizeItem`. If the worker times out or returns null, the item stays uncategorized — and nothing ever tries again.

### Fix
On every `renderItemsArea` call (i.e., when the active list loads or its items change), iterate active items and identify those whose `category` is null, undefined, empty string, or `OTHER`. Queue them for AI categorization via the existing `categorizeItem` worker call.

### Constraints
- **Debounce** — cap to one heal-pass per 60 seconds per `activeListId` (track in-memory state).
- **Batch limit** — process at most 10 uncategorized items per pass. Excess items wait for the next pass.
- **Quiet** — no spinner, no toast for self-heals. The user sees items move from `OTHER` to their proper category automatically on subsequent renders.
- **Worker failures** — if a categorize call errors, leave the item where it was; don't retry in the same pass.

### Cost
The existing `categorizeItem` handler is one Claude Haiku call per item. At 10 items every 60s in the worst case, this is bounded; at typical family list size (5-15 items) one heal-pass clears the backlog.

---

## 6. Category-header visibility

### Rule
A category header renders only when **both** of the following are true:
1. The category has ≥ 1 visible item in the rendered list.
2. The number of distinct visible categories ≥ 2, **OR** the single visible category is not `OTHER`.

### Practical effect
- 1 item under `Dairy` → header `DAIRY` shows (good, clean).
- 1 item under `OTHER` → header is **hidden** (the lone item still renders; just no header above it). The hidden-`OTHER`-header rule prevents the ugly "this single item is uncategorized" signal from dominating sparse lists.
- 2+ categories → all headers show as today (status quo).

---

## 7. File-level impact

| File | Change |
|---|---|
| [kitchen.js](kitchen.js) | `renderListsTab` updated for `· N left` chip + removal of header `+`. New `openListActionsMenu` function (the overflow sheet from §2). `renderItemsArea` updated for new empty state and category-header rule. New `healUncategorizedItems(listId, items)` function (debounced, called from `renderItemsArea`). Existing `runListCleanup` and `openListPhotoSourceSheet` unchanged; just their entry points shift. `openKitchenAiToolsSheet` (from sub-project 1) gains the LISTS section + handlers. `openManageListSheet` simplified — bottom chip row emptied (copy + clear move to overflow). |
| [styles/kitchen.css](styles/kitchen.css) | `.list-toolbar` + `.list-wand-btn` + `.list-camera-btn` rules removed. New `.list-switcher__count` chip rule. Empty-state styles updated. |
| [sw.js](sw.js) | `CACHE_NAME` bump (combined with sub-projects 1-2 if shipped together). |

No new Firebase schema, no DESIGN.md change for this sub-project alone.

---

## 8. Acceptance criteria

1. The list-switcher row shows only `[icon] [name] · N left` followed by the `⋮` overflow button. No `+` button next to the list name.
2. The `· N left` chip reflects the active (unchecked) item count for the active list. When count is 0 and the list has items, the chip reads `· clear ✓` in accent-ink. When the list is empty, the chip is hidden.
3. The overflow `⋮` opens a sheet with six options in the order: `+ New list`, `Add from staples`, `Rename / change icon`, `Copy as text`, `Clear checked items`, `Delete list` (the last visually separated).
4. The empty-list state in the items area renders `Your list is empty.` + a `+ Add from staples` button + `Or tap the + to add an item.` helper.
5. When no staples are saved family-wide, the empty-state chip swaps to a muted `Save your basics as staples first` link.
6. The AI Tools sheet renders three sections (SCHOOL LUNCH / RECIPES / LISTS) with the LISTS section wired to `Auto-categorize current list` and `Photo → list`.
7. When no lists exist, the LISTS section in AI Tools renders a `Create a list first` hint and both buttons are disabled.
8. The inline `.list-toolbar` row with wand + camera icons is removed.
9. Items whose category is null/empty/`OTHER` are silently re-categorized on every `renderItemsArea` call, debounced to one pass per 60 seconds per active list, capped at 10 items per pass.
10. Category headers render only when the category has visible items AND either the category is not `OTHER` or there are multiple visible categories.
11. The Edit-list sheet's bottom chip row is empty (Copy list + Clear checked have moved to the overflow menu); the sheet only handles name + icon + color editing.
12. Service worker cache name is bumped.
13. No regressions on the Meals or Recipes tabs at 412×915 mobile viewport.

---

## 9. Open questions (none currently)

All design questions resolved during brainstorming.
