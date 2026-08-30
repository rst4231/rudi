const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  maybeSendEventCollage,
  replaceEventMessage,
} = require('../api/event-collage.cjs');

function response(body, options = {}) {
  return new Response(body, { status: 200, ...options });
}

const svg = (label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="white"/><text x="30" y="80" font-size="42">${label}</text></svg>`);

test('pop and hip-hop digest builds a collage only from Yandex Afisha event posters', async () => {
  const yandexEvent = 'https://afisha.yandex.ru/saint-petersburg/concert/artist-one';
  const unrelatedEvent = 'https://artist.example/show';
  const yandexPoster = 'https://avatars.mds.yandex.net/get-afishanew/artist-one/orig';
  const fetched = [];
  const telegramCalls = [];

  const fetchImpl = async (url) => {
    const key = String(url);
    fetched.push(key);
    if (key === yandexEvent) return response(`<meta property="og:image" content="${yandexPoster}">`, { headers: { 'content-type': 'text/html' } });
    if (key === yandexPoster) return response(svg('AFISHA'), { headers: { 'content-type': 'image/svg+xml' } });
    if (key === unrelatedEvent) throw new Error('non-Afisha source must not be fetched');
    throw new Error(`unexpected fetch ${key}`);
  };
  const telegramFetchImpl = async (url, init) => {
    telegramCalls.push({ url: String(url), init });
    return response(JSON.stringify({ ok: true, result: { message_id: 900 } }), { headers: { 'content-type': 'application/json' } });
  };

  const text = [
    '<b>🎤 Поп и хип-хоп концерты</b>',
    '📅 Воскресенье, 30 августа',
    '',
    '1. Артист один',
    `<a href="${yandexEvent}">Подробнее →</a>`,
    '',
    '2. Ссылка не с Афиши',
    `<a href="${unrelatedEvent}">Официальная страница →</a>`,
  ].join('\n');

  const result = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    {
      method: 'POST',
      body: JSON.stringify({ chat_id: -100123, message_thread_id: 19, text, parse_mode: 'HTML' }),
    },
    { fetchImpl, telegramFetchImpl },
  );

  assert.ok(result);
  assert.deepEqual(fetched, [yandexEvent, yandexPoster]);
  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0].url, /\/sendPhoto$/);
  assert.ok(telegramCalls[0].init.body.get('photo') instanceof Blob);
});

test('event replacement publishes the collage before deleting the old text post', async () => {
  assert.equal(typeof replaceEventMessage, 'function');
  const calls = [];
  const yandexEvent = 'https://afisha.yandex.ru/saint-petersburg/concert/artist-two';
  const yandexPoster = 'https://avatars.mds.yandex.net/get-afishanew/artist-two/orig';
  const text = `<b>🎤 Поп и хип-хоп концерты</b>\n1. Артист два\n<a href="${yandexEvent}">Подробнее →</a>`;

  const fetchImpl = async (url) => {
    const key = String(url);
    if (key === yandexEvent) return response(`<meta property="og:image" content="${yandexPoster}">`, { headers: { 'content-type': 'text/html' } });
    if (key === yandexPoster) return response(svg('TWO'), { headers: { 'content-type': 'image/svg+xml' } });
    throw new Error(`unexpected fetch ${key}`);
  };
  const telegramFetchImpl = async (url, init) => {
    const key = String(url);
    calls.push(key.includes('/sendPhoto') ? 'sendPhoto' : key.includes('/deleteMessage') ? 'deleteMessage' : key);
    if (key.includes('/sendPhoto')) return response(JSON.stringify({ ok: true, result: { message_id: 901 } }), { headers: { 'content-type': 'application/json' } });
    if (key.includes('/deleteMessage')) {
      assert.deepEqual(JSON.parse(init.body), { chat_id: -100123, message_id: 768 });
      return response(JSON.stringify({ ok: true, result: true }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected telegram call ${key}`);
  };

  const result = await replaceEventMessage({
    token: 'TEST', chatId: -100123, topicId: 19, oldMessageId: 768, text, fetchImpl, telegramFetchImpl,
  });

  assert.deepEqual(calls, ['sendPhoto', 'deleteMessage']);
  assert.equal(result.newMessageId, 901);
  assert.equal(result.oldMessageId, 768);
});

test('one-time post 768 repair endpoint exists and is date/key guarded', async () => {
  const endpointPath = path.join(__dirname, '..', 'api', 'repair-event-post.js');
  assert.equal(fs.existsSync(endpointPath), true, 'repair endpoint must exist before post 768 can be replaced');
  const repair = require(endpointPath);
  assert.equal(typeof repair.runEventPostRepair, 'function');
  assert.equal(typeof repair.securelyMatchesRepairKey, 'function');
  assert.equal(repair.REPAIR_DATE, '2026-08-30');
  assert.equal(repair.OLD_MESSAGE_ID, 768);
  assert.equal(repair.securelyMatchesRepairKey('wrong-key'), false);
});
