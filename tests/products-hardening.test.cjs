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

test('one-time migration preserves the currently visible legacy product', async () => {
  assert.equal(typeof state.readProductsHistory, 'function');
  const cache = fakeCache();
  const history = await state.readProductsHistory(cache);
  assert.deepEqual(history, ['фарш куриный']);
  assert.deepEqual(await cache.get('products:history'), ['фарш куриный']);
});

test('authorized clear prevents legacy seed from ever returning', async () => {
  const cache = fakeCache();
  state.resetProductsProcessStateForTests();
  await state.runAuthorizedProductsClear(async () => true, { cache });
  assert.deepEqual(await state.readProductsHistory(cache), []);
});

test('Alice spoken addition is forced into shared non-new session', async () => {
  const req = {
    query: { route: 'alice-shopping' },
    body: {
      session: {
        new: true,
        session_id: 'old-session',
        user: { user_id: 'old-user' },
        application: { application_id: 'old-app' },
      },
      request: { type: 'SimpleUtterance', command: 'молоко', original_utterance: 'молоко' },
    },
  };
  state.normalizeProductsActor(req);
  assert.equal(req.body.session.new, false);
  assert.equal(req.body.session.session_id, String(state.SHARED_PRODUCTS_ACTOR_ID));
  assert.equal(req.body.session.user.user_id, String(state.SHARED_PRODUCTS_ACTOR_ID));
  assert.equal(req.body.session.application.application_id, String(state.SHARED_PRODUCTS_ACTOR_ID));
});

test('Greek yogurt is one invisible-joined token but still contains dairy keyword', () => {
  const normalized = state.normalizeCompoundProducts('греческий йогурт');
  assert.equal(normalized.includes(' '), false);
  assert.match(normalized, /йогурт/iu);
  assert.equal(state.restoreCompoundProducts(normalized), 'греческий йогурт');
});

test('ordinary human chatter outside products topic is ignored but slash command is preserved', () => {
  assert.equal(typeof state.shouldIgnorePassiveTelegramMessage, 'function');
  assert.equal(state.shouldIgnorePassiveTelegramMessage({ body: {
    message: { message_thread_id: 88, text: 'привет', from: { id: 1, is_bot: false } },
  } }), true);
  assert.equal(state.shouldIgnorePassiveTelegramMessage({ body: {
    message: { message_thread_id: 88, text: '/start', from: { id: 1, is_bot: false }, entities: [{ type: 'bot_command' }] },
  } }), false);
});

test('empty Alice utterance is always non-mutating even when session.new is false', () => {
  assert.equal(typeof state.isEmptyAliceShoppingRequest, 'function');
  assert.equal(state.isEmptyAliceShoppingRequest({ body: {
    session: { new: false },
    request: { type: 'SimpleUtterance', command: ' ', original_utterance: '' },
  } }), true);
});

test('typed clear or typed Куплено in products topic is never an addition', () => {
  assert.equal(typeof state.isTelegramClearIntent, 'function');
  for (const text of ['очисти список', 'удали все', 'удали список', 'обнули список', 'начни заново', 'куплено', 'все куплено', 'всё куплено']) {
    const req = { body: { message: { message_thread_id: 263, text, from: { id: 1, is_bot: false } } } };
    assert.equal(state.isTelegramClearIntent(req), true, text);
    assert.equal(state.isTelegramProductAddition(req), false, text);
  }
});

test('add callback is recognized by the actual keyboard button text only', () => {
  const req = { body: { callback_query: {
    data: 'runtime:add:actual',
    message: {
      message_thread_id: 263,
      reply_markup: { inline_keyboard: [[{ text: '➕ Добавить', callback_data: 'runtime:add:actual' }]] },
    },
  } } };
  assert.equal(state.isProductsAddCallback(req), true);
  req.body.callback_query.data = 'forged';
  assert.equal(state.isProductsAddCallback(req), false);
});

test('cold hydration preserves both the legacy item and a new compound product', async () => {
  const cache = fakeCache();
  state.resetProductsProcessStateForTests();
  const req = { body: { message: { message_thread_id: 263, text: 'греческий йогурт', from: { id: 44 } } } };
  let seen;
  await state.runProductsAddition(req, async () => { seen = req.body.message.text; }, { cache });
  assert.equal(seen, `фарш${state.WORD_JOINER}куриный, греческий${state.WORD_JOINER}йогурт`);
  assert.deepEqual(await cache.get('products:history'), ['фарш куриный', 'греческий йогурт']);
  assert.equal(req.body.message.text, 'греческий йогурт', 'original Telegram update is restored after runtime');
});

test('same warm instance rehydrates when another instance changed durable history', async () => {
  const cache = fakeCache();
  state.resetProductsProcessStateForTests();

  const firstReq = { body: { message: { message_thread_id: 263, text: 'молоко', from: { id: 10 } } } };
  let firstSeen;
  await state.runProductsAddition(firstReq, async () => { firstSeen = firstReq.body.message.text; }, { cache });
  assert.match(firstSeen, /фарш/iu);
  assert.match(firstSeen, /молоко/iu);

  await cache.set('products:history', ['фарш куриный', 'молоко', 'хлеб']);

  const secondReq = { body: { message: { message_thread_id: 263, text: 'сыр', from: { id: 10 } } } };
  let secondSeen;
  await state.runProductsAddition(secondReq, async () => { secondSeen = secondReq.body.message.text; }, { cache });

  assert.match(secondSeen, /хлеб/iu, 'warm runtime must be rehydrated with the remote item');
  assert.match(secondSeen, /сыр/iu);
  assert.deepEqual(await cache.get('products:history'), ['фарш куриный', 'молоко', 'хлеб', 'сыр']);
});

test('failed clear never clears durable products history', async () => {
  const cache = fakeCache({ 'products:history': ['фарш куриный', 'молоко'] });
  state.resetProductsProcessStateForTests();

  await assert.rejects(
    state.runAuthorizedProductsClear(async () => { throw new Error('runtime clear failed'); }, { cache }),
    /runtime clear failed/,
  );

  assert.deepEqual(await cache.get('products:history'), ['фарш куриный', 'молоко']);
});

test('Diana Telegram addition merges with products previously added through Alice', async () => {
  const cache = fakeCache({
    'products:history': ['молоко', 'яйца', 'греческий йогурт'],
    'products:migration:2026-08-20': true,
  });
  state.resetProductsProcessStateForTests();
  const req = { body: { message: {
    message_thread_id: 263,
    text: 'фарш куриный',
    from: { id: 777, is_bot: false, first_name: 'Диана' },
  } } };
  let seen;
  await state.runProductsAddition(req, async () => { seen = req.body.message.text; }, { cache });

  assert.match(seen, /молоко/iu);
  assert.match(seen, /яйца/iu);
  assert.match(seen, /греческий.*йогурт/iu);
  assert.match(seen, /фарш.*куриный/iu);
  assert.deepEqual(await cache.get('products:history'), [
    'молоко', 'яйца', 'греческий йогурт', 'фарш куриный',
  ]);
});
