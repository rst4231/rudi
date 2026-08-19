const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('Alice shopping response uses the requested prompt sanitizer', () => {
  assert.match(source, /sanitizeAliceShoppingPayload/);
  assert.match(source, /route === 'alice-shopping'/);
  assert.match(source, /runAliceShoppingWithPrompt\(req, res\)/);
});

test('empty Куплено callback is short-circuited before clear runtime', () => {
  assert.match(source, /boughtAction\?\.empty/);
  assert.match(source, /ignored: 'empty-products'/);
});
