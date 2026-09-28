const crypto = require('node:crypto');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE = 'rudi-score-v1';
const STATE_KEY = 'score-state';
const TTL_SECONDS = 60 * 60 * 24 * 3650;
const DAILY_LIMIT_UNITS = 150;
const PRODUCT_DAILY_LIMIT_UNITS = 20;
const PRODUCT_REPEAT_MS = 72 * 60 * 60 * 1000;
const MAX_HISTORY = 500;
const MAX_DEDUPE = 2000;
const MAX_DAYS = 120;
const MAX_REDEMPTIONS = 240;
const HISTORY_RETENTION_DAYS = 30;
const GIFT_WEEKLY_LIMIT_UNITS = 50;
const TZ = 'Europe/Moscow';
const ACTORS = ['Рустам', 'Диана'];

const REWARDS = Object.freeze([
  { id:'playlist', label:'Выбрать музыку/плейлист', description:'Ты выбираешь музыку/плейлист в машине на весь день.', icon:'🎧', costUnits:50 },
  { id:'coffee-tea', label:'Кофе или чай от партнёра', description:'Партнёр приготовит и принесёт тебе кофе или чай.', icon:'☕️', costUnits:80 },
  { id:'dessert', label:'Выбрать десерт или вкусняшку', description:'Ты выбираешь десерт или любимую вкусняшку.', icon:'🍰', costUnits:100 },
  { id:'movie', label:'Выбрать фильм или сериал', description:'Ты выбираешь фильм или сериал для совместного просмотра.', icon:'🎬', costUnits:150 },
  { id:'order-food', label:'Выбрать, что заказать поесть', description:'Ты выбираешь, что и откуда заказать.', icon:'🍕', costUnits:250 },
  { id:'breakfast', label:'Завтрак в постель', description:'Партнёр готовит и приносит завтрак в постель.', icon:'🥐', costUnits:300 },
  { id:'small-surprise', label:'Маленький сюрприз', description:'Партнёр придумывает для тебя небольшой сюрприз.', icon:'🎁', costUnits:350 },
  { id:'massage', label:'Массаж', description:'Домашний массаж от партнёра на 20–30 минут.', icon:'💆', costUnits:400 },
  { id:'home-date', label:'Домашнее свидание', description:'Партнёр организует уютное свидание дома.', icon:'🕯️', costUnits:500 },
  { id:'cooked-dish', label:'Любимое блюдо от партнёра', description:'Партнёр сам готовит для тебя выбранное тобой блюдо.', icon:'🍳', costUnits:700 },
  { id:'your-evening', label:'Вечер по твоим правилам', description:'Ты выбираешь, как провести вечер: фильм, игра, прогулка, еда или другое совместное занятие.', icon:'✨', costUnits:850 },
  { id:'day-off', label:'День без домашних обязанностей', description:'На день освобождаешься от домашних обязанностей.', icon:'🛋️', costUnits:900 },
  { id:'date', label:'Выбрать свидание', description:'Ты выбираешь идею и формат следующего свидания.', icon:'💞', costUnits:1100 },
  { id:'gift-3000', label:'Подарок до 3 000 ₽', description:'Партнёр заказывает для тебя выбранный подарок стоимостью до 3 000 ₽.', icon:'🎀', costUnits:1400 },
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
function actorDative(actor){return actor==='Диана'?'Диане':actor==='Рустам'?'Рустаму':String(actor||'')}
function actorGenitive(actor){return actor==='Диана'?'Дианы':actor==='Рустам'?'Рустама':String(actor||'')}
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
  const raw=Number(value)||0;
  const number=Math.round(raw*2)/2;
  return Number.isFinite(number)?number:0;
}
function pointsFromUnits(value) { return normalizeUnits(value)/10; }
function shiftScoreDateKey(key,days) {
  const text=String(key||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date=new Date(text+'T00:00:00Z');
  if(Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}
function scoreWeekKey(value=Date.now()) {
  const key=scoreDateKey(value);
  const date=new Date(key+'T00:00:00Z');
  const day=date.getUTCDay()||7;
  return shiftScoreDateKey(key,1-day);
}
function normalizeProductScoreName(value) {
  return String(value||'')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g,'е')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,160);
}
function productScoreDedupeKey(value) {
  const normalized=normalizeProductScoreName(value);
  if(!normalized) return '';
  return 'score:product:'+crypto.createHash('sha256').update(normalized).digest('hex').slice(0,32);
}
function normalizeActorUnits(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(ACTORS.map((actor)=>[actor,normalizeUnits(source[actor])]));
}
function scoreRetentionCutoffDateKey(now=Date.now()) {
  return shiftScoreDateKey(scoreDateKey(now),-(HISTORY_RETENTION_DAYS-1));
}
function normalizeDaily(value,cutoffKey='') {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key])=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&(!cutoffKey||key>=cutoffKey))
      .sort(([a],[b])=>b.localeCompare(a))
      .slice(0,MAX_DAYS)
      .map(([key,row])=>[key,normalizeActorUnits(row)])
  );
}
function normalizeStreakDays(value,history=[],cutoffKey='') {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const rows={};
  for(const [key,actors] of Object.entries(source)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||cutoffKey&&key<cutoffKey) continue;
    rows[key]=Object.fromEntries(ACTORS.map((actor)=>[actor,actors?.[actor]===true]));
  }
  if(!Object.keys(rows).length){
    for(const item of Array.isArray(history)?history:[]){
      const row=normalizeHistoryItem(item);
      if(!row||row.kind!=='earn'||row.reversedAt||String(row.dedupeKey||'').startsWith('score:streak:')) continue;
      if(!rows[row.dateKey]) rows[row.dateKey]=Object.fromEntries(ACTORS.map((actor)=>[actor,false]));
      rows[row.dateKey][row.actor]=true;
    }
  }
  return Object.fromEntries(Object.entries(rows).sort(([a],[b])=>b.localeCompare(a)).slice(0,MAX_DAYS));
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
    kind:['earn','spend','reverse','gift-out','gift-in'].includes(String(input.kind||''))?String(input.kind):(units>0?'earn':'spend'),
    units,
    requestedUnits:normalizeUnits(input.requestedUnits||units),
    label:cleanText(input.label,80)||'Звезды',
    detail:cleanText(input.detail,220),
    icon:cleanText(input.icon,12)||'⭐',
    dedupeKey:cleanText(input.dedupeKey,180),
    rewardId:cleanText(input.rewardId,40),
    dateKey:/^\d{4}-\d{2}-\d{2}$/.test(String(input.dateKey||''))?String(input.dateKey):scoreDateKey(created),
    createdAt:created.toISOString(),
    reversedAt:cleanText(input.reversedAt,40),
  };
}
function normalizeRedemption(input) {
  if(!input||typeof input!=='object') return null;
  const id=cleanText(input.id,96);
  const buyerActor=cleanActor(input.buyerActor);
  const rewardId=cleanText(input.rewardId,40);
  const label=cleanText(input.label,80);
  const icon=cleanText(input.icon,12)||'🎁';
  const costUnits=Math.max(0,normalizeUnits(input.costUnits));
  const created=new Date(input.createdAt||0);
  if(!id||!buyerActor||!rewardId||!label||!costUnits||Number.isNaN(created.getTime())) return null;
  const completedBy=cleanActor(input.completedBy);
  const done=input.completedAt?new Date(input.completedAt):null;
  const completedAt=done&&!Number.isNaN(done.getTime())?done.toISOString():'';
  const status=completedAt&&completedBy?'completed':'active';
  return {id,buyerActor,rewardId,label,icon,costUnits,status,createdAt:created.toISOString(),completedAt,completedBy:status==='completed'?completedBy:''};
}
function normalizeState(value,options={}) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const now=options.now||Date.now();
  const cutoffKey=scoreRetentionCutoffDateKey(now);
  return {
    initialized:Boolean(source.initialized),
    version:Math.max(0,Number(source.version||0)),
    balances:normalizeActorUnits(source.balances),
    lifetimeEarned:normalizeActorUnits(source.lifetimeEarned),
    dailyEarned:normalizeDaily(source.dailyEarned,cutoffKey),
    streakDays:normalizeStreakDays(source.streakDays,source.history,cutoffKey),
    history:(Array.isArray(source.history)?source.history:[])
      .map(normalizeHistoryItem).filter(row=>row&&row.dateKey>=cutoffKey)
      .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
      .slice(0,MAX_HISTORY),
    redemptions:(Array.isArray(source.redemptions)?source.redemptions:[])
      .map(normalizeRedemption).filter(row=>{
        if(!row) return false;
        if(row.status==='active') return true;
        const key=scoreDateKey(row.completedAt||row.createdAt);
        return key>=cutoffKey;
      })
      .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
      .slice(0,MAX_REDEMPTIONS),
    dedupe:normalizeDedupe(source.dedupe),
  };
}
function enqueueMutation(task) {
  const run=mutationTail.then(task,task);
  mutationTail=run.catch(()=>{});
  return run;
}
function scoreStateHasExpiredRows(value,now=Date.now()) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const cutoffKey=scoreRetentionCutoffDateKey(now);
  if((Array.isArray(source.history)?source.history:[]).some(item=>{
    const row=normalizeHistoryItem(item);
    return row&&row.dateKey<cutoffKey;
  })) return true;
  if(Object.keys(source.dailyEarned||{}).some(key=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&key<cutoffKey)) return true;
  if(Object.keys(source.streakDays||{}).some(key=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&key<cutoffKey)) return true;
  return (Array.isArray(source.redemptions)?source.redemptions:[]).some(item=>{
    const row=normalizeRedemption(item);
    return row&&row.status==='completed'&&scoreDateKey(row.completedAt||row.createdAt)<cutoffKey;
  });
}
async function readScoreState(options={}) {
  const cache=cacheOf(options);
  const now=options.now||Date.now();
  const raw=await cache.get(STATE_KEY);
  const state=normalizeState(raw,{now});
  if(scoreStateHasExpiredRows(raw,now)){
    await cache.set(STATE_KEY,state,{ttl:TTL_SECONDS,tags:['rudi-score'],name:STATE_KEY});
  }
  return state;
}
async function writeScoreState(value,options={}) {
  const state=normalizeState({...value,initialized:true},{now:options.now||Date.now()});
  await cacheOf(options).set(STATE_KEY,state,{ttl:TTL_SECONDS,tags:['rudi-score'],name:STATE_KEY});
  return state;
}
function canonicalRewardId(id) {
  const value=String(id||'').trim();
  return value==='series'?'movie':value;
}
function rewardById(id) {
  const canonical=canonicalRewardId(id);
  return REWARDS.find((row)=>row.id===canonical)||null;
}
function claimUnlockedRewards(next,actor,beforeUnits,afterUnits,now){
  const unlocked=[];
  for(const reward of REWARDS){
    const key='score:shop-unlock:'+actor+':'+reward.id;
    if(beforeUnits<reward.costUnits&&afterUnits>=reward.costUnits&&!next.dedupe[key]){
      next.dedupe[key]=new Date(now).toISOString();
      unlocked.push(reward);
    }
  }
  return unlocked;
}
async function awardScore(actor,requestedUnits,meta={},options={}) {
  const who=cleanActor(actor);
  const request=Math.max(0,normalizeUnits(requestedUnits));
  if(!who||!request) throw new Error('score-award-invalid');
  const dedupeKey=cleanText(meta.dedupeKey,180);
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    if(dedupeKey&&state.dedupe[dedupeKey]) return {state,awardedUnits:0,duplicate:true,capped:false,unlockedRewards:[]};
    const now=new Date(options.now||Date.now());
    const beforeBalance=state.balances[who];
    const dateKey=scoreDateKey(now);
    const day=normalizeActorUnits(state.dailyEarned[dateKey]);
    const remaining=Math.max(0,DAILY_LIMIT_UNITS-day[who]);
    const awardedUnits=Math.min(request,remaining);
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances},lifetimeEarned:{...state.lifetimeEarned},
      dailyEarned:{...state.dailyEarned,[dateKey]:day},
      streakDays:{...state.streakDays},
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
    const unlockedRewards=claimUnlockedRewards(next,who,beforeBalance,next.balances[who],now);
    const saved=await writeScoreState(next,options);
    return {state:saved,awardedUnits,duplicate:false,capped:awardedUnits<request,unlockedRewards};
  });
}
async function awardProductScore(actor,productText,options={}) {
  const who=cleanActor(actor);
  const text=cleanText(productText,180);
  const dedupeKey=productScoreDedupeKey(text);
  if(!who||!text||!dedupeKey) throw new Error('score-product-award-invalid');
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    const now=new Date(options.now||Date.now());
    const nowMs=now.getTime();
    const recent=state.history.find((row)=>{
      if(row.kind!=='earn'||row.actor!==who||row.dedupeKey!==dedupeKey||row.reversedAt) return false;
      const stamp=Date.parse(row.createdAt);
      return Number.isFinite(stamp)&&nowMs-stamp<PRODUCT_REPEAT_MS;
    });
    if(recent) return {state,awardedUnits:0,duplicate:true,productCapped:false,globalCapped:false,unlockedRewards:[]};

    const dateKey=scoreDateKey(now);
    const day=normalizeActorUnits(state.dailyEarned[dateKey]);
    const productEarnedToday=state.history
      .filter((row)=>row.kind==='earn'&&row.actor===who&&row.dateKey===dateKey&&!row.reversedAt&&String(row.dedupeKey||'').startsWith('score:product:'))
      .reduce((sum,row)=>sum+Math.max(0,normalizeUnits(row.units)),0);
    const productRemaining=Math.max(0,PRODUCT_DAILY_LIMIT_UNITS-productEarnedToday);
    const globalRemaining=Math.max(0,DAILY_LIMIT_UNITS-day[who]);
    const awardedUnits=Math.min(1,productRemaining,globalRemaining);
    if(awardedUnits<=0) {
      return {
        state,awardedUnits:0,duplicate:false,
        productCapped:productRemaining<=0,globalCapped:globalRemaining<=0,unlockedRewards:[],
      };
    }

    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances},lifetimeEarned:{...state.lifetimeEarned},
      dailyEarned:{...state.dailyEarned,[dateKey]:day},
      streakDays:{...state.streakDays},
      history:[...state.history],dedupe:{...state.dedupe},
    };
    next.balances[who]+=awardedUnits;
    next.lifetimeEarned[who]+=awardedUnits;
    next.dailyEarned[dateKey][who]+=awardedUnits;
    next.history.unshift(normalizeHistoryItem({
      id:crypto.randomUUID(),actor:who,kind:'earn',units:awardedUnits,requestedUnits:1,
      label:'Продукты',detail:'Добавлена позиция: '+text,icon:'🛒',dedupeKey,dateKey,createdAt:now.toISOString(),
    }));
    const unlockedRewards=claimUnlockedRewards(next,who,state.balances[who],next.balances[who],now);
    const saved=await writeScoreState(next,options);
    return {state:saved,awardedUnits,duplicate:false,productCapped:false,globalCapped:false,unlockedRewards};
  });
}
async function penalizeScore(actor,requestedUnits,meta={},options={}) {
  const who=cleanActor(actor);
  const request=Math.max(0,normalizeUnits(requestedUnits));
  if(!who||!request) throw new Error('score-penalty-invalid');
  const dedupeKey=cleanText(meta.dedupeKey,180);
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    if(dedupeKey&&state.dedupe[dedupeKey]) return {state,penalizedUnits:0,duplicate:true};
    const now=new Date(options.now||Date.now()),dateKey=scoreDateKey(now);
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances,[who]:normalizeUnits(state.balances[who]-request)},
      lifetimeEarned:{...state.lifetimeEarned},dailyEarned:{...state.dailyEarned},
      streakDays:{...state.streakDays},history:[...state.history],dedupe:{...state.dedupe},
    };
    if(dedupeKey) next.dedupe[dedupeKey]=now.toISOString();
    next.history.unshift(normalizeHistoryItem({
      id:crypto.randomUUID(),actor:who,kind:'spend',units:-request,requestedUnits:-request,
      label:meta.label||'Штраф',detail:meta.detail||'Списание звёзд',icon:meta.icon||'🔴',
      dedupeKey,dateKey,createdAt:now.toISOString(),
    }));
    const saved=await writeScoreState(next,options);
    return {state:saved,penalizedUnits:request,duplicate:false};
  });
}
async function reversePenaltyByDedupeKey(dedupeKey,meta={},options={}) {
  const key=cleanText(dedupeKey,180);
  if(!key) return {state:await readScoreState(options),reversedUnits:0};
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    const index=state.history.findIndex((row)=>row.kind==='spend'&&row.dedupeKey===key&&!row.reversedAt);
    if(index<0){
      if(meta.clearDedupe&&state.dedupe[key]){
        const next={...state,version:Math.max(0,Number(state.version||0))+1,dedupe:{...state.dedupe}};
        delete next.dedupe[key];
        return {state:await writeScoreState(next,options),reversedUnits:0};
      }
      return {state,reversedUnits:0};
    }
    const original=state.history[index],units=Math.abs(normalizeUnits(original.units));
    const now=new Date(options.now||Date.now());
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances,[original.actor]:normalizeUnits(state.balances[original.actor]+units)},
      lifetimeEarned:{...state.lifetimeEarned},dailyEarned:{...state.dailyEarned},
      streakDays:{...state.streakDays},
      history:state.history.map((row,i)=>i===index?{...row,reversedAt:now.toISOString()}:row),
      dedupe:{...state.dedupe},
    };
    if(meta.clearDedupe&&original.dedupeKey) delete next.dedupe[original.dedupeKey];
    next.history.unshift(normalizeHistoryItem({
      id:crypto.randomUUID(),actor:original.actor,kind:'reverse',units,requestedUnits:units,
      label:meta.label||'Отмена штрафа',detail:meta.detail||original.detail||original.label,
      icon:meta.icon||'↩️',dateKey:scoreDateKey(now),createdAt:now.toISOString(),
    }));
    return {state:await writeScoreState(next,options),reversedUnits:units};
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
      streakDays:{...state.streakDays},
      history:state.history.map((row,i)=>i===index?{...row,reversedAt:now.toISOString()}:row),
      dedupe:{...state.dedupe},
    };
    next.balances[original.actor]=normalizeUnits(next.balances[original.actor]-units);
    next.lifetimeEarned[original.actor]=Math.max(0,next.lifetimeEarned[original.actor]-units);
    const day=normalizeActorUnits(next.dailyEarned[original.dateKey]);
    day[original.actor]=Math.max(0,day[original.actor]-units);
    next.dailyEarned[original.dateKey]=day;
    if(meta.clearDedupe&&original.dedupeKey) delete next.dedupe[original.dedupeKey];
    const stillActive=next.history.some((row)=>row.actor===original.actor&&row.dateKey===original.dateKey&&row.kind==='earn'&&!row.reversedAt&&!String(row.dedupeKey||'').startsWith('score:streak:'));
    if(meta.skipStreak!==true&&!stillActive&&next.streakDays[original.dateKey]){
      next.streakDays[original.dateKey]={...next.streakDays[original.dateKey],[original.actor]:false};
      const streakIndex=next.history.findIndex((row)=>row.actor===original.actor&&row.dateKey===original.dateKey&&row.kind==='earn'&&!row.reversedAt&&String(row.dedupeKey||'').startsWith('score:streak:'));
      if(streakIndex>=0){
        const streakRow=next.history[streakIndex];
        const streakUnits=Math.max(0,normalizeUnits(streakRow.units));
        next.history[streakIndex]={...streakRow,reversedAt:now.toISOString()};
        next.balances[original.actor]=normalizeUnits(next.balances[original.actor]-streakUnits);
        next.lifetimeEarned[original.actor]=Math.max(0,next.lifetimeEarned[original.actor]-streakUnits);
        const streakDay=normalizeActorUnits(next.dailyEarned[original.dateKey]);
        streakDay[original.actor]=Math.max(0,streakDay[original.actor]-streakUnits);
        next.dailyEarned[original.dateKey]=streakDay;
        if(streakRow.dedupeKey) delete next.dedupe[streakRow.dedupeKey];
        next.history.unshift(normalizeHistoryItem({
          id:crypto.randomUUID(),actor:original.actor,kind:'reverse',units:-streakUnits,requestedUnits:-streakUnits,
          label:'Отмена серии',detail:'Отменён бонус серии',icon:'↩️',
          dateKey:scoreDateKey(now),createdAt:now.toISOString(),
        }));
      }
    }
    next.history.unshift(normalizeHistoryItem({
      id:crypto.randomUUID(),actor:original.actor,kind:'reverse',units:-units,requestedUnits:-units,
      label:meta.label||'Отмена',detail:meta.detail||original.detail||original.label,icon:meta.icon||'↩️',
      dateKey:scoreDateKey(now),createdAt:now.toISOString(),
    }));
    const saved=await writeScoreState(next,options);
    return {state:saved,reversedUnits:units};
  });
}
async function transferStars(actor,amountPoints,options={}) {
  const from=cleanActor(actor);
  const to=ACTORS.find((row)=>row!==from)||'';
  const points=Math.round(Number(amountPoints)||0);
  const units=points*10;
  if(!from||!to||points<1||points>5) throw new Error('score-gift-amount-invalid');
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    const now=new Date(options.now||Date.now());
    const weekKey=scoreWeekKey(now);
    const weekDedupe='gift-week:'+weekKey;
    const giftedUnits=state.history
      .filter((row)=>row.actor===from&&row.kind==='gift-out'&&row.dedupeKey===weekDedupe)
      .reduce((sum,row)=>sum+Math.abs(normalizeUnits(row.units)),0);
    const remaining=Math.max(0,GIFT_WEEKLY_LIMIT_UNITS-giftedUnits);
    if(units>remaining) throw new Error('score-gift-weekly-limit');
    if(state.balances[from]<units) throw new Error('score-balance-insufficient');
    const createdAt=now.toISOString();
    const dateKey=scoreDateKey(now);
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances,[from]:state.balances[from]-units,[to]:state.balances[to]+units},
      lifetimeEarned:{...state.lifetimeEarned},dailyEarned:{...state.dailyEarned},
      history:[
        normalizeHistoryItem({id:crypto.randomUUID(),actor:from,kind:'gift-out',units:-units,requestedUnits:-units,label:'Подарок',detail:'Подарено '+actorDative(to),icon:'🎁',dedupeKey:weekDedupe,dateKey,createdAt}),
        normalizeHistoryItem({id:crypto.randomUUID(),actor:to,kind:'gift-in',units,requestedUnits:units,label:'Подарок',detail:'Подарок от '+actorGenitive(from),icon:'🎁',dedupeKey:weekDedupe,dateKey,createdAt}),
        ...state.history
      ],
      redemptions:[...state.redemptions],dedupe:{...state.dedupe},
    };
    const unlockedRewards=claimUnlockedRewards(next,to,state.balances[to],next.balances[to],now);
    const saved=await writeScoreState(next,options);
    return {state:saved,from,to,points,weekKey,remainingPoints:pointsFromUnits(remaining-units),unlockedRewards};
  });
}

async function redeemReward(actor,rewardId,options={}) {
  const who=cleanActor(actor);
  const reward=rewardById(rewardId);
  if(!who||!reward) throw new Error('score-reward-invalid');
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    if(state.redemptions.some((row)=>row.status==='active'&&canonicalRewardId(row.rewardId)===reward.id)) throw new Error('score-reward-active');
    if(state.balances[who]<reward.costUnits) throw new Error('score-balance-insufficient');
    const now=new Date(options.now||Date.now());
    const redemption=normalizeRedemption({
      id:'reward-'+crypto.randomUUID(),buyerActor:who,rewardId:reward.id,label:reward.label,icon:reward.icon,
      costUnits:reward.costUnits,createdAt:now.toISOString(),
    });
    const next={
      ...state,initialized:true,version:Math.max(0,Number(state.version||0))+1,
      balances:{...state.balances,[who]:state.balances[who]-reward.costUnits},
      lifetimeEarned:{...state.lifetimeEarned},dailyEarned:{...state.dailyEarned},
      history:[normalizeHistoryItem({
        id:crypto.randomUUID(),actor:who,kind:'spend',units:-reward.costUnits,requestedUnits:-reward.costUnits,
        label:'Награда',detail:reward.label,icon:reward.icon,rewardId:reward.id,
        dateKey:scoreDateKey(now),createdAt:now.toISOString(),
      }),...state.history],
      redemptions:[redemption,...state.redemptions],
      dedupe:{...state.dedupe},
    };
    const saved=await writeScoreState(next,options);
    return {state:saved,reward,redemption};
  });
}
async function completeReward(actor,redemptionId,options={}) {
  const who=cleanActor(actor);
  const id=cleanText(redemptionId,96);
  if(!who||!id) throw new Error('score-reward-complete-invalid');
  return enqueueMutation(async()=>{
    const state=await readScoreState(options);
    const index=state.redemptions.findIndex((row)=>row.id===id);
    if(index<0) throw new Error('score-reward-not-found');
    const current=state.redemptions[index];
    if(current.status!=='active') throw new Error('score-reward-already-completed');
    if(current.buyerActor===who) throw new Error('score-reward-self-complete-forbidden');
    const now=new Date(options.now||Date.now());
    const completed=normalizeRedemption({...current,completedAt:now.toISOString(),completedBy:who});
    const redemptions=[...state.redemptions];
    redemptions[index]=completed;
    const saved=await writeScoreState({...state,version:Math.max(0,Number(state.version||0))+1,redemptions},options);
    return {state:saved,redemption:completed};
  });
}
function scoreView(value,options={}) {
  const state=normalizeState(value,{now:options.now||Date.now()});
  const dateKey=scoreDateKey(options.now||Date.now());
  const today=normalizeActorUnits(state.dailyEarned[dateKey]);
  return {
    initialized:state.initialized,version:state.version,
    balances:Object.fromEntries(ACTORS.map((actor)=>[actor,pointsFromUnits(state.balances[actor])])),
    lifetimeEarned:Object.fromEntries(ACTORS.map((actor)=>[actor,pointsFromUnits(state.lifetimeEarned[actor])])),
    today:{date:dateKey,limit:pointsFromUnits(DAILY_LIMIT_UNITS),
      earned:Object.fromEntries(ACTORS.map((actor)=>[actor,pointsFromUnits(today[actor])]))},
    gifts:Object.fromEntries(ACTORS.map((actor)=>{
      const weekKey=scoreWeekKey(options.now||Date.now());
      const weekDedupe='gift-week:'+weekKey;
      const giftedUnits=state.history
        .filter((row)=>row.actor===actor&&row.kind==='gift-out'&&row.dedupeKey===weekDedupe)
        .reduce((sum,row)=>sum+Math.abs(normalizeUnits(row.units)),0);
      return [actor,{weekKey,limit:pointsFromUnits(GIFT_WEEKLY_LIMIT_UNITS),gifted:pointsFromUnits(giftedUnits),remaining:pointsFromUnits(Math.max(0,GIFT_WEEKLY_LIMIT_UNITS-giftedUnits))}];
    })),
    history:state.history.map((row)=>({...row,points:pointsFromUnits(row.units),requestedPoints:pointsFromUnits(row.requestedUnits)})),
    rewards:REWARDS.map((reward)=>({id:reward.id,label:reward.label,description:reward.description||'',icon:reward.icon,cost:pointsFromUnits(reward.costUnits)})),
    activeRewards:state.redemptions.filter((row)=>row.status==='active').map((row)=>({...row,cost:pointsFromUnits(row.costUnits)})),
    completedRewards:state.redemptions.filter((row)=>row.status==='completed').map((row)=>({...row,cost:pointsFromUnits(row.costUnits)})),
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
  NAMESPACE,STATE_KEY,TTL_SECONDS,DAILY_LIMIT_UNITS,PRODUCT_DAILY_LIMIT_UNITS,PRODUCT_REPEAT_MS,HISTORY_RETENTION_DAYS,REWARDS,normalizeState,scoreDateKey,pointsFromUnits,
  readScoreState,writeScoreState,awardScore,awardProductScore,penalizeScore,reversePenaltyByDedupeKey,reverseScoreByDedupeKey,transferStars,redeemReward,completeReward,scoreView,restoreScoreState,
  resetMutationQueueForTests,
};
