const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Telegram products topic bypasses legacy list mutation paths', () => {
  assert.match(source, /isProductsTopicUpdate/);
  const start = source.indexOf("if (req.query?.route === 'telegram')");
  const nativeIndex = source.indexOf('isProductsTopicUpdate(req)', start);
  const boughtIndex = source.indexOf('handleBoughtCallback', start);
  const runtimeIndex = source.indexOf('runRuntime(req, res)', start);
  assert.ok(nativeIndex > start);
  assert.ok(boughtIndex === -1 || nativeIndex < boughtIndex);
  assert.ok(runtimeIndex === -1 || nativeIndex < runtimeIndex);
});

test('Alice shopping sends a plain products chat message instead of entering shared-list runtime', () => {
  const start = source.indexOf("if (req.query?.route === 'alice-shopping')");
  assert.ok(start > -1);
  const block = source.slice(start, source.indexOf("if (req.query?.route === 'init-products')", start));
  assert.match(block, /sendAliceProductMessage/);
  assert.doesNotMatch(block, /runProductsAddition/);
  assert.doesNotMatch(block, /runAliceShoppingWithPrompt/);
});

test('ordinary chatter outside products topic still uses existing routing guards', () => {
  assert.match(source, /shouldIgnorePassiveTelegramMessage/);
  assert.match(source, /ignored: 'passive-chat-message'/);
});

test('daily runtime behavior stays present outside products chat cutover', () => {
  assert.match(source, /markProductsRuntimeStale/);
  assert.match(source, /publishDailyLaborArticle/);
});
