const test = require('node:test');
const assert = require('node:assert/strict');
const {
  queueForDiMessage,
  queueForDiTelegramRequest,
  sendForDiPrivateMessages,
} = require('../api/for-di-private.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

test('For Di topic messages are queued and delivered only to Diana once', async () => {
  const cache = memoryCache();
  const now = new Date('2026-09-22T08:30:00Z');
  await queueForDiMessage('<b>Первое</b>', { now, forDiCache: cache });
  await queueForDiMessage('<b>Первое</b>', { now, forDiCache: cache });
  await queueForDiMessage('Второе', { now, forDiCache: cache });

  const calls = [];
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + calls.length } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const options = {
    now,
    forDiCache: cache,
    recipients: { 'Рустам': 111, 'Диана': 222 },
    botToken: 'test-token',
    fetchImpl,
  };
  const first = await sendForDiPrivateMessages(options);
  const second = await sendForDiPrivateMessages(options);

  assert.equal(first.queued, 2);
  assert.equal(first.sent, 2);
  assert.equal(second.sent, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((row) => row.chat_id === 222));
  assert.deepEqual(calls.map((row) => row.text), ['<b>Первое</b>', 'Второе']);
});

test('only Telegram messages targeting topic 126 enter the private queue', async () => {
  const cache = memoryCache();
  const input = 'https://api.telegram.org/bot123:test/sendMessage';
  await queueForDiTelegramRequest(input, {
    body: JSON.stringify({ chat_id: -1001, message_thread_id: 126, text: 'Для Ди' }),
  }, { now: new Date('2026-09-22T08:00:00Z'), forDiCache: cache });
  await queueForDiTelegramRequest(input, {
    body: JSON.stringify({ chat_id: -1001, message_thread_id: 72, text: 'Не для Ди' }),
  }, { now: new Date('2026-09-22T08:00:00Z'), forDiCache: cache });

  const sent = [];
  const result = await sendForDiPrivateMessages({
    now: new Date('2026-09-22T09:00:00Z'),
    forDiCache: cache,
    recipients: { 'Диана': 222 },
    botToken: 'test-token',
    fetchImpl: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(result.sent, 1);
  assert.equal(sent[0].text, 'Для Ди');
});
