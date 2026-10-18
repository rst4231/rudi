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
  const status=syncing?'Синхронизация…':rows.length?'Ожидают синхронизации: '+rows.length+(errors?' · Ошибка синхронизации':''):connected===false?'Офлайн режим':lastSynced?'Синхронизировано':'';
  for(const [id,area] of [['fastingOfflineSync','fasting'],['meditationOfflineSync','meditation'],['supplementOfflineSync','supplements']]){
   const node=root.document?.getElementById(id);
   if(!node)continue;
   const areaPending=rows.filter(row=>row.kind==='wellness'&&row.data?.area===area);
   const active=areaPending.length||connected===false||syncing||lastSynced;
   node.hidden=!active;
   node.textContent=areaPending.length?(syncing?'Синхронизация…':'Ожидают синхронизации: '+areaPending.length+(areaPending.some(row=>row.error)?' · Ошибка синхронизации':'')):status;
  }
  const el=root.document?.getElementById('rudiContentSyncStatus');
  if(el){
   const active=root.document.body?.dataset?.appTab;
   el.hidden=!((active==='feed'||active==='home'||active==='fasting'||active==='supplements'||root.document.body?.classList?.contains?.('meditation-page-open'))&&(rows.length||connected===false||syncing||lastSynced));
   el.textContent=syncing?'Синхронизация…':rows.length?'Ожидают синхронизации: '+rows.length+(errors?' · Ошибка синхронизации':''):connected===false?'Офлайн режим':lastSynced?'Синхронизировано':'';
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
 // Confirmed fresh server reachability wins over unreliable iOS navigator.onLine.
 if(connected!==null)return !connected;
 return root.navigator?.onLine===false||root.document?.body?.dataset?.offlineMode==='1';
}
async function enqueue(kind,scope,data,who=actor){
 if(!actors.has(who)||!['note','note-view','question','feed-reaction','wellness','lulu'].includes(kind))throw Error('offline-operation-invalid');
 const rows=await entries(who);
 const match=rows.find(row=>row.kind===kind&&row.scope===scope);
 // Coalesce only idempotent SETs, keeping the original server revision.
 if(match&&kind==='question')return match;
 const row=match?{...match,data:safe(data),stamp:makeId(),error:''}:{
  id:kind==='lulu'&&/^[a-z0-9_-]{8,96}$/i.test(String(data?.offlineOperationId||''))?String(data.offlineOperationId):makeId(),
  actor:who,kind,scope,data:safe(data),createdAt:Date.now(),stamp:makeId(),error:''
 };
 if(match&&kind==='note')row.data.expectedUpdatedAt=match.data.expectedUpdatedAt;
 await tx('outbox','readwrite',store=>store.put(row));
 if(kind==='lulu'&&isOffline()){
  if(root.document?.body)root.document.body.dataset.offlineMode='1';
  root.dispatchEvent(new CustomEvent('rudi-offline-snapshot-used',{detail:{updatedAt:Date.now()}}));
 }
 signal();
 return row;
}
async function discard(id,who=actor){
 if(!actors.has(who)||!id)return false;
 const row=await tx('outbox','readonly',store=>store.get(String(id)));
 if(row?.actor!==who||row.kind!=='lulu')return false;
 await tx('outbox','readwrite',store=>store.delete(String(id)));
 signal();
 return true;
}
async function commitWellness(area,operation,payload,snapshotKind,snapshot,who=actor){
 if(!actors.has(who)||!['fasting','meditation','supplements'].includes(area)||!operation||!snapshotKind)
  throw Error('offline-wellness-invalid');
 const id=makeId();
 const row={id,actor:who,kind:'wellness',scope:area+':'+id,createdAt:Date.now(),stamp:makeId(),
  data:safe({area,operation,payload}),error:''};
 const record={key:key(who,snapshotKind),actor:who,value:safe(snapshot),savedAt:Date.now()};
 const db=await open();
 await new Promise((resolve,reject)=>{
  try{
   const t=db.transaction(['outbox','snapshots'],'readwrite');
   t.objectStore('outbox').put(row);
   t.objectStore('snapshots').put(record);
   t.oncomplete=()=>{db.close();resolve()};
   t.onerror=()=>{db.close();reject(t.error||Error('offline-wellness-commit-failed'))};
   t.onabort=()=>{db.close();reject(t.error||Error('offline-wellness-aborted'))};
  }catch(error){db.close();reject(error)}
 });
 signal();
 return row;
}
async function acknowledge(id,stamp){
 const db=await open();
 return new Promise((resolve,reject)=>{
  let acknowledged=false;
  try{
   const tr=db.transaction('outbox','readwrite'),store=tr.objectStore('outbox'),get=store.get(id);
   get.onsuccess=()=>{
    if(get.result?.stamp===stamp){store.delete(id);acknowledged=true}
   };
   tr.oncomplete=()=>{db.close();resolve(acknowledged)};
   tr.onerror=()=>{db.close();reject(tr.error||Error('offline-ack-failed'))};
   tr.onabort=()=>{db.close();reject(tr.error||Error('offline-ack-aborted'))};
  }catch(e){db.close();reject(e)}
 });
}
async function advanceNoteRevision(id,expectedUpdatedAt){
 const db=await open();
 await new Promise((resolve,reject)=>{
  const tr=db.transaction('outbox','readwrite'),store=tr.objectStore('outbox'),get=store.get(id);
  get.onsuccess=()=>{const row=get.result;if(row?.kind==='note')store.put({...row,data:{...row.data,expectedUpdatedAt}})};
  tr.oncomplete=()=>{db.close();resolve()};
  tr.onerror=()=>{db.close();reject(tr.error||Error('offline-note-revision-failed'))};
  tr.onabort=()=>{db.close();reject(tr.error||Error('offline-note-revision-aborted'))};
 });
}
async function rebaseNote(expectedUpdatedAt,who=actor,scope='home'){
 if(!actors.has(who)||typeof expectedUpdatedAt!=='string')throw Error('offline-rebase-invalid');
 const row=(await pending('note',scope,who))[0];
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
  body={operation:row.kind==='note'?(row.data?.deleted?'delete':'save'):'set-expanded',...(row.kind==='note'?{id:row.scope||'home'}:{}),...row.data};
 }else if(row.kind==='question'){
  url='/api/partner-message?rudiAction=daily-question';
  body={operation:'answer',...row.data};
 }else if(row.kind==='lulu'){
  url='/api/partner-message?rudiAction=lulu';
  body={operation:'walk',peed:row.data?.peed===true,pooped:row.data?.pooped===true,
   walkedAt:String(row.data?.walkedAt||''),offlineOperationId:row.id};
 }else if(row.kind==='wellness'){
  const area=String(row.data?.area||'');
  const params={...row.data?.payload};
  if(area==='fasting')url='/api/partner-message?rudiAction=fasting';
  else if(area==='meditation')url='/api/meditation';
  else if(area==='supplements')url='/api/supplements';
  else throw Error('offline-unknown-area');
  body={operation:area==='supplements'?'offline-operation':String(row.data.operation||''),
   ...(area==='supplements'?{offlineCommand:String(row.data.operation||'')}:{}),...params,offlineOperationId:row.id};
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
   const blockedGroups=new Set();
   const group=row=>row.kind==='wellness'?'wellness:'+row.data?.area:
      row.kind==='note'?'note:'+row.scope:row.kind==='note-view'?'note-view':
      row.kind+':'+row.scope;
   for(const row of await entries(who)){
    if(actor!==who)break;
    if(row.error){blockedGroups.add(group(row));continue}
    if(blockedGroups.has(group(row)))continue;
    try{
     const result=await send(row);
     // Check revision and delete atomically, so a concurrent local edit cannot disappear.
     const acked=await acknowledge(row.id,row.stamp);
     const stored=acked?null:await tx('outbox','readonly',store=>store.get(row.id));
     if(acked)sent++;
     else if(stored&&row.kind==='note'&&result.note?.updatedAt){
      await advanceNoteRevision(row.id,result.note.updatedAt);
     }
     if(row.kind==='note'&&result.note?.updatedAt){
      const prior=await cached('note',who);
      if(prior){
       const id=row.data.id||row.scope||'home';
       const notes=Array.isArray(prior.notes)?prior.notes.filter(note=>!(result.note.deleted&&note.id===id)).map(note=>note.id===id&&note.text===row.data.text&&(!('title' in row.data)||note.title===row.data.title)&&(!('pinned' in row.data)||note.pinned===row.data.pinned)?{...note,updatedAt:result.note.updatedAt,history:result.note.history||note.history}:note):prior.notes;
       await capture('note',{...prior,...(id==='home'&&(result.note.deleted||prior.text===row.data.text)?{updatedAt:result.note.updatedAt,...(result.note.deleted?{text:'',deleted:true}:{})}:{}),...(notes?{notes}:{})},who);
      }
     }
     root.dispatchEvent(new CustomEvent('rudi-content-operation-synced',{detail:{actor:who,kind:row.kind,scope:row.scope,area:row.data?.area,operation:row.data?.operation,result}}));
    }catch(error){
     const latest=await tx('outbox','readonly',store=>store.get(row.id));
     if(latest?.stamp===row.stamp){
      const blocked=[400,401,403,404,409,422].includes(error.status);
      if(blocked)await tx('outbox','readwrite',store=>store.put({...latest,error:String(error.message||error)}));
     }
     if(!error.status||error.status>=500){connected=false;break}
     blockedGroups.add(group(row));
     // Conflict is preserved, but other independent sections may still sync.
     continue;
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
 if(['home','feed','fasting','supplements'].includes(tab)||root.document?.body?.classList?.contains?.('meditation-page-open')){
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
root.rudiOfflineContent={init,actor:()=>actor,cached,capture,enqueue,discard,commitWellness,pending,entries,rebaseNote,flush,probe,isOffline,signal,isSyncing:()=>syncing};
})(window);
