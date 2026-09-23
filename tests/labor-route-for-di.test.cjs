const test = require('node:test');
const assert = require('node:assert/strict');
const { publishLaborArticle } = require('../api/labor-code.cjs');

test('labor posts use topic 126 and never recreate topic 696', async () => {
  const calls = [];
  const rows = new Map([['labor:topic-id', 696]]);
  const cache = {
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async set(key, value) { rows.set(key, structuredClone(value)); return true; },
    async delete(key) { rows.delete(key); return true; },
  };
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    calls.push({ method, body: JSON.parse(init.body) });
    if (method === 'sendMessage' || method === 'deleteForumTopic') {
      return new Response(JSON.stringify({ ok: true, result: method === 'sendMessage' ? { message_id: 1 } : true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${method}`);
  };

  const result = await publishLaborArticle({
    token: 'test-token',
    chatId: -1004476323368,
    cache,
    forDiCache: cache,
    fetchImpl,
    now: new Date('2026-09-04T18:00:00Z'),
    forumTopicsConfig: { version: 1, clients: 126, labor: 696 },
  });

  assert.equal(result.topicId, 126);
  assert.equal(result.queuedForPrivateDelivery, true);
  assert.equal(calls.some((call) => call.method === 'sendMessage'), false);
  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
  const queued = await cache.get('for-di:messages:2026-09-04');
  assert.equal(Array.isArray(queued), true);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].source, 'labor');
  assert.equal(queued[0].parseMode, false);
});
