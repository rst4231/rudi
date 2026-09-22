const { createStrictRuntimeCache, hashRuntimeCacheKey } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-reactions-v1';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const STATE_KEY = 'state';
const MAX_STATE_ENTRIES = 600;
const ACTORS = new Set(['Рустам', 'Диана']);
const TARGET_TYPES = new Set(['partner-message', 'daily-idea', 'watch', 'feed', 'photo-memory']);
const MAX_TARGET_KEY = 220;
const MAX_BATCH = 12;

function cacheOf(options = {}) {
  return options.reactionsCache || options.cache || createStrictRuntimeCache({ namespace: NAMESPACE });
}

function normalizeActor(value) {
  const actor = String(value || '').trim();
  if (!ACTORS.has(actor)) throw new Error('reaction-actor-invalid');
  return actor;
}

function normalizeTarget(input) {
  const type = String(input?.type || '').trim();
  const key = String(input?.key || '').trim();
  if (!TARGET_TYPES.has(type)) throw new Error('reaction-target-invalid');
  if (!key || key.length > MAX_TARGET_KEY || !/^[A-Za-z0-9:_\-.]+$/.test(key)) {
    throw new Error('reaction-key-invalid');
  }
  return { type, key };
}

function actorSlug(actor) {
  if (actor === 'Рустам') return 'rustam';
  if (actor === 'Диана') return 'diana';
  throw new Error('reaction-actor-invalid');
}

function cacheKey(target, actor) {
  const targetHash = hashRuntimeCacheKey(`${target.type}:${target.key}`);
  return `reaction:${target.type}:${targetHash}:${actorSlug(actor)}`;
}

function stateEntryKey(target) {
  return target.type + ':' + target.key;
}

function storedLiked(value) {
  if (value === null || value === undefined) return false;
  if (value && typeof value === 'object' && typeof value.liked === 'boolean') return value.liked;
  return Boolean(value);
}

function normalizeLikedBy(value) {
  const rows=Array.isArray(value)?value:[];
  return [...ACTORS].filter(actor=>rows.includes(actor));
}

function normalizeReactionEntry(value) {
  try {
    const target=normalizeTarget(value);
    return {
      ...target,
      likedBy:normalizeLikedBy(value?.likedBy),
      updatedAt:String(value?.updatedAt||''),
    };
  } catch {
    return null;
  }
}

function normalizeReactionState(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const entriesSource=source.entries&&typeof source.entries==='object'&&!Array.isArray(source.entries)?source.entries:{};
  const rows=Object.values(entriesSource)
    .map(normalizeReactionEntry)
    .filter(Boolean)
    .sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0))
    .slice(0,MAX_STATE_ENTRIES);
  const entries=Object.fromEntries(rows.map(row=>[stateEntryKey(row),row]));
  return {
    initialized:Boolean(source.initialized||rows.length),
    version:Number(source.version||0),
    entries,
  };
}

function newerReactionEntry(a,b) {
  if(!a) return b||null;
  if(!b) return a;
  return (Date.parse(String(b.updatedAt||''))||0)>(Date.parse(String(a.updatedAt||''))||0)?b:a;
}

function mergeReactionStates(base,overlay) {
  const a=normalizeReactionState(base);
  const b=normalizeReactionState(overlay);
  const entries={...a.entries};
  for(const [key,row] of Object.entries(b.entries)) entries[key]=newerReactionEntry(entries[key],row);
  return normalizeReactionState({
    initialized:Boolean(a.initialized||b.initialized),
    version:Math.max(Number(a.version||0),Number(b.version||0)),
    entries,
  });
}

async function readReactionState(options = {}) {
  return normalizeReactionState(await cacheOf(options).get(STATE_KEY));
}

async function writeReactionState(value, options = {}) {
  const state=normalizeReactionState({
    ...value,
    initialized:true,
    version:Number(value?.version||Date.now()),
  });
  await cacheOf(options).set(STATE_KEY,state,{
    ttl:TTL_SECONDS,
    tags:['rudi-reactions','rudi-durable-state'],
    name:STATE_KEY,
  });
  return state;
}

async function legacyLikedBy(target,cache) {
  const rows=await Promise.all([...ACTORS].map(async actor=>[
    actor,
    storedLiked(await cache.get(cacheKey(target,actor))),
  ]));
  return rows.filter(([,liked])=>liked).map(([actor])=>actor);
}

async function readReaction(targetInput, options = {}) {
  const target=normalizeTarget(targetInput);
  const cache=cacheOf(options);
  const state=await readReactionState({ ...options, reactionsCache:cache });
  const key=stateEntryKey(target);
  const entry=state.entries[key];
  if(entry) return { ...target, likedBy:entry.likedBy, count:entry.likedBy.length };

  const likedBy=await legacyLikedBy(target,cache);
  if(likedBy.length){
    state.entries[key]={...target,likedBy,updatedAt:new Date(options.now||Date.now()).toISOString()};
    state.version=Date.now();
    await writeReactionState(state,{ ...options, reactionsCache:cache }).catch(()=>false);
  }
  return { ...target, likedBy, count:likedBy.length };
}

async function readReactions(targets, options = {}) {
  const list = Array.isArray(targets) ? targets : [];
  if (!list.length || list.length > MAX_BATCH) throw new Error('reaction-targets-invalid');
  return Promise.all(list.map((target) => readReaction(target, options)));
}

async function setReaction(targetInput, actorInput, likedInput, options = {}) {
  const target=normalizeTarget(targetInput);
  const actor=normalizeActor(actorInput);
  if(typeof likedInput!=='boolean') throw new Error('reaction-liked-invalid');

  const cache=cacheOf(options);
  const current=await readReaction(target,{ ...options, reactionsCache:cache });
  const likedBy=new Set(current.likedBy||[]);
  if(likedInput) likedBy.add(actor); else likedBy.delete(actor);
  const updatedAt=new Date(options.now||Date.now()).toISOString();

  const state=await readReactionState({ ...options, reactionsCache:cache });
  state.entries[stateEntryKey(target)]={
    ...target,
    likedBy:[...ACTORS].filter(name=>likedBy.has(name)),
    updatedAt,
  };
  state.version=Date.now();

  await Promise.all([
    writeReactionState(state,{ ...options, reactionsCache:cache }),
    cache.set(cacheKey(target,actor),{actor,liked:likedInput,reactedAt:updatedAt},{
      ttl:TTL_SECONDS,
      tags:['rudi-reactions',`rudi-reaction-${target.type}`],
      name:cacheKey(target,actor),
    }),
  ]);

  const result=state.entries[stateEntryKey(target)];
  return {...target,likedBy:result.likedBy,count:result.likedBy.length};
}

async function toggleReaction(targetInput, actorInput, options = {}) {
  const target=normalizeTarget(targetInput);
  const actor=normalizeActor(actorInput);
  const current=await readReaction(target,options);
  return setReaction(target,actor,!current.likedBy.includes(actor),options);
}

async function restoreReactionState(snapshot, options = {}) {
  const incoming=normalizeReactionState(snapshot);
  if(!incoming.initialized) return readReactionState(options);
  const cache=cacheOf(options);
  const current=await readReactionState({ ...options, reactionsCache:cache });
  const merged=mergeReactionStates(current,incoming);
  merged.version=Math.max(Number(current.version||0),Number(incoming.version||0),Date.now());
  const stored=await writeReactionState(merged,{ ...options, reactionsCache:cache });
  const writes=[];
  for(const entry of Object.values(stored.entries)){
    for(const actor of ACTORS){
      writes.push(cache.set(cacheKey(entry,actor),{
        actor,
        liked:entry.likedBy.includes(actor),
        reactedAt:entry.updatedAt,
      },{
        ttl:TTL_SECONDS,
        tags:['rudi-reactions',`rudi-reaction-${entry.type}`],
        name:cacheKey(entry,actor),
      }).catch(()=>false));
    }
  }
  await Promise.all(writes);
  return stored;
}

module.exports = {
  NAMESPACE,TTL_SECONDS,STATE_KEY,MAX_STATE_ENTRIES,ACTORS,TARGET_TYPES,
  normalizeTarget,actorSlug,cacheKey,stateEntryKey,
  normalizeReactionState,mergeReactionStates,readReactionState,writeReactionState,restoreReactionState,
  readReaction,readReactions,setReaction,toggleReaction,
};
