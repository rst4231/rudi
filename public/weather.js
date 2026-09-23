(() => {
  'use strict';
  const KEY = 'rudi-weather-v1';
  const FRESH = 15 * 60 * 1000;
  const MAX_AGE = 2 * 60 * 60 * 1000;
  let cached = null, flight = null;
  function valid(value) {
    return Number.isFinite(value?.fetchedAt) && value.fetchedAt <= Date.now() + 60000
      && Number.isFinite(value?.current?.temperature_2m) && Number.isFinite(value?.current?.weather_code)
      && ['temperature_2m_min', 'temperature_2m_max', 'precipitation_sum'].every(key =>
        Array.isArray(value?.daily?.[key]) && value.daily[key].length > 0 && value.daily[key].every(Number.isFinite));
  }
  try { const saved = JSON.parse(localStorage.getItem(KEY)); if (valid(saved)) cached = saved; } catch (_) {}
  async function get() {
    if (cached && !cached.stale && Date.now() - cached.fetchedAt < FRESH) return cached;
    if (flight) return flight;
    flight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/index?route=weather', {signal: controller.signal});
        if (!response.ok) throw new Error('Weather unavailable');
        const value = await response.json();
        if (!valid(value) || Date.now() - value.fetchedAt > MAX_AGE) throw new Error('Invalid forecast');
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
