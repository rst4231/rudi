(() => {
  'use strict';

  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();

  function routeTo(tab,item=''){
    try{
      const url=new URL(window.location.href);
      if(tab&&tab!=='home') url.searchParams.set('tab',tab);
      else url.searchParams.delete('tab');
      if(item&&['wishlist','products','saves','for-di','schedule'].includes(tab)) url.searchParams.set('item',String(item));
      else url.searchParams.delete('item');
      const target=url.pathname+(url.search||'')+(url.hash||'');
      const current=window.location.pathname+window.location.search+window.location.hash;
      if(target!==current) history.pushState({rudiTab:tab||'home',rudiItem:item||''},'',target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }catch(_){}
  }

  function showMiniToast(text){
    let toast=byId('rudiMiniToast');
    if(!toast){
      toast=document.createElement('div');
      toast.id='rudiMiniToast';
      toast.className='rudi-mini-toast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    toast.textContent=String(text||'');
    toast.classList.add('is-open');
    clearTimeout(showMiniToast.timer);
    showMiniToast.timer=setTimeout(()=>toast.classList.remove('is-open'),1800);
  }

  const RUDI_SYNC_DB='rudi-background-sync-v1';
  const RUDI_SYNC_STORE='outbox';
  const RUDI_SYNC_TAG='rudi-outbox';
  const nativeFetch=window.fetch.bind(window);

  const RUDI_SNAPSHOT_DB='rudi-offline-snapshot-v1';
  const RUDI_SNAPSHOT_STORE='responses';
  const RUDI_SNAPSHOT_READ_OPS=new Set(['list','get','status','read','preview']);
  const RUDI_SNAPSHOT_READ_ACTIONS=new Set([
    'app-bootstrap',
    'market-ticker',
    'holidays',
    'holiday-calendar',
    'partner-message-read',
    'cinema-topic-link'
  ]);

  function openSnapshotDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(new Error('snapshot-indexeddb-unavailable'));
      const request=indexedDB.open(RUDI_SNAPSHOT_DB,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(RUDI_SNAPSHOT_STORE)){
          const store=db.createObjectStore(RUDI_SNAPSHOT_STORE,{keyPath:'key'});
          store.createIndex('updatedAt','updatedAt',{unique:false});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('snapshot-open-failed'));
    });
  }

  function offlineSnapshotScope(){
    const telegramId=String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id||'').trim();
    if(telegramId) return 'tg:'+telegramId;
    const actor=String(document.body?.dataset?.rudiActor||'').trim();
    if(actor) return 'actor:'+actor;
    try{
      const cached=JSON.parse(localStorage.getItem('rudi-offline-access-v1')||'null');
      if(cached?.actor) return 'actor:'+String(cached.actor);
    }catch(_){}
    return '';
  }

  function snapshotRequestBody(init={}){
    if(typeof init.body!=='string') return {};
    try{
      const value=JSON.parse(init.body);
      if(!value||typeof value!=='object'||Array.isArray(value)) return {};
      const clean={...value};
      for(const key of ['initData','backupToken','token','password','credential','assertion']){
        if(Object.prototype.hasOwnProperty.call(clean,key)) delete clean[key];
      }
      return clean;
    }catch(_){return {}}
  }

  function snapshotRequestKey(input,init={}){
    const method=String(init.method||((input&&typeof input==='object'&&input.method)||'GET')).toUpperCase();
    let url;
    try{url=new URL(typeof input==='string'?input:input?.url||'',window.location.href)}catch(_){return ''}
    if(url.origin!==window.location.origin||!url.pathname.startsWith('/api/')) return '';

    const action=String(url.searchParams.get('rudiAction')||'').trim().toLowerCase();
    if(['app-auth','browser-auth','passkey'].includes(action)) return '';

    const body=snapshotRequestBody(init);
    const operation=String(body.operation||'').trim().toLowerCase();
    let cacheable=method==='GET';
    if(method==='POST'){
      cacheable=RUDI_SNAPSHOT_READ_ACTIONS.has(action)||RUDI_SNAPSHOT_READ_OPS.has(operation);
      if(url.pathname==='/api/wishlist'&&(!operation||operation==='list')) cacheable=true;
    }
    if(!cacheable) return '';

    const scope=offlineSnapshotScope();
    if(!scope) return '';

    const query=new URLSearchParams();
    [...url.searchParams.entries()]
      .filter(([key])=>!/token|auth|initdata|cachebust|^_$|^t$/i.test(key))
      .sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv))
      .forEach(([key,value])=>query.append(key,value));

    return [
      scope,
      method,
      url.pathname,
      query.toString(),
      JSON.stringify(body,Object.keys(body).sort())
    ].join('|');
  }

  async function readOfflineSnapshot(key){
    if(!key) return null;
    const db=await openSnapshotDb();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(RUDI_SNAPSHOT_STORE,'readonly');
        const request=tx.objectStore(RUDI_SNAPSHOT_STORE).get(key);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error||new Error('snapshot-read-failed'));
      });
    }finally{db.close()}
  }

  async function writeOfflineSnapshot(key,response){
    if(!key||!response?.ok) return false;
    const clone=response.clone();
    const type=String(clone.headers.get('content-type')||'').toLowerCase();
    if(type&&!type.includes('json')) return false;
    const payload=await clone.json().catch(()=>null);
    if(payload===null) return false;

    const db=await openSnapshotDb();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(RUDI_SNAPSHOT_STORE,'readwrite');
        tx.objectStore(RUDI_SNAPSHOT_STORE).put({
          key,
          payload,
          updatedAt:Date.now()
        });
        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>reject(tx.error||new Error('snapshot-write-failed'));
      });
      return true;
    }finally{db.close()}
  }

  function offlineSnapshotResponse(row){
    if(!row) return null;
    document.body.dataset.offlineMode='1';
    window.dispatchEvent(new CustomEvent('rudi-offline-snapshot-used',{
      detail:{updatedAt:Number(row.updatedAt||0)}
    }));
    return new Response(JSON.stringify(row.payload),{
      status:200,
      headers:{
        'Content-Type':'application/json; charset=utf-8',
        'X-RUDI-Offline':'1',
        'X-RUDI-Snapshot-At':String(row.updatedAt||'')
      }
    });
  }

  async function snapshotFallback(key){
    if(!key) return null;
    try{return offlineSnapshotResponse(await readOfflineSnapshot(key))}
    catch(_){return null}
  }

  function openOutboxDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)) return reject(new Error('indexeddb-unavailable'));
      const request=indexedDB.open(RUDI_SYNC_DB,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(RUDI_SYNC_STORE)){
          const store=db.createObjectStore(RUDI_SYNC_STORE,{keyPath:'id'});
          store.createIndex('createdAt','createdAt',{unique:false});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('indexeddb-open-failed'));
    });
  }

  function readRequestBody(init={}){
    if(typeof init.body!=='string') return null;
    try{return JSON.parse(init.body)}catch(_){return null}
  }

  function queueableMutation(input,init={}){
    const method=String(init.method||((input&&typeof input==='object'&&input.method)||'GET')).toUpperCase();
    if(method!=='POST') return null;
    let url;
    try{url=new URL(typeof input==='string'?input:input?.url||'',window.location.href)}catch(_){return null}
    if(url.origin!==window.location.origin) return null;
    const body=readRequestBody(init);
    if(!body||typeof body!=='object') return null;

    const action=String(url.searchParams.get('rudiAction')||'');
    const operation=String(body.operation||'').trim().toLowerCase();
    const readOps=new Set(['list','get','status','read','preview']);

    let queue=false;
    if(url.pathname==='/api/wishlist') queue=!readOps.has(operation||'list');
    else if(url.pathname==='/api/partner-message'&&!action) queue=Boolean(String(body.text||'').trim());
    else if(action==='products'||action==='saves'||action==='for-di-feed'||action==='reactions'||action==='mood'||action==='lulu'||action==='cycle'||action==='ui-preferences'){
      queue=!readOps.has(operation||'get');
    }
    if(!queue) return null;

    const headers={};
    try{
      new Headers(init.headers||{}).forEach((value,key)=>{headers[key]=value});
    }catch(_){}
    if(!headers['content-type']) headers['content-type']='application/json';

    const queuedBody={...body};
    if(Object.prototype.hasOwnProperty.call(queuedBody,'initData')) queuedBody.initData='';
    return {
      url:url.pathname+url.search,
      method,
      headers,
      body:JSON.stringify(queuedBody),
      credentials:'include'
    };
  }

  async function enqueueOfflineMutation(descriptor){
    const db=await openOutboxDb();
    const row={
      id:(window.crypto?.randomUUID?.()||('sync-'+Date.now()+'-'+Math.random().toString(36).slice(2))),
      ...descriptor,
      createdAt:Date.now()
    };
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(RUDI_SYNC_STORE,'readwrite');
      tx.objectStore(RUDI_SYNC_STORE).put(row);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('outbox-write-failed'));
    });
    db.close();
    return row;
  }

  async function requestOutboxFlush(){
    if(!('serviceWorker' in navigator)) return false;
    try{
      const registration=await navigator.serviceWorker.ready;
      if(registration.sync?.register){
        await registration.sync.register(RUDI_SYNC_TAG);
        return true;
      }
      registration.active?.postMessage({type:'FLUSH_OUTBOX'});
      return true;
    }catch(_){return false}
  }

  function installBackgroundSync(){
    if(window.__rudiBackgroundSyncInstalled==='1') return;
    window.__rudiBackgroundSyncInstalled='1';

    window.fetch=async(input,init={})=>{
      const queued=queueableMutation(input,init);
      const snapshotKey=snapshotRequestKey(input,init);
      const queueAndThrow=async(message)=>{
        await enqueueOfflineMutation(queued);
        await requestOutboxFlush();
        showMiniToast(message);
        const error=new TypeError('Действие отправится после подключения');
        error.rudiQueued=true;
        throw error;
      };

      if(queued&&navigator.onLine===false){
        return queueAndThrow('Нет сети · действие отправится позже');
      }

      if(snapshotKey&&navigator.onLine===false){
        const cached=await snapshotFallback(snapshotKey);
        if(cached) return cached;
      }

      try{
        const response=await nativeFetch(input,init);
        if(snapshotKey&&response?.ok){
          writeOfflineSnapshot(snapshotKey,response).catch(()=>{});
        }
        return response;
      }catch(error){
        const aborted=Boolean(init?.signal?.aborted)||String(error?.name||'')==='AbortError';
        const networkFailure=
          String(error?.name||'')==='TypeError'
          || String(error?.name||'')==='AbortError'
          || /network|fetch|load failed|aborted|timeout/i.test(String(error?.message||''));
        if(queued&&!aborted&&networkFailure){
          return queueAndThrow('Сеть нестабильна · действие отправится позже');
        }
        if(snapshotKey&&networkFailure){
          const cached=await snapshotFallback(snapshotKey);
          if(cached) return cached;
        }
        throw error;
      }
    };

    window.addEventListener('online',()=>{
      requestOutboxFlush();
    });

    navigator.serviceWorker?.addEventListener?.('message',event=>{
      const data=event.data||{};
      if(data.type==='RUDI_SYNC_COMPLETE'&&Number(data.sent||0)>0){
        showMiniToast('Изменения синхронизированы');
        window.dispatchEvent(new CustomEvent('rudi-background-sync-complete',{detail:data}));
      }else if(data.type==='RUDI_SYNC_PENDING'){
        showMiniToast('Жду сеть для синхронизации');
      }
    });
  }

  function installServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    const hadController=Boolean(navigator.serviceWorker.controller);
    let reloadScheduled=false;
    let pendingRegistration=null;
    let updateTimer=0;

    const editingNow=()=>{
      const active=document.activeElement;
      return Boolean(
        document.body.classList.contains('keyboard-editing')
        || active?.matches?.('input,textarea,select,[contenteditable="true"]')
      );
    };

    const activateWhenSafe=registration=>{
      if(!registration?.waiting) return;
      pendingRegistration=registration;
      clearTimeout(updateTimer);
      if(editingNow()){
        updateTimer=setTimeout(()=>activateWhenSafe(registration),1200);
        return;
      }
      pendingRegistration=null;
      try{
        sessionStorage.setItem('rudi:sw-refresh-pending','1');
      }catch(_){}
      registration.waiting.postMessage({type:'SKIP_WAITING'});
    };

    const watchRegistration=registration=>{
      if(registration.waiting&&navigator.serviceWorker.controller){
        activateWhenSafe(registration);
      }
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        if(!worker) return;
        worker.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){
            activateWhenSafe(registration);
          }
        });
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloadScheduled||!hadController) return;
      reloadScheduled=true;
      try{sessionStorage.setItem('rudi:sw-updated','1')}catch(_){}
      window.location.reload();
    });

    window.addEventListener('focusout',()=>{
      if(pendingRegistration) setTimeout(()=>activateWhenSafe(pendingRegistration),80);
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&pendingRegistration){
        activateWhenSafe(pendingRegistration);
      }
    });

    try{
      if(sessionStorage.getItem('rudi:sw-updated')==='1'){
        sessionStorage.removeItem('rudi:sw-updated');
        sessionStorage.removeItem('rudi:sw-refresh-pending');
        setTimeout(()=>showMiniToast('RUDI обновлён'),250);
      }
    }catch(_){}

    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('/sw.js',{scope:'/'})
        .then(registration=>{
          watchRegistration(registration);
          registration.update().catch(()=>{});
          window.addEventListener('online',()=>registration.update().catch(()=>{}));
          document.addEventListener('visibilitychange',()=>{
            if(document.visibilityState==='visible') registration.update().catch(()=>{});
          });
        })
        .catch(error=>{
          console.warn('RUDI_SW_REGISTER_WARN',String(error?.message||error));
        });
    },{once:true});
  }

  function installConnectivityBanner(){
    let banner=byId('rudiOfflineBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='rudiOfflineBanner';
      banner.className='rudi-offline-banner';
      banner.setAttribute('role','status');
      banner.setAttribute('aria-live','polite');
      banner.textContent='Нет сети · RUDI работает из сохранённых данных';
      banner.hidden=true;
      document.body.appendChild(banner);
    }
    const sync=()=>{
      const offline=navigator.onLine===false;
      banner.hidden=!offline;
      document.body.classList.toggle('rudi-offline',offline);
      if(!offline){
        document.body.dataset.offlineMode='0';
        banner.textContent='Нет сети · RUDI работает из сохранённых данных';
      }
    };
    window.addEventListener('rudi-offline-snapshot-used',event=>{
      const updatedAt=Number(event.detail?.updatedAt||0);
      if(!updatedAt) return;
      const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(updatedAt));
      banner.hidden=false;
      document.body.classList.add('rudi-offline');
      document.body.dataset.offlineMode='1';
      banner.textContent='Связь с RUDI нестабильна · показаны данные на '+time;
    });
    window.addEventListener('online',sync);
    window.addEventListener('offline',sync);
    sync();
  }

  async function syncAppBadge(){
    if(!('setAppBadge' in navigator)||!('clearAppBadge' in navigator)) return;
    const unread=[
      byId('homeActivityNotificationDot'),
      byId('feedTabBadge')
    ].filter(node=>node&&!node.hidden).length;
    try{
      if(unread>0) await navigator.setAppBadge(unread);
      else await navigator.clearAppBadge();
    }catch(_){}
  }

  function installBadgeSync(){
    const observer=new MutationObserver(()=>syncAppBadge());
    const bind=()=>{
      ['homeActivityNotificationDot','feedTabBadge'].forEach(id=>{
        const node=byId(id);
        if(node&&!node.dataset.badgeObserved){
          node.dataset.badgeObserved='1';
          observer.observe(node,{attributes:true,attributeFilter:['hidden','class']});
        }
      });
      syncAppBadge();
    };
    bind();
    const rootObserver=new MutationObserver(bind);
    rootObserver.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') syncAppBadge()});
  }

  function collectSearchEntries(){
    const entries=[];
    const seen=new Set();
    const add=(entry)=>{
      const title=String(entry.title||'').trim();
      const text=String(entry.text||'').replace(/\s+/g,' ').trim();
      if(!title&&!text) return;
      const key=[entry.tab,entry.item,title,text.slice(0,120)].join('|');
      if(seen.has(key)) return;
      seen.add(key);
      entries.push({...entry,title,text,haystack:normalize(title+' '+text)});
    };

    document.querySelectorAll('.product-item').forEach(node=>{
      add({tab:'products',item:node.dataset.rudiItemId||'',kind:'Кухня',title:node.querySelector('.product-text')?.textContent||'',text:node.querySelector('.product-weekly-amount')?.textContent||'',node});
    });
    document.querySelectorAll('.wish-item').forEach(node=>{
      add({tab:'wishlist',item:node.dataset.rudiItemId||'',kind:'Вишлист',title:node.querySelector('.wish-text')?.textContent||'',text:node.getAttribute('aria-label')||'',node});
    });
    document.querySelectorAll('.feed-card').forEach(node=>{
      add({tab:'feed',kind:'Лента',title:node.querySelector('.feed-card-heading > span')?.textContent||'Лента',text:node.querySelector('.feed-card-body')?.textContent||'',node});
    });
    document.querySelectorAll('.shared-album-photo img').forEach(node=>{
      add({tab:'photos',kind:'Фото',title:String(node.alt||'Фото'),text:node.closest('.shared-album-photo')?.getAttribute('aria-label')||'',node:node.closest('.shared-album-photo')});
    });
    document.querySelectorAll('.calendar-day-cell').forEach(node=>{
      add({tab:'schedule',kind:'Календарь',title:node.getAttribute('aria-label')||node.title||'Дата',text:node.title||'',node});
    });
    document.querySelectorAll('.saved-item').forEach(node=>{
      add({
        tab:'saves',
        kind:node.classList.contains('saved-date-item')?'Свидание':'Рецепт',
        title:node.querySelector('.saved-item-head > strong')?.textContent||'Сохранение',
        text:node.textContent||'',
        node
      });
    });
    document.querySelectorAll('[data-home-tile]').forEach(node=>{
      const title=node.querySelector('h1,h2,.section-heading h2,.home-dashboard-label,.partner-title,.home-nearest-title')?.textContent||node.getAttribute('aria-label')||'';
      if(title) add({tab:'home',kind:'Главная',title,text:node.textContent||'',node});
    });
    return entries;
  }

  function ensureSearchOverlay(){
    let overlay=byId('rudiSearchOverlay');
    if(overlay) return overlay;
    overlay=document.createElement('div');
    overlay.id='rudiSearchOverlay';
    overlay.className='rudi-search-overlay';
    overlay.hidden=true;
    overlay.innerHTML=
      '<button class="rudi-overlay-backdrop" type="button" aria-label="Закрыть поиск"></button>'+
      '<section class="rudi-search-dialog" role="dialog" aria-modal="true" aria-label="Поиск по RUDI">'+
        '<div class="rudi-search-head">'+
          '<div class="rudi-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input id="rudiSearchInput" type="search" autocomplete="off" placeholder="Поиск по RUDI…" aria-label="Поиск по RUDI"></div>'+
          '<button id="rudiSearchClose" class="rudi-search-close" type="button" aria-label="Закрыть">×</button>'+
        '</div>'+
        '<div id="rudiSearchHint" class="rudi-search-hint">Ищет по всей базе RUDI</div>'+
        '<div id="rudiSearchResults" class="rudi-search-results"></div>'+
      '</section>';
    document.body.appendChild(overlay);

    let searchTimer=0;
    let searchSequence=0;
    let searchController=null;

    const close=()=>{
      clearTimeout(searchTimer);
      searchController?.abort?.();
      overlay.classList.remove('is-open');
      setTimeout(()=>{if(!overlay.classList.contains('is-open')) overlay.hidden=true},180);
      document.body.classList.remove('rudi-modal-open');
    };
    const open=()=>{
      overlay.hidden=false;
      document.body.classList.add('rudi-modal-open');
      requestAnimationFrame(()=>overlay.classList.add('is-open'));
      const input=byId('rudiSearchInput');
      input.value='';
      renderSearch('');
      setTimeout(()=>input.focus({preventScroll:true}),60);
    };
    overlay.openSearch=open;
    overlay.closeSearch=close;
    overlay.querySelector('.rudi-overlay-backdrop')?.addEventListener('click',close);
    byId('rudiSearchClose')?.addEventListener('click',close);
    byId('rudiSearchInput')?.addEventListener('input',event=>renderSearch(event.target.value));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!overlay.hidden) close();
      if((event.metaKey||event.ctrlKey)&&String(event.key).toLowerCase()==='k'){
        event.preventDefault();
        open();
      }
    });

    function resultKey(entry){
      return [entry.tab,entry.item,entry.kind,entry.title,entry.text].map(value=>String(value||'')).join('|');
    }

    function paintResults(entries,{emptyText='Ничего не найдено'}={}){
      const host=byId('rudiSearchResults');
      if(!host) return;
      host.replaceChildren();
      if(!entries.length){
        const empty=document.createElement('div');
        empty.className='rudi-search-empty';
        empty.textContent=emptyText;
        host.appendChild(empty);
        return;
      }
      entries.slice(0,30).forEach(entry=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='rudi-search-result';
        button.innerHTML='<span class="rudi-search-kind">'+esc(entry.kind||'RUDI')+'</span><strong>'+esc(entry.title||entry.kind||'Результат')+'</strong>'+(entry.text&&entry.text!==entry.title?'<small>'+esc(String(entry.text).slice(0,170))+'</small>':'');
        button.addEventListener('click',()=>{
          const node=entry.node;
          close();
          routeTo(entry.tab||'home',entry.item||'');
          setTimeout(()=>{
            if(node?.isConnected){
              node.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
              node.classList.add('rudi-search-target');
              setTimeout(()=>node.classList.remove('rudi-search-target'),1400);
            }
          },300);
        });
        host.appendChild(button);
      });
    }

    async function remoteSearch(query,sequence,localEntries){
      searchController?.abort?.();
      searchController=new AbortController();
      const hint=byId('rudiSearchHint');
      if(hint){
        hint.hidden=false;
        hint.textContent='Ищу по всей базе…';
      }
      try{
        const response=await fetch('/api/partner-message?rudiAction=search',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            initData:window.Telegram?.WebApp?.initData||'',
            backupToken:window.RUDI_STATE_BACKUP?.getToken?.()||'',
            query
          }),
          cache:'no-store',
          signal:searchController.signal
        });
        const data=await response.json().catch(()=>({}));
        if(sequence!==searchSequence) return;
        const remote=response.ok&&data.ok&&Array.isArray(data.results)?data.results:[];
        const merged=[];
        const seen=new Set();
        for(const entry of [...remote,...localEntries]){
          const key=resultKey(entry);
          if(seen.has(key)) continue;
          seen.add(key);
          merged.push(entry);
        }
        paintResults(merged);
      }catch(error){
        if(String(error?.name||'')!=='AbortError'&&sequence===searchSequence){
          paintResults(localEntries);
        }
      }finally{
        if(sequence===searchSequence&&hint){
          hint.hidden=true;
          hint.textContent='Ищет по всей базе RUDI';
        }
      }
    }

    function renderSearch(value){
      const hint=byId('rudiSearchHint');
      const query=normalize(value);
      clearTimeout(searchTimer);
      searchController?.abort?.();
      searchSequence+=1;
      const sequence=searchSequence;

      if(!query){
        paintResults([],{emptyText:''});
        const empty=byId('rudiSearchResults')?.querySelector('.rudi-search-empty');
        empty?.remove();
        if(hint){
          hint.hidden=false;
          hint.textContent='Ищет по всей базе RUDI';
        }
        return;
      }

      const terms=query.split(' ').filter(Boolean);
      const localEntries=collectSearchEntries()
        .filter(entry=>terms.every(term=>entry.haystack.includes(term)))
        .slice(0,18);
      paintResults(localEntries,{emptyText:query.length<2?'Введите ещё один символ':'Ищу…'});

      if(query.length<2){
        if(hint) hint.hidden=true;
        return;
      }

      searchTimer=setTimeout(()=>remoteSearch(query,sequence,localEntries),180);
    }
    return overlay;
  }

  function installSearchButton(){
    const tools=document.querySelector('.home-dashboard-tools');
    if(!tools||byId('rudiSearchButton')) return false;
    const button=document.createElement('button');
    button.id='rudiSearchButton';
    button.className='rudi-search-button';
    button.type='button';
    button.setAttribute('aria-label','Поиск по RUDI');
    button.title='Поиск';
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
    const settings=byId('homeSettings');
    tools.insertBefore(button,settings||null);
    button.addEventListener('click',()=>ensureSearchOverlay().openSearch());
    return true;
  }

  function ensureQuickAdd(){
    if(byId('rudiQuickAdd')) return;
    const button=document.createElement('button');
    button.id='rudiQuickAdd';
    button.className='rudi-quick-add';
    button.type='button';
    button.setAttribute('aria-label','Быстро добавить');
    button.setAttribute('aria-expanded','false');
    button.innerHTML='<span aria-hidden="true">+</span>';
    document.body.appendChild(button);

    const sheet=document.createElement('div');
    sheet.id='rudiQuickAddSheet';
    sheet.className='rudi-quick-sheet';
    sheet.hidden=true;
    sheet.innerHTML=
      '<button class="rudi-overlay-backdrop" type="button" aria-label="Закрыть быстрые действия"></button>'+
      '<section class="rudi-quick-dialog" role="dialog" aria-modal="true" aria-label="Быстро добавить">'+
        '<div class="rudi-quick-title">Быстро добавить</div>'+
        '<div class="rudi-quick-actions">'+
          '<button type="button" data-rudi-quick="product"><span>🛒</span><strong>Продукт</strong></button>'+
          '<button type="button" data-rudi-quick="wish"><span>♡</span><strong>Желание</strong></button>'+
          '<button type="button" data-rudi-quick="message"><span>💌</span><strong>Послание</strong></button>'+
        '</div>'+
      '</section>';
    document.body.appendChild(sheet);

    const close=()=>{
      sheet.classList.remove('is-open');
      button.setAttribute('aria-expanded','false');
      setTimeout(()=>{if(!sheet.classList.contains('is-open')) sheet.hidden=true},180);
      document.body.classList.remove('rudi-modal-open');
    };
    const open=()=>{
      sheet.hidden=false;
      button.setAttribute('aria-expanded','true');
      document.body.classList.add('rudi-modal-open');
      requestAnimationFrame(()=>sheet.classList.add('is-open'));
    };
    button.addEventListener('click',()=>sheet.hidden?open():close());
    sheet.querySelector('.rudi-overlay-backdrop')?.addEventListener('click',close);
    sheet.querySelectorAll('[data-rudi-quick]').forEach(action=>{
      action.addEventListener('click',()=>{
        const type=action.dataset.rudiQuick;
        close();
        if(type==='product'){
          routeTo('products');
          setTimeout(()=>byId('productsInput')?.focus(),260);
        }else if(type==='wish'){
          routeTo('wishlist');
          setTimeout(()=>byId('wishlistInput')?.focus(),260);
        }else if(type==='message'){
          routeTo('home');
          setTimeout(()=>byId('partnerEditButton')?.click(),260);
        }
      });
    });
  }

  let savesState=[];
  let savesActor='';
  let savesLoadPromise=null;

  async function savesRequest(operation,payload={}){
    const response=await fetch('/api/partner-message?rudiAction=saves',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        initData:window.Telegram?.WebApp?.initData||'',
        backupToken:window.RUDI_STATE_BACKUP?.getToken?.()||'',
        operation,
        ...payload
      }),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok){
      const error=new Error(data.error||'saves-request-failed');
      error.status=response.status;
      throw error;
    }
    if(data.backupToken) window.RUDI_STATE_BACKUP?.storeToken?.(data.backupToken);
    return data;
  }

  function savesCollapseKey(type){
    const actor=savesActor==='Диана'?'diana':'rustam';
    return 'rudi:saves:collapsed:v1:'+actor+':'+type;
  }

  function applySavesCategoryState(type,collapsed){
    const section=document.querySelector('[data-saves-category="'+type+'"]');
    const toggle=document.querySelector('[data-saves-toggle="'+type+'"]');
    const body=byId(type==='date'?'savedDatesBody':'savedRecipesBody');
    if(!section||!toggle||!body) return;
    section.classList.toggle('is-collapsed',Boolean(collapsed));
    toggle.setAttribute('aria-expanded',collapsed?'false':'true');
    body.hidden=Boolean(collapsed);
  }

  function restoreSavesCategoryState(type){
    let collapsed=false;
    try{collapsed=localStorage.getItem(savesCollapseKey(type))==='1'}catch(_){}
    applySavesCategoryState(type,collapsed);
  }

  function toggleSavesCategory(type){
    const section=document.querySelector('[data-saves-category="'+type+'"]');
    if(!section) return;
    const collapsed=!section.classList.contains('is-collapsed');
    applySavesCategoryState(type,collapsed);
    try{localStorage.setItem(savesCollapseKey(type),collapsed?'1':'0')}catch(_){}
    try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
  }

  function formatSavedDate(value){
    const date=new Date(String(value||''));
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU',{
      day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
    }).format(date).replace(',',' ·');
  }

  function datePeriodText(value){
    return value==='morning'?'Утро':value==='day'?'День':value==='evening'?'Вечер':'';
  }

  function savedDeleteButton(id){
    const button=document.createElement('button');
    button.type='button';
    button.className='saved-item-delete';
    button.setAttribute('aria-label','Удалить сохранение');
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
    button.addEventListener('click',async()=>{
      if(button.disabled) return;
      button.disabled=true;
      try{
        const data=await savesRequest('remove',{id});
        savesState=Array.isArray(data.items)?data.items:[];
        renderSaves();
        showMiniToast('Удалено');
        try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
      }catch(_){
        button.disabled=false;
        showMiniToast('Не удалось удалить');
        try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
      }
    });
    return button;
  }

  function savedMeta(item){
    const bits=[];
    if(item.type==='date'){
      const period=datePeriodText(item.payload?.period);
      if(period) bits.push(period);
      if(item.payload?.duration) bits.push(String(item.payload.duration));
    }else{
      if(item.payload?.timeMinutes) bits.push('≈ '+item.payload.timeMinutes+' мин');
      if(item.payload?.difficulty) bits.push(String(item.payload.difficulty));
    }
    if(item.savedBy) bits.push('Сохранил'+(item.savedBy==='Диана'?'а ':' ')+item.savedBy);
    const when=formatSavedDate(item.createdAt);
    if(when) bits.push(when);
    return bits.join(' · ');
  }

  function renderSavedDateItem(item){
    const card=document.createElement('article');
    card.className='saved-item saved-date-item';
    card.dataset.savedId=String(item.id||'');
    card.dataset.rudiItemId=String(item.id||'');

    const top=document.createElement('div');
    top.className='saved-item-head';
    const title=document.createElement('strong');
    title.textContent=String(item.payload?.title||'Свидание');
    top.append(title,savedDeleteButton(item.id));

    const meta=document.createElement('div');
    meta.className='saved-item-meta';
    meta.textContent=savedMeta(item);

    const description=document.createElement('p');
    description.className='saved-item-description';
    description.textContent=String(item.payload?.description||'');

    card.append(top,meta,description);
    return card;
  }

  function recipeDetailSection(titleText){
    const heading=document.createElement('strong');
    heading.className='saved-recipe-section-title';
    heading.textContent=titleText;
    return heading;
  }

  function renderSavedRecipeItem(item){
    const payload=item.payload||{};
    const card=document.createElement('article');
    card.className='saved-item saved-recipe-item';
    card.dataset.savedId=String(item.id||'');

    const top=document.createElement('div');
    top.className='saved-item-head';
    const title=document.createElement('strong');
    title.textContent=String(payload.title||'Рецепт');
    top.append(title,savedDeleteButton(item.id));

    const meta=document.createElement('div');
    meta.className='saved-item-meta';
    meta.textContent=savedMeta(item);

    card.append(top,meta);

    if(payload.summary){
      const summary=document.createElement('p');
      summary.className='saved-item-description';
      summary.textContent=String(payload.summary);
      card.appendChild(summary);
    }

    const details=document.createElement('details');
    details.className='saved-recipe-details';
    const disclosure=document.createElement('summary');
    disclosure.textContent='Открыть рецепт';
    details.appendChild(disclosure);

    const body=document.createElement('div');
    body.className='saved-recipe-body';

    const missing=Array.isArray(payload.missing)?payload.missing.filter(Boolean):[];
    if(missing.length){
      body.appendChild(recipeDetailSection('Нужно докупить'));
      const text=document.createElement('div');
      text.className='saved-recipe-note';
      text.textContent=missing.join(', ');
      body.appendChild(text);
    }

    const ingredients=Array.isArray(payload.ingredients)?payload.ingredients:[];
    if(ingredients.length){
      body.appendChild(recipeDetailSection('Ингредиенты'));
      const list=document.createElement('div');
      list.className='saved-recipe-ingredients';
      ingredients.forEach(row=>{
        const line=document.createElement('div');
        const name=document.createElement('span');
        name.textContent=String(row?.name||'');
        const amount=document.createElement('strong');
        amount.textContent=String(row?.amount||'');
        line.append(name,amount);
        list.appendChild(line);
      });
      body.appendChild(list);
    }

    const steps=Array.isArray(payload.steps)?payload.steps.filter(Boolean):[];
    if(steps.length){
      body.appendChild(recipeDetailSection('Как приготовить'));
      const list=document.createElement('ol');
      list.className='saved-recipe-steps';
      steps.forEach(value=>{
        const row=document.createElement('li');
        row.textContent=String(value);
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    const tips=Array.isArray(payload.tips)?payload.tips.filter(Boolean):[];
    if(tips.length){
      body.appendChild(recipeDetailSection('Совет'));
      const text=document.createElement('div');
      text.className='saved-recipe-note';
      text.textContent=tips.join(' ');
      body.appendChild(text);
    }

    details.appendChild(body);
    card.appendChild(details);
    return card;
  }

  function renderSaves(){
    const dates=savesState.filter(item=>item?.type==='date');
    const recipes=savesState.filter(item=>item?.type==='recipe');
    const datesList=byId('savedDatesList');
    const recipesList=byId('savedRecipesList');
    const datesEmpty=byId('savedDatesEmpty');
    const recipesEmpty=byId('savedRecipesEmpty');
    if(!datesList||!recipesList) return;

    datesList.replaceChildren(...dates.map(renderSavedDateItem));
    recipesList.replaceChildren(...recipes.map(renderSavedRecipeItem));

    if(datesEmpty) datesEmpty.hidden=dates.length>0;
    if(recipesEmpty) recipesEmpty.hidden=recipes.length>0;
    if(byId('savedDatesCount')) byId('savedDatesCount').textContent=String(dates.length);
    if(byId('savedRecipesCount')) byId('savedRecipesCount').textContent=String(recipes.length);
    if(byId('savesTotalCount')) byId('savesTotalCount').textContent=savesState.length?String(savesState.length):'';

    const status=byId('savesStatus');
    if(status) status.textContent=savesState.length?'Общая коллекция Рустама и Дианы':'Сохраняйте сюда понравившиеся идеи и рецепты';
  }

  async function loadSaves(){
    if(savesLoadPromise) return savesLoadPromise;
    const status=byId('savesStatus');
    if(status&&!savesState.length) status.textContent='Загружаю сохранения…';
    savesLoadPromise=(async()=>{
      try{
        const data=await savesRequest('list');
        savesActor=String(data.actor||savesActor);
        savesState=Array.isArray(data.items)?data.items:[];
        renderSaves();
        restoreSavesCategoryState('date');
        restoreSavesCategoryState('recipe');
        return savesState;
      }catch(error){
        if(status) status.textContent=navigator.onLine===false
          ?'Нет сети. Сохранения будут доступны после подключения.'
          :'Не удалось загрузить сохранения';
        throw error;
      }finally{
        savesLoadPromise=null;
      }
    })();
    return savesLoadPromise;
  }

  async function saveSharedItem(type,payload,button){
    const data=await savesRequest('add',{type,payload});
    savesActor=String(data.actor||savesActor);
    savesState=Array.isArray(data.items)?data.items:savesState;
    renderSaves();
    if(button){
      button.classList.add('is-saved');
      button.disabled=true;
      const label=button.querySelector('span');
      if(label) label.textContent='Сохранено';
      button.setAttribute('aria-label','Сохранено');
    }
    showMiniToast(data.duplicate?'Уже сохранено':'Сохранено');
    return data.item;
  }

  function setupSavesPage(){
    document.querySelectorAll('[data-saves-toggle]').forEach(button=>{
      if(button.dataset.savesBound==='1') return;
      button.dataset.savesBound='1';
      button.addEventListener('click',()=>toggleSavesCategory(String(button.dataset.savesToggle||'')));
    });
    const back=byId('savesBackButton');
    if(back&&back.dataset.bound!=='1'){
      back.dataset.bound='1';
      back.addEventListener('click',()=>routeTo('home'));
    }
  }

  window.RUDI_SAVES={
    load:loadSaves,
    save:saveSharedItem,
    remove:async id=>{
      const data=await savesRequest('remove',{id});
      savesState=Array.isArray(data.items)?data.items:[];
      renderSaves();
      return data;
    }
  };


  let forDiState=[];
  let forDiActor='';
  let forDiLoadPromise=null;

  async function forDiRequest(operation,payload={}){
    const response=await fetch('/api/partner-message?rudiAction=for-di-feed',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        initData:window.Telegram?.WebApp?.initData||'',
        backupToken:window.RUDI_STATE_BACKUP?.getToken?.()||'',
        operation,
        ...payload
      }),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok){
      const error=new Error(data.error||'for-di-request-failed');
      error.status=response.status;
      throw error;
    }
    if(data.backupToken) await window.RUDI_STATE_BACKUP?.storeToken?.(data.backupToken);
    return data;
  }

  function forDiDateLabel(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return String(value||'');
    const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    if(Number.isNaN(date.getTime())) return String(value||'');
    return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(date);
  }

  function forDiTimeLabel(value){
    const date=new Date(String(value||''));
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(date);
  }

  function forDiSourceLabel(value){
    const source=String(value||'').trim();
    if(source==='labor') return 'Трудовой кодекс';
    if(source==='stylist-leads') return 'Клиенты для стилиста';
    if(source==='clients-advice') return 'Работа с клиентами';
    return source ? source : 'Для Ди';
  }

  function renderForDiLike(item){
    const likes=Array.isArray(item?.likes)?item.likes.filter(Boolean):[];
    const active=likes.includes(forDiActor);
    const button=document.createElement('button');
    button.type='button';
    button.className='for-di-like'+(active?' is-active':'');
    button.setAttribute('aria-pressed',active?'true':'false');
    button.setAttribute('aria-label',active?'Убрать лайк':'Поставить лайк');
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6 10.55 19.28C5.4 14.6 2 11.5 2 7.7 2 4.6 4.42 2.2 7.5 2.2c1.74 0 3.41.81 4.5 2.08A6.02 6.02 0 0 1 16.5 2.2C19.58 2.2 22 4.6 22 7.7c0 3.8-3.4 6.9-8.55 11.59L12 20.6Z"/></svg><span>'+esc(likes.length?likes.join(', '):'')+'</span>';
    button.addEventListener('click',async()=>{
      if(button.disabled) return;
      button.disabled=true;
      try{
        const data=await forDiRequest('toggle-like',{id:item.id});
        forDiActor=String(data.actor||forDiActor);
        forDiState=Array.isArray(data.items)?data.items:forDiState;
        renderForDi();
        try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }catch(_){
        button.disabled=false;
        showMiniToast('Не удалось поставить лайк');
        try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
      }
    });
    return button;
  }

  function forDiCollapseKey(type){
    const actor=forDiActor==='Диана'?'diana':'rustam';
    return 'rudi:for-di:collapsed:v1:'+actor+':'+type;
  }

  function applyForDiCategoryState(type,collapsed){
    const section=document.querySelector('[data-for-di-category="'+type+'"]');
    const toggle=document.querySelector('[data-for-di-toggle="'+type+'"]');
    const body=byId(type==='labor'?'forDiLaborBody':'forDiStylistBody');
    if(!section||!toggle||!body) return;
    section.classList.toggle('is-collapsed',Boolean(collapsed));
    toggle.setAttribute('aria-expanded',collapsed?'false':'true');
    body.hidden=Boolean(collapsed);
  }

  function restoreForDiCategoryState(type){
    let collapsed=false;
    try{collapsed=localStorage.getItem(forDiCollapseKey(type))==='1'}catch(_){}
    applyForDiCategoryState(type,collapsed);
  }

  function toggleForDiCategory(type){
    const section=document.querySelector('[data-for-di-category="'+type+'"]');
    if(!section) return;
    const collapsed=!section.classList.contains('is-collapsed');
    applyForDiCategoryState(type,collapsed);
    try{localStorage.setItem(forDiCollapseKey(type),collapsed?'1':'0')}catch(_){}
    try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
  }

  function renderForDiRows(host,rows){
    if(!host) return;
    host.replaceChildren();
    const groups=new Map();
    rows.forEach(item=>{
      const key=String(item?.dateKey||'').trim()||'Без даты';
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(item);
    });

    groups.forEach((items,dateKey)=>{
      const group=document.createElement('section');
      group.className='for-di-day';
      const heading=document.createElement('div');
      heading.className='for-di-day-title';
      heading.textContent=forDiDateLabel(dateKey);
      group.appendChild(heading);

      const stack=document.createElement('div');
      stack.className='for-di-day-items';
      items.forEach(item=>{
        const card=document.createElement('article');
        card.className='for-di-card';
        card.dataset.rudiItemId=String(item.id||'');

        const meta=document.createElement('div');
        meta.className='for-di-card-meta';
        const source=document.createElement('span');
        source.className='for-di-source';
        source.textContent=forDiSourceLabel(item.source);
        const time=document.createElement('time');
        time.textContent=forDiTimeLabel(item.createdAt);
        meta.append(source,time);

        const body=document.createElement('div');
        body.className='for-di-card-text';
        body.textContent=String(item.text||'');

        const footer=document.createElement('div');
        footer.className='for-di-card-footer';
        footer.appendChild(renderForDiLike(item));

        card.append(meta,body,footer);
        stack.appendChild(card);
      });
      group.appendChild(stack);
      host.appendChild(group);
    });
  }

  function renderForDi(){
    const laborList=byId('forDiLaborList');
    const stylistList=byId('forDiStylistList');
    const laborEmpty=byId('forDiLaborEmpty');
    const stylistEmpty=byId('forDiStylistEmpty');
    const laborCount=byId('forDiLaborCount');
    const stylistCount=byId('forDiStylistCount');
    const totalCount=byId('forDiTotalCount');
    const status=byId('forDiStatus');
    if(!laborList||!stylistList) return;

    const laborRows=[...forDiState]
      .filter(item=>String(item?.source||'').trim()==='labor')
      .sort((a,b)=>{
        const at=Date.parse(String(a?.createdAt||''))||0;
        const bt=Date.parse(String(b?.createdAt||''))||0;
        return bt-at;
      });

    const stylistRows=[];

    renderForDiRows(laborList,laborRows);
    stylistList.replaceChildren();

    if(laborEmpty) laborEmpty.hidden=laborRows.length>0;
    if(stylistEmpty) stylistEmpty.hidden=stylistRows.length>0;
    if(laborCount) laborCount.textContent=String(laborRows.length);
    if(stylistCount) stylistCount.textContent='0';
    if(totalCount) totalCount.textContent=laborRows.length?String(laborRows.length):'';

    if(status) status.textContent=laborRows.length
      ?'Материалы сохраняются здесь вместе с ежедневным обновлением ленты'
      :'Материалы появятся вместе с обновлением ленты';

    restoreForDiCategoryState('labor');
    restoreForDiCategoryState('stylist');
  }

  async function loadForDi(){
    if(forDiLoadPromise) return forDiLoadPromise;
    const status=byId('forDiStatus');
    if(status&&!forDiState.length) status.textContent='Загружаю материалы…';
    forDiLoadPromise=(async()=>{
      try{
        const data=await forDiRequest('list');
        forDiActor=String(data.actor||forDiActor);
        forDiState=Array.isArray(data.items)?data.items:[];
        renderForDi();
        return forDiState;
      }catch(error){
        if(status) status.textContent=navigator.onLine===false
          ?'Нет сети. Материалы будут доступны после подключения.'
          :'Не удалось загрузить материалы';
        throw error;
      }finally{
        forDiLoadPromise=null;
      }
    })();
    return forDiLoadPromise;
  }

  function setupForDiPage(){
    const back=byId('forDiBackButton');
    if(back&&back.dataset.bound!=='1'){
      back.dataset.bound='1';
      back.addEventListener('click',()=>routeTo('home'));
    }
    document.querySelectorAll('[data-for-di-toggle]').forEach(button=>{
      if(button.dataset.forDiBound==='1') return;
      button.dataset.forDiBound='1';
      button.addEventListener('click',()=>toggleForDiCategory(String(button.dataset.forDiToggle||'')));
    });
  }

  window.RUDI_FOR_DI={
    load:loadForDi,
    refresh:loadForDi
  };


  let recipeWakeLock=null;
  let recipeWakeLockListenersInstalled=false;

  function recipeScreenIsOpen(){
    const details=byId('recipeDetails');
    if(!details||details.hidden||details.closest('[hidden]')) return false;
    return document.visibilityState==='visible';
  }

  async function syncRecipeWakeLock(){
    if(!navigator.wakeLock?.request) return;
    const shouldHold=recipeScreenIsOpen();
    if(shouldHold&&!recipeWakeLock){
      try{
        const lock=await navigator.wakeLock.request('screen');
        recipeWakeLock=lock;
        lock.addEventListener('release',()=>{
          if(recipeWakeLock===lock) recipeWakeLock=null;
          if(recipeScreenIsOpen()) setTimeout(()=>syncRecipeWakeLock(),200);
        },{once:true});
      }catch(_){}
      return;
    }
    if(!shouldHold&&recipeWakeLock){
      const lock=recipeWakeLock;
      recipeWakeLock=null;
      try{await lock.release()}catch(_){}
    }
  }

  function setupRecipeWakeLock(){
    const details=byId('recipeDetails');
    if(details&&details.dataset.wakeLockBound!=='1'){
      details.dataset.wakeLockBound='1';
      const observer=new MutationObserver(()=>syncRecipeWakeLock());
      observer.observe(details,{attributes:true,attributeFilter:['hidden','class','style']});
      const section=details.closest('[data-app-tab-section]');
      if(section) observer.observe(section,{attributes:true,attributeFilter:['hidden','class','style']});
      setTimeout(()=>syncRecipeWakeLock(),0);
    }
    if(!recipeWakeLockListenersInstalled){
      recipeWakeLockListenersInstalled=true;
      document.addEventListener('visibilitychange',()=>syncRecipeWakeLock());
      window.addEventListener('popstate',()=>setTimeout(()=>syncRecipeWakeLock(),0));
      document.addEventListener('click',()=>setTimeout(()=>syncRecipeWakeLock(),0),true);
    }
  }

  function removeRetiredQuickAdd(){
    byId('rudiQuickAdd')?.remove();
    byId('rudiQuickAddSheet')?.remove();
    document.body.classList.remove('rudi-modal-open');
  }

  function installDynamicExtras(){
    installSearchButton();
    removeRetiredQuickAdd();
    setupSavesPage();
    setupForDiPage();
    setupRecipeWakeLock();
  }

  installServiceWorker();
  installBackgroundSync();
  installConnectivityBanner();
  installBadgeSync();
  ensureSearchOverlay();
  installDynamicExtras();

  const observer=new MutationObserver(()=>installDynamicExtras());
  observer.observe(document.body,{childList:true,subtree:true});
})();