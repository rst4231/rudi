const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-presence-v1';
const TTL_SECONDS = 5 * 60;
const ONLINE_WINDOW_MS = 75 * 1000;
const ACTORS = new Set(['Рустам', 'Диана']);

function cacheOf(options = {}) {
  return options.presenceCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function keyForActor(actor) {
  return 'presence:' + String(actor || '');
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function markPresence(actor, options = {}) {
  if (!ACTORS.has(actor)) throw new Error('presence-actor-invalid');
  const now = Number(options.now || Date.now());
  const row = { actor, lastSeenAt: new Date(now).toISOString() };
  await cacheOf(options).set(keyForActor(actor), row, {
    ttl: TTL_SECONDS,
    tags: ['rudi-presence'],
  });
  return row;
}

async function readPresence(actor, options = {}) {
  if (!ACTORS.has(actor)) throw new Error('presence-actor-invalid');
  const row = await cacheOf(options).get(keyForActor(actor));
  const lastSeenAt = String(row?.lastSeenAt || '');
  const lastSeenMs = normalizeTimestamp(lastSeenAt);
  const now = Number(options.now || Date.now());
  return {
    actor,
    online: Boolean(lastSeenMs && now - lastSeenMs <= ONLINE_WINDOW_MS),
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : '',
  };
}

async function presenceView(actor, options = {}) {
  const partner = actor === 'Рустам' ? 'Диана' : 'Рустам';
  const [mine, theirs] = await Promise.all([
    readPresence(actor, options),
    readPresence(partner, options),
  ]);
  return {
    actor,
    partner,
    mine,
    partnerPresence: theirs,
  };
}

module.exports = { markPresence, readPresence, presenceView, ONLINE_WINDOW_MS };
