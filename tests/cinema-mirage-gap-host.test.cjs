const test = require('node:test');
const assert = require('node:assert/strict');

const { loadMiragePremieres } = require('../api/cinema-premieres.cjs');
const { validateEventsConfig } = require('../api/events-config.cjs');

function response(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

test('Mirage gap recovery uses configured detail host instead of the listing host', async () => {
  const listingUrl = 'https://app.mirage.ru/';
  const detailBaseUrl = 'https://sml.mirage.ru/';
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value === listingUrl) {
      return response('<a href="/film/7538/toni.htm">Тони</a><a href="/film/7540/mult.htm">МУЛЬТ</a>');
    }
    if (value === 'https://sml.mirage.ru/film/7539/') {
      return response('<h1>Турбулентность</h1><div>с 03 Сентября</div>');
    }
    if (value.includes('/film/7538/') || value.includes('/film/7540/')) {
      return response('<h1>Не сегодня</h1><div>с 10 Сентября</div>');
    }
    return response('not found', 404);
  };

  const rows = await loadMiragePremieres('2026-09-03', {
    name: 'Мираж Синема Санкт-Петербург',
    url: listingUrl,
    scanRecentIdGaps: true,
    gapProbeBaseUrl: detailBaseUrl,
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.ok(calls.includes('https://sml.mirage.ru/film/7539/'));
  assert.equal(calls.includes('https://app.mirage.ru/film/7539/'), false);
  assert.deepEqual(rows.map((row) => row.title), ['Турбулентность']);
  assert.equal(rows[0].sourceUrl, 'https://sml.mirage.ru/film/7539/');
});

test('events config preserves a remote-editable Mirage gap probe host', () => {
  const config = validateEventsConfig({
    version: 11,
    blockedVenueTokens: ['test venue'],
    cinemaPremieres: {
      mirage: {
        name: 'Мираж Синема Санкт-Петербург',
        url: 'https://app.mirage.ru/',
        gapProbeBaseUrl: 'https://sml.mirage.ru/',
      },
      kinopolis: {
        name: 'Кинополис Мурино',
        url: 'https://sky.kinopolis-film.ru/',
      },
    },
  });

  assert.equal(config.cinemaPremieres.mirage.gapProbeBaseUrl, 'https://sml.mirage.ru/');
});
