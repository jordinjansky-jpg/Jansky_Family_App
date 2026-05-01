// workers/kitchen-import.js — Kitchen import + auto-categorization Worker
// Deploy: wrangler deploy workers/kitchen-import.js
// Secrets (wrangler secret put):
//   CLAUDE_API_KEY        — required for all AI handlers
//   FIREBASE_DB_URL       — required for email handler only (e.g. https://project-default-rtdb.firebaseio.com)
//   FIREBASE_DB_SECRET    — required for email handler only (Firebase Database Secret from Project Settings → Service Accounts)

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LIST = [
  'Produce', 'Dairy', 'Meat & Seafood', 'Bakery', 'Frozen', 'Pantry',
  'Beverages', 'Snacks', 'Household', 'Personal Care', 'Baby & Kids',
  'Pets', 'Clothing', 'Electronics', 'Toys', 'Other',
];
const CATEGORY_STR = CATEGORY_LIST.join(', ');
const CATEGORY_SET = new Set(CATEGORY_LIST);

// ── Prompts ───────────────────────────────────────────────────────────────────

const RECIPE_PROMPT = `Extract recipe information. The source may be a recipe website, blog post, social media post, or photo of a recipe card — formats vary widely.

INGREDIENT NAME RULES:
- Use the bare grocery-store name only — no prep instructions, no parenthetical descriptions.
- Strip prep modifiers from the name: "black pepper (freshly cracked)" → "black pepper". "garlic, minced" → "garlic". "freshly grated parmesan" → "parmesan". "finely diced onion" → "onion".
- Strip parenthetical content entirely.
- Strip everything after a comma (it's almost always prep).
- Keep modifiers that change the SKU: "extra virgin olive oil" stays as is; "diced tomatoes" stays as is (canned, different from fresh tomatoes); "boneless skinless chicken breast" stays as is.
- Lowercase the first letter unless it's a brand name.

Return JSON:
{
  "name": "recipe name or null",
  "ingredients": [{"name": "clean grocery name", "qty": "amount with unit, or null"}],
  "notes": "brief description or prep note (max 200 chars), or null",
  "error": "reason if no recipe at all, else null"
}
If multiple recipes appear, extract the primary or most prominent one. Extract as much as is visible even if some fields are incomplete. Return only valid JSON, nothing else.`;

const EVENTS_PROMPT = (contextDate) =>
  `Extract all calendar events from this image. Today is ${contextDate}.

CALENDAR READING RULES:
- The image may show a printed, handwritten, or school-style calendar — often colorful, dense, or missing a clear month/year label.
- If two months appear on the page, extract events from both.
- To determine the month: look for any month name anywhere on the page (headers, footers, small print, watermarks). If absent, use today (${contextDate}) as the anchor and assign day numbers to the nearest upcoming month that makes sense — prefer future dates over past.
- Day cells may contain handwriting, stickers, colored text, or small annotations — read ALL text in each cell, not just large or clearly printed text.
- Ignore purely decorative elements (borders, clip art, school logos) but capture every day cell that has any text beyond just the day number.
- For events with no year shown, use the year that makes the date upcoming or within the next 12 months.
- For events with no time shown, set allDay: true.
- Do not merge or summarize — create one event entry per unique day-cell occurrence.

CONFIDENCE RULES:
- confidence: "high" = clearly printed or typed event name; "medium" = handwritten, partially obscured, or abbreviated; "low" = barely visible, cut off, or guessed from context.
- dateConfidence: "high" = month name clearly visible on the image; "medium" = month inferred from adjacent months or partial label; "low" = month was assumed because nothing was visible.

MONTH UNCERTAINTY:
- If the month was NOT clearly labeled anywhere on the image, set monthUncertain: true and provide your best guess as assumedMonth (e.g. "May 2026").
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

const SCHOOL_LUNCH_PROMPT = (contextDate) =>
  `Extract the school lunch menu. Today is ${contextDate}.

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

const TASK_SCAN_PROMPT = (contextDate) =>
  `Extract all actionable tasks from this document or image. Today is ${contextDate}.

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

const PHOTO_TO_LIST_PROMPT = `Extract items for a shopping list from this photo. For each item, also assign a shopping category.

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

const SCAN_PROMPT = (contextDate) =>
  `Analyze this image carefully and extract ALL of the following that are present:
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
    }], env, 1024);
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
    }], env, 1024);
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

  const today = input.contextDate || todayIso();
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
    }], env, 2048);
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

async function handleTaskScan(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: TASK_SCAN_PROMPT(contextDate) },
      ],
    }], env, 1024);
    const parsed = parseJson(raw);
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter(t => t.name)
      : [];
    return jsonOk({ tasks, hasUncertainDates: tasks.some(t => !t.dueDate) }, corsHeaders);
  } catch {
    return jsonError('Could not extract tasks', 500, corsHeaders);
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

// Unified scan: one image → events + tasks + lunch in a single Claude call.
async function handleScan(input, env, corsHeaders) {
  if (!input?.base64 || !input?.mediaType) return jsonError('No image provided', 400, corsHeaders);

  const contextDate = input.contextDate || todayIso();
  try {
    const raw = await callClaude([{
      role: 'user',
      content: [
        imageContent(input.base64, input.mediaType),
        { type: 'text', text: SCAN_PROMPT(contextDate) },
      ],
    }], env, 3000);
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
  'Access-Control-Allow-Headers': 'Content-Type',
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
