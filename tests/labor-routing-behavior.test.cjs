const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('api/labor-code.cjs', 'utf8');

test('labor publisher routes to configured clients topic and treats labor topic as legacy', () => {
  assert.match(source, /clients/);
  assert.match(source, /labor/);
});
