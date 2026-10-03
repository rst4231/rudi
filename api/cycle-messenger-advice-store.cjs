const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');

const NAMESPACE='rudi-cycle-messenger-advice-v1';
const TTL_SECONDS=60*60*24*365;

function cacheOf(options={}){
  return options.cycleAdviceCache||createStrictRuntimeCache({
    namespace:NAMESPACE,
    ...(options.cacheOptions||{}),
  });
}

function cleanKey(value){
  return String(value||'').trim().replace(/[^a-zA-Z0-9:_-]+/g,'_').slice(0,180);
}

async function claimCycleAdvice(key,options={}){
  const clean=cleanKey(key);
  if(!clean) return false;
  const cache=cacheOf(options);
  const storageKey='shown:'+clean;
  const existing=await cache.get(storageKey).catch(()=>null);
  if(existing?.shown===true) return false;
  await cache.set(storageKey,{
    shown:true,
    key:clean,
    shownAt:new Date(options.now||Date.now()).toISOString(),
  },{
    ttl:TTL_SECONDS,
    tags:['rudi-cycle-messenger-advice'],
    name:storageKey,
  });
  return true;
}

async function releaseCycleAdvice(key,options={}){
  const clean=cleanKey(key);
  if(!clean) return false;
  await cacheOf(options).delete('shown:'+clean).catch(()=>null);
  return true;
}

module.exports={NAMESPACE,TTL_SECONDS,claimCycleAdvice,releaseCycleAdvice};
