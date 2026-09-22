const test = require('node:test');
const assert = require('node:assert/strict');

const productsChat = require('../api/products-chat.cjs');
const productsStore = require('../api/products-message-store.cjs');

function aliceReq(command, original = command) {
  return {
    body: {
      version: '1.0',
      request: {
        type: 'SimpleUtterance',
        command,
        original_utterance: original,
      },
    },
  };
}

test('Alice list splitting prefers the original utterance so punctuation is not lost', () => {
  const req = aliceReq(
    'добавь мороженое кефир масло',
    'Добавь мороженое, кефир, масло',
  );
  assert.deepEqual(productsChat.splitAliceProductItems(req), [
    'мороженое',
    'кефир',
    'масло',
  ]);
});

test('Alice splits common spoken product lists even when punctuation is absent', () => {
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('добавь мороженое кефир масло')),
    ['мороженое', 'кефир', 'масло'],
  );
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('картошка орехи чай зеленый')),
    ['картошка', 'орехи', 'чай зеленый'],
  );
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('молоко хлеб яйца сыр')),
    ['молоко', 'хлеб', 'яйца', 'сыр'],
  );
  assert.deepEqual(
    productsChat.splitAliceProductItems(aliceReq('сыр творожный масло сливочное')),
    ['сыр творожный', 'масло сливочное'],
  );
});

test('products message cache does not require an immediate read-after-write confirmation', async () => {
  assert.equal(typeof productsStore.createProductsMessageCache, 'function');

  let getCalls = 0;
  let setCalls = 0;
  const runtimeCache = {
    async get() {
      getCalls += 1;
      return null;
    },
    async set() {
      setCalls += 1;
    },
  };

  const cache = productsStore.createProductsMessageCache({
    getCacheImpl: () => runtimeCache,
  });

  await cache.set('alice-products:position:кефир', [{ messageId: 77 }], { ttl: 3600 });
  assert.equal(setCalls, 1);
  assert.equal(getCalls, 0);
});
