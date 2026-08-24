const { getCinemaPremieresCache } = require('./stateful-cache.cjs');
const { loadEventsConfig } = require('./events-config.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { handleTelegramTopicRequest, getKnownForumChatId } = require('./topic-maintenance.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');

const SENT_TITLES_KEY = 'sent-titles-v1';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;
const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function moscowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function moscowDateKey(now = new Date()) {
  const parts = moscowParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isThursdayInMoscow(now = new Date()) {
  return moscowParts(now).weekday === 'Thu';
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>]/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function absoluteUrl(value, baseUrl) {
  try { return new URL(decodeHtml(value), baseUrl).toString(); } catch { return null; }
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

async function fetchText(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const attempts = Math.max(1, Number(options.attempts || 2));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15000));
    try {
      const response = await fetchImpl(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; RUDI-Cinema-Premieres/1.0)',
          'accept-language': 'ru-RU,ru;q=0.9,en;q=0.7',
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response?.ok) throw new Error(`HTTP ${response?.status || 0} for ${url}`);
      return await response.text();
    } catch (error) {
      clearTimeout(timer);
      lastError = error?.name === 'AbortError' ? new Error(`Timeout loading ${url}`) : error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError || new Error(`Failed to load ${url}`);
}

function extractKinopolisReleaseLinks(html, dateKey, baseUrl = 'https://sky.kinopolis-film.ru/') {
  const safeDate = String(dateKey).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const re = new RegExp(`href=["']([^"']*\\/release\\/(\\d+)\\?[^"']*date=${safeDate}[^"']*)["']`, 'giu');
  const rows = [];
  let match;
  while ((match = re.exec(String(html || '')))) {
    rows.push({ id: match[2], url: absoluteUrl(match[1], baseUrl) });
  }
  return uniqueBy(rows.filter((row) => row.url), (row) => row.id);
}

function htmlMeta(html, property) {
  const safe = String(property).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'iu'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${safe}["'][^>]*>`, 'iu'),
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}

function htmlHeading(html) {
  const match = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu);
  return match ? stripTags(match[1]) : null;
}

function htmlTitle(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  return match ? stripTags(match[1]) : null;
}

function cleanPageTitle(value) {
  return String(value || '')
    .replace(/\s*[—|]\s*(?:Кинотеатр|Мираж Синема).*$/iu, '')
    .replace(/\s+-\s+(?:в кино|смотреть).*$/iu, '')
    .trim();
}

function parseKinopolisReleasePage(html, releaseUrl, sourceName = 'Кинополис Мурино') {
  const id = String(releaseUrl || '').match(/\/release\/(\d+)/u)?.[1] || '';
  const title = cleanPageTitle(htmlHeading(html) || htmlMeta(html, 'og:title') || htmlTitle(html));
  if (!title) return null;
  const source = String(html || '');
  const posterPatterns = id ? [
    new RegExp(`https?:\\/\\/s\\d+ru1\\.kinoplan24\\.ru\\/[^"'<>\\s]+\\/${id}\\.jpg[^"'<>\\s]*`, 'iu'),
    new RegExp(`["']([^"']*\\/${id}\\.jpg[^"']*)["']`, 'iu'),
  ] : [];
  let posterUrl = htmlMeta(html, 'og:image');
  for (const pattern of posterPatterns) {
    const match = source.match(pattern);
    if (!match) continue;
    posterUrl = match[1] || match[0];
    break;
  }
  posterUrl = posterUrl ? absoluteUrl(posterUrl, releaseUrl) : null;
  return { title, posterUrl, source: sourceName, sourceUrl: releaseUrl };
}

function extractMirageFilmLinks(html, baseUrl = 'https://www.mirage.ru/') {
  const re = /href=["']([^"']*\/film\/(\d+)\/[^"'#?]+(?:\.htm)?)["']/giu;
  const rows = [];
  let match;
  while ((match = re.exec(String(html || '')))) rows.push({ id: match[2], url: absoluteUrl(match[1], baseUrl) });
  return uniqueBy(rows.filter((row) => row.url), (row) => row.id);
}

function releaseDateMatchesMiragePage(html, dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return false;
  const text = stripTags(html).toLowerCase().replace(/ё/gu, 'е');
  const monthName = RU_MONTHS[month - 1];
  if (new RegExp(`\\bс\\s+0?${day}\\s+${monthName}\\b`, 'iu').test(text)) return true;
  const numeric = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  return text.includes(numeric);
}

function parseMirageFilmPage(html, filmUrl, dateKey, sourceName = 'Мираж Синема') {
  if (!releaseDateMatchesMiragePage(html, dateKey)) return null;
  const id = String(filmUrl || '').match(/\/film\/(\d+)/u)?.[1] || '';
  const title = cleanPageTitle(htmlHeading(html) || htmlMeta(html, 'og:title') || htmlTitle(html));
  if (!title) return null;
  const source = String(html || '');
  let posterUrl = htmlMeta(html, 'og:image');
  if (id) {
    const bigPoster = source.match(new RegExp(`https?:\\/\\/cdn\\.mirage\\.ru\\/images\\/film\\/\\d+\\/big\\/[sp]${id}\\.jpg[^"'<>\\s]*`, 'iu'));
    if (bigPoster) posterUrl = bigPoster[0];
  }
  posterUrl = posterUrl ? absoluteUrl(posterUrl, filmUrl) : null;
  return { title, posterUrl, source: sourceName, sourceUrl: filmUrl };
}

async function loadKinopolisPremieres(dateKey, sourceConfig, options = {}) {
  const baseUrl = sourceConfig.url;
  let html = await fetchText(baseUrl, options);
  let links = extractKinopolisReleaseLinks(html, dateKey, baseUrl);
  if (!links.length) {
    const datedUrl = new URL(baseUrl);
    datedUrl.searchParams.set('date', dateKey);
    html = await fetchText(datedUrl.toString(), options);
    links = extractKinopolisReleaseLinks(html, dateKey, baseUrl);
  }
  const results = await Promise.allSettled(links.slice(0, 30).map(async (item) => {
    const page = await fetchText(item.url, options);
    return parseKinopolisReleasePage(page, item.url, sourceConfig.name);
  }));
  return results.filter((result) => result.status === 'fulfilled' && result.value?.posterUrl).map((result) => result.value);
}

async function loadMiragePremieres(dateKey, sourceConfig, options = {}) {
  const html = await fetchText(sourceConfig.url, options);
  const links = extractMirageFilmLinks(html, sourceConfig.url).slice(0, 60);
  const results = await Promise.allSettled(links.map(async (item) => {
    const page = await fetchText(item.url, options);
    return parseMirageFilmPage(page, item.url, dateKey, sourceConfig.name);
  }));
  return results.filter((result) => result.status === 'fulfilled' && result.value?.posterUrl).map((result) => result.value);
}

function mergePremieres(rows, sentTitles = []) {
  const sent = new Set((Array.isArray(sentTitles) ? sentTitles : []).map(normalizeTitle).filter(Boolean));
  const merged = new Map();
  for (const row of rows || []) {
    const key = normalizeTitle(row?.title);
    if (!key || sent.has(key) || !row?.posterUrl) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        title: String(row.title).trim(),
        posterUrl: row.posterUrl,
        sources: [row.source].filter(Boolean),
        sourceUrls: row.sourceUrl ? [{ name: row.source, url: row.sourceUrl }] : [],
      });
      continue;
    }
    if (row.source && !existing.sources.includes(row.source)) existing.sources.push(row.source);
    if (row.sourceUrl && !existing.sourceUrls.some((item) => item.url === row.sourceUrl)) {
      existing.sourceUrls.push({ name: row.source, url: row.sourceUrl });
    }
  }
  return [...merged.values()];
}

function buildCinemaPremiereCaption(row, dateKey) {
  const [, month, day] = String(dateKey).split('-').map(Number);
  const dateLabel = day && month ? `${day} ${RU_MONTHS[month - 1]}` : '';
  const sources = row.sources?.length ? row.sources.join(', ') : 'Кинотеатр';
  const links = (row.sourceUrls || [])
    .filter((item) => item?.url)
    .map((item) => `<a href="${escapeHtml(item.url)}">${escapeHtml(item.name || 'Источник')}</a>`)
    .join(' · ');
  return [
    `🎬 <b>${escapeHtml(row.title)}</b>`,
    dateLabel ? `Премьера: ${dateLabel}` : null,
    `Где: ${escapeHtml(sources)}`,
    links || null,
  ].filter(Boolean).join('\n');
}

async function sendTelegramPhoto({ token, chatId, topicId, photo, caption, fetchImpl, now }) {
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: topicId,
      photo,
      caption,
      parse_mode: 'HTML',
      disable_notification: true,
    }),
  };
  const response = await handleTelegramTopicRequest(url, init, { fetchImpl, now });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram cinema premiere photo failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  return response;
}

async function sendNoPremieresMessage({ token, chatId, topicId, fetchImpl, now }) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: topicId,
      text: '🎬 Новых кинопремьер на этой неделе в Кинополис Мурино и Мираж Синема не найдено.',
      disable_notification: true,
    }),
  };
  const response = await handleTelegramTopicRequest(url, init, { fetchImpl, now });
  if (!response?.ok) throw new Error(`Telegram no-premieres message failed: HTTP ${response?.status || 0}`);
  return response;
}

async function publishWeeklyCinemaPremieres(options = {}) {
  const now = options.now || new Date();
  if (!isThursdayInMoscow(now)) return { skipped: 'not-thursday', date: moscowDateKey(now) };

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const dateKey = moscowDateKey(now);
  const config = options.config || await loadEventsConfig({ fetchImpl, now: now.getTime() });
  if (!config.cinemaPremieres?.enabled) return { skipped: 'disabled', date: dateKey };

  const cache = options.cache || getCinemaPremieresCache(options.cacheOptions || {});
  if (await cache.get(`done:${dateKey}`)) return { skipped: 'already-published', date: dateKey };

  const sourceOptions = { fetchImpl, attempts: options.sourceAttempts || 2, timeoutMs: options.timeoutMs || 15000 };
  const [kinopolisResult, mirageResult] = await Promise.allSettled([
    loadKinopolisPremieres(dateKey, config.cinemaPremieres.kinopolis, sourceOptions),
    loadMiragePremieres(dateKey, config.cinemaPremieres.mirage, sourceOptions),
  ]);
  if (kinopolisResult.status === 'rejected') console.warn('RUDI_KINOPOLIS_PREMIERES_ERROR', String(kinopolisResult.reason?.message || kinopolisResult.reason));
  if (mirageResult.status === 'rejected') console.warn('RUDI_MIRAGE_PREMIERES_ERROR', String(mirageResult.reason?.message || mirageResult.reason));
  if (kinopolisResult.status === 'rejected' && mirageResult.status === 'rejected') {
    throw new Error('Both cinema premiere sources failed');
  }

  const sentTitles = await cache.get(SENT_TITLES_KEY);
  const rows = mergePremieres([
    ...(kinopolisResult.status === 'fulfilled' ? kinopolisResult.value : []),
    ...(mirageResult.status === 'fulfilled' ? mirageResult.value : []),
  ], Array.isArray(sentTitles) ? sentTitles : []).slice(0, config.cinemaPremieres.maxItems);

  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId
    || await getKnownForumChatId({ cache: options.topicCache })
    || findForumChatIdInEnv(options.env || process.env);
  if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema premieres');

  const sent = new Set((Array.isArray(sentTitles) ? sentTitles : []).map(normalizeTitle).filter(Boolean));
  let published = 0;
  for (const row of rows) {
    const caption = buildCinemaPremiereCaption(row, dateKey);
    await sendTelegramPhoto({
      token,
      chatId,
      topicId: config.cinemaPremieres.topicId,
      photo: row.posterUrl,
      caption,
      fetchImpl,
      now,
    });
    sent.add(normalizeTitle(row.title));
    await cache.set(SENT_TITLES_KEY, [...sent], {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-premieres'],
      name: SENT_TITLES_KEY,
    });
    published += 1;
  }

  const complete = kinopolisResult.status === 'fulfilled' && mirageResult.status === 'fulfilled';
  if (!published && complete) {
    await sendNoPremieresMessage({ token, chatId, topicId: config.cinemaPremieres.topicId, fetchImpl, now });
  }
  if (complete) {
    await cache.set(`done:${dateKey}`, true, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-premieres'],
      name: `cinema-premieres-${dateKey}`,
    });
  }

  return {
    date: dateKey,
    published,
    complete,
    kinopolisCount: kinopolisResult.status === 'fulfilled' ? kinopolisResult.value.length : null,
    mirageCount: mirageResult.status === 'fulfilled' ? mirageResult.value.length : null,
    titles: rows.map((row) => row.title),
  };
}

module.exports = {
  SENT_TITLES_KEY,
  moscowDateKey,
  isThursdayInMoscow,
  normalizeTitle,
  extractKinopolisReleaseLinks,
  parseKinopolisReleasePage,
  extractMirageFilmLinks,
  releaseDateMatchesMiragePage,
  parseMirageFilmPage,
  loadKinopolisPremieres,
  loadMiragePremieres,
  mergePremieres,
  buildCinemaPremiereCaption,
  publishWeeklyCinemaPremieres,
};
