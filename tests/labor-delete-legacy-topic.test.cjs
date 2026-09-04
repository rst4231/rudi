const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('api/labor-code.cjs', 'utf8');

test('labor publisher deletes legacy configured topic before publishing to For Di', () => {
  assert.match(source, /deleteForumTopic/);
  assert.match(source, /forumTopicsConfig/);
});
