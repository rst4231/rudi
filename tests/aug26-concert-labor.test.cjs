const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { publishLaborArticle } = require('../api/labor-code.cjs');
const { getLaborCache } = require('../api/stateful-cache.cjs');
const { isLaborBootstrapAllowed } = require('../api/index.js');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

function telegramStub(calls) {
  return async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'sendMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1000 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected Telegram method: ${method}`);
  };
}

test('event venue config blocks explicit Sevkabel and Brusnitsyn identifiers without broad BRUS shorthand', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'events.json'), 'utf8'));
  const blocked = new Set((config.blockedVenueTokens || []).map((value) => String(value).toLowerCase()));
  assert.ok(blocked.has('севкабель'));
  assert.ok(blocked.has('брусницын'));
  assert.equal(blocked.has('брус'), false);
});

test('Labor uses configured topic 696 and never Clients topic 126 when runtime cache is empty', async () => {
  const calls = [];
  const now = new Date('2026-08-26T09:00:00Z');
  const cache = getLaborCache({
    runtimeCache: memoryCache(),
    env: {},
    attempts: 1,
    retryDelayMs: 0,
    now,
    laborTopicIdResolver: async () => 696,
  });

  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1001,
    cache,
    fetchImpl: telegramStub(calls),
    now,
  });

  assert.equal(result.topicId, 696);
  assert.equal(calls.find((call) => call.method === 'sendMessage').body.message_thread_id, 696);
  assert.equal(calls.some((call) => call.body?.message_thread_id === 126), false);
});

test('one-time Labor bootstrap is allowed on 26 August 2026', () => {
  assert.equal(isLaborBootstrapAllowed(new Date('2026-08-26T09:00:00Z')), true);
});
