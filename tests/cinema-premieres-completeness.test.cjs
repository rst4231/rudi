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

test('Mirage loader treats a configured direct film URL as the film item itself', async () => {
  const filmUrl = 'https://sml.mirage.ru/film/7539/';
  const page = '<html><body><h1>Турбулентность</h1><div>с 03 Сентября</div></body></html>';
  const fetchImpl = async (url) => {
    assert.equal(String(url), filmUrl);
    return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
  };

  const rows = await cinema.loadMiragePremieres('2026-09-03', {
    name: 'Мираж Синема Санкт-Петербург',
    url: filmUrl,
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.deepEqual(rows.map((row) => row.title), ['Турбулентность']);
  assert.equal(rows[0].posterUrl, 'https://cdn.mirage.ru/images/film/7000/small/p7539.jpg');
});

test('Mirage loader probes missing ids between recent linked films when gap scanning is enabled', async () => {
  const listingUrl = 'https://app.mirage.ru/';
  const listing = [
    '<a href="/film/7538/toni-.htm">Тони</a>',
    '<a href="/film/7540/mult-v-kino-.htm">МУЛЬТ</a>',
  ].join('');
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value === listingUrl) return new Response(listing, { status: 200 });
    if (value.endsWith('/film/7539/')) {
      return new Response('<h1>Турбулентность</h1><div>с 03 Сентября</div>', { status: 200 });
    }
    if (value.includes('/film/7538/') || value.includes('/film/7540/')) {
      return new Response('<h1>Другой фильм</h1><div>с 10 Сентября</div>', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  const rows = await cinema.loadMiragePremieres('2026-09-03', {
    name: 'Мираж Синема Санкт-Петербург',
    url: listingUrl,
    scanRecentIdGaps: true,
  }, { fetchImpl, attempts: 1, timeoutMs: 1000 });

  assert.deepEqual(rows.map((row) => row.title), ['Турбулентность']);
  assert.equal(rows[0].sourceUrl, 'https://app.mirage.ru/film/7539/');
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

test('Mirage parser prefers the official portrait poster over horizontal big artwork', () => {
  const row = cinema.parseMirageFilmPage(
    '<html><head><meta property="og:image" content="https://cdn.mirage.ru/images/film/7000/big/s7534.jpg"></head><body><h1>Бегущая</h1><div>с 03 Сентября</div><img src="https://cdn.mirage.ru/images/film/7000/big/s7534.jpg"></body></html>',
    'https://app.mirage.ru/film/7534/beguschaya.htm',
    '2026-09-03',
    'Мираж Синема Санкт-Петербург',
  );
  assert.equal(row.posterUrl, 'https://cdn.mirage.ru/images/film/7000/small/p7534.jpg');
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

test('forced cinema replacement deletes the old post only after the corrected post is sent', async () => {
  const order = [];
  const row = {
    title: 'Турбулентность',
    posterUrl: 'https://cdn.mirage.ru/images/film/7000/small/p7539.jpg',
    source: 'Мираж Синема Санкт-Петербург',
    sourceUrl: 'https://www.mirage.ru/film/7539/',
  };
  let deleted = null;
  const result = await publishWeeklyCinemaPremieres({
    now: new Date('2026-09-02T21:30:00Z'),
    force: true,
    previousPublication: { status: 'published', messageIds: [823] },
    config: {
      cinemaPremieres: {
        enabled: true,
        topicId: 705,
        maxItems: 12,
        kinopolis: { name: 'Кинополис Мурино', url: 'https://kinopolis.test/' },
        mirage: { name: 'Мираж Синема Санкт-Петербург', url: 'https://mirage.test/', fallbackUrls: [] },
      },
    },
    cache: memoryCache(),
    dedupeCache: memoryCache(),
    chatId: -1001,
    token: '1:test',
    loadKinopolis: async () => [],
    loadMirage: async () => [row],
    recordHealth: async (healthRow) => healthRow,
    ensureTopic: async () => ({ topicId: 705 }),
    buildCollage: async () => Buffer.from('fake'),
    sendCollage: async () => {
      order.push('send-new');
      return { messageId: 900 };
    },
    deleteMessages: async ({ messageIds }) => {
      order.push('delete-old');
      deleted = messageIds;
      return { deleted: messageIds.length };
    },
  });

  assert.deepEqual(order, ['send-new', 'delete-old']);
  assert.deepEqual(deleted, [823]);
  assert.deepEqual(result.replacedMessageIds, [823]);
  assert.equal(result.messageId, 900);
});
