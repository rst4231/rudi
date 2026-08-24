const { createHash, timingSafeEqual } = require('node:crypto');
const { runDailyContentRepair, REPAIR_DATE } = require('./daily-content-repair-20260824.cjs');
const { dateKeyInMoscow } = require('./daily-content-dedupe.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');

const EXPECTED_KEY_HASH = '6ded7591fed4abcffcff1527f0f5a9b5bb85b6d5729db0c1b73124dc2c3163ff';

function securelyMatchesRepairKey(value) {
  const actual = createHash('sha256').update(String(value || '')).digest();
  const expected = Buffer.from(EXPECTED_KEY_HASH, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createRepairHandler(options = {}) {
  const runRepair = options.runRepair || runDailyContentRepair;
  return async function repairHandler(req, res) {
    const now = options.now ? options.now() : new Date();
    if (dateKeyInMoscow(now) !== REPAIR_DATE) {
      return res.status(410).json({ ok: false, error: 'daily-content-repair-expired' });
    }
    if (!securelyMatchesRepairKey(req?.query?.key)) {
      return res.status(401).json({ ok: false, error: 'unauthorized-repair' });
    }

    try {
      const token = options.token || resolveTelegramBotToken(process.env);
      const result = await runRepair({ token, now });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error('RUDI_DAILY_CONTENT_REPAIR_ERROR', error);
      return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  };
}

const handler = createRepairHandler();
module.exports = handler;
module.exports.createRepairHandler = createRepairHandler;
module.exports.securelyMatchesRepairKey = securelyMatchesRepairKey;
