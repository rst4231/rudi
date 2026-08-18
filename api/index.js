require('@vercel/functions');
const {
  runWithCronSecretHidden,
  installGlobalTelegramFetchGuard,
} = require('./runtime-guard.cjs');
const {
  addBoughtButtonToTelegramRequest,
  handleBoughtCallback,
  runWithProductsContext,
  isProductsTopicUpdate,
} = require('./products-bought.cjs');

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

  try {
    nextInit = addBoughtButtonToTelegramRequest(input, nextInit);
  } catch (error) {
    console.error('RUDI_PRODUCTS_BUTTON_ERROR', error);
  }

  return nativeFetch(input, nextInit);
};

installGlobalTelegramFetchGuard();

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
  if (req.query?.route === 'telegram' && process.env.CRON_SECRET) {
    return runWithCronSecretHidden(() => runtime(req, res));
  }
  return runtime(req, res);
}

async function handler(req, res) {
  try {
    if (req.query?.route === 'telegram') {
      const handled = await handleBoughtCallback(req, res);
      if (handled) return;
      if (isProductsTopicUpdate(req)) {
        return await runWithProductsContext(() => runRuntime(req, res));
      }
    }
    if (req.query?.route === 'init-products') {
      return await runWithProductsContext(() => runRuntime(req, res));
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
