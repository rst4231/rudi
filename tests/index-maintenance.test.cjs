const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping updates shared products without Telegram topic posting', () => {
  assert.match(source, /route === 'alice-shopping'/);
  const route = source.indexOf("if (req.query?.route === 'alice-shopping')");
  const end = source.indexOf("if (req.query?.route === 'init-products')", route);
  const block = source.slice(route, end);
  assert.match(block, /addSharedProducts/);
  assert.doesNotMatch(block, /sendAliceProductMessage/);
  assert.doesNotMatch(block, /runWithProductsContext/);
  assert.doesNotMatch(block, /runProductsAddition/);
});

test('daily route authenticates cron before any cleanup or publication side effects', () => {
  const route = source.indexOf("if (req.query?.route === 'daily')");
  const auth = source.indexOf('isCronRequestAuthorized(req)', route);
  const cleanup = source.indexOf('prepareDailyTopicCleanup', route);
  const runtime = source.indexOf('runRuntime(req, res)', route);
  const labor = source.indexOf('publishDailyLaborArticle(', route);
  assert.ok(route >= 0 && auth > route);
  assert.ok(auth < cleanup);
  assert.ok(auth < runtime);
  assert.ok(auth < labor);
});

test('products topic updates are silently ignored without bot replies', () => {
  const route = source.indexOf("if (req.query?.route === 'telegram')");
  const native = source.indexOf('isProductsTopicUpdate(req)', route);
  const silent = source.indexOf("products-topic-silent", native);
  assert.ok(route >= 0 && native > route && silent > native);
  assert.equal(source.indexOf('acknowledgeLegacyProductsCallback', native), -1);
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

test('health feedback cleanup can retry exact legacy message ids without another code change', () => {
  assert.match(source, /parseFeedbackCleanupMessageIds/);
  assert.match(source, /req\.query\?\.messageIds/);
  assert.match(source, /force:\s*explicitMessageIds\.length\s*>\s*0/);
  assert.match(source, /messageIds:\s*explicitMessageIds/);
});

test('Telegram transport is passed through topic maintenance', () => {
  assert.match(source, /handleTelegramTopicRequest\(input, nextInit/);
});
