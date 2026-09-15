const DEFAULT_HOLIDAYS_TOPIC_ID = 44;
const DEFAULT_MAX_ITEMS = 5;

const CONTENT_FIELDS = new Map([
  ['sendMessage', 'text'],
  ['sendPhoto', 'caption'],
  ['sendVideo', 'caption'],
  ['sendAnimation', 'caption'],
  ['sendDocument', 'caption'],
]);

const OFFICIAL_RUSSIA = [
  /нов(?:ый|ого) год/u,
  /рождеств[оа] христов/u,
  /день защитника отечества/u,
  /международн(?:ый|ого) женск(?:ий|ого) день/u,
  /праздник весны и труда/u,
  /день победы/u,
  /день россии/u,
  /день народного единства/u,
];

const MAJOR_CULTURAL = [
  /пасх/u,
  /крещен/u,
  /троиц/u,
  /маслениц/u,
  /день космонавтики/u,
  /день знаний/u,
  /день матери/u,
  /день отца/u,
  /день семьи(?:,| ) любви и верности/u,
];

const NICHE_MARKERS = [
  /смайлик/u,
  /свободн(?:ых|ые) ден(?:ег|ьги)/u,
  /необычн/u,
  /забавн/u,
  /день лен[иь]/u,
  /день объяти/u,
  /день поцелу/u,
  /день шоколад/u,
  /день кофе/u,
  /день пива/u,
];

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch {
    return '';
  }
}

function parsePayload(init = {}) {
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return null; }
  }
  if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
  return null;
}

function writePayload(init, payload) {
  if (typeof init.body === 'string') return { ...init, body: JSON.stringify(payload) };
  if (init.body instanceof URLSearchParams) {
    const body = new URLSearchParams(init.body);
    for (const [key, value] of Object.entries(payload)) body.set(key, String(value));
    return { ...init, body };
  }
  return init;
}

function normalizeHolidayText(value) {
  return String(value || '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt);/giu, ' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/\s+/gu, ' ')
    .trim();
}

function scoreHolidaySignificance(value) {
  const text = normalizeHolidayText(value);
  if (!text) return -Infinity;

  let score = 100;
  if (OFFICIAL_RUSSIA.some((pattern) => pattern.test(text))) score += 10000;
  else if (MAJOR_CULTURAL.some((pattern) => pattern.test(text))) score += 8000;
  else {
    if (/международн/u.test(text)) score += 6000;
    if (/всемирн/u.test(text)) score += 5500;
    if (/росси(?:и|йск)/u.test(text)) score += 2500;
    if (/памят|воинск|историческ|государственн|национальн/u.test(text)) score += 1800;
    if (/борьб[аы] с|здоров|донор|безопасност|прав[ао] человека/u.test(text)) score += 900;
    if (/работник|служб|професс|специалист/u.test(text)) score += 500;
  }

  if (NICHE_MARKERS.some((pattern) => pattern.test(text))) score -= 5000;
  return score;
}

function rankHolidayEntries(entries, maxItems = DEFAULT_MAX_ITEMS) {
  const limit = Math.max(1, Number.isInteger(Number(maxItems)) ? Number(maxItems) : DEFAULT_MAX_ITEMS);
  return entries
    .map((entry, index) => ({ entry, index, score: scoreHolidaySignificance(entry) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

const LIST_LINE_RE = /^(\s*(?:[•●▪◦‣·*\-–—]|\d{1,2}[.)])\s+)(.+)$/u;

function limitHolidayList(text, maxItems) {
  const lines = String(text || '').split('\n');
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(LIST_LINE_RE);
    if (match) rows.push({ index, prefix: match[1], value: match[2] });
  }
  if (rows.length <= maxItems) return text;

  const selected = new Set(rankHolidayEntries(rows.map((row) => row.value), maxItems));
  const remaining = new Map();
  for (const value of selected) remaining.set(value, (remaining.get(value) || 0) + 1);

  return lines.filter((_line, index) => {
    const row = rows.find((candidate) => candidate.index === index);
    if (!row) return true;
    const count = remaining.get(row.value) || 0;
    if (!count) return false;
    remaining.set(row.value, count - 1);
    return true;
  }).join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd();
}

function rewriteHolidayTelegramRequest(input, init = {}, settings = {}) {
  const method = telegramMethod(input);
  const field = CONTENT_FIELDS.get(method);
  if (!field) return init;

  const payload = parsePayload(init);
  if (!payload) return init;
  const holidaySettings = settings?.sections?.holidays || {};
  const topicId = Number(holidaySettings.topicId || DEFAULT_HOLIDAYS_TOPIC_ID);
  if (Number(payload.message_thread_id) !== topicId) return init;

  const maxItems = Math.max(1, Number(holidaySettings.maxItems || DEFAULT_MAX_ITEMS));
  const original = String(payload[field] || '');
  if (!original) return init;
  const limited = limitHolidayList(original, maxItems);
  if (limited === original) return init;
  return writePayload(init, { ...payload, [field]: limited });
}

module.exports = {
  DEFAULT_HOLIDAYS_TOPIC_ID,
  DEFAULT_MAX_ITEMS,
  normalizeHolidayText,
  scoreHolidaySignificance,
  rankHolidayEntries,
  limitHolidayList,
  rewriteHolidayTelegramRequest,
};
