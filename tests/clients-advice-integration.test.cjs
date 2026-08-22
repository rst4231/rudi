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

test('legacy clients guard validates first and new expert advice is injected only before Telegram API', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return telegramResponse({ message_id: 1 });
  };
  const configFetchImpl = async () => new Response(JSON.stringify(config), { status: 200 });
  const text = '👥 <b>Клиенты для стилиста</b>\n\nРеальные лиды\n\n💡 <b>Совет Диане от маркетолога</b>\n\n<b>Где искать:</b> YouDo';

  await handleTelegramTopicRequest(
    'https://api.telegram.org/bot1:test/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100, message_thread_id: 126, text }) },
    { fetchImpl, configFetchImpl, now: new Date('2026-08-31T10:00:00Z'), clientsAdviceLocalConfig: config },
  );

  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].init.body).text;
  assert.match(sent, /Развитие для стилиста с 8-летним опытом/);
  assert.match(sent, /B2B/);
  assert.doesNotMatch(sent, /YouDo/);
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
