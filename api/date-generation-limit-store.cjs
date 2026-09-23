const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-date-generation-limit-v1';
const MAX_GENERATIONS = 5;
const REFILL_MS = 24 * 60 * 60 * 1000;
const TTL_SECONDS = 60 * 60 * 24 * 30;

let mutationTail = Promise.resolve();

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function stateKey(actor) {
  const clean = cleanActor(actor);
  if (!clean) throw new Error('date-generation-actor-invalid');
  return clean === 'Диана' ? 'diana' : 'rustam';
}

function cacheOf(options = {}) {
  return options.dateGenerationCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function normalizedUses(value, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const floor = now - REFILL_MS;
  return (Array.isArray(source.usedAt) ? source.usedAt : [])
    .map((raw) => new Date(String(raw || '')).getTime())
    .filter((time) => Number.isFinite(time) && time > floor && time <= now + 60_000)
    .sort((a, b) => a - b)
    .slice(-MAX_GENERATIONS);
}

function quotaFromUses(uses, now = Date.now()) {
  const active = normalizedUses({ usedAt: uses.map((time) => new Date(time).toISOString()) }, now);
  const available = Math.max(0, MAX_GENERATIONS - active.length);
  const nextRefillAt = active.length
    ? new Date(active[0] + REFILL_MS).toISOString()
    : '';
  return {
    max: MAX_GENERATIONS,
    available,
    used: active.length,
    nextRefillAt,
    blockedUntil: available === 0 ? nextRefillAt : '',
  };
}

async function readDateGenerationQuota(actor, options = {}) {
  const now = Number(options.now || Date.now());
  const state = await cacheOf(options).get(stateKey(actor));
  const uses = normalizedUses(state, now);
  return quotaFromUses(uses, now);
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function recordSuccessfulDateGeneration(actor, options = {}) {
  return enqueueMutation(async () => {
    const now = Number(options.now || Date.now());
    const cache = cacheOf(options);
    const key = stateKey(actor);
    const current = await cache.get(key);
    const uses = normalizedUses(current, now);
    if (uses.length >= MAX_GENERATIONS) {
      const error = new Error('date-generation-limit');
      error.quota = quotaFromUses(uses, now);
      throw error;
    }
    uses.push(now);
    await cache.set(key, {
      usedAt: uses.map((time) => new Date(time).toISOString()),
      updatedAt: new Date(now).toISOString(),
    }, {
      ttl: TTL_SECONDS,
      tags: ['rudi-date-generation-limit'],
      name: key,
    });
    return quotaFromUses(uses, now);
  });
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  MAX_GENERATIONS,
  REFILL_MS,
  normalizedUses,
  quotaFromUses,
  readDateGenerationQuota,
  recordSuccessfulDateGeneration,
  resetMutationQueueForTests,
};
