# Rewards Pass 2 — Header & Tabs Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Page chrome stops looking dated. Native `<select>` person switcher replaced with a chip+sheet picker. "Approvals" tab fits at native font size. Sparkline gets a label. Family banner echoes from the scoreboard. Bell badge shows a count for parents (Feature L).

**Spec:** [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md) — "Pass 2 — Header & Tabs Rebuild".

**Pass 1 context loaded:** Description plumbing landed in renderRewardCard/renderBankToken/intent sheet. Filter sheets use renderFormFooter. Bell dot indicator already exists at `shared/components.js:4061-4063` (toggles `is-hidden` class on `#headerBellDot`); Pass 2 upgrades it to show a count for parents.

**Files touched:**
- `rewards.js` — replace person switcher, rename tab, render sparkline label, render family banner
- `shared/components.js` — bell count upgrade; possibly extend `renderHeader` with count support
- `styles/rewards.css` — switcher chip style, family banner styles, remove font-xs override on tabs
- `sw.js` — cache bumps per task

**Commits:** 5 (4 feature + 1 docs).

---

## Task 1: Person switcher — chip + bottom sheet (replaces native `<select>`)

**Files:**
- `rewards.js` — replace `renderPersonSwitcherChip` + listener; add `openPersonSwitcherSheet`; persist to localStorage
- `styles/rewards.css` — chip + sheet row styling
- `sw.js` — bump cache v274 → v275

**Why:** Native `<select>` looks out-of-vocab with the design system. Header comment at [rewards.js:162-164](../../../rewards.js#L162) even apologizes for it. Replace with a chip that opens a bottom sheet with avatars (matches the scoreboard pattern).

### Step 1: Replace `renderPersonSwitcherChip`

In [rewards.js](../../../rewards.js), find the function around line 157-168:

```js
function renderPersonSwitcherChip() {
  if (!activePerson || people.length <= 1) return '';
  const opts = people.map(p =>
    `<option value="${esc(p.id)}"${p.id === activePerson.id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  // Title was getting truncated to "Rew..." because the "View as" label took ~50px
  // beyond the dropdown. The styled select with the person's name + chevron is
  // self-explanatory in this header context.
  return `<label class="rewards-view-as" aria-label="View as person">
    <select class="rewards-view-as__select" id="personSwitcherSelect">${opts}</select>
  </label>`;
}
```

REPLACE with:

```js
function renderPersonSwitcherChip() {
  if (!activePerson || people.length <= 1) return '';
  return `<button class="rewards-view-as-chip" id="personSwitcherChip" type="button" aria-label="Switch person">
    <span class="rewards-view-as-chip__avatar" style="--person-color: ${esc(activePerson.color || 'var(--accent)')}">${esc((activePerson.name || '?')[0].toUpperCase())}</span>
    <span class="rewards-view-as-chip__name">${esc(activePerson.name)}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
  </button>`;
}
```

### Step 2: Add `openPersonSwitcherSheet`

Add this function near other openers (after `openShopFilterSheet` is a logical spot, but place where the file's existing sheet-helpers cluster):

```js
function openPersonSwitcherSheet() {
  const mount = document.getElementById('sheetMount');
  const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  const rows = people.map(p => `
    <button class="person-switcher-row${p.id === activePerson?.id ? ' is-active' : ''}" data-person-id="${esc(p.id)}" type="button">
      <span class="person-switcher-row__avatar" style="--person-color: ${esc(p.color || 'var(--accent)')}">${esc((p.name || '?')[0].toUpperCase())}</span>
      <span class="person-switcher-row__name">${esc(p.name)}</span>
      ${p.id === activePerson?.id ? `<span class="person-switcher-row__check">${CHECK_SVG}</span>` : ''}
    </button>
  `).join('');

  mount.innerHTML = renderBottomSheet(`
    <h3 class="sheet-section-title">View as</h3>
    <div class="person-switcher-list">${rows}</div>
  `);
  requestAnimationFrame(() => document.getElementById('bottomSheet')?.classList.add('active'));
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target.id === 'bottomSheet') mount.innerHTML = '';
  });

  mount.querySelectorAll('.person-switcher-row[data-person-id]').forEach(row => {
    row.addEventListener('click', () => {
      const pid = row.dataset.personId;
      const next = people.find(p => p.id === pid);
      if (next) {
        activePerson = next;
        try { localStorage.setItem('rewards-active-person', pid); } catch {}
        mount.innerHTML = '';
        render();
      }
    });
  });
}
```

### Step 3: Wire up the chip click and persist on first load

Find the existing chip mount code around line 148:

```js
      chipMount.innerHTML = renderPersonSwitcherChip();
      document.getElementById('personSwitcherSelect')?.addEventListener('change', e => {
        activePerson = people.find(p => p.id === e.target.value) || activePerson;
        render();
      });
```

REPLACE with:

```js
      chipMount.innerHTML = renderPersonSwitcherChip();
      document.getElementById('personSwitcherChip')?.addEventListener('click', openPersonSwitcherSheet);
```

Also find the `setActivePerson()` function or wherever `activePerson` is initially set (around line 45-53). Look for:

```js
async function setActivePerson() {
  // ...some role-detection logic...
  if (kidParam) {
    // kid-mode resolution
  } else if (personParam) {
    // ?person= URL param
  } else {
    activePerson = people.find(p => p.role !== 'child') || people[0];
  }
  if (!viewerPerson) viewerPerson = activePerson;
}
```

UPDATE the default-selection branch to consult `localStorage` first. Replace:

```js
    activePerson = people.find(p => p.role !== 'child') || people[0];
```

WITH:

```js
    // Restore last-selected person from localStorage; fall back to first adult
    let restored = null;
    try {
      const savedId = localStorage.getItem('rewards-active-person');
      if (savedId) restored = people.find(p => p.id === savedId);
    } catch {}
    activePerson = restored || people.find(p => p.role !== 'child') || people[0];
```

(Leave the `?kid=` and `?person=` branches alone — those URL params still take precedence.)

### Step 4: CSS

In [styles/rewards.css](../../../styles/rewards.css), REPLACE the existing `.rewards-view-as` rules with the new chip + sheet rules. First DELETE these rules (they reference the old select element):

Find and DELETE:

```css
.rewards-view-as {
  /* …existing styles… */
}

.rewards-view-as__select {
  /* …existing styles… */
}
```

Then APPEND at the end of the file:

```css
/* ── Person switcher chip (Pass 2 — replaces native <select>) ── */
.rewards-view-as-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text);
  font-size: var(--font-xs);
  font-weight: 600;
  cursor: pointer;
}

.rewards-view-as-chip:hover,
.rewards-view-as-chip:focus-visible {
  background: var(--surface-3);
  outline: none;
}

.rewards-view-as-chip__avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--person-color, var(--accent));
  color: white;
  font-weight: 700;
  font-size: 11px;
  flex-shrink: 0;
}

.rewards-view-as-chip__name {
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rewards-view-as-chip svg {
  color: var(--text-muted);
}

/* ── Person switcher bottom-sheet rows ── */
.person-switcher-list {
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}

.person-switcher-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.person-switcher-row:last-child { border-bottom: none; }
.person-switcher-row:hover { background: var(--surface-2); }
.person-switcher-row.is-active { background: var(--accent-soft); }

.person-switcher-row__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--person-color, var(--accent));
  color: white;
  font-weight: 700;
  flex-shrink: 0;
}

.person-switcher-row__name {
  flex: 1;
  font-weight: 500;
}

.person-switcher-row__check {
  color: var(--accent);
}
```

### Step 5: Bump cache

`v274 → v275`.

### Step 6: Verify

Open `http://localhost:8080/rewards.html`. The native `<select>` should be gone; a small chip with avatar + name + down-chevron appears in the header. Tap it → bottom sheet opens with one row per person, current person marked with a checkmark. Tap a row → switches active person and closes the sheet. Reload — the last-selected person should persist.

### Step 7: Commit

```bash
git add rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): person switcher is now a chip + bottom sheet

Replaces the native <select> dropdown that has been the page's only
out-of-design-vocab element since launch. New chip shows avatar +
name + chevron; tap opens a list of all people with their avatars
and a checkmark on the active one.

Selection persists to localStorage['rewards-active-person'] so
refreshing the page keeps the chosen view. URL params (?kid=,
?person=) still take precedence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tab rename + sparkline label + drop font-xs override

**Files:**
- `rewards.js` — change "Approvals" → "Approve"; add label below sparkline
- `styles/rewards.css` — drop the font-xs override on `.rewards-tabs`; add sparkline label rule
- `sw.js` — bump cache v275 → v276

### Step 1: Rename Approvals tab

Find `renderTabsHtml()` (Pass 1 left it gating on `viewerPerson?.role`). The tab definition is:

```js
const tabs = [
  { id: 'shop', label: 'Shop' },
  { id: 'bank', label: 'Bank' },
  { id: 'history', label: 'History' },
  ...(showApprovals ? [{ id: 'approvals', label: 'Approvals' }] : []),
];
```

CHANGE the label from `'Approvals'` to `'Approve'`:

```js
  ...(showApprovals ? [{ id: 'approvals', label: 'Approve' }] : []),
```

The `id` stays `'approvals'` so all internal references continue to work.

### Step 2: Drop font-xs override on tabs

In [styles/rewards.css](../../../styles/rewards.css), find the `.rewards-tabs` rule (around line 136). The comment admits the font-size shrink was a fix for "Approvals" not fitting. Find:

```css
.rewards-tabs {
  /* ...other rules... */
  font-size: var(--font-xs); /* "Approvals" doesn't fit at normal size */
}
```

DELETE the `font-size: var(--font-xs);` line (keep the rest of the rule). If the rule has nothing else (just the font-size override), delete the whole rule.

### Step 3: Add sparkline label

Find where the sparkline is rendered. Search for `renderTrendLine` or `rewards-balance-zone`. The render likely happens in a function like `renderBalanceZone()` or directly in `render()`. The output looks something like:

```js
html += `<div class="rewards-balance-zone">
  <div class="rewards-balance__avatar">…</div>
  <div class="rewards-balance__info">
    <div class="rewards-balance__name">${esc(activePerson.name)}</div>
    <div class="rewards-balance__amount">${balance.toLocaleString()}<span class="rewards-balance__unit">pts</span></div>
  </div>
  ${renderTrendLine(activePerson.id)}
</div>`;
```

The sparkline is the SVG produced by `renderTrendLine`. INSERT a small label below it. Find `renderTrendLine` (around line 178). Wrap its output. Either modify the return inside `renderTrendLine` to include the label, OR wrap at the call site.

**Recommended approach (wrap at call site):**

Replace `${renderTrendLine(activePerson.id)}` with:

```js
<div class="rewards-trend-wrap">
  ${renderTrendLine(activePerson.id)}
  <div class="rewards-trend__label">30-day balance</div>
</div>
```

### Step 4: CSS

Add in [styles/rewards.css](../../../styles/rewards.css):

```css
/* ── Sparkline label (Pass 2) ── */
.rewards-trend-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.rewards-trend__label {
  font-size: 10px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

### Step 5: Bump cache

`v275 → v276`.

### Step 6: Verify

Reload. "Approve" appears in the tab row (not "Approvals"). All four tabs render at the normal font size — no compression. Below the header sparkline, a small uppercase label reads "30-DAY BALANCE".

### Step 7: Commit

```bash
git add rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): rename tab to Approve + sparkline label + drop font-xs

- 'Approvals' tab renamed to 'Approve' so it fits at native size.
  Internal id stays 'approvals'.
- Drop the .rewards-tabs font-xs override; all tabs render at the
  shared tab font now.
- Sparkline gains a small '30-DAY BALANCE' label below for context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Family banner (adult mode only)

**Files:**
- `rewards.js` — render banner above tabs in adult mode; compute family aggregate balance + week-over-week trend
- `styles/rewards.css` — banner styles (mirror `.sb-family-banner` pattern)
- `sw.js` — bump cache v276 → v277

**Why:** Echo the scoreboard's family banner pattern. Frames the family as a team — "8,432 pts in circulation" — for adult-mode viewers.

### Step 1: Add a helper `familyTotalBalance`

In `rewards.js`, near other helper functions, ADD:

```js
/** Sum spendable balance across all people. Used for adult-mode banner. */
function familyTotalBalance() {
  let total = 0;
  for (const p of people) {
    total += getBalance(p.id);
  }
  return total;
}

/** Approximate week-over-week change: balance now minus balance 7 days ago. */
function familyBalanceTrendDirection() {
  // Compare current total vs total at 7 days ago. Without historical-balance
  // snapshots, approximate using snapshot percentage + multipliers summed for
  // pre-window vs in-window. Cheap approach: compare last-7-day earnings sum.
  const tz = settings?.timezone || 'UTC';
  const today = todayKey(tz);
  let last7 = 0, prior7 = 0;
  for (const p of people) {
    if (!allSnapshots) continue;
    let cur = addDays(today, -6);
    while (cur <= today) {
      const pct = allSnapshots[cur]?.[p.id]?.percentage || 0;
      const mult = allMultipliers?.[cur]?.[p.id]?.multiplier || 1;
      last7 += pct * mult;
      cur = addDays(cur, 1);
    }
    let cur2 = addDays(today, -13);
    while (cur2 <= addDays(today, -7)) {
      const pct = allSnapshots[cur2]?.[p.id]?.percentage || 0;
      const mult = allMultipliers?.[cur2]?.[p.id]?.multiplier || 1;
      prior7 += pct * mult;
      cur2 = addDays(cur2, 1);
    }
  }
  if (last7 === 0 || prior7 === 0) return null;
  const diff = ((last7 - prior7) / prior7) * 100;
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return null;
}
```

Note: `addDays` and `todayKey` need to be imported from `shared/utils.js` if not already. Search at the top of `rewards.js` for the utils import line and verify.

### Step 2: Render the banner

In the main `render()` function (or wherever the page chrome is built — likely after the balance zone and before the tabs), find a good spot and add:

```js
  // Family banner — adult mode only, hidden when only one person
  if (!isKidMode && people.length > 1 && viewerPerson?.role !== 'child') {
    const familyTotal = familyTotalBalance();
    const trendDir = familyBalanceTrendDirection();
    const trendArrow = trendDir === 'up'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>'
      : trendDir === 'down'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>'
      : '';
    document.getElementById('rewardsBannerZone').innerHTML = `<div class="rewards-family-banner">
      <span class="rewards-family-banner__label">Family</span>
      <span class="rewards-family-banner__amount">${familyTotal.toLocaleString()} pts in circulation</span>
      ${trendArrow}
    </div>`;
  } else {
    const z = document.getElementById('rewardsBannerZone');
    if (z) z.innerHTML = '';
  }
```

The `#rewardsBannerZone` div already exists in [rewards.html](../../../rewards.html) (line 26). We're using it for this banner.

Find the right insertion point in `render()`. Look for where the page chrome (balance zone + tabs) is set. Add the family banner injection there.

### Step 3: CSS

In [styles/rewards.css](../../../styles/rewards.css), append:

```css
/* ── Family banner (Pass 2 — echoes scoreboard) ── */
.rewards-family-banner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--surface-2);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--accent);
}

.rewards-family-banner__label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text);
}

.rewards-family-banner__amount {
  font-size: var(--font-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.rewards-family-banner svg {
  margin-left: auto;
  color: var(--text-muted);
}
```

### Step 4: Bump cache

`v276 → v277`.

### Step 5: Verify

Adult mode: banner appears at the top of the page above the tabs showing "Family · NNN pts in circulation · ↑/↓ (when trend data sufficient)". Kid mode (`?kid=Lexi`): banner is absent. Switch via the new person switcher to a kid — banner stays visible (because `viewerPerson` is the page owner, set on first load).

### Step 6: Commit

```bash
git add rewards.js styles/rewards.css sw.js
git commit -m "$(cat <<'EOF'
feat(rewards): family banner echoes scoreboard pattern (adult mode)

Slim banner above the tabs in adult mode shows total spendable
balance across the family + a week-over-week trend arrow when data
is sufficient. Hidden in kid mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Bell badge count for parents (Feature L)

**Files:**
- `shared/components.js` — upgrade `#headerBellDot` to optionally show a count
- `sw.js` — bump cache v277 → v278

**Why:** The bell already has a dot indicator at [shared/components.js:4061-4063](../../../shared/components.js#L4061) that toggles `is-hidden` based on pending message count. The current behavior is binary (dot on/off). Feature L is: show the actual count for parents so they know how many approvals are waiting at a glance.

### Step 1: Update header to render the dot as a count badge

Find `_renderHeaderV2` around [shared/components.js:950](../../../shared/components.js#L950). The bell HTML around line 955:

```js
    ? `<button class="app-header__icon-btn" id="headerBell" aria-label="Notifications" type="button">
         <!-- icon SVG -->
         <span class="btn-icon__dot is-hidden" id="headerBellDot" aria-hidden="true"></span>
       </button>`
```

The dot is a `<span class="btn-icon__dot">` — it has no text content. UPDATE it so it can hold a count:

```js
    ? `<button class="app-header__icon-btn" id="headerBell" aria-label="Notifications" type="button">
         <!-- icon SVG -->
         <span class="btn-icon__dot is-hidden" id="headerBellDot" aria-hidden="true"></span>
       </button>`
```

The HTML doesn't actually need to change — the existing span can hold text. The CSS controls its appearance.

### Step 2: Update `initBell` to write count text into the dot

Find the v2-header path at [shared/components.js:4061-4064](../../../shared/components.js#L4061):

```js
    const dot = document.getElementById('headerBellDot');
    if (dot) {
      dot.classList.toggle('is-hidden', count === 0);
      return;
    }
```

REPLACE with:

```js
    const dot = document.getElementById('headerBellDot');
    if (dot) {
      dot.classList.toggle('is-hidden', count === 0);
      // Show a number badge for parents (any non-zero count). Keep aria silent.
      if (count > 0) {
        dot.textContent = count > 99 ? '99+' : String(count);
        dot.classList.add('btn-icon__dot--count');
      } else {
        dot.textContent = '';
        dot.classList.remove('btn-icon__dot--count');
      }
      return;
    }
```

### Step 3: CSS for the count-state dot

The `.btn-icon__dot` rule already exists (it's the small accent-colored dot). Find it. Likely in `styles/components.css` or similar. Search:

```bash
grep -nr "btn-icon__dot" styles/
```

ADD a count modifier in the same file. Append:

```css
/* Dot with a count (Pass 2 — Rewards Feature L) */
.btn-icon__dot--count {
  /* Override the small-dot rule: enlarge to fit text, keep accent color */
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  color: white;
  background: var(--danger, var(--accent));
}
```

(If the existing `.btn-icon__dot` rule already specifies `background`, this override stays compatible. Don't change the base rule.)

### Step 4: Bump cache

`v277 → v278`.

### Step 5: Verify

Open `http://localhost:8080/rewards.html`. If pending approval-request or use-request messages exist in dev data, the bell shows a numeric badge. If none exist, the dot is hidden.

Manual test if data is empty: in DevTools, run:

```js
document.getElementById('headerBellDot').classList.remove('is-hidden');
document.getElementById('headerBellDot').textContent = '3';
document.getElementById('headerBellDot').classList.add('btn-icon__dot--count');
```

— this should show a "3" badge in red on the bell.

### Step 6: Commit

```bash
git add shared/components.js sw.js
git commit -m "$(cat <<'EOF'
feat(bell): show pending-approval count, not just a dot (Rewards Feature L)

initBell already counted pending redemption/use-request messages
and toggled the bell dot's visibility. Now also writes the count
into the dot (capped at 99+) and expands the dot to fit a number
when count > 0. Parents see at a glance how many approvals are
waiting from any page that mounts the v2 header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Docs + push

- [ ] Append "Pass 2 — Shipped" note to [docs/superpowers/specs/2026-05-13-rewards-rebuild.md](../specs/2026-05-13-rewards-rebuild.md). Include commit SHAs.
- [ ] Stage + commit + push.

```bash
git add docs/superpowers/specs/2026-05-13-rewards-rebuild.md docs/superpowers/plans/2026-05-13-rewards-pass-2.md
git commit -m "$(cat <<'EOF'
docs(rewards): Pass 2 plan + shipped note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-review checklist

1. **Spec coverage:** 2.1 native-select → chip (Task 1) ✓; 2.2 tab rename + 2.3 sparkline label (Task 2) ✓; 2.4 family banner (Task 3) ✓; 2.5/Feature L bell badge (Task 4) ✓.
2. **No schema changes.** Only localStorage addition (`rewards-active-person`).
3. **Cache bumps:** 4 sequential (v275-v278).
4. **Bell badge affects every page using v2 header.** Verify dashboard / scoreboard / kitchen don't visually regress.
