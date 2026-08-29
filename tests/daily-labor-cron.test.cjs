const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runDailyOrchestrator } = require('../api/daily-orchestrator.cjs');

const root = path.join(__dirname, '..');
const handlerPath = path.join(root, 'api', 'daily-cron.js');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

function responseStub() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

test('daily cron authenticates before delegating to orchestrator', () => {
  assert.equal(fs.existsSync(handlerPath), true, 'dedicated daily cron handler must exist');
  const source = fs.readFileSync(handlerPath, 'utf8');
  const auth = source.indexOf('isCronRequestAuthorized(req)');
  const orchestrator = source.indexOf('runDailyOrchestrator(req, res)');
  assert.ok(auth >= 0 && orchestrator >= 0);
  assert.ok(auth < orchestrator, 'cron authentication must happen before daily orchestration');
});

test('daily orchestrator publishes native labor before generated runtime', async () => {
  const calls = [];
  const res = responseStub();
  await runDailyOrchestrator({ query: { route: 'daily' } }, res, {
    date: '2026-08-30',
    settings: {
      sections: {
        labor: { enabled: true },
        cinema: { enabled: false },
        weekend: { enabled: false },
      },
    },
    cleanup: async () => { calls.push('cleanup'); },
    runNative: async (section) => { calls.push(section); return { published: 1 }; },
    runRuntime: async (_req, response) => { calls.push('runtime'); return response.json({ ok: true, results: {} }); },
    recordGenerated: async () => {},
    writeSummary: async () => {},
    alert: async () => {},
  });
  assert.deepEqual(calls, ['cleanup', 'labor', 'runtime']);
});

test('Vercel daily cron is routed through the dedicated handler', () => {
  const rewrite = vercel.rewrites.find((item) => item.source === '/api/daily');
  assert.equal(rewrite?.destination, '/api/daily-cron?route=daily');
});