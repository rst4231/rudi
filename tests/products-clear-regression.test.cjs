const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deleteProductsListMessage } = require('../api/products-bought.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

test('direct Очистить deletes current list without entering old runtime', () => {
  const start = source.indexOf('if (isProductsClearCallback(req))');
  const end = source.indexOf('if (isTelegramClearIntent(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /deleteProductsListMessage/);
  assert.doesNotMatch(block, /runRuntime\(/);
});

test('Куплено deletes current list without replaying old clear callback', () => {
  const start = source.indexOf('if (boughtAction)');
  const end = source.indexOf('if (isProductsClearCallback(req))', start);
  assert.ok(start > -1 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /deleteProductsListMessage/);
  assert.doesNotMatch(block, /runWithExistingClearAction/);
  assert.doesNotMatch(block, /runRuntime\(/);
});

test('clear helper makes only one Telegram deleteMessage call', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  await deleteProductsListMessage({
    body: { callback_query: { message: { chat: { id: -100555 }, message_id: 77, message_thread_id: 263 } } },
  }, { fetchImpl: fakeFetch, token: '123:TEST_TOKEN' });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/deleteMessage$/u);
  assert.deepEqual(JSON.parse(calls[0].init.body), { chat_id: -100555, message_id: 77 });
  assert.equal(calls.some((call) => /\/(?:sendMessage|editMessageText|pinChatMessage)$/u.test(call.url)), false);
});
