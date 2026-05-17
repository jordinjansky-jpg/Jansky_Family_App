// push-ui.js — Notifications section inside the Customize sheet.
// Renders into a caller-provided mount. Reads + writes person.prefs.notifications
// and pushSubscriptions/{personId}/{endpointHash}.

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
  types: { bellMessages: true, rewardApprovals: true, rewardFyi: true },
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
        <p class="form-hint">More controls (event reminders, task nudges, digest, quiet hours) coming in later phases.</p>
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
        prefs.types = { ...(prefs.types || {}), [key]: input.checked };
        await updateNotificationPrefs(personId, { types: prefs.types });
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
