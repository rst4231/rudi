const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  compactEventCaption,
  compactEventTelegramRequest,
} = require('../api/event-text-sanitizer.cjs');
const {
  extractEventSourceLinks,
  extractMetaImage,
  collectEventImages,
  maybeSendEventImages,
} = require('../api/event-images.cjs');

const root = path.join(__dirname, '..');

test('concert digest keeps compact text while image enrichment is handled separately', () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -100123,
      message_thread_id: 19,
      text: '<b>🎤 Поп и хип-хоп концерты</b>\n\n\n📅 Среда, 26 августа\n\n\n1. Концерт',
      parse_mode: 'HTML',
    }),
  };
  const compacted = compactEventTelegramRequest(init);
  assert.equal(
    JSON.parse(compacted.body).text,
    '<b>🎤 Поп и хип-хоп концерты</b>\n📅 Среда, 26 августа\n\n1. Концерт',
  );
});

test('Stage digest removes price and hall duplication before image enrichment', () => {
  const source = [
    '<b>🎙 Stage StandUp Club</b>',
    '📅 Суббота, 29 августа',
    'Найдено событий/сеансов: 2',
    '<b>1. Два феникса / Офлайн подкаст</b>',
    '📍 Stage StandUp Club | Черный зал |, ул. Восстания, 24/27 Б',
    '💳 стоимость уточняйте на странице билетов · 18+',
    '<b>2. Динара Курбанова / Стендап-концерт</b>',
    '📍 Stage StandUp Club | Красный зал, ул. Восстания, 24/27Б',
    '💳 стоимость уточняйте на странице билетов · 18+',
  ].join('\n');

  const text = compactEventCaption(source);
  assert.doesNotMatch(text, /стоимость уточняйте/u);
  assert.doesNotMatch(text, /Черный зал|Красный зал/u);
  assert.equal((text.match(/📍/gu) || []).length, 1);
});

test('event image helper reads source links and og:image from the actual event pages', async () => {
  const text = [
    '<b>🎙 Stage StandUp Club</b>',
    '<a href="https://events.example/one">Официальная страница →</a>',
    '<a href="https://events.example/two">Официальная страница →</a>',
  ].join('\n');
  assert.deepEqual(extractEventSourceLinks(text), [
    'https://events.example/one',
    'https://events.example/two',
  ]);
  assert.equal(
    extractMetaImage('<meta property="og:image" content="/poster.jpg">', 'https://events.example/one'),
    'https://events.example/poster.jpg',
  );

  const fetchImpl = async (url) => new Response(
    `<meta property="og:image" content="${url.endsWith('/one') ? '/one.jpg' : '/two.jpg'}">`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  );
  const rows = await collectEventImages(text, { fetchImpl });
  assert.deepEqual(rows.map((row) => row.imageUrl), [
    'https://events.example/one.jpg',
    'https://events.example/two.jpg',
  ]);
});

test('event digest sends image album before preserving the full text post', async () => {
  const calls = [];
  const text = [
    '<b>🎤 Поп и хип-хоп концерты</b>',
    '<a href="https://events.example/one">Подробнее →</a>',
    '<a href="https://events.example/two">Подробнее →</a>',
  ].join('\n');
  const result = await maybeSendEventImages(
    'https://api.telegram.org/botTOKEN/sendMessage',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: -1001, message_thread_id: 19, text }),
    },
    {
      fetchImpl: async (url) => new Response(
        `<meta property="og:image" content="${url.endsWith('/one') ? '/one.jpg' : '/two.jpg'}">`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
      sendTelegram: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  );
  assert.equal(result.mode, 'album');
  assert.equal(result.sent, 2);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /sendMediaGroup$/u);
  assert.equal(calls[0].body.media.length, 2);
});

test('runtime wrapper enriches event posts with images without replacing text publication', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
  assert.match(source, /event-images\.cjs/u);
  assert.match(source, /maybeSendEventImages\(input, nextInit/u);
  assert.match(source, /return handleTelegramTopicRequest\(input, nextInit/u);
  assert.match(source, /compactEventTelegramRequest/u);
});
