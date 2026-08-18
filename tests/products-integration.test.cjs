const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const entryPath = path.join(__dirname, '..', 'api', 'index.js');

test('Telegram entrypoint delegates Куплено into the existing Очистить runtime flow', () => {
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.match(source, /require\(['"]\.\/products-bought\.cjs['"]\)/);
  assert.match(source, /shouldSuppressAnsweredCallbackQuery\(input\)/);
  assert.match(source, /const boughtAction = await handleBoughtCallback\(req,\s*res\)/);
  assert.match(source, /runWithExistingClearAction\(/);
  assert.match(source, /boughtAction\.clearCallbackData/);
  assert.match(source, /\(\) => runRuntime\(req,\s*res\)/);
  assert.match(source, /runWithProductsContext/);
  assert.match(source, /route === 'init-products'/);
});
