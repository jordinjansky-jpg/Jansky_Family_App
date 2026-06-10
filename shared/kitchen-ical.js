// shared/kitchen-ical.js
// Client-side iCal fetcher + parser for school lunch feeds.
// Public feeds (Nutrislice etc.) are CORS-safe; some districts block CORS and would
// require a Worker proxy (deferred per spec).

// Minimal iCal parser. Handles VEVENT blocks, DTSTART (DATE or DATE-TIME), SUMMARY,
// folded continuation lines, basic escaping. Skipping VTIMEZONE — DTSTART;VALUE=DATE
// is what school feeds use in practice.
export function parseIcs(text) {
  const events = [];
  const lines = unfold(text).split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.date && current?.summary) events.push({ ...current });
      current = null;
      continue;
    }
    if (!current) continue;

    // Property line: "KEY[;params]:VALUE"
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = left.split(';')[0];

    if (key === 'DTSTART') {
      const v = value.replace(/[^0-9TZ]/g, '');
      const y = v.slice(0, 4), m = v.slice(4, 6), d = v.slice(6, 8);
      if (y && m && d) current.date = `${y}-${m}-${d}`;
    } else if (key === 'SUMMARY') {
      current.summary = unescape(value);
    }
  }
  return events;
}

function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function unescape(s) {
  return s.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n').replace(/\\\\/g, '\\');
}

// Map iCal events to kitchen plan entries for the next 30 days from today.
// Returns: [{ date, summary, target: 'school-lunch' | 'school-lunch-2' | null, conflictType?: string }]
export function mapEventsToPlan(events, currentPlanByDate, todayStr) {
  // 30-day forward window
  const todayDate = new Date(todayStr + 'T00:00:00');
  const endDate = new Date(todayDate);
  endDate.setDate(endDate.getDate() + 30);

  // Sort events by date so dup-events on same date go 1 → 2
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  // Track seen dates so a second event on the same date routes to school-lunch-2
  const usedSlot1 = new Set();
  const usedSlot2 = new Set();
  const out = [];

  // Plan slots are stored as ARRAYS of options (legacy single objects may
  // remain). Reading `.source` on an array is undefined, which made every
  // re-sync treat its own previous entries as foreign — lunches spilled into
  // school-lunch-2 and surfaced as phantom conflicts.
  const slotSource = (v) => {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    return arr[0]?.source;
  };

  for (const ev of sorted) {
    if (!ev.date || ev.date < todayStr) continue;
    if (new Date(ev.date + 'T00:00:00') >= endDate) continue;
    const dayPlan = currentPlanByDate[ev.date] || {};

    let target = null;
    let conflictType = null;

    // Slot 1 strategy
    if (!dayPlan['school-lunch'] && !usedSlot1.has(ev.date)) {
      target = 'school-lunch';
      usedSlot1.add(ev.date);
    } else if (slotSource(dayPlan['school-lunch']) === 'ical') {
      // Overwrite our own previous ical entry
      target = 'school-lunch';
    } else if (!dayPlan['school-lunch-2'] && !usedSlot2.has(ev.date)) {
      target = 'school-lunch-2';
      usedSlot2.add(ev.date);
    } else if (slotSource(dayPlan['school-lunch-2']) === 'ical') {
      target = 'school-lunch-2';
    } else {
      target = null;
      conflictType = slotSource(dayPlan['school-lunch']) || 'unknown';
    }

    out.push({ date: ev.date, summary: ev.summary, target, conflictType });
  }
  return out;
}
