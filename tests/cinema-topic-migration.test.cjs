const test = require('node:test');
const assert = require('node:assert/strict');

const {
  migrateCinemaPost,
  securelyMatchesMigrationKey,
} = require('../api/cinema-topic-migrate.js');

function memoryCache(initial = {}) {
  const state = new Map(Object.entries(initial));
  return {
    async get(key) { return state.has(key) ? state.get(key) : null; },
    async set(key, value) { state.set(key, value); return true; },
    async delete(key) { state.delete(key); return true; },
  };
}

test('migration endpoint accepts only the intended one-time key', () => {
  assert.equal(securelyMatchesMigrationKey('cinema-topic-20260825'), true);
  assert.equal(securelyMatchesMigrationKey('wrong-key'), false);
});

test('migration identifies the cinema post without deleting normal events messages', async () => {
  const cache = memoryCache({
    'cinema-topic-id': 314,
    'topic:19:2026-08-24:messages': [101, 102, 103],
  });
  const calls = [];
  let temporaryId = 900;
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').pop();
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    if (method === 'forwardMessage') {
      temporaryId += 1;
      const sourceId = Number(body.message_id);
      const result = sourceId === 102
        ? { message_id: temporaryId, caption: '🎬 Кинопремьеры — 20 августа' }
        : { message_id: temporaryId, text: 'Обычное мероприятие' };
      return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'copyMessage') {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 950 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'deleteMessage') {
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${method}`);
  };

  const result = await migrateCinemaPost({
    token: 'token',
    chatId: -100123,
    cache,
    fetchImpl,
    now: new Date('2026-08-25T18:00:00Z'),
    lookbackDays: 3,
  });

  assert.equal(result.migrated, true);
  assert.equal(result.sourceMessageId, 102);
  assert.equal(result.topicId, 314);
  const copied = calls.find((call) => call.method === 'copyMessage');
  assert.equal(copied.body.message_id, 102);
  assert.equal(copied.body.message_thread_id, 314);
  const deletedOriginals = calls
    .filter((call) => call.method === 'deleteMessage' && [101, 102, 103].includes(Number(call.body.message_id)))
    .map((call) => Number(call.body.message_id));
  assert.deepEqual(deletedOriginals, [102]);
});
