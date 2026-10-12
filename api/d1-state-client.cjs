const { AsyncLocalStorage } = require('node:async_hooks');
// In-flight reads only: never cache a settled response or share across HTTP requests.
const scopedD1Reads = new AsyncLocalStorage();
const BATCH_SCOPE_KEY = Symbol('rudi-d1-batch-scope');
const MAX_READ_BATCH = 40;
function withD1ReadCoalescing(handler) {
  if(typeof handler!=='function')throw TypeError('rudi-d1-handler-required');
  return function d1ScopedHandler(...args) {
    const invoke=()=>handler(...args);
    return scopedD1Reads.getStore()?invoke():scopedD1Reads.run(new Map(),invoke);
  };
}
const DEFAULT_D1_API_URL='https://rudi-db-api.cpateammail.workers.dev';
const DEFAULT_TIMEOUT_MS=5000;

function cleanText(value){return String(value??'').trim()}
function normalizeTags(tags){
  return [...new Set((Array.isArray(tags)?tags:[]).map(v=>cleanText(v)).filter(Boolean))].slice(0,32);
}
function expiresAtFromOptions(cacheOptions={},now=Date.now()){
  if(cacheOptions.expiresAt)return String(cacheOptions.expiresAt);
  const ttl=Number(cacheOptions.ttl||0);
  if(!Number.isFinite(ttl)||ttl<=0)return null;
  return new Date(now+ttl*1000).toISOString();
}
function createTimeoutSignal(timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return{signal:controller.signal,done:()=>clearTimeout(timer)};
}
function createD1StateClient(options={}){
  const env=options.env||process.env;
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const baseUrl=cleanText(options.baseUrl||env.RUDI_D1_API_URL||DEFAULT_D1_API_URL).replace(/\/+$/,'');
  const secret=cleanText(options.secret||env.RUDI_API_SECRET);
  const timeoutMs=Math.max(500,Number(options.timeoutMs||DEFAULT_TIMEOUT_MS));
  if(typeof fetchImpl!=='function')throw new Error('rudi-d1-fetch-unavailable');

  async function request(path,body,{auth=true,allow404=false,method='POST',retries=0}={}){
    if(auth&&!secret)throw new Error('rudi-d1-secret-missing');
    const maxRetries=Math.max(0,Math.min(2,Number(retries||0)));
    let lastError=null;
    for(let attempt=0;attempt<=maxRetries;attempt+=1){
      const timeout=createTimeoutSignal(timeoutMs);
      try{
        const response=await fetchImpl(baseUrl+path,{
          method,
          headers:{
            accept:'application/json',
            ...(body!==undefined?{'content-type':'application/json'}:{}),
            ...(auth?{authorization:'Bearer '+secret}:{})
          },
          body:body===undefined?undefined:JSON.stringify(body),
          signal:timeout.signal,
          cache:'no-store',
        });
        const text=await response.text();
        let data=null;
        try{data=text?JSON.parse(text):null}catch{data=null}
        if(response.status===404&&allow404)return null;
        if(!response.ok){
          const error=new Error('rudi-d1-'+path.replace(/^\//,'')+'-failed');
          error.status=response.status;
          error.detail=data||text||'';
          throw error;
        }
        return data;
      }catch(error){
        const normalized=error?.name==='AbortError'
          ? Object.assign(new Error('rudi-d1-timeout'),{code:'RUDI_D1_TIMEOUT'})
          : error;
        lastError=normalized;
        const retryable=attempt<maxRetries&&(
          normalized?.code==='RUDI_D1_TIMEOUT'||
          normalized?.name==='TypeError'||
          Number(normalized?.status||0)>=500
        );
        if(!retryable)throw normalized;
        await new Promise(resolve=>setTimeout(resolve,120*(attempt+1)));
      }finally{timeout.done()}
    }
    throw lastError||new Error('rudi-d1-request-failed');
  }


  // Batch only reads initiated during the same HTTP request. No persisted or
  // cross-request cache: changed values remain visible on the next request.
  function readRecordData(namespace,key) {
    const scope=scopedD1Reads.getStore();
    if(!scope||options.batchReads===false||String(env.RUDI_D1_BATCH_READS||'1')==='0')
      return request('/get',{namespace,key},{allow404:true,retries:1});
    let perFetch=scope.get(BATCH_SCOPE_KEY);
    if(!perFetch){perFetch=new Map();scope.set(BATCH_SCOPE_KEY,perFetch);}
    let connections=perFetch.get(fetchImpl);
    if(!connections){connections=new Map();perFetch.set(fetchImpl,connections);}
    const connectionKey=JSON.stringify([baseUrl,secret,timeoutMs]);
    let queue=connections.get(connectionKey);
    if(!queue){queue={jobs:[],scheduled:false};connections.set(connectionKey,queue);}
    return new Promise((resolve,reject)=>{
      queue.jobs.push({namespace,key,resolve,reject});
      if(!queue.scheduled){
        queue.scheduled=true;
        queueMicrotask(()=>flushQueuedReads(queue));
      }
    });
  }

  async function flushQueuedReads(queue){
    const jobs=queue.jobs.splice(0,MAX_READ_BATCH);
    if(queue.jobs.length)queueMicrotask(()=>flushQueuedReads(queue));
    else queue.scheduled=false;
    if(!jobs.length)return;
    // A singleton read is cheaper through the original endpoint.
    if(jobs.length===1){
      const job=jobs[0];
      try{job.resolve(await request('/get',{namespace:job.namespace,key:job.key},{allow404:true,retries:1}));}
      catch(error){job.reject(error);}
      return;
    }
    try{
      const data=await request('/batch-get',{
        keys:jobs.map(({namespace,key})=>({namespace,key}))
      },{allow404:true,retries:1});
      if(data?.ok===true&&Array.isArray(data.items)&&data.items.length===jobs.length){
        for(let i=0;i<jobs.length;i++)jobs[i].resolve(data.items[i]);
        return;
      }
      // Allows deploying the Vercel client independently of the Cloudflare Worker.
      // An older Worker responds 404 and individual reads still work normally.
      await Promise.all(jobs.map(async(job)=>{
        try{job.resolve(await request('/get',{namespace:job.namespace,key:job.key},{allow404:true,retries:1}));}
        catch(error){job.reject(error);}
      }));
    }catch(error){
      // Preserve functionality when the batch endpoint is temporarily unavailable.
      await Promise.all(jobs.map(async(job)=>{
        try{job.resolve(await request('/get',{namespace:job.namespace,key:job.key},{allow404:true,retries:1}));}
        catch(readError){job.reject(readError);}
      }));
    }
  }

  function flightKey(namespace,key){
    return JSON.stringify([baseUrl,secret,timeoutMs,String(namespace||''),String(key||'')]);
  }
  function forgetFlights(namespace,key){
    // Start already-requested reads before issuing a mutation. This keeps
    // pre-write reads from accidentally observing post-write state merely
    // because the batching microtask had not yet run.
    const scoped=scopedD1Reads.getStore();
    const queues=scoped?.get(BATCH_SCOPE_KEY)?.get(fetchImpl);
    if(queues)for(const queue of queues.values()){
      if(queue.jobs.length)void flushQueuedReads(queue);
    }
    const pending=scoped?.get(fetchImpl);
    if(!pending)return;
    if(key===undefined){pending.clear();return;}
    pending.delete(flightKey(namespace,key));
  }
  async function health(){return request('/health',undefined,{auth:false,method:'GET',retries:1})}
  async function getRecord(namespace,key){
    const ns=String(namespace||''),recordKey=String(key||'');
    const read=async()=>{
      const data=await readRecordData(ns,recordKey);
      if(!data||data.ok===false)return null;
      return{
        namespace:ns,key:recordKey,value:data.value,tags:normalizeTags(data.tags),
        expires_at:data.expiresAt?String(data.expiresAt):null,
        updated_at:data.updatedAt?String(data.updatedAt):'',
      };
    };
    const scope=scopedD1Reads.getStore();
    if(!scope)return read();
    let pending=scope.get(fetchImpl);
    if(!pending){pending=new Map();scope.set(fetchImpl,pending);}
    const id=flightKey(ns,recordKey);
    let flight=pending.get(id);
    if(!flight){flight=read();pending.set(id,flight);}
    try{
      const row=await flight;
      // Prevent one consumer from mutating data seen by another caller.
      return row===null?null:structuredClone(row);
    }finally{
      if(pending.get(id)===flight)pending.delete(id);
    }
  }
  async function setRecord(row){
    const namespace=String(row?.namespace||''),key=String(row?.key||'');
    if(!namespace||!key)throw new Error('rudi-d1-key-invalid');
    forgetFlights(namespace,key);
    const data=await request('/set',{
      namespace,key,value:row?.value,
      tags:normalizeTags(row?.tags),
      expiresAt:row?.expires_at?String(row.expires_at):(row?.expiresAt?String(row.expiresAt):null),
      ...(row?.updated_at||row?.updatedAt?{updatedAt:String(row.updated_at||row.updatedAt)}:{}),
    });
    if(data?.ok!==true)throw new Error('rudi-d1-write-unconfirmed');
    return{ok:true,updatedAt:String(data.updatedAt||'')};
  }
  async function set(namespace,key,value,cacheOptions={}){
    return setRecord({
      namespace,key,value,
      tags:normalizeTags(cacheOptions.tags),
      expires_at:expiresAtFromOptions(cacheOptions,Number(cacheOptions.now||Date.now())),
    });
  }
  async function setIfAbsent(namespace,key,value,cacheOptions={}){
    forgetFlights(namespace,key);
    const data=await request('/set-if-absent',{
      namespace:String(namespace||''),key:String(key||''),value,
      tags:normalizeTags(cacheOptions.tags),
      expiresAt:expiresAtFromOptions(cacheOptions,Number(cacheOptions.now||Date.now())),
    });
    // /set-if-absent may acknowledge success through the inserted boolean.
    if(data?.ok===false||typeof data?.inserted!=='boolean')throw new Error('rudi-d1-write-unconfirmed');
    return data.inserted;
  }
  async function remove(namespace,key){
    forgetFlights(namespace,key);
    const data=await request('/delete',{namespace:String(namespace||''),key:String(key||'')});
    if(data?.ok===false||(data?.ok!==true&&!Object.prototype.hasOwnProperty.call(data||{},'deleted')))
      throw new Error('rudi-d1-write-unconfirmed');
    return true;
  }
  async function list(namespace){
    const data=await request('/list',{namespace:String(namespace||'')},{retries:1});
    return (Array.isArray(data?.items)?data.items:[]).map(item=>({
      namespace:String(namespace||''),
      key:String(item?.key||''),
      value:item?.value,
      tags:normalizeTags(item?.tags),
      expires_at:item?.expiresAt?String(item.expiresAt):null,
      updated_at:item?.updatedAt?String(item.updatedAt):'',
    }));
  }
  async function expireTag(namespace,tag){
    forgetFlights(namespace);
    const data=await request('/expire-tag',{namespace:String(namespace||''),tag:String(tag||'')});
    if(data?.ok===false||!Number.isFinite(Number(data?.deleted)))
      throw new Error('rudi-d1-write-unconfirmed');
    return Number(data.deleted||0);
  }
  return{health,getRecord,setRecord,set,setIfAbsent,remove,list,expireTag,baseUrl};
}
function createD1NamespaceStore(namespace,options={}){
  const client=options.client||createD1StateClient(options);
  const ns=String(namespace||'');
  return{
    get:async key=>{
      const row=await client.getRecord(ns,key);
      if(!row)return null;
      if(row.expires_at){
        const at=Date.parse(row.expires_at);
        if(Number.isFinite(at)&&at<=Date.now())return null;
      }
      return row.value??null;
    },
    set:async(key,value,cacheOptions={})=>{await client.set(ns,key,value,cacheOptions);return true;},
    setIfAbsent:(key,value,cacheOptions={})=>client.setIfAbsent(ns,key,value,cacheOptions),
    delete:key=>client.remove(ns,key),
    expireTag:tag=>client.expireTag(ns,tag),
  };
}
module.exports={DEFAULT_D1_API_URL,normalizeTags,expiresAtFromOptions,createD1StateClient,createD1NamespaceStore,withD1ReadCoalescing};
