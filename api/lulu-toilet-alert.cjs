const { readLuluState, recordLuluToiletAlertRecipients } = require('./lulu-store.cjs');
const { luluToiletProbability } = require('./lulu-toilet.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');

const ALERT_TEXT = '🐾 <b>Лулу хочет в туалет</b>\nВероятность: <b>100%</b>';

async function runLuluToiletAlert(options = {}) {
  const now = new Date(options.now || Date.now());
  const lulu = await readLuluState(options);
  const walkedAt = String(lulu?.lastWalk?.walkedAt || '');
  if (!walkedAt) return { sent: [], skipped: 'no-walk', probability: null };

  const probability = luluToiletProbability(walkedAt, now);
  if (probability === null || probability < 100) {
    return { sent: [], skipped: 'below-threshold', probability };
  }

  const already = new Set(
    lulu?.toiletAlert?.walkedAt === walkedAt
      ? (Array.isArray(lulu.toiletAlert.recipients) ? lulu.toiletAlert.recipients : [])
      : []
  );
  const recipients = options.recipients || await readRecipients(options) || {};
  const send = options.telegramSendMessage || telegramSendMessage;
  const sent = [], failed = [], missing = [];

  for (const actor of ['Рустам', 'Диана']) {
    if (already.has(actor)) continue;
    const chatId = Number(recipients?.[actor]);
    if (!Number.isInteger(chatId) || chatId <= 0) { missing.push(actor); continue; }
    try {
      const result = await send(chatId, ALERT_TEXT, options);
      sent.push({ actor, ...result });
    } catch (error) {
      failed.push({ actor, error: String(error?.message || error) });
    }
  }

  if (sent.length) {
    await recordLuluToiletAlertRecipients(walkedAt, sent.map((row) => row.actor), { ...options, now });
  }

  return {
    probability, walkedAt, sent, failed, missing,
    alreadySent: Array.from(already),
    completed: new Set([...already, ...sent.map((row) => row.actor)]).size >= 2,
  };
}

module.exports = { ALERT_TEXT, runLuluToiletAlert };
