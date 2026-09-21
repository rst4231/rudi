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

test('Vercel config exposes the expected RUDI routes and cron schedules', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const routes = Object.fromEntries(config.rewrites.map((item) => [item.source, item.destination]));
  assert.equal(routes['/admin'], undefined);
  assert.equal(routes['/api/daily'], '/api/daily-cron?route=daily');
  assert.equal(routes['/api/health'], '/api/index?route=health');
  assert.equal(routes['/api/telegram'], '/api/index?route=telegram');
  assert.equal(routes['/api/alice'], '/api/index?route=alice-shopping');
  assert.equal(routes['/api/alice-shopping'], '/api/index?route=alice-shopping');
  assert.equal(routes['/api/init-products'], '/api/index?route=init-products');
  assert.equal(routes['/api/work-calendar'], '/api/partner-message?rudiAction=work-calendar');
  assert.equal(routes['/api/ticktick/next'], '/api/partner-message?ticktickAction=next');
  assert.deepEqual(config.crons, [
    { path: '/api/daily', schedule: '30 21 * * *' },
    { path: '/api/stylist-leads-cron', schedule: '0 4 * * *' },
    { path: '/api/daily-cron?route=feed-notify', schedule: '0 7 * * *' },
  ]);
});
