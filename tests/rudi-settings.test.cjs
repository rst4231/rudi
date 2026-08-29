const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRudiSettings,
  loadRudiSettings,
  setRudiSettingsOverride,
  resetRudiSettingsOverride,
} = require('../api/rudi-settings.cjs');

function memoryCache(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
    dump(key) { return data.get(key); },
  };
}

function baseSettings() {
  return {
    version: 1,
    timezone: 'Europe/Moscow',
    sections: {
      events: { enabled: true, topicId: 19 },
      holidays: { enabled: true, topicId: 44 },
      facts: { enabled: true, topicId: 72 },
      lulu: { enabled: true, topicId: 85 },
      recipes: { enabled: true, topicId: 88 },
      clients: { enabled: true, topicId: 126 },
      cinema: { enabled: true },
      labor: { enabled: true },
      weekend: { enabled: true },
    },
    sources: {
      dailyContentConfigUrl: 'https://example.test/daily.json',
      dailyContentSequenceUrl: 'https://example.test/sequence.json',
      eventsConfigUrl: 'https://example.test/events.json',
      clientsAdviceConfigUrl: 'https://example.test/clients.json',
    },
    copy: {
      footers: {
        events: '', holidays: '', facts: '', lulu: '', recipes: '', clients: '', cinema: '', labor: '', weekend: '',
      },
    },
    publishing: {
      dailyCronDescription: 'Daily 00:30 Moscow',
      weekendDays: [4, 5],
      allowAutomaticRetry: true,
    },
    dedupe: {
      eventsDays: 30,
      cinemaDays: 60,
      recipesDays: 45,
      clientsDays: 45,
      weekendDays: 30,
    },
    alerts: { enabled: true, dedupeMinutes: 180 },
  };
}

test('settings overlay changes enabled state without mutating fallback', async () => {
  const fallback = validateRudiSettings(baseSettings());
  const cache = memoryCache({ 'settings:overrides': { sections: { facts: { enabled: false } } } });
  const loaded = await loadRudiSettings({ localConfig: fallback, cache, fetchImpl: null });
  assert.equal(loaded.settings.sections.facts.enabled, false);
  assert.equal(fallback.sections.facts.enabled, true);
});

test('override mutation accepts schema fields and reset removes one path', async () => {
  const cache = memoryCache();
  await setRudiSettingsOverride({ sections: { facts: { enabled: false } } }, { cache, localConfig: baseSettings() });
  assert.equal(cache.dump('settings:overrides').sections.facts.enabled, false);
  const afterReset = await resetRudiSettingsOverride('sections.facts.enabled', { cache });
  assert.deepEqual(afterReset, {});
});

test('operational settings validate external catalog URLs and reusable footers', () => {
  const settings = validateRudiSettings({
    ...baseSettings(),
    sources: { ...baseSettings().sources, eventsConfigUrl: 'https://config.test/events-v2.json' },
    copy: { footers: { ...baseSettings().copy.footers, facts: 'Мой футер' } },
  });
  assert.equal(settings.sources.eventsConfigUrl, 'https://config.test/events-v2.json');
  assert.equal(settings.copy.footers.facts, 'Мой футер');
});

test('non-http source URLs are rejected', () => {
  assert.throws(() => validateRudiSettings({
    ...baseSettings(),
    sources: { ...baseSettings().sources, eventsConfigUrl: 'file:///tmp/events.json' },
  }), /eventsConfigUrl/);
});

test('unknown top-level keys are rejected', () => {
  assert.throws(() => validateRudiSettings({ ...baseSettings(), surprise: true }), /unknown/i);
});
