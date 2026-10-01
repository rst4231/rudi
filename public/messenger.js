(()=>{
  'use strict';

  const API='/api/partner-message?rudiAction=';
  const DB_NAME='rudi-messenger-crypto-v1';
  const STORE_NAME='identity';
  const encoder=new TextEncoder();
  const decoder=new TextDecoder();
  const AAD_V1=encoder.encode('rudi-messenger-v1');
  const AAD_V2=encoder.encode('rudi-messenger-shared-v2');
  const state={
    actor:'',
    partner:'',
    identity:null,
    keys:null,
    aesKey:null,
    legacyAesKey:null,
    rows:[],
    decrypted:new Map(),
    reply:null,
    edit:null,
    loading:false,
    initialized:false,
  };

  function telegramInitData(){
    return String(window.Telegram?.WebApp?.initData||'');
  }

  async function api(action,payload={}){
    const response=await fetch(API+encodeURIComponent(action),{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({initData:telegramInitData(),...payload}),
      cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok) throw new Error(String(data?.error||'messenger-request-failed'));
    return data;
  }

  function base64UrlEncode(bytes){
    const source=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    let binary='';
    for(let i=0;i<source.length;i++) binary+=String.fromCharCode(source[i]);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function base64UrlDecode(value){
    const source=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const padded=source+'='.repeat((4-source.length%4)%4);
    const binary=atob(padded);
    return Uint8Array.from(binary,char=>char.charCodeAt(0));
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME,{keyPath:'id'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('messenger-crypto-db-failed'));
    });
  }

  async function readIdentity(){
    const db=await openDb();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readonly');
        const request=tx.objectStore(STORE_NAME).get('identity');
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error||new Error('messenger-identity-read-failed'));
      });
    }finally{db.close()}
  }

  async function writeIdentity(value){
    const db=await openDb();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readwrite');
        tx.objectStore(STORE_NAME).put(value);
        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>reject(tx.error||new Error('messenger-identity-write-failed'));
      });
    }finally{db.close()}
    return value;
  }

  async function createIdentity(actor){
    if(!crypto?.subtle) throw new Error('messenger-webcrypto-unavailable');
    const pair=await crypto.subtle.generateKey(
      {name:'ECDH',namedCurve:'P-256'},
      true,
      ['deriveKey']
    );
    const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
    const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
    const privateKey=await crypto.subtle.importKey(
      'jwk',
      privateJwk,
      {name:'ECDH',namedCurve:'P-256'},
      false,
      ['deriveKey']
    );
    return writeIdentity({
      id:'identity',
      actor,
      privateKey,
      publicJwk:{kty:'EC',crv:'P-256',x:publicJwk.x,y:publicJwk.y,ext:true},
      createdAt:new Date().toISOString()
    });
  }

  async function ensureIdentity(actor){
    let identity=await readIdentity().catch(()=>null);
    if(!identity||identity.actor!==actor||!identity.privateKey||!identity.publicJwk){
      identity=await createIdentity(actor);
    }
    return identity;
  }

  function samePublicKey(left,right){
    return Boolean(left&&right&&left.kty==='EC'&&right.kty==='EC'&&left.crv==='P-256'&&right.crv==='P-256'&&left.x===right.x&&left.y===right.y);
  }

  async function ensureKeys(){
    let data=await api('messenger-key',{operation:'get'});
    const actor=String(data.actor||'');
    if(!['Рустам','Диана'].includes(actor)) throw new Error('messenger-actor-invalid');
    state.actor=actor;
    state.partner=actor==='Рустам'?'Диана':'Рустам';
    state.identity=await ensureIdentity(actor);

    const own=data.keys?.[actor]?.publicJwk||null;
    if(!own){
      data=await api('messenger-key',{operation:'register',publicJwk:state.identity.publicJwk});
    }
    state.keys=data.keys||{};

    const sharedRaw=base64UrlDecode(data.conversationKey||'');
    if(sharedRaw.length!==32) throw new Error('messenger-shared-key-invalid');
    state.aesKey=await crypto.subtle.importKey(
      'raw',
      sharedRaw,
      {name:'AES-GCM'},
      false,
      ['encrypt','decrypt']
    );

    state.legacyAesKey=null;
    const partnerKey=state.keys?.[state.partner]?.publicJwk||null;
    if(partnerKey){
      try{
        const importedPartner=await crypto.subtle.importKey(
          'jwk',
          partnerKey,
          {name:'ECDH',namedCurve:'P-256'},
          false,
          []
        );
        state.legacyAesKey=await crypto.subtle.deriveKey(
          {name:'ECDH',public:importedPartner},
          state.identity.privateKey,
          {name:'AES-GCM',length:256},
          false,
          ['decrypt']
        );
      }catch(_){
        state.legacyAesKey=null;
      }
    }
    return data;
  }

  async function encryptPayload(payload){
    if(!state.aesKey) throw new Error('messenger-shared-key-missing');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const bytes=encoder.encode(JSON.stringify(payload));
    const encrypted=await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:AAD_V2,tagLength:128},
      state.aesKey,
      bytes
    );
    return {ciphertext:base64UrlEncode(new Uint8Array(encrypted)),iv:base64UrlEncode(iv)};
  }

  async function decryptRow(row){
    const shared=String(row?.scheme||'legacy-v1')==='shared-v2';
    const key=shared?state.aesKey:state.legacyAesKey;
    if(!key) throw new Error(shared?'messenger-shared-key-missing':'messenger-legacy-key-unavailable');
    const clear=await crypto.subtle.decrypt(
      {
        name:'AES-GCM',
        iv:base64UrlDecode(row.iv),
        additionalData:shared?AAD_V2:AAD_V1,
        tagLength:128
      },
      key,
      base64UrlDecode(row.ciphertext)
    );
    const payload=JSON.parse(decoder.decode(clear));
    return {
      text:String(payload?.text||''),
      reply:payload?.reply&&typeof payload.reply==='object'?{
        id:String(payload.reply.id||''),
        author:String(payload.reply.author||''),
        text:String(payload.reply.text||'').slice(0,240)
      }:null
    };
  }

  function setUnread(count){
    const clean=Math.max(0,Math.floor(Number(count)||0));
    document.documentElement.dataset.messengerUnreadCount=String(clean);
    const badge=document.getElementById('partnerMessengerBadge');
    if(badge){
      badge.textContent=clean>99?'99+':String(clean);
      badge.hidden=clean<1;
    }
    try{window.dispatchEvent(new CustomEvent('rudi:attention-change',{detail:{source:'messenger',count:clean}}))}catch(_){}
  }

  function formatTime(value){
    const date=new Date(String(value||''));
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU',{
      timeZone:'Europe/Moscow',
      hour:'2-digit',
      minute:'2-digit',
      hourCycle:'h23'
    }).format(date);
  }

  function appendLinkified(container,text){
    const source=String(text||'');
    const regex=/https?:\/\/[^\s<]+/giu;
    let last=0;
    for(const match of source.matchAll(regex)){
      const index=Number(match.index||0);
      if(index>last) container.append(document.createTextNode(source.slice(last,index)));
      let url=String(match[0]||'');
      let trailing='';
      while(/[),.!?;:]$/.test(url)){
        trailing=url.slice(-1)+trailing;
        url=url.slice(0,-1);
      }
      const link=document.createElement('a');
      link.href=url;
      link.textContent=url;
      link.rel='noopener noreferrer';
      link.target='_blank';
      link.dataset.messengerLink='1';
      container.append(link);
      if(trailing) container.append(document.createTextNode(trailing));
      last=index+String(match[0]||'').length;
    }
    if(last<source.length) container.append(document.createTextNode(source.slice(last)));
  }

  function renderReplyDraft(){
    const box=document.getElementById('messengerReplyDraft');
    const text=document.getElementById('messengerReplyDraftText');
    const label=box?.querySelector('strong');
    if(!box||!text) return;
    if(state.edit){
      box.hidden=false;
      if(label) label.textContent='Редактирование';
      text.textContent=state.edit.text||'';
      return;
    }
    if(!state.reply){
      box.hidden=true;
      if(label) label.textContent='Ответ';
      text.textContent='';
      return;
    }
    box.hidden=false;
    if(label) label.textContent='Ответ';
    text.textContent=(state.reply.author?state.reply.author+': ':'')+state.reply.text;
  }

  function setReply(row,payload){
    state.edit=null;
    state.reply={
      id:String(row?.id||''),
      author:String(row?.sender||''),
      text:String(payload?.text||'').slice(0,240)
    };
    renderReplyDraft();
    document.getElementById('messengerInput')?.focus?.();
    keepKeyboardAtLatest();
  }

  function bindLongPressReply(article,row,payload){
    if(!article||!payload) return;
    let timer=0;
    let startX=0;
    let startY=0;
    let pressed=false;
    const cancel=()=>{
      pressed=false;
      if(timer){clearTimeout(timer);timer=0}
    };
    const begin=event=>{
      if(event.pointerType==='mouse'&&event.button!==0) return;
      pressed=true;
      startX=Number(event.clientX||0);
      startY=Number(event.clientY||0);
      timer=setTimeout(()=>{
        if(!pressed) return;
        pressed=false;
        timer=0;
        article.classList.add('is-long-press');
        article.dataset.longPressedAt=String(Date.now());
        setTimeout(()=>article.classList.remove('is-long-press'),180);
        setReply(row,payload);
        try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
      },520);
    };
    const move=event=>{
      if(!pressed) return;
      const dx=Math.abs(Number(event.clientX||0)-startX);
      const dy=Math.abs(Number(event.clientY||0)-startY);
      if(dx>12||dy>12) cancel();
    };
    article.addEventListener('pointerdown',begin);
    article.addEventListener('pointermove',move);
    article.addEventListener('pointerup',cancel);
    article.addEventListener('pointercancel',cancel);
    article.addEventListener('pointerleave',cancel);
    article.addEventListener('contextmenu',event=>event.preventDefault());
  }

  function scrollMessagesToBottom(){
    const list=document.getElementById('messengerMessages');
    if(!list) return;
    requestAnimationFrame(()=>{
      list.scrollTop=list.scrollHeight;
      requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight});
    });
  }

  function keepKeyboardAtLatest(){
    if(document.body.dataset.appTab!=='messenger') return;
    const input=document.getElementById('messengerInput');
    if(document.activeElement!==input) return;
    scrollMessagesToBottom();
    setTimeout(scrollMessagesToBottom,70);
    setTimeout(scrollMessagesToBottom,180);
    setTimeout(scrollMessagesToBottom,360);
  }

  function restoreMessengerAfterKeyboard(){
    if(document.body.dataset.appTab!=='messenger') return;
    const settle=()=>{
      syncMessengerViewport();
      scrollMessagesToBottom();
    };
    settle();
    setTimeout(settle,60);
    setTimeout(settle,160);
    setTimeout(settle,320);
    setTimeout(settle,520);
  }

  function startMessageEdit(row,payload){
    if(!row||row.sender!==state.actor||!payload) return;
    state.reply=null;
    state.edit={
      id:String(row.id||''),
      text:String(payload.text||''),
      reply:payload.reply&&typeof payload.reply==='object'?{...payload.reply}:null
    };
    const input=document.getElementById('messengerInput');
    if(input){
      input.value=state.edit.text;
      input.style.height='auto';
      input.style.height=Math.min(112,input.scrollHeight)+'px';
      input.focus();
      input.setSelectionRange?.(input.value.length,input.value.length);
    }
    renderReplyDraft();
    keepKeyboardAtLatest();
    try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
  }

  async function toggleMessageLike(row){
    if(!row?.id) return;
    try{
      const data=await api('messenger-like',{id:row.id});
      if(data?.message){
        state.rows=state.rows.map(item=>item.id===row.id?data.message:item);
        renderMessages();
      }
      try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
    }catch(error){
      console.warn('RUDI_MESSENGER_LIKE_WARN',String(error?.message||error));
    }
  }

  function bindMessageTapGestures(article,row,payload){
    if(!article||!row||!payload) return;
    let taps=0;
    let gestureTimer=0;
    article.addEventListener('click',event=>{
      if(event.target.closest('a,button,input,textarea')) return;
      const longPressedAt=Number(article.dataset.longPressedAt||0);
      if(longPressedAt&&Date.now()-longPressedAt<700) return;
      taps+=1;
      clearTimeout(gestureTimer);
      gestureTimer=setTimeout(()=>{
        const count=taps;
        taps=0;
        if(count>=3){
          if(row.sender===state.actor) startMessageEdit(row,payload);
          else toggleMessageLike(row);
          return;
        }
        if(count===2) toggleMessageLike(row);
      },340);
    });
  }

  function renderMessages(){
    const list=document.getElementById('messengerMessages');
    const empty=document.getElementById('messengerEmpty');
    if(!list) return;
    list.replaceChildren();
    const rows=Array.isArray(state.rows)?state.rows:[];
    if(empty) empty.hidden=rows.length>0;
    for(const row of rows){
      const own=row.sender===state.actor;
      const payload=state.decrypted.get(row.id);
      const article=document.createElement('article');
      article.className='messenger-message '+(own?'is-own':'is-partner');
      article.dataset.messageId=row.id;

      const bubble=document.createElement('div');
      bubble.className='messenger-bubble';

      if(payload?.reply){
        const quote=document.createElement('div');
        quote.className='messenger-quote';
        const author=document.createElement('strong');
        author.textContent=payload.reply.author||'Сообщение';
        const quoteText=document.createElement('span');
        quoteText.textContent=payload.reply.text||'Сообщение недоступно';
        quote.append(author,quoteText);
        bubble.appendChild(quote);
      }

      const text=document.createElement('div');
      text.className='messenger-message-text';
      if(payload){
        appendLinkified(text,payload.text);
      }else{
        text.classList.add('is-unavailable');
        text.textContent=state.aesKey?'Не удалось расшифровать сообщение':'Защищённое сообщение';
      }
      bubble.appendChild(text);

      const meta=document.createElement('div');
      meta.className='messenger-message-meta';
      const time=document.createElement('time');
      time.dateTime=String(row.createdAt||'');
      time.textContent=formatTime(row.createdAt);
      meta.appendChild(time);
      if(own){
        const status=document.createElement('span');
        status.className='messenger-read-status';
        status.textContent=row.editedAt?'Изменено':(row.readAt?'Прочитано':'Отправлено');
        meta.appendChild(status);
      }
      bubble.appendChild(meta);

      const likedBy=Array.isArray(row.likedBy)?row.likedBy:[];
      if(likedBy.length){
        const reaction=document.createElement('div');
        reaction.className='messenger-reaction';
        reaction.textContent='❤️'+(likedBy.length>1?' '+likedBy.length:'');
        reaction.title='Нравится: '+likedBy.join(', ');
        bubble.appendChild(reaction);
      }

      article.appendChild(bubble);
      if(payload){
        bindLongPressReply(article,row,payload);
        bindMessageTapGestures(article,row,payload);
      }
      list.appendChild(article);
    }
    scrollMessagesToBottom();
  }

  async function decryptMessages(rows){
    state.decrypted.clear();
    if(!state.aesKey&&!state.legacyAesKey) return;
    for(const row of rows){
      try{
        const payload=await decryptRow(row);
        state.decrypted.set(row.id,payload);
      }catch(_){}
    }
  }

  async function repairLegacyMessages(rows){
    if(!state.aesKey) return rows;
    const items=[];
    for(const row of (Array.isArray(rows)?rows:[])){
      if(String(row?.scheme||'legacy-v1')==='shared-v2') continue;
      const payload=state.decrypted.get(row.id);
      if(!payload) continue;
      try{
        const encrypted=await encryptPayload(payload);
        items.push({id:row.id,...encrypted});
      }catch(_){}
      if(items.length>=64) break;
    }
    if(!items.length) return rows;
    try{
      const data=await api('messenger-rekey',{items});
      const updated=new Map((Array.isArray(data.messages)?data.messages:[]).map(row=>[row.id,row]));
      if(!updated.size) return rows;
      return rows.map(row=>updated.get(row.id)||row);
    }catch(error){
      console.warn('RUDI_MESSENGER_REKEY_WARN',String(error?.message||error));
      return rows;
    }
  }

  async function markVisibleUnreadRead(rows){
    if(document.body.dataset.appTab!=='messenger'||document.visibilityState==='hidden') return rows;
    const ids=(Array.isArray(rows)?rows:[])
      .filter(row=>row.sender!==state.actor&&!row.readAt)
      .map(row=>row.id);
    if(!ids.length) return rows;
    const data=await api('messenger-read',{ids});
    setUnread(data.unread);
    return Array.isArray(data.messages)?data.messages:rows;
  }

  async function load({markRead=true}={}){
    if(state.loading) return;
    state.loading=true;
    const status=document.getElementById('messengerStatus');
    try{
      if(status){status.hidden=true;status.textContent=''}
      await ensureKeys();
      let data=await api('messenger-list');
      state.keys=data.keys||state.keys;
      state.rows=Array.isArray(data.messages)?data.messages:[];
      setUnread(data.unread);
      await decryptMessages(state.rows);
      state.rows=await repairLegacyMessages(state.rows);
      renderMessages();
      if(markRead){
        const after=await markVisibleUnreadRead(state.rows);
        if(after!==state.rows){
          state.rows=after;
          await decryptMessages(state.rows);
          renderMessages();
        }
      }
      updateHeader();
      if(status){status.hidden=true;status.textContent=''}
      return data;
    }catch(error){
      if(status){
        status.hidden=false;
        status.textContent=String(error?.message||'').includes('partner-key-missing')
          ?'Партнёр ещё не активировал защищённый чат.'
          :'Не удалось обновить чат.';
      }
      console.warn('RUDI_MESSENGER_LOAD_WARN',String(error?.message||error));
      return null;
    }finally{
      state.loading=false;
    }
  }

  function syncHeaderAvatar(){
    const holder=document.getElementById('messengerPartnerAvatar');
    const image=document.getElementById('messengerPartnerImage');
    const initial=document.getElementById('messengerPartnerInitial');
    if(!holder||!image||!initial) return;
    const sourceImage=document.getElementById('partnerProfileImage');
    const sourceInitial=document.getElementById('partnerProfileInitial');
    const partnerName=state.partner||'Партнёр';
    initial.textContent=String(sourceInitial?.textContent||partnerName.charAt(0)||'П').trim().slice(0,2).toUpperCase();
    const src=String(sourceImage?.currentSrc||sourceImage?.src||'').trim();
    if(src){
      image.alt='Фото профиля '+partnerName;
      if(image.src!==src) image.src=src;
      holder.classList.add('has-photo');
    }else{
      image.removeAttribute('src');
      holder.classList.remove('has-photo');
    }
  }

  function updateHeader(){
    const title=document.getElementById('messengerPartnerName');
    if(title) title.textContent=state.partner||'Партнёр';
    const lock=document.getElementById('messengerSecurityStatus');
    if(lock) lock.textContent=state.aesKey?'🔒 Защищённый чат · сообщения живут 24 часа':'🔒 Получаю ключ чата';
    syncHeaderAvatar();
  }

  async function syncUnread(){
    try{
      await ensureKeys();
      const data=await api('messenger-list');
      state.rows=Array.isArray(data.messages)?data.messages:state.rows;
      setUnread(data.unread);
      updateHeader();
      ensureProfileButton();
      return data.unread;
    }catch(_){
      ensureProfileButton();
      return 0;
    }
  }

  async function sendCurrentMessage(){
    const input=document.getElementById('messengerInput');
    const send=document.getElementById('messengerSend');
    const text=String(input?.value||'').trim();
    if(!text||!input||!send) return;
    send.disabled=true;
    try{
      await ensureKeys();
      if(!state.aesKey) throw new Error('messenger-shared-key-missing');
      const payload={
        text,
        reply:state.edit
          ?(state.edit.reply?{...state.edit.reply}:null)
          :(state.reply?{...state.reply}:null)
      };
      const encrypted=await encryptPayload(payload);
      const keyVersions={
        'Рустам':Number(state.keys?.['Рустам']?.version||0),
        'Диана':Number(state.keys?.['Диана']?.version||0)
      };
      if(state.edit?.id){
        await api('messenger-edit',{id:state.edit.id,scheme:'shared-v2',...encrypted,keyVersions});
      }else{
        await api('messenger-send',{scheme:'shared-v2',...encrypted,keyVersions});
      }
      input.value='';
      input.style.height='auto';
      state.reply=null;
      state.edit=null;
      renderReplyDraft();
      await load({markRead:true});
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(error){
      const status=document.getElementById('messengerStatus');
      if(status){
        status.hidden=false;
        status.textContent='Не удалось отправить сообщение.';
      }
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }finally{
      send.disabled=false;
      input.focus();
      keepKeyboardAtLatest();
    }
  }

  function openSafeLink(url){
    const value=String(url||'').trim();
    if(!/^https?:\/\//i.test(value)) return;
    try{
      if(window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(value);
      else window.open(value,'_blank','noopener,noreferrer');
    }catch(_){window.open(value,'_blank','noopener,noreferrer')}
  }

  function ensureProfileButton(){
    if(!state.actor) return false;
    const partnerCard=document.getElementById(state.partner==='Диана'?'homeDianaTile':'homeRustamTile');
    const identity=partnerCard?.querySelector('.identity');
    const mood=partnerCard?.querySelector('.mood-partner');
    if(!partnerCard||!identity||!mood) return false;
    let button=document.getElementById('partnerMessengerButton');
    let actions=identity.querySelector('.partner-profile-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='partner-profile-actions';
      identity.insertBefore(actions,mood);
      actions.appendChild(mood);
    }
    if(!button){
      button=document.createElement('button');
      button.id='partnerMessengerButton';
      button.className='messenger-profile-button';
      button.type='button';
      button.setAttribute('aria-label','Открыть мессенджер');
      button.title='Мессенджер';
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 3.8 10.1c-1.17.47-1.16 1.13-.21 1.42l4.42 1.38 1.71 5.35c.21.58.11.81.73.81.48 0 .69-.22.96-.48l2.12-2.06 4.41 3.26c.81.45 1.39.22 1.59-.75L22.4 5.18C22.7 3.95 21.93 3.39 21 3Z"/><path d="m8.7 12.6 8.9-5.6c.44-.27.84-.13.51.17l-7.35 6.63-.29 3.04-1.77-4.24Z"/></svg><span id="partnerMessengerBadge" class="messenger-profile-badge" hidden></span>';
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        if(typeof window.RUDI_NAVIGATE_TO_TAB==='function'){
          window.RUDI_NAVIGATE_TO_TAB('messenger',{scroll:true});
        }else{
          window.location.href='/?tab=messenger';
        }
      });
      actions.appendChild(button);
    }
    setUnread(Number(document.documentElement.dataset.messengerUnreadCount||0));
    return true;
  }

  function bindPage(){
    const back=document.getElementById('messengerBack');
    const input=document.getElementById('messengerInput');
    const send=document.getElementById('messengerSend');
    const emoji=document.getElementById('messengerEmoji');
    const emojiTray=document.getElementById('messengerEmojiTray');
    const cancelReply=document.getElementById('messengerReplyCancel');
    const messages=document.getElementById('messengerMessages');

    if(back&&back.dataset.bound!=='1'){
      back.dataset.bound='1';
      back.addEventListener('click',()=>{
        if(typeof window.RUDI_NAVIGATE_TO_TAB==='function') window.RUDI_NAVIGATE_TO_TAB('home',{scroll:true});
        else history.back();
      });
    }
    if(send&&send.dataset.bound!=='1'){
      send.dataset.bound='1';
      send.addEventListener('click',sendCurrentMessage);
    }
    if(input&&input.dataset.bound!=='1'){
      input.dataset.bound='1';
      input.addEventListener('focus',keepKeyboardAtLatest);
      input.addEventListener('blur',restoreMessengerAfterKeyboard);
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'&&!event.shiftKey){
          event.preventDefault();
          sendCurrentMessage();
        }
      });
      input.addEventListener('input',()=>{
        input.style.height='auto';
        input.style.height=Math.min(112,input.scrollHeight)+'px';
        keepKeyboardAtLatest();
      });
    }
    if(emoji&&emoji.dataset.bound!=='1'){
      emoji.dataset.bound='1';
      emoji.addEventListener('click',()=>{
        if(emojiTray) emojiTray.hidden=!emojiTray.hidden;
      });
    }
    if(emojiTray&&emojiTray.dataset.bound!=='1'){
      emojiTray.dataset.bound='1';
      emojiTray.addEventListener('click',event=>{
        const button=event.target.closest('[data-emoji]');
        if(!button||!input) return;
        const value=String(button.dataset.emoji||'');
        const start=input.selectionStart??input.value.length;
        const end=input.selectionEnd??input.value.length;
        input.value=input.value.slice(0,start)+value+input.value.slice(end);
        input.focus();
        const next=start+value.length;
        input.setSelectionRange(next,next);
      });
    }
    if(cancelReply&&cancelReply.dataset.bound!=='1'){
      cancelReply.dataset.bound='1';
      cancelReply.addEventListener('click',()=>{
        state.reply=null;
        state.edit=null;
        const input=document.getElementById('messengerInput');
        if(input){input.value='';input.style.height='auto'}
        renderReplyDraft();
      });
    }
    if(messages&&messages.dataset.linkBound!=='1'){
      messages.dataset.linkBound='1';
      messages.addEventListener('click',event=>{
        const link=event.target.closest('a[data-messenger-link="1"]');
        if(!link) return;
        event.preventDefault();
        openSafeLink(link.href);
      });
    }
  }

  function mountMessengerOverlay(){
    const page=document.getElementById('messengerPage');
    if(page&&page.parentElement!==document.body) document.body.appendChild(page);
    return page;
  }

  async function open({force=false,fromPush=false}={}){
    mountMessengerOverlay();
    bindPage();
    ensureProfileButton();
    if(force||fromPush||!state.initialized) await load({markRead:true});
    else await load({markRead:true});
    state.initialized=true;
    document.getElementById('messengerInput')?.focus?.({preventScroll:true});
  }

  async function initialize(){
    mountMessengerOverlay();
    bindPage();
    const start=async()=>{
      try{
        await syncUnread();
        state.initialized=true;
      }catch(_){}
      ensureProfileButton();
      if(document.body.dataset.appTab==='messenger') open({force:true});
    };
    if(document.body.classList.contains('auth-ok')) start();
    else{
      const observer=new MutationObserver(()=>{
        if(document.body.classList.contains('auth-ok')){
          observer.disconnect();
          start();
        }
      });
      observer.observe(document.body,{attributes:true,attributeFilter:['class']});
      setTimeout(()=>{observer.disconnect();if(document.body.classList.contains('auth-ok'))start()},12000);
    }
  }

  function syncMessengerViewport(){
    const viewport=window.visualViewport;
    const input=document.getElementById('messengerInput');
    const typing=document.activeElement===input;
    const viewportHeight=Math.round(Number(viewport?.height||0));
    const windowHeight=Math.round(Number(window.innerHeight||0));
    const keyboardLikelyOpen=typing&&viewportHeight>0&&windowHeight>0&&(windowHeight-viewportHeight)>80;
    const height=Math.max(
      320,
      keyboardLikelyOpen
        ? viewportHeight
        : Math.max(viewportHeight,windowHeight)
    );
    const top=keyboardLikelyOpen
      ? Math.max(0,Math.round(Number(viewport?.offsetTop||0)))
      : 0;
    document.documentElement.style.setProperty('--messenger-viewport-height',height+'px');
    document.documentElement.style.setProperty('--messenger-viewport-top',top+'px');
    if(typing) keepKeyboardAtLatest();
  }

  syncMessengerViewport();
  window.visualViewport?.addEventListener?.('resize',syncMessengerViewport);
  window.visualViewport?.addEventListener?.('scroll',syncMessengerViewport);
  window.addEventListener('resize',syncMessengerViewport);

  navigator.serviceWorker?.addEventListener?.('message',event=>{
    const data=event?.data||{};
    if(data.type!=='RUDI_PUSH_RECEIVED') return;
    const tag=String(data.tag||'');
    const url=String(data.url||'');
    if(tag!=='rudi-messenger'&&!url.includes('tab=messenger')) return;
    if(document.visibilityState==='visible'&&document.body.dataset.appTab==='messenger'){
      load({markRead:true});
    }else{
      syncUnread();
    }
  });

  window.addEventListener('rudi:profile-ready',()=>{ensureProfileButton();syncHeaderAvatar()});
  window.addEventListener('focus',()=>{if(document.body.classList.contains('auth-ok')) syncUnread()});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible'||!document.body.classList.contains('auth-ok')) return;
    if(document.body.dataset.appTab==='messenger') load({markRead:true});
    else syncUnread();
  });
  window.addEventListener('rudi:ui-preferences-applied',()=>{});
  window.RUDI_MESSENGER={open,refresh:()=>load({markRead:document.body.dataset.appTab==='messenger'}),syncUnread};

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
