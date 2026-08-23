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
const TTL_SECONDS = 3 * 24 * 60 * 60;

function moscowDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function securelyMatchesRepairKey(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(EXPECTED_KEY_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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

async function deleteDuplicateMessage(token, chatId, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: DUPLICATE_MESSAGE_ID }),
  });
  if (response.ok) return true;
  let detail = '';
  try { detail = await response.text(); } catch {}
  if (response.status === 400 && /message to delete not found|message can't be deleted/i.test(detail)) return false;
  throw new Error(`Telegram deleteMessage failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
}

async function handler(req, res) {
  if (moscowDateKey() !== REPAIR_DATE) {
    return res.status(410).json({ ok: false, error: 'labor-repair-expired' });
  }
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

module.exports = handler;
module.exports.moscowDateKey = moscowDateKey;
module.exports.securelyMatchesRepairKey = securelyMatchesRepairKey;
module.exports.deleteDuplicateMessage = deleteDuplicateMessage;
