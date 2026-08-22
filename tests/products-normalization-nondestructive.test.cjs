const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('automatic composite migration never clears or replaces the whole durable list', async () => {
  let products = ['молоко, яйца', 'сыр'];
  const events = [];
  const durable = {
    getProductsCache() { throw new Error('not used'); },
    async isInitialized() { return true; },
    async hasDurableState() { return true; },
    async markInitialized() {},
    async readProducts() { return [...products]; },
    async ensureInitialized() { return [...products]; },
    async addProducts(items) {
      events.push(['add', [...items]]);
      products = [...new Set([...products, ...items])];
      return [...products];
    },
    async removeProducts(items) {
      events.push(['remove', [...items]]);
      products = products.filter((p) => !items.includes(p));
      return [...products];
    },
    async replaceProducts() {
      events.push(['replace']);
      throw new Error('destructive replace must not be used by automatic migration');
    },
    async clearProducts() { products = []; return []; },
  };
  const base = {
    PRODUCTS_TOPIC_ID: 263,
    PRODUCTS_HISTORY_KEY: 'products:history',
    PRODUCTS_MIGRATION_KEY: 'products:migration',
    restoreCompoundProducts: (x) => String(x || ''),
    normalizeCompoundProducts: (x) => String(x || ''),
    isTelegramProductAddition: () => false,
    cleanProductUtterance: (x) => String(x || ''),
    getProductRemovalTarget: () => '',
    markProductsRuntimeStale() {},
    removeProductsFromHistory: (x) => x,
    writeProductsHistory: async (x) => x,
    async runProductsAddition(_req, task) { return task(); },
    async runAuthorizedProductsClear(task) { return task(); },
  };
  const author = { runWithProductsUpdateAuthorName: (_name, task) => task() };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === './products-durable-state.cjs') return durable;
    if (request === './products-state-base.cjs') return base;
    if (request === './products-update-author.cjs') return author;
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = path.resolve(__dirname, '../api/products-state.cjs');
  delete require.cache[modulePath];
  let state;
  try { state = require(modulePath); } finally { Module._load = originalLoad; }

  const cache = { async get() { return null; }, async set() {} };
  const result = await state.readProductsHistory(cache);
  assert.deepEqual(result, ['сыр', 'молоко', 'яйца']);
  assert.deepEqual(events, [
    ['add', ['молоко', 'яйца']],
    ['remove', ['молоко, яйца']],
  ]);
});
