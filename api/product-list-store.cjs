const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-product-list-v1';
const STATE_KEY = 'products';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ACTIVE = 200;
const MAX_HISTORY = 500;
const MAX_TEXT = 180;

let mutationQueue = Promise.resolve();

function cacheOf(options = {}) {
  return options.productCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function normalizeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('product-text-empty');
  if (text.length > MAX_TEXT) throw new Error('product-text-too-long');
  return text;
}

function keyOf(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
}

function normalizeState(value) {
  const items = Array.isArray(value?.items) ? value.items : [];
  const history = Array.isArray(value?.history) ? value.history : [];
  return {
    initialized: Boolean(value?.initialized),
    version: Number(value?.version || 0),
    items: items.map((item) => ({
      id: String(item?.id || ''),
      text: String(item?.text || '').trim().slice(0, MAX_TEXT),
      addedBy: String(item?.addedBy || ''),
      createdAt: String(item?.createdAt || ''),
    })).filter((item) => item.id && item.text).slice(0, MAX_ACTIVE),
    history: history.map((item) => ({
      id: String(item?.id || ''),
      text: String(item?.text || '').trim().slice(0, MAX_TEXT),
      boughtBy: String(item?.boughtBy || ''),
      boughtAt: String(item?.boughtAt || ''),
    })).filter((item) => item.id && item.text && item.boughtAt).slice(0, MAX_HISTORY),
  };
}

async function readRaw(options = {}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY));
}

async function writeState(state, options = {}) {
  const next = normalizeState({
    ...state,
    initialized: true,
    version: Date.now(),
  });
  await cacheOf(options).set(STATE_KEY, next, {
    ttl: TTL_SECONDS,
    tags: ['rudi-products'],
  });
  return next;
}

function enqueue(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function initializeFromLegacy(options = {}) {
  const current = await readRaw(options);
  if (current.initialized) return current;

  let legacy = [];
  try {
    const productsState = require('./products-state.cjs');
    legacy = await productsState.readProductsHistory();
  } catch (error) {
    console.warn('RUDI_PRODUCTS_MIGRATION_WARN', String(error?.message || error));
  }

  const now = new Date(options.now || Date.now()).toISOString();
  const seen = new Set();
  const items = [];
  for (const value of Array.isArray(legacy) ? legacy : []) {
    let text = '';
    try { text = normalizeText(value); } catch { continue; }
    const key = keyOf(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: crypto.randomUUID(),
      text,
      addedBy: 'RUDI',
      createdAt: now,
    });
    if (items.length >= MAX_ACTIVE) break;
  }
  return writeState({ ...current, items }, options);
}

async function readProductList(options = {}) {
  return initializeFromLegacy(options);
}

async function addProducts(values, addedBy = '', options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const existing = new Set(state.items.map((item) => keyOf(item.text)));
    const now = new Date(options.now || Date.now()).toISOString();
    for (const value of Array.isArray(values) ? values : [values]) {
      const text = normalizeText(value);
      const key = keyOf(text);
      if (!key || existing.has(key)) continue;
      state.items.unshift({
        id: crypto.randomUUID(),
        text,
        addedBy: String(addedBy || ''),
        createdAt: now,
      });
      existing.add(key);
      if (state.items.length >= MAX_ACTIVE) break;
    }
    return writeState(state, options);
  });
}

async function removeProduct(id, options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const before = state.items.length;
    state.items = state.items.filter((item) => item.id !== String(id || ''));
    if (state.items.length === before) throw new Error('product-item-not-found');
    return writeState(state, options);
  });
}

async function removeProductByText(value, options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const target = keyOf(value);
    if (!target) return { deleted: false, text: '', state };

    let index = state.items.findIndex((item) => keyOf(item.text) === target);
    if (index < 0) index = state.items.findIndex((item) => keyOf(item.text).includes(target) || target.includes(keyOf(item.text)));
    if (index < 0) return { deleted: false, text: String(value || '').trim(), state };

    const [item] = state.items.splice(index, 1);
    return { deleted: true, text: item.text, state: await writeState(state, options) };
  });
}

async function markProductBought(id, boughtBy = '', options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    const index = state.items.findIndex((item) => item.id === String(id || ''));
    if (index < 0) throw new Error('product-item-not-found');
    const [item] = state.items.splice(index, 1);
    state.history.unshift({
      id: crypto.randomUUID(),
      text: item.text,
      boughtBy: String(boughtBy || ''),
      boughtAt: new Date(options.now || Date.now()).toISOString(),
    });
    state.history = state.history.slice(0, MAX_HISTORY);
    return writeState(state, options);
  });
}

async function clearProducts(options = {}) {
  return enqueue(async () => {
    const state = await readProductList(options);
    state.items = [];
    return writeState(state, options);
  });
}

function resetMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  NAMESPACE, MAX_ACTIVE, MAX_HISTORY, MAX_TEXT,
  readProductList, addProducts, removeProduct, removeProductByText,
  markProductBought, clearProducts, normalizeText, keyOf,
  resetMutationQueueForTests,
};
