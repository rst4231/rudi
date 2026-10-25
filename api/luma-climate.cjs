const crypto = require('node:crypto');
const { readSmartHomeSnapshot } = require('./smart-home-client.cjs');

function authorize(request, env = process.env) {
  const expected = String(env.RUDI_LUMA_CLIMATE_TOKEN_SHA256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const header = String(request?.headers?.authorization || '');
  const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header);
  if (!match) return false;
  const given = crypto.createHash('sha256').update(match[1], 'utf8').digest();
  return crypto.timingSafeEqual(given, Buffer.from(expected, 'hex'));
}

function hasError(value) {
  return value?.online === false || value?.reachable === false
    || value?.state?.online === false
    || /^(?:offline|unavailable)$/i.test(String(value?.status || ''))
    || (typeof value?.state === 'string' && /^offline$/i.test(value.state))
    || Boolean(value?.error_code || value?.errorCode || value?.state?.error_code || value?.state?.errorCode);
}

function reading(device, instance) {
  if (hasError(device)) return null;
  const row = (Array.isArray(device?.properties) ? device.properties : [])
    .find(item => item?.parameters?.instance === instance && !hasError(item));
  if (!row || typeof row?.state?.value !== 'number') return null;
  const n = row.state.value;
  if (!Number.isFinite(n)) return null;
  if (instance === 'temperature' && (n < -30 || n > 60)) return null;
  if (instance === 'humidity' && (n < 0 || n > 100)) return null;
  return n;
}

function extractClimate(snapshot) {
  const devices = Array.isArray(snapshot?.devices) ? snapshot.devices : [];
  const paired = devices.find(d => reading(d, 'temperature') !== null && reading(d, 'humidity') !== null);
  if (!paired) return null;
  return {
    temperature: Math.round(reading(paired, 'temperature') * 10) / 10,
    humidity: Math.round(reading(paired, 'humidity')),
    updatedAt: new Date().toISOString(),
  };
}

async function handleLumaClimateRequest(req, res, options = {}) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }
  const env = options.env || process.env;
  if (!env.RUDI_LUMA_CLIMATE_TOKEN_SHA256) {
    return res.status(503).json({ ok: false, error: 'climate-not-configured' });
  }
  if (!authorize(req, env)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const snapshot = await (options.readSmartHomeSnapshot || readSmartHomeSnapshot)(false, {
      fetchImpl: options.fetchImpl || globalThis.fetch,
      observeCamera: false,
    });
    const climate = extractClimate(snapshot);
    if (!climate) return res.status(503).json({ ok: false, error: 'climate-unavailable' });
    return res.status(200).json({ ok: true, ...climate });
  } catch (error) {
    console.warn('RUDI_LUMA_CLIMATE_UNAVAILABLE', String(error?.message || error));
    return res.status(503).json({ ok: false, error: 'climate-unavailable' });
  }
}

module.exports = { authorize, reading, extractClimate, handleLumaClimateRequest };
