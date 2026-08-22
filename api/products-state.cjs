const base = require('./products-state-base.cjs');
const durable = require('./products-durable-state.cjs');
const { runWithProductsUpdateAuthorName } = require('./products-update-author.cjs');

let productsMutationQueue = Promise.resolve();

function enqueueProductsMutation(task) {
  const run = productsMutationQueue.then(task, task);
  productsMutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function normalizeKey(value) {
  return base.restoreCompoundProducts(String(value || '')).trim().toLocaleLowerCase('ru-RU');
}

function getRawInput(req) {
  const message = req?.body?.message;
  if (message && Number(message.message_thread_id) === base.PRODUCTS_TOPIC_ID && typeof message.text === 'string') return message.text.trim();
  const request = req?.body?.request || {};
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  const utterance = typeof request.original_utterance === 'string' ? request.original_utterance.trim() : '';
  return command || utterance;
}

function getCurrentProduct(req, raw) {
  if (base.isTelegramProductAddition(req)) return base.cleanProductUtterance(raw);
  const request = req?.body?.request || {};
  if (request.type === 'SimpleUtterance') return base.cleanProductUtterance(raw);
  return '';
}

function resolveCache(options = {}) { return options.cache || durable.getProductsCache(); }

function splitProductItems(value) {
  const rawText = String(value || '').trim();
  const protectedText = typeof base.normalizeCompoundProducts === 'function'
    ? base.normalizeCompoundProducts(rawText)
    : rawText;
  if (!protectedText) return [];
  const seen = new Set();
  const result = [];
  for (const part of protectedText.split(/\s*(?:[;\n\r]+|(?<!\d),(?!\d)|\s+и\s+)\s*/u)) {
    const product = base.restoreCompoundProducts(part).trim();
    const key = normalizeKey(product);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(product);
  }
  return result;
}

function normalizeHistoryEntries(history) {
  const seen = new Set();
  const result = [];
  for (const entry of Array.isArray(history) ? history : []) {
    for (const product of splitProductItems(entry)) {
      const key = normalizeKey(product);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(product);
    }
  }
  return result;
}

function historyEquals(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  return a.length === b.length && a.every((value, index) => normalizeKey(value) === normalizeKey(b[index]));
}

async function normalizeDurableHistory(cache, history) {
  let current = Array.isArray(history) ? [...history] : [];
  for (const entry of [...current]) {
    const parts = splitProductItems(entry);
    const unchanged = parts.length === 1 && normalizeKey(parts[0]) === normalizeKey(entry);
    if (unchanged || !parts.length) continue;
    current = await durable.addProducts(parts, { cache });
    current = await durable.removeProducts([entry], { cache });
  }
  return normalizeHistoryEntries(current);
}

async function ensureDurableHistory(cache) {
  let history;
  if (await durable.isInitialized(cache)) {
    history = await durable.readProducts({ cache });
  } else if (await durable.hasDurableState(cache)) {
    await durable.markInitialized(cache);
    history = await durable.readProducts({ cache });
  } else {
    const legacy = await cache.get(base.PRODUCTS_HISTORY_KEY);
    history = await durable.ensureInitialized(Array.isArray(legacy) ? legacy : [], { cache });
  }
  return normalizeDurableHistory(cache, history);
}

function createDurableCacheAdapter(cache, historySnapshot = null) {
  const snapshot = Array.isArray(historySnapshot) ? [...historySnapshot] : null;
  return {
    async get(key) {
      if (key === base.PRODUCTS_HISTORY_KEY) return snapshot || ensureDurableHistory(cache);
      if (key === base.PRODUCTS_MIGRATION_KEY) return true;
      return cache.get(key);
    },
    async set(key, value, options) {
      if (key === base.PRODUCTS_HISTORY_KEY || key === base.PRODUCTS_MIGRATION_KEY) return;
      return cache.set(key, value, options);
    },
    async delete(key) { if (typeof cache.delete === 'function') return cache.delete(key); },
  };
}

async function mirrorLegacyHistory(history, cache) {
  try { await base.writeProductsHistory(history, cache); }
  catch (error) { console.warn('RUDI_PRODUCTS_LEGACY_MIRROR_ERROR', String(error?.message || error)); }
}

async function readProductsHistory(cache = durable.getProductsCache()) { return ensureDurableHistory(cache); }

async function writeProductsHistory(history, cache = durable.getProductsCache()) {
  const normalized = normalizeHistoryEntries(history);
  const result = await durable.replaceProducts(normalized, { cache });
  await mirrorLegacyHistory(result, cache);
  base.markProductsRuntimeStale();
  return result;
}

async function runProductsAdditionUnlocked(req, task, options = {}) {
  const raw = getRawInput(req);
  const removalTarget = base.getProductRemovalTarget(raw);
  const current = getCurrentProduct(req, raw);
  const cache = resolveCache(options);

  let runtimeHistory = await ensureDurableHistory(cache);
  if (current && !removalTarget) {
    runtimeHistory = await durable.addProducts([current], { cache });
    await mirrorLegacyHistory(runtimeHistory, cache);
  }
  base.markProductsRuntimeStale();
  const runtimeTask = req?.body?.request
    ? () => runWithProductsUpdateAuthorName('Алиса', task)
    : task;
  const result = await base.runProductsAddition(req, runtimeTask, { ...options, cache: createDurableCacheAdapter(cache, runtimeHistory) });

  if (removalTarget) {
    const latest = await ensureDurableHistory(cache);
    const desired = base.removeProductsFromHistory(latest, removalTarget);
    const desiredKeys = new Set(desired.map(normalizeKey));
    const removed = latest.filter((product) => !desiredKeys.has(normalizeKey(product)));
    const updated = removed.length ? await durable.removeProducts(removed, { cache }) : latest;
    const normalized = await normalizeDurableHistory(cache, updated);
    await mirrorLegacyHistory(normalized, cache);
    base.markProductsRuntimeStale();
    return result;
  }

  if (current) {
    const normalized = await normalizeDurableHistory(cache, await durable.readProducts({ cache }));
    await mirrorLegacyHistory(normalized, cache);
    base.markProductsRuntimeStale();
  }
  return result;
}

function runProductsAddition(req, task, options = {}) {
  return enqueueProductsMutation(() => runProductsAdditionUnlocked(req, task, options));
}

async function runAuthorizedProductsClearUnlocked(task, options = {}) {
  const cache = resolveCache(options);
  const history = await ensureDurableHistory(cache);
  const result = await base.runAuthorizedProductsClear(task, { ...options, cache: createDurableCacheAdapter(cache, history) });
  await durable.clearProducts({ cache });
  await mirrorLegacyHistory([], cache);
  base.markProductsRuntimeStale();
  return result;
}

function runAuthorizedProductsClear(task, options = {}) {
  return enqueueProductsMutation(() => runAuthorizedProductsClearUnlocked(task, options));
}

function resetProductsMutationQueueForTests() { productsMutationQueue = Promise.resolve(); }

module.exports = {
  ...base,
  readProductsHistory,
  writeProductsHistory,
  runProductsAddition,
  runAuthorizedProductsClear,
  createDurableCacheAdapter,
  ensureDurableHistory,
  splitProductItems,
  normalizeHistoryEntries,
  resetProductsMutationQueueForTests,
};
