const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-holiday-highlights-v1';
const TTL_SECONDS = 60 * 60 * 48;

function cacheOf(options = {}) {
  return options.cache || createStrictRuntimeCache({ namespace: NAMESPACE, ...(options.cacheOptions || {}) });
}

function validDate(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('holiday-date-invalid');
  return date;
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

async function writeHolidayHighlights(date, items, options = {}) {
  const row = {
    date: validDate(date),
    items: normalizeItems(items),
    updatedAt: new Date(options.now || Date.now()).toISOString(),
  };
  if (!row.items.length) return row;
  await cacheOf(options).set(`day:${row.date}`, row, { ttl: TTL_SECONDS, tags: ['rudi-holiday-highlights'] });
  return row;
}

async function readHolidayHighlights(date, options = {}) {
  const row = await cacheOf(options).get(`day:${validDate(date)}`);
  if (!row || !Array.isArray(row.items)) return null;
  return { date: validDate(row.date || date), items: normalizeItems(row.items), updatedAt: row.updatedAt || null };
}

module.exports = { NAMESPACE, writeHolidayHighlights, readHolidayHighlights, normalizeItems };
