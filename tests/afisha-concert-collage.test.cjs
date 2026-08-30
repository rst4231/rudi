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

function memoryCache(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); return true; },
    async delete(key) { map.delete(key); return true; },
  };
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

test('post 768 repair recovers exact Yandex Afisha links from a temporary Telegram forward', async () => {
  const repair = require('../api/repair-event-post.js');
  assert.equal(typeof repair.readOriginalEventText, 'function');
  const yandexEvent = 'https://afisha.yandex.ru/saint-petersburg/concert/live-artist';
  const original = '🎤 Поп и хип-хоп концерты\n1. Live Artist\nПодробнее →';
  const linkText = 'Подробнее →';
  const calls = [];
  const telegramFetchImpl = async (url, init) => {
    const method = String(url).split('/').at(-1);
    calls.push(method);
    if (method === 'forwardMessage') {
      const payload = JSON.parse(init.body);
      assert.deepEqual(payload, {
        chat_id: -100123,
        message_thread_id: 19,
        from_chat_id: -100123,
        message_id: 768,
        disable_notification: true,
      });
      return response(JSON.stringify({
        ok: true,
        result: {
          message_id: 990,
          text: original,
          entities: [{
            type: 'text_link',
            offset: original.indexOf(linkText),
            length: linkText.length,
            url: yandexEvent,
          }],
        },
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (method === 'deleteMessage') {
      assert.deepEqual(JSON.parse(init.body), { chat_id: -100123, message_id: 990 });
      return response(JSON.stringify({ ok: true, result: true }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected Telegram method ${method}`);
  };

  const html = await repair.readOriginalEventText({
    token: 'TEST', chatId: -100123, topicId: 19, oldMessageId: 768, telegramFetchImpl,
  });

  assert.deepEqual(calls, ['forwardMessage', 'deleteMessage']);
  assert.match(html, /Поп и хип-хоп концерты/);
  assert.match(html, new RegExp(`<a href="${yandexEvent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">Подробнее →<\\/a>`));
});

test('one-time replacement records the new collage message for next-day topic cleanup', async () => {
  const repair = require('../api/repair-event-post.js');
  const recoveryCache = memoryCache();
  const topicCache = memoryCache();
  const result = await repair.runEventPostRepair({
    now: new Date('2026-08-30T06:00:00Z'),
    token: 'TEST',
    chatId: -100123,
    concertText: '<b>🎤 Поп и хип-хоп концерты</b>\n<a href="https://afisha.yandex.ru/saint-petersburg/concert/live">Подробнее →</a>',
    cache: recoveryCache,
    topicCache,
    replaceEventMessage: async () => ({ oldMessageId: 768, newMessageId: 902, topicId: 19 }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(await topicCache.get('topic:19:2026-08-30:messages'), [902]);
  assert.equal(await topicCache.get('topic:19:chat-id'), -100123);
});
