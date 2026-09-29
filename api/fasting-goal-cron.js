const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');
const { readFastingState, markFastingGoalNotified } = require('./fasting-store.cjs');

function goalReached(active, now = Date.now()) {
  const started = Date.parse(String(active?.startedAt || ''));
  const hours = Number(active?.goalHours || 0);
  if (!Number.isFinite(started) || !Number.isFinite(hours) || hours <= 0) return false;
  return now >= started + hours * 60 * 60 * 1000;
}

async function handler(req, res) {
  if (!isCronRequestAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized-cron' });

  const now = Date.now();
  const recipients = await readRecipients().catch(() => null);
  const results = {};

  for (const actor of ['Рустам', 'Диана']) {
    try {
      const state = await readFastingState(actor, { now });
      const active = state?.active || null;
      if (!active) {
        results[actor] = { skipped: 'no-active-fast' };
        continue;
      }
      if (active.goalNotifiedAt) {
        results[actor] = { skipped: 'already-notified' };
        continue;
      }
      if (!goalReached(active, now)) {
        results[actor] = { skipped: 'goal-not-reached' };
        continue;
      }

      const chatId = Number(recipients?.[actor]);
      if (!Number.isInteger(chatId) || chatId <= 0) {
        results[actor] = { sent: false, error: 'recipient-unavailable' };
        continue;
      }

      const hours = Math.max(1, Math.round(Number(active.goalHours || 0)));
      await telegramSendMessage(
        chatId,
        '⏱ <b>Цель голодания достигнута</b>\n\nТы выдержал'+(actor === 'Диана' ? 'а' : '')+' <b>'+hours+' ч</b>. Можно завершить голодание и сохранить результат в истории.',
        { buttonText: 'Открыть трекер', tab: 'fasting' }
      );
      await markFastingGoalNotified(actor, active.id, { now });
      results[actor] = { sent: true, goalHours: hours };
    } catch (error) {
      results[actor] = { sent: false, error: String(error?.message || error) };
      console.error('RUDI_FASTING_GOAL_NOTIFY_ERROR', actor, String(error?.message || error));
    }
  }

  return res.status(200).json({ ok: true, results });
}

module.exports = handler;
module.exports.goalReached = goalReached;
