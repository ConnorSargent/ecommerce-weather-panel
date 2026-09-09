// Weather panel - Open-Meteo data layer up top, UI wiring below.

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 8000;

// shown before the user picks anything - the retailer's home city, so it gets
// an "our store" badge. Would be a theme setting if this becomes a Shopify section
const DEFAULT_LOCATION = { name: 'Manchester', latitude: 53.48, longitude: -2.24, isStore: true };

const weatherMap = {
  0:  { text: 'Clear sky', condition: 'default', icon: '☀️' },
  1:  { text: 'Mainly clear', condition: 'default', icon: '🌤️' },
  2:  { text: 'Partly cloudy', condition: 'default', icon: '⛅' },
  3:  { text: 'Overcast', condition: 'default', icon: '☁️' },
  45: { text: 'Fog', condition: 'default', icon: '🌫️' },
  48: { text: 'Depositing rime fog', condition: 'cold', icon: '🌫️' },
  51: { text: 'Light drizzle', condition: 'rain', icon: '🌦️' },
  53: { text: 'Moderate drizzle', condition: 'rain', icon: '🌦️' },
  55: { text: 'Dense drizzle', condition: 'rain', icon: '🌧️' },
  61: { text: 'Slight rain', condition: 'rain', icon: '🌧️' },
  63: { text: 'Moderate rain', condition: 'rain', icon: '🌧️' },
  65: { text: 'Heavy rain', condition: 'rain', icon: '🌧️' },
  71: { text: 'Slight snow', condition: 'cold', icon: '🌨️' },
  73: { text: 'Moderate snow', condition: 'cold', icon: '🌨️' },
  75: { text: 'Heavy snow', condition: 'cold', icon: '❄️' },
  95: { text: 'Thunderstorm', condition: 'rain', icon: '⛈️' }
};

// headline + CTA move together per weather state. In a real store each
// would also carry its own collection URL
const merchMessages = {
  rain: { message: 'Waterproofs are 20% off this week', cta: 'Shop Waterproofs' },
  cold: { message: 'Time for knitwear', cta: 'Shop Knitwear' },
  default: { message: 'Check out our new arrivals', cta: 'Shop New Arrivals' }
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
  return weatherMap[code] || { text: 'Unknown', condition: 'default', icon: '🌡️' };
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

  // dropdown overlays the page now, so close it on any outside click
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.search')) resultsEl.innerHTML = '';
  });

  // never show an empty panel - last place they picked, or the configured default
  let place = DEFAULT_LOCATION;
  try {
    const saved = JSON.parse(localStorage.getItem('lastLocation'));
    if (saved && saved.name && saved.latitude != null) place = saved;
  } catch { /* corrupt/blocked storage - the default covers it */ }
  loadWeather(place);
}

function selectPlace(place) {
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = place.name;
  try {
    localStorage.setItem('lastLocation', JSON.stringify({
      name: place.name, latitude: place.latitude, longitude: place.longitude
    }));
  } catch { /* private mode etc - remembering is a nice-to-have */ }
  loadWeather(place);
}

async function loadWeather(place) {
  const statusEl = document.getElementById('status');
  const currentEl = document.getElementById('current');

  statusEl.textContent = 'Loading weather...';
  currentEl.classList.add('loading');
  try {
    // ?spoof=down simulates the weather API being unreachable
    if (new URLSearchParams(location.search).get('spoof') === 'down') throw new Error('spoofed outage');
    const forecast = await getForecast(place.latitude, place.longitude);
    applySpoof(forecast);
    statusEl.textContent = '';
    renderCurrent(place, forecast.current);
    renderOutlook(forecast.daily);
    renderMerch(place, forecast.current);
  } catch (err) {
    // searched place failed? fall back to the store's weather once
    if (!place.isStore) {
      await loadWeather(DEFAULT_LOCATION);
      statusEl.textContent = `Couldn't get weather for ${place.name} - showing our store instead.`;
      return;
    }
    // API is down entirely - drop the weather UI and run as a plain merch section
    document.querySelector('.panel').classList.add('weather-down');
    document.getElementById('merch-context').textContent = 'Fresh in this week';
    document.getElementById('merch-message').textContent = merchMessages.default.message;
    document.querySelector('.shop-all').textContent = merchMessages.default.cta;
  } finally {
    currentEl.classList.remove('loading');
  }
}

// Demo helper: add ?spoof=rain|cold|clear to the URL to force a weather
// state and preview the matching merch message without waiting for real rain
function applySpoof(forecast) {
  const spoof = new URLSearchParams(location.search).get('spoof');
  const override = {
    rain: { weather_code: 63, apparent_temperature: 11 },
    cold: { weather_code: 71, apparent_temperature: 1 },
    clear: { weather_code: 0, apparent_temperature: 15 }
  }[spoof];
  if (override) Object.assign(forecast.current, override);
}

function renderCurrent(place, c) {
  const el = document.getElementById('current');
  const weather = describeWeather(c.weather_code);
  el.innerHTML = `
    <h3 class="place-name"></h3>
    <p class="temp">${Math.round(c.temperature_2m)}°C</p>
    <p class="condition">${weather.icon} ${weather.text}</p>
    <dl class="stats">
      <div><dt>Feels like</dt><dd>${Math.round(c.apparent_temperature)}°C</dd></div>
      <div><dt>Wind</dt><dd>${Math.round(c.wind_speed_10m)} km/h</dd></div>
      <div><dt>Rain now</dt><dd>${c.precipitation} mm</dd></div>
    </dl>`;
  // name comes from the geocoding API, so treat it as text not markup
  const nameEl = el.querySelector('.place-name');
  nameEl.textContent = place.name;
  if (place.isStore) {
    const badge = document.createElement('span');
    badge.className = 'store-badge';
    badge.textContent = 'Our store';
    nameEl.append(badge);
  }
}

// daily arrays include today at index 0 - the outlook is the NEXT 3 days
function renderOutlook(d) {
  const el = document.getElementById('outlook');
  el.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const w = describeWeather(d.weather_code[i]);
    const row = document.createElement('div');
    row.className = 'day';
    row.innerHTML = `
      <span class="day-icon">${w.icon}</span>
      <div class="day-main">
        <span class="day-name">${new Date(d.time[i]).toLocaleDateString('en-GB', { weekday: 'long' })}</span>
        <span class="day-cond">${w.text}</span>
      </div>
      <div class="day-temps">
        <span class="day-range">${Math.round(d.temperature_2m_max[i])}° <span class="day-lo">/ ${Math.round(d.temperature_2m_min[i])}°</span></span>
        <span class="day-rain">💧 ${d.precipitation_probability_max[i]}%</span>
      </div>`;
    el.appendChild(row);
  }
}

function renderMerch(place, c) {
  const condition = getMerchCondition(c.weather_code, c.apparent_temperature);
  const { message, cta } = merchMessages[condition];
  // staff-pick framing only makes sense at our own store's weather
  document.getElementById('merch-context').textContent = place.isStore ? "What we're wearing today" : '';
  document.getElementById('merch-message').textContent = message;
  document.querySelector('.shop-all').textContent = cta;
}

document.addEventListener('DOMContentLoaded', initUI);
