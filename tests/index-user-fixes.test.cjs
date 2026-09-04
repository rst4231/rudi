const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping keeps the launch prompt and uses direct products chat posting for actual products', () => {
  assert.match(source, /buildAliceShoppingLaunchResponse/);
  assert.match(source, /route === 'alice-shopping'/);
  assert.match(source, /sendAliceProductMessage/);
});

test('legacy product callbacks are no longer destructive', () => {
  assert.match(source, /acknowledgeLegacyProductsCallback/);
  assert.match(source, /products-chat-native/);
});

test('health route triggers one-time cleanup of legacy feedback keyboards', () => {
  assert.match(source, /cleanupLegacyFeedbackKeyboards/);
  assert.match(source, /RUDI_FEEDBACK_KEYBOARD_CLEANUP/);
});
