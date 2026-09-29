const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { isGitHubActionsRequestAuthorized } = require('./github-actions-oidc.cjs');
const { runLuluToiletAlert } = require('./lulu-toilet-alert.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');
const { readFastingState, markFastingGoalNotified } = require('./fasting-store.cjs');

function goalReached(active, now = Date.now()) {
  const started = Date.parse(String(active?.startedAt || ''));
  const hours = Number(active?.goalHours || 0);
  if (!Number.isFinite(started) || !Number.isFinite(hours) || hours <= 0) return false;
  return now >= started + hours * 60 * 60 * 1000;
}

async function runFastingGoalNotifications(now = Date.now()) {
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
  return results;
}

async function handler(req, res) {
  const authorized = isCronRequestAuthorized(req) || await isGitHubActionsRequestAuthorized(req);
  if (!authorized) {
    console.error('RUDI_LULU_TOILET_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  const [lulu, fasting] = await Promise.allSettled([
    runLuluToiletAlert(),
    runFastingGoalNotifications(),
  ]);

  if (lulu.status === 'fulfilled') {
    console.log('RUDI_LULU_TOILET_CRON_RESULT', JSON.stringify(lulu.value));
  } else {
    console.error('RUDI_LULU_TOILET_CRON_ERROR', String(lulu.reason?.message || lulu.reason));
  }

  if (fasting.status === 'fulfilled') {
    console.log('RUDI_FASTING_GOAL_NOTIFY_RESULT', JSON.stringify(fasting.value));
  } else {
    console.error('RUDI_FASTING_GOAL_NOTIFY_ERROR', String(fasting.reason?.message || fasting.reason));
  }

  if (lulu.status === 'rejected') {
    return res.status(500).json({
      ok: false,
      error: 'lulu-toilet-alert-failed',
      fasting: fasting.status === 'fulfilled' ? fasting.value : null,
    });
  }

  return res.status(200).json({
    ok: true,
    ...lulu.value,
    fasting: fasting.status === 'fulfilled' ? fasting.value : null,
  });
}

module.exports = handler;
module.exports.goalReached = goalReached;
module.exports.runFastingGoalNotifications = runFastingGoalNotifications;
