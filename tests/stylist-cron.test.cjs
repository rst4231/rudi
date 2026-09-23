const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let cronHandler;
try { cronHandler = require('../api/stylist-leads-cron.js'); } catch {}

test('stylist leads cron rejects unauthorized requests when CRON_SECRET is configured', async () => {
  assert.equal(typeof cronHandler, 'function');
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'secret';
  const response = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
  try {
    await cronHandler({ headers: {} }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.error, 'unauthorized-cron');
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous;
  }
});

test('stylist lead search is disabled in config', () => {
  const filename = path.join(__dirname, '..', 'config', 'stylist-leads.json');
  assert.equal(fs.existsSync(filename), true);
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(config.enabled, false);
  assert.equal(config.webSearch?.enabled, false);
  assert.equal(config.topicId, 126);
});

test('vercel config does not schedule stylist scanner', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const cron = config.crons.find((item) => item.path === '/api/stylist-leads-cron');
  assert.equal(cron, undefined);
  assert.equal(config.functions['api/stylist-leads-cron.js'], undefined);
  assert.equal(config.git.deploymentEnabled, false);
});
