const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const endpointPath = path.join(__dirname, '..', 'api', 'retire-products-list.js');

test('one-time products retirement unpins topic 263 and clears durable legacy state without generated runtime', () => {
  assert.equal(fs.existsSync(endpointPath), true, 'retirement endpoint must exist');
  const source = fs.readFileSync(endpointPath, 'utf8');
  assert.match(source, /RETIRE_DATE = '2026-08-23'/);
  assert.match(source, /EXPECTED_KEY_HASH = '[a-f0-9]{64}'/);
  assert.match(source, /unpinAllForumTopicMessages/);
  assert.match(source, /message_thread_id: PRODUCTS_TOPIC_ID/);
  assert.match(source, /clearProducts/);
  assert.match(source, /getProductsCache/);
  assert.doesNotMatch(source, /generated-runtime/);
  assert.match(source, /status\(410\)/);
  assert.match(source, /status\(401\)/);
});
