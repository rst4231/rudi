const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadDailyContentCatalog,
  validateCatalog,
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

  const loaded = await loadDailyContentCatalog({ fetchImpl, localConfig: fallback, cacheMs: 0 });

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

  const loaded = await loadDailyContentCatalog({ fetchImpl, localConfig: fallback, cacheMs: 0 });

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
