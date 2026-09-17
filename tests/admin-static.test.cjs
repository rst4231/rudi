const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('admin page opens directly and calls API without credentials', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'admin.html'), 'utf8');
  assert.doesNotMatch(source, /CRON_SECRET|RUDI_ADMIN_SECRET/);
  assert.doesNotMatch(source, /<script[^>]+src=|<link[^>]+https?:\/\//i);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /Authorization|Bearer|id="auth"|id="secret"|Неверный секрет|Подключиться/);
  assert.doesNotMatch(source, /Overrides|Аналитика рубрик|weekend|recipes|lulu/i);
  assert.match(source, /id="app"/);
  assert.match(source, /\/api\/admin/);
  assert.match(source, /window\.confirm/);
});

test('vercel exposes /admin without enabling Git deployments or changing existing daily cron', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.git?.deploymentEnabled, false);
  assert.deepEqual(config.crons, [
    { path: '/api/daily', schedule: '30 21 * * *' },
    { path: '/api/stylist-leads-cron', schedule: '0 4 * * *' },
  ]);
  assert.ok(config.rewrites.some((row) => row.source === '/admin' && row.destination === '/admin.html'));
});

test('landing page renders only the remaining public bot settings from health', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(source, /Настройки бота/);
  assert.match(source, /\/api\/health/);
  assert.match(source, /Расписание/);
  assert.match(source, /Рубрики и темы/);
  assert.match(source, /Алерты/);
  assert.doesNotMatch(source, /Антидубли|Источники контента|Футеры|weekend|recipes|lulu/i);
  assert.match(source, /href="\/admin"/);
  assert.doesNotMatch(source, /CRON_SECRET|RUDI_ADMIN_SECRET|Authorization:\s*Bearer/i);
  assert.doesNotMatch(source, /<script[^>]+src=|<link[^>]+https?:\/\//i);
});
