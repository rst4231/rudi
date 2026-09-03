const test = require('node:test');
const assert = require('node:assert/strict');

const cinema = require('../api/cinema-premieres.cjs');
const { fingerprintContent } = require('../api/content-fingerprint.cjs');
const { publishWeeklyCinemaPremieres } = require('../api/cinema-premieres-collage.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) ?? null; },
    async set(key, value) { map.set(key, value); return true; },
  };
}

test('Mirage collector accepts slugless official film links', () => {
  const rows = cinema.extractMirageFilmLinks(
    '<a href="/film/7537/">Мой папа — медведь 2</a>',
    'https://app.mirage.ru/',
  );
  assert.deepEqual(rows, [{ id: '7537', url: 'https://app.mirage.ru/film/7537/' }]);
});

test('Mirage parser keeps a dated premiere when the page lacks a recognized poster meta tag', () => {
  const row = cinema.parseMirageFilmPage(
    '<html><body><h1>Мой папа — медведь 2</h1><div>с 03 Сентября</div></body></html>',
    'https://app.mirage.ru/film/7537/',
    '2026-09-03',
    'Мираж Синема Санкт-Петербург',
  );
  assert.deepEqual(row, {
    title: 'Мой папа — медведь 2',
    posterUrl: 'https://cdn.mirage.ru/images/film/7000/small/p7537.jpg',
    source: 'Мираж Синема Санкт-Петербург',
    sourceUrl: 'https://app.mirage.ru/film/7537/',
  });
});

test('forced cinema repair bypasses same-date fingerprint history so a complete corrected digest can replace an incomplete one', async () => {
  const now = new Date('2026-09-02T21:30:00Z');
  const row = {
    title: 'Бегущая',
    posterUrl: 'https://cdn.mirage.ru/images/film/7000/big/s7534.jpg',
    source: 'Мираж Синема Санкт-Петербург',
    sourceUrl: 'https://app.mirage.ru/film/7534/beguschaya.htm',
  };
  const seenShape = {
    title: 'Бегущая',
    sources: ['Мираж Синема Санкт-Петербург'],
    sourceUrls: [{ name: 'Мираж Синема Санкт-Петербург', url: row.sourceUrl }],
    releaseDate: '2026-09-03',
  };
  const result = await publishWeeklyCinemaPremieres({
    now,
    force: true,
    config: {
      cinemaPremieres: {
        enabled: true,
        topicId: 705,
        maxItems: 12,
        kinopolis: { name: 'Кинополис Мурино', url: 'https://kinopolis.test/' },
        mirage: { name: 'Мираж Синема Санкт-Петербург', url: 'https://mirage.test/', fallbackUrls: [] },
      },
    },
    settings: { dedupe: { cinemaDays: 60 } },
    cache: memoryCache(),
    dedupeCache: memoryCache(),
    chatId: -1001,
    token: '1:test',
    loadKinopolis: async () => [],
    loadMirage: async () => [row],
    recordHealth: async (healthRow) => healthRow,
    ensureTopic: async () => ({ topicId: 705 }),
    buildCollage: async () => Buffer.from('fake'),
    sendCollage: async () => ({ messageId: 900 }),
    sendEmpty: async () => new Response('{"ok":true}', { status: 200 }),
    seenFingerprints: new Set([fingerprintContent('cinema', seenShape)]),
  });

  assert.equal(result.published, 1);
  assert.deepEqual(result.titles, ['Бегущая']);
});
