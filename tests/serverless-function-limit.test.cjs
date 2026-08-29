const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('RUDI stays within the serverless JS entrypoint budget', () => {
  const apiFiles = fs.readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.js'));
  assert.ok(apiFiles.length <= 12, `expected at most 12 serverless JS entrypoints, got ${apiFiles.length}`);
});