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

test('reuses the most recent recorded Labor topic when the primary topic cache key is missing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
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

  const result = await publishLaborArticle({
    token: '1:test',
    chatId: -1001,
    cache: memoryCache({
      'labor:message:2026-08-24': {
        articleId: 'contract:worker',
        messageId: 800,
        topicId: 444,
      },
    }),
    fetchImpl,
    now: new Date('2026-08-25T09:00:00Z'),
  });

  assert.equal(result.topicId, 444);
  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
  const send = calls.find((call) => call.method === 'sendMessage');
  assert.equal(send.body.message_thread_id, 444);
});
