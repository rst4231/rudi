const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('api/labor-code.cjs', 'utf8');

test('labor routing migration never sends new posts back to topic 696', () => {
  assert.doesNotMatch(source, /message_thread_id:\s*696/);
});
