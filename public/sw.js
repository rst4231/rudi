const CACHE_NAME='rudi-shell-v4.45';
const SHELL_CACHE_PREFIX='rudi-shell-';
const NAVIGATION_TIMEOUT_MS=3500;
const STATIC_TIMEOUT_MS=8000;
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
const PUSH_SEEN_DB='rudi-push-seen-v1';
const PUSH_SEEN_STORE='seen';
const PUSH_AUTH_STORE='auth';

function fetchWithTimeout(request,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return fetch(request,{signal:controller.signal}).finally(()=>clearTimeout(timer));
}

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
      .then(cache=>Promise.allSettled(PRECACHE.map(url=>cache.add(url))))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(key=>key.startsWith(SHELL_CACHE_PREFIX)&&key!==CACHE_NAME)
          .map(key=>caches.delete(key))
      ))
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
    event.respondWith((async()=>{
      try{
        const networkRequest=new Request(request,{cache:'no-store'});
        const response=await fetchWithTimeout(networkRequest,NAVIGATION_TIMEOUT_MS);
        if(response&&response.ok){
          const copy=response.clone();
          await caches.open(CACHE_NAME).then(cache=>cache.put('/',copy)).catch(()=>{});
        }
        return response;
      }catch(_){
        const cache=await caches.open(CACHE_NAME);
        return (await cache.match(request)) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  const isStatic=
    request.destination==='script'||
    request.destination==='style'||
    request.destination==='image'||
    request.destination==='font'||
    url.pathname==='/manifest.webmanifest';

  if(!isStatic) return;

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(request);
    if(cached) return cached;

    try{
      const response=await fetchWithTimeout(request,STATIC_TIMEOUT_MS);
      if(response&&response.ok){
        const copy=response.clone();
        cache.put(request,copy).catch(()=>{});
      }
      return response;
    }catch(_){
      return Response.error();
    }
  })());
});

self.addEventListener('sync',event=>{
  if(event.tag===SYNC_TAG) event.waitUntil(flushOutbox());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
  if(event.data?.type==='FLUSH_OUTBOX') event.waitUntil(flushOutbox());
  if(event.data?.type==='RUDI_PUSH_DEVICE_TOKEN'){
    event.waitUntil(savePushDeviceAuth(event.data.token,event.data.endpoint));
  }
});

function openPushSeenDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(PUSH_SEEN_DB,2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(PUSH_SEEN_STORE)){
        db.createObjectStore(PUSH_SEEN_STORE,{keyPath:'id'});
      }
      if(!db.objectStoreNames.contains(PUSH_AUTH_STORE)){
        db.createObjectStore(PUSH_AUTH_STORE,{keyPath:'key'});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('push-seen-open-failed'));
  });
}

async function readPushSeenIds(){
  const db=await openPushSeenDb();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(PUSH_SEEN_STORE,'readonly');
      const request=tx.objectStore(PUSH_SEEN_STORE).getAll();
      request.onsuccess=()=>resolve((Array.isArray(request.result)?request.result:[]).map(row=>String(row?.id||'')).filter(Boolean).slice(-50));
      request.onerror=()=>reject(request.error||new Error('push-seen-read-failed'));
    });
  }finally{db.close()}
}

async function rememberPushSeen(ids){
  const clean=(Array.isArray(ids)?ids:[]).map(String).filter(Boolean);
  if(!clean.length) return;
  const db=await openPushSeenDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(PUSH_SEEN_STORE,'readwrite');
      const store=tx.objectStore(PUSH_SEEN_STORE);
      const now=Date.now();
      clean.forEach(id=>store.put({id,seenAt:now}));
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('push-seen-write-failed'));
    });
  }finally{db.close()}
}


async function savePushDeviceAuth(token,endpoint){
  const cleanToken=String(token||'').trim();
  const cleanEndpoint=String(endpoint||'').trim();
  if(!cleanToken||!cleanEndpoint) return;
  const db=await openPushSeenDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(PUSH_AUTH_STORE,'readwrite');
      tx.objectStore(PUSH_AUTH_STORE).put({key:'device',token:cleanToken,endpoint:cleanEndpoint,updatedAt:Date.now()});
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('push-auth-write-failed'));
    });
  }finally{db.close()}
}

async function readPushDeviceAuth(){
  const db=await openPushSeenDb();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(PUSH_AUTH_STORE,'readonly');
      const request=tx.objectStore(PUSH_AUTH_STORE).get('device');
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error||new Error('push-auth-read-failed'));
    });
  }finally{db.close()}
}

async function deliverPendingPushNotifications(){
  const [seenIds,auth,subscription]=await Promise.all([
    readPushSeenIds().catch(()=>[]),
    readPushDeviceAuth().catch(()=>null),
    self.registration.pushManager.getSubscription().catch(()=>null),
  ]);
  const endpoint=String(subscription?.endpoint||auth?.endpoint||'').trim();
  const deviceToken=String(auth?.token||'').trim();
  if(!endpoint||!deviceToken) return;
  const response=await fetch('/api/partner-message?rudiAction=push-pending',{
    method:'POST',
    credentials:'include',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({seenIds,endpoint,deviceToken}),
    cache:'no-store'
  }).catch(()=>null);
  if(!response?.ok) return;
  const payload=await response.json().catch(()=>null);
  const rows=Array.isArray(payload?.notifications)?payload.notifications:[];
  const shown=[];
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true}).catch(()=>[]);
  for(const row of rows){
    const id=String(row?.id||'');
    if(!id) continue;
    const notificationTag=String(row?.tag||id);
    const notificationUrl=String(row?.url||'/');
    const notificationKind=String(row?.kind||'show');
    if(notificationKind==='dismiss'){
      shown.push(id);
      continue;
    }
    await self.registration.showNotification(String(row?.title||'RUDI'),{
      body:String(row?.body||''),
      tag:notificationTag,
      icon:String(row?.icon||'/icon-192-v176.jpg'),
      badge:String(row?.badge||'/icon-192-v176.jpg'),
      data:{url:notificationUrl,id},
      renotify:false
    });
    for(const client of windows){
      try{client.postMessage({
        type:'RUDI_PUSH_RECEIVED',
        id,
        tag:notificationTag,
        url:notificationUrl
      })}catch(_){}
    }
    shown.push(id);
  }
  await rememberPushSeen(shown).catch(()=>{});
}

async function deliverDirectPushNotification(row){
  const id=String(row?.id||'');
  if(!id) return false;
  const notificationKind=String(row?.kind||'show');
  if(notificationKind==='dismiss'){
    await rememberPushSeen([id]).catch(()=>{});
    return true;
  }
  const notificationTag=String(row?.tag||id);
  const notificationUrl=String(row?.url||'/');
  await self.registration.showNotification(String(row?.title||'RUDI'),{
    body:String(row?.body||''),
    tag:notificationTag,
    icon:String(row?.icon||'/icon-192-v176.jpg'),
    badge:String(row?.badge||'/icon-192-v176.jpg'),
    data:{url:notificationUrl,id},
    renotify:false
  });
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true}).catch(()=>[]);
  for(const client of windows){
    try{client.postMessage({type:'RUDI_PUSH_RECEIVED',id,tag:notificationTag,url:notificationUrl})}catch(_){}
  }
  await rememberPushSeen([id]).catch(()=>{});
  return true;
}

self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let direct=null;
    try{direct=event.data?.json?.()||null}catch(_){}
    if(direct?.rudiPush===1&&direct?.notification?.id){
      await deliverDirectPushNotification(direct.notification);
      return;
    }
    await deliverPendingPushNotifications();
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const rawUrl=String(event.notification?.data?.url||'/');
  event.waitUntil((async()=>{
    const target=new URL(rawUrl,self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin!==self.location.origin) continue;
      try{await client.focus()}catch(_){}
      try{client.postMessage({type:'RUDI_PUSH_NAVIGATE',url:rawUrl})}catch(_){}
      return;
    }
    await self.clients.openWindow(target);
  })());
});
