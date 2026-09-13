const { createHash } = require('node:crypto');

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const DEFAULT_WEB_PRIORITY = 80;
const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_MAX_QUERIES = 6;
const DEFAULT_WEB_LOOKBACK_HOURS = 24;

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function isLikelyWebClientIntent(text = '') {
  const value = normalizeText(text);
  if (!value) return false;

  const clientRequest = /(ищу|ищем|нужен|нужна|нужны|посовет|порекоменду|подскаж|помогите|кто\s+(?:может|делает)|хочу\s+(?:найти|подобрать|разобрать|обновить|собрать))/i.test(value);
  const painLanguage = /(не\s+знаю\s+что\s+носить|нечего\s+носить|как\s+сочетать\s+вещ|гардероб[^.!?\n]{0,60}(?:не\s+работает|не\s+нравится|устарел|разобрать)|нужна?\s+помощь[^.!?\n]{0,80}(?:гардероб|одежд|образ|вещ|капсул)|помогите[^.!?\n]{0,80}(?:гардероб|одежд|образ|вещ|капсул))/i.test(value);
  const clothingNeed = /(стилист|одежд|гардероб|образ|лук|капсул|вещ|шопинг|shopping|наряд|стил)/i.test(value);
  const providerOffer = /(услуги\s+стилист|я\s+(?:персональный\s+)?стилист|мои\s+услуги|запись\s+открыта|записываю\s+на|прайс|стоимость\s+(?:услуг|разбора|сопровождения)|предлагаю[^.!?\n]{0,60}(?:разбор\s+гардероба|шопинг|услуг))/i.test(value);

  if (providerOffer && !clientRequest && !painLanguage) return false;
  return clothingNeed && (clientRequest || painLanguage);
}

function resolveWebSearchConfig(config = {}) {
  const raw = config.webSearch && typeof config.webSearch === 'object' ? config.webSearch : {};
  const queries = (Array.isArray(raw.queries) ? raw.queries : [])
    .map((query) => String(query || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Number(raw.maxQueries || DEFAULT_MAX_QUERIES)));
  return {
    ...raw,
    enabled: raw.enabled === true,
    provider: String(raw.provider || 'tavily').toLowerCase(),
    searchDepth: raw.searchDepth === 'advanced' ? 'advanced' : 'basic',
    timeRange: String(raw.timeRange || 'day'),
    maxResults: Math.min(20, Math.max(1, Number(raw.maxResults || DEFAULT_MAX_RESULTS))),
    priority: Number(raw.priority || DEFAULT_WEB_PRIORITY),
    lookbackHours: Math.max(1, Number(raw.lookbackHours || DEFAULT_WEB_LOOKBACK_HOURS)),
    queries,
  };
}

function webResultId(url = '') {
  return createHash('sha256').update(String(url)).digest('hex').slice(0, 24);
}

function sourceFromUrl(url, priority) {
  let host = 'web';
  try { host = new URL(url).hostname.replace(/^www\./i, '') || host; } catch {}
  return {
    id: `web-${host}`,
    title: `Интернет · ${host}`,
    kind: 'web',
    priority,
  };
}

function mapTavilyResult(result, webConfig, now) {
  const url = String(result?.url || '').trim();
  const content = String(result?.content || '').trim();
  const published = String(result?.published_date || result?.publishedDate || '').trim();
  if (!url || !content || !published || !isLikelyWebClientIntent(content)) return null;

  const publishedAt = new Date(published).getTime();
  const nowMs = now.getTime();
  const cutoff = nowMs - webConfig.lookbackHours * 60 * 60 * 1000;
  if (!Number.isFinite(publishedAt) || publishedAt < cutoff || publishedAt > nowMs + 15 * 60 * 1000) return null;

  return {
    source: sourceFromUrl(url, webConfig.priority),
    id: webResultId(url),
    text: content,
    datetime: new Date(publishedAt).toISOString(),
    link: url,
    tavilyScore: Number(result?.score || 0),
  };
}

async function scanTavilyStylistLeads(config = {}, options = {}) {
  const webConfig = resolveWebSearchConfig(config);
  if (!webConfig.enabled || webConfig.provider !== 'tavily' || !webConfig.queries.length) {
    return { posts: [], errors: [], sourcesChecked: 0, creditsUsed: 0 };
  }

  const env = options.env || process.env;
  const apiKey = String(options.tavilyApiKey || env.TAVILY_API_KEY || '').trim();
  const fetchImpl = options.tavilyFetchImpl || globalThis.fetch;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());

  if (!apiKey) {
    return {
      posts: [],
      errors: webConfig.queries.map((query, index) => ({
        source: { id: `tavily-${index + 1}`, title: 'Tavily web search', kind: 'web' },
        query,
        error: 'TAVILY_API_KEY is not configured',
      })),
      sourcesChecked: webConfig.queries.length,
      creditsUsed: 0,
    };
  }
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

  const posts = [];
  const errors = [];
  let creditsUsed = 0;
  const seenUrls = new Set();

  for (let index = 0; index < webConfig.queries.length; index += 1) {
    const query = webConfig.queries[index];
    const source = { id: `tavily-${index + 1}`, title: 'Tavily web search', kind: 'web' };
    try {
      const response = await fetchImpl(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          topic: 'general',
          search_depth: webConfig.searchDepth,
          time_range: webConfig.timeRange,
          include_published_date: true,
          filter_by_published_date: true,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          max_results: webConfig.maxResults,
          safe_search: true,
        }),
      });
      if (!response?.ok) {
        let detail = '';
        try { detail = await response.text(); } catch {}
        throw new Error(`Tavily search failed: HTTP ${response?.status || 0}${detail ? ` ${detail.slice(0, 300)}` : ''}`);
      }
      const payload = await response.json();
      creditsUsed += Math.max(0, Number(payload?.usage?.credits || (webConfig.searchDepth === 'advanced' ? 2 : 1)));
      const results = Array.isArray(payload?.results) ? payload.results : [];
      for (const result of results) {
        const mapped = mapTavilyResult(result, webConfig, now);
        if (!mapped || seenUrls.has(mapped.link)) continue;
        seenUrls.add(mapped.link);
        posts.push(mapped);
      }
    } catch (error) {
      errors.push({ source, query, error: String(error?.message || error) });
    }
  }

  return {
    posts,
    errors,
    sourcesChecked: webConfig.queries.length,
    creditsUsed,
  };
}

function failedScanResult(error, count, kind) {
  const total = Math.max(0, Number(count || 0));
  return {
    posts: [],
    errors: Array.from({ length: total }, (_, index) => ({
      source: { id: `${kind}-fatal-${index + 1}`, title: kind === 'web' ? 'Web search' : 'Telegram', kind },
      error: String(error?.message || error),
    })),
    sourcesChecked: total,
  };
}

async function scanAllStylistSources(config = {}, options = {}) {
  const { scanStylistSources } = require('./stylist-leads.cjs');
  const telegramScanImpl = options.telegramScanImpl || scanStylistSources;
  const webScanImpl = options.webScanImpl || scanTavilyStylistLeads;
  const telegramCount = (Array.isArray(config.sources) ? config.sources : []).filter((source) => source?.enabled !== false && source?.handle).length;
  const webConfig = resolveWebSearchConfig(config);
  const webCount = webConfig.enabled ? webConfig.queries.length : 0;

  const [telegramSettled, webSettled] = await Promise.allSettled([
    telegramScanImpl(config, options),
    webScanImpl(config, options),
  ]);
  const telegram = telegramSettled.status === 'fulfilled'
    ? telegramSettled.value
    : failedScanResult(telegramSettled.reason, telegramCount || 1, 'telegram');
  const web = webSettled.status === 'fulfilled'
    ? webSettled.value
    : failedScanResult(webSettled.reason, webCount || 1, 'web');

  return {
    posts: [...(Array.isArray(telegram?.posts) ? telegram.posts : []), ...(Array.isArray(web?.posts) ? web.posts : [])],
    errors: [...(Array.isArray(telegram?.errors) ? telegram.errors : []), ...(Array.isArray(web?.errors) ? web.errors : [])],
    sourcesChecked: Number(telegram?.sourcesChecked || 0) + Number(web?.sourcesChecked || 0),
    creditsUsed: Number(web?.creditsUsed || 0),
  };
}

async function runStylistLeadScan(options = {}) {
  const { runStylistLeads } = require('./stylist-leads.cjs');
  return runStylistLeads({ ...options, scanImpl: options.scanImpl || scanAllStylistSources });
}

module.exports = {
  TAVILY_SEARCH_URL,
  isLikelyWebClientIntent,
  resolveWebSearchConfig,
  scanTavilyStylistLeads,
  scanAllStylistSources,
  runStylistLeadScan,
};
