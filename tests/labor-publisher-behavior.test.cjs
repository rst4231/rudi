const test = require('node:test');
const assert = require('node:assert/strict');
const labor = require('../api/labor-code.cjs');

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
    async delete(key) { map.delete(key); return true; },
  };
}

test('publisher queues the selected Labor article for Diana without forum send', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    if (method === 'createForumTopic') {
      return new Response(JSON.stringify({ ok: true, result: { message_thread_id: 700 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'sendMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 701 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const forDiCache = memoryCache();
  const result = await labor.publishLaborArticle({
    token: '1:test', chatId: -1001, cache: memoryCache(), forDiCache, fetchImpl,
    now: new Date('2026-08-23T09:00:00Z'),
  });
  assert.equal(result.messageId, null);
  assert.equal(result.queuedForPrivateDelivery, true);
  assert.notEqual(result.articleId, 'contract:worker');
  assert.equal(calls.filter((call) => call.method === 'sendMessage').length, 0);
  const queued = await forDiCache.get('for-di:messages:2026-08-23');
  assert.equal(queued.length, 1);
  assert.match(queued[0].text, /Трудовой кодекс/);
});
