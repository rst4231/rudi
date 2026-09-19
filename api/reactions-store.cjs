const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-reactions-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const ACTORS = new Set(['Рустам', 'Диана']);
const TARGET_TYPES = new Set(['partner-message', 'daily-idea', 'watch']);
const MAX_TARGET_KEY = 220;
const MAX_BATCH = 12;

function cacheOf(options = {}) {
  return options.reactionsCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    confirmWrites: false,
  });
}

function normalizeActor(value) {
  const actor = String(value || '').trim();
  if (!ACTORS.has(actor)) throw new Error('reaction-actor-invalid');
  return actor;
}

function normalizeTarget(input) {
  const type = String(input?.type || '').trim();
  const key = String(input?.key || '').trim();
  if (!TARGET_TYPES.has(type)) throw new Error('reaction-target-invalid');
  if (!key || key.length > MAX_TARGET_KEY || !/^[A-Za-z0-9:_\-.]+$/.test(key)) {
    throw new Error('reaction-key-invalid');
  }
  return { type, key };
}

function cacheKey(target, actor) {
  return `${target.type}:${target.key}:${actor}`;
}

async function readReaction(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const cache = cacheOf(options);
  const rows = await Promise.all([...ACTORS].map(async (actor) => {
    const value = await cache.get(cacheKey(target, actor));
    return [actor, Boolean(value)];
  }));
  const likedBy = rows.filter(([, liked]) => liked).map(([actor]) => actor);
  return { ...target, likedBy, count: likedBy.length };
}

async function readReactions(targets, options = {}) {
  const list = Array.isArray(targets) ? targets : [];
  if (!list.length || list.length > MAX_BATCH) throw new Error('reaction-targets-invalid');
  return Promise.all(list.map((target) => readReaction(target, options)));
}

async function toggleReaction(targetInput, actorInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const actor = normalizeActor(actorInput);
  const cache = cacheOf(options);
  const key = cacheKey(target, actor);
  const existing = await cache.get(key);
  if (existing) {
    await cache.delete(key);
  } else {
    await cache.set(key, {
      actor,
      reactedAt: new Date(options.now || Date.now()).toISOString(),
    }, {
      ttl: TTL_SECONDS,
      tags: ['rudi-reactions', `rudi-reaction-${target.type}`],
      name: key,
    });
  }
  return readReaction(target, options);
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  ACTORS,
  TARGET_TYPES,
  normalizeTarget,
  readReaction,
  readReactions,
  toggleReaction,
};
