const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('daily cron runs at 04:00 Moscow time', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const dailyCron = vercelConfig.crons.find((item) => item.path === '/api/daily');
  assert.ok(dailyCron, 'daily cron must exist');
  assert.equal(dailyCron.schedule, '0 1 * * *');
});
