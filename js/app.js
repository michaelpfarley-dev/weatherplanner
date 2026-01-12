// WeatherPlanner v0.6.1 - Main Application

import { MAX_LOCATIONS, REFRESH_INTERVAL, STALE_THRESHOLD } from './config.js';
import { loadLocations, saveLocations, loadActivity, saveActivity, initDogWalkLocation } from './storage.js';
import { fetchForecast, fetchHourlyForecast, searchLocations } from './api.js';
import { renderChart, renderHourlyChart } from './render.js';

// App State
let currentActivity = loadActivity();
let resorts = loadLocations(currentActivity);
let cachedWeatherData = {};
let cachedHourlyData = {};
let lastUpdated = Date.now();

// Activity Management
function setActivity(activity) {
  currentActivity = activity;
  saveActivity(activity);
  document.querySelectorAll('.activity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.activity === activity);
  });
  updateTagline();
  cachedWeatherData = {};
  cachedHourlyData = {};

  if (activity === 'dogwalk') {
    initDogWalkLocation().then(locs => {
      resorts = locs;
      renderNav();
      renderEditList();
      loadAllResorts(false);
    });
  } else {
    resorts = loadLocations(activity);
    renderNav();
    renderEditList();
    loadAllResorts(false);
  }
}

function updateTagline() {
  const tagline = document.getElementById('tagline');
  if (!tagline) return;
  const taglines = {
    skiing: 'Plan your next day skiing',
    dogwalk: 'Plan your next dog walk'
  };
  tagline.textContent = taglines[currentActivity] || 'Plan your next adventure';
}

// Navigation and Edit UI
function renderNav() {
  const nav = document.getElementById('resortNav');
  nav.innerHTML = resorts.map(r => `<a class="resort-link" href="#${r.slug}">${r.name}</a>`).join('');
  const label = document.getElementById('locationsLabel');
  if (label) label.textContent = currentActivity === 'skiing' ? 'My Resorts:' : 'My Locations:';
}

function renderEditList() {
  const list = document.getElementById('resortList');
  const isSkiing = currentActivity === 'skiing';
  const itemLabel = isSkiing ? 'resort' : 'location';

  list.innerHTML = resorts.map((r, i) => `
    <div class="d-flex align-items-center gap-2 p-2 bg-light rounded mb-2">
      <div class="flex-grow-1">
        <div class="small">${r.name}</div>
        <div class="text-muted" style="font-size: 0.7rem;">${r.location || `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}`}</div>
      </div>
      <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="app.moveResort(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="app.moveResort(${i}, 1)" ${i === resorts.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="app.removeResort(${i})">✕</button>
    </div>
  `).join('');

  const editHeader = document.getElementById('editHeader');
  if (editHeader) editHeader.textContent = isSkiing ? 'Manage Resorts (max 10)' : 'Manage Locations (max 10)';

  const addSection = document.getElementById('addResortSection');
  if (resorts.length >= MAX_LOCATIONS) {
    addSection.innerHTML = `<p class="text-muted small text-center mb-0">Maximum of 10 ${itemLabel}s reached.</p>`;
  } else {
    const placeholder = isSkiing ? 'Resort name or nearby town...' : 'Address, city, or place name...';
    const tip = isSkiing ? 'Tip: Search by exact resort name or nearest town' : 'Tip: Search by city name, address, or landmark';
    addSection.innerHTML = `
      <h6 class="text-muted small">Add a ${itemLabel}</h6>
      <div class="input-group input-group-sm mb-2">
        <input type="text" class="form-control" id="searchInput" placeholder="${placeholder}">
        <button class="btn btn-primary" type="button" id="searchBtn">Search</button>
      </div>
      <div class="text-muted" style="font-size: 0.65rem; margin-top: -4px; margin-bottom: 8px;">${tip}</div>
      <div id="searchResults"></div>
    `;
    document.getElementById('searchBtn').addEventListener('click', doSearch);
    document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });
  }
}

// Resort Management
function moveResort(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= resorts.length) return;
  [resorts[index], resorts[newIndex]] = [resorts[newIndex], resorts[index]];
  saveLocations(currentActivity, resorts);
  renderNav(); renderEditList(); loadAllResorts();
}

function removeResort(index) {
  resorts.splice(index, 1);
  saveLocations(currentActivity, resorts);
  renderNav(); renderEditList(); loadAllResorts();
}

function addResort(resort) {
  if (resorts.length >= MAX_LOCATIONS) return;
  if (resorts.some(r => Math.abs(r.lat - resort.lat) < 0.01 && Math.abs(r.lon - resort.lon) < 0.01)) {
    alert('This location is already in your list.');
    return;
  }
  resorts.push(resort);
  saveLocations(currentActivity, resorts);
  renderNav(); renderEditList(); loadAllResorts();
  const results = document.getElementById('searchResults');
  if (results) results.innerHTML = '';
}

async function doSearch() {
  const input = document.getElementById('searchInput');
  const resultsDiv = document.getElementById('searchResults');
  const query = input.value.trim();
  if (!query) return;

  resultsDiv.innerHTML = '<p class="text-muted small">Searching...</p>';
  try {
    const results = await searchLocations(query);
    if (results.length === 0) {
      resultsDiv.innerHTML = '<p class="text-muted small">No results found.</p>';
      return;
    }
    resultsDiv.innerHTML = results.map(r => {
      const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const alreadyAdded = resorts.some(res => Math.abs(res.lat - r.latitude) < 0.01 && Math.abs(res.lon - r.longitude) < 0.01);
      const timezone = r.timezone || 'America/New_York';
      const location = [r.admin1, r.country].filter(Boolean).join(', ');
      return `
        <div class="search-result p-2 bg-light rounded mb-2 small">
          <div><div>${r.name}</div><div class="text-muted smaller">${r.admin1 || ''} ${r.country || ''} · ${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}</div></div>
          <button class="btn btn-sm btn-success py-0 px-2" ${alreadyAdded || resorts.length >= MAX_LOCATIONS ? 'disabled' : ''}
            onclick='app.addResort(${JSON.stringify({ slug, name: r.name, lat: r.latitude, lon: r.longitude, timezone, location })})'>${alreadyAdded ? 'Added' : 'Add'}</button>
        </div>
      `;
    }).join('');
  } catch (e) {
    resultsDiv.innerHTML = '<p class="text-danger small">Search failed. Please try again.</p>';
  }
}

// Data Loading
async function loadAllResorts(useCache = false) {
  const container = document.getElementById('chartsContainer');
  if (!useCache) {
    container.innerHTML = `<div class="col-12 text-center py-5"><div class="loading-spinner"></div><p class="text-muted">Loading forecasts...</p></div>`;
    cachedWeatherData = {};
    cachedHourlyData = {};
  }

  if (resorts.length === 0) {
    container.innerHTML = currentActivity === 'dogwalk'
      ? `<div class="col-12 text-center py-5"><h5 class="text-muted">🐕 No locations set</h5><p class="text-muted">Allow location access or add a location manually.</p></div>`
      : `<div class="col-12 text-center py-5"><h5 class="text-muted">🎿 No resorts added</h5><p class="text-muted">Add ski resorts using "Edit" above.</p></div>`;
    return;
  }

  const charts = [];
  for (const resort of resorts) {
    try {
      let data = useCache && cachedWeatherData[resort.slug] ? cachedWeatherData[resort.slug] : await fetchForecast(resort);
      cachedWeatherData[resort.slug] = data;
      charts.push(renderChart(resort, data, currentActivity));
    } catch (err) {
      console.error(`Failed to load ${resort.name}:`, err);
      charts.push(`<div class="col-12"><div class="chart-card" id="${resort.slug}"><div class="alert alert-danger mb-0">⚠️ Failed to load ${resort.name} forecast</div></div></div>`);
    }
  }

  container.innerHTML = charts.join('');
  attachToggleListeners();

  if (currentActivity === 'dogwalk') {
    for (const resort of resorts) {
      const card = document.getElementById(resort.slug);
      if (!card) continue;
      const dailyView = card.querySelector('.daily-view');
      const hourlyView = card.querySelector('.hourly-view');
      card.querySelectorAll('.view-toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'hourly'));
      if (dailyView) dailyView.style.display = 'none';
      if (hourlyView) hourlyView.style.display = 'block';

      try {
        let hourlyData = useCache && cachedHourlyData[resort.slug] ? cachedHourlyData[resort.slug] : await fetchHourlyForecast(resort);
        cachedHourlyData[resort.slug] = hourlyData;
        hourlyView.innerHTML = renderHourlyChart(resort, hourlyData, currentActivity);
      } catch (err) {
        hourlyView.innerHTML = '<div class="alert alert-danger mb-0">⚠️ Failed to load forecast</div>';
      }
    }
  }
}

// Event Listeners
function attachToggleListeners() {
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const view = e.target.dataset.view;
      const resortSlug = e.target.dataset.resort;
      const card = document.getElementById(resortSlug);
      card.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      const dailyView = card.querySelector('.daily-view');
      const hourlyView = card.querySelector('.hourly-view');

      if (view === 'daily') {
        dailyView.style.display = 'block';
        hourlyView.style.display = 'none';
      } else {
        dailyView.style.display = 'none';
        hourlyView.style.display = 'block';
        const resort = resorts.find(r => r.slug === resortSlug);
        if (resort && !cachedHourlyData[resortSlug]) {
          try {
            const data = await fetchHourlyForecast(resort);
            cachedHourlyData[resortSlug] = data;
            hourlyView.innerHTML = renderHourlyChart(resort, data, currentActivity);
          } catch (err) {
            hourlyView.innerHTML = '<div class="alert alert-danger mb-0">⚠️ Failed to load hourly data</div>';
          }
        } else if (cachedHourlyData[resortSlug]) {
          hourlyView.innerHTML = renderHourlyChart(resorts.find(r => r.slug === resortSlug), cachedHourlyData[resortSlug], currentActivity);
        }
      }
    });
  });

  document.querySelectorAll('.debug-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const resortSlug = e.target.dataset.resort;
      const resort = resorts.find(r => r.slug === resortSlug);
      const debugData = { resort, daily: cachedWeatherData[resortSlug], hourly: cachedHourlyData[resortSlug] };
      try {
        await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
        e.target.textContent = '✓';
        setTimeout(() => { e.target.textContent = '{ }'; }, 1500);
      } catch (err) {
        console.log('API Data:', debugData);
      }
    });
  });
}

// Refresh and Updates
function updateLastUpdatedDisplay() {
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  const mins = Math.floor((Date.now() - lastUpdated) / 60000);
  el.textContent = mins < 1 ? 'Updated just now' : mins === 1 ? 'Updated 1 min ago' : `Updated ${mins} min ago`;
}

function manualRefresh() {
  const btns = [document.getElementById('refreshBtn'), document.getElementById('refreshBtnMobile')];
  btns.forEach(btn => { if (btn) { btn.disabled = true; btn.classList.add('spinning'); } });
  loadAllResorts(false).then(() => {
    lastUpdated = Date.now();
    updateLastUpdatedDisplay();
    btns.forEach(btn => { if (btn) { btn.disabled = false; btn.classList.remove('spinning'); } });
  });
}

// Initialization
async function init() {
  console.log('WeatherPlanner initializing...');
  try {
    document.querySelectorAll('.activity-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.activity === currentActivity);
    });
    updateTagline();

    if (currentActivity === 'dogwalk') {
      resorts = await initDogWalkLocation();
    } else {
      resorts = loadLocations(currentActivity);
    }

    console.log('Loaded resorts:', resorts);

    renderNav();
    renderEditList();
    await loadAllResorts();

    console.log('WeatherPlanner initialized successfully');

    setInterval(updateLastUpdatedDisplay, 60000);
    setInterval(() => { loadAllResorts(false).then(() => { lastUpdated = Date.now(); updateLastUpdatedDisplay(); }); }, REFRESH_INTERVAL);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdated > STALE_THRESHOLD) {
        loadAllResorts(false).then(() => { lastUpdated = Date.now(); updateLastUpdatedDisplay(); });
      }
    });

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => loadAllResorts(true), 250);
    });
  } catch (err) {
    console.error('WeatherPlanner init error:', err);
    document.getElementById('chartsContainer').innerHTML = `<div class="col-12"><div class="alert alert-danger">Error initializing: ${err.message}</div></div>`;
  }
}

// Expose to global scope for onclick handlers
window.app = { setActivity, moveResort, removeResort, addResort, manualRefresh, init };

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
