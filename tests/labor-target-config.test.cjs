const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = JSON.parse(fs.readFileSync('config/forum-topics.json', 'utf8'));

test('For Di remains topic 126 while legacy Labor topic remains identifiable as 696', () => {
  assert.equal(config.clients, 126);
  assert.equal(config.labor, 696);
});
