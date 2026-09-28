const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE='rudi-mood-analysis-v1';
const TTL_SECONDS=60*60*24*40;

function cacheOf(options={}) {
  return options.moodAnalysisCache || createStrictRuntimeCache({
    namespace:NAMESPACE,
    ...(options.cacheOptions||{}),
  });
}
function keyFor(actor,date){return 'analysis:'+String(actor||'').trim()+':'+String(date||'').trim()}
function normalize(value,actor,date){
  const text=String(value?.text||'').trim().slice(0,6000);
  if(!text)return null;
  const cycle=value?.cycle&&typeof value.cycle==='object'&&!Array.isArray(value.cycle)?{
    phase:String(value.cycle.phase||'').slice(0,80),
    cycleDay:Number.isFinite(Number(value.cycle.cycleDay))?Number(value.cycle.cycleDay):null,
    periodActive:value.cycle.periodActive===true,
    periodDay:Number.isFinite(Number(value.cycle.periodDay))?Number(value.cycle.periodDay):null,
  }:null;
  return{
    actor:String(actor||value?.actor||'').trim(),
    date:String(date||value?.date||'').trim(),
    text,
    createdAt:String(value?.createdAt||''),
    model:String(value?.model||'').slice(0,120),
    historyCount:Math.max(0,Math.round(Number(value?.historyCount)||0)),
    cycle,
  };
}
async function readMoodAnalysisCache(actor,date,options={}){
  return normalize(await cacheOf(options).get(keyFor(actor,date)),actor,date);
}
async function writeMoodAnalysisCache(actor,date,value,options={}){
  const entry=normalize(value,actor,date);
  if(!entry)throw new Error('mood-analysis-invalid');
  await cacheOf(options).set(keyFor(actor,date),entry,{ttl:TTL_SECONDS,tags:['rudi-mood-analysis'],name:keyFor(actor,date)});
  return entry;
}
module.exports={NAMESPACE,TTL_SECONDS,readMoodAnalysisCache,writeMoodAnalysisCache};
