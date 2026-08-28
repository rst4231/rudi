const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractPosterUrl,
  extractEventLinks,
  compactEventCaption,
  compactEventTelegramRequest,
  buildEventCollage,
  maybeSendEventCollage,
} = require('../api/event-collage.cjs');

function response(body, options = {}) {
  return new Response(body, { status: 200, ...options });
}

const svg = (label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="white"/><text x="30" y="80" font-size="42">${label}</text></svg>`);

test('extractPosterUrl prefers a real page poster and resolves relative URLs', () => {
  const html = '<html><head><meta property="og:image" content="/media/posters/show.jpg"></head></html>';
  assert.equal(
    extractPosterUrl(html, 'https://stage-standup.ru/events/big-show'),
    'https://stage-standup.ru/media/posters/show.jpg',
  );
});

test('extractEventLinks reads event source links from Telegram HTML', () => {
  const text = [
    '<b>🎤 Поп и хип-хоп концерты</b>',
    '<a href="https://afisha.yandex.ru/saint-petersburg/concert/test">Подробнее →</a>',
    '<a href="https://stage-standup.ru/event/123">Официальная страница →</a>',
  ].join('\n');
  assert.deepEqual(extractEventLinks(text), [
    'https://afisha.yandex.ru/saint-petersburg/concert/test',
    'https://stage-standup.ru/event/123',
  ]);
});

test('compactEventCaption removes the huge vertical gaps from event posts', () => {
  const text = '<b>🎙 Stage StandUp Club</b>\n\n\n📅 Вторник, 25 августа\n\n\nНайдено: 2\n\n\n1. Большой стендап';
  const compact = compactEventCaption(text);
  assert.equal(compact, '<b>🎙 Stage StandUp Club</b>\n📅 Вторник, 25 августа\nНайдено: 2\n1. Большой стендап');
});

test('compactEventTelegramRequest also removes gaps when a collage cannot be built', () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -100123,
      text: '<b>🎤 Поп и хип-хоп концерты</b>\n\n\n📅 Среда, 26 августа\n\n\nКонцертов не найдено.',
      parse_mode: 'HTML',
    }),
  };
  const compacted = compactEventTelegramRequest(init);
  assert.notEqual(compacted, init);
  assert.equal(
    JSON.parse(compacted.body).text,
    '<b>🎤 Поп и хип-хоп концерты</b>\n📅 Среда, 26 августа\nКонцертов не найдено.',
  );
});

test('buildEventCollage combines downloaded poster images into one jpeg', async () => {
  const images = [svg('ONE'), svg('TWO'), svg('THREE')];
  const result = await buildEventCollage(images);
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result[0], 0xff);
  assert.equal(result[1], 0xd8);
});

test('buildEventCollage keeps the full poster visible instead of cropping its edges', async () => {
  const sharp = require('sharp');
  const poster = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="white"/><rect width="100" height="30" fill="#00ff00"/><rect y="270" width="100" height="30" fill="#ff0000"/></svg>');
  const result = await buildEventCollage([poster], { tileWidth: 120, tileHeight: 180, gap: 0 });
  const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return Array.from(data.subarray(offset, offset + 3));
  };

  const top = pixel(60, 4);
  const bottom = pixel(60, 175);
  assert.ok(top[1] > 150 && top[0] < 120, `top edge was cropped: ${top.join(',')}`);
  assert.ok(bottom[0] > 150 && bottom[1] < 120, `bottom edge was cropped: ${bottom.join(',')}`);
});

test('maybeSendEventCollage converts concert and Stage sendMessage calls to one photo post using source-site posters', async () => {
  const eventText = [
    '<b>🎙 Stage StandUp Club</b>',
    '',
    '',
    '📅 Вторник, 25 августа',
    '',
    '',
    '1. Большой стендап',
    '<a href="https://stage-standup.ru/event/one">Официальная страница →</a>',
    '',
    '',
    '2. Проверочный концерт',
    '<a href="https://afisha.yandex.ru/saint-petersburg/concert/two">Подробнее →</a>',
  ].join('\n');

  const pageHtml = new Map([
    ['https://stage-standup.ru/event/one', '<meta property="og:image" content="https://stage-standup.ru/img/one.jpg">'],
    ['https://afisha.yandex.ru/saint-petersburg/concert/two', '<meta property="og:image" content="https://avatars.mds.yandex.net/get-afishanew/two/orig">'],
  ]);
  const imageBodies = new Map([
    ['https://stage-standup.ru/img/one.jpg', svg('ONE')],
    ['https://avatars.mds.yandex.net/get-afishanew/two/orig', svg('TWO')],
  ]);

  const fetchImpl = async (url) => {
    const key = String(url);
    if (pageHtml.has(key)) return response(pageHtml.get(key), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (imageBodies.has(key)) return response(imageBodies.get(key), { headers: { 'content-type': 'image/svg+xml' } });
    throw new Error(`unexpected fetch ${key}`);
  };

  const telegramCalls = [];
  const telegramFetchImpl = async (url, init) => {
    telegramCalls.push({ url: String(url), init });
    return response(JSON.stringify({ ok: true, result: { message_id: 777 } }), { headers: { 'content-type': 'application/json' } });
  };

  const result = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: -100123,
        message_thread_id: 19,
        text: eventText,
        parse_mode: 'HTML',
        disable_notification: true,
      }),
    },
    { fetchImpl, telegramFetchImpl },
  );

  assert.ok(result);
  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0].url, /\/sendPhoto$/);
  const body = telegramCalls[0].init.body;
  assert.equal(body.get('chat_id'), '-100123');
  assert.equal(body.get('message_thread_id'), '19');
  assert.equal(body.get('parse_mode'), 'HTML');
  assert.equal(body.get('disable_notification'), 'true');
  assert.ok(body.get('photo') instanceof Blob);
  assert.doesNotMatch(body.get('caption'), /\n{2,}/);
  assert.match(body.get('caption'), /Большой стендап/);
});

test('maybeSendEventCollage keeps a collage post when the original event text is longer than Telegram photo caption limit', async () => {
  const sourceUrl = 'https://stage-standup.ru/event/long';
  const eventText = [
    '<b>🎙 Stage StandUp Club</b>',
    '📅 Среда, 26 августа',
    ...Array.from({ length: 35 }, (_, index) => `${index + 1}. Очень длинное описание события номер ${index + 1} с площадкой, временем, стоимостью и дополнительными подробностями`),
    `<a href="${sourceUrl}">Официальная страница →</a>`,
  ].join('\n');
  const telegramCalls = [];
  const fetchImpl = async (url) => {
    const key = String(url);
    if (key === sourceUrl) return response('<meta property="og:image" content="https://stage-standup.ru/img/long.jpg">');
    if (key === 'https://stage-standup.ru/img/long.jpg') return response(svg('LONG'), { headers: { 'content-type': 'image/svg+xml' } });
    throw new Error(`unexpected fetch ${key}`);
  };
  const telegramFetchImpl = async (url, init) => {
    telegramCalls.push({ url: String(url), init });
    return response(JSON.stringify({ ok: true, result: { message_id: 781 } }), { headers: { 'content-type': 'application/json' } });
  };

  const result = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    {
      method: 'POST',
      body: JSON.stringify({ chat_id: -100123, message_thread_id: 19, text: eventText, parse_mode: 'HTML' }),
    },
    { fetchImpl, telegramFetchImpl },
  );

  assert.ok(result);
  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0].url, /sendPhoto$/);
  const caption = telegramCalls[0].init.body.get('caption');
  assert.ok(caption.length < eventText.length);
  assert.match(caption, /Stage StandUp Club/);
});

test('maybeSendEventCollage leaves the original text path untouched when source posters are unavailable', async () => {
  const result = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: -100123,
        message_thread_id: 19,
        text: '<b>🎤 Поп и хип-хоп концерты</b>\n<a href="https://example.com/event">Подробнее →</a>',
        parse_mode: 'HTML',
      }),
    },
    {
      fetchImpl: async () => response('<html><head></head><body>no image</body></html>'),
      telegramFetchImpl: async () => { throw new Error('must not send photo'); },
    },
  );
  assert.equal(result, null);
});
