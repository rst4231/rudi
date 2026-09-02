const base = require('./topic-maintenance-base.cjs');
const { rememberActiveEventMessages, rememberEventCleanupStatus, deleteActiveEventMessagesBeforeDate } = require('./event-active-rollover.cjs');
const { rewriteClientsTelegramRequest } = require('./clients-advice.cjs');
const { handleHolidayPublication } = require('./holiday-rollover.cjs');
const { getTopicMaintenanceCache, getDailyContentCache, getControlPlaneCache } = require('./stateful-cache.cjs');
const { FACTS_TOPIC_ID, LULU_TOPIC_ID, wrapDailyContentDedupe } = require('./daily-content-dedupe.cjs');
const { loadDailyContentCatalog } = require('./daily-content-config.cjs');
const { loadRudiSettings } = require('./rudi-settings.cjs');
const { applySectionControlToTelegramRequest, currentPublicationContext, topicSectionMap } = require('./section-controls.cjs');
const { buildFeedbackMarkup, incrementSectionMetric } = require('./feedback-analytics.cjs');
const { rememberFingerprints } = require('./content-fingerprint.cjs');
const { moscowDateKey } = require('./preview-date.cjs');

const POSTER_PROXY_BASE = 'https://spb-daily-guide-bot.vercel.app/api/poster-proxy';
const PROXIED_POSTER_HOST = /^(?:cdn\.mirage\.ru|s\d+ru1\.kinoplan24\.ru)$/iu;
const EVENT_POST_METHODS = new Set([
  'sendMessage', 'sendPhoto', 'sendMediaGroup', 'sendDocument', 'sendVideo',
  'sendAudio', 'sendVoice', 'sendAnimation', 'sendVenue', 'sendLocation',
  'sendContact', 'sendPoll', 'sendDice', 'sendSticker',
]);

function resolveTopicCache(options = {}) { return options.cache || getTopicMaintenanceCache(options.cacheOptions || {}); }
function resolveDailyContentCache(options = {}) { return options.dailyContentCache || getDailyContentCache(options.dailyContentCacheOptions || {}); }
function resolveControlCache(options = {}) { return options.controlCache || getControlPlaneCache(options.controlCacheOptions || {}); }

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try { const url = new URL(raw); if (url.hostname !== 'api.telegram.org') return ''; return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || ''; } catch { return ''; }
}

function responseMessageIds(result) {
  const rows = Array.isArray(result) ? result : [result];
  return rows.map((row) => Number(row?.message_id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function rememberCleanupStatusSafe(status, cache) {
  try { return await rememberEventCleanupStatus(status, cache); }
  catch (error) { console.warn('RUDI_EVENT_CLEANUP_STATUS_ERROR', String(error?.message || error)); return null; }
}

function rewriteTelegramPhotoRequest(input, init = {}) {
  if (telegramMethod(input) !== 'sendPhoto') return init;
  const payload = base.parseRequestPayload(init); if (!payload || typeof payload.photo !== 'string') return init;
  let photoUrl; try { photoUrl = new URL(payload.photo); } catch { return init; }
  if (photoUrl.protocol !== 'https:' || !PROXIED_POSTER_HOST.test(photoUrl.hostname)) return init;
  const photo = `${POSTER_PROXY_BASE}?url=${encodeURIComponent(photoUrl.toString())}`;
  if (typeof init.body === 'string') return { ...init, body: JSON.stringify({ ...payload, photo }) };
  if (init.body instanceof URLSearchParams) { const body = new URLSearchParams(init.body); body.set('photo', photo); return { ...init, body }; }
  return init;
}

async function terminalSuccessResponse(input, response) {
  if (!response || response.ok || response.status !== 400) return response;
  let detail = ''; try { detail = await response.clone().text(); } catch {}
  const method = telegramMethod(input);
  const topicAlreadyGone = method === 'deleteForumTopic' && /TOPIC_ID_INVALID/i.test(detail);
  const messageAlreadyGone = method === 'deleteMessages' && /message to delete not found|MESSAGE_ID_INVALID|message identifier is not specified/i.test(detail);
  if (!topicAlreadyGone && !messageAlreadyGone) return response;
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function withReplyMarkup(init, markup) {
  if (!markup) return init;
  const payload = base.parseRequestPayload(init); if (!payload || payload.reply_markup) return init;
  if (typeof init.body === 'string') return { ...init, body: JSON.stringify({ ...payload, reply_markup: markup }) };
  if (init.body instanceof URLSearchParams) { const body = new URLSearchParams(init.body); body.set('reply_markup', JSON.stringify(markup)); return { ...init, body }; }
  return init;
}

async function resolveSettings(options = {}) {
  if (options.settings) return options.settings;
  const contextSettings = currentPublicationContext()?.settings;
  if (contextSettings) return contextSettings;
  try {
    const loaded = await loadRudiSettings({ cache: resolveControlCache(options), fetchImpl: options.settingsFetchImpl === undefined ? null : options.settingsFetchImpl });
    return loaded.settings;
  } catch (error) {
    console.warn('RUDI_SETTINGS_LOAD_ERROR', String(error?.message || error));
    return require('../config/rudi-settings.json');
  }
}

function manualControlResult(init, settings) {
  const payload = base.parseRequestPayload(init);
  const section = topicSectionMap(settings).get(Number(payload?.message_thread_id)) || null;
  return { handled: false, init, section };
}

function wrapFetch(fetchImpl, options = {}) {
  return async (input, init = {}) => {
    const settings = await resolveSettings(options);
    const controlCache = resolveControlCache(options);
    const publicationDate = options.publicationDate || currentPublicationContext()?.date || moscowDateKey(options.now || new Date());
    const control = options.bypassSectionControls
      ? manualControlResult(init, settings)
      : await applySectionControlToTelegramRequest(input, init, { ...options, settings, cache: controlCache, date: publicationDate });
    if (control.handled) return control.response;

    let clientSelection = null;
    const clientRewritten = await rewriteClientsTelegramRequest(input, control.init, {
      fetchImpl: options.configFetchImpl || fetchImpl,
      configUrl: options.clientsAdviceConfigUrl,
      settings,
      localConfig: options.clientsAdviceLocalConfig,
      dedupeCache: controlCache,
      now: options.now,
      onSelected: (selection) => { clientSelection = selection; },
    });
    let rewritten = rewriteTelegramPhotoRequest(input, clientRewritten);
    const controlledPayload = base.parseRequestPayload(rewritten);
    const topicId = Number(controlledPayload?.message_thread_id);
    const section = control.section;
    if (section) rewritten = withReplyMarkup(rewritten, buildFeedbackMarkup(section, publicationDate, options.env || process.env));

    let dailyContentFetch = fetchImpl;
    if (!options.bypassDailyDedupe && (topicId === FACTS_TOPIC_ID || topicId === LULU_TOPIC_ID)) {
      const catalog = await loadDailyContentCatalog({
        fetchImpl: options.configFetchImpl || fetchImpl,
        configUrl: options.dailyContentConfigUrl,
        sequenceConfigUrl: options.dailyContentSequenceUrl,
        settings,
        localConfig: options.dailyContentLocalConfig,
        localSequenceState: options.dailyContentLocalSequenceState,
        now: options.now,
      });
      dailyContentFetch = wrapDailyContentDedupe(fetchImpl, { cache: resolveDailyContentCache(options), catalog, alwaysReplace: true, now: options.now });
    }
    const response = await terminalSuccessResponse(input, await dailyContentFetch(input, rewritten));
    if (response?.ok && clientSelection?.fingerprint) {
      try {
        await rememberFingerprints('clients', [clientSelection.fingerprint], settings.dedupe?.clientsDays || 45, { cache: controlCache, now: options.now });
        if (clientSelection.offset > 0) await incrementSectionMetric('clients', 'duplicateSuppressions', clientSelection.offset, { cache: controlCache, now: options.now });
      } catch (error) { console.warn('RUDI_CLIENTS_DEDUPE_STATE_ERROR', String(error?.message || error)); }
    }
    try {
      return await handleHolidayPublication(input, rewritten, response, { fetchImpl, now: options.now, stateCache: options.holidayStateCache, topicCache: options.holidayTopicCache, cacheOptions: options.holidayCacheOptions });
    } catch (error) { console.error('RUDI_HOLIDAY_ROLLOVER_ERROR', error); return response; }
  };
}

async function cleanupPreviousEventPostsBeforePublish(input, init = {}, options = {}) {
  const payload = base.parseRequestPayload(init);
  if (Number(payload?.message_thread_id) !== base.EVENTS_TOPIC_ID) return null;
  const endpoint = base.telegramEndpoint(input);
  if (!endpoint || !EVENT_POST_METHODS.has(endpoint.method)) return null;
  const chatId = payload?.chat_id;
  if (chatId === undefined || chatId === null || chatId === '') return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cache = options.cache || resolveTopicCache(options);
  const now = options.now || new Date();
  const todayKey = base.dateKeyInMoscow(now);
  const targetDateKey = base.shiftDateKey(todayKey, -1);
  try {
    const active = await deleteActiveEventMessagesBeforeDate({
      beforeDateKey: todayKey,
      chatId,
      cache,
      baseUrl: endpoint.baseUrl,
      fetchImpl,
    });
    const dated = await base.deleteTrackedMessages({
      topicId: base.EVENTS_TOPIC_ID,
      targetDateKey,
      chatId,
      cache,
      baseUrl: endpoint.baseUrl,
      fetchImpl,
    });
    const deleted = Number(active?.deleted || 0) + Number(dated?.deleted || 0);
    await rememberCleanupStatusSafe({
      checkedAt: now,
      trigger: 'prepublish',
      date: todayKey,
      targetDateKey: active?.targetDateKey || targetDateKey,
      tracked: Number(active?.tracked || 0) + Number(dated?.deleted || 0),
      deleted,
      skipped: deleted ? null : (active?.skipped || (dated?.skipped ? 'dated-cleanup-skipped' : null)),
      error: null,
    }, cache);
    return { active, dated };
  } catch (error) {
    console.error('RUDI_EVENT_PREPUBLISH_CLEANUP_ERROR', { targetDateKey, error });
    await rememberCleanupStatusSafe({
      checkedAt: now,
      trigger: 'prepublish',
      date: todayKey,
      targetDateKey,
      tracked: 0,
      deleted: 0,
      skipped: null,
      error: String(error?.message || error),
    }, cache);
    return { error: String(error?.message || error) };
  }
}

async function prepareDailyTopicCleanup(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cache = resolveTopicCache(options);
  const token = String(options.token || '').trim();
  const now = options.now || new Date();
  const todayKey = base.dateKeyInMoscow(now);
  let active = null;
  let activeError = null;
  if (token) {
    try {
      active = await deleteActiveEventMessagesBeforeDate({
        beforeDateKey: todayKey,
        cache,
        baseUrl: `https://api.telegram.org/bot${token}`,
        fetchImpl,
      });
    } catch (error) {
      activeError = String(error?.message || error);
      console.error('RUDI_DAILY_ACTIVE_EVENT_CLEANUP_ERROR', error);
    }
  }

  let results;
  try {
    results = await base.prepareDailyTopicCleanup({ ...options, cache, fetchImpl: wrapFetch(fetchImpl, options) });
  } catch (error) {
    await rememberCleanupStatusSafe({
      checkedAt: now,
      trigger: 'daily',
      date: todayKey,
      targetDateKey: active?.targetDateKey || base.shiftDateKey(todayKey, -1),
      tracked: Number(active?.tracked || 0),
      deleted: Number(active?.deleted || 0),
      skipped: active?.skipped || null,
      error: activeError || String(error?.message || error),
    }, cache);
    throw error;
  }

  const eventRows = results.filter((row) => Number(row?.topicId) === base.EVENTS_TOPIC_ID);
  const datedDeleted = eventRows.reduce((sum, row) => sum + Number(row?.deleted || 0), 0);
  const eventError = activeError || eventRows.find((row) => row?.error)?.error || null;
  const deleted = Number(active?.deleted || 0) + datedDeleted;
  const activeTracked = active?.targetDateKey && active.targetDateKey < todayKey ? Number(active?.tracked || 0) : Number(active?.deleted || 0);
  const targetDateKey = active?.targetDateKey && active.targetDateKey < todayKey
    ? active.targetDateKey
    : (eventRows.find((row) => row?.targetDateKey)?.targetDateKey || base.shiftDateKey(todayKey, -1));
  await rememberCleanupStatusSafe({
    checkedAt: now,
    trigger: 'daily',
    date: todayKey,
    targetDateKey,
    tracked: activeTracked + datedDeleted,
    deleted,
    skipped: deleted ? null : (active?.skipped || (eventRows.some((row) => row?.skipped) ? 'dated-cleanup-skipped' : null)),
    error: eventError,
  }, cache);
  return results;
}

async function handleTelegramTopicRequest(input, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const payload = base.parseRequestPayload(init);
  const topicId = Number(payload?.message_thread_id);
  const endpoint = base.telegramEndpoint(input);
  const isEventPost = topicId === base.EVENTS_TOPIC_ID && endpoint && EVENT_POST_METHODS.has(endpoint.method);
  const needsCache = topicId === base.EVENTS_TOPIC_ID || topicId === base.HOLIDAYS_TOPIC_ID || topicId === base.COUPLE_TOPIC_ID;
  const cache = options.cache || (needsCache ? resolveTopicCache(options) : undefined);
  if (isEventPost) {
    await cleanupPreviousEventPostsBeforePublish(input, init, { ...options, ...(cache ? { cache } : {}), fetchImpl });
  }
  const response = await base.handleTelegramTopicRequest(input, init, { ...options, ...(cache ? { cache } : {}), fetchImpl: wrapFetch(fetchImpl, options) });
  if (isEventPost && response?.ok && cache) {
    try {
      const data = await response.clone().json();
      const messageIds = responseMessageIds(data?.result);
      if (messageIds.length) {
        await rememberActiveEventMessages({
          dateKey: base.dateKeyInMoscow(options.now || new Date()),
          chatId: payload?.chat_id,
          messageIds,
          cache,
        });
      }
    } catch (error) {
      console.error('RUDI_EVENT_ACTIVE_TRACK_ERROR', error);
    }
  }
  return response;
}
function getKnownForumChatId(options = {}) { return base.getKnownForumChatId({ ...options, cache: resolveTopicCache(options) }); }

module.exports = { ...base, POSTER_PROXY_BASE, PROXIED_POSTER_HOST, rewriteTelegramPhotoRequest, terminalSuccessResponse, wrapFetch, cleanupPreviousEventPostsBeforePublish, prepareDailyTopicCleanup, handleTelegramTopicRequest, getKnownForumChatId, resolveTopicCache, resolveDailyContentCache, resolveControlCache };