const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-daily-mood-v1';
const TTL_SECONDS = 60 * 60 * 72;
const ALLOWED_MOODS = new Set(['low', 'ok', 'great']);

function cacheOf(options = {}) {
  return options.moodCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function keyForDate(date) {
  return 'mood:' + String(date || '');
}

function normalizeRow(row, date) {
  const moods = row && typeof row === 'object' && row.moods && typeof row.moods === 'object'
    ? row.moods
    : {};
  return {
    date: String(date || row?.date || ''),
    moods: {
      'Рустам': ALLOWED_MOODS.has(String(moods?.['Рустам']?.mood || ''))
        ? { mood: String(moods['Рустам'].mood), updatedAt: String(moods['Рустам'].updatedAt || '') }
        : null,
      'Диана': ALLOWED_MOODS.has(String(moods?.['Диана']?.mood || ''))
        ? { mood: String(moods['Диана'].mood), updatedAt: String(moods['Диана'].updatedAt || '') }
        : null,
    },
  };
}

async function readDailyMood(date, options = {}) {
  const cache = cacheOf(options);
  const row = await cache.get(keyForDate(date));
  return normalizeRow(row, date);
}

async function setDailyMood(date, actor, mood, options = {}) {
  const normalizedMood = String(mood || '').trim();
  if (!['Рустам', 'Диана'].includes(actor)) throw new Error('mood-actor-invalid');
  if (!ALLOWED_MOODS.has(normalizedMood)) throw new Error('mood-value-invalid');

  const cache = cacheOf(options);
  const current = await readDailyMood(date, { ...options, moodCache: cache });
  current.moods[actor] = {
    mood: normalizedMood,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
  };
  await cache.set(keyForDate(date), current, {
    ttl: TTL_SECONDS,
    tags: ['rudi-daily-mood'],
  });
  return current;
}

function moodView(row, actor) {
  const partner = actor === 'Рустам' ? 'Диана' : 'Рустам';
  return {
    date: row.date,
    actor,
    partner,
    mine: row.moods?.[actor] || null,
    partnerMood: row.moods?.[partner] || null,
  };
}

module.exports = { readDailyMood, setDailyMood, moodView };
