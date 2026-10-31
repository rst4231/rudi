const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-lulu-v1';
const STATE_KEY = 'lulu';
const TTL_SECONDS = 60 * 60 * 24 * 31;
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

const STOOL_TYPES = new Set(['hard','formed','soft','mushy','liquid']);

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
    stool: value.pooped && STOOL_TYPES.has(value.stool) ? value.stool : '',
    previousPeeAt: normalizeStamp(value.previousPeeAt),
    previousPoopAt: normalizeStamp(value.previousPoopAt),
  };
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

function normalizeLuluState(value, now = Date.now()) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const today = moscowDateKey(now), month = today.slice(0, 7);
  const sourceMonth=String(source.month || moscowDateKey(source.lastWalk?.walkedAt || source.updatedAt).slice(0,7));
  const expired=sourceMonth && sourceMonth!==month;
  const inMonth = stamp => !!stamp && moscowDateKey(stamp).slice(0, 7) === month;
  const byTime = new Map();
  for (const raw of [...(Array.isArray(source.walksMonth) ? source.walksMonth : []),
      ...(Array.isArray(source.walksToday) ? source.walksToday : []), source.lastWalk]) {
    const walk = normalizeWalk(raw);
    if (!walk || !inMonth(walk.walkedAt)) continue;
    walk.previousPeeAt = inMonth(walk.previousPeeAt) ? walk.previousPeeAt : '';
    walk.previousPoopAt = inMonth(walk.previousPoopAt) ? walk.previousPoopAt : '';
    byTime.set(walk.walkedAt, walk);
  }
  const walksMonth = [...byTime.values()].sort((a,b)=>Date.parse(a.walkedAt)-Date.parse(b.walkedAt));
  const lastWalk = walksMonth.at(-1) || null;
  const latest = (field, flag) => {
    const stamp = normalizeStamp(source[field]);
    const recorded = walksMonth.filter(row=>row[flag]).at(-1)?.walkedAt || '';
    return inMonth(stamp) && (!recorded || Date.parse(stamp)>Date.parse(recorded)) ? stamp : recorded;
  };
  return {
    initialized: Boolean(source.initialized),
    version: expired ? 0 : Math.max(0, Number(source.version || 0)),
    month,
    lastWalk,
    walksMonth,
    walksToday: walksMonth.filter(row=>moscowDateKey(row.walkedAt)===today),
    monthCounts: Object.fromEntries(['Диана','Рустам'].map(actor=>[actor,walksMonth.filter(row=>row.actor===actor).length])),
    lastPeeAt: latest('lastPeeAt','peed'),
    lastPoopAt: latest('lastPoopAt','pooped'),
    toiletAlert: normalizeToiletAlert(source.toiletAlert,lastWalk),
    updatedAt: normalizeStamp(source.updatedAt) || lastWalk?.walkedAt || '',
    appliedOperations:(source.month && source.month!==month ? [] : Array.isArray(source.appliedOperations)?source.appliedOperations:[])
      .filter(id=>typeof id==='string'&&/^[a-z0-9_-]{8,96}$/i.test(id)).slice(-512),
  };
}

function monthTTL(now) {
  const [year,month] = moscowDateKey(now).split('-').map(Number);
  const next = Date.UTC(year,month,1)-3*3600000;
  return Math.max(1,Math.ceil((next-new Date(now).getTime())/1000));
}

function enqueueMutation(task) {
  const run = mutationTail.then(task, task);
  mutationTail = run.catch(() => {});
  return run;
}

async function readLuluState(options = {}) {
  const value = await cacheOf(options).get(STATE_KEY);
  const state = normalizeLuluState(value, options.now || Date.now());
  // Persist pruning, so stale records are removed rather than just hidden.
  if (value && JSON.stringify(value) !== JSON.stringify(state)) {
    await cacheOf(options).set(STATE_KEY,state,{ttl:monthTTL(options.now || Date.now()),tags:['rudi-lulu'],name:STATE_KEY});
  }
  return state;
}

async function writeLuluState(value, options = {}) {
  const state = normalizeLuluState({ ...value, initialized: true }, options.now || Date.now());
  await cacheOf(options).set(STATE_KEY, state, {
    ttl: monthTTL(options.now || Date.now()),
    tags: ['rudi-lulu'],
    name: STATE_KEY,
  });
  return state;
}

async function markLuluWalk(actor, toilet = {}, options = {}) {
  const clean = cleanActor(actor);
  if (!clean) throw new Error('lulu-actor-invalid');
  const candidate=toilet&&typeof toilet==='object'&&!Array.isArray(toilet)?toilet:{};
  const legacyOptions=!Object.prototype.hasOwnProperty.call(candidate,'peed')
    &&!Object.prototype.hasOwnProperty.call(candidate,'pooped')
    &&(
      Object.prototype.hasOwnProperty.call(candidate,'luluCache')
      ||Object.prototype.hasOwnProperty.call(candidate,'cache')
      ||Object.prototype.hasOwnProperty.call(candidate,'cacheOptions')
      ||Object.prototype.hasOwnProperty.call(candidate,'now')
    );
  if(legacyOptions){
    options=candidate;
    toilet={peed:true,pooped:true};
  }
  const peed=toilet?.peed===true;
  const pooped=toilet?.pooped===true;
  if(!peed&&!pooped) throw new Error('lulu-toilet-required');
  const operationId=String(options.offlineOperationId||'').trim();
  if(operationId&&!/^[a-z0-9_-]{8,96}$/i.test(operationId))
    throw new Error('lulu-operation-id-invalid');
  const nowMs=new Date(options.now||Date.now()).getTime();
  const requested=options.walkedAt?normalizeStamp(options.walkedAt):'';
  if(options.walkedAt&&!requested)throw new Error('lulu-walk-invalid');
  if(requested&&moscowDateKey(requested).slice(0,7)!==moscowDateKey(nowMs).slice(0,7))
    throw new Error('lulu-walk-month-invalid');
  if(requested&&(Date.parse(requested)>nowMs+5*60000||Date.parse(requested)<nowMs-30*24*3600000))
    throw new Error('lulu-walk-age-invalid');
  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    if(operationId&&current.appliedOperations.includes(operationId))
      return {...current,duplicateOperation:true};
    const walkedAt=requested||new Date(nowMs).toISOString();
    const duplicate=[...(current.walksMonth||[]),current.lastWalk]
      .some(row=>row?.walkedAt===walkedAt&&row?.actor===clean);
    if(duplicate) return {...current,duplicateOperation:true};
    const walk = {
      actor: clean,
      walkedAt,
      peed,
      pooped,
      stool: pooped && STOOL_TYPES.has(toilet.stool) ? toilet.stool : '',
      previousPeeAt: peed ? String(current.lastPeeAt||'') : '',
      previousPoopAt: pooped ? String(current.lastPoopAt||'') : '',
    };
    const today = moscowDateKey(nowMs);
    const previous = (Array.isArray(current.walksToday) ? current.walksToday : [])
      .filter((row) => moscowDateKey(row.walkedAt) === today);
    const walksToday = moscowDateKey(walkedAt)===today
      ? [...previous.filter((row) => row.walkedAt !== walkedAt), walk]
        .sort((a,b)=>Date.parse(a.walkedAt)-Date.parse(b.walkedAt)).slice(-16)
      : previous;
    const isLatest=!current.lastWalk||Date.parse(walkedAt)>=Date.parse(current.lastWalk.walkedAt);
    const newest=(existing)=>!existing||Date.parse(walkedAt)>Date.parse(existing)?walkedAt:existing;
    return writeLuluState({
      ...current,
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      lastWalk:isLatest?walk:current.lastWalk,
      walksToday,
      walksMonth: [...current.walksMonth,walk],
      lastPeeAt:peed?newest(current.lastPeeAt):current.lastPeeAt,
      lastPoopAt:pooped?newest(current.lastPoopAt):current.lastPoopAt,
      appliedOperations:operationId?[...current.appliedOperations,operationId].slice(-512):current.appliedOperations,
      toiletAlert: isLatest?null:current.toiletAlert,
      updatedAt: isLatest?walkedAt:current.updatedAt,
    }, options);
  });
}

async function cancelLuluWalk(walkedAt, options = {}) {
  const targetDate = new Date(String(walkedAt || '').trim());
  if (Number.isNaN(targetDate.getTime())) throw new Error('lulu-walk-invalid');
  const target = targetDate.toISOString();
  if(moscowDateKey(target)!==moscowDateKey(options.now || Date.now())) throw new Error('lulu-walk-day-invalid');

  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    const previous = Array.isArray(current.walksMonth) ? current.walksMonth : [];
    const removedWalk = previous.find((row)=>row.walkedAt===target)
      || (current.lastWalk?.walkedAt===target ? current.lastWalk : null);
    const walksToday = previous.filter((row) => row.walkedAt !== target);
    const lastMatches = current.lastWalk?.walkedAt === target;
    const removed = Boolean(removedWalk) || lastMatches;
    if (!removed) throw new Error('lulu-walk-not-found');

    let lastWalk = current.lastWalk;
    if (lastMatches) lastWalk = walksToday.length ? walksToday[walksToday.length - 1] : null;

    const lastPeeAt=walksToday.filter(row=>row.peed).at(-1)?.walkedAt || '';
    const lastPoopAt=walksToday.filter(row=>row.pooped).at(-1)?.walkedAt || '';

    return writeLuluState({
      ...current,
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      lastWalk,
      walksToday,
      walksMonth: walksToday,
      lastPeeAt,
      lastPoopAt,
      toiletAlert: current.toiletAlert?.walkedAt === target ? null : current.toiletAlert,
      updatedAt: new Date(options.now || Date.now()).toISOString(),
    }, options);
  });
}

async function restoreLuluWalk(value, options = {}) {
  const restored = normalizeWalk(value);
  if (!restored || (!restored.peed && !restored.pooped)) throw new Error('lulu-walk-invalid');

  return enqueueMutation(async () => {
    const current = await readLuluState(options);
    const today = moscowDateKey(options.now || Date.now());
    if (moscowDateKey(restored.walkedAt) !== today) throw new Error('lulu-walk-day-invalid');

    const previous = Array.isArray(current.walksMonth) ? current.walksMonth : [];
    const walksToday = [...previous.filter((row) => row.walkedAt !== restored.walkedAt), restored]
      .sort((a, b) => new Date(a.walkedAt).getTime() - new Date(b.walkedAt).getTime());
    const lastWalk = walksToday.length ? walksToday[walksToday.length - 1] : restored;

    const latestStamp = (left, right) => {
      const a = normalizeStamp(left);
      const b = normalizeStamp(right);
      if (!a) return b;
      if (!b) return a;
      return Date.parse(a) >= Date.parse(b) ? a : b;
    };

    const lastPeeAt = restored.peed
      ? latestStamp(current.lastPeeAt, restored.walkedAt)
      : current.lastPeeAt;
    const lastPoopAt = restored.pooped
      ? latestStamp(current.lastPoopAt, restored.walkedAt)
      : current.lastPoopAt;

    return writeLuluState({
      ...current,
      initialized: true,
      version: Math.max(0, Number(current.version || 0)) + 1,
      lastWalk,
      walksToday,
      walksMonth: walksToday,
      lastPeeAt,
      lastPoopAt,
      toiletAlert: null,
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
  const now=options.now || Date.now();
  const snapshotMonth=String(snapshot?.month || moscowDateKey(snapshot?.lastWalk?.walkedAt || snapshot?.updatedAt).slice(0,7));
  if(snapshotMonth && snapshotMonth!==moscowDateKey(now).slice(0,7))return readLuluState(options);
  const saved = normalizeLuluState(snapshot, now);
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
  restoreLuluWalk,
  recordLuluToiletAlertRecipients,
  restoreLuluState,
  resetMutationQueueForTests,
};

async function readLuluHealth(options={}){
  const value=await cacheOf(options).get('health');
  return {text:String(value?.text||'').slice(0,2000),actor:cleanActor(value?.actor),updatedAt:normalizeStamp(value?.updatedAt)};
}
async function saveLuluHealth(actor,input={},options={}){
  const who=cleanActor(actor);if(!who)throw Error('lulu-actor-invalid');
  if(typeof input.text!=='string'||input.text.length>2000)throw Error('lulu-health-invalid');
  return enqueueMutation(async()=>{
    const current=await readLuluHealth(options),text=input.text.trim();
    if(current.text===text)return current;
    if(String(input.expectedUpdatedAt||'')!==current.updatedAt)throw Error('lulu-health-conflict');
    const updatedAt=new Date(Math.max(new Date(options.now||Date.now()).getTime(),Date.parse(current.updatedAt||0)+1)).toISOString();
    const value={text,actor:who,updatedAt};
    await cacheOf(options).set('health',value,{ttl:60*60*24*3650,tags:['rudi-lulu-health'],name:'health'});
    return value;
  });
}
module.exports.readLuluHealth=readLuluHealth;
module.exports.saveLuluHealth=saveLuluHealth;
