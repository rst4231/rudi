const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { runDailyOrchestrator } = require('./daily-orchestrator.cjs');
const { recordDailyCronState } = require('./daily-cron-state.cjs');
const { finalizeOutstandingForAll } = require('./habit-rules.cjs');

async function recordStateSafe(state) {
  try { return await recordDailyCronState(state); }
  catch (error) {
    console.error('RUDI_DAILY_CRON_STATE_ERROR', String(error?.message || error));
    return null;
  }
}

async function handler(req, res) {
  const startedAt = new Date();
  const authorized = isCronRequestAuthorized(req);
  await recordStateSafe({
    status: authorized ? 'started' : 'unauthorized',
    authorized,
    startedAt,
    finishedAt: authorized ? null : new Date(),
  });

  if (!authorized) {
    console.error('RUDI_DAILY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }

  try {
    try {
      const habitFinalization=await finalizeOutstandingForAll();
      console.log('RUDI_HABIT_DAILY_FINALIZATION', JSON.stringify(habitFinalization));
    } catch (error) {
      console.error('RUDI_HABIT_DAILY_FINALIZATION_ERROR', String(error?.message || error));
    }
    const result = await runDailyOrchestrator(req, res);
    await recordStateSafe({
      status: 'completed',
      authorized: true,
      startedAt,
      finishedAt: new Date(),
    });
    return result;
  } catch (error) {
    await recordStateSafe({
      status: 'failed',
      authorized: true,
      startedAt,
      finishedAt: new Date(),
      error: String(error?.message || error),
    });
    throw error;
  }
}

module.exports = handler;
module.exports.recordStateSafe = recordStateSafe;
