const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-ui-preferences-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

let mutationTail = Promise.resolve();

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function cacheOf(options = {}) {
  return options.uiPreferencesCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function stateKey(actor) {
  const clean = cleanActor(actor);
  if (!clean) throw new Error('ui-preferences-actor-invalid');
  return clean === 'Диана' ? 'diana' : 'rustam';
}

function normalizeUiPreferencesState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const homeOrder = [];
  for (const raw of Array.isArray(source.homeOrder) ? source.homeOrder : []) {
    const id = String(raw || '').trim().slice(0, 64);
    if (id && !homeOrder.includes(id) && homeOrder.length < 64) homeOrder.push(id);
  }

  const blockStates = {};
  if (source.blockStates && typeof source.blockStates === 'object' && !Array.isArray(source.blockStates)) {
    for (const [rawKey, rawValue] of Object.entries(source.blockStates).slice(0, 128)) {
      const key = String(rawKey || '').trim().slice(0, 96);
      if (key) blockStates[key] = Boolean(rawValue);
    }
  }

  const activitySeenId = String(source.activitySeenId || '').trim().slice(0, 80);
  const rawUpdatedAt = String(source.updatedAt || '').trim();
  const parsed = rawUpdatedAt ? new Date(rawUpdatedAt) : null;
  return {
    initialized: Boolean(source.initialized),
    version: Math.max(0, Number(source.version || 0)),
    homeOrder,
    blockStates,
    activitySeenId,
    updatedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '',
  };
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readUiPreferences(actor, options = {}) {
  const value = await cacheOf(options).get(stateKey(actor));
  return normalizeUiPreferencesState(value);
}

async function persistUiPreferences(actor, value, options = {}) {
  const state = normalizeUiPreferencesState(value);
  await cacheOf(options).set(stateKey(actor), state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-ui-preferences'],
    name: stateKey(actor),
  });
  return state;
}

async function saveUiPreferences(actor, value, options = {}) {
  return enqueueMutation(async () => {
    const current = await readUiPreferences(actor, options);
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const incoming = normalizeUiPreferencesState(source);
    const updatedAt = new Date(options.now || Date.now()).toISOString();
    return persistUiPreferences(actor, {
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      homeOrder: incoming.homeOrder,
      blockStates: incoming.blockStates,
      activitySeenId: Object.prototype.hasOwnProperty.call(source,'activitySeenId')
        ? incoming.activitySeenId
        : current.activitySeenId,
      updatedAt,
    }, options);
  });
}

async function seedUiPreferences(actor, value, options = {}) {
  return enqueueMutation(async () => {
    const current = await readUiPreferences(actor, options);
    if (current.initialized) return current;
    const incoming = normalizeUiPreferencesState(value);
    if (!incoming.homeOrder.length && !Object.keys(incoming.blockStates).length && !incoming.activitySeenId) return current;
    return persistUiPreferences(actor, {
      initialized: true,
      version: 1,
      homeOrder: incoming.homeOrder,
      blockStates: incoming.blockStates,
      activitySeenId: incoming.activitySeenId,
      updatedAt: incoming.updatedAt || new Date(options.now || Date.now()).toISOString(),
    }, options);
  });
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  normalizeUiPreferencesState,
  readUiPreferences,
  saveUiPreferences,
  seedUiPreferences,
  resetMutationQueueForTests,
};
