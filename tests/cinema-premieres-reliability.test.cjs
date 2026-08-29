const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprintContent } = require('../api/content-fingerprint.cjs');
const { publishWeeklyCinemaPremieres, filterRecentCinemaRows } = require('../api/cinema-premieres-collage.cjs');

function memoryCache() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) ?? null; },
    async set(key, value) { map.set(key, value); return true; },
  };
}

const now = new Date('2026-08-26T21:30:00Z');
const config = {
  cinemaPremieres: {
    enabled: true,
    topicId: 19,
    maxItems: 12,
    kinopolis: { name: 'Кинополис', url: 'https://kinopolis.test/' },
    mirage: { name: 'Мираж', url: 'https://mirage.test/', fallbackUrls: [] },
  },
};

test('both verified empty cinema sources are recorded as empty, not failed', async () => {
  const health = [];
  const result = await publishWeeklyCinemaPremieres({
    now, config, cache: memoryCache(), chatId: -1001, token: '1:test',
    loadKinopolis: async () => [], loadMirage: async () => [],
    recordHealth: async (row) => health.push(row),
    ensureTopic: async () => ({ topicId: 19 }),
    sendEmpty: async () => new Response('{"ok":true}', { status: 200 }),
  });
  assert.equal(result.complete, true);
  assert.equal(result.published, 0);
  assert.deepEqual(health.map((row) => [row.sourceId, row.status, row.itemCount]), [
    ['cinema:kinopolis', 'empty', 0],
    ['cinema:mirage', 'empty', 0],
  ]);
});

test('both failed cinema sources are recorded before the publisher throws', async () => {
  const health = [];
  await assert.rejects(() => publishWeeklyCinemaPremieres({
    now, config, cache: memoryCache(),
    loadKinopolis: async () => { throw new Error('kinopolis down'); },
    loadMirage: async () => { throw new Error('mirage down'); },
    recordHealth: async (row) => health.push(row),
  }), /Both cinema premiere sources failed/);
  assert.deepEqual(health.map((row) => [row.sourceId, row.status]), [
    ['cinema:kinopolis', 'failed'], ['cinema:mirage', 'failed'],
  ]);
});

test('recent cinema fingerprint is suppressed before maxItems slicing', async () => {
  const old = { title: 'Один фильм', sources: ['Кинополис'], sourceUrls: [], releaseDate: '2026-08-27' };
  const fresh = { title: 'Новый фильм', sources: ['Мираж'], sourceUrls: [], releaseDate: '2026-08-27' };
  const result = await filterRecentCinemaRows([old, fresh], '2026-08-27', { dedupe: { cinemaDays: 60 } }, {
    seenFingerprints: new Set([fingerprintContent('cinema', old)]),
  });
  assert.equal(result.suppressed, 1);
  assert.deepEqual(result.rows.map((row) => row.title), ['Новый фильм']);
  assert.equal(result.fingerprints.length, 1);
});