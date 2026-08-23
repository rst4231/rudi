const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const products = require('../api/products-bought.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('direct Очистить clears hidden runtime state without allowing runtime to recreate Telegram list', () => {
  const start = source.indexOf('if (isProductsClearCallback(req))');
  const end = source.indexOf('if (isTelegramClearIntent(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /runWithExistingClearAction/);
  assert.match(block, /runWithProductsClearSilenced/);
  assert.match(block, /runRuntime\(req, res\)/);
  assert.match(block, /deleteProductsListMessage/);
});

test('Куплено clears hidden runtime state before deleting the current list', () => {
  const start = source.indexOf('if (boughtAction)');
  const end = source.indexOf('if (isProductsClearCallback(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /runWithExistingClearAction/);
  assert.match(block, /runWithProductsClearSilenced/);
  assert.match(block, /runRuntime\(req, res\)/);
  assert.match(block, /deleteProductsListMessage/);
});

test('clear-silence context suppresses runtime Telegram mutations but stays async-scoped', async () => {
  assert.equal(typeof products.runWithProductsClearSilenced, 'function');
  assert.equal(typeof products.shouldSuppressProductsClearTelegram, 'function');
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

test('delete helper makes only one Telegram deleteMessage call', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  await products.deleteProductsListMessage({
    body: { callback_query: { message: { chat: { id: -100555 }, message_id: 77, message_thread_id: 263 } } },
  }, { fetchImpl: fakeFetch, token: '123:TEST_TOKEN' });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/deleteMessage$/u);
  assert.deepEqual(JSON.parse(calls[0].init.body), { chat_id: -100555, message_id: 77 });
});
