const { createHash } = require('node:crypto');

const FACTS_TOPIC_ID = 72;
const LULU_TOPIC_ID = 85;
const LEGACY_PUBLISHED_IDS = new Set(['facts-sleep-7h', 'lulu-teeth-daily']);
const HISTORY_LIMIT = 1000;
const TARGET_METHODS = new Set(['sendMessage', 'sendPhoto', 'sendDocument', 'sendVideo', 'sendAnimation']);

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
  if (init.body instanceof URLSearchParams) {
    return Object.fromEntries(init.body.entries());
  }
  return null;
}

function replacePayloadField(init, payload, field, value) {
  if (typeof init.body === 'string') {
    return { ...init, body: JSON.stringify({ ...payload, [field]: value }) };
  }
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
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function topicKind(topicId) {
  if (Number(topicId) === FACTS_TOPIC_ID) return 'facts';
  if (Number(topicId) === LULU_TOPIC_ID) return 'lulu';
  return null;
}

function formatCatalogEntry(entry) {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.type === 'facts') {
    const label = String(entry.sourceLabel || 'Источник →').trim();
    return [
      '💡 <b>Полезные факты</b>',
      `${String(entry.emoji || '💡').trim()} <b>${String(entry.category || 'Факт').trim()}</b>`,
      '',
      String(entry.body || '').trim(),
      '',
      `<a href="${String(entry.sourceUrl || '').trim()}">${label}</a>`,
    ].join('\n');
  }
  if (entry.type === 'lulu') {
    return [
      '🐶 <b>Для Лулу</b>',
      '',
      `<b>${String(entry.title || '').trim()}</b>`,
      String(entry.body || '').trim(),
      '',
      `<a href="${String(entry.sourceUrl || '').trim()}">Источник →</a>`,
    ].join('\n');
  }
  return '';
}

function historyKey(topicId) {
  return `daily-content:${Number(topicId)}:history`;
}

function usedIdsKey(topicId) {
  return `daily-content:${Number(topicId)}:used-ids`;
}

function publicationDateKey(topicId, dateKey) {
  return `daily-content:${Number(topicId)}:date:${String(dateKey)}`;
}

function syntheticSuccess(topicId) {
  return new Response(JSON.stringify({
    ok: true,
    result: { message_id: 0, message_thread_id: Number(topicId), suppressed_duplicate: true },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function responseMessageId(response) {
  try {
    const body = await response.clone().json();
    return Number(body?.result?.message_id) || 0;
  } catch {
    return 0;
  }
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
    if (!seenFingerprints.has(candidateFingerprint)) {
      return { entry, message, fingerprint: candidateFingerprint };
    }
  }
  return null;
}

async function reservePublication(cache, topicId, dateKey, usedIds, record) {
  const id = String(record?.id || '').trim();
  if (!id) return;
  const nextUsedIds = [...new Set([...usedIds, id])];
  await cache.set(usedIdsKey(topicId), nextUsedIds, {
    tags: ['rudi-daily-content-used'],
    name: usedIdsKey(topicId),
  });
  await cache.set(publicationDateKey(topicId, dateKey), {
    id,
    fingerprint: String(record?.fingerprint || ''),
    reservedAt: String(record?.reservedAt || new Date().toISOString()),
  }, {
    tags: ['rudi-daily-content-date'],
    name: publicationDateKey(topicId, dateKey),
  });
}

async function rememberPublished(cache, topicId, history, record) {
  const next = [...history, record].slice(-HISTORY_LIMIT);
  await cache.set(historyKey(topicId), next, {
    tags: ['rudi-daily-content-history'],
    name: historyKey(topicId),
  });
  return next;
}

function wrapDailyContentDedupe(fetchImpl, options = {}) {
  const fingerprint = options.fingerprint || defaultFingerprint;
  const cache = options.cache;
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new Error('Daily content dedupe cache is required');
  }
  const catalog = options.catalog || { facts: [], lulu: [], publishedIds: [] };
  const alwaysReplace = options.alwaysReplace === true;

  return async (input, init = {}) => {
    const endpoint = telegramEndpoint(input);
    if (!endpoint || !TARGET_METHODS.has(endpoint.method)) return fetchImpl(input, init);

    const payload = parsePayload(init);
    const topicId = Number(payload?.message_thread_id);
    const kind = topicKind(topicId);
    if (!kind) return fetchImpl(input, init);

    const field = typeof payload?.text === 'string'
      ? 'text'
      : (typeof payload?.caption === 'string' ? 'caption' : null);
    if (!field) return fetchImpl(input, init);

    const now = new Date(options.now || Date.now());
    const dateKey = dateKeyInMoscow(now);
    const dateReservation = await cache.get(publicationDateKey(topicId, dateKey));
    if (dateReservation) return syntheticSuccess(topicId);

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
    const originalSeen = seenFingerprints.has(originalFingerprint);

    let actualMessage = originalMessage;
    let actualFingerprint = originalFingerprint;
    let contentId = null;

    if (alwaysReplace || originalSeen) {
      const replacement = chooseUnseenEntry(catalog[kind], seenFingerprints, fingerprint, seenIds);
      if (!replacement) return syntheticSuccess(topicId);
      actualMessage = replacement.message;
      actualFingerprint = replacement.fingerprint;
      contentId = String(replacement.entry.id || '') || null;
    }

    if (contentId) {
      await reservePublication(cache, topicId, dateKey, usedIds, {
        id: contentId,
        fingerprint: actualFingerprint,
        reservedAt: now.toISOString(),
      });
    }

    const nextInit = actualMessage === originalMessage
      ? init
      : replacePayloadField(init, payload, field, actualMessage);
    const response = await fetchImpl(input, nextInit);
    if (!response?.ok) return response;

    const messageId = await responseMessageId(response);
    if (messageId > 0) {
      await rememberPublished(cache, topicId, history, {
        fingerprint: actualFingerprint,
        id: contentId,
        messageId,
        dateKey,
        publishedAt: now.toISOString(),
      });
    }
    return response;
  };
}

module.exports = {
  FACTS_TOPIC_ID,
  LULU_TOPIC_ID,
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
  reservePublication,
};
