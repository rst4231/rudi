const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-work-calendar-v1';
const URL_KEY = 'calendar-url';
const URL_TTL_SECONDS = 60 * 60 * 24 * 3650;
const WEEK_TTL_SECONDS = 60 * 15;
const EXPECTED_URL_SHA256 = '9425d13748478c8a257645560bd33075ff446bc5e814cbbe8377c6a0af99e86c';
const DEFAULT_TIMEZONE = 'Europe/Moscow';

function cacheOf(options = {}) {
  return options.cache || createStrictRuntimeCache({ namespace: NAMESPACE, ...(options.cacheOptions || {}) });
}

function normalizeCalendarUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('calendar-url-empty');
  const https = raw.replace(/^webcal:/i, 'https:');
  let url;
  try { url = new URL(https); } catch { throw new Error('calendar-url-invalid'); }
  if (url.protocol !== 'https:' || !/\.icloud\.com$/i.test(url.hostname)) throw new Error('calendar-url-invalid');
  return raw;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function decodeSetupKey(value) {
  const key = String(value || '').trim();
  if (!key) throw new Error('calendar-setup-key-required');
  let raw;
  try { raw = Buffer.from(key, 'base64url').toString('utf8'); } catch { throw new Error('calendar-setup-key-invalid'); }
  if (!raw || sha256(raw) !== EXPECTED_URL_SHA256) throw new Error('calendar-setup-key-invalid');
  return normalizeCalendarUrl(raw);
}

async function saveCalendarUrl(url, options = {}) {
  const normalized = normalizeCalendarUrl(url);
  if (sha256(normalized) !== EXPECTED_URL_SHA256) throw new Error('calendar-url-not-allowed');
  await cacheOf(options).set(URL_KEY, normalized, { ttl: URL_TTL_SECONDS, tags: ['rudi-work-calendar'] });
  return true;
}

async function readCalendarUrl(options = {}) {
  const value = await cacheOf(options).get(URL_KEY);
  return value ? normalizeCalendarUrl(value) : '';
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r?\n[ \t]/g, '');
}

function unescapeIcsText(value) {
  return String(value || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseProperty(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(';');
  const name = parts.shift().toUpperCase();
  const params = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

function parseRRule(value) {
  return Object.fromEntries(String(value || '').split(';').map((part) => {
    const eq = part.indexOf('=');
    return eq > 0 ? [part.slice(0, eq).toUpperCase(), part.slice(eq + 1)] : [part.toUpperCase(), ''];
  }));
}

function localParts(date, timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedLocalToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = DEFAULT_TIMEZONE) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const seen = localParts(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(Number(seen.year), Number(seen.month) - 1, Number(seen.day), Number(seen.hour), Number(seen.minute), Number(seen.second));
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const delta = targetAsUtc - seenAsUtc;
    if (!delta) break;
    guess += delta;
  }
  return new Date(guess);
}

function parseIcsDate(prop, fallbackTimeZone = DEFAULT_TIMEZONE) {
  if (!prop) return null;
  const value = String(prop.value || '').trim();
  const isDate = prop.params?.VALUE === 'DATE' || /^\d{8}$/.test(value);
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0),
  };
  let date;
  if (match[7]) date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  else date = zonedLocalToUtc(parts, prop.params?.TZID || fallbackTimeZone);
  return { date, allDay: isDate, timeZone: prop.params?.TZID || fallbackTimeZone, raw: value };
}

function parseEvents(ics, fallbackTimeZone = DEFAULT_TIMEZONE) {
  const lines = unfoldIcs(ics).split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parseProperty(line);
    if (!prop) continue;
    if (prop.name === 'DTSTART') current.start = parseIcsDate(prop, fallbackTimeZone);
    else if (prop.name === 'DTEND') current.end = parseIcsDate(prop, fallbackTimeZone);
    else if (prop.name === 'SUMMARY') current.summary = unescapeIcsText(prop.value);
    else if (prop.name === 'UID') current.uid = String(prop.value || '').trim();
    else if (prop.name === 'STATUS') current.status = String(prop.value || '').trim().toUpperCase();
    else if (prop.name === 'RRULE') current.rrule = parseRRule(prop.value);
    else if (prop.name === 'RECURRENCE-ID') current.recurrenceId = parseIcsDate(prop, fallbackTimeZone);
    else if (prop.name === 'EXDATE') {
      current.exdates = current.exdates || [];
      for (const raw of String(prop.value || '').split(',')) {
        const parsed = parseIcsDate({ ...prop, value: raw }, fallbackTimeZone);
        if (parsed) current.exdates.push(parsed);
      }
    }
  }
  return events.filter((event) => event.start || event.recurrenceId);
}

function dateKeyFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateKey(date, timeZone = DEFAULT_TIMEZONE) {
  return dateKeyFromParts(localParts(date, timeZone));
}

function shiftDateKey(key, days) {
  const [year, month, day] = String(key).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function dateKeyDiff(a, b) {
  const aa = new Date(a + 'T00:00:00Z');
  const bb = new Date(b + 'T00:00:00Z');
  return Math.round((aa - bb) / 86400000);
}

function weekdayCode(key) {
  const d = new Date(key + 'T00:00:00Z');
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d.getUTCDay()];
}

function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (ay - by) * 12 + (am - bm);
}

function occurrenceMatches(event, candidateKey, tz = DEFAULT_TIMEZONE) {
  const startKey = dateKey(event.start.date, tz);
  if (candidateKey < startKey) return false;
  const rule = event.rrule;
  if (!rule) return candidateKey === startKey;

  const interval = Math.max(1, Number(rule.INTERVAL || 1));
  const byday = String(rule.BYDAY || '').split(',').filter(Boolean).map((v) => v.slice(-2));
  const freq = String(rule.FREQ || '').toUpperCase();
  const diff = dateKeyDiff(candidateKey, startKey);

  if (rule.UNTIL) {
    const until = parseIcsDate({ value: rule.UNTIL, params: {} }, tz);
    if (until && candidateKey > dateKey(until.date, tz)) return false;
  }

  if (freq === 'DAILY') {
    if (diff < 0 || diff % interval !== 0) return false;
    return !byday.length || byday.includes(weekdayCode(candidateKey));
  }
  if (freq === 'WEEKLY') {
    if (diff < 0 || Math.floor(diff / 7) % interval !== 0) return false;
    return (byday.length ? byday : [weekdayCode(startKey)]).includes(weekdayCode(candidateKey));
  }
  if (freq === 'MONTHLY') {
    if (monthDiff(candidateKey, startKey) % interval !== 0) return false;
    const targetDay = Number(rule.BYMONTHDAY || startKey.slice(8, 10));
    return Number(candidateKey.slice(8, 10)) === targetDay;
  }
  if (freq === 'YEARLY') {
    return candidateKey.slice(5) === startKey.slice(5);
  }
  return candidateKey === startKey;
}

function occurrenceStartForKey(event, key, tz = DEFAULT_TIMEZONE) {
  const source = localParts(event.start.date, tz);
  const [year, month, day] = key.split('-').map(Number);
  if (event.start.allDay) return zonedLocalToUtc({ year, month, day }, tz);
  return zonedLocalToUtc({
    year, month, day,
    hour: Number(source.hour), minute: Number(source.minute), second: Number(source.second),
  }, tz);
}

function isExcluded(event, occurrenceStart, tz = DEFAULT_TIMEZONE) {
  return (event.exdates || []).some((row) => {
    if (row.allDay) return dateKey(row.date, tz) === dateKey(occurrenceStart, tz);
    return Math.abs(row.date.getTime() - occurrenceStart.getTime()) < 1000;
  });
}

function formatTime(date, tz = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function rollingStart(now = new Date(), tz = DEFAULT_TIMEZONE, dayOffset = 0) {
  return shiftDateKey(dateKey(now, tz), Number(dayOffset || 0));
}

function buildRange(events, startKey, dayCount = 7, tz = DEFAULT_TIMEZONE) {
  const safeDayCount = Math.max(1, Math.min(62, Number(dayCount || 7)));
  const days = Array.from({ length: safeDayCount }, (_, index) => ({
    date: shiftDateKey(startKey, index),
    events: [],
  }));
  const overrideIds = new Set(events.filter((e) => e.recurrenceId && e.uid).map((e) => `${e.uid}:${dateKey(e.recurrenceId.date, tz)}`));

  for (const event of events) {
    if (event.recurrenceId) {
      if (event.status === 'CANCELLED' || !event.start) continue;
      const key = dateKey(event.start.date, tz);
      const day = days.find((row) => row.date === key);
      if (day) day.events.push({
        title: event.summary || 'Работа',
        start: event.start.date,
        end: event.end?.date || new Date(event.start.date.getTime() + 60 * 60 * 1000),
        allDay: event.start.allDay,
      });
      continue;
    }

    if (event.status === 'CANCELLED' || !event.start) continue;

    for (const day of days) {
      if (!occurrenceMatches(event, day.date, tz)) continue;
      if (event.uid && overrideIds.has(`${event.uid}:${day.date}`)) continue;
      const start = occurrenceStartForKey(event, day.date, tz);
      if (isExcluded(event, start, tz)) continue;
      const duration = event.end ? Math.max(0, event.end.date.getTime() - event.start.date.getTime()) : 60 * 60 * 1000;
      day.events.push({
        title: event.summary || 'Работа',
        start,
        end: new Date(start.getTime() + duration),
        allDay: event.start.allDay,
      });
    }
  }

  return days.map((day) => ({
    date: day.date,
    working: day.events.length > 0,
    events: day.events
      .sort((a, b) => a.start - b.start)
      .map((event) => ({
        title: event.title,
        allDay: event.allDay,
        startTime: event.allDay ? null : formatTime(event.start, tz),
        endTime: event.allDay ? null : formatTime(event.end, tz),
      })),
  }));
}

function buildWeek(events, startKey, tz = DEFAULT_TIMEZONE) {
  return buildRange(events, startKey, 7, tz);
}

function monthRange(now = new Date(), tz = DEFAULT_TIMEZONE, monthOffset = 0) {
  const today = dateKey(now, tz);
  const [year, month] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + Number(monthOffset || 0), 1));
  const rangeYear = first.getUTCFullYear();
  const rangeMonth = first.getUTCMonth() + 1;
  const startKey = [
    rangeYear,
    String(rangeMonth).padStart(2, '0'),
    '01',
  ].join('-');
  const dayCount = new Date(Date.UTC(rangeYear, rangeMonth, 0)).getUTCDate();
  return { startKey, dayCount };
}

async function fetchCalendarText(calendarUrl, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = normalizeCalendarUrl(calendarUrl).replace(/^webcal:/i, 'https:');
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'RUDI-Work-Calendar/1.0', accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.8' },
    cache: 'no-store',
  });
  if (!response?.ok) throw new Error(`calendar-fetch-failed-${response?.status || 0}`);
  return response.text();
}

async function getWorkWeek(options = {}) {
  const tz = options.timeZone || DEFAULT_TIMEZONE;
  const now = options.now || new Date();
  const view = ['month', 'next-month'].includes(String(options.view || ''))
    ? String(options.view)
    : 'week';

  let startKey;
  let dayCount;
  if (view === 'month' || view === 'next-month') {
    const range = monthRange(now, tz, view === 'next-month' ? 1 : 0);
    startKey = range.startKey;
    dayCount = range.dayCount;
  } else {
    startKey = rollingStart(now, tz, 0);
    dayCount = 7;
  }

  const cache = cacheOf(options);
  const cacheKey = `range:${view}:${startKey}:${dayCount}`;
  const cached = await cache.get(cacheKey);
  const calendarUrl = options.calendarUrl ? normalizeCalendarUrl(options.calendarUrl) : await readCalendarUrl({ ...options, cache });
  if (!calendarUrl) return { configured: false, view, weekStart: startKey, days: [] };

  try {
    const ics = await fetchCalendarText(calendarUrl, options);
    const events = parseEvents(ics, tz);
    const days = buildRange(events, startKey, dayCount, tz);
    const result = {
      configured: true,
      view,
      weekStart: startKey,
      days,
      updatedAt: new Date().toISOString(),
    };
    await cache.set(cacheKey, result, { ttl: WEEK_TTL_SECONDS, tags: ['rudi-work-calendar'] });
    return result;
  } catch (error) {
    if (cached?.days) return { ...cached, stale: true, error: String(error?.message || error) };
    throw error;
  }
}

module.exports = {
  NAMESPACE, EXPECTED_URL_SHA256, DEFAULT_TIMEZONE,
  normalizeCalendarUrl, sha256, decodeSetupKey, saveCalendarUrl, readCalendarUrl,
  unfoldIcs, parseEvents, parseRRule, parseIcsDate, rollingStart, monthRange, buildRange, buildWeek, getWorkWeek,
};
