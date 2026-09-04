const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFeedbackData,
  parseFeedbackCallback,
  incrementSectionMetric,
  buildFeedbackMarkup,
  collectLegacyFeedbackMessageIds,
  cleanupLegacyFeedbackKeyboards,
} = require('../api/feedback-analytics.cjs');

function cache(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    async get(k) { return m.get(k) ?? null; },
    async set(k, v) { m.set(k, structuredClone(v)); return true; },
  };
}

test('feedback callback is signed and validates', () => {
  const env = { RUDI_FEEDBACK_SECRET: 'secret' };
  const data = buildFeedbackData('facts', '2026-08-30', 'up', env);
  assert.deepEqual(parseFeedbackCallback(data, env), { section: 'facts', date: '2026-08-30', vote: 'up' });
  assert.equal(parseFeedbackCallback(data.replace(':u:', ':d:'), env), null);
});

test('analytics increments named counter', async () => {
  const c = cache();
  await incrementSectionMetric('facts', 'positiveFeedback', 1, { cache: c });
  await incrementSectionMetric('facts', 'positiveFeedback', 1, { cache: c });
  assert.equal((await c.get('analytics:facts')).positiveFeedback, 2);
});

test('new publications no longer get thumbs feedback markup', () => {
  assert.equal(buildFeedbackMarkup('facts', '2026-09-04', { RUDI_FEEDBACK_SECRET: 'secret' }), null);
});

test('legacy feedback cleanup finds stored message ids and removes their keyboards', async () => {
  assert.equal(typeof collectLegacyFeedbackMessageIds, 'function');
  assert.equal(typeof cleanupLegacyFeedbackKeyboards, 'function');
  if (typeof collectLegacyFeedbackMessageIds !== 'function' || typeof cleanupLegacyFeedbackKeyboards !== 'function') return;

  const topicCache = cache({
    'topic:19:2026-09-04:messages': [702, 701],
  });
  const dailyContentCache = cache({
    'daily-content:72:history': [{ dateKey: '2026-09-04', messageId: 703 }],
    'daily-content:85:history': [{ dateKey: '2026-09-04', messageId: 704 }],
  });
  const ids = await collectLegacyFeedbackMessageIds({
    dateKeys: ['2026-09-04'],
    topicCache,
    dailyContentCache,
    getRecord: async (_date, section) => section === 'clients' ? { messageIds: [701] } : null,
  });
  assert.deepEqual(ids, [701, 702, 703, 704]);

  const calls = [];
  const result = await cleanupLegacyFeedbackKeyboards({
    messageIds: ids,
    chatId: '-1004476323368',
    token: '1:test',
    controlCache: cache(),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    },
  });

  assert.equal(result.removed, 4);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.url.endsWith('/editMessageReplyMarkup')));
  assert.ok(calls.every((call) => call.body.chat_id === '-1004476323368'));
  assert.ok(calls.every((call) => Array.isArray(call.body.reply_markup.inline_keyboard) && call.body.reply_markup.inline_keyboard.length === 0));
});
