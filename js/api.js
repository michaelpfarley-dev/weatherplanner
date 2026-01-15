// Weather API functions for GoWindow

export async function fetchForecast(resort) {
  const url = `https://api.open-meteo.com/v1/gfs?` +
    `latitude=${resort.lat}&longitude=${resort.lon}` +
    `&hourly=temperature_2m,precipitation_probability,snowfall,weather_code` +
    `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum,rain_sum,weather_code` +
    `&temperature_unit=fahrenheit` +
    `&timezone=${resort.timezone}` +
    `&past_days=5` +
    `&forecast_days=10`;

  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch forecast');
  const data = await response.json();

  const sunTimes = {};
  data.daily.time.forEach((date, i) => {
    sunTimes[date] = { sunrise: data.daily.sunrise[i], sunset: data.daily.sunset[i] };
  });

  const dailyFromHourly = {};
  data.hourly.time.forEach((t, i) => {
    const dateStr = t.split('T')[0];
    const sun = sunTimes[dateStr];
    if (!sun) return;

    const hourTime = new Date(t);
    const sunrise = new Date(sun.sunrise);
    const sunset = new Date(sun.sunset);
    sunrise.setMinutes(sunrise.getMinutes() - 30);
    sunset.setMinutes(sunset.getMinutes() + 30);

    if (hourTime < sunrise || hourTime > sunset) return;

    if (!dailyFromHourly[dateStr]) {
      dailyFromHourly[dateStr] = { temps: [], precips: [], snowfall: 0, weatherCodes: [], hourlyTemps: [], hourlyPrecips: [] };
    }

    dailyFromHourly[dateStr].temps.push(data.hourly.temperature_2m[i]);
    dailyFromHourly[dateStr].precips.push(data.hourly.precipitation_probability[i]);
    dailyFromHourly[dateStr].snowfall += data.hourly.snowfall[i] || 0;
    dailyFromHourly[dateStr].weatherCodes.push(data.hourly.weather_code[i]);
    dailyFromHourly[dateStr].hourlyTemps.push(Math.round(data.hourly.temperature_2m[i]));
    dailyFromHourly[dateStr].hourlyPrecips.push(data.hourly.precipitation_probability[i]);
  });

  const mergedDaily = {
    time: [], temperature_2m_max: [], temperature_2m_min: [],
    precipitation_probability_max: [], snowfall_sum: [], rain_sum: [],
    weather_code: [], daylight_temp_max: [], daylight_temp_min: [],
    daylight_precip_max: [], daylight_snow_sum: [], daylight_weather_codes: [],
    daylight_hourly_temps: [], daylight_hourly_precips: []
  };

  data.daily.time.forEach((t, i) => {
    mergedDaily.time.push(t);
    mergedDaily.temperature_2m_max.push(data.daily.temperature_2m_max[i]);
    mergedDaily.temperature_2m_min.push(data.daily.temperature_2m_min[i]);
    mergedDaily.precipitation_probability_max.push(data.daily.precipitation_probability_max[i]);
    mergedDaily.snowfall_sum.push(data.daily.snowfall_sum[i]);
    mergedDaily.rain_sum.push(data.daily.rain_sum[i] || 0);
    mergedDaily.weather_code.push(data.daily.weather_code[i]);

    const dayData = dailyFromHourly[t];
    if (dayData && dayData.temps.length > 0) {
      mergedDaily.daylight_temp_max.push(Math.max(...dayData.temps));
      mergedDaily.daylight_temp_min.push(Math.min(...dayData.temps));
      mergedDaily.daylight_precip_max.push(Math.max(...dayData.precips));
      mergedDaily.daylight_snow_sum.push(dayData.snowfall);
      mergedDaily.daylight_weather_codes.push(dayData.weatherCodes);
      mergedDaily.daylight_hourly_temps.push(dayData.hourlyTemps);
      mergedDaily.daylight_hourly_precips.push(dayData.hourlyPrecips);
    } else {
      mergedDaily.daylight_temp_max.push(data.daily.temperature_2m_max[i]);
      mergedDaily.daylight_temp_min.push(data.daily.temperature_2m_min[i]);
      mergedDaily.daylight_precip_max.push(data.daily.precipitation_probability_max[i]);
      mergedDaily.daylight_snow_sum.push(data.daily.snowfall_sum[i]);
      mergedDaily.daylight_weather_codes.push([data.daily.weather_code[i]]);
      mergedDaily.daylight_hourly_temps.push([Math.round(data.daily.temperature_2m_max[i])]);
      mergedDaily.daylight_hourly_precips.push([data.daily.precipitation_probability_max[i]]);
    }
  });

  return { latitude: data.latitude, longitude: data.longitude, elevation: data.elevation, timezone: data.timezone, daily: mergedDaily };
}

export async function fetchHourlyForecast(resort) {
  const url = `https://api.open-meteo.com/v1/gfs?` +
    `latitude=${resort.lat}&longitude=${resort.lon}` +
    `&hourly=temperature_2m,precipitation_probability,snowfall,weather_code,wind_speed_10m,wind_gusts_10m` +
    `&daily=sunrise,sunset` +
    `&temperature_unit=fahrenheit` +
    `&wind_speed_unit=mph` +
    `&timezone=${resort.timezone}` +
    `&past_hours=8` +
    `&forecast_hours=72`;

  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch hourly forecast');
  return response.json();
}

// US state name to abbreviation mapping for search filtering
const STATE_ABBREV = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

// Reverse mapping: abbreviation to full name
const ABBREV_TO_STATE = Object.fromEntries(
  Object.entries(STATE_ABBREV).map(([name, abbr]) => [abbr.toLowerCase(), name])
);

export async function searchLocations(query) {
  // Parse "city, state" format
  let cityName = query.trim();
  let stateFilter = null;

  const commaMatch = query.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) {
    cityName = commaMatch[1].trim();
    const stateInput = commaMatch[2].trim().toLowerCase();
    // Check if it's a state abbreviation or full name
    if (STATE_ABBREV[stateInput]) {
      stateFilter = stateInput; // full state name
    } else if (ABBREV_TO_STATE[stateInput]) {
      stateFilter = ABBREV_TO_STATE[stateInput]; // convert abbrev to full name
    }
  }

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=50&language=en&format=json`
  );
  const data = await response.json();
  let results = data.results || [];

  // Filter by state if provided
  if (stateFilter && results.length > 0) {
    const filtered = results.filter(r =>
      r.admin1 && r.admin1.toLowerCase() === stateFilter
    );
    // If filter found results, use them; otherwise return all results
    if (filtered.length > 0) {
      results = filtered;
    }
  }

  return results.slice(0, 10);
}

export async function getTimezoneForCoords(lat, lon) {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1`
  );
  if (!response.ok) throw new Error('Failed to fetch timezone');
  const data = await response.json();
  return data.timezone || 'America/New_York';
}
