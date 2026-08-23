const test = require('node:test');
const assert = require('node:assert/strict');

const products = require('../api/products-chat.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async set(key, value) { map.set(key, structuredClone(value)); },
  };
}

test('Telegram products topic is treated as a native chat and human text is not transformed', () => {
  const req = {
    body: {
      message: {
        message_thread_id: 263,
        from: { id: 42, is_bot: false },
        text: 'молоко, яйца и хлеб',
      },
    },
  };
  assert.equal(products.isProductsTopicUpdate(req), true);
  assert.equal(req.body.message.text, 'молоко, яйца и хлеб');
});

test('Alice add command becomes only the product text', () => {
  const req = {
    body: {
      request: {
        type: 'SimpleUtterance',
        command: 'добавь молоко и яйца',
        original_utterance: 'добавь молоко и яйца',
      },
    },
  };
  assert.equal(products.cleanAliceProductText(req), 'молоко и яйца');
});

test('Alice products are sent as separate plain messages to topic 263 with no buttons or pinning', async () => {
  const calls = [];
  let messageId = 900;
  const fetchImpl = async (url, init) => {
    messageId += 1;
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const req = {
    body: {
      request: { type: 'SimpleUtterance', command: 'добавь молоко и яйца' },
    },
  };

  const result = await products.sendAliceProductMessage(req, {
    token: '123:TEST_TOKEN',
    chatId: -100555,
    fetchImpl,
    cache: memoryCache(),
  });

  assert.deepEqual(result.items.map((item) => item.text), ['молоко', 'яйца']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => /\/sendMessage$/u.test(call.url)));
  assert.deepEqual(calls.map((call) => call.body), [
    {
      chat_id: -100555,
      message_thread_id: 263,
      text: 'молоко',
    },
    {
      chat_id: -100555,
      message_thread_id: 263,
      text: 'яйца',
    },
  ]);
});
