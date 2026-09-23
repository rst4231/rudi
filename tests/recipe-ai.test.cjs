const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  normalizeRecipeRequest,
  generateRecipeSet,
} = require('../api/recipe-ai.cjs');

function recipePayload(title = 'Чахохбили', timeMinutes = 15) {
  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            recipes: Array.from({ length: 4 }, (_, index) => ({
              title: index ? title + ' ' + (index + 1) : title,
              summary: 'Быстрое блюдо',
              timeMinutes,
              difficulty: 'Легко',
              ingredients: [
                { name: 'Курица', amount: '200 г' },
                { name: 'Рис', amount: '100 г' },
              ],
              missing: [],
              steps: ['Подготовить продукты', 'Приготовить до готовности'],
              tips: ['Подавайте сразу'],
            })),
          }),
        }],
      },
    }],
  };
}

test('recipe request validates selectors including cooking time', () => {
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

test('recipe generation uses fast primary model and selected time schema', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.ok(url.endsWith(DEFAULT_MODEL + ':generateContent'));
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
    ingredients: 'курица, рис',
    equipment: 'stove',
    meal: 'dinner',
    cuisine: 'georgian',
    timeMinutes: 15,
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(calls, 1);
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.recipes.length, 4);
  assert.equal(result.recipes[0].timeMinutes, 15);
});

test('503 on primary retries and can recover without user-facing failure', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 503,
        async text() { return '{"error":{"status":"UNAVAILABLE"}}'; },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() { return recipePayload('Омлет', 10); },
    };
  };

  const result = await generateRecipeSet({
    ingredients: 'яйца, сыр',
    equipment: 'stove',
    meal: 'breakfast',
    cuisine: 'russian',
    timeMinutes: 10,
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(calls, 2);
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.recipes.length, 4);
});

test('timeout on primary falls back to secondary model', async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    if (url.includes(DEFAULT_MODEL)) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    assert.ok(url.endsWith(FALLBACK_MODEL + ':generateContent'));
    return {
      ok: true,
      status: 200,
      async json() { return recipePayload('Рис с сыром', 30); },
    };
  };

  const result = await generateRecipeSet({
    ingredients: 'рис, сыр',
    equipment: 'multicooker',
    meal: 'lunch',
    cuisine: 'italian',
    timeMinutes: 30,
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.ok(urls.some(url => url.includes(DEFAULT_MODEL)));
  assert.ok(urls.some(url => url.includes(FALLBACK_MODEL)));
  assert.equal(result.model, FALLBACK_MODEL);
});

test('quota errors remain explicit when every model is exhausted', async () => {
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
