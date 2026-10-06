const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const MODEL = 'openai/gpt-oss-20b';
const NAMESPACE = 'rudi-finance-ai-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

function cacheOf(options = {}) {
  return options.financeAiCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}
function clean(value, max = 5000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}
function compact(value, max = 600) {
  return clean(value, max).replace(/\s+/g, ' ').trim();
}
function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return map.year + '-' + map.month + '-' + map.day;
}
function parseJsonText(text) {
  const raw = clean(text, 12000).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!raw) throw new Error('finance-ai-empty');
  try { return JSON.parse(raw); } catch (_) { throw new Error('finance-ai-invalid-json'); }
}
function responseText(payload) {
  return String(payload?.choices?.[0]?.message?.content || '').trim();
}
async function requestJson(prompt, schema, options = {}) {
  const env = options.env || process.env;
  const apiKey = compact(options.apiKey || env.GROQ_API_KEY, 500);
  if (!apiKey) throw new Error('groq-api-key-missing');
  const fetchImpl = options.fetch || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('finance-ai-fetch-unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(7000, Number(options.timeoutMs) || 14000));
  let response;
  try {
    response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        reasoning_effort: 'low',
        include_reasoning: false,
        temperature: 0.88,
        max_completion_tokens: 1400,
        stream: false,
        response_format: { type: 'json_schema', json_schema: { name: 'rudi_finance_ai', strict: true, schema } },
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('finance-ai-timeout');
    throw new Error('finance-ai-unavailable');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) throw new Error('finance-ai-quota');
  if ([500, 502, 503, 504].includes(response.status)) throw new Error('finance-ai-busy');
  if (!response.ok) throw new Error('finance-ai-provider');
  return parseJsonText(responseText(await response.json().catch(() => null)));
}
function normalizeWords(value) {
  return new Set(compact(value, 1000).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((word) => word.length > 3));
}
function similarity(left, right) {
  const a = normalizeWords(left), b = normalizeWords(right);
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const word of a) if (b.has(word)) hit += 1;
  return hit / Math.min(a.size, b.size);
}
function literacySchema() {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      topic: { type: 'string' },
      body: { type: 'string' },
      books: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
    },
    required: ['title', 'topic', 'body', 'books'],
    additionalProperties: false,
  };
}
function literacyPrompt(history, retry = false) {
  const used = (Array.isArray(history) ? history : []).slice(0, 120);
  const recent = used.slice(0, 40).map((row) => {
    return compact(row?.date, 20) + ' — ' + compact(row?.title, 140) + ' — ' + compact(row?.topic, 120);
  }).join('\n');
  return [
    'Ты пишешь ежедневную статью по финансовой грамотности для приложения RUDI.',
    'Нужна одна оригинальная статья на русском языке: практичная, взрослая, без инфоцыганства и обещаний быстрого богатства.',
    'Опирайся на проверенные идеи известных книг о личных финансах и инвестициях: The Psychology of Money, The Millionaire Next Door, Your Money or Your Life, The Little Book of Common Sense Investing, A Random Walk Down Wall Street, The Richest Man in Babylon, I Will Teach You to Be Rich и других качественных книг.',
    'Не цитируй книги дословно и не пересказывай конкретные страницы. Синтезируй идеи своими словами.',
    'Длина body: примерно 350–650 слов. Текст должен читаться как цельная мини-статья с 4–7 короткими абзацами.',
    'Каждый день выбирай новую тему: бюджет, резерв, долги, поведенческие ошибки, инвестиции, риск, инфляция, сложный процент, потребление, рост дохода, страхование, финансовые цели, стоимость времени, диверсификация и т.д.',
    'Обязательно дай конкретный практический вывод, который можно применить сегодня.',
    'Не давай персональных инвестиционных рекомендаций и не обещай доходность.',
    'books — названия 1–4 книг, чьи общие идеи вдохновили статью. Это не источники цитат.',
    'Нельзя повторять прошлые темы, заголовки или ту же мысль под другой формулировкой.',
    retry ? 'Предыдущая попытка оказалась слишком похожей на старый материал. Полностью смени тему и логику статьи.' : '',
    recent ? 'Недавние статьи, которые нельзя повторять:\n' + recent : '',
  ].filter(Boolean).join('\n');
}
async function generateLiteracyArticle(history = [], options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const parsed = await requestJson(literacyPrompt(history, attempt > 0), literacySchema(), options);
      const title = compact(parsed?.title, 140);
      const topic = compact(parsed?.topic, 120);
      const body = clean(parsed?.body, 7000);
      const books = (Array.isArray(parsed?.books) ? parsed.books : []).map((book) => compact(book, 100)).filter(Boolean).slice(0, 4);
      if (title.length < 8 || topic.length < 5 || body.length < 700 || books.length < 1) throw new Error('finance-literacy-too-short');
      const duplicate = (Array.isArray(history) ? history : []).some((row) => {
        return similarity(title + ' ' + topic, String(row?.title || '') + ' ' + String(row?.topic || '')) >= 0.48;
      });
      if (duplicate) throw new Error('finance-literacy-repeat');
      return { title, topic, body, books, model: MODEL, provider: 'groq' };
    } catch (error) {
      lastError = error;
      if (attempt >= 3) throw error;
    }
  }
  throw lastError || new Error('finance-literacy-generation-failed');
}
async function getDailyLiteracyArticle(options = {}) {
  const cache = cacheOf(options);
  const date = moscowDateKey(options.now || new Date());
  const state = await cache.get('articles');
  const history = Array.isArray(state?.articles) ? state.articles : [];
  const existing = history.find((row) => row.date === date);
  if (existing) return existing;
  const generated = await generateLiteracyArticle(history, options);
  const article = { date, ...generated, createdAt: new Date(options.now || Date.now()).toISOString() };
  const next = { articles: [article, ...history.filter((row) => row.date !== date)].slice(0, 365) };
  await cache.set('articles', next, { ttl: TTL_SECONDS, tags: ['rudi-finance-literacy'], name: 'articles' });
  return article;
}
function monthlyInsightSchema() {
  return {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  };
}
async function getMonthlyFinanceInsight(context = {}, options = {}) {
  const actor = compact(context.actor, 30);
  const month = compact(context.month, 10);
  const version = Math.max(0, Number(context.version || 0));
  const key = ['insight', actor, month, version].join(':');
  const cache = cacheOf(options);
  const existing = await cache.get(key);
  if (existing?.text) return existing;
  const categories = (Array.isArray(context.categories) ? context.categories : []).map((row) => {
    return compact(row.icon, 12) + ' ' + compact(row.name, 48) + ': ' + Number(row.spent || 0) + ' ₽' + (Number(row.monthlyLimit || 0) > 0 ? ' из лимита ' + Number(row.monthlyLimit) + ' ₽' : '');
  }).join('; ');
  const prompt = [
    'Ты финансовый помощник внутри приложения RUDI.',
    'Дай один короткий полезный вывод по месяцу на русском языке, 2–4 предложения, без морализаторства и без инвестиционных советов.',
    'Опирайся только на переданные цифры. Если данных мало, так и скажи и предложи одно простое действие.',
    'Пользователь: ' + actor + '. Месяц: ' + month + '.',
    'Доход: ' + Number(context.income || 0) + ' ₽. Расходы: ' + Number(context.expenses || 0) + ' ₽. Баланс: ' + Number(context.balance || 0) + ' ₽.',
    'Подушка: ' + Number(context.reserve || 0) + ' ₽.',
    categories ? 'Категории: ' + categories : 'Расходы по категориям пока не добавлены.',
  ].join('\n');
  const parsed = await requestJson(prompt, monthlyInsightSchema(), { ...options, timeoutMs: 10000 });
  const text = compact(parsed?.text, 800);
  if (!text) throw new Error('finance-insight-empty');
  const result = { text, model: MODEL, provider: 'groq' };
  await cache.set(key, result, { ttl: 60 * 60 * 24 * 35, tags: ['rudi-finance-insight'], name: key });
  return result;
}

module.exports = {
  MODEL, NAMESPACE, moscowDateKey, similarity, generateLiteracyArticle, getDailyLiteracyArticle, getMonthlyFinanceInsight,
};
