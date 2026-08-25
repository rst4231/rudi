const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractStagePosterUrl,
  fetchEventPoster,
} = require('../api/event-collage.cjs');

function response(body, options = {}) {
  return new Response(body, { status: 200, ...options });
}

const stageHtml = `
<html>
  <head><meta property="og:image" content="https://static.tildacdn.com/generic-stage-cover.jpg"></head>
  <body>
    <div class="event-card">
      <div class="t-bgimg" data-original="https://static.tildacdn.com/previous.jpg"></div>
      <a href="#ticketscloud:event=previous-event&token=abc">Купить билет</a>
    </div>
    <div class="event-card">
      <div class="t-bgimg" data-original="https://static.tildacdn.com/proverka-materiala.jpg"></div>
      <a href="#ticketscloud:event=6a541f4aa852a67005892233&token=abc">Купить билет</a>
    </div>
    <div class="event-card">
      <div class="t-bgimg" data-original="https://static.tildacdn.com/bolshoi-standup.jpg"></div>
      <a href="#ticketscloud:event=69f2607a9aa0f07c93629c01&token=abc">Купить билет</a>
    </div>
  </body>
</html>`;

test('Stage fragment event id resolves the matching card poster instead of the page og:image', () => {
  assert.equal(
    extractStagePosterUrl(
      stageHtml,
      'https://stagestandup.ru/#ticketscloud:event=6a541f4aa852a67005892233&token=abc',
    ),
    'https://static.tildacdn.com/proverka-materiala.jpg',
  );
  assert.equal(
    extractStagePosterUrl(
      stageHtml,
      'https://stagestandup.ru/#ticketscloud:event=69f2607a9aa0f07c93629c01&token=abc',
    ),
    'https://static.tildacdn.com/bolshoi-standup.jpg',
  );
});

test('fetchEventPoster downloads the Stage card poster selected by fragment event id', async () => {
  const wanted = 'https://static.tildacdn.com/proverka-materiala.jpg';
  const calls = [];
  const fetchImpl = async (url) => {
    const key = String(url);
    calls.push(key);
    if (key.startsWith('https://stagestandup.ru/')) {
      return response(stageHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (key === wanted) {
      return response(Buffer.from('poster-bytes'), { headers: { 'content-type': 'image/jpeg' } });
    }
    throw new Error(`unexpected fetch ${key}`);
  };

  const poster = await fetchEventPoster(
    'https://stagestandup.ru/#ticketscloud:event=6a541f4aa852a67005892233&token=abc',
    { fetchImpl },
  );

  assert.equal(poster.toString(), 'poster-bytes');
  assert.ok(calls.includes(wanted));
  assert.ok(!calls.includes('https://static.tildacdn.com/generic-stage-cover.jpg'));
});
