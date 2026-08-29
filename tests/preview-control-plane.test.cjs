const test = require('node:test');
const assert = require('node:assert/strict');
const { runPreview } = require('../api/preview.js');

function responseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}

test('preview injects resolved date and reports mismatch without Telegram side effects', async () => {
  const req = { query: { date: 'tomorrow' } };
  const res = responseCapture();
  const now = new Date('2026-08-29T21:30:00Z');
  const handler = async (innerReq, innerRes) => {
    assert.equal(innerReq.query.route, 'preview');
    assert.equal(innerReq.query.date, '2026-08-31');
    return innerRes.json({ ok: true, date: '2026-08-17', results: {} });
  };
  await runPreview(req, res, {
    handler,
    now,
    localConfig: { version: 1, items: [] },
    fetchImpl: async (url) => {
      if (String(url).includes('api.telegram.org')) throw new Error('preview must not call Telegram');
      return { ok: false };
    },
  });
  assert.equal(res.payload.requestedDate, '2026-08-31');
  assert.equal(res.payload.generatedAt, now.toISOString());
  assert.equal(res.payload.warnings[0].code, 'runtime-date-mismatch');
});
