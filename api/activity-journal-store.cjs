const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-activity-journal-v1';
const STATE_KEY = 'activity-journal';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ITEMS = 80;
const MAX_TEXT = 220;
const MAX_MARKERS = 24;

let mutationTail = Promise.resolve();

function cacheOf(options = {}) {
  return options.activityCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanText(value, max = MAX_TEXT) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanActor(value) {
  const actor = cleanText(value, 20);
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function cleanTab(value) {
  const tab = cleanText(value, 20);
  return new Set(['home', 'feed', 'schedule', 'wishlist', 'photos', 'products']).has(tab) ? tab : '';
}

function normalizeItem(input) {
  if (!input || typeof input !== 'object') return null;
  const text = cleanText(input.text);
  const createdAt = new Date(input.createdAt || 0);
  if (!text || Number.isNaN(createdAt.getTime())) return null;
  return {
    id: cleanText(input.id, 80) || crypto.randomUUID(),
    type: cleanText(input.type, 40) || 'activity',
    actor: cleanActor(input.actor),
    text,
    icon: cleanText(input.icon, 8) || '•',
    targetTab: cleanTab(input.targetTab),
    createdAt: createdAt.toISOString(),
    dedupeKey: cleanText(input.dedupeKey, 140),
  };
}

function normalizeMarkers(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rows = Object.entries(source)
    .map(([key, marker]) => [
      cleanText(key, 50),
      {
        signature: cleanText(marker?.signature, 300),
        updatedAt: String(marker?.updatedAt || ''),
      },
    ])
    .filter(([key, marker]) => key && marker.signature)
    .slice(-MAX_MARKERS);
  return Object.fromEntries(rows);
}

function normalizeState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const items = (Array.isArray(source.items) ? source.items : [])
    .map(normalizeItem)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_ITEMS);
  return {
    initialized: Boolean(source.initialized),
    version: Math.max(0, Number(source.version || 0)),
    items,
    markers: normalizeMarkers(source.markers),
  };
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readActivityJournal(options = {}) {
  const value = await cacheOf(options).get(STATE_KEY);
  return normalizeState(value);
}

async function writeActivityJournal(value, options = {}) {
  const state = normalizeState({
    ...value,
    initialized: true,
  });
  await cacheOf(options).set(STATE_KEY, state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-activity-journal'],
    name: STATE_KEY,
  });
  return state;
}

async function appendActivity(input, options = {}) {
  return enqueueMutation(async () => {
    const state = await readActivityJournal(options);
    const item = normalizeItem({
      ...input,
      id: input?.id || crypto.randomUUID(),
      createdAt: input?.createdAt || new Date(options.now || Date.now()).toISOString(),
    });
    if (!item) throw new Error('activity-item-invalid');

    if (item.dedupeKey && state.items.some((row) => row.dedupeKey === item.dedupeKey)) {
      return state;
    }

    return writeActivityJournal({
      ...state,
      initialized: true,
      version: Math.max(0, Number(state.version || 0)) + 1,
      items: [item, ...state.items].slice(0, MAX_ITEMS),
    }, options);
  });
}

async function observeActivityMarker(markerKey, signature, activity, options = {}) {
  const key = cleanText(markerKey, 50);
  const value = cleanText(signature, 300);
  if (!key || !value) return readActivityJournal(options);

  return enqueueMutation(async () => {
    const state = await readActivityJournal(options);
    const previous = state.markers?.[key]?.signature || '';
    if (previous === value) return state;

    const next = {
      ...state,
      initialized: true,
      version: Math.max(0, Number(state.version || 0)) + 1,
      markers: {
        ...state.markers,
        [key]: {
          signature: value,
          updatedAt: new Date(options.now || Date.now()).toISOString(),
        },
      },
    };

    if (previous && activity) {
      const item = normalizeItem({
        ...activity,
        id: activity?.id || crypto.randomUUID(),
        createdAt: activity?.createdAt || new Date(options.now || Date.now()).toISOString(),
      });
      if (item && (!item.dedupeKey || !state.items.some((row) => row.dedupeKey === item.dedupeKey))) {
        next.items = [item, ...state.items].slice(0, MAX_ITEMS);
      }
    }

    return writeActivityJournal(next, options);
  });
}

async function restoreActivityJournalState(snapshot, options = {}) {
  const saved = normalizeState(snapshot);
  if (!saved.initialized) return readActivityJournal(options);
  const current = await readActivityJournal(options);
  if (current.initialized && Number(current.version || 0) >= Number(saved.version || 0)) return current;
  return writeActivityJournal(saved, options);
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  STATE_KEY,
  TTL_SECONDS,
  MAX_ITEMS,
  normalizeState,
  readActivityJournal,
  writeActivityJournal,
  appendActivity,
  observeActivityMarker,
  restoreActivityJournalState,
  resetMutationQueueForTests,
};
