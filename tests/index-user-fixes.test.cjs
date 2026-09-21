const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping keeps the launch prompt and updates the shared list silently', () => {
  assert.match(source, /buildAliceShoppingLaunchResponse/);
  assert.match(source, /route === 'alice-shopping'/);
  assert.match(source, /addSharedProducts/);
  assert.doesNotMatch(source, /sendAliceProductMessage/);
});

test('products topic no longer receives bot callback replies', () => {
  assert.match(source, /products-topic-silent/);
  assert.doesNotMatch(source, /acknowledgeLegacyProductsCallback/);
});
