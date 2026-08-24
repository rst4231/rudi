const legacy = require('./cinema-premieres.cjs');
const {
  kinopoiskSearchUrl,
  buildCinemaDigestCaption,
  collageGrid,
  buildCinemaCollage,
} = require('./cinema-collage.cjs');
const { getCinemaPremieresCache, getTopicMaintenanceCache } = require('./stateful-cache.cjs');
const { loadEventsConfig } = require('./events-config.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const {
  getKnownForumChatId,
  rememberPublishedMessages,
  dateKeyInMoscow,
  handleTelegramTopicRequest,
} = require('./topic-maintenance.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

async function sendTelegramCollage({ token, chatId, topicId, image, caption, fetchImpl, now, topicCache }) {
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const body = new FormData();
  body.set('chat_id', String(chatId));
  body.set('message_thread_id', String(topicId));
  body.set('caption', caption);
  body.set('parse_mode', 'HTML');
  body.set('disable_notification', 'true');
  body.set('photo', new Blob([image], { type: 'image/jpeg' }), 'cinema-premieres.jpg');

  const response = await fetchImpl(url, { method: 'POST', body });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram cinema collage failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }

  try {
    const data = await response.clone().json();
    const messageId = Number(data?.result?.message_id);
    if (Number.isInteger(messageId) && messageId > 0) {
      await rememberPublishedMessages(
        Number(topicId),
        chatId,
        [messageId],
        dateKeyInMoscow(now || new Date()),
        topicCache || getTopicMaintenanceCache(),
      );
    }
  } catch (error) {
    console.error('RUDI_CINEMA_COLLAGE_TRACK_ERROR', error);
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
  if (!legacy.isThursdayInMoscow(now)) return { skipped: 'not-thursday', date: legacy.moscowDateKey(now) };

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const dateKey = legacy.moscowDateKey(now);
  const config = options.config || await loadEventsConfig({ fetchImpl, now: now.getTime() });
  if (!config.cinemaPremieres?.enabled) return { skipped: 'disabled', date: dateKey };

  const cache = options.cache || getCinemaPremieresCache(options.cacheOptions || {});
  if (await cache.get(`done:${dateKey}`)) return { skipped: 'already-published', date: dateKey };

  const sourceOptions = {
    fetchImpl,
    attempts: options.sourceAttempts || 2,
    timeoutMs: options.timeoutMs || 15000,
  };
  const [kinopolisResult, mirageResult] = await Promise.allSettled([
    legacy.loadKinopolisPremieres(dateKey, config.cinemaPremieres.kinopolis, sourceOptions),
    legacy.loadMiragePremieres(dateKey, config.cinemaPremieres.mirage, sourceOptions),
  ]);
  if (kinopolisResult.status === 'rejected') {
    console.warn('RUDI_KINOPOLIS_PREMIERES_ERROR', String(kinopolisResult.reason?.message || kinopolisResult.reason));
  }
  if (mirageResult.status === 'rejected') {
    console.warn('RUDI_MIRAGE_PREMIERES_ERROR', String(mirageResult.reason?.message || mirageResult.reason));
  }
  if (kinopolisResult.status === 'rejected' && mirageResult.status === 'rejected') {
    throw new Error('Both cinema premiere sources failed');
  }

  const sentTitles = await cache.get(legacy.SENT_TITLES_KEY);
  const rows = legacy.mergePremieres([
    ...(kinopolisResult.status === 'fulfilled' ? kinopolisResult.value : []),
    ...(mirageResult.status === 'fulfilled' ? mirageResult.value : []),
  ], Array.isArray(sentTitles) ? sentTitles : []).slice(0, config.cinemaPremieres.maxItems);

  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId
    || await getKnownForumChatId({ cache: options.topicCache })
    || findForumChatIdInEnv(options.env || process.env);
  if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema premieres');

  let posts = 0;
  if (rows.length) {
    const image = await buildCinemaCollage(rows, { fetchImpl });
    const caption = buildCinemaDigestCaption(rows, dateKey);
    await sendTelegramCollage({
      token,
      chatId,
      topicId: config.cinemaPremieres.topicId,
      image,
      caption,
      fetchImpl,
      now,
      topicCache: options.topicCache,
    });

    const sent = new Set((Array.isArray(sentTitles) ? sentTitles : []).map(legacy.normalizeTitle).filter(Boolean));
    for (const row of rows) sent.add(legacy.normalizeTitle(row.title));
    await cache.set(legacy.SENT_TITLES_KEY, [...sent], {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-premieres'],
      name: legacy.SENT_TITLES_KEY,
    });
    posts = 1;
  }

  const complete = kinopolisResult.status === 'fulfilled' && mirageResult.status === 'fulfilled';
  if (!rows.length && complete) {
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
    published: rows.length,
    posts,
    complete,
    kinopolisCount: kinopolisResult.status === 'fulfilled' ? kinopolisResult.value.length : null,
    mirageCount: mirageResult.status === 'fulfilled' ? mirageResult.value.length : null,
    titles: rows.map((row) => row.title),
  };
}

module.exports = {
  ...legacy,
  kinopoiskSearchUrl,
  buildCinemaDigestCaption,
  collageGrid,
  buildCinemaCollage,
  sendTelegramCollage,
  publishWeeklyCinemaPremieres,
};
