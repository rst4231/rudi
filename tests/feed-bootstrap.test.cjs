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
