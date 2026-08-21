const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../api/products-state.cjs');

function fakeCache(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    values,
  };
}

test('same warm process rehydrates Telegram after Alice changed shared history', async () => {
  const cache = fakeCache({
    'products:history': ['молоко', 'яйца'],
    'products:migration:2026-08-20': true,
  });
  state.resetProductsProcessStateForTests();

  const aliceReq = { body: {
    session: { new: false, session_id: 'alice', user: {}, application: {} },
    request: { type: 'SimpleUtterance', command: 'хлеб', original_utterance: 'хлеб' },
  } };
  let aliceSeen;
  await state.runProductsAddition(aliceReq, async () => { aliceSeen = aliceReq.body.request.command; }, { cache });
  assert.match(aliceSeen, /молоко/iu);
  assert.match(aliceSeen, /яйца/iu);
  assert.match(aliceSeen, /хлеб/iu);

  const telegramReq = { body: { message: {
    message_thread_id: 263,
    text: 'сыр',
    from: { id: 777, is_bot: false },
  } } };
  let telegramSeen;
  await state.runProductsAddition(telegramReq, async () => { telegramSeen = telegramReq.body.message.text; }, { cache });

  assert.match(telegramSeen, /молоко/iu);
  assert.match(telegramSeen, /яйца/iu);
  assert.match(telegramSeen, /хлеб/iu);
  assert.match(telegramSeen, /сыр/iu);
  assert.deepEqual(await cache.get('products:history'), ['молоко', 'яйца', 'хлеб', 'сыр']);
});

test('same transport can keep warm optimization without losing shared history', async () => {
  const cache = fakeCache({
    'products:history': ['молоко'],
    'products:migration:2026-08-20': true,
  });
  state.resetProductsProcessStateForTests();

  const first = { body: { message: { message_thread_id: 263, text: 'хлеб', from: { id: 1, is_bot: false } } } };
  let firstSeen;
  await state.runProductsAddition(first, async () => { firstSeen = first.body.message.text; }, { cache });
  assert.match(firstSeen, /молоко/iu);
  assert.match(firstSeen, /хлеб/iu);

  const second = { body: { message: { message_thread_id: 263, text: 'сыр', from: { id: 2, is_bot: false } } } };
  let secondSeen;
  await state.runProductsAddition(second, async () => { secondSeen = second.body.message.text; }, { cache });
  assert.equal(secondSeen, 'сыр');
  assert.deepEqual(await cache.get('products:history'), ['молоко', 'хлеб', 'сыр']);
});

test('Alice rehydrates after Telegram changes history in the same warm process', async () => {
  const cache = fakeCache({
    'products:history': ['молоко'],
    'products:migration:2026-08-20': true,
  });
  state.resetProductsProcessStateForTests();

  const telegramReq = { body: { message: { message_thread_id: 263, text: 'хлеб', from: { id: 1, is_bot: false } } } };
  await state.runProductsAddition(telegramReq, async () => {}, { cache });

  const aliceReq = { body: {
    session: { new: false, session_id: 'a', user: {}, application: {} },
    request: { type: 'SimpleUtterance', command: 'сыр', original_utterance: 'сыр' },
  } };
  let seen;
  await state.runProductsAddition(aliceReq, async () => { seen = aliceReq.body.request.command; }, { cache });
  assert.match(seen, /молоко/iu);
  assert.match(seen, /хлеб/iu);
  assert.match(seen, /сыр/iu);
});
