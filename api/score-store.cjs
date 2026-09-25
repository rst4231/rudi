const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-score-v1';
const STATE_KEY = 'score-state';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const DAILY_LIMIT_UNITS = 100;
const MAX_HISTORY = 500;
const MAX_DEDUPE = 2000;
const MAX_DAYS = 120;
const TZ = 'Europe/Moscow';
const ACTORS = ['Рустам', 'Диана'];

const REWARDS = Object.freeze([
  { id:'movie', label:'Выбрать фильм', icon:'🎬', costUnits:200 },
  { id:'dinner', label:'Выбрать ужин', icon:'🍽️', costUnits:300 },
  { id:'breakfast', label:'Завтрак в постель', icon:'🥐', costUnits:400 },
  { id:'massage', label:'Массаж', icon:'💆', costUnits:500 },
  { id:'day-off', label:'День без домашних обязанностей', icon:'🛋️', costUnits:1000 },
  { id:'date', label:'Выбрать свидание', icon:'💞', costUnits:1200 },
]);

let mutationTail = Promise.resolve();

function cacheOf(options = {}) {
  return options.scoreCache || options.cache || createStrictRuntimeCache({
    namespace: NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}
function cleanActor(value) {
  const actor = String(value || '').trim();
  return ACTORS.includes(actor) ? actor : '';
}
function cleanText(value, max = 220) {
  return String(value || '').replace(/\s+/g,' ').trim().slice(0,max);
}
function scoreDateKey(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA',{
    timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(date);
  const map=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return map.year+'-'+map.month+'-'+map.day;
}
function normalizeUnits(value) {
  const number=Math.round(Number(value)||0);
  return Number.isFinite(number)?number:0;
}
function pointsFromUnits(value) { return normalizeUnits(value)/10; }
function normalizeActorUnits(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(ACTORS.map((actor)=>[actor,normalizeUnits(source[actor])]));
}
function normalizeDaily(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key])=>/^\d{4}-\d{2}-\d{2}$/.test(key))
      .sort(([a],[b])=>b.localeCompare(a))
      .slice(0,MAX_DAYS)
      .map(([key,row])=>[key,normalizeActorUnits(row)])
  );
}
function normalizeDedupe(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(
    Object.entries(source)
      .map(([key,stamp])=>[cleanText(key,180),cleanText(stamp,40)])
      .filter(([key])=>key)
      .slice(-MAX_DEDUPE)
  );
}
function normalizeHistoryItem(input) {
  if(!input||typeof input!=='object') return null;
  const actor=cleanActor(input.actor);
  const units=normalizeUnits(input.units);
  const created=new Date(input.createdAt||0);
  if(!actor||!units||Number.isNaN(created.getTime())) return null;
  return {
    id:cleanText(input.id,96)||crypto.randomUUID(),
    actor,
    kind:['earn','spend','reverse'].includes(String(input.kind||''))?String(input.kind):(units>0?'earn':'spend'),
    units,
    requestedUnits:normalizeUnits(input.requestedUnits||units),
    label:cleanText(input.label,80)||'Баллы',
    detail:cleanText(input.detail,220),
    icon:cleanText(input.icon,12)||'⭐',
    dedupeKey:cleanText(input.dedupeKey,180),
    rewardId:cleanText(input.rewardId,40),
    dateKey:/^\d{4}-\d{2}-\d{2}$/.test(String(input.dateKey||''))?String(input.dateKey):scoreDateKey(created),
    createdAt:created.toISOString(),
    reversedAt:cleanText(input.reversedAt,40),
  };
}
function normalizeState(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    initialized:Boolean(source.initialized),
    version:Math.max(0,Number(source.version||0)),
    balances:normalizeActorUnits(source.balances),
    lifetimeEarned:normalizeActorUnits(source.lifetimeEarned),
    dailyEarned:normalizeDaily(source.dailyEarned),
    history:(Array.isArray(source.history)?source.history:[])
      .map(normalizeHistoryItem).filter(Boolean)
      .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
      .slice(0,MAX_HISTORY),
    dedupe:normalizeDedupe(source.dedupe),
  };
}
function enqueueMutation(task) {
  const run=mutationTail.then(task,task);
  mutationTail=run.catch(()=>{});
  return run;
}
async function readScoreState(options={}) {
  return normalizeState(await cacheOf(options).get(STATE_KEY));
}
async function writeScoreState(value,options={}) {
  const state=normalizeState({...value,initialized:true});
  await cacheOf(options).set(STATE_KEY,state,{ttl:TTL_SECONDS,tags:['rudi-score'],name:STATE_KEY});
  return state;
}
function rewardById(id) {
  return REWARDS.find((row)=>row.id===String(id||'').trim())||null;
}
async function awardScore(actor,requestedUnits,meta={},options={}) {
  const who=cleanActor(actor);
  const request=Math.max(0,normalizeUnits(requestedUnits));
  if(!who||!request) throw new Error('score-award-invalid');
  const dedupeKey=cleanText(meta.dedupeKey,180);
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    if(dedupeKey&&state.dedupe[dedupeKey]) return {state,awardedUnits:0,duplicate:true,capped:false};
    const now=new Date(options.now||Date.now());
    const dateKey=scoreDateKey(now);
    const day=normalizeActorUnits(state.dailyEarned[dateKey]);
    const remaining=Math.max(0,DAILY_LIMIT_UNITS-day[who]);
    const awardedUnits=Math.min(request,remaining);
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances},lifetimeEarned:{...state.lifetimeEarned},
      dailyEarned:{...state.dailyEarned,[dateKey]:day},
      history:[...state.history],dedupe:{...state.dedupe},
    };
    if(dedupeKey) next.dedupe[dedupeKey]=now.toISOString();
    if(awardedUnits>0){
      next.balances[who]+=awardedUnits;
      next.lifetimeEarned[who]+=awardedUnits;
      next.dailyEarned[dateKey][who]+=awardedUnits;
      next.history.unshift(normalizeHistoryItem({
        id:crypto.randomUUID(),actor:who,kind:'earn',units:awardedUnits,requestedUnits:request,
        label:meta.label,detail:meta.detail,icon:meta.icon||'⭐',dedupeKey,dateKey,createdAt:now.toISOString(),
      }));
    }
    const saved=await writeScoreState(next,options);
    return {state:saved,awardedUnits,duplicate:false,capped:awardedUnits<request};
  });
}
async function reverseScoreByDedupeKey(dedupeKey,meta={},options={}) {
  const key=cleanText(dedupeKey,180);
  if(!key) return {state:await readScoreState(options),reversedUnits:0};
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    const index=state.history.findIndex((row)=>row.kind==='earn'&&row.dedupeKey===key&&!row.reversedAt);
    if(index<0) return {state,reversedUnits:0};
    const original=state.history[index];
    const units=Math.max(0,normalizeUnits(original.units));
    if(!units) return {state,reversedUnits:0};
    const now=new Date(options.now||Date.now());
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances},lifetimeEarned:{...state.lifetimeEarned},
      dailyEarned:{...state.dailyEarned},
      history:state.history.map((row,i)=>i===index?{...row,reversedAt:now.toISOString()}:row),
      dedupe:{...state.dedupe},
    };
    next.balances[original.actor]=Math.max(0,next.balances[original.actor]-units);
    next.lifetimeEarned[original.actor]=Math.max(0,next.lifetimeEarned[original.actor]-units);
    const day=normalizeActorUnits(next.dailyEarned[original.dateKey]);
    day[original.actor]=Math.max(0,day[original.actor]-units);
    next.dailyEarned[original.dateKey]=day;
    next.history.unshift(normalizeHistoryItem({
      id:crypto.randomUUID(),actor:original.actor,kind:'reverse',units:-units,requestedUnits:-units,
      label:meta.label||'Отмена',detail:meta.detail||original.detail||original.label,icon:meta.icon||'↩️',
      dateKey:scoreDateKey(now),createdAt:now.toISOString(),
    }));
    const saved=await writeScoreState(next,options);
    return {state:saved,reversedUnits:units};
  });
}
async function redeemReward(actor,rewardId,options={}) {
  const who=cleanActor(actor);
  const reward=rewardById(rewardId);
  if(!who||!reward) throw new Error('score-reward-invalid');
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    if(state.balances[who]<reward.costUnits) throw new Error('score-balance-insufficient');
    const now=new Date(options.now||Date.now());
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances,[who]:state.balances[who]-reward.costUnits},
      lifetimeEarned:{...state.lifetimeEarned},dailyEarned:{...state.dailyEarned},
      history:[normalizeHistoryItem({
        id:crypto.randomUUID(),actor:who,kind:'spend',units:-reward.costUnits,requestedUnits:-reward.costUnits,
        label:'Награда',detail:reward.label,icon:reward.icon,rewardId:reward.id,
        dateKey:scoreDateKey(now),createdAt:now.toISOString(),
      }),...state.history],
      dedupe:{...state.dedupe},
    };
    const saved=await writeScoreState(next,options);
    return {state:saved,reward};
  });
}
function scoreView(value,options={}) {
  const state=normalizeState(value);
  const dateKey=scoreDateKey(options.now||Date.now());
  const today=normalizeActorUnits(state.dailyEarned[dateKey]);
  return {
    initialized:state.initialized,version:state.version,
    balances:Object.fromEntries(ACTORS.map((actor)=>[actor,pointsFromUnits(state.balances[actor])])),
    lifetimeEarned:Object.fromEntries(ACTORS.map((actor)=>[actor,pointsFromUnits(state.lifetimeEarned[actor])])),
    today:{date:dateKey,limit:pointsFromUnits(DAILY_LIMIT_UNITS),
      earned:Object.fromEntries(ACTORS.map((actor)=>[actor,pointsFromUnits(today[actor])]))},
    history:state.history.map((row)=>({...row,points:pointsFromUnits(row.units),requestedPoints:pointsFromUnits(row.requestedUnits)})),
    rewards:REWARDS.map((reward)=>({id:reward.id,label:reward.label,icon:reward.icon,cost:pointsFromUnits(reward.costUnits)})),
  };
}
async function restoreScoreState(snapshot,options={}) {
  const saved=normalizeState(snapshot);
  if(!saved.initialized) return readScoreState(options);
  const current=await readScoreState(options);
  if(current.initialized&&Number(current.version||0)>=Number(saved.version||0)) return current;
  return writeScoreState(saved,options);
}
function resetMutationQueueForTests(){ mutationTail=Promise.resolve(); }

module.exports={
  NAMESPACE,STATE_KEY,TTL_SECONDS,DAILY_LIMIT_UNITS,REWARDS,normalizeState,scoreDateKey,pointsFromUnits,
  readScoreState,writeScoreState,awardScore,reverseScoreByDedupeKey,redeemReward,scoreView,restoreScoreState,
  resetMutationQueueForTests,
};
