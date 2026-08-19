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

module.exports = {
  sanitizeAliceShoppingPayload,
};
