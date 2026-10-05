const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  normalizeRecipeRequest,
  normalizeStepList,
  generateRecipeSuggestions,
  generateRecipeDetail,
} = require('../api/recipe-ai.cjs');

function suggestionPayload(title = 'Чахохбили', timeMinutes = 15) {
  const titles = [title, 'Лобио с томатами', 'Оджахури на сковороде', 'Яйца с аджикой'];
  const times = [timeMinutes, Math.max(1, timeMinutes - 1), Math.max(1, timeMinutes - 2), Math.max(1, timeMinutes - 3)];
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          recipes: titles.map((recipeTitle, index) => ({
            title: recipeTitle,
            summary: 'Короткое описание блюда',
            timeMinutes: times[index],
            difficulty: 'Легко',
          })),
        }),
      },
    }],
  };
}

function detailPayload(title = 'Чахохбили', timeMinutes = 15) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
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
            steps: ['Подготовить продукты', 'Приготовить основу', 'Довести до готовности и подать'],
            tips: ['Подавайте сразу'],
          },
        }),
      },
    }],
  };
}

const baseRequest = {
  ingredients: 'курица, рис',
  equipment: 'stove',
  meal: 'dinner',
  dishType: 'main',
  cuisine: 'georgian',
  timeMinutes: 15,
};

test('recipe request validates selectors including cooking time', () => {
  assert.deepEqual(normalizeRecipeRequest(baseRequest), baseRequest);
  assert.throws(() => normalizeRecipeRequest({ ...baseRequest, equipment: 'microwave' }), /recipe-equipment-invalid/);
  assert.throws(() => normalizeRecipeRequest({ ...baseRequest, dishType: 'soup' }), /recipe-type-invalid/);
  assert.throws(() => normalizeRecipeRequest({ ...baseRequest, timeMinutes: 20 }), /recipe-time-invalid/);
  assert.equal(normalizeRecipeRequest({ ...baseRequest, meal: 'snack', dishType: 'fruit' }).meal, 'snack');
});

test('breakfast and snack support sweet and savory taste filters only', () => {
  const sweetBreakfast = normalizeRecipeRequest({
    ...baseRequest,
    meal: 'breakfast',
    dishType: 'porridge',
    taste: 'sweet',
  });
  assert.equal(sweetBreakfast.taste, 'sweet');

  const savorySnack = normalizeRecipeRequest({
    ...baseRequest,
    meal: 'snack',
    dishType: 'sandwich',
    taste: 'savory',
  });
  assert.equal(savorySnack.taste, 'savory');

  assert.throws(
    () => normalizeRecipeRequest({ ...baseRequest, meal: 'breakfast', dishType: 'eggs', taste: 'spicy' }),
    /recipe-taste-invalid/
  );
  assert.throws(
    () => normalizeRecipeRequest({ ...baseRequest, taste: 'sweet' }),
    /recipe-taste-invalid/
  );
});

test('sweet taste is passed into the recipe AI prompt', async () => {
  const fakeFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.messages[0].content, /Вкус: сладкие/);
    assert.match(body.messages[0].content, /блюдо должно быть сладким/);
    return {
      ok: true,
      status: 200,
      async json() { return suggestionPayload('Сладкая овсянка', 15); },
    };
  };

  const result = await generateRecipeSuggestions({
    ...baseRequest,
    ingredients: 'овсянка, молоко, банан',
    meal: 'breakfast',
    dishType: 'porridge',
    taste: 'sweet',
    cuisine: 'russian',
  }, {
    apiKey: 'secret-key',
    fetch: fakeFetch,
  });

  assert.equal(result.recipes.length, 4);
});

test('suggestions use Groq GPT-OSS 20B with strict structured output', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(DEFAULT_MODEL, 'openai/gpt-oss-20b');
    assert.equal(options.headers.Authorization, 'Bearer secret-key');

    const body = JSON.parse(options.body);
    assert.equal(body.model, DEFAULT_MODEL);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.include_reasoning, false);
    assert.equal(body.max_completion_tokens, 850);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.properties.recipes.items.properties.timeMinutes.minimum, 11);
    assert.equal(body.response_format.json_schema.schema.properties.recipes.items.properties.timeMinutes.maximum, 15);
    assert.equal('ingredients' in body.response_format.json_schema.schema.properties.recipes.items.properties, false);

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
  assert.equal(result.provider, 'groq');
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.recipes.length, 4);
});

test('detail is generated with a separate short Groq request', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.max_completion_tokens, 2800);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.ok(body.response_format.json_schema.schema.properties.recipe.properties.ingredients);
    assert.equal(body.response_format.json_schema.schema.properties.recipe.properties.steps.minItems, 1);
    assert.equal(body.response_format.json_schema.schema.properties.recipe.properties.steps.maxItems, 12);
    assert.match(body.messages[0].content, /Выбранное блюдо: Чахохбили/);

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
  assert.equal(result.provider, 'groq');
  assert.equal(result.recipe.title, 'Чахохбили');
  assert.equal(result.recipe.ingredients.length, 2);
});

test('503 retries once on Groq and can recover', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 503,
        async text() { return '{"error":{"message":"temporarily unavailable"}}'; },
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
  assert.equal(result.provider, 'groq');
  assert.equal(result.recipes.length, 4);
});

test('Groq key is required and Gemini key is not used', async () => {
  await assert.rejects(
    generateRecipeSuggestions(baseRequest, {
      env: { GEMINI_API_KEY: 'old-key' },
      fetch: async () => { throw new Error('should not call'); },
    }),
    /groq-api-key-missing/
  );
});

test('Groq 429 falls back to the secondary model instead of exposing a daily quota', async () => {
  const models = [];
  let calls = 0;
  const fakeFetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    models.push(body.model);
    if (calls === 1) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => '0' },
        async text() { return ''; },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() { return suggestionPayload('Омлет', 5); },
    };
  };

  const result = await generateRecipeSuggestions({
    ...baseRequest,
    ingredients: 'яйца, сыр',
    meal: 'breakfast',
    cuisine: 'russian',
    timeMinutes: 5,
  }, { apiKey: 'secret-key', fetch: fakeFetch });

  assert.equal(calls, 2);
  assert.deepEqual(models, [DEFAULT_MODEL, FALLBACK_MODEL]);
  assert.equal(result.model, FALLBACK_MODEL);
  assert.equal(result.recipes.length, 4);
});

test('rate limits on both recipe models become a temporary busy error', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      headers: { get: () => '0' },
      async text() { return ''; },
    };
  };

  await assert.rejects(
    generateRecipeSuggestions(baseRequest, { apiKey: 'secret-key', fetch: fakeFetch }),
    /recipe-ai-busy/
  );
  assert.equal(calls, 2);
});


test('suggestions retry when a generated title repeats a recent recipe', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      const duplicate = suggestionPayload('Повтор', 15);
      return { ok: true, status: 200, async json() { return duplicate; } };
    }
    return { ok: true, status: 200, async json() { return suggestionPayload('Новый ужин', 15); } };
  };

  const result = await generateRecipeSuggestions({
    ...baseRequest,
    excludeTitles: ['Повтор'],
  }, { apiKey: 'secret-key', fetch: fakeFetch });

  assert.equal(calls, 2);
  assert.equal(result.recipes[0].title, 'Новый ужин');
});

test('suggestions can recover after two repeated batches', async () => {
  let calls = 0;
  const fakeFetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.temperature, calls === 1 ? 0.4 : 0.7);
    const title = calls < 3 ? 'Повтор' : 'Свежий ужин';
    return { ok: true, status: 200, async json() { return suggestionPayload(title, 15); } };
  };

  const result = await generateRecipeSuggestions({
    ...baseRequest,
    excludeTitles: ['Повтор'],
  }, { apiKey: 'secret-key', fetch: fakeFetch });

  assert.equal(calls, 3);
  assert.equal(result.recipes[0].title, 'Свежий ужин');
});

test('numbered steps packed into one string are split into separate steps', () => {
  assert.deepEqual(
    normalizeStepList(['1. Нарежьте продукты 2. Обжарьте основу 3. Подайте блюдо']),
    ['Нарежьте продукты', 'Обжарьте основу', 'Подайте блюдо']
  );
});
