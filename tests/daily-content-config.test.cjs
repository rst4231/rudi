const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadDailyContentCatalog,
  validateCatalog,
  applySequenceState,
} = require('../api/daily-content-config.cjs');

test('remote daily-content config is preferred over bundled fallback', async () => {
  const remote = {
    version: 1,
    facts: [{ id: 'remote-fact', type: 'facts', emoji: '💡', category: 'Тест', body: 'Remote', sourceUrl: 'https://example.com/a' }],
    lulu: [{ id: 'remote-lulu', type: 'lulu', title: 'Тест', body: 'Remote', sourceUrl: 'https://example.com/b' }],
  };
  const fallback = {
    version: 1,
    facts: [{ id: 'local-fact', type: 'facts', emoji: '💡', category: 'Тест', body: 'Local', sourceUrl: 'https://example.com/c' }],
    lulu: [{ id: 'local-lulu', type: 'lulu', title: 'Тест', body: 'Local', sourceUrl: 'https://example.com/d' }],
  };
  const fetchImpl = async () => new Response(JSON.stringify(remote), { status: 200 });

  const loaded = await loadDailyContentCatalog({ fetchImpl, localConfig: fallback, localSequenceState: null, cacheMs: 0 });

  assert.equal(loaded.facts[0].id, 'remote-fact');
  assert.equal(loaded.lulu[0].id, 'remote-lulu');
});

test('bundled config is used when remote config is unavailable', async () => {
  const fallback = {
    version: 1,
    facts: [{ id: 'local-fact', type: 'facts', emoji: '💡', category: 'Тест', body: 'Local', sourceUrl: 'https://example.com/c' }],
    lulu: [{ id: 'local-lulu', type: 'lulu', title: 'Тест', body: 'Local', sourceUrl: 'https://example.com/d' }],
  };
  const fetchImpl = async () => new Response('down', { status: 503 });

  const loaded = await loadDailyContentCatalog({ fetchImpl, localConfig: fallback, localSequenceState: null, cacheMs: 0 });

  assert.equal(loaded.facts[0].id, 'local-fact');
});

test('catalog rejects duplicate IDs and malformed entries', () => {
  assert.throws(() => validateCatalog({
    facts: [
      { id: 'same', type: 'facts', category: 'A', body: 'A', sourceUrl: 'https://example.com/a' },
      { id: 'same', type: 'facts', category: 'B', body: 'B', sourceUrl: 'https://example.com/b' },
    ],
    lulu: [],
  }), /duplicate content id/i);
});

test('catalog preserves permanently published content ids', () => {
  const catalog = validateCatalog({
    version: 2,
    publishedIds: ['facts-old', 'lulu-old'],
    facts: [{ id: 'facts-old', type: 'facts', category: 'A', body: 'A', sourceUrl: 'https://example.com/a' }],
    lulu: [{ id: 'lulu-old', type: 'lulu', title: 'B', body: 'B', sourceUrl: 'https://example.com/b' }],
  });

  assert.deepEqual(catalog.publishedIds, ['facts-old', 'lulu-old']);
});

test('catalog preserves and validates stable calendar sequence anchors', () => {
  const catalog = validateCatalog({
    version: 3,
    publishedIds: ['facts-old', 'lulu-old'],
    sequence: {
      startDate: '2026-08-30',
      factsStartId: 'facts-new',
      luluStartId: 'lulu-new',
    },
    facts: [
      { id: 'facts-old', type: 'facts', category: 'A', body: 'A', sourceUrl: 'https://example.com/a' },
      { id: 'facts-new', type: 'facts', category: 'B', body: 'B', sourceUrl: 'https://example.com/b' },
    ],
    lulu: [
      { id: 'lulu-old', type: 'lulu', title: 'A', body: 'A', sourceUrl: 'https://example.com/c' },
      { id: 'lulu-new', type: 'lulu', title: 'B', body: 'B', sourceUrl: 'https://example.com/d' },
    ],
  });

  assert.deepEqual(catalog.sequence, {
    startDate: '2026-08-30',
    factsStartId: 'facts-new',
    luluStartId: 'lulu-new',
  });

  assert.throws(() => validateCatalog({
    sequence: { startDate: '2026-08-30', factsStartId: 'missing', luluStartId: 'lulu-new' },
    facts: [{ id: 'facts-new', type: 'facts', category: 'B', body: 'B', sourceUrl: 'https://example.com/b' }],
    lulu: [{ id: 'lulu-new', type: 'lulu', title: 'B', body: 'B', sourceUrl: 'https://example.com/d' }],
  }), /factsStartId/i);
});

test('external sequence state retires known repeats and sets stable start anchors', () => {
  const base = {
    version: 2,
    publishedIds: ['facts-old', 'lulu-old'],
    facts: [
      { id: 'facts-old', type: 'facts', category: 'A', body: 'A', sourceUrl: 'https://example.com/a' },
      { id: 'facts-repeat', type: 'facts', category: 'B', body: 'B', sourceUrl: 'https://example.com/b' },
      { id: 'facts-next', type: 'facts', category: 'C', body: 'C', sourceUrl: 'https://example.com/c' },
    ],
    lulu: [
      { id: 'lulu-old', type: 'lulu', title: 'A', body: 'A', sourceUrl: 'https://example.com/d' },
      { id: 'lulu-repeat', type: 'lulu', title: 'B', body: 'B', sourceUrl: 'https://example.com/e' },
      { id: 'lulu-next', type: 'lulu', title: 'C', body: 'C', sourceUrl: 'https://example.com/f' },
    ],
  };
  const merged = applySequenceState(base, {
    enabled: true,
    startDate: '2026-08-30',
    factsStartId: 'facts-next',
    luluStartId: 'lulu-next',
    retiredIds: ['facts-repeat', 'lulu-repeat'],
  });
  const catalog = validateCatalog(merged);

  assert.deepEqual(catalog.publishedIds, ['facts-old', 'lulu-old', 'facts-repeat', 'lulu-repeat']);
  assert.deepEqual(catalog.sequence, {
    startDate: '2026-08-30',
    factsStartId: 'facts-next',
    luluStartId: 'lulu-next',
  });
});
