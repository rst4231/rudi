const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('only authenticated clear and Куплено enter destructive runtime paths', () => {
  assert.match(source, /isProductsClearCallback/);
  assert.match(source, /validateTelegramCallback/);
  assert.match(source, /runAuthorizedProductsClear/);
  assert.match(source, /handleBoughtCallback/);
  assert.match(source, /runWithAnsweredCallbackContext/);
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
  const runtimeIndex = source.indexOf('return await runAliceShoppingWithPrompt(req, res);');
  assert.ok(launchIndex > -1);
  assert.ok(runtimeIndex > launchIndex);
});
