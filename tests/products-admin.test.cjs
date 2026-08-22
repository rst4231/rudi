const test = require('node:test');
const assert = require('node:assert/strict');

const admin = require('../api/products-admin.js');

test('products admin refresh uses a POST Telegram webhook shape', () => {
  const req = admin.buildRefreshRequest('-1001234567890', 'фарш куриный', 1787413000000);
  assert.equal(req.method, 'POST');
  assert.equal(req.query.route, 'telegram');
  assert.equal(req.body.message.message_thread_id, 263);
  assert.equal(req.body.message.chat.id, '-1001234567890');
  assert.equal(req.body.message.text, 'фарш куриный');
});

test('products admin parses an exact replacement list without inventing items', () => {
  assert.deepEqual(admin.parseItems('["фарш куриный"]'), ['фарш куриный']);
  assert.deepEqual(admin.parseItems('фарш куриный|молоко'), ['фарш куриный', 'молоко']);
  assert.deepEqual(admin.parseItems(''), []);
});