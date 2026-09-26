const DEFAULT_MODEL = 'openai/gpt-oss-20b';

const PERIODS = {
  morning: 'утро',
  day: 'день',
  evening: 'вечер',
};

function cleanText(value, max = 1000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeHistory(input) {
  return (Array.isArray(input) ? input : [])
    .map((row) => ({
      title: cleanText(row?.title, 140),
      description: cleanText(row?.description, 240),
    }))
    .filter((row) => row.title)
    .slice(0, 90);
}

function weatherLabel(code) {
  const value = Number(code);
  if ([51,53,55,56,57].includes(value)) return 'морось';
  if ([61,63,65,66,67,80,81,82].includes(value)) return 'дождь';
  if ([71,73,75,77,85,86].includes(value)) return 'снег';
  if ([95,96,99].includes(value)) return 'гроза';
  if ([45,48].includes(value)) return 'туман';
  if ([0].includes(value)) return 'ясно';
  if ([1,2,3].includes(value)) return 'облачно';
  return 'переменная погода';
}

function buildDateWeatherContext(weather) {
  const current = weather?.current || {};
  const daily = weather?.daily || {};
  const temperature = Number(current.temperature_2m);
  const code = Number(current.weather_code);
  const precipitation = Number(current.precipitation ?? current.rain ?? 0);
  const todayMin = Number(daily.temperature_2m_min?.[0]);
  const todayMax = Number(daily.temperature_2m_max?.[0]);
  const todayPrecipitation = Number(daily.precipitation_sum?.[0] ?? 0);
  if (!Number.isFinite(temperature) && !Number.isFinite(code)) {
    return { summary: 'Прогноз недоступен.', mode: 'unknown' };
  }
  const wetCodes = new Set([51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const wetNow = precipitation > 0 || wetCodes.has(code);
  const severeCold = Number.isFinite(temperature) && temperature <= -8;
  const severeHeat = Number.isFinite(temperature) && temperature >= 30;
  const rainRisk = Number.isFinite(todayPrecipitation) && todayPrecipitation >= 2;
  const mode = wetNow || severeCold || severeHeat ? 'indoor' : rainRisk ? 'mixed' : 'outdoor';
  const parts = [];
  if (Number.isFinite(temperature)) parts.push('сейчас ' + Math.round(temperature) + '°C');
  if (Number.isFinite(code)) parts.push(weatherLabel(code));
  if (Number.isFinite(precipitation) && precipitation > 0) parts.push('осадки сейчас ' + precipitation + ' мм');
  if (Number.isFinite(todayMin) && Number.isFinite(todayMax)) parts.push('сегодня ' + Math.round(todayMin) + '…' + Math.round(todayMax) + '°C');
  if (Number.isFinite(todayPrecipitation)) parts.push('осадки за день около ' + todayPrecipitation + ' мм');
  return { summary: parts.join(', ') + '.', mode };
}

function normalizeDateRequest(input = {}) {
  const period = String(input.period || '').trim();
  if (!PERIODS[period]) throw new Error('date-period-invalid');
  const exclude = (Array.isArray(input.exclude) ? input.exclude : [])
    .map((value) => cleanText(value, 180))
    .filter(Boolean)
    .slice(0, 60);
  const history = normalizeHistory(input.history);
  const weather = input.weather && typeof input.weather === 'object'
    ? { summary: cleanText(input.weather.summary, 500), mode: ['indoor','mixed','outdoor','unknown'].includes(input.weather.mode) ? input.weather.mode : 'unknown' }
    : { summary: '', mode: 'unknown' };
  return { period, exclude, history, weather };
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

function normalizedIdeaKey(value) {
  return cleanText(value, 180)
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ideaTokens(value) {
  const stop = new Set(['свидание','вечер','утро','день','вместе','для','двух','вдвоем','вдвоём','санкт','петербург','петербурге','идея']);
  return new Set(normalizedIdeaKey(value).split(' ').filter((word) => word.length > 2 && !stop.has(word)));
}

function similarIdea(left, right) {
  const a = ideaTokens(left);
  const b = ideaTokens(right);
  if (!a.size || !b.size) return normalizedIdeaKey(left) === normalizedIdeaKey(right);
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  const union = new Set([...a, ...b]).size;
  return union > 0 && overlap / union >= 0.6;
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
  for (let i = 0; i < ideas.length; i += 1) {
    for (let j = i + 1; j < ideas.length; j += 1) {
      if (similarIdea(ideas[i].title, ideas[j].title)) throw new Error('date-ai-duplicate-ideas');
    }
  }
  return { ideas };
}

function validateIdeaSet(ideas, request) {
  const previous = [
    ...request.exclude,
    ...request.history.map((row) => row.title),
  ].filter(Boolean);
  for (const idea of ideas) {
    if (previous.some((old) => similarIdea(idea.title, old))) {
      throw new Error('date-ai-repeat-history');
    }
  }
  if (request.weather.mode === 'indoor') {
    const outdoor = /(пикник|парк|набережн|пляж|прогулк|гулян|сад|лес|велосип|самокат|лодк|катер|крыша|открыт(?:ом|ый|ая|ой) воздух)/i;
    const sheltered = /(музей|галере|кафе|кофейн|ресторан|кино|театр|планетар|спа|саун|бан|дом|квартир|крыт|помещени|оранжере)/i;
    for (const idea of ideas) {
      const text = idea.title + ' ' + idea.description;
      if (outdoor.test(text) && !sheltered.test(text)) throw new Error('date-ai-weather-mismatch');
    }
  }
  return true;
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
    'Ориентируйся прежде всего на Санкт-Петербург; ближайшую Ленинградскую область используй только когда поездка действительно оправдана.',
    'Выбранное время суток: ' + PERIODS[request.period] + '.',
    request.weather.summary ? 'Погода в Санкт-Петербурге: ' + request.weather.summary : '',
    request.weather.mode === 'indoor'
      ? 'Погода сейчас не подходит для длительных уличных сценариев. Не предлагай пикник, парк, набережную, пляж, открытую крышу, долгую прогулку, велосипед или другие идеи, которые требуют находиться на улице. Выбирай помещения или форматы, где улица занимает только короткий переход.'
      : request.weather.mode === 'mixed'
        ? 'Есть заметный риск осадков. Предпочитай крытые места или сценарии с надёжным запасным вариантом в помещении; не предлагай пикник и другие идеи, которые испортятся из-за дождя.'
        : request.weather.mode === 'outdoor'
          ? 'Погода допускает уличные варианты, но всё равно делай три идеи разными по формату.'
          : '',
    'Каждая идея должна быть выполнима парой самостоятельно в ближайшие дни без специальной подготовки и без покупки необычного реквизита.',
    'Идеи должны заметно отличаться друг от друга по формату и впечатлениям. Не делай все три варианта просто прогулками или просто походами в кафе.',
    'Если используешь кафе, кино или ресторан, сочетай это с реалистичным дополнительным действием, которое пара может организовать сама.',
    'Не предлагай опасные, незаконные или чрезмерно рискованные действия.',
    request.exclude.length ? 'Не повторяй идеи с такими названиями: ' + request.exclude.join('; ') : '',
    request.history.length ? 'Вот ранее показанные идеи. Не повторяй ни их основное место, ни основную активность, даже под другим названием: ' + request.history.map((row) => row.title + (row.description ? ' — ' + row.description : '')).join(' | ') : '',
    'Все три новые идеи должны отличаться друг от друга по основной активности и месту. Нельзя выдавать три варианта одного и того же формата с разными формулировками.',
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

  let lastValidationError = null;
  const retryExclude = [...request.exclude];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptRequest = { ...request, exclude: retryExclude.slice(-60) };
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
          messages: [{ role: 'user', content: datePrompt(attemptRequest) }],
          reasoning_effort: 'low',
          include_reasoning: false,
          temperature: 0.92,
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
    const normalized = normalizeIdeas(parseJsonText(responseText(payload)));
    try {
      validateIdeaSet(normalized.ideas, attemptRequest);
      return {
        ...normalized,
        model: DEFAULT_MODEL,
        provider: 'groq',
      };
    } catch (error) {
      lastValidationError = error;
      retryExclude.push(...normalized.ideas.map((idea) => idea.title));
    }
  }
  throw lastValidationError || new Error('date-ai-no-unique-ideas');
}

module.exports = {
  DEFAULT_MODEL,
  PERIODS,
  normalizeDateRequest,
  buildDateWeatherContext,
  datePrompt,
  normalizeIdeas,
  validateIdeaSet,
  generateDateIdeas,
};
