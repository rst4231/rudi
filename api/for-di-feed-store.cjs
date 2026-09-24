const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-for-di-feed-v1';
const STATE_KEY = 'feed';
const TTL_SECONDS = 60 * 60 * 24 * 3650;

let mutationQueue = Promise.resolve();

function cacheOf(options = {}) {
  return options.forDiFeedCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function decodeEntity(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function plainTelegramText(value) {
  return decodeEntity(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, '$2\n$1')
      .replace(/<[^>]+>/g, '')
  ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanActor(value) {
  return value === 'Диана' ? 'Диана' : value === 'Рустам' ? 'Рустам' : '';
}

function normalizeItem(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const id = cleanText(source.id, 160);
  const text = cleanText(source.text);
  if (!id || !text) return null;
  const likes = [...new Set((Array.isArray(source.likes) ? source.likes : []).map(cleanActor).filter(Boolean))];
  return {
    id,
    dateKey: cleanText(source.dateKey, 20),
    text,
    source: cleanText(source.source, 80) || null,
    createdAt: cleanText(source.createdAt, 80),
    likes,
  };
}

function normalizeState(value) {
  const rows = Array.isArray(value?.items) ? value.items : [];
  return {
    initialized: Boolean(value?.initialized || value?.version || rows.length),
    version: Number(value?.version || 0),
    items: rows.map(normalizeItem).filter(Boolean),
  };
}

async function readForDiFeed(options = {}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY));
}

async function writeForDiFeed(state, options = {}) {
  const next = normalizeState({ ...state, initialized: true, version: Date.now() });
  await cacheOf(options).set(STATE_KEY, next, {
    ttl: TTL_SECONDS,
    tags: ['rudi-for-di-feed'],
    name: STATE_KEY,
  });
  return next;
}

function itemId(dateKey, fingerprint, text) {
  const base = String(fingerprint || '').trim()
    || crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
  return String(dateKey || '') + ':' + base;
}

function enqueue(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function appendForDiMessages(messages, dateKey, options = {}) {
  return enqueue(async () => {
    const state = await readForDiFeed(options);
    const existing = new Set(state.items.map((item) => item.id));
    let added = 0;
    for (const row of Array.isArray(messages) ? messages : []) {
      const text = plainTelegramText(row?.text);
      if (!text) continue;
      const id = itemId(dateKey, row?.fingerprint, text);
      if (existing.has(id)) continue;
      state.items.unshift({
        id,
        dateKey: String(dateKey || ''),
        text,
        source: cleanText(row?.source, 80) || null,
        createdAt: cleanText(row?.createdAt, 80) || new Date(options.now || Date.now()).toISOString(),
        likes: [],
      });
      existing.add(id);
      added += 1;
    }
    return { state: await writeForDiFeed(state, options), added };
  });
}

async function toggleForDiLike(id, actor, options = {}) {
  return enqueue(async () => {
    const who = cleanActor(actor);
    if (!who) throw new Error('for-di-like-actor-invalid');
    const state = await readForDiFeed(options);
    const item = state.items.find((row) => row.id === String(id || ''));
    if (!item) throw new Error('for-di-item-not-found');
    const likes = new Set(item.likes || []);
    if (likes.has(who)) likes.delete(who);
    else likes.add(who);
    item.likes = [...likes];
    return { state: await writeForDiFeed(state, options), item };
  });
}

function resetMutationQueueForTests() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  TTL_SECONDS,
  plainTelegramText,
  normalizeState,
  readForDiFeed,
  writeForDiFeed,
  appendForDiMessages,
  toggleForDiLike,
  resetMutationQueueForTests,
};
