// Quality scoring functions for WeatherPlanner

import { WEATHER_CODES } from './config.js';

export function calculateSkiingQuality(day, prevDay, prevDay2) {
  const tempMax = day.daylightTempMax;
  const tempMin = day.daylightTempMin;
  const precipProb = day.daylightPrecipMax;
  const snowfall = day.daylightSnowSum;
  const weatherCodes = day.daylightWeatherCodes || [];
  const rain = day.rain;

  const hasSnowCode = weatherCodes.some(c => WEATHER_CODES.snow.includes(c));
  const hasRainCode = weatherCodes.some(c => WEATHER_CODES.rain.includes(c));
  const hasFreezingCode = weatherCodes.some(c => WEATHER_CODES.freezing.includes(c));

  const actualRain = rain >= 2.5 && tempMax > 34 ? rain : 0;
  const yesterdayRain = prevDay && prevDay.rain >= 2.5 && prevDay.daylightTempMax > 34;

  const warmWetStretch = prevDay && prevDay2 &&
    ((prevDay.rain >= 2.5 && prevDay.daylightTempMax > 34) || (prevDay2.rain >= 2.5 && prevDay2.daylightTempMax > 34)) &&
    (prevDay.daylightTempMax > 38 || prevDay2.daylightTempMax > 38);

  const frozeOvernight = prevDay && prevDay.daylightTempMin < 32;
  const warmsDuringDay = tempMax >= 37;

  if (hasFreezingCode) return 'icy';
  if ((snowfall >= 2 || hasSnowCode) && tempMax <= 34) return 'powder';
  if (hasRainCode && tempMax > 34) return 'nogo';
  if (tempMax > 38 && precipProb > 40) return 'nogo';
  if (tempMax > 45 && precipProb > 25) return 'nogo';
  if (actualRain >= 2.5 && tempMax > 36) return 'nogo';

  if (yesterdayRain && frozeOvernight) {
    if (warmsDuringDay) return 'fair';
    return 'icy';
  }
  if (yesterdayRain && !frozeOvernight) return 'fair';
  if (warmWetStretch) {
    if (frozeOvernight && !warmsDuringDay) return 'icy';
    return 'fair';
  }

  if (tempMax <= 32 && precipProb <= 50) return 'good';
  if (tempMin < 30 && precipProb <= 30) return 'good';
  if (tempMax > 32 && tempMax <= 40 && precipProb > 40) return 'icy';
  if (precipProb <= 20) return 'fair';
  if (tempMax <= 40 && precipProb <= 50) return 'fair';

  return 'icy';
}

export function calculateHourlySkiingQuality(hours, index) {
  const hour = hours[index];
  const { temp, precip, snow, weatherCode } = hour;

  const isSnowing = WEATHER_CODES.snow.includes(weatherCode);
  const isRaining = WEATHER_CODES.rain.includes(weatherCode);
  const isFreezingPrecip = WEATHER_CODES.freezing.includes(weatherCode);
  const isDry = WEATHER_CODES.dry.includes(weatherCode);

  let recentRain = false, recentSnow = false, hadFreezeAfterRain = false;

  for (let i = Math.max(0, index - 6); i < index; i++) {
    const h = hours[i];
    if (WEATHER_CODES.rain.includes(h.weatherCode)) recentRain = true;
    if (WEATHER_CODES.snow.includes(h.weatherCode) || h.snow > 0) recentSnow = true;
    if (recentRain && h.temp < 32) hadFreezeAfterRain = true;
  }

  if (isFreezingPrecip) return 'icy';
  if (isSnowing && temp <= 34) return 'powder';
  if (recentSnow && temp <= 32 && isDry && precip <= 30) return 'powder';
  if (isRaining && temp > 34) return 'nogo';
  if (temp > 38 && precip > 50 && !isSnowing) return 'nogo';
  if (recentRain && hadFreezeAfterRain && temp < 34) return 'icy';
  if (recentRain && temp <= 32) return 'icy';
  if (recentRain && temp > 32 && temp < 37) return 'icy';
  if (recentRain && temp >= 37) return 'fair';
  if (isDry && temp >= 15 && temp < 40 && precip <= 20) return 'good';
  if (isDry && temp < 40 && precip <= 40) return 'good';
  if (!isSnowing && temp >= 28 && temp <= 35 && precip > 40) return 'icy';
  if (isDry && precip <= 30) return 'fair';
  if (temp <= 40 && precip <= 50) return 'fair';

  return 'icy';
}

export function calculateDogWalkQuality(hours, index) {
  const hour = hours[index];
  const { temp, precip, snow, weatherCode, wind, gusts } = hour;

  const isSnowing = WEATHER_CODES.snow.includes(weatherCode);
  const isHeavySnow = WEATHER_CODES.heavySnow.includes(weatherCode);
  const isRaining = WEATHER_CODES.rain.includes(weatherCode);
  const isHeavyRain = WEATHER_CODES.heavyRain.includes(weatherCode);
  const isFreezingPrecip = WEATHER_CODES.freezing.includes(weatherCode);
  const isDrizzle = WEATHER_CODES.drizzle.includes(weatherCode);
  const isDry = WEATHER_CODES.dry.includes(weatherCode);

  const isWindy = wind >= 15 || gusts >= 25;
  const isVeryWindy = wind >= 25 || gusts >= 35;

  let recentRain = false, hadFreezeAfterRain = false;
  for (let i = Math.max(0, index - 6); i < index; i++) {
    const h = hours[i];
    if ([...WEATHER_CODES.rain, ...WEATHER_CODES.drizzle].includes(h.weatherCode)) recentRain = true;
    if (recentRain && h.temp < 32) hadFreezeAfterRain = true;
  }

  if (isFreezingPrecip) return 'nogo';
  if (isHeavyRain) return 'nogo';
  if ((isRaining || isDrizzle) && isWindy) return 'nogo';
  if (isHeavySnow && isWindy) return 'nogo';
  if (isVeryWindy) return 'nogo';
  if (hadFreezeAfterRain && temp < 35) return 'icy';
  if (isRaining && !isWindy) return 'fair';
  if (isDrizzle && !isWindy) return 'fair';
  if (isSnowing && isWindy) return 'fair';
  if (isWindy && isDry) return 'fair';
  if (isSnowing && !isWindy) return 'good';
  if (isDry && !isWindy) return 'good';

  return 'fair';
}

export function getQualityLabel(quality, activity) {
  if (activity === 'dogwalk') {
    const labels = { powder: 'Good', good: 'Good', fair: 'Fair', icy: 'Icy', nogo: 'No-Go', night: 'Night' };
    return labels[quality] || quality;
  }
  const labels = { powder: 'Powder', good: 'Good', fair: 'Fair', icy: 'Icy', nogo: 'No-Go', night: 'Night' };
  return labels[quality] || quality;
}
