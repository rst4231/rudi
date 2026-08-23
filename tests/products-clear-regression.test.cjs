const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('direct Очистить deletes current list without entering old runtime', () => {
  const start = source.indexOf('if (isProductsClearCallback(req))');
  const end = source.indexOf('if (isTelegramClearIntent(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /deleteProductsListMessage/);
  assert.doesNotMatch(block, /runRuntime\(/);
});

test('Куплено deletes current list without replaying old clear callback', () => {
  const start = source.indexOf('if (boughtAction)');
  const end = source.indexOf('if (isProductsClearCallback(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /deleteProductsListMessage/);
  assert.doesNotMatch(block, /runWithExistingClearAction/);
  assert.doesNotMatch(block, /runRuntime\(/);
});
