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
const { ensureCinemaTopic } = require('./cinema-topic.cjs');
const { recordSourceHealth } = require('./source-health.cjs');
const { filterUnseen, rememberFingerprints } = require('./content-fingerprint.cjs');
const { incrementSectionMetric } = require('./feedback-analytics.cjs');

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

async function extractTelegramMessageId(result) {
  const direct = Number(result?.messageId);
  if (Number.isInteger(direct) && direct > 0) return direct;
  try {
    if (typeof result?.clone !== 'function') return null;
    const data = await result.clone().json();
    const messageId = Number(data?.result?.message_id);
    return Number.isInteger(messageId) && messageId > 0 ? messageId : null;
  } catch {
    return null;
  }
}

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
    const messageId = await extractTelegramMessageId(response);
    if (messageId) {
      await rememberPublishedMessages(Number(topicId), chatId, [messageId], dateKeyInMoscow(now || new Date()), topicCache || getTopicMaintenanceCache());
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

async function deleteTelegramMessages({ token, chatId, messageIds, fetchImpl }) {
  const ids = [...new Set((messageIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return { deleted: 0 };
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/deleteMessages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_ids: ids }),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    if (response?.status === 400 && /message to delete not found|MESSAGE_ID_INVALID|message identifier is not specified/iu.test(detail)) {
      return { deleted: 0, alreadyGone: true };
    }
    throw new Error(`Telegram cinema replacement cleanup failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  return { deleted: ids.length };
}

async function loadMiragePremieresWithFallback(dateKey, sourceConfig, sourceOptions = {}) {
  const urls = [...new Set([sourceConfig?.url, ...(Array.isArray(sourceConfig?.fallbackUrls) ? sourceConfig.fallbackUrls : [])].filter(Boolean))];
  let lastError = null;
  let hadSuccessfulSource = false;
  const combined = new Map();
  for (const url of urls) {
    try {
      const rows = await legacy.loadMiragePremieres(dateKey, {
        ...sourceConfig,
        url,
        scanRecentIdGaps: url === sourceConfig?.url,
      }, sourceOptions);
      hadSuccessfulSource = true;
      if (!rows.length) {
        console.warn('RUDI_MIRAGE_PREMIERES_SOURCE_EMPTY', url, dateKey);
        continue;
      }
      for (const row of rows) {
        const key = legacy.normalizeTitle(row?.title);
        if (!key || combined.has(key)) continue;
        combined.set(key, row);
      }
    } catch (error) {
      lastError = error;
      console.warn('RUDI_MIRAGE_PREMIERES_SOURCE_ERROR', url, String(error?.message || error));
    }
  }
  if (hadSuccessfulSource) return [...combined.values()];
  throw lastError || new Error('Mirage cinema source is unavailable');
}

async function recordCinemaSourceResults(dateKey, kinopolisResult, mirageResult, options = {}) {
  const recordHealth = options.recordHealth || recordSourceHealth;
  const cache = options.sourceHealthCache || options.controlCache;
  const rows = [
    ['cinema:kinopolis', kinopolisResult],
    ['cinema:mirage', mirageResult],
  ];
  const records = [];
  for (const [sourceId, result] of rows) {
    const fulfilled = result.status === 'fulfilled';
    const itemCount = fulfilled && Array.isArray(result.value) ? result.value.length : 0;
    const record = {
      sourceId,
      requestedDate: dateKey,
      status: fulfilled ? (itemCount ? 'healthy' : 'empty') : 'failed',
      itemCount,
      error: fulfilled ? null : result.reason,
    };
    records.push(await recordHealth(record, { cache, now: options.now, secrets: options.secrets }));
  }
  return records;
}

async function filterRecentCinemaRows(rows, dateKey, settings = {}, options = {}) {
  const normalized = (rows || []).map((row) => ({ ...row, releaseDate: row.releaseDate || dateKey }));
  const days = Math.max(1, Number(settings?.dedupe?.cinemaDays || 60));
  const result = await filterUnseen('cinema', normalized, days, {
    cache: options.cache || options.controlCache,
    seenFingerprints: options.seenFingerprints,
    now: options.now,
  });
  return {
    rows: result.items.map(({ fingerprint, ...row }) => row),
    fingerprints: result.items.map((row) => row.fingerprint),
    suppressed: result.suppressed,
    days,
  };
}

async function publishWeeklyCinemaPremieres(options = {}) {
  const now = options.now || new Date();
  if (!legacy.isThursdayInMoscow(now)) return { skipped: 'not-thursday', date: legacy.moscowDateKey(now) };

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const dateKey = legacy.moscowDateKey(now);
  const settings = options.settings || {};
  const config = options.config || await loadEventsConfig({ fetchImpl, settings, now: now.getTime() });
  if (!config.cinemaPremieres?.enabled) return { skipped: 'disabled', date: dateKey };

  const cache = options.cache || getCinemaPremieresCache(options.cacheOptions || {});
  if (!options.force && await cache.get(`done:${dateKey}`)) return { skipped: 'already-published', date: dateKey };

  const sourceOptions = { fetchImpl, attempts: options.sourceAttempts || 2, timeoutMs: options.timeoutMs || 15000 };
  const loadKinopolis = options.loadKinopolis || legacy.loadKinopolisPremieres;
  const loadMirage = options.loadMirage || loadMiragePremieresWithFallback;
  const [kinopolisResult, mirageResult] = await Promise.allSettled([
    loadKinopolis(dateKey, config.cinemaPremieres.kinopolis, sourceOptions),
    loadMirage(dateKey, config.cinemaPremieres.mirage, sourceOptions),
  ]);

  await recordCinemaSourceResults(dateKey, kinopolisResult, mirageResult, {
    ...options,
    now,
    recordHealth: options.recordHealth,
  });

  if (kinopolisResult.status === 'rejected') console.warn('RUDI_KINOPOLIS_PREMIERES_ERROR', String(kinopolisResult.reason?.message || kinopolisResult.reason));
  if (mirageResult.status === 'rejected') console.warn('RUDI_MIRAGE_PREMIERES_ERROR', String(mirageResult.reason?.message || mirageResult.reason));
  if (kinopolisResult.status === 'rejected' && mirageResult.status === 'rejected') throw new Error('Both cinema premiere sources failed');

  const manualRows = Array.isArray(config.cinemaPremieres.manualByDate?.[dateKey])
    ? config.cinemaPremieres.manualByDate[dateKey]
    : [];
  const merged = legacy.mergePremieres([
    ...(kinopolisResult.status === 'fulfilled' ? kinopolisResult.value : []),
    ...(mirageResult.status === 'fulfilled' ? mirageResult.value : []),
    ...manualRows,
  ]);
  const recent = await filterRecentCinemaRows(merged, dateKey, settings, {
    cache: options.dedupeCache || options.controlCache,
    seenFingerprints: options.force ? new Set() : options.seenFingerprints,
    now,
  });
  const rows = recent.rows.slice(0, config.cinemaPremieres.maxItems);
  const fingerprints = recent.fingerprints.slice(0, rows.length);
  if (recent.suppressed) {
    try { await (options.incrementMetric || incrementSectionMetric)('cinema', 'duplicateSuppressions', recent.suppressed, { cache: options.analyticsCache || options.controlCache, now }); } catch {}
  }

  const complete = kinopolisResult.status === 'fulfilled' && mirageResult.status === 'fulfilled';
  if (options.force && !rows.length) {
    return {
      skipped: 'no-premieres',
      date: dateKey,
      topicId: Number(config.cinemaPremieres.topicId) || null,
      messageId: null,
      published: 0,
      posts: 0,
      complete,
      duplicateSuppressions: recent.suppressed,
      fingerprints: [],
      kinopolisCount: kinopolisResult.status === 'fulfilled' ? kinopolisResult.value.length : null,
      mirageCount: mirageResult.status === 'fulfilled' ? mirageResult.value.length : null,
      manualCount: manualRows.length,
      titles: [],
      replacedMessageIds: [],
      replacementCleanupError: null,
    };
  }

  const token = options.token || resolveTelegramBotToken(options.env || process.env);
  const chatId = options.chatId || await getKnownForumChatId({ cache: options.topicCache }) || findForumChatIdInEnv(options.env || process.env);
  if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema premieres');
  const ensureTopic = options.ensureTopic || ensureCinemaTopic;
  const { topicId } = await ensureTopic({ token, chatId, cache, fetchImpl, configuredTopicId: config.cinemaPremieres.topicId });

  let posts = 0;
  let messageId = null;
  let replacedMessageIds = [];
  let replacementCleanupError = null;
  if (rows.length) {
    const buildCollage = options.buildCollage || buildCinemaCollage;
    const sendCollage = options.sendCollage || sendTelegramCollage;
    const image = await buildCollage(rows, { fetchImpl });
    const caption = buildCinemaDigestCaption(rows, dateKey);
    const sent = await sendCollage({ token, chatId, topicId, image, caption, fetchImpl, now, topicCache: options.topicCache });
    messageId = await extractTelegramMessageId(sent);

    const previousIds = options.force
      ? [...new Set((options.previousPublication?.messageIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== messageId))]
      : [];
    if (previousIds.length) {
      const deleteMessages = options.deleteMessages || deleteTelegramMessages;
      try {
        await deleteMessages({ token, chatId, messageIds: previousIds, fetchImpl });
        replacedMessageIds = previousIds;
      } catch (error) {
        replacementCleanupError = String(error?.message || error);
        console.error('RUDI_CINEMA_REPLACEMENT_CLEANUP_ERROR', replacementCleanupError);
      }
    }

    await rememberFingerprints('cinema', fingerprints, recent.days, { cache: options.dedupeCache || options.controlCache, now });
    posts = 1;
  }

  if (!rows.length && complete) {
    const sendEmpty = options.sendEmpty || sendNoPremieresMessage;
    const sent = await sendEmpty({ token, chatId, topicId, fetchImpl, now });
    messageId = await extractTelegramMessageId(sent);
  }
  if (complete) {
    await cache.set(`done:${dateKey}`, true, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-cinema-premieres'], name: `cinema-premieres-${dateKey}` });
  }

  return {
    date: dateKey,
    topicId,
    messageId,
    published: rows.length,
    posts,
    complete,
    duplicateSuppressions: recent.suppressed,
    fingerprints,
    kinopolisCount: kinopolisResult.status === 'fulfilled' ? kinopolisResult.value.length : null,
    mirageCount: mirageResult.status === 'fulfilled' ? mirageResult.value.length : null,
    manualCount: manualRows.length,
    titles: rows.map((row) => row.title),
    replacedMessageIds,
    replacementCleanupError,
  };
}

module.exports = {
  ...legacy,
  kinopoiskSearchUrl,
  buildCinemaDigestCaption,
  collageGrid,
  buildCinemaCollage,
  extractTelegramMessageId,
  sendTelegramCollage,
  sendNoPremieresMessage,
  deleteTelegramMessages,
  loadMiragePremieresWithFallback,
  recordCinemaSourceResults,
  filterRecentCinemaRows,
  publishWeeklyCinemaPremieres,
};
