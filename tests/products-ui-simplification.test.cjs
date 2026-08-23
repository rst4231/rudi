const test = require('node:test');
const assert = require('node:assert/strict');

const products = require('../api/products-bought.cjs');

function clearRequest() {
  return {
    query: { route: 'telegram' },
    body: {
      callback_query: {
        id: 'cb-clear',
        data: 'runtime:clear:actual',
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

test('products keyboard removes Куплено instead of injecting it', () => {
  assert.equal(typeof products.removeBoughtButtonFromTelegramRequest, 'function');
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -100123,
      message_thread_id: 263,
      text: '🛒 Список продуктов',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Добавить', callback_data: 'products:add' }],
          [{ text: 'Куплено', callback_data: products.SHOPPING_BOUGHT_CALLBACK }],
          [{ text: '🧹 Очистить', callback_data: 'runtime:clear:actual' }],
        ],
      },
    }),
  };

  const changed = products.removeBoughtButtonFromTelegramRequest(
    'https://api.telegram.org/bot123/sendMessage',
    init,
  );
  const body = JSON.parse(changed.body);
  assert.equal(
    body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === products.SHOPPING_BOUGHT_CALLBACK || /куплено/i.test(button.text || '')),
    false,
  );
});

test('new products list never pins itself', async () => {
  assert.equal(typeof products.shouldSuppressProductsPin, 'function');
  const pinUrl = 'https://api.telegram.org/bot123/pinChatMessage';
  assert.equal(products.shouldSuppressProductsPin(pinUrl), false);
  await products.runWithProductsContext(async () => {
    await Promise.resolve();
    assert.equal(products.shouldSuppressProductsPin(pinUrl), true);
    assert.equal(products.shouldSuppressProductsPin('https://api.telegram.org/bot123/sendMessage'), false);
  });
  assert.equal(products.shouldSuppressProductsPin(pinUrl), false);
});

test('legacy clear hides CRON_SECRET so runtime does not reject Telegram clear with 401', async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'configured-cron-secret';
  let seenSecret = 'not-called';
  try {
    await products.clearLegacyProductsRuntime(clearRequest(), {
      runtime: async (_req, res) => {
        seenSecret = process.env.CRON_SECRET;
        return res.status(200).json({ ok: true });
      },
    });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
  assert.equal(seenSecret, undefined);
});
