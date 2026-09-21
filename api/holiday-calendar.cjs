const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { rankHolidayEntries, DEFAULT_MAX_ITEMS } = require('./holiday-significance.cjs');

const NAMESPACE = 'rudi-holiday-calendar-v1';
const SOURCE_ORIGIN = 'https://kakoysegodnyaprazdnik.com';
const COMPLETE_TTL_SECONDS = 60 * 60 * 24 * 45;
const PARTIAL_TTL_SECONDS = 60 * 30;
const TIME_ZONE = 'Europe/Moscow';
const MONTH_SLUGS = [
  'yanvarya','fevralya','marta','aprelya','maya','iyunya',
  'iyulya','avgusta','sentyabrya','oktyabrya','noyabrya','dekabrya',
];

function cacheOf(options = {}) {
  return options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const row = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${row.year}-${row.month}-${row.day}`;
}

function monthRange(now = new Date(), view = 'month') {
  const [year, month] = moscowDateKey(now).split('-').map(Number);
  const offset = view === 'next-month' ? 1 : 0;
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const rangeYear = first.getUTCFullYear();
  const rangeMonth = first.getUTCMonth() + 1;
  return {
    view: offset ? 'next-month' : 'month',
    year: rangeYear,
    month: rangeMonth,
    dayCount: new Date(Date.UTC(rangeYear, rangeMonth, 0)).getUTCDate(),
    monthKey: `${rangeYear}-${String(rangeMonth).padStart(2, '0')}`,
  };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_match, number) => String.fromCodePoint(parseInt(number, 16) || 32))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—');
}

function htmlText(value) {
  return decodeHtml(
    String(value || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function parseHolidayPage(html, maxItems = DEFAULT_MAX_ITEMS) {
  const source = String(html || '');
  const lower = source.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const heading = lower.indexOf('какой праздник');
  if (heading < 0) return [];
  const orthodox = lower.indexOf('православные праздники', heading);
  const end = orthodox > heading ? orthodox : Math.min(source.length, heading + 45000);
  const scope = source.slice(heading, end);
  const candidates = [];
  const seen = new Set();
  const listItem = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = listItem.exec(scope))) {
    const value = htmlText(match[1]);
    const normalized = value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
    if (!value || value.length < 3 || value.length > 180) continue;
    if (/^(главная|что завтра|что было вчера|контакты|предыдущий|следующий)$/u.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    candidates.push(value);
  }
  return rankHolidayEntries(candidates, maxItems);
}

function sourceUrl(day, month) {
  const slug = MONTH_SLUGS[Number(month) - 1];
  if (!slug || !Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > 31) {
    throw new Error('holiday-calendar-date-invalid');
  }
  return `${SOURCE_ORIGIN}/prazdniki-${Number(day)}-${slug}.html`;
}

async function fetchHolidayDay(year, month, day, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('holiday-calendar-fetch-unavailable');
  const response = await fetchImpl(sourceUrl(day, month), {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'RUDI-Holiday-Calendar/1.0',
    },
    cache: 'no-store',
  });
  if (!response?.ok) throw new Error(`holiday-calendar-source-http-${response?.status || 0}`);
  const html = await response.text();
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    items: parseHolidayPage(html, options.maxItems || DEFAULT_MAX_ITEMS),
  };
}

async function fetchHolidayMonth(range, options = {}) {
  const days = [];
  const batchSize = Math.max(2, Math.min(8, Number(options.batchSize || 6)));
  let failures = 0;
  for (let start = 1; start <= range.dayCount; start += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, range.dayCount - start + 1) },
      (_, index) => start + index
    );
    const rows = await Promise.all(batch.map(async (day) => {
      try {
        return await fetchHolidayDay(range.year, range.month, day, options);
      } catch (error) {
        failures += 1;
        return {
          date: `${range.year}-${String(range.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          items: [],
          unavailable: true,
        };
      }
    }));
    days.push(...rows);
  }
  return { days, failures };
}

function validCachedMonth(value, range) {
  if (!value || typeof value !== 'object') return null;
  if (value.monthKey !== range.monthKey || !Array.isArray(value.days) || value.days.length !== range.dayCount) return null;
  return {
    view: range.view,
    monthKey: range.monthKey,
    year: range.year,
    month: range.month,
    days: value.days.map((day) => ({
      date: String(day?.date || ''),
      items: Array.isArray(day?.items) ? day.items.slice(0, DEFAULT_MAX_ITEMS).map(String) : [],
      unavailable: Boolean(day?.unavailable),
    })),
    complete: value.complete !== false,
    generatedAt: String(value.generatedAt || ''),
    cached: true,
  };
}

async function getHolidayCalendar(options = {}) {
  const range = monthRange(options.now || new Date(), options.view || 'month');
  const cache = cacheOf(options);
  const key = 'month:' + range.monthKey;
  const cached = validCachedMonth(await cache.get(key).catch(() => null), range);
  if (cached && cached.complete) return cached;

  const fetched = await fetchHolidayMonth(range, options);
  const previousByDate = new Map((cached?.days || []).map((day) => [day.date, day]));
  const days = fetched.days.map((day) => {
    if (!day.unavailable || day.items.length) return day;
    const previous = previousByDate.get(day.date);
    return previous?.items?.length ? { ...previous, unavailable: false } : day;
  });
  const unavailable = days.filter((day) => day.unavailable).length;
  const state = {
    view: range.view,
    monthKey: range.monthKey,
    year: range.year,
    month: range.month,
    days,
    complete: unavailable === 0,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
  };
  await cache.set(key, state, {
    ttl: state.complete ? COMPLETE_TTL_SECONDS : PARTIAL_TTL_SECONDS,
    tags: ['rudi-holiday-calendar'],
  }).catch((error) => {
    console.warn('RUDI_HOLIDAY_CALENDAR_CACHE_WARN', String(error?.message || error));
  });
  return { ...state, cached: false };
}

module.exports = {
  NAMESPACE,
  SOURCE_ORIGIN,
  MONTH_SLUGS,
  moscowDateKey,
  monthRange,
  decodeHtml,
  htmlText,
  parseHolidayPage,
  sourceUrl,
  fetchHolidayDay,
  fetchHolidayMonth,
  validCachedMonth,
  getHolidayCalendar,
};
