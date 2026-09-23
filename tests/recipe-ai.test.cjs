const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRecipeRequest,
  generateRecipeSet,
} = require('../api/recipe-ai.cjs');

test('recipe request validates all selectors', () => {
  assert.deepEqual(
    normalizeRecipeRequest({
      ingredients: 'курица, рис, помидоры',
      equipment: 'stove',
      meal: 'dinner',
      cuisine: 'georgian',
    }),
    {
      ingredients: 'курица, рис, помидоры',
      equipment: 'stove',
      meal: 'dinner',
      cuisine: 'georgian',
    }
  );
  assert.throws(() => normalizeRecipeRequest({
    ingredients: 'рис',
    equipment: 'microwave',
    meal: 'dinner',
    cuisine: 'georgian',
  }), /recipe-equipment-invalid/);
});

test('recipe generation returns normalized recipes with one provider call', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'secret-key');
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  recipes: [{
                    title: 'Чахохбили',
                    summary: 'Курица с томатами',
                    timeMinutes: 45,
                    difficulty: 'Средне',
                    ingredients: [
                      { name: 'Курица', amount: '500 г' },
                      { name: 'Помидоры', amount: '3 шт.' },
                    ],
                    missing: ['кинза'],
                    steps: ['Нарезать курицу', 'Тушить с помидорами'],
                    tips: ['Дать постоять 5 минут'],
                  }],
                }),
              }],
            },
          }],
        };
      },
    };
  };

  const result = await generateRecipeSet({
    ingredients: 'курица, помидоры',
    equipment: 'stove',
    meal: 'dinner',
    cuisine: 'georgian',
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(calls, 1);
  assert.equal(result.recipes[0].title, 'Чахохбили');
  assert.deepEqual(result.recipes[0].missing, ['кинза']);
});

test('recipe generation exposes a friendly quota code', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 429,
    async text() { return ''; },
  });
  await assert.rejects(
    generateRecipeSet({
      ingredients: 'яйца, сыр',
      equipment: 'stove',
      meal: 'breakfast',
      cuisine: 'russian',
    }, { apiKey: 'secret-key', fetch: fakeFetch }),
    /recipe-ai-quota/
  );
});
