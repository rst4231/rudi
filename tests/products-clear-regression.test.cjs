const test = require('node:test');
const assert = require('node:assert/strict');
const products = require('../api/products-bought.cjs');

function clearRequest(data = 'runtime:clear:actual') {
  return {
    query: { route: 'telegram' },
    body: {
      callback_query: {
        id: 'cb-clear',
        data,
        message: {
          chat: { id: -100555 },
          message_id: 77,
          message_thread_id: 263,
          reply_markup: {
            inline_keyboard: [[{ text: '🧹 Очистить', callback_data: 'runtime:clear:actual' }]],
          },
        },
      },
    },
  };
}

test('delete clears hidden runtime state before deleting current Telegram list', async () => {
  const req = clearRequest();
  const calls = [];
  let hiddenProducts = ['старый товар'];
  const runtime = async (runtimeReq, runtimeRes) => {
    assert.equal(runtimeReq.body.callback_query.data, 'runtime:clear:actual');
    assert.equal(products.shouldSuppressProductsClearTelegram('https://api.telegram.org/bot123/sendMessage'), true);
    hiddenProducts = [];
    return runtimeRes.status(200).json({ ok: true });
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };

  await products.deleteProductsListMessage(req, { runtime, fetchImpl, token: '123:TEST_TOKEN' });

  assert.deepEqual(hiddenProducts, []);
  assert.equal(req.body.callback_query.data, 'runtime:clear:actual');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/deleteMessage$/u);
  assert.deepEqual(JSON.parse(calls[0].init.body), { chat_id: -100555, message_id: 77 });
});

test('Куплено temporarily replays the real Очистить callback to clear hidden runtime state', async () => {
  const req = clearRequest(products.SHOPPING_BOUGHT_CALLBACK);
  let seenData = null;
  const runtime = async (runtimeReq, runtimeRes) => {
    seenData = runtimeReq.body.callback_query.data;
    return runtimeRes.status(200).json({ ok: true });
  };
  const fetchImpl = async () => new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });

  await products.deleteProductsListMessage(req, { runtime, fetchImpl, token: '123:TEST_TOKEN' });

  assert.equal(seenData, 'runtime:clear:actual');
  assert.equal(req.body.callback_query.data, products.SHOPPING_BOUGHT_CALLBACK);
});

test('clear-silence context suppresses runtime Telegram mutations but stays async-scoped', async () => {
  const send = 'https://api.telegram.org/bot123/sendMessage';
  const pin = 'https://api.telegram.org/bot123/pinChatMessage';
  assert.equal(products.shouldSuppressProductsClearTelegram(send), false);
  await products.runWithProductsClearSilenced(async () => {
    await Promise.resolve();
    assert.equal(products.shouldSuppressProductsClearTelegram(send), true);
    assert.equal(products.shouldSuppressProductsClearTelegram(pin), true);
  });
  assert.equal(products.shouldSuppressProductsClearTelegram(send), false);
});
