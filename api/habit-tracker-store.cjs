const crypto=require('node:crypto');
const {readAppState,writeAppState}=require('./rudi-auth-db.cjs');

const ACTORS=new Set(['Рустам','Диана']);
const DB_KEY='habits:v1';
const MAX_HABITS=80;
const MAX_DAYS=400;
const BONUS_LIMIT=3;
const SCORING_START_DATE='2026-09-27';
const tails=new Map();

function cleanActor(value){const actor=String(value||'').trim();if(!ACTORS.has(actor))throw new Error('habits-actor-invalid');return actor}
function cleanText(value,max=80){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function cleanId(value){const id=String(value||'').trim();return /^habit-[A-Za-z0-9-]{8,80}$/.test(id)?id:''}
function cleanDate(value){const date=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:''}
function moscowDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function moscowHour(now=Date.now()){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)))}
function isoOrEmpty(value){const time=Date.parse(String(value||''));return Number.isFinite(time)?new Date(time).toISOString():''}
function shiftDateKey(key,days){const date=new Date(String(key||'')+'T12:00:00Z');if(Number.isNaN(date.getTime()))return'';date.setUTCDate(date.getUTCDate()+Number(days||0));return date.toISOString().slice(0,10)}

function normalizeHabit(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const id=cleanId(value.id),name=cleanText(value.name,80);if(!id||!name)return null;
  return{id,name,purpose:cleanText(value.purpose,180),emoji:cleanText(value.emoji,8),createdAt:isoOrEmpty(value.createdAt),archivedAt:isoOrEmpty(value.archivedAt)};
}
function normalizeStatusMap(value,validIds){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},out={};
  for(const [rawDate,rawIds] of Object.entries(source).sort(([a],[b])=>a.localeCompare(b)).slice(-MAX_DAYS)){
    const date=cleanDate(rawDate);if(!date)continue;const ids=[];
    for(const rawId of Array.isArray(rawIds)?rawIds:[]){const id=cleanId(rawId);if(id&&validIds.has(id)&&!ids.includes(id))ids.push(id)}
    if(ids.length)out[date]=ids;
  }
  return out;
}
function normalizeBonusMap(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},out={};
  for(const [rawDate,rawIds] of Object.entries(source).sort(([a],[b])=>a.localeCompare(b)).slice(-MAX_DAYS)){
    const date=cleanDate(rawDate);if(!date)continue;const ids=[];
    for(const rawId of Array.isArray(rawIds)?rawIds:[]){const id=cleanId(rawId);if(id&&!ids.includes(id)&&ids.length<BONUS_LIMIT)ids.push(id)}
    out[date]=ids;
  }
  return out;
}
function normalizeDateFlags(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},out={};
  for(const [rawDate,rawStamp] of Object.entries(source).sort(([a],[b])=>a.localeCompare(b)).slice(-MAX_DAYS)){
    const date=cleanDate(rawDate);if(!date)continue;out[date]=isoOrEmpty(rawStamp)||new Date(0).toISOString();
  }
  return out;
}
function normalizeStatusMeta(value,validIds){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},out={};
  for(const [rawDate,rawMap] of Object.entries(source).sort(([a],[b])=>a.localeCompare(b)).slice(-MAX_DAYS)){
    const date=cleanDate(rawDate);if(!date||!rawMap||typeof rawMap!=='object'||Array.isArray(rawMap))continue;
    const row={};
    for(const [rawId,rawStamp] of Object.entries(rawMap)){
      const id=cleanId(rawId),stamp=isoOrEmpty(rawStamp);
      if(id&&validIds.has(id)&&stamp)row[id]=stamp;
    }
    if(Object.keys(row).length)out[date]=row;
  }
  return out;
}
function habitCreatedByDate(habit,date){
  const stamp=Date.parse(String(habit?.createdAt||''));
  if(!Number.isFinite(stamp))return true;
  return moscowDateKey(stamp)<=date;
}
function habitArchivedByDate(habit,date){
  const stamp=Date.parse(String(habit?.archivedAt||''));
  return Number.isFinite(stamp)&&moscowDateKey(stamp)<=date;
}
function habitActiveByDate(habit,date){return habitCreatedByDate(habit,date)&&!habitArchivedByDate(habit,date)}
function normalizeState(value,actor){
  const who=cleanActor(actor),source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const habits=[],seen=new Set();
  for(const raw of Array.isArray(source.habits)?source.habits:[]){
    const habit=normalizeHabit(raw);if(!habit||seen.has(habit.id))continue;seen.add(habit.id);habits.push(habit);if(habits.length>=MAX_HABITS)break;
  }
  const validIds=new Set(habits.map(row=>row.id));
  const completions=normalizeStatusMap(source.completions,validIds);
  const failures=normalizeStatusMap(source.failures,validIds);
  for(const [date,ids] of Object.entries(completions)){if(!failures[date])continue;failures[date]=failures[date].filter(id=>!ids.includes(id));if(!failures[date].length)delete failures[date]}
  return{
    initialized:Boolean(source.initialized),version:Math.max(0,Number(source.version||0)),actor:who,habits,completions,failures,
    bonusIdsByDate:normalizeBonusMap(source.bonusIdsByDate),
    statusUpdatedAt:normalizeStatusMeta(source.statusUpdatedAt,validIds),
    remindedDates:normalizeDateFlags(source.remindedDates),
    finalizedDates:normalizeDateFlags(source.finalizedDates),
    scoringStartedDate:cleanDate(source.scoringStartedDate)||SCORING_START_DATE,
    collapsed:Boolean(source.collapsed),updatedAt:isoOrEmpty(source.updatedAt)
  };
}
function dbOf(actor,options={}){
  const who=cleanActor(actor);
  if(options.db&&typeof options.db.read==='function'&&typeof options.db.write==='function')return options.db;
  const dbOptions=options.dbOptions||{};
  return{read:()=>readAppState(who,DB_KEY,dbOptions),write:(value)=>writeAppState(who,DB_KEY,value,dbOptions)};
}
function enqueue(actor,task){const who=cleanActor(actor),tail=tails.get(who)||Promise.resolve(),run=tail.then(task,task);tails.set(who,run.catch(()=>{}));return run}
async function readHabits(actor,options={}){const who=cleanActor(actor);return normalizeState(await dbOf(who,options).read(),who)}
async function writeHabits(actor,value,options={}){
  const who=cleanActor(actor),next=normalizeState({...value,initialized:true,actor:who,updatedAt:new Date(options.now||Date.now()).toISOString()},who);
  return normalizeState(await dbOf(who,options).write(next),who);
}
function resolveHabitDate(value,now=Date.now()){
  const today=moscowDateKey(now),date=cleanDate(value)||today;
  if(date>today)throw new Error('habit-date-future');
  return date;
}
function habitStatus(state,date,id){
  if((state.completions?.[date]||[]).includes(id))return'done';
  if((state.failures?.[date]||[]).includes(id))return'notdone';
  return'pending';
}
function habitStreak(state,id,date,today){
  let key=date;
  const selected=habitStatus(state,key,id);
  if(key===today&&selected==='pending')key=shiftDateKey(key,-1);
  else if(selected!=='done')return 0;
  let count=0;
  while(key&&count<MAX_DAYS&&habitStatus(state,key,id)==='done'){count+=1;key=shiftDateKey(key,-1)}
  return count;
}
function viewHabits(state,options={}){
  const now=Number(options.now||Date.now()),today=moscowDateKey(now),date=resolveHabitDate(options.date,now);
  const habits=state.habits.filter(row=>habitActiveByDate(row,date)),archivedHabits=state.habits.filter(row=>Boolean(row.archivedAt));
  const activeIds=new Set(habits.map(row=>row.id));
  const completedIds=(Array.isArray(state.completions?.[date])?state.completions[date]:[]).filter(id=>activeIds.has(id));
  const notDoneIds=(Array.isArray(state.failures?.[date])?state.failures[date]:[]).filter(id=>activeIds.has(id));
  const bonusIds=(Array.isArray(state.bonusIdsByDate?.[date])?state.bonusIdsByDate[date]:[]).filter(id=>activeIds.has(id));
  const statuses={},streaks={};for(const habit of habits){statuses[habit.id]=habitStatus(state,date,habit.id);streaks[habit.id]=habitStreak(state,habit.id,date,today)}
  return{habits,archivedHabits,completedIds,notDoneIds,statuses,streaks,bonusIds,collapsed:state.collapsed,today,date,canCompleteToday:moscowHour(now)>=20,done:completedIds.length,notDone:notDoneIds.length,pending:Math.max(0,habits.length-completedIds.length-notDoneIds.length),total:habits.length,version:state.version,updatedAt:state.updatedAt};
}
async function ensureHabitDay(actor,date,options={}){
  const who=cleanActor(actor);
  return enqueue(who,async()=>{
    const state=await readHabits(who,options),target=resolveHabitDate(date,options.now||Date.now());
    if(Object.prototype.hasOwnProperty.call(state.bonusIdsByDate,target))return state;
    const bonusIds=state.habits.filter(row=>habitActiveByDate(row,target)).slice(0,BONUS_LIMIT).map(row=>row.id);
    return writeHabits(who,{...state,version:state.version+1,scoringStartedDate:state.scoringStartedDate||SCORING_START_DATE,bonusIdsByDate:{...state.bonusIdsByDate,[target]:bonusIds}},options);
  });
}
async function addHabit(actor,name,options={}){
  const who=cleanActor(actor),safe=cleanText(name,80),purpose=cleanText(options.purpose,180);if(!safe)throw new Error('habit-name-required');if(!purpose)throw new Error('habit-purpose-required');
  return enqueue(who,async()=>{
    const state=await readHabits(who,options);
    if(state.habits.some(row=>!row.archivedAt&&row.name.localeCompare(safe,'ru',{sensitivity:'accent'})===0))throw new Error('habit-duplicate');
    if(state.habits.length>=MAX_HABITS)throw new Error('habit-limit');
    const nowMs=options.now||Date.now(),now=new Date(nowMs).toISOString(),habit={id:'habit-'+crypto.randomUUID(),name:safe,purpose,emoji:cleanText(options.emoji,8),createdAt:now};
    const today=moscowDateKey(nowMs),bonusIdsByDate={...state.bonusIdsByDate};
    if(Object.prototype.hasOwnProperty.call(bonusIdsByDate,today)&&bonusIdsByDate[today].length<BONUS_LIMIT)bonusIdsByDate[today]=[...bonusIdsByDate[today],habit.id];
    return writeHabits(who,{...state,version:state.version+1,habits:[...state.habits,habit],bonusIdsByDate},options);
  });
}
async function removeHabit(actor,id,options={}){
  const who=cleanActor(actor),safe=cleanId(id);if(!safe)throw new Error('habit-id-required');
  return enqueue(who,async()=>{
    const state=await readHabits(who,options);if(!state.habits.some(row=>row.id===safe))throw new Error('habit-not-found');
    const completions={},failures={},statusUpdatedAt={};
    for(const [date,ids] of Object.entries(state.completions||{})){const next=(ids||[]).filter(value=>value!==safe);if(next.length)completions[date]=next}
    for(const [date,ids] of Object.entries(state.failures||{})){const next=(ids||[]).filter(value=>value!==safe);if(next.length)failures[date]=next}
    for(const [date,row] of Object.entries(state.statusUpdatedAt||{})){const next={...(row||{})};delete next[safe];if(Object.keys(next).length)statusUpdatedAt[date]=next}
    const habits=state.habits.filter(row=>row.id!==safe),bonusIdsByDate={...state.bonusIdsByDate},today=moscowDateKey(options.now||Date.now());
    if(Object.prototype.hasOwnProperty.call(bonusIdsByDate,today))bonusIdsByDate[today]=habits.filter(row=>habitCreatedByDate(row,today)).slice(0,BONUS_LIMIT).map(row=>row.id);
    return writeHabits(who,{...state,version:state.version+1,habits,completions,failures,statusUpdatedAt,bonusIdsByDate},options);
  });
}
async function archiveHabit(actor,id,options={}){
  const who=cleanActor(actor),safe=cleanId(id);if(!safe)throw new Error('habit-id-required');
  return enqueue(who,async()=>{const state=await readHabits(who,options),index=state.habits.findIndex(row=>row.id===safe);if(index<0)throw new Error('habit-not-found');if(state.habits[index].archivedAt)return state;
    const nowMs=Number(options.now||Date.now()),now=new Date(nowMs).toISOString(),habits=[...state.habits];habits[index]={...habits[index],archivedAt:now};
    const today=moscowDateKey(nowMs),bonusIdsByDate={...state.bonusIdsByDate};if(Object.prototype.hasOwnProperty.call(bonusIdsByDate,today))bonusIdsByDate[today]=habits.filter(row=>habitActiveByDate(row,today)).slice(0,BONUS_LIMIT).map(row=>row.id);
    return writeHabits(who,{...state,version:state.version+1,habits,bonusIdsByDate},options);
  });
}
async function setHabitStatus(actor,id,status,options={}){
  const who=cleanActor(actor),safe=cleanId(id),nextStatus=String(status||'').trim();
  if(!safe)throw new Error('habit-id-required');
  if(!['done','notdone','pending'].includes(nextStatus))throw new Error('habit-status-invalid');
  return enqueue(who,async()=>{
    const state=await readHabits(who,options);if(!state.habits.some(row=>row.id===safe))throw new Error('habit-not-found');
    const now=Number(options.now||Date.now()),date=resolveHabitDate(options.date,now);
    if(nextStatus==='done'&&date===moscowDateKey(now)&&moscowHour(now)<20&&options.allowDoneBefore20!==true)throw new Error('habit-done-too-early');
    const done=new Set(state.completions[date]||[]),failed=new Set(state.failures[date]||[]);
    done.delete(safe);failed.delete(safe);if(nextStatus==='done')done.add(safe);if(nextStatus==='notdone')failed.add(safe);
    const completions={...state.completions},failures={...state.failures},statusUpdatedAt={...state.statusUpdatedAt};
    if(done.size)completions[date]=[...done];else delete completions[date];
    if(failed.size)failures[date]=[...failed];else delete failures[date];
    statusUpdatedAt[date]={...(statusUpdatedAt[date]||{}),[safe]:new Date(now).toISOString()};
    return writeHabits(who,{...state,version:state.version+1,completions,failures,statusUpdatedAt},options);
  });
}
async function setHabitsCollapsed(actor,collapsed,options={}){
  const who=cleanActor(actor);return enqueue(who,async()=>{const state=await readHabits(who,options);return writeHabits(who,{...state,version:state.version+1,collapsed:Boolean(collapsed)},options)});
}
async function markHabitReminderSent(actor,date,options={}){
  const who=cleanActor(actor);return enqueue(who,async()=>{const state=await readHabits(who,options),target=cleanDate(date);if(!target)return state;
    return writeHabits(who,{...state,version:state.version+1,remindedDates:{...state.remindedDates,[target]:new Date(options.now||Date.now()).toISOString()}},options)});
}
async function markHabitDayFinalized(actor,date,options={}){
  const who=cleanActor(actor);return enqueue(who,async()=>{const state=await readHabits(who,options),target=cleanDate(date);if(!target)return state;
    return writeHabits(who,{...state,version:state.version+1,finalizedDates:{...state.finalizedDates,[target]:new Date(options.now||Date.now()).toISOString()}},options)});
}
function resetMutationQueuesForTests(){tails.clear()}

module.exports={
  ACTORS,DB_KEY,MAX_HABITS,MAX_DAYS,BONUS_LIMIT,SCORING_START_DATE,moscowDateKey,moscowHour,shiftDateKey,resolveHabitDate,habitStatus,habitStreak,habitCreatedByDate,habitArchivedByDate,habitActiveByDate,
  normalizeHabit,normalizeState,viewHabits,readHabits,writeHabits,ensureHabitDay,addHabit,removeHabit,archiveHabit,setHabitStatus,
  setHabitsCollapsed,markHabitReminderSent,markHabitDayFinalized,resetMutationQueuesForTests
};
