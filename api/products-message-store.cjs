const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const PRODUCTS_MESSAGE_CACHE_NAMESPACE = 'rudi-products-chat-messages-v1';
const PRODUCTS_MESSAGE_INDEX_KEY = 'alice-products:index';
const PRODUCTS_MESSAGE_TTL_SECONDS = 60 * 60 * 24 * 3650;
const CACHE_OPTIONS = {
  ttl: PRODUCTS_MESSAGE_TTL_SECONDS,
  tags: ['rudi-products-chat-messages'],
};

let mutationQueue = Promise.resolve();

function getProductsMessageCache(options = {}) {
  return createStrictRuntimeCache({ namespace: PRODUCTS_MESSAGE_CACHE_NAMESPACE, ...options });
}

function normalizeProductMessageText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[.!?]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function productStackKey(normalized) {
  return `alice-products:position:${normalized}`;
}

function cleanRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const text = String(value.text || '').trim();
  const normalized = normalizeProductMessageText(value.normalized || text);
  const messageId = Number(value.messageId);
  if (!text || !normalized || !Number.isInteger(messageId)) return null;
  return {
    text,
    normalized,
    messageId,
    createdAt: Number(value.createdAt || 0),
  };
}

function cleanRecords(values) {
  return (Array.isArray(values) ? values : []).map(cleanRecord).filter(Boolean);
}

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function readIndex(cache) {
  const stored = await cache.get(PRODUCTS_MESSAGE_INDEX_KEY);
  return [...new Set((Array.isArray(stored) ? stored : [])
    .map(normalizeProductMessageText)
    .filter(Boolean))];
}

async function writeIndex(cache, values) {
  const normalized = [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeProductMessageText)
    .filter(Boolean))];
  await cache.set(PRODUCTS_MESSAGE_INDEX_KEY, normalized, {
    ...CACHE_OPTIONS,
    name: PRODUCTS_MESSAGE_INDEX_KEY,
  });
  return normalized;
}

async function readProductStack(normalized, cache) {
  if (!normalized) return [];
  return cleanRecords(await cache.get(productStackKey(normalized)));
}

async function writeProductStack(normalized, records, cache) {
  const key = productStackKey(normalized);
  const cleaned = cleanRecords(records).filter((record) => record.normalized === normalized);
  await cache.set(key, cleaned, { ...CACHE_OPTIONS, name: key });
  return cleaned;
}

async function recordAliceProductMessage(record, options = {}) {
  return enqueueMutation(async () => {
    const cache = options.cache || getProductsMessageCache();
    const cleaned = cleanRecord(record);
    if (!cleaned) throw new Error('Invalid Alice product message record');
    const [stack, index] = await Promise.all([
      readProductStack(cleaned.normalized, cache),
      readIndex(cache),
    ]);
    await writeProductStack(cleaned.normalized, [...stack, cleaned], cache);
    if (!index.includes(cleaned.normalized)) await writeIndex(cache, [...index, cleaned.normalized]);
    return cleaned;
  });
}

async function findLatestAliceProductMessage(text, options = {}) {
  const cache = options.cache || getProductsMessageCache();
  const normalized = normalizeProductMessageText(text);
  if (!normalized) return null;
  const stack = await readProductStack(normalized, cache);
  return stack.length ? stack[stack.length - 1] : null;
}

async function removeAliceProductMessageRecord(record, options = {}) {
  return enqueueMutation(async () => {
    const cache = options.cache || getProductsMessageCache();
    const cleaned = cleanRecord(record);
    if (!cleaned) return false;
    const stack = await readProductStack(cleaned.normalized, cache);
    const next = stack.filter((item) => item.messageId !== cleaned.messageId);
    await writeProductStack(cleaned.normalized, next, cache);
    return next.length !== stack.length;
  });
}

async function readAliceProductMessageRecords(options = {}) {
  const cache = options.cache || getProductsMessageCache();
  const index = await readIndex(cache);
  const stacks = await Promise.all(index.map((normalized) => readProductStack(normalized, cache)));
  return stacks.flat().sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0) || a.messageId - b.messageId);
}

async function writeAliceProductMessageRecords(records, options = {}) {
  return enqueueMutation(async () => {
    const cache = options.cache || getProductsMessageCache();
    const cleaned = cleanRecords(records);
    const grouped = new Map();
    for (const record of cleaned) {
      if (!grouped.has(record.normalized)) grouped.set(record.normalized, []);
      grouped.get(record.normalized).push(record);
    }
    const index = [...grouped.keys()];
    await Promise.all([...grouped.entries()].map(([normalized, values]) => writeProductStack(normalized, values, cache)));
    await writeIndex(cache, index);
    return readAliceProductMessageRecords({ cache });
  });
}

function resetProductsMessageMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  PRODUCTS_MESSAGE_CACHE_NAMESPACE,
  PRODUCTS_MESSAGE_INDEX_KEY,
  getProductsMessageCache,
  normalizeProductMessageText,
  recordAliceProductMessage,
  findLatestAliceProductMessage,
  removeAliceProductMessageRecord,
  readAliceProductMessageRecords,
  writeAliceProductMessageRecords,
  resetProductsMessageMutationQueueForTests,
};
