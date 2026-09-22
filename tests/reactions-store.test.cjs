const test = require('node:test');
const assert = require('node:assert/strict');
const { cacheKey, setReaction, toggleReaction } = require('../api/reactions-store.cjs');

function eventualCache(initial = {}) {
  const visible = new Map(Object.entries(initial));
  const pending = new Map();
  return {
    async get(key) { return visible.has(key) ? visible.get(key) : null; },
    async set(key, value) { pending.set(key, value); },
    async delete(key) { visible.delete(key); pending.delete(key); },
    flush() { for (const [key, value] of pending) visible.set(key, value); pending.clear(); },
  };
}

test('toggleReaction immediately returns the new like before cache read-after-write catches up', async () => {
  const cache = eventualCache();
  const result = await toggleReaction(
    { type: 'daily-idea', key: 'day:2026-09-19' },
    'Рустам',
    { reactionsCache: cache, now: Date.UTC(2026, 8, 19, 12, 0, 0) }
  );

  assert.deepEqual(result.likedBy, ['Рустам']);
  assert.equal(result.count, 1);
});

test('toggleReaction preserves the other actor while adding the current actor', async () => {
  const target = { type: 'watch', key: 'day:2026-09-19' };
  const cache = eventualCache({
    [cacheKey({ type: 'watch', key: 'day:2026-09-19' }, 'Диана')]: { actor: 'Диана', reactedAt: '2026-09-19T10:00:00.000Z' },
  });

  const result = await toggleReaction(target, 'Рустам', { reactionsCache: cache });
  assert.deepEqual(result.likedBy, ['Рустам', 'Диана']);
  assert.equal(result.count, 2);
});

test('toggleReaction immediately returns the removed-like state', async () => {
  const cache = eventualCache({
    [cacheKey({ type: 'partner-message', key: 'message:2026-09-19T10:00:00.000Z' }, 'Рустам')]: { actor: 'Рустам' },
  });

  const result = await toggleReaction(
    { type: 'partner-message', key: 'message:2026-09-19T10:00:00.000Z' },
    'Рустам',
    { reactionsCache: cache }
  );

  assert.deepEqual(result.likedBy, []);
  assert.equal(result.count, 0);
});


test('setReaction does not depend on reading back the current actor before writing', async () => {
  const cache = eventualCache();
  const result = await setReaction(
    { type: 'daily-idea', key: 'day:2026-09-19' },
    'Рустам',
    true,
    { reactionsCache: cache, now: Date.UTC(2026, 8, 19, 12, 0, 0) }
  );

  assert.deepEqual(result.likedBy, ['Рустам']);
  assert.equal(result.count, 1);
});

test('setReaction can remove a like even when the actor write is not readable yet', async () => {
  const cache = eventualCache();
  await setReaction(
    { type: 'watch', key: 'day:2026-09-19' },
    'Рустам',
    true,
    { reactionsCache: cache }
  );

  const result = await setReaction(
    { type: 'watch', key: 'day:2026-09-19' },
    'Рустам',
    false,
    { reactionsCache: cache }
  );

  assert.deepEqual(result.likedBy, []);
  assert.equal(result.count, 0);
});


test('reaction cache keys are compact ASCII-only keys', () => {
  for (const actor of ['Рустам', 'Диана']) {
    const key = cacheKey(
      { type: 'partner-message', key: 'message:2026-09-19T19:06:40.134Z' },
      actor
    );
    assert.match(key, /^[\x20-\x7E]+$/);
    assert.ok(key.length < 100);
    assert.equal(key.includes('Рустам'), false);
    assert.equal(key.includes('Диана'), false);
  }
});

test('setReaction survives a fresh read with the persisted ASCII key', async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
  const target = { type: 'daily-idea', key: 'day:2026-09-19' };

  await setReaction(target, 'Рустам', true, { reactionsCache: cache });
  const persisted = await require('../api/reactions-store.cjs').readReaction(target, { reactionsCache: cache });

  assert.deepEqual(persisted.likedBy, ['Рустам']);
  assert.equal(persisted.count, 1);
});


test('setReaction persists an unlike tombstone so a fresh read stays unliked', async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
  const target = { type: 'watch', key: 'day:2026-09-19' };

  await setReaction(target, 'Рустам', true, { reactionsCache: cache });
  await setReaction(target, 'Рустам', false, { reactionsCache: cache });
  const persisted = await require('../api/reactions-store.cjs').readReaction(target, { reactionsCache: cache });

  assert.deepEqual(persisted.likedBy, []);
  assert.equal(persisted.count, 0);
  assert.equal(values.get(cacheKey(target, 'Рустам')).liked, false);
});


test('feed reactions accept versioned section keys', async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
  const target = { type: 'feed', key: 'concerts:2026-09-21T06:41:00.000Z' };

  const result = await setReaction(target, 'Диана', true, { reactionsCache: cache });
  assert.deepEqual(result.likedBy, ['Диана']);

  const persisted = await require('../api/reactions-store.cjs').readReaction(target, { reactionsCache: cache });
  assert.deepEqual(persisted.likedBy, ['Диана']);
});


test('photo-memory reactions are accepted and persisted per photo key', async () => {
  const values = new Map();
  const cache = {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
  const target = { type: 'photo-memory', key: 'photo:7f4ac201' };
  const result = await setReaction(target, 'Диана', true, { reactionsCache: cache });
  assert.deepEqual(result.likedBy, ['Диана']);
  const persisted = await require('../api/reactions-store.cjs').readReaction(target, { reactionsCache: cache });
  assert.deepEqual(persisted.likedBy, ['Диана']);
});
