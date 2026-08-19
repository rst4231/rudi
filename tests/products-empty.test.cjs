const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SHOPPING_BOUGHT_CALLBACK,
  isEmptyProductsListMessage,
  handleBoughtCallback,
} = require('../api/products-bought.cjs');

test('recognizes an empty products list message', () => {
  assert.equal(typeof isEmptyProductsListMessage, 'function');
  assert.equal(isEmptyProductsListMessage({ text: '🛒 Список продуктов\n\nСписок пуст.' }), true);
  assert.equal(isEmptyProductsListMessage({ text: '🛒 Список продуктов\n\nМолоко\nХлеб' }), false);
});

test('empty list Куплено sends no purchase message and does not request clear', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  const req = { body: { callback_query: {
    id: 'cb-empty', data: SHOPPING_BOUGHT_CALLBACK, from: { first_name: 'Рустам' },
    message: {
      chat: { id: -100555 }, message_thread_id: 263,
      text: '🛒 Список продуктов\n\nСписок пуст.',
      reply_markup: { inline_keyboard: [
        [{ text: 'Очистить', callback_data: 'runtime:clear:actual' }],
        [{ text: 'Куплено', callback_data: SHOPPING_BOUGHT_CALLBACK }],
      ] },
    },
  } } };

  const action = await handleBoughtCallback(req, {}, { fetchImpl: fakeFetch, token: '123:TEST_TOKEN' });
  assert.deepEqual(action, { empty: true });
  assert.equal(calls.filter((call) => call.url.endsWith('/sendMessage')).length, 0);
  assert.equal(calls.filter((call) => call.url.endsWith('/answerCallbackQuery')).length, 1);
});

test('non-empty list Куплено still posts purchase notice and requests clear', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
  };
  const req = { body: { callback_query: {
    id: 'cb-full', data: SHOPPING_BOUGHT_CALLBACK, from: { first_name: 'Рустам' },
    message: {
      chat: { id: -100555 }, message_thread_id: 263,
      text: '🛒 Список продуктов\n\nМолоко\nХлеб',
      reply_markup: { inline_keyboard: [
        [{ text: 'Очистить', callback_data: 'runtime:clear:actual' }],
        [{ text: 'Куплено', callback_data: SHOPPING_BOUGHT_CALLBACK }],
      ] },
    },
  } } };
  const action = await handleBoughtCallback(req, {}, {
    fetchImpl: fakeFetch,
    token: '123:TEST_TOKEN',
    now: new Date('2026-08-18T16:36:00Z'),
  });
  assert.deepEqual(action, { clearCallbackData: 'runtime:clear:actual' });
  assert.equal(calls.filter((call) => call.url.endsWith('/sendMessage')).length, 1);
});
