const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { maybeSendEventCollage } = require('../api/event-collage.cjs');
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

test('concert digest stays text-only and does not fetch posters', async () => {
  let sourceFetches = 0;
  const result = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: -100123,
        message_thread_id: 19,
        text: '<b>🎤 Поп и хип-хоп концерты</b>\n<a href="https://afisha.yandex.ru/saint-petersburg/concert/test">Подробнее →</a>',
        parse_mode: 'HTML',
      }),
    },
    {
      fetchImpl: async () => {
        sourceFetches += 1;
        return new Response('<meta property="og:image" content="https://example.com/poster.jpg">', { status: 200 });
      },
      telegramFetchImpl: async () => { throw new Error('concert digest must not use sendPhoto'); },
    },
  );

  assert.equal(result, null);
  assert.equal(sourceFetches, 0);
});

test('event venue config blocks Sevkabel, BRUS shorthand and Brusnitsyn', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'events.json'), 'utf8'));
  const blocked = new Set((config.blockedVenueTokens || []).map((value) => String(value).toLowerCase()));
  assert.ok(blocked.has('севкабель'));
  assert.ok(blocked.has('брус'));
  assert.ok(blocked.has('брусницын'));
});

test('Labor falls back to existing topic 126 when runtime cache is empty', async () => {
  const calls = [];
  const now = new Date('2026-08-26T09:00:00Z');
  const cache = getLaborCache({
    runtimeCache: memoryCache(),
    env: {},
    attempts: 1,
    retryDelayMs: 0,
    now,
  });

  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1001,
    cache,
    fetchImpl: telegramStub(calls),
    now,
  });

  assert.equal(result.topicId, 126);
  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
  assert.equal(calls.find((call) => call.method === 'sendMessage').body.message_thread_id, 126);
});

test('one-time Labor bootstrap is allowed on 26 August 2026', () => {
  assert.equal(isLaborBootstrapAllowed(new Date('2026-08-26T09:00:00Z')), true);
});
