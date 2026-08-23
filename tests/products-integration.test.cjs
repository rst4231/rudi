const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const entryPath = path.join(__dirname, '..', 'api', 'index.js');

test('Telegram entrypoint clears Куплено by deleting the current list without old runtime replay', () => {
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.match(source, /require\(['"]\.\/products-bought\.cjs['"]\)/);
  assert.match(source, /const boughtAction = await handleBoughtCallback\(req,\s*res\)/);
  const start = source.indexOf('if (boughtAction)');
  const end = source.indexOf('if (isProductsClearCallback(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /runAuthorizedProductsClear/);
  assert.match(block, /deleteProductsListMessage/);
  assert.match(block, /sendBoughtNotice/);
  assert.doesNotMatch(block, /runWithExistingClearAction/);
  assert.doesNotMatch(block, /runRuntime\(/);
  assert.match(source, /runWithProductsContext/);
  assert.match(source, /route === 'init-products'/);
});
