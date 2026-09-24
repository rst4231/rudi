    (async () => {
      try{
        const telegramReady=window.__rudiTelegramSdkReady;
        if(telegramReady&&typeof telegramReady.then==='function') await telegramReady;
      }catch(_){}
      const TZ = 'Europe/Moscow';
      const CONFIG_URL = 'https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json';
      const root = document.documentElement;
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const tg = window.Telegram?.WebApp;
      if(!tg?.initData&&/iphone|ipad|ipod/i.test(navigator.userAgent||'')) document.body.dataset.iosBrowser='1';
      const DAY = 86400000;
      let currentActor = '';
      let appAccessReady = false;
      let currentPartnerReactionKey = '';
      let currentFeedReactionTargets = [];
      let currentPhotoMemoryReactionTarget = null;
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
      const sharedAlbumHdLoads = new Map();
      let currentAppTab = 'home';
      let voiceAssistantRecorder = null;
      let voiceAssistantStream = null;
      let voiceAssistantChunks = [];
      let voiceAssistantRecordingTimer = 0;
      let voiceAssistantBusy = false;
      let voiceAssistantHistory = [];
      let voiceAssistantLastAnswer = '';
      let voiceAssistantVoiceEnabled = false;
      let voiceAssistantSpeechToken = 0;
      let voiceAssistantSpeechUtterance = null;
      let voiceAssistantGreeting = '';
      let appViewTransitionActive = false;
      let requestedAppTab = '';
      let requestedItemId = '';
      let deferredPwaInstallPrompt = null;
      let undoSnackbarTimer = 0;
      let undoSnackbarAction = null;
      let productsLoadPromise = null;
      let productsRefreshTimer = 0;
      let productsRecoveryCandidate = '';
      let productsRecoveryChecked = false;
      let currentMoodDateKey = '';
      let currentConfig = null;
      let currentMalePsychologyFact = null;
      let currentComplimentDateKey = '';
      let homeLayoutEditing = false;
      let homeTileHost = null;
      const homeDashboardState={
        tasks:[],
        workDay:null,
        feed:null,
        feedResults:[],
        moods:null,
        cycle:null,
        message:null,
        wishlistCount:0,
        photoCount:0,
        productCount:0,
        activity:[],
        lulu:null,
        nearestStatic:null
      };
      const HOME_TILE_DEFAULT_ORDER = ['dashboard','rustam','diana','lulu','nearest','priority','partner','new','quick-access','smart-home','car','markets'];
      function preferredHomeDefaultOrder(){
        const people=currentActor==='Диана'?['diana','rustam']:['rustam','diana'];
        return ['dashboard',...people,'lulu','nearest','priority','partner','new','quick-access','smart-home','car','markets'];
      }
      function homeTopOrderMigrationKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi-home-top-order-v4-'+actor;
      }

      function migrateHomeTopOrderOnce(order){
        const source=Array.isArray(order)?order.map(String):[];
        if(!source.length) return source;
        try{
          if(localStorage.getItem(homeTopOrderMigrationKey())==='1') return source;
        }catch(_){}
        const top=currentActor==='Диана'
          ?['diana','rustam','lulu','nearest']
          :['rustam','diana','lulu','nearest'];
        const middle=source.filter(id=>id!=='dashboard'&&id!=='activity'&&!top.includes(id));
        const next=['dashboard',...top,...middle];
        try{localStorage.setItem(homeTopOrderMigrationKey(),'1')}catch(_){}
        return next;
      }
      const appTabScroll = {home:0,feed:0,schedule:0,wishlist:0,photos:0,products:0,saves:0,'for-di':0};
      const STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v2';
      const STATE_BACKUP_LOCAL_HISTORY_KEY = 'rudi-state-backup-v2-history';
      const STATE_BACKUP_LOCAL_HISTORY_LIMIT = 10;
      const STATE_BACKUP_LOCAL_HISTORY_MIN_AGE = 6*60*60*1000;
      const STATE_BACKUP_LOCAL_HISTORY_MAX_CHARS = 3*1024*1024;
      const STATE_BACKUP_CLOUD_SLOTS = ['a','b','c','d'];
      const STATE_BACKUP_CLOUD_META_KEY = 'rudi_state_backup_v2_meta';
      const STATE_BACKUP_CLOUD_CHUNK_PREFIX = 'rudi_state_backup_v2_';
      const STATE_BACKUP_CLOUD_SLOT_PREFIX = 'rudi_state_backup_v2_slot_';
      const LEGACY_STATE_BACKUP_STORAGE_KEY = 'rudi-state-backup-v1';
      const LEGACY_STATE_BACKUP_CLOUD_META_KEY = 'rudi_state_backup_v1_meta';
      const LEGACY_STATE_BACKUP_CLOUD_CHUNK_PREFIX = 'rudi_state_backup_v1_';
      const STATE_BACKUP_CLOUD_CHUNK_SIZE = 3500;
      let stateBackupRefreshPromise = null;
      let stateBackupRefreshQueued = false;
      let currentStateBackupToken = '';
      let ticktickHandoffToken = '';
      try{
        const params=new URLSearchParams(window.location.search);
        ticktickHandoffToken=String(params.get('ticktickHandoff')||'').trim();
        requestedAppTab=String(params.get('tab')||'').trim();
        requestedItemId=String(params.get('item')||'').trim();
      }catch(_){}

      window.addEventListener('beforeinstallprompt',event=>{
        event.preventDefault();
        deferredPwaInstallPrompt=event;
        updatePwaInstallUi();
      });
      window.addEventListener('appinstalled',()=>{
        deferredPwaInstallPrompt=null;
        updatePwaInstallUi();
      });

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

      function managedRequestFingerprintBody(body){
        if(!body||typeof body!=='object'||Array.isArray(body)) return body??null;
        const clean={...body};
        delete clean.initData;
        delete clean.backupToken;
        return clean;
      }

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
        const fingerprint=method+'|'+url+'|'+JSON.stringify(managedRequestFingerprintBody(body));
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

      function readLocalStateBackupHistory(){
        try{
          const rows=JSON.parse(localStorage.getItem(STATE_BACKUP_LOCAL_HISTORY_KEY)||'[]');
          return (Array.isArray(rows)?rows:[])
            .map(row=>({token:String(row?.token||'').trim(),updatedAt:Number(row?.updatedAt||0)}))
            .filter(row=>row.token)
            .sort((a,b)=>b.updatedAt-a.updatedAt)
            .slice(0,STATE_BACKUP_LOCAL_HISTORY_LIMIT);
        }catch(_){return []}
      }

      function writeLocalStateBackupHistory(rows){
        const source=(Array.isArray(rows)?rows:[]).filter(row=>row?.token);
        const kept=[];
        let totalChars=0;
        for(const row of source){
          const token=String(row.token||'').trim();
          if(!token||kept.some(item=>item.token===token)) continue;
          if(kept.length>=STATE_BACKUP_LOCAL_HISTORY_LIMIT) break;
          if(totalChars+token.length>STATE_BACKUP_LOCAL_HISTORY_MAX_CHARS) break;
          kept.push({token,updatedAt:Number(row.updatedAt||Date.now())});
          totalChars+=token.length;
        }
        try{localStorage.setItem(STATE_BACKUP_LOCAL_HISTORY_KEY,JSON.stringify(kept))}catch(_){}
      }

      function storeLocalStateBackupToken(value){
        const token=String(value||'').trim();
        if(!token) return;
        try{
          const previous=String(localStorage.getItem(STATE_BACKUP_STORAGE_KEY)||'').trim();
          if(previous&&previous!==token){
            const history=readLocalStateBackupHistory();
            const newest=history[0];
            if(!newest||Date.now()-Number(newest.updatedAt||0)>=STATE_BACKUP_LOCAL_HISTORY_MIN_AGE){
              writeLocalStateBackupHistory([{token:previous,updatedAt:Date.now()},...history]);
            }
          }
          localStorage.setItem(STATE_BACKUP_STORAGE_KEY,token);
        }catch(_){}
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
          if(!STATE_BACKUP_CLOUD_SLOTS.includes(slot)) return '';
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

      function completeEncryptedBackupToken(value){
        const raw=String(value||'');
        if(!raw.startsWith('rudi-state-v2.')) return '';
        let dots=0;
        let thirdDot=-1;
        for(let index=0;index<raw.length;index++){
          if(raw[index]!=='.') continue;
          dots+=1;
          if(dots===3){thirdDot=index;break}
        }
        if(thirdDot<0) return '';
        const end=thirdDot+1+22;
        if(raw.length<end) return '';
        const token=raw.slice(0,end);
        return token.split('.').length===4?token:'';
      }

      async function readBackupTokenFromCloudSlot(slot){
        if(!STATE_BACKUP_CLOUD_SLOTS.includes(String(slot||''))) return '';
        let raw='';
        for(let index=0;index<128;index++){
          const chunk=await cloudStorageGetItem(STATE_BACKUP_CLOUD_SLOT_PREFIX+slot+'_'+index);
          if(!chunk) break;
          raw+=chunk;
          const complete=completeEncryptedBackupToken(raw);
          if(complete) return complete;
        }
        return '';
      }

      async function readPreviousCloudStateBackupTokens(){
        if(!tg?.CloudStorage?.getItem) return [];
        const rawMeta=await cloudStorageGetItem(STATE_BACKUP_CLOUD_META_KEY);
        let meta;
        try{meta=JSON.parse(rawMeta||'{}')}catch(_){return []}
        if(Number(meta?.version||0)<3) return [];
        const activeSlot=String(meta?.slot||'');
        if(!STATE_BACKUP_CLOUD_SLOTS.includes(activeSlot)) return [];
        const activeIndex=STATE_BACKUP_CLOUD_SLOTS.indexOf(activeSlot);
        const ordered=STATE_BACKUP_CLOUD_SLOTS
          .slice(1)
          .map((_,offset)=>STATE_BACKUP_CLOUD_SLOTS[(activeIndex-1-offset+STATE_BACKUP_CLOUD_SLOTS.length)%STATE_BACKUP_CLOUD_SLOTS.length]);
        const tokens=[];
        for(const slot of ordered){
          const token=await readBackupTokenFromCloudSlot(slot);
          if(token&&!tokens.includes(token)) tokens.push(token);
        }
        return tokens;
      }

      async function readBackupRecoveryCandidates(){
        const cloud=await readPreviousCloudStateBackupTokens().catch(()=>[]);
        const local=readLocalStateBackupHistory().map(row=>row.token);
        return [...cloud,...local]
          .map(value=>String(value||'').trim())
          .filter((value,index,rows)=>value&&value!==currentStateBackupToken&&rows.indexOf(value)===index);
      }

      async function productsRecoveryRequest(operation,backupToken){
        const response=await fetch('/api/partner-message?rudiAction=state-backup-recovery',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',operation,backupToken}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'backup-recovery-failed');
        return data;
      }

      function hideProductsRecovery(){
        const panel=document.getElementById('productsRecovery');
        if(panel) panel.hidden=true;
      }

      async function checkProductsRecovery(){
        if(productsRecoveryChecked||homeDashboardState.productCount>0||!currentActor) return;
        productsRecoveryChecked=true;
        try{
          const candidates=await readBackupRecoveryCandidates();
          for(const candidate of candidates){
            let preview;
            try{preview=await productsRecoveryRequest('preview',candidate)}catch(_){continue}
            if(!preview.available||Number(preview.itemCount||0)<=0) continue;
            productsRecoveryCandidate=candidate;
            const panel=document.getElementById('productsRecovery');
            const text=document.getElementById('productsRecoveryText');
            if(text){
              const count=Number(preview.itemCount||0);
              text.textContent='Найдена резервная копия: '+count+' '+(count===1?'позиция':count<5?'позиции':'позиций')+'.';
            }
            if(panel) panel.hidden=false;
            return;
          }
        }catch(_){}
      }

      async function writeCloudStateBackupToken(value){
        const token=String(value||'').trim();
        if(!token||!tg?.CloudStorage?.setItem) return false;

        const previousRaw=await cloudStorageGetItem(STATE_BACKUP_CLOUD_META_KEY);
        let previousMeta={};
        try{previousMeta=JSON.parse(previousRaw||'{}')||{}}catch(_){}
        const previousVersion=Number(previousMeta?.version||0);
        const previousCount=Number(previousMeta?.count||0);
        const previousSlot=STATE_BACKUP_CLOUD_SLOTS.includes(String(previousMeta?.slot||''))?String(previousMeta.slot):'';
        const previousIndex=STATE_BACKUP_CLOUD_SLOTS.indexOf(previousSlot);
        const nextSlot=STATE_BACKUP_CLOUD_SLOTS[(previousIndex>=0?previousIndex+1:0)%STATE_BACKUP_CLOUD_SLOTS.length];

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
          version:4,
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

      function uiPreferencesMetaKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:ui-prefs-meta:v1:'+actor;
      }

      function activitySeenStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:activity-seen:v1:'+actor;
      }

      function marketTickerEnabledStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:market-ticker-enabled:v1:'+actor;
      }

      function themeModeStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:theme-mode:v1:'+actor;
      }

      function autoRefreshStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:auto-refresh:v1:'+actor;
      }

      function interfaceMotionStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:interface-motion:v1:'+actor;
      }

      function interfaceTextSizeStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:interface-text-size:v1:'+actor;
      }

      function dataLastSyncStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi:data-last-sync:v1:'+actor;
      }

      function autoRefreshEnabled(){
        if(!currentActor) return true;
        try{return localStorage.getItem(autoRefreshStorageKey())!=='0'}catch(_){return true}
      }

      function interfaceMotionEnabled(){
        if(!currentActor) return true;
        try{return localStorage.getItem(interfaceMotionStorageKey())!=='0'}catch(_){return true}
      }

      function currentInterfaceTextSize(){
        if(!currentActor) return 'normal';
        try{
          const value=String(localStorage.getItem(interfaceTextSizeStorageKey())||'normal');
          return ['small','normal','large'].includes(value)?value:'normal';
        }catch(_){return 'normal'}
      }

      function lastDataSyncAt(){
        try{return String(localStorage.getItem(dataLastSyncStorageKey())||'')}catch(_){return ''}
      }

      function markDataSyncNow(){
        if(!currentActor) return;
        try{localStorage.setItem(dataLastSyncStorageKey(),new Date().toISOString())}catch(_){}
        updateDataSettingsUi();
      }

      function currentThemeMode(){
        if(!currentActor) return 'system';
        try{
          const value=String(localStorage.getItem(themeModeStorageKey())||'system');
          return ['system','light','dark'].includes(value)?value:'system';
        }catch(_){return 'system'}
      }

      function marketTickerEnabled(){
        try{
          const value=localStorage.getItem(marketTickerEnabledStorageKey());
          return value===null?true:value!=='0';
        }catch(_){return true}
      }

      function currentActivitySeenId(){
        try{return String(localStorage.getItem(activitySeenStorageKey())||'')}catch(_){return ''}
      }

      function localUiPreferences(){
        let homeOrder=[];
        let blockStates={};
        let activitySeenId='';
        let marketTickerEnabledValue=true;
        let themeModeValue='system';
        let updatedAt='';
        try{homeOrder=JSON.parse(localStorage.getItem(homeLayoutStorageKey())||'[]')}catch(_){}
        try{blockStates=JSON.parse(localStorage.getItem(blockStateStorageKey())||'{}')}catch(_){}
        try{activitySeenId=String(localStorage.getItem(activitySeenStorageKey())||'')}catch(_){}
        try{
          const stored=localStorage.getItem(marketTickerEnabledStorageKey());
          marketTickerEnabledValue=stored===null?true:stored!=='0';
        }catch(_){}
        try{themeModeValue=currentThemeMode()}catch(_){}
        try{updatedAt=String(localStorage.getItem(uiPreferencesMetaKey())||'')}catch(_){}
        return {
          homeOrder:Array.isArray(homeOrder)?homeOrder:[],
          blockStates:blockStates&&typeof blockStates==='object'&&!Array.isArray(blockStates)?blockStates:{},
          activitySeenId,
          marketTickerEnabled:marketTickerEnabledValue,
          themeMode:themeModeValue,
          updatedAt
        };
      }

      function applyRemoteUiPreferences(value,{force=false}={}){
        const remote=value&&typeof value==='object'&&!Array.isArray(value)?value:null;
        if(!remote||(!force&&uiPreferencesDirty)) return false;
        const hasRemoteOrder=Array.isArray(remote.homeOrder)&&remote.homeOrder.length>0;
        const hasRemoteBlocks=remote.blockStates&&typeof remote.blockStates==='object'&&!Array.isArray(remote.blockStates)&&Object.keys(remote.blockStates).length>0;
        const hasRemoteActivitySeen=Object.prototype.hasOwnProperty.call(remote,'activitySeenId');
        const hasRemoteMarketTicker=Object.prototype.hasOwnProperty.call(remote,'marketTickerEnabled');
        const hasRemoteThemeMode=Object.prototype.hasOwnProperty.call(remote,'themeMode');
        const remoteStamp=String(remote.updatedAt||'');
        if(!remoteStamp&&!hasRemoteOrder&&!hasRemoteBlocks&&!hasRemoteActivitySeen&&!hasRemoteMarketTicker&&!hasRemoteThemeMode) return false;

        let localOrder=[];
        let localStamp='';
        try{
          localOrder=JSON.parse(localStorage.getItem(homeLayoutStorageKey())||'[]');
          localStamp=String(localStorage.getItem(uiPreferencesMetaKey())||'');
        }catch(_){}
        const hasLocalOrder=Array.isArray(localOrder)&&localOrder.length>0;
        const localNormalized=hasLocalOrder?normalizedHomeOrder(localOrder):[];
        const remoteNormalized=hasRemoteOrder?normalizedHomeOrder(remote.homeOrder):[];
        const localTime=Date.parse(localStamp)||0;
        const remoteTime=Date.parse(remoteStamp)||0;
        const localLayoutIsNewer=localTime>remoteTime||(localTime===remoteTime&&hasLocalOrder);
        const keepLocalOrder=hasLocalOrder&&hasRemoteOrder
          &&JSON.stringify(localNormalized)!==JSON.stringify(remoteNormalized)
          &&localLayoutIsNewer;

        try{
          if(hasRemoteOrder&&!keepLocalOrder){
            localStorage.setItem(homeLayoutStorageKey(),JSON.stringify(remoteNormalized));
          }
          if(hasRemoteBlocks){
            localStorage.setItem(blockStateStorageKey(),JSON.stringify(remote.blockStates));
          }
          if(hasRemoteActivitySeen){
            localStorage.setItem(activitySeenStorageKey(),String(remote.activitySeenId||''));
          }
          if(hasRemoteMarketTicker){
            localStorage.setItem(marketTickerEnabledStorageKey(),remote.marketTickerEnabled===false?'0':'1');
          }
          if(hasRemoteThemeMode){
            const mode=['system','light','dark'].includes(String(remote.themeMode||''))?String(remote.themeMode):'system';
            localStorage.setItem(themeModeStorageKey(),mode);
          }
          if(remoteStamp&&!keepLocalOrder) localStorage.setItem(uiPreferencesMetaKey(),remoteStamp);
          if(keepLocalOrder){
            localStorage.setItem(homeLayoutStorageKey(),JSON.stringify(localNormalized));
            markUiPreferencesChanged();
          }
          return true;
        }catch(_){return false}
      }

      let uiPreferencesBackupTimer=null;
      let uiPreferencesDirty=false;
      let uiPreferencesSyncPromise=null;

      function applyMountedUiPreferences(){
        loadHomeOrder();
        const states=readBlockStates();
        document.querySelectorAll('.rudi-collapsible[data-collapse-key]').forEach(section=>{
          const key=String(section.dataset.collapseKey||'');
          if(!key||!Object.prototype.hasOwnProperty.call(states,key)) return;
          const collapsed=Boolean(states[key]);
          section.classList.toggle('is-collapsed',collapsed);
          const button=section.querySelector('.block-collapse-button');
          const body=section.querySelector(':scope > .rudi-collapse-body');
          button?.setAttribute('aria-expanded',collapsed?'false':'true');
          body?.setAttribute('aria-hidden',collapsed?'true':'false');
        });
        updateHomeOrderControls();
        updateActivityNotificationBadge();
        applyMarketTickerVisibility();
        applyTheme();
        updateThemeSettingControls();
      }

      function markUiPreferencesChanged(){
        uiPreferencesDirty=true;
        try{localStorage.setItem(uiPreferencesMetaKey(),new Date().toISOString())}catch(_){}
        clearTimeout(uiPreferencesBackupTimer);
        uiPreferencesBackupTimer=setTimeout(()=>refreshStateBackup(),180);
      }

      async function refreshStateBackup(){
        if(!currentActor) return;
        if(stateBackupRefreshPromise){
          stateBackupRefreshQueued=true;
          return stateBackupRefreshPromise;
        }
        stateBackupRefreshPromise=(async()=>{
          const outgoing=uiPreferencesDirty?localUiPreferences():null;
          const outgoingStamp=String(outgoing?.updatedAt||'');
          try{
            const response=await fetch('/api/partner-message?rudiAction=state-backup',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                initData:telegramInitData(),
                backupToken:currentStateBackupToken,
                uiPreferences:outgoing
              }),
              cache:'no-store'
            });
            const payload=await response.json().catch(()=>({}));
            if(response.ok&&payload.ok){
              if(payload.backupToken) await storeStateBackupToken(payload.backupToken);
              const currentStamp=String(localUiPreferences().updatedAt||'');
              if(outgoingStamp&&currentStamp===outgoingStamp) uiPreferencesDirty=false;
              if(payload.uiPreferences&&!uiPreferencesDirty&&applyRemoteUiPreferences(payload.uiPreferences,{force:true})){
                applyMountedUiPreferences();
              }
            }
          }catch(_){}
          finally{
            stateBackupRefreshPromise=null;
            if(stateBackupRefreshQueued){
              stateBackupRefreshQueued=false;
              setTimeout(()=>refreshStateBackup(),0);
            }
          }
        })();
        return stateBackupRefreshPromise;
      }

      async function syncUiPreferencesFromServer(){
        if(!currentActor||uiPreferencesDirty) return null;
        if(uiPreferencesSyncPromise) return uiPreferencesSyncPromise;
        uiPreferencesSyncPromise=(async()=>{
          try{
            const response=await fetch('/api/partner-message?rudiAction=ui-preferences',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                initData:telegramInitData(),
                backupToken:currentStateBackupToken
              }),
              cache:'no-store'
            });
            const payload=await response.json().catch(()=>({}));
            if(response.ok&&payload.ok&&payload.uiPreferences&&!uiPreferencesDirty){
              if(applyRemoteUiPreferences(payload.uiPreferences,{force:true})) applyMountedUiPreferences();
            }
            return payload;
          }catch(_){return null}
          finally{uiPreferencesSyncPromise=null}
        })();
        return uiPreferencesSyncPromise;
      }

      window.RUDI_STATE_BACKUP={
        getToken:()=>String(currentStateBackupToken||''),
        storeToken:(token)=>storeStateBackupToken(token),
        refresh:()=>refreshStateBackup()
      };

      function homeLayoutStorageKey(){
        const actor=currentActor==='Диана'?'diana':'rustam';
        return 'rudi-home-layout-v3-'+actor;
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
        const requested=source.flatMap(id=>{
          if(['profile','profile-common','profile-self','profile-partner'].includes(id)) return ['dashboard'];
          return [id];
        });
        const defaults=preferredHomeDefaultOrder();
        if(!source.length) return [...defaults];

        const valid=requested.filter((id,index)=>HOME_TILE_DEFAULT_ORDER.includes(id)&&requested.indexOf(id)===index);
        for(const id of defaults) if(!valid.includes(id)) valid.push(id);
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
        const targetOrder=normalizedHomeOrder(order);
        const currentTiles=[...host.querySelectorAll(':scope > [data-home-tile]')];
        const currentOrder=currentTiles.map(tile=>tile.dataset.homeTile);
        if(currentOrder.length===targetOrder.length&&currentOrder.every((id,index)=>id===targetOrder[index])) return;

        const activeElement=document.activeElement;
        const focusedHomeTile=activeElement?.closest?.('[data-home-tile]');
        if(focusedHomeTile?.parentElement===host) return;

        const before=animate?homeTileRects(host):null;
        const tiles=new Map(currentTiles.map(tile=>[tile.dataset.homeTile,tile]));
        const orderedTiles=targetOrder.map(id=>tiles.get(id)).filter(Boolean);
        for(let index=0;index<orderedTiles.length;index+=1){
          const tile=orderedTiles[index];
          const currentAtIndex=host.querySelectorAll(':scope > [data-home-tile]')[index]||null;
          if(currentAtIndex!==tile) host.insertBefore(tile,currentAtIndex);
        }
        if(animate) animateHomeReorder(host,before);
      }

      function loadHomeOrder(){
        let order=[];
        try{order=JSON.parse(localStorage.getItem(homeLayoutStorageKey())||'[]')}catch(_){}
        const hasSavedOrder=Array.isArray(order)&&order.length>0;
        const before=JSON.stringify(order);
        const normalized=normalizedHomeOrder(order);
        applyHomeOrder(normalized);
        if(hasSavedOrder){
          try{localStorage.setItem(homeLayoutStorageKey(),JSON.stringify(normalized))}catch(_){}
          if(JSON.stringify(normalized)!==before) markUiPreferencesChanged();
        }
      }

      function saveHomeOrder(){
        const host=ensureHomeTileHost();
        if(!host) return;
        const order=[...host.querySelectorAll(':scope > [data-home-tile]')].map(tile=>tile.dataset.homeTile).filter(Boolean);
        try{
          localStorage.setItem(homeLayoutStorageKey(),JSON.stringify(order));
          localStorage.setItem(homeTopOrderMigrationKey(),'1');
        }catch(_){}
        markUiPreferencesChanged();
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
        applyHomeOrder(preferredHomeDefaultOrder(),{animate:true});
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
            '<button class="home-order-button" type="button" data-home-move="up" aria-label="Переместить блок вверх" title="Вверх"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 14.5 5.5-5.5 5.5 5.5"/></svg></button>'+
            '<button class="home-order-button" type="button" data-home-move="down" aria-label="Переместить блок вниз" title="Вниз"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 9.5 5.5 5.5 5.5-5.5"/></svg></button>';
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

        if(tg?.initData){
          button.hidden=true;
          if(reset) reset.hidden=true;
          setHomeLayoutEditing(false);
          return;
        }

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

      const MARKET_TICKER_LOCAL_CACHE_KEY='rudi:market-ticker-cache:v2';
      let marketTickerLoadPromise=null;

      function readMarketTickerLocalCache(){
        try{
          const value=JSON.parse(localStorage.getItem(MARKET_TICKER_LOCAL_CACHE_KEY)||'null');
          return value&&Array.isArray(value.items)&&value.items.length?value:null;
        }catch(_){return null}
      }

      function writeMarketTickerLocalCache(value){
        if(!value||!Array.isArray(value.items)||!value.items.length) return;
        try{localStorage.setItem(MARKET_TICKER_LOCAL_CACHE_KEY,JSON.stringify(value))}catch(_){}
      }

      function marketTickerNumber(value,{crypto=false}={}){
        if(value===null||value===undefined||value==='') return '—';
        const num=Number(value);
        if(!Number.isFinite(num)) return '—';
        if(crypto){
          const digits=num>=1000?0:num>=100?1:2;
          return String.fromCharCode(36)+new Intl.NumberFormat('ru-RU',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(num);
        }
        return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(num)+' ₽';
      }

      function marketTickerChange(value){
        const num=Number(value);
        if(!Number.isFinite(num)) return null;
        const sign=num>0?'+':'';
        return {
          text:sign+new Intl.NumberFormat('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1}).format(num)+'%',
          direction:num>0?'up':num<0?'down':'flat'
        };
      }

      function mergeMarketTickerPayload(fresh,cached){
        const current=fresh&&Array.isArray(fresh.items)?fresh.items:[];
        const previous=cached&&Array.isArray(cached.items)?cached.items:[];
        const map=new Map(previous.map(item=>[String(item.id||''),item]));
        current.forEach(item=>map.set(String(item.id||''),item));
        const items=['usd-rub','btcusdt','ethusdt'].map(id=>map.get(id)).filter(Boolean);
        return {...(cached||{}),...(fresh||{}),items,partial:items.length<3};
      }

      function createMarketTickerGroup(items){
        const group=document.createElement('div');
        group.className='market-ticker-group';
        for(const item of items){
          const row=document.createElement('span');
          row.className='market-ticker-item';
          const label=document.createElement('span');
          label.className='market-ticker-label';
          label.textContent=String(item.label||'');
          const value=document.createElement('strong');
          value.className='market-ticker-value';
          value.textContent=marketTickerNumber(item.value,{crypto:item.id!=='usd-rub'});
          row.append(label,value);
          const change=marketTickerChange(item.change24h);
          if(change){
            const delta=document.createElement('span');
            delta.className='market-ticker-change is-'+change.direction;
            delta.textContent=change.text;
            row.appendChild(delta);
          }
          group.appendChild(row);
        }
        return group;
      }

      function renderMarketTicker(payload){
        const track=document.getElementById('marketTickerTrack');
        const a11y=document.getElementById('marketTickerA11y');
        const tile=document.getElementById('marketTickerTile');
        if(!track||!tile) return;
        const actual=Array.isArray(payload?.items)
          ?payload.items.filter(item=>Number.isFinite(Number(item?.value))&&Number(item.value)>0)
          :[];
        const byId=new Map(actual.map(item=>[String(item.id||''),item]));
        const items=[
          byId.get('usd-rub')||{id:'usd-rub',label:'USD/RUB',value:null,change24h:null,unavailable:true},
          byId.get('btcusdt')||{id:'btcusdt',label:'BTC',value:null,change24h:null,unavailable:true},
          byId.get('ethusdt')||{id:'ethusdt',label:'ETH',value:null,change24h:null,unavailable:true}
        ];
        if(!actual.length){
          track.classList.remove('is-ready');
          const group=document.createElement('div');
          group.className='market-ticker-group';
          const label=document.createElement('span');
          label.className='market-ticker-loading';
          label.textContent='Курсы временно недоступны';
          group.appendChild(label);
          track.replaceChildren(group);
          if(a11y) a11y.textContent='Курсы временно недоступны';
          tile.dataset.marketState='error';
          return;
        }
        const full=items.every(item=>!item.unavailable);
        const first=createMarketTickerGroup(items);
        track.classList.toggle('is-ready',full);
        if(full) track.replaceChildren(first,first.cloneNode(true));
        else track.replaceChildren(first);
        tile.dataset.marketState=full?'ready':'partial';
        if(a11y){
          a11y.textContent=items.map(item=>{
            if(item.unavailable) return String(item.label||'')+' нет данных';
            const change=marketTickerChange(item.change24h);
            return String(item.label||'')+' '+marketTickerNumber(item.value,{crypto:item.id!=='usd-rub'})+(change?' '+change.text:'');
          }).join(', ');
        }
        restartRudiMotion(tile);
      }

      function applyMarketTickerVisibility(){
        const enabled=marketTickerEnabled();
        const tile=document.getElementById('marketTickerTile');
        const toggle=document.getElementById('marketTickerToggle');
        if(toggle){
          toggle.setAttribute('aria-checked',enabled?'true':'false');
          toggle.classList.toggle('is-on',enabled);
        }
        if(tile){
          tile.dataset.tabAvailable=enabled?'1':'0';
          tile.hidden=!enabled||currentAppTab!=='home';
        }
        return enabled;
      }

      function setMarketTickerEnabled(enabled,{persist=true}={}){
        const next=Boolean(enabled);
        try{localStorage.setItem(marketTickerEnabledStorageKey(),next?'1':'0')}catch(_){}
        applyMarketTickerVisibility();
        if(persist) markUiPreferencesChanged();
        if(next) loadMarketTicker({silent:true});
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      async function loadMarketTicker({silent=false}={}){
        if(!currentActor||!marketTickerEnabled()) return null;
        const cached=readMarketTickerLocalCache();
        if(cached&&!silent) renderMarketTicker(cached);
        if(marketTickerLoadPromise) return marketTickerLoadPromise;
        marketTickerLoadPromise=(async()=>{
          try{
            const payload=await managedJsonRequest('market-ticker-v2','/api/partner-message?rudiAction=market-ticker',{
              method:'POST',
              body:{initData:telegramInitData()},
              ttlMs:4*60*1000,
              timeoutMs:7000
            });
            if(!payload?.ok) throw new Error(payload?.error||'market-ticker');
            const merged=mergeMarketTickerPayload(payload,cached);
            if(merged.items.length){
              writeMarketTickerLocalCache(merged);
              renderMarketTicker(merged);
            }else if(!cached){
              renderMarketTicker(null);
            }
            return merged;
          }catch(error){
            console.warn('RUDI_MARKET_TICKER_UI_WARN',String(error?.message||error));
            if(cached) renderMarketTicker(cached);
            else renderMarketTicker(null);
            return cached;
          }finally{
            marketTickerLoadPromise=null;
          }
        })();
        return marketTickerLoadPromise;
      }

      function setupMarketTicker(){
        const toggle=document.getElementById('marketTickerToggle');
        if(toggle&&toggle.dataset.bound!=='1'){
          toggle.dataset.bound='1';
          toggle.addEventListener('click',()=>setMarketTickerEnabled(!marketTickerEnabled()));
        }
        const enabled=applyMarketTickerVisibility();
        const cached=readMarketTickerLocalCache();
        if(enabled&&cached) renderMarketTicker(cached);
        if(enabled) loadMarketTicker({silent:Boolean(cached)});
      }

      function rudiMotionReduced(){
        try{return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)}
        catch(_){return false}
      }

      function restartRudiMotion(element,className='rudi-data-refresh',duration=420){
        if(!element||rudiMotionReduced()) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
        setTimeout(()=>element.classList.remove(className),Math.max(180,Number(duration)||420));
      }

      function animateRudiCollection(root,selector=':scope > *',limit=16){
        if(!root||rudiMotionReduced()||root.closest?.('[hidden]')) return;
        const nodes=[...root.querySelectorAll(selector)].slice(0,Math.max(0,Number(limit)||0));
        if(!nodes.length) return;
        requestAnimationFrame(()=>{
          nodes.forEach((node,index)=>{
            const delay=Math.min(index,10)*22;
            node.style.setProperty('--rudi-motion-delay',delay+'ms');
            node.classList.remove('rudi-list-enter');
            void node.offsetWidth;
            node.classList.add('rudi-list-enter');
            setTimeout(()=>{
              node.classList.remove('rudi-list-enter');
              node.style.removeProperty('--rudi-motion-delay');
            },560+delay);
          });
        });
      }

      function animateRudiView(section){
        if(!section||section.hidden||rudiMotionReduced()) return;
        section.classList.remove('rudi-view-enter');
        void section.offsetWidth;
        section.classList.add('rudi-view-enter');
        setTimeout(()=>section.classList.remove('rudi-view-enter'),520);
      }

      const APP_TABS=['home','feed','schedule','wishlist','photos','products','saves','for-di'];

      function routeFromLocation(){
        try{
          const params=new URLSearchParams(window.location.search);
          const tab=String(params.get('tab')||'home').trim();
          return {
            tab:APP_TABS.includes(tab)?tab:'home',
            item:String(params.get('item')||'').trim()
          };
        }catch(_){return {tab:'home',item:''}}
      }

      function updateAppRoute(tab,{item='',replace=false}={}){
        try{
          const next=APP_TABS.includes(tab)?tab:'home';
          const url=new URL(window.location.href);
          if(next==='home') url.searchParams.delete('tab');
          else url.searchParams.set('tab',next);
          if(item&&['wishlist','products','saves','for-di','schedule'].includes(next)) url.searchParams.set('item',String(item));
          else url.searchParams.delete('item');
          const target=url.pathname+(url.search||'')+(url.hash||'');
          const current=window.location.pathname+window.location.search+window.location.hash;
          if(target===current) return;
          history[replace?'replaceState':'pushState']({rudiTab:next,rudiItem:item||''},'',target);
        }catch(_){}
      }

      function focusDeepLinkedItem(tab,item){
        const id=String(item||'').trim();
        if(!id||!['wishlist','products','saves','for-di'].includes(tab)) return;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const target=[...document.querySelectorAll('[data-rudi-item-id]')]
            .find(node=>String(node.dataset.rudiItemId||'')===id);
          if(!target) return;
          target.classList.add('rudi-deep-link-target');
          target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
          setTimeout(()=>target.classList.remove('rudi-deep-link-target'),2200);
        }));
      }

      function runTabSideEffects(tab,{item=''}={}){
        if(tab==='feed') loadFeed({silent:true});
        if(tab==='schedule') loadWorkCalendar(currentWorkCalendarView,{silent:true});
        if(tab==='products'){
          loadProducts({silent:true}).finally(()=>focusDeepLinkedItem('products',item));
          scheduleProductsRefresh(15000);
        }
        if(tab==='wishlist'){
          wishlistRequest('list').then(data=>{
            renderWishlist(data);
            focusDeepLinkedItem('wishlist',item);
          }).catch(()=>{});
        }
        if(tab==='photos') loadSharedAlbum();
        if(tab==='saves') Promise.resolve(window.RUDI_SAVES?.load?.()).finally(()=>focusDeepLinkedItem('saves',item));
        if(tab==='for-di') Promise.resolve(window.RUDI_FOR_DI?.load?.()).finally(()=>focusDeepLinkedItem('for-di',item));
      }

      function canUseAppViewTransition(){
        try{
          return Boolean(
            document.startViewTransition
            && document.body.classList.contains('auth-ok')
            && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
          );
        }catch(_){return false}
      }

      function runAppViewTransition(update){
        if(typeof update!=='function') return null;
        if(!canUseAppViewTransition()||appViewTransitionActive){
          update();
          return null;
        }
        appViewTransitionActive=true;
        let transition=null;
        try{
          transition=document.startViewTransition(()=>update());
          Promise.resolve(transition?.finished).finally(()=>{appViewTransitionActive=false});
        }catch(_){
          appViewTransitionActive=false;
          update();
        }
        return transition;
      }

      function navigateToAppTab(tab,{scroll=true,item='',replace=false}={}){
        appTabScroll[currentAppTab]=window.scrollY||0;
        document.activeElement?.blur?.();
        const previous=currentAppTab;
        const update=()=>{
          applyAppTab(tab,{scroll});
          updateAppRoute(currentAppTab,{item,replace});
          runTabSideEffects(currentAppTab,{item});
        };
        if(tab!==previous) runAppViewTransition(update);
        else update();
      }

      function applyAppTab(tab,{scroll=false}={}){
        let next=APP_TABS.includes(tab)?tab:'home';
        const candidates=[...document.querySelectorAll('[data-app-tab-section="'+next+'"]')];
        if(next!=='home'&&candidates.length&&candidates.every(section=>section.dataset.tabAvailable==='0')){
          next='home';
        }
        if(next!=='home'&&homeLayoutEditing) setHomeLayoutEditing(false);
        const changed=next!==currentAppTab;
        currentAppTab=next;
        document.body.dataset.appTab=next;
        syncVoiceAssistantVisibility(next);
        const marketTickerSetting=document.querySelector('.market-ticker-setting');
        if(marketTickerSetting){
          marketTickerSetting.hidden=next!=='home';
          marketTickerSetting.setAttribute('aria-hidden',next==='home'?'false':'true');
        }
        applyMarketTickerVisibility();
        if(next!=='home'){
          setActivityNotificationsOpen(false);
          setSettingsOpen(false);
        }

        document.querySelectorAll('[data-app-tab-section]').forEach(section=>{
          const available=section.dataset.tabAvailable!=='0';
          section.hidden=section.dataset.appTabSection!==next||!available||(section.dataset.homeEmpty==='1');
        });

        if(changed&&!appViewTransitionActive){
          document.querySelectorAll('[data-app-tab-section="'+next+'"]:not([hidden])').forEach(animateRudiView);
        }

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

      function voiceAssistantElements(){
        return {
          launcher:document.getElementById('voiceAssistantLauncher'),
          fab:document.getElementById('voiceAssistantFab'),
          greeting:document.getElementById('voiceAssistantGreeting'),
          panelGreeting:document.getElementById('voiceAssistantPanelGreeting'),
          panel:document.getElementById('voiceAssistantPanel'),
          close:document.getElementById('voiceAssistantClose'),
          talk:document.getElementById('voiceAssistantTalk'),
          label:document.getElementById('voiceAssistantTalkLabel'),
          dialogue:document.getElementById('voiceAssistantDialogue'),
          empty:document.getElementById('voiceAssistantEmpty'),
          status:document.getElementById('voiceAssistantStatus'),
          form:document.getElementById('voiceAssistantTextForm'),
          input:document.getElementById('voiceAssistantTextInput'),
          send:document.getElementById('voiceAssistantTextSend')
        };
      }

      function voiceAssistantGreetingText(){
        const name=String(firstName||currentActor||'').trim().split(/\s+/)[0]||'';
        const phrases=[
          'как дела?',
          'чем займёмся?',
          'что у тебя на уме?',
          'я рядом',
          'чем помочь?',
          'рассказывай',
          'что делаем?'
        ];
        let index=0;
        try{
          const key='rudi:voice-greeting';
          const previous=Number(localStorage.getItem(key));
          index=Math.floor(Math.random()*phrases.length);
          if(phrases.length>1&&Number.isFinite(previous)&&index===previous) index=(index+1)%phrases.length;
          localStorage.setItem(key,String(index));
        }catch(_){index=Math.floor(Math.random()*phrases.length)}
        return (name?name+', ':'')+phrases[index];
      }

      function syncVoiceAssistantGreeting(){
        if(!voiceAssistantGreeting) voiceAssistantGreeting=voiceAssistantGreetingText();
        const {greeting,panelGreeting}=voiceAssistantElements();
        if(greeting) greeting.textContent=voiceAssistantGreeting;
        if(panelGreeting) panelGreeting.textContent=voiceAssistantGreeting;
      }

      function voiceAssistantSupported(){      function voiceAssistantSupported(){
        return Boolean(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder);
      }

      function setVoiceAssistantStatus(text,state='idle'){
        const {status,talk,label,input,send}=voiceAssistantElements();
        if(status){status.textContent=String(text||'');status.dataset.state=state}
        const locked=state==='busy'||state==='recording';
        if(talk){
          talk.classList.toggle('is-recording',state==='recording');
          talk.classList.toggle('is-busy',state==='busy');
          talk.disabled=state==='busy';
        }
        if(input) input.disabled=locked;
        if(send) send.disabled=locked||!String(input?.value||'').trim();
        if(label) label.textContent=state==='recording'?'Закончить':state==='busy'?'Обрабатываю…':voiceAssistantHistory.length?'Сказать ещё':'Говорить';
      }

      function cleanVoiceAssistantText(      function cleanVoiceAssistantText(value){
        return String(value||'')
          .replace(/<br\s*\/?\s*>/giu,'\n')
          .replace(/<\/?[a-z][^>]*>/giu,'')
          .replace(/\[([^\]]+)\]\([^)]+\)/gu,'$1')
          .replace(/[*_`#]+/gu,'')
          .replace(/\r\n?/g,'\n')
          .replace(/\n{3,}/g,'\n\n')
          .trim();
      }

      function voiceAssistantTimeLabel(value=Date.now()){
        const date=value instanceof Date?value:new Date(value);
        if(Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('ru-RU',{
          hour:'2-digit',minute:'2-digit',hourCycle:'h23'
        }).format(date);
      }

      function renderVoiceAssistantMessage(role,text,createdAt=Date.now()){
        const {dialogue,empty}=voiceAssistantElements();
        if(!dialogue) return;
        if(empty) empty.hidden=true;
        const row=document.createElement('div');
        row.className='voice-assistant-message '+(role==='user'?'is-user':'is-assistant');
        if(role!=='user') row.classList.add('is-entering');
        const label=document.createElement('span');
        label.className='voice-assistant-message-label';
        const time=voiceAssistantTimeLabel(createdAt);
        label.textContent=(role==='user'?'Вы':'RUDI')+(time?' · '+time:'');
        const body=document.createElement('div');
        body.className='voice-assistant-message-text';
        body.textContent=cleanVoiceAssistantText(text);
        row.append(label,body);
        dialogue.appendChild(row);
        requestAnimationFrame(()=>{dialogue.scrollTop=dialogue.scrollHeight});
      }

      function voiceAssistantMimeType(){
        for(const type of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']){
          try{if(MediaRecorder.isTypeSupported?.(type)) return type}catch(_){}
        }
        return '';
      }

      function releaseVoiceAssistantStream(){
        clearTimeout(voiceAssistantRecordingTimer);
        voiceAssistantRecordingTimer=0;
        try{voiceAssistantStream?.getTracks?.().forEach(track=>track.stop())}catch(_){}
        voiceAssistantStream=null;
      }

      function splitVoiceAssistantSpeech(text){
        const raw=String(text||'').replace(/\s+/g,' ').trim();
        if(!raw) return [];
        const parts=raw.match(/[^.!?…]+[.!?…]?/g)||[raw];
        const chunks=[];let current='';
        for(const part of parts){
          const next=(current+' '+part).trim();
          if(next.length>220&&current){chunks.push(current);current=part.trim()}else current=next;
        }
        if(current) chunks.push(current);
        return chunks.slice(0,12);
      }

      function preferredVoiceAssistantVoice(){
        try{
          const voices=window.speechSynthesis?.getVoices?.()||[];
          return voices.find(item=>/^ru(?:-|_)/i.test(item.lang||'')&&item.localService)
            ||voices.find(item=>/^ru(?:-|_)/i.test(item.lang||''))
            ||null;
        }catch(_){return null}
      }

      function stopVoiceAssistantSpeech(){
        voiceAssistantSpeechToken+=1;
        voiceAssistantSpeechUtterance=null;
        try{window.speechSynthesis?.cancel?.()}catch(_){}
      }

      function primeVoiceAssistantSpeech(){
        if(!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined') return false;
        try{
          const synth=window.speechSynthesis;
          synth.resume?.();
          const utterance=new SpeechSynthesisUtterance('\u00A0');
          utterance.lang='ru-RU';
          utterance.volume=0;
          utterance.rate=1;
          synth.speak(utterance);
          return true;
        }catch(_){return false}
      }

      function speakVoiceAssistant(text){
        if(!voiceAssistantVoiceEnabled||!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined') return false;
        const chunks=splitVoiceAssistantSpeech(text);
        if(!chunks.length) return false;
        try{
          stopVoiceAssistantSpeech();
          const synth=window.speechSynthesis;
          const voice=preferredVoiceAssistantVoice();
          const token=voiceAssistantSpeechToken;
          let index=0;
          const next=()=>{
            if(token!==voiceAssistantSpeechToken) return;
            if(index>=chunks.length){
              voiceAssistantSpeechUtterance=null;
              setVoiceAssistantStatus('Можно говорить дальше','idle');
              return;
            }
            const utterance=new SpeechSynthesisUtterance(chunks[index]);
            voiceAssistantSpeechUtterance=utterance;
            utterance.lang=voice?.lang||'ru-RU';
            utterance.rate=.96;
            utterance.pitch=1;
            utterance.volume=1;
            if(voice) utterance.voice=voice;
            utterance.onstart=()=>setVoiceAssistantStatus('Озвучиваю…','idle');
            utterance.onend=()=>{
              if(token!==voiceAssistantSpeechToken) return;
              voiceAssistantSpeechUtterance=null;
              index+=1;
              setTimeout(next,40);
            };
            utterance.onerror=event=>{
              if(token!==voiceAssistantSpeechToken) return;
              voiceAssistantSpeechUtterance=null;
              const reason=String(event?.error||'');
              if(reason==='canceled'||reason==='interrupted') return;
              setVoiceAssistantStatus('Ответ готов','idle');
            };
            synth.resume?.();
            synth.speak(utterance);
            setTimeout(()=>{try{if(token===voiceAssistantSpeechToken&&synth.paused) synth.resume()}catch(_){}},100);
          };
          setTimeout(next,20);
          return true;
        }catch(_){
          voiceAssistantSpeechUtterance=null;
          return false;
        }
      }

      function setVoiceAssistantVoiceEnabled(enabled){
        voiceAssistantVoiceEnabled=Boolean(enabled);
        const button=document.getElementById('voiceAssistantVoiceToggle');
        if(button){
          button.classList.toggle('is-active',voiceAssistantVoiceEnabled);
          button.setAttribute('aria-pressed',voiceAssistantVoiceEnabled?'true':'false');
          button.setAttribute('aria-label',voiceAssistantVoiceEnabled?'Отключить голосовые ответы':'Включить голосовые ответы');
          button.title=voiceAssistantVoiceEnabled?'Голос включён':'Только текст';
        }
        if(voiceAssistantVoiceEnabled){
          primeVoiceAssistantSpeech();
          if(voiceAssistantLastAnswer) setVoiceAssistantStatus('Голос включён','idle');
        }else{
          stopVoiceAssistantSpeech();
          setVoiceAssistantStatus('Ответы только текстом','idle');
        }
      }

      function voiceAssistantBlobBase64(blob){
        return new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>{const value=String(reader.result||'');resolve(value.includes(',')?value.slice(value.indexOf(',')+1):value)};
          reader.onerror=()=>reject(reader.error||new Error('voice-read-error'));
          reader.readAsDataURL(blob);
        });
      }

      async function sendVoiceAssistantAudio(blob){
        if(voiceAssistantBusy||!blob?.size) return;
        voiceAssistantBusy=true;setVoiceAssistantStatus('Распознаю речь…','busy');
        try{
          const audioBase64=await voiceAssistantBlobBase64(blob);
          const response=await fetch('/api/partner-message?rudiAction=voice-assistant',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              initData:telegramInitData(),
              backupToken:currentStateBackupToken||readLocalStateBackupToken(),
              mimeType:String(blob.type||'audio/webm').split(';')[0],
              audioBase64,
              history:voiceAssistantHistory.slice(-8),
              timeZone:(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||TZ}catch(_){return TZ}})(),
              ui:{tab:currentAppTab,selectedDate:currentSelectedWorkDate||''}
            }),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok){
            const requestError=new Error(payload.error||'voice-assistant-failed');
            requestError.retryAfterSeconds=Math.max(1,Number(payload.retryAfterSeconds)||20);
            throw requestError;
          }
          const actionType=String(payload.actionResult?.type||'');
          if(actionType.startsWith('products-')){
            invalidateManagedRequests('products');
            loadProducts({silent:true}).catch(()=>{});
          }else if(actionType.startsWith('wishlist-')){
            invalidateManagedRequests('wishlist');
            wishlistRequest('list').then(renderWishlist).catch(()=>{});
          }else if(actionType==='saved-remove'){
            Promise.resolve(window.RUDI_SAVES?.load?.()).catch(()=>{});
          }else if(actionType==='lulu-walk'){
            luluRequest('get').then(data=>renderLulu(data.lulu)).catch(()=>{});
          }else if(actionType==='mood-set'){
            refreshDailyMood().catch(()=>{});
          }else if(actionType==='app-navigate'&&APP_TABS.includes(String(payload.actionResult?.tab||''))){
            navigateToAppTab(String(payload.actionResult.tab),{scroll:false});
          }else if(actionType.startsWith('smart-home')){
            window.RUDI_SMART_HOME?.refresh?.();
          }
          const transcript=cleanVoiceAssistantText(payload.transcript);
          const answer=cleanVoiceAssistantText(payload.answer);
          if(transcript){renderVoiceAssistantMessage('user',transcript);voiceAssistantHistory.push({role:'user',content:transcript})}
          if(answer){
            renderVoiceAssistantMessage('assistant',answer);
            voiceAssistantHistory.push({role:'assistant',content:answer});
            voiceAssistantHistory=voiceAssistantHistory.slice(-8);
            voiceAssistantLastAnswer=answer;
            if(voiceAssistantVoiceEnabled){
              setVoiceAssistantStatus('Отвечаю…','idle');
              if(!speakVoiceAssistant(answer)) setVoiceAssistantStatus('Ответ готов','idle');
            }else{
              setVoiceAssistantStatus('Ответ готов','idle');
            }
          }else setVoiceAssistantStatus('Не удалось получить ответ','idle');
        }catch(error){
          const code=String(error?.message||error);
          const retry=Math.max(1,Number(error?.retryAfterSeconds)||20);
          const message=code==='voice-no-speech'?'Речь не распознана. Попробуйте ещё раз.'
            :code==='voice-stt-rate-limit'?'Слишком много голосовых запросов подряд. Подожди '+retry+' сек. и попробуй ещё раз.'
            :code==='voice-chat-rate-limit'?'Слишком много запросов подряд. Подожди '+retry+' сек. и попробуй ещё раз.'
            :code==='voice-audio-too-large'?'Запись слишком длинная.'
            :/permission|notallowed/i.test(code)?'Нужен доступ к микрофону.'
            :'Не удалось обработать голос. Попробуйте ещё раз.';
          setVoiceAssistantStatus(message,'idle');
        }finally{
          voiceAssistantBusy=false;
          const {label}=voiceAssistantElements();if(label) label.textContent=voiceAssistantHistory.length?'Сказать ещё':'Говорить';
        }
      }

      function applyVoiceAssistantActionResult(actionResult){
        const actionType=String(actionResult?.type||'');
        if(actionType.startsWith('products-')){
          invalidateManagedRequests('products');
          loadProducts({silent:true}).catch(()=>{});
        }else if(actionType.startsWith('wishlist-')){
          invalidateManagedRequests('wishlist');
          wishlistRequest('list').then(renderWishlist).catch(()=>{});
        }else if(actionType==='saved-remove'){
          Promise.resolve(window.RUDI_SAVES?.load?.()).catch(()=>{});
        }else if(actionType==='lulu-walk'){
          luluRequest('get').then(data=>renderLulu(data.lulu)).catch(()=>{});
        }else if(actionType==='mood-set'){
          refreshDailyMood().catch(()=>{});
        }else if(actionType==='app-navigate'&&APP_TABS.includes(String(actionResult?.tab||''))){
          navigateToAppTab(String(actionResult.tab),{scroll:false});
        }else if(actionType.startsWith('smart-home')){
          window.RUDI_SMART_HOME?.refresh?.();
        }
      }

      async function sendVoiceAssistantText(value){
        const text=cleanVoiceAssistantText(value).slice(0,1200);
        if(voiceAssistantBusy||!text) return;
        const historyBefore=voiceAssistantHistory.slice(-8);
        voiceAssistantBusy=true;
        stopVoiceAssistantSpeech();
        renderVoiceAssistantMessage('user',text);
        voiceAssistantHistory.push({role:'user',content:text});
        voiceAssistantHistory=voiceAssistantHistory.slice(-8);
        setVoiceAssistantStatus('Отвечаю…','busy');
        try{
          const response=await fetch('/api/partner-message?rudiAction=voice-assistant',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              initData:telegramInitData(),
              backupToken:currentStateBackupToken||readLocalStateBackupToken(),
              text,
              history:historyBefore,
              timeZone:(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||TZ}catch(_){return TZ}})(),
              ui:{tab:currentAppTab,selectedDate:currentSelectedWorkDate||''}
            }),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok){
            const requestError=new Error(payload.error||'voice-assistant-failed');
            requestError.retryAfterSeconds=Math.max(1,Number(payload.retryAfterSeconds)||20);
            throw requestError;
          }
          applyVoiceAssistantActionResult(payload.actionResult);
          const answer=cleanVoiceAssistantText(payload.answer);
          if(answer){
            renderVoiceAssistantMessage('assistant',answer);
            voiceAssistantHistory.push({role:'assistant',content:answer});
            voiceAssistantHistory=voiceAssistantHistory.slice(-8);
            voiceAssistantLastAnswer=answer;
            if(voiceAssistantVoiceEnabled){
              setVoiceAssistantStatus('Отвечаю голосом…','idle');
              if(!speakVoiceAssistant(answer)) setVoiceAssistantStatus('Ответ готов','idle');
            }else{
              setVoiceAssistantStatus('Ответ готов','idle');
            }
          }else setVoiceAssistantStatus('Не смогла получить ответ','idle');
        }catch(error){
          const code=String(error?.message||error);
          const retry=Math.max(1,Number(error?.retryAfterSeconds)||20);
          const message=code==='voice-chat-rate-limit'?'Слишком много запросов подряд. Подожди '+retry+' сек. и попробуй ещё раз.'
            :/telegram-auth|auth-required|auth-expired/i.test(code)?'Нужно заново открыть RUDI из Telegram.'
            :'Не смогла ответить. Попробуй ещё раз.';
          setVoiceAssistantStatus(message,'idle');
        }finally{
          voiceAssistantBusy=false;
          const {input,send,label}=voiceAssistantElements();
          if(input) input.disabled=false;
          if(send) send.disabled=!String(input?.value||'').trim();
          if(label) label.textContent=voiceAssistantHistory.length?'Сказать ещё':'Говорить';
        }
      }

      function stopVoiceAssistantRecording(){
        clearTimeout(voiceAssistantRecordingTimer);voiceAssistantRecordingTimer=0;
        const recorder=voiceAssistantRecorder;if(!recorder) return;
        try{if(recorder.state!=='inactive') recorder.stop()}catch(_){}
      }

      async function startVoiceAssistantRecording(){
        if(voiceAssistantBusy) return;
        if(!voiceAssistantSupported()){setVoiceAssistantStatus('На этом устройстве запись голоса недоступна.','idle');return}
        stopVoiceAssistantSpeech();
        releaseVoiceAssistantStream();voiceAssistantChunks=[];
        try{
          const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
          voiceAssistantStream=stream;
          const mimeType=voiceAssistantMimeType();
          const recorder=mimeType?new MediaRecorder(stream,{mimeType,audioBitsPerSecond:48000}):new MediaRecorder(stream,{audioBitsPerSecond:48000});
          voiceAssistantRecorder=recorder;
          recorder.addEventListener('dataavailable',event=>{if(event.data?.size) voiceAssistantChunks.push(event.data)});
          recorder.addEventListener('stop',()=>{
            const type=recorder.mimeType||mimeType||voiceAssistantChunks[0]?.type||'audio/webm';
            const blob=new Blob(voiceAssistantChunks,{type});
            voiceAssistantRecorder=null;voiceAssistantChunks=[];releaseVoiceAssistantStream();
            if(blob.size<256){setVoiceAssistantStatus('Ничего не услышала. Попробуйте ещё раз.','idle');return}
            sendVoiceAssistantAudio(blob);
          },{once:true});
          recorder.start(250);setVoiceAssistantStatus('Слушаю…','recording');
          voiceAssistantRecordingTimer=setTimeout(()=>stopVoiceAssistantRecording(),30000);
          try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
        }catch(error){
          releaseVoiceAssistantStream();
          const code=String(error?.name||error?.message||error);
          setVoiceAssistantStatus(/NotAllowed|Permission/i.test(code)?'Разрешите RUDI доступ к микрофону.':'Не удалось включить микрофон.','idle');
        }
      }

      function updateVoiceAssistantViewport(){
        const {panel,input}=voiceAssistantElements();
        if(!panel) return;
        const viewport=window.visualViewport;
        const height=Math.max(1,Math.round(viewport?.height||window.innerHeight||document.documentElement.clientHeight||1));
        const offsetTop=Math.max(0,Math.round(viewport?.offsetTop||0));
        const layoutHeight=Math.max(height,Math.round(window.innerHeight||height));
        const keyboardInset=viewport?Math.max(0,layoutHeight-height-offsetTop):0;
        panel.style.setProperty('--voice-assistant-keyboard-inset',keyboardInset+'px');
        panel.style.setProperty('--voice-assistant-viewport-height',height+'px');
        const active=document.activeElement===input;
        document.body.classList.toggle('voice-assistant-input-active',active);
        if(active){
          requestAnimationFrame(()=>{
            const {dialogue}=voiceAssistantElements();
            if(dialogue) dialogue.scrollTop=dialogue.scrollHeight;
          });
        }
      }

      function closeVoiceAssistant(){
        stopVoiceAssistantRecording();releaseVoiceAssistantStream();
        stopVoiceAssistantSpeech();
        const {panel,launcher}=voiceAssistantElements();
        if(panel) panel.hidden=true;
        if(launcher) launcher.hidden=false;
        document.body.classList.remove('voice-assistant-input-active');
        updateVoiceAssistantViewport();
      }

      function syncVoiceAssistantVisibility(){
        const {launcher,panel}=voiceAssistantElements();
        if(launcher) launcher.hidden=Boolean(panel&&!panel.hidden);
      }

      function setupVoiceAssistant(){
        const {launcher,fab,panel,close,talk,dialogue,form,input,send}=voiceAssistantElements();
        const voiceToggle=document.getElementById('voiceAssistantVoiceToggle');
        if(!fab||!panel||fab.dataset.bound==='1') return;
        fab.dataset.bound='1';

        syncVoiceAssistantGreeting();
        setVoiceAssistantVoiceEnabled(false);
        if(launcher) launcher.hidden=false;
        if(send) send.disabled=!String(input?.value||'').trim();

        fab.addEventListener('click',()=>{
          panel.hidden=false;
          if(launcher) launcher.hidden=true;
          syncVoiceAssistantGreeting();
          setVoiceAssistantStatus(voiceAssistantHistory.length?'Можно продолжить':'Готова слушать','idle');
          updateVoiceAssistantViewport();
        });
        close?.addEventListener('click',()=>closeVoiceAssistant());
        talk?.addEventListener('click',()=>{
          if(voiceAssistantRecorder?.state==='recording') stopVoiceAssistantRecording();
          else startVoiceAssistantRecording();
        });
        voiceToggle?.addEventListener('click',()=>{
          setVoiceAssistantVoiceEnabled(!voiceAssistantVoiceEnabled);
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });

        input?.addEventListener('input',()=>{
          if(send) send.disabled=voiceAssistantBusy||!String(input.value||'').trim();
        });
        input?.addEventListener('focus',()=>{
          document.body.classList.add('voice-assistant-input-active');
          updateVoiceAssistantViewport();
          setTimeout(updateVoiceAssistantViewport,60);
          setTimeout(updateVoiceAssistantViewport,240);
        });
        input?.addEventListener('blur',()=>{
          setTimeout(()=>{
            if(document.activeElement!==input) document.body.classList.remove('voice-assistant-input-active');
            updateVoiceAssistantViewport();
          },120);
        });
        form?.addEventListener('submit',event=>{
          event.preventDefault();
          const value=String(input?.value||'').trim();
          if(!value||voiceAssistantBusy) return;
          if(input) input.value='';
          if(send) send.disabled=true;
          sendVoiceAssistantText(value);
        });

        let dialogueTouchY=0;
        dialogue?.addEventListener('touchstart',event=>{
          if(event.touches?.length===1) dialogueTouchY=event.touches[0].clientY;
        },{passive:true});
        dialogue?.addEventListener('touchmove',event=>{
          if(event.touches?.length!==1) return;
          const y=event.touches[0].clientY;
          const delta=y-dialogueTouchY;
          const atTop=dialogue.scrollTop<=0;
          const atBottom=Math.ceil(dialogue.scrollTop+dialogue.clientHeight)>=dialogue.scrollHeight;
          if((atTop&&delta>0)||(atBottom&&delta<0)) event.preventDefault();
          event.stopPropagation();
          dialogueTouchY=y;
        },{passive:false});

        window.addEventListener('resize',updateVoiceAssistantViewport,{passive:true});
        window.visualViewport?.addEventListener?.('resize',updateVoiceAssistantViewport,{passive:true});
        window.visualViewport?.addEventListener?.('scroll',updateVoiceAssistantViewport,{passive:true});
        try{window.speechSynthesis?.addEventListener?.('voiceschanged',()=>preferredVoiceAssistantVoice(),{passive:true})}catch(_){}
        updateVoiceAssistantViewport();
        syncVoiceAssistantVisibility(currentAppTab);
      }

      function setupAppTabs(){      function setupAppTabs(){
        const initial=routeFromLocation();
        const initialTab=requestedAppTab||initial.tab||'home';
        const initialItem=requestedItemId||initial.item||'';
        applyAppTab(initialTab,{scroll:false});
        updateAppRoute(currentAppTab,{item:initialItem,replace:true});
        runTabSideEffects(currentAppTab,{item:initialItem});

        document.querySelectorAll('#appTabBar [data-app-tab]').forEach(button=>{
          if(button.dataset.routeBound==='1') return;
          button.dataset.routeBound='1';
          button.addEventListener('click',()=>{
            const next=button.dataset.appTab||'home';
            if(next===currentAppTab){
              appTabScroll[next]=0;
              updateAppRoute(next,{replace:true});
              requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
              if(next==='schedule') loadWorkCalendar(currentWorkCalendarView,{silent:true});
              try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
              return;
            }
            if(next==='schedule'){
              playCalendarConfetti();
            }
            navigateToAppTab(next,{scroll:true});
            try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
          });
        });

        if(window.__rudiPopstateBound!=='1'){
          window.__rudiPopstateBound='1';
          window.addEventListener('popstate',()=>{
            const route=routeFromLocation();
            const previous=currentAppTab;
            const update=()=>{
              applyAppTab(route.tab,{scroll:true});
              runTabSideEffects(currentAppTab,{item:route.item});
              focusDeepLinkedItem(currentAppTab,route.item);
            };
            if(route.tab!==previous) runAppViewTransition(update);
            else update();
          });
        }
      }

      function blockStateStorageKey(){
        const userId=String(tg?.initDataUnsafe?.user?.id||(currentActor==='Диана'?'diana':'rustam'));
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

      function dianaCycleStatus(modelOrPhase){
        const model=modelOrPhase&&typeof modelOrPhase==='object'
          ?modelOrPhase
          :{phase:String(modelOrPhase||'')};
        const phase=String(model.phase||'');
        const day=Number(model.cycleDay);
        const periodLength=Math.max(1,Number(model.periodLength)||5);
        const fertileStart=Number(model.fertileStart);
        const ovulationDay=Number(model.ovulationDay);
        const daysToNext=Number(model.daysToNext);

        const pick=(items,seed=0)=>{
          if(!Array.isArray(items)||!items.length) return '';
          const value=Number.isFinite(Number(seed))?Math.abs(Math.round(Number(seed))):0;
          return items[value%items.length];
        };

        const adviceByStatus={
          'Спокойная':'Лучше держать спокойный темп, не перегружать день и оставить больше времени на отдых.',
          'Нежная':'Лучше бережнее относиться к себе: меньше спешки, больше комфорта и приятных спокойных дел.',
          'Уютная':'Лучше сделать день максимально комфортным: меньше суеты, больше отдыха и привычных приятных вещей.',
          'Вдумчивая':'Лучше выбирать спокойные дела, не торопиться с решениями и оставить больше личного пространства.',
          'Бодрая':'Можно смело держать обычный активный темп, заниматься делами и больше двигаться.',
          'Лёгкая':'Лучше не перегружать день тяжёлыми задачами, а использовать хороший настрой для приятных и простых дел.',
          'Собранная':'Хороший момент для планирования, порядка и задач, где нужны внимание и последовательность.',
          'Энергичная':'Можно сделать день насыщеннее: больше активности, встреч, прогулок и важных задач.',
          'Активная':'Подходит более динамичный день: дела, движение, встречи и всё, что давно хотелось успеть.',
          'Воодушевлённая':'Лучше направить этот настрой на новые идеи, приятные планы, творчество или важные личные дела.',
          'Яркая':'Можно больше общаться, выходить из дома, заниматься приятными делами и делать день насыщеннее.',
          'Сияющая':'Хороший день для общения, прогулок, встреч и всего, что даёт положительные эмоции.',
          'Общительная':'Лучше не сидеть весь день в одиночестве: встречи, разговоры и совместные дела могут особенно хорошо зайти.',
          'Уверенная':'Хороший момент для важных решений, организованных дел и задач, которые давно откладывались.',
          'Уравновешенная':'Лучше держать ровный режим без перегибов: спокойно работать, отдыхать и не перегружать себя.',
          'Чувствительная':'Лучше снизить стресс, избегать лишних конфликтов и дать себе больше отдыха, тишины и комфорта.'
        };

        const makeStatus=(label)=>({
          label,
          advice:adviceByStatus[label]||'Лучше ориентироваться на своё самочувствие и выбирать комфортный для себя темп дня.'
        });

        if(phase==='Месячные'){
          const early=Number.isFinite(day)&&day<=2;
          return makeStatus(early
            ?pick(['Спокойная','Нежная','Уютная'],day)
            :pick(['Нежная','Спокойная','Вдумчивая'],day));
        }

        if(phase==='Фолликулярная фаза'){
          if(Number.isFinite(day)&&day<=periodLength+2){
            return makeStatus(pick(['Бодрая','Лёгкая','Собранная'],day));
          }
          if(Number.isFinite(day)&&Number.isFinite(fertileStart)&&day>=fertileStart-2){
            return makeStatus(pick(['Энергичная','Активная','Воодушевлённая'],day));
          }
          return makeStatus(pick(['Бодрая','Активная','Собранная','Воодушевлённая'],day));
        }

        if(phase==='Фертильное окно'){
          if(Number.isFinite(day)&&Number.isFinite(ovulationDay)&&day===ovulationDay){
            return makeStatus(pick(['Яркая','Энергичная','Сияющая'],day));
          }
          if(Number.isFinite(day)&&Number.isFinite(ovulationDay)&&day<ovulationDay){
            return makeStatus(pick(['Энергичная','Яркая','Активная','Общительная'],day));
          }
          return makeStatus(pick(['Уверенная','Собранная','Уравновешенная'],day));
        }

        if(phase==='Лютеиновая фаза'){
          if(Number.isFinite(daysToNext)&&daysToNext<=2){
            return makeStatus(pick(['Нежная','Спокойная','Чувствительная'],day));
          }
          if(Number.isFinite(daysToNext)&&daysToNext<=5){
            return makeStatus(pick(['Чувствительная','Вдумчивая','Спокойная'],day));
          }
          if(Number.isFinite(day)&&Number.isFinite(ovulationDay)&&day<=ovulationDay+3){
            return makeStatus(pick(['Уравновешенная','Собранная','Спокойная'],day));
          }
          return makeStatus(pick(['Уравновешенная','Вдумчивая','Спокойная','Собранная'],day));
        }

        return {label:'',advice:''};
      }

      function dianaCycleMoodWord(modelOrPhase){
        return dianaCycleStatus(modelOrPhase).label;
      }

      function dianaCycleDailyAdvice(modelOrPhase){
        return dianaCycleStatus(modelOrPhase).advice;
      }

      function dianaCycleBrainNote(modelOrPhase){
        const model=modelOrPhase&&typeof modelOrPhase==='object'?modelOrPhase:{phase:String(modelOrPhase||'')};
        const phase=String(model.phase||'');
        const daysToNext=Number(model.daysToNext);
        if(phase==='Месячные') return '🧠 Мозг: энергия и концентрация могут быть ниже — лучше спокойный темп и меньше перегруза.';
        if(phase==='Фолликулярная фаза') return '🧠 Мозг: по мере роста эстрогена у части женщин легче даются фокус, обучение и новые задачи.';
        if(phase==='Фертильное окно') return '🧠 Мозг: у части женщин в этот период выше энергия, социальная вовлечённость и скорость реакции.';
        if(phase==='Лютеиновая фаза'){
          if(Number.isFinite(daysToNext)&&daysToNext<=5) return '🧠 Мозг: перед месячными внимание и устойчивость к стрессу могут снижаться; лучше оставить запас по нагрузке.';
          return '🧠 Мозг: темп обычно ровнее, но ближе к концу фазы чувствительность к стрессу может постепенно расти.';
        }
        return '';
      }

      function dianaCycleAppetiteNote(modelOrPhase){
        const model=modelOrPhase&&typeof modelOrPhase==='object'?modelOrPhase:{phase:String(modelOrPhase||'')};
        const phase=String(model.phase||'');
        const daysToNext=Number(model.daysToNext);
        if(phase==='Месячные') return '🍽 Аппетит: индивидуален; может сохраняться тяга к более сытной, тёплой или сладкой еде.';
        if(phase==='Фолликулярная фаза') return '🍽 Аппетит: часто более ровный, а тяга к перекусам может быть ниже, чем во второй половине цикла.';
        if(phase==='Фертильное окно') return '🍽 Аппетит: обычно стабильный; у части женщин около овуляции он немного снижается.';
        if(phase==='Лютеиновая фаза'){
          if(Number.isFinite(daysToNext)&&daysToNext<=5) return '🍽 Аппетит: перед месячными чаще усиливаются голод и тяга к сладкому или более калорийной еде.';
          return '🍽 Аппетит: может постепенно повышаться; ближе к ПМС тяга к перекусам обычно заметнее.';
        }
        return '';
      }

      function setDianaCycleMood(modelOrPhase){
        const node=document.getElementById('dianaCycleMood');
        if(!node) return;
        const word=dianaCycleMoodWord(modelOrPhase);
        node.textContent=word;
        node.hidden=!word;
        node.title=word?'Ориентировочный статус по календарю цикла':'';
      }

      function rustamWorkState(now=new Date()){
        const parts=Object.fromEntries(
          new Intl.DateTimeFormat('en-GB',{
            timeZone:TZ,
            weekday:'short',
            hour:'2-digit',
            minute:'2-digit',
            hourCycle:'h23'
          }).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])
        );
        const workday=['Mon','Tue','Wed','Thu','Fri'].includes(String(parts.weekday||''));
        const minutes=(Number(parts.hour)||0)*60+(Number(parts.minute)||0);
        return workday&&minutes>=10*60&&minutes<18*60;
      }

      function rustamRhythmStatus(now=new Date()){
        const parts=Object.fromEntries(
          new Intl.DateTimeFormat('en-GB',{
            timeZone:TZ,
            hour:'2-digit',
            minute:'2-digit',
            hourCycle:'h23'
          }).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])
        );
        const minutes=(Number(parts.hour)||0)*60+(Number(parts.minute)||0);
        if(minutes<6*60+30||minutes>=23*60) return 'Сон';
        if(minutes<7*60) return 'Старт';
        if(minutes<8*60) return 'Разгон';
        if(minutes<11*60+30) return 'Пик';
        if(minutes<12*60+30) return 'Пауза';
        if(minutes<15*60) return 'Темп';
        if(minutes<16*60) return 'Спад';
        if(minutes<18*60) return 'Движ';
        if(minutes<20*60) return 'Выдох';
        if(minutes<22*60+30) return 'Чилл';
        return 'Тише';
      }

      function rustamRhythmRecommendation(status){
        return {
          'Старт':'проснуться: свет, вода и немного движения',
          'Разгон':'позавтракать, пройтись и наметить главное',
          'Пик':'делать самую сложную работу и принимать решения',
          'Пауза':'поесть, пройтись и немного отвлечься',
          'Темп':'заниматься текущими задачами, встречами и ответами',
          'Спад':'переключиться на простые дела и сделать перерыв',
          'Движ':'тренироваться, гулять или решать дела вне дома',
          'Выдох':'поужинать, отдохнуть и пообщаться',
          'Чилл':'заниматься спокойными делами, читать или смотреть кино',
          'Тише':'приглушить свет, убрать сложную работу и готовиться ко сну',
          'Сон':'спать и восстанавливаться'
        }[String(status||'')]||'';
      }

      function syncRustamRhythmStatus(now=new Date()){
        const node=document.getElementById('rustamRhythmStatus');
        if(!node) return;
        const text=rustamRhythmStatus(now);
        node.textContent=text;
        node.hidden=!text;
        const advice=document.getElementById('rustamRhythmAdvice');
        const recommendation=rustamRhythmRecommendation(text);
        if(advice){
          advice.textContent=recommendation?'Сейчас лучше: '+recommendation:'';
          advice.hidden=!recommendation;
        }
      }

      function syncStaticProfileWorkStatus(){
        const rustamWorking=rustamWorkState();
        setProfileWorkStatus(
          'Рустам',
          rustamWorking?'Работаю':'Отдыхаю',
          rustamWorking?'working':'off'
        );
        syncRustamRhythmStatus();
        const diana=profileStatusElement('Диана');
        if(!diana) return;
        if(diana.dataset.calendarReady&&homeDashboardState.workDay){
          const workingNow=dianaWorkingNow(homeDashboardState.workDay);
          setProfileWorkStatus(
            'Диана',
            dianaWorkStatusText(homeDashboardState.workDay),
            workingNow?'working':'off'
          );
          return;
        }
        if(!diana.dataset.calendarReady){
          setProfileWorkStatus('Диана','Проверяю график…','neutral');
        }
      }

      function homeTaskForActor(task){
        if(!task||task.completed) return false;
        if(!task.assigned) return true;
        const expected=currentActor==='Диана'?'ди':'rst';
        return String(task.assignee||'').trim().toLocaleLowerCase('ru-RU')===expected;
      }

      function homeTaskCountLabel(count){
        const n=Math.abs(Number(count)||0),mod100=n%100,mod10=n%10;
        const word=mod100>=11&&mod100<=14?'дел':mod10===1?'дело':mod10>=2&&mod10<=4?'дела':'дел';
        return n+' '+word;
      }

      function homeMoodView(value){
        return {sadness:'😢',fear:'😨',anger:'😡',joy:'😄',love:'🥰'}[String(value||'')]||'—';
      }

      function homeDashboardDateLabel(){
        const text=new Intl.DateTimeFormat('ru-RU',{
          weekday:'long',day:'numeric',month:'long',timeZone:TZ
        }).format(new Date());
        return text.charAt(0).toLocaleUpperCase('ru-RU')+text.slice(1);
      }

      function homeGreeting(){
        const hour=Number(new Intl.DateTimeFormat('en-GB',{
          timeZone:TZ,hour:'2-digit',hourCycle:'h23'
        }).format(new Date()));
        const greeting=hour<12?'Доброе утро':hour<18?'Добрый день':'Добрый вечер';
        return greeting+', '+(currentActor||'');
      }

      function homeEventRows(){
        const payload=homeDashboardState.feed;
        const sections=payload?.sections||{};
        const parts=Array.isArray(sections.events?.parts)?sections.events.parts:[];
        const rows=[];
        for(const [index,name] of [[0,'concerts'],[1,'standup']]){
          const value=String(parts[index]||'');
          if(!value) continue;
          const items=parseFeedEventItems(value,name);
          for(const item of items){
            const detail=item.details.join(' ');
            const match=detail.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/u);
            const minutes=match?Number(match[1])*60+Number(match[2]):9999;
            rows.push({
              title:item.title,
              time:match?(String(match[1]).padStart(2,'0')+':'+match[2]):'',
              minutes,
              kind:name
            });
          }
        }
        return rows.sort((a,b)=>a.minutes-b.minutes);
      }

      function homeCurrentMinutes(){
        const parts=Object.fromEntries(
          new Intl.DateTimeFormat('en-GB',{
            timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
          }).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])
        );
        return (Number(parts.hour)||0)*60+(Number(parts.minute)||0);
      }

      function homeNearestRows(){
        const rows=[];
        const nowMinutes=homeCurrentMinutes();
        const tasks=homeDashboardState.tasks.filter(homeTaskForActor);
        for(const task of tasks){
          const start=String(task?.startTime||'').trim();
          const match=start.match(/^(\d{1,2}):(\d{2})$/u);
          const rawMinutes=match?Number(match[1])*60+Number(match[2]):9800;
          rows.push({
            label:String(task?.title||'Дело'),
            time:start,
            minutes:rawMinutes<nowMinutes&&rawMinutes<1440?9600:rawMinutes,
            icon:'📅'
          });
        }

        for(const event of homeEventRows()){
          if(event.minutes<nowMinutes) continue;
          rows.push({
            label:event.title,
            time:event.time,
            minutes:event.minutes,
            icon:event.kind==='standup'?'🎙':'🎤'
          });
        }

        const staticNearest=homeDashboardState.nearestStatic;
        if(staticNearest){
          rows.push({
            label:staticNearest.title,
            time:staticNearest.days===0?'Сегодня':staticNearest.days===1?'Завтра':('Через '+staticNearest.days+' '+dayWord(staticNearest.days)),
            minutes:12000+Math.max(0,Number(staticNearest.days)||0),
            icon:'⭐'
          });
        }
        return rows.sort((a,b)=>a.minutes-b.minutes).slice(0,3);
      }

      function homeNewStorageKey(kind){
        return 'rudi-home-new-v1-'+(currentActor==='Диана'?'diana':'rustam')+'-'+kind;
      }

      function homeCountIsNew(kind,count){
        const value=Math.max(0,Number(count)||0);
        try{
          const key=homeNewStorageKey(kind);
          const raw=localStorage.getItem(key);
          if(raw===null){
            localStorage.setItem(key,String(value));
            return false;
          }
          return value>Math.max(0,Number(raw)||0);
        }catch(_){return false}
      }

      function markHomeCountSeen(kind,count){
        try{localStorage.setItem(homeNewStorageKey(kind),String(Math.max(0,Number(count)||0)))}catch(_){}
        renderHomeNew();
      }

      function partnerMessageIsNew(){
        const message=homeDashboardState.message;
        if(!message?.updatedAt||!message?.authorName||message.authorName===currentActor) return false;
        const key=homeNewStorageKey('message');
        try{
          const raw=localStorage.getItem(key);
          if(raw===null){
            localStorage.setItem(key,String(message.updatedAt));
            return false;
          }
          return String(raw)!==String(message.updatedAt);
        }catch(_){return false}
      }

      function markPartnerMessageSeen(){
        const value=String(homeDashboardState.message?.updatedAt||'');
        if(value) try{localStorage.setItem(homeNewStorageKey('message'),value)}catch(_){}
        renderHomeDashboard();
      }

      async function activityRequest(){
        const response=await fetch('/api/partner-message?rudiAction=activity',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||''}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'activity-request-failed');
        return data;
      }

      function activityTimeLabel(value){
        const date=new Date(String(value||''));
        if(Number.isNaN(date.getTime())) return '';
        const now=new Date();
        const key=sharedAlbumDateKey(date);
        const today=sharedAlbumDateKey(now);
        const yesterday=sharedAlbumYesterdayKey();
        const time=new Intl.DateTimeFormat('ru-RU',{
          timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
        }).format(date);
        if(key===today) return 'Сегодня · '+time;
        if(key===yesterday) return 'Вчера · '+time;
        return new Intl.DateTimeFormat('ru-RU',{
          timeZone:TZ,day:'numeric',month:'short'
        }).format(date).replace('.','')+' · '+time;
      }

      function luluWalkTimeLabel(value){
        const date=new Date(String(value||''));
        if(Number.isNaN(date.getTime())) return 'пока не отмечена';
        const key=sharedAlbumDateKey(date);
        const today=sharedAlbumDateKey(new Date());
        const yesterday=sharedAlbumYesterdayKey();
        const time=new Intl.DateTimeFormat('ru-RU',{
          timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
        }).format(date);
        if(key===today) return 'сегодня в '+time;
        if(key===yesterday) return 'вчера в '+time;
        return new Intl.DateTimeFormat('ru-RU',{
          timeZone:TZ,day:'numeric',month:'short'
        }).format(date).replace('.','')+' в '+time;
      }

      function renderLulu(value){
        const state=value&&typeof value==='object'?value:{};
        homeDashboardState.lulu=state;
        const status=document.getElementById('luluWalkStatus');
        const walk=state.lastWalk&&typeof state.lastWalk==='object'?state.lastWalk:null;
        if(!status) return;
        const actor=String(walk?.actor||'').trim();
        const date=new Date(String(walk?.walkedAt||''));
        if(!actor||Number.isNaN(date.getTime())){
          status.textContent='Прогулка · пока не отмечена';
          return;
        }
        const time=new Intl.DateTimeFormat('ru-RU',{
          timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
        }).format(date);
        status.textContent='Прогулка · '+time+' · '+actor;
      }

      async function luluRequest(operation){
        const response=await fetch('/api/partner-message?rudiAction=lulu',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation}),
          cache:'no-store'
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok) throw new Error(payload.error||'lulu-request-failed');
        return payload;
      }

      async function markLuluWalk(){
        const button=document.getElementById('luluWalkButton');
        if(!button||button.disabled) return;
        button.disabled=true;
        button.classList.add('is-saving');
        try{
          const payload=await luluRequest('walk');
          renderLulu(payload.lulu);
          if(payload.backupToken) await storeStateBackupToken(payload.backupToken);
          setTimeout(()=>loadActivityJournal({silent:true}),120);
          try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
        }catch(_){
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }finally{
          button.disabled=false;
          button.classList.remove('is-saving');
        }
      }

      let settingsFaceIdStatusSequence=0;

      async function updateSettingsFaceIdUi(){
        const row=document.getElementById('settingsFaceIdRow');
        const status=document.getElementById('settingsFaceIdStatus');
        const button=document.getElementById('settingsFaceIdConnect');
        if(!status||!button) return;

        const insideTelegram=Boolean(telegramInitData());
        if(row) row.hidden=insideTelegram;
        if(insideTelegram) return;

        button.hidden=false;
        button.disabled=true;
        button.classList.remove('is-enabled');

        if(!passkeySupported()){
          status.textContent='Недоступен на этом устройстве';
          button.hidden=true;
          return;
        }
        if(!currentActor){
          status.textContent='Недоступен';
          button.hidden=true;
          return;
        }

        const sequence=++settingsFaceIdStatusSequence;
        status.textContent='Проверяю…';
        try{
          const faceStatus=await passkeyRequest('status');
          if(sequence!==settingsFaceIdStatusSequence) return;
          const configured=Boolean(faceStatus.configured);
          if(configured){
            status.textContent='Включён';
            button.textContent='Включён';
            button.classList.add('is-enabled');
            button.disabled=true;
            return;
          }
          status.textContent='Не подключён';
          button.textContent='Подключить';
          button.disabled=false;
        }catch(_){
          if(sequence!==settingsFaceIdStatusSequence) return;
          status.textContent='Не удалось проверить';
          button.textContent='Повторить';
          button.disabled=false;
        }
      }

      async function connectFaceIdFromSettings(){
        const status=document.getElementById('settingsFaceIdStatus');
        const button=document.getElementById('settingsFaceIdConnect');
        if(!status||!button||button.disabled) return;

        const sequence=++settingsFaceIdStatusSequence;
        button.disabled=true;
        status.textContent='Подготавливаю…';
        try{
          const prepared=await prepareFaceIdRegistration();
          status.textContent='Подтвердите Face ID…';
          const credentialPromise=navigator.credentials.create({publicKey:prepared.publicKey});
          await finishFaceIdRegistration(prepared,credentialPromise);
          if(sequence!==settingsFaceIdStatusSequence) return;
          status.textContent='Включён';
          button.textContent='Включён';
          button.classList.add('is-enabled');
          button.disabled=true;
          try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
        }catch(error){
          const name=String(error?.name||'');
          status.textContent=name==='NotAllowedError'
            ?'Подключение отменено'
            :name==='SecurityError'
              ?'Недоступен для этого адреса'
              :name==='NotSupportedError'
                ?'Не поддерживается'
                :'Не удалось подключить';
          button.textContent='Повторить';
          button.classList.remove('is-enabled');
          button.disabled=false;
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }
      }

      function updateSettingsVersion(){
        const version=document.getElementById('settingsAppVersion');
        if(version) version.textContent=appVersionLabel()||'—';
      }

      let settingsPanelCloseTimer=null;
      function setSettingsOpen(open){
        const panel=document.getElementById('homeSettingsPanel');
        const button=document.getElementById('homeSettingsButton');
        if(!panel||!button) return;
        const next=Boolean(open);
        clearTimeout(settingsPanelCloseTimer);
        if(next){
          setActivityNotificationsOpen(false);
          panel.hidden=false;
          updateSettingsVersion();
          updatePwaInstallUi();
          updateSettingsFaceIdUi();
          setupExtendedSettings();
          updateDataSettingsUi();
          updateAboutSettingsUi();
          requestAnimationFrame(()=>panel.classList.add('is-open'));
        }else{
          panel.classList.remove('is-open');
          settingsPanelCloseTimer=setTimeout(()=>{
            if(!panel.classList.contains('is-open')) panel.hidden=true;
          },230);
        }
        button.setAttribute('aria-expanded',next?'true':'false');
        document.getElementById('homeDashboard')?.classList.toggle('settings-open',next);
      }

      function setupSettingsPanel(){
        const button=document.getElementById('homeSettingsButton');
        const panel=document.getElementById('homeSettingsPanel');
        if(!button||!panel||button.dataset.bound==='1') return;
        button.dataset.bound='1';
        button.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          setSettingsOpen(!panel.classList.contains('is-open'));
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });
        document.getElementById('settingsPwaInstall')?.addEventListener('click',installPwa);
        document.getElementById('settingsFaceIdConnect')?.addEventListener('click',connectFaceIdFromSettings);
        document.addEventListener('click',event=>{
          if(panel.hidden||!panel.classList.contains('is-open')) return;
          if(event.target.closest?.('#homeSettings')) return;
          setSettingsOpen(false);
        });
        document.addEventListener('keydown',event=>{
          if(event.key==='Escape') setSettingsOpen(false);
        });
        updateSettingsVersion();
        updatePwaInstallUi();
        updateSettingsFaceIdUi();
        setupExtendedSettings();
      }

      function hideUndoSnackbar(){
        clearTimeout(undoSnackbarTimer);
        undoSnackbarTimer=0;
        undoSnackbarAction=null;
        const bar=document.getElementById('undoSnackbar');
        if(!bar) return;
        bar.classList.remove('is-open');
        setTimeout(()=>{if(!bar.classList.contains('is-open')) bar.hidden=true},190);
      }

      function showUndoSnackbar(text,undo){
        const bar=document.getElementById('undoSnackbar');
        const copy=document.getElementById('undoSnackbarText');
        if(!bar||typeof undo!=='function') return;
        clearTimeout(undoSnackbarTimer);
        undoSnackbarAction=undo;
        if(copy) copy.textContent=String(text||'Удалено');
        bar.hidden=false;
        requestAnimationFrame(()=>bar.classList.add('is-open'));
        undoSnackbarTimer=setTimeout(hideUndoSnackbar,6000);
      }

      function setupUndoSnackbar(){
        const button=document.getElementById('undoSnackbarButton');
        if(!button||button.dataset.bound==='1') return;
        button.dataset.bound='1';
        button.addEventListener('click',async()=>{
          const action=undoSnackbarAction;
          if(typeof action!=='function') return;
          button.disabled=true;
          clearTimeout(undoSnackbarTimer);
          try{
            await action();
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            button.disabled=false;
            hideUndoSnackbar();
          }
        });
      }

      function activityNotificationsHaveUnread(){
        const latest=homeDashboardState.activity?.[0];
        return Boolean(latest?.id&&String(latest.id)!==currentActivitySeenId());
      }

      function updateActivityNotificationBadge(){
        const dot=document.getElementById('homeActivityNotificationDot');
        if(dot) dot.hidden=!activityNotificationsHaveUnread();
      }

      function markActivityNotificationsSeen(){
        const latest=homeDashboardState.activity?.[0];
        const id=String(latest?.id||'').trim();
        if(!id||id===currentActivitySeenId()){
          updateActivityNotificationBadge();
          return;
        }
        try{localStorage.setItem(activitySeenStorageKey(),id)}catch(_){}
        markUiPreferencesChanged();
        updateActivityNotificationBadge();
      }

      let activityNotificationsCloseTimer=null;

      function activityFixedContainingBlockTop(panel){
        let node=panel?.parentElement||null;
        while(node&&node!==document.body&&node!==document.documentElement){
          try{
            const style=getComputedStyle(node);
            const createsFixedBlock=
              style.transform!=='none'||
              style.perspective!=='none'||
              style.filter!=='none'||
              style.backdropFilter!=='none'||
              style.webkitBackdropFilter!=='none'||
              String(style.contain||'').includes('paint');
            if(createsFixedBlock) return node.getBoundingClientRect().top||0;
          }catch(_){}
          node=node.parentElement;
        }
        return 0;
      }

      function positionActivityNotificationsPanel(){
        const panel=document.getElementById('homeActivityNotificationsPanel');
        const button=document.getElementById('homeActivityNotificationsButton');
        if(!panel||!button) return;
        if(window.matchMedia('(max-width:430px)').matches){
          const rect=button.getBoundingClientRect();
          const containingTop=activityFixedContainingBlockTop(panel);
          const top=Math.max(6,Math.round(rect.bottom+3-containingTop));
          panel.style.setProperty('--activity-panel-top',top+'px');
        }else{
          panel.style.removeProperty('--activity-panel-top');
        }
      }

      function setActivityNotificationsOpen(open){
        const panel=document.getElementById('homeActivityNotificationsPanel');
        const button=document.getElementById('homeActivityNotificationsButton');
        if(!panel||!button) return;
        const next=Boolean(open);
        const dashboard=document.getElementById('homeDashboard');
        clearTimeout(activityNotificationsCloseTimer);
        if(next){
          setSettingsOpen(false);
          positionActivityNotificationsPanel();
          panel.hidden=false;
          requestAnimationFrame(()=>panel.classList.add('is-open'));
        }else{
          panel.classList.remove('is-open');
          activityNotificationsCloseTimer=setTimeout(()=>{
            if(!panel.classList.contains('is-open')) panel.hidden=true;
          },230);
        }
        button.setAttribute('aria-expanded',next?'true':'false');
        dashboard?.classList.toggle('activity-notifications-open',next);
        if(next) markActivityNotificationsSeen();
      }

      function setupActivityNotifications(){
        const button=document.getElementById('homeActivityNotificationsButton');
        const panel=document.getElementById('homeActivityNotificationsPanel');
        if(!button||!panel||button.dataset.bound==='1') return;
        button.dataset.bound='1';
        button.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          setActivityNotificationsOpen(!panel.classList.contains('is-open'));
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });
        document.addEventListener('click',event=>{
          if(panel.hidden||!panel.classList.contains('is-open')) return;
          if(event.target.closest?.('#homeActivityNotifications')) return;
          setActivityNotificationsOpen(false);
        });
        document.addEventListener('keydown',event=>{
          if(event.key==='Escape') setActivityNotificationsOpen(false);
        });
        const reposition=()=>{
          if(!panel.hidden&&panel.classList.contains('is-open')) positionActivityNotificationsPanel();
        };
        window.addEventListener('resize',reposition,{passive:true});
        window.addEventListener('orientationchange',reposition,{passive:true});
        window.visualViewport?.addEventListener?.('resize',reposition,{passive:true});
        window.visualViewport?.addEventListener?.('scroll',reposition,{passive:true});
      }

      function renderActivityJournal(payload){
        renderLulu(payload?.lulu);
        const list=document.getElementById('homeActivityList');
        const empty=document.getElementById('homeActivityEmpty');
        if(!list||!empty) return;
        const items=(Array.isArray(payload?.items)?payload.items:[]).slice(0,10);
        homeDashboardState.activity=items;
        list.replaceChildren();
        empty.hidden=items.length>0;
        for(const item of items){
          const row=document.createElement(item.targetTab?'button':'div');
          if(item.targetTab){
            row.type='button';
            row.addEventListener('click',()=>{
              navigateToAppTab(String(item.targetTab||'home'),{scroll:true});
              if(item.targetTab==='products') loadProducts({silent:true});
              if(item.targetTab==='photos') loadSharedAlbum();
              if(item.targetTab==='schedule') loadWorkCalendar(currentWorkCalendarView,{silent:true});
            });
          }
          row.className='home-activity-row';
          const icon=document.createElement('span');
          icon.className='home-activity-icon';
          icon.textContent=String(item.icon||'•');
          const copy=document.createElement('span');
          copy.className='home-activity-copy';
          const textNode=document.createElement('strong');
          textNode.textContent=String(item.text||'');
          const time=document.createElement('time');
          time.textContent=activityTimeLabel(item.createdAt);
          copy.append(textNode,time);
          const arrow=document.createElement('span');
          arrow.className='home-activity-arrow';
          arrow.textContent=item.targetTab?'›':'';
          row.append(icon,copy,arrow);
          list.appendChild(row);
        }
        animateRudiCollection(list,'.home-activity-row',10);
        const panel=document.getElementById('homeActivityNotificationsPanel');
        if(panel&&!panel.hidden) markActivityNotificationsSeen();
        else updateActivityNotificationBadge();
      }

      async function loadActivityJournal({silent=false}={}){
        if(!currentActor) return null;
        try{
          const payload=await activityRequest();
          renderActivityJournal(payload);
          return payload;
        }catch(_){
          if(!silent){
            const empty=document.getElementById('homeActivityEmpty');
            if(empty&&!homeDashboardState.activity.length){
              empty.hidden=false;
              empty.textContent='Не удалось обновить события';
            }
          }
          return null;
        }
      }

      function renderHomeNew(){
        const tile=document.getElementById('homeNewTile');
        const list=document.getElementById('homeNewList');
        if(!tile||!list) return;
        list.replaceChildren();
        const entries=[];
        const feedVersion=String(homeDashboardState.feed?.version||'');
        if(feedVersion&&feedVersion!==feedSeenVersion()) entries.push({icon:'📰',text:'Новое в Ленте',tab:'feed'});
        if(homeCountIsNew('photos',homeDashboardState.photoCount)) entries.push({icon:'📷',text:'Новые фото',tab:'photos'});
        if(homeCountIsNew('wishlist',homeDashboardState.wishlistCount)) entries.push({icon:'🎁',text:'Новое желание',tab:'wishlist'});
        tile.dataset.homeEmpty=entries.length?'0':'1';
        tile.hidden=currentAppTab!=='home'||!entries.length;
        for(const entry of entries){
          const button=document.createElement('button');
          button.type='button';
          button.className='home-new-item';
          button.innerHTML='<span>'+entry.icon+'</span><strong>'+entry.text+'</strong><span class="home-new-arrow">›</span>';
          button.addEventListener('click',()=>{
            if(entry.tab==='photos') markHomeCountSeen('photos',homeDashboardState.photoCount);
            if(entry.tab==='wishlist') markHomeCountSeen('wishlist',homeDashboardState.wishlistCount);
            navigateToAppTab(entry.tab,{scroll:true});
            if(entry.tab==='feed') loadFeed({silent:true});
          });
          list.appendChild(button);
        }
      }

      function renderHomeDashboard(){
        const dashboard=document.getElementById('homeDashboard');
        if(!dashboard) return;
        const greeting=document.getElementById('homeDashboardGreeting');
        const date=document.getElementById('homeDashboardDate');
        if(greeting) greeting.textContent=homeGreeting();
        if(date) date.textContent=homeDashboardDateLabel();

        const today=document.getElementById('homeTodayRows');
        if(today){
          today.replaceChildren();
          const tasks=homeDashboardState.tasks.filter(homeTaskForActor);
          const work=homeDashboardState.workDay;
          const eventCount=homeEventRows().length;
          const rows=[
            {icon:'📅',text:tasks.length?homeTaskCountLabel(tasks.length):'Сегодня дел нет'},
            ...(work?[{icon:work.working?'💼':'🛋',text:'Диана: '+dianaWorkStatusText(work)}]:[]),
            ...(eventCount?[{icon:'🎙',text:eventCount+' '+(eventCount===1?'событие сегодня':eventCount<5?'события сегодня':'событий сегодня')}]:[]),
            ...(homeDashboardState.productCount>0?[{icon:'🛒',text:'Купить: '+homeDashboardState.productCount+' '+(homeDashboardState.productCount===1?'позиция':homeDashboardState.productCount<5?'позиции':'позиций')}]:[])
          ];
          for(const row of rows){
            const el=document.createElement('div');
            el.className='home-today-row';
            el.innerHTML='<span>'+row.icon+'</span><strong></strong>';
            el.querySelector('strong').textContent=row.text;
            today.appendChild(el);
          }
        }

        const cycle=document.getElementById('homeCycleSummary');
        if(cycle){
          const cycleModel=homeDashboardState.cycle;
          const word=dianaCycleMoodWord(cycleModel);
          const status=document.getElementById('homeCycleStatus');
          const advice=document.getElementById('homeCycleAdvice');
          const brain=document.getElementById('homeCycleBrain');
          const appetite=document.getElementById('homeCycleAppetite');
          if(status) status.textContent=word?'🌸 Диана: '+word:'';
          if(advice) advice.textContent=dianaCycleDailyAdvice(cycleModel);
          if(brain) brain.textContent=dianaCycleBrainNote(cycleModel);
          if(appetite) appetite.textContent=dianaCycleAppetiteNote(cycleModel);
          cycle.hidden=!word;
        }

        const message=document.getElementById('homeMessageNew');
        if(message) message.hidden=!partnerMessageIsNew();

        const nearest=document.getElementById('homeNearestRows');
        const nearestWrap=document.getElementById('homeNearestBlock');
        if(nearest&&nearestWrap){
          nearest.replaceChildren();
          const rows=homeNearestRows();
          nearestWrap.dataset.homeEmpty=rows.length?'0':'1';
          nearestWrap.hidden=currentAppTab!=='home'||!rows.length;
          for(const row of rows){
            const el=document.createElement('div');
            el.className='home-nearest-row';
            const time=row.time?'<time>'+row.time+'</time>':'';
            el.innerHTML='<span class="home-nearest-icon">'+row.icon+'</span><strong></strong>'+time;
            el.querySelector('strong').textContent=row.label;
            nearest.appendChild(el);
          }
        }
        renderHomeNew();
      }

      function openHomeQuickAction(action){
        if(action==='products'){
          navigateToAppTab('products',{scroll:true});
          loadProducts({silent:true}).finally(()=>setTimeout(()=>document.getElementById('productsInput')?.focus(),120));
          return;
        }
        if(action==='wishlist'){
          navigateToAppTab('wishlist',{scroll:true});
          markHomeCountSeen('wishlist',homeDashboardState.wishlistCount);
          setTimeout(()=>document.getElementById('wishlistInput')?.focus(),120);
          return;
        }
        if(action==='photos'){
          navigateToAppTab('photos',{scroll:true});
          markHomeCountSeen('photos',homeDashboardState.photoCount);
          return;
        }
        if(action==='message'){
          markPartnerMessageSeen();
          const tile=document.querySelector('[data-home-tile="partner"]');
          tile?.scrollIntoView({behavior:'smooth',block:'center'});
          setTimeout(()=>document.getElementById('partnerEditButton')?.click(),260);
        }
      }

      function setupHomeDashboardActions(){
        setupActivityNotifications();
        setupSettingsPanel();
        document.querySelectorAll('[data-home-quick]').forEach(button=>{
          if(button.dataset.bound==='1') return;
          button.dataset.bound='1';
          button.addEventListener('click',()=>openHomeQuickAction(button.dataset.homeQuick));
        });
        document.getElementById('homeMessageNew')?.addEventListener('click',()=>openHomeQuickAction('message'));
        document.getElementById('luluWalkButton')?.addEventListener('click',markLuluWalk);
        document.getElementById('homeCycleOpen')?.addEventListener('click',()=>{
          navigateToAppTab('schedule',{scroll:true});
          setTimeout(()=>document.getElementById('dianaCycleCard')?.scrollIntoView({behavior:'smooth',block:'center'}),160);
        });
      }

      function malePsychologyFactFromConfig(config,dateKey=todayState().key){
        const section=config?.malePsychology;
        const facts=Array.isArray(section?.facts)?section.facts:[];
        const startDate=/^\d{4}-\d{2}-\d{2}$/.test(String(section?.startDate||''))?String(section.startDate):'2026-09-23';
        const start=Date.parse(startDate+'T00:00:00.000Z');
        const current=Date.parse(String(dateKey||'')+'T00:00:00.000Z');
        if(!Number.isFinite(start)||!Number.isFinite(current)) return null;
        const sequence=Math.floor((current-start)/DAY)+1;
        if(sequence<1) return null;
        const fact=facts
          .map((row,index)=>({...row,sequence:Math.max(1,Math.trunc(Number(row?.sequence||index+1)))}))
          .find((row)=>row.sequence===sequence);
        if(!fact) return null;
        const sourceUrl=String(fact.sourceUrl||'').trim();
        if(!/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?$/i.test(sourceUrl)) return null;
        return {
          id:String(fact.id||'').trim(),
          sequence,
          title:String(fact.title||'').trim(),
          text:String(fact.text||'').trim(),
          sourceLabel:String(fact.sourceLabel||'PubMed').trim(),
          sourceUrl,
          dateKey:String(dateKey||''),
          disclaimer:String(section?.disclaimer||'Это данные о средних групповых закономерностях. Они не описывают каждого мужчину.')
        };
      }

      function renderMalePsychologyFact(fact){
        currentMalePsychologyFact=fact&&typeof fact==='object'?fact:null;
        const card=document.getElementById('malePsychologyFact');
        if(!card) return;
        const id=String(fact?.id||'').trim();
        const title=String(fact?.title||'').trim();
        const text=String(fact?.text||'').trim();
        const sourceUrl=String(fact?.sourceUrl||'').trim();
        if(!id||!title||!text||!/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/?$/i.test(sourceUrl)){
          card.hidden=true;
          return;
        }
        const titleNode=document.getElementById('malePsychologyFactTitle');
        const textNode=document.getElementById('malePsychologyFactText');
        const source=document.getElementById('malePsychologyFactSource');
        const disclaimer=document.getElementById('malePsychologyFactDisclaimer');
        if(titleNode) titleNode.textContent=title;
        if(textNode) textNode.textContent=text;
        if(source){
          source.href=sourceUrl;
          source.textContent=String(fact?.sourceLabel||'Открыть исследование в PubMed');
          if(source.dataset.bound!=='1'){
            source.dataset.bound='1';
            source.addEventListener('click',event=>{
              if(!tg?.openLink) return;
              event.preventDefault();
              try{tg.openLink(source.href)}catch(_){window.open(source.href,'_blank','noopener,noreferrer')}
            });
          }
        }
        if(disclaimer) disclaimer.textContent=String(fact?.disclaimer||'Это средняя групповая закономерность, а не описание каждого мужчины.');
        card.dataset.factId=id;
        card.hidden=false;
        restartRudiMotion(card,'rudi-data-refresh',360);
      }

      let malePsychologyLoadPromise=null;
      async function loadMalePsychologyFact(){
        if(!currentActor) return null;
        if(malePsychologyLoadPromise) return malePsychologyLoadPromise;
        malePsychologyLoadPromise=(async()=>{
          try{
            const config=await loadConfig();
            currentConfig=config;
            const fact=malePsychologyFactFromConfig(config);
            renderMalePsychologyFact(fact);
            return fact;
          }catch(error){
            console.warn('RUDI_MALE_PSYCHOLOGY_UI_WARN',String(error?.message||error));
            return null;
          }finally{
            malePsychologyLoadPromise=null;
          }
        })();
        return malePsychologyLoadPromise;
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

        const rustamPerson=currentActor==='Рустам'?selfPerson:partnerPerson;
        const rustamRhythm=document.createElement('div');
        rustamRhythm.id='rustamRhythmStatus';
        rustamRhythm.className='profile-rhythm-status';
        rustamPerson.appendChild(rustamRhythm);

        const dianaPerson=currentActor==='Диана'?selfPerson:partnerPerson;
        const dianaCycleMood=document.createElement('div');
        dianaCycleMood.id='dianaCycleMood';
        dianaCycleMood.className='profile-cycle-mood';
        dianaCycleMood.hidden=true;
        dianaPerson.appendChild(dianaCycleMood);

        selfIdentity.appendChild(selfMood);
        partnerIdentity.replaceChildren(partnerAvatar,partnerPerson,partnerMood);

        profile.id='homeDashboard';
        profile.className='home-dashboard home-dashboard-summary';
        profile.dataset.homeTile='dashboard';
        profile.setAttribute('aria-label','Главная сводка');
        dateHeading.id='homeDashboardDate';
        dateHeading.className='home-dashboard-date';

        const top=document.createElement('div');
        top.className='home-dashboard-head';
        const greeting=document.createElement('h1');
        greeting.id='homeDashboardGreeting';
        greeting.className='home-dashboard-greeting';

        const tools=document.createElement('div');
        tools.className='home-dashboard-tools';

        const notifications=document.createElement('div');
        notifications.id='homeActivityNotifications';
        notifications.className='home-activity-notifications';
        notifications.innerHTML=
          '<button id="homeActivityNotificationsButton" class="home-activity-notifications-button" type="button" aria-label="Что нового произошло" aria-expanded="false">'+
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>'+
            '<span id="homeActivityNotificationDot" class="home-activity-notification-dot" hidden></span>'+
          '</button>'+
          '<div id="homeActivityNotificationsPanel" class="home-activity-notifications-panel" hidden>'+
            '<div class="home-activity-notifications-title">Что произошло у нас</div>'+
            '<div id="homeActivityList" class="home-activity-list" aria-live="polite"></div>'+
            '<div id="homeActivityEmpty" class="home-activity-empty">Пока здесь тихо — новые события появятся автоматически.</div>'+
          '</div>';

        const settings=document.createElement('div');
        settings.id='homeSettings';
        settings.className='home-settings';
        settings.innerHTML=
          '<button id="homeSettingsButton" class="home-settings-button" type="button" aria-label="Настройки" aria-expanded="false">'+
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.1A1.7 1.7 0 0 0 15 4.2a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z"/></svg>'+
          '</button>'+
          '<div id="homeSettingsPanel" class="home-settings-panel" hidden>'+
            '<div class="home-settings-title">Настройки</div>'+

            '<section class="settings-group">'+
              '<div class="settings-group-title">Интерфейс</div>'+
              '<div class="home-settings-row home-settings-theme-row">'+
                '<div class="home-settings-copy"><strong>Тема</strong><small>Вид приложения</small></div>'+
                '<div class="settings-theme-options" role="group" aria-label="Тема приложения">'+
                  '<button class="settings-theme-option" type="button" data-theme-mode="system" aria-pressed="true">Авто</button>'+
                  '<button class="settings-theme-option" type="button" data-theme-mode="light" aria-pressed="false">Светлая</button>'+
                  '<button class="settings-theme-option" type="button" data-theme-mode="dark" aria-pressed="false">Тёмная</button>'+
                '</div>'+
              '</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong>Анимации</strong><small>Переходы и эффекты</small></div>'+
                '<button id="settingsMotionToggle" class="market-ticker-toggle" type="button" role="switch" aria-checked="true" aria-label="Анимации"><span class="market-ticker-toggle-thumb" aria-hidden="true"></span></button>'+
              '</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong>Размер текста</strong><small>Мелкий, обычный или крупный</small></div>'+
                '<div class="settings-segmented settings-text-size">'+
                  '<button type="button" data-text-size="small" aria-pressed="false">A−</button>'+
                  '<button type="button" data-text-size="normal" aria-pressed="true">A</button>'+
                  '<button type="button" data-text-size="large" aria-pressed="false">A+</button>'+
                '</div>'+
              '</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong>Курсы</strong><small>Показывать на главной</small></div>'+
                '<button id="marketTickerToggle" class="market-ticker-toggle" type="button" role="switch" aria-checked="true" aria-label="Показывать курсы"><span class="market-ticker-toggle-thumb" aria-hidden="true"></span></button>'+
              '</div>'+
            '</section>'+

            '<section class="settings-group">'+
              '<div class="settings-group-title">Данные</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong id="settingsSyncStatus">Синхронизация работает</strong><small id="settingsLastUpdated">Последнее обновление: —</small></div>'+
                '<span id="settingsNetworkStatus" class="settings-status-pill">Онлайн</span>'+
              '</div>'+
            '</section>'+

            '<section class="settings-group">'+
              '<div class="settings-group-title">О приложении</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong>Версия</strong><small>Текущая сборка RUDI</small></div>'+
                '<span id="settingsAppVersion" class="home-settings-version"></span>'+
              '</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong>PWA</strong><small id="settingsPwaStatus">Добавить на устройство</small></div>'+
                '<button id="settingsPwaInstall" class="settings-pwa-install" type="button">Установить</button>'+
              '</div>'+
              '<div class="home-settings-row">'+
                '<div class="home-settings-copy"><strong>Режим</strong><small>Как запущено приложение</small></div>'+
                '<span id="settingsRuntimeMode" class="home-settings-version">—</span>'+
              '</div>'+
            '</section>'+
          '</div>';

        tools.append(notifications,settings);
        top.append(greeting,tools,dateHeading);

        const messageNew=document.createElement('button');
        messageNew.id='homeMessageNew';
        messageNew.className='home-message-new';
        messageNew.type='button';
        messageNew.textContent='💌 Новое послание';
        messageNew.hidden=true;
        profile.replaceChildren(top,messageNew);

        const cycleSummary=document.createElement('div');
        cycleSummary.id='homeCycleSummary';
        cycleSummary.className='home-cycle-summary';
        cycleSummary.hidden=true;
        const cycleStatus=document.createElement('div');
        cycleStatus.id='homeCycleStatus';
        cycleStatus.className='home-cycle-status';
        const cycleAdvice=document.createElement('div');
        cycleAdvice.id='homeCycleAdvice';
        cycleAdvice.className='home-cycle-advice';
        const cycleBrain=document.createElement('div');
        cycleBrain.id='homeCycleBrain';
        cycleBrain.className='home-cycle-insight';
        const cycleAppetite=document.createElement('div');
        cycleAppetite.id='homeCycleAppetite';
        cycleAppetite.className='home-cycle-insight';
        const cycleOpen=document.createElement('button');
        cycleOpen.id='homeCycleOpen';
        cycleOpen.className='home-cycle-open';
        cycleOpen.type='button';
        cycleOpen.textContent='Показать полностью';
        cycleSummary.append(cycleStatus,cycleAdvice,cycleBrain,cycleAppetite,cycleOpen);

        const makePersonTile=(actor,identity)=>{
          const tile=document.createElement('section');
          const slug=actor==='Диана'?'diana':'rustam';
          tile.id=actor==='Диана'?'homeDianaTile':'homeRustamTile';
          tile.className='panel profile-person-card profile-'+slug+'-card';
          tile.dataset.appTabSection='home';
          tile.dataset.homeTile=slug;
          tile.setAttribute('aria-label',actor);

          const head=document.createElement('div');
          head.className='profile-person-head';
          head.appendChild(identity);
          tile.appendChild(head);

          const details=document.createElement('div');
          details.id=actor==='Диана'?'homeDianaDetails':'homeRustamDetails';
          details.className='profile-person-details';
          tile.appendChild(details);
          return {tile,details};
        };

        const selfActor=currentActor==='Диана'?'Диана':'Рустам';
        const partnerActor=selfActor==='Диана'?'Рустам':'Диана';
        const selfCard=makePersonTile(selfActor,selfIdentity);
        const partnerCard=makePersonTile(partnerActor,partnerIdentity);
        const rustamCard=selfActor==='Рустам'?selfCard:partnerCard;
        const dianaCard=selfActor==='Диана'?selfCard:partnerCard;

        const rhythmAdvice=document.createElement('div');
        rhythmAdvice.id='rustamRhythmAdvice';
        rhythmAdvice.className='rustam-rhythm-advice';
        const currentRhythm=rustamRhythmStatus();
        const currentRecommendation=rustamRhythmRecommendation(currentRhythm);
        rhythmAdvice.textContent=currentRecommendation?'Сейчас лучше: '+currentRecommendation:'';
        rhythmAdvice.hidden=!currentRecommendation;
        rustamCard.details.appendChild(rhythmAdvice);

        const maleFact=document.createElement('article');
        maleFact.id='malePsychologyFact';
        maleFact.className='male-psychology-fact';
        maleFact.hidden=true;
        maleFact.innerHTML=
          '<div class="male-psychology-fact-kicker"><span aria-hidden="true">🧠</span> Научный факт дня</div>'+
          '<strong id="malePsychologyFactTitle" class="male-psychology-fact-title"></strong>'+
          '<div id="malePsychologyFactText" class="male-psychology-fact-text"></div>'+
          '<a id="malePsychologyFactSource" class="male-psychology-fact-source" href="#" target="_blank" rel="noopener noreferrer"></a>'+
          '<div id="malePsychologyFactDisclaimer" class="male-psychology-fact-disclaimer"></div>';
        rustamCard.details.appendChild(maleFact);
        renderMalePsychologyFact(currentMalePsychologyFact);

        dianaCard.details.appendChild(cycleSummary);
        if(moodPrompt){
          moodPrompt.hidden=true;
          (selfActor==='Диана'?dianaCard.details:rustamCard.details).appendChild(moodPrompt);
        }
        if(moodMessage){
          const ownCard=selfActor==='Диана'?dianaCard:rustamCard;
          ownCard.tile.insertBefore(moodMessage,ownCard.details);
        }

        const luluTile=document.createElement('section');
        luluTile.id='homeLuluTile';
        luluTile.className='panel lulu-card';
        luluTile.dataset.appTabSection='home';
        luluTile.dataset.homeTile='lulu';
        luluTile.setAttribute('aria-label','Lulu');
        luluTile.innerHTML=
          '<div class="lulu-head">'+
            '<div class="lulu-identity">'+
              '<img class="lulu-avatar" src="/lulu-card.webp?v=1.9.6" alt="Lulu" width="58" height="58">'+
              '<div class="lulu-copy"><h2>Lulu</h2><div id="luluWalkStatus" class="lulu-walk-status">Прогулка · пока не отмечена</div></div>'+
            '</div>'+
            '<button id="luluWalkButton" class="lulu-walk-button" type="button" aria-label="Отметить прогулку" title="Отметить прогулку">'+
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 10.2c1.1 0 2-1.2 2-2.7s-.9-2.7-2-2.7-2 1.2-2 2.7.9 2.7 2 2.7ZM15.5 10.2c1.1 0 2-1.2 2-2.7s-.9-2.7-2-2.7-2 1.2-2 2.7.9 2.7 2 2.7ZM5.2 14.2c1 0 1.8-1 1.8-2.3s-.8-2.3-1.8-2.3-1.8 1-1.8 2.3.8 2.3 1.8 2.3ZM18.8 14.2c1 0 1.8-1 1.8-2.3s-.8-2.3-1.8-2.3-1.8 1-1.8 2.3.8 2.3 1.8 2.3Z"/><path d="M12 11.2c-2.7 0-5.2 2.4-5.2 4.9 0 1.8 1.4 3.1 3.2 3.1.8 0 1.4-.4 2-.4s1.2.4 2 .4c1.8 0 3.2-1.3 3.2-3.1 0-2.5-2.5-4.9-5.2-4.9Z"/></svg>'+
            '</button>'+
          '</div>';

        const nearest=document.createElement('section');
        nearest.id='homeNearestBlock';
        nearest.className='panel home-nearest-tile';
        nearest.dataset.appTabSection='home';
        nearest.dataset.homeTile='nearest';
        nearest.hidden=true;
        nearest.innerHTML=
          '<div class="home-nearest-head"><div class="home-nearest-title">Ближайшее</div></div>'+
          '<div id="homeNearestRows" class="home-nearest-rows"></div>';

        profile.after(selfCard.tile,partnerCard.tile,luluTile,nearest);

        const newTile=document.createElement('section');
        newTile.id='homeNewTile';
        newTile.className='panel home-new-tile';
        newTile.dataset.appTabSection='home';
        newTile.dataset.homeTile='new';
        newTile.hidden=true;
        newTile.innerHTML='<div class="home-dashboard-label">Новое в RUDI</div><div id="homeNewList" class="home-new-list"></div>';
        document.getElementById('dianaCycleCard')?.after(newTile);

        document.body.dataset.profileSplitReady='1';
        syncStaticProfileWorkStatus();
        setupHomeDashboardActions();
        renderHomeDashboard();
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
          markUiPreferencesChanged();
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
        if(host.classList.contains('car-head')){
          const copy=host.querySelector('.car-head-copy');
          const title=copy?.querySelector('h2');
          if(copy&&title){
            let row=copy.querySelector('.car-head-title-row');
            if(!row){
              row=document.createElement('div');
              row.className='car-head-title-row';
              title.parentNode.insertBefore(row,title);
              row.appendChild(title);
            }
            row.appendChild(button);
            return;
          }
        }
        if(host.classList.contains('section-heading')||host.classList.contains('partner-head')||host.classList.contains('smart-home-head')){
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
        section.dataset.collapseKey=key;
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
          selector:'#homeRustamTile',key:'profile-rustam',
          bodySelectors:['#homeRustamDetails'],
          hostSelector:'.profile-person-head'
        });
        setupPersistentCollapsible({
          selector:'#homeDianaTile',key:'profile-diana',
          bodySelectors:['#homeDianaDetails'],
          hostSelector:'.profile-person-head'
        });
        setupPersistentCollapsible({
          selector:'#homeNearestBlock',key:'nearest',
          bodySelectors:['#homeNearestRows'],
          hostSelector:'.home-nearest-head'
        });
        setupPersistentCollapsible({
          selector:'#dianaCycleCard',key:'diana-cycle',
          bodySelectors:['#dianaCycleBody'],
          hostSelector:'.cycle-head'
        });
        setupPersistentCollapsible({
          selector:'#smartHomeTile',key:'smart-home',
          bodySelectors:['#smartHomeStatus','#smartHomeRooms','#smartHomeScenarios'],
          hostSelector:'.smart-home-head'
        });
        setupPersistentCollapsible({
          selector:'#carTile',key:'car',
          bodySelectors:['#carBody'],
          hostSelector:'.car-head'
        });
        setupPersistentCollapsible({
          selector:'#workCalendarCard',key:'calendar-work',
          bodySelectors:['#workCalendarStatus','#workCalendarRanges','#workCalendarDays','#workCalendarSelected'],
          hostSelector:'.work-calendar-head'
        });
        setupPersistentCollapsible({
          selector:'#productsListCard',key:'kitchen-products',
          bodySelectors:['#productsListBody'],
          hostSelector:'.kitchen-block-head'
        });
        setupPersistentCollapsible({
          selector:'#recipeIdeasCard',key:'kitchen-recipes',
          bodySelectors:['#recipeGeneratorBody'],
          hostSelector:'.kitchen-block-head'
        });
      }

      const fallback = {
        weather:{enabled:true,city:'Санкт-Петербург',latitude:59.9386,longitude:30.3141,timezone:TZ},
        birthdays:[
          {id:'rustam',name:'Рустам',year:1992,month:3,day:3},
          {id:'diana',name:'Диана',year:1996,month:6,day:30}
        ],
        importantDates:[{id:'new-year',title:'Новый год',month:1,day:1,recurring:true}],
        cookList:['Паста карбонара','Шакшука','Курица терияки с рисом','Сырники'],
        compliments:{
          male:['Сегодня ты выглядишь особенно уверенно.','У тебя отличный настрой — это чувствуется.','Сегодня определённо твой день.'],
          female:['Сегодня ты особенно прекрасно выглядишь.','У тебя очень приятная энергия сегодня.','Сегодня определённо твой день.'],
          neutral:['Сегодня отличный день, чтобы сделать что-то приятное для себя.','Пусть сегодняшний день приятно удивит.'],
          surpriseChance:.12,
          surprises:['Сегодня можно нарушить привычный сценарий и сделать что-нибудь неожиданно приятное.']
        },
        moodMessages:{
          sadness:[
            'Сегодня можно быть не в ресурсе. Не требуй от себя лишнего и выбери что-нибудь простое.',
            'Если грустно, не обязательно срочно это исправлять. Дай себе немного спокойствия.'
          ],
          fear:[
            'Страх часто просит ясности. Отдели то, что реально происходит, от того, что пока только может случиться.',
            'Сделай один маленький понятный шаг. Когда появляется действие, тревоги обычно становится меньше.'
          ],
          anger:[
            'Если злишься, не спеши действовать на пике эмоции. Сначала дай себе немного времени.',
            'Гнев показывает, что что-то задело важную границу. Разберись, что именно хочется изменить.'
          ],
          joy:[
            'Вот это настрой! Сохрани его — сегодня у тебя есть хороший разгон.',
            'Хорошее настроение стоит использовать: сделай сегодня что-нибудь, что давно хотелось.'
          ],
          love:[
            'Тёплое настроение — отличный повод показать близким, что они тебе важны.',
            'Если сегодня много любви, не держи её внутри. Небольшой тёплый жест запомнится сильнее слов.'
          ]
        }
      };

      function resolvedSystemTheme(){
        const telegramOpen=Boolean(tg?.initData);
        if(telegramOpen&&(tg?.colorScheme==='dark'||tg?.colorScheme==='light')) return tg.colorScheme;
        return media.matches?'dark':'light';
      }

      function updateThemeSettingControls(){
        const mode=currentThemeMode();
        document.querySelectorAll('[data-theme-mode]').forEach(button=>{
          const active=button.dataset.themeMode===mode;
          button.classList.toggle('active',active);
          button.setAttribute('aria-pressed',active?'true':'false');
        });
      }

      function applyTheme(){
        const telegramOpen=Boolean(tg?.initData);
        const mode=currentThemeMode();
        const theme=mode==='system'?resolvedSystemTheme():mode;
        root.dataset.theme=theme;
        root.dataset.themeMode=mode;
        root.style.colorScheme=theme;
        metaTheme?.setAttribute('content',theme==='dark'?'#0b0d12':'#f4f5f7');
        updateThemeSettingControls();
        if(!telegramOpen) return;
        try{
          tg?.setHeaderColor?.(theme==='dark'?'#0b0d12':'#f4f5f7');
          tg?.setBackgroundColor?.(theme==='dark'?'#0b0d12':'#f4f5f7');
          tg?.setBottomBarColor?.(theme==='dark'?'#0b0d12':'#f4f5f7');
        }catch(_){}
      }

      function setThemeMode(mode,{persist=true}={}){
        const next=['system','light','dark'].includes(String(mode||''))?String(mode):'system';
        if(currentActor){
          try{localStorage.setItem(themeModeStorageKey(),next)}catch(_){}
        }
        applyTheme();
        if(persist&&currentActor) markUiPreferencesChanged();
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      function setupThemeSetting(){
        document.querySelectorAll('[data-theme-mode]').forEach(button=>{
          if(button.dataset.themeBound==='1') return;
          button.dataset.themeBound='1';
          button.addEventListener('click',()=>setThemeMode(button.dataset.themeMode));
        });
        updateThemeSettingControls();
      }

      function applyInterfacePreferences(){
        document.body.dataset.uiMotion=interfaceMotionEnabled()?'on':'off';
        document.documentElement.dataset.textSize=currentInterfaceTextSize();
        updateInterfaceSettingsUi();
      }

      function updateInterfaceSettingsUi(){
        const textSize=currentInterfaceTextSize();
        document.querySelectorAll('[data-text-size]').forEach(button=>{
          const active=button.dataset.textSize===textSize;
          button.classList.toggle('active',active);
          button.setAttribute('aria-pressed',active?'true':'false');
        });
        const motion=document.getElementById('settingsMotionToggle');
        if(motion) motion.setAttribute('aria-checked',interfaceMotionEnabled()?'true':'false');
      }

      function setInterfaceMotion(enabled){
        try{localStorage.setItem(interfaceMotionStorageKey(),enabled?'1':'0')}catch(_){}
        applyInterfacePreferences();
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      function setInterfaceTextSize(value){
        const next=['small','normal','large'].includes(String(value||''))?String(value):'normal';
        try{localStorage.setItem(interfaceTextSizeStorageKey(),next)}catch(_){}
        applyInterfacePreferences();
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      function updateAutoRefreshUi(){
        const toggle=document.getElementById('settingsAutoRefreshToggle');
        if(toggle) toggle.setAttribute('aria-checked',autoRefreshEnabled()?'true':'false');
      }

      function setAutoRefreshEnabled(enabled){
        try{localStorage.setItem(autoRefreshStorageKey(),enabled?'1':'0')}catch(_){}
        updateAutoRefreshUi();
        try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }

      function formatLastDataSync(){
        const parsed=new Date(lastDataSyncAt());
        if(Number.isNaN(parsed.getTime())) return 'ещё не обновлялось';
        return new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(parsed);
      }

      function updateDataSettingsUi(){
        const status=document.getElementById('settingsSyncStatus');
        const updated=document.getElementById('settingsLastUpdated');
        const network=document.getElementById('settingsNetworkStatus');
        if(status) status.textContent=navigator.onLine===false?'Офлайн':'Синхронизация работает';
        if(updated) updated.textContent='Последнее обновление: '+formatLastDataSync();
        if(network) network.textContent=navigator.onLine===false?'Нет сети':'Онлайн';
      }

      function updateAboutSettingsUi(){
        const mode=document.getElementById('settingsRuntimeMode');
        if(mode) mode.textContent=isStandalonePwa()?'PWA':(tg?.initData?'Telegram':'Браузер');
        updateSettingsVersion();
        updatePwaInstallUi();
      }

      async function refreshAppDataNow(){
        const button=document.getElementById('settingsRefreshNow');
        const original=button?.textContent||'Обновить сейчас';
        if(button){button.disabled=true;button.textContent='Обновляю…'}
        try{
          manualRefreshRequested=true;
          await refreshAfterResume();
          await Promise.allSettled([
            window.RUDI_CAR?.refresh?.(),
            window.RUDI_SMART_HOME?.refresh?.(),
            window.RUDI_SAVES?.load?.(),
            (currentConfig?.weather?loadWeather(currentConfig.weather):Promise.resolve())
          ]);
          markDataSyncNow();
          if(button) button.textContent='Обновлено';
          setTimeout(()=>{if(button&&button.textContent==='Обновлено') button.textContent=original},900);
        }finally{
          if(button) button.disabled=false;
        }
      }

      function setupExtendedSettings(){
        document.querySelectorAll('[data-text-size]').forEach(button=>{
          if(button.dataset.bound==='1') return;
          button.dataset.bound='1';
          button.addEventListener('click',()=>setInterfaceTextSize(button.dataset.textSize));
        });
        const motion=document.getElementById('settingsMotionToggle');
        if(motion&&motion.dataset.bound!=='1'){
          motion.dataset.bound='1';
          motion.addEventListener('click',()=>setInterfaceMotion(!interfaceMotionEnabled()));
        }
        const auto=document.getElementById('settingsAutoRefreshToggle');
        if(auto&&auto.dataset.bound!=='1'){
          auto.dataset.bound='1';
          auto.addEventListener('click',()=>setAutoRefreshEnabled(!autoRefreshEnabled()));
        }
        const refresh=document.getElementById('settingsRefreshNow');
        if(refresh&&refresh.dataset.bound!=='1'){
          refresh.dataset.bound='1';
          refresh.addEventListener('click',refreshAppDataNow);
        }
        updateAutoRefreshUi();
        applyInterfacePreferences();
        updateDataSettingsUi();
        updateAboutSettingsUi();
      }

      function isStandalonePwa(){
        return Boolean(
          window.matchMedia?.('(display-mode: standalone)')?.matches
          || window.navigator?.standalone===true
        );
      }

      function appVersionLabel(){
        return String(document.querySelector('meta[name="rudi-version"]')?.getAttribute('content')||'').trim();
      }

      function updatePwaInstallUi(){
        const button=document.getElementById('settingsPwaInstall');
        const status=document.getElementById('settingsPwaStatus');
        if(!button||!status) return;
        if(isStandalonePwa()){
          button.disabled=true;
          status.textContent='Установлено';
          return;
        }
        button.disabled=false;
        if(deferredPwaInstallPrompt) status.textContent='Можно установить';
        else if(/iphone|ipad|ipod/i.test(navigator.userAgent||'')) status.textContent='Через «Поделиться»';
        else status.textContent='Добавить на устройство';
      }

      async function installPwa(){
        if(isStandalonePwa()){
          updatePwaInstallUi();
          return;
        }
        if(deferredPwaInstallPrompt){
          const prompt=deferredPwaInstallPrompt;
          deferredPwaInstallPrompt=null;
          try{
            await prompt.prompt();
            await prompt.userChoice;
          }catch(_){}
          updatePwaInstallUi();
          return;
        }
        const ios=/iphone|ipad|ipod/i.test(navigator.userAgent||'');
        const message=ios
          ?'В Safari нажмите «Поделиться» → «На экран Домой».'
          :(tg?.initData
            ?'Откройте RUDI в обычном браузере и выберите установку приложения.'
            :'В меню браузера выберите «Установить приложение» или «Добавить на главный экран».');
        try{tg?.showAlert?.(message)}catch(_){}
        if(!tg?.showAlert) window.alert(message);
      }

      function setupBrowserPullToRefresh(){
        if(tg?.initData||!('ontouchstart' in window)) return;
        if(document.querySelector('.pull-refresh-indicator')) return;

        const indicator=document.createElement('div');
        indicator.className='pull-refresh-indicator';
        indicator.setAttribute('aria-hidden','true');
        indicator.innerHTML='<span class="pull-refresh-spinner" aria-hidden="true"></span><span class="pull-refresh-label">Потяните для обновления</span>';
        document.body.appendChild(indicator);

        const label=indicator.querySelector('.pull-refresh-label');
        const standalone=isStandalonePwa();
        const threshold=standalone?120:180;
        const topTolerance=standalone?8:2;
        const maxDistance=142;
        let startY=0;
        let distance=0;
        let tracking=false;
        let armed=false;
        let refreshing=false;

        const scrollTop=()=>Math.max(
          Number(window.scrollY||0),
          Number(document.scrollingElement?.scrollTop||0),
          Number(document.documentElement?.scrollTop||0),
          Number(document.body?.scrollTop||0)
        );

        const reset=()=>{
          tracking=false;
          armed=false;
          distance=0;
          indicator.classList.remove('is-visible','is-armed','is-refreshing','is-done');
          indicator.style.setProperty('--pull-distance','0px');
          if(label) label.textContent='Потяните для обновления';
        };

        document.addEventListener('touchstart',event=>{
          if(refreshing||!appAccessReady||!currentActor||event.touches?.length!==1||scrollTop()>topTolerance) return;
          if(event.target?.closest?.('.voice-assistant-panel,[data-no-pull-refresh="true"]')) return;
          if(event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
          startY=event.touches[0].clientY;
          distance=0;
          tracking=true;
          armed=false;
        },{passive:false,capture:true});

        document.addEventListener('touchmove',event=>{
          if(!tracking||refreshing||event.touches?.length!==1) return;
          if(event.target?.closest?.('.voice-assistant-panel,[data-no-pull-refresh="true"]')){reset();return}
          if(scrollTop()>topTolerance){reset();return}
          const delta=event.touches[0].clientY-startY;
          if(delta<=0){reset();return}

          const resisted=Math.min(maxDistance,Math.max(0,delta*.58));
          distance=resisted;
          armed=delta>=threshold;
          indicator.style.setProperty('--pull-distance',resisted.toFixed(1)+'px');
          indicator.classList.toggle('is-visible',delta>12);
          indicator.classList.toggle('is-armed',armed);
          if(label) label.textContent=armed?'Отпустите для обновления':'Потяните для обновления';
          if(delta>14) event.preventDefault();
        },{passive:false,capture:true});

        const finish=()=>{
          if(!tracking||refreshing) return;
          if(!armed){reset();return}
          tracking=false;
          refreshing=true;
          indicator.classList.add('is-visible','is-refreshing');
          indicator.classList.remove('is-armed');
          indicator.style.setProperty('--pull-distance','72px');
          if(label) label.textContent='Обновляю…';
          const startedAt=Date.now();
          manualRefreshRequested=true;
          Promise.allSettled([
            Promise.resolve(refreshAfterResume()),
            Promise.resolve(window.rudiRequestPwaUpdate?.())
          ])
            .then(()=>{
              const delay=Math.max(0,420-(Date.now()-startedAt));
              setTimeout(()=>{
                if(label) label.textContent='Обновлено';
                indicator.classList.remove('is-refreshing');
                indicator.classList.add('is-done');
                setTimeout(()=>{
                  refreshing=false;
                  reset();
                },220);
              },delay);
            })
            .catch(()=>{
              if(label) label.textContent='Не удалось обновить';
              setTimeout(()=>{
                refreshing=false;
                reset();
              },900);
            });
        };

        document.addEventListener('touchend',finish,{passive:true,capture:true});
        document.addEventListener('touchcancel',()=>{if(!refreshing) reset()},{passive:true,capture:true});
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

      function telegramInitData(){
        return String(tg?.initData||'');
      }

      function clearAuthGateForm(){
        document.querySelector('.rudi-auth-form')?.remove();
      }

      function setAuthGate(title,text,mode='auth-login'){
        document.body.classList.remove('auth-pending','auth-ok','auth-denied','auth-login');
        document.body.classList.add(mode);
        document.getElementById('appGateTitle').textContent=title;
        const gateText=document.getElementById('appGateText');
        if(gateText){
          gateText.textContent=String(text||'');
          gateText.hidden=!String(text||'').trim();
        }
        clearAuthGateForm();
      }

      function denyApp(title,text){
        setAuthGate(title,text,'auth-denied');
      }

      function showAuthenticatedApp(){
        if(!currentActor||!appAccessReady) return false;
        document.body.classList.remove('auth-pending','auth-denied','auth-login');
        document.body.classList.add('auth-ok');
        return true;
      }

      function setLoadingGate(){
        document.body.classList.remove('auth-pending','auth-ok','auth-denied','auth-login');
        document.body.classList.add('auth-pending');
        const title=document.getElementById('appGateTitle');
        const text=document.getElementById('appGateText');
        if(title) title.textContent='Загружаю';
        if(text){
          text.textContent='';
          text.hidden=true;
        }
        clearAuthGateForm();
      }

      async function browserAuthRequest(operation,payload={}){
        const response=await fetchWithTimeout('/api/partner-message?rudiAction=browser-auth',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({operation,initData:telegramInitData(),backupToken:currentStateBackupToken,...payload}),
          cache:'no-store'
        },8000);
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok){
          const error=new Error(data.error||('browser-auth-'+response.status));
          error.status=response.status;
          throw error;
        }
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        return data;
      }

      let lastBrowserAuthMethod='';

      function passkeySupported(){
        return Boolean(
          window.isSecureContext
          && window.PublicKeyCredential
          && navigator?.credentials?.create
          && navigator?.credentials?.get
        );
      }

      async function passkeyRequest(operation,payload={}){
        const response=await fetchWithTimeout('/api/partner-message?rudiAction=passkey',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({operation,initData:telegramInitData(),backupToken:currentStateBackupToken,...payload}),
          cache:'no-store'
        },12000);
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok){
          const error=new Error(data.error||('passkey-'+response.status));
          error.status=response.status;
          throw error;
        }
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        return data;
      }

      function base64UrlToBytes(value){
        const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
        const padded=text+'='.repeat((4-text.length%4)%4);
        const binary=atob(padded);
        const bytes=new Uint8Array(binary.length);
        for(let index=0;index<binary.length;index++) bytes[index]=binary.charCodeAt(index);
        return bytes;
      }

      function bytesToBase64Url(value){
        if(value==null) return null;
        const bytes=value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : ArrayBuffer.isView(value)
            ? new Uint8Array(value.buffer,value.byteOffset,value.byteLength)
            : new Uint8Array(value);
        let binary='';
        for(let index=0;index<bytes.length;index++) binary+=String.fromCharCode(bytes[index]);
        return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      }

      function creationOptionsFromJson(value){
        if(typeof window.PublicKeyCredential?.parseCreationOptionsFromJSON==='function'){
          return window.PublicKeyCredential.parseCreationOptionsFromJSON(value||{});
        }
        const options={...(value||{})};
        options.challenge=base64UrlToBytes(options.challenge);
        if(options.user) options.user={...options.user,id:base64UrlToBytes(options.user.id)};
        if(Array.isArray(options.excludeCredentials)){
          options.excludeCredentials=options.excludeCredentials.map(row=>({...row,id:base64UrlToBytes(row.id)}));
        }
        return options;
      }

      function requestOptionsFromJson(value){
        if(typeof window.PublicKeyCredential?.parseRequestOptionsFromJSON==='function'){
          return window.PublicKeyCredential.parseRequestOptionsFromJSON(value||{});
        }
        const options={...(value||{})};
        options.challenge=base64UrlToBytes(options.challenge);
        if(Array.isArray(options.allowCredentials)){
          options.allowCredentials=options.allowCredentials.map(row=>({...row,id:base64UrlToBytes(row.id)}));
        }
        return options;
      }

      function credentialJson(credential){
        const response=credential?.response;
        const result={
          id:String(credential?.id||''),
          rawId:bytesToBase64Url(credential?.rawId),
          type:String(credential?.type||'public-key'),
          authenticatorAttachment:credential?.authenticatorAttachment||undefined,
          clientExtensionResults:credential?.getClientExtensionResults?.()||{},
          response:{
            clientDataJSON:bytesToBase64Url(response?.clientDataJSON)
          }
        };
        if(response?.attestationObject){
          result.response.attestationObject=bytesToBase64Url(response.attestationObject);
          if(typeof response.getTransports==='function') result.response.transports=response.getTransports();
          if(typeof response.getPublicKeyAlgorithm==='function') result.response.publicKeyAlgorithm=response.getPublicKeyAlgorithm();
          if(typeof response.getPublicKey==='function'){
            const publicKey=response.getPublicKey();
            if(publicKey) result.response.publicKey=bytesToBase64Url(publicKey);
          }
        }else{
          result.response.authenticatorData=bytesToBase64Url(response?.authenticatorData);
          result.response.signature=bytesToBase64Url(response?.signature);
          result.response.userHandle=response?.userHandle?bytesToBase64Url(response.userHandle):null;
        }
        return result;
      }

      async function prepareFaceIdRegistration(){
        if(!passkeySupported()) throw new Error('rudi-passkey-browser-unsupported');
        const setup=await passkeyRequest('register-options');
        return {setup,publicKey:creationOptionsFromJson(setup.publicKey)};
      }

      async function finishFaceIdRegistration(prepared,credentialPromise){
        const credential=await credentialPromise;
        if(!credential) throw new Error('rudi-passkey-cancelled');
        await passkeyRequest('register-verify',{
          challenge:prepared.setup.publicKey.challenge,
          response:credentialJson(credential)
        });
        return true;
      }

      async function prepareFaceIdAuthentication(){
        if(!passkeySupported()) throw new Error('rudi-passkey-browser-unsupported');
        const setup=await passkeyRequest('auth-options');
        return {setup,publicKey:requestOptionsFromJson(setup.publicKey)};
      }

      async function finishFaceIdAuthentication(prepared,credentialPromise){
        const credential=await credentialPromise;
        if(!credential) throw new Error('rudi-passkey-cancelled');
        const verified=await passkeyRequest('auth-verify',{
          challenge:prepared.setup.publicKey.challenge,
          response:credentialJson(credential)
        });
        return String(verified.actor||'');
      }

      async function faceIdConfigured(){
        if(!passkeySupported()||!currentActor) return false;
        try{
          const status=await passkeyRequest('status');
          return Boolean(status.configured);
        }catch(_){
          return false;
        }
      }

      function showFaceIdSetup(){
        return new Promise(resolve=>{
          if(!passkeySupported()) return resolve(false);
          setAuthGate('Включить Face ID?','После этого в Safari можно будет входить без PIN.');
          const form=document.createElement('div');
          form.className='rudi-auth-form';
          const button=document.createElement('button');
          button.className='rudi-auth-submit rudi-auth-faceid';
          button.type='button';
          button.textContent='Готовим Face ID…';
          button.disabled=true;
          const skip=document.createElement('button');
          skip.className='rudi-auth-secondary';
          skip.type='button';
          skip.textContent='Не сейчас';
          const status=document.createElement('div');
          status.className='rudi-auth-status';
          form.append(button,skip,status);
          document.querySelector('.app-gate-card')?.appendChild(form);

          let prepared=null;
          prepareFaceIdRegistration().then(value=>{
            prepared=value;
            button.textContent='Включить Face ID';
            button.disabled=false;
          }).catch(error=>{
            console.warn('RUDI_PASSKEY_PREPARE_REGISTRATION',String(error?.name||''),String(error?.message||error));
            status.textContent='Не удалось подготовить Face ID. Попробуйте ещё раз.';
            button.textContent='Включить Face ID';
            button.disabled=true;
          });

          skip.addEventListener('click',()=>{
            setLoadingGate();
            resolve(false);
          });

          button.addEventListener('click',()=>{
            if(!prepared) return;
            button.disabled=true;
            skip.disabled=true;
            status.textContent='Подтвердите Face ID на iPhone…';

            let credentialPromise;
            try{
              credentialPromise=navigator.credentials.create({publicKey:prepared.publicKey});
            }catch(error){
              status.textContent='Не удалось запустить Face ID.';
              button.disabled=false;
              skip.disabled=false;
              return;
            }

            finishFaceIdRegistration(prepared,credentialPromise).then(()=>{
              status.textContent='Face ID включён';
              clearAuthGateForm();
              document.body.classList.remove('auth-login');
              document.body.classList.add('auth-pending');
              resolve(true);
            }).catch(error=>{
              console.warn('RUDI_PASSKEY_REGISTER',String(error?.name||''),String(error?.message||error));
              const name=String(error?.name||'');
              status.textContent=name==='NotAllowedError'
                ?'Face ID не был подтверждён.'
                :name==='SecurityError'
                  ?'Face ID недоступен для этого адреса.'
                  :name==='NotSupportedError'
                    ?'Этот браузер не поддерживает Face ID для RUDI.'
                    :'Не удалось включить Face ID.';
              button.disabled=false;
              skip.disabled=false;
            });
          });
        });
      }

      async function maybeOfferFaceIdSetup(){
        if(telegramInitData()||!passkeySupported()||lastBrowserAuthMethod!=='pin') return false;
        const configured=await faceIdConfigured();
        if(configured) return false;
        return showFaceIdSetup();
      }

      function pinInputNode(){
        const input=document.createElement('input');
        input.className='rudi-auth-pin';
        input.type='password';
        input.inputMode='numeric';
        input.autocomplete='one-time-code';
        input.pattern='[0-9]*';
        input.maxLength=6;
        input.placeholder='••••••';
        input.setAttribute('aria-label','PIN-код из 6 цифр');
        input.addEventListener('input',()=>{
          input.value=String(input.value||'').replace(/\D/g,'').slice(0,6);
        });
        return input;
      }

      function showPinSetup(){
        return new Promise(resolve=>{
          setAuthGate('Создайте PIN для Safari','6 цифр. Он понадобится только для входа вне Telegram.');
          const form=document.createElement('form');
          form.className='rudi-auth-form';
          const actor=document.createElement('div');
          actor.className='rudi-auth-current';
          actor.textContent=currentActor;
          const input=pinInputNode();
          const button=document.createElement('button');
          button.className='rudi-auth-submit';
          button.type='submit';
          button.textContent='Сохранить PIN';
          const status=document.createElement('div');
          status.className='rudi-auth-status';
          form.append(actor,input,button,status);
          document.querySelector('.app-gate-card')?.appendChild(form);
          setTimeout(()=>input.focus(),80);
          form.addEventListener('submit',async event=>{
            event.preventDefault();
            const pin=String(input.value||'');
            if(!/^\d{6}$/.test(pin)){
              status.textContent='Введите ровно 6 цифр.';
              input.focus();
              return;
            }
            button.disabled=true;
            input.disabled=true;
            status.textContent='Сохраняю…';
            try{
              await browserAuthRequest('create-pin',{pin});
              status.textContent='PIN создан';
              clearAuthGateForm();
              document.body.classList.remove('auth-login');
              document.body.classList.add('auth-pending');
              resolve(true);
            }catch(error){
              status.textContent='Не удалось сохранить PIN. Попробуйте ещё раз.';
              button.disabled=false;
              input.disabled=false;
              input.focus();
            }
          });
        });
      }

      function showBrowserLogin(){
        return new Promise(resolve=>{
          setAuthGate('Вход в RUDI','Выберите профиль и введите свой PIN.');
          const form=document.createElement('form');
          form.className='rudi-auth-form';
          const faceIdButton=document.createElement('button');
          faceIdButton.type='button';
          faceIdButton.className='rudi-auth-submit rudi-auth-faceid';
          faceIdButton.textContent='Войти с Face ID';
          faceIdButton.hidden=true;
          const divider=document.createElement('div');
          divider.className='rudi-auth-divider';
          divider.textContent='или PIN';
          divider.hidden=true;
          const actors=document.createElement('div');
          actors.className='rudi-auth-actors';
          let selectedActor='';
          for(const name of ['Рустам','Диана']){
            const actorButton=document.createElement('button');
            actorButton.type='button';
            actorButton.className='rudi-auth-actor';
            actorButton.textContent=name;
            actorButton.addEventListener('click',()=>{
              selectedActor=name;
              for(const node of actors.querySelectorAll('.rudi-auth-actor')) node.classList.toggle('is-active',node===actorButton);
              input.focus();
            });
            actors.appendChild(actorButton);
          }
          const input=pinInputNode();
          const button=document.createElement('button');
          button.className='rudi-auth-submit';
          button.type='submit';
          button.textContent='Войти';
          const status=document.createElement('div');
          status.className='rudi-auth-status';
          form.append(faceIdButton,divider,actors,input,button,status);
          document.querySelector('.app-gate-card')?.appendChild(form);

          let preparedFaceIdLogin=null;
          if(passkeySupported()){
            prepareFaceIdAuthentication().then(value=>{
              preparedFaceIdLogin=value;
              faceIdButton.hidden=false;
              divider.hidden=false;
            }).catch(error=>{
              if(String(error?.message||'')!=='rudi-passkey-not-configured'){
                console.warn('RUDI_PASSKEY_PREPARE_LOGIN',String(error?.name||''),String(error?.message||error));
              }
            });
          }

          faceIdButton.addEventListener('click',()=>{
            if(!preparedFaceIdLogin) return;
            faceIdButton.disabled=true;
            button.disabled=true;
            status.textContent='Подтвердите Face ID на iPhone…';

            let credentialPromise;
            try{
              credentialPromise=navigator.credentials.get({publicKey:preparedFaceIdLogin.publicKey});
            }catch(error){
              status.textContent='Не удалось запустить Face ID.';
              faceIdButton.disabled=false;
              button.disabled=false;
              return;
            }

            finishFaceIdAuthentication(preparedFaceIdLogin,credentialPromise).then(actor=>{
              lastBrowserAuthMethod='passkey';
              clearAuthGateForm();
              document.body.classList.remove('auth-login');
              document.body.classList.add('auth-pending');
              resolve(actor);
            }).catch(error=>{
              console.warn('RUDI_PASSKEY_LOGIN',String(error?.name||''),String(error?.message||error));
              const name=String(error?.name||'');
              status.textContent=name==='NotAllowedError'
                ?'Face ID не был подтверждён.'
                :name==='SecurityError'
                  ?'Face ID недоступен для этого адреса.'
                  :'Не удалось войти с Face ID.';
              faceIdButton.disabled=false;
              button.disabled=false;
            });
          });

          form.addEventListener('submit',async event=>{
            event.preventDefault();
            if(!selectedActor){
              status.textContent='Сначала выберите Рустама или Диану.';
              return;
            }
            const pin=String(input.value||'');
            if(!/^\d{6}$/.test(pin)){
              status.textContent='Введите PIN из 6 цифр.';
              input.focus();
              return;
            }
            button.disabled=true;
            input.disabled=true;
            status.textContent='Проверяю…';
            try{
              const data=await browserAuthRequest('login',{actor:selectedActor,pin});
              lastBrowserAuthMethod='pin';
              clearAuthGateForm();
              document.body.classList.remove('auth-login');
              document.body.classList.add('auth-pending');
              resolve(String(data.actor||selectedActor));
            }catch(error){
              const code=String(error?.message||'');
              status.textContent=code==='rudi-pin-rate-limited'
                ?'Слишком много попыток. Попробуйте позже.'
                :code==='rudi-pin-not-configured'
                  ?'PIN ещё не создан. Сначала откройте RUDI через Telegram.'
                  :'Неверный PIN.';
              button.disabled=false;
              input.disabled=false;
              input.select();
            }
          });
        });
      }

      async function ensureTelegramPin(){
        if(!telegramInitData()) return true;
        try{
          const cloudToken=await withTimeout(readStateBackupToken(),1600,currentStateBackupToken||'');
          if(cloudToken) currentStateBackupToken=cloudToken;
          const status=await browserAuthRequest('status');
          if(status.pinConfigured===false) return showPinSetup();
        }catch(error){
          console.warn('RUDI_PIN_STATUS_WARN',String(error?.message||error));
        }
        return true;
      }

      const PROFILE_CACHE_KEY='rudi-profile-cache-v1';
      const PROFILE_CACHE_REFRESH_MS=24*60*60*1000;

      function readProfileCache(){
        try{
          const cached=JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY)||'null');
          if(!cached||cached.actor!==currentActor) return null;
          if(!cached.selfProfile&&!cached.partnerProfile) return null;
          return cached;
        }catch(_){return null}
      }

      function writeProfileCache(selfProfile,partnerProfile){
        try{
          localStorage.setItem(PROFILE_CACHE_KEY,JSON.stringify({
            actor:currentActor,
            updatedAt:Date.now(),
            selfProfile:selfProfile||null,
            partnerProfile:partnerProfile||null
          }));
        }catch(_){}
      }

      function profileCacheNeedsRefresh(cached){
        const updatedAt=Number(cached?.updatedAt||0);
        return !updatedAt||Date.now()-updatedAt>PROFILE_CACHE_REFRESH_MS;
      }

      function applyCachedTelegramProfiles(){
        const cached=readProfileCache();
        if(cached) applyTelegramProfiles(cached.selfProfile,cached.partnerProfile);
        return cached;
      }

      async function loadAppBootstrap(){
        if(!currentActor) return;
        const cachedProfiles=readProfileCache();
        const includeProfiles=profileCacheNeedsRefresh(cachedProfiles);
        try{
          const cloudToken=await withTimeout(readStateBackupToken(),1600,currentStateBackupToken||'');
          const backupToken=String(cloudToken||currentStateBackupToken||readLocalStateBackupToken()||'');
          const response=await fetchWithTimeout('/api/partner-message?rudiAction=app-bootstrap',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              initData:telegramInitData(),
              backupToken,
              ticktickHandoff:ticktickHandoffToken,
              includeProfiles
            }),
            cache:'no-store'
          },10000);
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok) throw new Error(payload.error||'bootstrap');
          if(payload.actor&&String(payload.actor)!==currentActor) return;
          if(payload.selfProfile||payload.partnerProfile){
            const selfProfile=payload.selfProfile||cachedProfiles?.selfProfile||null;
            const partnerProfile=payload.partnerProfile||cachedProfiles?.partnerProfile||null;
            applyTelegramProfiles(selfProfile,partnerProfile);
            writeProfileCache(selfProfile,partnerProfile);
          }
          const appliedRemoteUi=applyRemoteUiPreferences(payload.uiPreferences);
          if(appliedRemoteUi) applyMountedUiPreferences();
          if(!appliedRemoteUi&&!String(payload.uiPreferences?.updatedAt||'')&&!uiPreferencesDirty) markUiPreferencesChanged();
          cacheHolidayItems(payload.holidayHighlights);
          clearLegacyStateBackup().catch(()=>{});
          if(payload.backupToken) storeStateBackupToken(payload.backupToken).catch(()=>{});
          if(ticktickHandoffToken){
            ticktickHandoffToken='';
            try{
              const url=new URL(window.location.href);
              url.searchParams.delete('ticktickHandoff');
              url.searchParams.delete('ticktick');
              history.replaceState(null,'',url.pathname+(url.search||'')+(url.hash||''));
            }catch(_){}
          }
        }catch(error){
          console.warn('RUDI_APP_BOOTSTRAP_WARN',String(error?.message||error));
        }
      }

      async function authenticateApp(){
        appAccessReady=false;
        try{
          const localBackupToken=readLocalStateBackupToken();
          if(localBackupToken) currentStateBackupToken=localBackupToken;
          const response=await fetchWithTimeout('/api/partner-message?rudiAction=app-auth',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:telegramInitData()}),
            cache:'no-store'
          },5000);
          const payload=await response.json().catch(()=>({}));
          if(!response.ok||!payload.ok) throw new Error(payload.error||'access');
          currentActor=String(payload.actor||'');
          try{
            if(currentActor) localStorage.setItem('rudi-offline-access-v1',JSON.stringify({actor:currentActor,verifiedAt:Date.now()}));
          }catch(_){};
        }catch(error){
          const code=String(error?.message||'');
          const connectivityFailure=
            navigator.onLine===false
            || String(error?.name||'')==='AbortError'
            || String(error?.name||'')==='TypeError'
            || /network|fetch|load failed|aborted|timeout/i.test(code);
          let offlineActor='';
          if(connectivityFailure){
            try{
              const cached=JSON.parse(localStorage.getItem('rudi-offline-access-v1')||'null');
              const age=Date.now()-Number(cached?.verifiedAt||0);
              if(['Рустам','Диана'].includes(String(cached?.actor||''))&&age>=0&&age<30*DAY){
                offlineActor=String(cached.actor);
              }
            }catch(_){}
          }
          if(offlineActor){
            currentActor=offlineActor;
            document.body.dataset.offlineMode='1';
          }else if(!telegramInitData()&&['rudi-session-required','rudi-session-invalid','rudi-session-expired'].includes(code)){
            currentActor=await showBrowserLogin();
            await maybeOfferFaceIdSetup();
          }else{
            denyApp(
              code==='rudi-access-denied'?'Доступ закрыт':'Не удалось проверить доступ',
              code==='rudi-access-denied'
                ?'RUDI работает только для Рустама и Дианы.'
                :'Обновите страницу и попробуйте снова.'
            );
            return false;
          }
        }
        if(!currentActor) return false;
        if(telegramInitData()) await ensureTelegramPin();
        appAccessReady=true;
        showAuthenticatedApp();
        loadAppBootstrap().catch(error=>{
          console.warn('RUDI_APP_BOOTSTRAP_BACKGROUND_WARN',String(error?.message||error));
        });
        return true;
      }

      const preventGestureZoom=event=>event.preventDefault();
      document.addEventListener('gesturestart',preventGestureZoom,{passive:false});
      document.addEventListener('gesturechange',preventGestureZoom,{passive:false});
      document.addEventListener('gestureend',preventGestureZoom,{passive:false});
      document.addEventListener('touchmove',event=>{
        if(event.touches&&event.touches.length>1) event.preventDefault();
      },{passive:false});

      applyTheme();
      setupBrowserPullToRefresh();
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
      const handleSystemThemeChange=()=>{if(!tg?.initData) applyTheme()};
      if(typeof media.addEventListener==='function') media.addEventListener('change',handleSystemThemeChange);
      else media.addListener?.(handleSystemThemeChange);

      const user = tg?.initDataUnsafe?.user;
      const displayName = document.getElementById('displayName');
      const avatar = document.getElementById('avatar');
      const avatarImage = document.getElementById('avatarImage');
      const initials = document.getElementById('initials');
      let firstName = '';

      function applySessionIdentity(){
        if(user||!currentActor) return;
        firstName=currentActor;
        displayName.textContent=currentActor;
        initials.textContent=currentActor.charAt(0).toUpperCase();
        avatar.classList.remove('has-photo');
      }

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
        const now=new Date();
        const weekdayRaw=new Intl.DateTimeFormat('ru-RU',{weekday:'long',timeZone:TZ}).format(now);
        const weekday=weekdayRaw.charAt(0).toLocaleUpperCase('ru-RU')+weekdayRaw.slice(1);
        const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:TZ}).format(now);
        const legacy=document.getElementById('profileMeta');
        if(legacy) legacy.textContent=weekday+' · '+date;
        const dashboardDate=document.getElementById('homeDashboardDate');
        if(dashboardDate) dashboardDate.textContent=weekday+', '+date;
        if(currentActor){
          syncStaticProfileWorkStatus();
          renderHomeDashboard();
          if(currentConfig) renderAnniversary(currentConfig);
        }
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

      function countWord(value,one,few,many){
        const n=Math.abs(Number(value)||0);
        const mod10=n%10, mod100=n%100;
        if(mod10===1&&mod100!==11) return one;
        if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14)) return few;
        return many;
      }

      function relationshipDuration(start,parts,utc){
        let years=Math.max(0,parts.year-start.year);
        if(Date.UTC(start.year+years,start.month-1,start.day)>utc) years=Math.max(0,years-1);
        let months=0;
        while(months<11&&Date.UTC(start.year+years,start.month-1+months+1,start.day)<=utc) months++;
        const cursor=Date.UTC(start.year+years,start.month-1+months,start.day);
        const days=Math.max(0,Math.floor((utc-cursor)/DAY));
        return {years,months,days,totalDays:Math.max(0,Math.floor((utc-Date.UTC(start.year,start.month-1,start.day))/DAY))};
      }

      function renderAnniversary(config){
        const card=document.getElementById('anniversaryCard');
        if(!card) return;
        const raw=String(config?.relationship?.startedAt||'').trim();
        const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!match){card.hidden=true;return}
        const start={year:Number(match[1]),month:Number(match[2]),day:Number(match[3])};
        const {parts,utc}=todayState();
        const startUtc=Date.UTC(start.year,start.month-1,start.day);
        if(!Number.isFinite(startUtc)||startUtc>utc){card.hidden=true;return}

        const duration=relationshipDuration(start,parts,utc);
        const values=[];
        if(duration.years) values.push(duration.years+' '+countWord(duration.years,'год','года','лет'));
        if(duration.months) values.push(duration.months+' '+countWord(duration.months,'месяц','месяца','месяцев'));
        values.push(duration.days+' '+dayWord(duration.days));

        const title=String(config?.relationship?.title||'Наша годовщина').trim()||'Наша годовщина';
        const next=nextOccurrence(start.month,start.day);
        document.getElementById('anniversaryTitle').textContent='♥ '+title+' ♥';
        document.getElementById('anniversaryTogether').textContent=values.join(' ');
        document.getElementById('anniversarySince').textContent='Вместе с '+new Intl.DateTimeFormat('ru-RU',{
          day:'numeric',month:'long',year:'numeric',timeZone:'UTC'
        }).format(new Date(startUtc));
        document.getElementById('anniversaryDays').textContent=duration.totalDays+' '+dayWord(duration.totalDays)+' вместе';
        document.getElementById('anniversaryNext').textContent=next.days===0
          ?'Сегодня наша годовщина ♥'
          :'До годовщины · '+next.days+' '+dayWord(next.days);
        card.hidden=false;
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
        const key='rudi-config-cache-v1';
        const merge=value=>({...fallback,...value,compliments:{...fallback.compliments,...value.compliments},weather:{...fallback.weather,...value.weather},cycle:{...fallback.cycle,...value.cycle}});
        let saved=null;
        try{
          const cached=JSON.parse(localStorage.getItem(key)||'null');
          if(cached?.value&&typeof cached.value==='object'&&!Array.isArray(cached.value)) saved=cached;
        }catch(_){}
        if(saved&&Date.now()-Number(saved.savedAt||0)<5*60*1000) return merge(saved.value);

        const refresh=(async()=>{
          try{
            const response=await fetchWithTimeout(CONFIG_URL+'?t='+Date.now(),{cache:'no-store'},4000);
            if(!response.ok) throw new Error('config');
            const remote=await response.json();
            if(!remote||typeof remote!=='object'||Array.isArray(remote)) throw new Error('config-invalid');
            try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),value:remote}))}catch(_){}
            return merge(remote);
          }catch(_){return saved?merge(saved.value):fallback}
        })();
        // Public editorial settings may revalidate without holding up the app.
        return saved?merge(saved.value):withTimeout(refresh,1200,fallback);
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
        const brain=document.getElementById('dianaCycleBrain');
        const appetite=document.getElementById('dianaCycleAppetite');
        const recordButton=document.getElementById('dianaCycleStartToday');

        if(!cfg||cfg.enabled===false){
          homeDashboardState.cycle=null;
          setDianaCycleMood('');
          renderHomeDashboard();
          countdown.textContent='—';
          countdownLabel.textContent='данные цикла недоступны';
          phase.textContent='Нет данных';
          cycleDay.textContent='—';
          progress.style.width='0%';
          period.textContent='—';
          ovulation.textContent='—';
          if(brain) brain.textContent='—';
          if(appetite) appetite.textContent='—';
          note.textContent='Прогноз появится после загрузки данных.';
          if(recordButton) recordButton.disabled=true;
          return;
        }

        if(recordButton) recordButton.disabled=false;
        const model=dianaCycleModel(cfg);
        homeDashboardState.cycle=model;
        setDianaCycleMood(model);
        renderHomeDashboard();
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
        if(brain) brain.textContent=dianaCycleBrainNote(model).replace(/^🧠\s*Мозг:\s*/u,'');
        if(appetite) appetite.textContent=dianaCycleAppetiteNote(model).replace(/^🍽\s*Аппетит:\s*/u,'');
        note.textContent='Прогноз по '+Math.max(1,model.historyCount)+' отмеченным циклам. Даты ориентировочные и не подходят для контрацепции.';
      }

      async function cycleRequest(operation,payload={}){
        const response=await fetchWithTimeout('/api/cycle',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation,...payload}),
          cache:'no-store'
        },5000);
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'cycle-unavailable');
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        return data;
      }

      async function loadDianaCycle({silent=false}={}){
        const card=document.getElementById('dianaCycleCard');
        if(!card||!currentActor) return;
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
          setTimeout(()=>loadActivityJournal({silent:true}),180);
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
          loadWorkCalendar(currentWorkCalendarView,{silent:true,force:true}),
          loadActivityJournal({silent:true})
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
        homeDashboardState.tasks=tasks;
        renderHomeDashboard();
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
              body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken}),
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

      async function loadTickTickNext({preserveExpanded=false,force=false,retryOnAbort=true}={}){
        if(!currentActor) return;
        if(force) invalidateManagedRequests('ticktick-today');
        try{
          const payload=await managedJsonRequest('ticktick-today','/api/ticktick/today',{
            body:{initData:telegramInitData(),backupToken:currentStateBackupToken},
            ttlMs:3000,
            timeoutMs:7000
          });
          renderTickTickTodayState(payload,{preserveExpanded});
        }catch(error){
          if(error?.name==='AbortError'){
            if(retryOnAbort){
              await new Promise(resolve=>setTimeout(resolve,120));
              return loadTickTickNext({preserveExpanded,force:false,retryOnAbort:false});
            }
            return;
          }
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


      function dianaWorkingNow(row,nowMinutes=homeCurrentMinutes()){
        if(!row||!row.working) return false;
        const toMinutes=value=>{
          const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/u);
          return match?Number(match[1])*60+Number(match[2]):null;
        };
        const events=Array.isArray(row.events)?row.events:[];
        const timedEvents=events.map(event=>({
          event,
          start:toMinutes(event?.startTime),
          end:toMinutes(event?.endTime)
        })).filter(item=>item.start!==null&&item.end!==null&&item.start!==item.end);
        if(timedEvents.length){
          return timedEvents.some(({start,end})=>end>start
            ?nowMinutes>=start&&nowMinutes<end
            :nowMinutes>=start||nowMinutes<end);
        }
        return events.some(event=>event?.allDay);
      }

      function dianaWorkStatusText(row){
        const workingNow=dianaWorkingNow(row);
        if(!workingNow) return 'Отдыхаю';
        const activeShift=dianaActiveShiftLabel(row);
        return 'Работаю'+(activeShift?' · '+activeShift:'');
      }

      function dianaActiveShiftLabel(row,nowMinutes=homeCurrentMinutes()){
        if(!row||!row.working) return '';
        const normalizeTime=value=>{
          const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})$/u);
          if(!match) return null;
          const hours=Number(match[1]);
          const minutes=Number(match[2]);
          if(hours<0||hours>23||minutes<0||minutes>59) return null;
          return {
            label:String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0'),
            minutes:hours*60+minutes
          };
        };
        const events=Array.isArray(row.events)?row.events:[];
        for(const event of events){
          const start=normalizeTime(event?.startTime);
          const end=normalizeTime(event?.endTime);
          if(!start||!end||start.minutes===end.minutes) continue;
          const active=end.minutes>start.minutes
            ?nowMinutes>=start.minutes&&nowMinutes<end.minutes
            :nowMinutes>=start.minutes||nowMinutes<end.minutes;
          if(active) return start.label+'–'+end.label;
        }
        return '';
      }

      function renderPartnerWorkStatus(days){
        const status=profileStatusElement('Диана');

        const today=todayState().key;
        const row=(Array.isArray(days)?days:[]).find(day=>String(day?.date||'')===today);
        if(!row){
          homeDashboardState.workDay=null;
          renderHomeDashboard();
          if(status){
            status.dataset.calendarReady='1';
            setProfileWorkStatus('Диана','Отдыхаю','off');
          }
          return;
        }

        const working=Boolean(row.working);
        const workRow={...row,working};
        const workingNow=dianaWorkingNow(workRow);
        const activeShift=workingNow?dianaActiveShiftLabel(workRow):'';
        homeDashboardState.workDay=workRow;
        renderHomeDashboard();
        if(status){
          status.dataset.calendarReady='1';
          const statusText=dianaWorkStatusText(workRow);
          setProfileWorkStatus('Диана',statusText,workingNow?'working':'off');
          status.title='';
        }
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
            restartRudiMotion(selected,'rudi-data-refresh',360);
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
        if(!currentActor) return;
        try{
          const payload=await fetchCalendarJson(
            'work-calendar:month',
            '/api/work-calendar',
            {initData:telegramInitData(),backupToken:currentStateBackupToken,view:'month'},
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
        const base={initData:telegramInitData(),backupToken:currentStateBackupToken,view:requested};
        const [workResult,tickResult,holidayResult]=await Promise.allSettled([
          fetchCalendarJson('work-calendar:'+requested,'/api/work-calendar',base,5000),
          fetchCalendarJson('ticktick-calendar:'+requested,'/api/ticktick/calendar',base,3000),
          fetchCalendarJson('holiday-calendar:'+requested,'/api/partner-message?rudiAction=holiday-calendar',{
            initData:telegramInitData(),
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
        if(!currentActor) return;
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
          if(requested==='month') setTimeout(()=>loadActivityJournal({silent:true}),180);
          if(requested==='next-month') refreshPartnerWorkStatus();
          if(currentAppTab==='schedule'&&requested==='month'&&!calendarViewCache['next-month']){
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
            restartRudiMotion(selected,'rudi-data-refresh',360);
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
        if(!currentActor) return;
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
            body:JSON.stringify({initData:telegramInitData(),backupToken:currentStateBackupToken,view:requested}),
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

      function setPhotoViewerLoading(state,text=''){
        const loading=document.getElementById('photoViewerLoading');
        const label=document.getElementById('photoViewerLoadingText');
        if(!loading||!label) return;
        if(!state){
          loading.hidden=true;
          loading.dataset.state='';
          label.textContent='';
          return;
        }
        loading.hidden=false;
        loading.dataset.state=state;
        label.textContent=text;
      }

      function preloadSharedAlbumHd(url){
        const target=String(url||'').trim();
        if(!target) return Promise.resolve(false);
        const existing=sharedAlbumHdLoads.get(target);
        if(existing) return existing;

        const promise=new Promise(resolve=>{
          let attempt=0;
          const run=()=>{
            const preload=new Image();
            preload.decoding='async';
            const done=(ok)=>{
              preload.onload=null;
              preload.onerror=null;
              if(ok){
                resolve(true);
                return;
              }
              if(attempt<1){
                attempt+=1;
                setTimeout(run,420);
              }else{
                resolve(false);
              }
            };
            preload.onload=()=>done(true);
            preload.onerror=()=>done(false);
            preload.src=target;
          };
          run();
        }).finally(()=>{
          setTimeout(()=>sharedAlbumHdLoads.delete(target),30000);
        });
        sharedAlbumHdLoads.set(target,promise);
        return promise;
      }

      function preloadNextSharedAlbumHd(photoIndex){
        [1,2].forEach(offset=>{
          const adjacent=sharedAlbumPhotos[photoIndex+offset];
          const adjacentPreview=String(adjacent?.url||'').trim();
          const adjacentFull=String(adjacent?.fullUrl||'').trim();
          if(adjacentFull&&adjacentFull!==adjacentPreview) preloadSharedAlbumHd(adjacentFull);
        });
      }

      function renderSharedAlbumPhotoViewer(){
        const viewer=document.getElementById('photoViewer');
        const image=document.getElementById('photoViewerImage');
        const caption=document.getElementById('photoViewerCaption');
        const prev=document.getElementById('photoViewerPrev');
        const next=document.getElementById('photoViewerNext');
        const original=document.getElementById('photoViewerOriginal');
        const photo=sharedAlbumPhotos[currentSharedAlbumPhotoIndex];
        const previewUrl=String(photo?.url||photo?.fullUrl||'').trim();
        const fullUrl=String(photo?.fullUrl||previewUrl).trim();
        const photoIndex=currentSharedAlbumPhotoIndex;
        if(!viewer||!image||!caption||!prev||!next||!original||!previewUrl) return false;

        image.onerror=null;
        image.dataset.photoIndex=String(photoIndex);
        image.src=previewUrl;
        image.alt=photo?.caption?String(photo.caption):'Фото из общего альбома';
        restartRudiMotion(image,'rudi-photo-swap',280);

        if(fullUrl&&fullUrl!==previewUrl){
          setPhotoViewerLoading('loading','Загружаем фото в высоком качестве…');
          preloadSharedAlbumHd(fullUrl).then(ok=>{
            if(currentSharedAlbumPhotoIndex!==photoIndex) return;
            if(!ok){
              setPhotoViewerLoading('error','Не удалось загрузить HD. Показано превью.');
              return;
            }
            image.onerror=()=>{
              image.onerror=null;
              if(currentSharedAlbumPhotoIndex===photoIndex){
                image.src=previewUrl;
                setPhotoViewerLoading('error','Не удалось открыть HD. Показано превью.');
              }
            };
            image.src=fullUrl;
            restartRudiMotion(image,'rudi-photo-swap',220);
            setPhotoViewerLoading('', '');
          });
          preloadNextSharedAlbumHd(photoIndex);
        }else{
          setPhotoViewerLoading('', '');
        }

        const captionText=String(photo?.caption||'').trim();
        caption.textContent=captionText;
        caption.hidden=!captionText;

        prev.disabled=currentSharedAlbumPhotoIndex<=0;
        next.disabled=currentSharedAlbumPhotoIndex>=sharedAlbumPhotos.length-1;
        original.disabled=!sharedAlbumOriginalUrl(photo);

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
        setPhotoViewerLoading('', '');
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
        const time=sharedAlbumPhotoTime(photo);
        if(!time) return {key:'undated',label:'Без даты'};
        const key=sharedAlbumDateKey(time);
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
          const photoTime=sharedAlbumPhotoTime(photo);
          if(!photoTime) return false;
          const key=sharedAlbumDateKey(photoTime);
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
        const previewUrl=String(photo?.url||photo?.fullUrl||'').trim();
        const fallbackUrl=String(photo?.fullUrl||'').trim();
        img.src=previewUrl;
        img.alt=photo.caption?String(photo.caption):'Фото из общего альбома';
        img.loading=index<12?'eager':'lazy';
        img.decoding='async';
        img.fetchPriority=index<6?'high':'low';
        img.draggable=false;
        img.addEventListener('error',()=>{
          if(!img.dataset.fullFallbackTried&&fallbackUrl&&fallbackUrl!==previewUrl){
            img.dataset.fullFallbackTried='1';
            img.src=fallbackUrl;
          }
        });
        button.appendChild(img);
        button.addEventListener('click',()=>openSharedAlbumPhoto(photo,index));
        return button;
      }

      function sharedAlbumMemoryReactionTarget(photo){
        const source=String(photo?.id||photo?.url||'').trim();
        if(!source) return null;
        return {type:'photo-memory',key:'photo:'+sharedAlbumHash(source).toString(16)};
      }

      function renderSharedAlbumMemory(photos){
        const wrap=document.getElementById('sharedAlbumMemory');
        const image=document.getElementById('sharedAlbumMemoryImage');
        const age=document.getElementById('sharedAlbumMemoryAge');
        const button=document.getElementById('sharedAlbumMemoryButton');
        if(!wrap||!image||!age||!button) return;
        const photo=sharedAlbumMemoryPhoto(photos);
        if(!photo){
          currentPhotoMemoryReactionTarget=null;
          renderReaction({likedBy:[]},'sharedAlbumMemoryLike','sharedAlbumMemoryLikedBy');
          wrap.hidden=true;
          image.removeAttribute('src');
          button.onclick=null;
          return;
        }
        const index=photos.indexOf(photo);
        image.src=String(photo.url||photo.fullUrl||'');
        image.alt=photo.caption?String(photo.caption):'Воспоминание из общего альбома';
        age.textContent=sharedAlbumAgeLabel(photo);
        button.onclick=()=>openSharedAlbumPhoto(photo,index);
        currentPhotoMemoryReactionTarget=sharedAlbumMemoryReactionTarget(photo);
        if(currentPhotoMemoryReactionTarget){
          refreshReaction(currentPhotoMemoryReactionTarget,'sharedAlbumMemoryLike','sharedAlbumMemoryLikedBy');
        }else{
          renderReaction({likedBy:[]},'sharedAlbumMemoryLike','sharedAlbumMemoryLikedBy');
        }
        wrap.hidden=false;
      }

      function renderSharedAlbum(payload){
        const section=document.getElementById('sharedAlbumSection');
        const grid=document.getElementById('sharedAlbumGrid');
        const status=document.getElementById('sharedAlbumStatus');
        const count=document.getElementById('sharedAlbumCount');
        const open=document.getElementById('sharedAlbumOpen');
        const photos=(Array.isArray(payload?.photos)?payload.photos:[])
          .slice(0,250)
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
        homeDashboardState.photoCount=totalCount;
        renderHomeNew();
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
        if(!currentActor) return;
        const status=document.getElementById('sharedAlbumStatus');
        status.hidden=false;
        status.textContent='Обновляю';
        try{
          const response=await fetch('/api/shared-album',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:telegramInitData(),backupToken:currentStateBackupToken}),
            cache:'no-store'
          });
          const payload=await response.json().catch(()=>({}));
          if(!response.ok) throw new Error(payload.error||'album');
          renderSharedAlbum(payload);
          setTimeout(()=>loadActivityJournal({silent:true}),180);
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
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        if(operation!=='list'){
          setTimeout(()=>refreshStateBackup(),250);
          setTimeout(()=>loadActivityJournal({silent:true}),320);
        }
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
        row.dataset.rudiItemId=String(item.id||'');
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

        const canRemove=String(item?.owner||'')===String(currentActor||'');
        const remove=document.createElement('button');
        remove.className='wish-remove';
        remove.type='button';
        remove.setAttribute('aria-label','Удалить');
        remove.textContent='×';
        remove.hidden=!canRemove;

        toggle.addEventListener('click',async()=>{
          try{renderWishlist(await wishlistRequest('toggle',{id:item.id}));}catch(_){}
        });
        if(canRemove) remove.addEventListener('click',async()=>{
          remove.disabled=true;
          try{
            const data=await wishlistRequest('remove',{id:item.id});
            renderWishlist(data);
            const removed=data?.removedItem||item;
            showUndoSnackbar('Удалено',async()=>{
              const restored=await wishlistRequest('restore',{item:removed});
              renderWishlist(restored);
            });
            try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
          }catch(_){
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{remove.disabled=false}
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
        const items=Array.isArray(payload?.items)?payload.items:[];
        homeDashboardState.wishlistCount=items.filter(item=>!item?.done).length;
        renderHomeNew();
        const rustam=document.getElementById('wishlistRustam');
        const diana=document.getElementById('wishlistDiana');
        const status=document.getElementById('wishlistStatus');
        rustam.replaceChildren();diana.replaceChildren();
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
        animateRudiCollection(rustam,'.wish-item',8);
        animateRudiCollection(diana,'.wish-item',8);
        status.hidden=true;
        status.textContent='';
        if(currentAppTab==='wishlist'){
          const route=routeFromLocation();
          focusDeepLinkedItem('wishlist',route.item);
        }
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
        homeDashboardState.nearestStatic=e||null;
        renderHomeDashboard();
        if(!e) return;
        document.getElementById('nearestTitle').textContent=e.title;
        document.getElementById('nearestMeta').textContent=e.meta;
        document.getElementById('nearestDays').textContent=daysLabel(e.days);
      }

      async function reactionsRequest(operation,payload={}){
        const response=await fetch('/api/partner-message?rudiAction=reactions',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation,...payload}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok) throw new Error(data.error||'reactions-request-failed');
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        if(operation!=='list') setTimeout(()=>loadActivityJournal({silent:true}),240);
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
        bindReaction('feedFactsLike','feedFactsLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('facts:'))||null);
        bindReaction('feedConcertsLike','feedConcertsLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('concerts:'))||null);
        bindReaction('feedStandupLike','feedStandupLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('standup:'))||null);
        bindReaction('feedCinemaLike','feedCinemaLikedBy',()=>currentFeedReactionTargets.find(target=>target.key.startsWith('cinema:'))||null);
        bindReaction('sharedAlbumMemoryLike','sharedAlbumMemoryLikedBy',()=>currentPhotoMemoryReactionTarget);
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
        homeDashboardState.message=message||null;
        renderHomeDashboard();
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

        const canEdit=Boolean(currentActor);
        if(!canEdit){
          editButton.disabled=true;
          editButton.style.opacity='.45';
          editButton.title='Редактирование доступно внутри Telegram';
        }

        const setPartnerKeyboardEditing=active=>{
          document.body.classList.toggle('keyboard-editing',Boolean(active));
        };
        const closeEditor=()=>{
          if(document.activeElement===input) input.blur();
          setPartnerKeyboardEditing(false);
          editor.classList.remove('open');
          status.textContent='';
        };

        input.addEventListener('focus',()=>setPartnerKeyboardEditing(true));
        input.addEventListener('blur',()=>setTimeout(()=>{
          if(document.activeElement!==input) setPartnerKeyboardEditing(false);
        },0));

        editButton.addEventListener('click',()=>{
          if(!canEdit) return;
          input.value=currentMessage?.text||'';
          editor.classList.add('open');
          setTimeout(()=>{
            input.focus({preventScroll:true});
            setPartnerKeyboardEditing(true);
            requestAnimationFrame(()=>editor.scrollIntoView({block:'nearest',inline:'nearest'}));
          },0);
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
              body:JSON.stringify({text,initData:telegramInitData(),backupToken:currentStateBackupToken}),
              cache:'no-store'
            });
            const data=await r.json().catch(()=>({}));
            if(!r.ok) throw new Error(data.error||'save');
            if(data.backupToken) await storeStateBackupToken(data.backupToken);
            currentMessage=data.message;
            renderPartnerMessage(currentMessage);
            closeEditor();
            setTimeout(()=>refreshStateBackup(),250);
            setTimeout(()=>loadActivityJournal({silent:true}),320);
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
        if(label) label.textContent='';
        holder.dataset.mood=mood;
        holder.querySelectorAll('[data-partner-mood]').forEach(icon=>{
          icon.hidden=icon.dataset.partnerMood!==mood;
        });
        empty.hidden=['sadness','fear','anger','joy','love'].includes(mood);
        holder.setAttribute(
          'aria-label',
          visiblePartner+': '+(
            mood==='sadness'?'грусть':mood==='fear'?'страх':mood==='anger'?'гнев':mood==='joy'?'радость':mood==='love'?'любовь':'настроение ещё не выбрано'
          )
        );
      }

      function renderDailyMood(payload){
        homeDashboardState.moods=payload||null;
        const mine=String(payload?.mine?.mood||'');
        const partnerMood=String(payload?.partnerMood?.mood||'');
        selectOwnMood(mine);
        renderPartnerMood(partnerMood,String(payload?.partner||''));
        document.getElementById('moodPrompt').hidden=Boolean(mine);
        renderHomeDashboard();
      }

      async function moodRequest(operation,mood=''){
        const response=await fetch('/api/mood',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',backupToken:currentStateBackupToken,operation,mood}),
          cache:'no-store'
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(payload.error||'mood');
        if(payload.backupToken) await storeStateBackupToken(payload.backupToken);
        return payload;
      }

      async function refreshDailyMood(){
        if(!currentActor) return;
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
            setTimeout(()=>loadActivityJournal({silent:true}),180);
            try{
              if(mood==='joy'||mood==='love') tg?.HapticFeedback?.notificationOccurred?.('success');
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

        homeDashboardState.feed=payload||null;
        homeDashboardState.feedResults=results;
        renderHomeDashboard();
        sortFeedCards(results);
        renderFeedToday(payload,results);
        animateRudiCollection(document.querySelector('.feed-grid'),'.feed-card',4);
        animateRudiCollection(document.getElementById('feedTodayLinks'),'.feed-today-chip',8);
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
        if(!currentActor) return;
        const status=document.getElementById('feedStatus');
        if(status&&!silent) status.textContent='Обновляю Ленту…';
        try{
          const response=await fetch('/api/feed',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({initData:telegramInitData()}),
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
        if(data.backupToken) await storeStateBackupToken(data.backupToken);
        if(operation!=='list'){
          setTimeout(()=>refreshStateBackup(),250);
          setTimeout(()=>loadActivityJournal({silent:true}),320);
        }
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
        homeDashboardState.productCount=items.length;
        renderHomeDashboard();
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
            row.dataset.rudiItemId=String(item.id||'');

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
                const data=await productsRequest('remove',{id:item.id});
                renderProducts(data);
                const removed=data?.removedItem||item;
                showUndoSnackbar('Удалено',async()=>{
                  const restored=await productsRequest('restore',{item:removed});
                  renderProducts(restored);
                });
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
        animateRudiCollection(groups,'.product-category',7);
        animateRudiCollection(groups,'.product-item',14);
        animateRudiCollection(historyList,'.product-history-item',10);
        if(currentAppTab==='products'){
          const route=routeFromLocation();
          focusDeepLinkedItem('products',route.item);
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
        if(!currentActor) return;
        if(productsLoadPromise) return productsLoadPromise;

        const status=document.getElementById('productsStatus');
        if(status&&!silent){
          status.hidden=false;
          status.textContent='Обновляю список…';
        }

        productsLoadPromise=(async()=>{
          try{
            const data=await productsRequest('list');
            renderProducts(data);
            if(Array.isArray(data?.items)&&data.items.length){
              hideProductsRecovery();
            }else{
              checkProductsRecovery();
            }
            return data;
          }catch(_){
            if(status&&!silent){
              status.hidden=false;
              status.textContent='Не удалось обновить список';
            }
            return null;
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
        const recoveryPanel=document.getElementById('productsRecovery');
        const recoveryButton=document.getElementById('productsRecoveryButton');
        const recoveryText=document.getElementById('productsRecoveryText');
        if(!form||!input||!add||!clear||!boughtAll) return;

        input.addEventListener('focus',()=>document.body.classList.add('keyboard-editing'));
        input.addEventListener('blur',()=>document.body.classList.remove('keyboard-editing'));

        recoveryButton?.addEventListener('click',async()=>{
          if(!productsRecoveryCandidate||recoveryButton.disabled) return;
          recoveryButton.disabled=true;
          const previousText=recoveryText?.textContent||'';
          if(recoveryText) recoveryText.textContent='Восстанавливаю список…';
          try{
            const data=await productsRecoveryRequest('restore-products',productsRecoveryCandidate);
            productsRecoveryCandidate='';
            renderProducts(data);
            if(recoveryPanel) recoveryPanel.hidden=true;
            await refreshStateBackup();
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(error){
            if(recoveryText) recoveryText.textContent=String(error?.message||previousText||'Не удалось восстановить список');
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            recoveryButton.disabled=false;
          }
        });

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
          if(clear.disabled) return;
          clear.disabled=true;
          try{
            const data=await productsRequest('clear');
            renderProducts(data);
            productsRecoveryChecked=true;
            productsRecoveryCandidate='';
            hideProductsRecovery();
            const removed=Array.isArray(data?.removedItems)?data.removedItems:[];
            if(removed.length){
              showUndoSnackbar('Удалено',async()=>{
                const restored=await productsRequest('restore',{items:removed});
                renderProducts(restored);
              });
            }
            try{tg?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
          }catch(_){
            clear.disabled=false;
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }
        });

        loadProducts();
        scheduleProductsRefresh(15000);
      }

      let currentRecipeSet=[];
      let currentRecipeContext=null;
      const recipeDetailCache=new Map();
      const RECIPE_CACHE_TTL_MS=7*DAY;
      const RECIPE_CACHE_MAX_ENTRIES=8;

      function recipeCacheStorageKey(){
        const actor=currentActor==='Диана'?'diana':currentActor==='Рустам'?'rustam':'shared';
        return 'rudi-recipe-cache-v1-'+actor;
      }

      function recipeContextKey(context){
        const source=context&&typeof context==='object'?context:{};
        return [
          String(source.ingredients||'').trim().toLowerCase().replace(/\s+/g,' '),
          String(source.equipment||'').trim(),
          String(source.meal||'').trim(),
          String(source.cuisine||'').trim(),
          String(Number(source.timeMinutes)||0)
        ].join('|');
      }

      function recipeDetailCacheKey(context,recipe){
        return recipeContextKey(context)+'|'+String(recipe?.title||'').trim().toLowerCase();
      }

      function readRecipeCacheEntries(){
        try{
          const parsed=JSON.parse(localStorage.getItem(recipeCacheStorageKey())||'{}');
          const now=Date.now();
          const entries=(Array.isArray(parsed?.entries)?parsed.entries:[])
            .filter(entry=>entry&&typeof entry==='object')
            .filter(entry=>now-Number(entry.updatedAt||0)<=RECIPE_CACHE_TTL_MS)
            .filter(entry=>Array.isArray(entry.recipes)&&entry.recipes.length)
            .sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0))
            .slice(0,RECIPE_CACHE_MAX_ENTRIES);
          if(entries.length!==(Array.isArray(parsed?.entries)?parsed.entries.length:0)){
            localStorage.setItem(recipeCacheStorageKey(),JSON.stringify({version:1,entries}));
          }
          return entries;
        }catch(_){return []}
      }

      function writeRecipeCacheEntries(entries){
        try{
          const clean=(Array.isArray(entries)?entries:[])
            .filter(entry=>entry&&typeof entry==='object'&&entry.key)
            .sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0))
            .slice(0,RECIPE_CACHE_MAX_ENTRIES);
          localStorage.setItem(recipeCacheStorageKey(),JSON.stringify({version:1,entries:clean}));
        }catch(_){}
      }

      function findRecipeCacheEntry(context){
        const key=recipeContextKey(context);
        return readRecipeCacheEntries().find(entry=>entry.key===key)||null;
      }

      function saveRecipeCacheEntry(entry){
        if(!entry?.key) return;
        const rows=readRecipeCacheEntries().filter(row=>row.key!==entry.key);
        writeRecipeCacheEntries([{...entry,updatedAt:Date.now()},...rows]);
      }

      function saveCurrentRecipeCache(selectedTitle=''){
        if(!currentRecipeContext||!Array.isArray(currentRecipeSet)||!currentRecipeSet.length) return;
        const details=[];
        currentRecipeSet.forEach(recipe=>{
          const detail=recipeDetailCache.get(recipeDetailCacheKey(currentRecipeContext,recipe));
          if(detail) details.push({title:String(recipe.title||''),recipe:detail});
        });
        saveRecipeCacheEntry({
          key:recipeContextKey(currentRecipeContext),
          context:{...currentRecipeContext},
          recipes:currentRecipeSet.map(recipe=>({...recipe})),
          details,
          selectedTitle:String(selectedTitle||'')
        });
      }

      function setRecipeChoiceValue(attribute,value){
        document.querySelectorAll('['+attribute+']').forEach(button=>{
          button.setAttribute('aria-pressed',String(button.getAttribute(attribute)||'')===String(value||'')?'true':'false');
        });
      }

      function restoreRecipeCacheEntry(entry,{restoreInputs=true}={}){
        if(!entry?.context||!Array.isArray(entry.recipes)||!entry.recipes.length) return false;
        currentRecipeContext={...entry.context};
        currentRecipeSet=entry.recipes.slice(0,4).map(recipe=>({...recipe}));
        recipeDetailCache.clear();
        (Array.isArray(entry.details)?entry.details:[]).forEach(row=>{
          const suggestion=currentRecipeSet.find(recipe=>String(recipe.title||'')===String(row?.title||''));
          if(suggestion&&row?.recipe){
            recipeDetailCache.set(recipeDetailCacheKey(currentRecipeContext,suggestion),row.recipe);
          }
        });
        if(restoreInputs){
          const input=document.getElementById('recipeIngredients');
          if(input) input.value=String(currentRecipeContext.ingredients||'');
          setRecipeChoiceValue('data-recipe-equipment',currentRecipeContext.equipment);
          setRecipeChoiceValue('data-recipe-meal',currentRecipeContext.meal);
          setRecipeChoiceValue('data-recipe-cuisine',currentRecipeContext.cuisine);
          setRecipeChoiceValue('data-recipe-time',String(currentRecipeContext.timeMinutes||15));
        }
        renderRecipeSuggestions(currentRecipeSet);
        return true;
      }

      function recipeChoiceValue(attribute){
        const button=document.querySelector('['+attribute+'][aria-pressed="true"]');
        if(!button) return '';
        return String(button.getAttribute(attribute)||'');
      }

      function setupRecipeChoice(groupSelector,attribute){
        const group=document.querySelector(groupSelector);
        if(!group||group.dataset.recipeBound==='1') return;
        group.dataset.recipeBound='1';
        const buttons=Array.from(group.querySelectorAll('button['+attribute+']'));
        buttons.forEach(button=>{
          button.addEventListener('click',()=>{
            buttons.forEach(item=>item.setAttribute('aria-pressed',item===button?'true':'false'));
            try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
          });
        });
      }

      async function recipeRequest(payload){
        const response=await fetch('/api/partner-message?rudiAction=recipes',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',...payload}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok){
          const error=new Error(data.error||'recipe-request-failed');
          error.status=response.status;
          throw error;
        }
        return data;
      }

      function recipeSectionTitle(text){
        const heading=document.createElement('h4');
        heading.className='recipe-detail-heading';
        heading.textContent=text;
        return heading;
      }

      function selectRecipeSuggestion(selectedId){
        document.querySelectorAll('#recipeSuggestions .recipe-suggestion').forEach(button=>{
          button.classList.toggle('is-selected',button.dataset.recipeId===selectedId);
        });
      }

      function renderRecipeDetails(recipe,selectedId=''){
        const details=document.getElementById('recipeDetails');
        if(!details||!recipe) return;
        selectRecipeSuggestion(selectedId);
        details.replaceChildren();

        const head=document.createElement('div');
        head.className='recipe-detail-head';
        const title=document.createElement('h3');
        title.textContent=String(recipe.title||'Рецепт');
        const meta=document.createElement('div');
        meta.className='recipe-detail-meta';
        const time=document.createElement('span');
        time.textContent='≈ '+String(recipe.timeMinutes||30)+' мин';
        const difficulty=document.createElement('span');
        difficulty.textContent=String(recipe.difficulty||'Средне');
        meta.append(time,difficulty);
        const save=document.createElement('button');
        save.type='button';
        save.className='recipe-save-button';
        save.setAttribute('aria-label','Сохранить рецепт');
        save.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 19h14"/></svg><span>Сохранить</span>';
        save.addEventListener('click',async()=>{
          if(save.disabled) return;
          save.disabled=true;
          try{
            await window.RUDI_SAVES?.save?.('recipe',recipe,save);
            setTimeout(()=>loadActivityJournal({silent:true}),120);
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            save.disabled=false;
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }
        });
        head.append(title,meta,save);
        details.appendChild(head);

        if(recipe.summary){
          const summary=document.createElement('p');
          summary.className='recipe-detail-summary';
          summary.textContent=String(recipe.summary);
          details.appendChild(summary);
        }

        const missing=Array.isArray(recipe.missing)?recipe.missing.filter(Boolean):[];
        if(missing.length){
          const missingBox=document.createElement('div');
          missingBox.className='recipe-missing';
          const strong=document.createElement('strong');
          strong.textContent='Нужно докупить';
          const value=document.createElement('span');
          value.textContent=missing.join(', ');
          missingBox.append(strong,value);
          details.appendChild(missingBox);
        }

        const ingredients=Array.isArray(recipe.ingredients)?recipe.ingredients:[];
        if(ingredients.length){
          details.appendChild(recipeSectionTitle('Ингредиенты'));
          const list=document.createElement('div');
          list.className='recipe-ingredients-list';
          ingredients.forEach(item=>{
            const row=document.createElement('div');
            row.className='recipe-ingredient-row';
            const name=document.createElement('span');
            name.textContent=String(item?.name||'');
            const amount=document.createElement('strong');
            amount.textContent=String(item?.amount||'');
            row.append(name,amount);
            list.appendChild(row);
          });
          details.appendChild(list);
        }

        const steps=Array.isArray(recipe.steps)?recipe.steps.filter(Boolean):[];
        if(steps.length){
          details.appendChild(recipeSectionTitle('Как приготовить'));
          const list=document.createElement('ol');
          list.className='recipe-steps';
          steps.forEach(value=>{
            const item=document.createElement('li');
            item.textContent=String(value);
            list.appendChild(item);
          });
          details.appendChild(list);
        }

        const tips=Array.isArray(recipe.tips)?recipe.tips.filter(Boolean):[];
        if(tips.length){
          const tip=document.createElement('div');
          tip.className='recipe-tip';
          const strong=document.createElement('strong');
          strong.textContent='Совет';
          const value=document.createElement('span');
          value.textContent=tips.join(' ');
          tip.append(strong,value);
          details.appendChild(tip);
        }

        details.hidden=false;
        setTimeout(()=>details.scrollIntoView({behavior:'smooth',block:'nearest'}),40);
      }

      function recipeErrorText(error){
        const code=String(error?.message||'');
        if(code==='recipe-ai-quota'||Number(error?.status)===429) return 'Бесплатный лимит ИИ на сегодня закончился. Попробуйте позже.';
        if(code==='groq-api-key-missing') return 'Groq пока не подключён к приложению.';
        if(code==='recipe-ai-timeout') return 'ИИ отвечает слишком долго. Попробуйте ещё раз.';
        if(code==='recipe-ai-busy') return 'ИИ сейчас перегружен. Попробуйте ещё раз через несколько секунд.';
        if(code==='recipe-ai-unavailable') return 'ИИ временно недоступен. Попробуйте ещё раз.';
        return 'Не удалось сгенерировать рецепт. Попробуйте ещё раз.';
      }

      async function openRecipeDetails(recipe,button){
        const status=document.getElementById('recipeStatus');
        const details=document.getElementById('recipeDetails');
        if(!recipe||!currentRecipeContext||button?.dataset.loading==='1') return;

        const cacheKey=recipeDetailCacheKey(currentRecipeContext,recipe);

        selectRecipeSuggestion(recipe.id);
        const cached=recipeDetailCache.get(cacheKey);
        if(cached){
          renderRecipeDetails(cached,recipe.id);
          saveCurrentRecipeCache(recipe.title);
          if(status) status.textContent='';
          return;
        }

        if(button){
          button.dataset.loading='1';
          button.classList.add('is-loading');
        }
        if(details) details.hidden=true;
        if(status) status.textContent='Готовлю подробный рецепт…';

        try{
          const data=await recipeRequest({
            operation:'detail',
            ...currentRecipeContext,
            title:recipe.title,
            summary:recipe.summary
          });
          if(data.recipe){
            recipeDetailCache.set(cacheKey,data.recipe);
            saveCurrentRecipeCache(recipe.title);
            renderRecipeDetails(data.recipe,recipe.id);
            if(status) status.textContent='';
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }else{
            throw new Error('recipe-ai-no-recipe');
          }
        }catch(error){
          if(status) status.textContent=recipeErrorText(error);
          try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }finally{
          if(button){
            delete button.dataset.loading;
            button.classList.remove('is-loading');
          }
        }
      }

      function renderRecipeSuggestions(recipes){
        const host=document.getElementById('recipeSuggestions');
        const details=document.getElementById('recipeDetails');
        if(!host) return;
        currentRecipeSet=(Array.isArray(recipes)?recipes:[]).slice(0,4);
        host.replaceChildren();
        if(details){
          details.hidden=true;
          details.replaceChildren();
        }

        currentRecipeSet.forEach((recipe,index)=>{
          const button=document.createElement('button');
          button.type='button';
          button.className='recipe-suggestion';
          button.dataset.recipeId=String(recipe.id||('recipe-'+(index+1)));
          const copy=document.createElement('span');
          copy.className='recipe-suggestion-copy';
          const title=document.createElement('strong');
          title.textContent=String(recipe.title||('Блюдо '+(index+1)));
          const summary=document.createElement('small');
          summary.textContent=String(recipe.summary||'Открыть подробный рецепт');
          copy.append(title,summary);
          const meta=document.createElement('span');
          meta.className='recipe-suggestion-meta';
          meta.textContent='≈ '+String(recipe.timeMinutes||30)+' мин';
          const arrow=document.createElement('span');
          arrow.className='recipe-suggestion-arrow';
          arrow.textContent='›';
          button.append(copy,meta,arrow);
          button.addEventListener('click',()=>{
            openRecipeDetails(recipe,button);
            try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
          });
          host.appendChild(button);
        });
        host.hidden=!currentRecipeSet.length;
      }


      const DATE_IDEAS_CACHE_PREFIX='rudi:date-ideas:v1:';
      const DATE_IDEAS_EXPANDED_PREFIX='rudi:date-ideas-expanded:v1:';
      let currentDateGenerationQuota=null;
      let dateQuotaRefreshTimer=0;

      function dateIdeasCacheKey(){
        return DATE_IDEAS_CACHE_PREFIX+(currentActor==='Диана'?'diana':'rustam');
      }

      function dateIdeasExpandedKey(){
        return DATE_IDEAS_EXPANDED_PREFIX+(currentActor==='Диана'?'diana':'rustam');
      }

      function readDateIdeasExpanded(hasIdeas=false){
        try{
          const saved=localStorage.getItem(dateIdeasExpandedKey());
          if(saved==='1') return true;
          if(saved==='0') return false;
        }catch(_){}
        return Boolean(hasIdeas);
      }

      function writeDateIdeasExpanded(expanded){
        try{localStorage.setItem(dateIdeasExpandedKey(),expanded?'1':'0')}catch(_){}
      }

      function normalizeDateIdeasCache(value){
        const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
        const ideas=(Array.isArray(source.ideas)?source.ideas:[])
          .map((idea,index)=>({
            id:String(idea?.id||('date-'+(index+1))).slice(0,80),
            title:String(idea?.title||'').trim().slice(0,140),
            description:String(idea?.description||'').trim().slice(0,700),
            duration:String(idea?.duration||'').trim().slice(0,80)
          }))
          .filter(idea=>idea.title&&idea.description)
          .slice(0,3);
        if(ideas.length!==3) return null;
        const period=['morning','day','evening'].includes(String(source.period||''))?String(source.period):'';
        return {period,ideas,generatedAt:String(source.generatedAt||'')};
      }

      function readDateIdeasCache(){
        try{return normalizeDateIdeasCache(JSON.parse(localStorage.getItem(dateIdeasCacheKey())||'null'))}
        catch(_){return null}
      }

      function writeDateIdeasCache(value){
        const normalized=normalizeDateIdeasCache(value);
        if(!normalized) return;
        try{localStorage.setItem(dateIdeasCacheKey(),JSON.stringify(normalized))}catch(_){}
      }

      function datePeriodLabel(period){
        return period==='morning'?'Утро':period==='day'?'День':period==='evening'?'Вечер':'';
      }

      function setDateIdeasExpanded(expanded,{persist=true}={}){
        const generate=document.getElementById('dateIdeaButton');
        const choices=document.getElementById('dateTimeChoices');
        const results=document.getElementById('dateIdeaResults');
        const status=document.getElementById('dateIdeaStatus');
        const hasIdeas=Boolean(readDateIdeasCache());
        if(!generate||!choices||!results) return;

        const open=Boolean(expanded);
        choices.hidden=!open;
        results.hidden=!open||!hasIdeas;
        if(status) status.hidden=!open;
        generate.setAttribute('aria-expanded',open?'true':'false');

        const title=generate.querySelector('.quick-access-copy strong');
        const subtitle=generate.querySelector('.quick-access-copy small');
        if(title) title.textContent=hasIdeas?(open?'Свернуть':'Развернуть'):(open?'Свернуть':'Сгенерировать свидание');
        if(subtitle) subtitle.textContent=hasIdeas
          ? (open?'Скрыть идеи и выбор времени':'Показать сохранённые идеи')
          : '3 необычные идеи';

        if(persist) writeDateIdeasExpanded(open);
      }

      function renderDateIdeas(payload){
        const host=document.getElementById('dateIdeaResults');
        const normalized=normalizeDateIdeasCache(payload);
        if(!host||!normalized) return false;
        host.replaceChildren();
        const head=document.createElement('div');
        head.className='date-idea-results-head';
        const title=document.createElement('strong');
        title.textContent='Идеи на '+datePeriodLabel(normalized.period).toLowerCase();
        const meta=document.createElement('span');
        meta.textContent='3 варианта';
        head.append(title,meta);
        host.appendChild(head);
        normalized.ideas.forEach((idea,index)=>{
          const card=document.createElement('article');
          card.className='date-idea-card';
          const number=document.createElement('span');
          number.className='date-idea-number';
          number.textContent=String(index+1);
          const copy=document.createElement('div');
          copy.className='date-idea-copy';
          const heading=document.createElement('strong');
          heading.textContent=idea.title;
          const description=document.createElement('p');
          description.textContent=idea.description;
          copy.append(heading,description);
          if(idea.duration){
            const duration=document.createElement('small');
            duration.textContent=idea.duration;
            copy.appendChild(duration);
          }
          const save=document.createElement('button');
          save.type='button';
          save.className='date-idea-save';
          save.setAttribute('aria-label','Сохранить идею свидания');
          save.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 19h14"/></svg><span>Сохранить</span>';
          save.addEventListener('click',async()=>{
            if(save.disabled) return;
            save.disabled=true;
            try{
              await window.RUDI_SAVES?.save?.('date',{
                title:idea.title,
                description:idea.description,
                duration:idea.duration,
                period:normalized.period
              },save);
              setTimeout(()=>loadActivityJournal({silent:true}),120);
              try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
            }catch(_){
              save.disabled=false;
              try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
            }
          });
          card.append(number,copy,save);
          host.appendChild(card);
        });
        host.hidden=false;
        return true;
      }

      function formatDateQuotaTime(value){
        const parsed=new Date(String(value||''));
        if(Number.isNaN(parsed.getTime())) return '';
        return new Intl.DateTimeFormat('ru-RU',{
          day:'numeric',
          month:'short',
          hour:'2-digit',
          minute:'2-digit',
          timeZone:TZ
        }).format(parsed).replace(',', ' в');
      }

      function dateQuotaText(quota){
        const available=Math.max(0,Number(quota?.available??5));
        const max=Math.max(1,Number(quota?.max||5));
        const nextAt=formatDateQuotaTime(quota?.nextRefillAt||quota?.blockedUntil);
        if(available<=0){
          return nextAt
            ? 'Все '+max+' генераций использованы · ещё одна станет доступна '+nextAt
            : 'Все '+max+' генераций использованы';
        }
        const base='Осталось '+available+' из '+max+' генераций';
        return nextAt&&available<max ? base+' · ещё 1 вернётся '+nextAt : base;
      }

      function syncDateChoiceAvailability(){
        const blocked=Number(currentDateGenerationQuota?.available??1)<=0;
        document.querySelectorAll('#dateTimeChoices [data-date-period]').forEach(button=>{
          button.disabled=blocked;
        });
      }

      function scheduleDateQuotaRefresh(){
        clearTimeout(dateQuotaRefreshTimer);
        const nextAt=new Date(String(currentDateGenerationQuota?.nextRefillAt||'')).getTime();
        const delay=nextAt-Date.now();
        if(!Number.isFinite(nextAt)||delay<=0) return;
        dateQuotaRefreshTimer=setTimeout(()=>loadDateGenerationStatus(),Math.min(delay+1200,2147483000));
      }

      async function dateIdeasRequest({operation='generate',period='',exclude=[]}={}){
        const response=await fetch('/api/partner-message?rudiAction=dates',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({initData:tg?.initData||'',operation,period,exclude}),
          cache:'no-store'
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok){
          const error=new Error(data.error||'date-request-failed');
          error.status=response.status;
          error.payload=data;
          throw error;
        }
        return data;
      }

      async function loadDateGenerationStatus(){
        const status=document.getElementById('dateIdeaStatus');
        try{
          const data=await dateIdeasRequest({operation:'status'});
          currentDateGenerationQuota=data.quota||null;
          syncDateChoiceAvailability();
          scheduleDateQuotaRefresh();
          if(status) status.textContent=dateQuotaText(currentDateGenerationQuota);
          return currentDateGenerationQuota;
        }catch(_){
          return currentDateGenerationQuota;
        }
      }

      function dateIdeaErrorText(error){
        const code=String(error?.message||'');
        const quota=error?.payload?.quota||error?.quota||currentDateGenerationQuota;
        if(code==='date-generation-limit'){
          currentDateGenerationQuota=quota||currentDateGenerationQuota;
          syncDateChoiceAvailability();
          scheduleDateQuotaRefresh();
          return dateQuotaText(currentDateGenerationQuota)+'. Последние идеи сохранены.';
        }
        if(code==='date-ai-quota'||Number(error?.status)===429) return 'Лимит AI-провайдера временно исчерпан. Попробуйте позже — последние идеи сохранены.';
        if(code==='groq-api-key-missing') return 'ИИ временно недоступен. Последние идеи сохранены.';
        if(code==='date-ai-timeout') return 'ИИ отвечает слишком долго. Попробуйте ещё раз — прошлые идеи не пропали.';
        return 'Не удалось придумать новые варианты. Последние идеи сохранены.';
      }

      function setupQuickAccess(){
        const wishlist=document.getElementById('quickWishlistButton');
        const saves=document.getElementById('quickSavesButton');
        const forDi=document.getElementById('quickForDiButton');
        const generate=document.getElementById('dateIdeaButton');
        const choices=document.getElementById('dateTimeChoices');
        const status=document.getElementById('dateIdeaStatus');
        if(!wishlist||!saves||!forDi||!generate||!choices||generate.dataset.dateBound==='1') return;
        generate.dataset.dateBound='1';

        wishlist.addEventListener('click',()=>{
          navigateToAppTab('wishlist',{scroll:true});
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });
        saves.addEventListener('click',()=>{
          navigateToAppTab('saves',{scroll:true});
          window.RUDI_SAVES?.load?.();
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });
        forDi.addEventListener('click',()=>{
          navigateToAppTab('for-di',{scroll:true});
          window.RUDI_FOR_DI?.load?.();
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });

        const cachedIdeas=readDateIdeasCache();
        if(cachedIdeas) renderDateIdeas(cachedIdeas);
        setDateIdeasExpanded(readDateIdeasExpanded(Boolean(cachedIdeas)),{persist:false});
        loadDateGenerationStatus();

        generate.addEventListener('click',()=>{
          const open=generate.getAttribute('aria-expanded')!=='true';
          setDateIdeasExpanded(open);
          if(open&&status){
            status.textContent=currentDateGenerationQuota
              ? dateQuotaText(currentDateGenerationQuota)
              : 'Когда удобнее устроить свидание?';
          }
          try{tg?.HapticFeedback?.selectionChanged?.()}catch(_){}
        });

        choices.querySelectorAll('[data-date-period]').forEach(button=>{
          button.addEventListener('click',async()=>{
            const period=String(button.dataset.datePeriod||'');
            if(!['morning','day','evening'].includes(period)) return;
            const previous=readDateIdeasCache();
            const exclude=previous?.ideas?.map(idea=>idea.title).filter(Boolean)||[];
            choices.querySelectorAll('button').forEach(item=>item.disabled=true);
            if(status) status.textContent='Придумываю 3 необычных варианта на '+datePeriodLabel(period).toLowerCase()+'…';
            try{
              const data=await dateIdeasRequest({period,exclude});
              const next={period,ideas:data.ideas,generatedAt:new Date().toISOString()};
              if(!renderDateIdeas(next)) throw new Error('date-ai-no-ideas');
              writeDateIdeasCache(next);
              setDateIdeasExpanded(true);
              currentDateGenerationQuota=data.quota||currentDateGenerationQuota;
              scheduleDateQuotaRefresh();
              if(status) status.textContent='Готово · '+dateQuotaText(currentDateGenerationQuota);
              try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
            }catch(error){
              if(previous) renderDateIdeas(previous);
              if(status) status.textContent=dateIdeaErrorText(error);
              try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
            }finally{
              syncDateChoiceAvailability();
            }
          });
        });
      }

      function setupRecipeGenerator(){
        const input=document.getElementById('recipeIngredients');
        const generate=document.getElementById('recipeGenerate');
        const status=document.getElementById('recipeStatus');
        if(!input||!generate||generate.dataset.recipeBound==='1') return;
        generate.dataset.recipeBound='1';

        setupRecipeChoice('[data-recipe-choice="equipment"]','data-recipe-equipment');
        setupRecipeChoice('[data-recipe-choice="meal"]','data-recipe-meal');
        setupRecipeChoice('[data-recipe-choice="cuisine"]','data-recipe-cuisine');
        setupRecipeChoice('[data-recipe-choice="time"]','data-recipe-time');

        input.addEventListener('focus',()=>document.body.classList.add('keyboard-editing'));
        input.addEventListener('blur',()=>document.body.classList.remove('keyboard-editing'));

        const latestCachedRecipe=readRecipeCacheEntries()[0];
        if(latestCachedRecipe&&restoreRecipeCacheEntry(latestCachedRecipe)){
          if(status) status.textContent='Последние рецепты восстановлены из кэша.';
        }

        generate.addEventListener('click',async()=>{
          const ingredients=input.value.trim();
          if(!ingredients){
            if(status) status.textContent='Сначала напишите, какие продукты у вас есть.';
            input.focus();
            try{tg?.HapticFeedback?.notificationOccurred?.('warning')}catch(_){}
            return;
          }

          const payload={
            operation:'suggestions',
            ingredients,
            equipment:recipeChoiceValue('data-recipe-equipment'),
            meal:recipeChoiceValue('data-recipe-meal'),
            cuisine:recipeChoiceValue('data-recipe-cuisine'),
            timeMinutes:Number(recipeChoiceValue('data-recipe-time')||15)
          };

          generate.disabled=true;
          const previousText=generate.textContent;
          generate.textContent='Подбираю…';
          if(status) status.textContent='Подбираю 4 варианта блюд…';
          document.getElementById('recipeSuggestions')?.setAttribute('hidden','');
          const details=document.getElementById('recipeDetails');
          if(details) details.hidden=true;

          try{
            const context={
              ingredients:payload.ingredients,
              equipment:payload.equipment,
              meal:payload.meal,
              cuisine:payload.cuisine,
              timeMinutes:payload.timeMinutes
            };
            const cachedEntry=findRecipeCacheEntry(context);
            if(cachedEntry&&restoreRecipeCacheEntry(cachedEntry,{restoreInputs:false})){
              if(status) status.textContent='Восстановлено из кэша. Выберите блюдо — повторный запрос к ИИ не нужен.';
              try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
              return;
            }

            const data=await recipeRequest(payload);
            currentRecipeContext=context;
            recipeDetailCache.clear();
            renderRecipeSuggestions(data.recipes);
            saveCurrentRecipeCache('');
            if(status) status.textContent='Готово. Выберите блюдо, чтобы получить подробный рецепт.';
            try{tg?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(error){
            currentRecipeSet=[];
            currentRecipeContext=null;
            if(status) status.textContent=recipeErrorText(error);
            try{tg?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }finally{
            generate.disabled=false;
            generate.textContent=previousText;
          }
        });
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

      function applyActorVisibility(){
        document.body.dataset.rudiActor=currentActor;
        if(currentActor==='Рустам') return;
        document.getElementById('carTile')?.remove();
      }

      async function init(){
        const configPromise=loadConfig();
        const allowed=await authenticateApp();
        if(!allowed) return;
        applyActorVisibility();
        applySessionIdentity();
        applyCachedTelegramProfiles();
        setupProfileSplit();
        setupHomeLayoutEditor();
        setupMarketTicker();
        setupPersistentCollapsibles();
        setupThemeSetting();
        setupExtendedSettings();
        setupUndoSnackbar();
        loadActivityJournal();
        setupVoiceAssistant();
        setupAppTabs();
        setupQuickAccess();
        ensureAppSurface({restoreTab:true});
        const config=await configPromise;
        currentConfig=config;
        renderMalePsychologyFact(malePsychologyFactFromConfig(config));
        setupProducts();
        setupRecipeGenerator();
        renderDailyCompliment(config,{force:true});
        setupReactions();

        renderNearest(config);
        renderAnniversary(config);
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
        loadWorkCalendar();
        loadSharedAlbum();
        loadFeed({silent:true});
        setTimeout(()=>refreshStateBackup(),2500);
      }

      init().catch(error=>{
        console.error('RUDI_INIT_ERROR',error);
        if(!document.body.classList.contains('auth-ok')){
          denyApp('Не удалось открыть RUDI','Обновите страницу и попробуйте снова.');
        }
      });
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()) loadDianaCycle({silent:true})},30*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()) loadTickTickNext()},5*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()) loadWorkCalendar(currentWorkCalendarView,{silent:true})},15*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()) loadSharedAlbum()},15*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()&&currentAppTab==='feed') loadFeed({silent:true})},15*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()) refreshDailyMood()},5*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()) loadActivityJournal({silent:true})},60*1000);
      setInterval(()=>{if(currentActor){syncStaticProfileWorkStatus();renderHomeDashboard()}},30*1000);
      setInterval(()=>{if(currentActor){resetMoodForNewDay();if(currentConfig) renderDailyCompliment(currentConfig)}},5000);
      setInterval(()=>{if(currentActor) refreshStateBackup()},5*60*1000);
      setInterval(()=>{if(currentActor&&autoRefreshEnabled()&&marketTickerEnabled()) loadMarketTicker({silent:true})},5*60*1000);

      function ensureAppSurface({restoreTab=false}={}){
        applyTheme();
        updateTelegramSafeArea();
        const activeElement=document.activeElement;
        const textEditing=Boolean(activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'));
        document.body.classList.toggle('keyboard-editing',textEditing);
        if(!showAuthenticatedApp()) return;
        syncStaticProfileWorkStatus();

        if(restoreTab){
          const activeSections=[...document.querySelectorAll('[data-app-tab-section="'+currentAppTab+'"]')];
          const hasAvailableActive=activeSections.some(section=>section.dataset.tabAvailable!=='0');
          applyAppTab(hasAvailableActive?currentAppTab:'home',{scroll:false});
        }
      }

      let resumeRefreshPromise=null;
      let manualRefreshRequested=false;
      async function refreshAfterResume(){
        ensureAppSurface();
        if(!currentActor||!appAccessReady) return;
        if(!manualRefreshRequested&&!autoRefreshEnabled()) return;
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
            loadActivityJournal({silent:true}),
            loadMalePsychologyFact(),
            (marketTickerEnabled()?loadMarketTicker({silent:true}):Promise.resolve()),
            syncUiPreferencesFromServer().then(()=>refreshStateBackup())
          ]);
        }).then(()=>{
          markDataSyncNow();
        }).finally(()=>{
          manualRefreshRequested=false;
          resumeRefreshPromise=null;
          ensureAppSurface();
        });
        return resumeRefreshPromise;
      }

      window.addEventListener('pageshow',event=>{
        ensureAppSurface();
        if(event.persisted) refreshAfterResume();
      });
      window.addEventListener('focus',()=>{
        ensureAppSurface();
      });
      window.addEventListener('online',updateDataSettingsUi);
      window.addEventListener('offline',updateDataSettingsUi);
      let hiddenAt=0;
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='hidden'){
          hiddenAt=Date.now();
          return;
        }
        ensureAppSurface();
        if(appAccessReady&&currentActor&&currentAppTab==='products'){
          loadProducts({silent:true});
          scheduleProductsRefresh(15000);
        }
        if(hiddenAt&&Date.now()-hiddenAt>1200) refreshAfterResume();
        hiddenAt=0;
      });
    })();
