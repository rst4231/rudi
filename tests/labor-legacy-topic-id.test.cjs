const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = JSON.parse(fs.readFileSync('config/forum-topics.json', 'utf8'));

test('legacy Labor topic stays configured only for one-time deletion', () => {
  assert.equal(config.labor, 696);
});
