const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-shared-task-meta-v1';
const STATE_KEY = 'state';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
let mutationTail = Promise.resolve();

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function cleanId(value) {
  return String(value || '').trim().slice(0, 160);
}

function normalizeEntry(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const taskId = cleanId(source.taskId);
  if (!taskId) return null;
  return {
    taskId,
    responsible: cleanActor(source.responsible),
    createdBy: cleanActor(source.createdBy),
    createdAt: String(source.createdAt || '').trim().slice(0, 80),
    source: String(source.source || 'rudi').trim().slice(0, 40) || 'rudi',
  };
}

function normalizeState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const entries = {};
  const raw = source.entries && typeof source.entries === 'object' && !Array.isArray(source.entries) ? source.entries : {};
  for (const [key, row] of Object.entries(raw)) {
    const entry = normalizeEntry({ ...row, taskId: row?.taskId || key });
    if (entry) entries[entry.taskId] = entry;
  }
  return {
    initialized: Boolean(source.initialized || Object.keys(entries).length),
    version: Math.max(0, Number(source.version || 0)),
    entries,
    updatedAt: String(source.updatedAt || '').trim().slice(0, 80),
  };
}

function cacheOf(options = {}) {
  return options.sharedTaskMetaCache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

async function readSharedTaskMetaState(options = {}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY).catch(() => null));
}

async function writeSharedTaskMetaState(state, options = {}) {
  const next = normalizeState({
    ...state,
    initialized: true,
    version: Math.max(0, Number(state?.version || 0)) + 1,
    updatedAt: new Date(options.now || Date.now()).toISOString(),
  });
  await cacheOf(options).set(STATE_KEY, next, {
    ttl: TTL_SECONDS,
    tags: ['rudi-shared-task-meta'],
    name: STATE_KEY,
  });
  return next;
}

function enqueue(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.then(() => undefined, () => undefined);
  return run;
}

async function getSharedTaskMeta(taskId, options = {}) {
  const id = cleanId(taskId);
  if (!id) return null;
  const state = await readSharedTaskMetaState(options);
  return state.entries[id] || null;
}

async function setSharedTaskMeta(taskId, input = {}, options = {}) {
  const id = cleanId(taskId);
  if (!id) throw new Error('shared-task-meta-id-required');
  return enqueue(async () => {
    const state = await readSharedTaskMetaState(options);
    const entry = normalizeEntry({
      taskId: id,
      responsible: input.responsible,
      createdBy: input.createdBy,
      createdAt: input.createdAt || new Date(options.now || Date.now()).toISOString(),
      source: input.source || 'rudi',
    });
    state.entries[id] = entry;
    const next = await writeSharedTaskMetaState(state, options);
    return { state: next, entry };
  });
}

async function removeSharedTaskMeta(taskId, options = {}) {
  const id = cleanId(taskId);
  if (!id) return { state: await readSharedTaskMetaState(options), entry: null, removed: false };
  return enqueue(async () => {
    const state = await readSharedTaskMetaState(options);
    const entry = state.entries[id] || null;
    if (!entry) return { state, entry: null, removed: false };
    delete state.entries[id];
    const next = await writeSharedTaskMetaState(state, options);
    return { state: next, entry, removed: true };
  });
}

function resetSharedTaskMetaMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  normalizeState,
  readSharedTaskMetaState,
  writeSharedTaskMetaState,
  getSharedTaskMeta,
  setSharedTaskMeta,
  removeSharedTaskMeta,
  resetSharedTaskMetaMutationQueueForTests,
};
