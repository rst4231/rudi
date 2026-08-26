const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const LABOR_TOPIC_LOOKBACK_DAYS = 45;
const CLIENTS_TOPIC_ID = 126;
const LABOR_TOPIC_CACHE_OPTIONS = {
  ttl: 60 * 60 * 24 * 3650,
  tags: ['rudi-labor-topic'],
};

function getTopicMaintenanceCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-topic-maintenance-v1', ...options });
}

function getDailyContentCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-daily-content-v1', confirmWrites: false, ...options });
}

function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function validTopicId(value) {
  const topicId = Number(value);
  return Number.isInteger(topicId) && topicId > 0 ? topicId : null;
}

function validLaborTopicId(value) {
  const topicId = validTopicId(value);
  return topicId && topicId !== CLIENTS_TOPIC_ID ? topicId : null;
}

async function restoreLaborTopicId(cache, topicId) {
  try {
    await cache.set('labor:topic-id', topicId, LABOR_TOPIC_CACHE_OPTIONS);
  } catch (error) {
    console.warn('RUDI_LABOR_TOPIC_CACHE_RESTORE_ERROR', String(error?.message || error));
  }
  return topicId;
}

function guardLaborTopicCache(cache, options = {}) {
  const todayKey = moscowDateKey(options.now || new Date());

  return {
    async get(key) {
      const direct = await cache.get(key);
      if (key !== 'labor:topic-id') return direct;

      const directTopicId = validLaborTopicId(direct);
      if (directTopicId) return directTopicId;

      for (let ageDays = 0; ageDays <= LABOR_TOPIC_LOOKBACK_DAYS; ageDays += 1) {
        const dateKey = shiftDateKey(todayKey, -ageDays);
        const recorded = await cache.get(`labor:message:${dateKey}`);
        const recoveredTopicId = validLaborTopicId(recorded?.topicId);
        if (!recoveredTopicId) continue;
        return restoreLaborTopicId(cache, recoveredTopicId);
      }

      throw new Error('Labor topic id is unavailable; refusing to create a duplicate Telegram forum topic');
    },
    set(key, value, cacheOptions) {
      return cache.set(key, value, cacheOptions);
    },
    delete(key) {
      return cache.delete(key);
    },
    expireTag(tag) {
      if (typeof cache.expireTag !== 'function') throw new Error('Runtime Cache expireTag is unavailable');
      return cache.expireTag(tag);
    },
  };
}

function getLaborCache(options = {}) {
  const { now, fallbackTopicId: _ignoredFallbackTopicId, ...cacheOptions } = options;
  const cache = createStrictRuntimeCache({ namespace: 'rudi-labor-code-v1', ...cacheOptions });
  return guardLaborTopicCache(cache, { now });
}

function getLaborLeaseCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-labor-publication-lock-v1', ...options });
}

function getRecoveryCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-one-time-recovery-v1', ...options });
}

function getCinemaPremieresCache(options = {}) {
  return createStrictRuntimeCache({ namespace: 'rudi-cinema-premieres-v1', ...options });
}

module.exports = {
  LABOR_TOPIC_LOOKBACK_DAYS,
  CLIENTS_TOPIC_ID,
  getTopicMaintenanceCache,
  getDailyContentCache,
  getLaborCache,
  getLaborLeaseCache,
  getRecoveryCache,
  getCinemaPremieresCache,
  guardLaborTopicCache,
};