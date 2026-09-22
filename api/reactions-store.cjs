const { createStrictRuntimeCache, hashRuntimeCacheKey } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-reactions-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const ACTORS = new Set(['Рустам', 'Диана']);
const TARGET_TYPES = new Set(['partner-message', 'daily-idea', 'watch', 'feed', 'photo-memory']);
const MAX_TARGET_KEY = 220;
const MAX_BATCH = 12;

function cacheOf(options = {}) {
  return options.reactionsCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
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

function actorSlug(actor) {
  if (actor === 'Рустам') return 'rustam';
  if (actor === 'Диана') return 'diana';
  throw new Error('reaction-actor-invalid');
}

function cacheKey(target, actor) {
  const targetHash = hashRuntimeCacheKey(`${target.type}:${target.key}`);
  return `reaction:${target.type}:${targetHash}:${actorSlug(actor)}`;
}

function storedLiked(value) {
  if (value === null || value === undefined) return false;
  if (value && typeof value === 'object' && typeof value.liked === 'boolean') return value.liked;
  return Boolean(value);
}

async function readReaction(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const cache = cacheOf(options);
  const rows = await Promise.all([...ACTORS].map(async (actor) => {
    const value = await cache.get(cacheKey(target, actor));
    return [actor, storedLiked(value)];
  }));
  const likedBy = rows.filter(([, liked]) => liked).map(([actor]) => actor);
  return { ...target, likedBy, count: likedBy.length };
}

async function readReactions(targets, options = {}) {
  const list = Array.isArray(targets) ? targets : [];
  if (!list.length || list.length > MAX_BATCH) throw new Error('reaction-targets-invalid');
  return Promise.all(list.map((target) => readReaction(target, options)));
}

async function setReaction(targetInput, actorInput, likedInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const actor = normalizeActor(actorInput);
  if (typeof likedInput !== 'boolean') throw new Error('reaction-liked-invalid');
  const cache = cacheOf(options);
  const key = cacheKey(target, actor);
  const otherActors = [...ACTORS].filter((value) => value !== actor);

  const otherRows = await Promise.all(otherActors.map(async (otherActor) => [
    otherActor,
    Boolean(await cache.get(cacheKey(target, otherActor))),
  ]));

  await cache.set(key, {
    actor,
    liked: likedInput,
    reactedAt: new Date(options.now || Date.now()).toISOString(),
  }, {
    ttl: TTL_SECONDS,
    tags: ['rudi-reactions', `rudi-reaction-${target.type}`],
    name: key,
  });

  const likedBy = otherRows.filter(([, liked]) => liked).map(([name]) => name);
  if (likedInput) likedBy.push(actor);

  return {
    ...target,
    likedBy: [...ACTORS].filter((name) => likedBy.includes(name)),
    count: likedBy.length,
  };
}

async function toggleReaction(targetInput, actorInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const actor = normalizeActor(actorInput);
  const cache = cacheOf(options);
  const key = cacheKey(target, actor);

  const otherActors = [...ACTORS].filter((value) => value !== actor);
  const [existing, otherRows] = await Promise.all([
    cache.get(key),
    Promise.all(otherActors.map(async (otherActor) => [
      otherActor,
      storedLiked(await cache.get(cacheKey(target, otherActor))),
    ])),
  ]);

  const nextLiked = !storedLiked(existing);
  await cache.set(key, {
    actor,
    liked: nextLiked,
    reactedAt: new Date(options.now || Date.now()).toISOString(),
  }, {
    ttl: TTL_SECONDS,
    tags: ['rudi-reactions', `rudi-reaction-${target.type}`],
    name: key,
  });

  const likedBy = otherRows.filter(([, liked]) => liked).map(([name]) => name);
  if (nextLiked) likedBy.push(actor);

  return {
    ...target,
    likedBy: [...ACTORS].filter((name) => likedBy.includes(name)),
    count: likedBy.length,
  };
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  ACTORS,
  TARGET_TYPES,
  normalizeTarget,
  actorSlug,
  cacheKey,
  readReaction,
  readReactions,
  setReaction,
  toggleReaction,
};
