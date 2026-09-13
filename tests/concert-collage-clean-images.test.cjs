const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  extractPosterUrl,
  maybeSendEventCollage,
} = require('../api/event-collage.cjs');

function response(body, options = {}) {
  return new Response(body, { status: 200, ...options });
}

const svg = (fill, width = 800, height = 400) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/></svg>`,
);

test('Yandex Afisha extraction prefers the real event image over the branded social preview', () => {
  const branded = 'https://avatars.mds.yandex.net/get-afishanew/social-card/orig';
  const real = 'https://avatars.mds.yandex.net/get-afishanew/unlockfest-photo/orig';
  const html = [
    '<html><head>',
    `<meta property="og:image" content="${branded}">`,
    '</head><body>',
    `<img alt="Unlockfest" src="${real}">`,
    '</body></html>',
  ].join('');

  assert.equal(
    extractPosterUrl(html, 'https://afisha.yandex.ru/saint-petersburg/party/unlockfest'),
    real,
  );
});

test('concert collage uses compact cover tiles without large black letterboxing', async () => {
  const eventUrl = 'https://afisha.yandex.ru/saint-petersburg/concert/test-artist';
  const posterUrl = 'https://avatars.mds.yandex.net/get-afishanew/test-artist/orig';
  let sentPhoto = null;

  const fetchImpl = async (url) => {
    const key = String(url);
    if (key === eventUrl) {
      return response(`<meta property="og:image" content="${posterUrl}">`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (key === posterUrl) {
      return response(svg('#22cc66'), { headers: { 'content-type': 'image/svg+xml' } });
    }
    throw new Error(`unexpected fetch ${key}`);
  };

  const telegramFetchImpl = async (url, init) => {
    assert.match(String(url), /\/sendPhoto$/);
    sentPhoto = init.body.get('photo');
    return response(JSON.stringify({ ok: true, result: { message_id: 990 } }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  const text = [
    '<b>🎤 Поп и хип-хоп концерты</b>',
    '1. Test Artist',
    `<a href="${eventUrl}">Подробнее →</a>`,
  ].join('\n');

  const result = await maybeSendEventCollage(
    'https://api.telegram.org/botTEST/sendMessage',
    { method: 'POST', body: JSON.stringify({ chat_id: -100123, message_thread_id: 19, text, parse_mode: 'HTML' }) },
    { fetchImpl, telegramFetchImpl },
  );

  assert.ok(result);
  assert.ok(sentPhoto instanceof Blob);
  const photo = Buffer.from(await sentPhoto.arrayBuffer());
  const { data, info } = await sharp(photo).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 480);
  assert.equal(info.height, 360);

  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return Array.from(data.subarray(offset, offset + 3));
  };
  const top = pixel(Math.floor(info.width / 2), 3);
  const bottom = pixel(Math.floor(info.width / 2), info.height - 4);
  assert.ok(top[1] > 120, `top edge should be image content, got ${top.join(',')}`);
  assert.ok(bottom[1] > 120, `bottom edge should be image content, got ${bottom.join(',')}`);
});
