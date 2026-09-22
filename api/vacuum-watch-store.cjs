const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-vacuum-watch-v1';
const KEY = 'vacuum-watch';
const TTL_SECONDS = 60 * 60 * 24 * 90;

let mutationTail = Promise.resolve();

function cacheOf(options = {}) {
  return options.vacuumCache || options.cache || createStrictRuntimeCache({ namespace:NAMESPACE });
}

function iso(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    initialized:Boolean(source.initialized),
    vacuumId:String(source.vacuumId || ''),
    vacuumName:String(source.vacuumName || ''),
    active:Boolean(source.active),
    activeOrigin:new Set(['scheduled','manual']).has(String(source.activeOrigin || '')) ? String(source.activeOrigin) : '',
    activeSince:iso(source.activeSince),
    lastBattery:finiteOrNull(source.lastBattery),
    lastBatteryUpdated:Math.max(0, Number(source.lastBatteryUpdated || 0)),
    lastControlUpdated:Math.max(0, Number(source.lastControlUpdated || 0)),
    lastControlSignature:String(source.lastControlSignature || ''),
    lastManualAt:iso(source.lastManualAt),
    lastManualSource:String(source.lastManualSource || ''),
    lastStartAt:iso(source.lastStartAt),
    lastFinishAt:iso(source.lastFinishAt),
    lastSeenAt:iso(source.lastSeenAt),
  };
}

function enqueue(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readVacuumWatchState(options = {}) {
  return normalizeState(await cacheOf(options).get(KEY));
}

async function writeVacuumWatchState(value, options = {}) {
  const state = normalizeState(value);
  await cacheOf(options).set(KEY, state, {
    ttl:TTL_SECONDS,
    tags:['rudi-vacuum-watch'],
    name:KEY,
  });
  return state;
}

async function markVacuumManualAction(options = {}) {
  return enqueue(async () => {
    const state = await readVacuumWatchState(options);
    return writeVacuumWatchState({
      ...state,
      lastManualAt:new Date(options.now || Date.now()).toISOString(),
      lastManualSource:String(options.source || 'manual'),
    }, options);
  });
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  KEY,
  TTL_SECONDS,
  normalizeState,
  readVacuumWatchState,
  writeVacuumWatchState,
  markVacuumManualAction,
  resetMutationQueueForTests,
};
