const test = require('node:test');
const assert = require('node:assert/strict');
const { publishLaborArticle } = require('../api/labor-code.cjs');

test('labor posts use topic 126 and never recreate topic 696', async () => {
  const calls = [];
  const cache = {
    async get(key) {
      if (key === 'labor:topic-id') return 696;
      return null;
    },
    async set() { return true; },
    async delete() { return true; },
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
    fetchImpl,
    now: new Date('2026-09-04T18:00:00Z'),
    forumTopicsConfig: { version: 1, clients: 126, labor: 696 },
  });

  assert.equal(result.topicId, 126);
  assert.equal(calls.some((call) => call.method === 'createForumTopic'), false);
});
