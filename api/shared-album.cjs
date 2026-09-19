const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-shared-album-v1';
const CONFIG_KEY = 'album-config';
const CACHE_KEY = 'album-latest';
const CONFIG_TTL_SECONDS = 60 * 60 * 24 * 3650;
const DATA_TTL_SECONDS = 60 * 15;
const EXPECTED_SETUP_SHA256 = 'aba579924a7a9e9503574beabc2542b5c9e905fe4e2b16291416f1e5976d953c';
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
  return { payload: await response.json(), host };
}

function photoDate(photo) {
  const raw = String(photo?.batchDateCreated || photo?.dateCreated || '');
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function pickDerivative(photo) {
  const values = Object.values(photo?.derivatives || {}).filter((item) => item && item.checksum);
  if (!values.length) return null;
  const suitable = values
    .filter((item) => Number(item.width || 0) <= 1600 && Number(item.height || 0) <= 1600)
    .sort((a, b) => Number(b.fileSize || 0) - Number(a.fileSize || 0));
  return suitable[0] || values.sort((a, b) => Number(b.fileSize || 0) - Number(a.fileSize || 0))[0];
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
  const photos = (Array.isArray(streamResult.payload?.photos) ? streamResult.payload.photos : [])
    .filter((photo) => photo?.mediaAssetType !== 'video' && photo?.photoGuid)
    .sort((a, b) => photoDate(b) - photoDate(a))
    .slice(0, 5);

  if (!photos.length) return { photos: [], albumUrl: config.url, title: String(streamResult.payload?.streamName || 'Общий альбом') };

  const assetResult = await postICloud(host, token, 'webasseturls', { photoGuids: photos.map((p) => p.photoGuid) }, options);
  const result = photos.map((photo) => {
    const derivative = pickDerivative(photo);
    const checksum = derivative?.checksum || '';
    return {
      id: String(photo.photoGuid),
      url: assetUrl(assetResult.payload, checksum),
      width: Number(derivative?.width || photo.width || 0) || null,
      height: Number(derivative?.height || photo.height || 0) || null,
      date: String(photo.batchDateCreated || photo.dateCreated || ''),
      caption: String(photo.caption || '').trim(),
    };
  }).filter((photo) => photo.url);

  return {
    photos: result,
    albumUrl: config.url,
    title: String(streamResult.payload?.streamName || 'Общий альбом').trim() || 'Общий альбом',
  };
}

async function getLatestPhotos(options = {}) {
  const cache = cacheOf(options);
  const config = await readAlbumConfig({ ...options, albumCache: cache });
  if (!config) return { configured: false, photos: [], albumUrl: null, title: 'Общий альбом' };

  const cached = await cache.get(CACHE_KEY);
  try {
    const fresh = await fetchLatestPhotos(config, options);
    const result = { configured: true, ...fresh, updatedAt: new Date(options.now || Date.now()).toISOString() };
    await cache.set(CACHE_KEY, result, { ttl: DATA_TTL_SECONDS, tags: ['rudi-shared-album'] });
    return result;
  } catch (error) {
    if (cached?.photos) return { ...cached, configured: true, stale: true };
    throw error;
  }
}

module.exports = {
  decodeSetupKey, saveAlbumConfig, readAlbumConfig, initialHost, fetchLatestPhotos, getLatestPhotos,
};
