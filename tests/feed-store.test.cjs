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
    facts: { parts: ['old fact'] },
  }, { feedCache: cache, now: new Date('2026-09-21T05:00:00Z'), date: '2026-09-21' });

  await updateFeedSections({
    facts: { parts: ['new fact'] },
  }, { feedCache: cache, now: new Date('2026-09-22T05:00:00Z'), date: '2026-09-22' });

  const snapshot = await readFeedSnapshot({
    feedCache: cache,
    now: new Date('2026-09-22T05:01:00Z'),
  });
  assert.deepEqual(snapshot.sections.facts.parts, ['new fact']);
  assert.equal(JSON.stringify(snapshot).includes('old fact'), false);
});

test('expired feed content is physically removed from current storage snapshot', async () => {
  const cache = memoryCache();
  await updateFeedSections({
    facts: { parts: ['fact'] },
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
    facts: { parts: ['same fact'] },
  }, { feedCache: cache, now: new Date('2026-09-21T00:00:00Z'), date: '2026-09-21' });
  assert.deepEqual(first.changedSections, ['facts']);

  const retry = await updateFeedSections({
    facts: { parts: ['same fact'] },
  }, { feedCache: cache, now: new Date('2026-09-21T01:00:00Z'), date: '2026-09-21' });
  assert.deepEqual(retry.changedSections, ['facts']);
  assert.equal(retry.version, first.version);
});
