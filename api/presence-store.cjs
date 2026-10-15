'use strict';
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NAMESPACE='rudi-presence-v1';
const ACTIVE_WINDOW_MS=110000;
const RECORD_TTL_SECONDS=90*24*60*60;
const ACTORS=['Рустам','Диана'];
const cacheFor=o=>o.cache||createStrictRuntimeCache({namespace:NAMESPACE,...(o.cacheOptions||{})});
function isActive(record,now=Date.now()){
  const stamp=Number(record?.seenAt||0),elapsed=now-stamp;
  return stamp>0&&elapsed>=0&&elapsed<=ACTIVE_WINDOW_MS;
}
async function heartbeat(actor,options={}){
  if(!ACTORS.includes(actor))throw Error('rudi-access-denied');
  const cache=cacheFor(options),now=Number(options.now||Date.now());
  await cache.set('actor:'+actor,{seenAt:now},{ttl:RECORD_TTL_SECONDS,tags:['rudi-presence']});
  const other=actor==='Рустам'?'Диана':'Рустам';
  const partner=await cache.get('actor:'+other);
  const partnerSeenAt=Number(partner?.seenAt||0);
  const validPartnerSeen=Number.isFinite(partnerSeenAt)&&partnerSeenAt>0&&partnerSeenAt<=now;
  return {
    checkedAt:new Date(now).toISOString(),
    online:{[actor]:true,[other]:isActive(partner,now)},
    lastSeen:{[actor]:new Date(now).toISOString(),[other]:validPartnerSeen?new Date(partnerSeenAt).toISOString():null}
  };
}
module.exports={NAMESPACE,ACTIVE_WINDOW_MS,RECORD_TTL_SECONDS,ACTORS,isActive,heartbeat};
