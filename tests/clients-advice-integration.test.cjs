const test = require('node:test');
const assert = require('node:assert/strict');
const { handleTelegramTopicRequest } = require('../api/topic-maintenance.cjs');

const config = [{ title: 'B2B', body: 'Для компаний', action: 'Собери оффер' }];

function telegramResponse(result, status = 200) {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function memoryCache() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, value); return true; },
    async delete(key) { values.delete(key); return true; },
  };
}

test('legacy clients guard queues rewritten expert advice for Diana instead of forum API', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return telegramResponse({ message_id: 1 });
  };
  const configFetchImpl = async () => new Response(JSON.stringify(config), { status: 200 });
  const text = '👥 <b>Клиенты для стилиста</b>\n\nРеальные лиды\n\n💡 <b>Совет Диане от маркетолога</b>\n\n<b>Где искать:</b> YouDo';

  const forDiCache = memoryCache();
  await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:test/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100, message_thread_id: 126, text }) },
    { fetchImpl, configFetchImpl, forDiCache, now: new Date('2026-08-31T10:00:00Z'), clientsAdviceLocalConfig: config },
  );

  assert.equal(calls.length, 0);
  const queued = await forDiCache.get('for-di:messages:2026-08-31');
  assert.equal(queued.length, 1);
  assert.match(queued[0].text, /Развитие для стилиста с 8-летним опытом/);
  assert.match(queued[0].text, /B2B/);
  assert.doesNotMatch(queued[0].text, /YouDo/);
});

test('existing production guard still suppresses arbitrary content in clients topic', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return telegramResponse({ message_id: 1 }); };
  await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:test/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100, message_thread_id: 126, text: 'random' }) },
    { fetchImpl, clientsAdviceLocalConfig: config },
  );
  assert.equal(calls, 0);
});
