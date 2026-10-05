const {createD1StateClient}=require('./d1-state-client.cjs');
const {createVercelStateClient}=require('./vercel-state-client.cjs');
const STORAGE_META_NAMESPACE='rudi-system-v1',STORAGE_META_KEY='storage-primary-v2',MODE_CACHE_MS=700;
let cached={phase:'',until:0};
const phase=v=>['ready','dual-write','d1'].includes(String(v||''))?String(v):'d1';
function clearRudiStateModeCache(){cached={phase:'',until:0}}
async function resolveMode(dest,o={}){
  const env=o.env||process.env;if(String(env.RUDI_STORAGE_FORCE_D1||'')==='1')return'd1';if(String(env.RUDI_STORAGE_FORCE_VERCEL||'')==='1')return'ready';
  if(cached.phase&&cached.until>Date.now())return cached.phase;
  let p='d1';try{p=phase((await dest.getRecord(STORAGE_META_NAMESPACE,STORAGE_META_KEY))?.value?.phase)}catch(e){if(o.logModeErrors!==false)console.warn('RUDI_STORAGE_MODE_WARN',String(e?.message||e))}
  cached={phase:p,until:Date.now()+MODE_CACHE_MS};return p;
}
function createRudiStateClient(o={}){
  const source=o.d1Client||createD1StateClient({env:o.env||process.env,fetchImpl:o.fetchImpl||globalThis.fetch,baseUrl:o.d1BaseUrl,secret:o.d1Secret,timeoutMs:o.d1TimeoutMs||o.timeoutMs});
  const dest=o.vercelClient||createVercelStateClient({env:o.env||process.env,...(o.pool?{pool:o.pool}:{}),...(o.connectionString?{connectionString:o.connectionString}:{})});
  const mode=()=>o.mode?Promise.resolve(phase(o.mode)):resolveMode(dest,o);
  return{
    mode,source,destination:dest,
    async getRecord(ns,key){return(await mode())==='ready'?dest.getRecord(ns,key):source.getRecord(ns,key)},
    async setRecord(r){const m=await mode();if(m==='ready')return dest.setRecord(r);const x=await source.setRecord(r);if(m==='dual-write')await dest.setRecord(r);return x},
    async set(ns,key,v,co={}){const m=await mode();if(m==='ready')return dest.set(ns,key,v,co);const x=await source.set(ns,key,v,co);if(m==='dual-write')await dest.set(ns,key,v,co);return x},
    async setIfAbsent(ns,key,v,co={}){const m=await mode();if(m==='ready')return dest.setIfAbsent(ns,key,v,co);const inserted=await source.setIfAbsent(ns,key,v,co);if(inserted&&m==='dual-write')await dest.set(ns,key,v,co);return inserted},
    async remove(ns,key){const m=await mode();if(m==='ready')return dest.remove(ns,key);const x=await source.remove(ns,key);if(m==='dual-write')await dest.remove(ns,key);return x},
    async list(ns){return(await mode())==='ready'?dest.list(ns):source.list(ns)},
    async expireTag(ns,t){const m=await mode();if(m==='ready')return dest.expireTag(ns,t);const x=await source.expireTag(ns,t);if(m==='dual-write')await dest.expireTag(ns,t);return x},
    async health(){const m=await mode();if(m==='ready')return{...(await dest.health()),phase:m,primary:'vercel-postgres'};return{...(await source.health()),phase:m,primary:'cloudflare-d1'}}
  };
}
module.exports={STORAGE_META_NAMESPACE,STORAGE_META_KEY,MODE_CACHE_MS,createRudiStateClient,clearRudiStateModeCache};
