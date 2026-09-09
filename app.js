// Weather panel - Open-Meteo data layer up top, UI wiring below.

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 8000;

// shown before the user picks anything - the retailer's home city, so it gets
// an "our store" badge. Would be a theme setting if this becomes a Shopify section
const DEFAULT_LOCATION = { name: 'Manchester', latitude: 53.48, longitude: -2.24, isStore: true };

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
    const forecast = await getForecast(place.latitude, place.longitude);
    statusEl.textContent = '';
    renderCurrent(place, forecast.current);
    renderOutlook(forecast.daily);
    renderMerch(forecast.current);
  } catch (err) {
    statusEl.textContent = err.message;
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

document.addEventListener('DOMContentLoaded', initUI);
