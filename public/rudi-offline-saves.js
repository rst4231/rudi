/* RUDI: durable offline saved dates and recipes, scoped to an authenticated actor. */
(function(root){
'use strict';
const NAME='rudi-saves-offline-v1', SNAP='snapshots', OPS='outbox';
const actor=()=>String(root.document?.body?.dataset?.rudiActor||'');
const valid=who=>who==='Рустам'||who==='Диана';
const offline=()=>root.__rudiNetworkReachable===true?false:
  navigator.onLine===false||root.document?.body?.dataset?.offlineMode==='1';
const uuid=()=>root.crypto?.randomUUID?.()||'offline-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const clone=data=>JSON.parse(JSON.stringify(data));
const safe=data=>JSON.parse(JSON.stringify(data,(k,v)=>
  /^(?:initData|backupToken|token|authorization|password|secret|credential|accessToken|refreshToken)$/i.test(k)?undefined:v));
let sender=null,flushRunning=null,lastPull=0;
function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(SNAP))db.createObjectStore(SNAP,{keyPath:'actor'});
      if(!db.objectStoreNames.contains(OPS))db.createObjectStore(OPS,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('saved-offline-db-failed'));
    req.onblocked=()=>reject(Error('saved-offline-db-blocked'));
  });
}
async function tx(name,mode,fn){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    try{
      const t=db.transaction(name,mode),r=fn(t.objectStore(name));
      t.oncomplete=()=>{db.close();resolve(r?.result)};
      t.onerror=()=>{db.close();reject(t.error||Error('saved-offline-tx-error'))};
      t.onabort=()=>{db.close();reject(t.error||Error('saved-offline-tx-aborted'))};
    }catch(error){db.close();reject(error)}
  });
}
const read=who=>tx(SNAP,'readonly',table=>table.get(who));
const write=(who,items)=>tx(SNAP,'readwrite',table=>table.put({actor:who,items:safe(items),at:Date.now()}));
const pending=async who=>(await tx(OPS,'readonly',table=>table.getAll())||[])
  .filter(row=>row.actor===who).sort((a,b)=>a.at-b.at);
async function project(who){
  if(!valid(who))return null;
  const snapshot=await read(who),items=clone(snapshot?.items||[]);
  const rows=await pending(who);
  for(const row of rows){
    if(row.operation==='add'){
      if(!items.find(x=>x.id===row.localId))items.unshift({
        id:row.localId,type:row.payload.type,payload:clone(row.payload.payload),
        savedBy:who,savedAt:new Date(row.at).toISOString(),offlinePending:true
      });
    }else if(row.operation==='remove'){
      const at=items.findIndex(x=>x.id===row.payload.id);
      if(at>=0)items.splice(at,1);
    }
  }
  return {ok:true,actor:who,items,offline:true,pending:rows.length};
}
async function enqueue(who,operation,payload){
  const rows=await pending(who);
  if(operation==='remove'){
    const unsent=rows.find(row=>row.operation==='add'&&row.localId===payload.id);
    if(unsent){
      await tx(OPS,'readwrite',table=>table.delete(unsent.id));
      return {...await project(who),queued:true};
    }
    if(rows.some(row=>row.operation==='remove'&&row.payload.id===payload.id))
      return {...await project(who),queued:true};
  }
  const id=uuid(),row={id,actor:who,operation,payload:safe(payload),
    localId:operation==='add'?'offline-save:'+id:null,at:Date.now(),attempts:0};
  await tx(OPS,'readwrite',table=>table.put(row));
  const value=await project(who);
  return {...value,queued:true,item:row.localId?value.items.find(x=>x.id===row.localId):null};
}
async function flush(){
  if(flushRunning)return flushRunning;
  flushRunning=(async()=>{
    const who=actor();
    if(!valid(who)||offline()||!sender)return {sent:0};
    let sent=0;
    for(const row of await pending(who)){
      if(who!==actor()||offline())break;
      try{
        const response=await sender(row.operation,row.payload);
        if(!response?.ok)break;
        if(Array.isArray(response.items))await write(who,response.items);
        await tx(OPS,'readwrite',table=>table.delete(row.id));
        sent++;
      }catch(_){break}
    }
    if(sent)root.dispatchEvent(new CustomEvent('rudi-saves-synced',{detail:{sent}}));
    return {sent};
  })().finally(()=>{flushRunning=null});
  return flushRunning;
}
async function request(operation,payload={},send){
  const who=actor();
  if(typeof send==='function')sender=send;
  if(!valid(who)){
    if(offline())throw Error('offline-saves-actor-not-selected');
    return send(operation,payload);
  }
  if(operation==='list'){
    if(offline())return project(who);
    try{
      const data=await send(operation,payload);
      if(data?.ok&&Array.isArray(data.items))await write(who,data.items);
      lastPull=Date.now();
      const projected=await project(who);
      if(projected.pending)void flush();
      return {...data,...projected,offline:false};
    }catch(error){
      if(await read(who))return project(who);
      throw error;
    }
  }
  if(offline()||(await pending(who)).length){
    const item=await enqueue(who,operation,payload);
    if(!offline())void flush();
    return item;
  }
  try{
    const data=await send(operation,payload);
    if(data?.ok&&Array.isArray(data.items))await write(who,data.items);
    return data;
  }catch(error){
    if(error?.status&&error.status<500&&!([408,425,429].includes(error.status)))throw error;
    return enqueue(who,operation,payload);
  }
}
async function warm(){
  if(!valid(actor())||!sender||offline()||Date.now()-lastPull<180000)return;
  try{await request('list',{},sender)}catch(_){}
}
function bind(send){
  if(typeof send!=='function')return;
  sender=send;
  setTimeout(()=>void warm().then(flush).catch(()=>{}),1500);
  setTimeout(()=>void warm().then(flush).catch(()=>{}),7000);
}
for(const name of ['online','focus','pageshow','rudi-home-network-recovered','rudi:auth-ready'])
  root.addEventListener(name,()=>void warm().then(flush).catch(()=>{}));
root.document?.addEventListener('visibilitychange',()=>{
  if(root.document.visibilityState==='visible')void warm().then(flush).catch(()=>{});
});
setInterval(()=>{if(root.document?.visibilityState==='visible')
  void warm().then(flush).catch(()=>{})},30000);
root.rudiOfflineSaves={bind,request,project,pending,flush,warm,isOffline:offline};
})(window);