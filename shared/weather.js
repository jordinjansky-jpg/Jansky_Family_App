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

function _codeToIconCode(code) {
  if (code >= 200 && code < 300) return 'thunder';
  if (code >= 300 && code < 400) return 'drizzle';
  if (code >= 500 && code < 600) return 'rain';
  if (code >= 600 && code < 700) return 'snow';
  if (code >= 700 && code < 800) return 'fog';
  if (code === 800) return 'clear';
  if (code === 801 || code === 802) return 'partly-cloudy';
  return 'cloudy';
}

function _codeToShortLabel(code) {
  if (code >= 200 && code < 300) return 'Stormy';
  if (code >= 300 && code < 400) return 'Drizzle';
  if (code === 500) return 'Light Rain';
  if (code === 501) return 'Rain';
  if (code >= 502 && code < 512) return 'Heavy Rain';
  if (code >= 520 && code < 532) return 'Showers';
  if (code >= 600 && code < 611) return 'Snow';
  if (code >= 611 && code < 616) return 'Sleet';
  if (code >= 620) return 'Flurries';
  if (code === 701) return 'Mist';
  if (code === 741) return 'Foggy';
  if (code >= 700 && code < 800) return 'Hazy';
  if (code === 800) return 'Clear';
  if (code === 801) return 'Mostly Clear';
  if (code === 802) return 'Pt. Cloudy';
  if (code === 803) return 'Mostly Cloudy';
  return 'Overcast';
}

function _readCache(dateKey) {
  try { return JSON.parse(localStorage.getItem('dr-weather-' + dateKey)); } catch { return null; }
}

function _writeCache(dateKey, data) {
  try { localStorage.setItem('dr-weather-' + dateKey, JSON.stringify({ ...data, fetched: Date.now() })); } catch {}
}

function _readCoords() {
  try { return JSON.parse(localStorage.getItem('dr-weather-coord')); } catch { return null; }
}

function _writeCoords(lat, lon) {
  try { localStorage.setItem('dr-weather-coord', JSON.stringify({ lat, lon })); } catch {}
}

// Sunrise/sunset via NOAA simplified solar algorithm. Accurate to ~1 min for non-polar latitudes.
// Returns { sunrise, sunset } as locale time strings, or null for polar day/night.
function _sunTimes(lat, lon, dateKey, timezone) {
  const D = Math.PI / 180;
  const JD = new Date(dateKey + 'T12:00:00Z').getTime() / 86400000 + 2440587.5;
  const n = Math.round(JD) - 2451545 + 0.5;
  const Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const Mr = M * D;
  const C = 1.9148 * Math.sin(Mr) + 0.0200 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lam = ((M + C + 180 + 102.9372) % 360) * D;
  const Jnoon = 2451545 + Js + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lam);
  const sinDec = Math.sin(lam) * Math.sin(23.4397 * D);
  const cosOmega = (Math.sin(-0.833 * D) - Math.sin(lat * D) * sinDec)
    / (Math.cos(lat * D) * Math.sqrt(1 - sinDec * sinDec));
  if (Math.abs(cosOmega) > 1) return null;
  const omega = Math.acos(cosOmega) / D;
  const jdToLocal = jd => new Date(Math.round((jd - 2440587.5) * 86400000))
    .toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true });
  return { sunrise: jdToLocal(Jnoon - omega / 360), sunset: jdToLocal(Jnoon + omega / 360) };
}

function _toResult(entry) {
  if (!entry) return null;
  const { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop,
          morningIconCode, morningLabel, afternoonIconCode, afternoonLabel } = entry;
  return { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop,
           morningIconCode, morningLabel, afternoonIconCode, afternoonLabel };
}

function _isFresh(entry, isToday) {
  if (!entry?.fetched) return false;
  return isToday ? (Date.now() - entry.fetched < TTL_TODAY_MS) : true;
}

function _parseCurrent(json, timezone) {
  const dk = _todayKey(timezone);
  if (json.coord?.lat != null) _writeCoords(json.coord.lat, json.coord.lon);
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
      morningIconCode: _codeToIconCode(morningCode),
      morningLabel: _codeToShortLabel(morningCode),
      afternoonIconCode: _codeToIconCode(afternoonCode),
      afternoonLabel: _codeToShortLabel(afternoonCode),
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
    const coords = _readCoords();
    return allCached.map((d, i) => {
      const dk = dates[i];
      const sun = coords ? _sunTimes(coords.lat, coords.lon, dk, timezone) : null;
      return { ..._toResult(d), dateKey: dk, sunrise: sun?.sunrise ?? null, sunset: sun?.sunset ?? null };
    });
  }

  try {
    await _fetchAndCache(loc, key, timezone);
  } catch {}

  const coords = _readCoords();
  return dates.map(dk => {
    const d = _readCache(dk);
    if (!d) return null;
    const sun = coords ? _sunTimes(coords.lat, coords.lon, dk, timezone) : null;
    return { ..._toResult(d), dateKey: dk, sunrise: sun?.sunrise ?? null, sunset: sun?.sunset ?? null };
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
