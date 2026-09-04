const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('api/labor-code.cjs', 'utf8');

test('labor publisher contains no createForumTopic fallback after migration to For Di', () => {
  assert.doesNotMatch(source, /createForumTopic/);
  assert.match(source, /deleteForumTopic/);
});
