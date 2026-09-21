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

test('Alice shopping updates the shared list without posting into the Products Telegram topic', () => {
  const start = source.indexOf("if (req.query?.route === 'alice-shopping')");
  assert.ok(start > -1);
  const block = source.slice(start, source.indexOf("if (req.query?.route === 'init-products')", start));
  assert.match(block, /addSharedProducts/);
  assert.doesNotMatch(block, /sendAliceProductMessage/);
  assert.doesNotMatch(block, /deleteAliceProductMessage/);
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

test('Products Telegram topic is silently ignored without bot callback replies', () => {
  const start = source.indexOf("if (req.query?.route === 'telegram')");
  const block = source.slice(start, source.indexOf("if (req.query?.route === 'alice-shopping')", start));
  assert.match(block, /ignored: 'products-topic-silent'/);
  assert.doesNotMatch(block, /acknowledgeLegacyProductsCallback/);
});
