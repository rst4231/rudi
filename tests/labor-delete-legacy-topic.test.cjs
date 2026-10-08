const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('api/labor-code.cjs', 'utf8');

test('labor publisher no longer deletes Telegram forum topics', () => {
  assert.doesNotMatch(source, /deleteForumTopic/);
  assert.match(source, /queueOnly = true/);
});
