require('@vercel/functions');
const fs = require('node:fs');
const { runWithCronSecretHidden, installGlobalTelegramFetchGuard } = require('./runtime-guard.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const {
  handleTelegramTopicRequest,
  prepareDailyTopicCleanup,
  isRemovedCoupleTopicUpdate,
  sanitizeHealthPayload,
  getKnownForumChatId,
} = require('./topic-maintenance.cjs');
const { isAliceShoppingLaunch, buildAliceShoppingLaunchResponse } = require('./alice-shopping-response.cjs');
const { shouldIgnorePassiveTelegramMessage, isEmptyAliceShoppingRequest, isAliceClearIntent, markProductsRuntimeStale } = require('./products-state.cjs');
const {
  isProductsTopicUpdate, cleanAliceProductText, getAliceProductDeleteTarget, splitAliceProductItems,
  sendAliceProductMessage, deleteAliceProductMessage, buildAliceProductAddedResponse,
  buildAliceProductDeletedResponse, buildAliceNoSharedListResponse, acknowledgeLegacyProductsCallback,
} = require('./products-chat.cjs');
const { maybeSendEventCollage, compactEventTelegramRequest } = require('./event-collage.cjs');
const { publishLaborArticle } = require('./labor-code.cjs');
const { withLaborPublicationLease } = require('./labor-publication-lock.cjs');
const { resolveForumChatId, rememberForumChatId } = require('./forum-chat-id.cjs');
const { isCronRequestAuthorized } = require('./cron-auth.cjs');
const { getTopicMaintenanceCache, getLaborCache, getLaborLeaseCache } = require('./stateful-cache.cjs');
const { buildHealthPayload } = require('./control-plane-health.cjs');
const { handleFeedbackCallback } = require('./feedback-analytics.cjs');
const { runWithPublicationContext } = require('./section-controls.cjs');
const { recordEventSourceState } = require('./event-source-state.cjs');

let runtimeHandler;
let laborPublicationFlight = null;

function sanitizeStagePriceText(text) {
  if (typeof text !== 'string' || !text.includes('Stage StandUp Club')) return text;
  return text.split('\n').map((line) => {
    if (!line.startsWith('💳')) return line;
    const age = line.match(/\s·\s(\d+\+)\s*$/)?.[1];
    return `💳 стоимость уточняйте на странице билетов${age ? ` · ${age}` : ''}`;
  }).join('\n');
}

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.__RUDI_RECORD_EVENT_SOURCE_STATE__ = (sourceId, dateKey, result) => recordEventSourceState(sourceId, dateKey, result);
globalThis.fetch = async function stageSafeFetch(input, init = {}) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  if (!url.includes('api.telegram.org/')) return nativeFetch(input, init);
  let nextInit = init;
  try {
    if (typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      if (typeof body?.text === 'string' && body.text.includes('Stage StandUp Club')) nextInit = { ...init, body: JSON.stringify({ ...body, text: sanitizeStagePriceText(body.text) }) };
    } else if (init.body instanceof URLSearchParams) {
      const text = init.body.get('text');
      if (typeof text === 'string' && text.includes('Stage StandUp Club')) { const body = new URLSearchParams(init.body); body.set('text', sanitizeStagePriceText(text)); nextInit = { ...init, body }; }
    }
  } catch (error) { console.error('RUDI_STAGE_PRICE_SANITIZER_ERROR', error); }
  nextInit = compactEventTelegramRequest(nextInit);
  try {
    const collageResponse = await maybeSendEventCollage(input, nextInit, {
      fetchImpl: nativeFetch,
      telegramFetchImpl: (telegramUrl, telegramInit) => handleTelegramTopicRequest(telegramUrl, telegramInit, { fetchImpl: nativeFetch }),
    });
    if (collageResponse) return collageResponse;
  } catch (error) { console.error('RUDI_EVENT_COLLAGE_ERROR', error); }
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

function getMoscowDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function runRuntime(req, res, runtime = getRuntimeHandler()) {
  const execute = () => {
    if (req.query?.route === 'telegram' && process.env.CRON_SECRET) return runWithCronSecretHidden(() => runtime(req, res));
    return runtime(req, res);
  };
  const isDailyRoute = req.query?.route === 'daily';
  if (isDailyRoute) {
    return runWithPublicationContext({ date: getMoscowDateKey(), settings: req.rudiSettings }, execute);
  }
  return execute();
}

async function runHealthWithoutCouple(req, res) {
  if (typeof res?.json !== 'function') return runRuntime(req, res);
  const originalJson = res.json.bind(res); res.json = (payload) => originalJson(sanitizeHealthPayload(payload));
  try { return await runRuntime(req, res); } finally { res.json = originalJson; }
}

function isLaborBootstrapAllowed(date = new Date()) { return ['2026-08-20', '2026-08-26'].includes(getMoscowDateKey(date)); }
function readGeneratedRuntimeSource() { try { return fs.readFileSync(require.resolve('../runtime/generated-runtime.cjs'), 'utf8'); } catch { return ''; } }

async function publishDailyLaborArticle() {
  if (laborPublicationFlight) return laborPublicationFlight;
  const run = withLaborPublicationLease(async () => {
    const token = resolveTelegramBotToken(process.env); const cachedChatId = await getKnownForumChatId();
    const chatId = resolveForumChatId({ cached: cachedChatId, env: process.env, runtimeSource: cachedChatId === null ? readGeneratedRuntimeSource() : '' });
    if (chatId === null) { console.error('RUDI_LABOR_ARTICLE_ERROR', new Error('Telegram forum chat id could not be resolved')); return null; }
    const labor = await publishLaborArticle({ token, chatId, cache: getLaborCache(), fetchImpl: nativeFetch });
    if (cachedChatId === null && labor?.topicId) await rememberForumChatId(getTopicMaintenanceCache(), chatId);
    return labor;
  }, { cache: getLaborLeaseCache() });
  laborPublicationFlight = run;
  try { return await run; } finally { if (laborPublicationFlight === run) laborPublicationFlight = null; }
}

async function handler(req, res) {
  try {
    if (req.query?.route === 'telegram') {
      if (await handleFeedbackCallback(req, { token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch, env: process.env })) {
        return res.status(200).json({ ok: true, handled: 'feedback' });
      }
      if (isRemovedCoupleTopicUpdate(req)) return res.status(200).json({ ok: true, ignored: 'removed-couple-topic' });
      if (isProductsTopicUpdate(req)) {
        try { await acknowledgeLegacyProductsCallback(req, { token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch }); }
        catch (error) { console.warn('RUDI_PRODUCTS_LEGACY_CALLBACK_ACK_ERROR', String(error?.message || error)); }
        return res.status(200).json({ ok: true, ignored: 'products-chat-native' });
      }
      if (shouldIgnorePassiveTelegramMessage(req)) return res.status(200).json({ ok: true, ignored: 'passive-chat-message' });
      return await runRuntime(req, res);
    }

    if (req.query?.route === 'alice-shopping') {
      if (isEmptyAliceShoppingRequest(req)) return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      if (isAliceShoppingLaunch(req)) return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      if (isAliceClearIntent(req)) return res.status(200).json(buildAliceNoSharedListResponse(req));
      if (req.body?.request?.type !== 'SimpleUtterance') return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      const deleteTarget = getAliceProductDeleteTarget(req);
      if (deleteTarget) { const deletion = await deleteAliceProductMessage(req, { token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch }); return res.status(200).json(buildAliceProductDeletedResponse(req, deletion)); }
      if (!cleanAliceProductText(req) || !splitAliceProductItems(req).length) return res.status(200).json(buildAliceShoppingLaunchResponse(req));
      await sendAliceProductMessage(req, { token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch });
      return res.status(200).json(buildAliceProductAddedResponse(req));
    }

    if (req.query?.route === 'init-products') return res.status(200).json({ ok: true, ignored: 'init-products-disabled' });
    if (req.query?.route === 'labor-bootstrap') {
      if (!isLaborBootstrapAllowed()) return res.status(410).json({ ok: false, error: 'labor-bootstrap-expired' });
      const labor = await publishDailyLaborArticle(); if (labor) console.log('RUDI_LABOR_BOOTSTRAP_RESULT', labor);
      return res.status(labor ? 200 : 503).json({ ok: Boolean(labor), labor });
    }
    if (req.query?.route === 'daily') {
      if (!isCronRequestAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized-cron' });
      try { const cleanup = await prepareDailyTopicCleanup({ token: resolveTelegramBotToken(process.env), fetchImpl: nativeFetch }); console.log('RUDI_TOPIC_CLEANUP_RESULT', cleanup); }
      catch (error) { console.error('RUDI_DAILY_TOPIC_CLEANUP_ERROR', error); }
      let runtimeResult; try { runtimeResult = await runRuntime(req, res); } finally { markProductsRuntimeStale(); }
      try { const labor = await publishDailyLaborArticle(); if (labor) console.log('RUDI_LABOR_ARTICLE_RESULT', labor); } catch (error) { console.error('RUDI_LABOR_ARTICLE_ERROR', error); }
      return runtimeResult;
    }
    if (req.query?.route === 'health') return res.status(200).json(await buildHealthPayload());
    return await runRuntime(req, res);
  } catch (error) {
    console.error('RUDI_RUNTIME_ERROR', error);
    if (!res.headersSent) return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = handler;
module.exports.runRuntime = runRuntime;
module.exports.runHealthWithoutCouple = runHealthWithoutCouple;
module.exports.publishDailyLaborArticle = publishDailyLaborArticle;
module.exports.isLaborBootstrapAllowed = isLaborBootstrapAllowed;
module.exports.sanitizeStagePriceText = sanitizeStagePriceText;