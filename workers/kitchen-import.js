// workers/kitchen-import.js — Kitchen import + auto-categorization Worker
// Deploy: wrangler deploy workers/kitchen-import.js
// Secrets (wrangler secret put):
//   CLAUDE_API_KEY        — required for all AI handlers
//   FIREBASE_DB_URL       — required for email handler only (e.g. https://project-default-rtdb.firebaseio.com)
//   FIREBASE_DB_SECRET    — required for email handler only (Firebase Database Secret from Project Settings → Service Accounts)

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LIST = [
  'Produce','Dairy','Meat & Seafood','Bakery','Frozen','Pantry',
  'Beverages','Snacks','Household','Personal Care','Baby & Kids',
  'Pets','Clothing','Electronics','Toys','Other'
].join(', ');

// ── Prompts ───────────────────────────────────────────────────────────────────

const RECIPE_PROMPT = `Extract recipe information. The source may be a recipe website, blog post, social media post, or photo of a recipe card — formats vary widely.
Return JSON:
{
  "name": "recipe name",
  "ingredients": [{"name": "ingredient name", "qty": "amount and unit or null"}],
  "notes": "brief description or prep note (optional, max 200 chars)"
}
If multiple recipes appear, extract the primary or most prominent one. Extract as much as is visible even if some fields are incomplete.
If there is no recipe at all, return {"error": "not a recipe"}.
Return only valid JSON, nothing else.`;

const EVENTS_PROMPT = (contextDate) =>
  `Extract all calendar events from this image. Today's date is ${contextDate}.

CALENDAR READING RULES:
- The image may show a printed, handwritten, or school-style calendar — often colorful, dense, or missing a clear month/year label.
- If two months appear on the page, extract events from both.
- To determine the month: look for any month name anywhere on the page (headers, footers, small print). If absent, use today (${contextDate}) as the anchor and assign day numbers to the nearest upcoming month that makes sense (prefer future dates over past).
- Day cells may contain handwriting, stickers, colored text, or small annotations — read ALL text in each cell, not just large/clear text.
- Ignore decorative elements (borders, clip art, logos) but capture every day cell that has any text beyond its day number.
- For events with no year shown, use the year that makes the date upcoming or within the next 12 months.
- For events with no time shown, set allDay: true.

If you had to guess or assume the month (i.e. it was not clearly labeled anywhere on the image), set monthUncertain: true and provide your best guess as assumedMonth (e.g. "May 2026"). If the month was clearly visible, set monthUncertain: false and assumedMonth: null.

Return JSON:
{
  "events": [{"name": "string", "date": "YYYY-MM-DD", "time": "HH:MM or null", "allDay": true/false, "notes": "string or null"}],
  "monthUncertain": false,
  "assumedMonth": null
}
If no events found, return {"events": [], "monthUncertain": false, "assumedMonth": null}. Return only valid JSON, nothing else.`;

const SCHOOL_LUNCH_PROMPT = (contextDate) =>
  `Extract the school lunch menu. Today is ${contextDate}.

MENU READING RULES:
- The source may be a PDF, photo of a printout, or a column-style table (Mon–Fri).
- Date formats vary: "Monday April 28", "4/28", "Week of April 28", or just weekday column headers.
- For column-based menus with a "Week of [date]" header, calculate each weekday's full date from that anchor.
- If no year is shown, use the upcoming school year (whichever semester is next from today).
- Each day may have one main option and one alternative — if only one, set lunch2: null.
- If you had to guess or assume the month/year (not clearly labeled), set monthUncertain: true and provide assumedMonth (e.g. "May 2026").

Return JSON:
{
  "days": [{"date": "YYYY-MM-DD", "lunch1": "main option", "lunch2": "second option or null"}],
  "monthUncertain": false,
  "assumedMonth": null
}
Include only days with lunch entries. Return only valid JSON, nothing else.`;

const PARSE_EVENT_PROMPT = (text, contextDate) =>
  `Parse this as a calendar event. Today is ${contextDate}.
Input: "${text.replace(/"/g, '\\"')}"
Interpret natural language freely: "dentist Thursday 3pm", "soccer tournament May 10 all day", "book club next Tuesday at 7".
Return JSON: {"name": "string", "date": "YYYY-MM-DD", "time": "HH:MM or null", "allDay": boolean, "notes": "string or null"}
If completely unparseable as an event, return {"error": "explanation"}.
Return only valid JSON, nothing else.`;

const HOMEWORK_PROMPT = (contextDate) =>
  `Extract homework assignments from this image. Today is ${contextDate}.

ASSIGNMENT READING RULES:
- The image may be a printed sheet, handwritten notebook page, whiteboard, or digital screenshot (e.g. Google Classroom).
- Look for assignments, readings, projects, or anything that needs to be completed and turned in.
- Due dates may appear as "Monday", "4/28", "May 2nd", "next week" — calculate the full date from today (${contextDate}) for relative dates.
- If no due date is visible for an assignment, set dueDate to null.
- Include the subject (Math, Reading, etc.) in notes if visible.
- Include ALL assignments even if the due date is unclear or missing.

Return JSON:
{
  "tasks": [{"name": "assignment description", "dueDate": "YYYY-MM-DD or null", "notes": "subject or extra info or null"}]
}
If no assignments found, return {"tasks": []}. Return only valid JSON, nothing else.`;

const PHOTO_TO_LIST_PROMPT =
  `Extract items for a shopping list from this photo.

PHOTO TYPES:
- Fridge/pantry/kitchen storage: identify items that appear low, nearly empty, or absent.
- Handwritten or printed shopping list: extract the written items directly.
- Whiteboard list: read all items written on it.
- Grocery receipt: extract the purchased items (useful for recurring staples).
- Other: return {"items": []}.

Return JSON: {"items": [{"name": "item name"}]}
Use specific names where visible (e.g. "whole milk" not just "milk"). Aim for 3–20 items.
Return only valid JSON, nothing else.`;

const EMAIL_PROMPT = (subject, contextDate) =>
  `Extract calendar events from this email. Today is ${contextDate}. Subject: "${subject.replace(/"/g, '\\"')}"

EVENT EXTRACTION RULES:
- Extract real events: appointments, games, practices, meetings, performances, trips, school events, etc.
- A single email may contain multiple events (e.g. a monthly newsletter, a sports schedule digest).
- Ignore promotional offers, order confirmations, shipping notices, and unsubscribe footers.
- For dates written as "Monday May 5" or "next Thursday", calculate the full date from today (${contextDate}).
- If a time range is given (e.g. "6–8pm"), use the start time.

Return JSON:
{
  "events": [{"name": "string", "date": "YYYY-MM-DD", "time": "HH:MM or null", "allDay": boolean, "notes": "string or null"}]
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
  return html
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
}

async function callClaude(messages, env, maxTokens = 1024) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || '';
}

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

  const prompt = `Categorize this shopping item into exactly one of: ${CATEGORY_LIST}.
Item: "${itemName}"
Reply with only the category name, nothing else.`;

  try {
    const VALID = new Set(CATEGORY_LIST.split(', '));
    const raw = await callClaude([{ role: 'user', content: prompt }], env, 20);
    const category = VALID.has(raw) ? raw : 'Other';
    return jsonOk({ category }, corsHeaders);
  } catch {
    return jsonOk({ category: 'Other' }, corsHeaders);
  }
}

async function handleUrl(url, env, corsHeaders) {
  if (!url || typeof url !== 'string') return jsonError('No URL provided', 400, corsHeaders);

  let text;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeImporter/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = cleanHtml(await res.text());
  } catch {
    return jsonError('Could not fetch that URL', 400, corsHeaders);
  }

  try {
    const raw = await callClaude([{
      role: 'user',
      content: `${RECIPE_PROMPT}\n\nSource URL: ${url}\n\nPage content:\n${text}`,
    }], env);
    const parsed = parseJson(raw);
    if (parsed.error) return jsonOk({ error: parsed.error }, corsHeaders);
    return jsonOk({
      name: parsed.name || '',
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      notes: parsed.notes || '',
      url,
    }, corsHeaders);
  } catch {
    return jsonError('Could not extract recipe', 500, corsHeaders);
  }
}

async function handleScreenshot(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  try {
    const raw = await callClaude([{
      role: 'user',
      content: [imageContent(input.base64, input.mediaType), { type: 'text', text: RECIPE_PROMPT }],
    }], env);
    const parsed = parseJson(raw);
    if (parsed.error) return jsonOk({ error: parsed.error }, corsHeaders);
    return jsonOk({
      name: parsed.name || '',
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      notes: parsed.notes || '',
      url: null,
    }, corsHeaders);
  } catch {
    return jsonError('Could not extract recipe', 500, corsHeaders);
  }
}

async function handleSchoolLunch(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No file provided', 400, corsHeaders);

  const today = todayIso();
  const isPdf = input.mediaType === 'application/pdf' || input.mediaType?.includes('pdf');
  const contentBlock = isPdf
    ? documentContent(input.base64, input.mediaType)
    : imageContent(input.base64, input.mediaType);
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [contentBlock, { type: 'text', text: SCHOOL_LUNCH_PROMPT(today) }],
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
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: EVENTS_PROMPT(contextDate) },
      ],
    }], env, 1024);
    const parsed = parseJson(raw);
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter(e => e.name && e.date)
      : [];
    return jsonOk({
      events,
      monthUncertain: parsed.monthUncertain === true,
      assumedMonth: parsed.assumedMonth || null,
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

async function handleHomeworkScan(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: HOMEWORK_PROMPT(contextDate) },
      ],
    }], env, 1024);
    const parsed = parseJson(raw);
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter(t => t.name)
      : [];
    const hasUncertainDates = tasks.some(t => !t.dueDate);
    return jsonOk({ tasks, hasUncertainDates }, corsHeaders);
  } catch {
    return jsonError('Could not extract assignments', 500, corsHeaders);
  }
}

async function handlePhotoToList(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: PHOTO_TO_LIST_PROMPT },
      ],
    }], env, 512);
    const parsed = parseJson(raw);
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(i => i.name)
      : [];
    return jsonOk({ items }, corsHeaders);
  } catch {
    return jsonError('Could not identify items', 500, corsHeaders);
  }
}

// ── fetch export ───────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const HANDLERS = {
  categorize:    (input, env) => handleCategorize(input, env, CORS),
  url:           (input, env) => handleUrl(input, env, CORS),
  screenshot:    (input, env) => handleScreenshot(input, env, CORS),
  schoolLunch:   (input, env) => handleSchoolLunch(input, env, CORS),
  calendarPhoto: (input, env) => handleCalendarPhoto(input, env, CORS),
  ical:          (input, env) => handleIcal(input, env, CORS),
  parseEvent:    (input, env) => handleParseEvent(input, env, CORS),
  homeworkScan:  (input, env) => handleHomeworkScan(input, env, CORS),
  photoToList:   (input, env) => handlePhotoToList(input, env, CORS),
};

// ── email export ───────────────────────────────────────────────────────────────

async function handleEmailMessage(message, env) {
  if (!env.CLAUDE_API_KEY || !env.FIREBASE_DB_URL || !env.FIREBASE_DB_SECRET) return;

  const subject = message.headers.get('subject') || '(no subject)';
  const from = message.from || '';

  // Read raw email stream
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
    await fetch(`${env.FIREBASE_DB_URL}/rundown/emailImports.json?auth=${env.FIREBASE_DB_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Silent fail — never bounce an email
  }
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

    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { type, input } = body;
    const handler = HANDLERS[type];
    if (handler) return handler(input, env);

    return new Response(JSON.stringify({ error: 'Unknown type' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },

  async email(message, env, ctx) {
    ctx.waitUntil(handleEmailMessage(message, env));
  },
};
