const { loadDailyContentCatalog } = require('./daily-content-config.cjs');
const {
  FACTS_TOPIC_ID,
  LULU_TOPIC_ID,
  defaultFingerprint,
  dateKeyInMoscow,
  historyKey,
  chooseUnseenEntry,
} = require('./daily-content-dedupe.cjs');
const { getDailyContentCache, getRecoveryCache } = require('./stateful-cache.cjs');

const CHAT_ID = -1004476323368;
const REPAIR_DATE = '2026-08-24';
const REPAIR_STATE_KEY = 'daily-content-repair-20260824';
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 730;
const HISTORY_LIMIT = 1000;
const REPAIR_TTL_SECONDS = 3 * 24 * 60 * 60;
const TARGETS = [
  { key: 'facts', topicId: FACTS_TOPIC_ID, messageId: 675 },
  { key: 'lulu', topicId: LULU_TOPIC_ID, messageId: 676 },
];

function isAlreadyDeleted(status, detail) {
  return Number(status) === 400 && /message to delete not found|MESSAGE_ID_INVALID|message identifier is not specified/i.test(String(detail || ''));
}

async function telegramCall(token, method, payload, fetchImpl) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response?.ok) return response;
  let detail = '';
  try { detail = await response.clone().text(); } catch {}
  if (method === 'deleteMessage' && isAlreadyDeleted(response?.status, detail)) return response;
  throw new Error(`Telegram ${method} failed: HTTP ${response?.status || 500}${detail ? ` ${detail}` : ''}`);
}

async function parseMessageId(response) {
  try {
    const body = await response.clone().json();
    return Number(body?.result?.message_id) || 0;
  } catch {
    return 0;
  }
}

async function publishFreshTarget(target, options) {
  const { token, fetchImpl, dailyCache, catalog, now } = options;
  const key = historyKey(target.topicId);
  const historyValue = await dailyCache.get(key);
  const history = Array.isArray(historyValue) ? historyValue : [];
  const seen = new Set(history.map((row) => String(row?.fingerprint || '')).filter(Boolean));
  const replacement = chooseUnseenEntry(catalog[target.key], seen, defaultFingerprint);
  if (!replacement) throw new Error(`No unseen ${target.key} content is available for repair`);

  const response = await telegramCall(token, 'sendMessage', {
    chat_id: CHAT_ID,
    message_thread_id: target.topicId,
    text: replacement.message,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  }, fetchImpl);
  const messageId = await parseMessageId(response);
  if (!messageId) throw new Error(`Telegram sendMessage returned no message id for ${target.key}`);

  const nextHistory = [...history, {
    fingerprint: replacement.fingerprint,
    id: String(replacement.entry.id || '') || null,
    messageId,
    dateKey: REPAIR_DATE,
    publishedAt: now.toISOString(),
  }].slice(-HISTORY_LIMIT);
  await dailyCache.set(key, nextHistory, {
    ttl: HISTORY_TTL_SECONDS,
    tags: ['rudi-daily-content-history'],
    name: key,
  });

  return { topicId: target.topicId, deletedMessageId: target.messageId, messageId, contentId: replacement.entry.id };
}

async function saveRepairState(repairCache, state) {
  await repairCache.set(REPAIR_STATE_KEY, state, {
    ttl: REPAIR_TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: REPAIR_STATE_KEY,
  });
}

async function runDailyContentRepair(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (dateKeyInMoscow(now) !== REPAIR_DATE) throw new Error('daily-content-repair-expired');

  const token = String(options.token || '').trim();
  if (!token) throw new Error('Telegram bot token is required');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const dailyCache = options.dailyCache || getDailyContentCache();
  const repairCache = options.repairCache || getRecoveryCache();
  const catalog = options.catalog || await loadDailyContentCatalog({ fetchImpl, now });

  let state = await repairCache.get(REPAIR_STATE_KEY);
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  if (state.completed === true) {
    return { completed: true, alreadyCompleted: true, completedAt: state.completedAt || null, results: state.results || {} };
  }

  const results = { ...(state.results || {}) };
  for (const target of TARGETS) {
    if (state[target.key]?.completed === true) continue;
    await telegramCall(token, 'deleteMessage', {
      chat_id: CHAT_ID,
      message_id: target.messageId,
    }, fetchImpl);
    const result = await publishFreshTarget(target, { token, fetchImpl, dailyCache, catalog, now });
    results[target.key] = result;
    state = {
      ...state,
      results,
      [target.key]: { completed: true, completedAt: now.toISOString(), result },
    };
    await saveRepairState(repairCache, state);
  }

  const completedAt = now.toISOString();
  state = { ...state, completed: true, completedAt, results };
  await saveRepairState(repairCache, state);
  return { completed: true, alreadyCompleted: false, completedAt, results };
}

module.exports = {
  CHAT_ID,
  REPAIR_DATE,
  REPAIR_STATE_KEY,
  TARGETS,
  runDailyContentRepair,
};
