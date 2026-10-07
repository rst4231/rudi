const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE='rudi-mood-analysis-v4';
const FEEDBACK_NAMESPACE='rudi-mood-feedback-v1';
const TTL_SECONDS=60*60*24*3650;
const FEEDBACK_TTL_SECONDS=60*60*24*3650;
const WINDOWS=[7,30,90];
const DAILY_ANALYSIS_LIMIT=3;
const QUOTA_TTL_SECONDS=60*60*24*45;
let quotaMutationTail=Promise.resolve();

function normalizeWindowDays(value){const days=Number(value);return WINDOWS.includes(days)?days:30}
function cacheOf(options={}){return options.moodAnalysisCache||createStrictRuntimeCache({namespace:NAMESPACE,...(options.cacheOptions||{})})}
function feedbackCacheOf(options={}){return options.moodFeedbackCache||createStrictRuntimeCache({namespace:FEEDBACK_NAMESPACE,...(options.cacheOptions||{})})}
function keyFor(actor,windowDays=30){return 'analysis:'+String(actor||'').trim()+':'+normalizeWindowDays(windowDays)}
function feedbackKey(actor){return 'feedback:'+String(actor||'').trim()}
function quotaKey(actor,date){return 'quota:'+String(actor||'').trim()+':'+String(date||'').trim()}
function moodAnalysisQuotaView(used,date){const count=Math.max(0,Math.min(DAILY_ANALYSIS_LIMIT,Math.floor(Number(used)||0)));return{max:DAILY_ANALYSIS_LIMIT,used:count,available:Math.max(0,DAILY_ANALYSIS_LIMIT-count),date:String(date||'')}}
async function readMoodAnalysisQuota(actor,date,options={}){const state=await cacheOf(options).get(quotaKey(actor,date));return moodAnalysisQuotaView(state?.used,date)}
function enqueueQuotaMutation(task){const run=quotaMutationTail.then(task,task);quotaMutationTail=run.catch(()=>{});return run}
async function recordSuccessfulMoodAnalysis(actor,date,options={}){return enqueueQuotaMutation(async()=>{const cache=cacheOf(options),key=quotaKey(actor,date),current=await cache.get(key),quota=moodAnalysisQuotaView(current?.used,date);if(quota.available<=0){const error=new Error('mood-analysis-daily-limit');error.quota=quota;throw error}const next=moodAnalysisQuotaView(quota.used+1,date);await cache.set(key,{used:next.used,date:String(date||''),updatedAt:new Date(options.now||Date.now()).toISOString()},{ttl:QUOTA_TTL_SECONDS,tags:['rudi-mood-analysis-quota','rudi-durable-state'],name:key});return next})}
function resetMoodAnalysisQuotaQueueForTests(){quotaMutationTail=Promise.resolve()}
function normalize(value,actor,date,windowDays=30){
  const text=String(value?.text||'').trim().slice(0,6000);if(!text)return null;
  const cycle=value?.cycle&&typeof value.cycle==='object'&&!Array.isArray(value.cycle)?{
    phase:String(value.cycle.phase||'').slice(0,80),
    cycleDay:Number.isFinite(Number(value.cycle.cycleDay))?Number(value.cycle.cycleDay):null,
    periodActive:value.cycle.periodActive===true,
    periodDay:Number.isFinite(Number(value.cycle.periodDay))?Number(value.cycle.periodDay):null,
  }:null;
  return{
    actor:String(actor||value?.actor||'').trim(),
    date:String(value?.date||date||'').trim(),
    windowDays:normalizeWindowDays(value?.windowDays||windowDays),
    text,
    level:String(value?.level||'full').slice(0,30),
    createdAt:String(value?.createdAt||''),
    model:String(value?.model||'').slice(0,120),
    historyCount:Math.max(0,Math.round(Number(value?.historyCount)||0)),
    cycle,
  };
}
function readArgs(windowDays,options){
  return windowDays&&typeof windowDays==='object'&&!Array.isArray(windowDays)
    ? {windowDays:30,options:windowDays}
    : {windowDays:normalizeWindowDays(windowDays),options:options||{}};
}
async function readMoodAnalysisCache(actor,date,windowDays=30,options={}){
  const args=readArgs(windowDays,options);
  return normalize(await cacheOf(args.options).get(keyFor(actor,args.windowDays)),actor,date,args.windowDays);
}
function analysisCreatedMs(value){const ms=Date.parse(String(value?.createdAt||''));return Number.isFinite(ms)?ms:0}
async function readLatestMoodAnalysisCache(actor,date,options={}){
  const rows=(await Promise.all(WINDOWS.map(days=>readMoodAnalysisCache(actor,date,days,options).catch(()=>null))))
    .filter(row=>row?.text&&analysisCreatedMs(row)>0)
    .sort((a,b)=>analysisCreatedMs(b)-analysisCreatedMs(a));
  return rows[0]||null;
}
async function writeMoodAnalysisCache(actor,date,windowDays,value,options={}){
  if(windowDays&&typeof windowDays==='object'&&!Array.isArray(windowDays)){options=value||{};value=windowDays;windowDays=30}
  windowDays=normalizeWindowDays(windowDays);
  const entry=normalize(value,actor,date,windowDays);if(!entry)throw new Error('mood-analysis-invalid');
  const key=keyFor(actor,windowDays);
  await cacheOf(options).set(key,entry,{ttl:TTL_SECONDS,tags:['rudi-mood-analysis'],name:key});
  return entry;
}
async function clearMoodAnalysisCache(actor,options={}){
  const cache=cacheOf(options);
  await Promise.allSettled(WINDOWS.map(days=>cache.delete(keyFor(actor,days))));
}
function normalizeFeedback(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const items=(Array.isArray(source.items)?source.items:[])
    .map(row=>({
      analysisCreatedAt:String(row?.analysisCreatedAt||''),
      windowDays:normalizeWindowDays(row?.windowDays),
      value:['up','down'].includes(String(row?.value||''))?String(row.value):'',
      createdAt:String(row?.createdAt||''),
    }))
    .filter(row=>row.analysisCreatedAt&&row.value)
    .slice(-100);
  return{items};
}
async function readMoodFeedback(actor,analysisCreatedAt,windowDays=30,options={}){
  const state=normalizeFeedback(await feedbackCacheOf(options).get(feedbackKey(actor)));
  return state.items.slice().reverse().find(row=>row.analysisCreatedAt===String(analysisCreatedAt||'')&&row.windowDays===normalizeWindowDays(windowDays))||null;
}
async function saveMoodFeedback(actor,payload={},options={}){
  const analysisCreatedAt=String(payload.analysisCreatedAt||''),windowDays=normalizeWindowDays(payload.windowDays),value=String(payload.value||'');
  if(!analysisCreatedAt||!['up','down'].includes(value))throw new Error('mood-feedback-invalid');
  const cache=feedbackCacheOf(options),state=normalizeFeedback(await cache.get(feedbackKey(actor)));
  const items=state.items.filter(row=>!(row.analysisCreatedAt===analysisCreatedAt&&row.windowDays===windowDays));
  const row={analysisCreatedAt,windowDays,value,createdAt:new Date(options.now||Date.now()).toISOString()};
  items.push(row);
  await cache.set(feedbackKey(actor),{items:items.slice(-100)},{ttl:FEEDBACK_TTL_SECONDS,tags:['rudi-mood-feedback','rudi-durable-state'],name:feedbackKey(actor)});
  return row;
}
module.exports={
  NAMESPACE,FEEDBACK_NAMESPACE,TTL_SECONDS,FEEDBACK_TTL_SECONDS,WINDOWS,DAILY_ANALYSIS_LIMIT,normalizeWindowDays,
  readMoodAnalysisCache,readLatestMoodAnalysisCache,
  writeMoodAnalysisCache,clearMoodAnalysisCache,readMoodFeedback,saveMoodFeedback,
  readMoodAnalysisQuota,recordSuccessfulMoodAnalysis,resetMoodAnalysisQuotaQueueForTests,
};
