const CACHE_NAME='rudi-shell-v4.334';
const SHELL_CACHE_PREFIX='rudi-shell-';
const NAVIGATION_TIMEOUT_MS=3500;
const STATIC_TIMEOUT_MS=8000;
const PRECACHE=[
  "/",
  "/manifest.webmanifest",
  "/icons/wallet-pionex.png",
  "/battle-ocean.svg",
  "/favicon-rudi-v460.png",
  "/apple-touch-icon-rudi-v460.png",
  "/icon-192-rudi-v460.png",
  "/icon-512.svg",
  "/icon-maskable.svg",
  "/home-scene-morning.svg?v=2.104",
  "/home-scene-day.svg?v=2.104",
  "/home-scene-evening.svg?v=2.104",
  "/home-scene-night.svg?v=2.104",
  "/poslanie-background.png?v=1.8.9",
  "/changan-uni-v-header.webp?v=4.334",
  "/task-completion-policy.js?v=4.334",
  "/home-hero-v2104.css?v=4.334",
  "/mood-history-v2101.css?v=4.334",
  "/mood-reason-v2105.css?v=4.334",
  "/finance-cards.css?v=4.334",
  "/crypto-signals.css?v=4.334",
  "/crypto-algorithms.css?v=4.334",
  "/recommendations.css?v=4.334",
  "/finance-wallet-currency.js?v=4.334",
  "/finance-obligation-dates.js?v=4.334",
  "/recommendations.js?v=4.334",
  "/crypto-signals.js?v=4.334",
  "/crypto-live.js?v=4.334",
  "/crypto-algorithms.js?v=4.334",
  "/home-note.css?v=4.334",
  "/home-note.js?v=4.334",
  "/home-offline.js?v=4.334",
  "/rudi-offline-pin.js?v=4.334",
  "/rudi-offline-content.js?v=4.334",
  "/rudi-offline-saves.js?v=4.334",
  "/rudi-offline-transactions.js?v=4.334",
  "/personal-center.css?v=4.334",
  "/personal-center.js?v=4.334",
  "/app.css?v=4.334",
  "/finance-decisions.css?v=4.334",
  "/finance-decisions-core.js?v=4.334",
  "/finance-decisions-ui.js?v=4.334",
  "/finance-bank.css?v=4.334",
  "/rudi-design-system.css?v=4.334",
  "/pwa-extras.css?v=4.334",
  "/calendar.css?v=4.334",
  "/calendar-offline.js?v=4.334",
  "/calendar-entertainment.css?v=4.334",
  "/calendar-entertainment.js?v=4.334",
  "/presence.css?v=4.334",
  "/presence.js?v=4.334",
  "/rudi-interactions.js?v=4.334",
  "/smart-home.css?v=4.334",
  "/car.css?v=4.334",
  "/profile-supplements.css?v=4.334",
  "/supplement-advanced.css?v=4.334",
  "/app.js?v=4.334",
  "/personal-task-editor.js?v=4.334",
  "/personal-task-editor.css?v=4.334",
  "/calendar-day-recap.js?v=4.334",
  "/wallet-brand-icons.js?v=4.334",
  "/finance-bank.js?v=4.334",
  "/crypto-wallets.css?v=4.334",
  "/crypto-wallets.js?v=4.334",
  "/pwa-extras.js?v=4.334",
  "/weather.js?v=4.334",
  "/bill-payment.js?v=4.334",
  "/bill-payment.css?v=4.334",
  "/weather-forecast.js?v=4.334",
  "/weather-forecast.css?v=4.334",
  "/rudi-effects.js?v=4.334",
  "/rudi-effects.css?v=4.334",
  "/meditation.js?v=4.334",
  "/meditation.css?v=4.334",
  "/meditation-audio.js?v=4.334",
  "/meditation-audio.css?v=4.334",
  "/smart-home.js?v=4.334",
  "/car.js?v=4.334",
  "/profile-supplements.js?v=4.334",
  "/mood-history.js?v=4.334",
  "/supplement-editor.js?v=4.334",
  "/supplement-advanced.js?v=4.334",
  "/product-extras.css?v=4.334",
  "/product-extras.js?v=4.334",
  "/finance-nav-icons.js?v=4.334",
  "/finance-nav-icons.css?v=4.334",
  "/rudi-games.js?v=4.334",
  "/rudi-games-extra.js?v=4.334",
  "/rudi-games.css?v=4.334",
  "/home-reference-layout.css?v=4.334",
  "/home-reference-layout.js?v=4.334",
  "/viewport.js?v=4.334",
  "/partner-profile.js?v=4.334",
  "/partner-profile.css?v=4.334",
  "/cbt-content.js?v=4.334",
  "/cbt-core.js?v=4.334",
  "/cbt.js?v=4.334",
  "/cbt.css?v=4.334",
  "/mood-catalog.js?v=4.334",
  "/mood-picker.js?v=4.334",
  "/mood-picker.css?v=4.334"
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
  // Background workers cannot recover a fresh Telegram token or safely
  // infer whether a rejected mutation reached the server.
  // Keep all writes durably until an authenticated foreground app confirms.
  const rows=await readOutbox().catch(()=>[]);
  if(!rows.length)return {sent:0,pending:0};
  await notifyClients({type:'RUDI_OUTBOX_REPLAY_REQUEST',pending:rows.length});
  return {sent:0,pending:rows.length};
}

self.addEventListener('install',event=>{
  // Never activate an incomplete calendar shell; keep the previous working worker.
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const critical=PRECACHE.filter(url=>url==='/'||
      /^\/(?:app\.js|app\.css|task-completion-policy\.js|calendar-offline\.js|cbt-content\.js|cbt-core\.js|cbt\.js|cbt\.css|home-offline\.js|home-note\.js|rudi-offline-pin\.js|rudi-offline-content\.js|rudi-offline-transactions\.js|calendar\.css|pwa-extras\.js)\?/.test(url));
    await Promise.all(critical.map(url=>cache.add(url)));
    await Promise.allSettled(PRECACHE.filter(url=>!critical.includes(url)).map(url=>cache.add(url)));
  })());
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
      let cache=null;
      try{
        cache=await caches.open(CACHE_NAME);
        // Offline first-launch: always serve cached shell immediately.
        const cached=(await cache.match(request))||(await cache.match('/'));
        if(cached){
          event.waitUntil((async()=>{
            try{
              const response=await fetchWithTimeout(new Request(request,{cache:'no-store'}),NAVIGATION_TIMEOUT_MS);
              if(!response?.ok)return;
              const html=await response.clone().text();
              const version=html.match(/<meta name="rudi-version" content="(v[^"]+)"/)?.[1];
              if(version==='v'+CACHE_NAME.slice('rudi-shell-v'.length))
                await cache.put('/',response.clone());
            }catch(_){}
          })());
          return cached;
        }
      }catch(_){}
      try{
        const response=await fetchWithTimeout(new Request(request,{cache:'no-store'}),NAVIGATION_TIMEOUT_MS);
        if(response?.ok&&cache)event.waitUntil(cache.put('/',response.clone()).catch(()=>{}));
        return response;
      }catch(_){
        // Explicit dark fallback; a white blank WebView must never be shown.
        return new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{background:#0b0d12;color:#fff;font:16px system-ui;text-align:center}body{display:grid;place-items:center;min-height:90vh}</style><title>РуДи</title><main><h2>РуДи: офлайн-режим</h2><p>Для первого запуска потребуется один раз открыть приложение с интернетом.</p><button style="font:inherit;padding:12px 22px;border-radius:12px" onclick="location.reload()">Повторить</button></main>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
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
      const freshRequest=/\.(?:js|css)$/.test(url.pathname) ? new Request(request,{cache:'no-store'}) : request;
      const response=await fetchWithTimeout(freshRequest,STATIC_TIMEOUT_MS);
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

// A game-start push does not prove the recipient's turn.
// Only verified client game state may set the installed PWA launcher badge.

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
      icon:String(row?.icon||'/icon-192-rudi-v460.png'),
      badge:String(row?.badge||'/icon-192-rudi-v460.png'),
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
    icon:String(row?.icon||'/icon-192-rudi-v460.png'),
    badge:String(row?.badge||'/icon-192-rudi-v460.png'),
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
  const parsed=new URL(rawUrl,self.location.origin);
  const target=parsed.origin===self.location.origin?parsed.href:self.location.origin+'/';
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin!==self.location.origin)continue;
   try{
    const routed=await client.navigate(target);
    if(routed){await routed.focus();return}
   }catch(_){}
   try{await client.focus()}catch(_){}
   try{client.postMessage({type:'RUDI_PUSH_NAVIGATE',url:target})}catch(_){}
   return;
  }
  await self.clients.openWindow(target);
 })());
});
