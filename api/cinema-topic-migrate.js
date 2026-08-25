const { createHash, timingSafeEqual } = require('node:crypto');
const { getCinemaPremieresCache, getTopicMaintenanceCache } = require('./stateful-cache.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { getKnownForumChatId, dateKeyInMoscow, shiftDateKey } = require('./topic-maintenance.cjs');
const { findForumChatIdInEnv } = require('./forum-chat-id.cjs');
const { ensureCinemaTopic, LEGACY_EVENTS_TOPIC_ID } = require('./cinema-topic.cjs');

const MIGRATION_KEY = 'cinema-post-migrated-v1';
const EXPECTED_KEY_HASH = '67e125e05fb9cd303c4960b0c46f127205d8a605c8f49237e0f32e5f1b2873b7';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

function securelyMatchesMigrationKey(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(EXPECTED_KEY_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function telegramCall(fetchImpl, token, method, payload) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await response.clone().json(); } catch {}
  return { response, data };
}

async function migrateCinemaPost(options = {}) {
  const token = String(options.token || '').trim();
  const chatId = options.chatId;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const topicCache = options.topicCache || options.cache;
  const cinemaCache = options.cinemaCache || options.cache;
  if (!token) throw new Error('Telegram bot token is required for cinema migration');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Telegram forum chat id is required for cinema migration');
  if (!topicCache || !cinemaCache) throw new Error('Cinema migration caches are required');

  const completed = await cinemaCache.get(MIGRATION_KEY);
  if (completed?.migrated) return { skipped: 'already-migrated', ...completed };

  const topic = await ensureCinemaTopic({
    token,
    chatId,
    cache: cinemaCache,
    fetchImpl,
    configuredTopicId: options.configuredTopicId,
  });
  const topicId = topic.topicId;
  const todayKey = dateKeyInMoscow(options.now || new Date());
  const lookbackDays = Math.max(1, Number(options.lookbackDays || 7));
  const candidates = [];

  for (let age = 0; age < lookbackDays; age += 1) {
    const dateKey = shiftDateKey(todayKey, -age);
    const key = `topic:${LEGACY_EVENTS_TOPIC_ID}:${dateKey}:messages`;
    const stored = await topicCache.get(key);
    if (!Array.isArray(stored)) continue;
    for (const rawId of stored) {
      const messageId = Number(rawId);
      if (Number.isInteger(messageId) && messageId > 0) candidates.push({ dateKey, key, messageId });
    }
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.messageId)) continue;
    seen.add(candidate.messageId);

    const forwarded = await telegramCall(fetchImpl, token, 'forwardMessage', {
      chat_id: chatId,
      message_thread_id: topicId,
      from_chat_id: chatId,
      message_id: candidate.messageId,
      disable_notification: true,
    });
    if (!forwarded.response?.ok) continue;

    const temporaryId = Number(forwarded.data?.result?.message_id);
    const forwardedText = String(forwarded.data?.result?.caption || forwarded.data?.result?.text || '');
    const isCinema = /кинопремьеры/iu.test(forwardedText);
    if (Number.isInteger(temporaryId) && temporaryId > 0) {
      await telegramCall(fetchImpl, token, 'deleteMessage', { chat_id: chatId, message_id: temporaryId });
    }
    if (!isCinema) continue;

    const copied = await telegramCall(fetchImpl, token, 'copyMessage', {
      chat_id: chatId,
      message_thread_id: topicId,
      from_chat_id: chatId,
      message_id: candidate.messageId,
      disable_notification: true,
    });
    if (!copied.response?.ok) {
      let detail = '';
      try { detail = await copied.response.text(); } catch {}
      throw new Error(`Telegram copyMessage failed: HTTP ${copied.response?.status || 0}${detail ? ` ${detail}` : ''}`);
    }
    const copiedMessageId = Number(copied.data?.result?.message_id) || null;

    const deleted = await telegramCall(fetchImpl, token, 'deleteMessage', {
      chat_id: chatId,
      message_id: candidate.messageId,
    });
    if (!deleted.response?.ok) {
      let detail = '';
      try { detail = await deleted.response.text(); } catch {}
      throw new Error(`Telegram source cinema delete failed: HTTP ${deleted.response?.status || 0}${detail ? ` ${detail}` : ''}`);
    }

    const originalList = await topicCache.get(candidate.key);
    if (Array.isArray(originalList)) {
      const remaining = originalList.map(Number).filter((id) => id !== candidate.messageId);
      if (remaining.length) {
        await topicCache.set(candidate.key, remaining, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-topic-messages'] });
      } else if (typeof topicCache.delete === 'function') {
        await topicCache.delete(candidate.key);
      }
    }

    const result = {
      migrated: true,
      topicId,
      sourceMessageId: candidate.messageId,
      copiedMessageId,
      sourceDateKey: candidate.dateKey,
    };
    await cinemaCache.set(MIGRATION_KEY, result, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-topic'],
      name: MIGRATION_KEY,
    });
    return result;
  }

  return { migrated: false, topicId, checked: seen.size };
}

async function handler(req, res) {
  const dateKey = dateKeyInMoscow();
  if (dateKey > '2026-08-26') return res.status(410).json({ ok: false, error: 'migration-expired' });
  if (!securelyMatchesMigrationKey(req.query?.key)) return res.status(401).json({ ok: false, error: 'unauthorized-migration' });
  try {
    const token = resolveTelegramBotToken(process.env);
    const topicCache = getTopicMaintenanceCache();
    const cinemaCache = getCinemaPremieresCache();
    const chatId = await getKnownForumChatId({ cache: topicCache }) || findForumChatIdInEnv(process.env);
    if (!chatId) throw new Error('Telegram forum chat id is unavailable for cinema migration');
    const result = await migrateCinemaPost({ token, chatId, topicCache, cinemaCache, fetchImpl: globalThis.fetch });
    return res.status(result.migrated || result.skipped ? 200 : 404).json({ ok: Boolean(result.migrated || result.skipped), ...result });
  } catch (error) {
    console.error('RUDI_CINEMA_TOPIC_MIGRATION_ERROR', error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.MIGRATION_KEY = MIGRATION_KEY;
module.exports.securelyMatchesMigrationKey = securelyMatchesMigrationKey;
module.exports.migrateCinemaPost = migrateCinemaPost;
