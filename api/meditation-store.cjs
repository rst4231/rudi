'use strict';
const crypto=require('node:crypto');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NAMESPACE='rudi-meditation-v1',TTL=10*365*24*3600;
const DURATIONS=new Set([5,10,20,30,60]);
let mutationTail=Promise.resolve();
function actorKey(actor){if(actor!=='Рустам'&&actor!=='Диана')throw Error('meditation-actor-invalid');return actor==='Рустам'?'rustam':'diana'}
function cache(options={}){return options.meditationCache||createStrictRuntimeCache({namespace:NAMESPACE,...options})}
const iso=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?new Date(n).toISOString():''};
function normalize(raw){
 const a=raw&&typeof raw==='object'?raw:{};
 const history=(Array.isArray(a.history)?a.history:[]).map(x=>{
   const start=iso(x.startedAt),end=iso(x.endedAt);
   if(!start||!end||Date.parse(end)<Date.parse(start))return null;
   const goal=Number(x.goalMinutes);
   if(!DURATIONS.has(goal))return null;
   const seconds=Math.min(24*3600,Math.max(0,Math.floor(Number(x.durationSeconds)||0)));
   if(seconds<60)return null;
   return {id:String(x.id||'').slice(0,100),startedAt:start,endedAt:end,goalMinutes:goal,
      durationSeconds:seconds,durationMinutes:Math.round(seconds/60*10)/10,completed:seconds>=goal*60,
      rewardPoints:[0,.1,.2,.3,.4,.5].includes(Number(x.rewardPoints))?Number(x.rewardPoints):0};
 }).filter(Boolean).sort((x,y)=>y.endedAt.localeCompare(x.endedAt)).slice(0,500);
 const active=a.active&&DURATIONS.has(Number(a.active.goalMinutes))&&iso(a.active.startedAt)?
   {id:String(a.active.id||''),startedAt:iso(a.active.startedAt),goalMinutes:Number(a.active.goalMinutes)}:null;
 return {active,history,version:Number(a.version||0)};
}
async function read(actor,options={}){return normalize(await cache(options).get(actorKey(actor)))}
async function write(actor,state,options={}){const value={...normalize(state),version:Date.now()};await cache(options).set(actorKey(actor),value,{ttl:TTL,tags:['rudi-meditation','rudi-durable-state'],name:actorKey(actor)});return value}
function queue(fn){const job=mutationTail.then(fn,fn);mutationTail=job.catch(()=>{});return job}
function nowMs(options={}){return Number(options.now||Date.now())}
async function start(actor,goalMinutes,options={}){
 return queue(async()=>{
  const goal=Number(goalMinutes);if(!DURATIONS.has(goal))throw Error('meditation-goal-invalid');
  const state=await read(actor,options);
  const requestedId=String(options.activeId||'').trim().slice(0,100);
  if(state.active){
   if(requestedId&&state.active.id===requestedId)return state;
   throw Error('meditation-already-active');
  }
  if(requestedId&&state.history.some(x=>x.id===requestedId))return state;
  const start=options.startedAt?Date.parse(String(options.startedAt)):nowMs(options);
  if(!Number.isFinite(start)||start>nowMs(options)+300000||start<nowMs(options)-30*86400000)
   throw Error('meditation-start-invalid');
  state.active={id:requestedId||crypto.randomUUID(),startedAt:new Date(start).toISOString(),goalMinutes:goal};
  return write(actor,state,options);
 });
}
async function finish(actor,activeId,auto=false,options={}){
 return queue(async()=>{
  const state=await read(actor,options);const id=String(activeId||'');
  if(!state.active||state.active.id!==id){
   // Idempotent retries after a lost response; only acknowledge this actor's existing record.
   const existing=state.history.find(x=>x.id===id);
   if(existing)return {state,session:existing,alreadyFinished:true};
   throw Error('meditation-not-active');
  }
  const active=state.active,started=Date.parse(active.startedAt);
  const suppliedEnd=options.endedAt?Date.parse(String(options.endedAt)):nowMs(options);
  if(!Number.isFinite(suppliedEnd)||suppliedEnd>nowMs(options)+300000||
    suppliedEnd<started||suppliedEnd>started+24*3600000)throw Error('meditation-finish-invalid');
  const end=auto?Math.min(suppliedEnd,started+active.goalMinutes*60000):suppliedEnd;
  const seconds=Math.max(0,Math.floor((end-started)/1000));
  state.active=null;
  if(seconds>=60){
   state.history.unshift({id:active.id,startedAt:active.startedAt,
     endedAt:new Date(end).toISOString(),goalMinutes:active.goalMinutes,
     durationSeconds:seconds});
  }
  const saved=await write(actor,state,options);
  return {state:saved,session:saved.history.find(x=>x.id===id)||null,alreadyFinished:false};
 });
}
async function recordReward(actor,id,points,options={}){
 return queue(async()=>{
  const reward=Number(points),state=await read(actor,options);
  if(![.1,.2,.3,.4,.5].includes(reward))return state;
  const row=state.history.find(x=>x.id===String(id||''));
  if(!row||row.rewardPoints>=reward)return state;
  row.rewardPoints=reward;
  return write(actor,state,options);
 });
}
function moscowDay(date){
 const d=new Date(date);if(Number.isNaN(d.getTime()))return '';
 const items=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));
 return items.year+'-'+items.month+'-'+items.day;
}
function stats(state,now=new Date()){
 const history=normalize(state).history;
 const totalSeconds=history.reduce((s,x)=>s+x.durationSeconds,0);
 const today=moscowDay(now);
 const todayRows=history.filter(x=>moscowDay(x.endedAt)===today);
 const dates=new Set(history.map(x=>moscowDay(x.endedAt)));
 let streak=0;let date=new Date(today+'T12:00:00Z');
 if(!dates.has(today))date.setUTCDate(date.getUTCDate()-1);
 for(let i=0;i<500;i++){
  const key=date.toISOString().slice(0,10);
  if(!dates.has(key))break;
  streak++;date.setUTCDate(date.getUTCDate()-1);
 }
 return {sessions:history.length,totalMinutes:Math.round(totalSeconds/60*10)/10,
  todayMinutes:Math.round(todayRows.reduce((s,x)=>s+x.durationSeconds,0)/60*10)/10,
  todaySessions:todayRows.length,streak,averageMinutes:history.length?Math.round(totalSeconds/history.length/60*10)/10:0,
  longestMinutes:history.length?Math.round(Math.max(...history.map(x=>x.durationSeconds))/60*10)/10:0};
}
function publicSummary(state,now=new Date()){return {...stats(state,now),active:normalize(state).active}}
module.exports={NAMESPACE,DURATIONS,normalize,read,write,start,finish,recordReward,stats,publicSummary,moscowDay};
