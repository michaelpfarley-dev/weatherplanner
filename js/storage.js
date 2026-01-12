// Storage and location management for GoWindow

import { DEFAULT_LOCATIONS } from './config.js';

function getStorageKey(activity) {
  return `weatherplanner-locations-${activity}`;
}

export function loadLocations(activity) {
  const key = getStorageKey(activity);
  const saved = localStorage.getItem(key);
  console.log('loadLocations:', { activity, key, saved });
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      console.log('Loaded from storage:', parsed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  }
  console.log('Using defaults:', DEFAULT_LOCATIONS[activity]);
  return DEFAULT_LOCATIONS[activity] || [];
}

export function saveLocations(activity, locations) {
  const key = getStorageKey(activity);
  localStorage.setItem(key, JSON.stringify(locations));
}

export function loadActivity() {
  return localStorage.getItem('weatherplanner-activity') || 'skiing';
}

export function saveActivity(activity) {
  localStorage.setItem('weatherplanner-activity', activity);
}

export async function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const tzResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=auto&forecast_days=1`
          );
          const tzData = await tzResponse.json();
          resolve({
            slug: 'my-location',
            name: 'My Location',
            lat: latitude,
            lon: longitude,
            timezone: tzData.timezone || 'America/New_York',
            location: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
          });
        } catch (e) {
          resolve({
            slug: 'my-location',
            name: 'My Location',
            lat: latitude,
            lon: longitude,
            timezone: 'America/New_York',
            location: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
          });
        }
      },
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
}

export async function initDogWalkLocation() {
  const locations = loadLocations('dogwalk');
  if (locations.length === 0) {
    try {
      const userLoc = await getUserLocation();
      locations.push(userLoc);
      saveLocations('dogwalk', locations);
      return locations;
    } catch (e) {
      console.log('Could not get user location:', e.message);
      return [];
    }
  }
  return locations;
}
