// workers/kitchen-import.js — Kitchen import + auto-categorization Worker
// Deploy: wrangler deploy workers/kitchen-import.js
// Secrets (wrangler secret put):
//   CLAUDE_API_KEY        — required for all AI handlers
//   FIREBASE_DB_URL       — required for email + push handlers (e.g. https://project-default-rtdb.firebaseio.com)
//   FIREBASE_DB_SECRET    — required for email + push handlers (Firebase Database Secret from Project Settings → Service Accounts)

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LIST = [
  'Produce', 'Dairy', 'Meat & Seafood', 'Bakery', 'Frozen', 'Pantry',
  'Beverages', 'Snacks', 'Household', 'Personal Care', 'Baby & Kids',
  'Pets', 'Clothing', 'Electronics', 'Toys', 'Other',
];
const CATEGORY_STR = CATEGORY_LIST.join(', ');
const CATEGORY_SET = new Set(CATEGORY_LIST);

// ── HMAC auth (shared with client for /push) ──────────────────────────────────

const HMAC_MAX_AGE_MS = 60_000; // 60 sec replay window

async function verifyPushAuth(authHeader, bodyText, env) {
  if (!authHeader || !authHeader.startsWith('HMAC v1 ')) return false;
  if (!env.PUSH_HMAC_SECRET) {
    console.error('[push] PUSH_HMAC_SECRET not set');
    return false;
  }
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
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${tsStr}\n${bodyText}`));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, sigHex);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
  if (!env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) throw new Error('Firebase env missing');
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '');
  await fetch(`${base}/${RUNDOWN_ROOT}/${path}.json?auth=${env.FIREBASE_DB_SECRET}`, { method: 'DELETE' });
}

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
  return { hours: h === 24 ? 0 : h, minutes: m };
}

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

// Convert a date key + HH:MM string in a given timezone to a UTC Date.
// Iterates because UTC midnight of a date in a given tz is not midnight there.
function localDateTimeToUtc(dateKey, hhmm, tz) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const targetMin = hh * 60 + mm;
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

// ── VAPID (signs the JWT in the Authorization header for each push) ───────────

async function signVapidJwt(audience, env) {
  // audience = origin of the push service (e.g. https://fcm.googleapis.com)
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error('VAPID env missing (PUBLIC_KEY / PRIVATE_KEY / SUBJECT)');
  }
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

// ── Web Push send (single subscription) ───────────────────────────────────────

async function sendWebPush(subscription, payloadObj, env) {
  const audience = new URL(subscription.endpoint).origin;
  const jwt = await signVapidJwt(audience, env);

  const payloadText = JSON.stringify(payloadObj);
  const { ciphertext } = await encryptPayload(
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

// ── aes128gcm encryption (RFC 8188 + 8291) ────────────────────────────────────

async function encryptPayload(plaintext, recipientP256dhB64Url, recipientAuthB64Url) {
  const recipientPub = b64urlDecode(recipientP256dhB64Url); // 65 bytes
  const recipientAuth = b64urlDecode(recipientAuthB64Url);  // 16 bytes
  const ptBytes = new TextEncoder().encode(plaintext);

  // 1. Generate ephemeral ECDH key pair (sender local).
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPubRaw = await crypto.subtle.exportKey('raw', local.publicKey); // ArrayBuffer(65)

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
  //   IKM      = HKDF(salt = auth_secret, IKM = ecdh_secret, info = key_info, L = 32)
  //   CEK      = HKDF(salt = random_salt, IKM = IKM, info = "Content-Encoding: aes128gcm\x00", L = 16)
  //   NONCE    = HKDF(salt = random_salt, IKM = IKM, info = "Content-Encoding: nonce\x00", L = 12)

  const localPub65 = new Uint8Array(localPubRaw);
  const keyInfo = new Uint8Array(
    [...new TextEncoder().encode('WebPush: info\0'), ...recipientPub, ...localPub65],
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
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header.set(rsBE, 16);
  header[20] = 65;
  header.set(localPub65, 21);

  const out = new Uint8Array(header.length + ct.length);
  out.set(header, 0);
  out.set(ct, header.length);

  return { ciphertext: out };
}

async function hkdf(salt, ikm, info, length) {
  // HKDF-Extract + HKDF-Expand combined.
  // Length must be ≤ 32 (single HMAC block). CEK is 16, nonce is 12, IKM is 32 — all fit.
  const prkKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prkBuf = await crypto.subtle.sign('HMAC', prkKey, ikm);
  const prk = new Uint8Array(prkBuf);
  const expandKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1Buf = await crypto.subtle.sign('HMAC', expandKey, new Uint8Array([...info, 0x01]));
  return new Uint8Array(t1Buf).slice(0, length);
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const RECIPE_PROMPT = (userContext = '') => `${userContext ? `USER-PROVIDED CONTEXT: "${userContext}"\n\n` : ''}Extract recipe information. The source may be a recipe website, blog post, social media post, or photo of a recipe card — formats vary widely.

INGREDIENT NAME RULES:
- Use the bare grocery-store name only — no prep instructions, no parenthetical descriptions.
- Strip prep modifiers from the name: "black pepper (freshly cracked)" → "black pepper". "garlic, minced" → "garlic". "freshly grated parmesan" → "parmesan". "finely diced onion" → "onion".
- Strip parenthetical content entirely.
- Strip everything after a comma (it's almost always prep).
- Keep modifiers that change the SKU: "extra virgin olive oil" stays as is; "diced tomatoes" stays as is (canned, different from fresh tomatoes); "boneless skinless chicken breast" stays as is.
- Lowercase the first letter unless it's a brand name.

QUANTITY RULES:
- Keep mixed fractions together in qty: "1 1/4 tsp" not "1" + "1/4 tsp". The qty field is the full amount with unit.
- Ingredient name is only the bare grocery item — never the unit.

METADATA SOURCES:
- If JSON-LD STRUCTURED DATA appears at the top of the source, prefer it — it has machine-readable prepTime / cookTime / totalTime / recipeYield / recipeCategory / recipeCuisine / keywords.
- ISO 8601 durations like "PT15M", "PT1H30M", "PT1H" convert to short human strings: "15 min", "1 hr 30 min", "1 hr". A duration of 0 ("PT0M") counts as null.
- For times: extract prep / cook / total SEPARATELY when the source gives them. If the source only gives a single number ("30 min ready"), put it in totalTime.
- For servings: accept strings like "4 servings", "8-10", or arrays like ["8"]. Pick the primary integer.
- For tags: pull from recipeCategory / recipeCuisine / keywords (comma- or array-separated) and any visible descriptors (e.g. "vegetarian", "quick", "Italian"). Cap at 6 short tags. Lowercase, no punctuation. Empty array if none.
- For videoUrl: if the source has a schema.org VideoObject (often inside the Recipe's "video" field), return its embedUrl, contentUrl, or url — in that order of preference. Skip the entry if all of those are missing or empty. Do not invent a URL.
- For steps: pull from JSON-LD recipeInstructions (HowToStep "text" or "name", or HowToSection items). If JSON-LD is missing, fall back to the visible numbered/ordered list on the page. Return an array of short strings, one per step, in order. Strip leading numbers like "1." or "Step 1:". Cap at 30 steps. Empty array if none.

Return JSON:
{
  "name": "recipe name or null",
  "ingredients": [{"name": "clean grocery name", "qty": "amount with unit, or null"}],
  "notes": "brief description or prep note (max 200 chars), or null",
  "prepTime":  "prep time only, short string e.g. '15 min', or null",
  "cookTime":  "cook time only, short string e.g. '30 min', or null",
  "totalTime": "total time (prep+cook), short string e.g. '45 min', or null. If the source gives only one time, put it here.",
  "servings":  integer number of servings or null,
  "tags": ["array of short lowercase strings (max 6) from recipeCategory/recipeCuisine/keywords; empty array if none"],
  "videoUrl": "URL to the recipe video (YouTube embed, Vimeo, or direct mp4), or null",
  "steps": ["array of step instructions in order; empty array if none"],
  "error": "reason if no recipe at all, else null"
}
If multiple recipes appear, extract the primary or most prominent one. Extract as much as is visible even if some fields are incomplete. Return only valid JSON, nothing else.`;

const EVENTS_PROMPT = (contextDate, userContext) =>
  `Extract all calendar events from this image. Today is ${contextDate}.

${userContext ? `USER-PROVIDED CONTEXT (TRUST THIS — IT OVERRIDES YOUR GUESSES):
"${userContext}"

If the user states a month, year, or date range in this context, USE IT directly. Do not mark monthUncertain when user context resolves the month. If the user says the calendar spans two months, assign each day number to the correct month based on their range (e.g. days 25-30 in the first month, days 1-15 in the second).

` : ''}CALENDAR READING RULES:
- The image may show a printed, handwritten, or school-style calendar — often colorful, dense, or missing a clear month/year label.
- If two months appear on the page, extract events from both — the calendar likely spans a month boundary, with later day numbers (25, 26...) belonging to the earlier month and lower day numbers (1, 2...) belonging to the later month.
- To determine the month: ${userContext ? 'first use the user-provided context above. If still unclear, ' : ''}look for any month name anywhere on the page (headers, footers, small print, watermarks). If absent, use today (${contextDate}) as the anchor and assign day numbers to the nearest upcoming month that makes sense — prefer future dates over past.
- Day cells may contain handwriting, stickers, colored text, or small annotations — read ALL text in each cell, not just large or clearly printed text.
- Ignore purely decorative elements (borders, clip art, school logos) but capture every day cell that has any text beyond just the day number.
- For events with no year shown, use the year that makes the date upcoming or within the next 12 months.
- For events with no time shown, set allDay: true.
- Do not merge or summarize — create one event entry per unique day-cell occurrence.

CONFIDENCE RULES:
- confidence: "high" = clearly printed or typed event name; "medium" = handwritten, partially obscured, or abbreviated; "low" = barely visible, cut off, or guessed from context.
- dateConfidence: "high" = month name clearly visible on the image OR provided by user context; "medium" = month inferred from adjacent months or partial label; "low" = month was assumed because nothing was visible.

MONTH UNCERTAINTY:
- If the user provided a clear month/range in their context, set monthUncertain: false (their context resolves it).
- If the month was NOT clearly labeled anywhere on the image AND no user context, set monthUncertain: true and provide your best guess as assumedMonth (e.g. "May 2026").
- If the month WAS clearly visible, set monthUncertain: false and assumedMonth: null.

Return JSON:
{
  "events": [
    {
      "name": "event name",
      "date": "YYYY-MM-DD",
      "time": "HH:MM or null",
      "allDay": true,
      "notes": "extra detail or null",
      "confidence": "high|medium|low",
      "dateConfidence": "high|medium|low"
    }
  ],
  "monthUncertain": false,
  "assumedMonth": null
}
If no events found, return {"events": [], "monthUncertain": false, "assumedMonth": null}. Return only valid JSON, nothing else.`;

const SCHOOL_LUNCH_PROMPT = (contextDate, userContext = '') =>
  `Extract the school lunch menu. Today is ${contextDate}.
${userContext ? `\nUSER-PROVIDED CONTEXT (use this to identify the school, month, or year): "${userContext}"\n` : ''}
MENU READING RULES:
- The source may be a PDF, a photo of a printout, or a column-style table (Mon–Fri layout).
- Date formats vary widely: "Monday April 28", "4/28", "Week of April 28", or just weekday column headers with no explicit dates.
- For column-based menus with a "Week of [date]" or "Week of [Monday's date]" header, calculate each weekday's full date from that Monday anchor (Mon = +0, Tue = +1, Wed = +2, Thu = +3, Fri = +4).
- If no year is shown, use whichever school semester is next from today (${contextDate}).
- Each day may have a main option and an alternative — capture both if present; set lunch2: null if only one option.
- Skip days with no lunch listed (holidays, breaks, no school).
- If you had to guess or assume the month or year (not clearly labeled), set monthUncertain: true and provide assumedMonth (e.g. "May 2026").

CONFIDENCE RULES:
- confidence per day: "high" = clearly printed text; "medium" = partially legible or abbreviated; "low" = blurry, guessed, or reconstructed.

Return JSON:
{
  "days": [
    {"date": "YYYY-MM-DD", "lunch1": "main option", "lunch2": "second option or null", "confidence": "high|medium|low"}
  ],
  "monthUncertain": false,
  "assumedMonth": null
}
Include only days that have at least one lunch entry. Return only valid JSON, nothing else.`;

const PARSE_EVENT_PROMPT = (text, contextDate) =>
  `Parse this text as a calendar event. Today is ${contextDate}.
Input: "${text.replace(/"/g, '\\"')}"

Interpret natural language freely. Examples:
- "dentist Thursday 3pm" → next Thursday at 15:00
- "soccer tournament May 10 all day" → May 10, allDay: true
- "book club next Tuesday at 7" → next Tuesday at 19:00
- "mom's birthday April 2" → April 2, allDay: true

Return JSON:
{
  "name": "event name or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM (24h) or null",
  "allDay": true or false or null,
  "notes": "any extra context or null",
  "error": "explanation if completely unparseable as an event, else null"
}
Return only valid JSON, nothing else.`;

const TASK_SCAN_PROMPT = (contextDate, userContext = '') =>
  `${userContext ? `USER-PROVIDED CONTEXT: "${userContext}"\n\n` : ''}Extract all actionable tasks from this document or image. Today is ${contextDate}.

DOCUMENT TYPES — handle all of these:
- Homework / assignment sheets: readings, projects, worksheets with due dates
- Permission slips: what needs to be signed, returned, or paid and by when
- School newsletters or flyers: RSVPs, forms to return, items to bring
- Medical / appointment follow-up forms: tasks to complete before next visit
- Chore charts, to-do lists, reminder notes: anything written as a task
- Any other document where someone needs to DO something by a date

FOR EACH TASK:
- name: clear, actionable description — include who it's for and what it is (e.g. "Sign permission slip — Science Museum trip", "Read Chapter 4", "Return immunization form to office")
- dueDate: deadline in YYYY-MM-DD — calculate relative dates ("next Monday", "by Friday") from today (${contextDate}); null if no date is visible anywhere on the document
- notes: subject name, grade, additional instructions, or who the task is for (null if none)
- confidence: "high" = clearly stated task with name and action; "medium" = implied task or ambiguous wording; "low" = guessed from context or partially illegible
- Include ALL action items even when the due date is missing — do not filter out undated tasks

Return JSON:
{
  "tasks": [
    {"name": "task description", "dueDate": "YYYY-MM-DD or null", "notes": "context or null", "confidence": "high|medium|low"}
  ]
}
If no actionable tasks are found, return {"tasks": []}. Return only valid JSON, nothing else.`;

const PHOTO_TO_LIST_PROMPT = (userContext = '') => `${userContext ? `USER-PROVIDED CONTEXT: "${userContext}"\n\n` : ''}Extract items for a shopping list from this photo. For each item, also assign a shopping category.

PHOTO TYPES:
- Fridge / pantry / kitchen storage: identify items that appear low, nearly empty, or absent — these are what needs to be bought.
- Handwritten or printed shopping list: extract the written items directly.
- Whiteboard list: read all items written on it.
- Grocery receipt: extract the purchased items (useful for building a recurring staples list).
- Other / unclear: return {"items": []}.

CATEGORIES: ${CATEGORY_STR}

FOR EACH ITEM:
- name: specific and descriptive (e.g. "whole milk" not "milk", "sharp cheddar" not "cheese")
- category: one of the categories above — pick the best fit
- confidence: "high" = clearly visible and readable; "medium" = partially visible or inferred; "low" = guessed from blurry or cut-off text

Return JSON: {"items": [{"name": "item name", "category": "category", "confidence": "high|medium|low"}]}
Aim for 3–20 items. Return only valid JSON, nothing else.`;

const SCAN_PROMPT = (contextDate, userContext = '') =>
  `${userContext ? `USER-PROVIDED CONTEXT (TRUST THIS — it overrides your guesses): "${userContext}"\n\n` : ''}Analyze this image carefully and extract ALL of the following that are present:
1. Calendar events (appointments, activities, school events)
2. Actionable tasks (things someone needs to do, sign, return, or pay)
3. School lunch menu entries (daily lunch options)

Today is ${contextDate}.

EVENTS — extract from any calendar, schedule, or event list:
- name: event description. date: YYYY-MM-DD. time: HH:MM or null. allDay: true/false. notes: extra detail or null.
- dateConfidence: "high" = month clearly labeled; "medium" = inferred from context; "low" = guessed.

TASKS — extract from homework sheets, permission slips, newsletters, reminder notes, chore charts:
- name: clear actionable description including who and what. dueDate: YYYY-MM-DD or null. notes: subject/context or null.

LUNCH — extract from any school lunch menu or meal schedule:
- date: YYYY-MM-DD. lunch1: main option (required). lunch2: alternate option or null.

For ALL items: confidence = "high" (clearly readable), "medium" (partially visible or abbreviated), "low" (guessed or blurry).

MONTH UNCERTAINTY: If the month was not clearly labeled on the image, set monthUncertain: true and provide assumedMonth (e.g. "May 2026"). If clearly visible, set monthUncertain: false and assumedMonth: null.

Return JSON:
{
  "events": [{"name": "string", "date": "YYYY-MM-DD", "time": "HH:MM or null", "allDay": true, "notes": "string or null", "confidence": "high|medium|low", "dateConfidence": "high|medium|low"}],
  "tasks": [{"name": "string", "dueDate": "YYYY-MM-DD or null", "notes": "string or null", "confidence": "high|medium|low"}],
  "lunch": [{"date": "YYYY-MM-DD", "lunch1": "string", "lunch2": "string or null", "confidence": "high|medium|low"}],
  "monthUncertain": false,
  "assumedMonth": null
}
If a category has nothing, return an empty array for that key. Return only valid JSON, nothing else.`;

const SUGGEST_PROMPT = (pantry) => `You are helping a family decide what to make for dinner tonight.

INPUT — what they have on hand (or what they're craving):
"${pantry}"

Return 3-5 recipe ideas that match. For each:
- Use ingredients from the input where possible.
- Suggest realistic family-friendly meals (no five-Michelin-star techniques).
- Tag with cuisine / cook style descriptors.

Return JSON:
{
  "suggestions": [
    {
      "name": "recipe name",
      "description": "1-2 sentence summary including approximate cook time",
      "tags": ["array of 2-4 short lowercase tags"]
    }
  ]
}
Return only valid JSON, nothing else.`;

const EMAIL_PROMPT = (subject, contextDate) =>
  `Extract calendar events from this email. Today is ${contextDate}. Subject: "${subject.replace(/"/g, '\\"')}"

EVENT EXTRACTION RULES:
- Extract real events: appointments, games, practices, meetings, performances, trips, school events, parties, etc.
- A single email may contain multiple events (e.g. a monthly newsletter, a sports schedule digest, a school calendar).
- IGNORE: promotional offers, order confirmations, shipping notices, unsubscribe footers, account alerts.
- For relative dates ("Monday May 5", "next Thursday", "this Saturday"), calculate the exact date from today (${contextDate}).
- If a time range is given (e.g. "6–8pm"), use the start time.
- confidence: "high" = date and event name explicitly stated; "medium" = inferred or approximate; "low" = guessed from vague language.

Return JSON:
{
  "events": [
    {"name": "string", "date": "YYYY-MM-DD", "time": "HH:MM or null", "allDay": boolean, "notes": "string or null", "confidence": "high|medium|low"}
  ]
}
If no real events found, return {"events": []}. Return only valid JSON, nothing else.

Email content:`;

// ── Shared helpers ─────────────────────────────────────────────────────────────

function jsonOk(data, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(msg, status, corsHeaders) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanHtml(html) {
  // Preserve JSON-LD structured data — recipe sites (Budget Bytes, AllRecipes,
  // Food Network, etc.) expose schema.org Recipe metadata via
  // <script type="application/ld+json"> which has prepTime / cookTime / yield /
  // nutrition etc. in machine-readable form. Stripping it before the LLM sees
  // the page would force Claude to reverse-engineer those fields from prose.
  const jsonLdBlocks = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    const body = m[1].trim();
    if (body) jsonLdBlocks.push(body);
  }
  const jsonLdPrefix = jsonLdBlocks.length
    ? `JSON-LD STRUCTURED DATA (machine-readable; use these fields when present):\n${jsonLdBlocks.join('\n---\n').slice(0, 8000)}\n\nPAGE TEXT:\n`
    : '';

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15000);

  return jsonLdPrefix + cleaned;
}

// Retries on HTTP 529 (overloaded) up to 3 times with exponential backoff.
async function callClaude(messages, env, maxTokens = 1024) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages }),
      });
      if (res.status === 529) { lastErr = new Error('Claude overloaded'); continue; }
      if (!res.ok) throw new Error(`Claude API ${res.status}`);
      const data = await res.json();
      return data.content?.[0]?.text?.trim() || '';
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Strips markdown code fences Claude sometimes wraps around JSON.
function parseJson(raw) {
  return JSON.parse(raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim());
}

function imageContent(base64, mediaType) {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

function documentContent(base64, mediaType) {
  return { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ── iCal parser ────────────────────────────────────────────────────────────────

function parseIcal(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let evt = null;

  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') { evt = {}; continue; }
    if (raw === 'END:VEVENT') {
      if (evt?.name && evt?.date) events.push(evt);
      evt = null;
      continue;
    }
    if (!evt) continue;

    const col = raw.indexOf(':');
    if (col === -1) continue;
    const propFull = raw.slice(0, col);
    const val = raw.slice(col + 1)
      .replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
    const prop = propFull.split(';')[0].toUpperCase();
    const params = Object.fromEntries(
      propFull.split(';').slice(1)
        .map(p => p.split('='))
        .filter(p => p.length === 2)
        .map(([k, v]) => [k.toUpperCase(), v])
    );

    switch (prop) {
      case 'SUMMARY':     evt.name = val; break;
      case 'DESCRIPTION': evt.notes = val.slice(0, 200) || undefined; break;
      case 'RRULE':       evt._hasRrule = true; break;
      case 'DTSTART': {
        const v = val.replace('Z', '');
        if (params.VALUE === 'DATE' || v.length === 8) {
          evt.date = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
          evt.allDay = true;
        } else {
          evt.date = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
          evt.time = `${v.slice(9,11)}:${v.slice(11,13)}`;
          evt.allDay = false;
        }
        break;
      }
      case 'DTEND': {
        const v = val.replace('Z', '');
        evt.endDate = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
        break;
      }
    }
  }

  const now = todayIso();
  const cutoff = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const hadRecurring = events.some(e => e._hasRrule);
  const filtered = events
    .filter(e => e.date >= now && e.date <= cutoff)
    .map(({ _hasRrule, ...e }) => e);

  return { events: filtered, hadRecurring };
}

// ── fetch handlers ─────────────────────────────────────────────────────────────

async function handleCategorize(itemName, env, corsHeaders) {
  if (!itemName || typeof itemName !== 'string') return jsonOk({ category: 'Other' }, corsHeaders);

  const prompt = `Categorize this shopping item into exactly one of: ${CATEGORY_STR}.
Item: "${itemName}"
Reply with only the category name, nothing else.`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], env, 20);
    const category = CATEGORY_SET.has(raw) ? raw : 'Other';
    return jsonOk({ category }, corsHeaders);
  } catch {
    return jsonOk({ category: 'Other' }, corsHeaders);
  }
}

async function handleCleanList(input, env, corsHeaders) {
  const items = Array.isArray(input?.items) ? input.items.filter(i => i && i.id && i.name) : [];
  if (items.length === 0) return jsonOk({ items: [] }, corsHeaders);

  const itemsForPrompt = items.map(i => ({
    id: i.id,
    name: i.name,
    qty: i.qty || null,
    category: i.category || null,
  }));

  const prompt = `You are tidying up a shopping list. Each item has an id, name, qty, and current category.

Categories: ${CATEGORY_STR}

DO THREE THINGS:
1. Find duplicates (same grocery SKU under different names) and merge them — keep one id, drop the others.
2. Strip prep modifiers from names: "black pepper (freshly cracked)" → "black pepper", "garlic, minced" → "garlic", "freshly grated parmesan" → "parmesan", parentheticals removed.
3. Re-categorize items with wrong, missing, or "Other" categories.

DUPLICATE MATCHING:
- "olive oil" matches "extra virgin olive oil" — same SKU.
- "black pepper" matches "black pepper (freshly cracked)" — same SKU.
- "tomatoes" does NOT match "diced tomatoes" — fresh vs canned.
- "chicken breast" matches "boneless skinless chicken breast" — same product.
- Be tolerant of pluralization ("onion" = "onions") and case.

QTY MERGING (when combining duplicates):
- Same units → sum: "2 cups" + "1 cup" = "3 cups".
- Compatible units → convert + sum: "1 lb" + "8 oz" = "1.5 lb".
- Incompatible → join with " + ": "2 cups + 1 lb".
- Numbers only → sum: "2" + "3" = "5".

INPUT ITEMS:
${JSON.stringify(itemsForPrompt)}

Return the FINAL list. Use existing item IDs for kept items. For merged dupes, keep one id and drop the others (omit them from the result entirely). Use exact category names from the categories list above.

{
  "items": [
    {"id": "existing-id", "name": "clean grocery name", "qty": "merged qty or null", "category": "category name"}
  ]
}

Reply with valid JSON only.`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], env, 2048);
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed.items)) {
      return jsonOk({ items: itemsForPrompt }, corsHeaders);
    }
    const sanitized = parsed.items
      .filter(it => it && it.id && it.name)
      .map(it => ({
        id: it.id,
        name: String(it.name).slice(0, 120),
        qty: it.qty ? String(it.qty).slice(0, 60) : null,
        category: CATEGORY_SET.has(it.category) ? it.category : null,
      }));
    return jsonOk({ items: sanitized }, corsHeaders);
  } catch {
    return jsonOk({ items: itemsForPrompt }, corsHeaders);
  }
}

async function handleDedupIngredients(input, env, corsHeaders) {
  const existing = Array.isArray(input?.existing) ? input.existing : [];
  const incoming = Array.isArray(input?.incoming) ? input.incoming.filter(i => i && i.name) : [];
  if (incoming.length === 0) return jsonOk({ toAdd: [], toUpdate: [] }, corsHeaders);

  const existingForPrompt = existing.map(e => ({ id: e.id, name: e.name, qty: e.qty || null }));
  const incomingForPrompt = incoming.map(i => ({ name: i.name, qty: i.qty || null }));

  const prompt = `You are deduplicating a shopping list. Match new items to existing items where they refer to the same grocery product.

MATCHING RULES:
- Match if same grocery SKU, ignoring prep instructions ("freshly cracked", "diced", "minced", parentheticals, leading adjectives like "freshly", "finely").
- "black pepper" matches "black pepper (freshly cracked)" — same product.
- "garlic" matches "garlic, minced" — same product.
- "olive oil" matches "olive oil, extra virgin" — same product.
- "tomatoes" does NOT match "diced tomatoes" — fresh vs canned, different SKU.
- "chicken breast" matches "boneless skinless chicken breast" — same product.
- Be case-insensitive and tolerant of pluralization ("onion" = "onions").

QUANTITY MERGING (for matches):
- Same units → sum: "2 cups" + "1 cup" = "3 cups".
- Compatible units → convert + sum: "1 lb" + "8 oz" = "1.5 lb".
- Incompatible → join with " + ": "2 cups + 1 lb".
- Numbers only → sum: "2" + "3" = "5".
- Use natural plurals.

OUTPUT:
- For each new item that matches an existing item, add to "toUpdate" with the existing item's id and the merged qty.
- For each new item that does NOT match, add to "toAdd" with the cleaned grocery name (no prep, no parentheticals) and qty.
- Never duplicate within incoming itself — if two new items match each other and not an existing item, combine them and add once.

EXISTING ITEMS:
${JSON.stringify(existingForPrompt)}

NEW ITEMS:
${JSON.stringify(incomingForPrompt)}

Return JSON:
{
  "toAdd": [{"name": "clean grocery name", "qty": "merged qty or null"}],
  "toUpdate": [{"id": "existing item id", "qty": "merged qty"}]
}
Reply with valid JSON only, no explanation.`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], env, 1024);
    const parsed = parseJson(raw);
    return jsonOk({
      toAdd: Array.isArray(parsed.toAdd) ? parsed.toAdd : [],
      toUpdate: Array.isArray(parsed.toUpdate) ? parsed.toUpdate : [],
    }, corsHeaders);
  } catch {
    return jsonOk({
      toAdd: incoming.map(i => ({ name: i.name, qty: i.qty || null })),
      toUpdate: [],
    }, corsHeaders);
  }
}

async function handleMergeQty(input, env, corsHeaders) {
  const name = input?.name || '';
  const qtys = Array.isArray(input?.qtys) ? input.qtys.filter(q => q && typeof q === 'string') : [];
  if (qtys.length === 0) return jsonOk({ qty: null }, corsHeaders);
  if (qtys.length === 1) return jsonOk({ qty: qtys[0] }, corsHeaders);

  const prompt = `You are combining shopping list quantities for the same item. Item: "${name}". Quantities to combine: ${JSON.stringify(qtys)}.

Rules:
- If the units match (e.g. "2 cups" + "1 cup"), sum them: "3 cups".
- If units are compatible (e.g. "1 lb" + "8 oz"), convert and sum to the larger unit: "1.5 lb".
- If units are incompatible (e.g. "2 cups" + "1 lb"), keep separate joined with "+": "2 cups + 1 lb".
- If a quantity is just a number (e.g. "2" + "3"), sum it: "5".
- Use natural plural/singular ("1 cup" vs "2 cups").
- Strip leading zeros and unnecessary decimals.

Reply with ONLY the combined quantity string, no quotes, no explanation. Maximum 30 characters.`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], env, 30);
    const cleaned = (raw || '').trim().replace(/^["']|["']$/g, '').slice(0, 60);
    return jsonOk({ qty: cleaned || qtys.join(' + ') }, corsHeaders);
  } catch {
    return jsonOk({ qty: qtys.join(' + ') }, corsHeaders);
  }
}

// Realistic browser UA — bare-bones UAs get blocked by TikTok / Instagram / etc.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isTikTokUrl(url) {
  return /(?:^|[./])tiktok\.com|^https?:\/\/(?:vm|vt)\.tiktok\.com/i.test(url);
}

// Server-side image fetch + base64 encode. Returns { imageData, imageMediaType }
// or { imageData: null, imageMediaType: null } on any failure. Caps at 5 MB
// raw to avoid runaway responses. Used so the client can store the image as a
// permanent data URL without doing a separate (CORS-prone) browser fetch.
async function fetchImageAsBase64(url) {
  const NULL_RESULT = { imageData: null, imageMediaType: null };
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return NULL_RESULT;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return NULL_RESULT;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5 * 1024 * 1024) return NULL_RESULT;
    const mediaType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mediaType.startsWith('image/')) return NULL_RESULT;
    const bytes = new Uint8Array(buf);
    // Chunked base64 — String.fromCharCode.apply blows the stack on long arrays.
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return { imageData: btoa(binary), imageMediaType: mediaType };
  } catch {
    return NULL_RESULT;
  }
}

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractMetadata(html) {
  const result = { title: '', description: '', ogTitle: '', ogDescription: '', ogImage: '' };
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (titleMatch) result.title = decodeEntities(titleMatch[1].trim());
  const metaTags = html.match(/<meta[^>]+>/gi) || [];
  for (const tag of metaTags) {
    const propMatch = /(?:property|name)=["']([^"']+)["']/i.exec(tag);
    const contentMatch = /content=["']([^"']+)["']/i.exec(tag);
    if (!propMatch || !contentMatch) continue;
    const prop = propMatch[1].toLowerCase();
    const content = decodeEntities(contentMatch[1]);
    if (prop === 'description') result.description = content;
    else if (prop === 'og:title') result.ogTitle = content;
    else if (prop === 'og:description') result.ogDescription = content;
    else if (prop === 'og:image') result.ogImage = content;
  }
  return result;
}

function extractTikTokRehydrationData(html) {
  // TikTok injects __UNIVERSAL_DATA_FOR_REHYDRATION__ for client-side hydration.
  // It contains the full caption, hashtags, music, and author info.
  const match = html.match(/<script[^>]*id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const itemStruct = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!itemStruct) return null;
    const desc = itemStruct.desc || '';
    const author = itemStruct.author?.nickname || itemStruct.author?.uniqueId || '';
    const challenges = (itemStruct.challenges || []).map(c => `#${c.title}`).filter(Boolean).join(' ');
    const music = itemStruct.music?.title || '';
    if (!desc && !challenges && !author) return null;
    return {
      title: desc.split(/[.!?\n]/)[0].slice(0, 100).trim(),
      thumbnailUrl: itemStruct.video?.cover || itemStruct.video?.originCover || '',
      text: [
        desc && `Caption: ${desc}`,
        challenges && `Hashtags: ${challenges}`,
        author && `Author: ${author}`,
        music && `Music: ${music}`,
      ].filter(Boolean).join('\n'),
    };
  } catch {
    return null;
  }
}

async function fetchTikTokOembed(url) {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || (!data.title && !data.author_name)) return null;
    return {
      title: (data.title || '').split(/[.!?\n]/)[0].slice(0, 100).trim(),
      thumbnailUrl: data.thumbnail_url || '',
      text: [
        data.title && `Caption: ${data.title}`,
        data.author_name && `Author: ${data.author_name}`,
      ].filter(Boolean).join('\n'),
    };
  } catch {
    return null;
  }
}

async function extractTikTokContent(url) {
  // Try the page first for the richest data (rehydration JSON has full caption + hashtags).
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (res.ok) {
      const html = await res.text();
      const fromRehydration = extractTikTokRehydrationData(html);
      if (fromRehydration && fromRehydration.text) return fromRehydration;
      const meta = extractMetadata(html);
      if (meta.ogDescription || meta.ogTitle) {
        return {
          title: (meta.ogTitle || '').split(/[.!?\n]/)[0].slice(0, 100).trim(),
          text: [
            meta.ogTitle && `Title: ${meta.ogTitle}`,
            meta.ogDescription && `Description: ${meta.ogDescription}`,
            meta.description && `Meta description: ${meta.description}`,
          ].filter(Boolean).join('\n'),
        };
      }
    }
  } catch { /* fall through to oEmbed */ }
  // Fallback: oEmbed endpoint (caption may be truncated).
  return await fetchTikTokOembed(url);
}

async function handleUrl(input, env, corsHeaders) {
  // Accept either a string URL (legacy) or { url, context } (new — matches
  // handleScreenshot / handleSchoolLunch / handleCalendarPhoto / handleTaskScan
  // which all thread an optional userContext into their prompts).
  const url = typeof input === 'string' ? input : input?.url;
  const userContext = (typeof input === 'object' && typeof input?.context === 'string')
    ? input.context.slice(0, 500).trim()
    : '';
  if (!url || typeof url !== 'string') return jsonError('No URL provided', 400, corsHeaders);

  // Always echo URL back so the client preserves it even on parse failure.
  // Use null (not '') for fields the client checks truthy-falsy on.
  const partialResp = (extras = {}) => jsonOk({ url, name: '', ingredients: [], notes: null, ...extras }, corsHeaders);

  let extractedText = '';
  let fallbackTitle = '';
  let ogImage = '';

  if (isTikTokUrl(url)) {
    const tt = await extractTikTokContent(url);
    if (tt) { extractedText = tt.text; fallbackTitle = tt.title; ogImage = tt.thumbnailUrl || ''; }
  }

  if (!extractedText) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const meta = extractMetadata(html);
      fallbackTitle = fallbackTitle || meta.ogTitle || meta.title || '';
      ogImage = ogImage || meta.ogImage || '';
      const metaText = [
        meta.title && `Title: ${meta.title}`,
        meta.ogTitle && meta.ogTitle !== meta.title && `og:title: ${meta.ogTitle}`,
        meta.ogDescription && `og:description: ${meta.ogDescription}`,
        meta.description && meta.description !== meta.ogDescription && `description: ${meta.description}`,
      ].filter(Boolean).join('\n');
      extractedText = metaText ? `${metaText}\n---\n${cleanHtml(html)}` : cleanHtml(html);
    } catch {
      // Fetch failed entirely — return URL only so the client preserves it.
      return partialResp();
    }
  }

  if (!extractedText) return partialResp({ name: fallbackTitle });

  try {
    // 2048 tokens — RECIPE_PROMPT asks for up to 10 fields plus ingredient
    // array; long recipes (15-20 ingredients) blow past 1024 and the JSON gets
    // truncated mid-array, which makes parseJson throw and silently fall back
    // to the partial response. Doubling the budget removes the truncation.
    const raw = await callClaude([{
      role: 'user',
      content: `${RECIPE_PROMPT(userContext)}\n\nSource URL: ${url}\n\nPage content:\n${extractedText}`,
    }], env, 2048);
    const parsed = parseJson(raw);
    const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
    const name = parsed.name || fallbackTitle || '';
    const notes = parsed.notes || null;
    // Even when the AI says "not a recipe", we keep the URL + any title we found.
    if (parsed.error && !ingredients.length && !parsed.name) {
      return partialResp({ name: fallbackTitle });
    }
    // Server-side image proxy: download the og:image here so the client
    // stores a permanent data URL instead of a time-signed CDN URL that
    // will expire (TikTok, Instagram, etc.). Best-effort — fall back to the
    // raw URL on any failure.
    const { imageData, imageMediaType } = await fetchImageAsBase64(ogImage);
    return jsonOk({
      url,
      name,
      ingredients,
      notes,
      imageUrl:       ogImage,
      imageData,
      imageMediaType,
      prepTime:   parsed.prepTime   || null,
      cookTime:   parsed.cookTime   || null,
      totalTime:  parsed.totalTime  || null,
      servings:   parsed.servings   || null,
      tags:       Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).filter(t => typeof t === 'string' && t.trim()) : [],
      videoUrl:   typeof parsed.videoUrl === 'string' && parsed.videoUrl.startsWith('http') ? parsed.videoUrl : null,
      steps:      Array.isArray(parsed.steps) ? parsed.steps.slice(0, 30).map(s => String(s || '').trim()).filter(Boolean) : [],
    }, corsHeaders);
  } catch {
    return partialResp({ name: fallbackTitle });
  }
}

async function handleScreenshot(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const userContext = (input.context && typeof input.context === 'string') ? input.context.slice(0, 500).trim() : '';
  try {
    // 2048 tokens for the same reason as handleUrl — long recipes truncate at 1024.
    const raw = await callClaude([{
      role: 'user',
      content: [imageContent(input.base64, input.mediaType), { type: 'text', text: RECIPE_PROMPT(userContext) }],
    }], env, 2048);
    const parsed = parseJson(raw);
    if (parsed.error) {
      // Include the empty-but-typed scalar/array fields so the client's
      // `data.name || ''` / `data.ingredients?.length` style consumption
      // doesn't blow up before reaching the error guard. Matches the
      // happy-path shape minus the actual values.
      return jsonOk({
        error: parsed.error,
        name: '',
        ingredients: [],
        notes: null,
        url: null,
      }, corsHeaders);
    }
    return jsonOk({
      name: parsed.name || '',
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      notes: parsed.notes || '',
      url: null,
      prepTime:   parsed.prepTime   || null,
      cookTime:   parsed.cookTime   || null,
      totalTime:  parsed.totalTime  || null,
      servings:   parsed.servings   || null,
      tags:       Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).filter(t => typeof t === 'string' && t.trim()) : [],
      videoUrl:   typeof parsed.videoUrl === 'string' && parsed.videoUrl.startsWith('http') ? parsed.videoUrl : null,
      steps:      Array.isArray(parsed.steps) ? parsed.steps.slice(0, 30).map(s => String(s || '').trim()).filter(Boolean) : [],
    }, corsHeaders);
  } catch {
    return jsonError('Could not extract recipe', 500, corsHeaders);
  }
}

async function handleSchoolLunch(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No file provided', 400, corsHeaders);

  const today = input.contextDate || todayIso();
  const userContext = (input.context && typeof input.context === 'string') ? input.context.slice(0, 500).trim() : '';
  const isPdf = input.mediaType === 'application/pdf' || input.mediaType?.includes('pdf');
  const contentBlock = isPdf
    ? documentContent(input.base64, input.mediaType)
    : imageContent(input.base64, input.mediaType);

  try {
    const raw = await callClaude([{
      role: 'user',
      content: [contentBlock, { type: 'text', text: SCHOOL_LUNCH_PROMPT(today, userContext) }],
    }], env, 2048);
    const parsed = parseJson(raw);
    const days = Array.isArray(parsed.days)
      ? parsed.days.filter(d => d.date && d.lunch1)
      : [];
    return jsonOk({
      days,
      monthUncertain: parsed.monthUncertain === true,
      assumedMonth: parsed.assumedMonth || null,
    }, corsHeaders);
  } catch {
    return jsonError('Could not extract lunch menu', 500, corsHeaders);
  }
}

async function handleCalendarPhoto(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  const userContext = (input.context && typeof input.context === 'string') ? input.context.slice(0, 500).trim() : '';
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: EVENTS_PROMPT(contextDate, userContext) },
      ],
    }], env, 2048);
    const parsed = parseJson(raw);
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter(e => e.name && e.date)
      : [];
    return jsonOk({
      events,
      monthUncertain: parsed.monthUncertain === true,
      assumedMonth: parsed.assumedMonth || null,
      // Calendar-photo events are one-shot (no RRULE in a photo); the client's
      // `data.hadRecurring || false` guard turns undefined into false, but
      // returning it explicitly documents the contract.
      hadRecurring: false,
    }, corsHeaders);
  } catch {
    return jsonError('Could not extract events', 500, corsHeaders);
  }
}

async function handleIcal(url, env, corsHeaders) {
  if (!url || typeof url !== 'string') return jsonError('No URL provided', 400, corsHeaders);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CalendarImporter/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const { events, hadRecurring } = parseIcal(text);
    return jsonOk({ events, hadRecurring }, corsHeaders);
  } catch {
    return jsonError('Could not fetch or parse that calendar URL', 400, corsHeaders);
  }
}

async function handleParseEvent(input, env, corsHeaders) {
  if (!input?.text || typeof input.text !== 'string') return jsonError('No text provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  try {
    const raw = await callClaude([{
      role: 'user',
      content: PARSE_EVENT_PROMPT(input.text, contextDate),
    }], env, 256);
    const parsed = parseJson(raw);
    if (parsed.error) return jsonOk({ error: parsed.error }, corsHeaders);
    if (!parsed.name || !parsed.date) return jsonOk({ error: 'Could not parse that as an event' }, corsHeaders);
    return jsonOk(parsed, corsHeaders);
  } catch {
    return jsonError('Could not parse event', 500, corsHeaders);
  }
}

async function handleTaskScan(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  const userContext = (input.context && typeof input.context === 'string') ? input.context.slice(0, 500).trim() : '';
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: TASK_SCAN_PROMPT(contextDate, userContext) },
      ],
    }], env, 1024);
    const parsed = parseJson(raw);
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter(t => t.name)
      : [];
    return jsonOk({ tasks }, corsHeaders);
  } catch {
    return jsonError('Could not extract tasks', 500, corsHeaders);
  }
}

async function handlePhotoToList(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const userContext = (input.context && typeof input.context === 'string') ? input.context.slice(0, 500).trim() : '';
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: PHOTO_TO_LIST_PROMPT(userContext) },
      ],
    }], env, 768);
    const parsed = parseJson(raw);
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter(i => i.name)
          .map(i => ({
            name: i.name,
            category: CATEGORY_SET.has(i.category) ? i.category : 'Other',
            confidence: i.confidence || 'high',
          }))
      : [];
    return jsonOk({ items }, corsHeaders);
  } catch {
    return jsonError('Could not identify items', 500, corsHeaders);
  }
}

async function handleRecipeSuggest(input, env, corsHeaders) {
  if (!input?.pantry || typeof input.pantry !== 'string') {
    return jsonError('No pantry input provided', 400, corsHeaders);
  }
  const pantry = input.pantry.slice(0, 500).trim();
  if (!pantry) return jsonError('No pantry input provided', 400, corsHeaders);
  try {
    const raw = await callClaude([{
      role: 'user',
      content: SUGGEST_PROMPT(pantry),
    }], env, 1024);
    const parsed = parseJson(raw);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter(s => s && s.name && s.description)
          .map(s => ({
            name: String(s.name).slice(0, 100),
            description: String(s.description).slice(0, 240),
            tags: Array.isArray(s.tags)
              ? s.tags.slice(0, 4).filter(t => typeof t === 'string' && t.trim())
              : [],
          }))
          .slice(0, 5)
      : [];
    return jsonOk({ suggestions }, corsHeaders);
  } catch {
    return jsonError('Could not generate suggestions', 500, corsHeaders);
  }
}

// Unified scan: one image → events + tasks + lunch in a single Claude call.
async function handleScan(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  const userContext = (input.context && typeof input.context === 'string') ? input.context.slice(0, 500).trim() : '';
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: SCAN_PROMPT(contextDate, userContext) },
      ],
    }], env, 4096);
    const parsed = parseJson(raw);
    return jsonOk({
      events: Array.isArray(parsed.events) ? parsed.events.filter(e => e.name && e.date) : [],
      tasks:  Array.isArray(parsed.tasks)  ? parsed.tasks.filter(t => t.name) : [],
      lunch:  Array.isArray(parsed.lunch)  ? parsed.lunch.filter(l => l.date && l.lunch1) : [],
      monthUncertain: parsed.monthUncertain === true,
      assumedMonth:   parsed.assumedMonth || null,
    }, corsHeaders);
  } catch {
    return jsonError('Could not scan image', 500, corsHeaders);
  }
}

// ── fetch export ───────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const HANDLERS = {
  categorize:        (input, env) => handleCategorize(input, env, CORS),
  mergeQty:          (input, env) => handleMergeQty(input, env, CORS),
  dedupIngredients:  (input, env) => handleDedupIngredients(input, env, CORS),
  cleanList:         (input, env) => handleCleanList(input, env, CORS),
  url:           (input, env) => handleUrl(input, env, CORS),
  screenshot:    (input, env) => handleScreenshot(input, env, CORS),
  schoolLunch:   (input, env) => handleSchoolLunch(input, env, CORS),
  calendarPhoto: (input, env) => handleCalendarPhoto(input, env, CORS),
  ical:          (input, env) => handleIcal(input, env, CORS),
  parseEvent:    (input, env) => handleParseEvent(input, env, CORS),
  taskScan:      (input, env) => handleTaskScan(input, env, CORS),
  homeworkScan:  (input, env) => handleTaskScan(input, env, CORS),   // backward compat alias
  photoToList:   (input, env) => handlePhotoToList(input, env, CORS),
  recipeSuggest: (input, env) => handleRecipeSuggest(input, env, CORS),
  scan:          (input, env) => handleScan(input, env, CORS),
};

// ── email export ───────────────────────────────────────────────────────────────

async function handleEmailMessage(message, env) {
  if (!env.CLAUDE_API_KEY || !env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return;

  const subject = message.headers.get('subject') || '(no subject)';
  const from = message.from || '';

  const reader = message.raw.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const buf = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) { buf.set(c, pos); pos += c.length; }
  const rawText = new TextDecoder().decode(buf).slice(0, 10000);

  const today = todayIso();
  try {
    const raw = await callClaude([{
      role: 'user',
      content: `${EMAIL_PROMPT(subject, today)}\n${rawText}`,
    }], env, 1024);
    const parsed = parseJson(raw);
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter(e => e.name && e.date)
      : [];
    if (events.length === 0) return;

    const entry = { from, subject, events, receivedAt: Date.now(), processed: false };
    // Trim any trailing slash on FIREBASE_DB_URL so the joined path doesn't
    // double-slash (e.g. https://x.firebaseio.com//rundown/...).
    const baseUrl = (env.FIREBASE_DB_URL || '').replace(/\/$/, '');
    await fetch(`${baseUrl}/rundown/emailImports.json?auth=${env.FIREBASE_DB_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Silent fail — never bounce an email
  }
}

// ── Push notifications ─────────────────────────────────────────────────────────

async function handlePush(input, env, corsHeaders, rawBodyText, authHeader) {
  const authed = await verifyPushAuth(authHeader, rawBodyText, env);
  if (!authed) {
    console.warn('[push] auth failed');
    return jsonError('Unauthorized', 401, corsHeaders);
  }

  const { personId, type, payload } = input || {};
  if (!personId || !type || !payload) {
    return jsonError('Missing personId, type, or payload', 400, corsHeaders);
  }

  // 1. Per-person pref filter
  let prefs;
  try {
    prefs = await fbGet(env, `people/${personId}/prefs/notifications`);
  } catch (err) {
    console.warn('[push] fbGet prefs failed', err.message);
    return jsonError('Firebase read failed', 500, corsHeaders);
  }
  if (!prefs || prefs.enabled === false) {
    return jsonOk({ sent: 0, removed: 0, errors: 0, skipped: 'pref-disabled' }, corsHeaders);
  }
  if (prefs.types && prefs.types[type] === false) {
    return jsonOk({ sent: 0, removed: 0, errors: 0, skipped: 'type-disabled' }, corsHeaders);
  }

  // 2 & 3. Fan out via shared helper
  let result;
  try {
    result = await fanoutPush(env, personId, payload);
  } catch (err) {
    console.warn('[push] fanoutPush failed', err.message);
    return jsonError('Firebase read failed', 500, corsHeaders);
  }
  return jsonOk(result, corsHeaders);
}

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

// ── Scheduled handler (cron-driven push) ──────────────────────────────────────

async function runScheduled(env, scheduledTimeMs) {
  const now = new Date(scheduledTimeMs);
  console.log('[scheduled] tick at', now.toISOString());

  // Housekeeping
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
    try {
      const todayUtcKey = now.toISOString().slice(0, 10);
      await dedupCleanup(env, todayUtcKey);
      console.log('[scheduled] dedup cleanup done');
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
  if (!people) {
    console.log('[scheduled] no people — skipping');
    return;
  }

  await runEventReminders(env, now, tz, people, events || {});
  await runTaskReminders(env, now, tz, people);
  await runDailyDigest(env, now, tz, people, events || {});
  await runPendingPushes(env, now);
}

async function runEventReminders(env, now, tz, people, events) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.eventReminders !== false
  );
  if (optedIn.length === 0) return;

  for (const [personId, person] of optedIn) {
    const leadMin = person.prefs.notifications.eventLeadMin || 15;
    const windowStart = new Date(now.getTime() + (leadMin - 2.5) * 60_000);
    const windowEnd   = new Date(now.getTime() + (leadMin + 2.5) * 60_000);

    // Quiet-hours gate (constant per person per tick — skip ALL their events)
    const qh = person.prefs?.notifications?.quietHours;
    if (qh && isInQuietHours(qh, hours, minutes)) {
      console.log('[scheduled] skipped (quiet hours)', personId, 'eventReminder');
      continue;
    }

    for (const [eventId, ev] of Object.entries(events)) {
      // Skip all-day events (no timed reminder).
      if (ev.allDay) continue;
      // Skip events not owned by this person.
      const people = Array.isArray(ev.people) ? ev.people : [];
      if (!people.includes(personId)) continue;
      if (!ev.date || !ev.startTime) continue;

      // Legacy: an older event schema may have stored `repeat` as a bare
      // string ('weekly'/'monthly'/etc.). The new format is always an
      // object. Skip those defensively rather than misclassify as non-recurring.
      if (ev.repeat && typeof ev.repeat === 'string' && ev.repeat !== 'none') continue;
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
        data:  { url: '/calendar.html', type: 'eventReminders', eventId, instanceDate, personId, snoozeCount: 0 },
        actions: [
          { action: 'snooze',  title: 'Snooze 5m' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      };
      try {
        const { sent, removed, errors } = await fanoutPush(env, personId, payload);
        await dedupMark(env, todayKey, dedupKey);
        console.log('[scheduled] eventReminder', personId, ev.name, instanceDate, { sent, removed, errors });
      } catch (err) {
        console.warn('[scheduled] eventReminder failed', personId, eventId, err.message);
      }
    }
  }
}

async function runTaskReminders(env, now, tz, people) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const nowMin = hours * 60 + minutes;

  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.taskReminders === true
  );
  if (optedIn.length === 0) return;

  // Only schedule entries for today are loaded — task reminders are about
  // "what's left for the rest of today," not next week.
  const [scheduleToday, completions] = await Promise.all([
    fbGet(env, `schedule/${todayKey}`).catch(() => null),
    fbGet(env, 'completions').catch(() => null),
  ]);
  if (!scheduleToday || typeof scheduleToday !== 'object') return;

  const completedKeys = new Set(Object.keys(completions || {}));

  for (const [personId, person] of optedIn) {
    // Default to 17:00 if the user toggled task reminders on but never touched
    // the time picker (the UI's input value is presentation-only; Firebase only
    // gets the field on `change`).
    const targetTime = person.prefs.notifications.taskReminderTime || '17:00';
    const [targetH, targetM] = targetTime.split(':').map(Number);
    const targetMin = targetH * 60 + targetM;
    if (isNaN(targetMin) || targetMin < 0 || targetMin >= 1440) continue;
    // Slack window: fire if |nowMin - targetMin| <= 2.5min.
    if (Math.abs(nowMin - targetMin) > 2.5) continue;

    const dedupKey = `task_${personId}`;
    if (await dedupCheck(env, todayKey, dedupKey)) continue;

    // Quiet-hours gate (time-triggered types only)
    const qh = person.prefs?.notifications?.quietHours;
    if (qh && isInQuietHours(qh, hours, minutes)) {
      console.log('[scheduled] skipped (quiet hours)', personId, 'taskReminder');
      continue;
    }

    // Count incomplete entries for this person today.
    const myEntries = Object.entries(scheduleToday).filter(
      ([_, entry]) => entry?.ownerId === personId
    );
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
      const { sent, removed, errors } = await fanoutPush(env, personId, payload);
      await dedupMark(env, todayKey, dedupKey);
      console.log('[scheduled] taskReminder', personId, { count: incomplete.length, sent, removed, errors });
    } catch (err) {
      console.warn('[scheduled] taskReminder failed', personId, err.message);
    }
  }
}

async function runDailyDigest(env, now, tz, people, events) {
  const todayKey = dateKeyInTz(now, tz);
  const { hours, minutes } = timeInTz(now, tz);
  const nowMin = hours * 60 + minutes;

  const optedIn = Object.entries(people).filter(([_, p]) =>
    p?.prefs?.notifications?.enabled === true
    && p?.prefs?.notifications?.types?.dailyDigest === true
  );
  if (optedIn.length === 0) return;

  // Schedule is read lazily — only if some person is in the digest window.
  let scheduleToday = null;

  for (const [personId, person] of optedIn) {
    // Default to 07:00 if the user toggled dailyDigest on but never touched
    // the time picker (the UI's input value is presentation-only; Firebase only
    // gets the field on `change`).
    const targetTime = person.prefs.notifications.digestTime || '07:00';
    const [targetH, targetM] = targetTime.split(':').map(Number);
    const targetMin = targetH * 60 + targetM;
    if (isNaN(targetMin) || targetMin < 0 || targetMin >= 1440) continue;
    if (Math.abs(nowMin - targetMin) > 2.5) continue;

    const dedupKey = `dgst_${personId}`;
    if (await dedupCheck(env, todayKey, dedupKey)) continue;

    // Quiet-hours gate (time-triggered types only)
    const qh = person.prefs?.notifications?.quietHours;
    if (qh && isInQuietHours(qh, hours, minutes)) {
      console.log('[scheduled] skipped (quiet hours)', personId, 'digest');
      continue;
    }

    if (!scheduleToday) scheduleToday = await fbGet(env, `schedule/${todayKey}`).catch(() => null);

    // Count this person's task entries for today
    const taskCount = scheduleToday
      ? Object.values(scheduleToday).filter(e => e?.ownerId === personId).length
      : 0;

    // Find this person's events for today (non-recurring, owned or shared)
    const myEvents = Object.values(events || {}).filter(ev => {
      if (ev.date !== todayKey) return false;
      const people = Array.isArray(ev.people) ? ev.people : [];
      return people.length === 0 || people.includes(personId);
    });
    const eventCount = myEvents.length;

    // Compose body
    const firstTimedEvent = myEvents
      .filter(e => !e.allDay && e.startTime)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
    let body;
    if (eventCount === 0 && taskCount === 0) {
      body = 'Nothing scheduled today.';
    } else {
      const parts = [];
      if (eventCount > 0) parts.push(`${eventCount} event${eventCount === 1 ? '' : 's'}`);
      if (taskCount > 0)  parts.push(`${taskCount} task${taskCount === 1 ? '' : 's'}`);
      body = parts.join(', ');
      if (firstTimedEvent) {
        body += `. First up: ${firstTimedEvent.name} at ${formatHhmm(firstTimedEvent.startTime)}.`;
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
      const { sent, removed, errors } = await fanoutPush(env, personId, payload);
      await dedupMark(env, todayKey, dedupKey);
      console.log('[scheduled] digest', personId, { eventCount, taskCount, sent, removed, errors });
    } catch (err) {
      console.warn('[scheduled] digest failed', personId, err.message);
    }
  }
}

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

function formatHhmm(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

// ── default export ─────────────────────────────────────────────────────────────

export default {
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
    if (type === 'action') {
      return handleAction(input, env, CORS, rawBodyText, request.headers.get('Authorization'));
    }
    const handler = HANDLERS[type];
    if (handler) return handler(input, env);

    return new Response(JSON.stringify({ error: 'Unknown type' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },

  async email(message, env, ctx) {
    ctx.waitUntil(handleEmailMessage(message, env));
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
};
