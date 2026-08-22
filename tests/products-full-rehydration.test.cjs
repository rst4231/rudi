const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../api/products-state.cjs');

function fakeCache(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
    values,
  };
}

test('Telegram rehydrates the full durable list without resurrecting the old chicken-mince seed', async () => {
  const cache = fakeCache({
    'products:history': ['фарш куриный'],
    'products:migration:2026-08-20': true,
  });
  state.resetProductsProcessStateForTests();

  const diana = { body: { message: {
    message_thread_id: 263,
    text: 'молоко, яйца, хлеб',
    from: { id: 100, is_bot: false, first_name: 'Диана' },
  } } };
  let dianaSeen;
  await state.runProductsAddition(diana, async () => { dianaSeen = diana.body.message.text; }, { cache });
  assert.equal((dianaSeen.match(/молоко/giu) || []).length, 1);
  assert.equal((dianaSeen.match(/яйца/giu) || []).length, 1);
  assert.equal((dianaSeen.match(/хлеб/giu) || []).length, 1);
  assert.deepEqual(await cache.get('products:history'), ['молоко', 'яйца', 'хлеб']);

  const user = { body: { message: {
    message_thread_id: 263,
    text: 'шоколад',
    from: { id: 200, is_bot: false },
  } } };
  let seen;
  await state.runProductsAddition(user, async () => { seen = user.body.message.text; }, { cache });

  assert.doesNotMatch(seen, /фарш/iu);
  assert.match(seen, /молоко/iu);
  assert.match(seen, /яйца/iu);
  assert.match(seen, /хлеб/iu);
  assert.match(seen, /шоколад/iu);
  assert.deepEqual(await cache.get('products:history'), [
    'молоко', 'яйца', 'хлеб', 'шоколад',
  ]);
});
