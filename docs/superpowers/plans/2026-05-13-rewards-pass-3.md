# Rewards Pass 3 — Shop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Shop tab gets character — instant-vs-approval indicator, streak unlock preview (Feature K), sort by closest-to-affordable (Feature N), and a subtle visual upgrade to reward cards.

**Spec:** [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md) — "Pass 3 — Shop Polish".

**Pass 1+2 context loaded:**
- `renderRewardCard` accepts `streak` and `redemptionCount` and renders `description`.
- `streakRequirement` check exists in `meetsStreak`; the current locked message says `"5-day streak · need 3 more"` (no separate K-style hint).
- Reward types: `'custom'`, `'task-skip'`, `'penalty-removal'`. Functional = task-skip OR penalty-removal.
- `approvalRequired: false` field on custom rewards bypasses approval.
- Shop sort options today: `'name'` and `'cost'`.

**Files touched:**
- `shared/components.js` — `renderRewardCard`: add instant-vs-approval tag, refine streak-locked message (Feature K)
- `rewards.js` — add `'closest-affordable'` sort option in shop filter sheet (Feature N)
- `styles/rewards.css` — instant/approval tag styles + tinted icon-tile variants
- `sw.js` — cache bumps per task

**Commits:** 4 (3 feature + 1 docs).

---

## Task 1: Instant vs approval-needed indicator (3.2)

**Files:**
- `shared/components.js` — `renderRewardCard` gains a small type-tag in the badges row
- `styles/rewards.css` — type-tag styles
- `sw.js` — bump cache v278 → v279

### Step 1: Update `renderRewardCard`

In [shared/components.js:1913](../../../shared/components.js#L1913), find the badges-building block:

```js
  let badges = '';
  if (reward.streakRequirement) {
    const needed = reward.streakRequirement - streak;
    badges += `<span class="chip chip--muted">${reward.streakRequirement}-day streak${!meetsStreak ? ` · need ${needed} more` : ''}</span>`;
  }
  if (reward.maxRedemptions && stockOk) {
    badges += `<span class="chip chip--muted">${reward.maxRedemptions - redemptionCount} left</span>`;
  }
  if (!stockOk) {
    badges += `<span class="chip chip--muted">Out of stock</span>`;
  }
  if (reward.expiresAt && notExpired) {
    const daysLeft = Math.ceil((reward.expiresAt - Date.now()) / 86400000);
    if (daysLeft <= 7) badges += `<span class="chip chip--warning">Expires in ${daysLeft}d</span>`;
  }
```

INSERT a type-tag at the START of the badges string (before everything else, so it always shows first):

```js
  let badges = '';
  // Instant vs approval-needed tag (Pass 3) — appears first
  const isFunctional = reward.rewardType === 'task-skip' || reward.rewardType === 'penalty-removal';
  const isInstant = isFunctional || reward.approvalRequired === false;
  if (showGet) {
    badges += isInstant
      ? `<span class="chip chip--instant">Instant</span>`
      : `<span class="chip chip--approval">Approval needed</span>`;
  }
  if (reward.streakRequirement) {
    const needed = reward.streakRequirement - streak;
    badges += `<span class="chip chip--muted">${reward.streakRequirement}-day streak${!meetsStreak ? ` · need ${needed} more` : ''}</span>`;
  }
  // ...rest unchanged...
```

Gate the tag on `showGet` because the bank-token side calls `renderBankToken` (different function) and the admin-side reuse would be confused by a redemption-only tag.

### Step 2: CSS

In [styles/rewards.css](../../../styles/rewards.css), append at the end:

```css
/* ── Reward type tags (Pass 3) ── */
.chip.chip--instant {
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 35%, transparent);
}

.chip.chip--approval {
  background: color-mix(in srgb, var(--info) 18%, transparent);
  color: var(--info);
  border: 1px solid color-mix(in srgb, var(--info) 35%, transparent);
}
```

### Step 3: Bump cache

`v278 → v279`.

### Step 4: Verify

Open `http://localhost:8080/rewards.html`. Each reward card should show "Instant" (green) on Task Skip + Remove Penalty + any custom reward with `approvalRequired: false`, and "Approval needed" (blue) on the others.

### Step 5: Commit

```bash
git add shared/components.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): instant vs approval-needed tag on reward cards

Each shop card gains a small tag as the first badge: 'Instant'
(green, for functional rewards and custom rewards with
approvalRequired:false) or 'Approval needed' (blue, default).

Currently the tap behavior of these two reward types diverges
(functional → bank, custom-with-approval → request flow) but
the UI gave no signal until after tap. Pass 3.2 fixes that.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Streak unlock preview (Feature K)

**Files:**
- `shared/components.js` — refine the streak-locked message in `renderRewardCard`
- `sw.js` — bump cache v279 → v280

**Why:** Today a streak-locked reward shows `"5-day streak · need 3 more"` plus the card is dimmed. The user approved Feature K: a clearer "unlock progress" message that frames the gate positively — `"Unlocks at 7-day streak (you're at 3)"`.

### Step 1: Update streak-locked badge

In [shared/components.js:1922-1926](../../../shared/components.js#L1922) (after Pass 3 Task 1's insert), find:

```js
  if (reward.streakRequirement) {
    const needed = reward.streakRequirement - streak;
    badges += `<span class="chip chip--muted">${reward.streakRequirement}-day streak${!meetsStreak ? ` · need ${needed} more` : ''}</span>`;
  }
```

REPLACE with:

```js
  if (reward.streakRequirement) {
    if (meetsStreak) {
      // Unlocked — show a small "X-day streak" check chip
      badges += `<span class="chip chip--muted">${reward.streakRequirement}-day streak ✓</span>`;
    } else {
      // Locked — clearer progress message
      badges += `<span class="chip chip--lock">Unlocks at ${reward.streakRequirement}-day streak (you're at ${streak})</span>`;
    }
  }
```

### Step 2: CSS

In [styles/rewards.css](../../../styles/rewards.css), append:

```css
/* ── Streak-locked chip (Pass 3 — Feature K) ── */
.chip.chip--lock {
  background: color-mix(in srgb, var(--warning) 18%, transparent);
  color: var(--warning);
  border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
  white-space: normal; /* allow wrap if long */
}
```

### Step 3: Bump cache

`v279 → v280`.

### Step 4: Verify

To force-test (since current data may not have streak-gated rewards), in DevTools:

```js
// Find a reward card and check its badges
document.querySelectorAll('.card--reward .card__badges').forEach(b => console.log(b.textContent));
```

If you have a streak-gated reward, the card should show `"Unlocks at N-day streak (you're at M)"` instead of `"N-day streak · need M more"`. If you have no streak-gated rewards, the change is invisible until one is added in admin.

### Step 5: Commit

```bash
git add shared/components.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): streak unlock preview message (Feature K)

Reward cards with streakRequirement now show one of:
- 'N-day streak ✓' (unlocked, muted chip)
- 'Unlocks at N-day streak (you're at M)' (locked, warning chip)

Replaces the awkward 'N-day streak · need K more' message that
read as a penalty rather than a goal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Sort by closest to affordable (Feature N)

**Files:**
- `rewards.js` — extend `sortOpts` and the sort logic in `renderShopTab` + `openShopFilterSheet`
- `sw.js` — bump cache v280 → v281

**Why:** Users want to see "what can I almost afford?" — the rewards just within reach. Add a third sort: order by gap-from-affordable ascending.

### Step 1: Extend sort logic in `renderShopTab`

In [rewards.js:391-392](../../../rewards.js#L391), the current sort branch is:

```js
  if (shopFilter.sort === 'cost') visible.sort((a, b) => (a.pointCost || 0) - (b.pointCost || 0));
  else visible.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
```

REPLACE with:

```js
  if (shopFilter.sort === 'cost') {
    visible.sort((a, b) => (a.pointCost || 0) - (b.pointCost || 0));
  } else if (shopFilter.sort === 'closest') {
    // Closest-to-affordable: smallest positive gap first, then unaffordables by gap,
    // then already-affordable items by cost ascending.
    visible.sort((a, b) => {
      const gapA = (a.pointCost || 0) - balance;
      const gapB = (b.pointCost || 0) - balance;
      // Items I CAN afford (gap <= 0): sort by cost descending (treat the just-barely as closest first)
      // Items I CAN'T afford (gap > 0): sort by gap ascending (smallest gap first)
      // Mix: affordable items come first, then unaffordable.
      if (gapA <= 0 && gapB > 0) return -1;
      if (gapA > 0 && gapB <= 0) return 1;
      if (gapA <= 0 && gapB <= 0) return (b.pointCost || 0) - (a.pointCost || 0);
      return gapA - gapB;
    });
  } else {
    visible.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
```

### Step 2: Add sort option to filter sheet

In [rewards.js:477](../../../rewards.js#L477), find:

```js
  const sortOpts = [{ v: 'name', l: 'Name' }, { v: 'cost', l: 'Cost' }];
```

UPDATE to include the new option:

```js
  const sortOpts = [
    { v: 'name', l: 'Name' },
    { v: 'cost', l: 'Cost' },
    { v: 'closest', l: 'Closest to affordable' },
  ];
```

### Step 3: Bump cache

`v280 → v281`.

### Step 4: Verify

Open Shop. Tap "Filter & Sort". A new "Closest to affordable" sort chip appears. Tap it → Apply. Reward order changes so:
- Items the user can afford appear first (sorted by cost descending — the highest-affordable first)
- Items the user can NOT afford follow, ordered by smallest gap first

For Jordin with 2,001 pts, expect: Yes Day (1,500) → Movie Theater (350) → ... → Special Snack (10) (affordable, descending) → Swimming (gap 249) → Playground (gap 249) → New Toy (gap 249) → Movie Night (already in the affordable group above, so skip — actually it depends on actual data) → Ice Cream Trip (gap 1,499) → Great Wolf Waterpark (gap 1,499).

### Step 5: Commit

```bash
git add rewards.js sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): sort by closest-to-affordable (Feature N)

New sort option in the Shop filter sheet:
- Affordable items first, sorted by cost descending (so 'just
  barely afford' sits at the top)
- Unaffordable items follow, sorted by gap ascending (smallest
  gap first — 'almost there')

Answers the question 'what can I almost afford?' that 'sort by
cost ascending' couldn't.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Docs + push

- [ ] Append "Pass 3 — Shipped" note to [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md) with commit SHAs.
- [ ] Stage + commit + push.

```bash
git add docs/superpowers/specs/2026-05-13-rewards-rebuild.md docs/superpowers/plans/2026-05-13-rewards-pass-3.md
git commit -m "$(cat <<'EOF'
docs(rewards): Pass 3 plan + shipped note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review checklist

1. **Spec coverage:** 3.2 instant tag → Task 1; Feature K streak preview → Task 2; Feature N sort → Task 3. The "richer card character" (3.1) was scoped to description+tags, both shipping here. ✓
2. **Reward-card visual character (3.1) intentionally light.** The description (Pass 1) + instant/approval tag (Task 1) + better streak chip (Task 2) collectively raise the card's information density. The originally-planned "tinted icon background derived from reward color" is deferred — the existing `data-bg-color` attr + `applyDataColors` machinery already exists; if richer tinting is wanted later it's a focused add.
3. **No schema changes.** ✓
4. **Cache bumps:** 3 sequential (v279-v281).
