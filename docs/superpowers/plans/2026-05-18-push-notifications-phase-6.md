# Push Notifications — Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 push-notification improvements bundled as Phase 6: recurring event reminders (closes the biggest Phase 2 gap), one-tap Approve/Deny/Snooze actions, per-type Send test button, daily overdue-task push, dinner-tonight push, and an admin notification activity log.

**Architecture:** Three classes of change layered on top of the Phase 1-5 infrastructure: (1) new Worker scheduled-handler branches (recurring events, overdue, meal, snooze drain), (2) a new HMAC-authed `POST /action` Worker endpoint that handles Approve/Deny/Snooze actions, (3) UI extensions in `shared/push-ui.js` (per-type test + new prefs) plus a read-only activity log view in `admin.html`'s Tools tab.

**Tech Stack:** Cloudflare Workers (existing `workers/kitchen-import.js`), Cloudflare Cron Triggers, Firebase Realtime DB (compat SDK + REST), Web Push notification actions, service worker action handlers, vanilla JS frontend, `Intl.DateTimeFormat` for timezone math.

**Spec:** [docs/superpowers/specs/2026-05-18-push-notifications-phase-6-design.md](../specs/2026-05-18-push-notifications-phase-6-design.md)

---

## Verification approach (read first)

Same pattern as Phases 1-5: no unit-test framework. Each task ends with concrete verification steps using `curl`, `wrangler tail`, browser DevTools, or production observation. Worker secrets and the production `CLOUDFLARE_API_TOKEN` env var are already set (saved as memory). `npx wrangler deploy --config workers/wrangler.toml` works without OAuth login.

---

## Sub-phase index

| Sub-phase | Tasks | What ships |
|---|---|---|
| 6a | 1–2 | Recurring event reminders + per-type Send test |
| 6b | 3–7 | Approve/Deny/Snooze actions (+ reward-request push fix) |
| 6c | 8–10 | Overdue task push + meal dinner reminder |
| 6d | 11–12 | Admin notification activity log |
| 6e | 13 | Docs wrap-up |

Each sub-phase ends with a `git push origin main` so it deploys independently.

---

## File map (across all 13 tasks)

**Modify:**
- `workers/kitchen-import.js` — `nextOccurrenceInWindow` helper, extend `runEventReminders` for recurring events, `runOverdueReminders` + `runMealReminders` + `runPendingPushes` new scheduled branches, `POST /action` endpoint with Approve/Deny/Snooze logic, activity-log writes from `fanoutPush`. (~500 lines added across all tasks.)
- `shared/push-ui.js` — per-type Send test buttons, overdue+meal prefs (toggles + time pickers), DEFAULT_PREFS extension.
- `shared/firebase.js` — fix `mapMessageTypeToPushType` to handle `'redemption-request'` and `'use-request'`; add `actions` array to reward-request push payload.
- `sw.js` — `notificationclick` handler for `event.action === 'approve' | 'deny' | 'snooze'`; cache bumps per sub-phase.
- `admin.html` — new "Notification activity" section in Tools tab.
- `styles/components.css` — minor styles for the per-type test button + notif-log table.
- `docs/ROADMAP.md`, `docs/superpowers/specs/2026-05-18-push-notifications-phase-6-design.md` — status updates at end.

**Reference (don't edit):**
- `shared/state.js:377` `expandEventOccurrences` — source pattern for `nextOccurrenceInWindow`.
- `rewards.js:846-918` — existing approve flow (for the patterns the Worker `/action` endpoint mirrors).
- `shared/utils.js:444` `normalizePlanSlot` + `:453` `pickWinner` — for meal-plan slot handling (port the logic into the Worker).

---

## Known scope cuts (do NOT implement)

- iOS notification actions (Apple ignores `actions` arrays — known platform limitation).
- Mark-task-complete from notification (bigger scope; defer).
- Snooze on non-event types.
- Breakfast/lunch/school-lunch meal reminders.
- Resend / delete buttons on activity log (read-only Phase 6).

---

## Task 1: Recurring event reminders

**Files:**
- Modify: `workers/kitchen-import.js` (add helper + extend `runEventReminders`)

- [ ] **Step 1: Add the `nextOccurrenceInWindow` helper**

In `workers/kitchen-import.js`, find the timezone-helpers section (added in Phase 2 Task 3, around line 130). Append the new helper after `localDateTimeToUtc`:

```js
// ── Recurring event expansion ────────────────────────────────────────────────
// Returns the first occurrence of a recurring event whose computed UTC start
// time falls inside [windowStart, windowEnd]. Returns null if no match.
// Mirrors the recurrence rules from shared/state.js expandEventOccurrences:
// rule.type: 'daily' | 'weekly' (rule.days[]) | 'monthly' | 'yearly' | 'custom' (rule.every, rule.unit).
// rule.end: { type: 'never' | 'date' | 'count', date?, count? }.

function addDaysKey(dateKey, n) {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nextOccurrenceInWindow(event, windowStart, windowEnd, tz) {
  if (!event.date || !event.startTime || event.allDay) return null;
  const rule = event.repeat;
  if (!rule || !rule.type || rule.type === 'none') return null;

  const windowStartKey = dateKeyInTz(windowStart, tz);
  const windowEndKey   = dateKeyInTz(windowEnd, tz);
  const endType  = rule.end?.type || 'never';
  const endDate  = rule.end?.date || null;
  const endCount = rule.end?.count || null;

  const DOW = ['S', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  const dowFor = (dk) => DOW[new Date(dk + 'T00:00:00Z').getUTCDay()];

  let cur = event.date;
  let occurrences = 1;
  let safety = 0;

  // Check the seed date too — if seed itself falls in the window, return it.
  if (cur >= windowStartKey && cur <= windowEndKey) {
    const startUtc = localDateTimeToUtc(cur, event.startTime, tz);
    if (startUtc >= windowStart && startUtc <= windowEnd) {
      return { instanceDate: cur, startUtc };
    }
  }

  while (safety++ < 5000) {
    let next;
    if (rule.type === 'daily') {
      next = addDaysKey(cur, 1);
    } else if (rule.type === 'weekly') {
      const days = rule.days && rule.days.length > 0 ? new Set(rule.days) : null;
      if (days) {
        let probe = cur;
        for (let i = 0; i < 7; i++) {
          probe = addDaysKey(probe, 1);
          if (days.has(dowFor(probe))) { next = probe; break; }
        }
        if (!next) next = addDaysKey(cur, 7);
      } else {
        next = addDaysKey(cur, 7);
      }
    } else if (rule.type === 'monthly') {
      const [, , dayStr] = cur.split('-');
      const d = new Date(cur + 'T00:00:00Z');
      const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, parseInt(dayStr, 10)));
      next = probe.toISOString().slice(0, 10);
    } else if (rule.type === 'yearly') {
      const d = new Date(cur + 'T00:00:00Z');
      const probe = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
      next = probe.toISOString().slice(0, 10);
    } else if (rule.type === 'custom') {
      const every = rule.every || 1;
      const unit  = rule.unit || 'days';
      if (unit === 'days')        next = addDaysKey(cur, every);
      else if (unit === 'weeks')  next = addDaysKey(cur, every * 7);
      else if (unit === 'months') {
        const d = new Date(cur + 'T00:00:00Z');
        const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + every, d.getUTCDate()));
        next = probe.toISOString().slice(0, 10);
      } else if (unit === 'years') {
        const d = new Date(cur + 'T00:00:00Z');
        const probe = new Date(Date.UTC(d.getUTCFullYear() + every, d.getUTCMonth(), d.getUTCDate()));
        next = probe.toISOString().slice(0, 10);
      } else break;
    } else {
      break;
    }
    if (!next || next <= cur) break;
    cur = next;

    // Hard stops
    if (cur > windowEndKey) break;
    if (endType === 'date' && endDate && cur > endDate) break;
    occurrences += 1;
    if (endType === 'count' && endCount && occurrences > endCount) break;

    // In-window?
    if (cur >= windowStartKey && cur <= windowEndKey) {
      const startUtc = localDateTimeToUtc(cur, event.startTime, tz);
      if (startUtc >= windowStart && startUtc <= windowEnd) {
        return { instanceDate: cur, startUtc };
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Extend `runEventReminders` to handle recurring events**

Find `runEventReminders`. Currently the inner event loop has this near the top:

```js
    for (const [eventId, ev] of Object.entries(events)) {
      // Skip recurring events (Phase 2.1 scope). Schema field is `repeat`,
      // value may be string ('none'), object ({type:'weekly',...}), or null.
      if (ev.repeat && ev.repeat !== 'none' && ev.repeat !== null) continue;
```

REPLACE the recurring-skip with branched handling. The full inner block becomes:

```js
    for (const [eventId, ev] of Object.entries(events)) {
      // Skip all-day events (no timed reminder).
      if (ev.allDay) continue;
      // Skip events not owned by this person.
      const people = Array.isArray(ev.people) ? ev.people : [];
      if (!people.includes(personId)) continue;
      if (!ev.date || !ev.startTime) continue;

      let instanceDate;
      let eventStartUtc;
      const isRecurring = ev.repeat && ev.repeat.type && ev.repeat.type !== 'none';

      if (isRecurring) {
        const occ = nextOccurrenceInWindow(ev, windowStart, windowEnd, tz);
        if (!occ) continue;
        instanceDate  = occ.instanceDate;
        eventStartUtc = occ.startUtc;
      } else {
        // Non-recurring: only matches if the seed date falls in the window.
        eventStartUtc = localDateTimeToUtc(ev.date, ev.startTime, tz);
        if (eventStartUtc < windowStart || eventStartUtc > windowEnd) continue;
        instanceDate = ev.date;
      }

      // Dedup key includes instance date so weekly repeats get unique entries.
      const dedupKey = `evt_${eventId}_${personId}_${instanceDate}`;
      if (await dedupCheck(env, todayKey, dedupKey)) continue;

      const payload = {
        title: ev.name || 'Upcoming event',
        body:  ev.location ? `${formatHhmm(ev.startTime)} · ${ev.location}` : `Starts at ${formatHhmm(ev.startTime)}`,
        icon:  '/app-icon.png',
        tag:   `evt-${eventId}-${instanceDate}`,
        data:  { url: '/calendar.html', type: 'eventReminders', eventId, instanceDate },
      };
      try {
        const { sent, removed, errors } = await fanoutPush(env, personId, payload);
        await dedupMark(env, todayKey, dedupKey);
        console.log('[scheduled] eventReminder', personId, ev.name, instanceDate, { sent, removed, errors });
      } catch (err) {
        console.warn('[scheduled] eventReminder failed', personId, eventId, err.message);
      }
    }
```

(Note: the `actions` field for Snooze gets added in Task 7. Don't add it here yet.)

- [ ] **Step 3: Deploy + verify (no functional test possible without test data)**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

Confirm:
- Deploy succeeded, schedule still registered
- `node --check workers/kitchen-import.js` passes
- Tail one cron tick if a 5-min boundary is within 60 sec; should log clean (no opted-in users get matched without a test event in the right window — that's fine)

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): recurring event reminders via nextOccurrenceInWindow helper"
```

No push yet — Task 2 ships 6a.

---

## Task 2: Per-type Send test button

**Files:**
- Modify: `shared/push-ui.js`
- Modify: `styles/components.css` (small)
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Remove the device-level Send test button**

In `shared/push-ui.js`, find the `notif-row` template inside `render()`. Currently:

```js
      <div class="notif-row">
        <span class="notif-row__label">This device</span>
        <span class="notif-row__status">${thisDeviceOn ? 'On' : 'Off'}</span>
        <button type="button" class="btn btn--sm" id="notif_toggle">
          ${thisDeviceOn ? 'Disable' : 'Enable'}
        </button>
        ${thisDeviceOn ? `<button type="button" class="btn btn--sm btn--ghost" id="notif_test">Send test</button>` : ''}
      </div>
```

Change to (drop the test button):

```js
      <div class="notif-row">
        <span class="notif-row__label">This device</span>
        <span class="notif-row__status">${thisDeviceOn ? 'On' : 'Off'}</span>
        <button type="button" class="btn btn--sm" id="notif_toggle">
          ${thisDeviceOn ? 'Disable' : 'Enable'}
        </button>
      </div>
```

Also DELETE the `#notif_test` click listener in `wireListeners` (the block that calls `sendNotification(personId, 'bellMessages', ...)` then showToasts).

- [ ] **Step 2: Add per-type Test buttons in the type-toggle template**

The current type-toggle markup looks like (one of several):
```js
        <label class="form-toggle">
          <span>Bell messages</span>
          <input type="checkbox" data-notif-type="bellMessages" ${t.bellMessages ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
```

To add a Test button RIGHT AFTER each toggle (only when the toggle is on AND this device is subscribed), wrap each type's `<label>` in a `<div class="notif-type-row">` and append the conditional Test button.

Centralize this with a small helper at the top of `render()` (just inside `render`, above `mount.innerHTML = ...`). Add:

```js
    const typeRow = (key, label) => `
      <div class="notif-type-row">
        <label class="form-toggle notif-type-row__toggle">
          <span>${label}</span>
          <input type="checkbox" data-notif-type="${key}" ${t[key] !== false ? (t[key] || key === 'eventReminders' ? 'checked' : '') : ''}>
          <span class="form-toggle__track"></span>
        </label>
        ${thisDeviceOn && t[key] ? `<button type="button" class="btn btn--xs btn--ghost notif-type-row__test" data-test-type="${key}">Test</button>` : ''}
      </div>
    `;
```

> Wait — this is brittle because each toggle currently uses a different default check (`t.eventReminders !== false` vs `t.bellMessages ? checked : ''`). Simpler: have the helper take an explicit `defaultOn` boolean:

```js
    const typeRow = (key, label, defaultOn = false) => {
      const isOn = defaultOn ? t[key] !== false : !!t[key];
      return `
        <div class="notif-type-row">
          <label class="form-toggle notif-type-row__toggle">
            <span>${label}</span>
            <input type="checkbox" data-notif-type="${key}" ${isOn ? 'checked' : ''}>
            <span class="form-toggle__track"></span>
          </label>
          ${thisDeviceOn && isOn ? `<button type="button" class="btn btn--xs btn--ghost notif-type-row__test" data-test-type="${key}">Test</button>` : ''}
        </div>
      `;
    };
```

Now REPLACE the existing four type-toggle `<label>` blocks (Bell messages, Reward approval requests, Reward FYI, Event reminders) and the existing taskReminders + dailyDigest toggles with calls to `typeRow`:

```js
        ${typeRow('bellMessages',    'Bell messages',                  true)}
        ${typeRow('rewardApprovals', 'Reward approval requests',       true)}
        ${typeRow('rewardFyi',       'Reward FYI (kid spent points)',  true)}
        ${typeRow('eventReminders',  'Event reminders',                true)}
        ${t.eventReminders !== false ? `<EXISTING SUBROW FOR LEAD TIME>` : ''}
        ${typeRow('taskReminders',   'Task reminders',                 false)}
        ${t.taskReminders ? `<EXISTING SUBROW FOR taskReminderTime>` : ''}
        ${typeRow('dailyDigest',     'Daily morning summary',          false)}
        ${t.dailyDigest ? `<EXISTING SUBROW FOR digestTime>` : ''}
```

(The `<EXISTING SUBROW FOR ...>` placeholders mean: keep the existing sub-row markup intact — they're already in the file, just rearrange around the new `typeRow` calls. Don't delete the sub-row blocks.)

- [ ] **Step 3: Wire the per-type Test buttons**

In `wireListeners`, AT THE END (after all existing listeners), add:

```js
    const TEST_PAYLOADS = {
      bellMessages: {
        title: 'Test · Bell message',
        body:  'If you see this, push is working on this device.',
        data:  { url: '/index.html', type: 'bellMessages' },
      },
      rewardApprovals: {
        title: 'Test · Lexi wants a reward',
        body:  'Tap to approve or deny.',
        data:  { url: '/index.html?openBell=1', type: 'rewardApprovals' },
      },
      rewardFyi: {
        title: 'Test · Lexi got Movie Night',
        body:  '-100 pts',
        data:  { url: '/index.html?openBell=1', type: 'rewardFyi' },
      },
      eventReminders: {
        title: 'Test · Upcoming event',
        body:  'Starts at 3:00pm',
        data:  { url: '/calendar.html', type: 'eventReminders' },
      },
      taskReminders: {
        title: 'Test · 3 tasks left today',
        body:  'Tap to see what\'s remaining.',
        data:  { url: '/index.html', type: 'taskReminders' },
      },
      dailyDigest: {
        title: 'Test · Today',
        body:  '2 events, 5 tasks. First up: Dentist at 9:00am.',
        data:  { url: '/index.html', type: 'dailyDigest' },
      },
    };

    mount.querySelectorAll('[data-test-type]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.testType;
        const payload = TEST_PAYLOADS[type];
        if (!payload) return;
        payload.icon = '/app-icon.png';
        payload.tag = `notif-test-${type}`;
        const r = await sendNotification(personId, type, payload);
        if (!r?.ok) showToast(`Test failed: status ${r?.status || 'unknown'}`);
        else showToast(`Test ${type} sent`);
      });
    });
```

- [ ] **Step 4: Add the small CSS for per-type test button + row layout**

In `styles/components.css`, append after the existing `.notif-section .form-toggle` rule:

```css
.notif-type-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.notif-type-row__toggle {
  flex: 1;
}
.notif-type-row__test {
  flex: 0 0 auto;
  font-size: var(--font-xs);
}
.btn--xs {
  padding: 2px var(--spacing-xs);
  font-size: var(--font-xs);
  min-height: 24px;
}
```

(`btn--xs` is a new variant — only used here for now.)

- [ ] **Step 5: Bump CACHE_NAME**

In `sw.js`, change `'family-hub-v324'` to `'family-hub-v325'`. Add new comment at top of CACHE_BUMPS block:

```js
// v325 (2026-05-18) — Phase 6a: recurring event reminders + per-type Send
//                     test button replacing device-level test.
```

- [ ] **Step 6: Verify**

```bash
node --check shared/push-ui.js && node --check sw.js
```

- [ ] **Step 7: Commit + push (ships 6a)**

```bash
git add shared/push-ui.js styles/components.css sw.js
git commit -m "feat(notifications): Phase 6a — per-type Send test button + recurring event reminders live (v325)"
git push origin main
```

---

## Task 3: `POST /action` endpoint skeleton (Worker)

**Files:**
- Modify: `workers/kitchen-import.js` (new endpoint with HMAC verify + dispatch stubs)

- [ ] **Step 1: Add the `handleAction` function**

In `workers/kitchen-import.js`, find `handlePush` (around line 1430). Add a sibling `handleAction` function immediately AFTER `handlePush`:

```js
// ── Notification actions (Approve / Deny / Snooze) ────────────────────────────

async function handleAction(input, env, corsHeaders, rawBodyText, authHeader) {
  const authed = await verifyPushAuth(authHeader, rawBodyText, env);
  if (!authed) {
    console.warn('[action] auth failed');
    return jsonError('Unauthorized', 401, corsHeaders);
  }

  const { type, personId } = input || {};
  if (!type || !personId) {
    return jsonError('Missing type or personId', 400, corsHeaders);
  }

  try {
    if (type === 'approve') return await actionApprove(input, env, corsHeaders);
    if (type === 'deny')    return await actionDeny(input, env, corsHeaders);
    if (type === 'snooze')  return await actionSnooze(input, env, corsHeaders);
    return jsonError('Unknown action type', 400, corsHeaders);
  } catch (err) {
    console.warn('[action] handler failed', type, err.message);
    return jsonError(`Action failed: ${err.message}`, 500, corsHeaders);
  }
}

// Stubs — real implementations in Tasks 4 and 5.
async function actionApprove(input, env, corsHeaders) {
  return jsonOk({ ok: true, stub: 'approve' }, corsHeaders);
}
async function actionDeny(input, env, corsHeaders) {
  return jsonOk({ ok: true, stub: 'deny' }, corsHeaders);
}
async function actionSnooze(input, env, corsHeaders) {
  return jsonOk({ ok: true, stub: 'snooze' }, corsHeaders);
}
```

- [ ] **Step 2: Wire `action` into the dispatch**

Find the `fetch` handler's dispatch block (the one that handles `if (type === 'push')`). Add a sibling branch for `'action'`:

```js
    if (type === 'push') {
      return handlePush(input, env, CORS, rawBodyText, request.headers.get('Authorization'));
    }
    if (type === 'action') {
      return handleAction(input, env, CORS, rawBodyText, request.headers.get('Authorization'));
    }
    const handler = HANDLERS[type];
```

- [ ] **Step 3: Deploy + verify auth path**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

Test with the same HMAC-signing pattern as `/push` (HMAC secret `b0c24356297ccd8d448b6a4cd49a84d511f609efe06884bdb68e07eb9099f2c8`):

```bash
node -e "
const crypto = require('crypto');
const SECRET = 'b0c24356297ccd8d448b6a4cd49a84d511f609efe06884bdb68e07eb9099f2c8';
const body = JSON.stringify({ type: 'action', input: { type: 'approve', personId: 'p1' } });
const ts = Date.now();
const sig = crypto.createHmac('sha256', SECRET).update(ts + String.fromCharCode(10) + body).digest('hex');
console.log('AUTH:', 'HMAC v1 ' + ts + '.' + sig);
console.log('BODY:', body);
"
```

Send via curl to `https://kitchen-import.jordin-jansky.workers.dev`. Expected: `{"ok":true,"stub":"approve"}`.

Test unauthorized: same curl WITHOUT Authorization header. Expected: 401.

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): /action endpoint skeleton (HMAC verify + dispatch stubs)"
```

---

## Task 4: Approve / Deny logic in `/action`

**Files:**
- Modify: `workers/kitchen-import.js` (fill in `actionApprove` and `actionDeny`)

The existing in-app approve flow lives at `rewards.js:846-918`. The Worker mirrors its behavior server-side (Firebase REST writes only — no client SDK).

The two reward request message types are `'redemption-request'` (buy a reward — needs approval) and `'use-request'` (use a banked token — needs approval).

- [ ] **Step 1: Replace `actionApprove` stub with the real implementation**

```js
async function actionApprove(input, env, corsHeaders) {
  const { personId, messageId, intent } = input || {};
  if (!messageId) return jsonError('Missing messageId for approve', 400, corsHeaders);

  // Read the message
  const msg = await fbGet(env, `messages/${personId}/${messageId}`);
  if (!msg) return jsonError('Message not found', 404, corsHeaders);
  if (msg.seen) return jsonOk({ ok: true, alreadyResolved: true }, corsHeaders);

  const ts = Date.now();

  if (msg.type === 'use-request') {
    // Approve a banked-token use
    if (!msg.bankTokenId) return jsonError('Cannot approve: missing bank token reference', 400, corsHeaders);
    await fbSet(env, `bank/${personId}/${msg.bankTokenId}/used`, true);
    await fbSet(env, `bank/${personId}/${msg.bankTokenId}/usedAt`, ts);
    await fbSet(env, `messages/${personId}/${messageId}/seen`, true);
    await pushMessage(env, personId, {
      type: 'use-approved',
      title: msg.title,
      body: null,
      amount: 0,
      seen: false,
      createdAt: ts,
      createdBy: 'parent',
    });
    return jsonOk({ ok: true, action: 'approve', subtype: 'use' }, corsHeaders);
  }

  if (msg.type === 'redemption-request') {
    // Approve a reward purchase
    const rewardId = msg.rewardId;
    if (!rewardId) return jsonError('Cannot approve: missing rewardId', 400, corsHeaders);
    const reward = await fbGet(env, `rewards/${rewardId}`);
    if (!reward) return jsonError('Reward not found', 404, corsHeaders);

    // Default intent for push-driven approvals = 'save' (banked) — the kid can
    // tap Use later. 'use-now' is only meaningful from the in-app flow which
    // already exists at rewards.js:864.
    const i = intent || 'save';

    if (i === 'use-now') {
      await pushMessage(env, personId, {
        type: 'redemption-approved',
        title: msg.title || reward.name || '',
        body: null,
        amount: 0,
        intent: 'use-now',
        seen: false,
        createdAt: ts,
        createdBy: 'parent',
        rewardId,
        rewardName: reward.name || '',
        rewardIcon: reward.icon || '',
      });
      await pushMessage(env, personId, {
        type: 'reward-used',
        title: 'Used: ' + (reward.name || msg.title || ''),
        body: null,
        amount: 0,
        seen: true,
        createdAt: ts,
        createdBy: 'parent',
      });
    } else {
      // 'save' — bank the token
      await pushMessage(env, personId, {
        rewardType: reward.rewardType || 'custom',
        rewardId,
        rewardName: reward.name || msg.title || '',
        rewardIcon: reward.icon || '',
        acquiredAt: ts,
        used: false,
      }, 'bank');
      await pushMessage(env, personId, {
        type: 'redemption-approved',
        title: msg.title || reward.name || '',
        body: null,
        amount: 0,
        seen: false,
        createdAt: ts,
        createdBy: 'parent',
        rewardId,
        rewardName: reward.name || '',
        rewardIcon: reward.icon || '',
      });
    }
    await fbSet(env, `messages/${personId}/${messageId}/seen`, true);
    return jsonOk({ ok: true, action: 'approve', subtype: 'redemption', intent: i }, corsHeaders);
  }

  return jsonError(`Unsupported message type for approve: ${msg.type}`, 400, corsHeaders);
}

// Helper: push a child to a Firebase list via REST (returns the new key).
// Default path is `messages/{personId}`; pass `bank` to write into `bank/{personId}`.
async function pushMessage(env, personId, data, where = 'messages') {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) throw new Error('Firebase env missing');
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  const r = await fetch(`${base}/${RUNDOWN_ROOT}/${where}/${personId}.json?auth=${env.FIREBASE_DB_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`pushMessage ${where} ${personId}: ${r.status}`);
  const result = await r.json();
  return result.name;
}
```

- [ ] **Step 2: Replace `actionDeny` stub with real implementation**

```js
async function actionDeny(input, env, corsHeaders) {
  const { personId, messageId, reason } = input || {};
  if (!messageId) return jsonError('Missing messageId for deny', 400, corsHeaders);

  const msg = await fbGet(env, `messages/${personId}/${messageId}`);
  if (!msg) return jsonError('Message not found', 404, corsHeaders);
  if (msg.seen) return jsonOk({ ok: true, alreadyResolved: true }, corsHeaders);

  const ts = Date.now();
  const deniedType = msg.type === 'use-request' ? 'use-denied' : 'redemption-denied';

  await pushMessage(env, personId, {
    type: deniedType,
    title: msg.title || 'Request denied',
    body: reason || null,
    amount: 0,
    seen: false,
    createdAt: ts,
    createdBy: 'parent',
  });

  // Refund points when a buy request is denied (use-request denials have no cost to refund)
  if (msg.type === 'redemption-request' && Math.abs(msg.amount || 0) > 0) {
    await pushMessage(env, personId, {
      type: 'bonus',
      title: `Refund: ${msg.rewardName || 'Reward'}`,
      body: null,
      amount: Math.abs(msg.amount),
      seen: true,
      createdAt: ts,
      createdBy: 'parent',
    });
  }

  await fbSet(env, `messages/${personId}/${messageId}/seen`, true);
  return jsonOk({ ok: true, action: 'deny', subtype: msg.type }, corsHeaders);
}
```

- [ ] **Step 3: Deploy + verify with curl**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

Verify with a curl that has no real messageId — should return 404 (message not found), proving the path is wired:

```bash
node -e "
const crypto = require('crypto');
const SECRET = 'b0c24356297ccd8d448b6a4cd49a84d511f609efe06884bdb68e07eb9099f2c8';
const body = JSON.stringify({ type: 'action', input: { type: 'approve', personId: 'fakeperson', messageId: 'fakemsg' } });
const ts = Date.now();
const sig = crypto.createHmac('sha256', SECRET).update(ts + String.fromCharCode(10) + body).digest('hex');
console.log('AUTH:', 'HMAC v1 ' + ts + '.' + sig);
console.log('BODY:', body);
"
```

Expected: `{"error":"Message not found"}` HTTP 404.

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): /action approve+deny — mirrors rewards.js handleApprove/handleDeny via Firebase REST"
```

---

## Task 5: Snooze logic in `/action` + pending-push schema

**Files:**
- Modify: `workers/kitchen-import.js` (fill in `actionSnooze`)

- [ ] **Step 1: Replace `actionSnooze` stub with the real implementation**

```js
async function actionSnooze(input, env, corsHeaders) {
  const { personId, payload } = input || {};
  if (!payload || !payload.tag) {
    return jsonError('Missing payload or payload.tag for snooze', 400, corsHeaders);
  }
  const key = payload.tag; // notification tag = pending entry key

  // Determine snoozeCount by checking if a pending entry already exists.
  const existing = await fbGet(env, `notifications/pending/${key}`);
  const prevCount = existing?.snoozeCount || 0;

  // Cycle: 0 → 5min, 1 → 15min, 2 → 60min, 3+ → reject (max snoozes hit).
  const SNOOZE_MINUTES = [5, 15, 60];
  if (prevCount >= SNOOZE_MINUTES.length) {
    return jsonOk({ ok: true, skipped: 'max-snoozes-reached' }, corsHeaders);
  }
  const delayMin = SNOOZE_MINUTES[prevCount];
  const snoozeUntilTs = Date.now() + delayMin * 60_000;
  const newCount = prevCount + 1;

  // Strip any existing Snooze action from the payload — we'll re-add based on
  // the new snoozeCount when the cron re-fires (via runPendingPushes).
  const cleanPayload = { ...payload };
  delete cleanPayload.actions;

  await fbSet(env, `notifications/pending/${key}`, {
    snoozeUntilTs,
    personId,
    payload: cleanPayload,
    snoozedAt: Date.now(),
    snoozeCount: newCount,
  });

  return jsonOk({ ok: true, action: 'snooze', snoozeCount: newCount, delayMin }, corsHeaders);
}
```

- [ ] **Step 2: Deploy + verify with curl**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

Test with a synthetic payload:

```bash
node -e "
const crypto = require('crypto');
const SECRET = 'b0c24356297ccd8d448b6a4cd49a84d511f609efe06884bdb68e07eb9099f2c8';
const body = JSON.stringify({ type: 'action', input: { type: 'snooze', personId: 'test', payload: { tag: 'evt-test-2026-05-18', title: 't', body: 'b', data: {} } } });
const ts = Date.now();
const sig = crypto.createHmac('sha256', SECRET).update(ts + String.fromCharCode(10) + body).digest('hex');
console.log('AUTH:', 'HMAC v1 ' + ts + '.' + sig);
console.log('BODY:', body);
"
```

Expected: `{"ok":true,"action":"snooze","snoozeCount":1,"delayMin":5}`.

Run twice more — expected: `snoozeCount: 2, delayMin: 15`, then `snoozeCount: 3, delayMin: 60`.

Fourth time: `{"ok":true,"skipped":"max-snoozes-reached"}`.

Then clean up the test entry from Firebase: `DELETE notifications/pending/evt-test-2026-05-18` (you can do this in Firebase console or just leave it — `runPendingPushes` will try to fire it once and fail gracefully when it can't find any subscriptions for personId `test`).

- [ ] **Step 3: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): /action snooze — cycles 5/15/60 min with snoozeCount in pending entry"
```

---

## Task 6: `runPendingPushes` scheduled branch

**Files:**
- Modify: `workers/kitchen-import.js` (new branch in `runScheduled`)

- [ ] **Step 1: Add the function**

Append AFTER `runDailyDigest` (last function in the scheduled section):

```js
async function runPendingPushes(env, now) {
  const all = await fbGet(env, 'notifications/pending');
  if (!all || typeof all !== 'object') return;
  const nowTs = now.getTime();

  for (const [key, entry] of Object.entries(all)) {
    if (!entry?.snoozeUntilTs || !entry?.personId || !entry?.payload) continue;
    if (entry.snoozeUntilTs > nowTs) continue;

    try {
      // Re-add Snooze action if the user has remaining snoozes.
      const SNOOZE_MINUTES = [5, 15, 60];
      const remaining = SNOOZE_MINUTES.length - (entry.snoozeCount || 0);
      const payload = { ...entry.payload };
      if (remaining > 0) {
        const nextDelay = SNOOZE_MINUTES[entry.snoozeCount];
        payload.actions = [
          { action: 'snooze',  title: `Snooze ${nextDelay}m` },
          { action: 'dismiss', title: 'Dismiss' },
        ];
      } else {
        payload.actions = [{ action: 'dismiss', title: 'Dismiss' }];
      }
      // Carry snoozeCount in data so the SW posts it back if the user snoozes again.
      payload.data = { ...(payload.data || {}), snoozeCount: entry.snoozeCount };

      const { sent, removed, errors } = await fanoutPush(env, entry.personId, payload);
      console.log('[scheduled] pendingPush fired', entry.personId, key, { sent, removed, errors });
    } catch (err) {
      console.warn('[scheduled] pendingPush failed', key, err.message);
    } finally {
      // Always delete the pending entry — fire-once semantics, even on error.
      try { await fbDelete(env, `notifications/pending/${key}`); } catch {}
    }
  }
}
```

- [ ] **Step 2: Wire into `runScheduled`**

Find `runScheduled`. After `await runDailyDigest(env, now, tz, people, events || {});` add:

```js
  await runPendingPushes(env, now);
```

- [ ] **Step 3: Deploy + verify**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

If the test entry from Task 5 is still in Firebase (`notifications/pending/evt-test-2026-05-18`), the next cron tick should fire and delete it. Tail to confirm:

```bash
npx wrangler tail --config workers/wrangler.toml --format pretty
```

Expected log line within ~5 min: `[scheduled] pendingPush fired test evt-test-2026-05-18 { sent: 0, removed: 0, errors: 0 }` (zero sent because `test` personId has no subscriptions).

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): runPendingPushes drains snoozed notifications on each cron tick"
```

---

## Task 7: SW notificationclick action handlers + payload integration + reward-request push fix

**Files:**
- Modify: `sw.js` (action handlers + cache bump)
- Modify: `shared/firebase.js` (fix mapMessageTypeToPushType, add actions to reward-request payload)
- Modify: `workers/kitchen-import.js` (add Snooze action to event reminder payload)

- [ ] **Step 1: Fix the message-type mapper in `shared/firebase.js`**

Find `mapMessageTypeToPushType`. Currently:

```js
function mapMessageTypeToPushType(messageType) {
  if (messageType === 'request')  return 'rewardApprovals';
  if (messageType === 'fyi')      return 'rewardFyi';
  if (messageType === 'message')  return 'bellMessages';
  if (messageType === 'kudos')    return 'bellMessages';
  return null;
}
```

The actual message types used in the codebase are `'redemption-request'` and `'use-request'` for reward approvals, and `'fyi'` for reward FYI. The bare `'request'` is never written. Fix:

```js
function mapMessageTypeToPushType(messageType) {
  if (messageType === 'redemption-request') return 'rewardApprovals';
  if (messageType === 'use-request')        return 'rewardApprovals';
  if (messageType === 'fyi')                return 'rewardFyi';
  if (messageType === 'message')            return 'bellMessages';
  if (messageType === 'kudos')              return 'bellMessages';
  return null;
}
```

- [ ] **Step 2: Add `actions` + `messageId` to reward-request push payload**

Still in `shared/firebase.js`, find `notifyMessageFireAndForget`. Currently it does:

```js
async function notifyMessageFireAndForget(personId, data) {
  try {
    const { sendNotification } = await import('./push-client.js');
    const type = mapMessageTypeToPushType(data?.type);
    if (!type) return;
    await sendNotification(personId, type, {
      title: data.title || 'New message',
      body:  data.body || '',
      tag:   `${type}-${data.createdBy || 'system'}`,
      data:  { url: '/index.html?openBell=1', type },
    });
  } catch (err) {
    console.warn('[firebase] push failed (non-fatal):', err?.message || err);
  }
}
```

Wrap the writeMessage call so we know the new message's ID, then pass it + actions for reward-request types. Update the caller too:

In `writeMessage`, the current code is:
```js
export async function writeMessage(personId, data) {
  const id = await pushData(`messages/${personId}`, data);
  notifyMessageFireAndForget(personId, data);
  return id;
}
```

Change to:
```js
export async function writeMessage(personId, data) {
  const id = await pushData(`messages/${personId}`, data);
  notifyMessageFireAndForget(personId, data, id);
  return id;
}
```

Then update `notifyMessageFireAndForget`:

```js
async function notifyMessageFireAndForget(personId, data, messageId) {
  try {
    const { sendNotification } = await import('./push-client.js');
    const type = mapMessageTypeToPushType(data?.type);
    if (!type) return;
    const payload = {
      title: data.title || 'New message',
      body:  data.body || '',
      tag:   `${type}-${data.createdBy || 'system'}`,
      data:  { url: '/index.html?openBell=1', type, messageId, personId },
    };
    // Add Approve/Deny actions for reward-request notifications.
    if (type === 'rewardApprovals') {
      payload.actions = [
        { action: 'approve', title: 'Approve' },
        { action: 'deny',    title: 'Deny' },
      ];
    }
    await sendNotification(personId, type, payload);
  } catch (err) {
    console.warn('[firebase] push failed (non-fatal):', err?.message || err);
  }
}
```

- [ ] **Step 3: Add Snooze action to event reminder payload in Worker**

In `workers/kitchen-import.js`, find `runEventReminders`. Inside the per-event push block (where `payload` is built), add `actions` BEFORE the `try { ... fanoutPush }`:

```js
      const payload = {
        title: ev.name || 'Upcoming event',
        body:  ev.location ? `${formatHhmm(ev.startTime)} · ${ev.location}` : `Starts at ${formatHhmm(ev.startTime)}`,
        icon:  '/app-icon.png',
        tag:   `evt-${eventId}-${instanceDate}`,
        data:  { url: '/calendar.html', type: 'eventReminders', eventId, instanceDate, snoozeCount: 0 },
        actions: [
          { action: 'snooze',  title: 'Snooze 5m' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      };
```

- [ ] **Step 4: Add action handlers to the SW**

In `sw.js`, find the existing `notificationclick` listener. Currently it ignores `event.action` and just deep-links. Replace its body with action dispatch:

Find:
```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  // Action buttons (Approve/Deny on reward requests) — Phase 2+ wiring;
  // for Phase 1 we just open the deep link.
  // TODO Phase 2: read event.action and POST approve/deny to Worker.

  const url = data.url || '/index.html';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      if (c.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in c) {
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
```

Replace with:
```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  // Action buttons go to the Worker via /action; no UI navigation.
  if (action === 'approve' || action === 'deny') {
    event.waitUntil(postAction({ type: action, personId: data.personId, messageId: data.messageId }));
    return;
  }
  if (action === 'snooze') {
    // Rebuild payload from data — SW doesn't have the original payload here.
    const payload = {
      title: event.notification.title,
      body:  event.notification.body,
      icon:  event.notification.icon,
      tag:   event.notification.tag,
      data,
    };
    event.waitUntil(postAction({ type: 'snooze', personId: data.personId, payload }));
    return;
  }
  if (action === 'dismiss') {
    // Notification already closed; nothing else to do.
    return;
  }

  // Default click (no action button) — deep-link
  const url = data.url || '/index.html';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      if (c.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in c) {
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

// SW-side helper to call the Worker /action endpoint. HMAC secret embedded
// here (same as in push-client.js) — same security model.
async function postAction(input) {
  const SECRET = 'b0c24356297ccd8d448b6a4cd49a84d511f609efe06884bdb68e07eb9099f2c8';
  const WORKER_URL = 'https://kitchen-import.jordin-jansky.workers.dev';
  const body = JSON.stringify({ type: 'action', input });
  const ts = Date.now();
  const keyBytes = new TextEncoder().encode(SECRET);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}\n${body}`));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  const auth = `HMAC v1 ${ts}.${sigHex}`;
  try {
    const r = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body,
    });
    if (!r.ok) console.warn('[sw] action non-OK', r.status);
  } catch (err) {
    console.warn('[sw] action failed', err?.message || err);
  }
}
```

- [ ] **Step 5: Bump CACHE_NAME**

In `sw.js`, change `'family-hub-v325'` to `'family-hub-v326'`. Add comment at top of CACHE_BUMPS:

```js
// v326 (2026-05-18) — Phase 6b: notification action handlers (Approve/Deny/
//                     Snooze) wired in SW; reward-request push payload
//                     includes Approve/Deny buttons; reward-request message
//                     type mapper fixed (redemption-request, use-request).
```

- [ ] **Step 6: Verify**

```bash
node --check sw.js && node --check shared/firebase.js && node --check workers/kitchen-import.js
```

Deploy Worker (no Worker changes in this task other than payload, but if any tweaks landed re-deploy):

```bash
npx wrangler deploy --config workers/wrangler.toml
```

- [ ] **Step 7: Commit + push (ships 6b)**

```bash
git add sw.js shared/firebase.js workers/kitchen-import.js
git commit -m "feat(notifications): Phase 6b — Approve/Deny/Snooze actions + reward-request push fix (v326)"
git push origin main
```

---

## Task 8: `runOverdueReminders` scheduled branch

**Files:**
- Modify: `workers/kitchen-import.js` (new function + wire into runScheduled)

- [ ] **Step 1: Add the function**

Append AFTER `runMealReminders` placement target (or after `runDailyDigest` if Task 9 isn't done yet — order doesn't matter for function declarations):

```js
async function runOverdueReminders(env, now, tz, people) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const nowMin = hours * 60 + minutes;

  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.overdue === true
  );
  if (optedIn.length === 0) return;

  // Filter persons in the time window first, before any data reads.
  const inWindow = optedIn.filter(([_, person]) => {
    const t = person.prefs.notifications.overdueTime || '21:00';
    const [h, m] = t.split(':').map(Number);
    const tMin = h * 60 + m;
    if (isNaN(tMin) || tMin < 0 || tMin >= 1440) return false;
    return Math.abs(nowMin - tMin) <= 2.5;
  });
  if (inWindow.length === 0) return;

  // Quiet hours check
  const filtered = inWindow.filter(([_, person]) => {
    const qh = person.prefs?.notifications?.quietHours;
    if (qh && isInQuietHours(qh, hours, minutes)) {
      console.log('[scheduled] skipped (quiet hours)', _, 'overdue');
      return false;
    }
    return true;
  });
  if (filtered.length === 0) return;

  // Load last 7 days of schedule + completions + tasks (for frequency check)
  const lookbackDays = 7;
  const scheduleEntries = []; // [{dateKey, entryKey, entry}]
  for (let i = 1; i <= lookbackDays; i++) {
    const dk = addDaysKey(todayKey, -i);
    const day = await fbGet(env, `schedule/${dk}`).catch(() => null);
    if (day && typeof day === 'object') {
      for (const [entryKey, entry] of Object.entries(day)) {
        scheduleEntries.push({ dateKey: dk, entryKey, entry });
      }
    }
  }
  const [completions, tasks] = await Promise.all([
    fbGet(env, 'completions').catch(() => null),
    fbGet(env, 'tasks').catch(() => null),
  ]);
  const completedKeys = new Set(Object.keys(completions || {}));

  for (const [personId, person] of filtered) {
    const dedupKey = `overdue_${personId}`;
    if (await dedupCheck(env, todayKey, dedupKey)) continue;

    // Count incomplete non-daily entries belonging to this person from the lookback window.
    const incomplete = scheduleEntries.filter(({ entryKey, entry }) => {
      if (entry?.ownerId !== personId) return false;
      if (completedKeys.has(entryKey)) return false;
      const task = tasks?.[entry?.taskId];
      if (task?.frequency === 'daily') return false; // daily tasks aren't "overdue"
      return true;
    });
    if (incomplete.length === 0) continue;

    const payload = {
      title: `${incomplete.length} overdue task${incomplete.length === 1 ? '' : 's'}`,
      body:  'From earlier this week. Tap to review.',
      icon:  '/app-icon.png',
      tag:   `overdue-${personId}-${todayKey}`,
      data:  { url: '/index.html', type: 'overdue' },
    };

    try {
      const { sent, removed, errors } = await fanoutPush(env, personId, payload);
      await dedupMark(env, todayKey, dedupKey);
      console.log('[scheduled] overdue', personId, { count: incomplete.length, sent, removed, errors });
    } catch (err) {
      console.warn('[scheduled] overdue failed', personId, err.message);
    }
  }
}
```

- [ ] **Step 2: Wire into `runScheduled`**

After `await runDailyDigest(env, now, tz, people, events || {});` and BEFORE `await runPendingPushes(env, now);`, add:

```js
  await runOverdueReminders(env, now, tz, people);
```

- [ ] **Step 3: Deploy + verify**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

No functional test — confirm deploy clean and next cron tick logs no errors.

- [ ] **Step 4: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): runOverdueReminders scheduled branch"
```

---

## Task 9: `runMealReminders` scheduled branch

**Files:**
- Modify: `workers/kitchen-import.js` (new function + wire into runScheduled)

- [ ] **Step 1: Add `normalizePlanSlot` and `pickWinner` helpers to Worker**

Append to the recurring-event helpers section (near `nextOccurrenceInWindow`):

```js
// Port of shared/utils.js normalizePlanSlot + pickWinner — kept inline so the
// Worker has no shared-module imports.
function normalizePlanSlot(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}
function pickPlanWinner(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  if (options.length === 1) return options[0];
  let bestIdx = 0, bestScore = -1, bestAddedAt = Infinity;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const score = opt?.votes ? Object.keys(opt.votes).length : 0;
    const addedAt = opt?.addedAt || 0;
    if (score > bestScore || (score === bestScore && addedAt < bestAddedAt)) {
      bestIdx = i; bestScore = score; bestAddedAt = addedAt;
    }
  }
  return options[bestIdx];
}
```

- [ ] **Step 2: Add `runMealReminders`**

Append to the scheduled section (after `runOverdueReminders` from Task 8):

```js
async function runMealReminders(env, now, tz, people) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const nowMin = hours * 60 + minutes;

  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.mealReminder === true
  );
  if (optedIn.length === 0) return;

  const inWindow = optedIn.filter(([_, person]) => {
    const t = person.prefs.notifications.mealReminderTime || '16:00';
    const [h, m] = t.split(':').map(Number);
    const tMin = h * 60 + m;
    if (isNaN(tMin) || tMin < 0 || tMin >= 1440) return false;
    return Math.abs(nowMin - tMin) <= 2.5;
  });
  if (inWindow.length === 0) return;

  // Quiet hours check
  const filtered = inWindow.filter(([_, person]) => {
    const qh = person.prefs?.notifications?.quietHours;
    if (qh && isInQuietHours(qh, hours, minutes)) {
      console.log('[scheduled] skipped (quiet hours)', _, 'mealReminder');
      return false;
    }
    return true;
  });
  if (filtered.length === 0) return;

  // One Firebase read for tonight's dinner — shared across all opted-in users.
  const dinnerSlot = await fbGet(env, `kitchenPlan/${todayKey}/dinner`).catch(() => null);
  const options = normalizePlanSlot(dinnerSlot);

  // Compose body once — same for all opted-in users.
  let body;
  let urlSuffix = '';
  if (options.length === 0) {
    body = 'No dinner planned for tonight.';
  } else if (options.length === 1) {
    const opt = options[0];
    body = `Tonight's dinner: ${opt.customName || opt.recipeName || opt.name || 'see plan'}`;
  } else {
    // Multi-option voting — try to identify a winner with votes; otherwise prompt.
    const winner = pickPlanWinner(options);
    const winnerScore = winner?.votes ? Object.keys(winner.votes).length : 0;
    if (winnerScore > 0) {
      body = `Tonight's dinner: ${winner.customName || winner.recipeName || winner.name || 'see plan'}`;
    } else {
      body = `Tonight's dinner: ${options.length} options waiting to be voted on`;
      urlSuffix = '?openVote=dinner';
    }
  }

  for (const [personId] of filtered) {
    const dedupKey = `meal_${personId}`;
    if (await dedupCheck(env, todayKey, dedupKey)) continue;

    const payload = {
      title: 'Dinner tonight',
      body,
      icon:  '/app-icon.png',
      tag:   `meal-${personId}-${todayKey}`,
      data:  { url: '/kitchen.html' + urlSuffix, type: 'mealReminder' },
    };

    try {
      const { sent, removed, errors } = await fanoutPush(env, personId, payload);
      await dedupMark(env, todayKey, dedupKey);
      console.log('[scheduled] mealReminder', personId, { sent, removed, errors });
    } catch (err) {
      console.warn('[scheduled] mealReminder failed', personId, err.message);
    }
  }
}
```

- [ ] **Step 3: Wire into `runScheduled`**

Add between `runOverdueReminders` and `runPendingPushes`:

```js
  await runMealReminders(env, now, tz, people);
```

- [ ] **Step 4: Deploy + verify**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

- [ ] **Step 5: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): runMealReminders dinner-tonight scheduled branch"
```

---

## Task 10: UI prefs for overdue + meal reminders

**Files:**
- Modify: `shared/push-ui.js`
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Extend DEFAULT_PREFS**

In `shared/push-ui.js`, find `DEFAULT_PREFS` and update:

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
    overdue: false,
    mealReminder: false,
  },
  eventLeadMin: 15,
  taskReminderTime: '17:00',
  digestTime: '07:00',
  overdueTime: '21:00',
  mealReminderTime: '16:00',
};
```

- [ ] **Step 2: Add the two new prefs UI rows**

In `render()`, after the dailyDigest block, add:

```js
        ${typeRow('overdue',      'Overdue task nudge',           false)}
        ${t.overdue ? `
          <div class="notif-subrow">
            <span class="notif-subrow__label">Send at</span>
            <input type="time" class="notif-subrow__time" data-time-pref="overdueTime" value="${prefs.overdueTime || '21:00'}">
            <span class="notif-subrow__suffix">if I have overdue tasks</span>
          </div>
        ` : ''}
        ${typeRow('mealReminder', 'Tonight\\'s dinner reminder', false)}
        ${t.mealReminder ? `
          <div class="notif-subrow">
            <span class="notif-subrow__label">Send at</span>
            <input type="time" class="notif-subrow__time" data-time-pref="mealReminderTime" value="${prefs.mealReminderTime || '16:00'}">
            <span class="notif-subrow__suffix">with what's planned</span>
          </div>
        ` : ''}
```

- [ ] **Step 3: Update TIME_PREF_DEFAULTS for the new keys**

In `wireListeners`, find:
```js
    const TIME_PREF_DEFAULTS = { taskReminderTime: '17:00', digestTime: '07:00' };
```
Change to:
```js
    const TIME_PREF_DEFAULTS = {
      taskReminderTime: '17:00',
      digestTime: '07:00',
      overdueTime: '21:00',
      mealReminderTime: '16:00',
    };
```

The existing `[data-time-pref]` handler picks up the new inputs automatically.

- [ ] **Step 4: Bump CACHE_NAME**

`sw.js`: `v326` → `v327`. Comment at top of CACHE_BUMPS:

```js
// v327 (2026-05-18) — Phase 6c: overdue + meal reminder prefs in
//                     Customize → Notifications.
```

- [ ] **Step 5: Verify**

```bash
node --check shared/push-ui.js && node --check sw.js
```

- [ ] **Step 6: Commit + push (ships 6c)**

```bash
git add shared/push-ui.js sw.js
git commit -m "feat(notifications): Phase 6c — overdue + meal reminder prefs (v327)"
git push origin main
```

---

## Task 11: Activity log writes from `fanoutPush`

**Files:**
- Modify: `workers/kitchen-import.js`

- [ ] **Step 1: Add helpers + integrate into `fanoutPush`**

Add this helper near the other Firebase helpers (above `fanoutPush`):

```js
// ── Notification activity log ─────────────────────────────────────────────────
// notifications/log/{pushKey} = { ts, personId, personName, type, sent, removed, errors, skipped?, action? }
// Lazy-pruned: when count > LOG_CAP, drop the oldest LOG_PRUNE_BATCH on a daily housekeeping pass.

const LOG_CAP = 200;
const LOG_PRUNE_BATCH = 50;

async function fbPush(env, path, value) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) throw new Error('Firebase env missing');
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  const r = await fetch(`${base}/${RUNDOWN_ROOT}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`fbPush ${path}: ${r.status}`);
  const out = await r.json();
  return out.name;
}

async function logActivity(env, entry) {
  try {
    await fbPush(env, 'notifications/log', { ts: Date.now(), ...entry });
  } catch (err) {
    console.warn('[push] log write failed (non-fatal)', err.message);
  }
}

async function logPrune(env) {
  // Read all log entries (small dataset bounded by LOG_CAP).
  const all = await fbGet(env, 'notifications/log').catch(() => null);
  if (!all || typeof all !== 'object') return;
  const entries = Object.entries(all);
  if (entries.length <= LOG_CAP) return;
  // Sort by ts ASC and delete the oldest LOG_PRUNE_BATCH.
  entries.sort(([, a], [, b]) => (a?.ts || 0) - (b?.ts || 0));
  const toDelete = entries.slice(0, LOG_PRUNE_BATCH);
  for (const [key] of toDelete) {
    try { await fbDelete(env, `notifications/log/${key}`); } catch {}
  }
  console.log('[scheduled] log prune dropped', toDelete.length);
}
```

- [ ] **Step 2: Update `fanoutPush` to call `logActivity`**

Find `fanoutPush`. After the per-subscription loop (just before `return { sent, removed, errors };`), add:

```js
  // Note: personName is denormalized for admin display speed; if a caller
  // wants it logged they should pass it through. For now we look it up at
  // log time via a single Firebase read — acceptable since logActivity is
  // best-effort and won't block the push.
  await logActivity(env, { personId, personName: null, type: payload?.data?.type || 'unknown', sent, removed, errors });
  return { sent, removed, errors };
```

(personName is null for now — populate in a later polish if it shows up as a real ops gap.)

ALSO update `fanoutPush` to ACCEPT a 4th optional parameter `type` so it logs the correct type when called from the scheduled handlers (which know the type) vs from `handlePush` (which has it in the payload data already). Simpler: just rely on `payload?.data?.type` which all callers already set.

- [ ] **Step 3: Add log skipped paths in `handlePush`**

In `handlePush`, the early-return paths (`pref-disabled`, `type-disabled`, quiet-hours) currently return without logging. Wrap each early return to also log:

Find the three skip-return statements (`return jsonOk({ sent: 0, ..., skipped: 'pref-disabled' }, corsHeaders);` and similar). Before each return, add:

```js
    await logActivity(env, { personId, type, sent: 0, removed: 0, errors: 0, skipped: 'pref-disabled' });
```

(With the appropriate `skipped` value for each branch: `'pref-disabled'`, `'type-disabled'`, `'quiet'`.)

- [ ] **Step 4: Wire `logPrune` into the housekeeping branch in `runScheduled`**

Find the existing `if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5)` block. After the existing `dedupCleanup` call, add:

```js
      try {
        await logPrune(env);
      } catch (err) {
        console.warn('[scheduled] log prune failed', err.message);
      }
```

- [ ] **Step 5: Deploy + verify**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

To verify a log write happens: send a test push via the `/push` endpoint (use the curl from earlier tasks, with a real personId or a fake one). Then check Firebase at `rundown/notifications/log/*` — there should be a new entry.

- [ ] **Step 6: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): notifications/log activity tracking from fanoutPush + handlePush skips + daily prune"
```

---

## Task 12: Admin Tools tab — Notification activity view

**Files:**
- Modify: `admin.html` (add a section in the Tools tab)
- Modify: `shared/firebase.js` (add a `readNotificationLog` helper)
- Modify: `sw.js` (cache bump)

- [ ] **Step 1: Add the Firebase helper**

In `shared/firebase.js`, near `readPushSubscriptions`, add:

```js
export async function readNotificationLog() {
  return readOnce('notifications/log');
}
```

- [ ] **Step 2: Find the Tools tab in admin.html**

Grep for `Tools` and `data-tab` to find the Tools panel container. The section should be near other Tools subsections (Imports, Schedule stats, etc.).

In the Tools tab markup (look for `<div class="admin-section" id="tab-tools">` or the panel that follows the Tools tab button), add a new section AT THE END of that tab's content:

```html
<section class="admin-section">
  <h3 class="admin-section__title">Notification activity</h3>
  <p class="form-hint">Last 50 push attempts. Newest first. Auto-pruned at 200.</p>
  <div id="notifLogTable" class="notif-log">
    <p class="form-hint">Loading…</p>
  </div>
</section>
```

- [ ] **Step 3: Wire the render in admin.html's tab-init block**

Find where the Tools tab renders (look for `if (activeTab === 'tools')` or similar — there's a tab-render dispatch somewhere). Add a render call to the notification log section AFTER the existing tools content renders:

Look at the existing imports block in `admin.html` and add:
```js
import { readNotificationLog } from './shared/firebase.js';
```

Then in the place that hydrates the Tools tab (after existing tools sections render), add:

```js
async function renderNotifLog() {
  const mount = document.getElementById('notifLogTable');
  if (!mount) return;
  try {
    const all = await readNotificationLog();
    if (!all || typeof all !== 'object') {
      mount.innerHTML = '<p class="form-hint">No activity yet.</p>';
      return;
    }
    const peopleMap = peopleObj || {};
    const rows = Object.values(all)
      .filter(e => e && e.ts)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 50);

    const fmtTs = (ts) => new Date(ts).toLocaleString('en-US', { timeZone: settings?.timezone || 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const personName = (pid) => peopleMap[pid]?.name || pid?.slice(0, 6) || '—';
    const result = (e) => {
      if (e.skipped) return `skipped: ${e.skipped}`;
      const parts = [];
      if (e.sent)    parts.push(`sent ${e.sent}`);
      if (e.removed) parts.push(`removed ${e.removed}`);
      if (e.errors)  parts.push(`errors ${e.errors}`);
      return parts.join(' · ') || '—';
    };

    mount.innerHTML = `
      <table class="notif-log__table">
        <thead><tr><th>Time</th><th>Person</th><th>Type</th><th>Result</th></tr></thead>
        <tbody>
          ${rows.map(e => `
            <tr>
              <td>${esc(fmtTs(e.ts))}</td>
              <td>${esc(personName(e.personId))}</td>
              <td>${esc(e.type || '—')}</td>
              <td>${esc(result(e))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    mount.innerHTML = `<p class="form-hint">Could not load log: ${esc(err.message)}</p>`;
  }
}
```

Then CALL `renderNotifLog()` at the end of whatever existing function hydrates the Tools tab. If you can't identify a clear hydration spot for the Tools tab, call it inside a `setTimeout(renderNotifLog, 0)` immediately after the Tools tab markup is inserted.

(`esc` is already defined in admin.html — confirm with grep before using; if missing, define inline.)

- [ ] **Step 4: Add CSS for the table**

In `styles/components.css`, append:

```css
.notif-log__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}
.notif-log__table th,
.notif-log__table td {
  text-align: left;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-bottom: 1px solid var(--border);
}
.notif-log__table th {
  color: var(--text-muted);
  font-weight: 500;
  font-size: var(--font-xs);
}
.notif-log__table td {
  color: var(--text);
}
```

- [ ] **Step 5: Bump CACHE_NAME**

`sw.js`: `v327` → `v328`. Comment:

```js
// v328 (2026-05-18) — Phase 6d: admin Tools tab Notification activity log
//                     read-only view (last 50 from notifications/log).
```

- [ ] **Step 6: Verify**

```bash
node --check shared/firebase.js && node --check sw.js
```

Spot-check admin.html in the browser at `http://localhost:8080/admin.html` (PIN gate — 4-digit; recovery 2522). Navigate to Tools → confirm the Notification activity section renders and shows entries from Task 11.

- [ ] **Step 7: Commit + push (ships 6d)**

```bash
git add admin.html shared/firebase.js styles/components.css sw.js
git commit -m "feat(admin): Notification activity log read-only view in Tools tab (v328)"
git push origin main
```

---

## Task 13: Docs wrap-up

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-05-18-push-notifications-phase-6-design.md`

- [ ] **Step 1: Update the spec status line**

In `docs/superpowers/specs/2026-05-18-push-notifications-phase-6-design.md`, change:

```md
**Status:** Spec · awaiting review
```

to:

```md
**Status:** All 5 sub-phases shipped 2026-05-18
```

- [ ] **Step 2: Update the roadmap entry**

In `docs/ROADMAP.md`, find the Push Notifications entry. Append Phase 6 to the description:

```md
**Push Notifications** · All phases shipped (Phase 1–5: 2026-05-15; Phase 6: 2026-05-18) · Cost: $0
Per-device subscribe; push for bell messages, reward approvals (with one-tap Approve/Deny actions), reward FYI, event reminders (recurring + non-recurring, 15/30/60 min lead, Snooze 5/15/60 cycle), task reminders, daily digest, overdue task nudge, tonight's dinner reminder. Per-person quiet hours. Multi-device management. Admin notification activity log. Specs: [Phases 1–5](superpowers/specs/2026-05-15-push-notifications-design.md), [Phase 6](superpowers/specs/2026-05-18-push-notifications-phase-6-design.md).
```

- [ ] **Step 3: Commit + push (ships 6e)**

```bash
git add docs/ROADMAP.md docs/superpowers/specs/2026-05-18-push-notifications-phase-6-design.md
git commit -m "docs: mark push notifications Phase 6 shipped"
git push origin main
```

---

## Done

All 7 Phase 6 features live:
- Recurring event reminders ✓
- Approve/Deny notification actions on reward requests ✓
- Snooze 5/15/60 cycle on event reminders ✓
- Per-type Send test button ✓
- Overdue task daily push ✓
- Tonight's dinner reminder ✓
- Admin notification activity log ✓

Remaining roadmap follow-ups (no plan yet):
- Per-event reminder overrides
- Mark-task-complete from notification
- Snooze on non-event types
- Breakfast/lunch meal reminders
- Activity log resend / delete actions
