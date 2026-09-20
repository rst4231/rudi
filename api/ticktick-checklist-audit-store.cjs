const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const KEY = 'state';
const TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const MAX_ENTRIES = 500;

function cacheOf(options = {}) {
  return options.ticktickChecklistAuditCache || createStrictRuntimeCache({
    ...options,
    namespace: 'rudi-ticktick-checklist-audit',
    confirmWrites: true,
  });
}

function entryKey(taskId, itemId) {
  return String(taskId || '').trim() + ':' + String(itemId || '').trim();
}

function normalizeActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function normalizeEntry(value) {
  const taskId = String(value?.taskId || '').trim();
  const itemId = String(value?.itemId || '').trim();
  const actor = normalizeActor(value?.actor);
  const changedAt = String(value?.changedAt || '').trim();
  if (!taskId || !itemId || !actor || !changedAt) return null;
  return {
    taskId,
    itemId,
    completed: Boolean(value?.completed),
    actor,
    changedAt,
  };
}

function normalizeState(value) {
  const entries = {};
  const source = value?.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)
    ? value.entries
    : {};
  for (const raw of Object.values(source)) {
    const entry = normalizeEntry(raw);
    if (entry) entries[entryKey(entry.taskId, entry.itemId)] = entry;
  }
  return {
    initialized: Boolean(value?.initialized || value?.version || Object.keys(entries).length),
    version: Number(value?.version || 0),
    entries,
  };
}

async function readChecklistAuditState(options = {}) {
  const row = await cacheOf(options).get(KEY);
  return normalizeState(row);
}

async function writeChecklistAuditState(state, options = {}) {
  const normalized = normalizeState(state);
  const next = {
    ...normalized,
    initialized: true,
    version: Number(state?.version || Date.now()),
  };
  await cacheOf(options).set(KEY, next, {
    ttl: TTL_SECONDS,
    tags: ['rudi-ticktick-checklist-audit'],
  });
  return next;
}

async function recordChecklistAudit(taskId, itemId, completed, actor, options = {}) {
  const task = String(taskId || '').trim();
  const item = String(itemId || '').trim();
  const who = normalizeActor(actor);
  if (!task || !item) throw new Error('ticktick-checklist-audit-id-invalid');
  if (!who) throw new Error('ticktick-checklist-audit-actor-invalid');

  const state = await readChecklistAuditState(options);
  const changedAt = new Date(options.now || Date.now()).toISOString();
  state.entries[entryKey(task, item)] = {
    taskId: task,
    itemId: item,
    completed: Boolean(completed),
    actor: who,
    changedAt,
  };

  const rows = Object.values(state.entries)
    .sort((a, b) => (Date.parse(b.changedAt) || 0) - (Date.parse(a.changedAt) || 0))
    .slice(0, MAX_ENTRIES);
  state.entries = Object.fromEntries(rows.map((row) => [entryKey(row.taskId, row.itemId), row]));
  state.version = Date.now();
  state.initialized = true;
  return writeChecklistAuditState(state, options);
}

function checklistAuditForItem(state, taskId, itemId, completed) {
  const normalized = normalizeState(state);
  const row = normalized.entries[entryKey(taskId, itemId)] || null;
  if (!row || Boolean(row.completed) !== Boolean(completed)) return null;
  return row;
}

async function restoreChecklistAuditState(snapshot, options = {}) {
  const normalized = normalizeState(snapshot);
  if (!normalized.initialized) return readChecklistAuditState(options);
  return writeChecklistAuditState(normalized, options);
}

module.exports = {
  KEY,
  TTL_SECONDS,
  MAX_ENTRIES,
  readChecklistAuditState,
  writeChecklistAuditState,
  recordChecklistAudit,
  checklistAuditForItem,
  restoreChecklistAuditState,
};
