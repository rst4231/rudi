const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-lulu-v1';
const STATE_KEY = 'lulu';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

let mutationTail = Promise.resolve();

function cacheOf(options = {}) {
  return options.luluCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function normalizeWalk(value) {
  if (!value || typeof value !== 'object') return null;
  const actor = cleanActor(value.actor);
  const date = new Date(value.walkedAt || 0);
  if (!actor || Number.isNaN(date.getTime())) return null;
  return { actor, walkedAt: date.toISOString() };
}

function normalizeLuluState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const lastWalk = normalizeWalk(source.lastWalk);
  const rawUpdatedAt = String(source.updatedAt || '').trim();
  const updatedDate = rawUpdatedAt ? new Date(rawUpdatedAt) : null;
  const updatedAt = lastWalk
    ? lastWalk.walkedAt
    : (updatedDate && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toISOString() : '');
  return {
    initialized: Boolean(source.initialized),
    version: Math.max(0, Number(source.version || 0)),
    lastWalk,
    updatedAt,
  };
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readLuluState(options = {}) {
  const value = await cacheOf(options).get(STATE_KEY);
  return normalizeLuluState(value);
}

async function writeLuluState(value, options = {}) {
  const state = normalizeLuluState({ ...value, initialized: true });
  await cacheOf(options).set(STATE_KEY, state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-lulu'],
    name: STATE_KEY,
  });
  return state;
}

async function markLuluWalk(actor, options = {}) {
  const clean = cleanActor(actor);
  if (!clean) throw new Error('lulu-actor-invalid');
  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    const walkedAt = new Date(options.now || Date.now()).toISOString();
    return writeLuluState({
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      lastWalk: { actor: clean, walkedAt },
      updatedAt: walkedAt,
    }, options);
  });
}

async function restoreLuluState(snapshot, options = {}) {
  const saved = normalizeLuluState(snapshot);
  if (!saved.initialized) return readLuluState(options);
  const current = await readLuluState(options);
  if (current.initialized && Number(current.version || 0) >= Number(saved.version || 0)) return current;
  return writeLuluState(saved, options);
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  STATE_KEY,
  TTL_SECONDS,
  normalizeLuluState,
  readLuluState,
  writeLuluState,
  markLuluWalk,
  restoreLuluState,
  resetMutationQueueForTests,
};
