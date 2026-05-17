# Push Notifications — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the push-notification foundation plus immediate value: subscribe a device once, then receive bell messages and reward-approval requests as native OS notifications.

**Architecture:** Web Push (VAPID) directly — no FCM. Client subscribes via the existing service worker, stores subscription under `pushSubscriptions/{personId}/{endpointHash}`. A new Cloudflare Worker endpoint `POST /push` accepts HMAC-signed requests, looks up subscriptions, applies per-person prefs, signs the Web Push with VAPID, and fans out. Any call to `writeMessage(...)` in `shared/firebase.js` automatically triggers a push.

**Tech stack:** Vanilla JS (no bundler), Firebase Realtime Database (compat SDK), Cloudflare Worker (existing `workers/kitchen-import.js`), service worker (`sw.js`), Web Push protocol + VAPID, Web Crypto API for HMAC + VAPID JWT signing.

**Spec:** [docs/superpowers/specs/2026-05-15-push-notifications-design.md](../specs/2026-05-15-push-notifications-design.md)

---

## Testing approach (read first)

This codebase has **no unit-test framework** — verification follows the project's existing pattern: deploy/start the Worker or dev server, manually exercise the feature, and confirm behavior with `curl`, `wrangler tail`, browser DevTools, or Playwright screenshots. Each task ends with a concrete verification step you can run before committing.

For Worker code, the canonical loop is:
1. `npx wrangler deploy --config workers/wrangler.toml` (deploy to staging the live Worker)
2. Hit the endpoint with `curl`
3. `npx wrangler tail --config workers/wrangler.toml` to watch logs
4. Confirm expected request/response

For client code: `node serve.js` → `http://localhost:8080/?env=dev` (uses isolated `rundown-dev/` Firebase path).

---

## File map

**Create:**
- `shared/push-client.js` — client-side push helpers (subscribe, unsubscribe, sendNotification, HMAC signing).

**Modify:**
- `sw.js` — add `push` + `notificationclick` event listeners; bump `CACHE_NAME`; precache `shared/push-client.js`.
- `shared/firebase.js` — add subscription + notification-prefs CRUD helpers; call push from inside `writeMessage`.
- `shared/components.js` — add Notifications collapsible to `openDeviceThemeSheet` (the Customize sheet).
- `workers/kitchen-import.js` — add `push` handler (HMAC verify + pref filter + VAPID sign + fan-out + 410 prune).
- `workers/wrangler.toml` — document the new secrets in a comment (secrets themselves are set via `wrangler secret put`).
- `docs/ROADMAP.md` — move "Push Notifications" Phase 1 entry from MEDIUM into a "Shipped" callout (or mark as in-progress).

**Reference only (do not edit):**
- `docs/DESIGN.md` §10.4 — Customize sheet structure (where the Notifications row gets added).
- `docs/superpowers/specs/2026-05-15-push-notifications-design.md` — the spec.

---

## Task 1: VAPID + Worker secrets setup

**Files:**
- Modify: `workers/wrangler.toml` (documentation comment only)

This is a one-time configuration task done by the human operator before any code runs. The secrets are stored in Cloudflare, not the repo.

- [ ] **Step 1: Generate a VAPID key pair**

VAPID keys are standard P-256 ECDSA keys. Use `web-push` CLI (no project install needed; npx fetches it):

```bash
npx web-push generate-vapid-keys --json
```

Expected output:
```json
{
  "publicKey": "BFn...",
  "privateKey": "Ej..."
}
```

Save both values — you'll need them in the next steps. Keep the private key off-disk after pasting it to Cloudflare.

- [ ] **Step 2: Generate the HMAC secret**

This is the shared secret embedded in the client and verified by the Worker. Any random 32-byte value works:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the hex string.

- [ ] **Step 3: Set Worker secrets in Cloudflare**

```bash
npx wrangler secret put VAPID_PUBLIC_KEY --config workers/wrangler.toml
npx wrangler secret put VAPID_PRIVATE_KEY --config workers/wrangler.toml
npx wrangler secret put VAPID_SUBJECT --config workers/wrangler.toml      # e.g. mailto:jordin.jansky@gmail.com
npx wrangler secret put PUSH_HMAC_SECRET --config workers/wrangler.toml
```

For each, wrangler prompts for the value, masks input, and stores it encrypted in Cloudflare. Paste the values you generated.

If PowerShell blocks `npx`, use cmd.exe or set the secrets via the Cloudflare dashboard: Workers & Pages → kitchen-import → Settings → Variables → Add (mark each as Secret).

- [ ] **Step 4: Document the required secrets in wrangler.toml**

Open `workers/wrangler.toml` and find the existing secrets comment block at the top. Add the four new secret names so future readers know what must exist:

```toml
# Required Worker secrets (set via `wrangler secret put`):
#   CLAUDE_API_KEY          — Claude API for all AI handlers
#   FIREBASE_DB_URL         — Firebase REST URL (email handler only)
#   FIREBASE_DB_SECRET      — Firebase database secret (email handler only)
#   VAPID_PUBLIC_KEY        — Web Push public key (base64url, ~88 chars)
#   VAPID_PRIVATE_KEY       — Web Push private key (base64url, ~43 chars)
#   VAPID_SUBJECT           — mailto: URL for VAPID JWT sub claim
#   PUSH_HMAC_SECRET        — 32-byte hex; shared with client for /push auth
```

- [ ] **Step 5: Embed the public values into client constants**

The VAPID **public** key and the HMAC secret are needed in the client. Add a new constants block at the top of `shared/push-client.js` when you create that file in Task 5. For now, write the values into a temporary scratch file or your notes so they are ready.

> **Why HMAC secret in client:** acceptable for a family-scale app — see spec §"Why HMAC and not full auth". Worst-case attack is "send a fake notification" and Firebase rules already trust the client device.

- [ ] **Step 6: Commit the wrangler.toml comment update**

```bash
git add workers/wrangler.toml
git commit -m "chore(worker): document push-notification secrets in wrangler.toml"
```

No actual code change yet — just the documentation comment.

---

## Task 2: Worker `/push` handler — HMAC verify + skeleton

**Files:**
- Modify: `workers/kitchen-import.js` (add new handler near the existing HANDLERS map, ~line 1090)

The handler arrives via the existing dispatch table — type `"push"` in the request body. This task implements just the auth + skeleton, returning early with a stubbed success. Real send logic lands in Task 3.

- [ ] **Step 1: Add a Web Crypto HMAC verify helper**

Add this helper function near the top of `workers/kitchen-import.js`, just below the constants block (around line 17):

```js
// ── HMAC auth (shared with client for /push) ──────────────────────────────────

const HMAC_MAX_AGE_MS = 60_000; // 60 sec replay window

async function verifyPushAuth(authHeader, bodyText, env) {
  if (!authHeader || !authHeader.startsWith('HMAC v1 ')) return false;
  const token = authHeader.slice('HMAC v1 '.length);
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const tsStr = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > HMAC_MAX_AGE_MS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.PUSH_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}\n${bodyText}`));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, sigHex);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 2: Add a `handlePush` stub function**

Add this below `handleEmailMessage` (around line 1153), before the default export:

```js
// ── Push notifications ─────────────────────────────────────────────────────────

async function handlePush(input, env, corsHeaders, rawBodyText, authHeader) {
  // Auth: HMAC over `${timestamp}\n${rawBodyText}` using PUSH_HMAC_SECRET.
  // Replay protection: timestamp within 60 sec.
  const authed = await verifyPushAuth(authHeader, rawBodyText, env);
  if (!authed) return jsonError('Unauthorized', 401, corsHeaders);

  if (!input?.personId || !input?.type || !input?.payload) {
    return jsonError('Missing personId, type, or payload', 400, corsHeaders);
  }

  // TODO Task 3: pref-filter, VAPID sign, fan-out.
  return jsonOk({ ok: true, sent: 0, skipped: 'stub' }, corsHeaders);
}
```

- [ ] **Step 3: Wire `push` into the dispatch + pass raw body + auth header**

The current dispatch (around line 1175) reads the body as JSON. The HMAC verify needs the **raw text** so it can re-hash exactly what the client signed. Restructure the `fetch` handler so it reads text once, parses to JSON for routing, and passes both downstream for push.

Replace the existing fetch body (currently lines ~1157–1182) with:

```js
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const rawBodyText = await request.text();
    let body;
    try { body = JSON.parse(rawBodyText); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { type, input } = body;
    if (type === 'push') {
      return handlePush(input, env, CORS, rawBodyText, request.headers.get('Authorization'));
    }
    const handler = HANDLERS[type];
    if (handler) return handler(input, env);

    return new Response(JSON.stringify({ error: 'Unknown type' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },
```

Also update `Access-Control-Allow-Headers` in the `CORS` constant (line ~1087) to include `Authorization`:

```js
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

- [ ] **Step 4: Deploy + verify auth path**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

Generate a signed request with this Node one-liner (substitute your `PUSH_HMAC_SECRET`):

```bash
node -e "
const crypto = require('crypto');
const SECRET = 'YOUR_HMAC_SECRET_HEX';
const body = JSON.stringify({ type: 'push', input: { personId: 'p1', type: 'bellMessage', payload: { title: 't', body: 'b' } } });
const ts = Date.now();
const sig = crypto.createHmac('sha256', SECRET).update(ts + '\n' + body).digest('hex');
console.log('AUTH: HMAC v1', ts + '.' + sig);
console.log('BODY:', body);
"
```

Send it:

```bash
curl -X POST https://kitchen-import.YOURNAME.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: HMAC v1 <ts>.<sig>" \
  -d '<body>'
```

Expected: `{"ok": true, "sent": 0, "skipped": "stub"}`.

Then send the same body **without** the Authorization header:

```bash
curl -X POST https://kitchen-import.YOURNAME.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"type": "push", "input": {"personId":"p1","type":"bellMessage","payload":{"title":"t","body":"b"}}}'
```

Expected: HTTP 401 `{"error": "Unauthorized"}`.

- [ ] **Step 5: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): /push handler skeleton with HMAC auth"
```

---

## Task 3: Worker — VAPID signing, pref filter, fan-out

**Files:**
- Modify: `workers/kitchen-import.js` (extend `handlePush`, add VAPID + Firebase REST helpers)

This is the longest task. It implements the actual Web Push protocol: sign a JWT with VAPID, format the request, send to the OS push service, fan out to all of the recipient's subscriptions, and prune 410 Gone responses.

- [ ] **Step 1: Add base64url + Firebase REST helpers**

Add these helpers near the top, just after the HMAC helpers added in Task 2:

```js
// ── base64url helpers ──────────────────────────────────────────────────────────

function b64urlEncode(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Firebase REST (read/write without the client SDK) ─────────────────────────

const RUNDOWN_ROOT = 'rundown'; // Worker always targets production; client-side env=dev does its own routing.

async function fbGet(env, path) {
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) throw new Error('Firebase env missing');
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  const r = await fetch(`${base}/${RUNDOWN_ROOT}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`);
  if (!r.ok) throw new Error(`fbGet ${path}: ${r.status}`);
  return r.json();
}

async function fbDelete(env, path) {
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  await fetch(`${base}/${RUNDOWN_ROOT}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`, { method: 'DELETE' });
}
```

> **Note on `RUNDOWN_ROOT`:** the client targets `rundown-dev/` when `?env=dev` is in the URL. The Worker always targets `rundown/` — push from dev environments simply won't deliver. Acceptable for Phase 1; if dev push becomes needed later, accept a `dev: true` flag in the request.

- [ ] **Step 2: Add VAPID JWT signing**

Append to the same file:

```js
// ── VAPID (signs the JWT in the Authorization header for each push) ───────────

async function importVapidPrivateKey(privateKeyB64Url) {
  // VAPID private key is the raw 32-byte P-256 scalar in base64url.
  // Web Crypto needs JWK, so we construct one with the matching public coords.
  // Simpler: we accept that we also need the public key to build the JWK.
  // Cleaner: import as PKCS#8 — but generating PKCS#8 from a raw scalar in
  // a Worker is painful. Use JWK form.
  throw new Error('use signVapidJwt instead');
}

async function signVapidJwt(audience, env) {
  // audience = origin of the push service (e.g. https://fcm.googleapis.com)
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600, // 12 hr max per RFC8292
    sub: env.VAPID_SUBJECT, // mailto:...
  };
  const encHeader  = b64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;

  // Build JWK from public + private base64url values
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY); // 65 bytes: 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('VAPID public key must be uncompressed P-256 (65 bytes)');
  const x = b64urlEncode(pub.slice(1, 33));
  const y = b64urlEncode(pub.slice(33, 65));
  const jwk = {
    kty: 'EC', crv: 'P-256', x, y, d: env.VAPID_PRIVATE_KEY,
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  const encSig = b64urlEncode(new Uint8Array(sig));
  return `${signingInput}.${encSig}`;
}
```

- [ ] **Step 3: Add a Web Push send helper**

```js
// ── Web Push send (single subscription) ───────────────────────────────────────

async function sendWebPush(subscription, payloadObj, env) {
  // payloadObj is plain JSON. We send unencrypted-zero-length body in this Phase
  // (the SW reads the data from `event.data?.text()` and shows the notification).
  // For Phase 1 we use the simpler aes128gcm-with-empty-payload? No: empty body
  // is allowed but defeats the purpose. We need to encrypt the payload for the
  // subscription's keys.

  const audience = new URL(subscription.endpoint).origin;
  const jwt = await signVapidJwt(audience, env);

  const payloadText = JSON.stringify(payloadObj);
  const { ciphertext, salt, localPublicKey } = await encryptPayload(
    payloadText,
    subscription.p256dh,
    subscription.auth,
  );

  const headers = {
    'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    'Content-Type':  'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'TTL': '86400',
    'Urgency': 'normal',
  };

  const r = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body: ciphertext,
  });
  return { status: r.status, ok: r.ok };
}
```

- [ ] **Step 4: Add the aes128gcm payload encryption**

Web Push requires payloads be encrypted per RFC 8291. This is the hairiest part. Add this helper:

```js
// ── aes128gcm encryption (RFC 8188 + 8291) ────────────────────────────────────

async function encryptPayload(plaintext, recipientP256dhB64Url, recipientAuthB64Url) {
  const recipientPub = b64urlDecode(recipientP256dhB64Url); // 65 bytes
  const recipientAuth = b64urlDecode(recipientAuthB64Url);  // 16 bytes
  const ptBytes = new TextEncoder().encode(plaintext);

  // 1. Generate ephemeral ECDH key pair (sender local).
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPubRaw = await crypto.subtle.exportKey('raw', local.publicKey); // Uint8Array(65)

  // 2. Import recipient public key.
  const recipientKey = await crypto.subtle.importKey(
    'raw', recipientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );

  // 3. ECDH → shared secret.
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientKey }, local.privateKey, 256,
  );
  const sharedSecret = new Uint8Array(sharedBits); // 32 bytes

  // 4. salt (random 16 bytes).
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 5. PRK_key = HKDF-Extract(auth, ecdh_secret) with the Web-Push info string.
  // Per RFC 8291 §3.3:
  //   key_info = "WebPush: info\x00" || recipient_pub || sender_pub
  //   IKM = HKDF(salt = auth_secret, IKM = ecdh_secret, info = key_info, L = 32)
  //   PRK = HKDF(salt = random_salt, IKM = IKM,         info = "Content-Encoding: aes128gcm\x00", L = 16)
  //   NONCE_BASE = HKDF(salt = random_salt, IKM = IKM,  info = "Content-Encoding: nonce\x00", L = 12)

  const keyInfo = new Uint8Array(
    [...new TextEncoder().encode('WebPush: info\0'), ...new Uint8Array(recipientPub), ...new Uint8Array(localPubRaw)],
  );
  const ikm = await hkdf(recipientAuth, sharedSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  // 6. AES-GCM encrypt plaintext + 0x02 padding delimiter (RFC 8188 §2.1).
  const padded = new Uint8Array(ptBytes.length + 1);
  padded.set(ptBytes); padded[ptBytes.length] = 0x02;
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded);
  const ct = new Uint8Array(ctBuf);

  // 7. Build the encrypted content-encoding header per RFC 8188 §2.1:
  //    salt (16) || rs (4, big-endian) || idlen (1) || keyid (idlen) || ciphertext
  //    For Web Push: rs = 4096, keyid = sender's raw public key (65 bytes), idlen = 65.
  const rsBE = new Uint8Array(4);
  new DataView(rsBE.buffer).setUint32(0, 4096);
  const localPub65 = new Uint8Array(localPubRaw);
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header.set(rsBE, 16);
  header[20] = 65;
  header.set(localPub65, 21);

  const out = new Uint8Array(header.length + ct.length);
  out.set(header, 0);
  out.set(ct, header.length);

  return { ciphertext: out, salt, localPublicKey: localPub65 };
}

async function hkdf(salt, ikm, info, length) {
  // HKDF-Extract + HKDF-Expand combined.
  const prkKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prkBuf = await crypto.subtle.sign('HMAC', prkKey, ikm);
  const prk = new Uint8Array(prkBuf);
  const expandKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1Buf = await crypto.subtle.sign('HMAC', expandKey, new Uint8Array([...info, 0x01]));
  return new Uint8Array(t1Buf).slice(0, length);
}
```

> **Note:** length > 32 bytes would need multiple HKDF-Expand rounds. CEK is 16 and nonce is 12 — both fit in one round, so this helper is sufficient.

- [ ] **Step 5: Fill in `handlePush` with the real logic**

Replace the stub `handlePush` from Task 2 with:

```js
async function handlePush(input, env, corsHeaders, rawBodyText, authHeader) {
  const authed = await verifyPushAuth(authHeader, rawBodyText, env);
  if (!authed) return jsonError('Unauthorized', 401, corsHeaders);

  const { personId, type, payload } = input || {};
  if (!personId || !type || !payload) {
    return jsonError('Missing personId, type, or payload', 400, corsHeaders);
  }

  // 1. Per-person pref filter
  const prefs = await fbGet(env, `people/${personId}/prefs/notifications`);
  if (!prefs || prefs.enabled === false) {
    return jsonOk({ sent: 0, skipped: 'pref-disabled' }, corsHeaders);
  }
  if (prefs.types && prefs.types[type] === false) {
    return jsonOk({ sent: 0, skipped: 'type-disabled' }, corsHeaders);
  }

  // 2. Load subscriptions
  const subsObj = await fbGet(env, `pushSubscriptions/${personId}`);
  if (!subsObj || typeof subsObj !== 'object') {
    return jsonOk({ sent: 0, skipped: 'no-devices' }, corsHeaders);
  }

  // 3. Fan out
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

  return jsonOk({ sent, removed, errors }, corsHeaders);
}
```

- [ ] **Step 6: Deploy + smoke-test the full /push path**

```bash
npx wrangler deploy --config workers/wrangler.toml
```

You cannot meaningfully test push without a real subscription, so confirm only the pref-disabled path here. In the Firebase console (production root `rundown/`), manually create a test person record at `rundown/people/test-push/prefs/notifications = { enabled: false }`.

Re-run the curl from Task 2 step 4 with `personId: "test-push"`. Expected: `{"sent": 0, "skipped": "pref-disabled"}`.

Then change `enabled` to `true` (and add `types: { bellMessage: false }`). Re-run. Expected: `{"sent": 0, "skipped": "type-disabled"}`.

Then change `types` to `{ bellMessage: true }`. Re-run. Expected: `{"sent": 0, "removed": 0, "errors": 0, "skipped": "no-devices"}` — *wait, that's wrong; we return `no-devices` before fan-out*. Actually with `subsObj` null, you'll get `skipped: 'no-devices'`. Confirm. ✓ end-to-end auth + pref filtering works.

Delete the test data: `rundown/people/test-push`.

- [ ] **Step 7: Commit**

```bash
git add workers/kitchen-import.js
git commit -m "feat(worker): /push handler — VAPID sign, pref filter, fan-out with 410 prune"
```

---

## Task 4: Service Worker — push handler + notificationclick

**Files:**
- Modify: `sw.js` (add listeners, bump cache, precache new client module)

- [ ] **Step 1: Add `push` and `notificationclick` listeners**

Add these listeners at the end of `sw.js`, after the existing `fetch` listener:

```js
// ── Push notifications ─────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const { title, body, icon, tag, data, actions } = payload;
  if (!title) return;
  event.waitUntil(self.registration.showNotification(title, {
    body: body || '',
    icon: icon || '/app-icon.png',
    tag:  tag || 'rundown',
    data: data || {},
    actions: actions || [],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  // Action buttons (Approve/Deny on reward requests) — Phase 2+ wiring;
  // for Phase 1 we just open the deep link.
  // TODO Phase 2: POST approve/deny to Worker.

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

- [ ] **Step 2: Add `shared/push-client.js` to APP_SHELL precache**

Find the `APP_SHELL` array (around line 440) and add `/shared/push-client.js` to the JS modules section:

```js
  '/shared/dev-banner.js',
  '/shared/kitchen-ical.js',
  '/shared/push-client.js',
```

- [ ] **Step 3: Bump `CACHE_NAME` and add a CACHE_BUMP comment**

Change `const CACHE_NAME = 'family-hub-v314';` (line 438) to `'family-hub-v315'`.

Add a comment at the top of the bump log (just below the `CACHE_BUMPS` section, around line 11):

```js
// v315 (2026-05-15) — Push notifications Phase 1: SW push+notificationclick
//                     handlers added, shared/push-client.js precached.
```

- [ ] **Step 4: Manual verification (deferred to end-to-end test in Task 8)**

The SW can only be verified when there's a real subscription pushing to it. Don't try to test in isolation — the integration test in Task 8 covers this.

- [ ] **Step 5: Commit**

```bash
git add sw.js
git commit -m "feat(sw): push + notificationclick handlers (cache v315)"
```

---

## Task 5: Push client module — subscribe, unsubscribe, sendNotification

**Files:**
- Create: `shared/push-client.js`

- [ ] **Step 1: Create the file with VAPID public key + HMAC secret constants**

Paste the values you generated in Task 1 into the constants. The Worker URL is the same one used by `shared/ai-helpers.js` — look it up there if you don't have it handy.

Create `shared/push-client.js`:

```js
// push-client.js — Web Push subscribe / unsubscribe / send.
// No DOM access beyond Notification + registration APIs. Imports nowhere else
// from this codebase, so safe to import in any page.

// Public values — safe to embed. The HMAC secret is technically client-known;
// see docs/superpowers/specs/2026-05-15-push-notifications-design.md
// §"Why HMAC and not full auth".
const VAPID_PUBLIC_KEY  = 'PASTE_BFn..._FROM_TASK_1_HERE';
const PUSH_HMAC_SECRET  = 'PASTE_HEX_FROM_TASK_1_HERE';
const WORKER_URL        = 'https://kitchen-import.YOURNAME.workers.dev'; // same as ai-helpers.js

// ── base64url + hash helpers ──────────────────────────────────────────────────

function b64urlToUint8(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ToB64url(buf) {
  let s = '';
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  return { ok: true, ...(await r.json()) };
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
```

- [ ] **Step 2: Replace placeholder constants with real values**

Paste in:
- `VAPID_PUBLIC_KEY` — the public key from Task 1 Step 1.
- `PUSH_HMAC_SECRET` — the hex secret from Task 1 Step 2.
- `WORKER_URL` — look in `shared/ai-helpers.js` for `WORKER_URL` or `WORKER_ENDPOINT` to find the existing Worker URL. Reuse the same value.

- [ ] **Step 3: Verify the file loads in the browser**

```bash
node serve.js
```

Open `http://localhost:8080/?env=dev` in Chrome. Open DevTools console and run:

```js
const m = await import('/shared/push-client.js');
console.log(m.pushSupported(), m.pushPermission());
```

Expected: `true 'default'` (or `'granted'` if you've already granted permission to this origin before).

- [ ] **Step 4: Commit**

```bash
git add shared/push-client.js
git commit -m "feat(client): push subscribe/unsubscribe/sendNotification module"
```

---

## Task 6: Firebase helpers — subscriptions + notification prefs

**Files:**
- Modify: `shared/firebase.js` (add typed helpers)

- [ ] **Step 1: Add subscription + prefs helpers**

Find the "Messages" section (around line 429) and **above** it add a new "Push Subscriptions" section:

```js
// ── Push Subscriptions ──

export async function readPushSubscriptions(personId) {
  return readOnce(`pushSubscriptions/${personId}`);
}

export async function writePushSubscription(personId, endpointHash, data) {
  return writeData(`pushSubscriptions/${personId}/${endpointHash}`, data);
}

export async function removePushSubscription(personId, endpointHash) {
  return removeData(`pushSubscriptions/${personId}/${endpointHash}`);
}

// ── Notification Prefs ──

export async function readNotificationPrefs(personId) {
  return readOnce(`people/${personId}/prefs/notifications`);
}

export async function writeNotificationPrefs(personId, prefs) {
  return writeData(`people/${personId}/prefs/notifications`, prefs);
}

export async function updateNotificationPrefs(personId, partial) {
  return updateData(`people/${personId}/prefs/notifications`, partial);
}
```

- [ ] **Step 2: Modify `writeMessage` to fire push on success**

Find `writeMessage` (around line 439):

```js
export async function writeMessage(personId, data) {
  return pushData(`messages/${personId}`, data);
}
```

Replace with:

```js
export async function writeMessage(personId, data) {
  const id = await pushData(`messages/${personId}`, data);
  // Fire-and-forget push notification — never block the message write.
  // Importing push-client lazily so callers that don't load it (e.g. SW context)
  // aren't penalized by a static import cycle.
  notifyMessageFireAndForget(personId, data);
  return id;
}

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

function mapMessageTypeToPushType(messageType) {
  // Message types that should trigger a push.
  // Returned strings MUST match the keys in person.prefs.notifications.types
  // (the Worker uses them directly for `prefs.types[type] === false` lookup).
  // Other internal types (penalty-removed, task-skip-used, etc.) are silent.
  if (messageType === 'request')  return 'rewardApprovals';
  if (messageType === 'fyi')      return 'rewardFyi';
  if (messageType === 'message')  return 'bellMessages';
  if (messageType === 'kudos')    return 'bellMessages';
  return null;
}
```

> **Why fire-and-forget:** if the Worker is down or the push fails, the message write must still succeed — the bell will surface it inside the app.

- [ ] **Step 3: Verify the helpers are importable**

In a browser console at `http://localhost:8080/?env=dev`:

```js
const f = await import('/shared/firebase.js');
console.log(typeof f.writePushSubscription, typeof f.writeNotificationPrefs);
```

Expected: `function function`.

- [ ] **Step 4: Commit**

```bash
git add shared/firebase.js
git commit -m "feat(firebase): push subscription + notification pref helpers; writeMessage fires push"
```

---

## Task 7: Customize → Notifications UI

**Files:**
- Modify: `shared/components.js` (extend `openDeviceThemeSheet`)

The Customize sheet is rendered by `openDeviceThemeSheet`. It has 3 modes; we only need to render the Notifications row in **person mode** (when `personOpts` is set and `kidMode` is false). Per DESIGN.md §10.4 the Universal section is the right home — notifications aren't page-specific.

- [ ] **Step 1: Read the Customize sheet's current shape**

Open `shared/components.js` and locate `openDeviceThemeSheet` (around line 3371). Scroll down past the existing Theme + Text Size + Avatar Style + Task Grouping rendering to find where the "Navigation buttons" collapsible is rendered (search for "Navigation buttons" within the function).

You're going to insert a new `<details class="dt-collapsible">...</details>` block **just before** the Navigation buttons collapsible, also gated by `richExtras && !kidMode`.

- [ ] **Step 2: Add the Notifications collapsible markup**

Locate the line that closes off the avatar style / task grouping block and opens the "Navigation buttons" collapsible. Insert this block immediately before it:

```js
        ${richExtras ? `
          <details class="dt-collapsible">
            <summary>Notifications<span class="dt-collapsible__chev"></span></summary>
            <div class="dt-collapsible__body">
              <div id="notifMount" data-person-id="${personOpts.person.id}"></div>
            </div>
          </details>
        ` : ''}
```

We render an empty mount so the JS module can populate it asynchronously — the prefs + subscription state require async reads from Firebase + the browser, so building the HTML synchronously here would block sheet rendering.

- [ ] **Step 3: Add the mount initializer**

Below the existing wiring in the function (where Theme buttons, avatar style chips, etc., get their listeners), add a hook that lazy-loads the notification UI module:

```js
        // Notifications section — async init (no-op if not in person mode)
        const notifMount = root.querySelector('#notifMount');
        if (notifMount && personOpts?.person?.id) {
          import('./push-ui.js').then(m => m.mountNotificationsSection(notifMount, personOpts));
        }
```

> Why a separate `push-ui.js`: keeps the (already large) `components.js` from growing further, and lets the notification UI live next to the push-client module conceptually. It also defers parsing until the user actually opens Customize.

- [ ] **Step 4: Create `shared/push-ui.js` with the section component**

Create a new file `shared/push-ui.js`:

```js
// push-ui.js — Notifications section inside the Customize sheet.
// Renders into a caller-provided mount. Reads + writes person.prefs.notifications
// and pushSubscriptions/{personId}/{endpointHash}.

import {
  pushSupported, pushPermission, subscribe, unsubscribe, sendNotification, endpointHash,
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
        showToast(`Could not change subscription: ${err.message}`, { variant: 'error' });
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
        data:  { url: '/index.html', type: 'bellMessage' },
      });
      if (!r?.ok) showToast(`Test failed: status ${r?.status || 'unknown'}`, { variant: 'error' });
      else showToast('Test notification sent', { variant: 'success' });
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
```

Note: `currentDeviceHash` imports and reuses `endpointHash` from push-client.js — single source of truth for the hash format. Do not duplicate the algorithm here.

- [ ] **Step 5: Add minimal CSS for the notif rows**

Open `styles/components.css` and append:

```css
/* Notifications section inside the Customize sheet */
.notif-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
}
.notif-row__label {
  flex: 1;
  font-weight: 500;
}
.notif-row__status {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.notif-section {
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--border);
}
.notif-section .form-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) 0;
}
```

- [ ] **Step 6: Add `shared/push-ui.js` to the precache**

Open `sw.js`, find the line you added in Task 4 Step 2 (`'/shared/push-client.js',`) and add immediately after:

```js
  '/shared/push-ui.js',
```

Bump `CACHE_NAME` from `v315` to `v316`. Add a new CACHE_BUMP comment:

```js
// v316 (2026-05-15) — Push notifications Phase 1: Notifications section in
//                     Customize sheet (push-ui.js precached).
```

- [ ] **Step 7: Visual verification on localhost**

```bash
node serve.js
```

Open `http://localhost:8080/?env=dev` in Chrome at 412×915 (Playwright). Navigate to More → Customize. Confirm:
- A "Notifications" collapsible appears between Avatar Style / Task Grouping and Navigation buttons.
- Tapping it expands and shows "This device · Off · [Enable]".
- Tapping Enable triggers the browser permission prompt.
- Granting it flips the row to "On · [Disable] [Send test]".
- The type toggles render and persist (refresh and re-open Customize to confirm).

Take a screenshot of the expanded section and analyze it, then delete the screenshot.

- [ ] **Step 8: Commit**

```bash
git add shared/components.js shared/push-ui.js styles/components.css sw.js
git commit -m "feat(customize): Notifications section with enable/test/type toggles (cache v316)"
```

---

## Task 8: End-to-end verification on real devices

**Files:** none — verification only

This task is the actual "does it work?" gate. Push behavior varies enough across platforms that desktop Chrome alone is insufficient.

- [ ] **Step 1: Desktop Chrome — bell message → push**

On desktop Chrome at `http://localhost:8080/?env=dev`:
1. Customize → Notifications → Enable. Confirm "On".
2. Open a second browser tab as a different person (use the person switcher).
3. From the second tab, send the first person a bell message.
4. The first tab's window does **not** need focus. A native OS notification should appear within ~1 second showing the title + body.
5. Click the notification → the first tab should focus or open.

If no notification arrives:
- Open DevTools → Application → Service Workers → confirm the new SW is active. If "Update on reload" isn't checked, force-update.
- Check `wrangler tail` output for the push request.
- Check Firebase: `rundown-dev/pushSubscriptions/{personId}` should have your endpoint.

Note: `?env=dev` writes to `rundown-dev/`, but the Worker reads `rundown/` (see Task 3 Step 1 note). For real end-to-end testing **without** the env flag, use the production URL or temporarily change `RUNDOWN_ROOT` in the Worker — your call. For Phase 1 it's enough to confirm the path is exercised correctly via console + tail; deferred prod test happens at Phase 1 ship time.

- [ ] **Step 2: Android Chrome — install PWA + receive push**

1. Push your branch and let it deploy to production (`dashboard.jansky.app`).
2. On an Android phone, navigate to the production URL while signed in via Cloudflare Zero Trust.
3. Install to home screen ("Add Daily Rundown to Home screen").
4. Open the installed PWA. Customize → Notifications → Enable.
5. From another device or browser, send a bell message to this person.
6. Confirm the notification arrives on the Android lock screen / status bar.
7. Tap → app opens.

- [ ] **Step 3: iOS Safari PWA — install + receive push (CRITICAL)**

This is the most failure-prone surface.

1. On iPhone with iOS 16.4+ Safari, open the production URL.
2. Share → Add to Home Screen. **Open the PWA from the home-screen icon** (not a Safari tab).
3. Customize → Notifications. If "This browser does not support web push" appears, the PWA wasn't installed correctly — close and reinstall.
4. Enable. iOS prompts for permission. Grant.
5. From another device, send a bell message. Wait up to 30 sec — Apple's push service occasionally throttles aggressively, especially for first-time tests.
6. Notification should arrive. Tap → PWA opens.

- [ ] **Step 4: Pref filtering — disable a type**

On any working device:
1. Customize → Notifications → uncheck Bell messages.
2. Have another person send you a bell message.
3. The message should still appear in the in-app bell, but **no push** should arrive.
4. Re-check the toggle. Send another message. Push arrives.

- [ ] **Step 5: Multi-device fan-out**

If you have two devices subscribed for the same person:
1. Send a message to that person from elsewhere.
2. Both devices receive the push.

- [ ] **Step 6: 410 prune**

1. On a subscribed device, go to browser settings → site permissions → revoke notification permission for the origin. This invalidates the subscription at the OS level.
2. Send a message to that person.
3. Worker should get a 410 from the push service, delete the subscription row in Firebase.
4. Confirm in Firebase: `pushSubscriptions/{personId}/{hash}` is gone.

- [ ] **Step 7: Record findings**

If any device/scenario fails, fix the underlying cause before considering Phase 1 done. Do not paper over failures — push that "works on Android but silently fails on iOS" is worse than no push, because the user trusts a reminder they're never going to receive.

---

## Task 9: Roadmap + DESIGN.md update + closing commit

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/DESIGN.md` §10.4 (note Notifications now lives in Customize)
- Modify: `docs/superpowers/specs/2026-05-15-push-notifications-design.md` (mark Phase 1 status: shipped)

- [ ] **Step 1: Move Push Notifications out of MEDIUM in roadmap**

Open `docs/ROADMAP.md`. Find the "Push Notifications" entry under MEDIUM (around line 65). Replace with a status note that Phase 1 has shipped and the remaining phases are tracked separately, or move it into a new "In progress" callout near the top of the file. Suggested replacement text:

```md
**Push Notifications** · Phase 1 shipped 2026-05-15 · Cost: $0
Phase 1: Subscribe per device, push for bell messages + reward approvals + reward FYI.
Remaining phases (event reminders, task nudges, daily digest, quiet hours) tracked in
[docs/superpowers/specs/2026-05-15-push-notifications-design.md](superpowers/specs/2026-05-15-push-notifications-design.md).
```

- [ ] **Step 2: Update DESIGN.md §10.4 Page sections list**

Find the "Page sections" subsection (around line 1459). The "Currently populated" list currently includes Home + Kitchen. Add a note under the Universal section bullet list that Notifications is also Universal. Existing universal list at line 1441–1446 — add an item:

```md
- **Notifications** — collapsible, closed by default. Per-device enable/disable + per-type toggles. Only renders in person mode (not kid mode, not device mode). See [push notifications spec](../superpowers/specs/2026-05-15-push-notifications-design.md).
```

- [ ] **Step 3: Update spec status line**

In `docs/superpowers/specs/2026-05-15-push-notifications-design.md`, change the header line:

```md
**Status:** Spec · awaiting review
```

to:

```md
**Status:** Phase 1 shipped 2026-05-15 · Phases 2–5 pending
```

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/DESIGN.md docs/superpowers/specs/2026-05-15-push-notifications-design.md
git commit -m "docs: mark push notifications Phase 1 shipped; note Customize home"
```

- [ ] **Step 5: Final SW bump and deploy**

Confirm one last time that `sw.js` `CACHE_NAME` is at the most recent bump (v316 after Task 7, or higher if any later task added precached files). If not, bump once more.

```bash
npx wrangler deploy --config workers/wrangler.toml
git push origin <branch>
```

Wait for Cloudflare Pages to build, then verify production:
- Open `https://dashboard.jansky.app` on a fresh browser.
- Service Worker updates to the new cache version.
- Customize → Notifications renders and the subscribe flow works end-to-end.

- [ ] **Step 6: Final commit if anything was tweaked during prod verification**

If you had to fix any production-only issues (missing precache entry, hardcoded localhost URL slipping through, etc.), commit those fixes before declaring Phase 1 done.

---

## Phase 1 done

What ships:
- Subscribe per device in Customize → Notifications.
- Three message types push automatically: bell messages, reward approval requests, reward FYI.
- Per-person master switch + per-type toggles.
- Send test button validates the path end-to-end.
- Worker `/push` endpoint with HMAC auth + VAPID signing + automatic prune of dead subscriptions.

What is intentionally NOT in Phase 1 (lands in Phase 2+):
- Event reminders (cron-triggered).
- Task reminders.
- Daily digest.
- Quiet hours.
- Lead-time / digest-time / task-reminder-time prefs (the UI rows + collapsibles will be added incrementally per phase).
- Approve/Deny notification action buttons (placeholder in SW; wired in Phase 2 or 3).
- `pushsubscriptionchange` auto-re-registration (Phase 5).
- Multi-device management UI ("Remove" on a non-current device — Phase 5).

When ready, brainstorm Phase 2 by reading the spec and starting a new plan: `docs/superpowers/plans/YYYY-MM-DD-push-notifications-phase-2.md`.
