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

  throw new Error('Cinema topic id is unavailable; refusing to create a duplicate Telegram forum topic');
}

module.exports = {
  CINEMA_TOPIC_CACHE_KEY,
  LEGACY_EVENTS_TOPIC_ID,
  resolveCinemaTopicId,
  ensureCinemaTopic,
};
