const test = require('node:test');
const assert = require('node:assert/strict');

const topic = require('../api/topic-maintenance.cjs');
const proxy = require('../api/poster-proxy.js');

test('rewrites Mirage poster URLs through the production poster proxy', () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: -1001234567890,
      message_thread_id: 19,
      photo: 'https://cdn.mirage.ru/images/film/7000/small/p7451.jpg',
      caption: 'test',
    }),
  };
  const rewritten = topic.rewriteTelegramPhotoRequest('https://api.telegram.org/botTOKEN/sendPhoto', init);
  const payload = JSON.parse(rewritten.body);
  assert.match(payload.photo, /^https:\/\/spb-daily-guide-bot\.vercel\.app\/api\/poster-proxy\?url=/u);
  assert.match(decodeURIComponent(payload.photo), /cdn\.mirage\.ru\/images\/film\/7000\/small\/p7451\.jpg/u);
});

test('leaves unrelated Telegram photo URLs unchanged', () => {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: 1, message_thread_id: 19, photo: 'https://example.com/photo.jpg' }),
  };
  assert.equal(topic.rewriteTelegramPhotoRequest('https://api.telegram.org/botTOKEN/sendPhoto', init), init);
});

test('poster proxy allows only official cinema poster hosts', () => {
  assert.equal(proxy.validatePosterUrl('https://cdn.mirage.ru/images/film/7000/small/p7451.jpg'), 'https://cdn.mirage.ru/images/film/7000/small/p7451.jpg');
  assert.equal(proxy.validatePosterUrl('https://s1ru1.kinoplan24.ru/path/24436.jpg'), 'https://s1ru1.kinoplan24.ru/path/24436.jpg');
  assert.throws(() => proxy.validatePosterUrl('https://example.com/a.jpg'), /poster-host-not-allowed/u);
});
