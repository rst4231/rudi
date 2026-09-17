const { createHash } = require('node:crypto');

const FACTS_TOPIC_ID = 72;
const LEGACY_PUBLISHED_IDS = new Set(['facts-sleep-7h']);
const HISTORY_LIMIT = 1000;
const TARGET_METHODS = new Set(['sendMessage', 'sendPhoto', 'sendDocument', 'sendVideo', 'sendAnimation']);
const DAY_MS = 24 * 60 * 60 * 1000;

function telegramEndpoint(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return null;
    const match = url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/);
    return match ? { method: match[1] } : null;
  } catch {
    return null;
  }
}

function parsePayload(init = {}) {
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return null; }
  }
  if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
  return null;
}

function replacePayloadField(init, payload, field, value) {
  if (typeof init.body === 'string') return { ...init, body: JSON.stringify({ ...payload, [field]: value }) };
  if (init.body instanceof URLSearchParams) {
    const body = new URLSearchParams(init.body);
    body.set(field, value);
    return { ...init, body };
  }
  return init;
}

function normalizeMessage(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .toLocaleLowerCase('ru-RU');
}

function defaultFingerprint(text) {
  return createHash('sha256').update(normalizeMessage(text)).digest('hex');
}

function dateKeyInMoscow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatCatalogEntry(entry) {
  if (!entry || entry.type !== 'facts') return '';
  const label = String(entry.sourceLabel || 'Источник →').trim();
  const application = String(entry.application || '').trim();
  const parts = [
    '💡 <b>Полезные факты</b>',
    `${String(entry.emoji || '💡').trim()} <b>${String(entry.category || 'Факт').trim()}</b>`,
    '',
    String(entry.body || '').trim(),
  ];
  if (application) parts.push('', '🧩 <b>Как использовать в жизни</b>', application);
  parts.push('', `<a href="${String(entry.sourceUrl || '').trim()}">${label}</a>`);
  return parts.join('\n');
}

function historyKey(topicId) { return `daily-content:${Number(topicId)}:history`; }
function usedIdsKey(topicId) { return `daily-content:${Number(topicId)}:used-ids`; }
function publicationDateKey(topicId, dateKey) { return `daily-content:${Number(topicId)}:date:${String(dateKey)}`; }

function syntheticSuccess(topicId) {
  return new Response(JSON.stringify({
    ok: true,
    result: { message_id: 0, message_thread_id: Number(topicId), suppressed_duplicate: true },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function responseMessageId(response) {
  try { return Number((await response.clone().json())?.result?.message_id) || 0; }
  catch { return 0; }
}

async function loadHistory(cache, topicId) {
  const value = await cache.get(historyKey(topicId));
  return Array.isArray(value) ? value : [];
}

async function loadUsedIds(cache, topicId) {
  const value = await cache.get(usedIdsKey(topicId));
  return Array.isArray(value) ? value.map((id) => String(id || '').trim()).filter(Boolean) : [];
}

function chooseUnseenEntry(entries, seenFingerprints, fingerprint, seenIds = new Set()) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    const entryId = String(entry?.id || '').trim();
    if (entryId && seenIds.has(entryId)) continue;
    const message = formatCatalogEntry(entry);
    if (!message) continue;
    const candidateFingerprint = fingerprint(message);
    if (!seenFingerprints.has(candidateFingerprint)) return { entry, message, fingerprint: candidateFingerprint };
  }
  return null;
}

function dateOffset(startDateKey, currentDateKey) {
  const start = Date.parse(`${String(startDateKey)}T00:00:00.000Z`);
  const current = Date.parse(`${String(currentDateKey)}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
  return Math.round((current - start) / DAY_MS);
}

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function chooseWeekdayFact(entries, sequence, dateKey) {
  const offset = dateOffset(sequence.startDate, dateKey);
  if (!Number.isInteger(offset) || offset < 0) return null;
  const start = new Date(`${sequence.startDate}T00:00:00.000Z`);
  const current = new Date(`${dateKey}T00:00:00.000Z`);
  const currentWeekday = current.getUTCDay();
  const category = String(sequence.factsWeekdays?.[WEEKDAY_KEYS[currentWeekday]] || '').trim();
  if (!category) return null;
  const firstOccurrenceOffset = (currentWeekday - start.getUTCDay() + 7) % 7;
  const occurrenceIndex = (offset - firstOccurrenceOffset) / 7;
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) return null;
  return entries.filter((entry) => String(entry?.category || '').trim() === category)[occurrenceIndex] || null;
}

function chooseSequencedEntry(catalog, dateKey, fingerprint = defaultFingerprint) {
  const sequence = catalog?.sequence;
  if (!sequence) return { enabled: false, replacement: null };
  const offset = dateOffset(sequence.startDate, dateKey);
  if (!Number.isInteger(offset) || offset < 0) return { enabled: true, replacement: null };
  const entries = Array.isArray(catalog?.facts) ? catalog.facts : [];
  let entry = null;
  if (sequence.factsWeekdays) entry = chooseWeekdayFact(entries, sequence, dateKey);
  else {
    const startIndex = entries.findIndex((candidate) => String(candidate?.id || '') === String(sequence.factsStartId || ''));
    if (startIndex < 0) return { enabled: true, replacement: null };
    entry = entries[startIndex + offset];
  }
  if (!entry) return { enabled: true, replacement: null };
  const message = formatCatalogEntry(entry);
  if (!message) return { enabled: true, replacement: null };
  return { enabled: true, replacement: { entry, message, fingerprint: fingerprint(message) } };
}

async function reservePublication(cache, topicId, dateKey, usedIds, record) {
  const id = String(record?.id || '').trim();
  if (!id) return;
  const nextUsedIds = [...new Set([...usedIds, id])];
  await cache.set(usedIdsKey(topicId), nextUsedIds, { tags: ['rudi-daily-content-used'], name: usedIdsKey(topicId) });
  await cache.set(publicationDateKey(topicId, dateKey), {
    id,
    fingerprint: String(record?.fingerprint || ''),
    reservedAt: String(record?.reservedAt || new Date().toISOString()),
  }, { tags: ['rudi-daily-content-date'], name: publicationDateKey(topicId, dateKey) });
}

async function rememberPublished(cache, topicId, history, record) {
  const next = [...history, record].slice(-HISTORY_LIMIT);
  await cache.set(historyKey(topicId), next, { tags: ['rudi-daily-content-history'], name: historyKey(topicId) });
  return next;
}

function wrapDailyContentDedupe(fetchImpl, options = {}) {
  const fingerprint = options.fingerprint || defaultFingerprint;
  const cache = options.cache;
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') throw new Error('Daily content dedupe cache is required');
  const catalog = options.catalog || { facts: [], publishedIds: [], sequence: null };
  const alwaysReplace = options.alwaysReplace === true;

  return async (input, init = {}) => {
    const endpoint = telegramEndpoint(input);
    if (!endpoint || !TARGET_METHODS.has(endpoint.method)) return fetchImpl(input, init);
    const payload = parsePayload(init);
    const topicId = Number(payload?.message_thread_id);
    if (topicId !== FACTS_TOPIC_ID) return fetchImpl(input, init);
    const field = typeof payload?.text === 'string' ? 'text' : (typeof payload?.caption === 'string' ? 'caption' : null);
    if (!field) return fetchImpl(input, init);

    const now = new Date(options.now || Date.now());
    const dateKey = dateKeyInMoscow(now);
    if (await cache.get(publicationDateKey(topicId, dateKey))) return syntheticSuccess(topicId);

    const originalMessage = payload[field];
    const originalFingerprint = fingerprint(originalMessage);
    const history = await loadHistory(cache, topicId);
    if (history.some((row) => row?.dateKey === dateKey)) return syntheticSuccess(topicId);

    const usedIds = await loadUsedIds(cache, topicId);
    const seenFingerprints = new Set(history.map((row) => String(row?.fingerprint || '')).filter(Boolean));
    const seenIds = new Set([
      ...LEGACY_PUBLISHED_IDS,
      ...usedIds,
      ...history.map((row) => String(row?.id || '').trim()).filter(Boolean),
      ...(Array.isArray(catalog.publishedIds) ? catalog.publishedIds.map((id) => String(id || '').trim()).filter(Boolean) : []),
    ]);

    let actualMessage = originalMessage;
    let actualFingerprint = originalFingerprint;
    let contentId = null;
    if (alwaysReplace || seenFingerprints.has(originalFingerprint)) {
      const sequenced = chooseSequencedEntry(catalog, dateKey, fingerprint);
      const replacement = sequenced.enabled ? sequenced.replacement : chooseUnseenEntry(catalog.facts, seenFingerprints, fingerprint, seenIds);
      if (!replacement) return syntheticSuccess(topicId);
      const replacementId = String(replacement.entry?.id || '').trim();
      if (sequenced.enabled && (seenIds.has(replacementId) || seenFingerprints.has(replacement.fingerprint))) return syntheticSuccess(topicId);
      actualMessage = replacement.message;
      actualFingerprint = replacement.fingerprint;
      contentId = replacementId || null;
    }

    if (contentId) await reservePublication(cache, topicId, dateKey, usedIds, { id: contentId, fingerprint: actualFingerprint, reservedAt: now.toISOString() });
    const nextInit = actualMessage === originalMessage ? init : replacePayloadField(init, payload, field, actualMessage);
    const response = await fetchImpl(input, nextInit);
    if (!response?.ok) return response;
    const messageId = await responseMessageId(response);
    if (messageId > 0) await rememberPublished(cache, topicId, history, { fingerprint: actualFingerprint, id: contentId, messageId, dateKey, publishedAt: now.toISOString() });
    return response;
  };
}

module.exports = {
  FACTS_TOPIC_ID,
  LEGACY_PUBLISHED_IDS,
  normalizeMessage,
  defaultFingerprint,
  dateKeyInMoscow,
  formatCatalogEntry,
  wrapDailyContentDedupe,
  historyKey,
  usedIdsKey,
  publicationDateKey,
  chooseUnseenEntry,
  chooseSequencedEntry,
  reservePublication,
};
