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
      let partnerProfileName = '';
      let holidayItemsCache = null;
      let holidayItemsPromise = null;
      let currentWorkCalendarView = 'month';
      let currentSharedCalendarView = 'month';
      let sharedAlbumUrl = '';
      let sharedAlbumPhotos = [];
      let currentSharedAlbumPhotoIndex = -1;
      let currentAppTab = 'home';
      let productsLoadPromise = null;
      let productsRefreshTimer = 0;
      let currentMoodDateKey = '';
      let currentConfig = null;
      let currentComplimentDateKey = '';
      let homeLayoutEditing = false;
      let homeTileHost = null;
      const HOME_TILE_DEFAULT_ORDER = ['profile-common','profile-self','profile-partner','cycle','priority','partner','daily'];
      const appTabScroll = {home:0,schedule:0,wishlist:0,photos:0,products:0};
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
        const allowed=['home','schedule','wishlist','photos','products'];
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

      function setupAppTabs(){
        applyAppTab('home',{scroll:false});
        document.querySelectorAll('[data-app-tab]').forEach(button=>{
          button.addEventListener('click',()=>{
            const next=button.dataset.appTab||'home';
            if(next===currentAppTab){
              appTabScroll[next]=window.scrollY||0;
              try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
              return;
            }
            appTabScroll[currentAppTab]=window.scrollY||0;
            document.activeElement?.blur?.();
            applyAppTab(next,{scroll:true});
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
        const compliment=document.getElementById('compliment');
        const weather=profile.querySelector('.profile-weather');
        const dateHeading=document.getElementById('profileMeta');
        if(!selfIdentity||!partnerIdentity||!selfMood||!partnerMood||!compliment||!weather||!dateHeading) return;

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

        const common=document.createElement('div');
        common.className='profile-split-card profile-common-card';
        common.append(compliment,weather);

        profile.className='profile-common-tile';
        profile.dataset.homeTile='profile-common';
        profile.setAttribute('aria-label','Цитата и погода');
        dateHeading.className='profile-date-heading';
        profile.replaceChildren(dateHeading,common);

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
        const isIos=telegramOpen&&tg?.platform==='ios';
        const toolbarReserve=isIos ? 92 : (telegramOpen ? 64 : 0);
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
        card.hidden=false;
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

      async function loadTickTickNext({preserveExpanded=false}={}){
        if(!tg?.initData) return;
        try{
          const response=await fetch('/api/ticktick/next',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData,backupToken:currentStateBackupToken}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(response.status===401){
            renderTickTickState({...payload,connected:false},{preserveExpanded});
            return;
          }
          if(!response.ok) throw new Error(payload.error||'ticktick');
          renderTickTickState(payload,{preserveExpanded});
        }catch(_){
          document.getElementById('ticktickTitle').textContent='Не удалось обновить TickTick.';
          {
            const badge=document.getElementById('ticktickBadge');
            badge.hidden=false;
            badge.textContent='Ошибка';
          }
          document.getElementById('ticktickDate').textContent='';
          const assignee=document.getElementById('ticktickAssignee');
          assignee.textContent='';
          assignee.hidden=true;
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
          await loadWorkCalendar(view);
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

      function renderWorkCalendar(payload){
        const container=document.getElementById('workCalendarDays');
        const selected=document.getElementById('workCalendarSelected');
        const status=document.getElementById('workCalendarStatus');
        const label=document.getElementById('workWeekLabel');
        container.replaceChildren();
        selected.hidden=true;
        selected.replaceChildren();

        const days=Array.isArray(payload?.days)?payload.days:[];
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
        const view=String(payload?.view||currentWorkCalendarView||'week');
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
          const times=events
            .map(event=>event.allDay?'Весь день':([event.startTime,event.endTime].filter(Boolean).join('–')))
            .filter(Boolean);
          const timeText=times.join(' / ')||'Смена';
          const cell=document.createElement('button');
          cell.type='button';
          cell.className='calendar-day-cell '+(day.working?'working':'off')+(day.date===today?' today':'');
          cell.title=day.working?timeText:'Выходной';
          cell.setAttribute(
            'aria-label',
            (day.working?'Работа ':'Выходной ')+
            new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(date)+
            (day.working?', '+timeText:'')
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

          const showDayDetails=(withHaptic=false)=>{
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
            if(day.working){
              const titles=events.map(event=>event.title).filter(Boolean);
              info.textContent=(times.length?times.join(' / '):'Смена')+(titles.length?' · '+titles.join(' · '):'');
            }else{
              info.textContent='Выходной';
            }
            copy.append(heading,info);
            selected.replaceChildren(icon,copy);
            selected.classList.toggle('is-off',!day.working);
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


      async function refreshPartnerWorkStatus(){
        if(!tg?.initData) return;
        try{
          const response=await fetch('/api/work-calendar',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData,backupToken:currentStateBackupToken,view:'month'}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(response.ok&&Array.isArray(payload?.days)) renderPartnerWorkStatus(payload.days);
        }catch(_){}
      }

      async function loadWorkCalendar(view=currentWorkCalendarView){
        if(!tg?.initData) return;
        const requested=['month','next-month'].includes(view)?view:'month';
        currentWorkCalendarView=requested;
        setWorkCalendarRangeActive(requested);
        const status=document.getElementById('workCalendarStatus');
        status.hidden=false;
        status.textContent='Обновляю';
        try{
          const response=await fetch('/api/work-calendar',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:tg.initData,backupToken:currentStateBackupToken,view:requested}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok) throw new Error(payload.error||'calendar');
          renderWorkCalendar(payload);
          if(requested==='next-month') refreshPartnerWorkStatus();
        }catch(_){
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

      function renderSharedAlbum(payload){
        const section=document.getElementById('sharedAlbumSection');
        const grid=document.getElementById('sharedAlbumGrid');
        const status=document.getElementById('sharedAlbumStatus');
        const open=document.getElementById('sharedAlbumOpen');
        const photos=Array.isArray(payload?.photos)?payload.photos.slice(0,40):[];
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
          const empty=document.createElement('div');
          empty.className='wishlist-empty';
          empty.textContent='В альбоме пока нет фотографий.';
          grid.appendChild(empty);
          return;
        }

        photos.forEach((photo,index)=>{
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
          grid.appendChild(button);
        });
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
        if(boughtAll) boughtAll.disabled=!items.some(item=>Boolean(item.checked));
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
          boughtAll.disabled=true;
          try{
            renderProducts(await productsRequest('buy-checked'));
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
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
        holidayItemsPromise=loadHolidayHighlights().catch(()=>null);
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
        setupHolidayModal(config);
        setupWishlist();
        setupSharedAlbum();
        setupCinemaPremieresButton();
        setupWorkCalendarDisclosure();
        loadWeather(config.weather);
        loadTickTickNext();
        loadWorkCalendar();
        loadSharedAlbum();
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
      setInterval(()=>{if(currentActor) loadWorkCalendar(currentWorkCalendarView)},15*60*1000);
      setInterval(()=>{if(currentActor) loadSharedAlbum()},15*60*1000);
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
