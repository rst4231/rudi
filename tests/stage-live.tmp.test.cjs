const test = require('node:test');
const assert = require('node:assert/strict');
const { extractStagePosterUrl } = require('../api/stage-poster.cjs');

test('live Stage page maps Aug 26 event ids to two distinct source posters', { timeout: 20000 }, async () => {
  const response = await fetch('https://stagestandup.ru/', {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; RUDI-Stage-Live-Test/1.0)' },
  });
  assert.equal(response.ok, true, `Stage HTTP ${response.status}`);
  const html = await response.text();
  const first = extractStagePosterUrl(
    html,
    'https://stagestandup.ru/#ticketscloud:event=6a541f4aa852a67005892233&token=x',
  );
  const second = extractStagePosterUrl(
    html,
    'https://stagestandup.ru/#ticketscloud:event=69f2607a9aa0f07c93629c01&token=x',
  );
  console.log('RUDI_STAGE_LIVE_POSTERS', { first, second });
  assert.ok(first, 'poster for Проверка материала was not found');
  assert.ok(second, 'poster for Большой стендап was not found');
  assert.notEqual(first, second, 'Stage events resolved to the same poster');
  assert.match(first, /tildacdn\.(?:com|net)/i);
  assert.match(second, /tildacdn\.(?:com|net)/i);
});
