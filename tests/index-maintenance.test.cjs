const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping runs inside the products context so Куплено is preserved', () => {
  assert.match(source, /route === 'alice-shopping'/);
  assert.match(source, /runWithProductsContext\(\(\) => runRuntime\(req, res\)\)/);
});

test('daily route authenticates cron before any cleanup or publication side effects', () => {
  const route = source.indexOf("if (req.query?.route === 'daily')");
  const auth = source.indexOf('isCronRequestAuthorized(req)', route);
  const cleanup = source.indexOf('prepareDailyTopicCleanup', route);
  const runtime = source.indexOf('runRuntime(req, res)', route);
  const labor = source.indexOf('publishDailyLaborArticle()', route);
  assert.ok(route >= 0 && auth > route);
  assert.ok(auth < cleanup);
  assert.ok(auth < runtime);
  assert.ok(auth < labor);
});

test('Куплено sends purchase notice only after authorized clear returns', () => {
  const block = source.indexOf('if (boughtAction)');
  const clear = source.indexOf('runAuthorizedProductsClear', block);
  const notice = source.indexOf('sendBoughtNotice', block);
  assert.ok(block >= 0 && clear > block && notice > clear);
});

test('removed couple topic is ignored on incoming updates and hidden from health', () => {
  assert.match(source, /isRemovedCoupleTopicUpdate/);
  assert.match(source, /sanitizeHealthPayload/);
  assert.match(source, /route === 'health'/);
});

test('Telegram transport is passed through topic maintenance', () => {
  assert.match(source, /handleTelegramTopicRequest\(input, nextInit/);
});
