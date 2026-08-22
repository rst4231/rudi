const localConfigDefault = require('../config/clients-advice.json');

const CLIENTS_TOPIC_ID = 126;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/config/clients-advice.json';
const OLD_MARKER = /(?:💡\s*)?<b>Совет[^<\n]*от маркетолога<\/b>/i;
const TELEGRAM_CREATING_METHODS = new Set([
  'sendMessage', 'sendPhoto', 'sendDocument', 'sendVideo', 'sendAudio', 'sendVoice',
  'sendAnimation',
]);

function isValidAdvice(item) {
  return item && typeof item === 'object'
    && typeof item.title === 'string' && item.title.trim()
    && typeof item.body === 'string' && item.body.trim()
    && typeof item.action === 'string' && item.action.trim();
}

function normalizeConfig(value) {
  return Array.isArray(value) && value.length && value.every(isValidAdvice) ? value : null;
}

function moscowDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function selectAdviceForDate(config, value = new Date()) {
  const items = normalizeConfig(config);
  if (!items) throw new Error('Clients advice config is empty or invalid');
  const { year, month, day } = moscowDateParts(value);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  return items[((dayNumber % items.length) + items.length) % items.length];
}

function formatClientsAdvice(item) {
  if (!isValidAdvice(item)) throw new Error('Clients advice item is invalid');
  return [
    '💡 <b>Развитие для стилиста с 8-летним опытом</b>',
    '',
    `<b>${item.title.trim()}</b>`,
    item.body.trim(),
    '',
    '<b>Что сделать сегодня:</b>',
    item.action.trim(),
  ].join('\n');
}

async function loadClientsAdviceConfig(options = {}) {
  const localConfig = normalizeConfig(options.localConfig || localConfigDefault) || localConfigDefault;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return localConfig;
  const baseUrl = String(options.configUrl || process.env.CLIENTS_ADVICE_CONFIG_URL || DEFAULT_CONFIG_URL).trim();
  try {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const response = await fetchImpl(`${baseUrl}${separator}r=${Date.now()}`, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      cache: 'no-store',
    });
    if (!response?.ok) return localConfig;
    const remote = normalizeConfig(await response.json());
    return remote || localConfig;
  } catch {
    return localConfig;
  }
}

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch { return ''; }
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

function withPayloadField(init, payload, field, value) {
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

async function rewriteClientsTelegramRequest(input, init = {}, options = {}) {
  const method = telegramMethod(input);
  if (!TELEGRAM_CREATING_METHODS.has(method)) return init;
  const payload = parsePayload(init);
  if (Number(payload?.message_thread_id) !== CLIENTS_TOPIC_ID) return init;
  const field = typeof payload?.text === 'string' ? 'text' : (typeof payload?.caption === 'string' ? 'caption' : null);
  if (!field || !OLD_MARKER.test(payload[field])) return init;

  const config = await loadClientsAdviceConfig(options);
  const advice = formatClientsAdvice(selectAdviceForDate(config, options.now || new Date()));
  return withPayloadField(init, payload, field, advice);
}

function replaceAdviceSection(text, advice) {
  if (typeof text !== 'string') return text;
  const match = OLD_MARKER.exec(text);
  if (!match) return text;
  const start = text.lastIndexOf('💡', match.index);
  const prefix = text.slice(0, start >= 0 ? start : match.index).trimEnd();
  return prefix ? `${prefix}\n\n${advice}` : advice;
}

function rewriteClientsPreviewPayloadWithAdvice(payload, advice) {
  const text = payload?.results?.clients?.preview?.message;
  if (typeof text !== 'string' || !OLD_MARKER.test(text)) return payload;
  return {
    ...payload,
    results: {
      ...payload.results,
      clients: {
        ...payload.results.clients,
        preview: {
          ...payload.results.clients.preview,
          message: replaceAdviceSection(text, advice),
        },
      },
    },
  };
}

async function rewriteClientsPreviewPayload(payload, options = {}) {
  const text = payload?.results?.clients?.preview?.message;
  if (typeof text !== 'string' || !OLD_MARKER.test(text)) return payload;
  const config = await loadClientsAdviceConfig(options);
  const advice = formatClientsAdvice(selectAdviceForDate(config, options.now || new Date()));
  return rewriteClientsPreviewPayloadWithAdvice(payload, advice);
}

module.exports = {
  CLIENTS_TOPIC_ID,
  DEFAULT_CONFIG_URL,
  selectAdviceForDate,
  formatClientsAdvice,
  loadClientsAdviceConfig,
  rewriteClientsTelegramRequest,
  rewriteClientsPreviewPayload,
  rewriteClientsPreviewPayloadWithAdvice,
  replaceAdviceSection,
};
