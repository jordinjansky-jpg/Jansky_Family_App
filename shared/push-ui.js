// push-ui.js — Notifications section inside the Customize sheet.
// Renders into a caller-provided mount. Reads + writes person.prefs.notifications
// and pushSubscriptions/{personId}/{endpointHash}.

const esc = (s) => String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

import {
  pushSupported, subscribe, unsubscribe, sendNotification, endpointHash,
} from './push-client.js';
import {
  readNotificationPrefs, writeNotificationPrefs, updateNotificationPrefs,
  writePushSubscription, removePushSubscription, readPushSubscriptions,
} from './firebase.js';
import { showToast } from './components.js';

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

export async function mountNotificationsSection(mount, personOpts) {
  const personId = personOpts.person.id;
  const supported = pushSupported();

  let prefs   = (await readNotificationPrefs(personId)) || { ...DEFAULT_PREFS };
  let subs    = (await readPushSubscriptions(personId)) || {};
  let thisDeviceHash = await currentDeviceHash();
  let thisDeviceOn = !!subs[thisDeviceHash];

  function render() {
    if (!supported) {
      mount.innerHTML = `
        <p class="form-hint">
          This browser does not support web push.
          On iPhone, install this app to your home screen first
          (Safari → Share → Add to Home Screen), then return here.
        </p>`;
      return;
    }

    const t = prefs.types || DEFAULT_PREFS.types;
    mount.innerHTML = `
      <div class="notif-row">
        <span class="notif-row__label">This device</span>
        <span class="notif-row__status">${thisDeviceOn ? 'On' : 'Off'}</span>
        <button type="button" class="btn btn--sm" id="notif_toggle">
          ${thisDeviceOn ? 'Disable' : 'Enable'}
        </button>
        ${thisDeviceOn ? `<button type="button" class="btn btn--sm btn--ghost" id="notif_test">Send test</button>` : ''}
      </div>

      <div class="notif-section">
        <p class="form-hint">What to send</p>
        <label class="form-toggle">
          <span>Bell messages</span>
          <input type="checkbox" data-notif-type="bellMessages" ${t.bellMessages ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
        <label class="form-toggle">
          <span>Reward approval requests</span>
          <input type="checkbox" data-notif-type="rewardApprovals" ${t.rewardApprovals ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
        <label class="form-toggle">
          <span>Reward FYI (kid spent points)</span>
          <input type="checkbox" data-notif-type="rewardFyi" ${t.rewardFyi ? 'checked' : ''}>
          <span class="form-toggle__track"></span>
        </label>
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
        ${/Android/.test(navigator.userAgent) ? `
          <p class="form-hint">On Android, also disable Chrome's app-level notifications (Settings &rarr; Apps &rarr; Chrome &rarr; Notifications &rarr; off) once enabled here. Otherwise every push arrives twice.</p>
        ` : ''}
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
      </div>
    `;
    wireListeners();
  }

  function wireListeners() {
    mount.querySelector('#notif_toggle')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        if (thisDeviceOn) {
          await unsubscribe(personId, { removePushSubscription });
          subs = (await readPushSubscriptions(personId)) || {};
          thisDeviceOn = false;
        } else {
          // Master switch must be on for the Worker to deliver. Flip it on the first enable.
          if (!prefs.enabled) {
            prefs = { ...prefs, enabled: true };
            await writeNotificationPrefs(personId, prefs);
          }
          await subscribe(personId, { writePushSubscription });
          subs = (await readPushSubscriptions(personId)) || {};
          thisDeviceHash = await currentDeviceHash();
          thisDeviceOn = !!subs[thisDeviceHash];
        }
      } catch (err) {
        showToast(`Could not change subscription: ${err.message}`);
      } finally {
        btn.disabled = false;
        render();
      }
    });

    mount.querySelector('#notif_test')?.addEventListener('click', async () => {
      const r = await sendNotification(personId, 'bellMessages', {
        title: 'Test notification',
        body:  'If you see this, push is working on this device.',
        tag:   'notif-test',
        data:  { url: '/index.html', type: 'bellMessages' },
      });
      if (!r?.ok) showToast(`Test failed: status ${r?.status || 'unknown'}`);
      else showToast('Test notification sent');
    });

    mount.querySelectorAll('input[data-notif-type]').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.notifType;
        const prev = prefs.types || {};
        const next = { ...prev, [key]: input.checked };
        try {
          await updateNotificationPrefs(personId, { types: next });
          prefs.types = next;
          render();
        } catch (err) {
          showToast(`Could not save preference: ${err.message}`);
          input.checked = !input.checked; // revert visual state
        }
      });
    });

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
          render();
        }
      });
    });

    const TIME_PREF_DEFAULTS = { taskReminderTime: '17:00', digestTime: '07:00' };
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
          input.value = prev || TIME_PREF_DEFAULTS[key] || '17:00';
        }
      });
    });

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
  }

  render();
}

async function currentDeviceHash() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  return endpointHash(sub.endpoint);
}
