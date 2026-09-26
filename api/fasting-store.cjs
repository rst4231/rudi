const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-fasting-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_HISTORY = 200;
const ALLOWED_GOALS = new Set([12, 14, 16, 18, 24]);
const ACTORS = new Set(['Рустам', 'Диана']);
let mutationTail = Promise.resolve();

function cleanActor(value) {
  const actor = String(value || '').trim();
  if (!ACTORS.has(actor)) throw new Error('fasting-actor-invalid');
  return actor;
}

function stateKey(actor) {
  return cleanActor(actor) === 'Диана' ? 'diana' : 'rustam';
}

function cacheOf(options = {}) {
  return options.fastingCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanIso(value) {
  const raw = String(value || '').trim();
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function cleanGoal(value) {
  const goal = Number(value);
  if (!ALLOWED_GOALS.has(goal)) throw new Error('fasting-goal-invalid');
  return goal;
}

function normalizeHistoryItem(value) {
  const startedAt = cleanIso(value?.startedAt);
  const endedAt = cleanIso(value?.endedAt);
  if (!startedAt || !endedAt) return null;
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  const goalHours = ALLOWED_GOALS.has(Number(value?.goalHours)) ? Number(value.goalHours) : 16;
  const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  return {
    id: String(value?.id || '').trim() || crypto.randomUUID(),
    startedAt,
    endedAt,
    durationMinutes,
    goalHours,
    goalReached: durationMinutes >= goalHours * 60,
  };
}

function normalizeState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let active = null;
  if (source.active && typeof source.active === 'object') {
    const startedAt = cleanIso(source.active.startedAt);
    const goalHours = ALLOWED_GOALS.has(Number(source.active.goalHours)) ? Number(source.active.goalHours) : 16;
    if (startedAt) {
      active = {
        id: String(source.active.id || '').trim() || crypto.randomUUID(),
        startedAt,
        goalHours,
      };
    }
  }
  const history = (Array.isArray(source.history) ? source.history : [])
    .map(normalizeHistoryItem)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
    .slice(0, MAX_HISTORY);
  return {
    initialized: Boolean(source.initialized || active || history.length),
    version: Math.max(0, Number(source.version || 0)),
    active,
    history,
  };
}

function fastingRewardStars(durationMinutes) {
  const hours = Math.max(0, Number(durationMinutes || 0)) / 60;
  if (hours >= 40) return 5;
  if (hours >= 32) return 4;
  if (hours >= 24) return 3;
  if (hours >= 16) return 2;
  return 0;
}

function statsFromHistory(history) {
  const rows = Array.isArray(history) ? history : [];
  if (!rows.length) return { completed: 0, averageMinutes: 0, longestMinutes: 0 };
  const durations = rows.map((row) => Math.max(0, Number(row.durationMinutes || 0)));
  return {
    completed: rows.length,
    averageMinutes: Math.round(durations.reduce((sum, value) => sum + value, 0) / rows.length),
    longestMinutes: Math.max(...durations),
  };
}

function fastingView(value) {
  const state = normalizeState(value);
  return {
    initialized: state.initialized,
    version: state.version,
    active: state.active,
    history: state.history,
    stats: statsFromHistory(state.history),
  };
}

async function readFastingState(actor, options = {}) {
  return normalizeState(await cacheOf(options).get(stateKey(actor)));
}

async function writeFastingState(actor, value, options = {}) {
  const state = normalizeState({
    ...value,
    initialized: true,
    version: Math.max(Date.now(), Number(value?.version || 0) + 1),
  });
  await cacheOf(options).set(stateKey(actor), state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-fasting', 'rudi-durable-state'],
    name: stateKey(actor),
  });
  return state;
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function startFasting(actor, payload = {}, options = {}) {
  return enqueueMutation(async () => {
    const current = await readFastingState(actor, options);
    if (current.active) throw new Error('fasting-already-active');
    const nowMs = Number(options.now || Date.now());
    const startedAt = cleanIso(payload.startedAt || new Date(nowMs).toISOString());
    if (!startedAt) throw new Error('fasting-start-invalid');
    const startMs = Date.parse(startedAt);
    if (startMs > nowMs + 5 * 60 * 1000) throw new Error('fasting-start-future');
    if (startMs < nowMs - 30 * 24 * 60 * 60 * 1000) throw new Error('fasting-start-too-old');
    current.active = {
      id: crypto.randomUUID(),
      startedAt,
      goalHours: cleanGoal(payload.goalHours ?? 16),
    };
    return writeFastingState(actor, current, options);
  });
}

async function stopFasting(actor, options = {}) {
  return enqueueMutation(async () => {
    const current = await readFastingState(actor, options);
    if (!current.active) throw new Error('fasting-not-active');
    const nowMs = Number(options.now || Date.now());
    const startMs = Date.parse(current.active.startedAt);
    if (!Number.isFinite(startMs) || startMs > nowMs) throw new Error('fasting-start-invalid');
    const row = normalizeHistoryItem({
      id: current.active.id,
      startedAt: current.active.startedAt,
      endedAt: new Date(nowMs).toISOString(),
      goalHours: current.active.goalHours,
    });
    current.active = null;
    current.history = [row, ...current.history].filter(Boolean).slice(0, MAX_HISTORY);
    return writeFastingState(actor, current, options);
  });
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE, TTL_SECONDS, MAX_HISTORY, ALLOWED_GOALS,
  normalizeState, fastingRewardStars, statsFromHistory, fastingView,
  readFastingState, writeFastingState, startFasting, stopFasting,
  resetMutationQueueForTests,
};
