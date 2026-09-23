const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  normalizeRecipeRequest,
  generateRecipeSuggestions,
  generateRecipeDetail,
} = require('../api/recipe-ai.cjs');

function suggestionPayload(title = 'Чахохбили', timeMinutes = 15) {
  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            recipes: Array.from({ length: 4 }, (_, index) => ({
              title: index ? title + ' ' + (index + 1) : title,
              summary: 'Короткое описание блюда',
              timeMinutes,
              difficulty: 'Легко',
            })),
          }),
        }],
      },
    }],
  };
}

function detailPayload(title = 'Чахохбили', timeMinutes = 15) {
  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            recipe: {
              title,
              summary: 'Подробный рецепт',
              timeMinutes,
              difficulty: 'Легко',
              ingredients: [
                { name: 'Курица', amount: '200 г' },
                { name: 'Рис', amount: '100 г' },
              ],
              missing: [],
              steps: ['Подготовить продукты', 'Приготовить до готовности'],
              tips: ['Подавайте сразу'],
            },
          }),
        }],
      },
    }],
  };
}

const baseRequest = {
  ingredients: 'курица, рис',
  equipment: 'stove',
  meal: 'dinner',
  cuisine: 'georgian',
  timeMinutes: 15,
};

test('recipe request validates selectors including cooking time', () => {
  assert.deepEqual(normalizeRecipeRequest(baseRequest), baseRequest);
  assert.throws(() => normalizeRecipeRequest({ ...baseRequest, equipment: 'microwave' }), /recipe-equipment-invalid/);
  assert.throws(() => normalizeRecipeRequest({ ...baseRequest, timeMinutes: 20 }), /recipe-time-invalid/);
});

test('suggestions use Gemini 3.5 Flash-Lite and keep the first response lightweight', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.ok(url.endsWith(DEFAULT_MODEL + ':generateContent'));
    assert.equal(DEFAULT_MODEL, 'gemini-3.5-flash-lite');
    assert.equal(options.headers['x-goog-api-key'], 'secret-key');

    const body = JSON.parse(options.body);
    const itemSchema = body.generationConfig.responseJsonSchema.properties.recipes.items.properties;
    assert.equal(body.generationConfig.maxOutputTokens, 700);
    assert.equal(itemSchema.timeMinutes.maximum, 15);
    assert.equal('ingredients' in itemSchema, false);
    assert.equal('steps' in itemSchema, false);
    assert.match(body.contents[0].parts[0].text, /только название/i);

    return {
      ok: true,
      status: 200,
      async json() { return suggestionPayload('Чахохбили', 15); },
    };
  };

  const result = await generateRecipeSuggestions(baseRequest, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(calls, 1);
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.recipes.length, 4);
  assert.deepEqual(Object.keys(result.recipes[0]).sort(), ['difficulty','id','summary','timeMinutes','title'].sort());
});

test('detail is generated only after a dish is selected', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.ok(url.endsWith(DEFAULT_MODEL + ':generateContent'));
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.maxOutputTokens, 1800);
    assert.ok(body.generationConfig.responseJsonSchema.properties.recipe.properties.ingredients);
    assert.match(body.contents[0].parts[0].text, /Выбранное блюдо: Чахохбили/);
    return {
      ok: true,
      status: 200,
      async json() { return detailPayload('Чахохбили', 15); },
    };
  };

  const result = await generateRecipeDetail({
    ...baseRequest,
    title: 'Чахохбили',
    summary: 'Курица с рисом',
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(calls, 1);
  assert.equal(result.recipe.title, 'Чахохбили');
  assert.equal(result.recipe.ingredients.length, 2);
  assert.equal(result.recipe.steps.length, 2);
});

test('503 on primary suggestions retries and can recover', async () => {
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
      async json() { return suggestionPayload('Омлет', 10); },
    };
  };

  const result = await generateRecipeSuggestions({
    ...baseRequest,
    ingredients: 'яйца, сыр',
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

test('timeout on primary falls back to Gemini 3.5 Flash', async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    if (url.includes(DEFAULT_MODEL)) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    assert.equal(FALLBACK_MODEL, 'gemini-3.5-flash');
    assert.ok(url.endsWith(FALLBACK_MODEL + ':generateContent'));
    return {
      ok: true,
      status: 200,
      async json() { return suggestionPayload('Рис с сыром', 30); },
    };
  };

  const result = await generateRecipeSuggestions({
    ...baseRequest,
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
    generateRecipeSuggestions({
      ...baseRequest,
      ingredients: 'яйца, сыр',
      meal: 'breakfast',
      cuisine: 'russian',
      timeMinutes: 5,
    }, { apiKey: 'secret-key', fetch: fakeFetch }),
    /recipe-ai-quota/
  );
});
