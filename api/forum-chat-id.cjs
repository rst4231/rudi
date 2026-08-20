const FORUM_CHAT_ID_PATTERN = /^-100\d{6,}$/;
const PREFERRED_ENV_KEYS = [
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_GROUP_ID',
  'TELEGRAM_FORUM_CHAT_ID',
  'TG_CHAT_ID',
  'TG_GROUP_ID',
  'FORUM_CHAT_ID',
  'CHAT_ID',
];
const CHAT_KEY_PATTERN = /(telegram|(^|_)tg(_|$)|chat|forum|group)/i;
const TOPIC_CHAT_KEYS = ['topic:19:chat-id', 'topic:44:chat-id'];
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 35;

function normalizeForumChatId(value) {
  const text = String(value ?? '').trim();
  return FORUM_CHAT_ID_PATTERN.test(text) ? text : null;
}

function findForumChatIdInEnv(env = {}) {
  for (const key of PREFERRED_ENV_KEYS) {
    const candidate = normalizeForumChatId(env[key]);
    if (candidate) return candidate;
  }

  const candidates = new Set();
  for (const [key, value] of Object.entries(env)) {
    if (!CHAT_KEY_PATTERN.test(key)) continue;
    const candidate = normalizeForumChatId(value);
    if (candidate) candidates.add(candidate);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

function findForumChatIdInRuntime(runtimeSource = '') {
  const candidates = new Set(String(runtimeSource).match(/-100\d{6,}/g) || []);
  return candidates.size === 1 ? [...candidates][0] : null;
}

function resolveForumChatId({ cached = null, env = {}, runtimeSource = '' } = {}) {
  return normalizeForumChatId(cached)
    || findForumChatIdInEnv(env)
    || findForumChatIdInRuntime(runtimeSource)
    || null;
}

async function rememberForumChatId(cache, chatId) {
  const normalized = normalizeForumChatId(chatId);
  if (!normalized) return false;
  if (!cache || typeof cache.set !== 'function') throw new Error('Runtime cache is required');
  for (const key of TOPIC_CHAT_KEYS) {
    await cache.set(key, normalized, { ttl: CACHE_TTL_SECONDS, tags: ['rudi-topic-messages'] });
  }
  return true;
}

module.exports = {
  normalizeForumChatId,
  findForumChatIdInEnv,
  findForumChatIdInRuntime,
  resolveForumChatId,
  rememberForumChatId,
};
