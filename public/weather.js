(() => {
  'use strict';
  const KEY = 'rudi-weather-v2';
  const FRESH = 15 * 60 * 1000;
  const MAX_AGE = 2 * 60 * 60 * 1000;
  let cached = null, flight = null;
  function valid(value) {
    const daily=value?.daily;
    const days=Array.isArray(daily?.time)?daily.time.length:0;
    return Number.isFinite(value?.fetchedAt) && value.fetchedAt <= Date.now() + 60000
      && Number.isFinite(value?.current?.temperature_2m) && Number.isFinite(value?.current?.weather_code)
      && days>0
      && ['temperature_2m_min', 'temperature_2m_max', 'precipitation_sum'].every(key =>
        Array.isArray(daily?.[key]) && daily[key].length === days && daily[key].every(Number.isFinite))
      && ['time','sunrise','sunset'].every(key =>
        Array.isArray(daily?.[key]) && daily[key].length === days && daily[key].every(item=>typeof item==='string'&&item.length>0));
  }
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (valid(saved)) cached = saved; } catch (_) {}
  function extended(value){
    const hours=value?.hourly?.time?.length||0;
    return hours>0&&['temperature_2m','apparent_temperature','weather_code','wind_speed_10m','precipitation_probability','precipitation'].every(key=>Array.isArray(value.hourly[key])&&value.hourly[key].length===hours);
  }
  async function get({forecast=false}={}) {
    if (cached && !cached.stale && Date.now() - cached.fetchedAt < FRESH && (!forecast||extended(cached))) return cached;
    if (flight){const value=await flight;if(!forecast||extended(value))return value;return get({forecast:true})}
    flight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/index?route=weather&forecast=v3', {signal: controller.signal});
        if (!response.ok) throw new Error('Weather unavailable');
        const value = await response.json();
        if (!valid(value) || (forecast&&!extended(value)) || Date.now() - value.fetchedAt > MAX_AGE) throw new Error('Invalid forecast');
        cached = {...value, stale: !!value.stale || Date.now() - value.fetchedAt >= FRESH};
        try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch (_) {}
        return cached;
      } catch (error) {
        if (cached && Date.now() - cached.fetchedAt <= MAX_AGE) return {...cached, stale: true};
        throw error;
      } finally { clearTimeout(timer); }
    })();
    try { return await flight; } finally { flight = null; }
  }
  window.RUDI_WEATHER = {get};
})();
