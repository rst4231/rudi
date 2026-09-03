const test = require('node:test');
const assert = require('node:assert/strict');

let cleanup;
try {
  cleanup = require('../api/cinema-message-cleanup.cjs');
} catch {
  cleanup = {};
}

function telegramResponse(result, status = 200) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('cinema cleanup deletes only verified stale cinema messages and protects current publication', async () => {
  assert.equal(typeof cleanup.cleanupCinemaMessages, 'function');
  const calls = [];
  const forwarded = new Map([
    [823, { message_id: 9001, caption: '🎬 Кинопремьеры — 3 сентября\n1. Бегущая' }],
    [824, { message_id: 9002, caption: '🎬 Кинопремьеры — 3 сентября\n1. Бегущая' }],
    [825, { message_id: 9003, text: '🎬 Новых кинопремьер на этой неделе в Кинополис Мурино и Мираж Синема не найдено.' }],
    [999, { message_id: 9004, text: 'Обычное сообщение, не кино' }],
  ]);

  const fetchImpl = async (url, init = {}) => {
    const method = String(url).split('/').pop();
    const body = JSON.parse(init.body || '{}');
    calls.push({ method, body });
    if (method === 'forwardMessage') return telegramResponse(forwarded.get(Number(body.message_id)) || null);
    if (method === 'deleteMessage') return telegramResponse(true);
    throw new Error(`Unexpected Telegram method: ${method}`);
  };

  const result = await cleanup.cleanupCinemaMessages({
    date: '2026-09-03',
    messageIds: [823, 824, 825, 827, 999],
  }, {
    token: '1:test',
    chatId: -1001,
    topicId: 705,
    fetchImpl,
    getRecord: async () => ({ status: 'published', messageIds: [827] }),
  });

  assert.deepEqual(result.deleted, [823, 824, 825]);
  assert.deepEqual(result.protected, [827]);
  assert.deepEqual(result.rejected, [999]);
  assert.equal(calls.some((call) => call.method === 'forwardMessage' && call.body.message_id === 827), false);
  for (const temporaryId of [9001, 9002, 9003, 9004]) {
    assert.equal(calls.some((call) => call.method === 'deleteMessage' && call.body.message_id === temporaryId), true);
  }
  for (const staleId of [823, 824, 825]) {
    assert.equal(calls.some((call) => call.method === 'deleteMessage' && call.body.message_id === staleId), true);
  }
  assert.equal(calls.some((call) => call.method === 'deleteMessage' && call.body.message_id === 999), false);
});
