# Phase 6 — Rewards Store Unification

**Date:** 2026-04-26
**Status:** Approved — ready for implementation planning
**Plan:** `docs/superpowers/plans/2026-04-26-phase-6-rewards-store.md` (to be written)
**UI rework phase:** Phase 6 of `docs/superpowers/plans/2026-04-19-ui-rework.md`

---

## 1. Problem & Goal

The Rewards Store today is:
- Buried inside `scoreboard.html` as a per-person bottom sheet
- Inaccessible by direct navigation — you must go to Scores, find a person, and open the sheet
- Duplicated across `scoreboard.html` (adult) and `kid.html` (kid) with divergent HTML/CSS
- Missing features adults need: history, full approval management, reward creation without going to admin
- Clunky two-step approval flow (buy approval → separate use approval for custom rewards)

**Goal:** Make Rewards a first-class standalone destination (`rewards.html`) with a unified adult/kid experience, a streamlined approval flow, and reward visibility controls. Replace the Calendar nav slot with Rewards. Remove the store from Scoreboard.

---

## 2. Page Architecture & Routing

### 2.1 Two rendering modes

**Adult mode** — no URL params, or `?person=Name` from a PWA shortcut:
- Full app chrome: `.app-header` + bottom nav (Rewards tab active) + FAB
- Person switcher chip in `.app-header` (same position as dashboard filter chip)
- 4 tabs: Shop · Bank · History · Approvals
- Header balance zone shows the active person's balance + 30-day trend line

**Kid mode** — `?kid=Name` param (navigated to from `kid.html` Store tile):
- No nav bar, no FAB, no person switcher
- Back button in `.app-header` returns to `kid.html?kid=Name`
- 3 tabs: Shop · Bank · History (Approvals hidden)
- Header shows kid's name + their balance + trend line

### 2.2 Deep-linking

Tab can be forced via `?tab=shop|bank|history|approvals`. Bell notifications use these:
- Approval-request notifications → `rewards.html?tab=approvals`
- Bank arrival (FYI) notifications → `rewards.html?tab=bank`
- Redemption outcome notifications → `rewards.html?tab=history`

### 2.3 Nav change — Calendar → Rewards

The Calendar slot in the bottom nav is replaced by Rewards (gift icon). Calendar still exists at `calendar.html` and is accessible via the More sheet. This change is in `shared/components.js` `renderNavBar()` and ships in this PR. Active tab highlight uses the `'rewards'` tab ID.

### 2.4 Scoreboard change

`openStore()`, `openStorePicker()`, `#storeMount`, and `store-cta-row` are removed from `scoreboard.html`. Replaced by a simple read-only balance summary row per person (avatar + name + balance) that navigates to `rewards.html?person=Name` on tap. All `store-*` CSS in `styles/scoreboard.css` is deleted.

### 2.5 Kid mode Store tile

The Store tile in `kid.html` that opens the current kid store sheet is rewired to navigate to `rewards.html?kid=Name`. The kid store sheet and its bindings in `kid.html` are deleted.

---

## 3. Header & Person Area

### 3.1 Balance header

Sits between the `.app-header` title bar and the tabs. Contains:
- Active person's avatar + name
- Current balance in large text (animated count-up on load and on person switch)
- 30-day trend line — points earned per day, single accent-color stroke, no labels, ambient context only
- Fixed height — no layout shift when switching persons

### 3.2 Person switcher (adult mode only)

Single chip in `.app-header`. Tap opens a bottom sheet with the full people list. Selecting someone re-renders the balance header and all tabs for that person. Defaults to first adult in the family, or the `?person=Name` param if present.

### 3.3 Pending approvals banner

When there are unanswered approval requests across any person, a `--warning` variant banner renders between the balance header and the tabs:

> "3 rewards waiting for approval · Review"

Tapping jumps to the Approvals tab. Obeys the single-banner rule — only shows when no higher-priority banner (vacation / freeze / overdue / multiplier) is active. Clears automatically when the queue is empty. Never shown in kid mode.

---

## 4. The Four Tabs

### 4.1 Shop tab

**Visibility rule:** A reward is shown to a person only if their ID is in the reward's `perPerson` array. If they are not in the array, the reward is invisible everywhere — store, kid mode, bell, scoreboard. No exceptions.

**Layout:**
- Search input + Filter & Sort chip (same pattern as admin library tabs)
  - Filter by type: All · Custom · Functional · Bounties
  - Sort: By name (default) · By cost
- Reward list: `.card.card--reward` per reward
  - Leading: emoji icon tile
  - Body: name, cost, progress bar (balance toward cost), expiry badge, stock badge, streak-requirement badge
  - Trailing: "Get it" button (primary, shown when person can afford + meets requirements)
  - Dimmed with "Need X more pts" label when person cannot afford — visible but unreachable (motivating)
- Empty state: "No rewards available for you yet."
- FAB (adult mode only): opens reward creation sheet (see §6)

**"Get it" flow:** see §5 (Approval flow).

### 4.2 Bank tab

The active person's saved (unused) reward tokens.

**Active tokens section:**
- `.card.card--reward` per token: icon, reward name, acquired date, "Use" button
- Use behavior:
  - Adult, any type → instant use, no approval
  - Kid, functional (task-skip / penalty-removal) → instant use, no approval
  - Kid, custom, `approvalRequired: true` → sends `use-request` to parent
  - Kid, custom, `approvalRequired: false` → instant use (self-serve end-to-end)

**Used tokens section:**
- Collapsed by default, expandable via a "Show X used" toggle row
- Read-only rows: icon, name, date used — light history, no actions

### 4.3 History tab

**Adult view** — full points ledger for the active person:
- All transaction types: purchases, uses, bonuses, deductions, multiplier days, FYI notifications
- Filter & Sort chip: type filter (All · Purchases · Uses · Bonuses · Deductions); sort by date (newest first, default)
- Each row: compact `.list-row` — type icon, label, amount (+ or −, color-coded), date
- Reverse-chronological, paginated at 50 rows ("+X more" expand row)

**Kid view** — scoped to reward transactions only:
- Purchases (redemption-requests) and uses only — no bonus/deduction/multiplier rows
- Same Filter & Sort chip but type filter limited to: All · Purchases · Uses
- Same compact `.list-row` layout

### 4.4 Approvals tab (adult mode only)

Two sections:

**Pending** — unanswered requests, newest first:
- Each row: kid avatar, reward name + icon, cost, intent badge ("Use Now" or "Save"), approve/deny buttons inline
- Approve → executes based on intent (see §5)
- Deny → opens a small optional reason field; sends `redemption-denied` message to kid; points are returned

**Recent** — last 30 days of resolved requests, collapsed by default:
- Read-only rows with outcome chip (Approved / Denied) and date
- Expandable via "Show X recent" toggle row

---

## 5. Approval Flow Rework

### 5.1 Three paths

**Path 1 — `approvalRequired: false` (self-serve)**
1. Kid taps "Get it"
2. Reward token created in Bank immediately — no parent action needed
3. `type: 'fyi'` bell message written to parent(s): "Noah got Movie Night from the store."
4. Bell shows unread badge; message has no approve/deny buttons — informational only
5. Kid uses token from Bank: instant for all types (functional and custom)

**Path 2 — `approvalRequired: true` + "Use Now"**
1. Kid taps "Get it" → bottom sheet: **Use Now** (primary) / **Save for Later** (secondary)
2. Kid taps "Use Now" → `redemption-request` written with `intent: 'use-now'`; points deducted from balance
3. Parent sees request in bell + Approvals tab with "Use Now" badge
4. Parent approves → reward immediately consumed; no bank token created; no second approval ever
   - Functional reward: applied to the relevant task/entry
   - Custom reward: marked used, `reward-used` message written to kid
5. Parent denies → `redemption-denied` message to kid; points returned

**Path 3 — `approvalRequired: true` + "Save for Later"**
1. Kid taps "Get it" → bottom sheet → taps "Save for Later"
2. `redemption-request` written with `intent: 'save'`; points deducted
3. Parent approves → bank token created; `redemption-approved` message to kid
4. Kid uses from Bank:
   - Functional reward → instant, no second approval
   - Custom reward → `use-request` to parent → parent approves/denies via bell

### 5.2 Adult buying (no approval needed)
Adults bypass the intent sheet entirely. Tapping "Get it" on a reward: confirm modal → token goes to Bank immediately → adult uses from Bank (instant for all types, same as today).

### 5.3 "Use Now" availability
"Use Now" is only available for **Custom** reward type. Functional rewards (task-skip, penalty-removal) always follow the "Save for Later" path — they land in Bank so the kid can pick the specific task or entry at use time. Showing "Use Now" for a task-skip would require the parent to approve without knowing which task to skip, which is unworkable.

When a kid taps "Get it" on a functional reward with `approvalRequired: true`, the intent sheet is skipped — the request is sent as `intent: 'save'` automatically.

### 5.4 "Use Now" vs "Save for Later" UI (Custom rewards only)
The intent sheet is a `renderBottomSheet()` with:
- Reward icon + name at top
- Two full-width buttons: "Use Now" (primary) and "Save for Later" (secondary)
- Muted hint below: "Your parent will approve before it's used."
- Cancel (ghost) at bottom

---

## 6. Reward Creation on rewards.html (Adult FAB)

Adults can create new rewards directly from the Shop tab without going to admin. The FAB (gift + "+" icon) opens a bottom sheet with the same reward form fields as admin:

- Name (text)
- Emoji picker
- Type (Custom / Task Skip / No Penalty) — segmented control
- Point cost
- `approvalRequired` toggle (default on) — see §7.1
- Visible to — people chips (default: all selected) — see §7.2
- Max redemptions (optional)
- Streak requirement (optional)
- Expires on (optional)

**Save** creates the reward via `pushReward()` and refreshes the Shop tab.

**No Archive/Delete on this form** — library management (archive, delete, edit existing) stays in admin. The rewards page form is create-only.

---

## 7. Data Model Changes

### 7.1 `approvalRequired` field on rewards

```
rewards/{pushId}: {
  ...existing fields...,
  approvalRequired: boolean   // new — default true
}
```

- New rewards always write this field explicitly
- Existing rewards without the field: treated as `true` (backwards compatible)
- Controls Path 1 vs Path 2/3 in the approval flow

### 7.2 `perPerson` visibility rework

**Old behavior:** `perPerson: null` = available to all; `perPerson: [id1, id2]` = restrict to those people.

**New behavior:** `perPerson` is always an explicit array. Never `null` on new records.

- Admin form and FAB form: all people chips active by default; deselecting a person removes them from the list
- Display filter: `reward.perPerson.includes(personId)` — no null shortcut for new records
- Legacy: existing rewards with `perPerson: null` display all chips active; the next save writes the explicit array
- Effect: a person not in `perPerson` cannot see the reward anywhere (store, kid mode, bell)
- Field label in forms changes from "Limit to people" to "Visible to"

### 7.3 `intent` field on redemption-request messages

```
messages/{personId}/{msgId}: {
  ...existing fields...,
  intent: 'use-now' | 'save' | null
}
```

- New requests write `intent` explicitly
- Existing messages without `intent`: treated as `'save'` behavior (backwards compatible)

### 7.4 `type: 'fyi'` message

New message type for self-serve reward purchases (`approvalRequired: false`):

```
messages/{parentId}/{pushId}: {
  type: 'fyi',
  title: 'Noah got Movie Night from the store.',
  body: null,
  amount: -<pointCost>,
  rewardId: <id>,
  seen: false,
  createdAt: ServerValue.TIMESTAMP,
  createdBy: <kidPersonId>
}
```

Bell renders FYI messages with an info icon and no action buttons. Marking seen dismisses the badge.

---

## 8. Admin Reward Form Changes

### 8.1 `approvalRequired` toggle

- `.form-toggle` (never a checkbox) labelled "Require approval to buy"
- Default: on for new rewards
- Position: after Name + Emoji, before Type — it's a top-level classification
- When off, hint: "Kids can buy this instantly — you'll get a notification."

### 8.2 `perPerson` chip rework

- All people chips active by default on new reward creation
- Deselecting removes that person from visibility entirely
- Label: "Visible to" (was "Limit to people")
- Hint: "Deselect anyone who shouldn't see this reward."
- Save always writes explicit array; never writes `null`

---

## 9. Component Additions (`shared/components.js`)

| Helper | Purpose |
|---|---|
| `renderRewardCard(reward, balance, opts)` | `.card.card--reward` — used in Shop and Bank tabs |
| `renderBankToken(token, opts)` | Bank tab active token row |
| `renderHistoryRow(entry)` | Compact `.list-row` for History tab |
| `renderApprovalRow(msgId, msg, person, reward)` | Pending approval row with inline buttons |

All four replace today's bespoke `store-card` HTML strings scattered across `scoreboard.html` and `kid.html`. One shape, one definition.

`renderNavBar()` updated: Calendar slot → Rewards slot (gift icon, `'rewards'` tab ID).

---

## 10. Files Touched

| File | Change |
|---|---|
| `rewards.html` | **New** — page shell |
| `rewards.js` | **New** — all page logic |
| `styles/rewards.css` | **New** — page-specific styles |
| `shared/components.js` | Add reward card helpers; update `renderNavBar()` |
| `shared/firebase.js` | Ensure `intent` + `fyi` message type; verify `approvalRequired` writes |
| `styles/components.css` | `.card--reward` token definitions |
| `scoreboard.html` | Remove store functions + mount; add balance summary rows |
| `styles/scoreboard.css` | Remove all `store-*` rules |
| `kid.html` | Rewire Store tile to `rewards.html?kid=Name`; remove kid store sheet |
| `styles/kid.css` | Remove kid store rules |
| `admin.html` | Add `approvalRequired` toggle; rework `perPerson` chips |
| `sw.js` | Bump cache; add `rewards.html`, `rewards.js`, `styles/rewards.css` to precache |

---

## 11. Exit Criteria

- `rewards.html` loads and renders correctly in adult and kid mode at 375px and 768px, light and dark theme
- All four entry points open the same page: More tab (nav) · Scoreboard balance row · Bell deep-link · Kid Store tile
- Scoreboard no longer renders the Store inline — only balance summary rows with nav links
- Kid Store tile navigates to `rewards.html?kid=Name` — no parallel kid store sheet exists
- Approvals tab shows all pending requests; approving "Use Now" consumes the reward with no second step
- `approvalRequired: false` rewards land in Bank immediately + FYI bell message fires
- Rewards not in a person's `perPerson` array are invisible everywhere for that person
- `approvalRequired` toggle and `perPerson` chip rework work correctly in both admin and FAB form
- Calendar nav slot replaced by Rewards; Calendar still reachable via More sheet
- No `store-*` CSS remains in `scoreboard.css` or `kid.css`
- SW cache bumped; new files in precache list
- No regressions: bonus/deduction messages, multipliers, achievement unlocks, streak display all intact

---

## 12. Out of Scope for This Phase

- Tablet two-pane layout (Phase 7)
- Push notifications for approval events (Phase 2.1)
- Activities goal payouts as reward cards (Phase 1.6)
- Reward expiry auto-archiving
- Wishlist tab (noted in DESIGN.md §6.7 — deferred; no wishlist data exists yet to surface)
