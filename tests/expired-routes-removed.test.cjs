const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const removed = [
  'api/cinema-backfill-20260820.js',
  'api/cinema-replace-20260820.js',
  'api/recover-20260823.js',
  'api/repair-daily-content-20260824.js',
  'api/daily-content-repair-20260824.cjs',
];

test('expired one-time recovery handlers are absent', () => {
  for (const relative of removed) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} must be removed`);
  }
});

test('Vercel no longer carries expired recovery function config', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(config.functions || {}, 'api/recover-20260823.js'), false);
  const serialized = JSON.stringify(config);
  for (const relative of removed) assert.equal(serialized.includes(relative), false);
});