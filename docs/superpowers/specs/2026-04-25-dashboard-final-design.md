# Dashboard — Final-Form Design Spec

**Date:** 2026-04-25
**Status:** Approved (brainstorm complete, ready for implementation plan)
**Design source of truth:** [docs/DESIGN.md](../../DESIGN.md) §1 (Principles), §5 (Components), §6.1 (Dashboard), §7 (Cross-cutting patterns)
**Predecessors:** [Phase 1 Dashboard Rework](2026-04-23-phase-1-dashboard-rework.md), Phase 1.5 polish (shipped through SW v60)
**Mockup reference:** [mockups/01-dashboard.html](../../../mockups/01-dashboard.html) (Phase 1 baseline; this spec extends it)
**Related:** Backlog 1.3 (Meals), 1.4 (Weather), 1.6 (Activities), 2.1 (Push), 2.4 (Vacation), 3.0 (Loading skeleton), 3.3 (Coming up rail)

---

## 1. Goal

The Daily Rundown dashboard is the family's primary screen — the one they look at twenty-plus times a day on their phone. This spec defines its **final form**: the layout, sections, components, interactions, and states that earn the "Skylight competitor" claim from the home screen alone. The dashboard answers, in order, *what's happening right now*, *what's coming up*, *how are we doing*, and *what should I do next* — without leaving the page and without sub-tabs. This is **not** a calendar (Coming up rail covers the phone-side forward look; the dedicated Calendar page resumes on tablet/kiosk per backlog 1.5), **not** a notification center (the Bell is the only notification surface), and **not** a dashboard demo (calm, confident, quiet — DESIGN.md principle #1 over everything).

This spec extends — does not replace — the Phase 1 dashboard rework and the Phase 1.5 polish. Every primitive the Phase 1.5 work shipped (`.card` + slots, `renderSectionHead`, `renderFilterChip`, `renderFab`, `renderBanner`, `applyDataColors`, owner left-stripe, completed-card mute) is the vocabulary used here; the additions are layout (one new section, one new strip), data plumbing (score chips in section meta), and a small expansion of the existing banner queue.

---

## 2. Layout

### 2.1 Phone (≤600px) — first viewport, no scroll

Top to bottom inside the 375×667 visible region:

```
┌─────────────────────────────────────────┐
│  Header (sticky)                        │  56–64px
│   Home                       🔔  ⋯      │
│   Sunday, April 19                      │
├─────────────────────────────────────────┤
│  [Banner — single slot, queued]         │  ~64px when present, 0px otherwise
│   ✦  Double-points day                  │
│      All tasks count 2× until midnight  │
├─────────────────────────────────────────┤
│  [Back-to-Today pill — when applicable] │  ~40px when present, 0px otherwise
├─────────────────────────────────────────┤
│  Ambient strip                          │  ~64px (off until 1.3+1.4 ship)
│   ☀ WEATHER     │  🍴 DINNER             │
│   72° · Sunny   │  Spaghetti             │
├─────────────────────────────────────────┤
│  Coming up (collapsed)                  │  ~56px
│   COMING UP                          ›  │
│   3 events this week                    │
├─────────────────────────────────────────┤
│  Events                                 │  ~28px section head + cards
│   10:30  Swim lessons                   │
│          Noah · Community pool          │
├─────────────────────────────────────────┤
│  Today                       [Filter]   │  ~28px section head
│   4 of 7 done                           │
│   [task card]                           │  begins; remainder scrolls below
└─────────────────────────────────────────┘
   (FAB bottom-right above nav, nav at bottom — both float, not in viewport flow)
```

The Today section's *header* is on the first viewport even when ambient strip and Coming up are present; its task list is partially visible. The first card is always seen. This is the load-bearing requirement: the user lands on the dashboard, glances down, and within ~600px sees today's tone (banner), today's context (ambient + Coming up summary), and *what to do* (Today section head + first card).

### 2.2 Phone — scrolled state (Coming up expanded, filter active)

When the user expands Coming up and switches the filter chip to one person:

```
┌─────────────────────────────────────────┐
│  Header (sticky — stays at top)         │
├─────────────────────────────────────────┤
│  Coming up (expanded)                ⌄  │
│   COMING UP — 3 events this week        │
│   ─────────────────────────────────     │
│    Mon Apr 20                           │
│      7:00 PM  Soccer practice · Noah    │
│    Wed Apr 22                           │
│      3:30 PM  Dentist · Ellie           │
│    Sat Apr 25                           │
│      All day  Family movie night        │
├─────────────────────────────────────────┤
│  Events                                 │
│   10:30  Swim lessons (Noah)            │
├─────────────────────────────────────────┤
│  Today                  [● Noah]        │
│   4 of 7 done · 28 pt · B+              │
│   [card] Read 20 minutes (Noah)         │
│   [card] Brush teeth PM (Noah)          │
│   [card · done] Make bed                │
│   [card · done] Morning dishes          │
└─────────────────────────────────────────┘
```

Two changes vs. first-viewport: Coming up day-blocks expand inline (only days with events render — empty days collapse out), and Today section meta carries the score chips (`28 pt · B+`) because the filter chip is set to one person.

### 2.3 Tablet (≥768px) — two-pane

DESIGN.md §6.1 specifies tablet dashboard as two-pane. With all sections defined, the split:

```
┌──────────────────── Header (full-width above both panes) ─────────────────────┐
│ Home                                                                  🔔  ⋯  │
│ Sunday, April 19                                                              │
├───────────── Banner (full-width, single slot) ───────────────────────────────┤
├─────────────────────────────┬────────────────────────────────────────────────┤
│  LEFT PANE (~520px)         │  RIGHT PANE (~380px)                           │
│                             │                                                │
│  Today           [Filter]   │  Ambient (1-up vertical)                       │
│  4 of 7 done · …            │   ☀ Weather                                    │
│  [task card]                │   🍴 Dinner                                    │
│  [task card]                │                                                │
│  [task card]                │  Coming up (always expanded)                   │
│  [task card]                │   Mon  Soccer practice                         │
│  [task card · done]         │   Wed  Dentist                                 │
│  [task card · done]         │   Sat  Family movie night                      │
│                             │                                                │
│                             │  Events (today, time-leading cards)            │
│                             │   10:30  Swim lessons                          │
└─────────────────────────────┴────────────────────────────────────────────────┘
                                                              [+]  ← FAB bottom-right of right pane
                                              ←─ Left rail nav (240px, replaces bottom nav) ─→
```

Reasoning for the split: the **left pane is the action surface** (tasks the family does), the **right pane is the day's context** (what's the weather, what's for dinner, what events are today, what's coming this week). The FAB lives bottom-right of the right pane — where the eye naturally finishes a left-to-right scan. Coming up is always expanded on tablet (no collapsed state — vertical real estate exists).

### 2.4 Kiosk reflection (`display.html`, ≥1400px)

Per DESIGN.md §6.12, the kiosk is its own layout file with its own CSS and renders the **week grid** as its default — not a "dashboard." The dashboard's sections reflect onto kiosk as follows:

| Dashboard section | Kiosk equivalent |
|---|---|
| Header | Family-name + date + weather strip across the top of `display.html` |
| Banner | Persistent banner row above the week grid (vacation, freeze, multiplier most relevant here; running-activity also surfaces) |
| Ambient strip | Weather lives in the header strip; Dinner appears per-day inside each day-column (not "ambient" on kiosk — per-day content) |
| Back-to-Today pill | N/A (kiosk re-anchors on 30s idle) |
| Coming up rail | The week grid *is* this — 7 columns of forward-look |
| Events | Per-day inside each day-column |
| Today section | Per-day inside each day-column, grouped by person |
| FAB / nav | Kiosk has a tile-grid bottom bar (Calendar, Scores, Shopping, Admin-lite, Display settings); not the same component |

**No part of `dashboard.js` runs on kiosk.** Every section above is re-rendered by kiosk-specific code in its own layout. The reflection table exists so future feature work doesn't ship a phone-only treatment without declaring its kiosk shape (DESIGN.md §4.3 rule: every new feature ships kiosk on day one).

---

## 3. Sections

Eight sections, top to bottom. Each entry covers: purpose, component(s), data source, interactions, all four states (empty / loading / error / populated), kid-mode behavior, person-link behavior.

### 3.1 Header

**Purpose.** Anchor the page. Identify whose view it is, what day it is, and route notifications + overflow.

**Component.** `renderHeader({ title, subtitle, showBell, overflowItems })`. No structural change.

**DOM.**
```html
<header class="app-header">
  <div class="app-header__text">
    <div class="app-header__title">Home | {PersonName}</div>
    <div class="app-header__subtitle">
      <span class="app-header__subtitle-long">Sunday, April 19</span>
      <span class="app-header__subtitle-short">Sun, Apr 19</span>
    </div>
  </div>
  <div class="app-header__actions">
    <button class="btn-icon" id="headerBell" aria-label="Notifications">
      <svg>…bell…</svg>
      <span class="btn-icon__dot is-hidden" id="headerBellDot"></span>
    </button>
    <button class="btn-icon" id="headerOverflow" aria-label="More">
      <svg>…3 dots…</svg>
    </button>
  </div>
</header>
```

**Data sources.** `viewDate`, `linkedPerson` (when present), unseen-message count via `initBell`.

**Interactions.**
- Tap Bell → existing bell dropdown (Approvals / Activity tabs).
- Tap ⋯ → "More" sheet (Rewards · Admin · Theme · Debug — same sheet as bottom-nav More).
- Tap title or subtitle → no-op.
- No swipe.

**States.**
| State | Behavior |
|---|---|
| Loading | Title + subtitle render immediately from local state. Bell dot hidden until bell init resolves. No skeleton. |
| Empty | N/A — header always renders. |
| Error | Header renders unchanged; offline status surfaces as an `--info` banner below header (Section 3.2). |
| Populated | As specced. Bell dot shows when `unseenCount > 0`; pulse on first appearance only (Phase 1.5). |

**Kid mode.** Title becomes `Good morning, {KidName}` (existing). Right side is a single ⚙ icon (PIN escape); Bell hidden. Subtitle hidden — the kid header is taller and uses larger typography per `kid` modifier.

**Person-link mode.** Title = the linked person's first name. Subtitle stays as the date line. Bell + ⋯ unchanged. **The "Viewing as {Name}" pill specced in DESIGN.md §6.9 is retired** — title-becomes-name carries identity; a second indicator is redundant. (Cross-product update tracked.)

---

### 3.2 Banner queue (single slot)

**Purpose.** One always-visible-when-active contextual notice. Carries the day's tone signal.

**Component.** `renderBanner(variant, { title, message, action })`. Existing component, expanded with new variants.

**DOM.**
```html
<div id="bannerMount">
  <div class="banner banner--{variant}" role="status">
    <div class="banner__icon">{glyph}</div>
    <div class="banner__body">
      <div class="banner__title">{title}</div>
      <div class="banner__message">{message}</div>
    </div>
    <button class="banner__action" data-banner-action>{action.label}</button>
  </div>
</div>
```

**Variants & priority** (highest → lowest; queue picks first match):

| Variant | Trigger | Title example | Action button |
|---|---|---|---|
| `--vacation` | any person's `away[]` covers today | `Jordin is away until Apr 25` | `End early` (when filtered to that person) |
| `--freeze` | family freeze flag (future) | `Schedule frozen` | none |
| `--overdue` | `overdueFiltered.length > 0` (existing) | `3 overdue tasks` | `Review` (opens overdue sheet) |
| `--multiplier` | `multipliers[today][scope]` and `multiplier ≠ 1` (existing) | `Double-points day` | none |
| `--info` (running activity) | active activity session for current scope | `Reading session · 12:34` | `Stop` (opens timer sheet) |
| `--info` (offline) | `onConnectionChange` → offline | `Offline — changes will sync` | none |

**Data sources.** Existing: `overdueItems`, `completions`, `multipliers[today]`, connection status. New (gated on backlog): `people[].away[]` (2.4), `activeActivitySession` (1.6).

**Interactions.**
- Tap action button → variant action (Review / End early / Stop).
- **Tap banner body (no action button)** → variant-specific:
  - `--overdue`: opens the overdue sheet (same as Review button — body becomes tappable).
  - All others: no-op.
- No long-press, no swipe, no dismiss-X. Banner clears when its condition clears.
- **Filter awareness:**
  - Overdue: counts only `activePerson`'s overdue.
  - Multiplier: scope = `activePerson || 'all'`.
  - Running activity: scope = `activePerson || family`.
  - Vacation: family context, ignores filter.

**Cross-page persistence.** The banner mount currently exists on dashboard and calendar (per DESIGN.md §7.3). **This spec amends §7.3 to add the mount to Scoreboard and Tracker as well**, so the running-activity banner stays visible while the user navigates. Full priority queue applies on every page that mounts it.

**Glyphs (chrome — not emoji-variant):**
- `vacation`: `✈` (monochrome)
- `freeze`: `❄` (monochrome)
- `overdue`: `⚠` (monochrome)
- `multiplier`: `✦` (monochrome)
- `info`: `i` (monochrome)

**States.**
| State | Behavior |
|---|---|
| Loading | Mount empty during first paint. After data resolves, banner appears. No skeleton — banner-or-nothing is the right shape. |
| Empty (no condition active) | `#bannerMount` renders zero pixels. Spacing to next section preserved by next section's top padding. |
| Error | Same as empty; offline condition itself surfaces as an `--info` banner. |
| Populated | One banner from priority queue. |

**Kid mode.** Same mount, same component. Kid only sees variants relevant to them: vacation (if they're away), multiplier (their scope or `all`), running-activity (their session). Overdue and freeze do not render in kid mode.

**Person-link mode.** Filter-aware via `activePerson`. Multiplier scopes to linked person first, falls back to `all`. Vacation shows for the linked person if away; otherwise shows other family-members' vacation as info-context.

---

### 3.3 Ambient strip (Weather + Dinner)

**Purpose.** Two glanceable answers to questions families ask hourly: *is it hot? what's for dinner?*

**Component.** New `renderAmbientStrip({ weather, dinner, viewDate })`. Lives in `shared/components.js`. Returns `''` when both data sources unavailable AND the global strip toggle is off.

**DOM.**
```html
<div class="ambient-row">
  <button class="ambient-chip" data-chip="weather">
    <span class="ambient-chip__icon">{svg-weather-glyph}</span>
    <span class="ambient-chip__body">
      <span class="ambient-chip__label">Weather</span>
      <span class="ambient-chip__value">72° · Sunny</span>
    </span>
  </button>
  <button class="ambient-chip" data-chip="dinner">
    <span class="ambient-chip__icon">{svg-utensils-glyph}</span>
    <span class="ambient-chip__body">
      <span class="ambient-chip__label">Dinner</span>
      <span class="ambient-chip__value">Spaghetti</span>
    </span>
  </button>
</div>
```

**Critical rule: chip leading icons are SVG glyphs, not emoji.** Per DESIGN.md §7.6, emoji is for user-authored content; weather conditions and dinner-slot identifiers are chrome. The mockup's ☀ and 🍝 are illustrative — implementation uses 5 weather SVGs (sun, cloud, rain, snow, fog) and a single utensils SVG. Meal names ("Spaghetti", "Tacos") are user-authored text and may include emoji inline (`🍝 Spaghetti` renders as text in the value slot).

**Data sources.**
- **Weather (1.4):** OpenWeatherMap free tier. Cached `dr-weather-{viewDate}` in localStorage; fetched in 7-day forecast batches (all viewDates within forecast horizon hit cache). Refresh cadence 30–60 min for today; future days refresh on cache miss.
- **Dinner (1.3):** `rundown/meals/{viewDate}/dinner` → `{ name, url?, source? }`.
- **`viewDate`-aware.** When the user swipes to tomorrow, both chips update to tomorrow's data. Past dates: weather shows `Past day` (no historical fetch); dinner shows what was planned. Beyond 7 days forward: weather shows `—° · No forecast yet`.

**Settings toggle.** `settings.ambientStrip: boolean` lives in Admin → Settings → Appearance → Display. **Default `true` once both 1.3 and 1.4 ship**; until then the strip renders zero pixels. Toggle hides both chips together (binary, not per-chip).

**Interactions.**
- Tap weather chip → bottom sheet with today + next 2 days forecast (temp / condition / high-low). One screen, no tabs.
- Tap dinner chip → existing meal detail sheet (from Calendar). If `url` present, primary action is "Open recipe" (opens new tab); secondary action is Edit (opens meal form). Long-press equivalent to tap (no separate edit gesture).
- No completion/check, no swipe.
- Weather refresh happens on TTL; not triggered by chip tap.
- No FAB action specifically for adding a meal from the dashboard — meal creation lives in Calendar (feature-home map). The Add menu (Section 3.8) gains a "Plan a meal" item once 1.3 ships, which routes to the same meal form.

**States.**
| State | Behavior |
|---|---|
| Loading | Two-chip skeleton (`--accent-soft` shimmer matching populated shape). Resolves <500ms in cached + fresh cases. |
| Empty (no weather, no meal planned) | Both chips render with nudge copy. Weather: `—° · Set location` → tap routes to Settings → Family → Location. Dinner: `Not planned · Plan dinner` → tap opens meal form pre-filled to viewDate/dinner. |
| Empty (one available, one not) | Available chip renders normally; missing chip shows the relevant nudge. |
| Error (weather API down) | Falls back to last cache; if no cache, shows the empty-state nudge. No raw error text. |
| Error (Firebase down) | Dinner chip uses last-render data. |
| Populated | As specced. |
| Settings = off | `renderAmbientStrip` returns `''`; spacing to next section preserved by next section's top padding. |

**Kid mode.** Kid mode does *not* render this strip — kid mode has its own Today tiles (DESIGN.md §6.6). The strip is a Home / `person.html` surface only.

**Person-link mode.** Identical to Home. Weather is family-location, dinner is family-meal — neither varies by linked person. Strip is the same regardless of `activePerson`.

---

### 3.4 Coming up rail (3.3)

**Purpose.** Forward look. Answers "what's next?" without leaving the page or switching tabs. Replaces the role the Calendar phone tab cannot earn (per Phase 2 calendar shelving 2026-04-25).

**Component.** New `renderComingUp({ days, isExpanded, summary, filterPersonName })`. Lives in `shared/components.js`. Internally reuses primitives from the shelved Phase 2 calendar plan: `.cal-day-block` (day-headed group) and event-row markup from `renderEventBubble`.

**DOM.**
```html
<section class="coming-up" data-expanded="false">
  <button class="coming-up__row" id="comingUpToggle" aria-expanded="false" aria-controls="comingUpBlocks">
    <div class="coming-up__text">
      <div class="coming-up__label">Coming up</div>
      <div class="coming-up__summary">3 events this week</div>
    </div>
    <span class="coming-up__chev" aria-hidden="true">{chevron-svg}</span>
  </button>
  <div class="coming-up__blocks" id="comingUpBlocks" hidden>
    <div class="cal-day-block">
      <div class="cal-day-block__head"><strong>Mon</strong> Apr 20</div>
      <button class="event-row" data-event-id="…">
        <span class="event-row__time">7:00 PM</span>
        <span class="event-row__title">Soccer practice</span>
        <span class="event-row__meta">Noah</span>
      </button>
    </div>
    <!-- more day-blocks -->
  </div>
</section>
```

**Data sources.** Existing `events` collection + `getEventsForDate(events, dateKey)` for `today + 1` through `today + 7`, filtered by `activePerson`. No schema changes, no new listeners (already subscribed via `onEvents`).

**Counting rule.** Summary count = **events only**. Tasks are not counted (predictable / app-scheduled; counting them would make the summary perpetually non-zero and useless). `Coming up · 3 events this week` / `Coming up · clear week`.

**Filter integration.** When `activePerson` is set, the rail filters to that person's events. Summary updates to `Coming up · 2 events for Noah this week`. Empty: `clear week for Noah`.

**Persistence.** `localStorage['dr-coming-up-state']` stores `'collapsed' | 'expanded'`. Default `'collapsed'`.

**Interactions.**
- Tap collapsed row → expand inline. Chevron rotates 0° → 90°, 200ms ease-out. Instant when `prefers-reduced-motion`.
- Tap chevron when expanded → collapse.
- Tap day-block head ("Mon Apr 20") → set dashboard `viewDate` to that day, resubscribe schedule, render. Coming up state preserved across the date change.
- Tap event row → existing `renderEventDetailSheet`.
- Long-press event row (800ms) → equivalent to tap (no separate edit affordance — detail sheet is the only edit path).
- No swipe on the section. (Page-level horizontal swipe still navigates dates.)
- No section-level FAB. Add new event/task uses dashboard FAB (Section 3.8).

**States.**
| State | Behavior |
|---|---|
| Loading | 48px-tall skeleton row matching the collapsed shape. Always paints collapsed first; expanded skeleton not needed. |
| Empty (zero events in next 7 days) | Section renders, collapsed, summary `Coming up · clear week`. Expanding shows `No events in the next 7 days` empty-state row. |
| Empty (filter active, zero match) | `Coming up · clear week for Noah`. Expanded empty: `No events for Noah in the next 7 days`. |
| Error (events fetch fails) | Renders collapsed with `Coming up · —`. Expanding shows `renderErrorState({ title: "Couldn't load events", retry })`. |
| Populated, collapsed | `Coming up · N events this week` + chevron. |
| Populated, expanded | Day-blocks for days with events only. Days with zero events collapse out (no empty headers). |

**Kid mode.** Not rendered. Kid mode is intentionally focused on today + rewards, not a planner.

**Person-link mode.** Identical to Home, filter-aware.

**Tablet.** Always rendered expanded; lives in the right pane (Section 2.3). The collapsed state is a phone-vertical-budget affordance only.

**Kiosk.** Not rendered — kiosk's default week-grid view *is* the forward look.

---

### 3.5 Back-to-Today pill

**Purpose.** Calm one-tap return when the user has navigated away from today.

**Component.** Inline render in `dashboard.js` (existing). No component extraction — it's a 3-line conditional with one button.

**DOM.**
```html
<div class="back-to-today {is-entering?}">
  <button class="btn btn--secondary btn--sm back-to-today__btn" id="goToday">
    <span class="back-to-today__chevron">{chev-left-svg}</span>
    <span>Back to Today</span>
  </button>
</div>
```

**Position.** Sits **between Banner and Ambient strip** (this spec's placement decision; supersedes the Phase 1 placement which preceded the ambient strip's existence). Left-aligned, `--spacing-md` indent, button max-width 320px.

**Data.** `viewDate`, `today`, `lastRenderedIsToday` (existing animation gate).

**Interactions.**
- Tap → `viewDate = today`, resubscribe schedule, reload, render.
- No long-press, no swipe.

**Animation.** `.is-entering` class added only on the transition from `today` → not-`today`. Passive re-renders (Firebase debounce on the same not-today date) do not re-animate. Existing Phase 1.5 behavior, kept.

**States.**
| State | Behavior |
|---|---|
| Loading | Pill not rendered. |
| Empty (`viewDate === today`) | Pill renders zero pixels. |
| Error | Pill render is independent of data state. |
| Populated (`viewDate !== today`) | As specced. |

**Kid mode.** Pill renders the same way (kid mode supports day swipe).

**Person-link mode.** Identical.

**Tablet / Kiosk.** Tablet identical (left pane). Kiosk has its own re-anchor logic (30s idle); no pill needed.

---

### 3.6 Events section

**Purpose.** Today's events as time-anchored cards. Distinct from tasks — events are commitments, not chores.

**Component.** `renderEventBubble(eventId, event, people)` (existing). No DOM changes.

**DOM.**
```html
<section class="section">
  <div class="section__head">
    <div class="section__title">Events</div>
  </div>
  <article class="card card--event" data-event-id="{id}">
    <div class="card__leading">10:30</div>
    <div class="card__body">
      <div class="card__title">Swim lessons</div>
      <div class="card__meta">
        <span>Noah</span><span class="card__meta-dot"></span><span>Community pool</span>
      </div>
    </div>
  </article>
</section>
```

**Data sources.** `events` + `getEventsForDate(events, viewDate)` + `filterEventsByPerson(activePerson)` + `sortEvents`.

**Sort order.** All-day events first (no time prefix in leading slot), then timed events chronologically.

**Owner-stripe color.** Event's `color` field drives the 3px left-stripe (existing).

**Interactions.**
- Tap event card → `renderEventDetailSheet`. (Phase 1 decision #16's "open Calendar day sheet scrolled to event" branch is mooted by Calendar phone-tab shelving.)
- Long-press 800ms → same — opens detail sheet. (No separate edit path on dashboard; edit is inside the detail sheet.)
- No completion check, no swipe.

**Filter.** Events filtered by `activePerson`. When zero events match, the section is omitted entirely (no empty state for the section — calm).

**States.**
| State | Behavior |
|---|---|
| Loading | 1–2 `card`-shaped skeleton rows (shared shape with Section 3.7). |
| Empty (zero events for `viewDate`) | Section renders zero pixels. |
| Empty (filtered out) | Section renders zero pixels. The Today section's filter chip carries the "filter is active" cue. |
| Error | Whole-page `renderErrorState` if Firebase down; section-level error not needed. |
| Populated | As specced. |

**Kid mode.** Events render in kid layout with `.card--event.kid` modifier (larger padding/type per DESIGN.md §6.6).

**Person-link mode.** Identical.

**Tablet.** Lives in the right pane.

**Kiosk.** Per-day inside each day-column.

---

### 3.7 Today section (the hero)

**Purpose.** The answer to "what now?"

**Component.** `renderTaskCard(...)` per row; `renderSectionHead("Today", meta, { divider, trailingHtml })` for the head.

**DOM.**
```html
<section class="section section--filtered?">
  <div class="section__head">
    <div>
      <div class="section__title">Today</div>
      <div class="section__meta">{meta-line}</div>
    </div>
    <div class="section__trailing">{filter-chip-html}</div>
  </div>
  <article class="card card--done?" data-entry-key data-date-key>
    <div class="card__leading"><span class="avatar avatar--{owner}">{initials}</span></div>
    <div class="card__body">
      <div class="card__title">
        Take out the trash
        <span class="tag tag--rotation">Weekly</span>
        <span class="tag tag--late">Late</span>
      </div>
      <div class="card__meta">
        <span>Household</span><span class="card__meta-dot"></span><span>10 min</span>
      </div>
    </div>
    <div class="card__trailing"><button class="check check--done?"></button></div>
  </article>
</section>
```

**Section meta — the canonical table:**

| Filter state | Meta reads |
|---|---|
| All / family view (or `<2 people`) | `4 of 7 done` |
| Filtered, with tasks | `4 of 7 done · 28 pt · B+` |
| Filtered, all complete (normal day) | `All done · 100 pt · A+` |
| Filtered, all complete (2× day) | `All done · 200 pt · A+` |
| Filtered, future day | `0 of 7 scheduled` (no grade, no pt — nothing earned yet) |
| Filtered, past day | `4 of 7 done · 28 pt · B+` (historical, from snapshot) |
| Filtered, zero scheduled | empty state replaces meta |

**`pt` semantics.** The number is **store-economy points**: today's percentage × multiplier (the same number that lands in the snapshot at midnight). Caps at 100 on a normal day; can go higher on multiplier days. Computed live from `dailyScore`.

**Removed: `settings.showPoints` and per-card scoring-point chips.** The setting and its callsites are deleted. No dashboard UI surfaces the basePoints scoring number; that number lives only inside scoring math. Bounty tags (`+5 bonus`) survive — they correctly represent store points (bounty `amount` flows into the rewards balance via a `bonus` message).

**Sort order** (Phase 1 decision #9):
- Incomplete first, completed at bottom (`--done` muted).
- Within incomplete: owner (family order) → late-today first → time-of-day (AM < Anytime < PM) → name.
- Within completed: owner → TOD → name (no late bump).
- Flat list, no rotation subheaders.

**Tag-in-title rule.** Rotation tag (`Weekly`, `Monthly`, `One-Time`) renders as `.tag--rotation` in the title row. `Daily` → no tag. Late tag (`.tag--late`) and bounty tag (`.tag--bounty`) also live in title row.

**Interactions.**
- Tap card → toggle complete. Past-incomplete-daily tap is blocked → opens detail sheet instead (existing).
- **Long-press card (800ms — bumped from 500ms)** → opens detail sheet. From sheet: complete-with-no-penalty, slider override, delegate, move, edit, timer (when 3.1 ships).
- Tap done card check → uncomplete.
- Tap filter chip → opens person-filter sheet.
- Page-level horizontal swipe → ±1 day.
- Movement threshold during long-press: 10px (existing).

**Long-press timing change.** Default `settings.longPressMs` becomes **800ms** to align with DESIGN.md §7.8 (calendar / kid / dashboard parity for touch-scroll-heavy surfaces). Tracker stays 500ms. `settings.longPressMs` setting remains for families that explicitly override; only the default value changes.

**States.**
| State | Behavior |
|---|---|
| Loading | Section head renders immediately (`Today` title, meta `Loading…` muted, no filter chip). 4 `card`-shaped skeleton rows. Resolves <500ms. |
| Empty (zero scheduled, no events either) | Full empty state via `renderEmptyState`. Variant by `viewDate`: `all-done` for today ("Nothing on the list. Enjoy your day."), `future-empty` for future ("No tasks scheduled."), `free-day` for past with zero. |
| Empty (zero scheduled, but events present) | Section renders head + inline `Nothing on the list.` (one line, calm). Section visible so structure is consistent. |
| Empty (filter active, no match) | `renderEmptyState({ variant: 'no-match', personName })` (existing). |
| Error | `renderErrorState({ title: "Couldn't load tasks", retry })` replaces the section. |
| Populated, all complete | Existing celebration plays once per `viewDate` (via `celebrationShown` gate). Section meta = `All done · NN pt · GRADE` (filtered) or `All done` (family). |
| Populated, partial | As specced. |

**Kid mode.** Kid `kid.html` has its own "Your tasks" section using `card.kid` modifier. Score-meta carries through — kid is always self-filtered; meta always shows `X of Y done · NN pt · GRADE`.

**Person-link mode.** Identical, filter-aware. Linked-person default filter means linked person sees their own score in the meta by default; can flip filter to "All" to see family view.

**Tablet.** Fills the left pane.

**Kiosk.** Per-day per-person rows in each day-column. Score-meta surfaces as a per-person grade pill in each row (kiosk-spec, not this spec's job).

---

### 3.8 FAB + Bottom nav

**Purpose.** Primary add action (FAB) + four-slot navigation (nav).

#### 3.8.1 FAB

**Component.** `renderFab({ id: 'fabAdd', label: 'Add', icon })` (existing).

**Behavior.** Tap opens existing `renderAddMenu` sheet. Items:
- **Today (top group):** Add task · Add event
- **More (bottom group, gates on backlog):** Plan a meal *(when 1.3 ships)* · Add to a list *(when 1.7 ships)*

**Pre-fills.**
- `viewDate` pre-fills the date field of whichever form opens. Swiping to tomorrow then tapping FAB creates an item on tomorrow without manual date entry.
- `activePerson` pre-selects that person as default owner. Family view = no pre-select.

**Position.** `bottom: calc(--nav-height + --spacing-md)`, `right: --spacing-md`, respects `safe-area-inset-right`. 56px circular, `--shadow-md`, `--accent` bg.

**Banned.** No FAB in kid mode.

#### 3.8.2 Bottom nav

**Component.** `renderNavBar(activePage, options)` (existing).

**Slots — phone:** Currently 4 with the 5th reserved for whichever of Activities (1.6) or Shopping (1.7) ships first.

| Slot | Label | Destination |
|---|---|---|
| 1 | Home | `index.html` (or `person.html` for linked person) |
| 2 | Scores | `scoreboard.html` |
| 3 | Tracker | `tracker.html` |
| 4 | More | opens "More" sheet |
| *5 (reserved)* | Activities or Shopping | (waiting on backlog) |

**More sheet contents** (same sheet as header overflow, intentional duplication — Phase 1 decision #11):
- Rewards (opens Store sheet — Phase 6 swap target)
- Admin
- Theme
- Activities *(once 1.6 ships, before it earns slot 5)*
- Shopping *(once 1.7 ships, before it earns slot 5)*
- Debug *(only when `localStorage['dr-debug'] === 'true'`)*

**Bell stays in the header.** Not in the nav.

**Interactions.**
- Tap nav item → navigate. Active item gets `--accent` color + heavier stroke.
- Tap More → open sheet.
- No long-press, no swipe on nav.

**States.** Nav always renders; not data-dependent.

**Kid mode.** No bottom nav (DESIGN.md §6.6).

**Person-link mode.** Identical to Home.

**Tablet.** Bottom nav becomes left rail (240px wide, items 80px tall, icon + label). Same 4 slots + reserved 5th. Solid surface, no frosted-glass treatment.

**Kiosk.** Own bottom-bar tile grid; not the same component.

---

## 4. Interaction model (cross-cutting)

### 4.1 Gesture matrix

| Gesture | Behavior |
|---|---|
| Tap on card | Toggle complete (Today section), open detail sheet (Events, Coming up). Past-incomplete-daily exception: opens sheet. |
| Long-press 800ms on card | Opens detail sheet. Cancels if pointer moves >10px. |
| Tap on FAB | Opens add menu sheet (pre-filled with `viewDate` + `activePerson`). |
| Tap on Bell | Opens bell dropdown. |
| Tap on ⋯ overflow | Opens "More" sheet. |
| Tap on filter chip | Opens person-filter sheet. |
| Tap on Coming up row | Toggles expand state. |
| Tap on day-block head | Sets `viewDate` to that day. |
| Tap on banner action button | Variant-specific. |
| Tap on overdue banner body | Opens overdue sheet (same as Review button). |
| Tap on ambient chip | Opens chip-specific sheet (forecast / meal detail). |
| Tap on Back-to-Today pill | Returns `viewDate` to today. |
| Horizontal swipe on page | ±1 day on `viewDate`. Cancels on vertical-dominant motion. |
| Vertical scroll on page | Native browser scroll. Header sticky. |
| Long-press anywhere else | None. (Long-press is reserved for cards.) |
| Pinch / zoom | Native browser. |
| Pull-to-refresh | Native browser. No custom handler. |

### 4.2 Scroll behavior

- Page scrolls naturally end-to-end. No `overflow:hidden + height:100dvh` on the body (DESIGN.md §12 prohibition).
- Header is `position: sticky` and owns its own height in flow.
- FAB and bottom nav are `position: fixed` and float over content. Safe-area-inset-bottom respected.
- Banner, ambient strip, Coming up, Back-to-Today pill all scroll with the page (not sticky).
- Coming up expansion grows in flow; the page scrolls to accommodate. No internal scroll inside the expanded section.

### 4.3 Real-time and offline

- Firebase `onValue` listeners power `completions`, `schedule[viewDate]`, `events`, `multipliers`, `messages` (existing).
- 100ms debounce on re-render (existing).
- Offline: service worker serves app shell; writes queue and sync on reconnect; `--info` offline banner appears.

### 4.4 Banner queue resolution

Single slot. On every render, `resolveBanner()` walks priority order (vacation > freeze > overdue > multiplier > info-running-activity > info-offline) and returns the first match. The mount renders that one banner (or zero pixels if no match).

### 4.5 Filter scope

`activePerson` is a single source of truth. It affects: section meta (Today), event list filter, banner counts (overdue / multiplier / running-activity), Coming up filter, FAB pre-fill. It does *not* affect: header, ambient strip, bell.

### 4.6 Cross-page persistence (banner queue)

The banner queue mount (`#bannerMount`) lives on dashboard, calendar, **scoreboard**, and **tracker** — extending DESIGN.md §7.3 from the current dashboard+calendar+kiosk set. Reason: running-activity (1.6) is a cross-page state that needs visibility wherever the user navigates while the timer is running.

---

## 5. Accessibility

### 5.1 Tap targets

- All interactive elements ≥ 44×44 (56×56 in kid mode).
- Audit selectors:
  - `#headerBell`, `#headerOverflow`
  - `#fabAdd`
  - `.check`
  - `#openFilterSheet`
  - `.bottom-nav__item`
  - `.coming-up__row`
  - `.coming-up__chev` (within `.coming-up__row`, full-width tappable)
  - `.ambient-chip`
  - `.banner__action`, `.banner` body (when overdue — body becomes tappable)
  - `.event-row` (in Coming up)
  - `.back-to-today__btn`

### 5.2 Contrast

- WCAG AA minimum (4.5:1 body, 3:1 large text).
- All five themes verified light + dark.
- Section meta uses `--text-muted` (must clear 4.5:1 against `--bg`).
- Filter chip selected state uses `--accent-soft` bg + `--accent-ink` text (must clear 4.5:1).
- Coming up summary uses `--text-muted` against `--surface`.

### 5.3 Motion

- `prefers-reduced-motion` respected:
  - Coming up chevron rotation → instant.
  - Banner appearance → fade only, no slide.
  - Back-to-Today pill `.is-entering` → fade only.
  - Card check toggle scale (0.9→1.0) → no scale.
  - Celebration → collapses to single success toast.
- Animation defaults: `--t-fast` 120ms (hover/check), `--t-base` 200ms (sheet/banner), `--t-slow` 320ms (celebration entry).

### 5.4 Focus order

Tab order top-down through interactive elements:
1. Bell
2. Overflow (⋯)
3. Banner action (when present)
4. Back-to-Today pill (when present)
5. Ambient chip — Weather
6. Ambient chip — Dinner
7. Coming up row (toggle)
8. Coming up day-block heads + event rows (when expanded; in DOM order)
9. Filter chip (in Today section head)
10. Each task card (in render order); tab moves between cards, focus is the card itself; check button is reachable via subsequent tab within card focus
11. FAB

Bottom nav items are not in the main tab order — they're a `<nav>` landmark with arrow-key navigation between items.

### 5.5 Screen-reader landmarks

- `<header class="app-header">` → banner landmark
- `<main class="app-shell">` → main landmark
- `<nav class="bottom-nav">` → navigation landmark, aria-label "Primary navigation"
- Banner: `role="status"` (existing on `.banner`)
- Each section: `<section class="section">` with the title rendered as `<h2 class="section__title">` for landmark hierarchy
- Coming up: `aria-expanded` on `.coming-up__row` + `aria-controls` pointing to `.coming-up__blocks[id]`
- Filter chip: `aria-haspopup="dialog"` (opens a sheet)
- Sheets: `role="dialog" aria-modal="true"` (existing)

### 5.6 Live regions

- Toasts: `role="status"` (existing)
- Form errors: `role="alert"` (existing)
- Banner appears with `role="status"` so the screen reader announces the change non-interruptively
- Score meta updates: do *not* set as live region (would announce on every check toggle — too chatty); the count update is implicit in the surrounding context

### 5.7 Keyboard

- Escape closes sheets/modals.
- Enter / Space activates buttons.
- Arrow keys on bottom nav (and on left rail at tablet) move between items.
- Tab moves naturally through the focus order in §5.4.

---

## 6. Diff vs. today

### 6.1 Added

| Addition | Notes | Gating |
|---|---|---|
| Coming up rail (Section 3.4) | New section; collapsed by default; expands inline; events-only count; `viewDate`-jumping day-block heads | None — ships with this spec |
| Ambient strip (Section 3.3) | New 2-up chip row; weather + dinner; `viewDate`-aware; SVG chip icons | Renders zero pixels until 1.3 + 1.4 land; both chips wire in as part of those backlog items |
| Score chips in Today section meta | `· NN pt · GRADE` appended when filter set to one person; store-economy points (not scoring) | Ships with this spec (uses existing `dailyScore` math) |
| Banner variant `--vacation` | For 2.4 wiring | Renders only when `people[].away[]` exists (2.4 schema) |
| Banner variant `--info` (running activity sub-variant) | For 1.6 wiring | Renders only when `activeActivitySession` exists (1.6 schema) |
| Banner variant `--info` (offline sub-variant) | Reuses existing `initOfflineBanner` data | Ships with this spec |
| Banner mount on Scoreboard + Tracker | DESIGN.md §7.3 amendment for cross-page running-activity persistence | Ships with this spec |
| Overdue banner body becomes tappable | Currently only `Review` button is | Ships with this spec |
| FAB pre-fill via `activePerson` | Owner default in new task/event form | Ships with this spec |
| Loading skeleton (3.0) | Replaces inline spinner with card-shaped skeletons matching the populated layout | Ships with this spec |

### 6.2 Removed

| Removal | Reason |
|---|---|
| `settings.showPoints` and all callsites | Scoring points on cards conflated with store-economy points; cleaner to remove the surface entirely |
| Per-card scoring-point chip rendering in `renderTaskCard` | Same reason |
| Admin → Settings → showPoints toggle | Same reason |
| "Viewing as {Name}" pill in person-link mode (DESIGN.md §6.9) | Title-becomes-name carries identity; second indicator is redundant |
| Phase 1 decision #6's "score lives only on Scoreboard" rule | Walked back: grade chip in Today section meta is the dashboard's score surface (filter-gated) |
| Inline `loading-inline` spinner on first paint | Replaced by skeleton |

### 6.3 Restructured

| Change | Notes |
|---|---|
| Long-press default 500 → 800ms | Settings override preserved; only default changes. Aligns dashboard with calendar / kid per DESIGN.md §7.8. |
| Back-to-Today pill position | Now between Banner and Ambient strip (was between Banner and content). Stable position regardless of ambient state. |
| Phase 1 decision #16 (event tap → "calendar day sheet") | Mooted by Calendar phone-tab shelving. Tap = `renderEventDetailSheet` directly. |
| DESIGN.md §6.1 ambient default | Flipped to **on by default** once 1.3 + 1.4 ship (was off by default) |

### 6.4 Stays the same

- Header structure (title + subtitle + Bell + ⋯). No new icons.
- Phase 1.5 card density, owner stripe, completed-card mute, check hover/press.
- Section grouping: Events → Today (no rotation subheaders).
- Banner queue priority order: vacation > freeze > overdue > multiplier > info.
- Bottom nav 4-slot composition + reserved 5th.
- Person-link parity rule (DESIGN.md §6.9): bell, overflow, filter chip, FAB all render unconditionally.
- All Firebase schema. No data migration.

### 6.5 Scope sanity check

This spec is one coherent dashboard PR's worth of work. Items gated on backlog (1.3, 1.4, 1.6, 2.4) are *specced* here so they slot in cleanly when those features ship — but the implementation of *this* spec doesn't depend on them. The dashboard ships in its final-form structure on day one; ambient strip is dead until weather + meals exist; vacation/running-activity banner variants are dead until those features exist. **All dead variants are intentional — they prevent re-design later.**

---

## 7. Open questions

Items not resolved during brainstorm; flagged for plan-write or future work.

### 7.1 Settings toggle naming
- **Q:** Label for the ambient strip toggle in Admin → Settings → Appearance → Display.
- **Recommendation:** `Ambient strip`. Help text: "Show weather and tonight's dinner on the dashboard." Resolve at plan-write.

### 7.2 `settings.tempUnit`
- **Q:** Default unit when `settings.tempUnit` doesn't exist (pre-Phase 3).
- **Recommendation:** Default `°F`. Add to Settings → Family in Phase 3 per DESIGN.md §6.5.

### 7.3 Slot 5 occupant
- **Q:** Which feature claims the reserved 5th nav slot first — Activities (1.6) or Shopping (1.7)?
- **Resolution:** Backlog priority call, not a design call. Spec just reserves the slot.

### 7.4 Long-press setting migration
- **Q:** When the default changes 500 → 800ms, do families with no `settings.longPressMs` see the change automatically?
- **Recommendation:** Yes. The `settings.longPressMs ?? 800` fallback handles unset cases. Families that have explicitly set 500 keep 500 (they made a deliberate choice).

### 7.5 Coming up: `viewDate` jumps and back-navigation
- **Q:** When the user taps a Coming up day-block head and dashboard `viewDate` jumps to that future day, does the Back-to-Today pill render?
- **Resolution:** Yes — pill renders for any `viewDate !== today`. Coming up jumps are no different from swipe navigation in this respect.

### 7.6 Future-day Coming up
- **Q:** When `viewDate` is in the future, does Coming up still show "next 7 days from today" or "next 7 days from viewDate"?
- **Recommendation:** Always "next 7 days from today." Coming up is an *anchored* forward look, not a relative one. This way swiping forward doesn't move the goalposts.

### 7.7 Ambient strip on tablet right pane
- **Q:** 1-up vertical (weather above dinner) confirmed for tablet right pane?
- **Recommendation:** Yes. Right pane is ~380px — narrower than phone's full width. Stacking is cleaner than cramming 2-up.

### 7.8 Score-meta abbreviations on narrow phone
- **Q:** At 320px (smallest viable phone), does `4 of 7 done · 200 pt · A+` truncate?
- **Recommendation:** Test during build. If truncation occurs, abbreviate `done` → `dn` first, then drop `pt` → keep number. Don't abbreviate the grade.

### 7.9 Bounty tag relabeling
- **Q:** Bounty tag currently reads `+5 bonus`. Now that we've named "store points" explicitly elsewhere, should the tag read `+5 pt`?
- **Recommendation:** Yes — `+5 pt` is more honest about what the kid earns. Plan-write should include this label change.

---

## 8. Success criteria

This spec is a success when:

1. A reader unfamiliar with the dashboard can read it cold in 10 minutes and know exactly what's being built.
2. The first viewport (375×667) shows: header, banner-or-spacer, ambient-or-spacer, Coming up collapsed, Today section head + at least one card.
3. Every section has empty / loading / error / populated states defined.
4. Every interaction has a tap target, a non-gesture fallback, and a kid-mode + person-link reflection.
5. Tablet two-pane layout is unambiguously specced (left = action, right = context).
6. Kiosk reflection table prevents future feature work from shipping phone-only without a kiosk plan.
7. Diff vs. today (Section 6) is mechanical enough that the implementation plan is mostly task ordering, not re-design.
8. Backlog items 1.3, 1.4, 1.6, 2.4 wire into specced extension points without redesign when they ship.
9. Nothing in this spec contradicts CLAUDE.md or DESIGN.md without a corresponding amendment flagged in Section 9.

---

## 9. Required CLAUDE.md / DESIGN.md updates (cross-product alignment)

These edits ride in the same PR that ships this spec, so the docs stay coherent.

### 9.1 DESIGN.md edits

- **§6.1 Dashboard:** Replace the current section list with the 8-section list from this spec. Update "Ambient strip" line: change "Off by default on phone" → "Off by default until 1.3+1.4 ship; on by default thereafter, user-toggleable in Admin → Settings → Appearance → Display." Add Coming up rail to backlog integration list. Add Tablet two-pane map (Section 2.3). Update Kiosk reflection note.
- **§6.9 Person-link mode:** Retire the "Viewing as {Name}" pill rule. Title-becomes-name is the single identity cue.
- **§7.3 Banner queue:** Add Scoreboard and Tracker to the list of pages that render the banner mount. Note: enables running-activity (1.6) banner persistence across pages.
- **§7.8 Long-press timing:** Update dashboard from `500ms (legacy default)` to `800ms (default)`. Note `settings.longPressMs` override remains.
- **Banner variants list (§5.9):** Add `--info` with two sub-uses (running-activity, offline). Confirm `--vacation` and `--freeze` are listed.

### 9.2 CLAUDE.md edits

- **Backlog item 3.3 (Coming up rail):** Mark as "fully specced — see [docs/superpowers/specs/2026-04-25-dashboard-final-design.md](docs/superpowers/specs/2026-04-25-dashboard-final-design.md) Section 3.4." Tighten scope: confirm collapsed-by-default, events-only count, day-block head jumps `viewDate`.
- **Backlog item 1.3 (Meals):** Add wiring note: dinner chip lands in dashboard ambient strip per spec Section 3.3; add "Plan a meal" item to FAB add-menu per Section 3.8.
- **Backlog item 1.4 (Weather):** Add wiring note: weather chip lands in dashboard ambient strip per spec Section 3.3; chip is `viewDate`-aware (7-day forecast).
- **Backlog item 1.6 (Activities):** Add wiring note: running-activity surfaces as `--info` banner sub-variant in dashboard banner queue per spec Section 3.2; banner persists across Scoreboard + Tracker per Section 4.6.
- **Backlog item 2.4 (Vacation):** Add wiring note: vacation surfaces as `--vacation` banner variant per spec Section 3.2.
- **Backlog item 3.0 (Loading skeleton):** Mark as "rolled into 2026-04-25-dashboard-final-design implementation."
- **Design Rules digest:** Update phone tab bar reference if needed (still 4 slots, 5th reserved). Confirm the "no `settings.showPoints`" change in changelog row.
- **Changelog entry:** Add row for this design spec.

---

## 10. Implementation hand-off

Next step: invoke `superpowers:writing-plans` to produce the task-by-task implementation plan. The plan should be mechanical, not a second design pass — every decision in this spec is final unless an implementation discovery surfaces a real conflict.

Plan should cover, in order:
1. Section 6 *Removed* items (delete `settings.showPoints` and per-card chip).
2. Long-press default change (`settings.longPressMs ?? 800`).
3. Back-to-Today pill position move.
4. Loading skeleton replacing inline spinner.
5. Banner queue: add `--info` (offline now; running-activity + vacation as dead variants); add overdue body tappable; add mount to Scoreboard + Tracker.
6. Ambient strip component (with both chips returning empty-state until 1.3 + 1.4 ship).
7. Coming up rail component + section.
8. Today section meta with score chips (filter-gated).
9. FAB `activePerson` pre-fill.
10. Cross-product doc updates (CLAUDE.md + DESIGN.md per Section 9).
11. SW cache bump.
