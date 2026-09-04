const test = require('node:test');
const assert = require('node:assert/strict');
const { publishLaborArticle } = require('../api/labor-code.cjs');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

function telegramStub(calls, options = {}) {
  return async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'deleteForumTopic') {
      if (options.deletedAlready) {
        return new Response(JSON.stringify({ ok: false, description: 'Bad Request: TOPIC_ID_INVALID' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, result: true }), {
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

test('routes future Labor posts to Clients topic 126 and deletes legacy Labor topic 696', async () => {
  const calls = [];
  const now = new Date('2026-09-04T18:00:00Z');
  const cache = memoryCache({
    'labor:topic-id': 696,
    'labor:message:2026-09-03': { articleId: 'contract:worker', messageId: 828, topicId: 696 },
  });

  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1004476323368,
    cache,
    fetchImpl: telegramStub(calls),
    now,
    forumTopicsConfig: { version: 1, clients: 126, labor: 696 },
  });

  assert.equal(result.topicId, 126);
  assert.deepEqual(calls.find((call) => call.method === 'deleteForumTopic')?.body, {
    chat_id: -1004476323368,
    message_thread_id: 696,
  });
  assert.equal(calls.find((call) => call.method === 'sendMessage')?.body.message_thread_id, 126);
  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
});

test('continues publishing to topic 126 when legacy Labor topic 696 is already deleted', async () => {
  const calls = [];
  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1004476323368,
    cache: memoryCache(),
    fetchImpl: telegramStub(calls, { deletedAlready: true }),
    now: new Date('2026-09-05T09:00:00Z'),
    forumTopicsConfig: { version: 1, clients: 126, labor: 696 },
  });

  assert.equal(result.topicId, 126);
  assert.equal(calls.find((call) => call.method === 'sendMessage')?.body.message_thread_id, 126);
});
