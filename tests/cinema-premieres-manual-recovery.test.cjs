const test = require('node:test');
const assert = require('node:assert/strict');

const { loadMiragePremieres } = require('../api/cinema-premieres.cjs');
const { buildCinemaCollage } = require('../api/cinema-collage.cjs');
const { publishWeeklyCinemaPremieres } = require('../api/cinema-premieres-collage.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) ?? null; },
    async set(key, value) { map.set(key, value); return true; },
  };
}

test('manualByDate fills a verified premiere missing from live cinema sources even without a poster URL', async () => {
  const result = await publishWeeklyCinemaPremieres({
    now: new Date('2026-09-02T21:30:00Z'),
    force: true,
    config: {
      cinemaPremieres: {
        enabled: true,
        topicId: 705,
        maxItems: 12,
        kinopolis: { name: 'Кинополис Мурино', url: 'https://kinopolis.test/' },
        mirage: { name: 'Мираж Синема Санкт-Петербург', url: 'https://mirage.test/', fallbackUrls: [] },
        manualByDate: {
          '2026-09-03': [{
            title: 'Турбулентность',
            posterUrl: null,
            source: 'Мираж Синема Санкт-Петербург',
            sourceUrl: 'https://www.portal.mirage.ru/spb/',
          }],
        },
      },
    },
    cache: memoryCache(),
    dedupeCache: memoryCache(),
    chatId: -1001,
    token: '1:test',
    loadKinopolis: async () => [],
    loadMirage: async () => [],
    recordHealth: async (row) => row,
    ensureTopic: async () => ({ topicId: 705 }),
    buildCollage: async (rows) => {
      assert.deepEqual(rows.map((row) => row.title), ['Турбулентность']);
      return Buffer.from('fake');
    },
    sendCollage: async () => ({ messageId: 901 }),
    sendEmpty: async () => ({ messageId: 902 }),
    seenFingerprints: new Set(),
  });

  assert.equal(result.published, 1);
  assert.deepEqual(result.titles, ['Турбулентность']);
});

test('cinema collage renders a fallback tile for a verified manual premiere without a poster URL', async () => {
  const image = await buildCinemaCollage([{ title: 'Турбулентность', posterUrl: null }], {
    tileWidth: 180,
    tileHeight: 270,
  });
  assert.ok(Buffer.isBuffer(image));
  assert.ok(image.length > 100);
});

test('Mirage loader retries a film detail page that failed during the parallel pass', async () => {
  let secondFilmCalls = 0;
  const listing = [
    '<a href="/film/1/odin.htm">Один</a>',
    '<a href="/film/2/dva.htm">Два</a>',
  ].join('');
  const film = (id, title) => `<html><body><h1>${title}</h1><div>с 03 Сентября</div><img src="https://cdn.mirage.ru/images/film/7000/big/s${id}.jpg"></body></html>`;

  const fetchImpl = async (url) => {
    const value = String(url);
    if (value === 'https://mirage.test/') return new Response(listing, { status: 200 });
    if (value === 'https://mirage.test/film/1/odin.htm') return new Response(film(1, 'Один'), { status: 200 });
    if (value === 'https://mirage.test/film/2/dva.htm') {
      secondFilmCalls += 1;
      if (secondFilmCalls === 1) throw new TypeError('transient detail failure');
      return new Response(film(2, 'Два'), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  const rows = await loadMiragePremieres('2026-09-03', {
    name: 'Мираж Синема Санкт-Петербург',
    url: 'https://mirage.test/',
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.equal(secondFilmCalls, 2);
  assert.deepEqual(rows.map((row) => row.title).sort(), ['Два', 'Один']);
});
