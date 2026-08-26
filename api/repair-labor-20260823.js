const { createHash, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const { replaceLaborArticle } = require('./labor-code.cjs');
const { getLaborCache, getRecoveryCache } = require('./stateful-cache.cjs');
const { getKnownForumChatId } = require('./topic-maintenance.cjs');
const { resolveForumChatId } = require('./forum-chat-id.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');

const REPAIR_DATE = '2026-08-23';
const REPAIR_KEY = 'labor-repair-20260823-complete';
const DUPLICATE_MESSAGE_ID = 635;
const DUPLICATE_ARTICLE_ID = 'contract:worker';
const EXPECTED_KEY_HASH = '05537af28ce505ad84e95d98ba828ac841df7833e1ea745500217f23b140fa55';

const CORRECTION_DATE = '2026-08-26';
const CORRECTION_KEY = 'labor-correction-20260826-complete';
const CORRECTION_KEY_HASH = 'e09faf35c568ee61dd98d0a5be74d300e0f0a4ad88c8ca8e43bf92b4775c646c';
const WRONG_CLIENTS_TOPIC_ID = 126;
const WRONG_MESSAGE_ID = 721;
const TTL_SECONDS = 3 * 24 * 60 * 60;
const LABOR_TOPIC_CACHE_OPTIONS = {
  ttl: 60 * 60 * 24 * 3650,
  tags: ['rudi-labor-topic'],
};

function moscowDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function securelyMatchesHash(value, expectedHash) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function securelyMatchesRepairKey(value) {
  return securelyMatchesHash(value, EXPECTED_KEY_HASH);
}

function securelyMatchesCorrectionKey(value) {
  return securelyMatchesHash(value, CORRECTION_KEY_HASH);
}

function validLaborTopicId(value) {
  const topicId = Number(value);
  return Number.isInteger(topicId) && topicId > 0 && topicId !== WRONG_CLIENTS_TOPIC_ID ? topicId : null;
}

function readGeneratedRuntimeSource() {
  try { return fs.readFileSync(require.resolve('../runtime/generated-runtime.cjs'), 'utf8'); }
  catch { return ''; }
}

async function resolveChatId() {
  const cached = await getKnownForumChatId();
  return resolveForumChatId({
    cached,
    env: process.env,
    runtimeSource: cached === null ? readGeneratedRuntimeSource() : '',
  });
}

async function deleteMessage(token, chatId, messageId, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
  if (response.ok) return true;
  let detail = '';
  try { detail = await response.text(); } catch {}
  if (response.status === 400 && /message to delete not found|message can't be deleted/i.test(detail)) return false;
  throw new Error(`Telegram deleteMessage failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
}

function deleteDuplicateMessage(token, chatId, fetchImpl = globalThis.fetch) {
  return deleteMessage(token, chatId, DUPLICATE_MESSAGE_ID, fetchImpl);
}

async function recoverActualLaborTopicId(recoveryCache, laborCache) {
  const oldRepair = await recoveryCache.get(REPAIR_KEY);
  const repairTopicId = validLaborTopicId(oldRepair?.replacement?.topicId);
  if (repairTopicId) {
    await laborCache.set('labor:topic-id', repairTopicId, LABOR_TOPIC_CACHE_OPTIONS);
    return repairTopicId;
  }

  try {
    const topicId = validLaborTopicId(await laborCache.get('labor:topic-id'));
    if (topicId) return topicId;
  } catch (error) {
    if (!/Labor topic id is unavailable/i.test(String(error?.message || error))) throw error;
  }
  return null;
}

async function runAug26Correction(req, res) {
  if (!securelyMatchesCorrectionKey(req.query?.key)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-labor-correction' });
  }

  const recoveryCache = getRecoveryCache();
  const completed = await recoveryCache.get(CORRECTION_KEY);
  if (completed?.completed === true) {
    return res.status(200).json({ ok: true, alreadyCompleted: true, ...completed });
  }

  const laborCache = getLaborCache();
  const topicId = await recoverActualLaborTopicId(recoveryCache, laborCache);
  if (!topicId || topicId === WRONG_CLIENTS_TOPIC_ID) {
    return res.status(503).json({ ok: false, error: 'labor-topic-id-unavailable' });
  }

  const token = resolveTelegramBotToken(process.env);
  const chatId = await resolveChatId();
  if (chatId === null || chatId === undefined) {
    return res.status(503).json({ ok: false, error: 'forum-chat-id-unavailable' });
  }

  await laborCache.set('labor:topic-id', topicId, LABOR_TOPIC_CACHE_OPTIONS);
  const replacement = await replaceLaborArticle({
    token,
    chatId,
    cache: laborCache,
    fetchImpl: globalThis.fetch,
    now: new Date(),
  });
  if (Number(replacement?.topicId) !== topicId || Number(replacement?.topicId) === WRONG_CLIENTS_TOPIC_ID) {
    throw new Error('Labor correction published to an unexpected topic');
  }

  const wrongDeleted = await deleteMessage(token, chatId, WRONG_MESSAGE_ID);
  const completedAt = new Date().toISOString();
  const result = {
    completed: true,
    completedAt,
    laborTopicId: topicId,
    wrongClientsTopicId: WRONG_CLIENTS_TOPIC_ID,
    wrongMessageId: WRONG_MESSAGE_ID,
    wrongDeleted,
    replacement,
  };
  await recoveryCache.set(CORRECTION_KEY, result, {
    ttl: TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: CORRECTION_KEY,
  });
  return res.status(200).json({ ok: true, ...result });
}

async function runAug23Repair(req, res) {
  if (!securelyMatchesRepairKey(req.query?.key)) {
    return res.status(401).json({ ok: false, error: 'unauthorized-labor-repair' });
  }

  const recoveryCache = getRecoveryCache();
  const completed = await recoveryCache.get(REPAIR_KEY);
  if (completed?.completed === true) {
    return res.status(200).json({ ok: true, alreadyCompleted: true, ...completed });
  }

  const token = resolveTelegramBotToken(process.env);
  const chatId = await resolveChatId();
  if (chatId === null || chatId === undefined) {
    return res.status(503).json({ ok: false, error: 'forum-chat-id-unavailable' });
  }

  const deleted = await deleteDuplicateMessage(token, chatId);
  const replacement = await replaceLaborArticle({
    token,
    chatId,
    cache: getLaborCache(),
    fetchImpl: globalThis.fetch,
    now: new Date(),
    excludeIds: [DUPLICATE_ARTICLE_ID],
  });
  const completedAt = new Date().toISOString();
  const result = { completed: true, completedAt, deleted, duplicateMessageId: DUPLICATE_MESSAGE_ID, replacement };
  await recoveryCache.set(REPAIR_KEY, result, {
    ttl: TTL_SECONDS,
    tags: ['one-time-recovery'],
    name: REPAIR_KEY,
  });

  return res.status(200).json({ ok: true, ...result });
}

async function handler(req, res) {
  const today = moscowDateKey();
  if (today === CORRECTION_DATE) return runAug26Correction(req, res);
  if (today === REPAIR_DATE) return runAug23Repair(req, res);
  return res.status(410).json({ ok: false, error: 'labor-repair-expired' });
}

module.exports = handler;
module.exports.moscowDateKey = moscowDateKey;
module.exports.securelyMatchesRepairKey = securelyMatchesRepairKey;
module.exports.securelyMatchesCorrectionKey = securelyMatchesCorrectionKey;
module.exports.deleteDuplicateMessage = deleteDuplicateMessage;
module.exports.deleteMessage = deleteMessage;
module.exports.recoverActualLaborTopicId = recoverActualLaborTopicId;
module.exports.runAug26Correction = runAug26Correction;