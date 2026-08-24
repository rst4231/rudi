const nativeFetch = globalThis.fetch.bind(globalThis);
const { loadEventsConfig } = require('./events-config.cjs');
const { getCinemaPremieresCache } = require('./stateful-cache.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { handleTelegramTopicRequest, getKnownForumChatId } = require('./topic-maintenance.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const {
  SENT_TITLES_KEY,
  normalizeTitle,
  mergePremieres,
  buildCinemaPremiereCaption,
} = require('./cinema-premieres.cjs');

const DATE_KEY = '2026-08-20';
const DONE_KEY = `manual-backfill:${DATE_KEY}`;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

function isPreview(req) {
  const value = req?.query?.preview;
  return value === '1' || value === 1 || value === true || value === 'true';
}

async function sendPhoto({ token, chatId, topicId, photo, caption }) {
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
  const response = await handleTelegramTopicRequest(url, init, {
    fetchImpl: nativeFetch,
    now: new Date(`${DATE_KEY}T12:00:00+03:00`),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram cinema backfill failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
}

async function handler(req, res) {
  if (!['GET', 'POST'].includes(String(req?.method || 'GET').toUpperCase())) {
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }

  try {
    const preview = isPreview(req);
    const config = await loadEventsConfig({ fetchImpl: nativeFetch, cacheMs: 0 });
    const rowsForDate = config.cinemaPremieres?.manualByDate?.[DATE_KEY] || [];
    if (!rowsForDate.length) return res.status(404).json({ ok: false, error: 'backfill-not-configured', date: DATE_KEY });

    const cache = getCinemaPremieresCache();
    if (!preview && await cache.get(DONE_KEY)) {
      return res.status(200).json({ ok: true, skipped: 'already-published', date: DATE_KEY });
    }

    const storedTitles = preview ? [] : await cache.get(SENT_TITLES_KEY);
    const rows = mergePremieres(rowsForDate, Array.isArray(storedTitles) ? storedTitles : [])
      .slice(0, config.cinemaPremieres.maxItems);

    if (preview) {
      return res.status(200).json({
        ok: true,
        preview: true,
        date: DATE_KEY,
        topicId: config.cinemaPremieres.topicId,
        count: rows.length,
        items: rows.map((row) => ({
          title: row.title,
          posterUrl: row.posterUrl,
          cinemas: row.sources,
          caption: buildCinemaPremiereCaption(row, DATE_KEY),
        })),
      });
    }

    const token = resolveTelegramBotToken(process.env);
    const chatId = await getKnownForumChatId() || findForumChatIdInEnv(process.env);
    if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema backfill');

    const sent = new Set((Array.isArray(storedTitles) ? storedTitles : []).map(normalizeTitle).filter(Boolean));
    const published = [];
    for (const row of rows) {
      await sendPhoto({
        token,
        chatId,
        topicId: config.cinemaPremieres.topicId,
        photo: row.posterUrl,
        caption: buildCinemaPremiereCaption(row, DATE_KEY),
      });
      sent.add(normalizeTitle(row.title));
      await cache.set(SENT_TITLES_KEY, [...sent], {
        ttl: CACHE_TTL_SECONDS,
        tags: ['rudi-cinema-premieres'],
        name: SENT_TITLES_KEY,
      });
      published.push(row.title);
    }

    await cache.set(DONE_KEY, true, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-premieres'],
      name: DONE_KEY,
    });

    return res.status(200).json({ ok: true, date: DATE_KEY, published: published.length, titles: published });
  } catch (error) {
    console.error('RUDI_CINEMA_BACKFILL_ERROR', error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
