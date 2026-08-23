const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const entryPath = path.join(__dirname, '..', 'api', 'index.js');

test('Telegram products messages are left in chat and never converted into a shared list', () => {
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.match(source, /require\(['"]\.\/products-chat\.cjs['"]\)/);
  const start = source.indexOf("if (req.query?.route === 'telegram')");
  const end = source.indexOf("if (req.query?.route === 'alice-shopping')", start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /isProductsTopicUpdate\(req\)/);
  assert.match(block, /products-chat-native/);
  assert.doesNotMatch(block, /deleteProductsListMessage\(/);
  assert.doesNotMatch(block, /runAuthorizedProductsClear\(/);
});

test('Alice uses RUDI to post only product text into Telegram products topic', () => {
  const source = fs.readFileSync(entryPath, 'utf8');
  const start = source.indexOf("if (req.query?.route === 'alice-shopping')");
  const end = source.indexOf("if (req.query?.route === 'init-products')", start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /sendAliceProductMessage/);
  assert.match(block, /buildAliceProductAddedResponse/);
  assert.doesNotMatch(block, /runProductsAddition/);
});
