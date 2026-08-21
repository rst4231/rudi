const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { buildRuntime, CHUNK_COUNT, EXPECTED_SIZES } = require('../build.cjs');

test('all pinned runtime chunks are present with expected sizes', () => {
  assert.equal(CHUNK_COUNT, 7);
  for (let index = 0; index < CHUNK_COUNT; index += 1) {
    const file = path.join(root, 'runtime', `chunk${index}.txt`);
    assert.equal(fs.existsSync(file), true, `missing chunk${index}.txt`);
    assert.equal(Buffer.byteLength(fs.readFileSync(file)), EXPECTED_SIZES[index]);
  }
});

test('local chunks build into a CommonJS handler without network access', () => {
  const result = buildRuntime();
  assert.ok(result.bytes > 0);
  delete require.cache[require.resolve('../runtime/generated-runtime.cjs')];
  const handler = require('../runtime/generated-runtime.cjs');
  assert.equal(typeof handler, 'function');
});

test('production code and config contain no botsandsite or traffic project coupling', () => {
  const files = ['build.cjs', 'api/index.js', 'package.json', 'vercel.json'];
  const forbidden = [
    'rst4231/botsandsite',
    'traffic-news-telegram-bot',
    'prj_oeVaHSb17REkd4rZGsJrRIybPRG7',
    '[rudi]'
  ];
  for (const relative of files) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const value of forbidden) {
      assert.equal(text.includes(value), false, `${relative} contains forbidden coupling: ${value}`);
    }
  }
});

test('Vercel config exposes the expected RUDI routes and only the RUDI cron', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const routes = Object.fromEntries(config.rewrites.map((item) => [item.source, item.destination]));
  assert.deepEqual(routes, {
    '/api/daily': '/api/index?route=daily',
    '/api/health': '/api/index?route=health',
    '/api/telegram': '/api/index?route=telegram',
    '/api/alice': '/api/index?route=alice-shopping',
    '/api/alice-shopping': '/api/index?route=alice-shopping',
    '/api/init-products': '/api/index?route=init-products',
    '/api/preview': '/api/index?route=preview'
  });
  assert.deepEqual(config.crons, [{ path: '/api/daily', schedule: '30 21 * * *' }]);
});
