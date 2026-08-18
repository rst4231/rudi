const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SHOPPING_BOUGHT_CALLBACK,
  addBoughtButtonToTelegramRequest,
  formatTelegramUserName,
  formatMoscowDateTime,
  handleBoughtCallback,
  runWithProductsContext,
  isProductsTopicUpdate,
} = require('../api/products-bought.cjs');

test('adds Куплено button to product-topic inline keyboard once', () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -100123,
      message_thread_id: 263,
      text: '🛒 Список продуктов',
      reply_markup: {
        inline_keyboard: [[{ text: 'Добавить', callback_data: 'products:add' }]],
      },
    }),
  };

  const changed = addBoughtButtonToTelegramRequest(
    'https://api.telegram.org/bot123/sendMessage',
    init,
  );
  const body = JSON.parse(changed.body);
  assert.deepEqual(body.reply_markup.inline_keyboard.at(-1), [
    { text: 'Куплено', callback_data: SHOPPING_BOUGHT_CALLBACK },
  ]);

  const changedTwice = addBoughtButtonToTelegramRequest(
    'https://api.telegram.org/bot123/sendMessage',
    changed,
  );
  const bodyTwice = JSON.parse(changedTwice.body);
  const boughtButtons = bodyTwice.reply_markup.inline_keyboard.flat()
    .filter((button) => button.callback_data === SHOPPING_BOUGHT_CALLBACK);
  assert.equal(boughtButtons.length, 1);
});

test('does not add Куплено button outside the products topic', () => {
  const init = {
    body: JSON.stringify({
      chat_id: -100123,
      message_thread_id: 88,
      text: 'Рецепт с продуктами',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть', callback_data: 'open' }]] },
    }),
  };
  const changed = addBoughtButtonToTelegramRequest(
    'https://api.telegram.org/bot123/sendMessage',
    init,
  );
  assert.equal(changed, init);
});

test('uses Telegram profile name and Moscow date/time', () => {
  assert.equal(
    formatTelegramUserName({ first_name: 'Рустам', last_name: 'А.' }),
    'Рустам А.',
  );
  assert.equal(formatTelegramUserName({ username: 'rst4231' }), '@rst4231');
  assert.equal(
    formatMoscowDateTime(new Date('2026-08-18T16:36:00Z')),
    '18.08.2026, 19:36',
  );
});

test('Куплено callback posts purchase notice into the same products topic and acknowledges callback', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const req = {
    body: {
      callback_query: {
        id: 'cb-1',
        data: SHOPPING_BOUGHT_CALLBACK,
        from: { first_name: 'Рустам', username: 'rst4231' },
        message: {
          chat: { id: -100555 },
          message_thread_id: 263,
        },
      },
    },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  const handled = await handleBoughtCallback(req, res, {
    fetchImpl: fakeFetch,
    token: '123:TEST_TOKEN',
    now: new Date('2026-08-18T16:36:00Z'),
  });

  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(calls.length, 2);

  const send = calls.find((call) => call.url.endsWith('/sendMessage'));
  const sendBody = JSON.parse(send.init.body);
  assert.equal(sendBody.chat_id, -100555);
  assert.equal(sendBody.message_thread_id, 263);
  assert.equal(sendBody.text, 'Рустам купил продукты\n18.08.2026, 19:36');

  const answer = calls.find((call) => call.url.endsWith('/answerCallbackQuery'));
  assert.equal(JSON.parse(answer.init.body).callback_query_id, 'cb-1');
});

test('forged or expired callback cannot trigger purchase message when Telegram rejects callback id', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/answerCallbackQuery')) {
      return new Response(JSON.stringify({ ok: false, description: 'query is too old' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const req = {
    body: {
      callback_query: {
        id: 'fake-callback',
        data: SHOPPING_BOUGHT_CALLBACK,
        from: { first_name: 'Подделка' },
        message: { chat: { id: -100555 }, message_thread_id: 263 },
      },
    },
  };
  const res = {
    status() { return this; },
    json() { return this; },
  };

  await assert.rejects(
    handleBoughtCallback(req, res, { fetchImpl: fakeFetch, token: '123:TEST_TOKEN' }),
    /answerCallbackQuery failed: HTTP 400/,
  );
  assert.equal(calls.filter((call) => call.url.endsWith('/sendMessage')).length, 0);
});

test('products context keeps Куплено on editMessageReplyMarkup even when Telegram edit has no thread id', async () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -100123,
      message_id: 77,
      reply_markup: {
        inline_keyboard: [[{ text: 'Добавить', callback_data: 'whatever-existing-runtime-uses' }]],
      },
    }),
  };

  const unchanged = addBoughtButtonToTelegramRequest(
    'https://api.telegram.org/bot123/editMessageReplyMarkup',
    init,
  );
  assert.equal(unchanged, init, 'outside products context an unscoped edit must stay untouched');

  const changed = await runWithProductsContext(() => addBoughtButtonToTelegramRequest(
    'https://api.telegram.org/bot123/editMessageReplyMarkup',
    init,
  ));
  const body = JSON.parse(changed.body);
  assert.deepEqual(body.reply_markup.inline_keyboard.at(-1), [
    { text: 'Куплено', callback_data: SHOPPING_BOUGHT_CALLBACK },
  ]);
});

test('recognizes only Telegram updates coming from products topic', () => {
  assert.equal(isProductsTopicUpdate({
    body: { callback_query: { message: { message_thread_id: 263 } } },
  }), true);
  assert.equal(isProductsTopicUpdate({
    body: { message: { message_thread_id: 263 } },
  }), true);
  assert.equal(isProductsTopicUpdate({
    body: { callback_query: { message: { message_thread_id: 88 } } },
  }), false);
});
