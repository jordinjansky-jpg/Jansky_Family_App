# Admin Redesign Spec

**Date:** 2026-04-25
**Status:** Approved for planning
**Replaces:** Phase 3 section of `docs/superpowers/plans/2026-04-19-ui-rework.md`

---

## 1. Goals

- Collapse 11 inconsistent tabs into 4 coherent sections
- Establish one shared list row + detail sheet pattern used everywhere
- Make People management first-class (detail page per person)
- Fold Theme into Settings; eliminate Debug entirely
- Auto-prune old data instead of manual archive button
- Smart PIN bypass for designated admin users

---

## 2. Top-Level Structure

Admin keeps its current full-screen PIN-gated shell. The tab bar becomes **4 tabs**:

```
Library · People · Settings · Tools
```

### 2.1 PIN Bypass

New `isAdmin: boolean` flag on the person object (stored in Firebase under `people/{id}`). Defaults to `false`. Set per-person in the Person detail page (adults only).

**Bypass logic:**
1. `person.html` already writes `dr-active-person` (person ID) to `sessionStorage` on load.
2. On admin load, before showing the PIN gate, check `sessionStorage['dr-person-home']` (stores the person's name string).
3. Match that name against the loaded `peopleObj` to find the person record. If `isAdmin === true` → skip PIN gate, enter admin directly.
4. The existing 30-min session cache (`sessionStorage['admin-authed']`) applies as normal after any successful entry (PIN or bypass), so navigating away and back within the session doesn't re-prompt.
5. If accessed from a non-person-page context (direct URL, dashboard nav), PIN gate shows as normal.

**Schema addition:**
```
people/{pushId} ← { name, color, isAdmin?: boolean, role?: 'adult'|'child', ... }
```

---

## 3. Library Tab

### 3.1 Secondary Navigation

A pill row beneath the tab bar switches between six content types:

```
Tasks · Events · Meals · Categories · Rewards · Badges
```

### 3.2 Shared List Row Pattern

Every item in every Library section uses the same shape:

```
┌──────────────────────────────────────────┐
│ [ICON TILE]  Primary name                │
│              Secondary meta          [›] │
└──────────────────────────────────────────┘
```

- **Icon tile**: 40×40 rounded square using `--radius-md`. Content varies by section (see §3.3). Uses `--icon-*` color tokens from `base.css`.
- **Primary**: Item name, `--font-size-base`, `--font-weight-semibold`, single line with ellipsis overflow.
- **Secondary**: 1–2 metadata fields, `--font-size-sm`, `--color-text-muted`.
- **Chevron**: Single `›` right-aligned. Tap anywhere on the row opens the detail sheet.
- **Add button**: `+ Add [thing]` text button at the top of every list, same shape and placement in all sections.
- **Delete**: Long-press row → swipe-to-delete reveal. No delete buttons visible at rest.
- **Empty state**: Each section has a named empty state ("No tasks yet. Tap + Add Task to get started.").

### 3.3 Section Definitions

#### Tasks
- **Icon tile**: Category color swatch
- **Primary**: Task name
- **Secondary**: Rotation chip + owner name(s)
- **Detail sheet**: Existing task form, restyled to match new field/label pattern
- **Removed**: Task Templates section — deleted entirely, code removed
- **Kept**: Bulk edit (multi-select mode triggered by long-press on list)

#### Events
- **Icon tile**: Event color dot on neutral tile
- **Primary**: Event name
- **Secondary**: Date · time (or "All day")
- **Detail sheet**: Existing event form, restyled

#### Meals
- **Icon tile**: Meal emoji or 🍽 default on neutral tile
- **Primary**: Meal name
- **Secondary**: Tags (comma-separated, up to 2 shown then "+N more")
- **Detail sheet**: Full existing meal editor — name, URL, notes, tags, ingredients. No fields removed.

#### Categories
- **Icon tile**: Category icon on category color
- **Primary**: Category name
- **Secondary**: Task count · weight%
- **Detail sheet**: Name, icon, weight percent, daily limits, event color, flags (isEvent, pinProtected, showIcon, isDefault)

#### Rewards
- **Icon tile**: Reward emoji on neutral tile
- **Primary**: Reward name
- **Secondary**: Point cost · reward type chip
- **Sections**:
  - Active rewards list (shared row pattern)
  - Archived rewards (collapsed `<details>`, count in summary)
  - Redemption History (collapsed `<details>`, count in summary)
- **Removed**: Inline bank management (add bonus/deduction). This stays in the Bell dropdown. The Person detail page adds it as a second entry point.
- **Kept**: Reward CRUD, bounty flag, archived toggle

#### Badges (Achievements)
- Moved from its own top-level tab into the Library pill row as a 6th section: **Tasks · Events · Meals · Categories · Rewards · Badges**
- **Icon tile**: Badge emoji
- **Primary**: Badge name
- **Secondary**: Unlock count / total people
- **Detail sheet**: Achievement definition + per-person status (unlocked/locked/revoked)

---

## 4. People Tab

### 4.1 List View

```
┌──────────────────────────────────────────┐
│ [COLOR SWATCH]  Name                     │
│                 Adult · Admin        [›] │
└──────────────────────────────────────────┘
```

- Color swatch (40×40, person color, `--radius-full` = circle)
- Primary: Person name
- Secondary: Role chip ("Adult" or "Kid") + "Admin" badge if `isAdmin === true`
- Single `+ Add Person` button at top

### 4.2 Person Detail Page

Full-screen within admin shell (not a sheet — too much content). Back button `‹ People` returns to list.

**Profile**
- Name (text input)
- Color (color picker, existing swatch grid)
- Role toggle: Adult / Kid

**Admin Access** *(visible only when role = Adult)*
- `isAdmin` toggle: "Can access admin without PIN"
- Helper text: "This person can open admin directly from their home screen."

**Schedule & Tasks**
- Default time-of-day preference (Am / PM / Anytime)
- Away date ranges — stub row ("Vacation mode — coming soon") for backlog 2.4

**Kid Settings** *(visible only when role = Kid)*
- Show meals toggle
- Show weather toggle
- Long-press sensitivity (slider, ms)
- Celebrations on/off toggle
- Show store toggle
- Show achievements toggle

**Rewards**
- Current balance (read-only computed value, labeled "Store balance")
- Balance anchor adjust (numeric input + save)
- Add bonus / Add deduction (opens existing bonus/deduction form inline)
- Note: Bell dropdown retains bonus/deduction as primary path. This is a second entry point for when you're already in admin.

**Danger Zone**
- Delete person button → confirm modal listing cascade consequences (messages, bank tokens, wishlist, achievements, balance anchor)

---

## 5. Settings Tab

All configuration. Theme controls move here from the deleted Theme tab.

### App & Family
- App name
- Family name
- Timezone (dropdown)

### Display
- Theme preset picker (moves from Theme tab — sets app-wide default)
- Accent color picker (moves from Theme tab)
- Ambient strip toggle

*Note: Per-person theme lives on `person.html` and is untouched by this redesign.*

### Weather
- Location (text input + Test button)
- OpenWeatherMap API key (password input, monospace)
- Test result inline feedback

### Behavior
- Long-press sensitivity — dashboard (slider, ms)
- Long-press sensitivity — calendar/kid (slider, ms)
- Calendar default view (dropdown: Week / Month / Day)
- Weekend weight (numeric input)
- Past-due credit % (numeric input)
- Difficulty multipliers (easy / medium / hard numeric inputs)
- Auto-prune old data (dropdown: Off · 3 months · 6 months · 12 months, default: 6 months) — setting key: `autoPruneMonths` (integer, 0 = off)

### Security
- Change admin PIN (current PIN + new PIN + confirm)
- Recovery PIN reminder ("Recovery PIN is always 2522")

---

## 6. Tools Tab

### Schedule
- **Overview stats**: Days scheduled · Total entries · Total time — stat cards
- **Load per person**: Per-person row showing count, avg/day, total time, avg time/day (existing `loadScheduleStats` logic, restyled)
- **Actions**: Rebuild Schedule · Clear Past & Rebuild (with confirm)

### Data
- Export JSON (full `rundown/` dump)
- Import JSON (restore from file, with confirm modal warning)
- Reset Scoreboard (type-RESET confirm, existing cascade: snapshots, streaks, completions, balances, messages, tokens)
- Factory Reset (type-RESET confirm, wipes all `rundown/` data, redirects to setup)

*Auto-prune runs silently on admin load when the Setting is not Off. No button, no status. Prunes schedule entries, completions, and snapshots older than the configured threshold.*

### Debug
**Removed entirely.** Debug mode toggle, event log, test past-due entry, and schedule inspector are all deleted. Code removed.

---

## 7. Deleted Features (Code Removal)

| Feature | Location today | Action |
|---|---|---|
| Task Templates | Tasks tab | Delete entirely — UI + rendering code + any Firebase writes |
| Theme tab | Top-level tab | Delete tab; move 2 controls to Settings → Display |
| Debug tab | Top-level tab | Delete entirely — all 4 sub-sections and their JS |
| Archive button | Data tab | Replace with auto-prune setting in Settings → Behavior |
| Bank management in Rewards tab | Rewards tab | Remove from Rewards; keep in Bell; add to Person detail |
| Badges as top-level tab | Top-level tab | Merge into Library pill row as 6th section |

---

## 8. Shared Component Requirements

The following must exist before or during implementation:

- **Icon tile** component: 40×40 rounded square, accepts color token + content (icon SVG, emoji, or color swatch). Used in every Library row.
- **List row** component: shared `renderAdminRow({ icon, primary, secondary })` helper in `admin.html` (not `shared/components.js` — admin-specific).
- **Person detail view**: view-switcher within `admin.html` (not a separate HTML file), so PIN session and data cache carry over.
- **`isAdmin` field**: written/read via existing `writeSettings`-style pattern using `firebase.database().ref('rundown/people/' + id).update({ isAdmin })`.
- **Auto-prune**: runs in `loadData()` on admin init when `settings.autoPruneMonths > 0`. Silent — no toast, no log.

---

## 9. States Required (Per Section)

Every Library section must ship with:
- **Empty state**: Illustration-free, plain text, "+ Add" CTA
- **Loading state**: Skeleton rows (same shape as list rows)
- **Error state**: "Couldn't load [thing]. Pull to retry." (or tap)
- **Confirmation modals**: All destructive actions (delete, reset, factory reset) use `showConfirm()` — no `window.confirm`

---

## 10. What Does NOT Change

- Firebase schema under `rundown/` — no migrations except adding `isAdmin` to people
- Per-person theme on `person.html`
- Bell dropdown (bonus/deduction/approval flows stay there)
- PIN gate behavior for non-admin-flagged users
- All existing Firebase read/write helpers in `shared/firebase.js`
- Admin CSS visual language (tokens, colors) — this spec changes structure and consistency, not the visual design system

---

## 11. Pre-PR Checklist

- [ ] Task Templates: zero references remain in codebase (`grep -r "template" admin.html`)
- [ ] Debug tab: zero references remain
- [ ] Theme tab: zero references remain (controls migrated to Settings)
- [ ] All Library sections use shared row shape — no bespoke list layouts
- [ ] Person detail is a view within `admin.html`, not a new file
- [ ] `isAdmin` bypass tested: person with flag skips PIN; person without flag still sees PIN
- [ ] Auto-prune runs silently on admin load, no UI feedback
- [ ] All destructive actions use `showConfirm()`, no `window.confirm`
- [ ] Empty, loading, error states present in all 6 Library sections
- [ ] SW cache bumped
- [ ] Tested at 375px and 768px, light + dark theme
