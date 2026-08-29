const localConfigDefault = require('../config/clients-advice.json');
const { fingerprintContent, getRecentFingerprints } = require('./content-fingerprint.cjs');
const { recordSourceHealth } = require('./source-health.cjs');

const CLIENTS_TOPIC_ID = 126;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/clients-advice.json';
const OLD_MARKER = /(?:💡\s*)?<b>Совет[^<\n]*от маркетолога<\/b>/i;
const TELEGRAM_CREATING_METHODS = new Set(['sendMessage', 'sendPhoto', 'sendDocument', 'sendVideo', 'sendAudio', 'sendVoice', 'sendAnimation']);

function isValidAdvice(item) {
  return item && typeof item === 'object'
    && typeof item.title === 'string' && item.title.trim()
    && typeof item.body === 'string' && item.body.trim()
    && typeof item.action === 'string' && item.action.trim();
}
function normalizeConfig(value) { return Array.isArray(value) && value.length && value.every(isValidAdvice) ? value : null; }
function moscowDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}
function deterministicIndex(items, value = new Date()) {
  const { year, month, day } = moscowDateParts(value);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  return ((dayNumber % items.length) + items.length) % items.length;
}
function selectAdviceForDate(config, value = new Date()) {
  const items = normalizeConfig(config); if (!items) throw new Error('Clients advice config is empty or invalid');
  return items[deterministicIndex(items, value)];
}
async function selectUnseenAdviceForDate(config, value = new Date(), options = {}) {
  const items = normalizeConfig(config); if (!items) throw new Error('Clients advice config is empty or invalid');
  const start = deterministicIndex(items, value);
  let seen = options.seenFingerprints;
  if (!(seen instanceof Set)) {
    try {
      seen = await getRecentFingerprints('clients', {
        cache: options.cache,
        days: Math.max(1, Number(options.days || 45)),
        now: options.now || value,
      });
    } catch {
      seen = new Set();
    }
  }
  for (let offset = 0; offset < items.length; offset += 1) {
    const item = items[(start + offset) % items.length];
    const fingerprint = fingerprintContent('clients', item);
    if (!seen.has(fingerprint)) return { item, fingerprint, exhausted: false, offset };
  }
  const item = items[start];
  return { item, fingerprint: fingerprintContent('clients', item), exhausted: true, offset: 0 };
}
function formatClientsAdvice(item) {
  if (!isValidAdvice(item)) throw new Error('Clients advice item is invalid');
  return ['💡 <b>Развитие для стилиста с 8-летним опытом</b>', '', `<b>${item.title.trim()}</b>`, item.body.trim(), '', '<b>Что сделать сегодня:</b>', item.action.trim()].join('\n');
}

async function safeRecordClientsAdviceHealth(source, itemCount, options = {}) {
  try {
    const recordHealth = options.recordHealth || recordSourceHealth;
    await recordHealth({
      sourceId: 'clients-advice',
      status: source === 'remote' ? 'healthy' : 'stale',
      itemCount,
      fallbackSource: source === 'remote' ? null : 'bundled-config',
      metadata: { configSource: source },
    }, {
      cache: options.sourceHealthCache || options.controlCache,
      now: options.now,
      secrets: options.secrets,
    });
  } catch (error) {
    console.warn('RUDI_CLIENTS_ADVICE_SOURCE_HEALTH_ERROR', String(error?.message || error));
  }
}

async function loadClientsAdviceConfig(options = {}) {
  const localConfig = normalizeConfig(options.localConfig || localConfigDefault) || localConfigDefault;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    await safeRecordClientsAdviceHealth('bundled-fallback', localConfig.length, options);
    return localConfig;
  }
  const baseUrl = String(options.configUrl || options.settings?.sources?.clientsAdviceConfigUrl || process.env.CLIENTS_ADVICE_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  try {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const response = await fetchImpl(`${baseUrl}${separator}r=${Date.now()}`, { headers: { accept: 'application/json', 'cache-control': 'no-cache' }, cache: 'no-store' });
    if (response?.ok) {
      const remote = normalizeConfig(await response.json());
      if (remote) {
        await safeRecordClientsAdviceHealth('remote', remote.length, options);
        return remote;
      }
    }
  } catch (error) {
    console.warn('RUDI_CLIENTS_ADVICE_CONFIG_ERROR', String(error?.message || error));
  }
  await safeRecordClientsAdviceHealth('bundled-fallback', localConfig.length, options);
  return localConfig;
}
function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try { const url = new URL(raw); if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return ''; return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || ''; } catch { return ''; }
}
function parsePayload(init = {}) {
  if (typeof init.body === 'string') { try { return JSON.parse(init.body); } catch { return null; } }
  if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
  return null;
}
function withPayloadField(init, payload, field, value) {
  if (typeof init.body === 'string') return { ...init, body: JSON.stringify({ ...payload, [field]: value }) };
  if (init.body instanceof URLSearchParams) { const body = new URLSearchParams(init.body); body.set(field, value); return { ...init, body }; }
  return init;
}
async function rewriteClientsTelegramRequest(input, init = {}, options = {}) {
  const method = telegramMethod(input); if (!TELEGRAM_CREATING_METHODS.has(method)) return init;
  const payload = parsePayload(init); if (Number(payload?.message_thread_id) !== CLIENTS_TOPIC_ID) return init;
  const field = typeof payload?.text === 'string' ? 'text' : (typeof payload?.caption === 'string' ? 'caption' : null);
  if (!field || !OLD_MARKER.test(payload[field])) return init;
  const config = await loadClientsAdviceConfig(options);
  const selection = await selectUnseenAdviceForDate(config, options.now || new Date(), {
    cache: options.dedupeCache,
    days: options.settings?.dedupe?.clientsDays || 45,
    now: options.now,
    seenFingerprints: options.seenFingerprints,
  });
  if (typeof options.onSelected === 'function') options.onSelected(selection);
  return withPayloadField(init, payload, field, formatClientsAdvice(selection.item));
}
function replaceAdviceSection(text, advice) {
  if (typeof text !== 'string') return text; const match = OLD_MARKER.exec(text); if (!match) return text;
  const start = text.lastIndexOf('💡', match.index); const prefix = text.slice(0, start >= 0 ? start : match.index).trimEnd(); return prefix ? `${prefix}\n\n${advice}` : advice;
}
function rewriteClientsPreviewPayloadWithAdvice(payload, advice) {
  const text = payload?.results?.clients?.preview?.message; if (typeof text !== 'string' || !OLD_MARKER.test(text)) return payload;
  return { ...payload, results: { ...payload.results, clients: { ...payload.results.clients, preview: { ...payload.results.clients.preview, message: replaceAdviceSection(text, advice) } } } };
}
async function rewriteClientsPreviewPayload(payload, options = {}) {
  const text = payload?.results?.clients?.preview?.message; if (typeof text !== 'string' || !OLD_MARKER.test(text)) return payload;
  const config = await loadClientsAdviceConfig(options);
  const selection = await selectUnseenAdviceForDate(config, options.now || new Date(), {
    cache: options.dedupeCache,
    days: options.settings?.dedupe?.clientsDays || 45,
    now: options.now,
    seenFingerprints: options.seenFingerprints,
  });
  return rewriteClientsPreviewPayloadWithAdvice(payload, formatClientsAdvice(selection.item));
}
module.exports = { CLIENTS_TOPIC_ID, DEFAULT_CONFIG_URL, selectAdviceForDate, selectUnseenAdviceForDate, formatClientsAdvice, loadClientsAdviceConfig, rewriteClientsTelegramRequest, rewriteClientsPreviewPayload, rewriteClientsPreviewPayloadWithAdvice, replaceAdviceSection };