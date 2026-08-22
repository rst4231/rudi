const { randomUUID } = require('node:crypto');

const BUCKET_COUNT = 16;
const REPLICA_COUNT = 4;
const CLEAR_REPLICA_COUNT = 4;
const INIT_REPLICA_COUNT = 4;
const BUCKET_PREFIX = 'products:durable:v3:bucket:';
const CLEAR_PREFIX = 'products:durable:v3:clear:';
const INIT_PREFIX = 'products:durable:v3:init:';
const PRODUCTS_CACHE_NAMESPACE = 'rudi-products-state-v2';
const PRODUCTS_TTL_SECONDS = 60 * 60 * 24 * 3650;
const CACHE_OPTIONS = { ttl: PRODUCTS_TTL_SECONDS, tags: ['rudi-products-durable-v3'] };

function getProductsCache() {
  const { getCache } = require('@vercel/functions');
  return getCache({ namespace: PRODUCTS_CACHE_NAMESPACE });
}

function normalizeProduct(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function hash32(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function bucketKey(product, replica) {
  const normalized = normalizeProduct(product);
  const bucket = hash32(`${replica}:${normalized}`) % BUCKET_COUNT;
  return `${BUCKET_PREFIX}${replica}:${bucket}`;
}

function compareRecord(left, right) {
  const lv = Number(left?.version || 0);
  const rv = Number(right?.version || 0);
  if (lv !== rv) return lv - rv;
  return String(left?.eventId || '').localeCompare(String(right?.eventId || ''));
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function cleanBucket(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, record]) => record && typeof record === 'object'));
}

async function cacheSet(cache, key, value) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await cache.set(key, value, CACHE_OPTIONS);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Could not persist ${key}`);
}

async function writeRecordReplica(record, replica, cache, { settleMs = 30, maxAttempts = 5 } = {}) {
  const key = bucketKey(record.normalized, replica);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const bucket = cleanBucket(await cache.get(key));
    const existing = bucket[record.normalized];
    if (existing && compareRecord(existing, record) > 0) return;
    await cacheSet(cache, key, { ...bucket, [record.normalized]: record });
    await sleep(settleMs);
    const confirmed = cleanBucket(await cache.get(key))[record.normalized];
    if (confirmed && compareRecord(confirmed, record) >= 0) return;
  }
  throw new Error(`Could not converge durable product replica ${replica} for ${record.normalized}`);
}

async function writeRecord(record, options = {}) {
  const { cache, settleMs = 30 } = options;
  if (!cache) throw new Error('cache is required');
  await Promise.all(Array.from({ length: REPLICA_COUNT }, (_, replica) =>
    writeRecordReplica(record, replica, cache, { settleMs })));
  return record;
}

async function readAllBuckets(cache) {
  const keys = [];
  for (let replica = 0; replica < REPLICA_COUNT; replica += 1) {
    for (let bucket = 0; bucket < BUCKET_COUNT; bucket += 1) {
      keys.push(`${BUCKET_PREFIX}${replica}:${bucket}`);
    }
  }
  return Promise.all(keys.map((key) => cache.get(key)));
}

async function readClearRecords(cache) {
  return Promise.all(Array.from({ length: CLEAR_REPLICA_COUNT }, (_, index) => cache.get(`${CLEAR_PREFIX}${index}`)));
}

async function readClearVersion(cache) {
  const values = await readClearRecords(cache);
  return values.reduce((max, value) => Math.max(max, Number(value?.version || 0)), 0);
}

async function readProducts({ cache } = {}) {
  if (!cache) throw new Error('cache is required');
  const [buckets, clearVersion] = await Promise.all([readAllBuckets(cache), readClearVersion(cache)]);
  const latest = new Map();
  for (const rawBucket of buckets) {
    for (const record of Object.values(cleanBucket(rawBucket))) {
      const normalized = normalizeProduct(record.normalized || record.product);
      if (!normalized) continue;
      const candidate = { ...record, normalized };
      const existing = latest.get(normalized);
      if (!existing || compareRecord(existing, candidate) < 0) latest.set(normalized, candidate);
    }
  }
  return [...latest.values()]
    .filter((record) => record.present !== false && Number(record.version || 0) > clearVersion)
    .sort((a, b) => Number(a.version || 0) - Number(b.version || 0) || Number(a.order || 0) - Number(b.order || 0) || String(a.product).localeCompare(String(b.product), 'ru'))
    .map((record) => String(record.product).trim());
}

function uniqueProducts(products) {
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(products) ? products : []) {
    const product = String(item || '').trim();
    const normalized = normalizeProduct(product);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ product, normalized });
  }
  return result;
}

async function mutateProducts(products, present, options = {}) {
  const { cache, version = Date.now(), eventId = `${version}-${randomUUID()}`, settleMs = 30 } = options;
  if (!cache) throw new Error('cache is required');
  const unique = uniqueProducts(products);
  await Promise.all(unique.map(({ product, normalized }, order) => writeRecord({ product, normalized, present, version, eventId, order }, { cache, settleMs })));
  return readProducts({ cache });
}

async function addProducts(products, options = {}) {
  return mutateProducts(products, true, options);
}

async function removeProducts(products, options = {}) {
  return mutateProducts(products, false, options);
}

async function clearProducts(options = {}) {
  const { cache, version = Date.now(), eventId = `${version}-${randomUUID()}`, settleMs = 30 } = options;
  if (!cache) throw new Error('cache is required');
  const record = { version, eventId };
  await Promise.all(Array.from({ length: CLEAR_REPLICA_COUNT }, (_, index) => cacheSet(cache, `${CLEAR_PREFIX}${index}`, record)));
  await sleep(settleMs);
  return [];
}

async function isInitialized(cache) {
  const values = await Promise.all(Array.from({ length: INIT_REPLICA_COUNT }, (_, index) => cache.get(`${INIT_PREFIX}${index}`)));
  return values.some((value) => value?.initialized === true);
}

async function markInitialized(cache, version = Date.now()) {
  const marker = { initialized: true, version };
  await Promise.all(Array.from({ length: INIT_REPLICA_COUNT }, (_, index) => cacheSet(cache, `${INIT_PREFIX}${index}`, marker)));
}

async function hasDurableState(cache) {
  const [buckets, clearRecords] = await Promise.all([readAllBuckets(cache), readClearRecords(cache)]);
  return buckets.some((bucket) => Object.keys(cleanBucket(bucket)).length > 0)
    || clearRecords.some((value) => value && Number(value.version || 0) > 0);
}

async function ensureInitialized(seedProducts, options = {}) {
  const { cache, settleMs = 30 } = options;
  if (!cache) throw new Error('cache is required');
  if (await isInitialized(cache)) return readProducts({ cache });
  if (await hasDurableState(cache)) {
    await markInitialized(cache);
    return readProducts({ cache });
  }
  const seed = uniqueProducts(seedProducts).map(({ product }) => product);
  if (!seed.length) return [];
  await addProducts(seed, { cache, version: 1, eventId: 'legacy-seed', settleMs });
  await markInitialized(cache, 1);
  return readProducts({ cache });
}

async function replaceProducts(products, options = {}) {
  const { cache, version = Date.now(), settleMs = 30 } = options;
  if (!cache) throw new Error('cache is required');
  await clearProducts({ cache, version, eventId: `replace-clear-${version}`, settleMs });
  const desired = uniqueProducts(products).map(({ product }) => product);
  if (desired.length) {
    await addProducts(desired, { cache, version: version + 1, eventId: `replace-add-${version + 1}`, settleMs });
  }
  await markInitialized(cache, version + 1);
  return readProducts({ cache });
}

module.exports = {
  PRODUCTS_CACHE_NAMESPACE,
  BUCKET_COUNT,
  REPLICA_COUNT,
  getProductsCache,
  normalizeProduct,
  bucketKey,
  readProducts,
  addProducts,
  removeProducts,
  clearProducts,
  ensureInitialized,
  replaceProducts,
  isInitialized,
  hasDurableState,
};