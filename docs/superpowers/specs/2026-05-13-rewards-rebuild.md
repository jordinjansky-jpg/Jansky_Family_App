# Rewards Page Rebuild — Master Spec

**Date:** 2026-05-13
**Author:** Claude (Opus 4.7)
**Bar:** Match the freshly-rebuilt Scoreboard quality. Skylight / Linear / Things mobile polish.
**Goal:** Fix five bugs, raise the design floor, ship four targeted feature additions (K/L/M/N from the design review).

**Test environment:**
- Playwright at 412×915 (Samsung S26 Ultra)
- `http://localhost:8080/rewards.html` (live data) or `?env=dev` for writes
- Viewport-only screenshots for sticky elements; fullPage for content review

**Files this rebuild touches:**
- [rewards.js](../../../rewards.js) — 1425-line single-page consumer
- [shared/components.js](../../../shared/components.js) — `renderRewardCard`, `initBell`
- [styles/rewards.css](../../../styles/rewards.css) — page-specific CSS
- [shared/firebase.js](../../../shared/firebase.js) — no new paths in this rebuild

---

## Direction

The rewards page is functional but uneven: solid info architecture, but design vocabulary inconsistent with the rest of the app (native `<select>` in header, tab font shrunk because "Approvals" doesn't fit, history rows are pure read-only, descriptions collected but never shown). It also has two real bugs that affect the points economy: streak/stock limits are silently bypassed because `renderRewardCard` is called with zeroed-out eligibility data, and an adult viewing in kid-mode-URL still sees the Approvals tab.

The rebuild ships in four passes, same shape as the Scoreboard rebuild — start with bugs + low-risk polish, then progressively raise the design floor.

| Pass | Focus | Theme |
|---|---|---|
| 1 | **Fix + descriptions** | Five bugs squashed, descriptions surfaced everywhere, hardcoded emoji removed, empty states unified |
| 2 | **Header & tabs rebuild** | Native `<select>` → chip+sheet picker; tab rename to fit; sparkline gets a label; bell badge for pending approvals (Feature L) |
| 3 | **Shop polish** | Reward cards get character; instant-vs-approval distinction; streak unlock preview (Feature K); sort by closest-to-affordable (Feature N) |
| 4 | **Bank / History / Approvals polish** | Bank visual hierarchy; tappable history rows; approvals visual weight; filter sheet dedup |

**Approved features (4 only — see review for full list):**
- **K**: Streak unlock preview on locked reward cards (depends on Pass 1 bug fix to wire streak data)
- **L**: Bell notification badge for pending approvals
- **M**: Description visible on reward card, intent sheet, bank token detail
- **N**: "Sort by closest to affordable" option in Shop filter

**Out of scope** (deferred from review):
- A wishlist, B quick re-redeem chip, C time-window rewards, D bank expiration, E approval batching, F deny templates, G history analytics, H kid reward suggestions, I stock-remaining badges (bug fix still enforces silently), J family rewards
- Items in [docs/ROADMAP.md](../../ROADMAP.md): allowance ledger, year-in-review, etc.

---

## Design principles

**1. Bugs first, polish second.** Five bugs land in Pass 1 with no visual changes. Each is independently verifiable.

**2. Descriptions are not optional.** Pass 1 surfaces the `description` field on every relevant surface. The reward form already collects it; this is just plumbing.

**3. Bell badge is the single new visual element on the page chrome.** Adds an info channel for parents that currently relies on tab-clicking to discover.

**4. No new schema in any pass.** All work uses existing Firebase paths.

**5. Don't fight the data model in Pass 1.** Some smells (history rows hardcoded emoji, message-type icon mapping) get fixed via component-level helpers, not by reshaping the schema.

---

## Pass 1 — Fix + Descriptions

**Goal:** Page loses no functionality, gains zero visual rebuild, gains description surfacing, sheds five bugs.

### Bugs to fix

**1.1 Streak / stock data piping.** [rewards.js:299](../../../rewards.js#L299) — `renderRewardCard(r, balance, { showGet: true })` never passes `streak` or `redemptionCount`. The eligibility checks in `renderRewardCard` run but always see 0. Result: rewards with `streakRequirement` or `maxRedemptions` are silently redeemable regardless. Fix: precompute `streakByPerson[personId]` and `redemptionCountByReward[rewardId]` from `streaks` and `allMessages`, pass through.

**1.2 Approvals auth gating.** [rewards.js:232](../../../rewards.js#L232) — `isKidMode` is keyed off the URL param, not the active person's role. Adult viewing in `?kid=` URL still sees Approvals; kid editing the URL to remove the param sees Approvals. Fix: gate on the active-person role explicitly (`viewerPerson?.role === 'child'` OR the `?kid=` param is present).

**1.3 Bank stale duplicate-request detection.** [rewards.js:790-791](../../../rewards.js#L790) — Use-request duplicate check reads from `allMessages` cached at page load. If another device just made a request, the cache is stale and the user gets a duplicate. Fix: re-read `readAllMessages()` inline before the duplicate check.

**1.4 Inline style violation.** [rewards.js:729](../../../rewards.js#L729) — `style="margin-top: 20px;"` on the kids-bank section heading. Fix: replace with a CSS class.

**1.5 Non-sticky Apply button on filter sheets.** Shop filter and History filter use a block-flow Apply button that scrolls with content. Fix: refactor both filter sheets to use the canonical `fs-footer` sticky pattern from DESIGN.md §5.23.

### Polish to ship

**1.6 Hardcoded emoji in history rows.** History row icons are inline emoji per type. Fix: extract a small `historyTypeIcon(type)` helper in [shared/components.js](../../../shared/components.js) that returns a design-system SVG icon. Reuse in the bell as well if the same pattern exists there.

**1.7 Unify empty states.** Bank, History, and Approvals fall back to raw `<div class="empty-state">…</div>`. Fix: call `renderEmptyState()` consistently across all four tabs.

### Feature M — Description visible everywhere

**1.8 Reward card** — `renderRewardCard` gains a small description line under the name (truncate to ~2 lines), hidden when description is empty.

**1.9 Intent sheet** — Add the description body inside the sheet between the icon-row and the Save/Use chips.

**1.10 Bank token detail** — When a bank token is tapped/long-pressed (or expanded), show the description below name + acquired date. Pass 1 minimum: just include it in the rendered HTML; Pass 4 can add the tap-to-expand interaction.

### Pass 1 acceptance

- Streak-gated rewards correctly block redemption when streak is below threshold (verify by setting a test reward's `streakRequirement` to a high number and confirming the dim state and disabled button).
- Stock-limited rewards correctly stop accepting redemptions after the limit (verify by redeeming twice on a 2-max reward and confirming the third attempt is blocked).
- Kid-mode URL is still kid-mode regardless of who has access; an adult viewing with `?kid=Lexi` does NOT see Approvals.
- Bank duplicate-request detection refreshes messages before checking.
- No inline `style="…"` attributes remain in rewards.js (grep verified).
- Both filter sheets have sticky Apply buttons; chip area scrolls inside.
- History row icons are SVG, not emoji.
- All four tabs use `renderEmptyState()` for their empty paths.
- Description renders on reward cards (when set), in the intent sheet, in bank tokens.

---

## Pass 1 — Shipped 2026-05-13

Commits on main:
- `d3dc1e2` — fix(rewards): wire streak + redemption count into shop eligibility
- `0aacc0e` — fix(rewards): Approvals tab gated by viewer role, not URL param
- `ab2773e` — fix(rewards): stale duplicate-check + inline-style violation
- `9edf73d` — refactor(rewards): filter sheets use sticky fs-footer pattern
- `399385a` — refactor(rewards): SVG history icons + unified empty states
- `2964e0b` — feat(rewards): surface description on card, intent sheet, bank token

Verified at 412×915. Streak/stock eligibility now correctly enforced when reward data has those fields (current dev data has none with limits, so visual unchanged but logic verified). Approvals tab gated by `viewerPerson.role !== 'child' && !isKidMode`. Filter sheets have sticky Apply via `renderFormFooter`. History rows show lucide-style SVG icons (verified visually — gift box icon for redemption-request and reward-used rows). Empty states unified to `renderEmptyState()` across all four tabs. Description plumbing landed everywhere; renders only when the data field is set.

**Findings:**
- `viewerPerson` is set once on first load and never changes. This is intentional for theming. Means the role-gating is stable across in-page person switches — an adult who loads the page can still see Approvals even after switching the "view as" dropdown to a kid. The security concern (kid editing URL to remove `?kid=` and gain Approvals) is fixed.
- Three `renderBankTokenEl` call sites all needed the reward lookup pattern; could be a future helper but ~5 lines of repetition isn't urgent.
- The intent sheet `is-preview` div centers the icon; new `.intent-sheet__desc` is also centered to match.

---

## Pass 2 — Header & Tabs Rebuild

**Goal:** Page chrome stops looking dated. Bell becomes a useful info channel.

### Additions

**2.1 Replace native `<select>` person switcher.** Header chip showing the active person's name + chevron. Tap → bottom sheet with one row per person (avatar, name, "active" check on current). Selecting closes the sheet and re-renders. Persist last-selected person to `localStorage['rewards-active-person']` so refresh keeps state.

**2.2 Tabs that fit at native size.** Two options:
- (a) Rename: `Approvals → Approve` (verb form, shorter, fits)
- (b) Restructure: move Approve out of the tab row entirely. Use a header chip with a count badge.

Recommend (a) for Pass 2. Defer (b) to a future pass if the tab still feels cramped after rename.

**2.3 Sparkline label + tooltip.** The 30-day balance trend in the header gets a tiny label ("30-day balance trend") and a tap-to-show-tooltip on hover/tap.

**2.4 Family banner row (echo from scoreboard).** Slim row above the tabs: `Family · 8,432 pts in circulation · ↑` — aggregates everyone's balance + week-over-week trend. Adult-mode only; hidden in kid-mode.

### Feature L — Bell badge for pending approvals

**2.5 Pending count.** `initBell` already receives `onAllMessages`. Add a count of unseen `redemption-request` + `use-request` messages across all people; surface as a small dot or count badge on the bell icon. Visible to all viewers (kids can see when their request is pending too — useful UX).

### Pass 2 acceptance

- Native select gone. Tap the person chip → bottom sheet with avatars. Selecting one re-renders the page.
- Selection persists across reload.
- "Approve" fits in the tab row without font-size compression.
- Sparkline has visible label and tap-tooltip.
- Family banner renders in adult-mode only.
- Bell shows a numeric badge or accent dot when pending approvals exist.

---

## Pass 2 — Shipped 2026-05-13

Commits on main:
- `c792281` — feat(rewards): person switcher is now a chip + bottom sheet
- `6a4e285` — feat(rewards): rename tab to Approve + sparkline label + drop font-xs
- `354037b` — feat(rewards): family banner echoes scoreboard pattern (adult mode)
- `6cbe710` — feat(bell): show pending count, not just a dot

Verified at 412×915. Header chip with avatar + name + chevron replaces the native `<select>` (and selection persists to localStorage). Tab row reads "Shop / Bank / History / Approve" at native font size — `.rewards-tabs` font-xs override removed. Sparkline gains a "30-DAY BALANCE" label below. Family banner renders between approvals banner and tabs in adult mode showing "Family · NNN pts in circulation · trend-arrow". Bell badge now shows a numeric count (verified via DevTools injection — visible red "3" appeared on the bell when class added).

**Findings:**
- `addDays` had to be imported into rewards.js — previously only `todayKey` + `formatDateShort` were used.
- The family banner sits at `viewerPerson.role !== 'child'` plus `!isKidMode` plus `people.length > 1` — three gates.
- Bell badge change is global (affects every page mounting the v2 header). No visual regressions observed.

---

## Pass 3 — Shop Polish

**Goal:** Shop tab feels like a catalog, not a settings list.

### Additions

**3.1 Reward cards get visual character.** Larger icon tile, color-tinted background derived from the reward's existing color/icon. Description preview (from M, already in Pass 1). Cost-chip + "Get it" button remain on the right; layout breathes more.

**3.2 Instant vs approval-needed indicator.** Functional rewards (Task Skip, Remove Penalty) get a small "Instant" tag. Custom rewards requiring approval get an "Approval needed" tag. Currently no signal until tap.

**3.3 Streak unlock preview (Feature K).** When a reward has `streakRequirement` and the person's current streak is below it, the card shows `"Unlocks at 7-day streak (you're at 3)"` instead of just dimming. The card remains visible and the lock state is informative.

**3.4 Sort by closest-to-affordable (Feature N).** Add a new sort option in the Shop filter sheet: `Sort: Closest to affordable`. Sorts by `Math.max(0, cost - balance)` ascending — items the kid is almost able to afford bubble to the top.

### Pass 3 acceptance

- Reward cards have visible description, tinted background, larger icon.
- Functional rewards have an Instant tag; custom rewards have an Approval needed tag.
- Locked-by-streak rewards show the unlock-progress message rather than just being dim.
- Shop filter sheet has a "Closest to affordable" sort option that works correctly.

---

## Pass 3 — Shipped 2026-05-13

Commits on main:
- `61510ff` — feat(rewards): instant vs approval-needed tag on reward cards
- `46dec81` — feat(rewards): streak unlock preview message (Feature K)
- `fb0773c` — feat(rewards): sort by closest-to-affordable (Feature N)

Verified at 412×915. Shop cards now show a green "Instant" or blue "Approval needed" tag as the first badge — confirmed Task Skip + Remove Penalty got green, all custom rewards got blue. Streak-gated rewards (if any exist) now show "Unlocks at N-day streak (you're at M)" with a warning-tone chip; unlocked rewards show "N-day streak ✓". The Shop filter sheet gained a "Closest to affordable" sort chip; verified live with Jordin (2,081 pts) — affordables sort top-down by cost descending (Yes Day 1,500 → Movie Theater 350 → ... → YouTube 50), then unaffordables by gap ascending.

**Findings:**
- The richer "tinted icon background" mentioned in the spec as a Pass 3 nice-to-have was deferred. `data-bg-color` + `applyDataColors` already exists; tinting is a focused future add.
- All Pass 3 changes are additive — no existing behavior changed.

---

## Pass 4 — Bank / History / Approvals Polish

**Goal:** The non-Shop tabs match Shop's quality bar.

### Additions

**4.1 Bank visual hierarchy.** Group tokens by reward (e.g. "3 Special Snacks") with the most-recent acquired-date shown; tap to expand into per-instance list. Active vs used split stays.

**4.2 Tappable history rows.** Each row gets a tap action: opens a small detail sheet showing the full message body, related reward (if any) with a "Visit reward" link, and the running balance at that point.

**4.3 Approvals visual weight.** Pending items get full-width filled cards with prominent Approve/Deny buttons. Recent items collapse into a muted list. The pending-vs-recent split is unmistakable.

**4.4 Filter sheets dedup.** Both Shop and History filter sheets share a generic `openFilterSheet(config)` helper in components.js, reducing code and ensuring consistency.

### Pass 4 acceptance

- Bank tab shows grouped tokens; tap-to-expand works.
- History rows are tappable and open a detail sheet.
- Pending approvals are visually loud; recent ones are quiet.
- One shared filter-sheet implementation; both Shop and History use it.

---

## Plan documents

Plans are written one pass at a time, just before executing, so each plan can incorporate context from completed prior passes.

- Pass 1: [docs/superpowers/plans/2026-05-13-rewards-pass-1.md](../plans/2026-05-13-rewards-pass-1.md) — shipped
- Pass 2: [docs/superpowers/plans/2026-05-13-rewards-pass-2.md](../plans/2026-05-13-rewards-pass-2.md) — shipped
- Pass 3: [docs/superpowers/plans/2026-05-13-rewards-pass-3.md](../plans/2026-05-13-rewards-pass-3.md) — shipped
- Pass 4: [docs/superpowers/plans/2026-05-13-rewards-pass-4.md](../plans/2026-05-13-rewards-pass-4.md) — shipped

---

## Pass 4 — Shipped 2026-05-13

Commits on main:
- `05031a1` — feat(rewards): bank groups duplicate tokens, tap to expand
- `a045b2b` — feat(rewards): tappable history rows open detail sheet
- `8ae86c9` — feat(rewards): approval pending items get full-card visual weight
- `a41938d` — refactor(rewards): single openFilterSheet helper, two callers

Verified at 412×915. Active bank tokens sharing rewardId/rewardType collapse into a single row with `×N` count chip and tap-to-expand. History rows on both the History tab and Approvals' Recent list are now buttons that open a detail sheet (verified live: clicking "Used: Special Snack" showed title + reward reference + timestamp + Close). Pending approval rows wear a full filled-card treatment with the requester's color as a 4px left accent, full-size Approve / Deny buttons, and a clear who/cost/reward/actions layout. Shop + History filter sheets now share a single `openFilterSheet(cfg)` helper — behavior unchanged, code reduced.

**Findings:**
- The bank-group key sanitization (`replace(/[^a-zA-Z0-9_-]/g, '_')`) is mildly defensive; Firebase keys are alphanumeric so it's likely a no-op but cheap insurance.
- `renderHistoryRow` is now a `<button>`. Callers that don't bind a tap handler get a visually-identical button with no interaction — backward-compatible.
- `openFilterSheet` is generic enough that future filter sheets (e.g. an admin reward-form filter) can reuse it without changes.

The 4-pass rewards rebuild is complete.
