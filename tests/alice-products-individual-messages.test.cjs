const test = require('node:test');
const assert = require('node:assert/strict');

const productsChat = require('../api/products-chat.cjs');

function aliceReq(text) {
  return {
    body: {
      version: '1.0',
      request: {
        type: 'SimpleUtterance',
        command: text,
        original_utterance: text,
      },
    },
  };
}

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value) { map.set(key, structuredClone(value)); },
  };
}

test('Alice product input is split into separate positions', () => {
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('пиво, креветки, мороженое')),
    ['пиво', 'креветки', 'мороженое'],
  );
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('пиво и креветки\nмороженое')),
    ['пиво', 'креветки', 'мороженое'],
  );
});

test('Alice keeps an unseparated multi-word product as one position', () => {
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('сладкие хлебцы')),
    ['сладкие хлебцы'],
  );
});

test('Alice sends every product as a separate RUDI Telegram message and stores message ids', async () => {
  const calls = [];
  let nextId = 100;
  const cache = memoryCache();
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ url, payload });
    nextId += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: nextId } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await productsChat.sendAliceProductMessages(
    aliceReq('пиво, креветки, мороженое'),
    { token: 'TOKEN', chatId: -100123, fetchImpl, cache, now: () => 1234567890 },
  );

  assert.deepEqual(calls.map((call) => call.payload.text), ['пиво', 'креветки', 'мороженое']);
  assert.ok(calls.every((call) => call.payload.message_thread_id === 263));
  assert.ok(calls.every((call) => !('reply_markup' in call.payload)));
  assert.deepEqual(result.items.map((item) => item.messageId), [101, 102, 103]);

  const stored = await productsChat.readAliceProductMessageRecords({ cache });
  assert.deepEqual(stored.map((item) => [item.text, item.messageId]), [
    ['пиво', 101],
    ['креветки', 102],
    ['мороженое', 103],
  ]);
});

test('удали <позиция> deletes only the latest matching RUDI message', async () => {
  const calls = [];
  const cache = memoryCache();
  await productsChat.writeAliceProductMessageRecords([
    { text: 'кефир', normalized: 'кефир', messageId: 41, createdAt: 1 },
    { text: 'хлеб', normalized: 'хлеб', messageId: 42, createdAt: 2 },
    { text: 'кефир', normalized: 'кефир', messageId: 43, createdAt: 3 },
  ], { cache });

  const fetchImpl = async (url, init) => {
    calls.push({ url, payload: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await productsChat.deleteAliceProductMessage(
    aliceReq('удали кефир'),
    { token: 'TOKEN', chatId: -100123, fetchImpl, cache },
  );

  assert.equal(result.deleted, true);
  assert.equal(result.text, 'кефир');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /deleteMessage$/);
  assert.deepEqual(calls[0].payload, { chat_id: -100123, message_id: 43 });

  const remaining = await productsChat.readAliceProductMessageRecords({ cache });
  assert.deepEqual(remaining.map((item) => item.messageId), [41, 42]);
});

test('delete command does not touch Telegram when Alice-created position is absent', async () => {
  const cache = memoryCache();
  await productsChat.writeAliceProductMessageRecords([
    { text: 'хлеб', normalized: 'хлеб', messageId: 42, createdAt: 2 },
  ], { cache });
  let calls = 0;
  const result = await productsChat.deleteAliceProductMessage(
    aliceReq('удали кефир'),
    {
      token: 'TOKEN',
      chatId: -100123,
      cache,
      fetchImpl: async () => { calls += 1; throw new Error('must not call Telegram'); },
    },
  );
  assert.deepEqual(result, { deleted: false, text: 'кефир' });
  assert.equal(calls, 0);
});

test('Alice deletion target is distinct from product addition', () => {
  assert.equal(productsChat.getAliceProductDeleteTarget(aliceReq('удали кефир')), 'кефир');
  assert.equal(productsChat.getAliceProductDeleteTarget(aliceReq('кефир')), '');
});
