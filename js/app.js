// GoWindow v0.28.0 - Main Application

import { MAX_LOCATIONS, REFRESH_INTERVAL, STALE_THRESHOLD, SUGGESTED_RESORTS } from './config.js';
import { loadLocations, saveLocations, loadActivity, saveActivity, loadChartMode, saveChartMode, initDogWalkLocation } from './storage.js';
import { fetchForecast, fetchHourlyForecast, searchLocations, getTimezoneForCoords } from './api.js';
import { renderChart, renderHourlyChart } from './render.js';
import { SKI_RESORTS, filterResorts, getResortStates, getResortsByState } from './resorts.js';

// One-time migration: clear locations to show new UI (v0.30)
const MIGRATION_KEY = 'gowindow-migration-v030';
if (!localStorage.getItem(MIGRATION_KEY)) {
  localStorage.removeItem('weatherplanner-locations-skiing');
  localStorage.removeItem('weatherplanner-locations-dogwalk');
  localStorage.setItem(MIGRATION_KEY, 'done');
}

// App State
let currentActivity = loadActivity();
let currentChartMode = loadChartMode();
let resorts = loadLocations(currentActivity);
let cachedWeatherData = {};
let cachedHourlyData = {};
let lastUpdated = Date.now();

// Activity Management
function setActivity(activity) {
  currentActivity = activity;
  saveActivity(activity);
  document.querySelectorAll('.activity-link').forEach(link => {
    link.classList.toggle('active', link.dataset.activity === activity);
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
    skiing: 'Find your skiing weather window.',
    dogwalk: 'Find your dog walk weather window.'
  };
  tagline.textContent = taglines[currentActivity] || 'Find your weather window.';
}

// Chart Mode Management
function setChartMode(mode) {
  currentChartMode = mode;
  saveChartMode(mode);
  document.querySelectorAll('.chart-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  updateChartLegend();
  loadAllResorts(true);
}

function updateChartLegend() {
  const legendItems = document.getElementById('chartLegendItems');
  if (!legendItems) return;
  if (currentChartMode === 'simple') {
    legendItems.innerHTML = `
      <span><span class="legend-bar-icon"></span> Hi/Lo</span>
      <span><span class="legend-line freezing"></span> 32°F</span>
    `;
  } else {
    legendItems.innerHTML = `
      <span><span class="legend-line temp-high"></span> Temp</span>
      <span><span class="legend-line precip"></span> Precip</span>
      <span><span class="legend-line freezing"></span> 32°F</span>
    `;
  }
}

// Navigation and Edit UI
function renderNav() {
  const nav = document.getElementById('resortNav');
  nav.innerHTML = resorts.map(r => `<a class="resort-link" href="#${r.slug}">${r.name}</a>`).join('');
  const label = document.getElementById('locationsLabel');
  if (label) label.textContent = 'My Locations:';
}

function renderEditList() {
  const list = document.getElementById('resortList');
  const isSkiing = currentActivity === 'skiing';
  const itemLabel = 'location';

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
  if (editHeader) editHeader.textContent = `Manage Locations (max ${MAX_LOCATIONS})`;

  const addSection = document.getElementById('addResortSection');
  const maxReached = resorts.length >= MAX_LOCATIONS;

  if (maxReached) {
    addSection.innerHTML = `<p class="text-muted small text-center mb-0">Maximum of ${MAX_LOCATIONS} ${itemLabel}s reached.</p>`;
  } else if (isSkiing) {
    // 3-section UI for skiing mode
    addSection.innerHTML = `
      <div class="add-section-container">
        <!-- Section 1: Ski Resorts -->
        <div class="add-method-section">
          <h6 class="add-method-header">🎿 Add Ski Location</h6>
          <div class="input-group input-group-sm mb-2">
            <input type="text" class="form-control" id="resortSearchInput" placeholder="Search 510 US ski locations...">
          </div>
          <div id="resortSearchResults" class="resort-search-results"></div>
          <div id="resortStateList" class="resort-state-list"></div>
        </div>

        <!-- Section 2: City/Zip -->
        <div class="add-method-section">
          <h6 class="add-method-header">📍 Search by City/Zip</h6>
          <div class="input-group input-group-sm mb-2">
            <input type="text" class="form-control" id="citySearchInput" placeholder="City, state or zip code...">
            <button class="btn btn-primary" type="button" id="citySearchBtn">Search</button>
          </div>
          <div id="citySearchResults"></div>
        </div>

        <!-- Section 3: Coordinates -->
        <div class="add-method-section">
          <h6 class="add-method-header">🌐 Enter Coordinates</h6>
          <div class="row g-2 mb-2">
            <div class="col">
              <input type="text" class="form-control form-control-sm" id="coordName" placeholder="Location name *">
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col">
              <input type="number" class="form-control form-control-sm" id="coordLat" placeholder="Latitude" step="any" min="-90" max="90">
            </div>
            <div class="col">
              <input type="number" class="form-control form-control-sm" id="coordLon" placeholder="Longitude" step="any" min="-180" max="180">
            </div>
            <div class="col-auto">
              <button class="btn btn-primary btn-sm" type="button" id="coordAddBtn">Add</button>
            </div>
          </div>
          <div id="coordError" class="text-danger small"></div>
        </div>
      </div>
    `;

    // Resort search - type-ahead
    const resortInput = document.getElementById('resortSearchInput');
    resortInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      renderResortSearchResults(query);
    });

    // Show state list initially
    renderResortStateList();

    // City/Zip search
    document.getElementById('citySearchBtn').addEventListener('click', doCitySearch);
    document.getElementById('citySearchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') doCitySearch(); });

    // Coordinate entry
    document.getElementById('coordAddBtn').addEventListener('click', addFromCoordinates);

  } else {
    // Dog walk mode - simple city/zip search
    addSection.innerHTML = `
      <h6 class="text-muted small">Add a ${itemLabel}</h6>
      <div class="input-group input-group-sm mb-2">
        <input type="text" class="form-control" id="searchInput" placeholder="Address, city, or place name...">
        <button class="btn btn-primary" type="button" id="searchBtn">Search</button>
      </div>
      <div class="text-muted" style="font-size: 0.65rem; margin-top: -4px; margin-bottom: 8px;">Tip: Search by city name, address, or landmark</div>
      <div id="searchResults"></div>
    `;
    document.getElementById('searchBtn').addEventListener('click', doSearch);
    document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });
  }

  // Add reset button if there are locations
  const existingReset = addSection.parentNode.querySelector('.reset-section');
  if (existingReset) existingReset.remove();

  if (resorts.length > 0) {
    const resetDiv = document.createElement('div');
    resetDiv.className = 'text-center mt-3 pt-3 border-top reset-section';
    resetDiv.innerHTML = `<button class="btn btn-sm btn-outline-danger" onclick="app.resetLocations()">Reset All Locations</button>`;
    addSection.parentNode.appendChild(resetDiv);
  }
}

// Render resort search results (type-ahead)
function renderResortSearchResults(query) {
  const resultsDiv = document.getElementById('resortSearchResults');
  const stateListDiv = document.getElementById('resortStateList');

  if (!query || query.length < 2) {
    resultsDiv.innerHTML = '';
    stateListDiv.style.display = '';
    return;
  }

  stateListDiv.style.display = 'none';
  const results = filterResorts(query);

  if (results.length === 0) {
    resultsDiv.innerHTML = '<p class="text-muted small">No locations found.</p>';
    return;
  }

  resultsDiv.innerHTML = results.map(r => {
    const alreadyAdded = resorts.some(res => Math.abs(res.lat - r.lat) < 0.01 && Math.abs(res.lon - r.lon) < 0.01);
    return `
      <div class="resort-result p-2 bg-light rounded mb-1 small d-flex justify-content-between align-items-center">
        <div>
          <div>${r.name}</div>
          <div class="text-muted" style="font-size: 0.65rem;">${r.state}</div>
        </div>
        <button class="btn btn-sm btn-success py-0 px-2" ${alreadyAdded || resorts.length >= MAX_LOCATIONS ? 'disabled' : ''}
          onclick='app.addSkiResort(${JSON.stringify(r).replace(/'/g, "&#39;")})'>${alreadyAdded ? 'Added' : 'Add'}</button>
      </div>
    `;
  }).join('');
}

// Render state list for browsing resorts
function renderResortStateList() {
  const stateListDiv = document.getElementById('resortStateList');
  if (!stateListDiv) return;

  const states = getResortStates();
  stateListDiv.innerHTML = `
    <div class="text-muted small mb-2">Or browse by state:</div>
    <div class="state-chips">
      ${states.map(state => `<button class="state-chip" onclick="app.showStateResorts('${state}')">${state}</button>`).join('')}
    </div>
    <div id="stateResortList"></div>
  `;
}

// Show resorts for a specific state
function showStateResorts(state) {
  const stateResortList = document.getElementById('stateResortList');
  if (!stateResortList) return;

  const stateResorts = getResortsByState(state);
  stateResortList.innerHTML = `
    <div class="mt-2 mb-1 small text-muted">${state} Locations (${stateResorts.length}):</div>
    <div class="state-resort-list">
      ${stateResorts.map(r => {
        const alreadyAdded = resorts.some(res => Math.abs(res.lat - r.lat) < 0.01 && Math.abs(res.lon - r.lon) < 0.01);
        return `
          <div class="resort-result p-2 bg-light rounded mb-1 small d-flex justify-content-between align-items-center">
            <div>${r.name}</div>
            <button class="btn btn-sm btn-success py-0 px-2" ${alreadyAdded || resorts.length >= MAX_LOCATIONS ? 'disabled' : ''}
              onclick='app.addSkiResort(${JSON.stringify(r).replace(/'/g, "&#39;")})'>${alreadyAdded ? 'Added' : 'Add'}</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Add ski resort from preset list
function addSkiResort(resort) {
  if (resorts.length >= MAX_LOCATIONS) return;
  if (resorts.some(r => Math.abs(r.lat - resort.lat) < 0.01 && Math.abs(r.lon - resort.lon) < 0.01)) {
    alert('This location is already in your list.');
    return;
  }
  const slug = resort.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  resorts.push({
    slug,
    name: resort.name,
    lat: resort.lat,
    lon: resort.lon,
    timezone: resort.timezone,
    location: `${resort.city}, ${resort.state}, USA`
  });
  saveLocations(currentActivity, resorts);
  renderNav();
  renderEditList();
  loadAllResorts();
}

// Render the 3-section add UI for empty state (no edit panel needed)
function renderEmptyStateAddSection() {
  const addSection = document.getElementById('emptyStateAddSection');
  if (!addSection) return;

  addSection.innerHTML = `
    <div class="add-section-container">
      <!-- Section 1: Ski Resorts -->
      <div class="add-method-section">
        <h6 class="add-method-header">🎿 Add Ski Location</h6>
        <div class="input-group input-group-sm mb-2">
          <input type="text" class="form-control" id="emptyResortSearchInput" placeholder="Search 510 US ski locations...">
        </div>
        <div id="emptyResortSearchResults" class="resort-search-results"></div>
        <div id="emptyResortStateList" class="resort-state-list"></div>
      </div>

      <!-- Section 2: City/Zip -->
      <div class="add-method-section">
        <h6 class="add-method-header">📍 Search by City/Zip</h6>
        <div class="input-group input-group-sm mb-2">
          <input type="text" class="form-control" id="emptyCitySearchInput" placeholder="City, state or zip code...">
          <button class="btn btn-primary" type="button" id="emptyCitySearchBtn">Search</button>
        </div>
        <div id="emptyCitySearchResults"></div>
      </div>

      <!-- Section 3: Coordinates -->
      <div class="add-method-section">
        <h6 class="add-method-header">🌐 Enter Coordinates</h6>
        <div class="row g-2 mb-2">
          <div class="col">
            <input type="text" class="form-control form-control-sm" id="emptyCoordName" placeholder="Location name *">
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col">
            <input type="number" class="form-control form-control-sm" id="emptyCoordLat" placeholder="Latitude" step="any" min="-90" max="90">
          </div>
          <div class="col">
            <input type="number" class="form-control form-control-sm" id="emptyCoordLon" placeholder="Longitude" step="any" min="-180" max="180">
          </div>
          <div class="col-auto">
            <button class="btn btn-primary btn-sm" type="button" id="emptyCoordAddBtn">Add</button>
          </div>
        </div>
        <div id="emptyCoordError" class="text-danger small"></div>
      </div>
    </div>
  `;

  // Resort search - type-ahead
  const resortInput = document.getElementById('emptyResortSearchInput');
  resortInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    renderEmptyResortSearchResults(query);
  });

  // Show state list initially
  renderEmptyResortStateList();

  // City/Zip search
  document.getElementById('emptyCitySearchBtn').addEventListener('click', doEmptyCitySearch);
  document.getElementById('emptyCitySearchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') doEmptyCitySearch(); });

  // Coordinate entry
  document.getElementById('emptyCoordAddBtn').addEventListener('click', addFromEmptyCoordinates);
}

// Render resort search results for empty state
function renderEmptyResortSearchResults(query) {
  const resultsDiv = document.getElementById('emptyResortSearchResults');
  const stateListDiv = document.getElementById('emptyResortStateList');

  if (!query || query.length < 2) {
    resultsDiv.innerHTML = '';
    stateListDiv.style.display = '';
    return;
  }

  stateListDiv.style.display = 'none';
  const results = filterResorts(query);

  if (results.length === 0) {
    resultsDiv.innerHTML = '<p class="text-muted small">No locations found.</p>';
    return;
  }

  resultsDiv.innerHTML = results.map(r => {
    return `
      <div class="resort-result p-2 bg-light rounded mb-1 small d-flex justify-content-between align-items-center">
        <div>
          <div>${r.name}</div>
          <div class="text-muted" style="font-size: 0.65rem;">${r.state}</div>
        </div>
        <button class="btn btn-sm btn-success py-0 px-2"
          onclick='app.addSkiResort(${JSON.stringify(r).replace(/'/g, "&#39;")})'>Add</button>
      </div>
    `;
  }).join('');
}

// Render state list for empty state
function renderEmptyResortStateList() {
  const stateListDiv = document.getElementById('emptyResortStateList');
  if (!stateListDiv) return;

  const states = getResortStates();
  stateListDiv.innerHTML = `
    <div class="text-muted small mb-2">Or browse by state:</div>
    <div class="state-chips">
      ${states.map(state => `<button class="state-chip" onclick="app.showEmptyStateResorts('${state}')">${state}</button>`).join('')}
    </div>
    <div id="emptyStateResortList"></div>
  `;
}

// Show resorts for a specific state in empty state
function showEmptyStateResorts(state) {
  const stateResortList = document.getElementById('emptyStateResortList');
  if (!stateResortList) return;

  const stateResorts = getResortsByState(state);
  stateResortList.innerHTML = `
    <div class="mt-2 mb-1 small text-muted">${state} Locations (${stateResorts.length}):</div>
    <div class="state-resort-list">
      ${stateResorts.map(r => {
        return `
          <div class="resort-result p-2 bg-light rounded mb-1 small d-flex justify-content-between align-items-center">
            <div>${r.name}</div>
            <button class="btn btn-sm btn-success py-0 px-2"
              onclick='app.addSkiResort(${JSON.stringify(r).replace(/'/g, "&#39;")})'>Add</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// City/Zip search for empty state
async function doEmptyCitySearch() {
  const input = document.getElementById('emptyCitySearchInput');
  const resultsDiv = document.getElementById('emptyCitySearchResults');
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
      const timezone = r.timezone || 'America/New_York';
      const location = [r.admin1, r.country].filter(Boolean).join(', ');
      return `
        <div class="search-result p-2 bg-light rounded mb-2 small">
          <div><div>${r.name}</div><div class="text-muted smaller">${r.admin1 || ''} ${r.country || ''} · ${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}</div></div>
          <button class="btn btn-sm btn-success py-0 px-2"
            onclick='app.addResort(${JSON.stringify({ slug, name: r.name, lat: r.latitude, lon: r.longitude, timezone, location })})'>Add</button>
        </div>
      `;
    }).join('');
  } catch (e) {
    resultsDiv.innerHTML = '<p class="text-danger small">Search failed. Please try again.</p>';
  }
}

// Add location from coordinates for empty state
async function addFromEmptyCoordinates() {
  const nameInput = document.getElementById('emptyCoordName');
  const latInput = document.getElementById('emptyCoordLat');
  const lonInput = document.getElementById('emptyCoordLon');
  const errorDiv = document.getElementById('emptyCoordError');

  const name = nameInput.value.trim();
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  errorDiv.textContent = '';

  // Validation
  if (!name) {
    errorDiv.textContent = 'Please enter a location name.';
    return;
  }
  if (isNaN(lat) || lat < -90 || lat > 90) {
    errorDiv.textContent = 'Latitude must be between -90 and 90.';
    return;
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    errorDiv.textContent = 'Longitude must be between -180 and 180.';
    return;
  }

  // Fetch timezone
  errorDiv.textContent = 'Looking up timezone...';
  try {
    const timezone = await getTimezoneForCoords(lat, lon);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    resorts.push({
      slug,
      name,
      lat,
      lon,
      timezone,
      location: `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    });
    saveLocations(currentActivity, resorts);
    renderNav();
    renderEditList();
    loadAllResorts();
  } catch (e) {
    errorDiv.textContent = 'Failed to lookup timezone. Please try again.';
  }
}

// City/Zip search (separate from old doSearch for dog walk)
async function doCitySearch() {
  const input = document.getElementById('citySearchInput');
  const resultsDiv = document.getElementById('citySearchResults');
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

// Add location from coordinates
async function addFromCoordinates() {
  const nameInput = document.getElementById('coordName');
  const latInput = document.getElementById('coordLat');
  const lonInput = document.getElementById('coordLon');
  const errorDiv = document.getElementById('coordError');

  const name = nameInput.value.trim();
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  errorDiv.textContent = '';

  // Validation
  if (!name) {
    errorDiv.textContent = 'Please enter a location name.';
    return;
  }
  if (isNaN(lat) || lat < -90 || lat > 90) {
    errorDiv.textContent = 'Latitude must be between -90 and 90.';
    return;
  }
  if (isNaN(lon) || lon < -180 || lon > 180) {
    errorDiv.textContent = 'Longitude must be between -180 and 180.';
    return;
  }
  if (resorts.length >= MAX_LOCATIONS) {
    errorDiv.textContent = `Maximum of ${MAX_LOCATIONS} locations reached.`;
    return;
  }
  if (resorts.some(r => Math.abs(r.lat - lat) < 0.01 && Math.abs(r.lon - lon) < 0.01)) {
    errorDiv.textContent = 'This location is already in your list.';
    return;
  }

  // Fetch timezone
  errorDiv.textContent = 'Looking up timezone...';
  try {
    const timezone = await getTimezoneForCoords(lat, lon);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    resorts.push({
      slug,
      name,
      lat,
      lon,
      timezone,
      location: `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    });
    saveLocations(currentActivity, resorts);
    renderNav();
    renderEditList();
    loadAllResorts();
  } catch (e) {
    errorDiv.textContent = 'Failed to lookup timezone. Please try again.';
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

function addSuggestedResort(resort) {
  resorts.push(resort);
  saveLocations(currentActivity, resorts);
  renderNav(); renderEditList(); loadAllResorts();
}

function resetLocations() {
  if (!confirm('Are you sure you want to remove all locations?')) return;
  resorts = [];
  saveLocations(currentActivity, resorts);
  renderNav(); renderEditList(); loadAllResorts();
  // Collapse the edit section
  const editSection = document.getElementById('editSection');
  if (editSection) bootstrap.Collapse.getInstance(editSection)?.hide();
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

  // Show/hide legend based on whether we have locations
  const legendBar = document.getElementById('legendBar');
  if (legendBar) legendBar.style.display = resorts.length > 0 ? '' : 'none';

  if (resorts.length === 0) {
    // Hide locations bar when empty
    const locationsBar = document.getElementById('locationsBar');
    if (locationsBar) locationsBar.style.display = 'none';

    if (currentActivity === 'dogwalk') {
      container.innerHTML = `<div class="col-12 text-center py-5"><h5 class="text-muted">🐕 No locations set</h5><p class="text-muted">Allow location access or add a location manually.</p></div>`;
    } else {
      // Show popular locations + 3-section add UI for empty state
      container.innerHTML = `
        <div class="col-12">
          <div class="empty-state-card">
            <h5 class="text-center mb-3">🎿 Get started</h5>

            <div class="popular-resorts-section mb-4">
              <div class="text-muted small text-center mb-2">Quick add a popular location:</div>
              <div class="suggested-resorts d-flex justify-content-center gap-2">
                ${SUGGESTED_RESORTS.map(r => `
                  <button class="btn suggested-resort-btn" onclick='app.addSuggestedResort(${JSON.stringify(r)})'>
                    <span class="resort-name">${r.name}</span>
                    <span class="resort-location">${r.location}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="or-divider mb-4"><span>or find another</span></div>

            <div id="emptyStateAddSection"></div>
          </div>
        </div>
      `;
      renderEmptyStateAddSection();
    }
    return;
  } else {
    // Show locations bar when not empty
    const locationsBar = document.getElementById('locationsBar');
    if (locationsBar) locationsBar.style.display = '';
  }

  const charts = [];
  for (const resort of resorts) {
    try {
      let data = useCache && cachedWeatherData[resort.slug] ? cachedWeatherData[resort.slug] : await fetchForecast(resort);
      cachedWeatherData[resort.slug] = data;
      charts.push(renderChart(resort, data, currentActivity, currentChartMode));
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
  console.log('GoWindow initializing...');
  try {
    document.querySelectorAll('.activity-link').forEach(link => {
      link.classList.toggle('active', link.dataset.activity === currentActivity);
    });
    document.querySelectorAll('.chart-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === currentChartMode);
    });
    updateTagline();
    updateChartLegend();

    if (currentActivity === 'dogwalk') {
      resorts = await initDogWalkLocation();
    } else {
      resorts = loadLocations(currentActivity);
    }

    console.log('Loaded resorts:', resorts);

    renderNav();
    renderEditList();
    await loadAllResorts();

    console.log('GoWindow initialized successfully');

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
    console.error('GoWindow init error:', err);
    document.getElementById('chartsContainer').innerHTML = `<div class="col-12"><div class="alert alert-danger">Error initializing: ${err.message}</div></div>`;
  }
}

// Expose to global scope for onclick handlers
window.app = { setActivity, setChartMode, moveResort, removeResort, addResort, addSuggestedResort, addSkiResort, showStateResorts, showEmptyStateResorts, resetLocations, manualRefresh, init };

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
