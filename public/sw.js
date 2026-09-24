const CACHE_NAME='rudi-shell-v1.15.0';
const PRECACHE=[
  '/',
  '/manifest.webmanifest',
  '/icon-192-v176.jpg',
  '/icon-512.svg',
  '/icon-maskable.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(PRECACHE))
      .catch(()=>undefined)
  );
  self.skipWaiting();
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

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});