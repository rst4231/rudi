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


test('queue-only labor publication does not touch Telegram topics', async () => {
  const { publishLaborArticle } = require('../api/labor-code.cjs');
  const map = new Map();
  const cache = {
    async get(key){ return map.has(key) ? map.get(key) : null; },
    async set(key,value){ map.set(key,value); return true; },
  };
  const forDiMap = new Map();
  const forDiCache = {
    async get(key){ return forDiMap.has(key) ? forDiMap.get(key) : null; },
    async set(key,value){ forDiMap.set(key,value); return true; },
  };
  let fetchCalls = 0;
  const result = await publishLaborArticle({
    queueOnly: true,
    force: true,
    now: new Date('2026-09-25T00:30:00+03:00'),
    cache,
    forDiCache,
    fetchImpl: async()=>{ fetchCalls += 1; throw new Error('Telegram must not be called'); },
  });
  assert.equal(fetchCalls, 0);
  assert.equal(result.queueOnly, true);
  assert.equal(result.topicId, null);
  assert.equal(result.queuedForPrivateDelivery, true);
});
