/* RUDI Home: read-through offline snapshot for the home dashboard only.
 * The durable TickTick outbox and existing PWA mutation outbox remain the
 * owners of writes. No authentication tokens are stored in this database.
 */
(function(root){
  'use strict';
  const DATABASE='rudi-home-offline-v1';
  const STORE='snapshots';
  const BLOCKED=/^(?:initData|backupToken|token|accessToken|refreshToken|authorization|password|secret|credential)$/i;
  const validActor=who=>who==='Рустам'||who==='Диана';
  let lastActor='';
  let current=null;
  let pendingLoad=null;
  const offline=()=>root.__rudiNetworkReachable===true?false:
    navigator.onLine===false||root.document?.body?.dataset?.offlineMode==='1';

  function clean(value,depth=0){
    if(depth>18)return null;
    if(Array.isArray(value))return value.map(item=>clean(item,depth+1));
    if(value&&typeof value==='object'){
      const out={};
      Object.keys(value).forEach(key=>{if(!BLOCKED.test(key))out[key]=clean(value[key],depth+1)});
      return out;
    }
    return value===null||['string','number','boolean'].includes(typeof value)?value:null;
  }

  function open(){
    return new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(Error('home-offline-indexeddb-unavailable'));return}
      const request=root.indexedDB.open(DATABASE,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'actor'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('home-offline-open-failed'));
      request.onblocked=()=>reject(Error('home-offline-db-blocked'));
    });
  }
  async function transaction(mode,fn){
    const db=await open();
    return new Promise((resolve,reject)=>{
      let request;
      try{const tx=db.transaction(STORE,mode);request=fn(tx.objectStore(STORE));
        tx.oncomplete=()=>{db.close();resolve(request?.result??null)};
        tx.onerror=()=>{db.close();reject(tx.error||Error('home-offline-db-failed'))};
        tx.onabort=()=>{db.close();reject(tx.error||Error('home-offline-db-aborted'))};
      }catch(error){db.close();reject(error)}
    });
  }
  function init(actor){
    lastActor=validActor(actor)?actor:'';
    current=null;
    pendingLoad=null;
    return lastActor;
  }
  function snapshot(actor=lastActor){
    if(!validActor(actor))return Promise.resolve(null);
    if(current?.actor===actor)return Promise.resolve(current);
    if(pendingLoad?.actor===actor)return pendingLoad.promise;
    const promise=transaction('readonly',store=>store.get(actor))
      .then(row=>{
        if(!row||!row.home||row.actor!==actor)return null;
        const safe={actor,home:clean(row.home),savedAt:Number(row.savedAt)||0,date:String(row.date||'')};
        current=safe;
        return safe;
      }).finally(()=>{if(pendingLoad?.promise===promise)pendingLoad=null});
    pendingLoad={actor,promise};
    return promise;
  }
  async function save(actor,home,date=''){
    if(!validActor(actor)||!home||typeof home!=='object'||Array.isArray(home))return false;
    const record={actor,home:clean(home),date:String(date||''),savedAt:Date.now()};
    // The database is the source of truth: only report success after tx commits.
    await transaction('readwrite',store=>store.put(record));
    if(lastActor===actor)current=record;
    return true;
  }
  function showCachedStatus(savedAt){
    if(!savedAt||!offline())return;
    root.document.body.dataset.offlineMode='1';
    root.dispatchEvent(new CustomEvent('rudi-offline-snapshot-used',{detail:{updatedAt:savedAt}}));
  }
  root.rudiHomeOffline={init,snapshot,save,isOffline:offline,showCachedStatus};
})(window);
