const test = require('node:test');
const assert = require('node:assert/strict');
const {
  refreshFeedFromPreviewIfNeeded,
} = require('../api/partner-message.js');
const {
  updateFeedSections,
  readFeedSnapshot,
} = require('../api/feed-store.cjs');

function memoryCache() {
  const data = new Map();
  return {
    data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

test('feed bootstrap fills split event payload while keeping cinema and ignoring retired facts', async () => {
  const cache = memoryCache();
  await updateFeedSections({
    cinema: { parts: ['🎬 old cinema'] },
  }, {
    feedCache: cache,
    now: new Date('2026-09-18T00:00:00Z'),
    date: '2026-09-18',
  });

  const current = await readFeedSnapshot({
    feedCache: cache,
    now: new Date('2026-09-21T08:00:00Z'),
  });

  let requestedUrl = '';
  const refreshed = await refreshFeedFromPreviewIfNeeded(current, {
    feedCache: cache,
    now: new Date('2026-09-21T08:00:00Z'),
    appBaseUrl: 'https://example.test/',
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({
        ok: true,
        sections: {
          facts: { parts: ['💡 retired fact'] },
          events: { parts: ['🎤 concerts today', '🎙 stand up today'] },
          cinema: { parts: [] },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(requestedUrl, 'https://example.test/api/preview?date=2026-09-21');
  assert.equal(refreshed.sections.facts, undefined);
  assert.deepEqual(refreshed.sections.events.parts, ['🎤 concerts today', '🎙 stand up today']);
  assert.deepEqual(refreshed.sections.cinema.parts, ['🎬 old cinema']);
  assert.equal(refreshed.date, '2026-09-21');
});


test('first feed read on Thursday refreshes events and cinema together', async () => {
  const cache = memoryCache();
  const now = new Date('2026-10-01T00:02:00+03:00');
  await updateFeedSections({ cinema: { parts: ['old cinema'] } }, {
    feedCache: cache,
    now: new Date('2026-09-30T23:55:00+03:00'),
    date: '2026-09-30',
  });
  const current = await readFeedSnapshot({ feedCache: cache, now });
  let cinemaCalls = 0;
  const refreshed = await refreshFeedFromPreviewIfNeeded(current, {
    feedCache: cache,
    now,
    appBaseUrl: 'https://example.test/',
    fetchImpl: async (url) => {
      assert.equal(String(url), 'https://example.test/api/preview?date=2026-10-01');
      return new Response(JSON.stringify({
        ok: true,
        sections: { events: { parts: ['concerts', 'stand up'] } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    publishCinemaForFeed: async (options) => {
      cinemaCalls += 1;
      assert.equal(options.force, true);
      assert.equal(options.feedOnly, true);
      assert.equal(options.settings.sections.cinema.publishToTelegram, false);
      return {
        feedMessage: 'cinema: new movie',
        feedItems: [{ title: 'New movie', releaseDate: '2026-10-01' }],
      };
    },
  });
  assert.equal(cinemaCalls, 1);
  assert.deepEqual(refreshed.sections.events.parts, ['concerts', 'stand up']);
  assert.match(refreshed.sections.cinema.parts[0], /new movie/);
  assert.equal(refreshed.sections.cinema.items[0].title, 'New movie');
  assert.equal(refreshed.date, '2026-10-01');
});


test('Thursday feed refreshes stale cinema even when events were already opened today', async () => {
  const cache = memoryCache();
  const now = new Date('2026-10-01T09:00:00+03:00');
  await updateFeedSections({
    events: { parts: ['🎤 уже сегодняшние события'], updatedAt: '2026-10-01T08:00:00+03:00' },
    cinema: { parts: ['🎬 кино прошлой недели'], updatedAt: '2026-09-24T00:02:00+03:00' },
  }, { feedCache: cache, now, date: '2026-10-01' });

  const current = await readFeedSnapshot({ feedCache: cache, now });
  let previewCalls = 0;
  let cinemaCalls = 0;
  const refreshed = await refreshFeedFromPreviewIfNeeded(current, {
    feedCache: cache,
    now,
    fetchImpl: async () => { previewCalls += 1; throw new Error('preview should not be needed'); },
    publishCinemaForFeed: async () => {
      cinemaCalls += 1;
      return {
        feedMessage: '🎬 <b>Кинопремьеры</b>\n\nСегодняшний фильм',
        feedItems: [{ title: 'Сегодняшний фильм', releaseDate: '2026-10-01' }],
      };
    },
  });

  assert.equal(previewCalls, 0);
  assert.equal(cinemaCalls, 1);
  assert.match(refreshed.sections.cinema.parts[0], /Сегодняшний фильм/);
  assert.equal(refreshed.sections.cinema.items[0].title, 'Сегодняшний фильм');
});
