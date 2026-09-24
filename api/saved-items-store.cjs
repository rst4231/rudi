const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-saved-items-v1';
const STATE_KEY = 'shared-saves';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const MAX_ITEMS = 80;
const MAX_TEXT = 6000;

let mutationQueue = Promise.resolve();

function cacheOf(options = {}) {
  return options.savedItemsCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Диана' ? 'Диана' : 'Рустам';
}

function cleanText(value, limit = MAX_TEXT) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, limit);
}

function normalizeIngredient(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const name = cleanText(source.name, 180);
  const amount = cleanText(source.amount, 120);
  return name ? { name, amount } : null;
}

function normalizeDatePayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const title = cleanText(source.title, 180);
  const description = cleanText(source.description, 1200);
  if (!title || !description) throw new Error('saved-date-invalid');
  const period = ['morning', 'day', 'evening'].includes(String(source.period || ''))
    ? String(source.period)
    : '';
  return {
    title,
    description,
    duration: cleanText(source.duration, 120),
    period,
  };
}

function normalizeRecipePayload(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const title = cleanText(source.title, 180);
  if (!title) throw new Error('saved-recipe-invalid');
  const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
    .map(normalizeIngredient)
    .filter(Boolean)
    .slice(0, 80);
  const steps = (Array.isArray(source.steps) ? source.steps : [])
    .map((row) => cleanText(row, 1000))
    .filter(Boolean)
    .slice(0, 60);
  return {
    title,
    summary: cleanText(source.summary, 1200),
    timeMinutes: Math.max(0, Math.min(720, Number(source.timeMinutes || 0))) || null,
    difficulty: cleanText(source.difficulty, 80),
    missing: (Array.isArray(source.missing) ? source.missing : []).map((row) => cleanText(row, 180)).filter(Boolean).slice(0, 40),
    ingredients,
    steps,
    tips: (Array.isArray(source.tips) ? source.tips : []).map((row) => cleanText(row, 600)).filter(Boolean).slice(0, 20),
  };
}

function normalizeItem(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const type = source.type === 'recipe' ? 'recipe' : source.type === 'date' ? 'date' : '';
  if (!type) return null;
  let payload;
  try {
    payload = type === 'date' ? normalizeDatePayload(source.payload) : normalizeRecipePayload(source.payload);
  } catch {
    return null;
  }
  const id = cleanText(source.id, 120);
  if (!id) return null;
  return {
    id,
    type,
    payload,
    savedBy: cleanActor(source.savedBy),
    createdAt: cleanText(source.createdAt, 80),
  };
}

function normalizeState(value) {
  const items = (Array.isArray(value?.items) ? value.items : [])
    .map(normalizeItem)
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
  return {
    initialized: Boolean(value?.initialized || value?.version || items.length),
    version: Number(value?.version || 0),
    items,
  };
}

async function readSavedItems(options = {}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY));
}

async function writeSavedItems(state, options = {}) {
  const next = normalizeState({ ...state, initialized: true, version: Date.now() });
  await cacheOf(options).set(STATE_KEY, next, {
    ttl: TTL_SECONDS,
    tags: ['rudi-saved-items'],
    name: STATE_KEY,
  });
  return next;
}

function fingerprint(type, payload) {
  const normalized = type === 'date' ? normalizeDatePayload(payload) : normalizeRecipePayload(payload);
  return crypto.createHash('sha256')
    .update(type + '|' + JSON.stringify(normalized))
    .digest('hex');
}

function enqueue(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function addSavedItem(type, payload, savedBy, options = {}) {
  return enqueue(async () => {
    const cleanType = type === 'recipe' ? 'recipe' : type === 'date' ? 'date' : '';
    if (!cleanType) throw new Error('saved-type-invalid');
    const cleanPayload = cleanType === 'date' ? normalizeDatePayload(payload) : normalizeRecipePayload(payload);
    const state = await readSavedItems(options);
    const targetFingerprint = fingerprint(cleanType, cleanPayload);
    const existing = state.items.find((item) => fingerprint(item.type, item.payload) === targetFingerprint);
    if (existing) return { state, item: existing, duplicate: true };

    const item = {
      id: crypto.randomUUID(),
      type: cleanType,
      payload: cleanPayload,
      savedBy: cleanActor(savedBy),
      createdAt: new Date(options.now || Date.now()).toISOString(),
    };
    state.items.unshift(item);
    state.items = state.items.slice(0, MAX_ITEMS);
    return { state: await writeSavedItems(state, options), item, duplicate: false };
  });
}

async function removeSavedItem(id, options = {}) {
  return enqueue(async () => {
    const state = await readSavedItems(options);
    const target = String(id || '').trim();
    const item = state.items.find((row) => row.id === target) || null;
    if (!item) throw new Error('saved-item-not-found');
    state.items = state.items.filter((row) => row.id !== target);
    return { state: await writeSavedItems(state, options), item };
  });
}

function resetMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  MAX_ITEMS,
  readSavedItems,
  writeSavedItems,
  normalizeState,
  normalizeDatePayload,
  normalizeRecipePayload,
  addSavedItem,
  removeSavedItem,
  resetMutationQueueForTests,
};