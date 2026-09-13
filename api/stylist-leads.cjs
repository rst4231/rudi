const { createHash } = require('node:crypto');

const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/stylist-leads.json';
const DEFAULT_TOPIC_ID = 126;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 120;

function normalizeStylistLeadsConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const sources = Array.isArray(value.sources) ? value.sources.filter((source) => (
    source && typeof source === 'object'
    && typeof source.id === 'string' && source.id.trim()
    && typeof source.handle === 'string' && /^[A-Za-z0-9_]+$/.test(source.handle.trim())
    && typeof source.title === 'string' && source.title.trim()
  )) : [];
  if (!sources.length) return null;
  return {
    ...value,
    topicId: Number.isInteger(Number(value.topicId)) && Number(value.topicId) > 0 ? Number(value.topicId) : DEFAULT_TOPIC_ID,
    sources,
  };
}

async function loadStylistLeadsConfig(options = {}) {
  const localCandidate = options.localConfig || require('../config/stylist-leads.json');
  const localConfig = normalizeStylistLeadsConfig(localCandidate);
  if (!localConfig) throw new Error('Stylist leads local config is invalid');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const configUrl = String(options.configUrl || options.env?.STYLIST_LEADS_CONFIG_URL || process.env.STYLIST_LEADS_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  if (typeof fetchImpl !== 'function' || !configUrl) return localConfig;
  try {
    const separator = configUrl.includes('?') ? '&' : '?';
    const response = await fetchImpl(`${configUrl}${separator}r=${Date.now()}`, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      cache: 'no-store',
    });
    if (response?.ok) {
      const remote = normalizeStylistLeadsConfig(await response.json());
      if (remote) return remote;
    }
  } catch (error) {
    console.warn('RUDI_STYLIST_LEADS_CONFIG_ERROR', String(error?.message || error));
  }
  return localConfig;
}

function getStylistLeadsCache(options = {}) {
  if (options.cache) return options.cache;
  const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
  return createStrictRuntimeCache({ namespace: 'rudi-stylist-leads-v1', confirmWrites: false, ...options.cacheOptions });
}

async function resolveStylistChatId(options = {}) {
  if (options.chatId !== undefined && options.chatId !== null && String(options.chatId).trim()) return String(options.chatId).trim();
  const env = options.env || process.env;
  const { resolveForumChatId } = require('./forum-chat-id.cjs');
  let cached = null;
  try {
    const { getTopicMaintenanceCache } = require('./stateful-cache.cjs');
    const topicCache = options.topicCache || getTopicMaintenanceCache(options.topicCacheOptions || {});
    cached = await topicCache.get('topic:19:chat-id') || await topicCache.get('topic:44:chat-id');
  } catch (error) {
    console.warn('RUDI_STYLIST_LEADS_CHAT_CACHE_ERROR', String(error?.message || error));
  }
  const chatId = resolveForumChatId({ cached, env });
  if (!chatId) throw new Error('Telegram forum chat id is not configured');
  return chatId;
}

async function defaultTelegramSend(payload, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const { resolveTelegramBotToken } = require('./products-bought.cjs');
  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram sendMessage failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  return response;
}

function formatEmptyNotice(lookbackHours) {
  return `🧭 Для Ди\n\nЗа последние ${lookbackHours} ч новых запросов на стилиста по одежде в Петербурге не найдено.`;
}

async function runStylistLeads(options = {}) {
  const config = options.config || await loadStylistLeadsConfig(options);
  if (config.enabled === false) return { ok: true, skipped: 'disabled', leadsSent: 0, emptyNoticeSent: false };
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const scanImpl = options.scanImpl || scanStylistSources;
  const scan = await scanImpl(config, { ...options, now });
  const lookbackHours = Math.max(1, Number(config.lookbackHours || 30));
  const prefiltered = await filterFreshLeads(scan.posts || [], { now, lookbackHours, seenFingerprints: new Set(), matching: config.matching || {} });
  const cache = getStylistLeadsCache(options);
  const seenFingerprints = new Set();
  for (const lead of prefiltered) {
    try {
      if (await cache.get(`seen:${lead.fingerprint}`)) seenFingerprints.add(lead.fingerprint);
    } catch (error) {
      console.warn('RUDI_STYLIST_LEADS_DEDUPE_READ_ERROR', String(error?.message || error));
    }
  }
  const fresh = prefiltered.filter((lead) => !seenFingerprints.has(lead.fingerprint));
  const maxLeads = Math.max(1, Number(config.maxLeadsPerRun || 8));
  const leads = fresh.slice(0, maxLeads);
  const chatId = await resolveStylistChatId(options);
  const topicId = Number.isInteger(Number(config.topicId)) && Number(config.topicId) > 0 ? Number(config.topicId) : DEFAULT_TOPIC_ID;
  const sendMessage = options.sendMessage || ((payload) => defaultTelegramSend(payload, options));
  let leadsSent = 0;
  for (const lead of leads) {
    await sendMessage({
      chat_id: chatId,
      message_thread_id: topicId,
      text: formatLeadMessage(lead),
      disable_web_page_preview: true,
    });
    await cache.set(`seen:${lead.fingerprint}`, {
      sentAt: now.toISOString(),
      sourceId: lead.source?.id || null,
      postId: lead.id,
      link: lead.link,
    }, { ttl: SEEN_TTL_SECONDS, tags: ['rudi-stylist-leads'] });
    leadsSent += 1;
  }
  let emptyNoticeSent = false;
  if (!leads.length && config.sendEmpty !== false) {
    await sendMessage({
      chat_id: chatId,
      message_thread_id: topicId,
      text: formatEmptyNotice(lookbackHours),
      disable_web_page_preview: true,
    });
    emptyNoticeSent = true;
  }
  return {
    ok: true,
    sourcesChecked: Number(scan.sourcesChecked || 0),
    sourceErrors: Array.isArray(scan.errors) ? scan.errors.length : 0,
    postsScanned: Array.isArray(scan.posts) ? scan.posts.length : 0,
    matchingCandidates: prefiltered.length,
    leadsSent,
    emptyNoticeSent,
  };
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function htmlToText(value = '') {
  return decodeHtmlEntities(String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter((line, index, rows) => line || (index > 0 && rows[index - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTelegramPosts(html, source = {}) {
  const input = String(html || '');
  const matches = [...input.matchAll(/data-post="([A-Za-z0-9_]+)\/(\d+)"/g)];
  const posts = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const handle = match[1];
    const id = match[2];
    const end = matches[index + 1]?.index ?? input.length;
    const chunk = input.slice(match.index, end);
    const textMatch = chunk.match(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch) continue;
    const timeMatch = chunk.match(/<time[^>]*datetime="([^"]+)"/i);
    const text = htmlToText(textMatch[1]);
    if (!text) continue;
    posts.push({
      source,
      id,
      text,
      datetime: timeMatch?.[1] || null,
      link: `https://t.me/${handle}/${id}`,
    });
  }
  return posts;
}

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function scoreStylistLead(text = '', rules = {}) {
  const value = normalizeText(text);
  if (!value) return { score: 0, reason: 'пустой текст' };
  const blockedPhrase = (Array.isArray(rules.blockedPhrases) ? rules.blockedPhrases : []).map(normalizeText).find((phrase) => phrase && value.includes(phrase));
  if (blockedPhrase) return { score: 0, reason: `исключено правилом: ${blockedPhrase}` };
  const positivePhrase = (Array.isArray(rules.positivePhrases) ? rules.positivePhrases : []).map(normalizeText).find((phrase) => phrase && value.includes(phrase));

  const localCity = /(санкт[- ]?петербург|спб|питер|мурино|ленинградск)/i.test(value);
  const otherCity = /(москв|мск(?:\s|[.,!?:;]|$)|казан|екатеринбург|новосибирск|краснодар|сочи|ростов(?:-на-дону)?)/i.test(value);
  if (otherCity && !localCity) return { score: 0, reason: 'запрос явно не по Петербургу' };
  const clothing = /(одежд|гардероб|образ|лук|капсул|вещ|шопинг|shopping|стилизац|fashion|фэшн|наряд)/i.test(value);
  const hairBeauty = /(стилист\s+по\s+волос|парикмах|визажист|макияж|прическ|причёск|бровист|колорист)/i.test(value);
  const retailVacancy = /(продавец[\s-]*стилист|стилист[\s-]*консультант|в\s+магазин[^.!?\n]{0,80}(?:требуется|ищем)[^.!?\n]{0,80}стилист|ваканси[^.!?\n]{0,80}стилист)/i.test(value);
  const request = /(ищу|ищем|нужен|нужна|нужны|посовет|порекоменду|подскаж|кто\s+(?:может|делает)|хочу|помогите|требуется)/i.test(value);
  const stylist = /стилист(?:а|у|ом|ы|ов)?/i.test(value);
  const wardrobeService = /(разбор\s+гардероб|шопинг[\s-]*сопровожд|собрат[^.!?\n]{0,50}(?:капсул|образ|лук)|подобрат[^.!?\n]{0,50}(?:вещ|одежд|образ|лук|капсул)|помо(?:чь|гите)[^.!?\n]{0,50}(?:гардероб|одежд|образ|капсул))/i.test(value);

  if (hairBeauty && !clothing) return { score: 0, reason: 'стилист по волосам/бьюти, не одежда' };
  if (retailVacancy && !wardrobeService) return { score: 0, reason: 'вакансия продавца-стилиста' };
  if (request && stylist && clothing) return { score: 3, reason: 'прямой запрос на стилиста по одежде' };
  if (positivePhrase && request) return { score: 2, reason: `совпадение с фразой: ${positivePhrase}` };
  if (request && /разбор\s+гардероб/i.test(value)) return { score: 3, reason: 'прямой запрос на разбор гардероба' };
  if (request && wardrobeService) return { score: 2, reason: 'запрос на подбор вещей/образов' };
  if (wardrobeService && clothing) return { score: 2, reason: 'запрос на работу с гардеробом' };
  return { score: 0, reason: 'нет подходящего запроса' };
}

function leadFingerprint(post = {}) {
  const normalized = normalizeText(post.text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const basis = normalized || String(post.link || post.id || '');
  return createHash('sha256').update(basis).digest('hex');
}

async function filterFreshLeads(posts = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const lookbackHours = Math.max(1, Number(options.lookbackHours || 30));
  const cutoff = now.getTime() - lookbackHours * 60 * 60 * 1000;
  const futureLimit = now.getTime() + 15 * 60 * 1000;
  const seen = options.seenFingerprints instanceof Set ? options.seenFingerprints : new Set();
  const leads = [];
  for (const post of posts) {
    const time = new Date(post.datetime || 0).getTime();
    if (!Number.isFinite(time) || time < cutoff || time > futureLimit) continue;
    const fingerprint = leadFingerprint(post);
    if (seen.has(fingerprint)) continue;
    const scored = scoreStylistLead(post.text, options.matching || {});
    if (scored.score < 2) continue;
    leads.push({ ...post, ...scored, fingerprint });
  }
  leads.sort((left, right) => (
    right.score - left.score
    || Number(right.source?.priority || 0) - Number(left.source?.priority || 0)
    || new Date(right.datetime).getTime() - new Date(left.datetime).getTime()
  ));
  return leads;
}

function formatMoscowDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'время не указано';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date).replace(',', '');
}

function formatLeadMessage(lead = {}) {
  const request = String(lead.text || '').trim().slice(0, 1600);
  return [
    '🔥 Новый клиент для стилиста',
    '',
    `Запрос: ${request}`,
    `Источник: ${lead.source?.title || lead.source?.handle || 'Telegram'}`,
    `Опубликовано: ${formatMoscowDateTime(lead.datetime)} МСК`,
    `Почему подходит Диане: ${lead.reason || 'запрос на стилиста по одежде'}`,
    `Ссылка: ${lead.link || ''}`,
  ].join('\n');
}

async function scanOneStylistSource(source, config = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const lookbackHours = Math.max(1, Number(config.lookbackHours || 30));
  const cutoff = now.getTime() - lookbackHours * 60 * 60 * 1000;
  const maxPages = Math.max(1, Number(source.maxPages || config.maxPagesPerSource || 4));
  const posts = [];
  const ids = new Set();
  let before = null;
  for (let page = 0; page < maxPages; page += 1) {
    const url = before ? `https://t.me/s/${source.handle}?before=${before}` : `https://t.me/s/${source.handle}`;
    const response = await fetchImpl(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 RUDI stylist lead scanner' },
      cache: 'no-store',
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
    const pagePosts = extractTelegramPosts(await response.text(), source);
    if (!pagePosts.length) break;
    for (const post of pagePosts) {
      if (ids.has(post.id)) continue;
      ids.add(post.id);
      posts.push(post);
    }
    const numericIds = pagePosts.map((post) => Number(post.id)).filter(Number.isFinite);
    if (!numericIds.length) break;
    const nextBefore = Math.min(...numericIds);
    if (before !== null && Number(before) === nextBefore) break;
    const timestamps = pagePosts.map((post) => new Date(post.datetime || 0).getTime()).filter(Number.isFinite);
    if (timestamps.length && Math.min(...timestamps) <= cutoff) break;
    before = nextBefore;
  }
  return posts;
}

async function scanStylistSources(config = {}, options = {}) {
  const sources = (Array.isArray(config.sources) ? config.sources : []).filter((source) => source?.enabled !== false && source?.handle);
  const concurrency = Math.max(1, Number(options.concurrency || config.concurrency || 5));
  const posts = [];
  const errors = [];
  for (let offset = 0; offset < sources.length; offset += concurrency) {
    const batch = sources.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map((source) => scanOneStylistSource(source, config, options)));
    results.forEach((result, index) => {
      const source = batch[index];
      if (result.status === 'fulfilled') posts.push(...result.value);
      else errors.push({ source, error: String(result.reason?.message || result.reason) });
    });
  }
  return { posts, errors, sourcesChecked: sources.length };
}

module.exports = {
  extractTelegramPosts,
  scoreStylistLead,
  leadFingerprint,
  filterFreshLeads,
  formatLeadMessage,
  scanOneStylistSource,
  scanStylistSources,
  normalizeStylistLeadsConfig,
  loadStylistLeadsConfig,
  resolveStylistChatId,
  runStylistLeads,
  formatEmptyNotice,
};
