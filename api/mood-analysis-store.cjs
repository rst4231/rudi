const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE='rudi-mood-analysis-v1';
const TTL_SECONDS=60*60*24*35;
const ACTORS=['Рустам','Диана'];

function cleanActor(value){const actor=String(value||'').trim();return ACTORS.includes(actor)?actor:''}
function validDate(value){const text=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:''}
function keyFor(actor,date){const who=cleanActor(actor),day=validDate(date);if(!who)throw new Error('mood-actor-invalid');if(!day)throw new Error('mood-date-invalid');return(who==='Диана'?'diana':'rustam')+':'+day}
function normalizeAnalysis(value,date=''){
  const text=String(value?.text||'').trim().slice(0,6000);
  if(!text)return null;
  const cycle=value?.cycle&&typeof value.cycle==='object'&&!Array.isArray(value.cycle)?{
    phase:String(value.cycle.phase||'').slice(0,80),
    cycleDay:Number.isFinite(Number(value.cycle.cycleDay))?Number(value.cycle.cycleDay):null,
    periodActive:value.cycle.periodActive===true,
    periodDay:Number.isFinite(Number(value.cycle.periodDay))?Number(value.cycle.periodDay):null,
  }:null;
  return{date:validDate(date||value?.date),text,createdAt:String(value?.createdAt||''),model:String(value?.model||'').slice(0,120),historyCount:Math.max(0,Math.round(Number(value?.historyCount)||0)),cycle};
}
function cacheOf(options={}){
  return options.moodAnalysisCache||createStrictRuntimeCache({namespace:NAMESPACE,...(options.cacheOptions||{})});
}
async function readMoodAnalysis(actor,date,options={}){
  return normalizeAnalysis(await cacheOf(options).get(keyFor(actor,date)),date);
}
async function saveMoodAnalysis(actor,date,value,options={}){
  const key=keyFor(actor,date),cache=cacheOf(options),existing=await cache.get(key);
  if(existing&&options.replace!==true)return normalizeAnalysis(existing,date);
  const entry=normalizeAnalysis({...value,date},date);
  if(!entry)throw new Error('mood-analysis-invalid');
  await cache.set(key,entry,{ttl:TTL_SECONDS,tags:['rudi-mood-analysis'],name:key});
  return entry;
}
module.exports={NAMESPACE,TTL_SECONDS,readMoodAnalysis,saveMoodAnalysis,normalizeAnalysis};
