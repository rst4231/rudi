const test = require('node:test');
const assert = require('node:assert/strict');
const {
  recoverDianaProductsFromJournals,
  DIANA_RECOVERY_KEY,
} = require('../api/product-list-store.cjs');

function cacheWith(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  return {
    values,
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async set(key, value) { values.set(key, structuredClone(value)); return true; },
    async delete(key) { values.delete(key); return true; },
    async expireTag() { return true; },
  };
}

test('one-time recovery restores Diana products from score and activity journals without duplicates', async () => {
  const productCache = cacheWith();
  const scoreCache = cacheWith({
    'score-state': {
      initialized: true,
      version: 1,
      history: [
        {
          id: 'score-1',
          actor: 'Диана',
          kind: 'earn',
          units: 1,
          requestedUnits: 1,
          label: 'Продукты',
          detail: 'Добавлено в продукты: Молоко',
          icon: '🛒',
          dedupeKey: 'score:product:milk',
          dateKey: '2026-09-30',
          createdAt: '2026-09-30T05:00:00.000Z',
        },
        {
          id: 'score-2',
          actor: 'Диана',
          kind: 'earn',
          units: 1,
          requestedUnits: 1,
          label: 'Продукты',
          detail: 'Добавлено в продукты: Яйца',
          icon: '🛒',
          dedupeKey: 'score:product:eggs',
          dateKey: '2026-09-30',
          createdAt: '2026-09-30T05:01:00.000Z',
        },
      ],
    },
  });
  const activityCache = cacheWith({
    'activity-journal': {
      initialized: true,
      version: 1,
      items: [
        {
          id: 'activity-1',
          type: 'products',
          actor: 'Диана',
          text: 'Диана добавила в список продуктов: Молоко, Яйца, Хлеб +2',
          icon: '🛒',
          targetTab: 'products',
          createdAt: '2026-09-30T05:02:00.000Z',
        },
      ],
    },
  });

  const initial = {
    initialized: true,
    version: 10,
    items: [{ id: 'old', text: 'Хлеб', addedBy: 'Рустам', checked: false, createdAt: '2026-09-29T10:00:00.000Z' }],
    history: [],
  };

  const recovered = await recoverDianaProductsFromJournals(initial, {
    productCache,
    scoreCache,
    activityCache,
    now: Date.parse('2026-09-30T06:00:00.000Z'),
  });

  const texts = recovered.items.map((item) => item.text);
  assert.deepEqual(new Set(texts), new Set(['Хлеб', 'Молоко', 'Яйца']));
  assert.equal(recovered.items.find((item) => item.text === 'Молоко')?.addedBy, 'Диана');
  assert.equal(productCache.values.get(DIANA_RECOVERY_KEY)?.complete, true);

  const afterManualRemoval = {
    ...recovered,
    items: recovered.items.filter((item) => item.text !== 'Молоко'),
  };
  const secondRead = await recoverDianaProductsFromJournals(afterManualRemoval, {
    productCache,
    scoreCache,
    activityCache,
    now: Date.parse('2026-09-30T06:05:00.000Z'),
  });
  assert.equal(secondRead.items.some((item) => item.text === 'Молоко'), false);
});
