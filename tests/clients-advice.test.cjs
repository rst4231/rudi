const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectAdviceForDate,
  formatClientsAdvice,
  loadClientsAdviceConfig,
  rewriteClientsTelegramRequest,
  rewriteClientsPreviewPayload,
} = require('../api/clients-advice.cjs');

const config = Array.from({ length: 12 }, (_, i) => ({ title: `Тема ${i + 1}`, body: `Тело ${i + 1}`, action: `Действие ${i + 1}` }));

test('rotation is continuous across month boundary', () => {
  const aug31 = selectAdviceForDate(config, new Date('2026-08-31T10:00:00Z'));
  const sep01 = selectAdviceForDate(config, new Date('2026-09-01T10:00:00Z'));
  const i1 = config.indexOf(aug31);
  const i2 = config.indexOf(sep01);
  assert.equal(i2, (i1 + 1) % config.length);
});

test('formatted advice is advanced and does not contain old marketing marker', () => {
  const text = formatClientsAdvice(config[0]);
  assert.match(text, /Развитие для стилиста с 8-летним опытом/);
  assert.match(text, /Тема 1/);
  assert.doesNotMatch(text, /Совет.*от маркетолога/i);
  assert.doesNotMatch(text, /YouDo/i);
});

test('remote config is preferred and local config is fallback', async () => {
  const remote = [{ title: 'Remote', body: 'B', action: 'A' }];
  const loaded = await loadClientsAdviceConfig({ fetchImpl: async () => new Response(JSON.stringify(remote), { status: 200 }), localConfig: config });
  assert.deepEqual(loaded, remote);
  const fallback = await loadClientsAdviceConfig({ fetchImpl: async () => { throw new Error('offline'); }, localConfig: config });
  assert.equal(fallback.length, 12);
});

test('Telegram client message is rewritten only after old marker survived production sanitizer', async () => {
  const original = { method: 'POST', body: JSON.stringify({ chat_id: -100, message_thread_id: 126, text: '💡 <b>Совет Диане от маркетолога</b>\n\n<b>Где искать:</b> YouDo' }) };
  const rewritten = await rewriteClientsTelegramRequest('https://api.telegram.org/bot1:test/sendMessage', original, {
    fetchImpl: async () => new Response(JSON.stringify(config), { status: 200 }),
    now: new Date('2026-08-31T10:00:00Z'),
    localConfig: config,
  });
  const payload = JSON.parse(rewritten.body);
  assert.equal(payload.message_thread_id, 126);
  assert.match(payload.text, /Развитие для стилиста с 8-летним опытом/);
  assert.doesNotMatch(payload.text, /YouDo/);

  const other = { method: 'POST', body: JSON.stringify({ chat_id: -100, message_thread_id: 19, text: 'event' }) };
  assert.equal(await rewriteClientsTelegramRequest('https://api.telegram.org/bot1:test/sendMessage', other, { localConfig: config }), other);
});

test('preview keeps lead section but replaces old advice block', async () => {
  const payload = { results: { clients: { preview: { message: '👥 <b>Клиенты для стилиста</b>\n\nНайдено: 2\n\n💡 <b>Совет Диане от маркетолога</b>\n\n<b>Где искать:</b> YouDo' } } } };
  const result = await rewriteClientsPreviewPayload(payload, {
    fetchImpl: async () => new Response(JSON.stringify(config), { status: 200 }),
    now: new Date('2026-08-31T10:00:00Z'),
    localConfig: config,
  });
  const text = result.results.clients.preview.message;
  assert.match(text, /Найдено: 2/);
  assert.match(text, /Развитие для стилиста с 8-летним опытом/);
  assert.doesNotMatch(text, /YouDo/);
});
