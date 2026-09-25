const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-shared-album-v1';
const CONFIG_KEY = 'album-config';
const CACHE_KEY = 'album-latest';
const CONFIG_TTL_SECONDS = 60 * 60 * 24 * 3650;
const DATA_TTL_SECONDS = 60 * 15;
const FRESH_CACHE_MS = 60 * 1000;
const PREVIEW_MAX_EDGE = 640;
const VIEWER_MAX_EDGE = null;
const EXPECTED_SETUP_SHA256 = '89bb9543fa407ae3542bdf4f1b63578e827933ae4583eb032b1d9f29add5cf80';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function cacheOf(options = {}) {
  return options.albumCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function extractToken(value) {
  const raw = String(value || '').trim();
  const hash = raw.match(/#([A-Za-z0-9_-]+)$/);
  if (hash) return hash[1];
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  throw new Error('shared-album-invalid');
}

function normalizeAlbumUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\/www\.icloud\.com\/sharedalbum\/#([A-Za-z0-9_-]+)$/i.test(raw)) {
    throw new Error('shared-album-invalid');
  }
  return raw;
}

function decodeSetupKey(value) {
  const key = String(value || '').trim();
  if (!key) throw new Error('shared-album-setup-key-required');
  let raw;
  try { raw = Buffer.from(key, 'base64url').toString('utf8'); }
  catch { throw new Error('shared-album-setup-key-invalid'); }
  if (sha256(raw) !== EXPECTED_SETUP_SHA256) throw new Error('shared-album-setup-key-invalid');
  const url = normalizeAlbumUrl(raw);
  return { url, token: extractToken(url) };
}

async function saveAlbumConfig(config, options = {}) {
  const row = { url: normalizeAlbumUrl(config.url), token: extractToken(config.token || config.url) };
  await cacheOf(options).set(CONFIG_KEY, row, { ttl: CONFIG_TTL_SECONDS, tags: ['rudi-shared-album'] });
  return row;
}

async function readAlbumConfig(options = {}) {
  const row = await cacheOf(options).get(CONFIG_KEY);
  if (!row?.url || !row?.token) return null;
  return { url: normalizeAlbumUrl(row.url), token: extractToken(row.token) };
}

function base62ToInt(value) {
  let result = 0;
  for (const char of String(value || '')) {
    const index = BASE62.indexOf(char);
    if (index < 0) throw new Error('shared-album-token-invalid');
    result = result * 62 + index;
  }
  return result;
}

function initialHost(token) {
  const prefix = token[0] === 'A' ? token.slice(1, 2) : token.slice(1, 3);
  const part = base62ToInt(prefix);
  return `p${String(part).padStart(2, '0')}-sharedstreams.icloud.com`;
}

async function postICloud(host, token, endpoint, body, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = `https://${host}/${token}/sharedstreams/${endpoint}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'cache-control': 'no-cache',
      'user-agent': 'Photos/5.0 (Macintosh; OS X 10.15.4) AppleWebKit/605.1.15',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 330) {
    const payload = await response.json().catch(() => ({}));
    const nextHost = String(payload?.['X-Apple-MMe-Host'] || response.headers?.get?.('x-apple-mme-host') || '').trim();
    if (!nextHost || nextHost === host) throw new Error('shared-album-redirect-invalid');
    return postICloud(nextHost, token, endpoint, body, options);
  }

  if (!response.ok) throw new Error(`shared-album-http-${response.status}`);
  const payload = await response.json();
  const payloadHost = String(payload?.['X-Apple-MMe-Host'] || '').trim();
  if (endpoint === 'webstream' && payloadHost && payloadHost !== host) {
    return postICloud(payloadHost, token, endpoint, body, options);
  }
  return { payload, host };
}

function photoDate(photo) {
  const raw = String(photo?.batchDateCreated || photo?.dateCreated || '');
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function photoLocationMetadata(photo) {
  const source = photo?.location && typeof photo.location === 'object'
    ? photo.location
    : (photo?.locationInfo && typeof photo.locationInfo === 'object' ? photo.locationInfo : {});
  const candidates = [
    photo?.locationName,
    source?.name,
    source?.label,
    source?.formattedAddress,
    source?.address,
    source?.locality,
    source?.city,
  ].filter((value) => typeof value === 'string' && value.trim());
  const latitude = Number(source?.latitude ?? source?.lat ?? photo?.latitude);
  const longitude = Number(source?.longitude ?? source?.lon ?? source?.lng ?? photo?.longitude);
  return {
    label: candidates.length ? String(candidates[0]).trim() : '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function derivativeScore(item) {
  const width = Number(item?.width || 0);
  const height = Number(item?.height || 0);
  const pixels = width > 0 && height > 0 ? width * height : 0;
  return [pixels, Number(item?.fileSize || 0)];
}

function pickDerivative(photo) {
  const values = Object.values(photo?.derivatives || {}).filter((item) => item && item.checksum);
  if (!values.length) return null;

  const withSize = values.map((item) => ({
    item,
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    bytes: Number(item.fileSize || 0),
  }));
  const previews = withSize
    .filter((row) => row.width > 0 && row.height > 0 && Math.max(row.width, row.height) <= PREVIEW_MAX_EDGE)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.bytes - a.bytes);
  if (previews.length) return previews[0].item;

  const smallest = withSize
    .filter((row) => row.width > 0 && row.height > 0)
    .sort((a, b) => (a.width * a.height) - (b.width * b.height) || a.bytes - b.bytes);
  return smallest[0]?.item || values[0];
}

function pickViewerDerivative(photo) {
  const values = Object.values(photo?.derivatives || {}).filter((item) => item && item.checksum);
  if (!values.length) return null;
  const rows = values.map((item) => ({
    item,
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    bytes: Number(item.fileSize || 0),
  }));
  const sized = rows
    .filter((row) => row.width > 0 && row.height > 0)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.bytes - a.bytes);
  if (sized.length) return sized[0].item;
  return rows.sort((a, b) => b.bytes - a.bytes)[0]?.item || values[0];
}

function assetUrl(assetData, checksum) {
  const item = assetData?.items?.[checksum];
  if (!item) return '';
  const location = assetData?.locations?.[item.url_location];
  const scheme = String(location?.scheme || 'https');
  const host = String(location?.hosts?.[0] || item.url_location || '');
  const path = String(item.url_path || '');
  if (!host || !path) return '';
  return `${scheme}://${host}${path}`;
}

async function fetchLatestPhotos(config, options = {}) {
  const token = config.token;
  let host = initialHost(token);
  const streamResult = await postICloud(host, token, 'webstream', { streamCtag: null }, options);
  host = streamResult.host;
  const allPhotos = (Array.isArray(streamResult.payload?.photos) ? streamResult.payload.photos : [])
    .filter((photo) => photo?.mediaAssetType !== 'video' && photo?.photoGuid)
    .sort((a, b) => photoDate(b) - photoDate(a));
  const totalCount = allPhotos.length;
  const photos = allPhotos.slice(0, 250);

  if (!photos.length) return {
    photos: [],
    totalCount,
    albumUrl: config.url,
    title: String(streamResult.payload?.streamName || 'Общий альбом'),
  };

  const assetResult = await postICloud(host, token, 'webasseturls', { photoGuids: photos.map((p) => p.photoGuid) }, options);
  const result = photos.map((photo) => {
    const derivative = pickDerivative(photo);
    const fullDerivative = pickViewerDerivative(photo) || derivative;
    const checksum = derivative?.checksum || '';
    const fullChecksum = fullDerivative?.checksum || checksum;
    const location = photoLocationMetadata(photo);
    return {
      id: String(photo.photoGuid),
      url: assetUrl(assetResult.payload, checksum),
      fullUrl: assetUrl(assetResult.payload, fullChecksum) || assetUrl(assetResult.payload, checksum),
      width: Number(derivative?.width || photo.width || 0) || null,
      height: Number(derivative?.height || photo.height || 0) || null,
      fullWidth: Number(fullDerivative?.width || photo.width || 0) || null,
      fullHeight: Number(fullDerivative?.height || photo.height || 0) || null,
      date: String(photo.batchDateCreated || photo.dateCreated || ''),
      caption: String(photo.caption || '').trim(),
      location: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }).filter((photo) => photo.url);

  return {
    photos: result,
    totalCount,
    albumUrl: config.url,
    title: String(streamResult.payload?.streamName || 'Общий альбом').trim() || 'Общий альбом',
  };
}

async function getLatestPhotos(options = {}) {
  const cache = cacheOf(options);
  const config = options.albumConfig?.url ? { url: normalizeAlbumUrl(options.albumConfig.url), token: extractToken(options.albumConfig.token || options.albumConfig.url) } : await readAlbumConfig({ ...options, albumCache: cache });
  if (!config) return { configured: false, photos: [], totalCount: 0, albumUrl: null, title: 'Общий альбом' };

  const cached = await cache.get(CACHE_KEY).catch(() => null);
  const now = Number(options.now || Date.now());
  const cachedAt = Date.parse(String(cached?.updatedAt || ''));
  if (cached?.photos && Number.isFinite(cachedAt) && now >= cachedAt && now - cachedAt < FRESH_CACHE_MS) {
    return { ...cached, configured: true, cached: true };
  }
  try {
    const fresh = await fetchLatestPhotos(config, options);
    const result = { configured: true, ...fresh, updatedAt: new Date(now).toISOString() };
    await cache.set(CACHE_KEY, result, { ttl: DATA_TTL_SECONDS, tags: ['rudi-shared-album'] }).catch(() => false);
    return result;
  } catch (error) {
    if (cached?.photos) return { ...cached, configured: true, stale: true };
    throw error;
  }
}

module.exports = {
  DATA_TTL_SECONDS,
  FRESH_CACHE_MS,
  PREVIEW_MAX_EDGE,
  VIEWER_MAX_EDGE,
  decodeSetupKey,
  saveAlbumConfig,
  readAlbumConfig,
  initialHost,
  pickDerivative,
  pickViewerDerivative,
  fetchLatestPhotos,
  getLatestPhotos,
};
