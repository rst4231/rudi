const test = require('node:test');
const assert = require('node:assert/strict');
const { publishLaborArticle } = require('../api/labor-code.cjs');
const { getLaborCache } = require('../api/stateful-cache.cjs');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

function guardedLaborCache(seed = {}, now = new Date('2026-08-26T09:00:00Z')) {
  return getLaborCache({
    runtimeCache: memoryCache(seed),
    env: {},
    attempts: 1,
    retryDelayMs: 0,
    now,
  });
}

function telegramStub(calls) {
  return async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'createForumTopic') {
      return new Response(JSON.stringify({ ok: true, result: { message_thread_id: 999 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (method === 'sendMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1000 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected Telegram method: ${method}`);
  };
}

test('reuses the most recent recorded Labor topic when the primary topic cache key is missing', async () => {
  const calls = [];
  const now = new Date('2026-08-26T09:00:00Z');
  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1001,
    cache: guardedLaborCache({
      'labor:message:2026-08-25': {
        articleId: 'contract:worker',
        messageId: 800,
        topicId: 444,
      },
    }, now),
    fetchImpl: telegramStub(calls),
    now,
  });

  assert.equal(result.topicId, 444);
  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
  const send = calls.find((call) => call.method === 'sendMessage');
  assert.equal(send.body.message_thread_id, 444);
});

test('ignores a bad same-day Clients topic record and recovers the older Labor topic', async () => {
  const calls = [];
  const now = new Date('2026-08-26T09:00:00Z');
  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1001,
    cache: guardedLaborCache({
      'labor:message:2026-08-26': { articleId: 'wrong', messageId: 721, topicId: 126 },
      'labor:message:2026-08-23': { articleId: 'right', messageId: 636, topicId: 444 },
    }, now),
    fetchImpl: telegramStub(calls),
    now,
  });

  assert.equal(result.topicId, 444);
  assert.equal(calls.find((call) => call.method === 'sendMessage').body.message_thread_id, 444);
});

test('fails closed instead of ever using Clients topic 126 when Labor topic history is unavailable', async () => {
  const calls = [];
  const now = new Date('2026-08-26T09:00:00Z');

  await assert.rejects(() => publishLaborArticle({
    token: '1:test',
    chatId: -1001,
    cache: guardedLaborCache({}, now),
    fetchImpl: telegramStub(calls),
    now,
  }), /Labor topic id is unavailable/i);

  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
  assert.equal(calls.some((call) => call.method === 'sendMessage'), false);
});
