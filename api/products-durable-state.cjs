const SLOT_COUNT = 128;
const REPLICA_COUNT = 4;
const CLEAR_REPLICA_COUNT = 4;
const SLOT_PREFIX = 'products:durable:slot:';
const CLEAR_PREFIX = 'products:durable:clear:';
const PRODUCTS_CACHE_NAMESPACE = 'rudi-products-state-v2';
const PRODUCTS_TTL_SECONDS = 60 * 60 * 24 * 3650;
const CACHE_OPTIONS = { ttl: PRODUCTS_TTL_SECONDS, tags: ['rudi-products-durable'] };
const RECOVERY_MARKER = 'products:durable:recovery:2026-08-22-v1';
const RECOVERY_PRODUCTS = [
  'куриное филе', 'яйца', 'молоко', 'хлеб', 'бананы', 'огурцы', 'помидоры',
  'сыр', 'рис', 'макароны', 'чай', 'кофе', 'фарш куриный',
];

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

function productSlots(product) {
  const normalized = normalizeProduct(product);
  const result = [];
  for (let replica = 0; replica < REPLICA_COUNT; replica += 1) {
    let slot = hash32(`${replica}:${normalized}`) % SLOT_COUNT;
    while (result.includes(slot)) slot = (slot + 1) % SLOT_COUNT;
    result.push(slot);
  }
  return result;
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

async function writeRecord(record, { cache, settleMs = 80 } = {}) {
  if (!cache) throw new Error('cache is required');
  const slots = productSlots(record.product);
  await Promise.all(slots.map(async (slot) => {
    const key = `${SLOT_PREFIX}${slot}`;
    const existing = await cache.get(key);
    if (existing && normalizeProduct(existing.product) === record.normalized && compareRecord(existing, record) > 0) return;
    await cache.set(key, record, CACHE_OPTIONS);
  }));
  await sleep(settleMs);
  return record;
}

async function readClearVersion(cache) {
  const values = await Promise.all(
    Array.from({ length: CLEAR_REPLICA_COUNT }, (_, index) => cache.get(`${CLEAR_PREFIX}${index}`)),
  );
  return values.reduce((max, value) => Math.max(max, Number(value?.version || 0)), 0);
}

async function readRecords(cache) {
  const values = await Promise.all(
    Array.from({ length: SLOT_COUNT }, (_, index) => cache.get(`${SLOT_PREFIX}${index}`)),
  );
  const latest = new Map();
  for (const record of values) {
    if (!record || typeof record !== 'object') continue;
    const normalized = normalizeProduct(record.normalized || record.product);
    if (!normalized) continue;
    const candidate = { ...record, normalized };
    const existing = latest.get(normalized);
    if (!existing || compareRecord(existing, candidate) < 0) latest.set(normalized, candidate);
  }
  return [...latest.values()];
}

async function readProducts({ cache } = {}) {
  if (!cache) throw new Error('cache is required');
  const [records, clearVersion] = await Promise.all([readRecords(cache), readClearVersion(cache)]);
  return records
    .filter((record) => record.present !== false && Number(record.version || 0) > clearVersion)
    .sort((a, b) => {
      const versionDiff = Number(a.version || 0) - Number(b.version || 0);
      if (versionDiff) return versionDiff;
      const orderDiff = Number(a.order || 0) - Number(b.order || 0);
      if (orderDiff) return orderDiff;
      return String(a.product).localeCompare(String(b.product), 'ru');
    })
    .map((record) => String(record.product).trim());
}

async function mutateProducts(products, present, options = {}) {
  const { cache, version = Date.now(), eventId = `${version}`, settleMs = 80 } = options;
  const unique = [];
  const seen = new Set();
  for (const item of Array.isArray(products) ? products : []) {
    const product = String(item || '').trim();
    const normalized = normalizeProduct(product);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ product, normalized });
  }
  await Promise.all(unique.map(({ product, normalized }, order) => writeRecord({
    product, normalized, present, version, eventId, order,
  }, { cache, settleMs })));
  return readProducts({ cache });
}

async function addProducts(products, options = {}) {
  return mutateProducts(products, true, options);
}

async function removeProducts(products, options = {}) {
  return mutateProducts(products, false, options);
}

async function clearProducts(options = {}) {
  const { cache, version = Date.now(), eventId = `${version}`, settleMs = 80 } = options;
  if (!cache) throw new Error('cache is required');
  const record = { version, eventId };
  await Promise.all(Array.from({ length: CLEAR_REPLICA_COUNT }, (_, index) => cache.set(`${CLEAR_PREFIX}${index}`, record, CACHE_OPTIONS)));
  await sleep(settleMs);
  return [];
}

async function ensureRecoverySeed(options = {}) {
  const { cache, version = Date.now(), settleMs = 80 } = options;
  if (!cache) throw new Error('cache is required');
  const marker = await cache.get(RECOVERY_MARKER);
  if (!marker) {
    await addProducts(RECOVERY_PRODUCTS, {
      cache,
      version,
      eventId: `recovery-${version}`,
      settleMs,
    });
    await cache.set(RECOVERY_MARKER, { version, completed: true }, CACHE_OPTIONS);
    await sleep(settleMs);
  }
  return readProducts({ cache });
}

module.exports = {
  PRODUCTS_CACHE_NAMESPACE,
  SLOT_COUNT,
  REPLICA_COUNT,
  RECOVERY_MARKER,
  RECOVERY_PRODUCTS,
  getProductsCache,
  normalizeProduct,
  productSlots,
  readProducts,
  addProducts,
  removeProducts,
  clearProducts,
  ensureRecoverySeed,
};