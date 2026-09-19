const test = require('node:test');
const assert = require('node:assert/strict');
const { setReaction, toggleReaction } = require('../api/reactions-store.cjs');

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
    'watch:day:2026-09-19:Диана': { actor: 'Диана', reactedAt: '2026-09-19T10:00:00.000Z' },
  });

  const result = await toggleReaction(target, 'Рустам', { reactionsCache: cache });
  assert.deepEqual(result.likedBy, ['Рустам', 'Диана']);
  assert.equal(result.count, 2);
});

test('toggleReaction immediately returns the removed-like state', async () => {
  const cache = eventualCache({
    'partner-message:message:2026-09-19T10:00:00.000Z:Рустам': { actor: 'Рустам' },
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
