// Data layer for the weather panel. No DOM stuff in here yet -
// I want to be able to run `node app.js` and sanity check the API
// calls + merch logic before building any UI on top of it.

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 8000;

const weatherMap = {
  0:  { text: 'Clear sky', condition: 'default' },
  1:  { text: 'Mainly clear', condition: 'default' },
  2:  { text: 'Partly cloudy', condition: 'default' },
  3:  { text: 'Overcast', condition: 'default' },
  45: { text: 'Fog', condition: 'default' },
  48: { text: 'Depositing rime fog', condition: 'cold' },
  51: { text: 'Light drizzle', condition: 'rain' },
  53: { text: 'Moderate drizzle', condition: 'rain' },
  55: { text: 'Dense drizzle', condition: 'rain' },
  61: { text: 'Slight rain', condition: 'rain' },
  63: { text: 'Moderate rain', condition: 'rain' },
  65: { text: 'Heavy rain', condition: 'rain' },
  71: { text: 'Slight snow', condition: 'cold' },
  73: { text: 'Moderate snow', condition: 'cold' },
  75: { text: 'Heavy snow', condition: 'cold' },
  95: { text: 'Thunderstorm', condition: 'rain' }
};

const merchMessages = {
  rain: 'Waterproofs are 20% off this week',
  cold: 'Time for knitwear',
  default: 'Check out our new arrivals'
};

async function fetchJSON(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new Error('The weather service is taking too long to respond.');
    throw new Error('Could not reach the weather service. Check your connection.');
  }
  if (!res.ok) throw new Error('The weather service returned an error. Please try again.');
  return res.json();
}

// NB: the API omits `results` entirely when nothing matches, hence the || []
async function geocode(name) {
  const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=5&countryCode=GB`;
  const data = await fetchJSON(url);
  return data.results || [];
}

async function getForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Europe/London',
    forecast_days: 4
  });
  return fetchJSON(`${FORECAST_URL}?${params}`);
}

function describeWeather(code) {
  return weatherMap[code] || { text: 'Unknown', condition: 'default' };
}

// Rain takes priority. The extra feels-like check is because a clear day
// at 2 degrees would otherwise show "new arrivals" instead of knitwear.
function getMerchCondition(code, feelsLike) {
  let { condition } = describeWeather(code);
  if (condition === 'default' && feelsLike < 8) condition = 'cold';
  return condition;
}

// --- UI wiring, browser only below this point ---

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function initUI() {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  const statusEl = document.getElementById('status');

  const runSearch = debounce(async () => {
    const query = input.value.trim();
    resultsEl.innerHTML = '';
    statusEl.textContent = '';
    if (query.length < 2) return; // geocoder needs 2+ chars anyway

    try {
      const places = await geocode(query);
      if (input.value.trim() !== query) return; // user kept typing, this response is stale
      if (!places.length) {
        statusEl.textContent = `No UK locations found for "${query}"`;
        return;
      }
      for (const place of places) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = place.admin1 ? `${place.name}, ${place.admin1}` : place.name;
        btn.addEventListener('click', () => selectPlace(place));
        const li = document.createElement('li');
        li.appendChild(btn);
        resultsEl.appendChild(li);
      }
    } catch (err) {
      statusEl.textContent = err.message;
    }
  }, 300);

  input.addEventListener('input', runSearch);

  // never show an empty panel - default to Manchester *ideally the retailers location* (TODO: remember last choice, make into a config)
  loadWeather({ name: 'Manchester', latitude: 53.48, longitude: -2.24 });
}

function selectPlace(place) {
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = place.name;
  loadWeather(place);
}

async function loadWeather(place) {
  const statusEl = document.getElementById('status');
  const currentEl = document.getElementById('current');

  statusEl.textContent = 'Loading weather...';
  currentEl.classList.add('loading');
  try {
    const forecast = await getForecast(place.latitude, place.longitude);
    statusEl.textContent = '';
    renderCurrent(place, forecast.current);
    renderOutlook(forecast.daily);
    renderMerch(forecast.current);
  } catch (err) {
    statusEl.textContent = err.message; // TODO: retry button
  } finally {
    currentEl.classList.remove('loading');
  }
}

function renderCurrent(place, c) {
  const el = document.getElementById('current');
  el.innerHTML = `
    <h3 class="place-name"></h3>
    <p class="temp">${Math.round(c.temperature_2m)}°C</p>
    <p>Feels like ${Math.round(c.apparent_temperature)}°C</p>
    <p>${describeWeather(c.weather_code).text}</p>
    <p>Wind ${Math.round(c.wind_speed_10m)} km/h</p>`;
  // name comes from the geocoding API, so treat it as text not markup
  el.querySelector('.place-name').textContent = place.name;
}

// daily arrays include today at index 0 - the outlook is the NEXT 3 days
function renderOutlook(d) {
  const el = document.getElementById('outlook');
  el.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const row = document.createElement('div');
    row.className = 'day';
    row.innerHTML = `
      <span class="day-name">${new Date(d.time[i]).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
      <span>${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°</span>
      <span>${d.precipitation_probability_max[i]}% rain</span>
      <span>${describeWeather(d.weather_code[i]).text}</span>`;
    el.appendChild(row);
  }
}

function renderMerch(c) {
  const condition = getMerchCondition(c.weather_code, c.apparent_temperature);
  document.getElementById('merch-message').textContent = merchMessages[condition];
}

// Quick smoke test - only runs under node, browser skips this and wires the UI instead
const isNode = typeof window === 'undefined';
if (isNode) {
  demo();
} else {
  document.addEventListener('DOMContentLoaded', initUI);
}

async function demo() {
  const assert = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); };

  // pure logic first, no network needed for these
  assert(describeWeather(61).text === 'Slight rain', 'code 61 maps to rain text');
  assert(describeWeather(999).text === 'Unknown', 'unknown code falls back safely');
  assert(getMerchCondition(61, 15) === 'rain', 'rain code -> rain');
  assert(getMerchCondition(0, 2) === 'cold', 'clear but 2C feels-like -> cold');
  assert(getMerchCondition(0, 15) === 'default', 'clear and mild -> default');
  console._log('Logic checks passed.\n');

  // now hit the real endpoints
  const noResults = await geocode('m1 5gl');
  assert(noResults.length === 0, 'bogus name returns empty results');
  console._log('No-results check passed (zzzzzzzz -> 0 results).\n');

  const [place] = await geocode('London');
  assert(place, 'Manchester geocodes');
  console._log(`Location: ${place.name}, ${place.admin1} (${place.latitude}, ${place.longitude})\n`);

  const forecast = await getForecast(place.latitude, place.longitude);
  const c = forecast.current;
  const condition = getMerchCondition(c.weather_code, c.apparent_temperature);
  console._log(`Now: ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C), ` +
    `${describeWeather(c.weather_code).text}, wind ${c.wind_speed_10m} km/h`);
  console._log(`Merch: [${condition}] "${merchMessages[condition]}"\n`);

  const d = forecast.daily;
  console._log('3-day outlook:');
  for (let i = 1; i <= 3; i++) {
    const day = new Date(d.time[i]).toLocaleDateString('en-GB', { weekday: 'short' });
    console._log(`  ${day}: ${d.temperature_2m_max[i]}° / ${d.temperature_2m_min[i]}°, ` +
      `${d.precipitation_probability_max[i]}% rain, ${describeWeather(d.weather_code[i]).text}`);
  }
}
