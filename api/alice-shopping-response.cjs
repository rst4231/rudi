const OLD_PROMPT_RE = /Не понял, что добавить[.!?]?/g;
const NEW_PROMPT = 'Какие продукты вы хотите добавить?';

function sanitizeAliceShoppingPayload(value) {
  if (typeof value === 'string') {
    return value.replace(OLD_PROMPT_RE, NEW_PROMPT);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeAliceShoppingPayload);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeAliceShoppingPayload(item)]),
    );
  }
  return value;
}

function isAliceShoppingLaunch(req) {
  const body = req?.body || {};
  const command = typeof body?.request?.command === 'string' ? body.request.command.trim() : '';
  const utterance = typeof body?.request?.original_utterance === 'string' ? body.request.original_utterance.trim() : '';
  return body?.session?.new === true && !command && !utterance;
}

function buildAliceShoppingLaunchResponse(req) {
  return {
    response: {
      text: NEW_PROMPT,
      tts: NEW_PROMPT,
      end_session: false,
    },
    version: req?.body?.version || '1.0',
  };
}

module.exports = {
  sanitizeAliceShoppingPayload,
  isAliceShoppingLaunch,
  buildAliceShoppingLaunchResponse,
};
