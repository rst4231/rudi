const base = require('./topic-maintenance-base.cjs');
const { rewriteClientsTelegramRequest } = require('./clients-advice.cjs');

function telegramMethod(input) {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
  try {
    const url = new URL(raw);
    if (url.hostname !== 'api.telegram.org') return '';
    return url.pathname.match(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/)?.[1] || '';
  } catch {
    return '';
  }
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
    return terminalSuccessResponse(input, await fetchImpl(input, rewritten));
  };
}

function prepareDailyTopicCleanup(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return base.prepareDailyTopicCleanup({ ...options, fetchImpl: wrapFetch(fetchImpl, options) });
}

function handleTelegramTopicRequest(input, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return base.handleTelegramTopicRequest(input, init, { ...options, fetchImpl: wrapFetch(fetchImpl, options) });
}

module.exports = {
  ...base,
  terminalSuccessResponse,
  prepareDailyTopicCleanup,
  handleTelegramTopicRequest,
};
