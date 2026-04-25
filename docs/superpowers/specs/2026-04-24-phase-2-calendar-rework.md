# Phase 2 — Calendar Rework Design Spec

**Date:** 2026-04-24
**Status:** Approved (brainstorm complete, ready for implementation plan)
**Master plan:** [docs/superpowers/plans/2026-04-19-ui-rework.md](../plans/2026-04-19-ui-rework.md) → Phase 2
**Design rules:** [docs/DESIGN.md](../../DESIGN.md), [CLAUDE.md](../../../CLAUDE.md) → *Design Rules*
**Mockups:** [mockups/02-calendar-day.html](../../../mockups/02-calendar-day.html), [mockups/02b-calendar-week.html](../../../mockups/02b-calendar-week.html) — frozen, **see §1.1 for shipped deviations**
**Predecessor:** [docs/superpowers/plans/2026-04-24-phase-1-5-dashboard-polish.md](../plans/2026-04-24-phase-1-5-dashboard-polish.md) (shipped through SW v59)

---

## 1. Goals & non-goals

**Goal.** Bring [calendar.html](../../../calendar.html) into Phase 1.5 alignment. Phone-first calendar that matches the shipped dashboard's design language. Week view becomes the phone default with a today-first vertical agenda. Day view becomes pure agenda (Events → Tasks). Month view on phone shows a soft empty-state. Sticky sub-bars keep View Tabs and date-nav reachable mid-scroll. Single filter chip pattern matches dashboard. FAB + per-day `+` for event creation.

**Non-goals (explicit):**
- Meals section — deferred to backlog 1.3, wiring note tagged in CLAUDE.md backlog.
- FAB picker (Event/Meal tile sheet) — deferred to backlog 1.3, wiring note tagged in CLAUDE.md backlog.
- Loading skeleton — deferred to backlog 3.0; current spinner remains in Phase 2.
- Time-grid (hour-by-hour vertical lanes) — retired entirely; Day view is pure agenda.
- Multi-select person filter — single-select to match dashboard.
- Drag-to-move events, .ics import, multi-day event spans — out of phase.
- Tablet two-pane month-detail layout — Phase 7.

### 1.1 Mockup deviations

The mockups in [mockups/](../../../mockups/) are frozen. Phase 2 ships these deliberate deviations:

| Mockup says | Phase 2 ships | Why |
|---|---|---|
| Week view chronological Mon → Sun | Today-first reorder via CSS `order` (today, future days, past days at bottom faded) | Dashboard parity (Phase 1.5); glanceability — the present is the anchor, not Monday |
| Day view shows time-grid (hour lanes) | Pure agenda: Events → Tasks sections | YAGNI — 90% of family events are agenda-shaped; time-grid is reversible if real demand surfaces in Phase 5+ |
| FAB → Event/Meal picker sheet | FAB → Event form direct | Meals (backlog 1.3) not built yet; no "coming soon" placeholders |
| Day view shows Meals section | Section absent in Phase 2 | Same reason; section appears when 1.3 lands |

Mockups are not updated as part of this PR (token cost). This table is the durable record of the divergence.

---

## 2. Information architecture

### 2.1 Phone calendar shell

```
┌──────────────────────────────────────────────┐
│ .app-header   (sticky, owns its own height)  │  shared header (title "Calendar" + date subtitle)
│   ├ title + date subtitle (long/short pair)  │
│   └ trailing: bell, overflow                 │
├──────────────────────────────────────────────┤
│ .cal-subbar   (sticky, top: header-height)   │  NEW — sticky controls band
│   ├ row 1: View Tabs (Month | Week | Day)    │
│   └ row 2: Day/Week date nav (← Apr 24 →)    │
│              + filter chip (right-aligned)   │
├──────────────────────────────────────────────┤
│ .banner-slot  (mounted, empty in Phase 2)    │  parity with dashboard banner queue
├──────────────────────────────────────────────┤
│ .page-content (scrolls naturally)            │
│   └ active view renders here:                │
│       Week  → vertical agenda day-blocks     │
│       Day   → Events → Tasks sections        │
│       Month → soft empty-state (≤600px)      │
├──────────────────────────────────────────────┤
│ .fab          (fixed, FAB → Event form)      │
│ .bottom-nav   (fixed, 5 tabs)                │
└──────────────────────────────────────────────┘
```

### 2.2 Week view (phone default)

Vertical agenda day-blocks, today-first ordering:

```
[Today badge] Thursday Apr 24
  Events
    [event card with time]
    [event card with time]
  Tasks  (3 of 5 done)
    [task card]
    [task card]
                                    [+]    ← per-day quick-add chip
─────────────────────────────────────────  ← divider (matches Phase 1.5 .section__head--divider)
Friday Apr 25
  Events
    [event card]
  Tasks  (0 of 4 done)
    [task card]
                                    [+]
─────────────────────────────────────────
… (Sat, Sun, Mon, Tue, Wed at the bottom — past days faded opacity 0.6)
```

Day-block ordering rule: today gets `order: 0`, future days get chronological `order: 1..6`, past days get `order: 7..` and `opacity: 0.6`. Pure CSS reorder; no animation.

If a day has no items: render the day header with a single inline "Nothing scheduled" line + the per-day `+`.

### 2.3 Day view (single date agenda)

```
Events                                        ← renderSectionHead, no divider (first section)
  [event card with "H:MM AM/PM —" prefix]
  [event card with "H:MM AM/PM —" prefix]
─────────────────────────────────────────
Tasks  (3 of 5 done)                         ← renderSectionHead({ divider: true })
  [task card]
  [task card]

(Meals section absent in Phase 2 — wiring note for 1.3)
```

Empty state (no events AND no tasks): single empty-state component, "Nothing scheduled — tap **+** to add an event."

All-day events render before timed events within the Events section (no time-label prefix). Timed events render in chronological order.

### 2.4 Month view (phone empty-state, ≤600px)

```
┌─────────────────────────────────────────┐
│  [SVG calendar icon, decorative]        │
│                                         │
│  Month view works best on a larger      │
│  screen.                                │
│                                         │
│  [ Switch to Week ]                     │
│  [ Switch to Day  ]                     │
└─────────────────────────────────────────┘
```

Decorative icon must be SVG (per design rules: no emoji in chrome). Buttons inline-switch view; selected date is preserved across the switch.

Month view above 600px keeps its existing grid renderer (untouched in Phase 2; tablet path).

### 2.5 Z-index bands

No new bands. Use existing tokens: `--z-header > --z-subbar > --z-banner > --z-content`. FAB and bottom-nav use existing `--z-fab`, `--z-nav`. If `--z-subbar` doesn't exist yet, add it between header and banner; coordinate with [styles/base.css](../../../styles/base.css).

---

## 3. Files & module boundaries

### 3.1 Files modified

| File | Responsibility | Changes |
|---|---|---|
| [calendar.html](../../../calendar.html) | Calendar shell markup | Restructure: add sticky `.cal-subbar`, mount points for `.banner-slot` + `.fab`, retire chip-row markup, retire `overflow:hidden` body class |
| [shared/calendar-views.js](../../../shared/calendar-views.js) | View renderers (~600 lines today) | Rewrite week-view as today-first vertical agenda; rewrite day-view as agenda sections; add empty-state branch in month-view when phone-width; retire all time-grid code paths. Keep as one module; add clear `// === Week view ===` style section comments |
| [styles/calendar.css](../../../styles/calendar.css) | Calendar-specific styles | Drop `overflow:hidden; height:100dvh`. Replace bespoke calendar density rules with `.card` + `.section` + `.section__head--divider` from the catalog. Add `.cal-subbar` (sticky), `.cal-day-block` (week view block), `.cal-day-add` (per-day `+` chip), `.cal-empty-month` (phone empty-state). Sweep raw hex → tokens |
| [shared/components.js](../../../shared/components.js) | Reusable renderers | Audit `renderEmptyState` — if absent, add it (`{icon, title, body, actions}`). Reuse existing `renderSectionHead`, `renderFilterChip`, `renderCard`. **No new component patterns** introduced for calendar |
| [styles/components.css](../../../styles/components.css) | Component catalog | Only if `renderEmptyState` needs CSS — likely already exists from dashboard. No new components introduced by Phase 2 |
| [styles/responsive.css](../../../styles/responsive.css) | Breakpoint overrides | Add `@media (max-width: 600px)` rules: month view = empty-state. Add fallback condense rule for View Tabs to icon-only IF measurement during build shows sub-bar height creep |
| [styles/base.css](../../../styles/base.css) | Tokens (only if needed) | Add `--z-subbar` token if not present (one line, between header and banner z-bands) |
| [sw.js](../../../sw.js) | Service worker cache | Bump `CACHE_NAME` to v60 (continuing from v59); add CACHE_BUMPS comment |
| [CLAUDE.md](../../../CLAUDE.md) | Backlog tags | Add wiring notes to backlog item 1.3 (Meals): FAB picker swap + Day-view Meals section insertion |

### 3.2 Files NOT modified (explicit)

- [dashboard.js](../../../dashboard.js) — Phase 1 surface, untouched.
- [shared/firebase.js](../../../shared/firebase.js) — schema unchanged; reuse existing `subscribeSchedule`, `subscribeCompletions`, `subscribeEvents`. Audit listener footprint (§4.4) but no rewrite expected in Phase 2.
- [shared/scheduler.js](../../../shared/scheduler.js), [shared/scoring.js](../../../shared/scoring.js), [shared/state.js](../../../shared/state.js) — pure logic, untouched.
- All other page HTML/CSS — Phase 2 is calendar-only.

### 3.3 Module boundary rules upheld

- `shared/calendar-views.js` stays pure-render (no Firebase calls; receives data as args). [calendar.html](../../../calendar.html) owns DOM mounts and listener subscriptions. Same pattern as today.
- `shared/components.js` adds **no calendar-specific helpers**. Anything calendar-specific lives in `shared/calendar-views.js`.
- No new `cal-card` density classes that duplicate `.card` — calendar uses the catalog's `.card` directly. Calendar-only structural classes (`.cal-day-block`, `.cal-subbar`, `.cal-day-add`, `.cal-empty-month`) are layout, not card variants.
- Person mode markup parity rule (Phase 1.5 amendment E) applies: all of bell, overflow, filter chip, FAB, and per-day `+` render unconditionally — no `!linkedPerson` guards.

### 3.4 Scope budget for `shared/calendar-views.js`

Today ~600 lines. Phase 2 should land at ≤600 (likely smaller — time-grid removal trims more than agenda adds). If post-build the file grows past 800 lines, file a follow-up to split into `week-view.js` + `day-view.js` + `month-view.js`. Don't pre-split in Phase 2.

---

## 4. Data flow & component contracts

### 4.1 Data flow (unchanged from today)

```
Firebase RTDB (rundown/schedule, /completions, /tasks, /people, /settings, /events)
    ↓ onValue listeners (subscribeSchedule, subscribeCompletions, subscribeEvents)
calendar.html (owns subscriptions, debounced 100ms)
    ↓ aggregates → { entries, completions, events, tasks, people, settings, viewDate, view, activePerson }
shared/calendar-views.js
    ↓ renderWeekView(...) | renderDayView(...) | renderMonthView(...)
HTML string → mounted via innerHTML at .cal-content
    ↓ post-render: applyDataColors(mountEl) for owner-stripe + chip dot colors
    ↓ event delegation for tap, long-press (800ms), per-day +
```

No Firebase schema changes. No new Firebase paths. No write-side changes.

### 4.2 View renderer contracts

```js
// shared/calendar-views.js — public API
renderWeekView({ entries, events, completions, tasks, people, settings, viewDate, activePerson, todayStr }) → htmlString
renderDayView ({ entries, events, completions, tasks, people, settings, viewDate, activePerson }) → htmlString
renderMonthView({ events, viewDate, isPhone })                                                     → htmlString
//   when isPhone: returns empty-state markup (no grid)
//   when !isPhone: returns existing month grid (untouched in Phase 2; tablet path)
```

All three renderers are pure: same input → same output, no DOM access, no Firebase calls.

### 4.3 Internal helpers (private to `calendar-views.js`)

```js
buildDayBlock(date, dayData, opts)               // week view's per-day block
sortDayBlocksTodayFirst(blocks, todayStr)        // returns blocks with CSS order set
groupEntriesByDate(entries, completions)         // existing, may need tweak for week scope
filterByPerson(items, activePerson)              // unchanged
```

### 4.4 [calendar.html](../../../calendar.html) owns

- View state (`view: 'month' | 'week' | 'day'`, `viewDate`, `activePerson`).
- Listener subscriptions and unsubscribes.
- Sub-bar interactions: View Tabs click → setView, date-nav arrows → adjustDate, filter chip → openFilterSheet.
- FAB click → openEventForm({ date: viewDate, prefill: null }).
- Per-day `+` click (delegated, week view only) → openEventForm({ date: clickedDayStr }).
- Swipe gesture binding (view-aware, retained from current implementation).
- Long-press timer (800ms calendar timing per CLAUDE.md) bound to `.card` elements.
- `applyDataColors(mountEl)` call after each render.
- Banner-slot mount (empty in Phase 2, ready for future banners).

### 4.5 Filter chip contract (already exists from Phase 1.5)

```js
renderFilterChip({ id: 'openFilterSheet', activePersonName, activePersonColor })
```

Calendar passes person name/color the same way dashboard does. Chip opens the existing filter sheet component. **No new sheet code.** Person mode pre-fills the linked person's name (chip reads "Name" not "Filter") and the sheet pre-selects them.

### 4.6 Listener footprint audit

Today: calendar attaches `onValue` to `rundown/schedule` (listens to all dates) and `rundown/completions` (all entries). With 90 days of generated schedule, payload could be large.

**Action:** during build, add a one-time measurement step — log payload sizes at first paint. If schedule payload > 100KB, evaluate scoping the listener to a date range (current week ± 4 weeks). **No optimization in Phase 2 unless measurement justifies it.** Don't pre-optimize.

---

## 5. States, gestures, edge cases

### 5.1 State coverage

| View | Empty | Loading | Error | Filtered | Done items |
|---|---|---|---|---|---|
| Week | "No events or tasks this week" + FAB hint | (defer to backlog 3.0 — current spinner OK) | "Couldn't load schedule. Pull to retry." | "No items for {Person} this week — [Show all]" | `.card--done` per Phase 1.5 (muted, no strikethrough); tasks sink within their day-block |
| Day | "Nothing scheduled — tap **+** to add" | (defer to 3.0) | Same as Week | "No items for {Person} on {date}" | Same as Week |
| Month (phone) | Always renders the soft empty-state — no other states needed | n/a | n/a | n/a | n/a |

### 5.2 Gesture matrix

| Gesture | Week view | Day view | Month view (phone) |
|---|---|---|---|
| Tap event card | Open detail sheet | Open detail sheet | n/a |
| Tap task card | Toggle complete (tap-blocked on past daily tasks → opens sheet) | Same as Week | n/a |
| Long-press card (800ms) | Detail sheet | Detail sheet | n/a |
| Tap check button | Toggle complete | Toggle complete | n/a |
| Tap per-day `+` chip | Open Event form, date pre-filled to that day | n/a (FAB serves) | n/a |
| Tap FAB | Open Event form, date pre-filled to viewDate | Same | Same |
| Tap "Today" badge in day-block | Jump to Day view for that date | n/a | n/a |
| Horizontal swipe | ±1 week | ±1 day | Disabled (no grid to swipe) |
| Tap View Tab | Switch view | Switch view | Switch view |
| Tap date-nav arrow | ±1 week | ±1 day | n/a (no date-nav in month empty-state) |
| Pull-to-refresh | Native browser; no custom handler | Same | n/a |

### 5.3 Tap-target audit

- All sub-bar buttons (View Tabs, date-nav arrows, filter chip): ≥44×44.
- Per-day `+` chip: 32px visual; ≥44×44 effective via padding around the chip.
- Card body absorbs full-width tap; check button is 32px visual / card-wide effective (Phase 1.5 model).
- FAB: 56px (matches dashboard).

Use the audit script from Phase 1.5 Task 9 against the new selectors:

```js
const targets = [
  ['#headerBell', 'Bell'],
  ['#headerOverflow', 'Overflow'],
  ['#fabAdd', 'FAB'],
  ['.check', 'Card check'],
  ['#openFilterSheet', 'Filter chip'],
  ['.bottom-nav__item', 'Nav item'],
  ['.cal-subbar__view-tab', 'View tab'],
  ['.cal-subbar__date-nav', 'Date arrow'],
  ['.cal-day-add', 'Per-day +'],
];
// expect: all ≥44×44
```

### 5.4 Reduced-motion (per Phase 1.5 Task 9)

- Week view today-first reorder: pure CSS `order`, no animation, no guard needed.
- Sticky sub-bar: position-only, no transition.
- View tab switch: instant swap in Phase 2 (no crossfade); revisit if jarring.
- Filter chip / FAB / cards: inherit Phase 1.5 reduced-motion guards.
- Day-block divider styling matches Phase 1.5's `.section__head--divider` pattern (static, no animation).

### 5.5 Edge cases

1. **Today is the only day with content in Week view.** Renders today block + 6 sparse blocks below. Empty blocks show day header + "Nothing scheduled" inline (lighter than the section empty-state — single line). Per-day `+` still present.

2. **Crossing midnight while calendar is open.** Today badge migrates via re-render on date change (existing pattern from dashboard). CSS `order` recomputes. No reload needed.

3. **Person filter active + person has no items this week.** Week view shows "No items for {Person} this week — [Show all]" empty state at the top of the agenda; the day-blocks still render with their headers + per-day `+` (so adding an event for that person is one tap away).

4. **All-day event vs timed event in Day view agenda.** All-day events render at top of Events section without a time-label prefix. Timed events render with "H:MM AM/PM —" prefix in chronological order.

5. **Past-date day-block in Week view.** Faded (`opacity: 0.6`). Tasks still tappable — past daily tasks remain tap-blocked per CLAUDE.md (open sheet instead of toggle). Past-date completions get `isLate: true` per existing scoring logic. **No change to scoring.**

6. **Switching from Month (tablet/desktop) → Phone width crossing 600px breakpoint.** Month view re-renders with phone empty-state; user picks Week or Day. No data lost. State (selected date, selected view) preserved.

7. **Sub-bar sticky overlap on iOS PWA.** `position: sticky` + safe-area insets — verified via PWA on iPhone (manual smoke). Falls back to non-sticky if browser doesn't support (graceful degradation).

8. **Per-day `+` in person mode.** Visible and functional. Pre-fills the date AND defaults the event owner to the linked person (parity with dashboard FAB behavior).

---

## 6. Exit criteria

All must be true to ship:

1. Default view on phone = Week.
2. Week view scrolls naturally end-to-end; no `overflow:hidden; height:100dvh` on the calendar shell.
3. Week view orders day-blocks today-first, future days chronologically next, past days at the bottom faded (`opacity: 0.6`).
4. Day view shows Events → Tasks sections (Meals deferred per spec note); section heads use the Phase 1.5 pattern with non-first divider.
5. Month view on phone (≤600px) renders the soft empty-state with two buttons; no grid mounted; swipe disabled.
6. View Tabs row + Day/Week date-nav row are sticky below the header.
7. Single filter chip in sub-bar; opens shared filter sheet; matches dashboard chip behavior (verb / person dot / accent-soft active).
8. FAB opens Event form directly with viewDate pre-filled.
9. Per-day `+` chip in Week view day-blocks opens Event form with that day's date pre-filled.
10. Tap event = sheet; tap task = toggle (with past-daily tap-block); long-press 800ms = sheet on both.
11. View-aware swipe preserved (week view = ±1 week, day view = ±1 day, month view disabled on phone).
12. Cards use `.card` from Phase 1.5 (`min-height: 60px`, `padding: var(--spacing-sm) var(--spacing-md)`, `border-radius: var(--radius-lg)`, owner stripe 3px, avatar 36px). No `.cal-card` parallel class.
13. `renderSectionHead({ divider: true })` used on non-first sections (matches dashboard).
14. Banner-slot DOM mounted in [calendar.html](../../../calendar.html); empty in Phase 2.
15. All sub-bar interactive elements ≥44×44; per-day `+` effective tap area ≥44×44; FAB = 56px.
16. All animations have `prefers-reduced-motion` guards.
17. No `window.confirm` / `window.alert` in calendar code paths.
18. No `!linkedPerson` guards on bell, overflow, filter chip, FAB, or per-day `+` (Phase 1.5 amendment E parity).
19. `.page-content` doesn't double-count `--header-height` (Phase 1.5 amendment A); `.section` has no horizontal margin (Phase 1.5 amendment B).
20. Inline styles cleared in [calendar.html](../../../calendar.html); raw hex replaced with tokens in [styles/calendar.css](../../../styles/calendar.css). Closes the Phase 0 deferred register rows for these files.
21. Mockup deviation table present in this spec §1.1; CLAUDE.md backlog 1.3 tagged with FAB-picker + Meals-section wiring notes.
22. SW cache bumped to v60 with CACHE_BUMPS comment.
23. No regressions in event create/edit/delete, task complete, real-time updates, or scoring.
24. Tap-target audit script returns clean.
25. Visual smoke at 375px in all 5 themes (light-warm, light-vivid, dark, dark-warm, dark-vivid).

---

## 7. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sticky sub-bar eats too much vertical space on 360px phones | Medium | Build-time measurement; if sub-bar > 88px, condense View Tabs to icon-only via responsive.css rule |
| Week view payload too large (90 days × N owners × M tasks) | Low | Listener footprint audit per §4.6; if >100KB, scope listener to ±4 weeks |
| Removing time-grid loses users who relied on it | Low | Decision noted in §1.1; reversible (add toggle in Phase 5+ if real demand surfaces) |
| Per-day `+` discoverability in Week view | Medium | Place at the end of each day block with border + faint icon; FAB remains the universal fallback for users who don't notice it |
| Person mode regression (parity with Phase 1.5 amendment E) | Medium | Explicit exit criterion #18 + manual smoke in person mode for each view |
| `calendar-views.js` rewrite introduces real-time render bugs | Medium | Preserve existing data shape into renderers; rewrite is render-side only; debounced 100ms re-render unchanged |

---

## 8. Rollback

- Revert the PR. Schema is untouched. Firebase data preserved.
- SW cache bump (v59 → v60) means previous calendar.html is cached locally on user devices for the configured max-age; force-refresh recovers immediately.
- No two-way data migration needed.

---

## 9. PR shape

One PR, one deploy. Estimated 6–8 commits matching the file table in §3 plus a final cache-bump + CLAUDE.md backlog-tag commit.

Anticipated commit sequence (subject to execution-plan refinement):

1. `refactor(calendar): retire overflow:hidden body lock + add page shell parity` — calendar.html shell + .page-content alignment.
2. `feat(calendar): sticky sub-bar with View Tabs + date nav + filter chip` — .cal-subbar markup + CSS.
3. `feat(calendar): rewrite week view as today-first vertical agenda` — calendar-views.js renderWeekView + per-day-block CSS.
4. `feat(calendar): rewrite day view as pure agenda (Events → Tasks)` — calendar-views.js renderDayView + section-head divider wiring.
5. `feat(calendar): phone month view shows soft empty-state` — calendar-views.js renderMonthView phone branch + responsive.css.
6. `feat(calendar): per-day quick-add + FAB direct to Event form` — chip in week view + FAB onClick + person-mode owner default.
7. `chore(calendar): tap-target + reduced-motion + dark-mode audit` — fixes from final audit pass.
8. `chore: bump SW cache to v60 + tag CLAUDE.md backlog 1.3 wiring` — cache version + backlog notes for FAB picker + Meals section.

---

## 10. Open questions (resolve at plan-write time)

- Does `renderEmptyState` already exist in `shared/components.js`? If yes, reuse signature. If no, add it as a generic component (not calendar-specific). Confirm during plan write.
- Does `--z-subbar` token exist in `styles/base.css`? If no, add one line in commit 2.
- Is the existing month-view grid renderer worth keeping intact for tablet, or does it have its own debt that should be fixed in Phase 2? Default: leave it intact (out of scope; tablet handled in Phase 7).

---

## 11. Backlog hand-offs

This spec generates two notes that must land in [CLAUDE.md](../../../CLAUDE.md) backlog item **1.3 — Meal Planning** in commit 8:

- **FAB picker swap.** "When 1.3 ships: swap calendar FAB onClick from `openEventForm` to a 2-tile picker sheet (Event / Meal). Picker tile leads to existing Event form / new Meal form."
- **Day-view Meals section insertion.** "When 1.3 ships: Day view section order becomes Events → Tasks → Meals. Insert Meals section in `renderDayView` between Tasks and any future trailing sections."

These are not implemented in Phase 2; they're durable reminders so the 1.3 spec doesn't have to rediscover them.
