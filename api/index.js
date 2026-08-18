require('@vercel/functions');
const crypto = require('node:crypto');

const MANUAL_PUBLISH_TOKEN_SHA256 = '9cd4e9bd85ad74e42f2419e0b7a254392a84212327aaac99dbd3b968c976ba35';
const MANUAL_PUBLISH_EXPIRES_AT = Date.parse('2026-08-18T13:30:00Z');
let runtimeHandler;

function sanitizeStagePriceText(text) {
  if (typeof text !== 'string' || !text.includes('Stage StandUp Club')) return text;
  return text.split('\n').map((line) => {
    if (!line.startsWith('💳')) return line;
    const age = line.match(/\s·\s(\d+\+)\s*$/)?.[1];
    return `💳 стоимость уточняйте на странице билетов${age ? ` · ${age}` : ''}`;
  }).join('\n');
}

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async function stageSafeFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (!url.includes('api.telegram.org/')) {
    return nativeFetch(input, init);
  }

  let nextInit = init;
  try {
    if (typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      if (typeof body?.text === 'string' && body.text.includes('Stage StandUp Club')) {
        nextInit = {
          ...init,
          body: JSON.stringify({ ...body, text: sanitizeStagePriceText(body.text) }),
        };
      }
    } else if (init.body instanceof URLSearchParams) {
      const text = init.body.get('text');
      if (typeof text === 'string' && text.includes('Stage StandUp Club')) {
        const body = new URLSearchParams(init.body);
        body.set('text', sanitizeStagePriceText(text));
        nextInit = { ...init, body };
      }
    }
  } catch (error) {
    console.error('RUDI_STAGE_PRICE_SANITIZER_ERROR', error);
  }

  return nativeFetch(input, nextInit);
};

function manualTokenValid(token) {
  const actual = crypto.createHash('sha256').update(String(token || '')).digest();
  const expected = Buffer.from(MANUAL_PUBLISH_TOKEN_SHA256, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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

async function runRuntime(req, res, runtime = getRuntimeHandler()) {
  if (req.query?.route !== 'telegram' || !process.env.CRON_SECRET) {
    return runtime(req, res);
  }

  const cronSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    return await runtime(req, res);
  } finally {
    process.env.CRON_SECRET = cronSecret;
  }
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
    return await runRuntime(req, res);
  } catch (error) {
    console.error('RUDI_RUNTIME_ERROR', error);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  }
}

module.exports = handler;
module.exports.runRuntime = runRuntime;
module.exports.sanitizeStagePriceText = sanitizeStagePriceText;
