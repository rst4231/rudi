const test = require('node:test');
const assert = require('node:assert/strict');
const products = require('../api/products-bought.cjs');

test('clear silence covers every Telegram method the legacy clear can use', async () => {
  assert.equal(typeof products.runWithProductsClearSilenced, 'function');
  assert.equal(typeof products.shouldSuppressProductsClearTelegram, 'function');
  const methods = ['sendMessage', 'editMessageText', 'editMessageReplyMarkup', 'pinChatMessage', 'unpinChatMessage', 'deleteMessage'];
  await products.runWithProductsClearSilenced(async () => {
    for (const method of methods) {
      assert.equal(products.shouldSuppressProductsClearTelegram(`https://api.telegram.org/bot123/${method}`), true, method);
    }
    assert.equal(products.shouldSuppressProductsClearTelegram('https://example.com/api'), false);
  });
});
