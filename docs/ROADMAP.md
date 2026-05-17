# Daily Rundown — Product Roadmap

**Direction:** Evolve from a task manager into a free Skylight Calendar competitor — a family hub. Superior task/scoring engine already exists; the goal is adding hub features (calendar, meals, lists, kiosk display, photos) that make it the family's single go-to screen. Design bar: as clean as Skylight, as easy as Google Calendar. All features run on free tiers except AI features (~$0.03/month via Claude API).

**Read before feature planning.** For UI placement rules, see [DESIGN.md](DESIGN.md) §2 (feature-home map).

**Sizing legend** — items below are categorized by **what's involved to ship them**, not just hours:
- **EASY** — single-domain UI, no new schema or external APIs. Usually ½–1 session.
- **MEDIUM** — new schema, new view, internal complexity, but stays inside the existing infrastructure. 1–3 sessions.
- **HARD** — external APIs/OAuth, major schema changes, privacy/battery concerns, or multi-system orchestration. 3+ sessions.

---

## Nav Bar
Currently **5 slots: Home · Kitchen · Scores · Rewards · More** — tab bar is capped at 5, no exceptions. Adding a slot requires retiring one.
More sheet contains: Admin · Calendar · Tracker · Theme.
Activities (in MEDIUM below) would earn a slot only by retiring an existing one (Rewards is the candidate if it moves fully into Scoreboard).

---

## EASY

Single-domain UI, no new schema or external APIs. ½–1 session each.

**Birthday & Milestone Tracking** · No deps · Cost: $0
`birthday` field on people. Auto-creates annual recurring birthday events. Countdown chip in kid mode. Extends to anniversaries, first day of school.

**Kid Feelings Check-in** · No deps · Cost: $0
Daily mood check-in in kid mode — 5 emoji options. Logged once per day to `rundown/feelings/{personId}/{YYYY-MM-DD}`. Resets each morning.

**Family Message Board** · No deps · Cost: $0
Shared sticky-note thread on dashboard. Any member can post short notes ("Don't forget soccer cleats!"). Notes expire after 7 days or are manually dismissed. Separate from the notification bell (which is parent→kid only).

**Gift idea log** · No deps · Cost: $0
Captured year-round per person. Surfaces in a sheet near birthdays. Schema: `rundown/giftIdeas/{pushId}: { person, idea, addedAt, addedBy }`.

**Sentiment trend visualization** · Depends on Kid Feelings Check-in · Cost: $0
Per-kid mood chart over weeks/months. Simple line/dot graph in scoreboard or admin. Useful for parents to spot patterns.

**Year-in-review** · No deps · Cost: $0
December 31 gamified annual recap — task counts, badges earned, perfect days, total points, top recipe, etc. Shareable image (HTML→PNG via canvas). Could fire automatically on Jan 1.

**Print / PDF weekly summary** · No deps · Cost: $0
One-page "this week" PDF for the fridge — kids physically check off as the week progresses. CSS print styles + browser native print, or a small PDF lib if needed.

**Reading log** · No deps · Cost: $0
Per-kid reading minutes. Daily check-in, weekly streak, monthly leaderboard. Schema: `rundown/reading/{personId}/{YYYY-MM-DD}: minutes`. Could integrate with Activities later (in MEDIUM) but ships standalone first.

---

## MEDIUM

New schemas/views, internal complexity, but no external APIs. 1–3 sessions each.

**Kiosk / Wall Display Mode** · Depends on Calendar + Meals + Weather (all shipped) · Cost: $0 (hardware ~$175–255)
`display.html` — dedicated full-screen mode for a wall-mounted touchscreen or tablet. NOT read-only — full interactivity at large scale. Default state: week overview (events + tasks + meals + weather). Larger touch targets, no browser chrome, auto-wake/sleep. No admin access. Launches via Chromium `--kiosk` flag or Android full-screen.

  - **Family photos for kiosk** · Sub-feature; depends on Kiosk shipping first · Cost: $0
    Photo carousel as kiosk idle/screensaver state — what actually makes the kiosk feel like a Skylight. Without photos, the kiosk is just a digital wall calendar. Schema: `rundown/photos/{pushId}: { url, caption, uploadedBy, takenAt }`. Weekly photo upload could become a recurring family task. **Doesn't add value until Kiosk ships** — bundle into the same project.

**Activities (Phase 1)** · No deps · Cost: $0
Activity library, shared timer component (`shared/timer.js` — reused by Task Timer below), stopwatch, session logging, time leaderboard, admin management. Lives in More tab on phone.
Full spec: [superpowers/specs/2026-04-19-activities-design.md](superpowers/specs/2026-04-19-activities-design.md)

**Push Notifications** · Phase 1 shipped 2026-05-15 · Cost: $0
Phase 1 (shipped): subscribe per device, push for bell messages + reward approval requests + reward FYI. Remaining phases (event reminders, task reminders, daily digest, quiet hours) tracked in [docs/superpowers/specs/2026-05-15-push-notifications-design.md](superpowers/specs/2026-05-15-push-notifications-design.md).

**Flexible Recurrence** · Depends on Calendar (shipped) · Cost: $0
"Every N days", "every other week", "1st and 15th of month". Schema: add `recurrenceRule` to task/event. Extends `shared/scheduler.js`.

**Vacation / Skip Mode** · No deps · Cost: $0
Mark a person as away for a date range. Schema: `rundown/people/{id}/away: [{start, end}]`. Scheduler skips placing tasks for away people. Dashboard `--vacation` banner (highest priority — outranks freeze/overdue/multiplier/info). Calendar shading for away days.

**Task Timer / Stopwatch** · Depends on Activities Phase 1 (shared timer) · Cost: $0
Visible countdown on task cards using `estMin`. Start button → timer overlay. Optional auto-complete on finish. Reuses `shared/timer.js` built in Activities — do not build a second timer.

**Routines / Sequences** (kids AND adults) · No deps · Cost: $0
Morning routine, bedtime routine, exercise routine, etc. — ordered task sequences with progress through steps. Different shape from individual tasks: kids check off in order, optional per-step timer, completes when all steps done. Time-bounded steps optional. For BOTH kids and adults. Schema: `rundown/routines/{id}: { name, steps: [{name, estMin}], assignedTo, time, recurrence }`.

**Allowance ledger** · No deps · Cost: $0
Real $ tracking separate from points. Weekly allowance auto-credit, manual adjustments, spend log. Could bridge to points: "redeem 100pts for $5 added to allowance." Schema: `rundown/allowance/{personId}: { balance, transactions: [...] }`. Could surface alongside the existing points balance on scoreboard.

**Health / medication tracking** · No deps · Cost: $0
Daily med tracking with photo of pills + "did kid take meds?" check. Doctor/dentist appointment tracking with "next checkup due" reminders (e.g., 6 months after last cleaning). Schema: `rundown/health/{personId}/meds`, `rundown/health/{personId}/appointments`. Distinct from generic tasks because consequence of forgetting is bigger.

**Sibling collaboration tasks** · Depends on existing scheduler · Cost: $0
Shared tasks where multiple kids contribute. "Both Lexi AND Elijah complete X for 50pts each" or "Family achieves 1000pts this week → bonus reward." Different mechanic than rotation; extends scheduler + scoring.

**External calendar export (`.ics` feed)** · No deps · Cost: $0 (Cloudflare Worker free tier)
Inverse of iCal import. App generates a `.ics` feed at a private signed URL per person. Family members subscribe in their personal Google/Apple/Outlook calendars. Grandparents/coaches/babysitters subscribe to specific kids' schedules. Worker generates the feed on demand from Firebase data. Cheaper-to-build cousin of full two-way Google sync (in HARD).

**Weekly family digest** · Depends on Push Notifications OR Cloudflare email infrastructure · Cost: $0 (free Cloudflare Cron tier)
Auto-generated Sunday summary email/notification. "This week: Lexi did 14 tasks (87% on time), Elijah earned 3 badges, you spent $218 on groceries." Cloudflare Worker scheduled function reads stats and sends.

---

## HARD

External APIs, OAuth, major schema changes, privacy/battery concerns, or multi-system orchestration. 3+ sessions each.

**Activities (Phase 2)** · Depends on Phase 1 (in MEDIUM) · Cost: $0
Weekly goals, tiered payouts, goal achievement scoreboard, kid mode activities page, per-kid toggles. Builds on Phase 1 timer + library.

**Task Delegation / Swaps** · Depends on Push Notifications (in MEDIUM) · Cost: $0
Family members propose task trades. Schema: `rundown/trades/{pushId}`. UI: notification badge, proposal from detail sheet, accept/decline list. Real-time multi-user negotiation flows.

**Two-way Google Calendar sync** · External API · Cost: $0 (Google API free tier)
Events created in either app or Google Calendar appear in both. OAuth + Google Calendar API + conflict resolution. **The integration that makes the app fully replace GCal.** Way down the road — `.ics` export (in MEDIUM) is the cheaper substitute that delivers ~70% of the value.

**Voice assistant (Alexa / Google Home)** · External API · Cost: $0 (free skill tier)
"Hey Google, add 'soccer practice Thursday at 4pm' to family calendar." OAuth, skill/action development per ecosystem, latency handling. Bridges into the family's existing smart-home ecosystem.

**Multi-family / split household** · Major schema rewrite · Cost: $0
Co-parenting / split-household. Two families share the kid's tasks but have different settings/views. Currently the entire `rundown/` Firebase root assumes one household — supporting two requires permission models, scoped reads/writes, and merge UX.

**Location sharing (Life360-lite)** · Privacy/battery sensitive · Cost: $0
Family members opt-in share location. Map view shows where everyone is. Could integrate with events ("at soccer field" → match to scheduled practice). Real privacy/battery tradeoffs — kid privacy especially needs careful UX.

---

## Explicitly passed (not coming back to roadmap)

Items considered and dropped. Listed so they don't accidentally creep back in.

- Pantry awareness for kitchen (won't be kept up to date)
- Per-person meal ratings (single 0–5 rating per recipe is enough)
- Subscription/bill tracker, home maintenance scheduler (household-level, not family-level)
- Babysitter mode, audio messages, packing lists (out of current scope)
- Family quick-select chip on Task/Event forms (takes space, rarely needed)
- Recipe image preview in form (not needed)
- Badge preview card and Reward shop-card preview (low value)
- Custom badge SVG icons (emoji works; differentiation comes from name + description, not vector vs emoji)
- Badge two-step wizard (after the form-polish labels + trigger hint, the single screen scans in 2 seconds; wizard would add friction)
- Pricing-help calc extended to Task points (now behind the scenes)
- Meal Plan default-list extension (keep form short)
- Recipe form name-above-link reorder (most recipes added via URL)
