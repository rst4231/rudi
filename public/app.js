    (() => {
      const TZ = 'Europe/Moscow';
      const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';
      const root = document.documentElement;
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const tg = window.Telegram?.WebApp;
      const DAY = 86400000;
      let currentActor = '';
      let currentPartnerReactionKey = '';
      let currentDailyReactionTargets = [];
      let currentFeedReactionTargets = [];
      let partnerProfileName = '';
      let holidayItemsCache = null;
      let holidayItemsPromise = null;
      let currentWorkCalendarView = 'month';
      let currentSelectedWorkDate = '';
      let currentWorkCalendarRenderSignature = '';
      let currentSharedCalendarView = 'month';
      const calendarViewCache = {month:null,'next-month':null};
      let calendarConfettiTimer = 0;
      let sharedAlbumUrl = '';
      let sharedAlbumPhotos = [];
      let currentSharedAlbumPhotoIndex = -1;
      let currentAppTab = 'home';
      let requestedAppTab = '';
      let productsLoadPromise = null;
      let productsRefreshTimer = 0;
      let currentMoodDateKey = '';
      let currentConfig = null;
      let currentComplimentDateKey = '';
      let homeLayoutEditing = false;
      let homeTileHost = null;
      const HOME_TILE_DEFAULT_ORDER = ['profile-common','profile-self','profile-partner','cycle','priority','partner','daily'];
      const appTabScroll = {home:0,feed:0,schedule:0,wishlist:0,photos:0,products:0};
      const STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v2';
      const STATE_BACKUP_CLOUD_META_KEY = 'rudi_state_backup_v2_meta';
      const STATE_BACKUP_CLOUD_CHUNK_PREFIX = 'rudi_state_backup_v2_';
      const STATE_BACKUP_CLOUD_SLOT_PREFIX = 'rudi_state_backup_v2_slot_';
      const LEGACY_STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v1';
      const LEGACY_STATE_BACKUP_CLOUD_META_KEY = 'rudi_state_backup_v1_meta';
      const LEGACY_STATE_BACKUP_CLOUD_CHUNK_PREFIX = 'rudi_state_backup_v1_';
      const STATE_BACKUP_CLOUD_CHUNK_SIZE = 3500;
      let stateBackupRefreshPromise = null;
      let currentStateBackupToken = '';
      let ticktickHandoffToken = '';
      try{
        const params=new URLSearchParams(window.location.search);
        ticktickHandoffToken=String(params.get('ticktickHandoff')||'').trim();
        requestedAppTab=String(params.get('tab')||'').trim();
      }catch(_){}

      function withTimeout(promise,timeoutMs,fallback){
        return new Promise(resolve=>{
          let settled=false;
          const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)};
          const timer=setTimeout(()=>finish(fallback),Math.max(250,Number(timeoutMs)||0));
          Promise.resolve(promise).then(finish,()=>finish(fallback));
        });
      }

      async function fetchWithTimeout(input,init={},timeoutMs=8000){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
        try{return await fetch(input,{...init,signal:controller.signal})}
        finally{clearTimeout(timer)}
      }

      const managedRequestState = new Map();

      function invalidateManagedRequests(...resources){
        const prefixes=resources.flat().map(value=>String(value||'').trim()).filter(Boolean);
        for(const [key,state] of managedRequestState.entries()){
          if(!prefixes.some(prefix=>key===prefix||key.startsWith(prefix+':'))) continue;
          try{state?.controller?.abort?.()}catch(_){}
          managedRequestState.delete(key);
        }
      }

      async function managedJsonRequest(resource,url,{method='POST',body=null,ttlMs=0,timeoutMs=10000,headers=null}={}){
        const key=String(resource||url);
        const fingerprint=method+'|'+url+'|'+JSON.stringify(body??null);
        const now=Date.now();
        const previous=managedRequestState.get(key);

        if(previous?.fingerprint===fingerprint&&previous?.hasData&&previous.expiresAt>now) return previous.data;
        if(previous?.fingerprint===fingerprint&&previous?.promise) return previous.promise;
        try{previous?.controller?.abort?.()}catch(_){}

        const controller=new AbortController();
        const state={fingerprint,controller,promise:null,hasData:false,data:null,expiresAt:0};
        const promise=(async()=>{
          const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||10000));
          try{
            const response=await fetch(url,{
              method,
              headers:headers||{'Content-Type':'application/json'},
              body:body==null?undefined:JSON.stringify(body),
              cache:'no-store',
              signal:controller.signal
            });
            const payload=await response.json().catch(()=>({}));
            if(!response.ok){
              const error=new Error(payload?.error||('request-'+response.status));
              error.status=response.status;
              error.payload=payload;
              throw error;
            }
            if(managedRequestState.get(key)===state){
              state.hasData=true;
              state.data=payload;
              state.expiresAt=ttlMs>0?Date.now()+ttlMs:0;
            }
            return payload;
          }finally{clearTimeout(timer)}
        })();
        state.promise=promise;
        managedRequestState.set(key,state);
        try{return await promise}
        finally{
          if(managedRequestState.get(key)===state){
            state.promise=null;
            state.controller=null;
            if(!state.hasData) managedRequestState.delete(key);
          }
        }
      }

      function readLocalStateBackupToken(){
        try{return String(localStorage.getItem(STATE_BACKUP_STORAGE_KEY)||'').trim()}catch(_){return ''}
      }

      function storeLocalStateBackupToken(value){
        const token=String(value||'').trim();
        if(!token) return;
        try{localStorage.setItem(STATE_BACKUP_STORAGE_KEY,token)}catch(_){}
      }

      function backupTokenChecksum(value){
        const text=String(value||'');
        let a=2166136261>>>0;
        let b=2246822519>>>0;
        for(let index=0;index<text.length;index++){
          const code=text.charCodeAt(index);
          a=Math.imul((a^code)>>>0,16777619)>>>0;
          b=Math.imul((b^(code+index))>>>0,3266489917)>>>0;
        }
        return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
      }

      function cloudStorageGetItem(key){
        return new Promise(resolve=>{
          if(!tg?.CloudStorage?.getItem) return resolve('');
          try{
            tg.CloudStorage.getItem(key,(error,value)=>resolve(error?'':String(value||'')));
          }catch(_){resolve('')}
        });
      }

      function cloudStorageSetItem(key,value){
        return new Promise(resolve=>{
          if(!tg?.CloudStorage?.setItem) return resolve(false);
          try{
            tg.CloudStorage.setItem(key,String(value||''),(error,stored)=>resolve(!error&&stored!==false));
          }catch(_){resolve(false)}
        });
      }

      function cloudStorageRemoveItems(keys){
        return new Promise(resolve=>{
          const list=(Array.isArray(keys)?keys:[]).filter(Boolean);
          if(!list.length||!tg?.CloudStorage) return resolve(true);
          try{
            if(tg.CloudStorage.removeItems){
              tg.CloudStorage.removeItems(list,error=>resolve(!error));
              return;
            }
          }catch(_){}
          Promise.all(list.map(key=>new Promise(done=>{
            try{
              tg.CloudStorage.removeItem?.(key,error=>done(!error));
              if(!tg.CloudStorage.removeItem) done(false);
            }catch(_){done(false)}
          }))).then(()=>resolve(true),()=>resolve(false));
        });
      }

      async function clearLegacyStateBackup(){
        try{localStorage.removeItem(LEGACY_STATE_BACKUP_STORAGE_KEY)}catch(_){}
        if(!tg?.CloudStorage) return;
        const rawMeta=await withTimeout(cloudStorageGetItem(LEGACY_STATE_BACKUP_CLOUD_META_KEY),800,'');
        let count=0;
        try{count=Number(JSON.parse(rawMeta||'{}')?.count||0)}catch(_){}
        count=Number.isInteger(count)?Math.min(Math.max(count,0),128):0;
        const keys=[
          LEGACY_STATE_BACKUP_CLOUD_META_KEY,
          ...Array.from({length:count},(_,index)=>LEGACY_STATE_BACKUP_CLOUD_CHUNK_PREFIX+index)
        ];
        await withTimeout(cloudStorageRemoveItems(keys),1200,false);
      }

      async function readCloudStateBackupToken(options={}){
        if(!tg?.CloudStorage?.getItem) return '';
        const rawMeta=await cloudStorageGetItem(STATE_BACKUP_CLOUD_META_KEY);
        if(!rawMeta) return '';
        let meta;
        try{meta=JSON.parse(rawMeta)}catch(_){return ''}
        const count=Number(meta?.count||0);
        const expectedLength=Number(meta?.length||0);
        if(!Number.isInteger(count)||count<1||count>128||!Number.isInteger(expectedLength)||expectedLength<1) return '';

        const version=Number(meta?.version||0);
        const slot=String(meta?.slot||'');
        if(version>=3){
          if(!['a','b'].includes(slot)) return '';
          const checksum=String(meta?.checksum||'').trim().toLowerCase();
          if(!/^[0-9a-f]{16}$/.test(checksum)) return '';
          const keys=Array.from({length:count},(_,index)=>STATE_BACKUP_CLOUD_SLOT_PREFIX+slot+'_'+index);
          let values={};
          if(tg.CloudStorage.getItems){
            values=await new Promise(resolve=>{
              try{tg.CloudStorage.getItems(keys,(error,result)=>resolve(error?{}:(result||{})))}catch(_){resolve({})}
            });
          }else{
            const rows=await Promise.all(keys.map(async key=>[key,await cloudStorageGetItem(key)]));
            values=Object.fromEntries(rows);
          }
          const token=keys.map(key=>String(values?.[key]||'')).join('');
          if(token.length!==expectedLength||backupTokenChecksum(token)!==checksum) return '';
          return token;
        }

        if(options.allowLegacy===false) return '';
        const keys=Array.from({length:count},(_,index)=>STATE_BACKUP_CLOUD_CHUNK_PREFIX+index);
        let values={};
        if(tg.CloudStorage.getItems){
          values=await new Promise(resolve=>{
            try{tg.CloudStorage.getItems(keys,(error,result)=>resolve(error?{}:(result||{})))}catch(_){resolve({})}
          });
        }else{
          const rows=await Promise.all(keys.map(async key=>[key,await cloudStorageGetItem(key)]));
          values=Object.fromEntries(rows);
        }
        const token=keys.map(key=>String(values?.[key]||'')).join('');
        return token.length===expectedLength?token:'';
      }

      async function writeCloudStateBackupToken(value){
        const token=String(value||'').trim();
        if(!token||!tg?.CloudStorage?.setItem) return false;

        const previousRaw=await cloudStorageGetItem(STATE_BACKUP_CLOUD_META_KEY);
        let previousMeta={};
        try{previousMeta=JSON.parse(previousRaw||'{}')||{}}catch(_){}
        const previousVersion=Number(previousMeta?.version||0);
        const previousCount=Number(previousMeta?.count||0);
        const previousSlot=['a','b'].includes(String(previousMeta?.slot||''))?String(previousMeta.slot):'';
        const nextSlot=previousSlot==='a'?'b':'a';

        const chunks=[];
        for(let index=0;index<token.length;index+=STATE_BACKUP_CLOUD_CHUNK_SIZE){
          chunks.push(token.slice(index,index+STATE_BACKUP_CLOUD_CHUNK_SIZE));
        }
        if(!chunks.length||chunks.length>128) return false;

        const keys=chunks.map((_,index)=>STATE_BACKUP_CLOUD_SLOT_PREFIX+nextSlot+'_'+index);
        for(let index=0;index<chunks.length;index++){
          const stored=await cloudStorageSetItem(keys[index],chunks[index]);
          if(!stored) return false;
        }

        const verificationRows=await Promise.all(keys.map(async key=>[key,await cloudStorageGetItem(key)]));
        const verification=Object.fromEntries(verificationRows);
        const restored=keys.map(key=>String(verification?.[key]||'')).join('');
        const checksum=backupTokenChecksum(token);
        if(restored.length!==token.length||backupTokenChecksum(restored)!==checksum) return false;

        const meta=JSON.stringify({
          version:3,
          slot:nextSlot,
          count:chunks.length,
          length:token.length,
          checksum,
          updatedAt:Date.now()
        });
        if(!await cloudStorageSetItem(STATE_BACKUP_CLOUD_META_KEY,meta)) return false;

        if(previousVersion<3&&Number.isInteger(previousCount)&&previousCount>0&&previousCount<=128){
          await cloudStorageRemoveItems(Array.from({length:previousCount},(_,index)=>STATE_BACKUP_CLOUD_CHUNK_PREFIX+index));
        }
        return true;
      }

      async function readStateBackupToken(){
        const local=readLocalStateBackupToken();
        const cloud=await readCloudStateBackupToken({allowLegacy:!local});
        if(cloud){
          currentStateBackupToken=cloud;
          storeLocalStateBackupToken(cloud);
          return cloud;
        }
        if(local) currentStateBackupToken=local;
        return local;
      }

      async function storeStateBackupToken(value){
        const token=String(value||'').trim();
        if(!token) return;
        currentStateBackupToken=token;
        storeLocalStateBackupToken(token);
        await writeCloudStateBackupToken(token).catch(()=>false);
      }

      async function refreshStateBackup(){
        if(!currentActor||!tg?.initData) return;
        if(stateBackupRefreshPromise) return stateBackupRefreshPromise;
        stateBackupRefreshPromise=(async()=>{
          try{
            const response=await fetch('/api/partner-message?rudiAction=state-backup',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({initData:tg.initData,backupToken:currentStateBackupToken}),
              cache:'no-store'
            });
            const payload=await response.json().catch(()=>({}));
            if(response.ok&&payload.ok&&payload.backupToken) await storeStateBackupToken(payload.backupToken);
          }catch(_){}
          finally{stateBackupRefreshPromise=null}
        })();
        return stateBackupRefreshPromise;
      }

      function homeLayoutStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi-home-layout-v1-'+actor;
      }

      function ensureHomeTileHost(){
        if(homeTileHost?.isConnected) return homeTileHost;
        const shell=document.querySelector('.shell');
        if(!shell) return null;
        const tiles=[...shell.querySelectorAll('[data-app-tab-section="home"][data-home-tile]')];
        if(!tiles.length) return null;
        const host=document.createElement('div');
        host.id='homeTileHost';
        host.className='home-tile-host';
        shell.insertBefore(host,tiles[0]);
        tiles.forEach(tile=>host.appendChild(tile));
        homeTileHost=host;
        return host;
      }

      function normalizedHomeOrder(order){
        const source=Array.isArray(order)?order.map(String):[];
        const requested=source.flatMap(id=>id==='profile'?['profile-common','profile-self','profile-partner']:[id]);
        const valid=requested.filter((id,index)=>HOME_TILE_DEFAULT_ORDER.includes(id)&&requested.indexOf(id)===index);
        for(const id of HOME_TILE_DEFAULT_ORDER) if(!valid.includes(id)) valid.push(id);
        return valid;
      }

      function homeTileRects(host){
        return new Map([...host.querySelectorAll(':scope > [data-home-tile]')].map(tile=>[tile,tile.getBoundingClientRect()]));
      }

      function animateHomeReorder(host,before,skipTile=null){
        if(!before||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        requestAnimationFrame(()=>{
          for(const tile of host.querySelectorAll(':scope > [data-home-tile]')){
            if(tile===skipTile) continue;
            const previous=before.get(tile);
            if(!previous) continue;
            const next=tile.getBoundingClientRect();
            const dx=previous.left-next.left;
            const dy=previous.top-next.top;
            if(Math.abs(dx)<1&&Math.abs(dy)<1) continue;
            try{
              tile.animate(
                [{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],
                {duration:230,easing:'cubic-bezier(.2,.82,.2,1)'}
              );
            }catch(_){}
          }
        });
      }

      function applyHomeOrder(order,{animate=false}={}){
        const host=ensureHomeTileHost();
        if(!host) return;
        const before=animate?homeTileRects(host):null;
        const tiles=new Map([...host.querySelectorAll(':scope > [data-home-tile]')].map(tile=>[tile.dataset.homeTile,tile]));
        for(const id of normalizedHomeOrder(order)){
          const tile=tiles.get(id);
          if(tile) host.appendChild(tile);
        }
        if(animate) animateHomeReorder(host,before);
      }

      function loadHomeOrder(){
        let order=[];
        try{order=JSON.parse(localStorage.getItem(homeLayoutStorageKey())||'[]')}catch(_){}
        applyHomeOrder(order);
      }

      function saveHomeOrder(){
        const host=ensureHomeTileHost();
        if(!host) return;
        const order=[...host.querySelectorAll(':scope > [data-home-tile]')].map(tile=>tile.dataset.homeTile).filter(Boolean);
        try{localStorage.setItem(homeLayoutStorageKey(),JSON.stringify(order))}catch(_){}
      }

      function updateHomeOrderControls(){
        const host=ensureHomeTileHost();
        if(!host) return;
        const tiles=[...host.querySelectorAll(':scope > [data-home-tile]')];
        tiles.forEach((tile,index)=>{
          const controls=tile.querySelector(':scope > .home-order-controls');
          if(!controls) return;
          const up=controls.querySelector('[data-home-move="up"]');
          const down=controls.querySelector('[data-home-move="down"]');
          if(up) up.disabled=index===0;
          if(down) down.disabled=index===tiles.length-1;
        });
      }

      function resetHomeOrder(){
        try{localStorage.removeItem(homeLayoutStorageKey())}catch(_){}
        applyHomeOrder(HOME_TILE_DEFAULT_ORDER,{animate:true});
        saveHomeOrder();
        updateHomeOrderControls();
        try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
      }

      function moveHomeTile(tile,direction){
        const host=ensureHomeTileHost();
        if(!host||!tile||tile.parentElement!==host) return;
        const sibling=direction==='up'?tile.previousElementSibling:tile.nextElementSibling;
        if(!sibling||!sibling.matches?.('[data-home-tile]')) return;

        const before=homeTileRects(host);
        if(direction==='up') host.insertBefore(tile,sibling);
        else host.insertBefore(sibling,tile);
        animateHomeReorder(host,before);
        saveHomeOrder();
        updateHomeOrderControls();
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      function ensureHomeOrderControls(){
        const host=ensureHomeTileHost();
        if(!host) return;
        for(const tile of host.querySelectorAll(':scope > [data-home-tile]')){
          if(tile.querySelector(':scope > .home-order-controls')) continue;
          const controls=document.createElement('div');
          controls.className='home-order-controls';
          controls.setAttribute('aria-label','Изменить положение блока');
          controls.innerHTML=
            '<button class="home-order-button" type="button" data-home-move="up" aria-label="Переместить блок вверх" title="Вверх">↑</button>'+
            '<button class="home-order-button" type="button" data-home-move="down" aria-label="Переместить блок вниз" title="Вниз">↓</button>';
          tile.appendChild(controls);
        }
        updateHomeOrderControls();
      }

      function setHomeLayoutEditing(enabled){
        homeLayoutEditing=Boolean(enabled);
        document.body.classList.toggle('home-layout-editing',homeLayoutEditing);
        const button=document.getElementById('homeLayoutEditButton');
        const reset=document.getElementById('homeLayoutResetButton');
        if(button){
          button.textContent=homeLayoutEditing?'Готово':'Изменить';
          button.setAttribute('aria-pressed',homeLayoutEditing?'true':'false');
        }
        if(reset) reset.hidden=!homeLayoutEditing;
        if(homeLayoutEditing){
          ensureHomeOrderControls();
          updateHomeOrderControls();
        }
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      function setupHomeLayoutEditor(){
        const host=ensureHomeTileHost();
        const button=document.getElementById('homeLayoutEditButton');
        const reset=document.getElementById('homeLayoutResetButton');
        if(!host||!button) return;
        loadHomeOrder();
        ensureHomeOrderControls();

        if(button.dataset.homeLayoutBound!=='1'){
          button.dataset.homeLayoutBound='1';
          button.addEventListener('click',()=>setHomeLayoutEditing(!homeLayoutEditing));
        }
        if(reset&&reset.dataset.homeLayoutBound!=='1'){
          reset.dataset.homeLayoutBound='1';
          reset.addEventListener('click',event=>{
            event.preventDefault();
            event.stopPropagation();
            resetHomeOrder();
          });
        }
        if(host.dataset.homeLayoutBound==='1') return;
        host.dataset.homeLayoutBound='1';

        host.addEventListener('click',event=>{
          if(!homeLayoutEditing) return;
          const moveButton=event.target.closest?.('[data-home-move]');
          if(!moveButton||moveButton.disabled) return;
          const tile=moveButton.closest?.('[data-home-tile]');
          if(!tile||tile.parentElement!==host) return;
          event.preventDefault();
          event.stopPropagation();
          moveHomeTile(tile,moveButton.dataset.homeMove);
        });
      }

      function applyAppTab(tab,{scroll=false}={}){
        const allowed=['home','feed','schedule','wishlist','photos','products'];
        let next=allowed.includes(tab)?tab:'home';
        const candidates=[...document.querySelectorAll('[data-app-tab-section="'+next+'"]')];
        if(next!=='home'&&candidates.length&&candidates.every(section=>section.dataset.tabAvailable==='0')){
          next='home';
        }
        if(next!=='home'&&homeLayoutEditing) setHomeLayoutEditing(false);
        currentAppTab=next;
        document.body.dataset.appTab=next;

        document.querySelectorAll('[data-app-tab-section]').forEach(section=>{
          const available=section.dataset.tabAvailable!=='0';
          section.hidden=section.dataset.appTabSection!==next||!available;
        });

        document.querySelectorAll('[data-app-tab]').forEach(button=>{
          const active=button.dataset.appTab===next;
          button.classList.toggle('active',active);
          button.setAttribute('aria-selected',active?'true':'false');
          if(active) button.setAttribute('aria-current','page');
          else button.removeAttribute('aria-current');
        });

        if(scroll){
          requestAnimationFrame(()=>{
            window.scrollTo({top:appTabScroll[next]||0,left:0,behavior:'auto'});
          });
        }
      }

      function playCalendarConfetti(){
        const host=document.getElementById('calendarConfetti');
        if(!host) return;
        try{
          if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
        }catch(_){}
        clearTimeout(calendarConfettiTimer);
        host.classList.remove('is-active');
        host.replaceChildren();
        const palette=['var(--accent)','var(--love)','var(--green)','#f4c95d','#72c6ff','#d98cff'];
        for(let index=0;index<34;index++){
          const piece=document.createElement('i');
          piece.className='calendar-confetti-piece';
          piece.style.setProperty('--confetti-x',(3+Math.random()*94).toFixed(2)+'%');
          piece.style.setProperty('--confetti-drift',((-70+Math.random()*140).toFixed(1))+'px');
          piece.style.setProperty('--confetti-delay',(Math.random()*.48).toFixed(3)+'s');
          piece.style.setProperty('--confetti-duration',(1.15+Math.random()*.9).toFixed(3)+'s');
          piece.style.setProperty('--confetti-turn',(360+Math.round(Math.random()*720))+'deg');
          piece.style.setProperty('--confetti-color',palette[index%palette.length]);
          piece.classList.toggle('is-round',index%5===0);
          host.appendChild(piece);
        }
        requestAnimationFrame(()=>host.classList.add('is-active'));
        calendarConfettiTimer=setTimeout(()=>{
          host.classList.remove('is-active');
          host.replaceChildren();
        },2500);
      }

      function setupAppTabs(){
        applyAppTab(requestedAppTab||'home',{scroll:false});
        document.querySelectorAll('[data-app-tab]').forEach(button=>{
          button.addEventListener('click',()=>{
            const next=button.dataset.appTab||'home';
            if(next===currentAppTab){
              appTabScroll[next]=window.scrollY||0;
              if(next==='schedule') loadWorkCalendar(currentWorkCalendarView,{silent:true});
              try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
              return;
            }
            appTabScroll[currentAppTab]=window.scrollY||0;
            document.activeElement?.blur?.();
            applyAppTab(next,{scroll:true});
            if(next==='feed'){
              loadFeed({silent:true});
            }
            if(next==='schedule'){
              playCalendarConfetti();
              loadWorkCalendar(currentWorkCalendarView,{silent:true});
            }
            if(next==='products'){
              loadProducts({silent:true});
              scheduleProductsRefresh(15000);
            }
            try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
          });
        });
      }

      function blockStateStorageKey(){
        const userId=String(tg?.initDataUnsafe?.user?.id||'local');
        return 'rudi:block-state:v2:'+userId;
      }


      function profileStatusElement(person){
        const actor=String(person||'');
        if(actor==='Рустам') return document.getElementById(currentActor==='Рустам'?'selfWorkStatus':'partnerWorkStatus');
        if(actor==='Диана') return document.getElementById(currentActor==='Диана'?'selfWorkStatus':'partnerWorkStatus');
        return null;
      }

      function setProfileWorkStatus(person,text,state='neutral'){
        const node=profileStatusElement(person);
        if(!node) return;
        node.textContent=String(text||'');
        node.classList.toggle('is-working',state==='working');
        node.classList.toggle('is-off',state==='off');
        node.classList.toggle('is-neutral',state!=='working'&&state!=='off');
        node.hidden=!String(text||'').trim();
      }

      function dianaCycleMoodWord(phase){
        const value=String(phase||'');
        if(value==='Месячные') return 'Спокойная';
        if(value==='Фолликулярная фаза') return 'Бодрая';
        if(value==='Фертильное окно') return 'Энергичная';
        if(value==='Лютеиновая фаза') return 'Чувствительная';
        return '';
      }

      function setDianaCycleMood(phase){
        const node=document.getElementById('dianaCycleMood');
        if(!node) return;
        const word=dianaCycleMoodWord(phase);
        node.textContent=word;
        node.hidden=!word;
        node.title=word?'Ориентировочно по фазе цикла':'';
      }

      function syncStaticProfileWorkStatus(){
        const moscowDay=new Date(todayState().utc).getUTCDay();
        const rustamWeekend=moscowDay===0||moscowDay===6;
        setProfileWorkStatus(
          'Рустам',
          rustamWeekend?'Выходной':'Рабочий день',
          rustamWeekend?'off':'working'
        );
        const diana=profileStatusElement('Диана');
        if(diana&&!diana.dataset.calendarReady){
          setProfileWorkStatus('Диана','Проверяю график…','neutral');
        }
      }

      function setupProfileSplit(){
        const profile=document.querySelector('.profile');
        if(!profile||document.body.dataset.profileSplitReady==='1') return;

        const people=profile.querySelector('.profile-people');
        const selfIdentity=people?.querySelector('.identity-self');
        const partnerIdentity=people?.querySelector('.identity-partner');
        const mood=profile.querySelector('.profile-mood');
        const selfMood=mood?.querySelector('.mood-self');
        const partnerMood=mood?.querySelector('.mood-partner');
        const moodPrompt=document.getElementById('moodPrompt');
        const moodMessage=document.getElementById('moodMessage');
        const dateHeading=document.getElementById('profileMeta');
        if(!selfIdentity||!partnerIdentity||!selfMood||!partnerMood||!dateHeading) return;

        const selfPerson=selfIdentity.querySelector('.person');
        const partnerPerson=partnerIdentity.querySelector('.person');
        const partnerAvatar=partnerIdentity.querySelector('.partner-header-avatar');
        if(!selfPerson||!partnerPerson||!partnerAvatar) return;

        const selfStatus=document.createElement('div');
        selfStatus.id='selfWorkStatus';
        selfStatus.className='profile-work-status is-neutral';
        selfPerson.appendChild(selfStatus);

        const partnerStatus=document.createElement('div');
        partnerStatus.id='partnerWorkStatus';
        partnerStatus.className='profile-work-status is-neutral';
        partnerPerson.appendChild(partnerStatus);

        const dianaPerson=currentActor==='Диана'?selfPerson:partnerPerson;
        const dianaCycleMood=document.createElement('div');
        dianaCycleMood.id='dianaCycleMood';
        dianaCycleMood.className='profile-cycle-mood';
        dianaCycleMood.hidden=true;
        dianaCycleMood.title='Ориентировочно по фазе цикла';
        dianaPerson.appendChild(dianaCycleMood);

        /* Avatar left, name/status center, mood controls in the free area on the right. */
        selfIdentity.appendChild(selfMood);
        partnerIdentity.replaceChildren(partnerAvatar,partnerPerson,partnerMood);

        profile.className='profile-common-tile profile-date-only-tile';
        profile.dataset.homeTile='profile-common';
        profile.setAttribute('aria-label','Сегодня');
        dateHeading.className='profile-date-heading';
        profile.replaceChildren(dateHeading);

        const selfCard=document.createElement('section');
        selfCard.className='profile-split-card profile-person-card profile-self-card';
        selfCard.dataset.appTabSection='home';
        selfCard.dataset.homeTile='profile-self';
        selfCard.setAttribute('aria-label','Мой профиль');
        selfCard.append(selfIdentity);
        if(moodPrompt) selfCard.appendChild(moodPrompt);
        if(moodMessage) selfCard.appendChild(moodMessage);

        const partnerCard=document.createElement('section');
        partnerCard.className='profile-split-card profile-person-card profile-partner-card';
        partnerCard.dataset.appTabSection='home';
        partnerCard.dataset.homeTile='profile-partner';
        partnerCard.setAttribute('aria-label','Профиль партнёра');
        partnerCard.append(partnerIdentity);

        profile.after(selfCard,partnerCard);
        document.body.dataset.profileSplitReady='1';
        syncStaticProfileWorkStatus();
      }

      function readBlockStates(){
        try{
          const value=JSON.parse(localStorage.getItem(blockStateStorageKey())||'{}');
          return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
        }catch(_){return {}}
      }

      function getBlockCollapsed(key,fallback=false){
        const states=readBlockStates();
        return Object.prototype.hasOwnProperty.call(states,key)?Boolean(states[key]):Boolean(fallback);
      }

      function setBlockCollapsed(key,collapsed){
        try{
          const states=readBlockStates();
          states[key]=Boolean(collapsed);
          localStorage.setItem(blockStateStorageKey(),JSON.stringify(states));
        }catch(_){}
      }

      function collapseButton(label){
        const button=document.createElement('button');
        button.type='button';
        button.className='block-collapse-button';
        button.setAttribute('aria-label',label);
        button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m8 10 4 4 4-4"/></svg>';
        return button;
      }

      function wrapCollapseBody(section,selectors){
        const nodes=selectors.map(selector=>section.querySelector(selector)).filter(Boolean);
        if(!nodes.length) return null;
        const wrapper=document.createElement('div');
        wrapper.className='rudi-collapse-body';
        const inner=document.createElement('div');
        inner.className='rudi-collapse-body-inner';
        nodes[0].parentNode.insertBefore(wrapper,nodes[0]);
        wrapper.appendChild(inner);
        nodes.forEach(node=>inner.appendChild(node));
        return wrapper;
      }

      function addHeaderCollapseButton(section,host,button){
        if(host.classList.contains('section-heading')||host.classList.contains('partner-head')){
          let actions=host.querySelector(':scope > .block-head-actions');
          if(!actions){
            actions=document.createElement('div');
            actions.className='block-head-actions';
            const children=Array.from(host.children).slice(1);
            children.forEach(child=>actions.appendChild(child));
            host.appendChild(actions);
          }
          actions.appendChild(button);
          return;
        }
        host.appendChild(button);
      }

      function setupPersistentCollapsible({selector,key,bodySelectors,hostSelector,defaultCollapsed=false}){
        const section=document.querySelector(selector);
        if(!section||section.dataset.collapseReady==='1') return;
        const body=wrapCollapseBody(section,bodySelectors);
        const host=section.querySelector(hostSelector);
        if(!body||!host) return;
        section.dataset.collapseReady='1';
        section.classList.add('rudi-collapsible');
        const button=collapseButton('Свернуть или развернуть блок');
        addHeaderCollapseButton(section,host,button);

        const apply=collapsed=>{
          section.classList.toggle('is-collapsed',collapsed);
          button.setAttribute('aria-expanded',collapsed?'false':'true');
          body.setAttribute('aria-hidden',collapsed?'true':'false');
        };
        apply(getBlockCollapsed(key,defaultCollapsed));
        button.addEventListener('click',()=>{
          const collapsed=!section.classList.contains('is-collapsed');
          apply(collapsed);
          setBlockCollapsed(key,collapsed);
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });

        if(key==='partner'){
          section.querySelector('#partnerEditButton')?.addEventListener('click',()=>{
            if(section.classList.contains('is-collapsed')){
              apply(false);
              setBlockCollapsed(key,false);
            }
          });
        }
      }

      function setupPersistentCollapsibles(){
        setupPersistentCollapsible({
          selector:'#dianaCycleCard',key:'diana-cycle',
          bodySelectors:['#dianaCycleBody'],
          hostSelector:'.cycle-head'
        });
        setupPersistentCollapsible({
          selector:'.priority-section',key:'priority',
          bodySelectors:['.priority-grid'],
          hostSelector:'.section-heading'
        });
        setupPersistentCollapsible({
          selector:'.partner-message',key:'partner',
          bodySelectors:['#partnerMessageText','#partnerMessageAuthor','#partnerMessageReaction','#partnerEditor'],
          hostSelector:'.partner-head'
        });
        setupPersistentCollapsible({
          selector:'.daily-section',key:'daily',
          bodySelectors:['.daily-grid'],
          hostSelector:'.section-heading'
        });
        setupPersistentCollapsible({
          selector:'#workCalendarCard',key:'calendar-work',
          bodySelectors:['#workCalendarStatus','#workCalendarRanges','#workCalendarDays','#workCalendarSelected'],
          hostSelector:'.work-calendar-head'
        });
      }

      const fallback = {
        weather:{enabled:true,city:'Санкт-Петербург',latitude:59.9386,longitude:30.3141,timezone:TZ},
        birthdays:[
          {id:'rustam',name:'Рустам',year:1992,month:3,day:3},
          {id:'diana',name:'Диана',year:1996,month:6,day:30}
        ],
        importantDates:[{id:'new-year',title:'Новый год',month:1,day:1,recurring:true}],
        dailyIdeas:['Сделать небольшую прогулку без телефона.','Попробовать сегодня новый рецепт.','Устроить вечером час без соцсетей.','Написать близкому человеку что-нибудь приятное.'],
        watchList:['Достать ножи','Интерстеллар','Одержимость','Зелёная книга'],
        watchMinImdbRating:7,
        watchRatings:{'Достать ножи':7.9,'Интерстеллар':8.7,'Одержимость':8.5,'Зелёная книга':8.2},
        cookList:['Паста карбонара','Шакшука','Курица терияки с рисом','Сырники'],
        compliments:{
          male:['Сегодня ты выглядишь особенно уверенно.','У тебя отличный настрой — это чувствуется.','Сегодня определённо твой день.'],
          female:['Сегодня ты особенно прекрасно выглядишь.','У тебя очень приятная энергия сегодня.','Сегодня определённо твой день.'],
          neutral:['Сегодня отличный день, чтобы сделать что-то приятное для себя.','Пусть сегодняшний день приятно удивит.'],
          surpriseChance:.12,
          surprises:['Сегодня можно нарушить привычный сценарий и сделать что-нибудь неожиданно приятное.']
        },
        moodMessages:{
          low:[
            'Сегодня не обязательно быть на максимуме. Сделай один маленький шаг — этого уже достаточно.',
            'Пусть сегодня будет чуть бережнее к себе. Не всё нужно решать за один день.'
          ],
          ok:[
            'Спокойный настрой — хорошая база. Один уверенный шаг, и день уже пойдёт в нужную сторону.',
            'Нормальный день тоже можно сделать классным. Добавь в него одну приятную вещь.'
          ],
          great:[
            'Вот это настрой! Сохрани его — сегодня у тебя есть хороший разгон.',
            'Отличная энергия. Используй её на что-нибудь, чем вечером будешь доволен.'
          ]
        }
      };

      function applyTheme(){
        const theme = tg?.colorScheme || (media.matches ? 'dark' : 'light');
        root.dataset.theme = theme;
        metaTheme.setAttribute('content',theme === 'dark' ? '#0b0d12' : '#f4f5f7');
        try{
          tg?.setHeaderColor?.(theme === 'dark' ? '#0b0d12' : '#f4f5f7');
          tg?.setBackgroundColor?.(theme === 'dark' ? '#0b0d12' : '#f4f5f7');
          tg?.setBottomBarColor?.(theme === 'dark' ? '#0b0d12' : '#f4f5f7');
        }catch(_){}
      }

      function updateTelegramSafeArea(){
        const contentTop=Number(tg?.contentSafeAreaInset?.top)||0;
        const safeTop=Number(tg?.safeAreaInset?.top)||0;
        const telegramOpen=Boolean(tg?.initData);
        const iosUserAgent=/iPhone|iPad|iPod/i.test(String(navigator?.userAgent||''));
        const isIos=telegramOpen&&(tg?.platform==='ios'||iosUserAgent);
        const toolbarReserve=isIos ? 96 : (telegramOpen ? 64 : 0);
        const reportedTop=Math.max(contentTop,safeTop);
        const top=Math.max(reportedTop,toolbarReserve);
        root.style.setProperty('--tg-content-safe-top',Math.max(0,top)+'px');
      }

      function cacheHolidayItems(items){
        const rows=(Array.isArray(items)?items:[]).slice(0,5).filter(Boolean);
        if(!rows.length) return rows;
        holidayItemsCache=rows;
        try{localStorage.setItem('rudi-holiday-highlights-'+todayState().key,JSON.stringify(rows))}catch(_){}
        return rows;
      }

      function denyApp(title,text){
        document.body.classList.remove('auth-pending','auth-ok');
        document.body.classList.add('auth-denied');
        document.getElementById('appGateTitle').textContent=title;
        document.getElementById('appGateText').textContent=text;
      }

      async function authenticateApp(){
        if(!tg?.initData){
          denyApp('Откройте RUDI в Telegram','Приложение доступно только через ваш Telegram-бот.');
          return false;
        }
        try{
          const backupToken=await withTimeout(readStateBackupToken(),1200,'');
          const response=await fetchWithTimeout('/api/partner-message?rudiAction=app-auth',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData,backupToken,ticktickHandoff:ticktickHandoffToken}),
            cache:'no-store'
          },8000);
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok) throw new Error(payload.error||'access');
          currentActor=String(payload.actor||'');
          clearLegacyStateBackup().catch(()=>{});
          if(payload.backupToken) await storeStateBackupToken(payload.backupToken);
          if(ticktickHandoffToken){
            ticktickHandoffToken='';
            try{
              const url=new URL(window.location.href);
              url.searchParams.delete('ticktickHandoff');
              url.searchParams.delete('ticktick');
              history.replaceState(null,'',url.pathname+(url.search||'')+(url.hash||''));
            }catch(_){}
          }
          applyTelegramProfiles(payload.selfProfile,payload.partnerProfile);
          cacheHolidayItems(payload.holidayHighlights);
          document.body.classList.remove('auth-pending','auth-denied');
          document.body.classList.add('auth-ok');
          return true;
        }catch(error){
          const code=String(error?.message||'');
          denyApp(
            code==='rudi-access-denied'?'Доступ закрыт':'Не удалось проверить доступ',
            code==='rudi-access-denied'
              ?'RUDI работает только для Рустама и Дианы.'
              :'Закройте приложение и откройте его снова из Telegram.'
          );
          return false;
        }
      }

      const preventGestureZoom=event=>event.preventDefault();
      document.addEventListener('gesturestart',preventGestureZoom,{passive:false});
      document.addEventListener('gesturechange',preventGestureZoom,{passive:false});
      document.addEventListener('gestureend',preventGestureZoom,{passive:false});
      document.addEventListener('touchmove',event=>{
        if(event.touches&&event.touches.length>1) event.preventDefault();
      },{passive:false});

      applyTheme();
      tg?.ready?.();
      tg?.expand?.();
      updateTelegramSafeArea();
      setTimeout(updateTelegramSafeArea,60);
      setTimeout(updateTelegramSafeArea,300);
      tg?.onEvent?.('themeChanged',()=>{applyTheme();setTimeout(()=>ensureAppSurface(),0)});
      tg?.onEvent?.('safeAreaChanged',()=>{updateTelegramSafeArea();setTimeout(()=>ensureAppSurface(),0)});
      tg?.onEvent?.('contentSafeAreaChanged',()=>{updateTelegramSafeArea();setTimeout(()=>ensureAppSurface(),0)});
      tg?.onEvent?.('viewportChanged',()=>setTimeout(()=>ensureAppSurface(),0));
      tg?.onEvent?.('fullscreenChanged',()=>setTimeout(()=>ensureAppSurface(),0));
      media.addEventListener?.('change',()=>{if(!tg?.initData) applyTheme()});

      const user = tg?.initDataUnsafe?.user;
      const displayName = document.getElementById('displayName');
      const avatar = document.getElementById('avatar');
      const avatarImage = document.getElementById('avatarImage');
      const initials = document.getElementById('initials');
      let firstName = '';

      if(user){
        const fullName = [user.first_name,user.last_name].filter(Boolean).join(' ').trim() || 'Пользователь';
        firstName = (user.first_name || '').trim();
        const visibleName = firstName || fullName.split(/\s+/)[0] || 'Пользователь';
        displayName.textContent = visibleName;
        initials.textContent = visibleName.charAt(0).toUpperCase() || 'T';
        if(user.photo_url){
          avatarImage.src = user.photo_url;
          avatarImage.alt = 'Фото профиля ' + fullName;
          avatarImage.addEventListener('load',()=>avatar.classList.add('has-photo'),{once:true});
          avatarImage.addEventListener('error',()=>avatar.classList.remove('has-photo'),{once:true});
        }
      }

      function initialsForName(value,fallback='П'){
        const parts=String(value||'').trim().split(/\s+/).filter(Boolean);
        return (parts.length?parts.map(part=>part.charAt(0)).join(''):fallback).slice(0,2).toUpperCase();
      }

      function setWishlistProfile(actor,profile){
        const holder=document.getElementById(actor==='Рустам'?'wishlistRustamAvatar':'wishlistDianaAvatar');
        if(!holder) return;
        const image=holder.querySelector('img');
        const initial=holder.querySelector('.wishlist-avatar-initial');
        const name=String(profile?.name||actor).trim().split(/\s+/)[0]||actor;
        if(initial) initial.textContent=name.charAt(0).toUpperCase();
        const photo=String(profile?.photoDataUrl||'').trim();
        if(image){
          image.alt='Фото профиля '+name;
          if(photo){
            image.src=photo;
            image.addEventListener('load',()=>holder.classList.add('has-photo'),{once:true});
            image.addEventListener('error',()=>holder.classList.remove('has-photo'),{once:true});
          }else{
            image.removeAttribute('src');
            holder.classList.remove('has-photo');
          }
        }
      }

      function applyTelegramProfiles(selfProfile,partnerProfile){
        if(!avatar.classList.contains('has-photo')&&selfProfile?.photoDataUrl){
          avatarImage.src=String(selfProfile.photoDataUrl);
          avatarImage.alt='Фото профиля '+(displayName.textContent||'Telegram');
          avatarImage.addEventListener('load',()=>avatar.classList.add('has-photo'),{once:true});
          avatarImage.addEventListener('error',()=>avatar.classList.remove('has-photo'),{once:true});
        }

        const rawPartnerName=String(partnerProfile?.name||'').trim()
          || (currentActor==='Рустам'?'Диана':currentActor==='Диана'?'Рустам':'Партнёр');
        const partnerName=rawPartnerName.split(/\s+/)[0]||'Партнёр';
        partnerProfileName=partnerName;

        const label=document.getElementById('partnerMoodLabel');
        const headerName=document.getElementById('partnerHeaderName');
        const holder=document.getElementById('partnerProfileAvatar');
        const image=document.getElementById('partnerProfileImage');
        const initial=document.getElementById('partnerProfileInitial');

        if(label) label.textContent=partnerName;
        if(headerName) headerName.textContent=partnerName;
        if(initial) initial.textContent=initialsForName(partnerName,'П');
        if(image&&holder){
          image.alt='Фото профиля '+partnerName;
          const photo=String(partnerProfile?.photoDataUrl||'').trim();
          if(photo){
            image.src=photo;
            image.addEventListener('load',()=>holder.classList.add('has-photo'),{once:true});
            image.addEventListener('error',()=>holder.classList.remove('has-photo'),{once:true});
          }else{
            image.removeAttribute('src');
            holder.classList.remove('has-photo');
          }
        }

        const selfForWishlist={
          name:firstName||currentActor,
          photoDataUrl:String(user?.photo_url||selfProfile?.photoDataUrl||'').trim()
        };
        setWishlistProfile('Рустам',currentActor==='Рустам'?selfForWishlist:partnerProfile);
        setWishlistProfile('Диана',currentActor==='Диана'?selfForWishlist:partnerProfile);
      }

      function getMoscowParts(date=new Date()){
        return Object.fromEntries(
          new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'numeric',day:'numeric'})
            .formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])
        );
      }

      function todayState(){
        const p = getMoscowParts();
        const utc = Date.UTC(p.year,p.month-1,p.day);
        const key = [p.year,String(p.month).padStart(2,'0'),String(p.day).padStart(2,'0')].join('-');
        return {parts:p,utc,key};
      }

      function updateClock(){
        const now = new Date();
        const weekdayRaw = new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:TZ}).format(now);
        const weekday = weekdayRaw.replace('.', '').toUpperCase();
        const date = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:TZ}).format(now);
        document.getElementById('profileMeta').textContent = weekday+' · '+date;
      }
      updateClock();
      setInterval(updateClock,30000);

      document.getElementById('currentYear').textContent = new Intl.DateTimeFormat('en',{year:'numeric',timeZone:TZ}).format(new Date());

      function updateYearProgress(){
        const {parts,utc}=todayState();
        const start=Date.UTC(parts.year,0,1);
        const end=Date.UTC(parts.year+1,0,1);
        const progress=Math.max(0,Math.min(100,((utc-start)/(end-start))*100));
        const percent=document.getElementById('yearProgressPercent');
        const bar=document.getElementById('yearProgressBar');
        if(percent) percent.textContent=progress.toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
        if(bar) bar.style.width=progress.toFixed(3)+'%';
      }
      updateYearProgress();

      function dayWord(value){
        const mod10=value%10, mod100=value%100;
        if(mod10===1 && mod100!==11) return 'день';
        if(mod10>=2 && mod10<=4 && (mod100<12 || mod100>14)) return 'дня';
        return 'дней';
      }
      function daysLabel(days){return days===0?'сегодня':days+' '+dayWord(days)}
      function streakWord(value){
        const mod10=value%10, mod100=value%100;
        if(mod10===1 && mod100!==11) return 'день подряд';
        if(mod10>=2 && mod10<=4 && (mod100<12 || mod100>14)) return 'дня подряд';
        return 'дней подряд';
      }
      function dateLabel(month,day){
        return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2024,month-1,day)));
      }
      function nextOccurrence(month,day){
        const {parts,utc}=todayState();
        let target=Date.UTC(parts.year,month-1,day);
        let year=parts.year;
        if(target<utc){year++;target=Date.UTC(year,month-1,day)}
        return {year,days:Math.round((target-utc)/DAY),target};
      }
      function detectNameType(name){
        const value=String(name||'').trim().toLowerCase();
        if(!value) return 'neutral';
        const male=new Set(['александр','алексей','андрей','антон','артем','артём','вадим','валерий','виктор','владимир','владислав','дмитрий','евгений','егор','иван','илья','кирилл','константин','максим','михаил','никита','николай','олег','павел','роман','руслан','рустам','сергей','станислав','тимур','федор','фёдор','юрий']);
        const female=new Set(['александра','алёна','алена','алина','алиса','анастасия','анна','валерия','виктория','дарья','диана','екатерина','елена','ирина','карина','кристина','ксения','марина','мария','наталья','ольга','полина','светлана','софия','софья','татьяна','юлия']);
        if(male.has(value)) return 'male';
        if(female.has(value)) return 'female';
        if(/[ая]$/.test(value)&&!/(никита|илья|кузьма|фома|лука)$/.test(value)) return 'female';
        if(/(й|н|р|м|л|в|г|д|т|с|б|п|к|ч|ш|ж|ф)$/.test(value)) return 'male';
        return 'neutral';
      }
      function dailyComplimentStorageKey(){
        return 'rudi-daily-compliment-v2';
      }

      function renderDailyCompliment(config,{force=false}={}){
        const state=todayState();
        if(!force&&currentComplimentDateKey===state.key) return;
        const dayIndex=Math.floor(state.utc/DAY);
        const type=detectNameType(firstName);
        const compliments=config?.compliments||fallback.compliments;
        const regularPool=compliments[type]||compliments.neutral||fallback.compliments.neutral;
        const surpriseChance=Number(compliments.surpriseChance)||0;
        const useSurprise=(compliments.surprises?.length||0)>0&&dailyStableUnit(dayIndex,17)<surpriseChance;
        const pool=useSurprise?compliments.surprises:regularPool;
        let value=dailyStableItem(pool,dayIndex,53);

        let previous=null;
        try{previous=JSON.parse(localStorage.getItem(dailyComplimentStorageKey())||'null')}catch(_){}
        if(previous?.date!==state.key&&previous?.text===value){
          const fallbackPool=(Array.isArray(pool)&&pool.length>1)?pool:regularPool;
          if(Array.isArray(fallbackPool)&&fallbackPool.length>1){
            const index=Math.max(0,fallbackPool.indexOf(value));
            value=fallbackPool[(index+1)%fallbackPool.length];
          }
        }

        const node=document.getElementById('compliment');
        if(node) node.textContent=String(value||'');
        currentComplimentDateKey=state.key;
        try{localStorage.setItem(dailyComplimentStorageKey(),JSON.stringify({date:state.key,text:String(value||'')}))}catch(_){}
      }

      function secureRandom(){if(window.crypto?.getRandomValues){const a=new Uint32Array(1);window.crypto.getRandomValues(a);return a[0]/4294967296}return Math.random()}
      function randomItem(list){return list[Math.floor(secureRandom()*list.length)]}

      function dailyStableUnit(dayIndex,salt=0){
        const seed=(Math.imul((Number(dayIndex)||0)^0x9e3779b9,1664525)+Math.imul(Number(salt)||0,1013904223))>>>0;
        return seed/4294967296;
      }
      function dailyStableItem(list,dayIndex,salt=0){
        if(!Array.isArray(list)||!list.length) return '';
        return list[Math.floor(dailyStableUnit(dayIndex,salt)*list.length)%list.length];
      }

      async function loadConfig(){
        try{
          const response=await fetch(CONFIG_URL+'?t='+Date.now(),{cache:'no-store'});
          if(!response.ok) throw new Error('config');
          const remote=await response.json();
          return {...fallback,...remote,compliments:{...fallback.compliments,...remote.compliments},weather:{...fallback.weather,...remote.weather},cycle:{...fallback.cycle,...remote.cycle}};
        }catch(_){return fallback}
      }

      function parseCycleDate(value){
        const match=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!match) return null;
        const utc=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]));
        return Number.isFinite(utc)?utc:null;
      }

      function cycleDateLabel(utc){
        if(!Number.isFinite(utc)) return '—';
        return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(utc));
      }

      function cycleRangeLabel(startUtc,lengthDays){
        if(!Number.isFinite(startUtc)) return '—';
        const length=Math.max(1,Math.round(Number(lengthDays)||5));
        return cycleDateLabel(startUtc)+' — '+cycleDateLabel(startUtc+(length-1)*DAY);
      }

      function dianaCycleModel(cfg){
        const source=cfg&&typeof cfg==='object'?cfg:{};
        const history=(Array.isArray(source.historyStarts)?source.historyStarts:[])
          .map(parseCycleDate)
          .filter(Number.isFinite)
          .sort((a,b)=>a-b);
        const diffs=[];
        for(let index=1;index<history.length;index++){
          const days=Math.round((history[index]-history[index-1])/DAY);
          if(days>=20&&days<=45) diffs.push(days);
        }
        const configuredLength=Math.max(20,Math.min(45,Math.round(Number(source.cycleLengthDays)||30)));
        const recent=diffs.slice(-6);
        const cycleLength=recent.length
          ?Math.round(recent.reduce((sum,value)=>sum+value,0)/recent.length)
          :configuredLength;
        const periodLength=Math.max(1,Math.min(10,Math.round(Number(source.periodLengthDays)||5)));
        const ovulationDay=Math.max(8,Math.min(cycleLength-5,Math.round(Number(source.ovulationDay)||Math.max(10,cycleLength-14))));
        const fertileStart=Math.max(1,Math.round(Number(source.fertileWindowStartDay)||Math.max(1,ovulationDay-4)));
        const fertileEnd=Math.min(cycleLength,Math.round(Number(source.fertileWindowEndDay)||Math.min(cycleLength,ovulationDay+2)));
        const {utc:todayUtc}=todayState();
        const pastStarts=history.filter(value=>value<=todayUtc);
        const latestActualStart=pastStarts.length?pastStarts[pastStarts.length-1]:null;
        let nextStart=parseCycleDate(source.nextPeriodStart);
        if(!Number.isFinite(nextStart)&&Number.isFinite(latestActualStart)) nextStart=latestActualStart+cycleLength*DAY;
        while(Number.isFinite(nextStart)&&nextStart+(periodLength-1)*DAY<todayUtc) nextStart+=cycleLength*DAY;
        const periodActive=Number.isFinite(nextStart)
          &&todayUtc>=nextStart
          &&todayUtc<=nextStart+(periodLength-1)*DAY;
        const currentStart=Number.isFinite(nextStart)
          ?(periodActive?nextStart:nextStart-cycleLength*DAY)
          :latestActualStart;
        const cycleDay=Number.isFinite(currentStart)
          ?Math.max(1,Math.min(cycleLength,Math.floor((todayUtc-currentStart)/DAY)+1))
          :null;
        const daysToNext=Number.isFinite(nextStart)?Math.max(0,Math.round((nextStart-todayUtc)/DAY)):null;
        const currentOvulationUtc=Number.isFinite(currentStart)?currentStart+(ovulationDay-1)*DAY:null;
        const ovulationUtc=Number.isFinite(currentOvulationUtc)&&currentOvulationUtc>=todayUtc
          ?currentOvulationUtc
          :Number.isFinite(nextStart)?nextStart+(ovulationDay-1)*DAY:null;
        let phase='Недостаточно данных';
        if(periodActive) phase='Месячные';
        else if(Number.isFinite(currentStart)&&cycleDay){
          if(cycleDay>=fertileStart&&cycleDay<=fertileEnd) phase='Фертильное окно';
          else if(cycleDay<fertileStart) phase='Фолликулярная фаза';
          else phase='Лютеиновая фаза';
        }
        return {
          cycleLength,periodLength,ovulationDay,fertileStart,fertileEnd,
          currentStart,nextStart,cycleDay,daysToNext,ovulationUtc,phase,
          progress:cycleDay?Math.max(0,Math.min(100,(cycleDay/cycleLength)*100)):0,
          historyCount:history.length
        };
      }

      function renderDianaCycle(cfg){
        const card=document.getElementById('dianaCycleCard');
        if(!card) return;
        const countdown=document.getElementById('dianaCycleCountdown');
        const countdownLabel=document.getElementById('dianaCycleCountdownLabel');
        const phase=document.getElementById('dianaCyclePhase');
        const cycleDay=document.getElementById('dianaCycleDay');
        const progress=document.getElementById('dianaCycleProgress');
        const period=document.getElementById('dianaCyclePeriod');
        const ovulation=document.getElementById('dianaCycleOvulation');
        const note=document.getElementById('dianaCycleNote');
        const recordButton=document.getElementById('dianaCycleStartToday');

        if(!cfg||cfg.enabled===false){
          setDianaCycleMood('');
          countdown.textContent='—';
          countdownLabel.textContent='данные цикла недоступны';
          phase.textContent='Нет данных';
          cycleDay.textContent='—';
          progress.style.width='0%';
          period.textContent='—';
          ovulation.textContent='—';
          note.textContent='Прогноз появится после загрузки данных.';
          if(recordButton) recordButton.disabled=true;
          return;
        }

        if(recordButton) recordButton.disabled=false;
        const model=dianaCycleModel(cfg);
        setDianaCycleMood(model.phase);
        if(Number.isFinite(model.daysToNext)){
          if(model.daysToNext>0){
            countdown.textContent=String(model.daysToNext);
            countdownLabel.textContent=dayWord(model.daysToNext)+' до месячных';
          }else{
            countdown.textContent='Сегодня';
            countdownLabel.textContent='ожидаемое начало месячных';
          }
        }else{
          countdown.textContent='—';
          countdownLabel.textContent='недостаточно данных';
        }
        phase.textContent=model.phase;
        cycleDay.textContent=model.cycleDay
          ?model.cycleDay+'-й день цикла · средний цикл '+model.cycleLength+' '+dayWord(model.cycleLength)
          :'Недостаточно истории';
        progress.style.width=model.progress.toFixed(1)+'%';
        period.textContent=cycleRangeLabel(model.nextStart,model.periodLength);
        if(Number.isFinite(model.ovulationUtc)){
          const diff=Math.max(0,Math.round((model.ovulationUtc-todayState().utc)/DAY));
          ovulation.textContent='≈ '+cycleDateLabel(model.ovulationUtc)+(diff===0?' · сегодня':' · через '+diff+' '+dayWord(diff));
        }else{
          ovulation.textContent='—';
        }
        note.textContent='Прогноз по '+Math.max(1,model.historyCount)+' отмеченным циклам. Даты ориентировочные и не подходят для контрацепции.';
      }

      async function cycleRequest(operation,payload={}){
        const response=await fetchWithTimeout('/api/cycle',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation,...payload}),
          cache:'no-store'
        },8000);
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'cycle-unavailable');
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        return data;
      }

      async function loadDianaCycle({silent=false}={}){
        const card=document.getElementById('dianaCycleCard');
        if(!card||!currentActor||!tg?.initData) return;
        try{
          const data=await cycleRequest('get');
          renderDianaCycle(data.configured?data.cycle:null);
        }catch(_){
          if(!silent) renderDianaCycle(null);
        }
      }

      function confirmCycleStart(){
        return new Promise(resolve=>{
          try{
            if(tg?.showConfirm){
              tg.showConfirm('Отметить сегодня как первый день нового цикла?',value=>resolve(Boolean(value)));
              return;
            }
          }catch(_){}
          resolve(window.confirm('Отметить сегодня как первый день нового цикла?'));
        });
      }

      function setupDianaCycleActions(){
        const actions=document.getElementById('dianaCycleActions');
        const button=document.getElementById('dianaCycleStartToday');
        if(!actions||!button) return;
        actions.hidden=currentActor!=='Диана';
        if(button.dataset.bound==='1') return;
        button.dataset.bound='1';
        button.addEventListener('click',async()=>{
          if(currentActor!=='Диана'||button.disabled) return;
          if(!await confirmCycleStart()) return;
          button.disabled=true;
          const original=button.textContent;
          button.textContent='Сохраняю…';
          try{
            const data=await cycleRequest('record-start');
            renderDianaCycle(data.cycle);
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            button.textContent=original;
            button.disabled=false;
          }
        });
      }

      function weatherVisualType(code){
        const value=Number(code);
        if(value===0) return 'clear';
        if(value===1) return 'partly';
        if(value===2||value===3) return 'cloudy';
        if(value===45||value===48) return 'fog';
        if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(value)) return 'rain';
        if([71,73,75,77,85,86].includes(value)) return 'snow';
        if([95,96,99].includes(value)) return 'storm';
        return 'cloudy';
      }

      function setWeatherVisual(code){
        const visual=document.getElementById('weatherVisual');
        if(visual) visual.dataset.weather=code===null||code===undefined?'idle':weatherVisualType(code);
      }

      async function loadWeather(cfg){
        const elValue=document.getElementById('weatherValue');
        const elCaption=document.getElementById('weatherCaption');
        const elRain=document.getElementById('weatherRain');
        const elCity=document.getElementById('weatherCity');
        if(!cfg?.enabled){
          setWeatherVisual(null);
          elCaption.textContent='Погода выключена';
          elRain.textContent='Прогноз дождя выключен';
          return;
        }
        try{
          const query=[
            'latitude='+encodeURIComponent(cfg.latitude),
            'longitude='+encodeURIComponent(cfg.longitude),
            'current=temperature_2m,apparent_temperature,weather_code,precipitation,rain',
            'hourly=precipitation_probability,precipitation,rain',
            'forecast_days=1',
            'timezone='+encodeURIComponent(cfg.timezone||TZ)
          ].join('&');
          const r=await fetch('https://api.open-meteo.com/v1/forecast?'+query,{cache:'no-store'});
          if(!r.ok) throw new Error('weather');
          const data=await r.json();
          const c=data.current||{};
          const labels={0:'Ясно',1:'Преимущественно ясно',2:'Облачно',3:'Пасмурно',45:'Туман',48:'Туман',51:'Морось',53:'Морось',55:'Морось',61:'Дождь',63:'Дождь',65:'Сильный дождь',71:'Снег',73:'Снег',75:'Сильный снег',80:'Ливень',81:'Ливень',82:'Сильный ливень',95:'Гроза'};

          const times=Array.isArray(data.hourly?.time)?data.hourly.time:[];
          const probabilities=Array.isArray(data.hourly?.precipitation_probability)?data.hourly.precipitation_probability:[];
          const precipitation=Array.isArray(data.hourly?.precipitation)?data.hourly.precipitation:[];
          const rain=Array.isArray(data.hourly?.rain)?data.hourly.rain:[];
          const currentHour=String(c.time||'').slice(0,13)+':00';
          let start=times.indexOf(currentHour);
          if(start<0) start=times.findIndex(time=>String(time)>=currentHour);
          if(start<0) start=0;

          const end=times.length;
          const nextProb=probabilities.slice(start,end).map(Number).filter(Number.isFinite);
          const nextPrecip=precipitation.slice(start,end).map(Number).filter(Number.isFinite);
          const nextRain=rain.slice(start,end).map(Number).filter(Number.isFinite);
          const maxProbability=nextProb.length?Math.max(...nextProb):0;
          const totalPrecip=nextPrecip.reduce((sum,value)=>sum+value,0);
          const totalRain=nextRain.reduce((sum,value)=>sum+value,0);
          const rainingNow=Number(c.rain||0)>0 || Number(c.precipitation||0)>0;

          let rainText;
          if(rainingNow){
            rainText='Дождь идёт сейчас · нужен ☔️';
          }else if(maxProbability>=60 || totalRain>=0.5 || totalPrecip>=0.8){
            rainText='Дождь ожидается сегодня · лучше взять ☔️';
          }else if(maxProbability>=30 || totalRain>0 || totalPrecip>0){
            rainText='Дождь возможен сегодня · ☔️ по желанию';
          }else{
            rainText='Сегодня дождя не ожидается · ☔️ не нужен';
          }

          setWeatherVisual(c.weather_code);
          elValue.textContent=Math.round(c.temperature_2m)+'°';
          elCity.textContent=cfg.city==='Санкт-Петербург'?'СПб':(cfg.city||'');
          elCaption.textContent=labels[c.weather_code]||'Погода';
          elRain.textContent=rainText;
        }catch(_){
          setWeatherVisual(null);
          elValue.textContent='—';
          elCaption.textContent='Погода недоступна';
          elRain.textContent='Не удалось проверить дождь';
        }
      }

      function formatTickTickDate(task){
        if(!task?.startDate) return '';
        const date=new Date(task.startDate);
        if(Number.isNaN(date.getTime())) return '';
        const dateText=new Intl.DateTimeFormat('ru-RU',{
          day:'numeric',
          month:'long',
          timeZone:TZ
        }).format(date);
        if(task.isAllDay) return dateText;
        const timeText=new Intl.DateTimeFormat('ru-RU',{
          hour:'2-digit',
          minute:'2-digit',
          timeZone:TZ
        }).format(date);
        return dateText+' · '+timeText;
      }

      function setTickTickExpanded(expanded){
        const panel=document.getElementById('ticktickPanel');
        const toggle=document.getElementById('ticktickToggle');
        const details=document.getElementById('ticktickDetails');
        if(!panel.classList.contains('expandable')) expanded=false;
        panel.classList.toggle('expanded',expanded);
        toggle.setAttribute('aria-expanded',expanded?'true':'false');
        details.setAttribute('aria-hidden',expanded?'false':'true');
      }

      function tickTickChecklistAuditText(item){
        const actor=String(item?.changedBy||'').trim();
        if(!actor) return '';
        if(item?.completed){
          return actor==='Диана'?'Отметила Диана':'Отметил Рустам';
        }
        return actor==='Диана'?'Сняла отметку Диана':'Снял отметку Рустам';
      }

      function showTickTickWritePermission(){
        const badge=document.getElementById('ticktickBadge');
        const connect=document.getElementById('ticktickConnect');
        badge.hidden=false;
        badge.textContent='Нужно разрешение';
        connect.textContent='Разрешить отметки';
        connect.classList.add('show');
      }

      async function toggleTickTickChecklistItem(task,item,row,writable){
        if(!task?.id||!item?.id||row?.dataset?.busy==='1') return;
        if(writable===false){
          showTickTickWritePermission();
          try{tg?.HapticFeedback?.notificationOccurred?.('warning')}catch(_){}
          return;
        }

        const nextCompleted=!Boolean(item.completed);
        const checklist=document.getElementById('ticktickChecklist');
        const checklistRows=[...(checklist?.querySelectorAll('.ticktick-check-item')||[])];
        for(const checklistRow of checklistRows) checklistRow.disabled=true;
        row.dataset.busy='1';
        row.classList.add('syncing');

        const meta=row.querySelector('.ticktick-check-meta');
        const previousMeta=meta?.textContent||'';
        if(meta){
          meta.hidden=false;
          meta.textContent='Сохраняю в TickTick…';
        }

        try{
          const response=await fetch('/api/ticktick/checklist-toggle',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              initData:tg?.initData||'',
              backupToken:currentStateBackupToken,
              taskId:task.id,
              itemId:item.id,
              completed:nextCompleted
            }),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));

          if((response.status===401||response.status===403)&&payload.reconnectRequired){
            showTickTickWritePermission();
            if(meta){
              meta.hidden=false;
              meta.textContent='Нужно разрешить изменения в TickTick';
            }
            try{tg?.HapticFeedback?.notificationOccurred?.('warning')}catch(_){}
            return;
          }
          if(!response.ok||!payload.ok) throw new Error(payload.error||'ticktick-checklist-toggle');

          item.completed=Boolean(payload.item?.completed);
          item.changedBy=String(payload.item?.changedBy||currentActor||'');
          item.changedAt=String(payload.item?.changedAt||'');
          await loadTickTickNext({preserveExpanded:true});
          try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          setTimeout(()=>refreshStateBackup(),250);
        }catch(_){
          const badge=document.getElementById('ticktickBadge');
          badge.hidden=false;
          badge.textContent='Ошибка синхронизации';
          if(meta){
            meta.hidden=!previousMeta;
            meta.textContent=previousMeta;
          }
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }finally{
          row.dataset.busy='0';
          row.classList.remove('syncing');
          for(const checklistRow of checklistRows){
            if(checklistRow.isConnected) checklistRow.disabled=false;
          }
        }
      }

      function renderTickTickDetails(task,{writable=true,preserveExpanded=false}={}){
        const panel=document.getElementById('ticktickPanel');
        const toggle=document.getElementById('ticktickToggle');
        const descriptionBlock=document.getElementById('ticktickDescriptionBlock');
        const description=document.getElementById('ticktickDescription');
        const checklistBlock=document.getElementById('ticktickChecklistBlock');
        const checklist=document.getElementById('ticktickChecklist');
        const wasExpanded=preserveExpanded&&panel.classList.contains('expanded');

        const descriptionText=String(task?.description||'').trim();
        const items=Array.isArray(task?.checklist)?task.checklist.filter(item=>item?.title):[];
        const hasDetails=Boolean(descriptionText||items.length);

        description.textContent=descriptionText;
        descriptionBlock.classList.toggle('hidden',!descriptionText);

        checklist.replaceChildren();
        checklistBlock.classList.toggle('hidden',!items.length);
        for(const item of items){
          const row=document.createElement('button');
          row.type='button';
          row.className='ticktick-check-item'+(item.completed?' done':'');
          row.disabled=!item?.id||!task?.id;
          row.setAttribute('aria-pressed',item.completed?'true':'false');
          row.setAttribute('aria-label',(item.completed?'Снять отметку: ':'Отметить: ')+item.title);

          const box=document.createElement('span');
          box.className='ticktick-check-box';
          box.setAttribute('aria-hidden','true');
          if(item.completed){
            box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-9"/></svg>';
          }

          const copy=document.createElement('span');
          copy.className='ticktick-check-copy';

          const label=document.createElement('span');
          label.className='ticktick-check-label';
          label.textContent=item.title;

          const meta=document.createElement('span');
          meta.className='ticktick-check-meta';
          const auditText=tickTickChecklistAuditText(item);
          meta.textContent=auditText;
          meta.hidden=!auditText;

          copy.append(label,meta);
          row.append(box,copy);
          row.addEventListener('click',()=>toggleTickTickChecklistItem(task,item,row,writable));
          checklist.appendChild(row);
        }

        panel.classList.toggle('expandable',hasDetails);
        toggle.tabIndex=hasDetails?0:-1;
        setTickTickExpanded(Boolean(wasExpanded&&hasDetails));
      }

      function renderTickTickState(payload,{preserveExpanded=false}={}){
        const title=document.getElementById('ticktickTitle');
        const date=document.getElementById('ticktickDate');
        const assignee=document.getElementById('ticktickAssignee');
        const badge=document.getElementById('ticktickBadge');
        const connect=document.getElementById('ticktickConnect');

        connect.classList.remove('show');
        connect.textContent='Подключить TickTick';
        date.textContent='';
        assignee.textContent='';
        assignee.hidden=true;

        if(payload?.configured===false){
          renderTickTickDetails(null);
          title.textContent='Интеграция TickTick ещё не настроена.';
          badge.hidden=false;
          badge.textContent='Настройка';
          return;
        }

        if(payload?.connected===false){
          renderTickTickDetails(null);
          title.textContent='Подключите общий список TickTick.';
          badge.hidden=false;
          badge.textContent='Не подключён';
          connect.classList.add('show');
          return;
        }

        if(payload?.enabled===false){
          renderTickTickDetails(null);
          title.textContent='Синхронизация TickTick выключена.';
          badge.hidden=false;
          badge.textContent='Выключено';
          return;
        }

        if(!payload?.task){
          renderTickTickDetails(null);
          title.textContent='В общем списке нет ближайших задач с датой.';
          badge.hidden=true;
          badge.textContent='';
          if(payload?.writable===false) showTickTickWritePermission();
          return;
        }

        title.textContent=payload.task.title||'Без названия';
        date.textContent=formatTickTickDate(payload.task);
        if(payload.task.assigned){
          assignee.hidden=false;
          assignee.textContent='Ответственный: '+payload.task.assignee;
        }else{
          assignee.hidden=true;
          assignee.textContent='';
        }

        badge.hidden=true;
        badge.textContent='';
        if(payload?.writable===false) showTickTickWritePermission();
        renderTickTickDetails(payload.task,{
          writable:payload?.writable!==false,
          preserveExpanded
        });
      }

      function playTaskCompletionConfetti(){
        const host=document.getElementById('taskCompletionConfetti');
        if(!host) return;
        try{if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return}catch(_){}
        host.replaceChildren();
        host.classList.remove('is-active');
        const palette=['var(--green)','var(--accent)','var(--love)','#f4c95d','#72c6ff','#d98cff'];
        for(let index=0;index<26;index++){
          const piece=document.createElement('i');
          piece.className='calendar-confetti-piece'+(index%5===0?' is-round':'');
          piece.style.setProperty('--confetti-x',(4+Math.random()*92).toFixed(2)+'%');
          piece.style.setProperty('--confetti-drift',((-54+Math.random()*108).toFixed(1))+'px');
          piece.style.setProperty('--confetti-delay',(Math.random()*.34).toFixed(3)+'s');
          piece.style.setProperty('--confetti-duration',(1.0+Math.random()*.7).toFixed(3)+'s');
          piece.style.setProperty('--confetti-turn',(360+Math.round(Math.random()*540))+'deg');
          piece.style.setProperty('--confetti-color',palette[index%palette.length]);
          host.appendChild(piece);
        }
        requestAnimationFrame(()=>host.classList.add('is-active'));
        setTimeout(()=>{host.classList.remove('is-active');host.replaceChildren()},2100);
      }

      function tickTickTodayTaskMeta(task){
        const start=String(task?.startTime||'').trim();
        const end=String(task?.endTime||'').trim();
        const time=task?.allDay?'Весь день':(start&&end&&start===end?start:[start,end].filter(Boolean).join('–'));
        const assignee=task?.assigned&&task?.assignee&&task.assignee!=='Не назначен'?'Ответственный: '+task.assignee:'';
        return [time,assignee].filter(Boolean).join(' · ');
      }

      async function requestTickTickTaskCompletion(taskId){
        const id=String(taskId||'').trim();
        if(!id) throw new Error('ticktick-task-complete-invalid');
        return managedJsonRequest('ticktick-task-complete:'+id,'/api/ticktick/task-complete',{
          body:{initData:tg?.initData||'',backupToken:currentStateBackupToken,taskId:id},
          ttlMs:0,
          timeoutMs:10000
        });
      }

      function invalidateTickTickTaskViews(){
        invalidateManagedRequests('ticktick-today','ticktick-calendar');
        calendarViewCache.month=null;
        calendarViewCache['next-month']=null;
        currentWorkCalendarRenderSignature='';
      }

      async function refreshAfterTickTickTaskChange({preserveExpanded=false}={}){
        invalidateTickTickTaskViews();
        await Promise.allSettled([
          loadTickTickNext({preserveExpanded,force:true}),
          loadWorkCalendar(currentWorkCalendarView,{silent:true,force:true})
        ]);
      }

      async function completeCalendarTickTickTask(task,row,button,writable){
        if(!task?.id||row?.dataset?.busy==='1') return;
        if(writable===false){
          const status=document.getElementById('workCalendarStatus');
          status.hidden=false;
          status.textContent='Нужно разрешение TickTick';
          try{tg?.HapticFeedback?.notificationOccurred?.('warning')}catch(_){}
          return;
        }
        row.dataset.busy='1';
        row.classList.add('is-completing');
        button.disabled=true;
        try{
          const payload=await requestTickTickTaskCompletion(task.id);
          if(!payload?.ok) throw new Error(payload?.error||'ticktick-task-complete');
          button.setAttribute('aria-checked','true');
          button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-9"/></svg>';
          playCalendarConfetti();
          try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          await new Promise(resolve=>setTimeout(resolve,300));
          await refreshAfterTickTickTaskChange({preserveExpanded:false});
        }catch(error){
          const status=document.getElementById('workCalendarStatus');
          status.hidden=false;
          status.textContent=(Number(error?.status)===401||Number(error?.status)===403)?'Нужно разрешение TickTick':'Ошибка TickTick';
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }finally{
          row.dataset.busy='0';
          row.classList.remove('is-completing');
          if(row.isConnected) button.disabled=false;
        }
      }

      async function completeTickTickTodayTask(task,row,button,writable){
        if(!task?.id||row?.dataset?.busy==='1') return;
        if(writable===false){
          showTickTickWritePermission();
          try{tg?.HapticFeedback?.notificationOccurred?.('warning')}catch(_){}
          return;
        }
        row.dataset.busy='1';
        row.classList.add('syncing');
        button.disabled=true;
        try{
          const payload=await requestTickTickTaskCompletion(task.id);
          if(!payload?.ok) throw new Error(payload?.error||'ticktick-task-complete');

          row.classList.add('done');
          button.setAttribute('aria-checked','true');
          button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-9"/></svg>';
          playTaskCompletionConfetti();
          try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          await new Promise(resolve=>setTimeout(resolve,420));
          await refreshAfterTickTickTaskChange({preserveExpanded:false});
        }catch(_){
          row.classList.remove('done');
          const badge=document.getElementById('ticktickBadge');
          badge.hidden=false;
          badge.textContent='Ошибка синхронизации';
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }finally{
          row.dataset.busy='0';
          row.classList.remove('syncing');
          if(row.isConnected) button.disabled=false;
        }
      }

      function renderTickTickTodayState(payload,{preserveExpanded=false}={}){
        const title=document.getElementById('ticktickTitle');
        const list=document.getElementById('ticktickTodayList');
        const date=document.getElementById('ticktickDate');
        const assignee=document.getElementById('ticktickAssignee');
        const badge=document.getElementById('ticktickBadge');
        const connect=document.getElementById('ticktickConnect');
        const panel=document.getElementById('ticktickPanel');
        const previousOpenTaskId=preserveExpanded?String(panel.dataset.openTaskId||''):'';

        renderTickTickDetails(null);
        panel.dataset.openTaskId='';
        panel.classList.remove('expandable','expanded');
        connect.classList.remove('show');
        connect.textContent='Подключить TickTick';
        date.textContent='';date.hidden=true;
        assignee.textContent='';assignee.hidden=true;
        list.replaceChildren();list.hidden=true;
        title.hidden=false;

        if(payload?.configured===false){
          title.textContent='Интеграция TickTick ещё не настроена.';
          badge.hidden=false;badge.textContent='Настройка';return;
        }
        if(payload?.connected===false){
          title.textContent='Подключите общий список TickTick.';
          badge.hidden=false;badge.textContent='Не подключён';connect.classList.add('show');return;
        }
        if(payload?.enabled===false){
          title.textContent='Синхронизация TickTick выключена.';
          badge.hidden=false;badge.textContent='Выключено';return;
        }

        const tasks=Array.isArray(payload?.tasks)?payload.tasks.filter(task=>!task?.completed):[];
        if(!tasks.length){
          title.textContent='Сегодня дел нет';
          badge.hidden=true;badge.textContent='';
          if(payload?.writable===false) showTickTickWritePermission();
          return;
        }

        title.hidden=true;list.hidden=false;
        badge.hidden=false;
        badge.textContent=tasks.length===1?'1 дело':(tasks.length<5?tasks.length+' дела':tasks.length+' дел');
        let reopenTask=null;

        for(const task of tasks){
          const row=document.createElement('div');
          row.className='ticktick-today-task';
          row.dataset.taskId=String(task?.id||'');

          const complete=document.createElement('button');
          complete.type='button';
          complete.className='ticktick-today-complete';
          complete.setAttribute('role','checkbox');
          complete.setAttribute('aria-checked','false');
          complete.setAttribute('aria-label','Отметить выполненным: '+String(task?.title||'Дело'));
          complete.addEventListener('click',event=>{
            event.stopPropagation();
            completeTickTickTodayTask(task,row,complete,payload?.writable!==false);
          });

          const copy=document.createElement('button');
          copy.type='button';
          copy.className='ticktick-today-copy';
          const hasDetails=Boolean(String(task?.description||'').trim()||(Array.isArray(task?.checklist)&&task.checklist.length));
          copy.classList.toggle('has-details',hasDetails);
          copy.disabled=!hasDetails;
          copy.setAttribute('aria-expanded','false');

          const taskTitle=document.createElement('div');
          taskTitle.className='ticktick-today-title';
          taskTitle.textContent=String(task?.title||'Дело');
          const meta=document.createElement('div');
          meta.className='ticktick-today-meta';
          meta.textContent=tickTickTodayTaskMeta(task);
          meta.hidden=!meta.textContent;
          copy.append(taskTitle,meta);

          if(hasDetails){
            copy.addEventListener('click',event=>{
              event.stopPropagation();
              const alreadyOpen=panel.dataset.openTaskId===String(task.id)&&panel.classList.contains('expanded');
              if(alreadyOpen){
                panel.dataset.openTaskId='';
                copy.setAttribute('aria-expanded','false');
                renderTickTickDetails(null);
                return;
              }
              panel.dataset.openTaskId=String(task.id);
              list.querySelectorAll('.ticktick-today-copy[aria-expanded="true"]').forEach(node=>node.setAttribute('aria-expanded','false'));
              copy.setAttribute('aria-expanded','true');
              renderTickTickDetails(task,{writable:payload?.writable!==false,preserveExpanded:false});
              setTickTickExpanded(true);
            });
          }

          row.append(complete,copy);
          list.appendChild(row);
          if(previousOpenTaskId&&String(task.id)===previousOpenTaskId&&hasDetails) reopenTask={task,copy};
        }

        if(reopenTask){
          panel.dataset.openTaskId=String(reopenTask.task.id);
          reopenTask.copy.setAttribute('aria-expanded','true');
          renderTickTickDetails(reopenTask.task,{writable:payload?.writable!==false,preserveExpanded:false});
          setTickTickExpanded(true);
        }
        if(payload?.writable===false) showTickTickWritePermission();
      }

      function setupTickTickDisclosure(){
        const panel=document.getElementById('ticktickPanel');
        const toggle=document.getElementById('ticktickToggle');
        const flip=()=>{
          if(!panel.classList.contains('expandable')) return;
          setTickTickExpanded(!panel.classList.contains('expanded'));
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        };
        toggle.addEventListener('click',flip);
        toggle.addEventListener('keydown',event=>{
          if(event.key!=='Enter'&&event.key!==' ') return;
          event.preventDefault();
          flip();
        });
      }

      function setupTickTickConnect(){
        const button=document.getElementById('ticktickConnect');
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try{
            const response=await fetch('/api/ticktick/connect',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({initData:tg?.initData||''}),
              cache:'no-store'
            });
            const payload=await response.json().catch(()=>({}));
            if(!response.ok||!payload.authorizeUrl) throw new Error(payload.error||'ticktick-connect');
            window.location.assign(payload.authorizeUrl);
          }catch(_){
            {
              const badge=document.getElementById('ticktickBadge');
              badge.hidden=false;
              badge.textContent='Ошибка';
            }
            button.disabled=false;
          }
        });
      }

      async function loadTickTickNext({preserveExpanded=false,force=false}={}){
        if(!tg?.initData) return;
        if(force) invalidateManagedRequests('ticktick-today');
        try{
          const payload=await managedJsonRequest('ticktick-today','/api/ticktick/today',{
            body:{initData:tg.initData,backupToken:currentStateBackupToken},
            ttlMs:3000,
            timeoutMs:10000
          });
          renderTickTickTodayState(payload,{preserveExpanded});
        }catch(error){
          if(error?.name==='AbortError') return;
          if(Number(error?.status)===401){
            renderTickTickTodayState({...error?.payload,connected:false},{preserveExpanded});
            return;
          }
          const title=document.getElementById('ticktickTitle');
          const list=document.getElementById('ticktickTodayList');
          title.hidden=false;title.textContent='Не удалось обновить TickTick.';
          list.hidden=true;list.replaceChildren();
          const badge=document.getElementById('ticktickBadge');
          badge.hidden=false;badge.textContent='Ошибка';
          document.getElementById('ticktickDate').textContent='';
          const assignee=document.getElementById('ticktickAssignee');
          assignee.textContent='';assignee.hidden=true;
        }
      }

      function holidayDateLabel(){
        return new Intl.DateTimeFormat('ru-RU',{
          weekday:'long',day:'numeric',month:'long',timeZone:TZ
        }).format(new Date());
      }

      function holidayEmoji(value){
        const text=String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
        const rules=[
          [/любв|влюб|поцелу|романт|семь|семь[ия]|супруг|жен|муж|партнер/u,'❤️'],
          [/дет|сын|доч|ребен|семь/u,'👨‍👩‍👧'],
          [/кот|кош|собак|живот|питом|ветерин|птиц|лошад|рыб/u,'🐾'],
          [/мир|земл|планет|эколог|природ|лес|вод|океан|климат/u,'🌍'],
          [/космос|астрон|звезд|лун|солнц/u,'🚀'],
          [/музык|песн|джаз|рок|пиан|гитар/u,'🎵'],
          [/театр|кино|фильм|актер|актрис|искусств|музе|культур/u,'🎭'],
          [/книг|чтен|писател|поэт|литератур|библиот/u,'📚'],
          [/спорт|футбол|хоккей|бег|фитнес|олимп/u,'🏅'],
          [/врач|медиц|здоров|донор|сердц|медсестр/u,'🩺'],
          [/учител|школ|студент|образован|универс/u,'🎓'],
          [/програм|айти|it\b|интернет|компьют|технолог/u,'💻'],
          [/еда|повар|кухн|пицц|бургер|шоколад|кофе|чай|хлеб|торт/u,'🍽️'],
          [/путеше|турист|авиа|самолет|моряк|море/u,'✈️'],
          [/дружб|друг|обним/u,'🤝'],
          [/труд|работ|профес|рабоч/u,'🛠️'],
          [/воен|арм|побед|геро|защитник/u,'🎖️'],
          [/флаг|независим|республик|государ|националь/u,'🏳️'],
          [/смех|улыб|счаст|радост/u,'😄'],
          [/танц/u,'💃'],
          [/фото|фотограф/u,'📸'],
          [/почт|письм/u,'✉️'],
          [/добр|благотвор|волонтер/u,'💛']
        ];
        for(const [pattern,emoji] of rules) if(pattern.test(text)) return emoji;
        return '🎊';
      }

      function holidayPartnerMatch(value,highlightConfig){
        if(highlightConfig?.enabled===false) return false;
        const text=String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
        const categories=highlightConfig?.categories||{};
        const keywords=Object.values(categories).flatMap((row)=>Array.isArray(row)?row:[]);
        return keywords.some((keyword)=>{
          const token=String(keyword||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
          return token&&text.includes(token);
        });
      }

      function renderHolidayItems(items,highlightConfig){
        const list=document.getElementById('holidayList');
        const loading=document.getElementById('holidayLoading');
        list.replaceChildren();
        loading.classList.add('hidden');

        const rows=(Array.isArray(items)?items:[]).slice(0,5).filter(Boolean);
        if(!rows.length){
          const empty=document.createElement('div');
          empty.className='holiday-empty';
          empty.textContent='Не удалось получить список праздников на сегодня.';
          list.appendChild(empty);
          return;
        }

        rows.forEach((value,index)=>{
          const relevant=holidayPartnerMatch(value,highlightConfig);
          const item=document.createElement('div');
          item.className='holiday-item'+(relevant?' partner-relevant':'');

          const number=document.createElement('span');
          number.className='holiday-item-index';
          number.textContent=String(index+1);

          const content=document.createElement('div');
          content.className='holiday-item-content';

          const titleRow=document.createElement('div');
          titleRow.className='holiday-item-title-row';

          const text=document.createElement('span');
          text.className='holiday-item-text';
          const emoji=document.createElement('span');
          emoji.className='holiday-item-emoji';
          emoji.setAttribute('aria-hidden','true');
          emoji.textContent=holidayEmoji(value);
          const label=document.createElement('span');
          label.className='holiday-item-label';
          label.textContent=String(value);
          text.append(emoji,label);
          titleRow.appendChild(text);

          if(relevant){
            const badge=document.createElement('span');
            badge.className='holiday-partner-badge';
            badge.textContent='Для партнёра';
            titleRow.appendChild(badge);

            const note=document.createElement('div');
            note.className='holiday-partner-note';
            note.textContent=String(highlightConfig?.note||'Не забудь поздравить своего партнера.');
            content.append(titleRow,note);
          }else{
            content.appendChild(titleRow);
          }

          item.append(number,content);
          list.appendChild(item);
        });
      }

      async function loadHolidayHighlights(){
        if(holidayItemsCache?.length) return holidayItemsCache;
        const key='rudi-holiday-highlights-'+todayState().key;
        try{
          const cached=localStorage.getItem(key);
          if(cached){
            const parsed=JSON.parse(cached);
            if(Array.isArray(parsed)&&parsed.length) return cacheHolidayItems(parsed);
          }
        }catch(_){}

        try{
          const response=await fetch('/api/partner-message?rudiAction=holidays',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg?.initData||''}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(response.ok&&Array.isArray(payload.items)&&payload.items.length) return cacheHolidayItems(payload.items);
        }catch(_){}

        const response=await fetch('/api/preview?date=today&t='+Date.now(),{cache:'no-store'});
        if(!response.ok) throw new Error('holiday-preview');
        const payload=await response.json();
        const rows=Array.isArray(payload?.holidayHighlights)?payload.holidayHighlights.slice(0,5):[];
        if(!rows.length) throw new Error('holiday-empty');
        return cacheHolidayItems(rows);
      }

      function setupHolidayModal(config){
        const modal=document.getElementById('holidayModal');
        const button=document.getElementById('holidayButton');
        const close=document.getElementById('holidayClose');
        const backdrop=document.getElementById('holidayBackdrop');
        const date=document.getElementById('holidayDate');
        const loading=document.getElementById('holidayLoading');
        const list=document.getElementById('holidayList');

        const closeModal=()=>{
          modal.classList.remove('open');
          modal.setAttribute('aria-hidden','true');
          document.body.classList.remove('holiday-modal-open');
        };

        const openModal=async()=>{
          date.textContent=holidayDateLabel();
          modal.classList.add('open');
          modal.setAttribute('aria-hidden','false');
          document.body.classList.add('holiday-modal-open');
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}

          if(holidayItemsCache?.length){
            renderHolidayItems(holidayItemsCache,config?.holidayPartnerHighlights);
            return;
          }

          list.replaceChildren();
          loading.classList.remove('hidden');
          try{
            const items=await (holidayItemsPromise||loadHolidayHighlights());
            renderHolidayItems(items,config?.holidayPartnerHighlights);
          }catch(_){
            renderHolidayItems([],config?.holidayPartnerHighlights);
          }
        };

        button.addEventListener('click',openModal);
        close.addEventListener('click',closeModal);
        backdrop.addEventListener('click',closeModal);
        document.addEventListener('keydown',event=>{
          if(event.key==='Escape'&&modal.classList.contains('open')) closeModal();
        });
      }

      function dateFromKey(key){
        const [year,month,day]=String(key||'').split('-').map(Number);
        return new Date(Date.UTC(year,month-1,day));
      }

      function setWorkCalendarRangeActive(view){
        currentWorkCalendarView=['month','next-month'].includes(view)?view:'month';
        document.querySelectorAll('[data-work-view]').forEach(button=>{
          const active=button.dataset.workView===currentWorkCalendarView;
          button.classList.toggle('active',active);
          button.setAttribute('aria-pressed',active?'true':'false');
        });
      }

      function setupWorkCalendarDisclosure(){
        const rangeButtons=Array.from(document.querySelectorAll('[data-work-view]'));
        setWorkCalendarRangeActive('month');
        rangeButtons.forEach(button=>button.addEventListener('click',async()=>{
          const view=button.dataset.workView||'month';
          if(view===currentWorkCalendarView) return;
          setWorkCalendarRangeActive(view);
          if(calendarViewCache[view]) renderWorkCalendar(calendarViewCache[view]);
          await loadWorkCalendar(view,{silent:Boolean(calendarViewCache[view])});
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        }));
      }


      function renderPartnerWorkStatus(days){
        const status=profileStatusElement('Диана');
        if(!status) return;

        const today=todayState().key;
        const row=(Array.isArray(days)?days:[]).find(day=>String(day?.date||'')===today);
        if(!row){
          status.dataset.calendarReady='1';
          setProfileWorkStatus('Диана','Нет данных графика','neutral');
          return;
        }

        const working=Boolean(row.working);
        status.dataset.calendarReady='1';
        setProfileWorkStatus('Диана',working?'Рабочий день':'Выходной',working?'working':'off');

        const events=Array.isArray(row.events)?row.events:[];
        const ranges=events
          .map(event=>event?.allDay?'Весь день':([event?.startTime,event?.endTime].filter(Boolean).join('–')))
          .filter(Boolean);
        status.title=working&&ranges.length?ranges.join(' / '):'';
      }

      function workCalendarRenderSignature(payload){
        try{
          return JSON.stringify({
            view:String(payload?.view||'month'),
            stale:Boolean(payload?.stale),
            days:Array.isArray(payload?.days)?payload.days:[],
            ticktickDays:Array.isArray(payload?.ticktickDays)?payload.ticktickDays:[],
            holidayDays:Array.isArray(payload?.holidayDays)?payload.holidayDays:[]
          });
        }catch(_){return String(Date.now())}
      }

      function renderWorkCalendar(payload,{force=false}={}){
        const signature=workCalendarRenderSignature(payload);
        if(!force&&signature===currentWorkCalendarRenderSignature){
          const currentStatus=document.getElementById('workCalendarStatus');
          if(payload?.stale){currentStatus.hidden=false;currentStatus.textContent='Кэш'}
          else{currentStatus.hidden=true;currentStatus.textContent=''}
          return false;
        }
        currentWorkCalendarRenderSignature=signature;
        const container=document.getElementById('workCalendarDays');
        const selected=document.getElementById('workCalendarSelected');
        const status=document.getElementById('workCalendarStatus');
        const label=document.getElementById('workWeekLabel');
        container.replaceChildren();
        selected.hidden=true;
        selected.replaceChildren();

        const days=Array.isArray(payload?.days)?payload.days:[];
        const tickDays=new Map((Array.isArray(payload?.ticktickDays)?payload.ticktickDays:[]).map(day=>[String(day?.date||''),day]));
        const holidayDays=new Map((Array.isArray(payload?.holidayDays)?payload.holidayDays:[]).map(day=>[String(day?.date||''),day]));
        if(!payload?.configured){
          status.hidden=false;
          status.textContent='Не подключён';
          const empty=document.createElement('div');
          empty.className='wishlist-empty';
          empty.textContent='Календарь пока не подключён.';
          container.appendChild(empty);
          return;
        }
        if(!days.length){
          status.hidden=false;
          status.textContent='Нет данных';
          return;
        }

        const first=dateFromKey(days[0].date);
        const last=dateFromKey(days[days.length-1].date);
        const view=String(payload?.view||currentWorkCalendarView||'month');
        const isMonth=view==='month'||view==='next-month';
        if(view==='month') renderPartnerWorkStatus(days);
        if(isMonth){
          const monthLabel=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
          label.textContent=monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1);
        }else{
          const firstText=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(first).replace('.','');
          const lastText=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(last).replace('.','');
          label.textContent=firstText+' — '+lastText;
        }
        setWorkCalendarRangeActive(view);
        if(payload.stale){
          status.hidden=false;
          status.textContent='Кэш';
        }else{
          status.hidden=true;
          status.textContent='';
        }

        if(isMonth){
          ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(value=>{
            const head=document.createElement('div');
            head.className='calendar-weekday';
            head.textContent=value;
            container.appendChild(head);
          });
          const firstWeekday=(first.getUTCDay()+6)%7;
          for(let i=0;i<firstWeekday;i+=1){
            const blank=document.createElement('div');
            blank.className='calendar-empty';
            container.appendChild(blank);
          }
        }

        const today=todayState().key;
        for(const day of days){
          const date=dateFromKey(day.date);
          const events=Array.isArray(day.events)?day.events:[];
          const tasks=(Array.isArray(tickDays.get(String(day.date))?.events)?tickDays.get(String(day.date)).events:[])
            .filter(event=>!event?.completed);
          const holidays=(Array.isArray(holidayDays.get(String(day.date))?.items)?holidayDays.get(String(day.date)).items:[])
            .slice(0,5)
            .filter(Boolean);
          const times=events
            .map(event=>event.allDay?'Весь день':([event.startTime,event.endTime].filter(Boolean).join('–')))
            .filter(Boolean);
          const timeText=times.join(' / ')||'Смена';
          const cell=document.createElement('button');
          cell.type='button';
          cell.className='calendar-day-cell '+(day.working?'working':'off')+
            (tasks.length?' has-tasks':'')+
            (holidays.length?' has-holidays':'')+
            (day.date===today?' today':'');
          const tooltip=[
            day.working?timeText:'Выходной',
            tasks.length?tasks.map(event=>event.title).filter(Boolean).join(' · '):'',
            holidays.length?holidays.join(' · '):''
          ].filter(Boolean).join(' · ');
          cell.title=tooltip;
          cell.setAttribute(
            'aria-label',
            (day.working?'Работа ':'Выходной ')+
            new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(date)+
            (tasks.length?', дел: '+tasks.length:'')+
            (holidays.length?', праздников: '+holidays.length:'')
          );

          if(!isMonth){
            const week=document.createElement('span');
            week.className='calendar-week-label';
            week.textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'short',timeZone:'UTC'}).format(date).replace('.','');
            cell.appendChild(week);
          }

          const number=document.createElement('span');
          number.className='calendar-date-number';
          number.textContent=String(date.getUTCDate());
          cell.appendChild(number);

          if(day.working){
            const dot=document.createElement('span');
            dot.className='calendar-work-dot';
            cell.appendChild(dot);
          }else{
            const check=document.createElement('span');
            check.className='calendar-check';
            check.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4 10-10"/></svg>';
            cell.appendChild(check);
          }

          if(tasks.length||holidays.length){
            const indicators=document.createElement('span');
            indicators.className='calendar-day-indicators';
            if(tasks.length){
              const taskCount=document.createElement('span');
              taskCount.className='calendar-task-count';
              taskCount.textContent=String(tasks.length);
              taskCount.setAttribute('aria-hidden','true');
              indicators.appendChild(taskCount);
            }
            if(holidays.length){
              const holidayMark=document.createElement('span');
              holidayMark.className='calendar-holiday-mark';
              holidayMark.textContent='✦';
              holidayMark.setAttribute('aria-hidden','true');
              indicators.appendChild(holidayMark);
            }
            cell.appendChild(indicators);
          }

          const showDayDetails=(withHaptic=false)=>{
            currentSelectedWorkDate=String(day.date||'');
            container.querySelectorAll('.calendar-day-cell.selected').forEach(node=>node.classList.remove('selected'));
            cell.classList.add('selected');

            const icon=document.createElement('span');
            icon.className='work-selected-icon';
            icon.innerHTML=day.working
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4 10-10"/></svg>';
            icon.classList.toggle('is-off',!day.working);

            const copy=document.createElement('span');
            copy.className='work-selected-copy';
            const heading=document.createElement('strong');
            heading.textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(date);

            const info=document.createElement('span');
            info.className='work-selected-status';
            const prefix=day.date===today?'Сегодня у Дианы ':'У Дианы ';
            info.textContent=prefix+(day.working?'рабочий день':'выходной');
            copy.append(heading,info);

            if(day.working){
              const shift=document.createElement('span');
              shift.className='work-selected-shift';
              const titles=events.map(event=>event.title).filter(Boolean);
              shift.textContent='Смена: '+(times.length?times.join(' / '):'по графику')+(titles.length?' · '+titles.join(' · '):'');
              copy.appendChild(shift);
            }

            const details=document.createElement('div');
            details.className='calendar-selected-details';

            if(tasks.length){
              const group=document.createElement('span');
              group.className='calendar-selected-group calendar-selected-tasks';
              const groupTitle=document.createElement('b');
              groupTitle.textContent='Дела';
              group.appendChild(groupTitle);
              for(const event of tasks){
                const row=document.createElement('div');
                row.className='calendar-selected-row calendar-task-row';
                const complete=document.createElement('button');
                complete.type='button';
                complete.className='calendar-task-complete';
                complete.setAttribute('role','checkbox');
                complete.setAttribute('aria-checked','false');
                complete.setAttribute('aria-label','Отметить выполненным: '+String(event.title||'Дело'));
                complete.disabled=!event?.id||payload?.ticktickWritable===false;

                const taskCopy=document.createElement('span');
                taskCopy.className='calendar-task-copy';
                const start=String(event.startTime||'').trim();
                const end=String(event.endTime||'').trim();
                const range=event.allDay?'Весь день':(start&&end&&start===end?start:[start,end].filter(Boolean).join('–'));
                const assignee=event.assigned&&event.assignee&&event.assignee!=='Не назначен'?' · '+event.assignee:'';

                if(range){
                  const time=document.createElement('span');
                  time.className='calendar-task-time';
                  time.textContent=range;
                  taskCopy.appendChild(time);
                }
                const text=document.createElement('span');
                text.className='calendar-task-title';
                text.textContent=String(event.title||'Дело')+assignee;
                taskCopy.appendChild(text);
                row.append(complete,taskCopy);
                complete.addEventListener('click',clickEvent=>{
                  clickEvent.stopPropagation();
                  completeCalendarTickTickTask(event,row,complete,payload?.ticktickWritable!==false);
                });
                group.appendChild(row);
              }
              details.appendChild(group);
            }

            if(holidays.length){
              const group=document.createElement('span');
              group.className='calendar-selected-group calendar-selected-holidays';
              const groupTitle=document.createElement('b');
              groupTitle.textContent='Праздники';
              group.appendChild(groupTitle);
              for(const holiday of holidays){
                const row=document.createElement('span');
                row.className='calendar-selected-row calendar-holiday-row'+
                  (holidayPartnerMatch(holiday,currentConfig?.holidayPartnerHighlights)?' partner-relevant':'');
                const emoji=document.createElement('span');
                emoji.className='calendar-holiday-emoji';
                emoji.textContent=holidayEmoji(holiday);
                const text=document.createElement('span');
                text.textContent=String(holiday);
                row.append(emoji,text);
                group.appendChild(row);
              }
              details.appendChild(group);
            }

            selected.replaceChildren(icon,copy);
            if(details.childElementCount) selected.appendChild(details);
            selected.classList.toggle('is-off',!day.working);
            selected.hidden=false;
            if(withHaptic){
              try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
            }
          };

          cell.addEventListener('click',()=>showDayDetails(true));
          const preferredDate=currentSelectedWorkDate||today;
          if(day.date===preferredDate) showDayDetails(false);
          container.appendChild(cell);
        }

        if(currentSelectedWorkDate&&!days.some(day=>String(day?.date||'')===currentSelectedWorkDate)){
          currentSelectedWorkDate='';
        }
        return true;
      }

      async function refreshPartnerWorkStatus(){
        if(!tg?.initData) return;
        try{
          const payload=await fetchCalendarJson(
            'work-calendar:month',
            '/api/work-calendar',
            {initData:tg.initData,backupToken:currentStateBackupToken,view:'month'},
            5000
          );
          if(Array.isArray(payload?.days)) renderPartnerWorkStatus(payload.days);
        }catch(_){}
      }

      async function fetchCalendarJson(resource,url,body,ttlMs=5000){
        return managedJsonRequest(resource,url,{body,ttlMs,timeoutMs:12000});
      }

      async function fetchCombinedCalendar(view){
        const requested=['month','next-month'].includes(view)?view:'month';
        const base={initData:tg.initData,backupToken:currentStateBackupToken,view:requested};
        const [workResult,tickResult,holidayResult]=await Promise.allSettled([
          fetchCalendarJson('work-calendar:'+requested,'/api/work-calendar',base,5000),
          fetchCalendarJson('ticktick-calendar:'+requested,'/api/ticktick/calendar',base,3000),
          fetchCalendarJson('holiday-calendar:'+requested,'/api/partner-message?rudiAction=holiday-calendar',{
            initData:tg.initData,
            view:requested
          },60000)
        ]);
        if(workResult.status!=='fulfilled') throw workResult.reason;
        const work=workResult.value;
        const tick=tickResult.status==='fulfilled'?tickResult.value:{};
        const holidays=holidayResult.status==='fulfilled'?holidayResult.value:{};
        return {
          ...work,
          view:requested,
          ticktickDays:Array.isArray(tick?.days)?tick.days:[],
          holidayDays:Array.isArray(holidays?.days)?holidays.days:[],
          ticktickConnected:tick?.connected!==false,
          ticktickWritable:tick?.writable!==false,
          holidaysReady:holidayResult.status==='fulfilled'
        };
      }

      async function prefetchCalendarView(view){
        const requested=['month','next-month'].includes(view)?view:'month';
        if(calendarViewCache[requested]) return calendarViewCache[requested];
        try{
          const payload=await fetchCombinedCalendar(requested);
          calendarViewCache[requested]=payload;
          return payload;
        }catch(_){
          return null;
        }
      }

      async function loadWorkCalendar(view=currentWorkCalendarView,{silent=false,force=false}={}){
        if(!tg?.initData) return;
        const requested=['month','next-month'].includes(view)?view:'month';
        if(force) invalidateManagedRequests('ticktick-calendar:'+requested);
        currentWorkCalendarView=requested;
        setWorkCalendarRangeActive(requested);
        const status=document.getElementById('workCalendarStatus');
        if(calendarViewCache[requested]) renderWorkCalendar(calendarViewCache[requested]);
        if(!silent){
          status.hidden=false;
          status.textContent=calendarViewCache[requested]?'Обновляю':'Загружаю';
        }
        try{
          const payload=await fetchCombinedCalendar(requested);
          calendarViewCache[requested]=payload;
          renderWorkCalendar(payload);
          if(requested==='next-month') refreshPartnerWorkStatus();
          if(requested==='month'&&!calendarViewCache['next-month']){
            setTimeout(()=>prefetchCalendarView('next-month'),80);
          }
        }catch(error){
          if(error?.name==='AbortError') return calendarViewCache[requested]||null;
          if(calendarViewCache[requested]){
            renderWorkCalendar(calendarViewCache[requested]);
            status.hidden=false;
            status.textContent='Кэш';
            return;
          }
          status.hidden=false;
          status.textContent='Ошибка';
          const container=document.getElementById('workCalendarDays');
          container.innerHTML='<div class="wishlist-empty">Не удалось обновить график.</div>';
        }
      }

      function setSharedCalendarRangeActive(view){
        currentSharedCalendarView=['month','next-month'].includes(view)?view:'month';
        document.querySelectorAll('[data-shared-view]').forEach(button=>{
          const active=button.dataset.sharedView===currentSharedCalendarView;
          button.classList.toggle('active',active);
          button.setAttribute('aria-pressed',active?'true':'false');
        });
      }

      function setupSharedCalendarDisclosure(){
        const rangeButtons=Array.from(document.querySelectorAll('[data-shared-view]'));
        setSharedCalendarRangeActive('month');
        rangeButtons.forEach(button=>button.addEventListener('click',async()=>{
          const view=button.dataset.sharedView||'month';
          if(view===currentSharedCalendarView) return;
          setSharedCalendarRangeActive(view);
          await loadSharedCalendar(view);
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        }));
      }

      function renderSharedCalendar(payload){
        const container=document.getElementById('sharedCalendarDays');
        const selected=document.getElementById('sharedCalendarSelected');
        const status=document.getElementById('sharedCalendarStatus');
        const label=document.getElementById('sharedMonthLabel');
        if(!container||!selected||!status||!label) return;

        container.replaceChildren();
        selected.hidden=true;
        selected.replaceChildren();

        if(payload?.connected===false){
          status.hidden=false;
          status.textContent='Подключите TickTick';
          const empty=document.createElement('div');
          empty.className='wishlist-empty';
          empty.textContent='TickTick пока не подключён.';
          container.appendChild(empty);
          return;
        }

        const days=Array.isArray(payload?.days)?payload.days:[];
        if(!days.length){
          status.hidden=false;
          status.textContent=payload?.enabled===false?'Отключён':'Нет данных';
          return;
        }

        const first=dateFromKey(days[0].date);
        const monthLabel=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
        label.textContent=monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1);
        setSharedCalendarRangeActive(String(payload?.view||currentSharedCalendarView||'month'));
        status.hidden=true;
        status.textContent='';

        ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(value=>{
          const head=document.createElement('div');
          head.className='calendar-weekday';
          head.textContent=value;
          container.appendChild(head);
        });

        const firstWeekday=(first.getUTCDay()+6)%7;
        for(let i=0;i<firstWeekday;i+=1){
          const blank=document.createElement('div');
          blank.className='calendar-empty';
          container.appendChild(blank);
        }

        const today=todayState().key;
        for(const day of days){
          const date=dateFromKey(day.date);
          const events=Array.isArray(day.events)?day.events:[];
          const hasEvents=events.length>0;
          const cell=document.createElement('button');
          cell.type='button';
          cell.className='calendar-day-cell shared-day-cell'+(hasEvents?' shared-event':'')+(day.date===today?' today':'');
          cell.title=hasEvents?events.map(event=>event.title).join(' · '):'Совместных дел нет';
          cell.setAttribute(
            'aria-label',
            new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(date)+
            (hasEvents?', '+events.length+' совместных дел':' — совместных дел нет')
          );

          const number=document.createElement('span');
          number.className='calendar-date-number';
          number.textContent=String(date.getUTCDate());
          cell.appendChild(number);

          if(hasEvents){
            const dot=document.createElement('span');
            dot.className='calendar-work-dot';
            cell.appendChild(dot);
            const count=document.createElement('span');
            count.className='calendar-event-count';
            count.textContent=String(events.length);
            count.setAttribute('aria-hidden','true');
            cell.appendChild(count);
          }

          const showDayDetails=(withHaptic=false)=>{
            container.querySelectorAll('.calendar-day-cell.selected').forEach(node=>node.classList.remove('selected'));
            cell.classList.add('selected');

            const icon=document.createElement('span');
            icon.className='work-selected-icon';
            icon.innerHTML=hasEvents
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14v14H5z"/><path d="M8 3v4M16 3v4M5 9h14"/><path d="M8 13h3M8 16h6"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/></svg>';

            const copy=document.createElement('span');
            copy.className='work-selected-copy';
            const heading=document.createElement('strong');
            heading.textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(date);
            const info=document.createElement('span');

            if(hasEvents){
              info.textContent=events.map(event=>{
                const range=event.allDay?'Весь день':([event.startTime,event.endTime].filter(Boolean).join('–'));
                const assignee=event.assigned&&event.assignee&&event.assignee!=='Не назначен'?' · '+event.assignee:'';
                return (range?range+' · ':'')+event.title+assignee;
              }).join('  •  ');
            }else{
              info.textContent='Совместных дел нет';
            }

            copy.append(heading,info);
            selected.replaceChildren(icon,copy);
            selected.hidden=false;
            if(withHaptic){
              try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
            }
          };

          cell.addEventListener('click',()=>showDayDetails(true));
          if(day.date===today) showDayDetails(false);
          container.appendChild(cell);
        }
      }

      async function loadSharedCalendar(view=currentSharedCalendarView){
        if(!tg?.initData) return;
        const requested=['month','next-month'].includes(view)?view:'month';
        currentSharedCalendarView=requested;
        setSharedCalendarRangeActive(requested);
        const status=document.getElementById('sharedCalendarStatus');
        if(!status) return;
        status.hidden=false;
        status.textContent='Обновляю';
        try{
          const response=await fetch('/api/ticktick/calendar',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData,backupToken:currentStateBackupToken,view:requested}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(response.status===401){
            renderSharedCalendar({...payload,connected:false});
            return;
          }
          if(!response.ok) throw new Error(payload.error||'ticktick-calendar');
          renderSharedCalendar(payload);
        }catch(_){
          status.hidden=false;
          status.textContent='Ошибка';
          const container=document.getElementById('sharedCalendarDays');
          if(container) container.innerHTML='<div class="wishlist-empty">Не удалось обновить совместные дела.</div>';
        }
      }

      function openSharedAlbum(){
        if(!sharedAlbumUrl) return;
        try{
          if(tg?.openLink) tg.openLink(sharedAlbumUrl);
          else window.open(sharedAlbumUrl,'_blank','noopener,noreferrer');
        }catch(_){
          window.open(sharedAlbumUrl,'_blank','noopener,noreferrer');
        }
      }

      function sharedAlbumOriginalUrl(photo){
        const id=String(photo?.id||'').trim();
        return id&&sharedAlbumUrl ? sharedAlbumUrl+';'+id : sharedAlbumUrl;
      }

      function openSharedAlbumOriginal(){
        const photo=sharedAlbumPhotos[currentSharedAlbumPhotoIndex];
        const target=sharedAlbumOriginalUrl(photo);
        if(!target) return;
        try{
          if(tg?.openLink) tg.openLink(target);
          else window.open(target,'_blank','noopener,noreferrer');
        }catch(_){
          window.open(target,'_blank','noopener,noreferrer');
        }
      }

      function renderSharedAlbumPhotoViewer(){
        const viewer=document.getElementById('photoViewer');
        const image=document.getElementById('photoViewerImage');
        const caption=document.getElementById('photoViewerCaption');
        const prev=document.getElementById('photoViewerPrev');
        const next=document.getElementById('photoViewerNext');
        const original=document.getElementById('photoViewerOriginal');
        const photo=sharedAlbumPhotos[currentSharedAlbumPhotoIndex];
        const url=String(photo?.url||'').trim();
        if(!viewer||!image||!caption||!prev||!next||!original||!url) return false;

        image.src=url;
        image.alt=photo?.caption?String(photo.caption):'Фото из общего альбома';

        const captionText=String(photo?.caption||'').trim();
        caption.textContent=captionText;
        caption.hidden=!captionText;

        prev.disabled=currentSharedAlbumPhotoIndex<=0;
        next.disabled=currentSharedAlbumPhotoIndex>=sharedAlbumPhotos.length-1;
        original.disabled=!sharedAlbumOriginalUrl(photo);

        const preloadIndexes=[currentSharedAlbumPhotoIndex-1,currentSharedAlbumPhotoIndex+1];
        preloadIndexes.forEach(index=>{
          const adjacent=sharedAlbumPhotos[index];
          if(adjacent?.url){
            const preload=new Image();
            preload.src=String(adjacent.url);
          }
        });
        return true;
      }

      function changeSharedAlbumPhoto(step){
        if(!sharedAlbumPhotos.length) return;
        const nextIndex=currentSharedAlbumPhotoIndex+Number(step||0);
        if(nextIndex<0||nextIndex>=sharedAlbumPhotos.length) return;
        currentSharedAlbumPhotoIndex=nextIndex;
        if(renderSharedAlbumPhotoViewer()){
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        }
      }

      function closeSharedAlbumPhoto(){
        const viewer=document.getElementById('photoViewer');
        const image=document.getElementById('photoViewerImage');
        const caption=document.getElementById('photoViewerCaption');
        if(!viewer||!image||!caption) return;
        viewer.classList.remove('open');
        viewer.setAttribute('aria-hidden','true');
        document.body.classList.remove('photo-viewer-open');
        image.removeAttribute('src');
        image.alt='';
        caption.textContent='';
        caption.hidden=true;
        currentSharedAlbumPhotoIndex=-1;
      }

      function openSharedAlbumPhoto(photo,index=-1){
        const viewer=document.getElementById('photoViewer');
        const close=document.getElementById('photoViewerClose');
        if(!viewer) return;

        let targetIndex=Number.isInteger(index)?index:sharedAlbumPhotos.findIndex(item=>item?.id&&item.id===photo?.id);
        if(targetIndex<0) targetIndex=sharedAlbumPhotos.indexOf(photo);
        if(targetIndex<0||targetIndex>=sharedAlbumPhotos.length) return;

        currentSharedAlbumPhotoIndex=targetIndex;
        if(!renderSharedAlbumPhotoViewer()) return;

        viewer.classList.add('open');
        viewer.setAttribute('aria-hidden','false');
        document.body.classList.add('photo-viewer-open');
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        setTimeout(()=>close?.focus?.({preventScroll:true}),0);
      }

      function sharedAlbumPhotoTime(photo){
        const time=Date.parse(String(photo?.date||''));
        return Number.isFinite(time)?time:0;
      }

      function sharedAlbumDateKey(value){
        const date=value instanceof Date?value:new Date(value);
        if(Number.isNaN(date.getTime())) return '';
        const parts=new Intl.DateTimeFormat('en-CA',{
          timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'
        }).formatToParts(date);
        const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
        return map.year+'-'+map.month+'-'+map.day;
      }

      function sharedAlbumYesterdayKey(){
        const today=sharedAlbumDateKey(new Date());
        if(!today) return '';
        const [year,month,day]=today.split('-').map(Number);
        return sharedAlbumDateKey(new Date(Date.UTC(year,month-1,day-1,12)));
      }

      function sharedAlbumMonthLabel(photo){
        const time=sharedAlbumPhotoTime(photo);
        if(!time) return 'Без даты';
        const date=new Date(time);
        const now=new Date();
        const sameYear=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric'}).format(date)
          ===new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric'}).format(now);
        const label=new Intl.DateTimeFormat('ru-RU',{
          timeZone:TZ,
          month:'long',
          ...(sameYear?{}:{year:'numeric'})
        }).format(date);
        return label.charAt(0).toLocaleUpperCase('ru-RU')+label.slice(1);
      }

      function sharedAlbumGroupLabel(photo){
        const key=sharedAlbumDateKey(sharedAlbumPhotoTime(photo));
        if(!key) return {key:'undated',label:'Без даты'};
        const today=sharedAlbumDateKey(new Date());
        if(key===today) return {key:'today',label:'Сегодня'};
        if(key===sharedAlbumYesterdayKey()) return {key:'yesterday',label:'Вчера'};
        return {key:key.slice(0,7),label:sharedAlbumMonthLabel(photo)};
      }

      function sharedAlbumGroups(photos){
        const groups=[];
        const byKey=new Map();
        for(const photo of photos){
          const group=sharedAlbumGroupLabel(photo);
          let row=byKey.get(group.key);
          if(!row){
            row={key:group.key,label:group.label,photos:[]};
            byKey.set(group.key,row);
            groups.push(row);
          }
          row.photos.push(photo);
        }
        return groups;
      }

      function sharedAlbumHash(value){
        let hash=2166136261;
        for(const char of String(value||'')){
          hash^=char.codePointAt(0);
          hash=Math.imul(hash,16777619);
        }
        return hash>>>0;
      }

      function sharedAlbumMemoryPhoto(photos){
        const todayKey=sharedAlbumDateKey(new Date());
        const todayMs=Date.parse(todayKey+'T12:00:00Z');
        const candidates=photos.filter(photo=>{
          const key=sharedAlbumDateKey(sharedAlbumPhotoTime(photo));
          if(!key) return false;
          const time=Date.parse(key+'T12:00:00Z');
          return Number.isFinite(time)&&Number.isFinite(todayMs)&&todayMs-time>=7*DAY;
        });
        if(!candidates.length) return null;
        return candidates[sharedAlbumHash(todayKey)%candidates.length]||null;
      }

      function sharedAlbumAgeLabel(photo){
        const time=sharedAlbumPhotoTime(photo);
        if(!time) return '';
        const photoDate=new Date(time);
        const now=new Date();
        const photoParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
          timeZone:TZ,year:'numeric',month:'numeric',day:'numeric'
        }).formatToParts(photoDate).map(part=>[part.type,Number(part.value)||part.value]));
        const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
          timeZone:TZ,year:'numeric',month:'numeric',day:'numeric'
        }).formatToParts(now).map(part=>[part.type,Number(part.value)||part.value]));
        const months=(Number(nowParts.year)-Number(photoParts.year))*12+(Number(nowParts.month)-Number(photoParts.month));
        if(months>=12){
          const years=Math.max(1,Math.floor(months/12));
          const mod10=years%10,mod100=years%100;
          const word=mod100>=11&&mod100<=14?'лет':mod10===1?'год':mod10>=2&&mod10<=4?'года':'лет';
          return 'Это было '+years+' '+word+' назад';
        }
        if(months>=1){
          const mod10=months%10,mod100=months%100;
          const word=mod100>=11&&mod100<=14?'месяцев':mod10===1?'месяц':mod10>=2&&mod10<=4?'месяца':'месяцев';
          return 'Это было '+months+' '+word+' назад';
        }
        const photoKey=sharedAlbumDateKey(photoDate);
        const nowKey=sharedAlbumDateKey(now);
        const days=Math.max(1,Math.round((Date.parse(nowKey+'T12:00:00Z')-Date.parse(photoKey+'T12:00:00Z'))/DAY));
        const mod10=days%10,mod100=days%100;
        const word=mod100>=11&&mod100<=14?'дней':mod10===1?'день':mod10>=2&&mod10<=4?'дня':'дней';
        return 'Это было '+days+' '+word+' назад';
      }

      function sharedAlbumPhotoButton(photo,index){
        const button=document.createElement('button');
        button.className='shared-album-photo';
        button.type='button';
        button.setAttribute('aria-label','Открыть фото '+(index+1)+' крупно');
        const img=document.createElement('img');
        img.src=String(photo.url||'');
        img.alt=photo.caption?String(photo.caption):'Фото из общего альбома';
        img.loading='lazy';
        img.decoding='async';
        button.appendChild(img);
        button.addEventListener('click',()=>openSharedAlbumPhoto(photo,index));
        return button;
      }

      function renderSharedAlbumMemory(photos){
        const wrap=document.getElementById('sharedAlbumMemory');
        const image=document.getElementById('sharedAlbumMemoryImage');
        const age=document.getElementById('sharedAlbumMemoryAge');
        const button=document.getElementById('sharedAlbumMemoryButton');
        if(!wrap||!image||!age||!button) return;
        const photo=sharedAlbumMemoryPhoto(photos);
        if(!photo){
          wrap.hidden=true;
          image.removeAttribute('src');
          button.onclick=null;
          return;
        }
        const index=photos.indexOf(photo);
        image.src=String(photo.url||'');
        image.alt=photo.caption?String(photo.caption):'Воспоминание из общего альбома';
        age.textContent=sharedAlbumAgeLabel(photo);
        button.onclick=()=>openSharedAlbumPhoto(photo,index);
        wrap.hidden=false;
      }

      function renderSharedAlbum(payload){
        const section=document.getElementById('sharedAlbumSection');
        const grid=document.getElementById('sharedAlbumGrid');
        const status=document.getElementById('sharedAlbumStatus');
        const count=document.getElementById('sharedAlbumCount');
        const open=document.getElementById('sharedAlbumOpen');
        const photos=(Array.isArray(payload?.photos)?payload.photos:[])
          .slice(0,40)
          .sort((a,b)=>sharedAlbumPhotoTime(b)-sharedAlbumPhotoTime(a));
        sharedAlbumPhotos=photos;

        if(!payload?.configured){
          section.dataset.tabAvailable='0';
          applyAppTab(currentAppTab,{scroll:false});
          return;
        }
        section.dataset.tabAvailable='1';
        applyAppTab(currentAppTab,{scroll:false});
        sharedAlbumUrl=String(payload.albumUrl||'');
        open.disabled=!sharedAlbumUrl;
        const totalCount=Number.isFinite(Number(payload?.totalCount))
          ?Math.max(0,Number(payload.totalCount))
          :photos.length;
        if(count) count.textContent=totalCount+' фото';

        if(payload.stale){
          status.hidden=false;
          status.textContent='Кэш';
        }else{
          status.hidden=true;
          status.textContent='';
        }
        grid.replaceChildren();

        if(!photos.length){
          sharedAlbumPhotos=[];
          currentSharedAlbumPhotoIndex=-1;
          renderSharedAlbumMemory([]);
          const empty=document.createElement('div');
          empty.className='wishlist-empty';
          empty.textContent='В альбоме пока нет фотографий.';
          grid.appendChild(empty);
          return;
        }

        renderSharedAlbumMemory(photos);
        const groups=sharedAlbumGroups(photos);
        for(const group of groups){
          const sectionEl=document.createElement('section');
          sectionEl.className='shared-album-group';

          const head=document.createElement('div');
          head.className='shared-album-group-head';
          const title=document.createElement('strong');
          title.textContent=group.label;
          const meta=document.createElement('span');
          meta.textContent=group.photos.length+' фото';
          head.append(title,meta);

          const groupGrid=document.createElement('div');
          groupGrid.className='shared-album-grid';
          for(const photo of group.photos){
            const index=photos.indexOf(photo);
            groupGrid.appendChild(sharedAlbumPhotoButton(photo,index));
          }

          sectionEl.append(head,groupGrid);
          grid.appendChild(sectionEl);
        }
      }

      async function loadSharedAlbum(){
        if(!tg?.initData) return;
        const status=document.getElementById('sharedAlbumStatus');
        status.hidden=false;
        status.textContent='Обновляю';
        try{
          const response=await fetch('/api/shared-album',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData,backupToken:currentStateBackupToken}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok) throw new Error(payload.error||'album');
          renderSharedAlbum(payload);
        }catch(_){
          status.hidden=false;
          status.textContent='Ошибка';
        }
      }

      function setupSharedAlbum(){
        document.getElementById('sharedAlbumOpen')?.addEventListener('click',openSharedAlbum);
        document.getElementById('photoViewerClose')?.addEventListener('click',closeSharedAlbumPhoto);
        document.getElementById('photoViewerBackdrop')?.addEventListener('click',closeSharedAlbumPhoto);
        document.getElementById('photoViewerPrev')?.addEventListener('click',()=>changeSharedAlbumPhoto(-1));
        document.getElementById('photoViewerNext')?.addEventListener('click',()=>changeSharedAlbumPhoto(1));
        document.getElementById('photoViewerOriginal')?.addEventListener('click',openSharedAlbumOriginal);
        document.addEventListener('keydown',event=>{
          if(!document.getElementById('photoViewer')?.classList.contains('open')) return;
          if(event.key==='Escape') closeSharedAlbumPhoto();
          else if(event.key==='ArrowLeft') changeSharedAlbumPhoto(-1);
          else if(event.key==='ArrowRight') changeSharedAlbumPhoto(1);
        });
      }

      async function wishlistRequest(operation,payload={}){
        const response=await fetch('/api/wishlist',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation,...payload}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||'wishlist');
        if(operation!=='list') setTimeout(()=>refreshStateBackup(),250);
        return data;
      }

      function openWishlistUrl(value){
        const url=String(value||'').trim();
        if(!url) return;
        try{
          if(tg?.openLink) tg.openLink(url);
          else window.open(url,'_blank','noopener,noreferrer');
        }catch(_){
          window.open(url,'_blank','noopener,noreferrer');
        }
      }

      function wishItemElement(item){
        const row=document.createElement('div');
        const url=String(item?.url||'').trim();
        row.className='wish-item'+(item.done?' done':'')+(url?' has-link':'');
        if(url){
          row.tabIndex=0;
          row.setAttribute('role','link');
          row.setAttribute('aria-label',String(item.text||'Желание')+' — открыть ссылку');
        }

        const toggle=document.createElement('button');
        toggle.className='wish-toggle';
        toggle.type='button';
        toggle.setAttribute('aria-label',item.done?'Вернуть желание':'Отметить выполненным');
        toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-9"/></svg>';

        const text=document.createElement('div');
        text.className='wish-text';
        text.textContent=item.text;

        const remove=document.createElement('button');
        remove.className='wish-remove';
        remove.type='button';
        remove.setAttribute('aria-label','Удалить');
        remove.textContent='×';

        toggle.addEventListener('click',async()=>{
          try{renderWishlist(await wishlistRequest('toggle',{id:item.id}));}catch(_){}
        });
        remove.addEventListener('click',async()=>{
          try{renderWishlist(await wishlistRequest('remove',{id:item.id}));}catch(_){}
        });

        if(url){
          row.addEventListener('click',event=>{
            if(event.target.closest('button')) return;
            openWishlistUrl(url);
          });
          row.addEventListener('keydown',event=>{
            if(event.target.closest('button')) return;
            if(event.key==='Enter'||event.key===' '){
              event.preventDefault();
              openWishlistUrl(url);
            }
          });
        }

        row.append(toggle,text,remove);
        return row;
      }

      function renderWishlist(payload){
        const rustam=document.getElementById('wishlistRustam');
        const diana=document.getElementById('wishlistDiana');
        const status=document.getElementById('wishlistStatus');
        rustam.replaceChildren();diana.replaceChildren();
        const items=Array.isArray(payload?.items)?payload.items:[];
        for(const [owner,container] of [['Рустам',rustam],['Диана',diana]]){
          const rows=items.filter(item=>item.owner===owner);
          if(!rows.length){
            const empty=document.createElement('div');
            empty.className='wishlist-empty';
            empty.textContent='Пока пусто';
            container.appendChild(empty);
          }else{
            rows.forEach(item=>container.appendChild(wishItemElement(item)));
          }
        }
        status.hidden=true;
        status.textContent='';
      }

      function setupWishlist(){
        const form=document.getElementById('wishlistForm');
        const input=document.getElementById('wishlistInput');
        const urlInput=document.getElementById('wishlistUrl');
        const add=document.getElementById('wishlistAdd');
        const section=document.querySelector('.wishlist-section');
        let focusTimer=0;

        const revealForm=()=>{
          clearTimeout(focusTimer);
          focusTimer=setTimeout(()=>{
            form.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
          },180);
        };
        const setEditing=active=>{
          section?.classList.toggle('wishlist-editing',active);
          document.body.classList.toggle('keyboard-editing',active);
          if(active) revealForm();
          else clearTimeout(focusTimer);
        };
        const onFocus=()=>setEditing(true);
        const onBlur=()=>setTimeout(()=>{
          if(!form.contains(document.activeElement)) setEditing(false);
        },0);

        input.addEventListener('focus',onFocus);
        urlInput.addEventListener('focus',onFocus);
        input.addEventListener('blur',onBlur);
        urlInput.addEventListener('blur',onBlur);
        window.visualViewport?.addEventListener('resize',()=>{
          if(form.contains(document.activeElement)) revealForm();
        });

        form.addEventListener('submit',async(event)=>{
          event.preventDefault();
          const text=input.value.trim();
          const url=urlInput.value.trim();
          if(!text) return;
          add.disabled=true;
          try{
            const data=await wishlistRequest('add',{text,url});
            input.value='';
            urlInput.value='';
            renderWishlist(data);
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(error){
            {
              const status=document.getElementById('wishlistStatus');
              status.hidden=false;
              status.textContent=String(error?.message||'').startsWith('wishlist-url-')?'Проверьте ссылку':'Ошибка';
            }
          }finally{add.disabled=false}
        });
        wishlistRequest('list').then(renderWishlist).catch(()=>{
          {
            const status=document.getElementById('wishlistStatus');
            status.hidden=false;
            status.textContent='Ошибка';
          }
        });
      }

      function renderNearest(config){
        const events=[];
        for(const b of config.birthdays||[]){
          const n=nextOccurrence(b.month,b.day);
          events.push({
            title:'День рождения '+b.name,
            meta:dateLabel(b.month,b.day)+' · исполнится '+(n.year-b.year),
            days:n.days,target:n.target
          });
        }
        for(const e of config.importantDates||[]){
          if(!e.month||!e.day) continue;
          const n=nextOccurrence(e.month,e.day);
          events.push({title:e.title,meta:dateLabel(e.month,e.day),days:n.days,target:n.target});
        }
        events.sort((a,b)=>a.target-b.target);
        const e=events[0];
        if(!e) return;
        document.getElementById('nearestTitle').textContent=e.title;
        document.getElementById('nearestMeta').textContent=e.meta;
        document.getElementById('nearestDays').textContent=daysLabel(e.days);
      }

      async function reactionsRequest(operation,payload={}){
        const response=await fetch('/api/partner-message?rudiAction=reactions',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',operation,...payload}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'reactions-request-failed');
        return data;
      }

      function reactionNames(likedBy){
        const names=Array.isArray(likedBy)?likedBy.filter(Boolean):[];
        if(!names.length) return '';
        if(names.length===1) return 'Нравится: '+names[0];
        return 'Нравится: '+names.join(' и ');
      }

      function renderReaction(reaction,buttonId,namesId){
        const button=document.getElementById(buttonId);
        const names=document.getElementById(namesId);
        if(!button||!names) return;
        const likedBy=Array.isArray(reaction?.likedBy)?reaction.likedBy:[];
        const mine=likedBy.includes(currentActor);
        button.classList.toggle('is-liked',mine);
        button.setAttribute('aria-pressed',mine?'true':'false');
        button.dataset.likedBy=JSON.stringify(likedBy);
        names.textContent=reactionNames(likedBy);
        names.classList.toggle('is-visible',likedBy.length>0);
      }

      async function refreshReaction(target,buttonId,namesId){
        if(!target?.key||!currentActor) return;
        try{
          const data=await reactionsRequest('list',{targets:[target]});
          renderReaction(data.reactions?.[0],buttonId,namesId);
        }catch(_){}
      }

      function bindReaction(buttonId,namesId,targetProvider){
        const button=document.getElementById(buttonId);
        if(!button||button.dataset.reactionBound==='1') return;
        button.dataset.reactionBound='1';
        button.addEventListener('click',async event=>{
          event.preventDefault();
          event.stopPropagation();
          const target=targetProvider();
          if(!target?.key||button.disabled) return;
          const liked=button.getAttribute('aria-pressed')!=='true';
          let previousLikedBy=[];
          try{previousLikedBy=JSON.parse(button.dataset.likedBy||'[]')}catch(_){}
          const optimisticLikedBy=liked
            ? [...new Set([...previousLikedBy,currentActor])]
            : previousLikedBy.filter(name=>name!==currentActor);
          renderReaction({likedBy:optimisticLikedBy},buttonId,namesId);
          button.disabled=true;
          try{
            const data=await reactionsRequest('set',{target,liked});
            renderReaction(data.reaction,buttonId,namesId);
            button.classList.remove('just-liked');
            void button.offsetWidth;
            if(data.reaction?.likedBy?.includes(currentActor)) button.classList.add('just-liked');
            try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
          }catch(_){
            renderReaction({likedBy:previousLikedBy},buttonId,namesId);
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            button.disabled=false;
          }
        });
      }

      function setupReactions(){
        bindReaction('partnerMessageLike','partnerMessageLikedBy',()=>currentPartnerReactionKey?{type:'partner-message',key:currentPartnerReactionKey}:null);
        bindReaction('dailyIdeaLike','dailyIdeaLikedBy',()=>currentDailyReactionTargets.find(target=>target.type==='daily-idea')||null);
        bindReaction('watchLike','watchLikedBy',()=>currentDailyReactionTargets.find(target=>target.type==='watch')||null);
        bindReaction('feedFactsLike','feedFactsLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('facts:'))||null);
        bindReaction('feedConcertsLike','feedConcertsLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('concerts:'))||null);
        bindReaction('feedStandupLike','feedStandupLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('standup:'))||null);
        bindReaction('feedCinemaLike','feedCinemaLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('cinema:'))||null);
      }

      async function refreshDailyReactions(){
        if(!currentActor||!currentDailyReactionTargets.length) return;
        try{
          const data=await reactionsRequest('list',{targets:currentDailyReactionTargets});
          for(const reaction of data.reactions||[]){
            if(reaction.type==='daily-idea') renderReaction(reaction,'dailyIdeaLike','dailyIdeaLikedBy');
            if(reaction.type==='watch') renderReaction(reaction,'watchLike','watchLikedBy');
          }
        }catch(_){}
      }

      async function refreshFeedReactions(){
        if(!currentActor||!currentFeedReactionTargets.length) return;
        try{
          const data=await reactionsRequest('list',{targets:currentFeedReactionTargets});
          for(const reaction of data.reactions||[]){
            if(reaction.key.startsWith('facts:')) renderReaction(reaction,'feedFactsLike','feedFactsLikedBy');
            if(reaction.key.startsWith('concerts:')) renderReaction(reaction,'feedConcertsLike','feedConcertsLikedBy');
            if(reaction.key.startsWith('standup:')) renderReaction(reaction,'feedStandupLike','feedStandupLikedBy');
            if(reaction.key.startsWith('cinema:')) renderReaction(reaction,'feedCinemaLike','feedCinemaLikedBy');
          }
        }catch(_){}
      }

      function partnerAuthorGenitive(value){
        const name=String(value||'').trim();
        const normalized=name.toLowerCase();
        if(normalized==='рустам') return 'Рустама';
        if(normalized==='диана') return 'Дианы';
        return name;
      }

      function renderPartnerMessage(message){
        const textEl=document.getElementById('partnerMessageText');
        const authorEl=document.getElementById('partnerMessageAuthor');
        const reactionStrip=document.getElementById('partnerMessageReaction');
        if(!message?.text){
          textEl.textContent='Оставьте здесь пару тёплых слов друг для друга ♥';
          textEl.classList.add('partner-empty');
          authorEl.textContent='';
          currentPartnerReactionKey='';
          if(reactionStrip) reactionStrip.hidden=true;
          return;
        }
        textEl.textContent=message.text;
        textEl.classList.remove('partner-empty');
        const author=String(message.authorName||'').trim();
        authorEl.textContent=author?'С любовью, '+author:'С любовью';
        currentPartnerReactionKey='message:'+String(message.updatedAt||'').trim();
        if(reactionStrip) reactionStrip.hidden=!currentPartnerReactionKey;
        if(currentPartnerReactionKey) refreshReaction({type:'partner-message',key:currentPartnerReactionKey},'partnerMessageLike','partnerMessageLikedBy');
      }

      async function loadPartnerMessage(){
        try{
          const r=await fetch('/api/partner-message?rudiAction=partner-message-read',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg?.initData||''}),
            cache:'no-store'
          });
          if(!r.ok) throw new Error('partner-message');
          const data=await r.json();
          renderPartnerMessage(data.message);
          return data.message||null;
        }catch(_){
          const textEl=document.getElementById('partnerMessageText');
          textEl.textContent='Не удалось загрузить послание.';
          textEl.classList.add('partner-empty');
          return null;
        }
      }

      function setupPartnerMessage(){
        const editButton=document.getElementById('partnerEditButton');
        const editor=document.getElementById('partnerEditor');
        const input=document.getElementById('partnerMessageInput');
        const saveButton=document.getElementById('partnerSaveButton');
        const cancelButton=document.getElementById('partnerCancelButton');
        const status=document.getElementById('partnerStatus');
        let currentMessage=null;

        const canEdit=Boolean(tg?.initData);
        if(!canEdit){
          editButton.disabled=true;
          editButton.style.opacity='.45';
          editButton.title='Редактирование доступно внутри Telegram';
        }

        const closeEditor=()=>{
          editor.classList.remove('open');
          status.textContent='';
        };

        editButton.addEventListener('click',()=>{
          if(!canEdit) return;
          input.value=currentMessage?.text||'';
          editor.classList.add('open');
          setTimeout(()=>input.focus(),0);
        });

        cancelButton.addEventListener('click',closeEditor);

        saveButton.addEventListener('click',async()=>{
          const text=input.value.trim();
          if(!text){
            status.textContent='Введите текст послания.';
            return;
          }
          saveButton.disabled=true;
          status.textContent='Сохраняю…';
          try{
            const r=await fetch('/api/partner-message',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({text,initData:tg.initData}),
              cache:'no-store'
            });
            const data=await r.json().catch(()=>({}));
            if(!r.ok) throw new Error(data.error||'save');
            currentMessage=data.message;
            renderPartnerMessage(currentMessage);
            closeEditor();
            setTimeout(()=>refreshStateBackup(),250);
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(error){
            status.textContent=String(error?.message||'Ошибка сохранения');
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            saveButton.disabled=false;
          }
        });

        loadPartnerMessage().then(message=>{currentMessage=message});
      }

      let moodMessageTimer=0;
      let moodMessagesConfig=null;

      function moodButtons(){
        return Array.from(document.querySelectorAll('.mood-button'));
      }

      function selectOwnMood(value){
        moodButtons().forEach(button=>{
          const selected=button.dataset.mood===value;
          button.classList.toggle('selected',selected);
          button.setAttribute('aria-pressed',selected?'true':'false');
        });
      }

      function renderPartnerMood(value,partner){
        const label=document.getElementById('partnerMoodLabel');
        const holder=document.getElementById('partnerMoodValue');
        const empty=document.getElementById('partnerMoodEmpty');
        const mood=String(value||'');
        const visiblePartner=partnerProfileName||partner||'Партнёр';
        label.textContent=visiblePartner;
        holder.dataset.mood=mood;
        holder.querySelectorAll('[data-partner-mood]').forEach(icon=>{
          icon.hidden=icon.dataset.partnerMood!==mood;
        });
        empty.hidden=['low','ok','great'].includes(mood);
        holder.setAttribute(
          'aria-label',
          visiblePartner+': '+(
            mood==='low'?'не очень':mood==='ok'?'нормально':mood==='great'?'отлично':'настроение ещё не выбрано'
          )
        );
      }

      function renderDailyMood(payload){
        const mine=String(payload?.mine?.mood||'');
        const partnerMood=String(payload?.partnerMood?.mood||'');
        selectOwnMood(mine);
        renderPartnerMood(partnerMood,String(payload?.partner||''));
        document.getElementById('moodPrompt').hidden=Boolean(mine);
      }

      async function moodRequest(operation,mood=''){
        const response=await fetch('/api/mood',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',operation,mood}),
          cache:'no-store'
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(payload.error||'mood');
        return payload;
      }

      async function refreshDailyMood(){
        if(!currentActor||!tg?.initData) return;
        try{
          const payload=await moodRequest('get');
          currentMoodDateKey=String(payload?.date||todayState().key);
          renderDailyMood(payload);
        }catch(_){
          renderPartnerMood('',currentActor==='Рустам'?'Диана':'Рустам');
        }
      }

      function resetMoodForNewDay(){
        const nextKey=todayState().key;
        if(!currentMoodDateKey){
          currentMoodDateKey=nextKey;
          return false;
        }
        if(nextKey===currentMoodDateKey) return false;

        currentMoodDateKey=nextKey;
        clearTimeout(moodMessageTimer);
        const message=document.getElementById('moodMessage');
        if(message){
          message.classList.remove('show');
          message.textContent='';
          delete message.dataset.mood;
        }
        selectOwnMood('');
        renderPartnerMood('',currentActor==='Рустам'?'Диана':'Рустам');
        const prompt=document.getElementById('moodPrompt');
        if(prompt) prompt.hidden=false;
        refreshDailyMood();
        return true;
      }

      function showMoodMessage(mood){
        const message=document.getElementById('moodMessage');
        const messages=moodMessagesConfig||fallback.moodMessages;
        const pool=Array.isArray(messages?.[mood])&&messages[mood].length
          ?messages[mood]
          :fallback.moodMessages[mood];
        if(!pool?.length) return;
        clearTimeout(moodMessageTimer);
        message.textContent=randomItem(pool);
        message.dataset.mood=mood;
        message.classList.remove('show');
        void message.offsetWidth;
        message.classList.add('show');
        moodMessageTimer=setTimeout(()=>message.classList.remove('show'),4200);
      }

      function setupStreakAndMood(config){
        currentMoodDateKey=todayState().key;
        moodMessagesConfig=config?.moodMessages||fallback.moodMessages;
        renderPartnerMood('',currentActor==='Рустам'?'Диана':'Рустам');
        document.getElementById('moodPrompt').hidden=false;

        moodButtons().forEach(button=>button.addEventListener('click',async()=>{
          const mood=button.dataset.mood;
          const buttons=moodButtons();
          buttons.forEach(item=>item.disabled=true);
          selectOwnMood(mood);
          document.getElementById('moodPrompt').hidden=true;
          try{
            const payload=await moodRequest('set',mood);
            renderDailyMood(payload);
            showMoodMessage(mood);
            try{
              if(mood==='great') tg?.HapticFeedback?.notificationOccurred?.('success');
              else tg?.HapticFeedback?.selectionChanged?.();
            }catch(_){}
          }catch(_){
            await refreshDailyMood();
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            buttons.forEach(item=>item.disabled=false);
          }
        }));

        refreshDailyMood();
      }

      async function openCinemaPremieresTopic(){
        const button=document.getElementById('cinemaPremieresButton');
        if(!button||button.dataset.loading==='1') return;
        button.dataset.loading='1';
        button.disabled=true;
        try{
          const response=await fetch('/api/partner-message?rudiAction=cinema-topic-link',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg?.initData||''}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok||!payload.url) throw new Error(payload.error||'cinema-topic-link');
          const url=String(payload.url);
          try{
            if(tg?.openTelegramLink) tg.openTelegramLink(url);
            else if(tg?.openLink) tg.openLink(url);
            else window.open(url,'_blank','noopener,noreferrer');
          }catch(_){
            window.open(url,'_blank','noopener,noreferrer');
          }
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        }catch(_){
          button.classList.add('is-error');
          setTimeout(()=>button.classList.remove('is-error'),1200);
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }finally{
          button.dataset.loading='0';
          button.disabled=false;
        }
      }

      function setupCinemaPremieresButton(){
        const button=document.getElementById('cinemaPremieresButton');
        if(!button||button.dataset.bound==='1') return;
        button.dataset.bound='1';
        button.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          openCinemaPremieresTopic();
        });
      }

      function setupWatchSuggestion(config,title){
        const card=document.querySelector('.watch-card');
        if(!card) return;
        const links=config?.watchLinks&&typeof config.watchLinks==='object'?config.watchLinks:{};
        const url=String(links?.[title]||'').trim();
        card.classList.toggle('is-link',Boolean(url));
        card.setAttribute('aria-disabled',url?'false':'true');
        if(!url) return;

        const open=()=>{
          try{
            if(tg?.openLink) tg.openLink(url);
            else window.open(url,'_blank','noopener,noreferrer');
          }catch(_){
            window.open(url,'_blank','noopener,noreferrer');
          }
        };

        card.addEventListener('click',event=>{if(event.target.closest('button')) return;open()});
        card.addEventListener('keydown',event=>{
          if(event.key==='Enter'||event.key===' '){
            event.preventDefault();
            open();
          }
        });
      }

      function feedSeenStorageKey(){
        return 'rudi-feed-seen-v1-'+(currentActor==='Диана'?'diana':'rustam');
      }

      function setFeedBadge(visible){
        const badge=document.getElementById('feedTabBadge');
        const fresh=document.getElementById('feedFreshBadge');
        if(badge) badge.hidden=!visible;
        if(fresh) fresh.hidden=!visible;
      }

      function feedSeenVersion(){
        try{return String(localStorage.getItem(feedSeenStorageKey())||'')}catch(_){return ''}
      }

      function markFeedSeen(version){
        const value=String(version||'').trim();
        if(value){
          try{localStorage.setItem(feedSeenStorageKey(),value)}catch(_){}
        }
        setFeedBadge(false);
      }

      function feedDateKey(value){
        const date=value instanceof Date?value:new Date(value||Date.now());
        if(Number.isNaN(date.getTime())) return '';
        const parts=new Intl.DateTimeFormat('en-CA',{
          timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'
        }).formatToParts(date);
        const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));
        return map.year+'-'+map.month+'-'+map.day;
      }

      function feedTimeLabel(value){
        const date=new Date(String(value||''));
        if(Number.isNaN(date.getTime())) return '';
        const time=new Intl.DateTimeFormat('ru-RU',{
          hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:TZ
        }).format(date);
        if(feedDateKey(date)===feedDateKey(new Date())) return 'Сегодня · '+time;
        const day=new Intl.DateTimeFormat('ru-RU',{
          day:'numeric',month:'long',timeZone:TZ
        }).format(date);
        return day+' · '+time;
      }

      function normalizeFeedSource(value){
        return String(value||'')
          .trim()
          .replace(/\\r\\n|\\n|\\r/g,'\n')
          .replace(/\r\n?/g,'\n')
          .replace(/\n{3,}/g,'\n\n');
      }

      function cleanFeedPartSource(value,name=''){
        const lines=normalizeFeedSource(value).split('\n');
        const filtered=[];
        for(let index=0;index<lines.length;index+=1){
          const line=lines[index];
          const plain=line.replace(/<[^>]*>/g,'').trim();
          if(index===0&&(
            (name==='facts'&&/Полезн(?:ый факт|ые факты)/iu.test(plain))||
            (name==='concerts'&&/Поп и хип-хоп концерты/iu.test(plain))||
            (name==='standup'&&/Stage StandUp Club/iu.test(plain))||
            (name==='cinema'&&/Кинопремьеры/iu.test(plain))
          )) continue;
          filtered.push(line);
        }
        return filtered.join('\n').replace(/^\s+|\s+$/g,'').replace(/\n{3,}/g,'\n\n');
      }

      function normalizeFeedHtml(value,name=''){
        let raw=cleanFeedPartSource(value,name);
        if(name==='standup'||name==='cinema'){
          raw=raw.replace(/\n(?=\d+\.\s)/g,'\n\n');
        }
        return raw.replace(/\n/g,'<br>');
      }

      function sanitizeFeedHtml(value,name=''){
        const template=document.createElement('template');
        template.innerHTML=normalizeFeedHtml(value,name);
        const allowed=new Set(['B','STRONG','I','EM','A','BR','P','UL','OL','LI','SPAN']);
        for(const element of [...template.content.querySelectorAll('*')]){
          if(!allowed.has(element.tagName)){
            element.replaceWith(document.createTextNode(element.textContent||''));
            continue;
          }
          for(const attr of [...element.attributes]){
            if(element.tagName==='A'&&attr.name==='href') continue;
            element.removeAttribute(attr.name);
          }
          if(element.tagName==='A'){
            const href=String(element.getAttribute('href')||'').trim();
            if(!/^https?:\/\//i.test(href)){
              element.replaceWith(document.createTextNode(element.textContent||''));
              continue;
            }
            element.target='_blank';
            element.rel='noopener noreferrer';
          }
        }
        return template.content;
      }

      function feedDomIds(name){
        return {
          facts:['feedFactsBody','feedFactsMeta','feedFactsCard','feedFactsNew'],
          concerts:['feedConcertsBody','feedConcertsMeta','feedConcertsCard','feedConcertsNew'],
          standup:['feedStandupBody','feedStandupMeta','feedStandupCard','feedStandupNew'],
          cinema:['feedCinemaBody','feedCinemaMeta','feedCinemaCard','feedCinemaNew']
        }[name]||[];
      }

      function feedLineData(line){
        const template=document.createElement('template');
        template.innerHTML=String(line||'');
        const anchor=template.content.querySelector('a[href]');
        const href=String(anchor?.getAttribute('href')||'').trim();
        const text=String(template.content.textContent||'').replace(/\s+/g,' ').trim();
        return {text,href:/^https?:\/\//i.test(href)?href:''};
      }

      function cleanEventDetail(value){
        return String(value||'')
          .replace(/\s*\|\s*/g,' · ')
          .replace(/·\s*,/g,'· ')
          .replace(/\s+,/g,',')
          .replace(/\s{2,}/g,' ')
          .trim();
      }

      function parseFeedEventItems(value,name){
        const lines=normalizeFeedSource(value).split('\n');
        const items=[];
        let current=null;
        const push=()=>{
          if(current?.title) items.push(current);
          current=null;
        };
        for(const rawLine of lines){
          const row=feedLineData(rawLine);
          const text=row.text;
          if(!text) continue;
          if(
            /^(?:🎤\s*)?Поп и хип-хоп концерты$/iu.test(text)||
            /^(?:🎙\s*)?Stage StandUp Club$/iu.test(text)||
            /^📅/u.test(text)||
            /^Найдено событий\/сеансов/iu.test(text)
          ) continue;
          const numbered=text.match(/^\d+\.\s*(.+)$/u);
          if(numbered){
            push();
            current={title:numbered[1].trim(),details:[],href:''};
            continue;
          }
          if(!current) continue;
          if(row.href){
            current.href=row.href;
            continue;
          }
          if(/^(Подробнее|Официальная страница)\s*→?$/iu.test(text)) continue;
          current.details.push(cleanEventDetail(text));
        }
        push();
        return items;
      }

      function renderFeedEventItems(body,items){
        const list=document.createElement('div');
        list.className='feed-event-list';
        for(const item of items){
          const card=document.createElement('article');
          card.className='feed-event-item';
          const title=document.createElement('strong');
          title.className='feed-event-title';
          title.textContent=item.title;
          card.appendChild(title);
          for(const detailText of item.details){
            const detail=document.createElement('div');
            detail.className='feed-event-detail';
            detail.textContent=detailText;
            card.appendChild(detail);
          }
          if(item.href){
            const link=document.createElement('a');
            link.className='feed-event-link';
            link.href=item.href;
            link.target='_blank';
            link.rel='noopener noreferrer';
            link.textContent='Открыть →';
            card.appendChild(link);
          }
          list.appendChild(card);
        }
        body.appendChild(list);
      }

      function cinemaPosterUrl(value){
        const url=String(value||'').trim();
        return /^https:\/\//i.test(url)?('/api/poster-proxy?url='+encodeURIComponent(url)):'';
      }

      function cinemaDateLabel(value){
        const date=String(value||'').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return '';
        const parsed=new Date(date+'T12:00:00Z');
        if(Number.isNaN(parsed.getTime())) return '';
        return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:TZ}).format(parsed);
      }

      function renderFeedCinemaItems(body,items){
        const track=document.createElement('div');
        track.className='feed-cinema-track';
        for(const item of items){
          const card=document.createElement('article');
          card.className='feed-movie-card';

          const posterWrap=document.createElement('div');
          posterWrap.className='feed-movie-poster';
          const poster=cinemaPosterUrl(item?.posterUrl);
          if(poster){
            const image=document.createElement('img');
            image.src=poster;
            image.alt='';
            image.loading='lazy';
            image.decoding='async';
            image.addEventListener('error',()=>posterWrap.classList.add('is-fallback'),{once:true});
            posterWrap.appendChild(image);
          }else{
            posterWrap.classList.add('is-fallback');
          }

          const copy=document.createElement('div');
          copy.className='feed-movie-copy';
          const title=document.createElement('strong');
          title.className='feed-movie-title';
          title.textContent=String(item?.title||'Фильм');
          const meta=document.createElement('div');
          meta.className='feed-movie-meta';
          const date=cinemaDateLabel(item?.releaseDate);
          const sources=(Array.isArray(item?.sources)?item.sources:[]).filter(Boolean).join(', ');
          meta.textContent=[date?('Премьера '+date):'',sources].filter(Boolean).join(' · ');
          copy.append(title,meta);

          const sourceUrl=(Array.isArray(item?.sourceUrls)?item.sourceUrls:[]).find(row=>/^https?:\/\//i.test(String(row?.url||'')))?.url;
          const href=String(sourceUrl||item?.kinopoiskUrl||'').trim();
          if(/^https?:\/\//i.test(href)){
            const link=document.createElement('a');
            link.className='feed-movie-link';
            link.href=href;
            link.target='_blank';
            link.rel='noopener noreferrer';
            link.textContent='Открыть →';
            copy.appendChild(link);
          }
          card.append(posterWrap,copy);
          track.appendChild(card);
        }
        body.appendChild(track);
      }

      function parseLegacyCinemaItems(value){
        const lines=normalizeFeedSource(value).split('\n');
        const items=[];
        let current=null;
        const push=()=>{
          if(!current?.title) return;
          current.sources=current.sources.filter(Boolean);
          items.push(current);
          current=null;
        };
        for(const rawLine of lines){
          const row=feedLineData(rawLine);
          const text=row.text;
          if(!text) continue;
          if(/Кинопремьеры/iu.test(text)&&!/^\d+\./u.test(text)) continue;
          const numbered=text.match(/^\d+\.\s*(.+)$/u);
          if(numbered){
            push();
            current={
              title:numbered[1].trim(),
              posterUrl:'',
              releaseDate:'',
              sources:[],
              sourceUrls:[],
              kinopoiskUrl:row.href||''
            };
            continue;
          }
          if(!current) continue;
          if(row.href){
            if(!current.kinopoiskUrl) current.kinopoiskUrl=row.href;
            continue;
          }
          if(!/^(Подробнее|Открыть|Источник)\s*→?$/iu.test(text)){
            current.sources.push(cleanEventDetail(text));
          }
        }
        push();
        return items;
      }

      function feedSectionSeenStorageKey(){
        return 'rudi-feed-card-seen-v1-'+(currentActor==='Диана'?'diana':'rustam');
      }

      function readFeedSectionSeen(){
        try{
          const value=JSON.parse(localStorage.getItem(feedSectionSeenStorageKey())||'{}');
          return value&&typeof value==='object'?value:{};
        }catch(_){return {}}
      }

      function writeFeedSectionSeen(value){
        try{localStorage.setItem(feedSectionSeenStorageKey(),JSON.stringify(value||{}))}catch(_){}
      }

      let feedCardObserver=null;
      const feedCardSeenTimers=new Map();

      function markFeedCardSeen(name,version){
        if(!name||!version) return;
        const seen=readFeedSectionSeen();
        if(seen[name]===version) return;
        seen[name]=version;
        writeFeedSectionSeen(seen);
        const [, ,cardId,newId]=feedDomIds(name);
        document.getElementById(cardId)?.classList.remove('is-new');
        const badge=document.getElementById(newId);
        if(badge) badge.hidden=true;
      }

      function observeFeedCards(){
        feedCardObserver?.disconnect?.();
        for(const timer of feedCardSeenTimers.values()) clearTimeout(timer);
        feedCardSeenTimers.clear();
        if(typeof IntersectionObserver!=='function') return;
        feedCardObserver=new IntersectionObserver((entries)=>{
          for(const entry of entries){
            const card=entry.target;
            const name=String(card.dataset.feedCard||'');
            const version=String(card.dataset.feedVersion||'');
            if(entry.isIntersecting&&entry.intersectionRatio>=.55&&card.classList.contains('is-new')){
              if(feedCardSeenTimers.has(name)) continue;
              const timer=setTimeout(()=>{
                if(card.classList.contains('is-new')) markFeedCardSeen(name,version);
                feedCardSeenTimers.delete(name);
              },700);
              feedCardSeenTimers.set(name,timer);
            }else if(feedCardSeenTimers.has(name)){
              clearTimeout(feedCardSeenTimers.get(name));
              feedCardSeenTimers.delete(name);
            }
          }
        },{threshold:[.55]});
        document.querySelectorAll('.feed-card.is-new').forEach(card=>feedCardObserver.observe(card));
      }

      function setFeedCardFresh(name,section,hasContent,payload){
        const [, ,cardId,newId]=feedDomIds(name);
        const card=document.getElementById(cardId);
        const badge=document.getElementById(newId);
        if(!card) return;
        const version=name+':'+String(section?.updatedAt||payload?.date||payload?.version||'');
        card.dataset.feedVersion=version;
        const seen=readFeedSectionSeen();
        const fresh=Boolean(hasContent&&version&&seen[name]!==version);
        card.classList.toggle('is-new',fresh);
        if(badge) badge.hidden=!fresh;
      }

      function sectionMetaText(name,section){
        const label=feedTimeLabel(section?.updatedAt);
        if(!label) return name==='cinema'?'До следующей подборки':'Актуально';
        return name==='cinema'?'Подборка · '+label:label;
      }

      function eventEmptyText(name,value){
        const text=feedLineData(normalizeFeedSource(value).replace(/\n/g,' ')).text;
        return name==='concerts'
          ?/не найден|нет концертов/iu.test(text)
          :/не найден|нет событий/iu.test(text);
      }

      function renderFeedSection(name,section,partsOverride,payload){
        const [bodyId,metaId,cardId]=feedDomIds(name);
        const body=document.getElementById(bodyId);
        const meta=document.getElementById(metaId);
        const card=document.getElementById(cardId);
        if(!body) return {name,count:0,hasContent:false,firstTime:9999};
        body.replaceChildren();

        const parts=(Array.isArray(partsOverride)?partsOverride:Array.isArray(section?.parts)?section.parts:[]).filter(Boolean);
        const structuredItems=Array.isArray(section?.items)?section.items.filter(Boolean):[];
        const reaction=card?.querySelector('.feed-reaction');
        const raw=String(parts[0]||'');
        let count=0;
        let hasContent=Boolean(parts.length||structuredItems.length);
        let firstTime=9999;

        if(name==='concerts'||name==='standup'){
          const items=raw?parseFeedEventItems(raw,name):[];
          count=items.length;
          for(const item of items){
            const time=item.details.map(value=>value.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/u)).find(Boolean);
            if(time){
              const minutes=Number(time[1])*60+Number(time[2]);
              if(Number.isFinite(minutes)) firstTime=Math.min(firstTime,minutes);
            }
          }
          if(items.length){
            renderFeedEventItems(body,items);
          }else if(!raw||eventEmptyText(name,raw)){
            hasContent=false;
            const empty=document.createElement('div');
            empty.className='feed-empty';
            empty.textContent=name==='concerts'?'На сегодня концертов не найдено.':'На сегодня событий Stand Up не найдено.';
            body.appendChild(empty);
          }else{
            const part=document.createElement('div');
            part.className='feed-part';
            part.dataset.feedKind=name;
            part.appendChild(sanitizeFeedHtml(raw,name));
            body.appendChild(part);
          }
        }else if(name==='cinema'){
          const cinemaItems=structuredItems.length?structuredItems:parseLegacyCinemaItems(raw);
          if(cinemaItems.length){
            count=cinemaItems.length;
            renderFeedCinemaItems(body,cinemaItems);
          }else if(parts.length){
            count=parts.length;
            for(const value of parts){
              const part=document.createElement('div');
              part.className='feed-part';
              part.dataset.feedKind=name;
              part.appendChild(sanitizeFeedHtml(value,name));
              body.appendChild(part);
            }
          }else{
            hasContent=false;
            const empty=document.createElement('div');
            empty.className='feed-empty';
            empty.textContent='Подборка появится после первой публикации кинопремьер.';
            body.appendChild(empty);
          }
        }else if(parts.length){
          count=parts.length;
          for(const value of parts){
            const part=document.createElement('div');
            part.className='feed-part';
            part.dataset.feedKind=name;
            part.appendChild(sanitizeFeedHtml(value,name));
            body.appendChild(part);
          }
        }else{
          hasContent=false;
          const empty=document.createElement('div');
          empty.className='feed-empty';
          empty.textContent=name==='cinema'
            ?'Подборка появится после первой публикации кинопремьер.'
            :'Новый полезный факт появится после следующего обновления.';
          body.appendChild(empty);
        }

        if(reaction) reaction.hidden=!hasContent;
        if(meta) meta.textContent=hasContent?sectionMetaText(name,section):'Нет свежих данных';
        setFeedCardFresh(name,section,hasContent,payload);
        return {name,count,hasContent,firstTime};
      }

      function feedTodayCountLabel(name,count){
        if(name==='concerts'){
          const n=Math.abs(count)%100,m=n%10;
          const word=n>=11&&n<=14?'концертов':m===1?'концерт':m>=2&&m<=4?'концерта':'концертов';
          return '🎤 '+count+' '+word;
        }
        if(name==='standup') return '🎙 '+count+' Stand Up';
        if(name==='facts') return '💡 Факт дня';
        if(name==='cinema') return '🎬 Кинопремьеры';
        return '';
      }

      function renderFeedToday(payload,results){
        const wrap=document.getElementById('feedToday');
        const links=document.getElementById('feedTodayLinks');
        const dateEl=document.getElementById('feedTodayDate');
        if(!wrap||!links) return;
        links.replaceChildren();
        const today=feedDateKey(new Date());
        const payloadToday=String(payload?.date||'')===today;
        const rows=[];
        for(const result of results){
          if(!result?.hasContent) continue;
          if((result.name==='concerts'||result.name==='standup')&&(!payloadToday||result.count<1)) continue;
          if(result.name==='facts'&&!payloadToday) continue;
          if(result.name==='cinema'&&feedDateKey(payload?.sections?.cinema?.updatedAt)!==today) continue;
          rows.push(result);
        }
        for(const result of rows){
          const button=document.createElement('button');
          button.type='button';
          button.className='feed-today-chip';
          button.textContent=feedTodayCountLabel(result.name,result.count);
          button.addEventListener('click',()=>{
            const [, ,cardId]=feedDomIds(result.name);
            document.getElementById(cardId)?.scrollIntoView({behavior:'smooth',block:'start'});
          });
          links.appendChild(button);
        }
        if(dateEl){
          dateEl.textContent=new Intl.DateTimeFormat('ru-RU',{
            day:'numeric',month:'long',timeZone:TZ
          }).format(new Date());
        }
        wrap.hidden=!rows.length;
      }

      function sortFeedCards(results){
        const grid=document.querySelector('.feed-grid');
        if(!grid) return;
        const byName=new Map(results.map(result=>[result.name,result]));
        const score=(name)=>{
          const result=byName.get(name)||{};
          if((name==='concerts'||name==='standup')&&result.hasContent&&result.count>0){
            return 100+(Number.isFinite(result.firstTime)?result.firstTime:999);
          }
          if(name==='facts'&&result.hasContent) return 2000;
          if(name==='cinema'&&result.hasContent) return 3000;
          return 4000+(name==='concerts'?1:name==='standup'?2:3);
        };
        ['concerts','standup','facts','cinema']
          .sort((a,b)=>score(a)-score(b))
          .forEach(name=>{
            const [, ,cardId]=feedDomIds(name);
            const card=document.getElementById(cardId);
            if(card) grid.appendChild(card);
          });
      }

      function renderFeed(payload){
        const sections=payload?.sections&&typeof payload.sections==='object'?payload.sections:{};
        const eventParts=Array.isArray(sections.events?.parts)?sections.events.parts:[];
        const results=[
          renderFeedSection('facts',sections.facts,null,payload),
          renderFeedSection('concerts',sections.events,eventParts[0]?[eventParts[0]]:[],payload),
          renderFeedSection('standup',sections.events,eventParts[1]?[eventParts[1]]:[],payload),
          renderFeedSection('cinema',sections.cinema,null,payload)
        ];

        sortFeedCards(results);
        renderFeedToday(payload,results);
        setTimeout(observeFeedCards,0);

        currentFeedReactionTargets=[
          ...(sections.facts?.parts?.length?[{type:'feed',key:'facts:'+String(sections.facts.updatedAt||payload?.date||'')}]:[]),
          ...(eventParts[0]?[{type:'feed',key:'concerts:'+String(sections.events?.updatedAt||payload?.date||'')}]:[]),
          ...(eventParts[1]?[{type:'feed',key:'standup:'+String(sections.events?.updatedAt||payload?.date||'')}]:[]),
          ...((sections.cinema?.parts?.length||sections.cinema?.items?.length)?[{type:'feed',key:'cinema:'+String(sections.cinema.updatedAt||'current')}]:[])
        ].filter(target=>target.key.length<220);
        refreshFeedReactions();

        const updated=document.getElementById('feedUpdated');
        const status=document.getElementById('feedStatus');
        const updatedLabel=feedTimeLabel(payload?.updatedAt);
        if(updated) updated.textContent=updatedLabel?'Обновлено '+updatedLabel:'Свежая подборка RUDI';
        if(status) status.textContent=Object.keys(sections).length?'':'Лента заполнится после ближайшего обновления.';

        const version=String(payload?.version||'');
        const unseen=Boolean(version&&version!==feedSeenVersion());
        setFeedBadge(unseen&&currentAppTab!=='feed');
        if(currentAppTab==='feed') markFeedSeen(version);
      }

      async function loadFeed({silent=false}={}){
        if(!currentActor||!tg?.initData) return;
        const status=document.getElementById('feedStatus');
        if(status&&!silent) status.textContent='Обновляю Ленту…';
        try{
          const response=await fetch('/api/feed',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok) throw new Error(payload.error||'feed-request-failed');
          renderFeed(payload);
        }catch(_){
          if(status) status.textContent='Не удалось обновить Ленту. Уже сохранённые актуальные материалы не удаляются из-за временного сбоя.';
          for(const name of ['facts','concerts','standup','cinema']){
            const [bodyId]=feedDomIds(name);
            const body=document.getElementById(bodyId);
            if(body&&body.querySelector('.feed-skeleton')){
              body.replaceChildren();
              const empty=document.createElement('div');
              empty.className='feed-empty';
              empty.textContent='Временно недоступно';
              body.appendChild(empty);
            }
          }
        }
      }

      const PRODUCT_CATEGORY_ORDER=[
        'Мясо и рыба','Овощи и зелень','Фрукты и ягоды','Молочное и яйца',
        'Хлеб и выпечка','Бакалея','Сладкое и снеки','Напитки',
        'Заморозка','Для дома','Гигиена','Для Лулу','Другое'
      ];
      const PRODUCT_CATEGORY_EMOJI={
        'Мясо и рыба':'🥩','Овощи и зелень':'🥬','Фрукты и ягоды':'🍎',
        'Молочное и яйца':'🥛','Хлеб и выпечка':'🥖','Бакалея':'🌾',
        'Сладкое и снеки':'🍫','Напитки':'🥤','Заморозка':'❄️',
        'Для дома':'🧽','Гигиена':'🧴','Для Лулу':'🐾','Другое':'📦'
      };

      async function productsRequest(operation,payload={}){
        const response=await fetch('/api/partner-message?rudiAction=products',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation,...payload}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'products-request-failed');
        if(operation!=='list') setTimeout(()=>refreshStateBackup(),250);
        return data;
      }

      function setProductsBadge(hasProducts){
        const badge=document.getElementById('productsTabBadge');
        if(badge) badge.hidden=!hasProducts;
      }

      function productAddedByLabel(value){
        const name=String(value||'').trim();
        if(!name) return '';
        if(name==='RUDI') return 'Добавлено ранее';
        const female=name==='Диана'||name==='Алиса';
        return (female?'Добавила ':'Добавил ')+name;
      }

      function productBoughtMeta(item){
        const date=new Date(String(item?.boughtAt||''));
        const when=Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ru-RU',{
          day:'2-digit',month:'2-digit',year:'numeric',
          hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:TZ
        }).format(date).replace(',',' ·');
        const buyer=String(item?.boughtBy||'').trim();
        const bought=buyer?(buyer==='Диана'?'Купила ':'Купил ')+buyer:'';
        const added=productAddedByLabel(item?.addedBy);
        return [when,added,bought].filter(Boolean).join(' · ');
      }

      async function copyProductText(text,button){
        let copied=false;
        try{
          await navigator.clipboard.writeText(String(text||''));
          copied=true;
        }catch(_){
          try{
            const area=document.createElement('textarea');
            area.value=String(text||'');
            area.setAttribute('readonly','');
            area.style.position='fixed';
            area.style.opacity='0';
            document.body.appendChild(area);
            area.select();
            copied=document.execCommand('copy');
            area.remove();
          }catch(_){}
        }
        if(copied){
          button?.classList.add('copied');
          setTimeout(()=>button?.classList.remove('copied'),700);
          try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
        }
      }

      function productIconButton(label,svg){
        const button=document.createElement('button');
        button.type='button';
        button.className='product-icon-action';
        button.setAttribute('aria-label',label);
        button.title=label;
        button.innerHTML=svg;
        return button;
      }

      function renderProducts(payload){
        const items=Array.isArray(payload?.items)?payload.items:[];
        const history=Array.isArray(payload?.history)?payload.history:[];
        const groups=document.getElementById('productsGroups');
        const empty=document.getElementById('productsEmpty');
        const status=document.getElementById('productsStatus');
        const clear=document.getElementById('productsClear');
        const boughtAll=document.getElementById('productsBought');
        const historyList=document.getElementById('productsHistory');
        const historyEmpty=document.getElementById('productsHistoryEmpty');
        const historyCount=document.getElementById('productsHistoryCount');
        if(!groups||!empty||!historyList) return;

        setProductsBadge(items.length>0);
        if(clear) clear.disabled=!items.length;
        if(boughtAll){
          const checkedCount=items.filter(item=>Boolean(item.checked)).length;
          boughtAll.disabled=!items.length;
          boughtAll.dataset.checkedCount=String(checkedCount);
          boughtAll.classList.toggle('has-selection',checkedCount>0);
        }
        if(status){
          status.textContent=items.length
            ?items.length+' '+(items.length===1?'позиция':(items.length>=2&&items.length<=4?'позиции':'позиций'))
            :'';
          status.hidden=!items.length;
        }

        groups.replaceChildren();
        const byCategory=new Map();
        for(const item of items){
          const category=String(item?.category||'Другое');
          if(!byCategory.has(category)) byCategory.set(category,[]);
          byCategory.get(category).push(item);
        }
        const ordered=[
          ...PRODUCT_CATEGORY_ORDER.filter(category=>byCategory.has(category)),
          ...[...byCategory.keys()].filter(category=>!PRODUCT_CATEGORY_ORDER.includes(category))
        ];

        for(const category of ordered){
          const section=document.createElement('section');
          section.className='product-category';
          const head=document.createElement('div');
          head.className='product-category-head';
          const title=document.createElement('strong');
          title.textContent=(PRODUCT_CATEGORY_EMOJI[category]||'📦')+' '+category;
          const count=document.createElement('span');
          count.textContent=String(byCategory.get(category).length);
          head.append(title,count);

          const list=document.createElement('div');
          list.className='product-list';
          for(const item of byCategory.get(category)){
            const row=document.createElement('div');
            row.className='product-item'+(item.checked?' is-checked':'');

            const check=document.createElement('button');
            check.type='button';
            check.className='product-check';
            check.setAttribute('aria-label',item.checked?'Снять отметку':'Отметить');
            check.setAttribute('aria-pressed',item.checked?'true':'false');
            check.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-9"/></svg>';
            check.addEventListener('click',async()=>{
              check.disabled=true;
              try{
                renderProducts(await productsRequest('toggle',{id:item.id}));
                try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
              }catch(_){
                try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
              }finally{check.disabled=false}
            });

            const main=document.createElement('div');
            main.className='product-main';
            const text=document.createElement('div');
            text.className='product-text';
            text.textContent=String(item.text||'');
            const amount=document.createElement('small');
            amount.className='product-weekly-amount';
            const weeklyAmount=String(item.weeklyAmount||'').trim();
            amount.textContent=weeklyAmount?'На неделю для двоих: ~'+weeklyAmount:'';
            amount.hidden=!weeklyAmount;
            const meta=document.createElement('small');
            meta.className='product-added-by';
            meta.textContent=productAddedByLabel(item.addedBy);
            main.append(text,amount,meta);

            const actions=document.createElement('div');
            actions.className='product-actions';
            const copy=productIconButton('Копировать','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>');
            copy.addEventListener('click',()=>copyProductText(item.text,copy));

            const remove=productIconButton('Удалить','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>');
            remove.classList.add('danger');
            remove.addEventListener('click',async()=>{
              remove.disabled=true;
              try{
                renderProducts(await productsRequest('remove',{id:item.id}));
                try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
              }catch(_){
                try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
              }finally{remove.disabled=false}
            });

            actions.append(copy,remove);
            row.append(check,main,actions);
            list.appendChild(row);
          }
          section.append(head,list);
          groups.appendChild(section);
        }

        empty.hidden=items.length>0;
        historyList.replaceChildren();
        if(historyCount) historyCount.textContent=history.length?String(history.length):'';
        if(historyEmpty) historyEmpty.hidden=history.length>0;
        for(const item of history){
          const row=document.createElement('div');
          row.className='product-history-item';
          const copy=document.createElement('div');
          copy.className='product-history-copy';
          const text=document.createElement('strong');
          text.textContent=String(item.text||'');
          const meta=document.createElement('small');
          meta.textContent=productBoughtMeta(item);
          copy.append(text,meta);
          row.appendChild(copy);
          historyList.appendChild(row);
        }
      }

      function productsRefreshDelay(){
        if(document.visibilityState!=='visible'||currentAppTab!=='products') return 60000;
        return 15000;
      }

      function scheduleProductsRefresh(delay=productsRefreshDelay()){
        clearTimeout(productsRefreshTimer);
        productsRefreshTimer=setTimeout(async()=>{
          if(currentActor&&document.visibilityState==='visible'&&currentAppTab==='products'){
            await loadProducts({silent:true});
          }
          scheduleProductsRefresh();
        },Math.max(5000,Number(delay)||productsRefreshDelay()));
      }

      async function loadProducts({silent=false}={}){
        if(!currentActor||!tg?.initData) return;
        if(productsLoadPromise) return productsLoadPromise;

        const status=document.getElementById('productsStatus');
        if(status&&!silent){
          status.hidden=false;
          status.textContent='Обновляю список…';
        }

        productsLoadPromise=(async()=>{
          try{
            renderProducts(await productsRequest('list'));
          }catch(_){
            if(status&&!silent){
              status.hidden=false;
              status.textContent='Не удалось обновить список';
            }
          }
        })();

        try{
          return await productsLoadPromise;
        }finally{
          productsLoadPromise=null;
        }
      }

      function confirmProductsClear(){
        return new Promise(resolve=>{
          try{
            if(tg?.showConfirm){
              tg.showConfirm('Очистить весь список продуктов?',value=>resolve(Boolean(value)));
              return;
            }
          }catch(_){}
          resolve(window.confirm('Очистить весь список продуктов?'));
        });
      }

      function setupProducts(){
        const form=document.getElementById('productsForm');
        const input=document.getElementById('productsInput');
        const add=document.getElementById('productsAdd');
        const clear=document.getElementById('productsClear');
        const boughtAll=document.getElementById('productsBought');
        if(!form||!input||!add||!clear||!boughtAll) return;

        input.addEventListener('focus',()=>document.body.classList.add('keyboard-editing'));
        input.addEventListener('blur',()=>document.body.classList.remove('keyboard-editing'));

        form.addEventListener('submit',async event=>{
          event.preventDefault();
          const raw=input.value.trim();
          if(!raw) return;
          const items=raw.split(/\s*[,;\n]+\s*/).map(value=>value.trim()).filter(Boolean);
          add.disabled=true;
          try{
            renderProducts(await productsRequest('add',{items}));
            input.value='';
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{add.disabled=false}
        });

        boughtAll.addEventListener('click',async()=>{
          if(boughtAll.disabled) return;
          const checkedCount=Number(boughtAll.dataset.checkedCount||0);
          if(checkedCount<=0){
            const status=document.getElementById('productsStatus');
            if(status){
              status.hidden=false;
              status.textContent='Сначала отметьте купленные продукты галочками';
            }
            try{tg?.HapticFeedback?.notificationOccurred?.('warning')}catch(_){}
            return;
          }
          boughtAll.disabled=true;
          try{
            renderProducts(await productsRequest('buy-checked'));
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            boughtAll.disabled=false;
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }
        });

        clear.addEventListener('click',async()=>{
          if(clear.disabled||!(await confirmProductsClear())) return;
          clear.disabled=true;
          try{
            renderProducts(await productsRequest('clear'));
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }
        });

        loadProducts();
        scheduleProductsRefresh(15000);
      }

      function renderLatestUpdate(config){
        const updates=(Array.isArray(config?.updates)?config.updates:[])
          .filter(item=>item?.date)
          .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
        const card=document.getElementById('updatesCard');
        const date=document.getElementById('updatesDate');
        const summary=document.getElementById('updatesSummary');
        const list=document.getElementById('updatesList');

        if(!updates.length){
          card.hidden=true;
          return;
        }

        const formatUpdateDate=value=>{
          const parsed=new Date(String(value)+'T12:00:00Z');
          return Number.isNaN(parsed.getTime())
            ?String(value)
            :new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(parsed);
        };

        const latest=updates[0];
        const latestItems=Array.isArray(latest.items)?latest.items.filter(Boolean):[];
        date.textContent=latest.title||('Обновление '+formatUpdateDate(latest.date));
        summary.textContent=latestItems.length
          ?latestItems.length+' '+(latestItems.length===1?'изменение':(latestItems.length>=2&&latestItems.length<=4?'изменения':'изменений'))
          :'История обновлений RUDI';

        list.replaceChildren();
        for(const update of updates){
          const group=document.createElement('section');
          group.className='update-group';

          const heading=document.createElement('div');
          heading.className='update-group-title';
          heading.textContent=update.title||('Обновление '+formatUpdateDate(update.date));
          group.appendChild(heading);

          const items=Array.isArray(update.items)?update.items.filter(Boolean):[];
          for(const value of items){
            const row=document.createElement('div');
            row.className='update-row';
            const check=document.createElement('span');
            check.className='update-check';
            check.textContent='✓';
            const text=document.createElement('div');
            text.className='update-text';
            text.textContent=String(value);
            row.append(check,text);
            group.appendChild(row);
          }
          list.appendChild(group);
        }
      }

      async function init(){
        const allowed=await authenticateApp();
        if(!allowed) return;
        setupProfileSplit();
        setupHomeLayoutEditor();
        setupAppTabs();
        ensureAppSurface({restoreTab:true});
        const config=await loadConfig();
        currentConfig=config;
        setupProducts();
        const {utc}=todayState();
        const dayIndex=Math.floor(utc/DAY);
        renderDailyCompliment(config,{force:true});

        const ideas=config.dailyIdeas?.length?config.dailyIdeas:fallback.dailyIdeas;
        const watch=config.watchList?.length?config.watchList:fallback.watchList;
        const watchRatings=config.watchRatings&&typeof config.watchRatings==='object'?config.watchRatings:fallback.watchRatings;
        const watchMin=Math.max(7,Number(config.watchMinImdbRating??fallback.watchMinImdbRating)||7);
        const eligibleWatch=watch.filter(title=>Number(watchRatings?.[title])>=watchMin);
        const watchTitle=String(eligibleWatch.length?eligibleWatch[Math.abs(dayIndex+3)%eligibleWatch.length]:'').trim();
        const watchRating=Number(watchRatings?.[watchTitle]);
        const ideaText=String(ideas[Math.abs(dayIndex)%ideas.length]||'').trim();
        document.getElementById('dailyIdea').textContent=ideaText;
        const watchCard=document.querySelector('.watch-card');
        if(watchCard) watchCard.hidden=!watchTitle;
        document.getElementById('watchToday').textContent=watchTitle;
        const watchRatingRow=document.getElementById('watchRatingRow');
        const watchRatingEl=document.getElementById('watchRating');
        if(watchRatingRow) watchRatingRow.hidden=!(watchTitle&&Number.isFinite(watchRating)&&watchRating>=watchMin);
        if(watchRatingEl) watchRatingEl.textContent=Number.isFinite(watchRating)?watchRating.toFixed(1):'';
        if(watchTitle) setupWatchSuggestion(config,watchTitle);

        const todayKey=todayState().key;
        currentDailyReactionTargets=[
          {type:'daily-idea',key:'day:'+todayKey},
          ...(watchTitle?[{type:'watch',key:'day:'+todayKey}]:[])
        ];
        setupReactions();
        refreshDailyReactions();

        renderNearest(config);
        setupDianaCycleActions();
        loadDianaCycle();
        setupPersistentCollapsibles();
        setupPartnerMessage();
        setupStreakAndMood(config);
        setupTickTickDisclosure();
        setupTickTickConnect();
        setupWishlist();
        setupSharedAlbum();
        setupWorkCalendarDisclosure();
        loadTickTickNext();
        loadWorkCalendar().then(()=>prefetchCalendarView('next-month'));
        loadSharedAlbum();
        loadFeed({silent:true});
        setTimeout(()=>refreshStateBackup(),2500);
      }

      init().catch(error=>{
        console.error('RUDI_INIT_ERROR',error);
        if(!document.body.classList.contains('auth-ok')){
          denyApp('Не удалось открыть RUDI','Закройте приложение и откройте его снова из Telegram.');
        }
      });
      setInterval(()=>{if(currentActor) loadDianaCycle({silent:true})},30*60*1000);
      setInterval(()=>{if(currentActor) loadTickTickNext()},5*60*1000);
      setInterval(()=>{if(currentActor) loadWorkCalendar(currentWorkCalendarView,{silent:true})},15*60*1000);
      setInterval(()=>{if(currentActor) loadSharedAlbum()},15*60*1000);
      setInterval(()=>{if(currentActor&&currentAppTab==='feed') loadFeed({silent:true})},15*60*1000);
      setInterval(()=>{if(currentActor) refreshDailyMood()},5*60*1000);
      setInterval(()=>{if(currentActor){resetMoodForNewDay();if(currentConfig) renderDailyCompliment(currentConfig)}},5000);
      setInterval(()=>{if(currentActor) refreshStateBackup()},5*60*1000);

      function ensureAppSurface({restoreTab=false}={}){
        applyTheme();
        updateTelegramSafeArea();
        document.body.classList.remove('keyboard-editing');
        if(!currentActor) return;

        document.body.classList.remove('auth-pending','auth-denied');
        document.body.classList.add('auth-ok');
        syncStaticProfileWorkStatus();

        if(restoreTab){
          const activeSections=[...document.querySelectorAll('[data-app-tab-section="'+currentAppTab+'"]')];
          const hasAvailableActive=activeSections.some(section=>section.dataset.tabAvailable!=='0');
          applyAppTab(hasAvailableActive?currentAppTab:'home',{scroll:false});
        }
      }

      let resumeRefreshPromise=null;
      async function refreshAfterResume(){
        ensureAppSurface();
        if(!currentActor) return;
        if(currentConfig) renderDailyCompliment(currentConfig);
        if(resumeRefreshPromise) return resumeRefreshPromise;

        resumeRefreshPromise=new Promise(resolve=>{
          requestAnimationFrame(()=>requestAnimationFrame(resolve));
        }).then(async()=>{
          resetMoodForNewDay();
          await Promise.allSettled([
            refreshDailyMood(),
            loadDianaCycle({silent:true}),
            loadTickTickNext(),
            loadWorkCalendar(currentWorkCalendarView),
            loadSharedAlbum(),
            (currentAppTab==='products'?loadProducts({silent:true}):Promise.resolve()),
            (currentAppTab==='feed'?loadFeed({silent:true}):Promise.resolve()),
            refreshDailyReactions(),
            refreshStateBackup()
          ]);
        }).finally(()=>{
          resumeRefreshPromise=null;
          ensureAppSurface();
        });
        return resumeRefreshPromise;
      }

      window.addEventListener('pageshow',()=>{
        ensureAppSurface();
        refreshAfterResume();
      });
      window.addEventListener('focus',()=>{
        ensureAppSurface();
      });
      let hiddenAt=0;
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='hidden'){
          hiddenAt=Date.now();
          return;
        }
        ensureAppSurface();
        if(currentActor&&currentAppTab==='products'){
          loadProducts({silent:true});
          scheduleProductsRefresh(15000);
        }
        if(hiddenAt&&Date.now()-hiddenAt>1200) refreshAfterResume();
        hiddenAt=0;
      });
    })();
