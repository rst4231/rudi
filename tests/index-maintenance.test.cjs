const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping runs inside the products context so Куплено is preserved', () => {
  assert.match(source, /route === 'alice-shopping'/);
  assert.match(source, /runWithProductsContext\(\(\) => runRuntime\(req, res\)\)/);
});

test('daily route prepares topic cleanup before runtime publication', () => {
  assert.match(source, /prepareDailyTopicCleanup/);
  assert.match(source, /route === 'daily'/);
});

test('removed couple topic is ignored on incoming updates and hidden from health', () => {
  assert.match(source, /isRemovedCoupleTopicUpdate/);
  assert.match(source, /sanitizeHealthPayload/);
  assert.match(source, /route === 'health'/);
});

test('Telegram transport is passed through topic maintenance', () => {
  assert.match(source, /handleTelegramTopicRequest\(input, nextInit/);
});
