const crypto = require('node:crypto');
const {
  getControlPlaneCache,
  getTopicMaintenanceCache,
  getDailyContentCache,
} = require('./stateful-cache.cjs');
const { SECTION_NAMES } = require('./rudi-settings.cjs');
const { getPublicationRecord } = require('./publication-journal.cjs');
const { findForumChatIdInEnv, normalizeForumChatId } = require('./forum-chat-id.cjs');
const { moscowDateKey } = require('./preview-date.cjs');
const { FACTS_TOPIC_ID, LULU_TOPIC_ID } = require('./daily-content-dedupe.cjs');
const { EVENTS_TOPIC_ID, HOLIDAYS_TOPIC_ID } = require('./topic-maintenance-base.cjs');

const SECTION_SET = new Set(SECTION_NAMES);
const METRICS = new Set([
  'publications',
  'successfulPublications',
  'failures',
  'positiveFeedback',
  'negativeFeedback',
  'sourceFailures',
  'duplicateSuppressions',
]);
const LEGACY_FEEDBACK_SECTIONS = ['events', 'holidays', 'facts', 'lulu', 'recipes', 'clients'];
const LEGACY_FEEDBACK_START_DATE = '2026-08-29';
const LEGACY_FEEDBACK_CLEANUP_KEY = 'feedback-keyboard-cleanup:v1';

function secret(env = process.env) {
  return String(env.RUDI_FEEDBACK_SECRET || env.CRON_SECRET || '');
}

function sign(unsigned, env) {
  const value = secret(env);
  if (!value) return '';
  return crypto.createHmac('sha256', value).update(unsigned).digest('hex').slice(0, 8);
}

function compactDate(date) {
  return String(date).replaceAll('-', '');
}

function buildFeedbackData(section, date, vote, env = process.env) {
  if (!SECTION_SET.has(section) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['up', 'down'].includes(vote) || !secret(env)) return null;
  const unsigned = `rf1:${section}:${compactDate(date)}:${vote === 'up' ? 'u' : 'd'}`;
  return `${unsigned}:${sign(unsigned, env)}`;
}

function parseFeedbackCallback(data, env = process.env) {
  const match = String(data || '').match(/^rf1:([a-z]+):(\d{8}):(u|d):([0-9a-f]{8})$/);
  if (!match || !SECTION_SET.has(match[1])) return null;
  const unsigned = `rf1:${match[1]}:${match[2]}:${match[3]}`;
  const expected = sign(unsigned, env);
  if (!expected || expected !== match[4]) return null;
  return {
    section: match[1],
    date: `${match[2].slice(0, 4)}-${match[2].slice(4, 6)}-${match[2].slice(6)}`,
    vote: match[3] === 'u' ? 'up' : 'down',
  };
}

function cacheOf(options = {}) {
  return options.cache || getControlPlaneCache(options.cacheOptions || {});
}

async function incrementSectionMetric(section, metric, amount = 1, options = {}) {
  if (!SECTION_SET.has(section) || !METRICS.has(metric)) throw new Error('Invalid analytics metric');
  const cache = cacheOf(options);
  const key = `analytics:${section}`;
  const row = await cache.get(key) || {
    publications: 0,
    successfulPublications: 0,
    failures: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    sourceFailures: 0,
    duplicateSuppressions: 0,
  };
  row[metric] = Math.max(0, Number(row[metric] || 0) + Number(amount || 0));
  row.updatedAt = new Date(options.now || Date.now()).toISOString();
  await cache.set(key, row, { tags: ['rudi-analytics'] });
  return row;
}

async function getSectionAnalytics(section, options = {}) {
  return await cacheOf(options).get(`analytics:${section}`) || {
    publications: 0,
    successfulPublications: 0,
    failures: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    sourceFailures: 0,
    duplicateSuppressions: 0,
  };
}

async function listSectionAnalytics(sections = SECTION_NAMES, options = {}) {
  const result = {};
  await Promise.all(sections.map(async (section) => {
    result[section] = await getSectionAnalytics(section, options);
  }));
  return result;
}

function buildFeedbackMarkup() {
  return null;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function dateKeysBetween(startDate, endDate) {
  if (!validDateKey(startDate) || !validDateKey(endDate)) throw new Error('Feedback cleanup dates must be YYYY-MM-DD');
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (start > end) return [];
  const result = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    result.push(cursor.toISOString().slice(0, 10));
  }
  return result;
}

function normalizeMessageIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}

async function collectLegacyFeedbackMessageIds(options = {}) {
  const controlCache = options.controlCache || getControlPlaneCache(options.controlCacheOptions || {});
  const topicCache = options.topicCache || getTopicMaintenanceCache(options.topicCacheOptions || {});
  const dailyContentCache = options.dailyContentCache || getDailyContentCache(options.dailyContentCacheOptions || {});
  const endDate = options.endDate || moscowDateKey(options.now || new Date());
  const dateKeys = Array.isArray(options.dateKeys)
    ? options.dateKeys.filter(validDateKey)
    : dateKeysBetween(options.startDate || LEGACY_FEEDBACK_START_DATE, endDate);
  const getRecord = options.getRecord || ((date, section) => getPublicationRecord(date, section, { cache: controlCache }));
  const ids = [];

  for (const date of dateKeys) {
    for (const section of LEGACY_FEEDBACK_SECTIONS) {
      try {
        const record = await getRecord(date, section);
        ids.push(...(Array.isArray(record?.messageIds) ? record.messageIds : []));
      } catch (error) {
        console.warn('RUDI_FEEDBACK_JOURNAL_READ_ERROR', date, section, String(error?.message || error));
      }
    }

    for (const topicId of [EVENTS_TOPIC_ID, HOLIDAYS_TOPIC_ID]) {
      try {
        const tracked = await topicCache.get(`topic:${topicId}:${date}:messages`);
        ids.push(...(Array.isArray(tracked) ? tracked : []));
      } catch (error) {
        console.warn('RUDI_FEEDBACK_TOPIC_HISTORY_READ_ERROR', date, topicId, String(error?.message || error));
      }
    }
  }

  for (const topicId of [FACTS_TOPIC_ID, LULU_TOPIC_ID]) {
    try {
      const history = await dailyContentCache.get(`daily-content:${topicId}:history`);
      for (const row of Array.isArray(history) ? history : []) {
        if (dateKeys.includes(String(row?.dateKey || ''))) ids.push(row?.messageId);
      }
    } catch (error) {
      console.warn('RUDI_FEEDBACK_DAILY_HISTORY_READ_ERROR', topicId, String(error?.message || error));
    }
  }

  ids.push(...(Array.isArray(options.extraMessageIds) ? options.extraMessageIds : []));
  return normalizeMessageIds(ids);
}

async function resolveCleanupChatId(options = {}) {
  const direct = normalizeForumChatId(options.chatId);
  if (direct) return direct;
  const topicCache = options.topicCache || getTopicMaintenanceCache(options.topicCacheOptions || {});
  for (const topicId of [EVENTS_TOPIC_ID, HOLIDAYS_TOPIC_ID]) {
    try {
      const cached = normalizeForumChatId(await topicCache.get(`topic:${topicId}:chat-id`));
      if (cached) return cached;
    } catch {}
  }
  return findForumChatIdInEnv(options.env || process.env);
}

function benignLegacyEditFailure(response, detail) {
  if (Number(response?.status) !== 400) return false;
  return /message is not modified|message to edit not found|message can't be edited|message identifier is not specified/i.test(String(detail || ''));
}

async function cleanupLegacyFeedbackKeyboards(options = {}) {
  const controlCache = options.controlCache || getControlPlaneCache(options.controlCacheOptions || {});
  if (options.force !== true) {
    try {
      const completed = await controlCache.get(LEGACY_FEEDBACK_CLEANUP_KEY);
      if (completed) return { ...completed, alreadyComplete: true };
    } catch (error) {
      console.warn('RUDI_FEEDBACK_CLEANUP_STATE_READ_ERROR', String(error?.message || error));
    }
  }

  const chatId = await resolveCleanupChatId(options);
  if (!chatId) throw new Error('Telegram forum chat id is unavailable for feedback cleanup');
  const token = String(options.token || require('./products-bought.cjs').resolveTelegramBotToken(options.env || process.env) || '').trim();
  if (!token) throw new Error('Telegram bot token is unavailable for feedback cleanup');
  const messageIds = normalizeMessageIds(options.messageIds || await collectLegacyFeedbackMessageIds(options));
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for feedback cleanup');

  let removed = 0;
  let skipped = 0;
  for (const messageId of messageIds) {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      }),
    });
    if (response?.ok) {
      removed += 1;
      continue;
    }
    let detail = '';
    try { detail = await response.clone().text(); } catch {}
    if (benignLegacyEditFailure(response, detail)) {
      skipped += 1;
      continue;
    }
    throw new Error(`Feedback keyboard cleanup failed for message ${messageId}: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }

  const result = {
    completedAt: new Date(options.now || Date.now()).toISOString(),
    startDate: options.startDate || LEGACY_FEEDBACK_START_DATE,
    endDate: options.endDate || moscowDateKey(options.now || new Date()),
    checked: messageIds.length,
    removed,
    skipped,
  };
  await controlCache.set(LEGACY_FEEDBACK_CLEANUP_KEY, result, { tags: ['rudi-feedback'] });
  return result;
}

async function handleFeedbackCallback(req, options = {}) {
  const query = req?.body?.callback_query;
  const parsed = parseFeedbackCallback(query?.data, options.env || process.env);
  if (!parsed) return false;
  const token = options.token || require('./products-bought.cjs').resolveTelegramBotToken(options.env || process.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const answer = options.answer || (async () => fetchImpl(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: query.id }),
  }));
  await answer();
  const cache = cacheOf(options);
  const dedupeKey = `feedback-callback:${query.id}`;
  if (await cache.get(dedupeKey)) return true;
  await cache.set(dedupeKey, true, { ttl: 86400, tags: ['rudi-feedback'] });
  await incrementSectionMetric(parsed.section, parsed.vote === 'up' ? 'positiveFeedback' : 'negativeFeedback', 1, { ...options, cache });
  return true;
}

module.exports = {
  buildFeedbackData,
  parseFeedbackCallback,
  incrementSectionMetric,
  getSectionAnalytics,
  listSectionAnalytics,
  buildFeedbackMarkup,
  collectLegacyFeedbackMessageIds,
  cleanupLegacyFeedbackKeyboards,
  handleFeedbackCallback,
};
