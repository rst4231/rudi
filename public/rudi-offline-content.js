/* RUDI v4.262 — durable offline content for Feed, Daily Question and Home Note.
 * Actor-scoped snapshots and idempotent SET outbox; never persist authentication.
 */
(function(root){
'use strict';
const DB='rudi-content-offline-v1', VERSION=1;
const actors=new Set(['Рустам','Диана']);
let actor='', syncing=false, connected=null, lastProbe=0, lastSynced=0;
let flushPromise=null;
const makeId=()=>root.crypto?.randomUUID?.()||('op-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const safe=(value,depth=0)=>{
 if(depth>20)return null;
 if(Array.isArray(value))return value.map(v=>safe(v,depth+1));
 if(value&&typeof value==='object'){
  const result={};
  for(const [key,item] of Object.entries(value))
   if(!/^(initData|backupToken|token|accessToken|refreshToken|authorization|password|secret|credential|cookie)$/i.test(key))
    result[key]=safe(item,depth+1);
  return result;
 }
 return value===null||['number','boolean','string'].includes(typeof value)?value:null;
};
function open(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(Error('indexeddb-unavailable'));return}
  const r=root.indexedDB.open(DB,VERSION);
  r.onupgradeneeded=()=>{
   if(!r.result.objectStoreNames.contains('snapshots'))r.result.createObjectStore('snapshots',{keyPath:'key'});
   if(!r.result.objectStoreNames.contains('outbox'))r.result.createObjectStore('outbox',{keyPath:'id'});
  };
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error||Error('indexeddb-open-failed'));
  r.onblocked=()=>reject(Error('indexeddb-blocked'));
 });
}
async function tx(name,mode,action){
 const db=await open();
 return new Promise((resolve,reject)=>{
  let r;
  try{
   const t=db.transaction(name,mode);
   r=action(t.objectStore(name));
   t.oncomplete=()=>{db.close();resolve(r&&'result' in r?r.result:r)};
   t.onerror=()=>{db.close();reject(t.error||Error('indexeddb-transaction-failed'))};
   t.onabort=()=>{db.close();reject(t.error||Error('indexeddb-transaction-aborted'))};
  }catch(e){db.close();reject(e)}
 });
}
const key=(who,kind)=>who+'|'+kind;
async function cached(kind,who=actor){
 if(!actors.has(who))return null;
 const record=await tx('snapshots','readonly',store=>store.get(key(who,kind)));
 return record?.value?safe(record.value):null;
}
async function capture(kind,value,who=actor){
 if(!actors.has(who)||!value||typeof value!=='object')return false;
 await tx('snapshots','readwrite',store=>store.put({key:key(who,kind),actor:who,value:safe(value),savedAt:Date.now()}));
 return true;
}
async function entries(who=actor){
 if(!actors.has(who))return [];
 const rows=await tx('outbox','readonly',store=>store.getAll());
 return (rows||[]).filter(row=>row.actor===who).sort((a,b)=>a.createdAt-b.createdAt);
}
async function pending(kind,scope='',who=actor){
 return (await entries(who)).filter(row=>row.kind===kind&&(!scope||row.scope===scope));
}
function signal(extra={}){
 if(!actor)return;
 entries(actor).then(rows=>{
  const errors=rows.filter(x=>x.error).length;
  const detail={actor,pending:rows.length,errors,syncing,connected,lastSynced,...extra};
  root.dispatchEvent(new CustomEvent('rudi-content-sync',{detail}));
  const el=root.document?.getElementById('rudiContentSyncStatus');
  if(el){
   const active=root.document.body?.dataset?.appTab;
   el.hidden=!((active==='feed'||active==='home')&&(rows.length||connected===false||syncing||lastSynced));
   el.textContent=syncing?'Синхронизация…':rows.length?'Ожидают синхронизации: '+rows.length+(errors?' · Ошибка синхронизации':''):connected===false?'Офлайн':lastSynced?'Синхронизировано':'';
  }
 }).catch(()=>{});
}
function init(who){
 actor=actors.has(who)?who:'';
 connected=null;
 lastSynced=0;
 signal();
 return actor;
}
function isOffline(){
 return connected===false||root.navigator?.onLine===false||root.document?.body?.dataset?.offlineMode==='1';
}
async function enqueue(kind,scope,data,who=actor){
 if(!actors.has(who)||!['note','note-view','question','feed-reaction'].includes(kind))throw Error('offline-operation-invalid');
 const rows=await entries(who);
 const match=rows.find(row=>row.kind===kind&&row.scope===scope);
 // Coalesce only idempotent SETs, keeping the original server revision.
 if(match&&kind==='question')return match;
 const row=match?{...match,data:safe(data),stamp:makeId(),error:''}:{
  id:makeId(),actor:who,kind,scope,data:safe(data),createdAt:Date.now(),stamp:makeId(),error:''
 };
 if(match&&kind==='note')row.data.expectedUpdatedAt=match.data.expectedUpdatedAt;
 await tx('outbox','readwrite',store=>store.put(row));
 signal();
 return row;
}
async function rebaseNote(expectedUpdatedAt,who=actor){
 if(!actors.has(who)||typeof expectedUpdatedAt!=='string')throw Error('offline-rebase-invalid');
 const row=(await pending('note','home',who))[0];
 if(!row)throw Error('offline-note-missing');
 const revised={...row,data:{...row.data,expectedUpdatedAt},error:'',stamp:makeId()};
 await tx('outbox','readwrite',store=>store.put(revised));
 signal();
 return revised;
}
async function probe(force=false){
 if(!actor||root.document?.visibilityState==='hidden')return false;
 if(!force&&Date.now()-lastProbe<12000&&connected!==null)return connected;
 lastProbe=Date.now();
 try{
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),3500);
  let response;
  try{response=await fetch('/version.json?offline-probe='+lastProbe,{cache:'no-store',credentials:'same-origin',signal:ctl.signal})}
  finally{clearTimeout(timer)}
  const wasDisconnected=connected===false||root.document?.body?.dataset?.offlineMode==='1';
  connected=Boolean(response?.ok&&response.headers?.get?.('X-RUDI-Offline')!=='1');
  if(connected&&wasDisconnected){
   if(root.document?.body)root.document.body.dataset.offlineMode='0';
   root.dispatchEvent(new CustomEvent('rudi-content-network-recovered'));
  }
 }catch(_){connected=false}

 signal();
 return connected;
}
async function send(row){
 let url,body;
 if(row.kind==='note'||row.kind==='note-view'){
  url='/api/home-note';
  body={operation:row.kind==='note'?'save':'set-expanded',...row.data};
 }else if(row.kind==='question'){
  url='/api/partner-message?rudiAction=daily-question';
  body={operation:'answer',...row.data};
 }else{
  url='/api/partner-message?rudiAction=reactions';
  body={operation:'set',...row.data};
 }
 // Auth is taken from the current live session, never from IndexedDB.
 body.initData=String(root.Telegram?.WebApp?.initData||'');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
   credentials:'same-origin',cache:'no-store',body:JSON.stringify(body),signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.ok){
   const error=Error(result?.error||'sync-request-failed');
   error.status=response.status;
   throw error;
  }
  return result;
 }finally{clearTimeout(timer)}
}
async function flush(){
 if(flushPromise)return flushPromise;
 if(!actor)return {sent:0,pending:0};
 const who=actor;
 flushPromise=(async()=>{
  if(!(await probe(true)))return {sent:0,pending:(await entries(who)).length};
  syncing=true;signal();
  let sent=0;
  try{
   for(const row of await entries(who)){
    if(actor!==who||row.error)break; // Permanent conflict requires explicit correction.
    try{
     const result=await send(row);
     // A newer edit made during this request must remain queued.
     const stored=await tx('outbox','readonly',store=>store.get(row.id));
     if(stored?.stamp===row.stamp){
      await tx('outbox','readwrite',store=>store.delete(row.id));
      sent++;
     }else if(stored&&row.kind==='note'&&result.note?.updatedAt){
      stored.data.expectedUpdatedAt=result.note.updatedAt;
      await tx('outbox','readwrite',store=>store.put(stored));
     }
     if(row.kind==='note'&&result.note?.updatedAt){
      const prior=await cached('note',who);
      if(prior?.text===row.data.text)await capture('note',{...prior,updatedAt:result.note.updatedAt},who);
     }
     root.dispatchEvent(new CustomEvent('rudi-content-operation-synced',{detail:{actor:who,kind:row.kind,scope:row.scope,result}}));
    }catch(error){
     const latest=await tx('outbox','readonly',store=>store.get(row.id));
     if(latest?.stamp===row.stamp){
      const blocked=[400,401,403,404,409,422].includes(error.status);
      if(blocked)await tx('outbox','readwrite',store=>store.put({...latest,error:String(error.message||error)}));
     }
     if(!error.status||error.status>=500)connected=false;
     break;
    }
   }
   if(sent)lastSynced=Date.now();
   return {sent,pending:(await entries(who)).length};
  }finally{syncing=false;signal();}
 })().finally(()=>{flushPromise=null});
 return flushPromise;
}
function scheduled(){
 if(!actor||root.document?.visibilityState==='hidden')return;
 const tab=root.document?.body?.dataset?.appTab;
 if(tab==='home'||tab==='feed'){
  const offline=isOffline();
  entries(actor).then(rows=>{
   if(offline||rows.length)flush().catch(()=>{});
   else if(connected===null||Date.now()-lastProbe>15000)probe().catch(()=>{});
  }).catch(()=>{});
 }
}
for(const event of ['online','focus','pageshow','rudi-home-network-recovered'])
 root.addEventListener(event,()=>{if(actor)void flush()});
root.document?.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible')scheduled()});
root.addEventListener('rudi-app-pull-refresh',()=>scheduled());
setInterval(scheduled,15000);
root.rudiOfflineContent={init,actor:()=>actor,cached,capture,enqueue,pending,entries,rebaseNote,flush,probe,isOffline,signal,isSyncing:()=>syncing};
})(window);
