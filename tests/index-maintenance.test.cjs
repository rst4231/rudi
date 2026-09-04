const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping posts through products chat instead of legacy shared-list context', () => {
  assert.match(source, /route === 'alice-shopping'/);
  assert.match(source, /sendAliceProductMessage/);
  const route = source.indexOf("if (req.query?.route === 'alice-shopping')");
  const end = source.indexOf("if (req.query?.route === 'init-products')", route);
  const block = source.slice(route, end);
  assert.doesNotMatch(block, /runWithProductsContext/);
  assert.doesNotMatch(block, /runProductsAddition/);
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

test('legacy products callbacks are intercepted by native products chat instead of mutating a list', () => {
  const route = source.indexOf("if (req.query?.route === 'telegram')");
  const native = source.indexOf('isProductsTopicUpdate(req)', route);
  const ack = source.indexOf('acknowledgeLegacyProductsCallback', native);
  assert.ok(route >= 0 && native > route && ack > native);
});

test('removed couple topic is ignored on incoming updates and hidden from health', () => {
  assert.match(source, /isRemovedCoupleTopicUpdate/);
  assert.match(source, /sanitizeHealthPayload/);
  assert.match(source, /route === 'health'/);
});

test('health route exposes an explicit one-time legacy feedback keyboard cleanup trigger', () => {
  assert.match(source, /cleanupLegacyFeedbackKeyboards/);
  assert.match(source, /cleanupFeedback/);
  assert.match(source, /feedbackCleanup/);
});

test('Telegram transport is passed through topic maintenance', () => {
  assert.match(source, /handleTelegramTopicRequest\(input, nextInit/);
});
