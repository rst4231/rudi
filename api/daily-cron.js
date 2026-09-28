const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { runDailyOrchestrator } = require('./daily-orchestrator.cjs');
const { recordDailyCronState } = require('./daily-cron-state.cjs');
const { finalizeOutstandingForAll } = require('./habit-rules.cjs');

const DAILY_CRON_TIMEOUT_MS = 270000;
function withTimeout(promise, timeoutMs = DAILY_CRON_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('daily-cron-timeout')), Math.max(1000, Number(timeoutMs) || DAILY_CRON_TIMEOUT_MS));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
  if (!authorized) {
    console.warn('RUDI_DAILY_CRON_UNAUTHORIZED');
    return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
  }
  await recordStateSafe({
    status: 'started',
    authorized: true,
    startedAt,
    finishedAt: null,
  });

  try {
    const work = (async () => {
      try {
        const habitFinalization=await finalizeOutstandingForAll();
        console.log('RUDI_HABIT_DAILY_FINALIZATION', JSON.stringify(habitFinalization));
      } catch (error) {
        console.error('RUDI_HABIT_DAILY_FINALIZATION_ERROR', String(error?.message || error));
      }
      return runDailyOrchestrator(req, res);
    })();
    const result = await withTimeout(work);
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
module.exports.withTimeout = withTimeout;
module.exports.DAILY_CRON_TIMEOUT_MS = DAILY_CRON_TIMEOUT_MS;
