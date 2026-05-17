# Push Notifications — Phases 2–5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the push-notification system by adding scheduled (time-triggered) deliveries — event reminders, task reminders, daily digest — plus quiet hours, multi-device management, and automatic subscription recovery. Each phase commits independently and is Cloudflare-deployable on its own.

**Architecture:** One Cloudflare Worker Cron Trigger (`*/5 * * * *`) drives a single `scheduled` handler in `workers/kitchen-import.js`. The handler walks each opted-in person, evaluates whether their event-reminder / task-reminder / digest window is open, and dispatches via the same VAPID-signed `sendWebPush` helper built in Phase 1. A new `notifications/sent/{YYYY-MM-DD}/{key}` index in Firebase prevents double-sends across cron reruns. UI controls grow phase-by-phase inside the existing `Customize → Notifications` section.

**Tech stack:** Cloudflare Workers (existing `workers/kitchen-import.js`, ~1400 lines), Cloudflare Cron Triggers (free tier), Firebase Realtime DB (compat SDK + REST), Web Push (VAPID — built in Phase 1), vanilla JS frontend, `Intl.DateTimeFormat` for timezone math.

**Spec:** [docs/superpowers/specs/2026-05-15-push-notifications-design.md](../specs/2026-05-15-push-notifications-design.md)

**Phase 1 reference:** [docs/superpowers/plans/2026-05-15-push-notifications-phase-1.md](2026-05-15-push-notifications-phase-1.md)

---

## Verification approach (read first)

Same pattern as Phase 1: no unit-test framework in this project. Each task ends with concrete verification steps using `curl`, `wrangler tail`, browser DevTools, or production observation.

For each cron-fired feature, the loop is:
1. `npx wrangler deploy --config workers/wrangler.toml`
2. Trigger the cron manually via `wrangler triggers --config workers/wrangler.toml schedule "*/5 * * * *"` if needed, or wait for the next 5-min boundary.
3. `npx wrangler tail --config workers/wrangler.toml` to watch logs.
4. Confirm Firebase records appear under `notifications/sent/{date}/...`.
5. Real notification arrives on a subscribed device (you can pre-create test event/task/digest scenarios in Firebase to trigger specific paths).

---

## Phase index

| Phase | Tasks | What ships |
|---|---|---|
| Phase 2 | 1–4 | Event reminders + cron infrastructure + UI |
| Phase 3 | 5–6 | Task reminders + UI |
| Phase 4 | 7–8 | Daily digest + UI |
| Phase 5 | 9–11 | Quiet hours + multi-device mgmt UI + auto re-subscribe |
| Wrap-up | 12 | Docs + roadmap status update |

---

## File map (across all 12 tasks)

**Modify:**
- `workers/wrangler.toml` — add `[triggers]` cron schedule.
- `workers/kitchen-import.js` — add `scheduled` handler + new helpers (~400 lines added across all tasks).
- `shared/push-ui.js` — extend Notifications section with new toggles + time pickers (~200 lines added).
- `shared/firebase.js` — no new helpers needed (Worker uses REST, not the SDK helpers).
- `sw.js` — add `pushsubscriptionchange` listener (Phase 5); bump CACHE_NAME per phase.
- `docs/ROADMAP.md` — mark all phases shipped at end.
- `docs/superpowers/specs/2026-05-15-push-notifications-design.md` — update status line at end.

**Reference only:**
- `docs/DESIGN.md` §10.4 (Customize sheet structure).
- `shared/utils.js` `dateToKey(date, timezone)` — pure helper we reuse for date math.

---

## Known scope cuts (explicit, do NOT implement)

- **Recurring event expansion** — Phase 2 reminders fire for non-recurring events (`repeats` field absent or null) only. Recurring events (every Thursday, etc.) won't get reminders. Add a Phase 2.1 plan if user requests.
- **Per-event reminder overrides** — all events use the person's `eventLeadMin` setting. No per-event "remind me 1 day before this one" override.
- **Approve/Deny notification actions on reward requests** — Phase 1 SW has a `// TODO Phase 2` for this but it requires plumbing into Worker + Firebase write back. Defer to a focused micro-plan once Phase 2-5 ship — not in scope for THIS plan.
- **Snooze** — no "snooze for 1 hour" UI.
- **Custom digest content** — body is templated, not user-customizable.

---

## Task 1: Cron trigger + scheduled handler skeleton

**Files:**
- Modify: `workers/wrangler.toml` (add `[triggers]` block)
- Modify: `workers/kitchen-import.js` (add `scheduled` export + stub)

- [ ] **Step 1: Add cron trigger to wrangler.toml**

Append below the existing config (after `compatibility_date`):

```toml
[triggers]
crons = ["*/5 * * * *"]
```

Cron syntax is UTC. `*/5 * * * *` = every 5 minutes. The scheduled handler converts to family timezone internally.

- [ ] **Step 2: Add the `scheduled` export skeleton**

Find the default export at the bottom of `workers/kitchen-import.js` (around line 1396):

```js
export default {
  async fetch(request, env) { ... },
  async email(message, env, ctx) { ... },
};
```

Add a `scheduled` method:

```js
export default {
  async fetch(request, env) { ... },
  async email(message, env, ctx) { ... },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
};

// ── Scheduled handler (cron-driven push) ──────────────────────────────────────

async function runScheduled(env, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  console.log('[scheduled] tick at', now.toISOString());
  // TODO Tasks 3, 5, 7: event reminders, task reminders, digest.
}
```

- [ ] **Step 3: Add a fbSet helper to mirror fbGet / fbDelete**

Find the Firebase REST helpers (added in Phase 1, around line 80). Currently has `fbGet`, `fbDelete`. Add `fbSet` immediately after `fbDelete`:

```js
async function fbSet(env, path, value) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) throw new Error('Firebase env missing');
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  const r = await fetch(`${base}/${RUNDOWN_ROOT}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`fbSet ${path}: ${r.status}`);
}
```

- [ ] **Step 4: Deploy and verify cron fires**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

Deploy output should include:
```
Schedules
- crons: */5 * * * *
```

Tail logs in one terminal:
```bash
npx wrangler tail --config workers/wrangler.toml --format pretty
```

Wait until the next 5-minute boundary (e.g., :00, :05, :10). You should see `[scheduled] tick at <ISO timestamp>` in the tail output. If it does NOT fire, check `wrangler triggers list --config workers/wrangler.toml` to confirm the cron is registered.

- [ ] **Step 5: Commit**

```bash
git add workers/wrangler.toml workers/kitchen-import.js
git commit -m "feat(worker): scheduled handler skeleton + cron trigger every 5 min"
```

---

## Task 2: notifications/sent dedup helpers + housekeeping

**Files:**
- Modify: `workers/kitchen-import.js` (add dedup helpers + cleanup sweep)

- [ ] **Step 1: Add dedup helpers**

Append after `fbSet`:

```js
// ── Notification dedup index ──────────────────────────────────────────────────
// notifications/sent/{YYYY-MM-DD}/{key} = true
// Prevents a cron rerun from sending the same notification twice.

async function dedupCheck(env, dateKey, dedupKey) {
  const v = await fbGet(env, `notifications/sent/${dateKey}/${dedupKey}`);
  return v === true;
}

async function dedupMark(env, dateKey, dedupKey) {
  await fbSet(env, `notifications/sent/${dateKey}/${dedupKey}`, true);
}

// Daily cleanup: remove dedup entries older than 7 days.
// Called from the scheduled handler at most once per cron tick.
async function dedupCleanup(env, todayKey) {
  const all = await fbGet(env, 'notifications/sent');
  if (!all || typeof all !== 'object') return;
  const cutoff = new Date(todayKey + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  for (const dateKey of Object.keys(all)) {
    if (dateKey < cutoffKey) {
      await fbDelete(env, `notifications/sent/${dateKey}`);
    }
  }
}
```

- [ ] **Step 2: Wire dedupCleanup into the scheduled handler (gated to ~1×/day)**

We only want cleanup to run once per day, not every 5 min. Cheapest gate: run when `now` is between 03:00 and 03:05 UTC.

Update `runScheduled`:

```js
async function runScheduled(env, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  console.log('[scheduled] tick at', now.toISOString());

  // Housekeeping: ~once a day, prune dedup entries older than 7 days.
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
    try {
      const todayKey = now.toISOString().slice(0, 10);
      await dedupCleanup(env, todayKey);
      console.log('[scheduled] dedup cleanup done');
    } catch (err) {
      console.warn('[scheduled] dedup cleanup failed', err.message);
    }
  }

  // TODO Tasks 3, 5, 7: event reminders, task reminders, digest.
}
```

- [ ] **Step 3: Deploy + verify no crash**

```bash
npx wrangler deploy --config workers/wrangler.toml
npx wrangler tail --config workers/wrangler.toml --format pretty
```

Wait for the next cron tick. You should still see `[scheduled] tick at ...` with no error. (You won't see the dedup cleanup log unless you're testing near 03:00 UTC.)

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): notifications/sent dedup helpers + daily cleanup"
```

---

## Task 3: Event reminder logic

**Files:**
- Modify: `workers/kitchen-import.js` (extend `runScheduled` with event branch)

This is the meat of Phase 2: read events, match per-person windows, dispatch pushes.

- [ ] **Step 1: Add timezone-aware time helpers**

Append to the helpers block near the existing date helpers (or just below `dedupCleanup`):

```js
// ── Timezone-aware time helpers (matches shared/utils.js patterns) ────────────

function dateKeyInTz(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

// Returns {hours, minutes} in the given tz, e.g. {hours: 17, minutes: 03}.
function timeInTz(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  // Intl returns "24" for midnight in some locales — normalize.
  return { hours: h === 24 ? 0 : h, minutes: m };
}

// Convert a date key + HH:MM string in a given timezone to a UTC Date.
function localDateTimeToUtc(dateKey, hhmm, tz) {
  // Strategy: build the UTC midnight of dateKey, then iteratively adjust until
  // its representation in `tz` matches `hhmm`. For a non-leap-second world this
  // is correct within one DST-transition iteration.
  const [hh, mm] = hhmm.split(':').map(Number);
  const targetMin = hh * 60 + mm;
  // Start at UTC midnight of the dateKey.
  let d = new Date(dateKey + 'T00:00:00Z');
  for (let i = 0; i < 3; i++) {
    const { hours, minutes } = timeInTz(d, tz);
    const actualMin = hours * 60 + minutes;
    const diff = targetMin - actualMin;
    if (diff === 0) return d;
    d = new Date(d.getTime() + diff * 60_000);
  }
  return d;
}
```

The `localDateTimeToUtc` iteration handles the fact that UTC midnight of a date in (e.g.) America/New_York is not midnight in NY — DST means the offset varies. Iterating up to 3× converges.

- [ ] **Step 2: Add the event reminder branch**

Extend `runScheduled`:

```js
async function runScheduled(env, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  console.log('[scheduled] tick at', now.toISOString());

  // Housekeeping
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
    try {
      const todayUtcKey = now.toISOString().slice(0, 10);
      await dedupCleanup(env, todayUtcKey);
    } catch (err) {
      console.warn('[scheduled] dedup cleanup failed', err.message);
    }
  }

  // Read shared state once
  const [settings, people, events] = await Promise.all([
    fbGet(env, 'settings').catch(() => null),
    fbGet(env, 'people').catch(() => null),
    fbGet(env, 'events').catch(() => null),
  ]);
  const tz = settings?.timezone || 'America/New_York';
  if (!people || !events) {
    console.log('[scheduled] no people or events — skipping');
    return;
  }

  await runEventReminders(env, now, tz, people, events);
  // TODO Tasks 5, 7: task reminders, digest.
}

async function runEventReminders(env, now, tz, people, events) {
  // For each person opted-in to event reminders, look at events whose start time
  // falls in [now + leadMin - 2.5min, now + leadMin + 2.5min] in family tz.
  const todayKey = dateKeyInTz(now, tz);
  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.eventReminders !== false
  );
  if (optedIn.length === 0) return;

  for (const [personId, person] of optedIn) {
    const leadMin = person.prefs.notifications.eventLeadMin || 15;
    // Reminder window: events whose start falls in [now + (leadMin - 2.5), now + (leadMin + 2.5)].
    const windowStart = new Date(now.getTime() + (leadMin - 2.5) * 60_000);
    const windowEnd   = new Date(now.getTime() + (leadMin + 2.5) * 60_000);

    for (const [eventId, ev] of Object.entries(events)) {
      // Skip recurring events (Phase 2.1 scope).
      if (ev.repeats && ev.repeats !== 'none' && ev.repeats !== null) continue;
      // Skip all-day events (no timed reminder).
      if (ev.allDay) continue;
      // Skip events without ownership.
      const owners = Array.isArray(ev.owners) ? ev.owners
                   : ev.personId ? [ev.personId]
                   : [];
      if (!owners.includes(personId)) continue;
      if (!ev.date || !ev.time) continue;

      const eventStartUtc = localDateTimeToUtc(ev.date, ev.time, tz);
      if (eventStartUtc < windowStart || eventStartUtc > windowEnd) continue;

      // Dedup check
      const dedupKey = `evt_${eventId}_${personId}`;
      if (await dedupCheck(env, todayKey, dedupKey)) continue;

      // Send
      const payload = {
        title: ev.name || 'Upcoming event',
        body:  ev.location ? `${formatHhmm(ev.time)} · ${ev.location}` : `Starts at ${formatHhmm(ev.time)}`,
        icon:  '/app-icon.png',
        tag:   `evt-${eventId}`,
        data:  { url: '/calendar.html', type: 'eventReminders' },
      };
      try {
        await fanoutPush(env, personId, payload);
        await dedupMark(env, todayKey, dedupKey);
        console.log('[scheduled] sent eventReminder', personId, ev.name);
      } catch (err) {
        console.warn('[scheduled] eventReminder failed', personId, eventId, err.message);
      }
    }
  }
}

function formatHhmm(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}
```

- [ ] **Step 3: Factor out `fanoutPush` from `handlePush`**

`handlePush` (Phase 1) does subscription read + fan-out + 410 prune. Extract that into a reusable `fanoutPush(env, personId, payload)` so both `handlePush` and `runEventReminders` use it.

In `handlePush`, find the subscription read + fan-out loop (the section that reads `subsObj`, iterates, calls `sendWebPush`, handles 410). Extract everything from `// 2. Load subscriptions` through the loop into a new function:

```js
async function fanoutPush(env, personId, payload) {
  const subsObj = await fbGet(env, `pushSubscriptions/${personId}`);
  if (!subsObj || typeof subsObj !== 'object') {
    return { sent: 0, removed: 0, errors: 0, skipped: 'no-devices' };
  }
  let sent = 0, removed = 0, errors = 0;
  for (const [hash, sub] of Object.entries(subsObj)) {
    if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) continue;
    try {
      const r = await sendWebPush(sub, payload, env);
      if (r.ok) {
        sent++;
      } else if (r.status === 404 || r.status === 410) {
        await fbDelete(env, `pushSubscriptions/${personId}/${hash}`);
        removed++;
      } else {
        errors++;
        console.warn('[push] non-OK from push service', r.status, sub.endpoint);
      }
    } catch (err) {
      errors++;
      console.warn('[push] send failed', err.message);
    }
  }
  return { sent, removed, errors };
}
```

Now update `handlePush` to call it. Replace the `// 2. Load subscriptions` through end-of-fan-out block with:

```js
  // 2 & 3. Fan out via shared helper
  const result = await fanoutPush(env, personId, payload);
  return jsonOk(result, corsHeaders);
}
```

(The auth + pref filter at the top of `handlePush` remains unchanged. Only the subscription-load-and-loop section is replaced.)

- [ ] **Step 4: Test event reminder path manually**

Create a test event in production Firebase via the dashboard UI or via REST. The event needs:
- `name: "Test event"`
- `date: <today YYYY-MM-DD>`
- `time: <a few minutes from now, in HH:MM 24-hour, in family tz>`
- `owners: [<your personId>]`
- No `repeats` field

The lead time defaults to 15 min, so set the time ~15 min from now and wait for the next cron tick. You should:
1. See the event reminder fire in wrangler tail
2. Receive a push on your subscribed device
3. See `notifications/sent/{today}/evt_{eventId}_{personId}: true` in Firebase

Delete the test event after.

- [ ] **Step 5: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): event reminder scheduled logic; extract fanoutPush helper"
```

---

## Task 4: Phase 2 UI — event reminders toggle + lead time

**Files:**
- Modify: `shared/push-ui.js` (add toggle + lead-time selector inside the existing "What to send" block)
- Modify: `sw.js` (bump CACHE_NAME for the UI change)

- [ ] **Step 1: Extend DEFAULT_PREFS in push-ui.js**

Find `DEFAULT_PREFS` at the top of `shared/push-ui.js`. Change from:

```js
const DEFAULT_PREFS = {
  enabled: false,
  types: { bellMessages: true, rewardApprovals: true, rewardFyi: true },
};
```

to:

```js
const DEFAULT_PREFS = {
  enabled: false,
  types: {
    bellMessages: true,
    rewardApprovals: true,
    rewardFyi: true,
    eventReminders: true,
  },
  eventLeadMin: 15,
};
```

- [ ] **Step 2: Add event reminder UI rows inside the "What to send" section**

Find the existing 3 type toggles in `mountNotificationsSection`'s `render` function. Immediately AFTER the `rewardFyi` toggle (the `</label>` closing tag), add:

```js
        <label class="form-toggle">
          <span>Event reminders</span>
          <input type="checkbox" data-notif-type="eventReminders" ${t.eventReminders !== false ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
        ${t.eventReminders !== false ? `
          <div class="notif-subrow">
            <span class="notif-subrow__label">Remind me</span>
            <div class="segmented-control">
              <button type="button" class="segmented-btn${(prefs.eventLeadMin || 15) === 15 ? ' segmented-btn--active' : ''}" data-lead="15">15</button>
              <button type="button" class="segmented-btn${(prefs.eventLeadMin || 15) === 30 ? ' segmented-btn--active' : ''}" data-lead="30">30</button>
              <button type="button" class="segmented-btn${(prefs.eventLeadMin || 15) === 60 ? ' segmented-btn--active' : ''}" data-lead="60">60</button>
            </div>
            <span class="notif-subrow__suffix">min before</span>
          </div>
        ` : ''}
```

The sub-row is conditionally rendered: only visible when eventReminders is on. Tapping a min button updates `eventLeadMin`.

- [ ] **Step 3: Wire the lead-time selector**

In `wireListeners`, add to the END (after the existing type-toggle wiring):

```js
    mount.querySelectorAll('[data-lead]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lead = Number(btn.dataset.lead);
        if (![15, 30, 60].includes(lead)) return;
        const prev = prefs.eventLeadMin;
        try {
          await updateNotificationPrefs(personId, { eventLeadMin: lead });
          prefs.eventLeadMin = lead;
          render();
        } catch (err) {
          showToast(`Could not save lead time: ${err.message}`);
          prefs.eventLeadMin = prev;
        }
      });
    });
```

- [ ] **Step 4: Update the "More controls coming" hint**

Find:

```js
        <p class="form-hint">More controls (event reminders, task nudges, digest, quiet hours) coming in later phases.</p>
```

Change to (event reminders are now shipped):

```js
        <p class="form-hint">Task nudges, daily digest, and quiet hours coming in later phases.</p>
```

- [ ] **Step 5: Add the sub-row CSS**

Open `styles/components.css` and append (after the existing `.notif-section .form-toggle` rule):

```css
.notif-subrow {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0 var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-sm);
}
.notif-subrow__label {
  color: var(--text-muted);
}
.notif-subrow__suffix {
  color: var(--text-muted);
  font-size: var(--font-xs);
}
.notif-subrow .segmented-control {
  flex: 0 0 auto;
}
```

- [ ] **Step 6: Bump CACHE_NAME**

In `sw.js`, change `family-hub-v318` to `family-hub-v319`. Add comment at top of CACHE_BUMPS:

```js
// v319 (2026-05-15) — Phase 2: event reminders shipped — eventReminders
//                     toggle + lead time selector in Notifications.
```

- [ ] **Step 7: Verify locally**

```bash
node --check shared/push-ui.js && node --check sw.js
```

Both must pass.

- [ ] **Step 8: Commit + push**

```bash
git add shared/push-ui.js styles/components.css sw.js
git commit -m "feat(notifications): Phase 2 UI — event reminder toggle + lead time (v319)"
git push origin main
```

Cloudflare Pages deploys the frontend. The Worker is already deployed from Task 3.

**Phase 2 shipped.** Production users with eventReminders enabled will start getting push reminders 15/30/60 min before non-recurring events they own.

---

## Task 5: Task reminder scheduled logic

**Files:**
- Modify: `workers/kitchen-import.js` (extend `runScheduled` with task branch)

- [ ] **Step 1: Add the task reminder branch**

Find `runScheduled`. The TODO line for tasks is just below `runEventReminders`. Add a `runTaskReminders(env, now, tz, people)` call:

```js
  await runEventReminders(env, now, tz, people, events);
  await runTaskReminders(env, now, tz, people);
  // TODO Task 7: digest.
```

Then add the function. Append after `runEventReminders`:

```js
async function runTaskReminders(env, now, tz, people) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const nowMin = hours * 60 + minutes;

  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.taskReminders === true
    && typeof p?.prefs?.notifications?.taskReminderTime === 'string'
  );
  if (optedIn.length === 0) return;

  // Only schedule entries for today are loaded — task reminders are about
  // "what's left for the rest of today," not next week.
  const [scheduleToday, completions] = await Promise.all([
    fbGet(env, `schedule/${todayKey}`).catch(() => null),
    fbGet(env, 'completions').catch(() => null),
  ]);
  if (!scheduleToday || typeof scheduleToday !== 'object') return;

  for (const [personId, person] of optedIn) {
    const targetTime = person.prefs.notifications.taskReminderTime; // "HH:MM"
    const [targetH, targetM] = targetTime.split(':').map(Number);
    const targetMin = targetH * 60 + targetM;
    // Slack window: fire if |nowMin - targetMin| <= 2.5min.
    if (Math.abs(nowMin - targetMin) > 2.5) continue;

    const dedupKey = `task_${personId}`;
    if (await dedupCheck(env, todayKey, dedupKey)) continue;

    // Count incomplete entries for this person today.
    const myEntries = Object.entries(scheduleToday).filter(
      ([_, entry]) => entry?.ownerId === personId
    );
    const completedKeys = new Set(Object.keys(completions || {}));
    const incomplete = myEntries.filter(([entryKey]) => !completedKeys.has(entryKey));
    if (incomplete.length === 0) continue;

    const payload = {
      title: `${incomplete.length} task${incomplete.length === 1 ? '' : 's'} left today`,
      body:  'Tap to see what\'s remaining.',
      icon:  '/app-icon.png',
      tag:   `task-${personId}`,
      data:  { url: '/index.html', type: 'taskReminders' },
    };

    try {
      await fanoutPush(env, personId, payload);
      await dedupMark(env, todayKey, dedupKey);
      console.log('[scheduled] sent taskReminder', personId, incomplete.length, 'remaining');
    } catch (err) {
      console.warn('[scheduled] taskReminder failed', personId, err.message);
    }
  }
}
```

- [ ] **Step 2: Deploy + verify**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

To test: in Firebase set `people/{yourPersonId}/prefs/notifications/taskReminderTime` to a time ~5 min in the future (e.g., "17:23" if local is 17:18). Also set `types.taskReminders: true`. Wait for the cron window that matches. You should see the task reminder fire and a push arrive (assuming you have incomplete tasks today).

Note: The push won't fire if you have zero incomplete tasks. Confirm by checking `incomplete.length === 0` early-return is reached in tail.

- [ ] **Step 3: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): task reminder scheduled logic"
```

---

## Task 6: Phase 3 UI — task reminders toggle + time picker

**Files:**
- Modify: `shared/push-ui.js`
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Extend DEFAULT_PREFS**

```js
const DEFAULT_PREFS = {
  enabled: false,
  types: {
    bellMessages: true,
    rewardApprovals: true,
    rewardFyi: true,
    eventReminders: true,
    taskReminders: false,
  },
  eventLeadMin: 15,
  taskReminderTime: '17:00',
};
```

(Task reminders default OFF — many users won't want this nudge; opt-in.)

- [ ] **Step 2: Add the task reminder UI rows**

Immediately AFTER the event reminder block (the `</div>` closing the event-reminders sub-row) in `render`:

```js
        <label class="form-toggle">
          <span>Task reminders</span>
          <input type="checkbox" data-notif-type="taskReminders" ${t.taskReminders ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
        ${t.taskReminders ? `
          <div class="notif-subrow">
            <span class="notif-subrow__label">Remind me at</span>
            <input type="time" class="notif-subrow__time" data-time-pref="taskReminderTime" value="${prefs.taskReminderTime || '17:00'}">
            <span class="notif-subrow__suffix">if I have unfinished tasks</span>
          </div>
        ` : ''}
```

- [ ] **Step 3: Wire the time picker (shared handler for time prefs)**

In `wireListeners`, add at the end:

```js
    mount.querySelectorAll('[data-time-pref]').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.timePref;
        const val = input.value;
        if (!/^\d{2}:\d{2}$/.test(val)) return;
        const prev = prefs[key];
        try {
          await updateNotificationPrefs(personId, { [key]: val });
          prefs[key] = val;
        } catch (err) {
          showToast(`Could not save time: ${err.message}`);
          input.value = prev || '17:00';
        }
      });
    });
```

(This handler is generic — Phase 4 reuses it for digestTime.)

- [ ] **Step 4: Add CSS for the time input**

In `styles/components.css`, append:

```css
.notif-subrow__time {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px var(--spacing-xs);
  font-size: var(--font-sm);
  color: var(--text);
  color-scheme: light dark;
}
```

- [ ] **Step 5: Update the "coming in later phases" hint**

Change:

```js
        <p class="form-hint">Task nudges, daily digest, and quiet hours coming in later phases.</p>
```

to:

```js
        <p class="form-hint">Daily digest and quiet hours coming in later phases.</p>
```

- [ ] **Step 6: Bump CACHE_NAME**

`sw.js`: `family-hub-v319` → `family-hub-v320`. Comment:

```js
// v320 (2026-05-15) — Phase 3: task reminders shipped — toggle + time
//                     picker in Notifications.
```

- [ ] **Step 7: Verify + commit + push**

```bash
node --check shared/push-ui.js && node --check sw.js
git add shared/push-ui.js styles/components.css sw.js
git commit -m "feat(notifications): Phase 3 UI — task reminder toggle + time picker (v320)"
git push origin main
```

**Phase 3 shipped.**

---

## Task 7: Daily digest scheduled logic

**Files:**
- Modify: `workers/kitchen-import.js` (extend `runScheduled` with digest branch)

- [ ] **Step 1: Add the digest branch call**

In `runScheduled`, replace `// TODO Task 7: digest.` with:

```js
  await runDailyDigest(env, now, tz, people, events);
```

- [ ] **Step 2: Add `runDailyDigest`**

Append after `runTaskReminders`:

```js
async function runDailyDigest(env, now, tz, people, events) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const nowMin = hours * 60 + minutes;

  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.dailyDigest === true
    && typeof p?.prefs?.notifications?.digestTime === 'string'
  );
  if (optedIn.length === 0) return;

  // Schedule is read lazily — only if some person is in the digest window.
  let scheduleToday = null;

  for (const [personId, person] of optedIn) {
    const targetTime = person.prefs.notifications.digestTime; // "HH:MM"
    const [targetH, targetM] = targetTime.split(':').map(Number);
    const targetMin = targetH * 60 + targetM;
    if (Math.abs(nowMin - targetMin) > 2.5) continue;

    const dedupKey = `dgst_${personId}`;
    if (await dedupCheck(env, todayKey, dedupKey)) continue;

    if (!scheduleToday) scheduleToday = await fbGet(env, `schedule/${todayKey}`).catch(() => null);

    // Count this person's task entries for today
    const taskCount = scheduleToday
      ? Object.values(scheduleToday).filter(e => e?.ownerId === personId).length
      : 0;

    // Find this person's events for today (non-recurring, owned or shared)
    const myEvents = Object.values(events || {}).filter(ev => {
      if (ev.date !== todayKey) return false;
      const owners = Array.isArray(ev.owners) ? ev.owners
                   : ev.personId ? [ev.personId]
                   : [];
      return owners.length === 0 || owners.includes(personId);
    });
    const eventCount = myEvents.length;

    // Compose body
    const firstTimedEvent = myEvents
      .filter(e => !e.allDay && e.time)
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    let body;
    if (eventCount === 0 && taskCount === 0) {
      body = 'Nothing scheduled today.';
    } else {
      const parts = [];
      if (eventCount > 0) parts.push(`${eventCount} event${eventCount === 1 ? '' : 's'}`);
      if (taskCount > 0)  parts.push(`${taskCount} task${taskCount === 1 ? '' : 's'}`);
      body = parts.join(', ');
      if (firstTimedEvent) {
        body += `. First up: ${firstTimedEvent.name} at ${formatHhmm(firstTimedEvent.time)}.`;
      } else {
        body += '.';
      }
    }

    const payload = {
      title: 'Today',
      body,
      icon:  '/app-icon.png',
      tag:   `digest-${personId}-${todayKey}`,
      data:  { url: '/index.html', type: 'dailyDigest' },
    };

    try {
      await fanoutPush(env, personId, payload);
      await dedupMark(env, todayKey, dedupKey);
      console.log('[scheduled] sent digest', personId);
    } catch (err) {
      console.warn('[scheduled] digest failed', personId, err.message);
    }
  }
}
```

- [ ] **Step 3: Deploy + verify**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

To test: set your `prefs.notifications.dailyDigest: true` and `digestTime` to ~5 min in the future. Wait for the cron. Confirm digest arrives.

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): daily digest scheduled logic"
```

---

## Task 8: Phase 4 UI — daily digest toggle + time picker

**Files:**
- Modify: `shared/push-ui.js`
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Extend DEFAULT_PREFS**

```js
const DEFAULT_PREFS = {
  enabled: false,
  types: {
    bellMessages: true,
    rewardApprovals: true,
    rewardFyi: true,
    eventReminders: true,
    taskReminders: false,
    dailyDigest: false,
  },
  eventLeadMin: 15,
  taskReminderTime: '17:00',
  digestTime: '07:00',
};
```

- [ ] **Step 2: Add digest UI rows**

After the task-reminder block in `render`:

```js
        <label class="form-toggle">
          <span>Daily morning summary</span>
          <input type="checkbox" data-notif-type="dailyDigest" ${t.dailyDigest ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
        ${t.dailyDigest ? `
          <div class="notif-subrow">
            <span class="notif-subrow__label">Send at</span>
            <input type="time" class="notif-subrow__time" data-time-pref="digestTime" value="${prefs.digestTime || '07:00'}">
          </div>
        ` : ''}
```

The shared `[data-time-pref]` wiring from Task 6 picks this up automatically — no new listener needed.

- [ ] **Step 3: Update the hint**

```js
        <p class="form-hint">Quiet hours coming in the next phase.</p>
```

- [ ] **Step 4: Bump CACHE_NAME**

`sw.js`: `v320` → `v321`. Comment:

```js
// v321 (2026-05-15) — Phase 4: daily digest shipped — toggle + time
//                     picker in Notifications.
```

- [ ] **Step 5: Verify + commit + push**

```bash
node --check shared/push-ui.js && node --check sw.js
git add shared/push-ui.js sw.js
git commit -m "feat(notifications): Phase 4 UI — daily digest toggle + time picker (v321)"
git push origin main
```

**Phase 4 shipped.**

---

## Task 9: Quiet hours — enforcement + UI

**Files:**
- Modify: `workers/kitchen-import.js` (quiet-hours check in scheduled handler)
- Modify: `shared/push-ui.js` (quiet hours UI section)
- Modify: `styles/components.css` (if any new styles)
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Add a quiet-hours helper to the Worker**

In `workers/kitchen-import.js`, append below `timeInTz`:

```js
// quietHours: { start: "HH:MM", end: "HH:MM" } in family timezone.
// Handles wraparound (start > end means range spans midnight).
function isInQuietHours(quietHours, hours, minutes) {
  if (!quietHours?.start || !quietHours?.end) return false;
  const [sh, sm] = quietHours.start.split(':').map(Number);
  const [eh, em] = quietHours.end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  const nowMin   = hours * 60 + minutes;
  if (startMin === endMin) return false; // empty range = disabled
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  // Wraparound: e.g. 21:00 → 07:00.
  return nowMin >= startMin || nowMin < endMin;
}
```

- [ ] **Step 2: Apply the check in each time-triggered branch**

In `runEventReminders`, `runTaskReminders`, and `runDailyDigest`, before each push send, add the quiet-hours gate. Insert immediately after `if (await dedupCheck(...)) continue;`:

```js
    // Quiet-hours gate (time-triggered types only)
    const qh = person.prefs?.notifications?.quietHours;
    if (qh && isInQuietHours(qh, hours, minutes)) {
      console.log('[scheduled] skipped (quiet hours)', personId, '<type>');
      continue;
    }
```

For `runEventReminders` specifically, you'll need to compute `hours`, `minutes` from `now` once at the top of the function (it's not already there):

```js
async function runEventReminders(env, now, tz, people, events) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  ...
}
```

(`runTaskReminders` and `runDailyDigest` already compute `hours`, `minutes` for their target-time comparisons.)

- [ ] **Step 3: Add the quiet-hours UI in push-ui.js**

In `render`, ABOVE the closing `</div>` of `.notif-section` (after the hint paragraph), add:

```js
        <div class="notif-quiet">
          <p class="form-hint">Quiet hours</p>
          <label class="form-toggle">
            <span>Don't disturb me</span>
            <input type="checkbox" id="notif_qh_enabled" ${prefs.quietHours ? 'checked' : ''}>
            <span class="form-toggle__track"></span>
          </label>
          ${prefs.quietHours ? `
            <div class="notif-subrow">
              <input type="time" class="notif-subrow__time" data-qh-bound="start" value="${prefs.quietHours.start || '21:00'}">
              <span class="notif-subrow__suffix">to</span>
              <input type="time" class="notif-subrow__time" data-qh-bound="end" value="${prefs.quietHours.end || '07:00'}">
            </div>
            <p class="form-hint">Bell messages and reward approvals still come through.</p>
          ` : ''}
        </div>
```

- [ ] **Step 4: Wire the quiet-hours listeners**

In `wireListeners`, at the end:

```js
    mount.querySelector('#notif_qh_enabled')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      const prev = prefs.quietHours;
      try {
        if (enabled) {
          prefs.quietHours = prefs.quietHours || { start: '21:00', end: '07:00' };
          await updateNotificationPrefs(personId, { quietHours: prefs.quietHours });
        } else {
          await updateNotificationPrefs(personId, { quietHours: null });
          prefs.quietHours = null;
        }
        render();
      } catch (err) {
        showToast(`Could not save: ${err.message}`);
        prefs.quietHours = prev;
        render();
      }
    });

    mount.querySelectorAll('[data-qh-bound]').forEach(input => {
      input.addEventListener('change', async () => {
        const bound = input.dataset.qhBound; // 'start' | 'end'
        const val = input.value;
        if (!/^\d{2}:\d{2}$/.test(val)) return;
        const prev = { ...(prefs.quietHours || {}) };
        const next = { ...prev, [bound]: val };
        try {
          await updateNotificationPrefs(personId, { quietHours: next });
          prefs.quietHours = next;
        } catch (err) {
          showToast(`Could not save: ${err.message}`);
          input.value = prev[bound] || (bound === 'start' ? '21:00' : '07:00');
        }
      });
    });
```

- [ ] **Step 5: Add minimal CSS for the quiet section**

In `styles/components.css`:

```css
.notif-quiet {
  padding-top: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  border-top: 1px solid var(--border);
}
.notif-quiet .form-hint:first-child {
  font-weight: 500;
  color: var(--text);
  margin-bottom: var(--spacing-xs);
}
```

- [ ] **Step 6: Update the "coming next" hint**

Find and remove:

```js
        <p class="form-hint">Quiet hours coming in the next phase.</p>
```

(Quiet hours is now shipped — the line becomes false.)

- [ ] **Step 7: Bump CACHE_NAME**

`sw.js`: `v321` → `v322`. Comment:

```js
// v322 (2026-05-15) — Phase 5a: quiet hours shipped (Worker filter +
//                     UI time-range pickers).
```

- [ ] **Step 8: Deploy Worker + verify quiet hours filter**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

In Firebase: set your `prefs.notifications.quietHours = { start: "<now hh:mm>", end: "<now+5 min hh:mm>" }`. Set `digestTime` to ~3 min in the future. Wait for the cron tick. The digest should NOT fire (tail will log `skipped (quiet hours)`). Clear the quiet hours after testing.

- [ ] **Step 9: Commit + push**

```bash
git add workers/kitchen-import.js shared/push-ui.js styles/components.css sw.js
git commit -m "feat(notifications): Phase 5a — quiet hours (Worker filter + UI) (v322)"
git push origin main
```

---

## Task 10: Multi-device management UI

**Files:**
- Modify: `shared/push-ui.js` (device list with per-device remove buttons)
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Add the device list block**

In `render`, ABOVE the `.notif-quiet` div, add a new `.notif-devices` block:

```js
        <div class="notif-devices">
          <p class="form-hint">Devices on this account</p>
          ${Object.entries(subs).length === 0 ? `
            <p class="form-hint">No devices subscribed yet.</p>
          ` : Object.entries(subs).map(([hash, sub]) => `
            <div class="notif-device">
              <span class="notif-device__label">${esc(sub.ua || 'Unknown')}${hash === thisDeviceHash ? ' · This device' : ''}</span>
              <button type="button" class="btn btn--sm btn--ghost" data-remove-device="${hash}">Remove</button>
            </div>
          `).join('')}
        </div>
```

You'll need an `esc` helper. If push-ui.js doesn't have one, add at the top of the file:

```js
const esc = (s) => String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
```

- [ ] **Step 2: Wire the per-device Remove button**

In `wireListeners`:

```js
    mount.querySelectorAll('[data-remove-device]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const hash = btn.dataset.removeDevice;
        const isThisDevice = hash === thisDeviceHash;
        btn.disabled = true;
        try {
          if (isThisDevice) {
            // Use unsubscribe so the browser-side subscription is also released.
            await unsubscribe(personId, { removePushSubscription });
            thisDeviceOn = false;
          } else {
            await removePushSubscription(personId, hash);
          }
          subs = (await readPushSubscriptions(personId)) || {};
        } catch (err) {
          showToast(`Could not remove device: ${err.message}`);
        } finally {
          render();
        }
      });
    });
```

- [ ] **Step 3: Add minimal CSS**

In `styles/components.css`:

```css
.notif-devices {
  padding-top: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  border-top: 1px solid var(--border);
}
.notif-devices .form-hint:first-child {
  font-weight: 500;
  color: var(--text);
  margin-bottom: var(--spacing-xs);
}
.notif-device {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
}
.notif-device__label {
  flex: 1;
  font-size: var(--font-sm);
}
```

- [ ] **Step 4: Bump CACHE_NAME**

`sw.js`: `v322` → `v323`. Comment:

```js
// v323 (2026-05-15) — Phase 5b: multi-device management UI in Notifications
//                     section (list + per-device Remove).
```

- [ ] **Step 5: Commit + push**

```bash
node --check shared/push-ui.js && node --check sw.js
git add shared/push-ui.js styles/components.css sw.js
git commit -m "feat(notifications): Phase 5b — multi-device management UI (v323)"
git push origin main
```

---

## Task 11: pushsubscriptionchange auto re-registration

**Files:**
- Modify: `sw.js` (add `pushsubscriptionchange` listener + cache bump)

- [ ] **Step 1: Add the SW listener**

At the bottom of `sw.js`, after the existing `notificationclick` listener, add:

```js
self.addEventListener('pushsubscriptionchange', (event) => {
  // Browsers occasionally invalidate push subscriptions (key rotation, etc.).
  // Re-subscribe with the same VAPID key and notify ALL pages so the new
  // endpoint gets written to Firebase under whichever personId is active.
  // The actual write happens client-side because the SW doesn't know which
  // personId to associate.
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      c.postMessage({ type: 'pushsubscriptionchange' });
    }
  })());
});
```

The page listens for this message and re-runs subscribe() under the current personId. Add the message listener in `shared/push-client.js`:

Open `shared/push-client.js`. At the bottom, append:

```js
// Auto re-register when the browser rotates a subscription.
// Pages opt into this by importing push-client (which loads this listener).
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener?.('message', async (event) => {
    if (event.data?.type !== 'pushsubscriptionchange') return;
    // Determine personId from the URL or storage.
    const url = new URL(location.href);
    const personParam = url.searchParams.get('person') || url.searchParams.get('kid');
    if (!personParam) return; // unknown person — silent
    // Look up the person via Firebase (read-only).
    try {
      const { readPeople, writePushSubscription } = await import('./firebase.js');
      const peopleObj = await readPeople();
      if (!peopleObj) return;
      const personEntry = Object.entries(peopleObj).find(([_, p]) =>
        p?.name?.toLowerCase() === personParam.toLowerCase()
      );
      if (!personEntry) return;
      const [personId] = personEntry;
      // Re-subscribe (this person, fresh subscription).
      await subscribe(personId, { writePushSubscription });
      console.log('[push-client] auto re-subscribed after pushsubscriptionchange');
    } catch (err) {
      console.warn('[push-client] auto re-subscribe failed', err?.message || err);
    }
  });
}
```

- [ ] **Step 2: Bump CACHE_NAME**

`sw.js`: `v323` → `v324`. Comment:

```js
// v324 (2026-05-15) — Phase 5c: pushsubscriptionchange auto re-registration.
//                     SW posts a message to all clients on rotation; clients
//                     re-call subscribe() under their current personId.
```

- [ ] **Step 3: Verify the file parses**

```bash
node --check sw.js
node --check shared/push-client.js
```

- [ ] **Step 4: Commit + push**

```bash
git add sw.js shared/push-client.js
git commit -m "feat(notifications): Phase 5c — auto re-register on pushsubscriptionchange (v324)"
git push origin main
```

(End-to-end verification of `pushsubscriptionchange` is difficult to trigger — browsers rotate subscriptions only occasionally. The listener is defensive infrastructure; absence of failures over time is the success signal.)

---

## Task 12: Wrap-up — docs + roadmap status

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-05-15-push-notifications-design.md`

- [ ] **Step 1: Update the spec status line**

In `docs/superpowers/specs/2026-05-15-push-notifications-design.md`, find:

```md
**Status:** Phase 1 shipped 2026-05-15 · Phases 2–5 pending
```

Change to:

```md
**Status:** All 5 phases shipped 2026-05-15
```

- [ ] **Step 2: Update the roadmap entry**

In `docs/ROADMAP.md`, find the Push Notifications entry. Change:

```md
**Push Notifications** · Phase 1 shipped 2026-05-15 · Cost: $0
Phase 1 (shipped): subscribe per device, push for bell messages + reward approval requests + reward FYI. Remaining phases (event reminders, task reminders, daily digest, quiet hours) tracked in [docs/superpowers/specs/2026-05-15-push-notifications-design.md](superpowers/specs/2026-05-15-push-notifications-design.md).
```

to:

```md
**Push Notifications** · Shipped 2026-05-15 (all 5 phases) · Cost: $0
Per-device subscribe, push for bell messages, reward approvals, reward FYI, event reminders (15/30/60 min before), task reminders, and daily digest. Per-person quiet hours. Multi-device management. Spec: [docs/superpowers/specs/2026-05-15-push-notifications-design.md](superpowers/specs/2026-05-15-push-notifications-design.md). Known follow-ups: recurring-event reminders, per-event lead overrides, Approve/Deny notification actions on reward requests.
```

- [ ] **Step 3: Commit + push**

```bash
git add docs/ROADMAP.md docs/superpowers/specs/2026-05-15-push-notifications-design.md
git commit -m "docs: mark push notifications Phases 2-5 shipped"
git push origin main
```

---

## All phases complete

After Task 12:
- All 5 phases of the push notifications spec are live in production
- Worker runs cron every 5 min, dispatching event/task/digest pushes per opted-in person
- Quiet hours respected for time-triggered types
- Multi-device management available in Customize → Notifications
- Auto re-registration handles browser subscription rotation

Remaining known follow-ups (not in this plan, file as new spec when needed):
- Recurring-event reminders (currently skipped — only non-recurring events get reminders)
- Per-event lead-time overrides ("remind me 1 day before this specific event")
- Approve/Deny actions on reward-request push notifications
- Snooze (defer for 1 hour)
