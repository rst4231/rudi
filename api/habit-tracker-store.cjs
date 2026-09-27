const crypto=require('node:crypto');
const {readAppState,writeAppState}=require('./rudi-auth-db.cjs');

const ACTORS=new Set(['Рустам','Диана']);
const DB_KEY='habits:v1';
const MAX_HABITS=80;
const MAX_DAYS=400;
const tails=new Map();

function cleanActor(value){const actor=String(value||'').trim();if(!ACTORS.has(actor))throw new Error('habits-actor-invalid');return actor}
function cleanText(value,max=80){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function cleanId(value){const id=String(value||'').trim();return /^habit-[A-Za-z0-9-]{8,80}$/.test(id)?id:''}
function cleanDate(value){const date=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:''}
function moscowDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function isoOrEmpty(value){const time=Date.parse(String(value||''));return Number.isFinite(time)?new Date(time).toISOString():''}

function normalizeHabit(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const id=cleanId(value.id),name=cleanText(value.name,80);if(!id||!name)return null;
  return{id,name,emoji:cleanText(value.emoji,8),createdAt:isoOrEmpty(value.createdAt)};
}
function normalizeState(value,actor){
  const who=cleanActor(actor),source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const habits=[];const seen=new Set();
  for(const raw of Array.isArray(source.habits)?source.habits:[]){
    const habit=normalizeHabit(raw);if(!habit||seen.has(habit.id))continue;seen.add(habit.id);habits.push(habit);if(habits.length>=MAX_HABITS)break;
  }
  const validIds=new Set(habits.map(row=>row.id)),completions={};
  const entries=(source.completions&&typeof source.completions==='object'&&!Array.isArray(source.completions)?Object.entries(source.completions):[]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  for(const [rawDate,rawIds] of entries.slice(-MAX_DAYS)){
    const date=cleanDate(rawDate);if(!date)continue;
    const ids=[];for(const rawId of Array.isArray(rawIds)?rawIds:[]){const id=cleanId(rawId);if(id&&validIds.has(id)&&!ids.includes(id))ids.push(id)}
    if(ids.length)completions[date]=ids;
  }
  return{initialized:Boolean(source.initialized),version:Math.max(0,Number(source.version||0)),actor:who,habits,completions,collapsed:Boolean(source.collapsed),updatedAt:isoOrEmpty(source.updatedAt)};
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
function viewHabits(state,options={}){
  const now=Number(options.now||Date.now()),today=moscowDateKey(now),date=resolveHabitDate(options.date,now),completedIds=Array.isArray(state.completions?.[date])?state.completions[date]:[];
  return{habits:state.habits,completedIds,collapsed:state.collapsed,today,date,done:completedIds.length,total:state.habits.length,version:state.version,updatedAt:state.updatedAt};
}
async function addHabit(actor,name,options={}){
  const who=cleanActor(actor),safe=cleanText(name,80);if(!safe)throw new Error('habit-name-required');
  return enqueue(who,async()=>{const state=await readHabits(who,options);if(state.habits.some(row=>row.name.localeCompare(safe,'ru',{sensitivity:'accent'})===0))throw new Error('habit-duplicate');if(state.habits.length>=MAX_HABITS)throw new Error('habit-limit');
    const now=new Date(options.now||Date.now()).toISOString(),habit={id:'habit-'+crypto.randomUUID(),name:safe,emoji:cleanText(options.emoji,8),createdAt:now};
    return writeHabits(who,{...state,version:state.version+1,habits:[...state.habits,habit]},options);
  });
}
async function removeHabit(actor,id,options={}){
  const who=cleanActor(actor),safe=cleanId(id);if(!safe)throw new Error('habit-id-required');
  return enqueue(who,async()=>{const state=await readHabits(who,options);if(!state.habits.some(row=>row.id===safe))throw new Error('habit-not-found');
    const completions={};for(const [date,ids] of Object.entries(state.completions||{})){const next=(ids||[]).filter(value=>value!==safe);if(next.length)completions[date]=next}
    return writeHabits(who,{...state,version:state.version+1,habits:state.habits.filter(row=>row.id!==safe),completions},options);
  });
}
async function toggleHabit(actor,id,options={}){
  const who=cleanActor(actor),safe=cleanId(id);if(!safe)throw new Error('habit-id-required');
  return enqueue(who,async()=>{const state=await readHabits(who,options);if(!state.habits.some(row=>row.id===safe))throw new Error('habit-not-found');
    const date=resolveHabitDate(options.date,options.now||Date.now()),values=new Set(state.completions[date]||[]);if(values.has(safe))values.delete(safe);else values.add(safe);
    const completions={...state.completions};if(values.size)completions[date]=[...values];else delete completions[date];
    return writeHabits(who,{...state,version:state.version+1,completions},options);
  });
}
async function setHabitsCollapsed(actor,collapsed,options={}){
  const who=cleanActor(actor);return enqueue(who,async()=>{const state=await readHabits(who,options);return writeHabits(who,{...state,version:state.version+1,collapsed:Boolean(collapsed)},options)});
}
function resetMutationQueuesForTests(){tails.clear()}

module.exports={ACTORS,DB_KEY,MAX_HABITS,MAX_DAYS,moscowDateKey,resolveHabitDate,normalizeHabit,normalizeState,viewHabits,readHabits,writeHabits,addHabit,removeHabit,toggleHabit,setHabitsCollapsed,resetMutationQueuesForTests};
