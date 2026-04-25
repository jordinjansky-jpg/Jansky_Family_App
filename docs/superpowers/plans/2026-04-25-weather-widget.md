# Weather Widget (1.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the weather chip in the ambient strip — add a fetch/cache module, a 5-day forecast sheet, and admin settings for location + API key.

**Architecture:** New `shared/weather.js` pure module handles all OWM API calls and localStorage caching. `shared/components.js` gains `renderWeatherSheet`. `dashboard.js` replaces the `weatherData = null` stub and wires the chip tap. `admin.html` gains a Weather fieldset with a live test button.

**Tech Stack:** Vanilla JS ES modules, OpenWeatherMap free tier (`/data/2.5/weather` + `/data/2.5/forecast`), localStorage cache, existing Firebase compat SDK (settings read-only here).

---

## Files

| File | Action | Responsibility |
|---|---|---|
| `shared/weather.js` | Create | OWM fetch, localStorage cache, condition → glyph mapping |
| `shared/components.js` | Modify | Hoist `weatherGlyphs` to module-level; add `renderWeatherSheet` |
| `styles/components.css` | Modify | `.weather-row` styles for forecast sheet rows |
| `dashboard.js` | Modify | Import weather module; replace null stub; wire chip tap; `ambientStrip ?? true` |
| `admin.html` | Modify | Weather fieldset HTML + test button JS + save handler + cache eviction |
| `sw.js` | Modify | Add `shared/weather.js` to cache list; bump `CACHE_NAME` version |

---

## Task 1: Create `shared/weather.js`

**Files:**
- Create: `shared/weather.js`

- [ ] **Step 1: Create the file**

```js
// shared/weather.js
// Pure module — no DOM access. Fetches from OpenWeatherMap free tier and caches per-date.

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const TTL_TODAY_MS = 60 * 60 * 1000; // 60 min

function _dateKey(tsMs, timezone) {
  return new Date(tsMs).toLocaleDateString('en-CA', { timeZone: timezone });
}

function _todayKey(timezone) {
  return _dateKey(Date.now(), timezone);
}

function _daysDiff(dk1, dk2) {
  return (new Date(dk1 + 'T00:00:00') - new Date(dk2 + 'T00:00:00')) / 86400000;
}

function _codeToGlyph(code) {
  if (code >= 200 && code < 600) return 'rain';
  if (code >= 600 && code < 700) return 'snow';
  if (code >= 700 && code < 800) return 'fog';
  if (code === 800) return 'sun';
  return 'cloud';
}

function _readCache(dateKey) {
  try { return JSON.parse(localStorage.getItem('dr-weather-' + dateKey)); } catch { return null; }
}

function _writeCache(dateKey, data) {
  try { localStorage.setItem('dr-weather-' + dateKey, JSON.stringify({ ...data, fetched: Date.now() })); } catch {}
}

function _isFresh(entry, isToday) {
  if (!entry?.fetched) return false;
  return isToday ? (Date.now() - entry.fetched < TTL_TODAY_MS) : true;
}

function _parseCurrent(json, timezone) {
  const dk = _todayKey(timezone);
  return {
    dateKey: dk,
    tempLabel: Math.round(json.main.temp) + '°',
    conditionLabel: json.weather[0].description.replace(/\b\w/g, c => c.toUpperCase()),
    glyph: _codeToGlyph(json.weather[0].id),
    high: Math.round(json.main.temp_max) + '°',
    low: Math.round(json.main.temp_min) + '°',
  };
}

function _parseForecast(json, timezone) {
  const byDate = {};
  for (const item of json.list) {
    const dk = _dateKey(item.dt * 1000, timezone);
    if (!byDate[dk]) byDate[dk] = [];
    byDate[dk].push(item);
  }
  return Object.entries(byDate).map(([dk, items]) => {
    const temps = items.map(i => i.main.temp);
    const freq = {};
    for (const i of items) freq[i.weather[0].id] = (freq[i.weather[0].id] || 0) + 1;
    const dominantCode = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    const high = Math.round(Math.max(...temps));
    return {
      dateKey: dk,
      tempLabel: high + '°',
      conditionLabel: items.find(i => i.weather[0].id === dominantCode).weather[0].description
        .replace(/\b\w/g, c => c.toUpperCase()),
      glyph: _codeToGlyph(dominantCode),
      high: high + '°',
      low: Math.round(Math.min(...temps)) + '°',
    };
  });
}

async function _fetchAndCache(loc, key, timezone) {
  const [cr, fr] = await Promise.all([
    fetch(`${OWM_BASE}/weather?q=${encodeURIComponent(loc)}&appid=${encodeURIComponent(key)}&units=imperial`),
    fetch(`${OWM_BASE}/forecast?q=${encodeURIComponent(loc)}&appid=${encodeURIComponent(key)}&units=imperial&cnt=40`),
  ]);
  if (!cr.ok || !fr.ok) throw new Error(`OWM ${cr.status}/${fr.status}`);
  const [cj, fj] = await Promise.all([cr.json(), fr.json()]);
  const todayEntry = _parseCurrent(cj, timezone);
  _writeCache(todayEntry.dateKey, todayEntry);
  for (const entry of _parseForecast(fj, timezone)) {
    if (entry.dateKey !== todayEntry.dateKey) _writeCache(entry.dateKey, entry);
  }
}

/**
 * Fetch weather for a specific date.
 * Returns: { tempLabel, conditionLabel, glyph, high, low }
 *        | { isPast: true }
 *        | { isFuture: true }
 *        | null (no config or unrecoverable error)
 */
export async function fetchWeather(dateKey, settings) {
  const { weatherLocation: loc, weatherApiKey: key, timezone } = settings || {};
  if (!loc || !key) return null;

  const today = _todayKey(timezone);
  const diff = _daysDiff(dateKey, today);
  if (diff < 0) return { isPast: true };
  if (diff > 4) return { isFuture: true };

  const cached = _readCache(dateKey);
  if (_isFresh(cached, dateKey === today)) return cached;

  try {
    await _fetchAndCache(loc, key, timezone);
  } catch {
    return cached || null;
  }
  return _readCache(dateKey) || null;
}

/**
 * Fetch 5-day forecast (today + 4) for the forecast sheet.
 * Returns array of { dateKey, tempLabel, conditionLabel, glyph, high, low }.
 * Falls back to cache on network failure.
 */
export async function fetchForecast(settings) {
  const { weatherLocation: loc, weatherApiKey: key, timezone } = settings || {};
  if (!loc || !key) return [];

  const today = _todayKey(timezone);
  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('en-CA');
  });

  const allCached = dates.map(dk => _readCache(dk));
  if (allCached.every(Boolean)) return allCached.map((d, i) => ({ ...d, dateKey: dates[i] }));

  try {
    await _fetchAndCache(loc, key, timezone);
  } catch {}

  return dates.map(dk => {
    const d = _readCache(dk);
    return d ? { ...d, dateKey: dk } : null;
  }).filter(Boolean);
}

/** Evict all dr-weather-* cache entries (call when location changes). */
export function clearWeatherCache() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('dr-weather-')) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
```

- [ ] **Step 2: Smoke-test in browser console**

Open `dashboard.html` in the browser. In DevTools console:

```js
import('/shared/weather.js').then(m => {
  m.fetchWeather('2026-04-25', {
    weatherLocation: 'Lakeville, MN',
    weatherApiKey: 'YOUR_KEY_HERE',
    timezone: 'America/Chicago'
  }).then(console.log);
});
```

Expected: object with `tempLabel`, `conditionLabel`, `glyph`, `high`, `low`. Check `localStorage` for `dr-weather-2026-04-25`.

- [ ] **Step 3: Commit**

```bash
git add shared/weather.js
git commit -m "feat(weather): add shared/weather.js fetch + cache module"
```

---

## Task 2: Hoist glyphs + add `renderWeatherSheet` + CSS

**Files:**
- Modify: `shared/components.js`
- Modify: `styles/components.css`

- [ ] **Step 1: Hoist `weatherGlyphs` to module level in `shared/components.js`**

Find the `renderAmbientStrip` function (around line 1715). It currently defines `const weatherGlyphs = { ... }` inside the function body. Move it to module-level (before the function), and update `renderAmbientStrip` to reference it directly:

```js
// Add at module level (before renderAmbientStrip):
const WEATHER_GLYPHS = {
  sun:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.78A6 6 0 0 0 4 13.5 5.5 5.5 0 0 0 9.5 19h8z"/></svg>',
  rain:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0-1-7.87A6 6 0 0 0 4 11"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="16" y1="19" x2="16" y2="21"/></svg>',
  snow:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 9-8 3-8-3M4 15l8-3 8 3"/></svg>',
  fog:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h18M3 12h18M7 16h10"/></svg>',
};
```

Then inside `renderAmbientStrip`, replace `const weatherGlyphs = { ... }` with a reference to `WEATHER_GLYPHS`:

```js
// Inside renderAmbientStrip, replace:
//   const weatherGlyphs = { sun: '...', cloud: '...', ... };
// With:
const weatherGlyphs = WEATHER_GLYPHS;
```

- [ ] **Step 2: Add `renderWeatherSheet` export to `shared/components.js`**

Add after `renderAmbientStrip`:

```js
/**
 * 5-day weather forecast sheet.
 * days: Array<{ dateKey, tempLabel, conditionLabel, glyph, high, low }>
 * Uses WEATHER_GLYPHS (module-level) and existing .sheet DOM structure.
 */
export function renderWeatherSheet(days, today, tomorrow) {
  function dayLabel(dk) {
    if (dk === today) return 'Today';
    if (dk === tomorrow) return 'Tomorrow';
    const d = new Date(dk + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  function shortDate(dk) {
    const d = new Date(dk + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const rowsHtml = days.map(day => {
    if (!day) return '';
    const glyph = WEATHER_GLYPHS[day.glyph] || WEATHER_GLYPHS.cloud;
    return `<div class="weather-row">
      <div class="weather-row__day">
        <strong>${esc(dayLabel(day.dateKey))}</strong>
        <span>${esc(shortDate(day.dateKey))}</span>
      </div>
      <div class="weather-row__glyph" aria-hidden="true">${glyph}</div>
      <div class="weather-row__data">
        <strong>${esc(day.tempLabel)}</strong>
        <span>H:${esc(day.high)}&nbsp; L:${esc(day.low)}</span>
        <span>${esc(day.conditionLabel)}</span>
      </div>
    </div>`;
  }).join('');

  return renderBottomSheet(`
    <div class="sheet-section-title">Weather</div>
    <div class="weather-sheet__rows">${rowsHtml}</div>
  `);
}
```

Note: `esc`, `renderBottomSheet` are already defined earlier in `shared/components.js` — no imports needed.

- [ ] **Step 3: Add `.weather-row` CSS to `styles/components.css`**

Append at the end of `styles/components.css`:

```css
/* ── Weather forecast sheet ── */
.weather-sheet__rows {
  border-top: 1px solid var(--color-border);
}

.weather-row {
  display: flex;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-subtle);
  gap: var(--spacing-sm);
}

.weather-row__day {
  min-width: 88px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.weather-row__day strong {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
}

.weather-row__day span {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.weather-row__glyph {
  flex: 1;
  display: flex;
  justify-content: center;
}

.weather-row__glyph svg {
  width: 28px;
  height: 28px;
}

.weather-row__data {
  min-width: 80px;
  text-align: right;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.weather-row__data strong {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text);
}

.weather-row__data span {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Verify in browser**

Open `dashboard.html`. Open DevTools console:

```js
import('/shared/components.js').then(m => {
  const days = [
    { dateKey: '2026-04-25', tempLabel: '58°', conditionLabel: 'Sunny', glyph: 'sun', high: '63°', low: '44°' },
    { dateKey: '2026-04-26', tempLabel: '52°', conditionLabel: 'Cloudy', glyph: 'cloud', high: '55°', low: '39°' },
  ];
  document.body.insertAdjacentHTML('beforeend', m.renderWeatherSheet(days, '2026-04-25', '2026-04-26'));
});
```

Expected: bottom sheet appears with 2 rows, correct layout.

- [ ] **Step 5: Commit**

```bash
git add shared/components.js styles/components.css
git commit -m "feat(weather): add renderWeatherSheet component + weather-row CSS"
```

---

## Task 3: Wire `dashboard.js`

**Files:**
- Modify: `dashboard.js`

- [ ] **Step 1: Add imports at top of `dashboard.js`**

Find the existing import block at the top of `dashboard.js`. Add:

```js
import { fetchWeather, fetchForecast } from './shared/weather.js';
import { renderWeatherSheet } from './shared/components.js';
```

(The `renderWeatherSheet` import can be added alongside the existing `renderAmbientStrip` import.)

- [ ] **Step 2: Replace `weatherData = null` stub and flip `ambientStrip` default**

Find (around line 300):

```js
if (settings?.ambientStrip === true) {
    // Both data sources are nullable; component handles empty-state internally.
    const weatherData = null; // Wired by 1.4.
```

Replace with:

```js
if (settings?.ambientStrip ?? true) {
    // Both data sources are nullable; component handles empty-state internally.
    const weatherData = await fetchWeather(viewDate, settings);
```

- [ ] **Step 3: Wire the weather chip tap handler**

Find the `.ambient-chip` listener block (around line 713 — currently has `// weather chip: wired by 1.4`). Replace the weather section:

```js
if (chip.dataset.chip === 'weather') {
  if (!settings?.weatherLocation || !settings?.weatherApiKey) {
    location.href = 'admin.html';
    return;
  }
  if (weatherData?.isPast || weatherData?.isFuture) return; // no sheet for these states

  const today2 = todayKey(settings?.timezone || 'America/Chicago');
  const d = new Date(today2 + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const tomorrow2 = d.toLocaleDateString('en-CA');

  taskSheetMount.innerHTML = renderWeatherSheet(
    await fetchForecast(settings),
    today2,
    tomorrow2
  );
  requestAnimationFrame(() => {
    document.getElementById('bottomSheet')?.classList.add('active');
  });
  document.getElementById('bottomSheet')?.addEventListener('click', e => {
    if (e.target === document.getElementById('bottomSheet')) closeTaskSheet();
  });
  document.getElementById('weatherSheetClose')?.addEventListener('click', closeTaskSheet);
}
```

Note: `todayKey` is already imported from `shared/utils.js` in `dashboard.js`. `taskSheetMount` and `closeTaskSheet` are already defined in `dashboard.js`.

- [ ] **Step 4: Fix `ambientStrip` default in the admin checkbox sync**

Search `dashboard.js` for any other `settings?.ambientStrip` references and apply `?? true` consistently. (The render gate above is the main one — verify no others exist.)

- [ ] **Step 5: Smoke-test**

1. Open `dashboard.html` in browser (connected to Firebase).
2. With no `weatherLocation`/`weatherApiKey` in settings: ambient strip should render with `—° · Set location`. Tapping the chip should navigate to `admin.html`. ✓
3. (After Task 4 — add settings): refresh dashboard. Weather chip should show live temp. Tapping should open 5-day sheet. ✓

- [ ] **Step 6: Commit**

```bash
git add dashboard.js
git commit -m "feat(weather): wire weather chip in dashboard — fetch, tap handler, ambientStrip default"
```

---

## Task 4: Update `admin.html` — Weather fieldset

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add the Weather fieldset HTML**

Find the Settings tab in `admin.html`. Locate the existing Family fieldset (contains App Name, Family Name, Timezone) and the Display fieldset (contains Ambient strip toggle). Insert the Weather fieldset between them:

```html
<fieldset class="admin-form__fieldset">
  <legend>Weather</legend>
  <div class="admin-form__group">
    <label class="form-label" for="sf_weatherLocation">Location</label>
    <div class="form-hint">Zip code or "City, State". Example: Lakeville, MN</div>
    <div style="display:flex;gap:8px;align-items:flex-start">
      <input class="form-input" id="sf_weatherLocation" type="text"
             placeholder="Lakeville, MN" value="${esc(settings?.weatherLocation || '')}">
      <button class="btn btn--secondary btn--sm" id="sf_weatherTest" type="button">Test</button>
    </div>
    <div id="sf_weatherTestResult" class="form-hint" hidden></div>
  </div>
  <div class="admin-form__group">
    <label class="form-label" for="sf_weatherApiKey">OpenWeatherMap API key</label>
    <div class="form-hint">Free at openweathermap.org — 1,000 calls/day included.</div>
    <input class="form-input" id="sf_weatherApiKey" type="text"
           style="font-family:monospace" value="${esc(settings?.weatherApiKey || '')}">
  </div>
</fieldset>
```

- [ ] **Step 2: Add the Test button handler**

Find the Settings tab JS initialization block (where other settings-tab buttons are wired). Add:

```js
main.querySelector('#sf_weatherTest')?.addEventListener('click', async () => {
  const loc = main.querySelector('#sf_weatherLocation')?.value.trim();
  const key = main.querySelector('#sf_weatherApiKey')?.value.trim();
  const resultEl = main.querySelector('#sf_weatherTestResult');
  if (!loc || !key) {
    resultEl.textContent = '✗ Enter a location and API key first.';
    resultEl.className = 'form-hint form-hint--error';
    resultEl.hidden = false;
    return;
  }
  resultEl.textContent = 'Checking…';
  resultEl.className = 'form-hint';
  resultEl.hidden = false;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc)}&appid=${encodeURIComponent(key)}&units=imperial`
    );
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const temp = Math.round(json.main.temp);
    const cond = json.weather[0].description.replace(/\b\w/g, c => c.toUpperCase());
    resultEl.textContent = `✓ ${json.name} · ${temp}°F · ${cond}`;
    resultEl.className = 'form-hint form-hint--success';
    setTimeout(() => { resultEl.hidden = true; }, 10000);
  } catch {
    resultEl.textContent = '✗ Couldn\'t fetch — check location and API key.';
    resultEl.className = 'form-hint form-hint--error';
    setTimeout(() => { resultEl.hidden = true; }, 10000);
  }
});
```

Note: This is a standalone fetch — it does not use `shared/weather.js` to avoid requiring the module be imported in admin.html. The admin page does not import the weather module.

- [ ] **Step 3: Add to the save handler**

Find the settings save handler in `admin.html` (the block that builds the `updated` object and calls `writeSettings`). Add `weatherLocation` and `weatherApiKey` to the `updated` object:

```js
weatherLocation: main.querySelector('#sf_weatherLocation')?.value.trim() || '',
weatherApiKey:   main.querySelector('#sf_weatherApiKey')?.value.trim() || '',
```

Also add cache eviction after save, before `loadData()`:

```js
// Evict weather cache if location changed
if ((settings?.weatherLocation || '') !== (updated.weatherLocation || '')) {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('dr-weather-')) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
```

- [ ] **Step 4: Fix `ambientStrip` checkbox default in admin**

Find the ambient strip checkbox in the Settings tab HTML:

```js
// Before:
<input type="checkbox" id="set_ambientStrip"${settings?.ambientStrip ? ' checked' : ''}>

// After:
<input type="checkbox" id="set_ambientStrip"${(settings?.ambientStrip ?? true) ? ' checked' : ''}>
```

- [ ] **Step 5: Add `.form-hint--success` and `.form-hint--error` CSS if not present**

Check `styles/admin.css` or `styles/components.css` for `.form-hint--success` / `.form-hint--error`. If missing, add to `styles/admin.css`:

```css
.form-hint--success { color: var(--color-success, #2a7a2a); }
.form-hint--error   { color: var(--color-error, #c0392b); }
```

- [ ] **Step 6: Verify in browser**

1. Open `admin.html` → Settings tab → scroll to Weather fieldset.
2. Enter your city and API key. Click Test.
3. Expected: green confirmation line shows city + temp.
4. Click Save. Refresh `dashboard.html`. Ambient strip weather chip should show live temp.
5. Tap the chip → 5-day forecast sheet opens.

- [ ] **Step 7: Commit**

```bash
git add admin.html styles/admin.css
git commit -m "feat(weather): admin settings — location, API key, test button"
```

---

## Task 5: Bump SW cache

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Add `shared/weather.js` to cache list and bump version**

Open `sw.js`. Find `CACHE_NAME` (e.g., `'dr-cache-v64'`) and the `urlsToCache` array. Add `'shared/weather.js'` to the array and increment the version number:

```js
// Before (example):
const CACHE_NAME = 'dr-cache-v64';
const urlsToCache = [
  ...
  'shared/components.js',
  ...
];

// After:
const CACHE_NAME = 'dr-cache-v65';
const urlsToCache = [
  ...
  'shared/components.js',
  'shared/weather.js',
  ...
];
```

- [ ] **Step 2: Verify SW update in browser**

Open DevTools → Application → Service Workers. Click "Update". Confirm new cache version appears in Cache Storage.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): add shared/weather.js to cache, bump to v65"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §2 Schema (`weatherLocation`, `weatherApiKey`, cache shape) | Task 1 |
| §3 `fetchWeather` — past/future guards, cache TTL, OWM fetch, fallback | Task 1 |
| §3 `fetchForecast` — 5-day array, cache-first | Task 1 |
| §3 `clearWeatherCache` — exported for admin use | Task 1 |
| §3 Condition code → glyph table | Task 1 (`_codeToGlyph`) |
| §4 Weather fieldset HTML (location + test + API key) | Task 4 Step 1 |
| §4 Test button behavior | Task 4 Step 2 |
| §4 Save handler additions | Task 4 Step 3 |
| §4 Cache eviction on location change | Task 4 Step 3 |
| §5 Dashboard fetch stub replacement | Task 3 Step 2 |
| §5 `ambientStrip ?? true` default flip | Task 3 Step 2, Task 4 Step 4 |
| §5 Weather chip tap — no-config route to admin | Task 3 Step 3 |
| §5 Weather chip tap — past/future no-op | Task 3 Step 3 |
| §5 Weather chip tap — open forecast sheet | Task 3 Step 3 |
| §6 `renderWeatherSheet` component | Task 2 Step 2 |
| §6 `.weather-row` CSS | Task 2 Step 3 |
| §7 States table (all 6 states) | Tasks 1 + 3 |
| §8 Kid mode — no change needed | (confirmed: ambient strip not rendered in kid.html) |
| §8 Kiosk — `shared/weather.js` importable | Task 1 (pure module, no DOM) |
| SW cache | Task 5 |

All sections covered. No gaps found.
