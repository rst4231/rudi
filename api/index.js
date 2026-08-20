require('@vercel/functions');
const fs = require('node:fs');
const {
  runWithCronSecretHidden,
  installGlobalTelegramFetchGuard,
} = require('./runtime-guard.cjs');
const {
  addBoughtButtonToTelegramRequest,
  handleBoughtCallback,
  runWithProductsContext,
  runWithExistingClearAction,
  runWithAnsweredCallbackContext,
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
const {
  sanitizeAliceShoppingPayload,
  isAliceShoppingLaunch,
  buildAliceShoppingLaunchResponse,
} = require('./alice-shopping-response.cjs');
const {
  sanitizeProductPayload,
  sanitizeProductTelegramRequest,
  isTelegramProductAddition,
  isTelegramClearIntent,
  shouldIgnorePassiveTelegramMessage,
  isProductsClearCallback,
  isProductsAddCallback,
  isEmptyAliceShoppingRequest,
  isAliceClearIntent,
  buildAliceClearDeniedResponse,
  normalizeProductsActor,
  runProductsAddition,
  runAuthorizedProductsClear,
  markProductsRuntimeStale,
} = require('./products-state.cjs');
const { publishLaborArticle } = require('./labor-code.cjs');
const { resolveForumChatId, rememberForumChatId } = require('./forum-chat-id.cjs');

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

  try { nextInit = sanitizeProductTelegramRequest(nextInit); }
  catch (error) { console.error('RUDI_PRODUCTS_OUTPUT_SANITIZER_ERROR', error); }

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

async function validateTelegramCallback(req) {
  const callbackId = req?.body?.callback_query?.id;
  if (!callbackId) throw new Error('Telegram callback query id is missing');
  const token = resolveTelegramBotToken(process.env);
  const response = await nativeFetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram answerCallbackQuery failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return true;
}

async function answerProductsAddCallback(req) {
  const callbackId = req?.body?.callback_query?.id;
  if (!callbackId) return false;
  const token = resolveTelegramBotToken(process.env);
  const response = await nativeFetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text: 'Напишите продукт сообщением в этой теме.',
    }),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram answerCallbackQuery failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return true;
}

async function runAliceShoppingWithPrompt(req, res) {
  if (typeof res?.json !== 'function') return runWithProductsContext(() => runRuntime(req, res));
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeProductPayload(sanitizeAliceShoppingPayload(payload)));
  try { return await runWithProductsContext(() => runRuntime(req, res)); }
  finally { res.json = originalJson; }
}

function getMoscowDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isLaborBootstrapAllowed(date = new Date()) {
  return getMoscowDateKey(date) === '2026-08-20';
}

function readGeneratedRuntimeSource() {
  try { return fs.readFileSync(require.resolve('../runtime/generated-runtime.cjs'), 'utf8'); }
  catch { return ''; }
}

async function publishDailyLaborArticle() {
  const token = resolveTelegramBotToken(process.env);
  const cachedChatId = await getKnownForumChatId();
  const chatId = resolveForumChatId({
    cached: cachedChatId,
    env: process.env,
    runtimeSource: cachedChatId === null ? readGeneratedRuntimeSource() : '',
  });
  if (chatId === null) {
    console.error('RUDI_LABOR_ARTICLE_ERROR', new Error('Telegram forum chat id could not be resolved'));
    return null;
  }
  const labor = await publishLaborArticle({ token, chatId, fetchImpl: nativeFetch });
  if (cachedChatId === null && labor?.topicId) {
    const { getCache } = require('@vercel/functions');
    const cache = getCache({ namespace: 'rudi-topic-maintenance-v1' });
    await rememberForumChatId(cache, chatId);
  }
  return labor;
}

async function handler(req, res) {
  try {
    if (req.query?.route === 'telegram') {
      if (isRemovedCoupleTopicUpdate(req)) return res.status(200).json({ ok: true, ignored: 'removed-couple-topic' });
      if (shouldIgnorePassiveTelegramMessage(req)) {
        return res.status(200).json({ ok: true, ignored: 'passive-chat-message' });
      }

      const boughtAction = await handleBoughtCallback(req, res);
      if (boughtAction?.empty) return res.status(200).json({ ok: true, ignored: 'empty-products' });
      if (boughtAction) {
        normalizeProductsActor(req);
        return await runAuthorizedProductsClear(
          () => runWithExistingClearAction(req, boughtAction.clearCallbackData, () => runRuntime(req, res)),
        );
      }

      if (isProductsClearCallback(req)) {
        try {
          await validateTelegramCallback(req);
        } catch (error) {
          console.warn('RUDI_PRODUCTS_CLEAR_CALLBACK_REJECTED', String(error?.message || error));
          return res.status(200).json({ ok: true, ignored: 'invalid-products-clear-callback' });
        }
        normalizeProductsActor(req);
        return await runAuthorizedProductsClear(
          () => runWithAnsweredCallbackContext(
            () => runWithProductsContext(() => runRuntime(req, res)),
          ),
        );
      }

      if (isTelegramClearIntent(req)) {
        return res.status(200).json({ ok: true, ignored: 'typed-products-clear-disabled' });
      }

      if (isProductsAddCallback(req)) {
        try { await answerProductsAddCallback(req); }
        catch (error) { console.warn('RUDI_PRODUCTS_ADD_CALLBACK_ERROR', String(error?.message || error)); }
        return res.status(200).json({ ok: true, ignored: 'products-add-button-prompted' });
      }

      if (isTelegramProductAddition(req)) {
        return await runProductsAddition(
          req,
          () => runWithProductsContext(() => runRuntime(req, res)),
        );
      }

      if (Number(req.body?.callback_query?.message?.message_thread_id) === 263
        || Number(req.body?.message?.message_thread_id) === 263
        || Number(req.body?.edited_message?.message_thread_id) === 263) {
        return res.status(200).json({ ok: true, ignored: 'non-mutating-products-update' });
      }

      return await runRuntime(req, res);
    }
    if (req.query?.route === 'alice-shopping') {
      if (isEmptyAliceShoppingRequest(req)) {
        return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      }
      if (isAliceShoppingLaunch(req)) {
        return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      }
      if (isAliceClearIntent(req)) {
        return res.status(200).json(buildAliceClearDeniedResponse(req));
      }
      if (req.body?.request?.type !== 'SimpleUtterance') {
        return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      }
      return await runProductsAddition(req, async () => {
        return await runAliceShoppingWithPrompt(req, res);
      });
    }
    if (req.query?.route === 'init-products') {
      return res.status(200).json({ ok: true, ignored: 'init-products-disabled' });
    }
    if (req.query?.route === 'labor-bootstrap') {
      if (!isLaborBootstrapAllowed()) {
        return res.status(410).json({ ok: false, error: 'labor-bootstrap-expired' });
      }
      const labor = await publishDailyLaborArticle();
      if (labor) console.log('RUDI_LABOR_BOOTSTRAP_RESULT', labor);
      return res.status(labor ? 200 : 503).json({ ok: Boolean(labor), labor });
    }
    if (req.query?.route === 'daily') {
      try {
        const cleanup = await prepareDailyTopicCleanup({
          token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch,
        });
        console.log('RUDI_TOPIC_CLEANUP_RESULT', cleanup);
      } catch (error) { console.error('RUDI_DAILY_TOPIC_CLEANUP_ERROR', error); }

      let runtimeResult;
      try { runtimeResult = await runRuntime(req, res); }
      finally { markProductsRuntimeStale(); }
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
module.exports.validateTelegramCallback = validateTelegramCallback;
module.exports.answerProductsAddCallback = answerProductsAddCallback;
module.exports.publishDailyLaborArticle = publishDailyLaborArticle;
module.exports.isLaborBootstrapAllowed = isLaborBootstrapAllowed;
module.exports.sanitizeStagePriceText = sanitizeStagePriceText;
