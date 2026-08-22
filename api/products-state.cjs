const base = require('./products-state-base.cjs');
const durable = require('./products-durable-state.cjs');
const { runWithProductsUpdateAuthorName } = require('./products-update-author.cjs');

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

async function ensureDurableHistory(cache) {
  if (await durable.isInitialized(cache)) return durable.readProducts({ cache });
  if (await durable.hasDurableState(cache)) {
    await durable.markInitialized(cache);
    return durable.readProducts({ cache });
  }
  // Migrate only an actually persisted legacy array. Never call the legacy
  // reader here because that reader can manufacture the old hard-coded
  // `фарш куриный` default when the key is absent.
  const legacy = await cache.get(base.PRODUCTS_HISTORY_KEY);
  return durable.ensureInitialized(Array.isArray(legacy) ? legacy : [], { cache });
}

function createDurableCacheAdapter(cache) {
  return {
    async get(key) {
      if (key === base.PRODUCTS_HISTORY_KEY) return ensureDurableHistory(cache);
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
  const result = await durable.replaceProducts(history, { cache });
  await mirrorLegacyHistory(result, cache);
  base.markProductsRuntimeStale();
  return result;
}

async function runProductsAddition(req, task, options = {}) {
  const raw = getRawInput(req);
  const removalTarget = base.getProductRemovalTarget(raw);
  const current = getCurrentProduct(req, raw);
  const cache = resolveCache(options);

  await ensureDurableHistory(cache);
  base.markProductsRuntimeStale();
  const runtimeTask = req?.body?.request
    ? () => runWithProductsUpdateAuthorName('Алиса', task)
    : task;
  const result = await base.runProductsAddition(req, runtimeTask, { ...options, cache: createDurableCacheAdapter(cache) });

  if (removalTarget) {
    const latest = await durable.readProducts({ cache });
    const desired = base.removeProductsFromHistory(latest, removalTarget);
    const desiredKeys = new Set(desired.map(normalizeKey));
    const removed = latest.filter((product) => !desiredKeys.has(normalizeKey(product)));
    const updated = removed.length ? await durable.removeProducts(removed, { cache }) : latest;
    await mirrorLegacyHistory(updated, cache);
    base.markProductsRuntimeStale();
    return result;
  }

  if (current) {
    const updated = await durable.addProducts([current], { cache });
    await mirrorLegacyHistory(updated, cache);
    base.markProductsRuntimeStale();
  }
  return result;
}

async function runAuthorizedProductsClear(task, options = {}) {
  const cache = resolveCache(options);
  await ensureDurableHistory(cache);
  const result = await base.runAuthorizedProductsClear(task, { ...options, cache: createDurableCacheAdapter(cache) });
  await durable.clearProducts({ cache });
  await mirrorLegacyHistory([], cache);
  base.markProductsRuntimeStale();
  return result;
}

module.exports = {
  ...base,
  readProductsHistory,
  writeProductsHistory,
  runProductsAddition,
  runAuthorizedProductsClear,
  createDurableCacheAdapter,
  ensureDurableHistory,
};
