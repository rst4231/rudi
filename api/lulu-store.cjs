const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-lulu-v1';
const STATE_KEY = 'lulu';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const TZ = 'Europe/Moscow';

let mutationTail = Promise.resolve();

function moscowDateKey(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function cacheOf(options = {}) {
  return options.luluCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function cleanActor(value) {
  const actor = String(value || '').trim();
  return actor === 'Рустам' || actor === 'Диана' ? actor : '';
}

function normalizeStamp(value) {
  const date=new Date(String(value||'').trim());
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeWalk(value) {
  if (!value || typeof value !== 'object') return null;
  const actor = cleanActor(value.actor);
  const date = new Date(value.walkedAt || 0);
  if (!actor || Number.isNaN(date.getTime())) return null;
  return {
    actor,
    walkedAt: date.toISOString(),
    peed: Boolean(value.peed),
    pooped: Boolean(value.pooped),
    previousPeeAt: normalizeStamp(value.previousPeeAt),
    previousPoopAt: normalizeStamp(value.previousPoopAt),
  };
}

function normalizeWalksToday(value, lastWalk, now = Date.now()) {
  const today = moscowDateKey(now);
  const rows = (Array.isArray(value) ? value : [])
    .map((row) => normalizeWalk(row))
    .filter(Boolean)
    .filter((row) => moscowDateKey(row.walkedAt) === today);
  if (lastWalk && moscowDateKey(lastWalk.walkedAt) === today
      && !rows.some((row) => row.walkedAt === lastWalk.walkedAt)) {
    rows.push(lastWalk);
  }
  return rows
    .sort((a, b) => new Date(a.walkedAt).getTime() - new Date(b.walkedAt).getTime())
    .slice(-16);
}

function normalizeToiletAlert(value, lastWalk) {
  if (!value || typeof value !== 'object' || !lastWalk) return null;
  const walkedAt = String(value.walkedAt || '').trim();
  if (!walkedAt || walkedAt !== lastWalk.walkedAt) return null;
  const recipients = Array.from(new Set(
    (Array.isArray(value.recipients) ? value.recipients : [])
      .map((actor) => cleanActor(actor))
      .filter(Boolean)
  ));
  const alertedAtDate = new Date(value.alertedAt || 0);
  return {
    walkedAt,
    recipients,
    alertedAt: Number.isNaN(alertedAtDate.getTime()) ? '' : alertedAtDate.toISOString(),
  };
}

function normalizeLuluState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const lastWalk = normalizeWalk(source.lastWalk);
  const toiletAlert = normalizeToiletAlert(source.toiletAlert, lastWalk);
  const walksToday = normalizeWalksToday(source.walksToday, lastWalk);
  const lastPeeAt = normalizeStamp(source.lastPeeAt) || (lastWalk ? lastWalk.walkedAt : '');
  const lastPoopAt = normalizeStamp(source.lastPoopAt) || (lastWalk ? lastWalk.walkedAt : '');
  const rawUpdatedAt = String(source.updatedAt || '').trim();
  const updatedDate = rawUpdatedAt ? new Date(rawUpdatedAt) : null;
  const updatedAt = lastWalk
    ? lastWalk.walkedAt
    : (updatedDate && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toISOString() : '');
  return {
    initialized: Boolean(source.initialized),
    version: Math.max(0, Number(source.version || 0)),
    lastWalk,
    walksToday,
    lastPeeAt,
    lastPoopAt,
    toiletAlert,
    updatedAt,
  };
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readLuluState(options = {}) {
  const value = await cacheOf(options).get(STATE_KEY);
  return normalizeLuluState(value);
}

async function writeLuluState(value, options = {}) {
  const state = normalizeLuluState({ ...value, initialized: true });
  await cacheOf(options).set(STATE_KEY, state, {
    ttl: TTL_SECONDS,
    tags: ['rudi-lulu'],
    name: STATE_KEY,
  });
  return state;
}

async function markLuluWalk(actor, toilet = {}, options = {}) {
  const clean = cleanActor(actor);
  if (!clean) throw new Error('lulu-actor-invalid');
  const peed=toilet?.peed===true;
  const pooped=toilet?.pooped===true;
  if(!peed&&!pooped) throw new Error('lulu-toilet-required');
  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    const walkedAt = new Date(options.now || Date.now()).toISOString();
    const walk = {
      actor: clean,
      walkedAt,
      peed,
      pooped,
      previousPeeAt: peed ? String(current.lastPeeAt||'') : '',
      previousPoopAt: pooped ? String(current.lastPoopAt||'') : '',
    };
    const today = moscowDateKey(walkedAt);
    const previous = (Array.isArray(current.walksToday) ? current.walksToday : [])
      .filter((row) => moscowDateKey(row.walkedAt) === today);
    const walksToday = [...previous.filter((row) => row.walkedAt !== walkedAt), walk].slice(-16);
    return writeLuluState({
      ...current,
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      lastWalk: walk,
      walksToday,
      lastPeeAt: peed ? walkedAt : current.lastPeeAt,
      lastPoopAt: pooped ? walkedAt : current.lastPoopAt,
      toiletAlert: null,
      updatedAt: walkedAt,
    }, options);
  });
}

async function cancelLuluWalk(walkedAt, options = {}) {
  const targetDate = new Date(String(walkedAt || '').trim());
  if (Number.isNaN(targetDate.getTime())) throw new Error('lulu-walk-invalid');
  const target = targetDate.toISOString();

  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    const previous = Array.isArray(current.walksToday) ? current.walksToday : [];
    const removedWalk = previous.find((row)=>row.walkedAt===target)
      || (current.lastWalk?.walkedAt===target ? current.lastWalk : null);
    const walksToday = previous.filter((row) => row.walkedAt !== target);
    const lastMatches = current.lastWalk?.walkedAt === target;
    const removed = Boolean(removedWalk) || lastMatches;
    if (!removed) throw new Error('lulu-walk-not-found');

    let lastWalk = current.lastWalk;
    if (lastMatches) lastWalk = walksToday.length ? walksToday[walksToday.length - 1] : null;

    let lastPeeAt=current.lastPeeAt;
    let lastPoopAt=current.lastPoopAt;
    if(removedWalk?.peed&&current.lastPeeAt===target){
      lastPeeAt=normalizeStamp(removedWalk.previousPeeAt)
        || [...walksToday].reverse().find((row)=>row.peed)?.walkedAt
        || '';
    }
    if(removedWalk?.pooped&&current.lastPoopAt===target){
      lastPoopAt=normalizeStamp(removedWalk.previousPoopAt)
        || [...walksToday].reverse().find((row)=>row.pooped)?.walkedAt
        || '';
    }

    return writeLuluState({
      ...current,
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      lastWalk,
      walksToday,
      lastPeeAt,
      lastPoopAt,
      toiletAlert: current.toiletAlert?.walkedAt === target ? null : current.toiletAlert,
      updatedAt: new Date(options.now || Date.now()).toISOString(),
    }, options);
  });
}

async function recordLuluToiletAlertRecipients(walkedAt, actors, options = {}) {
  const targetWalkedAt = String(walkedAt || '').trim();
  const cleanActors = Array.from(new Set(
    (Array.isArray(actors) ? actors : []).map((actor) => cleanActor(actor)).filter(Boolean)
  ));
  if (!targetWalkedAt || !cleanActors.length) return readLuluState(options);

  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    if (!current.lastWalk || current.lastWalk.walkedAt !== targetWalkedAt) return current;
    const previous = current.toiletAlert?.walkedAt === targetWalkedAt
      ? current.toiletAlert.recipients
      : [];
    const recipients = Array.from(new Set([...(previous || []), ...cleanActors]));
    if (recipients.length === (previous || []).length) return current;

    const alertedAt = new Date(options.now || Date.now()).toISOString();
    return writeLuluState({
      ...current,
      version: Math.max(0, Number(current.version || 0)) + 1,
      toiletAlert: { walkedAt: targetWalkedAt, recipients, alertedAt },
      updatedAt: current.updatedAt,
    }, options);
  });
}

async function restoreLuluState(snapshot, options = {}) {
  const saved = normalizeLuluState(snapshot);
  if (!saved.initialized) return readLuluState(options);
  const current = await readLuluState(options);
  if (current.initialized && Number(current.version || 0) >= Number(saved.version || 0)) return current;
  return writeLuluState(saved, options);
}

function resetMutationQueueForTests() {
  mutationTail = Promise.resolve();
}

module.exports = {
  NAMESPACE,
  STATE_KEY,
  TTL_SECONDS,
  normalizeLuluState,
  readLuluState,
  writeLuluState,
  markLuluWalk,
  cancelLuluWalk,
  recordLuluToiletAlertRecipients,
  restoreLuluState,
  resetMutationQueueForTests,
};
