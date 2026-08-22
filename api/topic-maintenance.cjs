const base = require('./topic-maintenance-base.cjs');
const { rewriteClientsTelegramRequest } = require('./clients-advice.cjs');
const { handleHolidayPublication } = require('./holiday-rollover.cjs');
const { getTopicMaintenanceCache } = require('./stateful-cache.cjs');

function resolveTopicCache(options = {}) {
  return options.cache || getTopicMaintenanceCache(options.cacheOptions || {});
}

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch { return ''; }
}

async function terminalSuccessResponse(input, response) {
  if (!response || response.ok || response.status !== 400) return response;
  let detail = '';
  try { detail = await response.clone().text(); } catch {}
  const method = telegramMethod(input);
  const topicAlreadyGone = method === 'deleteForumTopic' && /TOPIC_ID_INVALID/i.test(detail);
  const messageAlreadyGone = method === 'deleteMessages'
    && /message to delete not found|MESSAGE_ID_INVALID|message identifier is not specified/i.test(detail);
  if (!topicAlreadyGone && !messageAlreadyGone) return response;
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function wrapFetch(fetchImpl, options = {}) {
  return async (input, init = {}) => {
    const rewritten = await rewriteClientsTelegramRequest(input, init, {
      fetchImpl: options.configFetchImpl || fetchImpl,
      configUrl: options.clientsAdviceConfigUrl,
      localConfig: options.clientsAdviceLocalConfig,
      now: options.now,
    });
    const response = await terminalSuccessResponse(input, await fetchImpl(input, rewritten));
    try {
      return await handleHolidayPublication(input, rewritten, response, {
        fetchImpl,
        now: options.now,
        stateCache: options.holidayStateCache,
        topicCache: options.holidayTopicCache,
        cacheOptions: options.holidayCacheOptions,
      });
    } catch (error) {
      console.error('RUDI_HOLIDAY_ROLLOVER_ERROR', error);
      return response;
    }
  };
}

function prepareDailyTopicCleanup(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const cache = resolveTopicCache(options);
  return base.prepareDailyTopicCleanup({ ...options, cache, fetchImpl: wrapFetch(fetchImpl, options) });
}

function handleTelegramTopicRequest(input, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const payload = base.parseRequestPayload(init);
  const topicId = Number(payload?.message_thread_id);
  const needsCache = topicId === base.EVENTS_TOPIC_ID
    || topicId === base.HOLIDAYS_TOPIC_ID
    || topicId === base.COUPLE_TOPIC_ID;
  const cache = options.cache || (needsCache ? resolveTopicCache(options) : undefined);
  return base.handleTelegramTopicRequest(input, init, {
    ...options,
    ...(cache ? { cache } : {}),
    fetchImpl: wrapFetch(fetchImpl, options),
  });
}

function getKnownForumChatId(options = {}) {
  return base.getKnownForumChatId({ ...options, cache: resolveTopicCache(options) });
}

module.exports = {
  ...base,
  terminalSuccessResponse,
  prepareDailyTopicCleanup,
  handleTelegramTopicRequest,
  getKnownForumChatId,
  resolveTopicCache,
};
