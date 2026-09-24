const CACHE_NAME='rudi-shell-v1.17.4';
const PRECACHE=[
  '/',
  '/manifest.webmanifest',
  '/icon-192-v176.jpg',
  '/icon-512.svg',
  '/icon-maskable.svg'
];

const SYNC_DB='rudi-background-sync-v1';
const SYNC_STORE='outbox';
const SYNC_TAG='rudi-outbox';

function openOutboxDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(SYNC_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(SYNC_STORE)){
        const store=db.createObjectStore(SYNC_STORE,{keyPath:'id'});
        store.createIndex('createdAt','createdAt',{unique:false});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('outbox-open-failed'));
  });
}

async function readOutbox(){
  const db=await openOutboxDb();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(SYNC_STORE,'readonly');
      const request=tx.objectStore(SYNC_STORE).getAll();
      request.onsuccess=()=>resolve((Array.isArray(request.result)?request.result:[]).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0)));
      request.onerror=()=>reject(request.error||new Error('outbox-read-failed'));
    });
  }finally{db.close()}
}

async function deleteOutboxItem(id){
  const db=await openOutboxDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(SYNC_STORE,'readwrite');
      tx.objectStore(SYNC_STORE).delete(id);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('outbox-delete-failed'));
    });
  }finally{db.close()}
}

async function notifyClients(payload){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage(payload));
}

async function flushOutbox(){
  const rows=await readOutbox().catch(()=>[]);
  if(!rows.length) return {sent:0,dropped:0,pending:0};

  let sent=0;
  let dropped=0;
  for(const row of rows){
    try{
      const response=await fetch(row.url,{
        method:row.method||'POST',
        headers:row.headers||{'content-type':'application/json'},
        body:row.body||undefined,
        credentials:'include',
        cache:'no-store'
      });

      if(response.ok){
        await deleteOutboxItem(row.id);
        sent+=1;
        continue;
      }

      const retryable=response.status===401||response.status===403||response.status===408||response.status===425||response.status===429||response.status>=500;
      if(retryable) break;

      await deleteOutboxItem(row.id);
      dropped+=1;
    }catch(_){
      break;
    }
  }

  const pending=(await readOutbox().catch(()=>[])).length;
  if(sent>0||dropped>0) await notifyClients({type:'RUDI_SYNC_COMPLETE',sent,dropped,pending});
  else if(pending>0) await notifyClients({type:'RUDI_SYNC_PENDING',pending});
  return {sent,dropped,pending};
}

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(PRECACHE))
      .catch(()=>undefined)
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('rudi-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response&&response.ok){
            const copy=response.clone();
            caches.open(CACHE_NAME).then(cache=>cache.put('/',copy)).catch(()=>{});
          }
          return response;
        })
        .catch(async()=>{
          return (await caches.match(request)) || (await caches.match('/')) || Response.error();
        })
    );
    return;
  }

  const isStatic=
    request.destination==='script'||
    request.destination==='style'||
    request.destination==='image'||
    request.destination==='font'||
    url.pathname==='/manifest.webmanifest';

  if(!isStatic) return;

  event.respondWith(
    caches.match(request).then(cached=>{
      const network=fetch(request).then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{});
        }
        return response;
      }).catch(()=>cached||Response.error());
      return cached||network;
    })
  );
});

self.addEventListener('sync',event=>{
  if(event.tag===SYNC_TAG) event.waitUntil(flushOutbox());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
  if(event.data?.type==='FLUSH_OUTBOX') event.waitUntil(flushOutbox());
});