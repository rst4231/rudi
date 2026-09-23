const DEFAULT_MODEL = 'openai/gpt-oss-20b';

const PERIODS = {
  morning: 'утро',
  day: 'день',
  evening: 'вечер',
};

function cleanText(value, max = 1000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeDateRequest(input = {}) {
  const period = String(input.period || '').trim();
  if (!PERIODS[period]) throw new Error('date-period-invalid');
  const exclude = (Array.isArray(input.exclude) ? input.exclude : [])
    .map((value) => cleanText(value, 140))
    .filter(Boolean)
    .slice(0, 12);
  return { period, exclude };
}

function responseText(payload) {
  return String(payload?.choices?.[0]?.message?.content || '').trim();
}

function parseJsonText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('date-ai-empty');
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('date-ai-invalid-json');
  }
}

function normalizeIdeas(payload) {
  const ideas = (Array.isArray(payload?.ideas) ? payload.ideas : [])
    .map((idea, index) => ({
      id: 'date-' + (index + 1),
      title: cleanText(idea?.title, 140),
      description: cleanText(idea?.description, 700),
      duration: cleanText(idea?.duration, 80),
    }))
    .filter((idea) => idea.title && idea.description)
    .slice(0, 3);
  if (ideas.length !== 3) throw new Error('date-ai-no-ideas');
  return { ideas };
}

function dateSchema() {
  return {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            duration: { type: 'string' },
          },
          required: ['title', 'description', 'duration'],
          additionalProperties: false,
        },
      },
    },
    required: ['ideas'],
    additionalProperties: false,
  };
}

function datePrompt(input) {
  const request = normalizeDateRequest(input);
  return [
    'Придумай ровно 3 разных, необычных, но полностью реалистичных свидания только для Рустама и Дианы.',
    'В свидании участвуют только они двое. Не добавляй ведущих, организаторов, актёров, друзей, незнакомцев или других обязательных участников.',
    'Никто не должен вручать им карты, письма, задания, кристаллы, конверты, реквизит или другие заранее подготовленные предметы.',
    'Не придумывай квесты, тайники, загадки от третьих лиц, мистические сценарии, вымышленные сервисы или события, которых может не существовать.',
    'Ориентируйся на Санкт-Петербург и ближайшую Ленинградскую область. Можно предлагать обычные реальные места и форматы: прогулка, поездка, парк, набережная, музей, выставка, кафе, готовка дома, фотопрогулка, пикник, видовая точка и похожие выполнимые варианты.',
    'Выбранное время суток: ' + PERIODS[request.period] + '.',
    'Каждая идея должна быть выполнима парой самостоятельно в ближайшие дни без специальной подготовки и без покупки необычного реквизита.',
    'Идеи должны заметно отличаться друг от друга по формату и впечатлениям. Не делай все три варианта просто прогулками или просто походами в кафе.',
    'Если используешь кафе, кино или ресторан, сочетай это с реалистичным дополнительным действием, которое пара может организовать сама.',
    'Не предлагай опасные, незаконные или чрезмерно рискованные действия.',
    request.exclude.length ? 'Не повторяй прошлые идеи с такими названиями: ' + request.exclude.join('; ') : '',
    'Для каждой идеи дай короткое естественное название, 2–4 предложения с понятным планом действий для Рустама и Дианы и ориентировочную длительность.',
    'Пиши как практичный совет для реальной пары, а не как сюжет рассказа. Не используй Markdown, ссылки или списки внутри description.',
  ].filter(Boolean).join('\n');
}

async function generateDateIdeas(input, options = {}) {
  const request = normalizeDateRequest(input);
  const env = options.env || process.env;
  const apiKey = cleanText(options.apiKey || env.GROQ_API_KEY, 500);
  if (!apiKey) throw new Error('groq-api-key-missing');

  const fetchImpl = options.fetch || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('date-ai-fetch-unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, Number(options.timeoutMs) || 12000));
  let response;

  try {
    response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: datePrompt(request) }],
        reasoning_effort: 'low',
        include_reasoning: false,
        temperature: 0.85,
        max_completion_tokens: 900,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'rudi_date_ideas',
            strict: true,
            schema: dateSchema(),
          },
        },
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('date-ai-timeout');
    throw new Error('date-ai-unavailable');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) throw new Error('date-ai-quota');
  if ([500, 502, 503, 504].includes(response.status)) throw new Error('date-ai-busy');
  if (!response.ok) throw new Error('date-ai-provider');

  const payload = await response.json().catch(() => null);
  return {
    ...normalizeIdeas(parseJsonText(responseText(payload))),
    model: DEFAULT_MODEL,
    provider: 'groq',
  };
}

module.exports = {
  DEFAULT_MODEL,
  PERIODS,
  normalizeDateRequest,
  datePrompt,
  normalizeIdeas,
  generateDateIdeas,
};
