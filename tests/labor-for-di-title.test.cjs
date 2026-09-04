const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/forum-topics.json');

test('For Di title config belongs to clients topic', () => {
  assert.equal(config.names.clients, 'Для Ди');
  assert.equal(config.clients, 126);
});
