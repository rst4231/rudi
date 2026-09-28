const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');

const NAMESPACE='rudi-daily-mood-v1';
const STATE_KEY='state';
const APP_STATE_KEY='mood-journal-v1';
const TTL_SECONDS=60*60*72;
const SNAPSHOT_TTL_SECONDS=60*60*24*3650;
const MAX_SNAPSHOT_DAYS=30;
const MAX_HISTORY_DAYS=30;
const MAX_MOOD_SAMPLES_PER_DAY=48;
const ACTORS=['Рустам','Диана'];
const LEGACY_MOOD_ALIASES=Object.freeze({low:'sadness',ok:'joy',great:'joy',fear:'boredom'});
const ALLOWED_MOODS=new Set(['sadness','boredom','anger','joy','love']);
const MOOD_SCORE=Object.freeze({sadness:-2,anger:-1,boredom:0,joy:1,love:2});

function normalizeMoodValue(value){const mood=String(value||'').trim();return LEGACY_MOOD_ALIASES[mood]||mood}
function validDate(value){const text=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:''}
function moscowDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function shiftDateKey(key,days){const d=new Date(String(key||'')+'T12:00:00Z');if(Number.isNaN(d.getTime()))return'';d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function cutoffKey(now=Date.now()){return shiftDateKey(moscowDateKey(now),-(MAX_HISTORY_DAYS-1))}
function normalizeMoodSample(value){
  const mood=normalizeMoodValue(value?.mood);
  if(!ALLOWED_MOODS.has(mood))return null;
  const parsed=Date.parse(String(value?.updatedAt||value?.createdAt||''));
  return{mood,updatedAt:Number.isFinite(parsed)?new Date(parsed).toISOString():''};
}
function mergeMoodSamples(...groups){
  const map=new Map();
  for(const group of groups){
    for(const raw of Array.isArray(group)?group:[]){
      const sample=normalizeMoodSample(raw);
      if(!sample)continue;
      const key=sample.mood+'|'+sample.updatedAt;
      if(!map.has(key))map.set(key,sample);
    }
  }
  return [...map.values()]
    .sort((a,b)=>(Date.parse(a.updatedAt)||0)-(Date.parse(b.updatedAt)||0))
    .slice(-MAX_MOOD_SAMPLES_PER_DAY);
}
function normalizeMoodEntry(value){
  const latest=normalizeMoodSample(value);
  const samples=mergeMoodSamples(value?.samples,latest?[latest]:[]);
  if(!samples.length)return null;
  const newest=samples[samples.length-1];
  return{mood:newest.mood,updatedAt:newest.updatedAt,samples};
}
function mergeMoodEntries(left,right){
  const a=normalizeMoodEntry(left),b=normalizeMoodEntry(right);
  if(!a)return b;
  if(!b)return a;
  const samples=mergeMoodSamples(a.samples,b.samples);
  return normalizeMoodEntry({mood:samples[samples.length-1]?.mood,updatedAt:samples[samples.length-1]?.updatedAt,samples});
}
function averageMood(samples){
  const normalized=mergeMoodSamples(samples);
  if(!normalized.length)return'';
  const average=normalized.reduce((sum,row)=>sum+Number(MOOD_SCORE[row.mood]||0),0)/normalized.length;
  if(average<=-1.5)return'sadness';
  if(average<=-0.5)return'anger';
  if(average<0.5)return'boredom';
  if(average<1.5)return'joy';
  return'love';
}
function moodCounts(samples){
  const counts={sadness:0,boredom:0,anger:0,joy:0,love:0};
  for(const sample of mergeMoodSamples(samples))counts[sample.mood]=(counts[sample.mood]||0)+1;
  return counts;
}
function historyEntry(date,value){
  const entry=normalizeMoodEntry(value);
  if(!entry)return null;
  return{date,mood:averageMood(entry.samples)||entry.mood,latestMood:entry.mood,updatedAt:entry.updatedAt,sampleCount:entry.samples.length,counts:moodCounts(entry.samples)};
}
function normalizeActorJournal(value,options={}){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const cutoff=cutoffKey(options.now||Date.now()),days={};
  const rawDays=source.days&&typeof source.days==='object'&&!Array.isArray(source.days)?source.days:{};
  for(const key of Object.keys(rawDays).map(validDate).filter(Boolean).sort()){
    if(cutoff&&key<cutoff)continue;
    const entry=normalizeMoodEntry(rawDays[key]);
    if(entry)days[key]=entry;
  }
  return{initialized:Boolean(source.initialized||Object.keys(days).length),version:Number(source.version||0),days};
}
function normalizeRow(row,date){
  const moods=row&&typeof row==='object'&&row.moods&&typeof row.moods==='object'?row.moods:{};
  return{date:String(date||row?.date||''),moods:{'Рустам':normalizeMoodEntry(moods?.['Рустам']),'Диана':normalizeMoodEntry(moods?.['Диана'])}};
}
function normalizeMoodState(value,options={}){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const raw=source.days&&typeof source.days==='object'&&!Array.isArray(source.days)?source.days:{};
  const cutoff=cutoffKey(options.now||Date.now()),days={};
  for(const key of Object.keys(raw).map(validDate).filter(Boolean).sort()){
    if(cutoff&&key<cutoff)continue;
    days[key]=normalizeRow(raw[key],key);
  }
  return{initialized:Boolean(source.initialized||Object.keys(days).length),version:Number(source.version||0),days};
}
function mergeMoodStates(base,overlay,options={}){
  const a=normalizeMoodState(base,options),b=normalizeMoodState(overlay,options),days={...a.days};
  for(const[key,row]of Object.entries(b.days)){
    const current=normalizeRow(days[key],key),incoming=normalizeRow(row,key);
    days[key]={date:key,moods:{
      'Рустам':mergeMoodEntries(current.moods['Рустам'],incoming.moods['Рустам']),
      'Диана':mergeMoodEntries(current.moods['Диана'],incoming.moods['Диана']),
    }};
  }
  return normalizeMoodState({initialized:a.initialized||b.initialized,version:Math.max(a.version,b.version),days},options);
}
function dbOptions(options={}){return{fetchImpl:options.fetchImpl||options.fetch||globalThis.fetch,botToken:options.botToken,env:options.env||process.env,now:options.now||Date.now()}}
function legacyCache(options={}){return options.moodCache||options.cache||createStrictRuntimeCache({namespace:NAMESPACE,...(options.cacheOptions||{})})}
async function readActorJournal(actor,options={}){if(!ACTORS.includes(actor))throw new Error('mood-actor-invalid');return normalizeActorJournal(await readAppState(actor,APP_STATE_KEY,dbOptions(options)),options)}
async function writeActorJournal(actor,value,options={}){if(!ACTORS.includes(actor))throw new Error('mood-actor-invalid');const next=normalizeActorJournal({...value,initialized:true,version:Math.max(Number(value?.version||0),Date.now())},options);await writeAppState(actor,APP_STATE_KEY,next,dbOptions(options));return next}
async function ensureJournals(options={}){
  const journals={};
  await Promise.all(ACTORS.map(async actor=>{journals[actor]=await readActorJournal(actor,options)}));
  const missing=ACTORS.filter(actor=>!journals[actor].initialized);
  if(!missing.length)return journals;
  let legacy=null;
  try{legacy=normalizeMoodState(await legacyCache(options).get(STATE_KEY),options)}catch{}
  for(const actor of missing){
    const days={};
    for(const[key,row]of Object.entries(legacy?.days||{})){
      const entry=normalizeMoodEntry(row?.moods?.[actor]);
      if(entry)days[key]=entry;
    }
    journals[actor]=await writeActorJournal(actor,{initialized:true,version:Number(legacy?.version||0),days},options);
  }
  return journals;
}
function sharedState(journals,options={}){
  const keys=[...new Set(ACTORS.flatMap(actor=>Object.keys(journals?.[actor]?.days||{})))].sort(),days={};
  for(const key of keys)days[key]={date:key,moods:{'Рустам':normalizeMoodEntry(journals?.['Рустам']?.days?.[key]),'Диана':normalizeMoodEntry(journals?.['Диана']?.days?.[key])}};
  return normalizeMoodState({initialized:ACTORS.some(actor=>journals?.[actor]?.initialized),version:Math.max(0,...ACTORS.map(actor=>Number(journals?.[actor]?.version||0))),days},options);
}
async function readDailyMoodState(options={}){return sharedState(await ensureJournals(options),options)}
async function writeDailyMoodState(value,options={}){
  const incoming=normalizeMoodState(value,options),journals=await ensureJournals(options);
  for(const actor of ACTORS){
    const days={...journals[actor].days};
    for(const[key,row]of Object.entries(incoming.days)){
      const entry=normalizeMoodEntry(row?.moods?.[actor]);
      if(entry)days[key]=mergeMoodEntries(days[key],entry);
    }
    journals[actor]=await writeActorJournal(actor,{...journals[actor],days,version:Math.max(journals[actor].version,incoming.version)},options);
  }
  return sharedState(journals,options);
}
async function readDailyMood(date,options={}){
  const journals=await ensureJournals(options),key=String(date||'');
  return normalizeRow({date:key,moods:{'Рустам':journals['Рустам'].days?.[key]||null,'Диана':journals['Диана'].days?.[key]||null}},key);
}
async function setDailyMood(date,actor,mood,options={}){
  const value=normalizeMoodValue(mood);
  if(!ACTORS.includes(actor))throw new Error('mood-actor-invalid');
  if(!ALLOWED_MOODS.has(value))throw new Error('mood-value-invalid');
  const journals=await ensureJournals(options),key=String(date||''),current=normalizeMoodEntry(journals[actor].days?.[key]);
  const sample={mood:value,updatedAt:new Date(options.now||Date.now()).toISOString()};
  const next=normalizeMoodEntry({mood:value,updatedAt:sample.updatedAt,samples:mergeMoodSamples(current?.samples,[sample])});
  journals[actor]=await writeActorJournal(actor,{...journals[actor],days:{...journals[actor].days,[key]:next}},options);
  return normalizeRow({date:key,moods:{'Рустам':journals['Рустам'].days?.[key]||null,'Диана':journals['Диана'].days?.[key]||null}},key);
}
async function restoreDailyMoodState(snapshot,options={}){
  const merged=mergeMoodStates(await readDailyMoodState(options),snapshot,options);
  merged.version=Math.max(Number(merged.version||0),Date.now());
  return writeDailyMoodState(merged,options);
}
async function readMoodHistory(actor,options={}){
  const journals=await ensureJournals(options);
  if(!ACTORS.includes(actor))throw new Error('mood-actor-invalid');
  return Object.entries(journals[actor].days||{}).sort(([a],[b])=>a.localeCompare(b)).map(([date,entry])=>historyEntry(date,entry)).filter(Boolean);
}
function moodView(row,actor){const partner=actor==='Рустам'?'Диана':actor==='Диана'?'Рустам':'';return{date:row.date,actor,partner,mine:row.moods?.[actor]||null,partnerMood:row.moods?.[partner]||null}}

module.exports={NAMESPACE,STATE_KEY,APP_STATE_KEY,TTL_SECONDS,SNAPSHOT_TTL_SECONDS,MAX_SNAPSHOT_DAYS,MAX_HISTORY_DAYS,MAX_MOOD_SAMPLES_PER_DAY,readDailyMood,setDailyMood,moodView,normalizeMoodEntry,normalizeRow,normalizeMoodState,mergeMoodStates,readDailyMoodState,writeDailyMoodState,restoreDailyMoodState,readMoodHistory,averageMood,historyEntry};
