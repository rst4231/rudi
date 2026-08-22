const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadState(options = {}) {
  let products = [];
  const events = [];
  const base = {
    PRODUCTS_TOPIC_ID: 263,
    PRODUCTS_HISTORY_KEY: 'products:history',
    PRODUCTS_MIGRATION_KEY: 'products:migration',
    restoreCompoundProducts: (x) => x,
    isTelegramProductAddition: () => true,
    cleanProductUtterance: (x) => x,
    getProductRemovalTarget: () => '',
    markProductsRuntimeStale() {},
    removeProductsFromHistory: (x) => x,
    writeProductsHistory: async () => {},
    async runProductsAddition(req, task) { return task(); },
    async runAuthorizedProductsClear(task) { return task(); },
  };
  const durable = {
    getProductsCache() { throw new Error('not used'); },
    async isInitialized() { return true; },
    async hasDurableState() { return true; },
    async markInitialized() {},
    async ensureInitialized() { return products; },
    async readProducts() { return [...products]; },
    async addProducts(values) { events.push('persist'); if (options.addError) throw options.addError; products = [...new Set([...products, ...values])]; return [...products]; },
    async removeProducts() { return [...products]; },
    async replaceProducts(values) { products = [...values]; return [...products]; },
    async clearProducts() { products = []; return []; },
  };
  const author = { runWithProductsUpdateAuthorName: (_name, task) => task() };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === './products-state-base.cjs') return base;
    if (request === './products-durable-state.cjs') return durable;
    if (request === './products-update-author.cjs') return author;
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = path.resolve(__dirname, '../api/products-state.cjs');
  delete require.cache[modulePath];
  try {
    const state = require(modulePath);
    return { state, events, getProducts: () => [...products] };
  } finally {
    Module._load = originalLoad;
  }
}

test('new product is durably persisted before runtime is allowed to publish it', async () => {
  const { state, events, getProducts } = loadState();
  const req = { body: { message: { message_thread_id: 263, text: 'молоко', from: { id: 1 } } } };
  await state.runProductsAddition(req, async () => {
    events.push('runtime');
    assert.deepEqual(getProducts(), ['молоко']);
  }, { cache: { get: async () => null, set: async () => {} } });
  assert.deepEqual(events.slice(0, 2), ['persist', 'runtime']);
});

test('runtime failure does not lose a product that was already accepted for publication', async () => {
  const { state, getProducts } = loadState();
  const req = { body: { message: { message_thread_id: 263, text: 'сыр', from: { id: 1 } } } };
  await assert.rejects(
    state.runProductsAddition(req, async () => { throw new Error('telegram failed'); }, { cache: { get: async () => null, set: async () => {} } }),
    /telegram failed/,
  );
  assert.deepEqual(getProducts(), ['сыр']);
});

test('durable write failure prevents runtime publication', async () => {
  const { state, events, getProducts } = loadState({ addError: new Error('storage unavailable') });
  const req = { body: { message: { message_thread_id: 263, text: 'хлеб', from: { id: 1 } } } };
  let runtimeCalled = false;
  await assert.rejects(
    state.runProductsAddition(req, async () => { runtimeCalled = true; }, { cache: { get: async () => null, set: async () => {} } }),
    /storage unavailable/,
  );
  assert.equal(runtimeCalled, false);
  assert.deepEqual(events, ['persist']);
  assert.deepEqual(getProducts(), []);
});
