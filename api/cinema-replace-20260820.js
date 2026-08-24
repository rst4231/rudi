const nativeFetch = globalThis.fetch.bind(globalThis);
const { loadEventsConfig } = require('./events-config.cjs');
const { getCinemaPremieresCache, getTopicMaintenanceCache } = require('./stateful-cache.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const {
  getKnownForumChatId,
  deleteTrackedMessages,
} = require('./topic-maintenance.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const {
  SENT_TITLES_KEY,
  normalizeTitle,
  mergePremieres,
  buildCinemaCollage,
  buildCinemaDigestCaption,
  sendTelegramCollage,
} = require('./cinema-premieres-collage.cjs');

const DATE_KEY = '2026-08-20';
const REPLACED_KEY = `manual-collage-replace:${DATE_KEY}`;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

function isPreview(req) {
  const value = req?.query?.preview;
  return value === '1' || value === 1 || value === true || value === 'true';
}

async function handler(req, res) {
  const method = String(req?.method || 'GET').toUpperCase();
  const preview = isPreview(req);
  if (method !== 'POST' && !(method === 'GET' && preview)) {
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }

  try {
    const config = await loadEventsConfig({ fetchImpl: nativeFetch, cacheMs: 0 });
    const rowsForDate = config.cinemaPremieres?.manualByDate?.[DATE_KEY] || [];
    if (!rowsForDate.length) {
      return res.status(404).json({ ok: false, error: 'replacement-not-configured', date: DATE_KEY });
    }

    const rows = mergePremieres(rowsForDate, []).slice(0, config.cinemaPremieres.maxItems);
    const caption = buildCinemaDigestCaption(rows, DATE_KEY);
    if (preview) {
      return res.status(200).json({
        ok: true,
        preview: true,
        date: DATE_KEY,
        topicId: config.cinemaPremieres.topicId,
        count: rows.length,
        titles: rows.map((row) => row.title),
        caption,
      });
    }

    const cinemaCache = getCinemaPremieresCache();
    if (await cinemaCache.get(REPLACED_KEY)) {
      return res.status(200).json({ ok: true, skipped: 'already-replaced', date: DATE_KEY });
    }

    const token = resolveTelegramBotToken(process.env);
    const topicCache = getTopicMaintenanceCache();
    const chatId = await getKnownForumChatId({ cache: topicCache }) || findForumChatIdInEnv(process.env);
    if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema replacement');

    const image = await buildCinemaCollage(rows, { fetchImpl: nativeFetch });
    const baseUrl = `https://api.telegram.org/bot${token}`;
    const deletion = await deleteTrackedMessages({
      topicId: config.cinemaPremieres.topicId,
      targetDateKey: DATE_KEY,
      chatId,
      cache: topicCache,
      baseUrl,
      fetchImpl: nativeFetch,
    });

    await sendTelegramCollage({
      token,
      chatId,
      topicId: config.cinemaPremieres.topicId,
      image,
      caption,
      fetchImpl: nativeFetch,
      now: new Date(),
      topicCache,
    });

    const storedTitles = await cinemaCache.get(SENT_TITLES_KEY);
    const sent = new Set((Array.isArray(storedTitles) ? storedTitles : []).map(normalizeTitle).filter(Boolean));
    for (const row of rows) sent.add(normalizeTitle(row.title));
    await cinemaCache.set(SENT_TITLES_KEY, [...sent], {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-premieres'],
      name: SENT_TITLES_KEY,
    });
    await cinemaCache.set(REPLACED_KEY, true, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-premieres'],
      name: REPLACED_KEY,
    });

    return res.status(200).json({
      ok: true,
      date: DATE_KEY,
      deleted: deletion?.deleted || 0,
      publishedPosts: 1,
      publishedTitles: rows.length,
      titles: rows.map((row) => row.title),
    });
  } catch (error) {
    console.error('RUDI_CINEMA_REPLACE_ERROR', error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
