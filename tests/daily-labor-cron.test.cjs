const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const handlerPath = path.join(root, 'api', 'daily-cron.js');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

test('daily cron publishes labor before the runtime can finish the HTTP response', () => {
  assert.equal(fs.existsSync(handlerPath), true, 'dedicated daily cron handler must exist');
  const source = fs.readFileSync(handlerPath, 'utf8');
  const labor = source.indexOf('publishDailyLaborArticle()');
  const runtime = source.indexOf('runRuntime(req, res)');
  assert.ok(labor >= 0 && runtime >= 0, 'daily handler must call labor publication and runtime');
  assert.ok(labor < runtime, 'labor publication must happen before runRuntime closes the response');
});

test('Vercel daily cron is routed through the dedicated handler', () => {
  const rewrite = vercel.rewrites.find((item) => item.source === '/api/daily');
  assert.equal(rewrite?.destination, '/api/daily-cron?route=daily');
});
