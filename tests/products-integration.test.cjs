const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const entryPath = path.join(__dirname, '..', 'api', 'index.js');

test('Telegram entrypoint wires the products button and Куплено callback without replacing normal runtime flow', () => {
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.match(source, /require\(['"]\.\/products-bought\.cjs['"]\)/);
  assert.match(source, /addBoughtButtonToTelegramRequest\(input,\s*nextInit\)/);
  assert.match(source, /handleBoughtCallback\(req,\s*res\)/);
  assert.match(source, /runWithProductsContext/);
  assert.match(source, /route === 'init-products'/);
  assert.match(source, /return await runRuntime\(req,\s*res\)/);
});
