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
  runWithExistingClearAction,
  shouldSuppressAnsweredCallbackQuery,
  resolveTelegramBotToken,
} = require('./products-bought.cjs');
const {
  handleTelegramTopicRequest,
  prepareDailyTopicCleanup,
  isRemovedCoupleTopicUpdate,
  sanitizeHealthPayload,
  getKnownForumChatId,
} = require('./topic-maintenance.cjs');
const { sanitizeAliceShoppingPayload } = require('./alice-shopping-response.cjs');
const { publishLaborArticle } = require('./labor-code.cjs');

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
  if (!url.includes('api.telegram.org/')) return nativeFetch(input, init);

  if (shouldSuppressAnsweredCallbackQuery(input)) {
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  let nextInit = init;
  try {
    if (typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      if (typeof body?.text === 'string' && body.text.includes('Stage StandUp Club')) {
        nextInit = { ...init, body: JSON.stringify({ ...body, text: sanitizeStagePriceText(body.text) }) };
      }
    } else if (init.body instanceof URLSearchParams) {
      const text = init.body.get('text');
      if (typeof text === 'string' && text.includes('Stage StandUp Club')) {
        const body = new URLSearchParams(init.body);
        body.set('text', sanitizeStagePriceText(text));
        nextInit = { ...init, body };
      }
    }
  } catch (error) { console.error('RUDI_STAGE_PRICE_SANITIZER_ERROR', error); }

  try { nextInit = addBoughtButtonToTelegramRequest(input, nextInit); }
  catch (error) { console.error('RUDI_PRODUCTS_BUTTON_ERROR', error); }

  return handleTelegramTopicRequest(input, nextInit, { fetchImpl: nativeFetch });
};

installGlobalTelegramFetchGuard();

function getRuntimeHandler() {
  if (!runtimeHandler) {
    runtimeHandler = require('../runtime/generated-runtime.cjs');
    if (typeof runtimeHandler !== 'function') throw new Error('RUDI runtime did not export a handler function');
  }
  return runtimeHandler;
}

async function runRuntime(req, res, runtime = getRuntimeHandler()) {
  if (req.query?.route === 'telegram' && process.env.CRON_SECRET) {
    return runWithCronSecretHidden(() => runtime(req, res));
  }
  return runtime(req, res);
}

async function runHealthWithoutCouple(req, res) {
  if (typeof res?.json !== 'function') return runRuntime(req, res);
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeHealthPayload(payload));
  try { return await runRuntime(req, res); }
  finally { res.json = originalJson; }
}

async function runAliceShoppingWithPrompt(req, res) {
  if (typeof res?.json !== 'function') return runWithProductsContext(() => runRuntime(req, res));
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeAliceShoppingPayload(payload));
  try { return await runWithProductsContext(() => runRuntime(req, res)); }
  finally { res.json = originalJson; }
}

async function publishDailyLaborArticle() {
  const token = resolveTelegramBotToken(process.env);
  const chatId = await getKnownForumChatId();
  if (chatId === null) {
    console.error('RUDI_LABOR_ARTICLE_ERROR', new Error('Telegram forum chat id is not recorded yet'));
    return null;
  }
  return publishLaborArticle({ token, chatId, fetchImpl: nativeFetch });
}

async function handler(req, res) {
  try {
    if (req.query?.route === 'telegram') {
      if (isRemovedCoupleTopicUpdate(req)) return res.status(200).json({ ok: true, ignored: 'removed-couple-topic' });
      const boughtAction = await handleBoughtCallback(req, res);
      if (boughtAction?.empty) return res.status(200).json({ ok: true, ignored: 'empty-products' });
      if (boughtAction) {
        return await runWithExistingClearAction(req, boughtAction.clearCallbackData, () => runRuntime(req, res));
      }
      if (isProductsTopicUpdate(req)) return await runWithProductsContext(() => runRuntime(req, res));
    }
    if (req.query?.route === 'alice-shopping') return await runAliceShoppingWithPrompt(req, res);
    if (req.query?.route === 'init-products') return await runWithProductsContext(() => runRuntime(req, res));
    if (req.query?.route === 'daily') {
      try {
        const cleanup = await prepareDailyTopicCleanup({
          token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch,
        });
        console.log('RUDI_TOPIC_CLEANUP_RESULT', cleanup);
      } catch (error) { console.error('RUDI_DAILY_TOPIC_CLEANUP_ERROR', error); }

      const runtimeResult = await runRuntime(req, res);
      try {
        const labor = await publishDailyLaborArticle();
        if (labor) console.log('RUDI_LABOR_ARTICLE_RESULT', labor);
      } catch (error) { console.error('RUDI_LABOR_ARTICLE_ERROR', error); }
      return runtimeResult;
    }
    if (req.query?.route === 'health') return await runHealthWithoutCouple(req, res);
    return await runRuntime(req, res);
  } catch (error) {
    console.error('RUDI_RUNTIME_ERROR', error);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.runRuntime = runRuntime;
module.exports.runHealthWithoutCouple = runHealthWithoutCouple;
module.exports.runAliceShoppingWithPrompt = runAliceShoppingWithPrompt;
module.exports.publishDailyLaborArticle = publishDailyLaborArticle;
module.exports.sanitizeStagePriceText = sanitizeStagePriceText;
