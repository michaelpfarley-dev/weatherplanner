// Rendering functions for GoWindow

import { ICON_MAP } from './config.js';
import { calculateSkiingQuality, calculateHourlySkiingQuality, calculateDogWalkQuality, getQualityLabel } from './scoring.js';

export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

export function getWeatherIcon(weatherCode, isDaylightFlag) {
  const suffix = isDaylightFlag ? 'd' : 'n';
  const iconCode = ICON_MAP[weatherCode] || '03';
  return `https://openweathermap.org/img/wn/${iconCode}${suffix}@2x.png`;
}

export function isDaylight(hourTime, sunrise, sunset, bufferMinutes = 30) {
  const hour = new Date(hourTime);
  const rise = new Date(sunrise);
  const set = new Date(sunset);
  rise.setMinutes(rise.getMinutes() - bufferMinutes);
  set.setMinutes(set.getMinutes() + bufferMinutes);
  return hour >= rise && hour <= set;
}

export function getVisibleDays(allDays) {
  if (window.innerWidth < 576) {
    return allDays.filter(d => !d.isHistorical).slice(0, 10);
  }
  return allDays;
}

export function renderChart(resort, data, currentActivity) {
  const daily = data.daily;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allDays = daily.time.map((t, i) => {
    const dayDate = new Date(t + 'T12:00:00');
    return {
      date: formatDate(t), rawDate: t,
      tempMax: Math.round(daily.temperature_2m_max[i]),
      tempMin: Math.round(daily.temperature_2m_min[i]),
      precip: daily.precipitation_probability_max[i],
      snow: daily.snowfall_sum[i],
      rain: daily.rain_sum[i],
      weatherCode: daily.weather_code[i],
      daylightTempMax: Math.round(daily.daylight_temp_max[i]),
      daylightTempMin: Math.round(daily.daylight_temp_min[i]),
      daylightPrecipMax: daily.daylight_precip_max[i],
      daylightSnowSum: daily.daylight_snow_sum[i],
      daylightWeatherCodes: daily.daylight_weather_codes[i],
      hourlyTemps: daily.daylight_hourly_temps[i] || [],
      hourlyPrecips: daily.daylight_hourly_precips[i] || [],
      isHistorical: dayDate < today
    };
  });

  allDays.forEach((day, i) => {
    day.quality = calculateSkiingQuality(day, i > 0 ? allDays[i-1] : null, i > 1 ? allDays[i-2] : null);
  });

  const days = getVisibleDays(allDays);
  const lastHistoricalIdx = days.reduce((acc, d, i) => d.isHistorical ? i : acc, -1);

  // Get all hourly temps for scaling
  const allHourlyTemps = days.flatMap(d => d.hourlyTemps || [d.tempMax, d.tempMin]);
  const minTemp = Math.min(...allHourlyTemps);
  const maxTemp = Math.max(...allHourlyTemps);
  const yMin = Math.floor((minTemp - 5) / 5) * 5;
  const yMax = Math.ceil((maxTemp + 5) / 5) * 5;
  const chartHeight = 200;
  const dayWidth = 100 / days.length;

  const scaleTemp = (temp) => chartHeight - ((temp - yMin) / (yMax - yMin)) * chartHeight;
  const scalePrecip = (precip) => chartHeight - (precip / 100) * chartHeight;

  // Build separate hourly temp lines for each day (daylight only)
  const dailyTempData = days.map((d, dayIdx) => {
    const temps = d.hourlyTemps || [d.tempMax];
    const numTemps = temps.length;
    const points = temps.map((temp, hourIdx) => {
      const xPos = (dayIdx + (hourIdx + 0.5) / numTemps) * dayWidth;
      const yPos = (scaleTemp(temp) / chartHeight) * 100;
      return { x: xPos, y: yPos };
    });
    return {
      line: points.map(p => `${p.x},${p.y}`).join(' '),
      start: points[0],
      end: points[points.length - 1]
    };
  });

  // Build separate hourly precip lines for each day (daylight only)
  const dailyPrecipData = days.map((d, dayIdx) => {
    const precips = d.hourlyPrecips || [d.precip];
    const numPrecips = precips.length;
    const points = precips.map((precip, hourIdx) => {
      const xPos = (dayIdx + (hourIdx + 0.5) / numPrecips) * dayWidth;
      const yPos = (scalePrecip(precip) / chartHeight) * 100;
      return `${xPos},${yPos}`;
    });
    return points.join(' ');
  });

  const yLabels = [];
  const yStep = Math.ceil((yMax - yMin) / 5 / 5) * 5;
  for (let t = yMax; t >= yMin; t -= yStep) yLabels.push(`${t}°`);

  return `
    <div class="col-12">
      <div class="chart-card" id="${resort.slug}">
        <div class="chart-header">
          <div>
            <div class="resort-name">${resort.name}</div>
            <div class="resort-location text-muted" style="font-size: 0.75rem;">${resort.location || ''}</div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="view-toggle">
              <button class="view-toggle-btn active" data-view="daily" data-resort="${resort.slug}">Daily</button>
              <button class="view-toggle-btn" data-view="hourly" data-resort="${resort.slug}">Hourly</button>
            </div>
            <button class="debug-btn" data-resort="${resort.slug}" title="Copy API data">{ }</button>
          </div>
        </div>
        <div class="daily-view" data-resort="${resort.slug}">
          <div class="precip-totals">
            ${days.map(d => `<div class="precip-day${d.isHistorical ? ' historical' : ''}">${d.snow >= 0.25 ? `<span class="snow-total">${(d.snow / 2.54).toFixed(1)}"</span>` : ''}${d.rain >= 2.5 && d.tempMax > 34 ? `<span class="rain-total">${(d.rain / 25.4).toFixed(2)}"</span>` : ''}</div>`).join('')}
          </div>
          <div class="chart">
            <div class="y-axis">${yLabels.map(l => `<span class="y-label">${l}</span>`).join('')}</div>
            <div class="chart-bands">${days.map((d, i) => `<div class="day-band ${d.quality}${d.snow / 2.54 >= 1.95 ? ' heavy-snow' : ''}${d.isHistorical ? ' historical' : ''}${i === lastHistoricalIdx ? ' divider' : ''}"></div>`).join('')}</div>
            <div class="chart-lines">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                ${yMin <= 32 && yMax >= 32 ? `<line class="freezing-line" x1="0" y1="${((yMax - 32) / (yMax - yMin)) * 100}" x2="100" y2="${((yMax - 32) / (yMax - yMin)) * 100}" vector-effect="non-scaling-stroke"/>` : ''}
                ${dailyPrecipData.map(points => `<polyline class="precip-line" points="${points}" vector-effect="non-scaling-stroke"/>`).join('')}
                ${dailyTempData.map(d => `<polyline class="temp-line-high" points="${d.line}" vector-effect="non-scaling-stroke"/>`).join('')}
              </svg>
            </div>
            <div class="data-points">
              ${yMin <= 32 && yMax >= 32 ? `<span class="freezing-label" style="top:${((yMax - 32) / (yMax - yMin)) * 100}%">32°F</span>` : ''}
              ${lastHistoricalIdx >= 0 ? `<div class="history-divider" style="left:${((lastHistoricalIdx + 1) / days.length) * 100}%"></div>` : ''}
              ${dailyTempData.map(d => `<div class="temp-dot" style="left:${d.start.x}%;top:${d.start.y}%"></div><div class="temp-dot" style="left:${d.end.x}%;top:${d.end.y}%"></div>`).join('')}
            </div>
          </div>
          <div class="weather-details">
            ${days.map((d, i) => `
              <div class="weather-day${d.isHistorical ? ' historical' : ''}${i === lastHistoricalIdx ? ' divider' : ''}">
                <span class="score-badge ${d.quality}">${getQualityLabel(d.quality, currentActivity)}</span>
                <div class="weather-day-label">${d.date.split(' ')[0]}<br><span class="weather-day-num">${d.date.split(' ')[1]}</span></div>
                <img class="weather-icon" src="${getWeatherIcon(d.weatherCode, true)}" alt="">
                <div class="weather-temp"><span class="weather-high">${d.tempMax}°</span><span class="weather-low">${d.tempMin}°</span></div>
                <div class="weather-precip">${d.precip}%</div>
              </div>
            `).join('')}
          </div>
          <div class="mobile-forecast">
            ${days.map(d => `
              <div class="mobile-day${d.snow / 2.54 >= 1.95 ? ' heavy-snow' : ''}${d.isHistorical ? ' historical' : ''}">
                <span class="score-badge ${d.quality}">${getQualityLabel(d.quality, currentActivity)}</span>
                <div class="mobile-day-label">${d.date.split(' ')[0]}</div>
                <div class="mobile-day-num">${d.date.split(' ')[1]}</div>
                <img class="mobile-icon" src="${getWeatherIcon(d.weatherCode, true)}" alt="">
                <div class="mobile-temps"><span class="high">${d.tempMax}°</span><span class="low">${d.tempMin}°</span></div>
                <div class="mobile-precip">${d.precip}%</div>
                ${d.snow >= 0.25 ? `<div class="mobile-snow">${(d.snow / 2.54).toFixed(1)}"</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="hourly-view" data-resort="${resort.slug}" style="display: none;">
          <div class="text-center py-4 text-muted"><div class="loading-spinner"></div><small>Loading hourly...</small></div>
        </div>
      </div>
    </div>
  `;
}

export function renderHourlyChart(resort, data, currentActivity) {
  const hourly = data.hourly;
  const daily = data.daily;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const sunTimes = {};
  daily.time.forEach((date, i) => {
    sunTimes[date] = { sunrise: daily.sunrise[i], sunset: daily.sunset[i] };
  });

  const now = new Date();
  const hours = hourly.time.map((t, i) => {
    const hourDate = new Date(t);
    const dateStr = t.split('T')[0];
    const sun = sunTimes[dateStr] || {};
    const daylightFlag = sun.sunrise && sun.sunset ? isDaylight(t, sun.sunrise, sun.sunset) : true;

    return {
      time: t, hourNum: hourDate.getHours(), dayName: dayNames[hourDate.getDay()],
      dayNum: hourDate.getDate(), temp: Math.round(hourly.temperature_2m[i]),
      precip: hourly.precipitation_probability[i], snow: hourly.snowfall[i],
      weatherCode: hourly.weather_code[i],
      wind: Math.round(hourly.wind_speed_10m?.[i] || 0),
      gusts: Math.round(hourly.wind_gusts_10m?.[i] || 0),
      daylight: daylightFlag, isHistorical: hourDate < now, isNewDay: hourDate.getHours() === 0
    };
  });

  let displayHours = hours;
  if (currentActivity === 'dogwalk') {
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    displayHours = hours.filter(h => new Date(h.time).getTime() <= cutoff);
  }

  displayHours.forEach((h, i) => {
    if (currentActivity === 'dogwalk') {
      h.quality = calculateDogWalkQuality(displayHours, i);
    } else {
      h.quality = h.daylight ? calculateHourlySkiingQuality(displayHours, i) : 'night';
    }
  });

  const allTemps = displayHours.map(h => h.temp);
  const yMin = Math.floor((Math.min(...allTemps) - 5) / 5) * 5;
  const yMax = Math.ceil((Math.max(...allTemps) + 5) / 5) * 5;
  const chartHeight = 200, hourWidth = 36, chartWidth = displayHours.length * hourWidth;

  const scaleTemp = (temp) => chartHeight - ((temp - yMin) / (yMax - yMin)) * chartHeight;
  const scalePrecip = (precip) => chartHeight - (precip / 100) * chartHeight;

  const tempPoints = displayHours.map((h, i) => `${(i + 0.5) * hourWidth},${scaleTemp(h.temp)}`);
  const precipPoints = displayHours.map((h, i) => `${(i + 0.5) * hourWidth},${scalePrecip(h.precip)}`);
  const showFreezing = yMin <= 32 && yMax >= 32;
  const freezingY = showFreezing ? scaleTemp(32) : 0;

  const yLabels = [];
  const yStep = Math.ceil((yMax - yMin) / 5 / 5) * 5;
  for (let t = yMax; t >= yMin; t -= yStep) yLabels.push(`${t}°`);

  return `
    <div class="hourly-y-axis"><div class="y-axis" style="position:relative; height:100%;">${yLabels.map(l => `<span class="y-label">${l}</span>`).join('')}</div></div>
    <div class="hourly-container">
      <div class="hourly-precip-totals">${displayHours.map(h => `<div class="hourly-precip-slot${h.isHistorical ? ' historical' : ''}">${h.snow >= 0.1 ? `<span class="snow-total">${(h.snow / 2.54).toFixed(1)}"</span>` : ''}</div>`).join('')}</div>
      <div class="hourly-chart-wrapper">
        <div class="hourly-chart">${displayHours.map((h, i) => {
          const lastHist = h.isHistorical && (i === displayHours.length - 1 || !displayHours[i + 1].isHistorical);
          return `<div class="hour-band ${h.quality}${h.isHistorical ? ' historical' : ''}${h.isNewDay && i > 0 ? ' day-start' : ''}${lastHist ? ' history-end' : ''}"></div>`;
        }).join('')}</div>
        <div class="hourly-lines">
          <svg viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="none" style="width:${chartWidth}px; height:${chartHeight}px;">
            ${showFreezing ? `<line class="freezing-line" x1="0" y1="${freezingY}" x2="${chartWidth}" y2="${freezingY}" vector-effect="non-scaling-stroke"/>` : ''}
            <polyline class="precip-line" points="${precipPoints.join(' ')}" vector-effect="non-scaling-stroke"/>
            <polyline class="temp-line-high" points="${tempPoints.join(' ')}" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>
      </div>
      <div class="hourly-details">${displayHours.map((h, i) => {
        const lastHist = h.isHistorical && (i === displayHours.length - 1 || !displayHours[i + 1].isHistorical);
        const hourLabel = h.hourNum === 0 ? '12a' : h.hourNum === 12 ? '12p' : h.hourNum > 12 ? (h.hourNum - 12) + 'p' : h.hourNum + 'a';
        return `
          <div class="hour-detail${h.isHistorical ? ' historical' : ''}${h.isNewDay && i > 0 ? ' day-start' : ''}${lastHist ? ' history-end' : ''}">
            ${h.isNewDay || i === 0 ? `<div class="hour-day-label">${h.dayName}</div>` : '<div class="hour-day-label">&nbsp;</div>'}
            <div class="hour-label">${hourLabel}</div>
            <img class="hour-icon" src="${getWeatherIcon(h.weatherCode, h.daylight)}" alt="">
            <div class="hour-temp" style="color: #ef4444;">${h.temp}°</div>
            <div class="hour-precip">${h.precip}%</div>
            ${currentActivity === 'dogwalk' ? `<div class="hour-wind">${h.wind}<span class="wind-unit">mph</span></div>` : ''}
            <div class="hour-quality ${h.quality}"></div>
          </div>
        `;
      }).join('')}</div>
    </div>
  `;
}
