require('@vercel/functions');
const crypto = require('node:crypto');

const MANUAL_PUBLISH_TOKEN_SHA256 = '9cd4e9bd85ad74e42f2419e0b7a254392a84212327aaac99dbd3b968c976ba35';
const MANUAL_PUBLISH_EXPIRES_AT = Date.parse('2026-08-18T13:30:00Z');
let runtimeHandler;

function manualTokenValid(token) {
  const actual = crypto.createHash('sha256').update(String(token || '')).digest();
  const expected = Buffer.from(MANUAL_PUBLISH_TOKEN_SHA256, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function authorizeTelegramWebhook(req) {
  if (req.query?.route !== 'telegram' || !process.env.CRON_SECRET) return;
  req.headers = {
    ...req.headers,
    authorization: `Bearer ${process.env.CRON_SECRET}`,
    'x-telegram-bot-api-secret-token': process.env.CRON_SECRET,
  };
}

function getRuntimeHandler() {
  if (!runtimeHandler) {
    runtimeHandler = require('../runtime/generated-runtime.cjs');
    if (typeof runtimeHandler !== 'function') {
      throw new Error('RUDI runtime did not export a handler function');
    }
  }
  return runtimeHandler;
}

async function handler(req, res) {
  try {
    if (req.query?.route === 'manual-daily') {
      if (Date.now() > MANUAL_PUBLISH_EXPIRES_AT) {
        return res.status(410).json({ ok: false, error: 'Manual publish window expired' });
      }
      if (!manualTokenValid(req.query?.token)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      if (!process.env.CRON_SECRET) {
        return res.status(503).json({ ok: false, error: 'CRON_SECRET is not configured' });
      }
      req.query.route = 'daily';
      req.query.date = '2026-08-18';
      req.headers = {
        ...req.headers,
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      };
    }
    authorizeTelegramWebhook(req);
    return await getRuntimeHandler()(req, res);
  } catch (error) {
    console.error('RUDI_RUNTIME_ERROR', error);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  }
}

module.exports = handler;
module.exports.authorizeTelegramWebhook = authorizeTelegramWebhook;
