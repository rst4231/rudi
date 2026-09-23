const URL = 'https://api.open-meteo.com/v1/forecast?latitude=59.9386&longitude=30.3141&current=temperature_2m,weather_code,precipitation,rain&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&forecast_days=7&timezone=Europe%2FMoscow';
const FRESH = 15 * 60 * 1000;
const MAX_AGE = 2 * 60 * 60 * 1000;
function valid(data) {
  const daily = data?.daily;
  const keys = ['temperature_2m_min', 'temperature_2m_max', 'precipitation_sum'];
  return Number.isFinite(data?.current?.temperature_2m) && Number.isFinite(data?.current?.weather_code)
    && keys.every(key => Array.isArray(daily?.[key]) && daily[key].length > 0 && daily[key].every(Number.isFinite))
    && keys.every(key => daily[key].length === daily.temperature_2m_min.length);
}
function createWeatherService({fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 6000} = {}) {
  let cached = null, flight = null;
  return async function getWeather() {
    if (cached && now() - cached.fetchedAt < FRESH) return cached;
    if (flight) return flight;
    flight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(URL, {signal: controller.signal});
        if (!response.ok) throw new Error('Weather provider unavailable');
        const data = await response.json();
        if (!valid(data)) throw new Error('Invalid forecast');
        cached = {current: data.current, daily: data.daily, fetchedAt: now(), stale: false};
        return cached;
      } catch (error) {
        if (cached && now() - cached.fetchedAt <= MAX_AGE) return {...cached, stale: true};
        throw error;
      } finally { clearTimeout(timer); }
    })();
    try { return await flight; } finally { flight = null; }
  };
}
const getWeather = createWeatherService();
async function handleWeatherRequest(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({error: 'Method not allowed'}); }
  try {
    const data = await getWeather();
    res.setHeader('Cache-Control', data.stale ? 'no-store' : 'public, max-age=60, s-maxage=600');
    return res.status(200).json(data);
  } catch (_) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({error: 'Weather temporarily unavailable'});
  }
}
module.exports = {createWeatherService, handleWeatherRequest};
