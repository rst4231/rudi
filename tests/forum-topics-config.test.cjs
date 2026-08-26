const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateForumTopicsConfig,
  loadForumTopicsConfig,
  resetForumTopicsConfigMemo,
} = require('../api/forum-topics-config.cjs');

test('forum topics config accepts Labor topic 696 and Clients topic 126', () => {
  const config = validateForumTopicsConfig({ version: 1, clients: 126, labor: 696 });
  assert.equal(config.clients, 126);
  assert.equal(config.labor, 696);
});

test('forum topics config rejects using Clients topic as Labor topic', () => {
  assert.throws(
    () => validateForumTopicsConfig({ version: 1, clients: 126, labor: 126 }),
    /Labor topic must differ from Clients topic/i,
  );
});

test('remote forum topics config is preferred over bundled fallback', async () => {
  resetForumTopicsConfigMemo();
  const calls = [];
  const result = await loadForumTopicsConfig({
    configUrl: 'https://example.test/forum-topics.json',
    localConfig: { version: 1, clients: 126, labor: 444 },
    cacheMs: 0,
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ version: 1, clients: 126, labor: 696 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(calls, ['https://example.test/forum-topics.json']);
  assert.equal(result.labor, 696);
});
