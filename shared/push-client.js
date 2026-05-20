// push-client.js — Web Push subscribe / unsubscribe / send.
// No DOM access beyond Notification + registration APIs. Imports nowhere else
// from this codebase, so safe to import in any page.

// Public values — safe to embed. The HMAC secret is technically client-known;
// see docs/superpowers/specs/2026-05-15-push-notifications-design.md
// §"Why HMAC and not full auth".
const VAPID_PUBLIC_KEY  = 'BPbmg_a26eLIQm-ULLkBYUZbavIiQQlCo932JFzmga_BXGwYlKduLMZn0eW1-UyL-5vv3v28FM5PmJITxRVb6hw';
const PUSH_HMAC_SECRET  = 'b0c24356297ccd8d448b6a4cd49a84d511f609efe06884bdb68e07eb9099f2c8';
const WORKER_URL        = 'https://kitchen-import.jordin-jansky.workers.dev';

// ── base64url + hash helpers ──────────────────────────────────────────────────

function b64urlToUint8(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}


export async function endpointHash(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * True when this browser can subscribe to push.
 * iOS Safari outside a home-screen-installed PWA returns false.
 */
export function pushSupported() {
  return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
}

/**
 * True when this device already has permission (regardless of subscription).
 */
export function pushPermission() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

/**
 * Subscribe this device to push for `personId`. Writes the subscription
 * record into Firebase under pushSubscriptions/{personId}/{endpointHash}.
 *
 * `firebaseHelpers` is { writePushSubscription }.
 */
export async function subscribe(personId, firebaseHelpers) {
  if (!pushSupported()) throw new Error('Push not supported on this device');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(`Permission ${perm}`);

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64urlToUint8(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON(); // { endpoint, keys: { p256dh, auth } }
  const hash = await endpointHash(json.endpoint);
  await firebaseHelpers.writePushSubscription(personId, hash, {
    endpoint: json.endpoint,
    p256dh:   json.keys.p256dh,
    auth:     json.keys.auth,
    ua:       describeDevice(),
    addedAt:  firebase.database.ServerValue.TIMESTAMP,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
  });
  return { hash, endpoint: json.endpoint };
}

/**
 * Unsubscribe this device from push for `personId`.
 * `firebaseHelpers` is { removePushSubscription }.
 */
export async function unsubscribe(personId, firebaseHelpers) {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const hash = await endpointHash(sub.endpoint);
  await sub.unsubscribe();
  await firebaseHelpers.removePushSubscription(personId, hash);
}

/**
 * Silent check on app boot: if the person's master intent says notifications are ON
 * but this browser has no push subscription, silently re-subscribe.
 *
 * Returns silently on all skip conditions (no-op). Never prompts, never throws.
 * `firebaseHelpers` is { readNotificationPrefs, writePushSubscription }.
 */
export async function silentAutoResubscribe(personId, firebaseHelpers) {
  try {
    if (!personId) return;
    if (!pushSupported()) return;
    // OS-level permission must already be granted. If it was revoked we cannot silently re-prompt.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // already subscribed in this browser — nothing to do

    if (typeof firebaseHelpers?.readNotificationPrefs !== 'function') return;
    const prefs = await firebaseHelpers.readNotificationPrefs(personId);
    if (!prefs || prefs.enabled !== true) return; // user intent says off (or never enabled)

    // Intent says ON but browser has no subscription → silently re-subscribe.
    // Reuses the existing subscribe() flow which writes fresh endpoint to Firebase.
    await subscribe(personId, { writePushSubscription: firebaseHelpers.writePushSubscription });
    console.log('[push-client] silentAutoResubscribe: re-subscribed for', personId);
  } catch (err) {
    // Silent — auto-resubscribe failures are surfaced via the existing Notifications UI
    console.warn('[push-client] silentAutoResubscribe skipped:', err?.message || err);
  }
}

/**
 * Send a notification via the Worker. Used by writeMessage hook and the test button.
 * `payload` = { title, body, icon?, tag?, data?, actions? }.
 */
export async function sendNotification(personId, type, payload) {
  const body = JSON.stringify({ type: 'push', input: { personId, type, payload } });
  const ts = Date.now();
  const sigBytes = await hmacSha256Hex(`${ts}\n${body}`);
  const auth = `HMAC v1 ${ts}.${sigBytes}`;

  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': auth },
    body,
  });
  if (!r.ok) {
    console.warn('[push-client] /push non-OK', r.status);
    return { ok: false, status: r.status };
  }
  let data = {};
  try { data = await r.json(); } catch { /* malformed body — still treat as ok */ }
  return { ok: true, ...data };
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function hmacSha256Hex(text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(PUSH_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function describeDevice() {
  const ua = navigator.userAgent;
  // Compact label for the device-list UI — readable, not parsed.
  const platform = /iPhone|iPad/.test(ua) ? 'iOS'
                 : /Android/.test(ua)     ? 'Android'
                 : /Mac/.test(ua)         ? 'Mac'
                 : /Windows/.test(ua)     ? 'Windows'
                 : 'Web';
  const browser  = /CriOS|Chrome/.test(ua) ? 'Chrome'
                 : /Firefox/.test(ua)      ? 'Firefox'
                 : /Safari/.test(ua)       ? 'Safari'
                 : 'Browser';
  return `${platform} · ${browser}`;
}

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
