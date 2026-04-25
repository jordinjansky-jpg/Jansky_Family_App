# Weather Widget — Design Spec (1.4)

**Date:** 2026-04-25
**Status:** Approved — ready for implementation plan
**Backlog item:** 1.4 — Weather Widget
**Predecessor spec:** [2026-04-25-dashboard-final-design.md](2026-04-25-dashboard-final-design.md) §3.3 (Ambient strip)
**Related:** 1.3 Meals (already shipped — ambient strip component exists), 1.5 Kiosk

---

## 1. Goal

Wire the weather half of the ambient strip. The `renderAmbientStrip` component and the dashboard mount already exist — the weather chip currently renders with `weatherData = null`. This spec adds the fetch layer (`shared/weather.js`), admin configuration (location + API key), the 5-day forecast bottom sheet, and flips the `ambientStrip` default to `true` now that both 1.3 and 1.4 are shipped.

---

## 2. Data & Schema

### Firebase `rundown/settings` additions

```
weatherLocation: string   // "Lakeville, MN" or "55044" — OWM accepts both formats
weatherApiKey:  string    // OpenWeatherMap API key
```

No schema migration needed — both keys are additive. Existing families without these set get the empty-state chip (`—° · Set location`).

### localStorage cache

One entry per date, keyed `dr-weather-{YYYY-MM-DD}`:

```json
{
  "fetched": 1714100000000,
  "tempLabel": "58°",
  "conditionLabel": "Sunny",
  "glyph": "sun",
  "high": "63°",
  "low": "44°"
}
```

**TTL:** 60 minutes for today. Future days: cache-on-miss only (re-fetch once per session). Past dates skip the cache check entirely — return `{ isPast: true }` immediately, no network call.

---

## 3. `shared/weather.js` Module

New pure module. No DOM access. Two exports.

### `fetchWeather(dateKey, settings)`

```js
// dateKey: 'YYYY-MM-DD'
// settings: { weatherLocation, weatherApiKey, timezone }
// Returns: WeatherData | null
//
// WeatherData:
//   { tempLabel, conditionLabel, glyph, high, low }          — populated
//   { isPast: true }                                          — past date
//   { isFuture: true }                                        — beyond 5-day window
```

Logic:
1. If `!settings.weatherLocation || !settings.weatherApiKey` → return `null`.
2. Compare `dateKey` to today (via `settings.timezone`):
   - Past date → return `{ isPast: true }`.
   - More than 4 days ahead → return `{ isFuture: true }`.
3. Check cache: `localStorage.getItem('dr-weather-' + dateKey)`. Parse JSON. If present and within TTL (today: 60 min; future: any age) → return cached data.
4. Fetch from OWM (two parallel calls, Promise.all):
   - **Current:** `GET /data/2.5/weather?q={loc}&appid={key}&units=imperial`
   - **Forecast:** `GET /data/2.5/forecast?q={loc}&appid={key}&units=imperial&cnt=40`
5. From current response: extract `temp`, `weather[0]` for today's entry.
6. From forecast response: group 3-hour intervals by local date. For each date, find `temp_max` (high) and `temp_min` (low) across all intervals; pick the most common `weather[0].id` for the condition.
7. Write all resolved dates to localStorage cache.
8. Return the entry matching `dateKey`.
9. On any fetch error: if a stale cache entry exists, return it. Otherwise return `null`.

### `fetchForecast(settings)`

```js
// Returns: Array<WeatherData & { dateKey }> — today through today+4
// Used by the forecast sheet to populate all 5 rows at once.
```

Calls the same two OWM endpoints. Returns the full 5-day array sorted ascending. Falls back to whatever is cached if the network call fails.

### OWM condition code → glyph mapping

| Code range | Glyph |
|---|---|
| 2xx (thunderstorm) | `rain` |
| 3xx (drizzle) | `rain` |
| 5xx (rain) | `rain` |
| 6xx (snow) | `snow` |
| 7xx (atmosphere / fog / mist) | `fog` |
| 800 (clear sky) | `sun` |
| 80x (clouds) | `cloud` |

The 5 SVG glyphs (`sun`, `cloud`, `rain`, `snow`, `fog`) are already defined in `renderAmbientStrip` in `shared/components.js`. The forecast sheet uses the same set.

---

## 4. Admin Settings

### New "Weather" fieldset

Added between the existing **Family** and **Display** fieldsets in Admin → Settings.

```html
<fieldset class="admin-form__fieldset">
  <legend>Weather</legend>

  <!-- Location -->
  <div class="admin-form__group">
    <label class="form-label" for="sf_weatherLocation">Location</label>
    <div class="form-hint">Zip code or "City, State". Example: Lakeville, MN</div>
    <div class="admin-form__row">
      <input class="form-input" id="sf_weatherLocation" type="text"
             placeholder="Lakeville, MN" value="{settings.weatherLocation}">
      <button class="btn btn--secondary btn--sm" id="sf_weatherTest" type="button">Test</button>
    </div>
    <div id="sf_weatherTestResult" class="form-hint" hidden></div>
  </div>

  <!-- API key -->
  <div class="admin-form__group">
    <label class="form-label" for="sf_weatherApiKey">OpenWeatherMap API key</label>
    <div class="form-hint">
      Free at openweathermap.org — 1,000 calls/day included.
    </div>
    <input class="form-input form-input--mono" id="sf_weatherApiKey"
           type="text" value="{settings.weatherApiKey || ''}">
  </div>
</fieldset>
```

**Test button behavior:**
1. Reads `#sf_weatherLocation` and `#sf_weatherApiKey` values (not saved yet — reads the live field).
2. Calls `fetchWeather(todayKey, { weatherLocation, weatherApiKey, timezone })`.
3. On success: shows `#sf_weatherTestResult` with `✓ {location} · {temp}°F · {condition}` in a success style.
4. On failure (bad key, unknown location): shows error copy `✗ Couldn't fetch — check location and API key`.
5. Clears the result div after 10 seconds.

**Save handler additions:**
```js
weatherLocation: main.querySelector('#sf_weatherLocation')?.value.trim() || '',
weatherApiKey:   main.querySelector('#sf_weatherApiKey')?.value.trim() || '',
```

When `weatherLocation` changes on save, clear all `dr-weather-*` entries from localStorage so stale data from the old location is evicted immediately.

---

## 5. Dashboard Wiring

### Fetch on render

Replace the stub in `dashboard.js`:

```js
// Before:
const weatherData = null; // Wired by 1.4.

// After:
const weatherData = await fetchWeather(viewDateKey, settings);
```

`fetchWeather` is async but cache-hits return synchronously (via a resolved promise). First load incurs one network round-trip; subsequent renders within the TTL are instant.

### Weather chip tap handler

In the existing `.ambient-chip` listener block (currently `// weather chip: wired by 1.4`):

```js
if (chip.dataset.chip === 'weather') {
  if (!settings?.weatherLocation || !settings?.weatherApiKey) {
    // No config — route to admin settings
    location.href = 'admin.html';
    return;
  }
  if (weatherData?.isPast || weatherData?.isFuture) {
    // Past days have no forecast; future days beyond the window have no data.
    // Chip is informational only — tap is a no-op.
    return;
  }
  const forecastDays = await fetchForecast(settings);
  openWeatherSheet(forecastDays);
}
```

`openWeatherSheet(days)` mounts the forecast sheet into `#taskSheetMount` (same mount as other sheets). Sheet is closeable via drag-down or the Close button.

**Note:** The forecast sheet always shows today + 4 days regardless of which `viewDate` the user is browsing. `fetchForecast` anchors to today — the OWM free endpoint only gives a forward-from-now window. When viewing a future date within the window (e.g., tomorrow), the chip shows that date's weather but the sheet still opens the standard 5-day view. This is intentional and consistent with how forecast apps work.

### `ambientStrip` default flip

Now that both 1.3 and 1.4 are shipped, `ambientStrip` defaults to `true`. Change all `settings?.ambientStrip` checks to `settings?.ambientStrip ?? true`. Affects:
- `dashboard.js` render gate
- `admin.html` checkbox: `(settings?.ambientStrip ?? true) ? ' checked' : ''`

---

## 6. Forecast Sheet Component

New `renderWeatherSheet(days)` export in `shared/components.js`.

**`days`:** Array of up to 5 `{ dateKey, tempLabel, conditionLabel, glyph, high, low }` objects, sorted ascending. Any entry may be `null` (API gap) — render a `—` placeholder row in that case.

**DOM:**
```html
<div class="sheet" id="weatherSheet">
  <div class="sheet__handle"></div>
  <div class="sheet__header">
    <div class="sheet__title">Weather</div>
  </div>
  <div class="sheet__body">
    {rows}
  </div>
  <div class="sheet__footer">
    <button class="btn btn--secondary btn--full" id="weatherSheetClose">Close</button>
  </div>
</div>
```

**Row markup:**
```html
<div class="weather-row">
  <div class="weather-row__day">
    <strong>{Today | Tomorrow | Weekday}</strong>
    <span>{Mon, Apr 28}</span>
  </div>
  <div class="weather-row__glyph">{svg glyph}</div>
  <div class="weather-row__data">
    <strong>{58°}</strong>
    <span>H:{63°} L:{44°}</span>
    <span>{Sunny}</span>
  </div>
</div>
```

Day label logic: `dateKey === today` → "Today"; `dateKey === tomorrow` → "Tomorrow"; otherwise short weekday name ("Monday", "Tuesday", etc.).

---

## 7. States

| Condition | Chip value | Sheet behavior |
|---|---|---|
| No location / no API key | `—° · Set location` | Tap → `admin.html` |
| Past date | `Past day` | Tap → no sheet (past days have no forecast) |
| Future > 4 days | `—° · No forecast yet` | Tap → no sheet |
| Fetch error, cache available | Uses stale cache | Sheet opens with stale data (no error shown) |
| Fetch error, no cache | `—° · Set location` (fallback to empty) | Tap → `admin.html` |
| Populated | `58° · Sunny` | Tap → 5-day sheet |

---

## 8. Kid Mode & Kiosk

**Kid mode:** Ambient strip is not rendered in kid mode (spec §3.3 — kid mode has its own Today tiles). No changes.

**Kiosk (1.5):** Per the dashboard spec kiosk reflection table, weather lives in the kiosk header strip. `shared/weather.js` is importable by `display.html` without modification — no kiosk-specific work in this PR. Note the dependency so kiosk doesn't have to re-solve the fetch layer.

---

## 9. Decisions Log

| Decision | Rationale |
|---|---|
| °F hardcoded | Family is US-based; a unit toggle adds admin surface area for no gain. |
| Location: zip or "City, State" accepted | OWM handles both; single field is simpler than two. |
| API key in Firebase settings | Consistent with admin PIN storage; family-internal app, key is not a meaningful secret. |
| Free `/forecast` endpoint (5 days, not 7) | OWM One Call 3.0 requires a credit card subscription even at $0; not worth the friction for 2 extra days. |
| `shared/weather.js` module | Follows existing shared-module pattern; kiosk imports for free. |
| 60-min TTL today, cache-on-miss future | Balances freshness vs. OWM free-tier call budget (~10 calls/day typical). |
