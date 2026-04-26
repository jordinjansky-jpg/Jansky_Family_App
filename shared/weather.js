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
  return Math.round((new Date(dk1 + 'T12:00:00') - new Date(dk2 + 'T12:00:00')) / 86400000);
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

function _toResult(entry) {
  if (!entry) return null;
  const { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop } = entry;
  return { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop };
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

    const morningSlots = items.filter(i => { const h = new Date(i.dt * 1000).getUTCHours(); return h >= 6 && h < 12; });
    const afternoonSlots = items.filter(i => { const h = new Date(i.dt * 1000).getUTCHours(); return h >= 12 && h < 18; });
    const morningCode = morningSlots.length
      ? morningSlots.reduce((best, i) => {
          const bh = Math.abs(new Date(best.dt * 1000).getUTCHours() - 9);
          const ih = Math.abs(new Date(i.dt * 1000).getUTCHours() - 9);
          return ih < bh ? i : best;
        }).weather[0].id
      : dominantCode;
    const afternoonCode = afternoonSlots.length
      ? afternoonSlots.reduce((best, i) => {
          const bh = Math.abs(new Date(best.dt * 1000).getUTCHours() - 15);
          const ih = Math.abs(new Date(i.dt * 1000).getUTCHours() - 15);
          return ih < bh ? i : best;
        }).weather[0].id
      : dominantCode;
    const pop = Math.round(Math.max(...items.map(i => i.pop || 0)) * 100);

    return {
      dateKey: dk,
      tempLabel: high + '°',
      conditionLabel: items.find(i => i.weather[0].id === dominantCode).weather[0].description
        .replace(/\b\w/g, c => c.toUpperCase()),
      glyph: _codeToGlyph(dominantCode),
      high: high + '°',
      low: Math.round(Math.min(...temps)) + '°',
      morningGlyph: _codeToGlyph(morningCode),
      afternoonGlyph: _codeToGlyph(afternoonCode),
      pop,
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
  if (_isFresh(cached, dateKey === today)) return _toResult(cached);

  try {
    await _fetchAndCache(loc, key, timezone);
  } catch {
    return _toResult(cached);
  }
  return _toResult(_readCache(dateKey));
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
  if (allCached.every(Boolean) && _isFresh(allCached[0], true)) {
    return allCached.map((d, i) => ({ ..._toResult(d), dateKey: dates[i] }));
  }

  try {
    await _fetchAndCache(loc, key, timezone);
  } catch {}

  return dates.map(dk => {
    const d = _readCache(dk);
    return d ? { ..._toResult(d), dateKey: dk } : null;
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
