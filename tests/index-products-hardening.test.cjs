const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('only authenticated clear and Куплено enter destructive product paths', () => {
  assert.match(source, /isProductsClearCallback/);
  assert.match(source, /validateTelegramCallback/);
  assert.match(source, /runAuthorizedProductsClear/);
  assert.match(source, /handleBoughtCallback/);
});

test('direct Очистить deletes the current list without entering old runtime that can republish it', () => {
  const start = source.indexOf('if (isProductsClearCallback(req))');
  const end = source.indexOf('if (isTelegramClearIntent(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /deleteProductsListMessage/);
  assert.doesNotMatch(block, /runRuntime\(/);
});

test('Куплено clears by deleting the current list instead of replaying the old clear callback', () => {
  const start = source.indexOf('if (boughtAction)');
  const end = source.indexOf('if (isProductsClearCallback(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /deleteProductsListMessage/);
  assert.doesNotMatch(block, /runWithExistingClearAction/);
  assert.doesNotMatch(block, /runRuntime\(/);
});

test('typed clear, empty Alice, Alice clear, and init-products are blocked before runtime', () => {
  assert.match(source, /isTelegramClearIntent/);
  assert.match(source, /ignored: 'typed-products-clear-disabled'/);
  assert.match(source, /isEmptyAliceShoppingRequest/);
  assert.match(source, /isAliceClearIntent/);
  assert.match(source, /init-products-disabled/);
});

test('ordinary chatter cannot enter old runtime, while product additions use durable state', () => {
  assert.match(source, /shouldIgnorePassiveTelegramMessage/);
  assert.match(source, /ignored: 'passive-chat-message'/);
  assert.match(source, /runProductsAddition/);
});

test('non-destructive Add button is handled without entering old product runtime', () => {
  assert.match(source, /isProductsAddCallback/);
  assert.match(source, /answerProductsAddCallback/);
});

test('daily runtime marks product runtime state stale so next addition rehydrates durable history', () => {
  assert.match(source, /markProductsRuntimeStale/);
});

test('keeps the existing explicit Alice launch guard before shopping runtime', () => {
  const launchIndex = source.indexOf('if (isAliceShoppingLaunch(req))');
  const runtimeIndex = source.indexOf('runAliceShoppingWithPrompt(req, res)', launchIndex);
  assert.ok(launchIndex > -1);
  assert.ok(runtimeIndex > launchIndex);
});
