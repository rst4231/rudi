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
  'api/repair-event-post.js',
  'api/repair-labor-20260823.js',
  'api/retire-products-list.js',
  'api/cinema-topic-migrate.js',
  'api/stylist-leads.cjs',
  'api/stylist-web-search.cjs',
  'config/stylist-leads.json',
  'tests/stylist-cron.test.cjs',
  'tests/stylist-leads.test.cjs',
  'tests/stylist-provider-intent-regression.test.cjs',
  'tests/stylist-web-search.test.cjs',
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


test('stylist client search route and code are removed', () => {
  const indexSource = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(indexSource.includes('stylist-leads'), false);
  assert.equal(indexSource.includes('runStylistLeadScan'), false);
  assert.equal(JSON.stringify(config).includes('stylist-leads-cron'), false);
});
