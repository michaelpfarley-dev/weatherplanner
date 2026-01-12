// Configuration constants for WeatherPlanner

export const DEFAULT_LOCATIONS = {
  skiing: [
    { slug: 'bristol-mountain', name: 'Bristol Mountain', lat: 42.73, lon: -77.40, timezone: 'America/New_York', location: 'Canandaigua, NY, USA' },
    { slug: 'holiday-valley', name: 'Holiday Valley', lat: 42.27, lon: -78.67, timezone: 'America/New_York', location: 'Ellicottville, NY, USA' },
    { slug: 'jay-peak', name: 'Jay Peak', lat: 44.94, lon: -72.53, timezone: 'America/New_York', location: 'Jay, VT, USA' }
  ],
  dogwalk: []
};

export const MAX_LOCATIONS = 10;
export const REFRESH_INTERVAL = 30 * 60 * 1000;
export const STALE_THRESHOLD = 15 * 60 * 1000;

export const WEATHER_CODES = {
  snow: [71, 73, 75, 77, 85, 86],
  heavySnow: [75, 86],
  rain: [61, 63, 65, 80, 81, 82],
  heavyRain: [65, 82],
  freezing: [56, 57, 66, 67],
  drizzle: [51, 53, 55],
  dry: [0, 1, 2, 3, 45, 48]
};

export const ICON_MAP = {
  0: '01', 1: '01', 2: '02', 3: '03',
  45: '50', 48: '50',
  51: '09', 53: '09', 55: '09', 56: '09', 57: '09',
  61: '10', 63: '10', 65: '10', 66: '10', 67: '10',
  71: '13', 73: '13', 75: '13', 77: '13',
  80: '09', 81: '09', 82: '09',
  85: '13', 86: '13',
  95: '11', 96: '11', 99: '11'
};
