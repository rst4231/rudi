const CINEMA_TOPIC_CACHE_KEY = 'cinema-topic-id';
const LEGACY_EVENTS_TOPIC_ID = 19;
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

function validTopicId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveCinemaTopicId({ cache, configuredTopicId } = {}) {
  const configured = validTopicId(configuredTopicId);
  if (configured && configured !== LEGACY_EVENTS_TOPIC_ID) return configured;
  if (!cache || typeof cache.get !== 'function') return null;
  return validTopicId(await cache.get(CINEMA_TOPIC_CACHE_KEY));
}

async function ensureCinemaTopic(options = {}) {
  const cache = options.cache;
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new Error('Cinema topic cache is required');
  }

  const configured = validTopicId(options.configuredTopicId);
  if (configured && configured !== LEGACY_EVENTS_TOPIC_ID) {
    await cache.set(CINEMA_TOPIC_CACHE_KEY, configured, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['rudi-cinema-topic'],
      name: CINEMA_TOPIC_CACHE_KEY,
    });
    return { topicId: configured, source: 'config' };
  }

  const cached = await resolveCinemaTopicId({ cache, configuredTopicId: configured });
  if (cached) return { topicId: cached, source: 'cache' };

  const token = String(options.token || '').trim();
  const chatId = options.chatId;
  if (!token) throw new Error('Telegram bot token is required to create cinema topic');
  if (chatId === undefined || chatId === null || chatId === '') throw new Error('Telegram forum chat id is required to create cinema topic');

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/createForumTopic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, name: 'Кинопремьеры' }),
  });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram createForumTopic failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  const data = await response.json();
  const topicId = validTopicId(data?.result?.message_thread_id);
  if (!topicId) throw new Error('Telegram createForumTopic returned no message_thread_id');

  await cache.set(CINEMA_TOPIC_CACHE_KEY, topicId, {
    ttl: CACHE_TTL_SECONDS,
    tags: ['rudi-cinema-topic'],
    name: CINEMA_TOPIC_CACHE_KEY,
  });
  return { topicId, source: 'created' };
}

module.exports = {
  CINEMA_TOPIC_CACHE_KEY,
  LEGACY_EVENTS_TOPIC_ID,
  resolveCinemaTopicId,
  ensureCinemaTopic,
};
