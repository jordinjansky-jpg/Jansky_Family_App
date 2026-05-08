// shared/weather.js
// Pure module — no DOM access. Fetches from Open-Meteo (no API key required) and caches per-date.

const OM_FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const OM_GEO_BASE      = 'https://geocoding-api.open-meteo.com/v1/search';
const TTL_TODAY_MS     =  1 * 60 * 60 * 1000; // 60 min
const TTL_FORECAST_MS  =  3 * 60 * 60 * 1000; // 3 hours

function _dateKey(tsMs, timezone) {
  return new Date(tsMs).toLocaleDateString('en-CA', { timeZone: timezone });
}

function _todayKey(timezone) {
  return _dateKey(Date.now(), timezone);
}

function _daysDiff(dk1, dk2) {
  return Math.round((new Date(dk1 + 'T12:00:00') - new Date(dk2 + 'T12:00:00')) / 86400000);
}

// WMO weather code → ambient strip glyph (5-type system for ambient strip compat)
function _wmoToGlyph(code) {
  if (code === 0) return 'sun';
  if (code <= 3)  return 'cloud';
  if (code <= 48) return 'fog';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 86) return 'snow';
  return 'rain'; // thunder → rain glyph
}

// WMO weather code → detailed icon type for weather sheet
function _wmoToIconCode(code) {
  if (code === 0)  return 'clear';
  if (code <= 2)   return 'partly-cloudy';
  if (code === 3)  return 'cloudy';
  if (code <= 48)  return 'fog';
  if (code <= 55)  return 'drizzle';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 86)  return 'snow';
  return 'thunder';
}

// WMO weather code → short label
function _wmoToShortLabel(code) {
  if (code === 0)  return 'Clear';
  if (code === 1)  return 'Mostly Clear';
  if (code === 2)  return 'Pt. Cloudy';
  if (code === 3)  return 'Overcast';
  if (code <= 48)  return 'Foggy';
  if (code === 51) return 'Lt. Drizzle';
  if (code === 53) return 'Drizzle';
  if (code === 55) return 'Hvy. Drizzle';
  if (code === 61) return 'Light Rain';
  if (code === 63) return 'Rain';
  if (code === 65) return 'Heavy Rain';
  if (code === 71) return 'Light Snow';
  if (code === 73) return 'Snow';
  if (code === 75) return 'Heavy Snow';
  if (code === 77) return 'Flurries';
  if (code <= 82)  return 'Showers';
  if (code <= 86)  return 'Snow Showers';
  if (code === 95) return 'Thunderstorm';
  return 'T-Storm';
}

// Open-Meteo returns sunrise/sunset as "2026-05-08T05:52" (already in requested timezone).
// Parse directly without timezone conversion.
function _formatSunTime(isoStr) {
  if (!isoStr) return null;
  const timePart = isoStr.split('T')[1];
  if (!timePart) return null;
  const [h, m] = timePart.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${suffix}`;
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

function _toResult(entry) {
  if (!entry) return null;
  const { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop,
          morningIconCode, morningLabel, afternoonIconCode, afternoonLabel } = entry;
  return { tempLabel, conditionLabel, glyph, high, low, morningGlyph, afternoonGlyph, pop,
           morningIconCode, morningLabel, afternoonIconCode, afternoonLabel };
}

function _isFresh(entry, isToday) {
  if (!entry?.fetched) return false;
  const ttl = isToday ? TTL_TODAY_MS : TTL_FORECAST_MS;
  return Date.now() - entry.fetched < ttl;
}

export async function geocodeLocation(loc) {
  const r = await fetch(`${OM_GEO_BASE}?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`);
  if (!r.ok) throw new Error(`Geocode ${r.status}`);
  const j = await r.json();
  const result = j.results?.[0];
  if (!result) throw new Error('Location not found');
  return { lat: result.latitude, lon: result.longitude, name: result.name,
           region: result.admin1 || '', country: result.country_code?.toUpperCase() || '' };
}

async function _fetchAndCache(loc, timezone) {
  let coords = _readCoords();
  if (!coords) {
    const geo = await geocodeLocation(loc);
    coords = { lat: geo.lat, lon: geo.lon };
    _writeCoords(coords.lat, coords.lon);
  }

  const url = `${OM_FORECAST_BASE}?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&hourly=weathercode` +
    `&temperature_unit=fahrenheit` +
    `&timezone=${encodeURIComponent(timezone)}` +
    `&forecast_days=5`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`OM ${r.status}`);
  const j = await r.json();

  const { daily, hourly } = j;

  // Build hourly lookup: dateKey → { amCode, pmCode } (closest hour to 9am / 3pm)
  const hourlyByDate = {};
  for (let i = 0; i < hourly.time.length; i++) {
    const [date, time] = hourly.time[i].split('T');
    const hour = parseInt(time);
    if (!hourlyByDate[date]) hourlyByDate[date] = { amDist: Infinity, pmDist: Infinity, amCode: null, pmCode: null };
    const slot = hourlyByDate[date];
    if (Math.abs(hour - 9) < slot.amDist)  { slot.amDist = Math.abs(hour - 9);  slot.amCode = hourly.weathercode[i]; }
    if (Math.abs(hour - 15) < slot.pmDist) { slot.pmDist = Math.abs(hour - 15); slot.pmCode = hourly.weathercode[i]; }
  }

  for (let i = 0; i < daily.time.length; i++) {
    const dk     = daily.time[i];
    const code   = daily.weathercode[i];
    const high   = Math.round(daily.temperature_2m_max[i]);
    const low    = Math.round(daily.temperature_2m_min[i]);
    const pop    = daily.precipitation_probability_max[i] ?? 0;
    const sunrise = _formatSunTime(daily.sunrise[i]);
    const sunset  = _formatSunTime(daily.sunset[i]);
    const h      = hourlyByDate[dk] || {};
    const amCode = h.amCode ?? code;
    const pmCode = h.pmCode ?? code;

    _writeCache(dk, {
      dateKey: dk,
      tempLabel: high + '°',
      conditionLabel: _wmoToShortLabel(code),
      glyph: _wmoToGlyph(code),
      high: high + '°',
      low: low + '°',
      morningGlyph:     _wmoToGlyph(amCode),
      afternoonGlyph:   _wmoToGlyph(pmCode),
      morningIconCode:  _wmoToIconCode(amCode),
      morningLabel:     _wmoToShortLabel(amCode),
      afternoonIconCode: _wmoToIconCode(pmCode),
      afternoonLabel:   _wmoToShortLabel(pmCode),
      pop,
      sunrise,
      sunset,
    });
  }
}

/**
 * Fetch weather for a specific date.
 * Returns: { tempLabel, conditionLabel, glyph, high, low, ... }
 *        | { isPast: true } | { isFuture: true } | null
 */
export async function fetchWeather(dateKey, settings) {
  const { weatherLocation: loc, timezone } = settings || {};
  if (!loc) return null;

  const today = _todayKey(timezone);
  const diff = _daysDiff(dateKey, today);
  if (diff < 0) return { isPast: true };
  if (diff > 4) return { isFuture: true };

  const cached = _readCache(dateKey);
  if (_isFresh(cached, dateKey === today)) return _toResult(cached);

  try { await _fetchAndCache(loc, timezone); } catch { return _toResult(cached); }
  return _toResult(_readCache(dateKey));
}

/**
 * Fetch 5-day forecast (today + 4) for the forecast sheet.
 * Returns array of { dateKey, ..., sunrise, sunset }.
 */
export async function fetchForecast(settings) {
  const { weatherLocation: loc, timezone } = settings || {};
  if (!loc) return [];

  const today = _todayKey(timezone);
  const dates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('en-CA');
  });

  const allCached = dates.map(dk => _readCache(dk));
  if (allCached.every(Boolean) && _isFresh(allCached[0], true)) {
    return allCached.map((d, i) => ({
      ..._toResult(d), dateKey: dates[i], sunrise: d.sunrise ?? null, sunset: d.sunset ?? null,
    }));
  }

  try { await _fetchAndCache(loc, timezone); } catch {}

  return dates.map(dk => {
    const d = _readCache(dk);
    if (!d) return null;
    return { ..._toResult(d), dateKey: dk, sunrise: d.sunrise ?? null, sunset: d.sunset ?? null };
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
