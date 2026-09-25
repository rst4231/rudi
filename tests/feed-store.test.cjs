const test = require('node:test');
const assert = require('node:assert/strict');
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

test('feed replaces section content instead of accumulating old cards', async () => {
  const cache = memoryCache();
  await updateFeedSections({
    events: { parts: ['old event'] },
  }, { feedCache: cache, now: new Date('2026-09-21T05:00:00Z'), date: '2026-09-21' });

  await updateFeedSections({
    events: { parts: ['new event'] },
  }, { feedCache: cache, now: new Date('2026-09-22T05:00:00Z'), date: '2026-09-22' });

  const snapshot = await readFeedSnapshot({
    feedCache: cache,
    now: new Date('2026-09-22T05:01:00Z'),
  });
  assert.deepEqual(snapshot.sections.events.parts, ['new event']);
  assert.equal(JSON.stringify(snapshot).includes('old event'), false);
});

test('expired feed content is physically removed from current storage snapshot', async () => {
  const cache = memoryCache();
  await updateFeedSections({
    events: { parts: ['event'] },
  }, { feedCache: cache, now: new Date('2026-09-21T00:00:00Z'), date: '2026-09-21' });

  const expired = await readFeedSnapshot({
    feedCache: cache,
    now: new Date('2026-09-22T13:00:01Z'),
  });

  assert.deepEqual(expired.sections, {});
  assert.equal(cache.data.has('current'), false);
});

test('same-day retry does not clear pending changed sections before notification', async () => {
  const cache = memoryCache();
  const first = await updateFeedSections({
    events: { parts: ['same event'] },
  }, { feedCache: cache, now: new Date('2026-09-21T00:00:00Z'), date: '2026-09-21' });
  assert.deepEqual(first.changedSections, ['events']);

  const retry = await updateFeedSections({
    events: { parts: ['same event'] },
  }, { feedCache: cache, now: new Date('2026-09-21T01:00:00Z'), date: '2026-09-21' });
  assert.deepEqual(retry.changedSections, ['events']);
  assert.equal(retry.version, first.version);
});


test('cinema content stays until a newer cinema post replaces it', async () => {
  const cache = memoryCache();
  await updateFeedSections({
    cinema: { parts: ['old cinema post'] },
    events: { parts: ['daily event'] },
  }, { feedCache: cache, now: new Date('2026-09-01T00:00:00Z'), date: '2026-09-01' });

  const later = await readFeedSnapshot({
    feedCache: cache,
    now: new Date('2026-10-15T00:00:00Z'),
  });
  assert.deepEqual(later.sections.cinema.parts, ['old cinema post']);
  assert.equal(later.sections.events, undefined);

  await updateFeedSections({
    cinema: { parts: ['new cinema post'] },
  }, { feedCache: cache, now: new Date('2026-10-15T01:00:00Z'), date: '2026-10-15' });

  const replaced = await readFeedSnapshot({
    feedCache: cache,
    now: new Date('2026-10-15T01:01:00Z'),
  });
  assert.deepEqual(replaced.sections.cinema.parts, ['new cinema post']);
  assert.equal(JSON.stringify(replaced).includes('old cinema post'), false);
});


test('cinema structured items persist together with fallback text', async () => {
  const cache = memoryCache();
  await updateFeedSections({
    cinema: {
      parts: ['fallback cinema'],
      items: [{
        title: 'Тестовый фильм',
        posterUrl: 'https://cdn.mirage.ru/images/film/7000/small/p7426.jpg',
        releaseDate: '2026-09-24',
        sources: ['Мираж Синема'],
        sourceUrls: [{ name: 'Мираж Синема', url: 'https://www.mirage.ru/film/7426/' }],
        kinopoiskUrl: 'https://www.kinopoisk.ru/index.php?kp_query=test',
      }],
    },
  }, { feedCache: cache, now: new Date('2026-09-24T06:00:00Z'), date: '2026-09-24' });

  const snapshot = await readFeedSnapshot({ feedCache: cache, now: new Date('2026-10-01T06:00:00Z') });
  assert.equal(snapshot.sections.cinema.items.length, 1);
  assert.equal(snapshot.sections.cinema.items[0].title, 'Тестовый фильм');
  assert.equal(snapshot.sections.cinema.items[0].sources[0], 'Мираж Синема');
});
