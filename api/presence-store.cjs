const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-presence-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const ONLINE_WINDOW_MS = 75 * 1000;
const ACTORS = new Set(['Рустам', 'Диана']);

function cacheOf(options = {}) {
  return options.presenceCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    // Presence is last-write-wins and can receive concurrent heartbeats.
    // Confirming exact write equality creates false failures when a newer heartbeat wins the race.
    confirmWrites: false,
  });
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

function presenceFromRow(actor, row, options = {}) {
  const lastSeenAt = String(row?.lastSeenAt || '');
  const lastSeenMs = normalizeTimestamp(lastSeenAt);
  const now = Number(options.now || Date.now());
  return {
    actor,
    online: Boolean(lastSeenMs && now - lastSeenMs <= ONLINE_WINDOW_MS),
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : '',
  };
}

async function readPresence(actor, options = {}) {
  if (!ACTORS.has(actor)) throw new Error('presence-actor-invalid');
  const row = await cacheOf(options).get(keyForActor(actor));
  return presenceFromRow(actor, row, options);
}

async function readPresenceSafe(actor, options = {}) {
  try {
    return await readPresence(actor, options);
  } catch (error) {
    if (String(error?.message || error) === 'presence-actor-invalid') throw error;
    return { actor, online: false, lastSeenAt: '' };
  }
}

async function presenceView(actor, options = {}, mineRow = null) {
  if (!ACTORS.has(actor)) throw new Error('presence-actor-invalid');
  const partner = actor === 'Рустам' ? 'Диана' : 'Рустам';
  const [mine, theirs] = await Promise.all([
    mineRow ? Promise.resolve(presenceFromRow(actor, mineRow, options)) : readPresenceSafe(actor, options),
    readPresenceSafe(partner, options),
  ]);
  return {
    actor,
    partner,
    mine,
    partnerPresence: theirs,
  };
}

module.exports = { markPresence, readPresence, readPresenceSafe, presenceView, presenceFromRow, ONLINE_WINDOW_MS };
