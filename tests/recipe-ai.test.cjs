const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRecipeRequest,
  generateRecipeSet,
} = require('../api/recipe-ai.cjs');

function recipePayload(title='Чахохбили', timeMinutes=15) {
  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            recipes: [
              {
                title,
                summary: 'Курица с томатами',
                timeMinutes,
                difficulty: 'Легко',
                ingredients: [
                  { name: 'Курица', amount: '200 г' },
                  { name: 'Помидоры', amount: '2 шт.' },
                ],
                missing: [],
                steps: ['Подготовить продукты', 'Приготовить до готовности'],
                tips: [],
              },
              {
                title: 'Рис с яйцом',
                summary: 'Быстрый вариант',
                timeMinutes,
                difficulty: 'Легко',
                ingredients: [{ name: 'Рис', amount: '150 г' }],
                missing: [],
                steps: ['Подготовить', 'Приготовить'],
                tips: [],
              },
              {
                title: 'Омлет',
                summary: 'Простой вариант',
                timeMinutes,
                difficulty: 'Легко',
                ingredients: [{ name: 'Яйца', amount: '3 шт.' }],
                missing: [],
                steps: ['Взбить', 'Приготовить'],
                tips: [],
              },
              {
                title: 'Томатный рис',
                summary: 'Ещё один вариант',
                timeMinutes,
                difficulty: 'Легко',
                ingredients: [{ name: 'Рис', amount: '150 г' }],
                missing: [],
                steps: ['Подготовить', 'Приготовить'],
                tips: [],
              },
            ],
          }),
        }],
      },
    }],
  };
}

test('recipe request validates selectors and cooking time', () => {
  assert.deepEqual(
    normalizeRecipeRequest({
      ingredients: 'курица, рис, помидоры',
      equipment: 'stove',
      meal: 'dinner',
      cuisine: 'georgian',
      timeMinutes: 15,
    }),
    {
      ingredients: 'курица, рис, помидоры',
      equipment: 'stove',
      meal: 'dinner',
      cuisine: 'georgian',
      timeMinutes: 15,
    }
  );

  assert.throws(() => normalizeRecipeRequest({
    ingredients: 'рис',
    equipment: 'microwave',
    meal: 'dinner',
    cuisine: 'georgian',
    timeMinutes: 15,
  }), /recipe-equipment-invalid/);

  assert.throws(() => normalizeRecipeRequest({
    ingredients: 'рис',
    equipment: 'stove',
    meal: 'dinner',
    cuisine: 'georgian',
    timeMinutes: 20,
  }), /recipe-time-invalid/);
});

test('recipe generation uses fast primary model and selected time', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.match(url, /gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'secret-key');
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseJsonSchema.properties.recipes.items.properties.timeMinutes.maximum, 15);
    assert.match(body.contents[0].parts[0].text, /Максимальное время: 15 минут/);
    return {
      ok: true,
      status: 200,
      async json() { return recipePayload('Чахохбили', 15); },
    };
  };

  const result = await generateRecipeSet({
    ingredients: 'курица, помидоры',
    equipment: 'stove',
    meal: 'dinner',
    cuisine: 'georgian',
    timeMinutes: 15,
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(calls, 1);
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  assert.equal(result.recipes.length, 4);
  assert.ok(result.recipes.every(recipe => recipe.timeMinutes <= 15));
});

test('recipe generation retries 503 and falls back to secondary model', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const fakeFetch = async (url) => {
    if (url.includes('gemini-3.1-flash-lite')) {
      primaryCalls += 1;
      return {
        ok: false,
        status: 503,
        async text() { return 'high demand'; },
      };
    }

    if (url.includes('gemini-3.5-flash-lite')) {
      fallbackCalls += 1;
      return {
        ok: true,
        status: 200,
        async json() { return recipePayload('Резервный рецепт', 10); },
      };
    }

    throw new Error('unexpected-model');
  };

  const result = await generateRecipeSet({
    ingredients: 'яйца, рис',
    equipment: 'stove',
    meal: 'breakfast',
    cuisine: 'russian',
    timeMinutes: 10,
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(primaryCalls, 2);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(result.recipes[0].title, 'Резервный рецепт');
});

test('recipe generation exposes quota after available models are exhausted', async () => {
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
      timeMinutes: 5,
    }, { apiKey: 'secret-key', fetch: fakeFetch }),
    /recipe-ai-quota/
  );
});
