const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addSavedItem,
  readSavedItems,
  removeSavedItem,
  resetMutationQueueForTests,
} = require('../api/saved-items-store.cjs');

function memoryCache() {
  const data = new Map();
  return {
    async get(key) { return data.get(key) ?? null; },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async delete(key) { data.delete(key); return true; },
  };
}

test.beforeEach(() => resetMutationQueueForTests());

test('shared saves are visible to both actors and duplicate dates are not copied twice', async () => {
  const cache = memoryCache();
  const payload = {
    title: 'Ночной маршрут',
    description: 'Пройтись по набережной и закончить вечер кофе.',
    duration: '2 часа',
    period: 'evening',
  };

  const first = await addSavedItem('date', payload, 'Рустам', { cache, now: Date.parse('2026-09-24T07:00:00Z') });
  assert.equal(first.duplicate, false);
  assert.equal(first.state.items.length, 1);
  assert.equal(first.item.savedBy, 'Рустам');

  const second = await addSavedItem('date', payload, 'Диана', { cache, now: Date.parse('2026-09-24T08:00:00Z') });
  assert.equal(second.duplicate, true);
  assert.equal(second.state.items.length, 1);

  const shared = await readSavedItems({ cache });
  assert.equal(shared.items.length, 1);
  assert.equal(shared.items[0].payload.title, 'Ночной маршрут');
});

test('full generated recipe is stored and can be removed independently', async () => {
  const cache = memoryCache();
  const recipe = {
    title: 'Паста с курицей',
    summary: 'Быстрый ужин.',
    timeMinutes: 25,
    difficulty: 'Легко',
    missing: ['сливки'],
    ingredients: [
      { name: 'Курица', amount: '300 г' },
      { name: 'Паста', amount: '200 г' },
    ],
    steps: ['Обжарить курицу.', 'Сварить пасту.', 'Соединить всё вместе.'],
    tips: ['Не пересушивать курицу.'],
  };

  const added = await addSavedItem('recipe', recipe, 'Диана', { cache });
  assert.equal(added.state.items.length, 1);
  assert.equal(added.item.payload.ingredients.length, 2);
  assert.equal(added.item.payload.steps.length, 3);

  const removed = await removeSavedItem(added.item.id, { cache });
  assert.equal(removed.item.type, 'recipe');
  assert.equal(removed.state.items.length, 0);
});
