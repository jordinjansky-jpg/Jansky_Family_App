# Rewards Store — Design Spec

**Date:** 2026-04-17
**Status:** Draft
**Scope:** Points economy, rewards store, parent messages, notification bell, functional rewards (task skip, penalty removal)

---

## 1. Overview

A rewards system where family members earn normalized points from daily task completion, accumulate a spendable balance, and redeem rewards defined by parents. Parents can send bonus/deduction messages with personal notes. Two special "functional" reward types — Task Skip and Penalty Removal — modify scoring data when used. An in-app notification bell on every page drives the parent approval workflow and kid message delivery.

**Design principles:**
- The existing scoring engine (grades, percentages, streaks, snapshots) is untouched. The rewards balance is a layer on top.
- Points are deducted at request time, refunded on denial. No complex timing/unwinding logic.
- Functional rewards (task skip, penalty removal) are banked as tokens on purchase, used whenever the kid chooses. No second approval loop at usage time.
- Everyone earns points (not just kids). Adults may never redeem, but the system doesn't discriminate.

---

## 2. Points Economy & Balance

### Daily Earning

Each person earns up to **100 points per day**, derived directly from their daily score percentage. A 95% day = 95 points. A 100% day = 100 points. This is read from existing snapshots — no new data written for daily earning.

For the current day (no snapshot yet), `dailyScore()` is used live to show a real-time earning preview. This becomes a real snapshot at rollover, same as today.

### Balance Calculation (On-the-Fly)

```
balance = anchorAmount
        + sum(snapshot.percentage for all snapshots after anchorDate)
        + sum(bonus amounts from messages after anchorDate)
        - sum(deduction amounts from messages after anchorDate)
        - sum(redemption spend from messages after anchorDate)
```

No stored balance value. Balance is always derivable from source data (snapshots + messages + anchor). At family scale, even a year of data is ~365 snapshots + a few hundred messages — trivial to sum.

### Balance Anchors

`balanceAnchors/{personId}` — `{ amount, anchoredAt }`. Defaults to `{ amount: 0, anchoredAt: <app install date> }` if none exists.

Admin actions (in People tab):
- **Reset balance** — writes anchor `{ amount: 0, anchoredAt: now }`
- **Clear history** — calculates current balance, writes it as anchor, deletes old messages. Balance stays the same, storage shrinks.

---

## 3. Firebase Schema

### New nodes under `rundown/`

```
rundown/rewards/{pushId}
  {
    name: string,
    icon: string,                    // emoji e.g. "🍕"
    pointCost: number,
    rewardType: 'custom' | 'task-skip' | 'penalty-removal',
    perPerson: [personId, ...] | null,  // null = available to everyone
    maxRedemptions: number | null,      // null = unlimited
    streakRequirement: number | null,   // null = no streak needed
    status: 'active' | 'archived'
  }

rundown/messages/{personId}/{pushId}
  {
    type: 'bonus' | 'deduction'
        | 'redemption-request' | 'redemption-approved' | 'redemption-denied'
        | 'task-skip-used' | 'penalty-removed',
    title: string,              // template or custom title
    body: string | null,        // personal note from parent
    amount: number,             // positive for bonus/spend, negative for deductions
    rewardId: string | null,    // links to reward for redemption messages
    entryKey: string | null,    // schedule entry key for functional rewards
    seen: boolean,
    createdAt: ServerValue.TIMESTAMP,
    createdBy: 'parent' | 'system' | personId
  }

rundown/balanceAnchors/{personId}
  {
    amount: number,
    anchoredAt: number           // timestamp
  }

rundown/bank/{personId}/{pushId}
  {
    rewardType: 'task-skip' | 'penalty-removal',
    acquiredAt: number,          // timestamp
    used: boolean,
    usedAt: number | null,       // timestamp when used
    targetEntryKey: string | null // schedule entry affected
  }
```

### What stays untouched

`completions/`, `snapshots/`, `streaks/`, `schedule/` — the existing scoring engine is not modified. Functional rewards write to those nodes only when a banked token is used (clearing `isLate`/`pointsOverride`, or marking an entry exempt).

---

## 4. Reward Creation & Pricing Helper (Admin)

### New "Rewards" tab in admin

Position: between Categories and Settings. `{ id: 'rewards', icon: '🎁', label: 'Rewards' }`.

### Reward form fields

- **Name** — text input ("Movie Night", "Extra Screen Time", "Skip a Chore")
- **Emoji** — picker with common options + custom entry (🍕🎮🍦⭐🎬📱🛹🧁🎯🏆)
- **Type** — segmented control: `Custom` | `Task Skip` | `Penalty Removal`
  - Custom: parent fulfills manually
  - Task Skip: brief label "Person picks a task to skip for the day"
  - Penalty Removal: brief label "Removes the late penalty from a past task"
- **Point Cost** — number input, populated by the pricing helper
- **Available to** — person chips (reuse existing owner chip pattern). None selected = everyone.
- **Max redemptions** — optional number input. Blank = unlimited.
- **Streak requirement** — optional number input. Blank = no streak needed.

### Pricing helper (inline)

- **"How long should this take to earn?"** — slider 1-30 days + text input beside it. Typing updates slider if ≤30; slider always updates text input.
- **Assumed average** — dropdown: `A (95%)` · `B+ (88%)` · `B (85%)` · `C+ (78%)` · `C (75%)`
- **Suggested cost** — live-calculated: `days × avgPct`, rounded to nearest 5. Example: "7 days at B+ average -> 615 pts"
- Clicking suggestion auto-fills Point Cost. Parent can override.

### Rewards list view

- Cards showing emoji, name, point cost, type badge, streak requirement, availability
- Edit / archive actions (archive preserves redemption history)
- Reorder via drag or up/down arrows

---

## 5. Parent Messages (Bonus / Deduction)

### Entry points

- "Send Message" button in notification bell dropdown (accessible on every page)
- Also accessible from People tab in admin

### Message creation flow

1. **Pick a person** — person chips (skip if initiated from person context)
2. **Pick type** — two buttons: + Bonus (green tint) / - Deduction (red tint)
3. **Pick a title** — template grid + "Custom" option revealing text input

**Positive templates:**
- Awesome Job!
- Super Star
- Great Teamwork
- Above & Beyond
- So Proud of You
- Way to Go!
- Amazing Effort
- Kindness Award
- Helping Hand
- You Crushed It!
- Keep It Up!
- Big Improvement

**Negative templates:**
- Room Check
- Reminder Needed
- Let's Do Better
- Responsibility Check
- Try Again Tomorrow
- Needs Attention
- Not Your Best
- We Talked About This

4. **Personal note** — optional textarea
5. **Points** — number input. Defaults: +25 bonus, -15 deduction. Parent adjusts freely.
6. **Send** — writes to `messages/{personId}/{pushId}`, shows confirmation toast

### Kid-side experience

Unseen messages appear as a **card overlay** in kid mode — centered, one at a time, newest first. Positive messages: gold/green theme with celebration. Deductions: muted, no celebration. Kid taps "Got it" to mark `seen: true`.

---

## 6. Rewards Store & Redemption Flow

### Redemption lifecycle

1. Kid taps "Get it!" on a reward they can afford (and meet streak requirement)
2. Points **deducted immediately** from balance
3. `redemption-request` message written — appears in parent's bell
4. Parent approves → `redemption-approved` message sent to kid
   - Custom rewards: parent fulfills whenever
   - Functional rewards: token added to `bank/{personId}`
5. Parent denies → `redemption-denied` message sent + system writes a `bonus` message with `amount: pointCost`, `title: "Refund: [reward name]"`, `createdBy: 'system'` to restore the balance

### Functional reward usage (from bank)

**Task Skip:**
- Kid opens bank in kid mode, taps a Task Skip token
- Sees their incomplete tasks for today, picks one
- Schedule entry gets `exempt: true` (just this entry, not the task definition)
- `dailyPossible()` already skips exempt entries — drops from scoring automatically
- Task card shows "Skipped" badge instead of checkbox
- `task-skip-used` confirmation message written, bank token marked `used: true`

**Penalty Removal:**
- Kid taps a Penalty Removal token from bank
- System auto-targets the **highest-damage penalized task** — largest `(basePoints - earnedPoints)` gap where `isLate: true`
- Clears `isLate` and `pointsOverride` on that completion
- Recalculates and overwrites the snapshot for that date
- If the restored day becomes 100%, streak updates via existing `updateStreaks()` logic
- Kid sees: "Restored full points for 'Clean Kitchen' on Apr 12 (+18 pts)"
- The restored points also flow into the rewards balance (since balance reads from snapshots) — double benefit: better grade + more spendable points
- `penalty-removed` confirmation message written, bank token marked `used: true`

### Streak requirements

- Rewards with `streakRequirement` are only requestable when the person has `streaks/{personId}.current >= streakRequirement` AND sufficient points
- Store UI shows streak badge: "🔥 5-day streak required"
- If points sufficient but streak insufficient: "Need 3 more days"
- Penalty Removal is strategically valuable here — it can save a streak that would otherwise break, keeping higher-tier rewards accessible

### Edge cases

- **No penalized tasks when using Penalty Removal token:** Show "No penalties to remove right now" — token stays in bank, not consumed.
- **No incomplete tasks when using Task Skip token:** Show "All tasks done — nothing to skip!" — token stays in bank.
- **Negative balance (via parent deductions):** Allowed. Balance shows in red. All rewards unrequestable until positive.
- **Archived rewards with pending requests:** Pending request stays in parent bell with "(Archived)" badge. Still approvable/deniable.
- **Multiple penalty removals:** Each targets the next-highest-damage penalized task.
- **`maxRedemptions` enforcement:** Count `redemption-approved` messages for a reward across all people. When count >= `maxRedemptions`, reward shows "Sold out" in store.

---

## 7. Notification Bell & In-App Messaging

### Header integration

`renderHeader()` in `components.js` gets a bell icon right of the page title. Badge count of unseen items. Present on every page that renders the header.

### Parent bell (dashboard, calendar, scoreboard, tracker, admin)

Tap opens a dropdown sheet anchored to the bell:
- **Pending requests** — redemption requests awaiting approval. Approve/Deny inline.
- **Recent activity** — bonuses/deductions sent, redemptions fulfilled. Last 20 items.
- "Send Message" button at the top

Real-time via `onValue` listener on `messages/` paths, filtered to unseen items where parent needs to act.

### Kid bell (kid mode)

Badge shows count of unseen messages for this kid. Tap opens the card overlay (full-screen celebration/notification cards, not a dropdown).

### Parent vs kid role detection

No new `role` field on people. The app uses **PIN authentication** as the role boundary:
- **Kid mode** (`kid.html?kid=Name`): always kid context. Bell shows kid-specific content for that person.
- **All other pages**: user has passed PIN (or is in the 30-min session cache). Bell shows parent content.
- This matches the existing model — kid mode is isolated, everything else is PIN-gated.

### What counts as "unseen" per role

- **Parent (all non-kid pages):** `redemption-request` messages where `seen: false` across all people
- **Kid (kid mode):** `bonus`, `deduction`, `redemption-approved`, `redemption-denied`, `task-skip-used`, `penalty-removed` messages where `seen: false` for their personId

### Admin message management

People tab (or subtab) in admin:
- Full message history per person — scrollable, grouped by date, newest first
- Bulk clear old messages (triggers balance anchor write first)
- Balance reset per person
- Read-only management — not the primary interaction point

---

## 8. Kid Mode Experience

### Layout changes to kid.html

**Balance header** — below kid's name/greeting. Large coin icon + point balance. Shows today's in-progress earning: "Today so far: +82 pts". Animated count-up on load.

**Message cards** — unseen messages appear as card overlays above everything. Tap to acknowledge one at a time.

**Bank ("Power-Ups")** — if kid has unused tokens: "Your Power-Ups: ⏭ Task Skip x2 | 🛡 Penalty Removal x1". Tap a token to use immediately.

**Store access** — "🎁 Store" button in balance header area. Opens a bottom sheet with:
- Available rewards grid
- Progress bars, streak requirements, "Get it!" buttons
- Current balance at top for context

**Message history** — "History" link in balance area. Opens scrollable sheet showing all past messages: icon, title, note, point change (+/-), date. Grouped by date, newest first. Read-only ledger.

**Real-time updates** — `onValue` listener on `messages/{personId}` and `bank/{personId}`. New messages pop as overlays without page reload. Balance updates live.

---

## 9. Scoreboard & Dashboard Integration

**Scoreboard:** Balance row in each person's leaderboard card — coin icon + current balance. Not ranked by balance (not a competition metric).

**Dashboard:** Notification bell in header. No other changes — dashboard stays task-focused.

**Calendar, Tracker:** Bell in header only.

**Admin:** Bell in header + new Rewards tab + People tab gets balance reset and clear history.

### No new files

- No new HTML pages
- No new CSS files
- Reward card/store styles go in `components.css` (shared) and `kid.css` (kid-specific)
- Bell styles go in `components.css`
- Admin rewards tab styles go in `admin.css`

---

## 10. Scoring Integration

### What the rewards system does NOT modify

- `dailyScore()`, `buildSnapshot()`, `aggregateSnapshots()` — unchanged
- Grade calculation, streak calculation — unchanged
- Scheduler — unchanged

### Penalty Removal system action (on token use)

1. Find person's completion with largest `(basePoints - earnedPoints)` gap where `isLate: true`
2. Delete `pointsOverride` and `isLate` from that completion record
3. Recalculate and overwrite the snapshot for that date via `buildSnapshot()`
4. If restored day becomes 100%, update streaks via existing `updateStreaks()` logic
5. Write `penalty-removed` confirmation message

### Task Skip system action (on token use)

1. Kid picks an incomplete task from today/tomorrow
2. Write `exempt: true` on the schedule entry (not the task definition — just this one entry)
3. `dailyPossible()` already skips exempt entries — drops from scoring automatically
4. Task card shows "Skipped" badge
5. Write `task-skip-used` confirmation message

---

## 11. Firebase CRUD Additions (shared/firebase.js)

New functions needed:
- `readRewards()` / `writeReward()` / `archiveReward()`
- `readMessages(personId)` / `writeMessage(personId, data)` / `markMessageSeen(personId, msgId)` / `clearMessages(personId, beforeTimestamp)`
- `readBalanceAnchor(personId)` / `writeBalanceAnchor(personId, data)`
- `readBank(personId)` / `writeBankToken(personId, data)` / `markBankTokenUsed(personId, tokenId, entryKey)`
- `onMessages(personId, callback)` — real-time listener
- `onBank(personId, callback)` — real-time listener
- `calculateBalance(personId, snapshots, messages, anchor)` — pure helper (could live in scoring.js)
