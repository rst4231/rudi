const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEventsConfig, resetEventsConfigMemo } = require('../api/events-config.cjs');
const { loadDailyContentCatalog, resetDailyContentConfigMemo } = require('../api/daily-content-config.cjs');
const { loadClientsAdviceConfig } = require('../api/clients-advice.cjs');
const eventsFallback = require('../config/events.json');
const dailyFallback = require('../config/daily-content.json');
const sequenceFallback = require('../config/daily-content-sequence.json');
const clientsFallback = require('../config/clients-advice.json');

function unavailableRecorder(requested) {
  return async (url) => {
    requested.push(String(url));
    return { ok: false, status: 503 };
  };
}

test('events loader uses URL supplied by unified settings', async () => {
  resetEventsConfigMemo();
  const requested = [];
  await loadEventsConfig({
    settings: { sources: { eventsConfigUrl: 'https://config.test/events-v2.json' } },
    localConfig: eventsFallback,
    fetchImpl: unavailableRecorder(requested),
    cacheMs: 0,
  });
  assert.equal(requested[0], 'https://config.test/events-v2.json');
});

test('daily content and sequence URLs come from unified settings', async () => {
  resetDailyContentConfigMemo();
  const requested = [];
  await loadDailyContentCatalog({
    settings: { sources: {
      dailyContentConfigUrl: 'https://config.test/daily-v2.json',
      dailyContentSequenceUrl: 'https://config.test/sequence-v2.json',
    } },
    localConfig: dailyFallback,
    localSequenceState: sequenceFallback,
    fetchImpl: unavailableRecorder(requested),
    cacheMs: 0,
  });
  assert.deepEqual(requested.slice(0, 2), [
    'https://config.test/daily-v2.json',
    'https://config.test/sequence-v2.json',
  ]);
});

test('clients advice URL comes from unified settings', async () => {
  const requested = [];
  await loadClientsAdviceConfig({
    settings: { sources: { clientsAdviceConfigUrl: 'https://config.test/clients-v2.json' } },
    localConfig: clientsFallback,
    fetchImpl: unavailableRecorder(requested),
  });
  assert.ok(requested[0].startsWith('https://config.test/clients-v2.json?'));
});
